import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from "react";
import { Document, Page, pdfjs } from "react-pdf";

import type { ElectricalDevice, PlanCoordinate, Room, RoomType, WallSegment } from "@/domain/takeoff/types";
import { DEVICE_CATALOG, ROOM_TYPE_OPTIONS } from "@/features/takeoff/device-catalog";
import {
  brand,
  pageStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
} from "@/features/shared/ui/mobile-styles";

type WorkspaceTool = "pan" | "room" | "device";

const OVERLAY_SIZE = 1000;
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "react-pdf/node_modules/pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

const toolButtonStyle = (active: boolean): CSSProperties => ({
  ...secondaryButtonStyle(active),
  minHeight: "40px",
  borderRadius: "10px",
  padding: "9px 12px",
});

const panelStyle: CSSProperties = {
  borderRight: `1px solid ${brand.border}`,
  background: "#ffffff",
  minHeight: 0,
  overflowY: "auto",
};

const inputStyle: CSSProperties = {
  width: "100%",
  minHeight: "40px",
  border: `1px solid ${brand.border}`,
  borderRadius: "10px",
  padding: "8px 10px",
  color: brand.text,
  background: "#ffffff",
};

export function ElectricalTakeoffPage() {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfName, setPdfName] = useState("No plan uploaded");
  const [pdfUploadError, setPdfUploadError] = useState<string | null>(null);
  const [pdfLoadError, setPdfLoadError] = useState<string | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [tool, setTool] = useState<WorkspaceTool>("room");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [rooms, setRooms] = useState<Room[]>([]);
  const [draftPolygon, setDraftPolygon] = useState<PlanCoordinate[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [devices, setDevices] = useState<ElectricalDevice[]>([]);
  const [selectedCatalogItemId, setSelectedCatalogItemId] = useState(DEVICE_CATALOG[0]?.id ?? "");
  const overlayRef = useRef<SVGSVGElement | null>(null);

  const currentPlanPageId = getPlanPageId(pageNumber);
  const currentPageRooms = useMemo(
    () => rooms.filter((room) => room.planPageId === currentPlanPageId && room.pdfPageNumber === pageNumber),
    [currentPlanPageId, pageNumber, rooms],
  );
  const currentPageDevices = useMemo(
    () => devices.filter((device) => device.planPageId === currentPlanPageId && device.pdfPageNumber === pageNumber),
    [currentPlanPageId, devices, pageNumber],
  );
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? null;
  const selectedDevice = devices.find((device) => device.id === selectedDeviceId) ?? null;
  const selectedCatalogItem = DEVICE_CATALOG.find((item) => item.id === selectedCatalogItemId) ?? DEVICE_CATALOG[0];

  const takeoffRows = useMemo(() => {
    return DEVICE_CATALOG.map((catalogItem) => {
      const quantity = devices.filter(
        (device) => device.catalogItemId === catalogItem.id && device.inclusionStatus !== "excluded",
      ).length;

      return { catalogItem, quantity };
    }).filter((row) => row.quantity > 0);
  }, [devices]);

  useEffect(() => {
    setDraftPolygon([]);
    setSelectedRoomId(null);
    setSelectedDeviceId(null);
  }, [pageNumber]);

  function handlePdfUpload(file: File | undefined) {
    if (!file) {
      return;
    }

    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      setPdfUploadError("Select a PDF floor plan file. Accepted files must have the PDF type or a .pdf extension.");
      return;
    }

    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
    }

    setPdfUrl(URL.createObjectURL(file));
    setPdfName(file.name);
    setPdfUploadError(null);
    setPdfLoadError(null);
    setPageNumber(1);
    setTotalPages(0);
    setPan({ x: 0, y: 0 });
    setZoom(1);
  }

  function goToPage(nextPageNumber: number) {
    const boundedPageNumber = clamp(nextPageNumber, 1, Math.max(totalPages, 1));
    setPageNumber(boundedPageNumber);
    setPan({ x: 0, y: 0 });
  }

  function getOverlayPoint(event: MouseEvent<SVGSVGElement> | PointerEvent<SVGSVGElement>): PlanCoordinate {
    const bounds = event.currentTarget.getBoundingClientRect();

    return {
      x: clamp(((event.clientX - bounds.left) / bounds.width) * OVERLAY_SIZE, 0, OVERLAY_SIZE),
      y: clamp(((event.clientY - bounds.top) / bounds.height) * OVERLAY_SIZE, 0, OVERLAY_SIZE),
    };
  }

  function handleOverlayPointerDown(event: PointerEvent<SVGSVGElement>) {
    if (tool === "pan") {
      setIsPanning(true);
      setPanStart({ x: event.clientX - pan.x, y: event.clientY - pan.y });
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }

  function handleOverlayPointerMove(event: PointerEvent<SVGSVGElement>) {
    if (!isPanning || tool !== "pan") {
      return;
    }

    setPan({ x: event.clientX - panStart.x, y: event.clientY - panStart.y });
  }

  function handleOverlayPointerUp(event: PointerEvent<SVGSVGElement>) {
    if (isPanning) {
      setIsPanning(false);
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleOverlayClick(event: MouseEvent<SVGSVGElement>) {
    if (!pdfUrl || tool === "pan") {
      return;
    }

    const point = getOverlayPoint(event);

    if (tool === "room") {
      setDraftPolygon((current) => [...current, point]);
      return;
    }

    if (tool === "device" && selectedCatalogItem) {
      const device: ElectricalDevice = {
        id: createId("device"),
        planPageId: currentPlanPageId,
        pdfPageNumber: pageNumber,
        catalogItemId: selectedCatalogItem.id,
        position: point,
        status: "approved",
        inclusionStatus: "included",
        circuitCategory: selectedCatalogItem.defaultCircuitType,
      };
      const roomId = findRoomForPoint(point, currentPageRooms)?.id;
      const nextDevice = roomId ? { ...device, roomId } : device;
      setDevices((current) => [...current, nextDevice]);
      setSelectedDeviceId(nextDevice.id);
      setSelectedRoomId(null);
    }
  }

  function completeRoom() {
    if (draftPolygon.length < 3) {
      return;
    }

    const roomId = createId("room");
    const nextRoom: Room = {
      id: roomId,
      planPageId: currentPlanPageId,
      pdfPageNumber: pageNumber,
      roomName: `Room ${currentPageRooms.length + 1}`,
      roomType: "other",
      floorLevel: "Main",
      polygon: draftPolygon,
      wallSegments: buildWallSegments(roomId, draftPolygon),
      detectedBy: "manual",
    };

    setRooms((current) => [...current, nextRoom]);
    setDraftPolygon([]);
    setSelectedRoomId(roomId);
    setSelectedDeviceId(null);
  }

  function updateSelectedRoom(patch: Partial<Pick<Room, "roomName" | "roomType" | "floorLevel" | "notes">>) {
    if (!selectedRoomId) {
      return;
    }

    setRooms((current) =>
      current.map((room) => (room.id === selectedRoomId ? { ...room, ...patch } : room)),
    );
  }

  function updateSelectedDevice(patch: Partial<ElectricalDevice>) {
    if (!selectedDeviceId) {
      return;
    }

    setDevices((current) =>
      current.map((device) => (device.id === selectedDeviceId ? { ...device, ...patch } : device)),
    );
  }

  function deleteSelected() {
    if (selectedDeviceId) {
      setDevices((current) => current.filter((device) => device.id !== selectedDeviceId));
      setSelectedDeviceId(null);
      return;
    }

    if (selectedRoomId) {
      setRooms((current) => current.filter((room) => room.id !== selectedRoomId));
      setDevices((current) => current.map((device) => {
        if (device.roomId !== selectedRoomId) {
          return device;
        }

        const { roomId: _roomId, ...rest } = device;
        return rest;
      }));
      setSelectedRoomId(null);
    }
  }

  return (
    <section
      style={{
        ...pageStyle(),
        padding: 0,
        display: "grid",
        gridTemplateRows: "auto minmax(0, 1fr)",
        height: "calc(100vh - 73px)",
        minHeight: "720px",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          padding: "12px 16px",
          borderBottom: `1px solid ${brand.border}`,
          background: "#ffffff",
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: "22px", color: brand.text }}>Residential Electrical Takeoff</h1>
          <p style={{ margin: "3px 0 0", color: brand.textSoft, fontSize: "13px" }}>
            Upload a plan, trace rooms manually, and build a structured estimating takeoff.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ ...primaryButtonStyle(), display: "inline-flex", alignItems: "center", cursor: "pointer" }}>
            Upload PDF
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) => {
                handlePdfUpload(event.target.files?.[0]);
                event.currentTarget.value = "";
              }}
              style={{ display: "none" }}
            />
          </label>
          <button type="button" style={secondaryButtonStyle()} onClick={() => window.print()}>
            Print
          </button>
          <button
            type="button"
            style={secondaryButtonStyle()}
            onClick={() => downloadJson({ rooms, devices }, "electrical-takeoff.json")}
          >
            Export JSON
          </button>
        </div>
        {pdfUploadError ? (
          <div
            role="alert"
            style={{
              flexBasis: "100%",
              border: "1px solid #f3b2b2",
              borderRadius: "10px",
              padding: "10px 12px",
              background: "#fff4f4",
              color: "#8f1d1d",
              fontSize: "13px",
              fontWeight: 700,
            }}
          >
            {pdfUploadError}
          </div>
        ) : null}
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "300px minmax(420px, 1fr) 340px",
          minHeight: 0,
        }}
      >
        <aside style={{ ...panelStyle, padding: "14px", display: "grid", gap: "16px", alignContent: "start" }}>
          <section style={{ display: "grid", gap: "10px" }}>
            <strong style={{ color: brand.text }}>Tools</strong>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
              <button type="button" style={toolButtonStyle(tool === "pan")} onClick={() => setTool("pan")}>
                Pan
              </button>
              <button type="button" style={toolButtonStyle(tool === "room")} onClick={() => setTool("room")}>
                Room
              </button>
              <button type="button" style={toolButtonStyle(tool === "device")} onClick={() => setTool("device")}>
                Device
              </button>
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button type="button" style={secondaryButtonStyle()} onClick={completeRoom} disabled={draftPolygon.length < 3}>
                Complete room
              </button>
              <button type="button" style={secondaryButtonStyle()} onClick={() => setDraftPolygon([])} disabled={draftPolygon.length === 0}>
                Clear draft
              </button>
            </div>
            <span style={{ color: brand.textSoft, fontSize: "12px", lineHeight: 1.45 }}>
              Room tool: tap points around a room, then complete it. Device tool: choose a catalog item and tap the plan.
            </span>
          </section>

          <section style={{ display: "grid", gap: "10px" }}>
            <strong style={{ color: brand.text }}>Plan Controls</strong>
            <label style={{ display: "grid", gap: "5px", color: brand.textSoft, fontSize: "12px", fontWeight: 700 }}>
              Page
              <input
                type="number"
                min={1}
                max={Math.max(totalPages, 1)}
                value={pageNumber}
                onChange={(event) => goToPage(Number(event.target.value) || 1)}
                style={inputStyle}
              />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "8px", alignItems: "center" }}>
              <button
                type="button"
                style={secondaryButtonStyle()}
                onClick={() => goToPage(pageNumber - 1)}
                disabled={!pdfUrl || pageNumber <= 1}
              >
                Previous
              </button>
              <span style={{ color: brand.textSoft, fontSize: "13px", fontWeight: 700, textAlign: "center" }}>
                {pdfUrl ? `${pageNumber} / ${totalPages || "..."}` : "No PDF"}
              </span>
              <button
                type="button"
                style={secondaryButtonStyle()}
                onClick={() => goToPage(pageNumber + 1)}
                disabled={!pdfUrl || totalPages === 0 || pageNumber >= totalPages}
              >
                Next
              </button>
            </div>
            <label style={{ display: "grid", gap: "5px", color: brand.textSoft, fontSize: "12px", fontWeight: 700 }}>
              Zoom {Math.round(zoom * 100)}%
              <input
                type="range"
                min={0.5}
                max={2.5}
                step={0.05}
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
              />
            </label>
          </section>

          <section style={{ display: "grid", gap: "10px" }}>
            <strong style={{ color: brand.text }}>Device Catalog</strong>
            <select
              value={selectedCatalogItemId}
              onChange={(event) => setSelectedCatalogItemId(event.target.value)}
              style={inputStyle}
            >
              {DEVICE_CATALOG.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.symbol} · {item.name}
                </option>
              ))}
            </select>
            <div style={{ display: "grid", gap: "8px" }}>
              {DEVICE_CATALOG.map((item) => {
                const active = selectedCatalogItemId === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSelectedCatalogItemId(item.id);
                      setTool("device");
                    }}
                    style={{
                      border: `1px solid ${active ? brand.primary : brand.border}`,
                      borderRadius: "10px",
                      background: active ? brand.primarySoft : "#ffffff",
                      padding: "9px",
                      textAlign: "left",
                      display: "grid",
                      gap: "3px",
                      color: brand.text,
                    }}
                  >
                    <strong style={{ fontSize: "13px" }}>{item.symbol} · {item.name}</strong>
                    <span style={{ fontSize: "12px", color: brand.textSoft }}>{item.category} · {item.defaultCircuitType}</span>
                  </button>
                );
              })}
            </div>
          </section>
        </aside>

        <main
          style={{
            position: "relative",
            overflow: "hidden",
            background: "#eef2f1",
            minHeight: 0,
          }}
        >
          {!pdfUrl ? (
            <div style={{ height: "100%", display: "grid", placeItems: "center", padding: "28px" }}>
              <div
                style={{
                  border: `1px dashed ${brand.primary}`,
                  borderRadius: "8px",
                  background: "#ffffff",
                  padding: "28px",
                  width: "min(520px, 100%)",
                  textAlign: "center",
                  display: "grid",
                  gap: "12px",
                }}
              >
                <strong style={{ fontSize: "20px", color: brand.text }}>Upload a residential floor plan PDF</strong>
                <span style={{ color: brand.textSoft, lineHeight: 1.45 }}>
                  The PDF renderer will show one page at a time. The SVG overlay stores rooms and devices against each PDF page.
                </span>
              </div>
            </div>
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "center center",
                display: "grid",
                placeItems: "center",
              }}
            >
              <div
                style={{
                  position: "relative",
                  width: `${OVERLAY_SIZE}px`,
                  maxWidth: "100%",
                  background: "#ffffff",
                  boxShadow: "0 18px 42px rgba(15, 23, 42, 0.16)",
                }}
              >
                <Document
                  file={pdfUrl}
                  loading={<ViewerMessage>Loading PDF...</ViewerMessage>}
                  error={<ViewerMessage tone="error">Could not load this PDF.</ViewerMessage>}
                  onLoadSuccess={(pdf) => {
                    setTotalPages(pdf.numPages);
                    setPdfLoadError(null);
                    if (pageNumber > pdf.numPages) {
                      setPageNumber(pdf.numPages);
                    }
                  }}
                  onLoadError={(error) => {
                    setPdfLoadError(error instanceof Error ? error.message : "Could not load this PDF.");
                    setTotalPages(0);
                  }}
                >
                  <Page
                    key={`${pdfUrl}-${pageNumber}`}
                    pageNumber={pageNumber}
                    width={OVERLAY_SIZE}
                    renderAnnotationLayer={false}
                    renderTextLayer={false}
                    loading={<ViewerMessage>Loading page...</ViewerMessage>}
                    error={<ViewerMessage tone="error">Could not render this page.</ViewerMessage>}
                  />
                </Document>
                <svg
                  ref={overlayRef}
                  viewBox={`0 0 ${OVERLAY_SIZE} ${OVERLAY_SIZE}`}
                  onPointerDown={handleOverlayPointerDown}
                  onPointerMove={handleOverlayPointerMove}
                  onPointerUp={handleOverlayPointerUp}
                  onClick={handleOverlayClick}
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    cursor: tool === "pan" ? (isPanning ? "grabbing" : "grab") : "crosshair",
                    touchAction: "none",
                  }}
                >
                  <rect width={OVERLAY_SIZE} height={OVERLAY_SIZE} fill="transparent" />
                  {currentPageRooms.map((room) => (
                    <g key={room.id}>
                      <polygon
                        points={toSvgPoints(room.polygon)}
                        fill={room.id === selectedRoomId ? "rgba(15, 109, 95, 0.22)" : "rgba(15, 109, 95, 0.12)"}
                        stroke={room.id === selectedRoomId ? brand.primaryDark : brand.primary}
                        strokeWidth={room.id === selectedRoomId ? 4 : 2}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedRoomId(room.id);
                          setSelectedDeviceId(null);
                        }}
                      />
                      <text
                        x={getCentroid(room.polygon).x}
                        y={getCentroid(room.polygon).y}
                        textAnchor="middle"
                        fill={brand.primaryDark}
                        fontSize="24"
                        fontWeight="700"
                        pointerEvents="none"
                      >
                        {room.roomName}
                      </text>
                    </g>
                  ))}
                  {draftPolygon.length > 0 ? (
                    <g
                    >
                      <polyline
                        points={toSvgPoints(draftPolygon)}
                        fill="none"
                        stroke="#0f6d5f"
                        strokeDasharray="8 8"
                        strokeWidth="3"
                      />
                      {draftPolygon.map((point, index) => (
                        <circle key={`${point.x}-${point.y}-${index}`} cx={point.x} cy={point.y} r="7" fill={brand.primary} />
                      ))}
                    </g>
                  ) : null}
                  {currentPageDevices.map((device) => {
                    const catalogItem = DEVICE_CATALOG.find((item) => item.id === device.catalogItemId);
                    const isSelected = device.id === selectedDeviceId;

                    return (
                      <g
                        key={device.id}
                        transform={`translate(${device.position.x} ${device.position.y})`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedDeviceId(device.id);
                          setSelectedRoomId(null);
                        }}
                      >
                        <circle r={isSelected ? 18 : 15} fill={isSelected ? brand.primaryDark : "#ffffff"} stroke={brand.primaryDark} strokeWidth="3" />
                        <text textAnchor="middle" y="5" fontSize="11" fontWeight="800" fill={isSelected ? "#ffffff" : brand.primaryDark}>
                          {catalogItem?.symbol ?? "?"}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>
          )}
          {pdfLoadError ? (
            <div
              role="alert"
              style={{
                position: "absolute",
                left: "16px",
                right: "16px",
                bottom: "16px",
                border: "1px solid #f3b2b2",
                borderRadius: "10px",
                padding: "10px 12px",
                background: "#fff4f4",
                color: "#8f1d1d",
                fontSize: "13px",
                fontWeight: 700,
              }}
            >
              {pdfLoadError}
            </div>
          ) : null}
        </main>

        <aside style={{ ...panelStyle, borderRight: 0, borderLeft: `1px solid ${brand.border}`, padding: "14px", display: "grid", gap: "16px", alignContent: "start" }}>
          <section style={{ display: "grid", gap: "8px" }}>
            <strong style={{ color: brand.text }}>Plan</strong>
            <span style={{ color: brand.textSoft, fontSize: "13px" }}>{pdfName}</span>
            <span style={{ color: brand.textSoft, fontSize: "12px" }}>
              {pdfUrl ? `Page ${pageNumber} of ${totalPages || "..."}` : "Upload a PDF to begin."}
            </span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <SummaryTile label="Page rooms" value={currentPageRooms.length} />
              <SummaryTile label="Page devices" value={currentPageDevices.length} />
            </div>
          </section>

          <section style={{ display: "grid", gap: "10px" }}>
            <strong style={{ color: brand.text }}>Selected Details</strong>
            {selectedRoom ? (
              <div style={{ display: "grid", gap: "10px" }}>
                <label style={fieldLabelStyle}>
                  Room name
                  <input
                    value={selectedRoom.roomName}
                    onChange={(event) => updateSelectedRoom({ roomName: event.target.value })}
                    style={inputStyle}
                  />
                </label>
                <label style={fieldLabelStyle}>
                  Room type
                  <select
                    value={selectedRoom.roomType}
                    onChange={(event) => updateSelectedRoom({ roomType: event.target.value as RoomType })}
                    style={inputStyle}
                  >
                    {ROOM_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label style={fieldLabelStyle}>
                  Floor/level
                  <input
                    value={selectedRoom.floorLevel}
                    onChange={(event) => updateSelectedRoom({ floorLevel: event.target.value })}
                    style={inputStyle}
                  />
                </label>
                <span style={{ color: brand.textSoft, fontSize: "12px" }}>
                  {selectedRoom.wallSegments.length} wall segments generated from polygon.
                </span>
              </div>
            ) : selectedDevice ? (
              <div style={{ display: "grid", gap: "10px" }}>
                <label style={fieldLabelStyle}>
                  Device type
                  <select
                    value={selectedDevice.catalogItemId}
                    onChange={(event) => {
                      const nextItem = DEVICE_CATALOG.find((item) => item.id === event.target.value);
                      updateSelectedDevice({
                        catalogItemId: event.target.value,
                        circuitCategory: nextItem?.defaultCircuitType ?? selectedDevice.circuitCategory,
                      });
                    }}
                    style={inputStyle}
                  >
                    {DEVICE_CATALOG.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                </label>
                <label style={fieldLabelStyle}>
                  Status
                  <select
                    value={selectedDevice.inclusionStatus}
                    onChange={(event) => updateSelectedDevice({ inclusionStatus: event.target.value as ElectricalDevice["inclusionStatus"] })}
                    style={inputStyle}
                  >
                    <option value="included">Included</option>
                    <option value="optional">Optional</option>
                    <option value="excluded">Excluded</option>
                  </select>
                </label>
                <label style={fieldLabelStyle}>
                  Notes
                  <textarea
                    value={selectedDevice.notes ?? ""}
                    onChange={(event) => updateSelectedDevice({ notes: event.target.value })}
                    style={{ ...inputStyle, minHeight: "76px", resize: "vertical" }}
                  />
                </label>
              </div>
            ) : (
              <div style={{ border: `1px solid ${brand.border}`, borderRadius: "8px", padding: "12px", color: brand.textSoft, fontSize: "13px" }}>
                Select a room polygon or device marker to edit it.
              </div>
            )}
            <button type="button" style={secondaryButtonStyle()} onClick={deleteSelected} disabled={!selectedRoomId && !selectedDeviceId}>
              Delete selected
            </button>
          </section>

          <section style={{ display: "grid", gap: "10px" }}>
            <strong style={{ color: brand.text }}>Takeoff Summary</strong>
            {takeoffRows.length === 0 ? (
              <span style={{ color: brand.textSoft, fontSize: "13px" }}>No devices placed yet.</span>
            ) : (
              <div style={{ display: "grid", gap: "8px" }}>
                {takeoffRows.map(({ catalogItem, quantity }) => (
                  <div
                    key={catalogItem.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: "10px",
                      border: `1px solid ${brand.border}`,
                      borderRadius: "8px",
                      padding: "9px",
                    }}
                  >
                    <span style={{ color: brand.text, fontSize: "13px", fontWeight: 700 }}>{catalogItem.name}</span>
                    <strong style={{ color: brand.primaryDark }}>{quantity}</strong>
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </section>
  );
}

const fieldLabelStyle: CSSProperties = {
  display: "grid",
  gap: "5px",
  color: brand.textSoft,
  fontSize: "12px",
  fontWeight: 700,
};

function ViewerMessage({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "error";
}) {
  return (
    <div
      style={{
        minHeight: "360px",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        color: tone === "error" ? "#8f1d1d" : brand.textSoft,
        fontSize: "14px",
        fontWeight: 700,
        background: tone === "error" ? "#fff4f4" : "#ffffff",
      }}
    >
      {children}
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ border: `1px solid ${brand.border}`, borderRadius: "8px", padding: "10px", background: brand.surfaceAlt }}>
      <span style={{ display: "block", color: brand.textSoft, fontSize: "12px" }}>{label}</span>
      <strong style={{ display: "block", color: brand.text, fontSize: "22px" }}>{value}</strong>
    </div>
  );
}

function buildWallSegments(roomId: string, polygon: PlanCoordinate[]): WallSegment[] {
  return polygon.map((point, index) => ({
    id: createId("wall"),
    roomId,
    start: point,
    end: polygon[(index + 1) % polygon.length] ?? point,
  }));
}

function toSvgPoints(points: PlanCoordinate[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function getCentroid(points: PlanCoordinate[]): PlanCoordinate {
  if (points.length === 0) {
    return { x: 0, y: 0 };
  }

  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

function findRoomForPoint(point: PlanCoordinate, rooms: Room[]): Room | null {
  return rooms.find((room) => isPointInPolygon(point, room.polygon)) ?? null;
}

function isPointInPolygon(point: PlanCoordinate, polygon: PlanCoordinate[]): boolean {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const current = polygon[i];
    const previous = polygon[j];

    if (!current || !previous) {
      continue;
    }

    const intersects =
      current.y > point.y !== previous.y > point.y &&
      point.x < ((previous.x - current.x) * (point.y - current.y)) / (previous.y - current.y) + current.x;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function getPlanPageId(pdfPageNumber: number): string {
  return `pdf-page-${pdfPageNumber}`;
}

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
