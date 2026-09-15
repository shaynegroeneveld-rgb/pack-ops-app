import React from "react";
import ReactDOM from "react-dom/client";
import { jsPDF } from "jspdf";
import { Document, Page, pdfjs } from "react-pdf";

import "./styles.css";
import { rankCatalogItems } from "../../src/services/materials/material-search";
import { usePlanNavigation, MIN_ZOOM, MAX_ZOOM } from "./use-plan-navigation";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

type RoomType =
  | "bedroom"
  | "kitchen"
  | "dining_room"
  | "living_room"
  | "bathroom"
  | "ensuite"
  | "hallway"
  | "laundry"
  | "mechanical_room"
  | "garage"
  | "porch_exterior"
  | "office_den"
  | "closet"
  | "pantry"
  | "unfinished_storage"
  | "other";

type RoomStatus = "suggested" | "approved" | "ignored";
type DeviceInclusionStatus = "included" | "optional" | "excluded";
type Tool = "pan" | "room" | "device" | "connect" | "box" | "scale";
type AutoSwitchCatalogItemId = "switch" | "3-way-switch" | "4-way-switch";

interface Point {
  x: number;
  y: number;
}

interface Room {
  id: string;
  planPageId: string;
  pdfPageNumber: number;
  roomName: string;
  roomType: RoomType;
  floorLevel: string;
  status: RoomStatus;
  marker: Point;
  polygon?: Point[];
  detectedBy: "manual" | "ocr";
}

interface DeviceCatalogItem {
  id: string;
  name: string;
  category: string;
  symbol: string;
  defaultCircuitType: string;
}

interface ElectricalDevice {
  id: string;
  planPageId: string;
  pdfPageNumber: number;
  roomId?: string;
  catalogItemId: string;
  heaterWattage?: number;
  feedFromPanelId?: string;
  riserDropMeters?: number;
  linkedRiserId?: string;
  position: Point;
  inclusionStatus: DeviceInclusionStatus;
  notes?: string;
}

interface ElectricalBoxGroup {
  id: string;
  planPageId: string;
  pdfPageNumber: number;
  deviceIds: string[];
}

interface DeviceConnection {
  id: string;
  planPageId: string;
  pdfPageNumber: number;
  sourceDeviceId: string;
  targetDeviceId: string;
}

interface MaterialLine {
  item: string;
  quantity: number;
}

interface LabourLine {
  item: string;
  phase: string;
  quantity: number;
}

interface LabourTakeoff {
  lines: LabourLine[];
  totalHours: number;
}

interface LabourSettings {
  projectTypeMultiplier: number;
  accessMultiplier: number;
  ceilingHeightMultiplier: number;
  setupHours: number;
}

interface MaterialGroup {
  title: string;
  lines: MaterialLine[];
}

interface DeviceMaterialSummary {
  title: string;
  details: string[];
  materials: MaterialLine[];
}

interface WireBreakdownLine {
  id: string;
  source: string;
  wireType: string;
  planFeet: number;
  allowanceFeet: number;
  totalFeet: number;
  deviceIds: string[];
  routeDeviceIdsList: string[][];
}

interface TakeoffExportSummary {
  materials: MaterialLine[];
  wireBreakdown: WireBreakdownLine[];
  labour: LabourTakeoff;
}

interface CircuitRun {
  id: string;
  label: string;
  wireType: string;
  deviceIds: string[];
  routeDeviceIds: string[];
  path: Point[];
}

interface PlanScale {
  planPageId: string;
  pdfPageNumber: number;
  points: [Point, Point];
  knownLengthFeet: number;
}

interface PdfDocumentLike {
  numPages: number;
  getPage(pageNumber: number): Promise<{
    getViewport(input: { scale: number }): { width: number; height: number };
    getTextContent(): Promise<{ items: unknown[] }>;
    render(input: {
      canvas: HTMLCanvasElement;
      canvasContext: CanvasRenderingContext2D;
      viewport: { width: number; height: number };
    }): { promise: Promise<void> };
  }>;
}

interface SavedProjectFile {
  app: "electrical-takeoff";
  version: 1;
  savedAt: string;
  projectName: string;
  pdfName: string;
  pdfDataUrl?: string;
  currentPageNumber: number;
  viewState: {
    zoom: number;
    pan: Point;
  };
  rooms: Room[];
  devices: ElectricalDevice[];
  connections: DeviceConnection[];
  boxGroups: ElectricalBoxGroup[];
  planScales: PlanScale[];
  wireSettings: {
    switchVerticalAllowanceFeet: number;
    applianceVerticalAllowanceFeet: number;
    defaultRiserDropMeters: number;
    wastePercent: number;
  };
  labourSettings?: LabourSettings;
  exportSummary?: TakeoffExportSummary;
}

const OVERLAY_SIZE = 1000;
const SYMBOL_MIN_SCALE = 0.55;
const SYMBOL_MAX_SCALE = 1.9;
const DEVICE_SYMBOL_SCALE = 0.62;
const DEFAULT_WASTE_PERCENT = 12;
const DEFAULT_LABOUR_SETTINGS: LabourSettings = {
  projectTypeMultiplier: 1,
  accessMultiplier: 1,
  ceilingHeightMultiplier: 1,
  setupHours: 2,
};
const SWITCH_VERTICAL_ALLOWANCE_FEET = 5;
const APPLIANCE_VERTICAL_ALLOWANCE_FEET = 8;
const DEFAULT_RISER_DROP_METERS = 3;
const FEET_TO_METERS = 0.3048;
const AUTO_SWITCH_IDS = new Set(["switch", "3-way-switch", "4-way-switch"]);

const ROOM_TYPES: Array<{ value: RoomType; label: string }> = [
  { value: "bedroom", label: "Bedroom" },
  { value: "kitchen", label: "Kitchen" },
  { value: "dining_room", label: "Dining room" },
  { value: "living_room", label: "Living room" },
  { value: "bathroom", label: "Bathroom" },
  { value: "ensuite", label: "Ensuite" },
  { value: "hallway", label: "Hallway" },
  { value: "laundry", label: "Laundry" },
  { value: "mechanical_room", label: "Mechanical room" },
  { value: "garage", label: "Garage" },
  { value: "porch_exterior", label: "Porch/exterior" },
  { value: "office_den", label: "Office/den" },
  { value: "closet", label: "Closet" },
  { value: "pantry", label: "Pantry" },
  { value: "unfinished_storage", label: "Unfinished/storage" },
  { value: "other", label: "Other" }
];

const ROOM_LABELS: Array<{ pattern: RegExp; roomType: RoomType; label: string }> = [
  { pattern: /\bBED(?:ROOM)?\s*\d*\b/i, roomType: "bedroom", label: "Bedroom" },
  { pattern: /\bKITCHEN\b/i, roomType: "kitchen", label: "Kitchen" },
  { pattern: /\bLIVING\b/i, roomType: "living_room", label: "Living" },
  { pattern: /\bDINING\b/i, roomType: "dining_room", label: "Dining" },
  { pattern: /\bBATH(?:ROOM)?\b/i, roomType: "bathroom", label: "Bathroom" },
  { pattern: /\bENSUITE\b/i, roomType: "ensuite", label: "Ensuite" },
  { pattern: /\bGARAGE\b/i, roomType: "garage", label: "Garage" },
  { pattern: /\bLAUNDRY\b/i, roomType: "laundry", label: "Laundry" },
  { pattern: /\bMECH(?:ANICAL)?\b/i, roomType: "mechanical_room", label: "Mechanical" },
  { pattern: /\bCLOSET\b/i, roomType: "closet", label: "Closet" },
  { pattern: /\bPANTRY\b/i, roomType: "pantry", label: "Pantry" },
  { pattern: /\bHALL(?:WAY)?\b/i, roomType: "hallway", label: "Hallway" },
  { pattern: /\bFOYER\b/i, roomType: "hallway", label: "Foyer" },
  { pattern: /\bPORCH\b/i, roomType: "porch_exterior", label: "Porch" },
  { pattern: /\bDECK\b/i, roomType: "porch_exterior", label: "Deck" }
];

const DEVICE_CATALOG: DeviceCatalogItem[] = [
  { id: "15a-receptacle", name: "15A receptacle", category: "Receptacles", symbol: "R", defaultCircuitType: "General purpose" },
  { id: "20a-receptacle", name: "20A receptacle", category: "Receptacles", symbol: "20R", defaultCircuitType: "20A branch" },
  { id: "gfci-receptacle", name: "GFCI receptacle", category: "Receptacles", symbol: "GFI", defaultCircuitType: "GFCI protected" },
  { id: "exterior-weather-rated-gfci-receptacle", name: "Exterior weather-rated GFCI receptacle", category: "Receptacles", symbol: "WR", defaultCircuitType: "Weather-rated GFCI" },
  { id: "switch", name: "1-pole switch", category: "Controls", symbol: "S1", defaultCircuitType: "Lighting control" },
  { id: "3-way-switch", name: "3-way switch", category: "Controls", symbol: "S3", defaultCircuitType: "Lighting control" },
  { id: "4-way-switch", name: "4-way switch", category: "Controls", symbol: "S4", defaultCircuitType: "Lighting control" },
  { id: "dimmer", name: "Dimmer switch", category: "Controls", symbol: "SD", defaultCircuitType: "Lighting control" },
  { id: "motion-switch", name: "Motion switch", category: "Controls", symbol: "SM", defaultCircuitType: "Lighting control" },
  { id: "ceiling-light", name: "Ceiling light", category: "Lighting", symbol: "CL", defaultCircuitType: "Lighting" },
  { id: "pot-light", name: "Pot light/recessed light", category: "Lighting", symbol: "PL", defaultCircuitType: "Lighting" },
  { id: "smoke-alarm", name: "Smoke alarm", category: "Life safety", symbol: "SA", defaultCircuitType: "Smoke alarm" },
  { id: "co-alarm", name: "CO alarm", category: "Life safety", symbol: "CO", defaultCircuitType: "CO alarm" },
  { id: "bathroom-fan", name: "Bath fan", category: "Lighting", symbol: "BF", defaultCircuitType: "Fan" },
  { id: "data-jack", name: "Data jack", category: "Low voltage", symbol: "DATA", defaultCircuitType: "Data" },
  { id: "tv-coax-outlet", name: "TV/coax", category: "Low voltage", symbol: "TV", defaultCircuitType: "Coax" },
  { id: "hrv", name: "HRV", category: "Dedicated circuits", symbol: "HRV", defaultCircuitType: "2c14" },
  { id: "dishwasher", name: "Dishwasher", category: "Dedicated circuits", symbol: "DW", defaultCircuitType: "2c14" },
  { id: "outdoor-receptacle", name: "Outdoor receptacle circuit", category: "Dedicated circuits", symbol: "OR", defaultCircuitType: "2c14" },
  { id: "furnace", name: "Furnace", category: "Dedicated circuits", symbol: "FUR", defaultCircuitType: "2c14" },
  { id: "gas-hwt", name: "Gas HWT", category: "Dedicated circuits", symbol: "GHW", defaultCircuitType: "2c14" },
  { id: "gas-range", name: "Gas range", category: "Dedicated circuits", symbol: "GR", defaultCircuitType: "2c14" },
  { id: "fridge", name: "Fridge", category: "Dedicated circuits", symbol: "FR", defaultCircuitType: "2c14" },
  { id: "heat-trace", name: "Heat trace", category: "Dedicated circuits", symbol: "HT", defaultCircuitType: "2c14" },
  { id: "radon", name: "Radon", category: "Dedicated circuits", symbol: "RAD", defaultCircuitType: "2c14" },
  { id: "microwave", name: "Microwave", category: "Dedicated circuits", symbol: "MW", defaultCircuitType: "2c14" },
  { id: "garage-receptacle", name: "Garage receptacle circuit", category: "Dedicated circuits", symbol: "GAR", defaultCircuitType: "2c14" },
  { id: "washer", name: "Washer", category: "Dedicated circuits", symbol: "W", defaultCircuitType: "2c14" },
  { id: "freezer", name: "Freezer", category: "Dedicated circuits", symbol: "FZ", defaultCircuitType: "2c14" },
  { id: "counter-receptacle", name: "Counter receptacle circuit", category: "Dedicated circuits", symbol: "CR", defaultCircuitType: "2c12" },
  { id: "baseboard-thermostat", name: "Baseboard thermostat", category: "Dedicated circuits", symbol: "T", defaultCircuitType: "2c12" },
  { id: "wall-fan-heater", name: "Wall fan heater", category: "Dedicated circuits", symbol: "WF", defaultCircuitType: "2c12" },
  { id: "baseboard-heater", name: "Baseboard heater", category: "Dedicated circuits", symbol: "BB", defaultCircuitType: "2c12" },
  { id: "electric-fireplace", name: "Electric fireplace", category: "Dedicated circuits", symbol: "EFP", defaultCircuitType: "2c12" },
  { id: "heat-pump", name: "Heat pump", category: "Dedicated circuits", symbol: "HP", defaultCircuitType: "2c10" },
  { id: "electric-hwt", name: "Electric HWT", category: "Dedicated circuits", symbol: "EHW", defaultCircuitType: "2c10" },
  { id: "range-outlet", name: "Range outlet", category: "Appliance", symbol: "RG", defaultCircuitType: "Range" },
  { id: "dryer-outlet", name: "Dryer outlet", category: "Appliance", symbol: "DR", defaultCircuitType: "Dryer" },
  { id: "heat-pump-disconnect", name: "Heat pump disconnect", category: "Appliance", symbol: "HPD", defaultCircuitType: "Heat pump disconnect" },
  { id: "ev-charger", name: "EV charger", category: "Appliance", symbol: "EV", defaultCircuitType: "3c8" },
  { id: "floor-riser", name: "Floor riser reference", category: "Service", symbol: "RIS", defaultCircuitType: "Cross-floor reference" },
  { id: "panel", name: "Panel", category: "Service", symbol: "PNL", defaultCircuitType: "Panel" },
  { id: "100a-subpanel", name: "100A subpanel", category: "Service", symbol: "100SUB", defaultCircuitType: "2c1 NMD" },
  { id: "subpanel", name: "Subpanel", category: "Service", symbol: "SUB", defaultCircuitType: "Subpanel" }
];

const PLACEABLE_DEVICE_CATALOG = DEVICE_CATALOG.filter((item) => item.id !== "3-way-switch" && item.id !== "4-way-switch");

const CIRCUIT_WIRE_RULES: Array<{ catalogItemId: string; wireType: string; devicesPerCircuit?: number; interconnect?: boolean }> = [
  { catalogItemId: "15a-receptacle", wireType: "2c14", devicesPerCircuit: 11, interconnect: true },
  { catalogItemId: "gfci-receptacle", wireType: "2c14", devicesPerCircuit: 11, interconnect: true },
  { catalogItemId: "20a-receptacle", wireType: "2c12", devicesPerCircuit: 11, interconnect: true },
  { catalogItemId: "exterior-weather-rated-gfci-receptacle", wireType: "2c14", interconnect: true },
  { catalogItemId: "hrv", wireType: "2c14" },
  { catalogItemId: "dishwasher", wireType: "2c14" },
  { catalogItemId: "outdoor-receptacle", wireType: "2c14", interconnect: true },
  { catalogItemId: "furnace", wireType: "2c14" },
  { catalogItemId: "gas-hwt", wireType: "2c14" },
  { catalogItemId: "gas-range", wireType: "2c14" },
  { catalogItemId: "fridge", wireType: "2c14" },
  { catalogItemId: "heat-trace", wireType: "2c14" },
  { catalogItemId: "radon", wireType: "2c14" },
  { catalogItemId: "microwave", wireType: "2c14" },
  { catalogItemId: "garage-receptacle", wireType: "2c14" },
  { catalogItemId: "washer", wireType: "2c14" },
  { catalogItemId: "freezer", wireType: "2c14" },
  { catalogItemId: "counter-receptacle", wireType: "2c12", devicesPerCircuit: 2, interconnect: true },
  { catalogItemId: "baseboard-thermostat", wireType: "2c12" },
  { catalogItemId: "wall-fan-heater", wireType: "2c12" },
  { catalogItemId: "baseboard-heater", wireType: "2c12" },
  { catalogItemId: "electric-fireplace", wireType: "2c12" },
  { catalogItemId: "heat-pump", wireType: "2c10" },
  { catalogItemId: "heat-pump-disconnect", wireType: "2c10" },
  { catalogItemId: "electric-hwt", wireType: "2c10" },
  { catalogItemId: "dryer-outlet", wireType: "3c10" },
  { catalogItemId: "range-outlet", wireType: "3c8" },
  { catalogItemId: "ev-charger", wireType: "3c8" },
  { catalogItemId: "100a-subpanel", wireType: "2c1 NMD" },
];

function App() {
  const [pdfUrl, setPdfUrl] = React.useState<string | null>(null);
  const [pdfDataUrl, setPdfDataUrl] = React.useState<string | null>(null);
  const [pdfName, setPdfName] = React.useState("No plan uploaded");
  const [projectName, setProjectName] = React.useState("Untitled takeoff");
  const [pdfDocument, setPdfDocument] = React.useState<PdfDocumentLike | null>(null);
  const [pdfError, setPdfError] = React.useState<string | null>(null);
  const [pageNumber, setPageNumber] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(0);
  const [overlayHeight, setOverlayHeight] = React.useState(OVERLAY_SIZE);
  const [devicePixelRatio, setDevicePixelRatio] = React.useState(() => window.devicePixelRatio || 1);
  const [viewerSize, setViewerSize] = React.useState({ width: 0, height: 0 });
  const [spacePanActive, setSpacePanActive] = React.useState(false);
  const [quickGroupActive, setQuickGroupActive] = React.useState(false);
  const [quickConnectActive, setQuickConnectActive] = React.useState(false);
  const [deviceSearch, setDeviceSearch] = React.useState("");
  const matchingDevices = React.useMemo(() => rankCatalogItems(PLACEABLE_DEVICE_CATALOG.map(item => ({ ...item, aliases: [item.symbol, item.defaultCircuitType] })), deviceSearch), [deviceSearch]);
  const [catalogOpen, setCatalogOpen] = React.useState(false);
  const [focusPlan, setFocusPlan] = React.useState(false);
  const [tool, setTool] = React.useState<Tool>("pan");
  const [rooms, setRooms] = React.useState<Room[]>([]);
  const [devices, setDevices] = React.useState<ElectricalDevice[]>([]);
  const [connections, setConnections] = React.useState<DeviceConnection[]>([]);
  const [boxGroups, setBoxGroups] = React.useState<ElectricalBoxGroup[]>([]);
  const [planScales, setPlanScales] = React.useState<PlanScale[]>([]);
  const [draftPolygon, setDraftPolygon] = React.useState<Point[]>([]);
  const [scaleDraft, setScaleDraft] = React.useState<Point[]>([]);
  const [knownScaleLengthFeet, setKnownScaleLengthFeet] = React.useState(10);
  const [wastePercent, setWastePercent] = React.useState(DEFAULT_WASTE_PERCENT);
  const [labourSettings, setLabourSettings] = React.useState<LabourSettings>(DEFAULT_LABOUR_SETTINGS);
  const [selectedRoomId, setSelectedRoomId] = React.useState<string | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = React.useState<string | null>(null);
  const [selectedWireLineId, setSelectedWireLineId] = React.useState<string | null>(null);
  const [linkingRiserId, setLinkingRiserId] = React.useState<string | null>(null);
  const [connectFromDeviceId, setConnectFromDeviceId] = React.useState<string | null>(null);
  const [activeBoxGroupId, setActiveBoxGroupId] = React.useState<string | null>(null);
  const [draggingRoomId, setDraggingRoomId] = React.useState<string | null>(null);
  const [selectedCatalogItemId, setSelectedCatalogItemId] = React.useState(PLACEABLE_DEVICE_CATALOG[0]?.id ?? "");
  const [detectStatus, setDetectStatus] = React.useState<string | null>(null);
  const [projectStatus, setProjectStatus] = React.useState<string | null>(null);
  const [isExportingCustomerPdf, setIsExportingCustomerPdf] = React.useState(false);
  const viewerRef = React.useRef<HTMLElement | null>(null);
  const { zoom, pan, setZoom, setPan, isPanning, bind: navigation, fit: fitPlan } = usePlanNavigation(
    viewerRef, tool === "pan" || spacePanActive, Boolean(pdfUrl), () => setDraggingRoomId(null),
  );

  const currentPlanPageId = `pdf-page-${pageNumber}`;
  const pageRooms = rooms.filter((room) => room.planPageId === currentPlanPageId && room.pdfPageNumber === pageNumber && room.status !== "ignored");
  const pageDevices = devices.filter((device) => device.planPageId === currentPlanPageId && device.pdfPageNumber === pageNumber);
  const pageConnections = connections.filter((connection) => connection.planPageId === currentPlanPageId && connection.pdfPageNumber === pageNumber);
  const pageBoxGroups = boxGroups.filter((group) => group.planPageId === currentPlanPageId && group.pdfPageNumber === pageNumber);
  const currentPlanScale = planScales.find((scale) => scale.planPageId === currentPlanPageId && scale.pdfPageNumber === pageNumber) ?? null;
  const collapsedBoxDeviceIds = new Set(pageBoxGroups.filter((group) => group.deviceIds.length > 1 && group.id !== activeBoxGroupId).flatMap((group) => group.deviceIds));
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? null;
  const selectedDevice = devices.find((device) => device.id === selectedDeviceId) ?? null;
  const selectedDeviceCatalogItem = selectedDevice ? DEVICE_CATALOG.find((item) => item.id === selectedDevice.catalogItemId) ?? null : null;
  const selectedDeviceBoxGroup = selectedDevice ? boxGroups.find((group) => group.deviceIds.includes(selectedDevice.id)) ?? null : null;
  const selectedLinkedRiser = selectedDevice?.linkedRiserId ? devices.find((device) => device.id === selectedDevice.linkedRiserId) ?? null : null;
  const availableSourcePanels = devices.filter((device) => isPanelDevice(device.catalogItemId) && device.inclusionStatus !== "excluded" && device.id !== selectedDevice?.id);
  const selectedFeedPanel = selectedDevice?.feedFromPanelId ? devices.find((device) => device.id === selectedDevice.feedFromPanelId) ?? null : null;
  const subpanelSource = availableSourcePanels.find((device) => device.catalogItemId === "100a-subpanel") ?? null;
  const { boxGroupTakeoff, circuitRuns, wireBreakdown, wireSummary, labourTakeoff, materialTakeoff, materialGroups } = React.useMemo(() => {
    const includedDevices = devices.filter((device) => device.inclusionStatus !== "excluded");
    const includedIds = new Set(includedDevices.map((device) => device.id));
    const includedConnections = connections.filter((connection) => includedIds.has(connection.sourceDeviceId) && includedIds.has(connection.targetDeviceId));
    const boxGroupTakeoff = boxTakeoff(includedDevices, boxGroups);
    const circuitRuns = buildCircuitRuns(includedDevices, includedConnections);
    const wireBreakdown = buildWireBreakdown(includedDevices, includedConnections, circuitRuns, planScales, wastePercent);
    const wireSummary = summarizeWireBreakdown(wireBreakdown);
    const labourTakeoff = estimateLabour(includedDevices, boxGroups, circuitRuns, wireBreakdown, labourSettings);
    const materialTakeoff = withWireMaterialLines(calculateMaterialTakeoff(includedDevices, boxGroups, includedConnections, estimateLightingBreakerCount(includedDevices)), wireBreakdown);
    return { boxGroupTakeoff, circuitRuns, wireBreakdown, wireSummary, labourTakeoff, materialTakeoff, materialGroups: groupMaterialTakeoff(materialTakeoff) };
  }, [devices, connections, boxGroups, planScales, wastePercent, labourSettings]);
  const selectedWireLine = selectedWireLineId ? wireBreakdown.find((line) => line.id === selectedWireLineId) ?? null : null;
  const unscaledPages = [...new Set(devices.filter((device) => device.inclusionStatus !== "excluded").map((device) => device.pdfPageNumber))].filter((page) => !feetPerPlanUnitForPage(planScales, page));
  React.useEffect(() => {
    window.parent.postMessage({ type: "packops-takeoff-changed" }, window.location.origin);
  }, [devices, connections, boxGroups, planScales, wastePercent, labourSettings, projectName]);
  const selectedCircuitRun = selectedDevice ? circuitRuns.find((run) => run.deviceIds.includes(selectedDevice.id) || run.routeDeviceIds.includes(selectedDevice.id)) ?? null : null;
  const selectedDeviceMaterials = selectedDevice ? materialSummaryForDevice(selectedDevice, devices, connections, boxGroups, circuitRuns, wireBreakdown) : null;
  const fitScale = viewerFitScale(viewerSize, overlayHeight);
  const renderedSize = OVERLAY_SIZE * fitScale;
  const renderedHeight = overlayHeight * fitScale;
  const symbolScale = clamp(1 / zoom, SYMBOL_MIN_SCALE, SYMBOL_MAX_SCALE);

  React.useEffect(() => {
    const onResize = () => setDevicePixelRatio(window.devicePixelRatio || 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  React.useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const updateViewerSize = () => {
      const nextSize = { width: viewer.clientWidth, height: viewer.clientHeight };
      setViewerSize((current) => current.width === nextSize.width && current.height === nextSize.height ? current : nextSize);
    };
    updateViewerSize();
    const observer = new ResizeObserver(updateViewerSize);
    observer.observe(viewer);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space" && !isTypingTarget(event.target)) {
        event.preventDefault();
        setSpacePanActive(true);
        return;
      }
      if (event.code === "KeyG" && !isTypingTarget(event.target)) {
        event.preventDefault();
        setQuickGroupActive(true);
        return;
      }
      if (event.code === "KeyC" && !isTypingTarget(event.target)) {
        event.preventDefault();
        setQuickConnectActive(true);
        return;
      }
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code) && !isTypingTarget(event.target)) {
        event.preventDefault();
        const step = event.shiftKey ? 80 : 28;
        setPan((current) => ({
          x: current.x + (event.code === "ArrowLeft" ? step : event.code === "ArrowRight" ? -step : 0),
          y: current.y + (event.code === "ArrowUp" ? step : event.code === "ArrowDown" ? -step : 0),
        }));
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        setSpacePanActive(false);
      }
      if (event.code === "KeyG") {
        setQuickGroupActive(false);
        setBoxGroups((current) => current.filter((group) => group.deviceIds.length > 1));
        setActiveBoxGroupId(null);
      }
      if (event.code === "KeyC") {
        setQuickConnectActive(false);
        setConnectFromDeviceId(null);
      }
    };
    const onBlur = () => { setSpacePanActive(false); setQuickGroupActive(false); setQuickConnectActive(false); setDraggingRoomId(null); };
    window.addEventListener("blur", onBlur);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  React.useEffect(() => {
    setDraftPolygon([]);
    setScaleDraft([]);
    setSelectedRoomId(null);
    setSelectedDeviceId(null);
    setSelectedWireLineId(null);
    setConnectFromDeviceId(null);
    setActiveBoxGroupId(null);
    setDetectStatus(null);
  }, [pageNumber]);

  React.useEffect(() => {
    setDevices((current) => normalizeAutomaticSwitchTypes(current, connections));
  }, [connections]);

  async function uploadPdf(file: File | undefined) {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setPdfError("Select a PDF floor plan file.");
      return;
    }
    revokeObjectUrlIfNeeded(pdfUrl);
    setPdfUrl(URL.createObjectURL(file));
    setPdfDataUrl(await fileToDataUrl(file));
    setPdfName(file.name);
    setProjectName((current) => current === "Untitled takeoff" ? safeFileBaseName(file.name).replace(/-/g, " ") : current);
    setPdfDocument(null);
    setPdfError(null);
    setPageNumber(1);
    setTotalPages(0);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  function overlayPoint(event: React.MouseEvent<SVGSVGElement> | React.PointerEvent<SVGSVGElement>): Point {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp(((event.clientX - bounds.left) / bounds.width) * OVERLAY_SIZE, 0, OVERLAY_SIZE),
      y: clamp(((event.clientY - bounds.top) / bounds.height) * overlayHeight, 0, overlayHeight)
    };
  }

  function onOverlayClick(event: React.MouseEvent<SVGSVGElement>) {
    if (spacePanActive) {
      return;
    }
    if (!pdfUrl || tool === "pan") return;
    if (tool === "connect") return;
    if (tool === "box") return;
    const point = overlayPoint(event);
    if (tool === "scale") {
      setScaleDraft((points) => points.length >= 2 ? [point] : [...points, point]);
      return;
    }
    if (tool === "room") {
      setDraftPolygon((points) => [...points, point]);
      return;
    }
    const catalogItem = DEVICE_CATALOG.find((item) => item.id === selectedCatalogItemId);
    if (!catalogItem) return;
    const nearestRoom = nearestRoomFor(point, pageRooms);
    const device: ElectricalDevice = {
      id: crypto.randomUUID(),
      planPageId: currentPlanPageId,
      pdfPageNumber: pageNumber,
      catalogItemId: catalogItem.id,
      position: point,
      inclusionStatus: "included",
      ...(nearestRoom ? { roomId: nearestRoom.id } : {})
    };
    setDevices((current) => [...current, device]);
    setSelectedDeviceId(device.id);
    setSelectedWireLineId(null);
    setSelectedRoomId(null);
  }

  function completeRoom() {
    if (draftPolygon.length < 3) return;
    const room: Room = {
      id: crypto.randomUUID(),
      planPageId: currentPlanPageId,
      pdfPageNumber: pageNumber,
      roomName: `Room ${pageRooms.length + 1}`,
      roomType: "other",
      floorLevel: "Main",
      status: "approved",
      marker: centroid(draftPolygon),
      polygon: draftPolygon,
      detectedBy: "manual"
    };
    setRooms((current) => [...current, room]);
    setDraftPolygon([]);
    setSelectedRoomId(room.id);
    setSelectedDeviceId(null);
    setSelectedWireLineId(null);
  }

  async function detectRooms() {
    if (!pdfDocument) {
      setDetectStatus("Upload and load a PDF first.");
      return;
    }
    setDetectStatus("Scanning current page for labels...");
    const page = await pdfDocument.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const text = await page.getTextContent();
    const detected = text.items.map((item) => textItemToRoom(item, viewport.width, viewport.height, overlayHeight)).filter((room): room is Omit<Room, "id" | "planPageId" | "pdfPageNumber" | "floorLevel" | "status" | "detectedBy"> => Boolean(room));
    if (detected.length === 0) {
      setDetectStatus("No common room labels found on this page.");
      return;
    }
    setRooms((current) => {
      const existing = new Set(current.filter((room) => room.planPageId === currentPlanPageId).map((room) => roomKey(room.roomName, room.marker)));
      const fresh = detected.filter((room) => !existing.has(roomKey(room.roomName, room.marker))).map((room): Room => ({
        ...room,
        id: crypto.randomUUID(),
        planPageId: currentPlanPageId,
        pdfPageNumber: pageNumber,
        floorLevel: "Main",
        status: "suggested",
        detectedBy: "ocr"
      }));
      setDetectStatus(fresh.length ? `Detected ${fresh.length} room label${fresh.length === 1 ? "" : "s"}.` : "Detected labels already exist.");
      return [...current, ...fresh];
    });
  }

  function saveProject() {
    const suggestedName = projectName.trim() || safeFileBaseName(pdfName).replace(/-/g, " ") || "Untitled takeoff";
    const nextProjectName = window.prompt("Project name", suggestedName);
    if (nextProjectName === null) return;
    const savedProjectName = nextProjectName.trim() || "Untitled takeoff";
    setProjectName(savedProjectName);
    const project: SavedProjectFile = {
      app: "electrical-takeoff",
      version: 1,
      savedAt: new Date().toISOString(),
      projectName: savedProjectName,
      pdfName,
      ...(pdfDataUrl ? { pdfDataUrl } : {}),
      currentPageNumber: pageNumber,
      viewState: {
        zoom,
        pan,
      },
      rooms,
      devices,
      connections,
      boxGroups,
      planScales,
      wireSettings: {
        switchVerticalAllowanceFeet: SWITCH_VERTICAL_ALLOWANCE_FEET,
        applianceVerticalAllowanceFeet: APPLIANCE_VERTICAL_ALLOWANCE_FEET,
        defaultRiserDropMeters: DEFAULT_RISER_DROP_METERS,
        wastePercent,
      },
      labourSettings,
      exportSummary: {
        materials: materialTakeoff,
        wireBreakdown,
        labour: labourTakeoff,
      },
    };
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeFileBaseName(savedProjectName || pdfName || "electrical-takeoff")}.takeoff.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setProjectStatus(pdfDataUrl ? "Project saved with PDF and takeoff data." : "Project saved. Re-upload the PDF after loading this older-style project.");
  }

  async function downloadCustomerPdf() {
    if (!pdfDocument) {
      setProjectStatus("Upload or load a plan before downloading the customer PDF.");
      return;
    }

    setIsExportingCustomerPdf(true);
    setProjectStatus("Preparing customer PDF...");
    try {
      const customerDeviceIds = new Set(
        devices
          .filter((device) => device.inclusionStatus === "included" && device.catalogItemId !== "floor-riser")
          .map((device) => device.id),
      );
      const customerConnections = connections.filter(
        (connection) => customerDeviceIds.has(connection.sourceDeviceId) && customerDeviceIds.has(connection.targetDeviceId),
      );
      await createCustomerPlanPdf({
        projectName: projectName.trim() || safeFileBaseName(pdfName).replace(/-/g, " ") || "Electrical plan",
        pdfDocument,
        rooms,
        devices,
        connections: customerConnections,
      });
      setProjectStatus("Customer PDF downloaded. It includes a grouped overview and annotated plan pages.");
    } catch (error) {
      setProjectStatus(error instanceof Error ? error.message : "Could not create the customer PDF.");
    } finally {
      setIsExportingCustomerPdf(false);
    }
  }

  React.useEffect(() => {
    const host = window as Window & { packOpsCustomerPlan?: () => Promise<Blob> };
    host.packOpsCustomerPlan = async () => {
      if (!pdfDocument) throw new Error("Load your plan PDF before attaching the customer plan.");
      const includedIds = new Set(devices.filter((device) => device.inclusionStatus === "included").map((device) => device.id));
      return createCustomerPlanPdf({ projectName, pdfDocument, rooms, devices,
        connections: connections.filter((line) => includedIds.has(line.sourceDeviceId) && includedIds.has(line.targetDeviceId)),
      }, false);
    };
    return () => { delete host.packOpsCustomerPlan; };
  }, [pdfDocument, projectName, rooms, devices, connections]);

  async function loadProject(file: File | undefined) {
    if (!file) return;
    try {
      const text = await file.text();
      const project = parseSavedProject(JSON.parse(text));
      revokeObjectUrlIfNeeded(pdfUrl);
      setProjectName(project.projectName || safeFileBaseName(file.name).replace(/-/g, " "));
      setPdfName(project.pdfName || "Saved project");
      setPdfDataUrl(project.pdfDataUrl ?? null);
      setPdfUrl(project.pdfDataUrl ?? null);
      setPdfDocument(null);
      setPdfError(null);
      setRooms(project.rooms);
      setDevices(project.devices);
      setConnections(project.connections);
      setBoxGroups(project.boxGroups);
      setPlanScales(project.planScales);
      setWastePercent(project.wireSettings?.wastePercent ?? DEFAULT_WASTE_PERCENT);
      setLabourSettings(project.labourSettings ?? DEFAULT_LABOUR_SETTINGS);
      setPageNumber(Math.max(1, project.currentPageNumber || 1));
      setZoom(project.viewState?.zoom ?? 1);
      setPan(project.viewState?.pan ?? { x: 0, y: 0 });
      setTotalPages(0);
      setSelectedRoomId(null);
      setSelectedDeviceId(null);
      setSelectedWireLineId(null);
      setConnectFromDeviceId(null);
      setActiveBoxGroupId(null);
      setDraftPolygon([]);
      setScaleDraft([]);
      setProjectStatus(project.pdfDataUrl ? "Project loaded with PDF and takeoff data." : "Project loaded. Re-upload the matching PDF plan to view it behind the saved takeoff.");
    } catch {
      setProjectStatus("Could not load that project file. Choose a saved .takeoff.json file.");
    }
  }

  function startDeviceConnection() {
    if (!selectedDevice || !canStartConnection(selectedDevice.catalogItemId)) return;
    setConnectFromDeviceId(selectedDevice.id);
    setTool("connect");
  }

  function changeTool(nextTool: Tool) {
    if (nextTool === "device") setCatalogOpen(true);
    if (nextTool !== "connect") {
      setConnectFromDeviceId(null);
    } else if (selectedDevice && canStartConnection(selectedDevice.catalogItemId)) {
      setConnectFromDeviceId(selectedDevice.id);
    }
    if (nextTool !== "box") {
      setActiveBoxGroupId(null);
    } else if (selectedDevice && isBoxDevice(selectedDevice.catalogItemId)) {
      activateBoxGroup(selectedDevice);
    }
    if (nextTool !== "scale") {
      setScaleDraft([]);
    }
    setTool(nextTool);
  }

  function savePlanScale() {
    if (scaleDraft.length !== 2 || knownScaleLengthFeet <= 0) return;
    const [start, end] = scaleDraft;
    if (!start || !end || distance(start, end) < 1 || !Number.isFinite(knownScaleLengthFeet)) { setProjectStatus("Choose two different points for the scale."); return; }
    const nextScale: PlanScale = {
      planPageId: currentPlanPageId,
      pdfPageNumber: pageNumber,
      points: [start, end],
      knownLengthFeet: knownScaleLengthFeet,
    };
    setPlanScales((current) => [
      ...current.filter((scale) => scale.planPageId !== currentPlanPageId || scale.pdfPageNumber !== pageNumber),
      nextScale,
    ]);
    setScaleDraft([]);
  }

  function finishConnecting() {
    setConnectFromDeviceId(null);
    setTool("device");
  }

  function connectToDevice(targetDevice: ElectricalDevice) {
    if (!connectFromDeviceId || targetDevice.id === connectFromDeviceId) return;
    const source = devices.find((device) => device.id === connectFromDeviceId);
    if (!source || !canConnectDevices(source.catalogItemId, targetDevice.catalogItemId)) return;
    if (isHeatingControlDevice(source.catalogItemId)) {
      const heater = isHeaterDevice(source.catalogItemId) ? source : targetDevice;
      const thermostat = isHeaterDevice(source.catalogItemId) ? targetDevice : source;
      setConnections((current) => assignHeaterThermostat(current, heater, thermostat.id));
      setConnectFromDeviceId(thermostat.id);
      setSelectedDeviceId(thermostat.id);
      return;
    }
    const alreadyConnected = connections.some((connection) =>
      (connection.sourceDeviceId === source.id && connection.targetDeviceId === targetDevice.id) ||
      (connection.sourceDeviceId === targetDevice.id && connection.targetDeviceId === source.id),
    );
    if (alreadyConnected) {
      setDevices((current) => normalizeAutomaticSwitchTypes(current, connections));
    } else {
      setConnections((current) => {
        const nextConnections = [
          ...current,
          {
          id: crypto.randomUUID(),
          planPageId: currentPlanPageId,
          pdfPageNumber: pageNumber,
          sourceDeviceId: source.id,
          targetDeviceId: targetDevice.id,
          },
        ];
        setDevices((currentDevices) => normalizeAutomaticSwitchTypes(currentDevices, nextConnections));
        return nextConnections;
      });
    }
    setConnectFromDeviceId(nextConnectionAnchorId(source, targetDevice));
    setSelectedDeviceId(targetDevice.id);
    setSelectedWireLineId(null);
    setSelectedRoomId(null);
  }

  function clickDevice(device: ElectricalDevice) {
    if (quickGroupActive || tool === "box") {
      toggleDeviceInBoxGroup(device);
      return;
    }

    if (quickConnectActive) {
      connectClickDevice(device);
      return;
    }

    if (tool !== "connect") {
      setSelectedDeviceId(device.id);
      setSelectedWireLineId(null);
      setSelectedRoomId(null);
      return;
    }

    connectClickDevice(device);
  }

  function connectClickDevice(device: ElectricalDevice) {
    const source = connectFromDeviceId ? devices.find((item) => item.id === connectFromDeviceId) : null;
    if (!source) {
      if (canStartConnection(device.catalogItemId)) {
        setConnectFromDeviceId(device.id);
      }
      setSelectedDeviceId(device.id);
      setSelectedWireLineId(null);
      setSelectedRoomId(null);
      return;
    }

    if (device.id === source.id) return;

    if (canConnectDevices(source.catalogItemId, device.catalogItemId)) {
      connectToDevice(device);
      return;
    }

    if (canStartConnection(device.catalogItemId)) {
      setConnectFromDeviceId(device.id);
      setSelectedDeviceId(device.id);
      setSelectedWireLineId(null);
      setSelectedRoomId(null);
    }
  }

  function deleteDevice(deviceId: string) {
    setDevices((current) => current
      .filter((device) => device.id !== deviceId)
      .map((device) => device.feedFromPanelId === deviceId || device.linkedRiserId === deviceId ? withoutDeviceReferences(device, deviceId) : device));
    setConnections((current) =>
      current.filter((connection) => connection.sourceDeviceId !== deviceId && connection.targetDeviceId !== deviceId),
    );
    setBoxGroups((current) =>
      current
        .map((group) => ({ ...group, deviceIds: group.deviceIds.filter((id) => id !== deviceId) }))
        .filter((group) => group.deviceIds.length > 1),
    );
    setSelectedDeviceId(null);
    if (connectFromDeviceId === deviceId) {
      setConnectFromDeviceId(null);
      setTool("device");
    }
    if (activeBoxGroupId && !boxGroups.find((group) => group.id === activeBoxGroupId)?.deviceIds.some((id) => id !== deviceId)) {
      setActiveBoxGroupId(null);
      setTool("device");
    }
  }

  function setDeviceFeedPanel(deviceId: string, panelId: string | null) {
    setDevices((current) => current.map((device) => {
      if (device.id !== deviceId) return device;
      if (!panelId) return withoutFeedPanel(device);
      return { ...device, feedFromPanelId: panelId };
    }));
  }

  function linkRisers(firstRiserId: string, secondRiserId: string) {
    if (firstRiserId === secondRiserId) return;
    setDevices((current) => current.map((device) => {
      if (device.id === firstRiserId) return { ...device, linkedRiserId: secondRiserId };
      if (device.id === secondRiserId) return { ...device, linkedRiserId: firstRiserId };
      if (device.linkedRiserId === firstRiserId || device.linkedRiserId === secondRiserId) return withoutLinkedRiser(device);
      return device;
    }));
    setLinkingRiserId(null);
  }

  function unlinkRiser(riserId: string) {
    setDevices((current) => current.map((device) => device.id === riserId || device.linkedRiserId === riserId ? withoutLinkedRiser(device) : device));
    if (linkingRiserId === riserId) setLinkingRiserId(null);
  }

  function activateBoxGroup(device: ElectricalDevice) {
    if (!isBoxDevice(device.catalogItemId)) return;
    const existingGroup = boxGroups.find((group) => group.deviceIds.includes(device.id));
    if (existingGroup) {
      setActiveBoxGroupId(existingGroup.id);
      setSelectedDeviceId(device.id);
      setSelectedRoomId(null);
      return;
    }

    const group: ElectricalBoxGroup = {
      id: crypto.randomUUID(),
      planPageId: currentPlanPageId,
      pdfPageNumber: pageNumber,
      deviceIds: [device.id],
    };
    setBoxGroups((current) => [...current, group]);
    setActiveBoxGroupId(group.id);
    setSelectedDeviceId(device.id);
    setSelectedRoomId(null);
  }

  function startBoxGroup() {
    if (!selectedDevice) return;
    activateBoxGroup(selectedDevice);
    setTool("box");
  }

  function toggleDeviceInBoxGroup(device: ElectricalDevice) {
    if (!isBoxDevice(device.catalogItemId)) return;
    if (!activeBoxGroupId) {
      activateBoxGroup(device);
      return;
    }

    setBoxGroups((current) => current.map((group) => {
      if (group.id !== activeBoxGroupId) {
        return { ...group, deviceIds: group.deviceIds.filter((id) => id !== device.id) };
      }
      if (group.deviceIds.includes(device.id)) {
        return group.deviceIds.length > 1 ? { ...group, deviceIds: group.deviceIds.filter((id) => id !== device.id) } : group;
      }
      return { ...group, deviceIds: [...group.deviceIds, device.id] };
    }).filter((group) => group.deviceIds.length > 0));

    setSelectedDeviceId(device.id);
    setSelectedRoomId(null);
  }

  function finishBoxGrouping() {
    setBoxGroups((current) => current.filter((group) => group.deviceIds.length > 1));
    setActiveBoxGroupId(null);
    setTool("device");
  }

  function clickBoxGroup(group: ElectricalBoxGroup) {
    const firstDeviceId = group.deviceIds[0];
    if (!firstDeviceId) return;
    setSelectedDeviceId(firstDeviceId);
    setSelectedRoomId(null);
    if (tool === "box" || quickGroupActive) {
      setActiveBoxGroupId(group.id);
    }
  }

  return (
    <main className="app">
      <header className="topbar">
        <div>
          <h1>Residential Electrical Takeoff</h1>
          <p>Measure plans, count devices, and review material and labour estimates.</p>
        </div>
        <div className="actions">
          <label className="primary">
            Upload PDF
            <input type="file" accept="application/pdf,.pdf" onChange={(event) => {
              void uploadPdf(event.currentTarget.files?.[0]);
              event.currentTarget.value = "";
            }} />
          </label>
          <button onClick={saveProject}>Save Project</button>
          <button onClick={() => void downloadCustomerPdf()} disabled={!pdfDocument || isExportingCustomerPdf}>
            {isExportingCustomerPdf ? "Preparing PDF..." : "Download Customer PDF"}
          </button>
          <label className="file-button">
            Load Project
            <input type="file" accept="application/json,.json,.takeoff.json" onChange={(event) => {
              void loadProject(event.currentTarget.files?.[0]);
              event.currentTarget.value = "";
            }} />
          </label>
        </div>
        {pdfError ? <div className="error">{pdfError}</div> : null}
        {projectStatus ? <div className="project-status">{projectStatus}</div> : null}
      </header>

      <section className={`workspace ${focusPlan ? "focus-plan" : ""}`}>
        <aside className="panel left">
          <h2>Tools</h2>
          <div className="segmented">
            {(["pan", "room", "device", "connect", "box", "scale"] as Tool[]).map((item) => (
              <button key={item} className={tool === item ? "active" : ""} onClick={() => changeTool(item)}>{{ pan: "Move", room: "Rooms", device: "Devices", connect: "Connect", box: "Group box", scale: "Set scale" }[item]}</button>
            ))}
          </div>
          {tool === "room" && <><div className="button-grid">
            <button onClick={() => void detectRooms()} disabled={!pdfDocument}>Detect Rooms</button>
            <button onClick={() => setRooms((current) => current.map((room) => room.planPageId === currentPlanPageId && room.status === "suggested" ? { ...room, status: "approved" } : room))}>Approve all</button>
            <button onClick={completeRoom} disabled={draftPolygon.length < 3}>Complete room</button>
            <button onClick={() => setDraftPolygon([])} disabled={draftPolygon.length === 0}>Clear draft</button>
          </div>
          {detectStatus ? <p className="hint">{detectStatus}</p> : <p className="hint">Detect Rooms creates suggested pins from PDF text labels. Manual tracing stays available.</p>}</>}
          {quickConnectActive ? (
            <div className="connect-hint">
              <p>Quick connect: keep holding C and click devices to connect them.</p>
            </div>
          ) : null}
          {quickGroupActive ? (
            <div className="box-hint">
              <p>Quick group: keep holding G and click switches or receptacles in the same box.</p>
            </div>
          ) : null}
          {connectFromDeviceId ? (
            <div className="connect-hint">
              <p>{devices.find((device) => device.id === connectFromDeviceId)?.catalogItemId === "baseboard-thermostat" ? "Click each heater this thermostat controls. The thermostat stays selected until you finish." : "Click compatible devices to connect them. Choose Finish connecting when done."}</p>
              <button onClick={finishConnecting}>Finish connecting</button>
            </div>
          ) : null}
          {activeBoxGroupId ? (
            <div className="box-hint">
              <p>Box grouping is on. Click switches or receptacles that share the same physical wall box.</p>
              <button onClick={finishBoxGrouping}>Finish box group</button>
            </div>
          ) : null}

          <h2>Plan</h2>
          <label>Page
            <input type="number" min={1} max={Math.max(totalPages, 1)} value={pageNumber} onChange={(event) => setPageNumber(clamp(Number(event.target.value) || 1, 1, Math.max(totalPages, 1)))} />
          </label>
          <div className="pager">
            <button disabled={pageNumber <= 1} onClick={() => setPageNumber((value) => Math.max(1, value - 1))}>Previous</button>
            <strong>{pdfUrl ? `${pageNumber} / ${totalPages || "..."}` : "No PDF"}</strong>
            <button disabled={!totalPages || pageNumber >= totalPages} onClick={() => setPageNumber((value) => Math.min(totalPages, value + 1))}>Next</button>
          </div>
          <label>Zoom {Math.round(zoom * 100)}%
            <input type="range" min={MIN_ZOOM} max={MAX_ZOOM} step={0.05} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
          </label>
          <button onClick={fitPlan}>Fit plan</button>
          <button onClick={() => setPan({ x: 0, y: 0 })}>Center plan</button>
          <details><summary>Moving around & shortcuts</summary><p className="hint">Two-finger scroll moves the plan. Pinch or hold Ctrl/Shift and scroll to zoom where you point. Drag with the hand tool, Space, or the middle mouse button. Arrow keys move; Shift moves faster.</p>
          <p className="hint">Shortcuts: hold C and click devices to connect; hold G and click devices to group them in the same box.</p>
          </details>
          <h2>Scale {currentPlanScale ? "✓" : "— needed for wire"}</h2>
          {tool === "scale" ? <>
          <p className="hint">Use the Scale tool, click both ends of a known dimension, enter the real length, then save it.</p>
          <label>Known length, feet
            <input type="number" min={0.1} step={0.1} value={knownScaleLengthFeet} onChange={(event) => setKnownScaleLengthFeet(Math.max(0.1, Number(event.target.value) || 0.1))} />
          </label>
          <button onClick={savePlanScale} disabled={scaleDraft.length !== 2 || knownScaleLengthFeet <= 0}>Save scale for page</button>
          <p className="hint">
            {currentPlanScale ? `Scale set: ${currentPlanScale.knownLengthFeet} ft = ${Math.round(distance(currentPlanScale.points[0], currentPlanScale.points[1]))} plan units.` : `${scaleDraft.length}/2 scale points selected.`}
          </p>

          </> : <button onClick={() => changeTool("scale")}>{currentPlanScale ? "Change page scale" : "Set page scale"}</button>}
          <details><summary>Devices & floor risers</summary>
          <p className="hint">Pick devices from the floating tray over the plan. Symbols are estimating symbols, not legally official code symbols.</p>
          <p className="hint">Place two Floor risers, select one and start a riser link, then select the matching riser and link it. The pair defaults to one 3m floor jump.</p></details>
        </aside>

        <section ref={viewerRef} className={`viewer ${tool === "pan" || spacePanActive ? "pan-ready" : ""} ${isPanning ? "panning" : ""}`} {...navigation} tabIndex={0} aria-label="Plan viewer">
          <div className="navigation-controls" aria-label="Plan navigation">
            <button type="button" aria-pressed={tool === "pan"} onClick={() => changeTool("pan")} title="Drag anywhere to move the plan">Hand</button>
            <button type="button" onClick={() => setZoom((value) => value / 1.25)} disabled={zoom <= MIN_ZOOM} aria-label="Zoom out">−</button>
            <output aria-label="Zoom level">{Math.round(zoom * 100)}%</output>
            <button type="button" onClick={() => setZoom((value) => value * 1.25)} disabled={zoom >= MAX_ZOOM} aria-label="Zoom in">+</button>
            <button type="button" onClick={fitPlan}>Fit plan</button>
            <button type="button" aria-pressed={focusPlan} onClick={() => { setFocusPlan((value) => !value); fitPlan(); }}>{focusPlan ? "Show panels" : "More space"}</button>
          </div>
          <div className="floating-catalog" aria-label="Device catalog">
            <div className="floating-catalog-header">
              <button type="button" className="catalog-toggle" aria-expanded={catalogOpen} aria-controls="device-tray" onClick={() => setCatalogOpen((value) => !value)}>Devices {catalogOpen ? "−" : "+"}</button>
              <strong>{DEVICE_CATALOG.find((item) => item.id === selectedCatalogItemId)?.symbol ?? ""}</strong>
            </div>
            <div id="device-tray" className="floating-catalog-scroll" hidden={!catalogOpen}>
              <input type="search" aria-label="Search takeoff devices" placeholder="Find device or symbol…" value={deviceSearch} onChange={event => setDeviceSearch(event.target.value)} autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} />
              {matchingDevices.length === 0 && <p className="hint">No matching devices. Try a name or symbol.</p>}
              {matchingDevices.map((item) => (
                <button key={item.id} className={item.id === selectedCatalogItemId ? "active" : ""} onClick={() => {
                  setSelectedCatalogItemId(item.id);
                  changeTool("device");
                }}>
                  <strong>{item.symbol}</strong>
                  <span>{item.name}</span>
                </button>
              ))}
            </div>
          </div>
          {!pdfUrl ? (
            <div className="empty">
              <h2>Upload a floor plan PDF</h2>
              <p>Then use Detect Rooms, manual room tracing, and device placement on the PDF overlay.</p>
            </div>
          ) : (
            <div className="pan-layer" style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}>
              <div className="page-shell" style={{ width: renderedSize, height: renderedHeight, transform: `translate(-50%, -50%) scale(${zoom})` }}>
                <Document
                  file={pdfUrl}
                  loading={<div className="pdf-message">Loading PDF...</div>}
                  error={<div className="pdf-message error-text">Could not load PDF.</div>}
                  onLoadSuccess={(pdf) => {
                    setPdfDocument(pdf as PdfDocumentLike);
                    setTotalPages(pdf.numPages);
                    setPdfError(null);
                    if (pageNumber > pdf.numPages) setPageNumber(pdf.numPages);
                  }}
                  onLoadError={(error) => {
                    setPdfError(error instanceof Error ? error.message : "Could not load PDF.");
                    setPdfDocument(null);
                  }}
                >
                  <Page
                    pageNumber={pageNumber}
                    width={renderedSize}
                    devicePixelRatio={Math.min(3, devicePixelRatio * 2)}
                    renderAnnotationLayer={false}
                    renderTextLayer={false}
                    onLoadSuccess={(page) => {
                      const viewport = page.getViewport({ scale: 1 });
                      const nextOverlayHeight = (viewport.height / viewport.width) * OVERLAY_SIZE;
                      setOverlayHeight((current) => Math.abs(current - nextOverlayHeight) > 0.5 ? nextOverlayHeight : current);
                    }}
                  />
                </Document>
                <svg
                  viewBox={`0 0 ${OVERLAY_SIZE} ${overlayHeight}`}
                  className="overlay"
                  onClick={onOverlayClick}
                  onPointerMove={(event) => {
                    if (draggingRoomId) {
                      const point = overlayPoint(event);
                      setRooms((current) => current.map((room) => room.id === draggingRoomId ? { ...room, marker: point } : room));
                    }
                  }}
                  onPointerUp={() => setDraggingRoomId(null)}
                  onPointerCancel={() => setDraggingRoomId(null)}
                >
                  <rect width={OVERLAY_SIZE} height={overlayHeight} fill="transparent" />
                  {pageRooms.map((room) => (
                    <g key={room.id}>
                      {room.polygon && room.polygon.length >= 3 ? <polygon points={points(room.polygon)} className={room.id === selectedRoomId ? "room selected" : "room"} /> : null}
                      <g transform={`translate(${room.marker.x} ${room.marker.y}) scale(${symbolScale})`} onPointerDown={(event) => {
                        event.stopPropagation();
                        event.currentTarget.setPointerCapture(event.pointerId);
                        setDraggingRoomId(room.id);
                        setSelectedRoomId(room.id);
                        setSelectedDeviceId(null);
                      }}>
                        <path className={room.status === "suggested" ? "room-pin suggested" : "room-pin"} d="M0 -19 C12 -19 20 -11 20 0 C20 15 0 26 0 26 C0 26 -20 15 -20 0 C-20 -11 -12 -19 0 -19Z" />
                        <circle r="6" className={room.status === "suggested" ? "pin-dot suggested" : "pin-dot"} />
                      </g>
                      <text x={room.marker.x} y={room.marker.y - 30 * symbolScale} textAnchor="middle" className="room-label" fontSize={18 * symbolScale}>{room.roomName}</text>
                    </g>
                  ))}
                  {draftPolygon.length ? <g><polyline points={points(draftPolygon)} className="draft" />{draftPolygon.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="7" className="draft-point" />)}</g> : null}
                  {currentPlanScale ? (
                    <g>
                      <line x1={currentPlanScale.points[0].x} y1={currentPlanScale.points[0].y} x2={currentPlanScale.points[1].x} y2={currentPlanScale.points[1].y} className="scale-line saved" />
                      <text x={(currentPlanScale.points[0].x + currentPlanScale.points[1].x) / 2} y={(currentPlanScale.points[0].y + currentPlanScale.points[1].y) / 2 - 10 * symbolScale} textAnchor="middle" className="scale-label" fontSize={12 * symbolScale}>
                        {currentPlanScale.knownLengthFeet} ft
                      </text>
                    </g>
                  ) : null}
                  {scaleDraft.length ? (
                    <g>
                      {scaleDraft.length === 2 ? <DraftScaleLine points={scaleDraft} /> : null}
                      {scaleDraft.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r={7 * symbolScale} className="scale-point" />)}
                    </g>
                  ) : null}
                  {selectedCircuitRun && selectedCircuitRun.path.length >= 2 ? (
                    <SelectedWireRun run={selectedCircuitRun} devices={devices} currentPageNumber={pageNumber} symbolScale={symbolScale} />
                  ) : null}
                  {selectedWireLine ? (
                    <SelectedWireLine line={selectedWireLine} devices={devices} currentPageNumber={pageNumber} symbolScale={symbolScale} />
                  ) : null}
                  {pageConnections.map((connection) => {
                    const source = pageDevices.find((device) => device.id === connection.sourceDeviceId);
                    const target = pageDevices.find((device) => device.id === connection.targetDeviceId);
                    if (!source || !target) return null;
                    return (
                      <line
                        key={connection.id}
                        x1={source.position.x}
                        y1={source.position.y}
                        x2={target.position.x}
                        y2={target.position.y}
                        className="switch-connection"
                      />
                    );
                  })}
                  {linkedRiserPairs(pageDevices).map(([source, target]) => (
                    <line
                      key={`${source.id}-${target.id}`}
                      x1={source.position.x}
                      y1={source.position.y}
                      x2={target.position.x}
                      y2={target.position.y}
                      className="riser-link"
                    />
                  ))}
                  {pageBoxGroups.map((group) => {
                    const groupDevices = group.deviceIds.map((id) => pageDevices.find((device) => device.id === id)).filter((device): device is ElectricalDevice => Boolean(device));
                    const bounds = groupBounds(groupDevices, symbolScale);
                    if (!bounds || groupDevices.length < 2) return null;
                    if (group.id !== activeBoxGroupId) {
                      const center = boundsCenter(bounds);
                      return (
                        <g key={group.id} transform={`translate(${center.x} ${center.y}) scale(${symbolScale * DEVICE_SYMBOL_SCALE})`} onClick={(event) => {
                          event.stopPropagation();
                          clickBoxGroup(group);
                        }}>
                          <BoxGroupSymbol
                            devices={groupDevices}
                            selectedDeviceId={selectedDeviceId}
                            onDeviceClick={(device) => clickDevice(device)}
                          />
                        </g>
                      );
                    }
                    return (
                      <g key={group.id}>
                        <path
                          d={boxGroupPath(bounds)}
                          className={group.id === activeBoxGroupId ? "box-group active" : "box-group"}
                        />
                        <text x={bounds.x + bounds.width / 2} y={bounds.y - 6 * symbolScale} textAnchor="middle" className="box-label" fontSize={10 * symbolScale}>
                          {groupDevices.length}G
                        </text>
                      </g>
                    );
                  })}
                  {pageDevices.filter((device) => !collapsedBoxDeviceIds.has(device.id)).map((device) => <g key={device.id} transform={`translate(${device.position.x} ${device.position.y}) scale(${symbolScale * DEVICE_SYMBOL_SCALE})`} onClick={(event) => {
                    event.stopPropagation();
                    clickDevice(device);
                  }}><PlanSymbol id={device.catalogItemId} selected={device.id === selectedDeviceId} />
                    {isHeaterDevice(device.catalogItemId) && <text y={29} textAnchor="middle" fontSize={10} fill="#0a4f45" stroke="white" strokeWidth={3} paintOrder="stroke">{device.heaterWattage ? `${device.heaterWattage} W` : "Set watts"}</text>}
                    {device.catalogItemId === "baseboard-thermostat" && <text y={29} textAnchor="middle" fontSize={10} fill="#0a4f45">T{devices.filter((item) => item.catalogItemId === "baseboard-thermostat").findIndex((item) => item.id === device.id) + 1}</text>}
                  </g>)}
                </svg>
              </div>
            </div>
          )}
        </section>

        <aside className="panel right">
          <h2>Project</h2>
          <label>Project name<input value={projectName} onChange={(event) => setProjectName(event.target.value)} /></label>
          <p>{pdfName}</p>
          <div className="stats"><span>Page rooms <strong>{pageRooms.length}</strong></span><span>Page devices <strong>{pageDevices.length}</strong></span></div>
          <div className="wire-summary">
            <strong>Wire Summary</strong>
            {wireSummary.length ? (
              <div className="takeoff compact">
                {wireSummary.map((line) => (
                  <div key={line.item}><span>{line.item}</span><strong>{formatMeters(line.quantity, true)}</strong></div>
                ))}
              </div>
            ) : (
              <p className="hint">Set scale and add connected devices to calculate wire.</p>
            )}
          </div>

          <h2>Selected</h2>
          {selectedRoom ? (
            <div className="form">
              <label>Room name<input value={selectedRoom.roomName} onChange={(event) => setRooms((current) => current.map((room) => room.id === selectedRoom.id ? { ...room, roomName: event.target.value } : room))} /></label>
              <label>Room type<select value={selectedRoom.roomType} onChange={(event) => setRooms((current) => current.map((room) => room.id === selectedRoom.id ? { ...room, roomType: event.target.value as RoomType } : room))}>{ROOM_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
              <label>Status<select value={selectedRoom.status} onChange={(event) => setRooms((current) => current.map((room) => room.id === selectedRoom.id ? { ...room, status: event.target.value as RoomStatus } : room))}><option value="suggested">Suggested</option><option value="approved">Approved</option><option value="ignored">Ignored</option></select></label>
              <button onClick={() => setRooms((current) => current.filter((room) => room.id !== selectedRoom.id))}>Delete room</button>
            </div>
          ) : selectedDevice ? (
            <div className="form">
              <label>Device type<select value={selectedDevice.catalogItemId} onChange={(event) => {
                const nextType = event.target.value;
                setDevices((current) => current.map((device) => device.id === selectedDevice.id ? { ...device, catalogItemId: nextType } : device));
                setConnections((current) => current.filter((line) => {
                  const otherId = line.sourceDeviceId === selectedDevice.id ? line.targetDeviceId : line.targetDeviceId === selectedDevice.id ? line.sourceDeviceId : null;
                  const other = devices.find((device) => device.id === otherId);
                  return !otherId || Boolean(other && canConnectDevices(nextType, other.catalogItemId));
                }));
              }}>{DEVICE_CATALOG.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              {isHeaterDevice(selectedDevice.catalogItemId) && <>
                <label>Heater wattage (W, up to 2,000)<input type="number" min={1} max={2000} step={1} placeholder="Set wattage" value={selectedDevice.heaterWattage ?? ""} onChange={(event) => {
                  const value = event.target.value;
                  setDevices((current) => current.map((device) => {
                    if (device.id !== selectedDevice.id) return device;
                    const { heaterWattage, ...rest } = device;
                    return value === "" ? rest : { ...rest, heaterWattage: clamp(Math.round(Number(value)) || 1, 1, 2000) };
                  }));
                }} /></label>
                <label>Controlled by thermostat<select value={connections.flatMap((line) => line.sourceDeviceId === selectedDevice.id ? [line.targetDeviceId] : line.targetDeviceId === selectedDevice.id ? [line.sourceDeviceId] : []).find((id) => devices.some((device) => device.id === id && device.catalogItemId === "baseboard-thermostat")) ?? ""} onChange={(event) => setConnections((current) => assignHeaterThermostat(current, selectedDevice, event.target.value))}>
                  <option value="">Not connected</option>
                  {devices.filter((device) => device.catalogItemId === "baseboard-thermostat").map((device, index) => <option key={device.id} value={device.id}>Thermostat {index + 1} · page {device.pdfPageNumber}{device.notes ? ` · ${device.notes}` : ""}{device.inclusionStatus === "excluded" ? " (excluded)" : ""}</option>)}
                </select></label>
                <p className="hint">Changing BBH to wall fan keeps its thermostat and wattage. Set the matching materials in Device materials.</p>
              </>}
              {selectedDevice.catalogItemId === "baseboard-thermostat" && <div className="device-material-card">
                <strong>Connected heaters</strong>
                {connectedBaseboardHeaters(selectedDevice, devices, connections).map((heater) => <div key={heater.id}>
                  <button onClick={() => setSelectedDeviceId(heater.id)}>{isHeaterDevice(heater.catalogItemId) && heater.catalogItemId === "wall-fan-heater" ? "Wall fan" : "BBH"} · {heater.heaterWattage ? `${heater.heaterWattage} W` : "Wattage not set"}{heater.notes ? ` · ${heater.notes}` : ""}</button>
                  <button onClick={() => setConnections((current) => assignHeaterThermostat(current, heater, ""))}>Disconnect</button>
                </div>)}
                <p className="hint">{connectedBaseboardHeaters(selectedDevice, devices, connections).length} heaters · {connectedBaseboardHeaters(selectedDevice, devices, connections).reduce((sum, heater) => sum + (heater.heaterWattage ?? 0), 0)} W entered. Wattage is for tracking; cable estimates keep the existing settings.</p>
              </div>}

              <label>Status<select value={selectedDevice.inclusionStatus} onChange={(event) => setDevices((current) => current.map((device) => device.id === selectedDevice.id ? { ...device, inclusionStatus: event.target.value as DeviceInclusionStatus } : device))}><option value="included">Included</option><option value="optional">Optional</option><option value="excluded">Excluded</option></select></label>
              {selectedDevice.catalogItemId === "floor-riser" ? (
                <>
                  <label>Riser travel, meters
                    <input type="number" min={0} step={0.5} value={selectedDevice.riserDropMeters ?? DEFAULT_RISER_DROP_METERS} onChange={(event) => setDevices((current) => current.map((device) => device.id === selectedDevice.id ? { ...device, riserDropMeters: Math.max(0, Number(event.target.value) || 0) } : device))} />
                  </label>
                  <p className="hint">{selectedLinkedRiser ? `Linked to riser on page ${selectedLinkedRiser.pdfPageNumber}.` : "Not linked. Link this to the matching riser on the other floor/plan area."}</p>
                  {linkingRiserId && linkingRiserId !== selectedDevice.id ? (
                    <button onClick={() => linkRisers(linkingRiserId, selectedDevice.id)}>Link to selected riser</button>
                  ) : (
                    <button onClick={() => setLinkingRiserId(selectedDevice.id)}>Start riser link</button>
                  )}
                  {selectedDevice.linkedRiserId ? <button onClick={() => unlinkRiser(selectedDevice.id)}>Unlink riser</button> : null}
                </>
              ) : null}
              {isCircuitLoadDevice(selectedDevice.catalogItemId) && availableSourcePanels.length ? (
                <>
                  <label>Fed from
                    <select value={selectedDevice.feedFromPanelId ?? ""} onChange={(event) => setDeviceFeedPanel(selectedDevice.id, event.target.value || null)}>
                      <option value="">Auto nearest panel</option>
                      {availableSourcePanels.map((panel) => <option key={panel.id} value={panel.id}>{panelName(panel)}</option>)}
                    </select>
                  </label>
                  {subpanelSource ? <button onClick={() => setDeviceFeedPanel(selectedDevice.id, subpanelSource.id)}>Feed from 100A subpanel</button> : null}
                  <p className="hint">{selectedFeedPanel ? `Assigned to ${panelName(selectedFeedPanel)}.` : "Uses the nearest panel unless assigned here."}</p>
                </>
              ) : null}
              <label>Notes<textarea value={selectedDevice.notes ?? ""} onChange={(event) => setDevices((current) => current.map((device) => device.id === selectedDevice.id ? { ...device, notes: event.target.value } : device))} /></label>
              {canStartConnection(selectedDevice.catalogItemId) ? (
                <button onClick={startDeviceConnection}>
                  {selectedDevice.catalogItemId === "baseboard-thermostat" ? "Connect heaters on plan" : isHeaterDevice(selectedDevice.catalogItemId) ? "Connect to thermostat" : isSwitchDevice(selectedDevice.catalogItemId) ? "Connect to light" : "Connect lighting/switches"}
                </button>
              ) : null}
              {isBoxDevice(selectedDevice.catalogItemId) ? (
                <button onClick={startBoxGroup}>
                  {selectedDeviceBoxGroup ? `Edit ${selectedDeviceBoxGroup.deviceIds.length}-gang box` : "Group in same box"}
                </button>
              ) : null}
              {selectedDeviceCatalogItem ? (
                <p className="hint">{selectedDeviceCatalogItem.name}</p>
              ) : null}
              {selectedDeviceMaterials ? (
                <div className="device-material-card">
                  <strong>{selectedDeviceMaterials.title}</strong>
                  {selectedDeviceMaterials.details.map((detail) => <p key={detail} className="hint">{detail}</p>)}
                  <div className="takeoff compact">
                    {selectedDeviceMaterials.materials.map((line) => (
                      <div key={line.item}><span>{line.item}</span><strong>{line.quantity}</strong></div>
                    ))}
                  </div>
                </div>
              ) : null}
              <button onClick={() => deleteDevice(selectedDevice.id)}>Delete device</button>
            </div>
          ) : <p className="hint">Select a room pin, room polygon, or device symbol.</p>}

          <h2>Takeoff</h2>
          <p className="hint">Device connections: {connections.length}</p>
          <p className="hint">Box groups: {boxGroups.filter((group) => group.deviceIds.length > 1).length}</p>
          <div className="wire-card">
            <strong>Wire Needed</strong>
            <p className="hint">Totals include allowances and waste. Click a device to see the run, vertical allowance, and waste breakdown.</p>
            <label>Waste %
              <input type="number" min={0} max={100} step={1} value={wastePercent} onChange={(event) => setWastePercent(clamp(Number(event.target.value) || 0, 0, 100))} />
            </label>
            {wireBreakdown.length ? (
              <div className="wire-results">
                {wireBreakdown.map((line) => (
                  <button key={line.id} className={line.id === selectedWireLineId ? "active wire-row" : "wire-row"} onClick={() => {
                    setSelectedWireLineId((current) => current === line.id ? null : line.id);
                    setSelectedDeviceId(null);
                    setSelectedRoomId(null);
                  }}><span>{line.source} - {line.wireType}</span><strong>{formatMeters(line.totalFeet, true)}</strong></button>
                ))}
              </div>
            ) : (
              <p className="hint">Set the page scale, then add lighting connections, two smoke/CO alarms, or a panel plus appliance loads.</p>
            )}
          </div>
          {unscaledPages.length > 0 ? <p className="calculation-warning" role="status">Incomplete wire estimate: set scale on page {unscaledPages.join(", ")}. Unmeasured runs are not a zero quantity.</p> : null}
          {devices.some((device) => device.inclusionStatus !== "excluded" && (isSwitchDevice(device.catalogItemId) || isLightOrFanDevice(device.catalogItemId) || isLifeSafetyInterconnectDevice(device.catalogItemId))) ? <p className="calculation-warning">Lighting and alarm quantities cover connections between devices. Add the feed from the panel and its termination labour before using this as a complete estimate.</p> : null}
          {new Set(devices.filter((device) => device.inclusionStatus !== "excluded").map((device) => device.pdfPageNumber)).size > 1 ? <p className="calculation-warning">Multi-page plan: check floor riser links and drop heights. Page numbers alone do not describe floor heights or routing.</p> : null}
          <h2>Labour</h2>
          <div className="form compact-form">
            <label>Project type
              <select value={labourSettings.projectTypeMultiplier} onChange={(event) => setLabourSettings((current) => ({ ...current, projectTypeMultiplier: Number(event.target.value) }))}>
                <option value={1}>New construction</option>
                <option value={1.2}>Renovation/open areas</option>
                <option value={1.55}>Finished house retrofit</option>
              </select>
            </label>
            <label>Access
              <select value={labourSettings.accessMultiplier} onChange={(event) => setLabourSettings((current) => ({ ...current, accessMultiplier: Number(event.target.value) }))}>
                <option value={1}>Open framing</option>
                <option value={1.15}>Mixed access</option>
                <option value={1.35}>Difficult access</option>
              </select>
            </label>
            <label>Ceiling height
              <select value={labourSettings.ceilingHeightMultiplier} onChange={(event) => setLabourSettings((current) => ({ ...current, ceilingHeightMultiplier: Number(event.target.value) }))}>
                <option value={1}>8 ft standard</option>
                <option value={1.1}>9-10 ft</option>
                <option value={1.25}>High/vaulted</option>
              </select>
            </label>
            <label>Setup/coordination hours
              <input type="number" min={0} step={0.5} value={labourSettings.setupHours} onChange={(event) => setLabourSettings((current) => ({ ...current, setupHours: Math.max(0, Number(event.target.value) || 0) }))} />
            </label>
          </div>
          <div className="takeoff compact">
            {labourTakeoff.lines.map((line) => (
              <div key={`${line.phase}-${line.item}`}><span>{line.phase}: {line.item}</span><strong data-quantity={line.quantity}>{line.quantity.toFixed(2)} hr</strong></div>
            ))}
            <div><span>Total labour</span><strong>{labourTakeoff.totalHours.toFixed(2)} hr</strong></div>
          </div>
          <div className="takeoff">
            {boxGroupTakeoff.map((row) => <div key={row.label}><span>{row.label}</span><strong>{row.count}</strong></div>)}
            {DEVICE_CATALOG.map((item) => ({ item, count: devices.filter((device) => device.catalogItemId === item.id && device.inclusionStatus !== "excluded").length })).filter((row) => row.count > 0).map((row) => <div key={row.item.id}><span>{row.item.name}</span><strong>{row.count}</strong></div>)}
          </div>

          <h2>Calculated wire</h2><p className="hint">All other materials come from your saved Pack Ops assignments.</p>
          {materialGroups.length ? materialGroups.map((group) => (
            <section key={group.title} className="material-section">
              <h3>{group.title}</h3>
              <div className="takeoff compact">
                {group.lines.map((line) => (
                  <div key={line.item}><span>{line.item}</span><strong>{line.quantity}</strong></div>
                ))}
              </div>
            </section>
          )) : <p className="hint">Place devices to generate material counts.</p>}
        </aside>
      </section>
    </main>
  );
}

interface CustomerPlanPdfInput {
  projectName: string;
  pdfDocument: PdfDocumentLike;
  rooms: Room[];
  devices: ElectricalDevice[];
  connections: DeviceConnection[];
}

const PDF_GREEN = [15, 109, 95] as const;
const PDF_DARK = [23, 32, 51] as const;
const PDF_MUTED = [93, 105, 120] as const;
const PDF_LINE = [216, 226, 223] as const;

async function createCustomerPlanPdf(input: CustomerPlanPdfInput, download = true): Promise<Blob> {
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait", compress: true });
  const includedDevices = input.devices.filter(
    (device) => device.inclusionStatus === "included" && device.catalogItemId !== "floor-riser",
  );
  const preparedDate = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "long", day: "numeric" }).format(new Date());
  let y = drawCustomerPdfHeader(doc, input.projectName, "Electrical Plan Proposal", preparedDate);

  doc.setTextColor(...PDF_MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  const intro = doc.splitTextToSize(
    "This document provides a clear visual overview of the electrical locations included in the proposed plan. Each marker on the following drawings matches an item in the grouped summary below.",
    516,
  );
  doc.text(intro, 48, y);
  y += intro.length * 14 + 18;

  drawMetricCard(doc, 48, y, 156, "Plan pages", String(input.pdfDocument.numPages));
  drawMetricCard(doc, 218, y, 156, "Electrical locations", String(includedDevices.length));
  drawMetricCard(doc, 388, y, 156, "Rooms shown", String(new Set(includedDevices.map((device) => device.roomId).filter(Boolean)).size));
  y += 74;

  y = drawPdfSectionTitle(doc, "Plan legend - what is shown", y);
  const deviceGroups = summarizeCustomerDevices(includedDevices);
  if (deviceGroups.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...PDF_MUTED);
    doc.text("No included electrical locations have been placed yet.", 48, y);
    y += 22;
  } else {
    for (const group of deviceGroups) {
      if (y > 650) {
        addCustomerSummaryPage(doc, input.projectName, "Electrical Plan Proposal - continued");
        y = 104;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...PDF_GREEN);
      doc.text(group.title.toUpperCase(), 48, y);
      y += 18;
      for (const row of group.rows) {
        if (y > 680) {
          addCustomerSummaryPage(doc, input.projectName, "Electrical Plan Proposal - continued");
          y = 104;
        }
        drawLegendMarker(doc, 55, y - 3, row.symbol);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(...PDF_DARK);
        doc.text(row.name, 76, y, { maxWidth: 350 });
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...PDF_MUTED);
        doc.text(`${row.count} ${row.count === 1 ? "location" : "locations"}`, 544, y, { align: "right" });
        y += 20;
      }
      y += 5;
    }
  }

  if (y > 610) {
    addCustomerSummaryPage(doc, input.projectName, "Electrical Plan Proposal - continued");
    y = 104;
  }
  y += 14;
  doc.setFillColor(247, 249, 248);
  doc.setDrawColor(...PDF_LINE);
  doc.roundedRect(48, y, 516, 66, 7, 7, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...PDF_DARK);
  doc.text("Important planning note", 62, y + 20);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...PDF_MUTED);
  const note = doc.splitTextToSize(
    "This is a planning illustration, not a permit or construction drawing. Final locations and specifications may change after site conditions, applicable electrical codes, and customer selections are confirmed.",
    488,
  );
  doc.text(note, 62, y + 37);

  for (let pageNumber = 1; pageNumber <= input.pdfDocument.numPages; pageNumber += 1) {
    const page = await input.pdfDocument.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.65 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Your browser could not prepare the plan image for export.");
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    annotateCustomerPlanCanvas(canvas, pageNumber, input.rooms, input.devices, input.connections);

    doc.addPage("letter", "landscape");
    drawPlanPdfPage(doc, input.projectName, pageNumber, input.pdfDocument.numPages, canvas);
  }

  addCustomerPdfFooters(doc);
  doc.setProperties({
    title: `${input.projectName} - Electrical Plan Proposal`,
    subject: "Customer electrical plan overview",
    creator: "Pack Ops",
  });
  if (download && window.location.hostname === "localhost") {
    document.querySelector("#customer-pdf-preview")?.remove();
    const previewLink = document.createElement("a");
    previewLink.id = "customer-pdf-preview";
    previewLink.href = doc.output("bloburi").toString();
    previewLink.target = "_blank";
    previewLink.textContent = "Open generated PDF preview";
    previewLink.style.position = "fixed";
    previewLink.style.right = "16px";
    previewLink.style.bottom = "16px";
    previewLink.style.zIndex = "1000";
    previewLink.style.padding = "10px 12px";
    previewLink.style.borderRadius = "8px";
    previewLink.style.background = "#172033";
    previewLink.style.color = "#fff";
    previewLink.style.fontWeight = "700";
    document.body.append(previewLink);
  }
  if (download) doc.save(`${safeFileBaseName(input.projectName || "electrical-plan")}.customer-plan.pdf`);
  return doc.output("blob");
}

function drawCustomerPdfHeader(doc: jsPDF, projectName: string, title: string, preparedDate: string): number {
  doc.setFillColor(...PDF_GREEN);
  doc.rect(0, 0, 612, 92, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("PACK OPS", 48, 29);
  doc.setFontSize(24);
  doc.text(title, 48, 58);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Prepared ${preparedDate}`, 564, 29, { align: "right" });
  doc.text(projectName, 564, 58, { align: "right", maxWidth: 205 });
  return 122;
}

function addCustomerSummaryPage(doc: jsPDF, projectName: string, title: string) {
  doc.addPage("letter", "portrait");
  drawCustomerPdfHeader(doc, projectName, title, "");
}

function drawMetricCard(doc: jsPDF, x: number, y: number, width: number, label: string, value: string) {
  doc.setFillColor(247, 249, 248);
  doc.setDrawColor(...PDF_LINE);
  doc.roundedRect(x, y, width, 56, 7, 7, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...PDF_GREEN);
  doc.text(value, x + 12, y + 25);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_MUTED);
  doc.text(label, x + 12, y + 43);
}

function drawPdfSectionTitle(doc: jsPDF, title: string, y: number): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...PDF_DARK);
  doc.text(title, 48, y);
  doc.setDrawColor(...PDF_LINE);
  doc.line(48, y + 7, 564, y + 7);
  return y + 28;
}

function drawLegendMarker(doc: jsPDF, x: number, y: number, symbol: string) {
  doc.setFillColor(...PDF_GREEN);
  doc.circle(x, y, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(symbol.length > 3 ? 5 : 6.5);
  doc.setTextColor(255, 255, 255);
  doc.text(symbol.slice(0, 5), x, y + 2, { align: "center" });
}

function summarizeCustomerDevices(devices: ElectricalDevice[]) {
  const groups = new Map<string, Map<string, { name: string; symbol: string; count: number }>>();
  for (const device of devices) {
    const catalogItem = DEVICE_CATALOG.find((item) => item.id === device.catalogItemId);
    if (!catalogItem || device.inclusionStatus !== "included" || catalogItem.id === "floor-riser") continue;
    const groupTitle = customerDeviceGroup(catalogItem);
    const groupRows = groups.get(groupTitle) ?? new Map();
    const current = groupRows.get(catalogItem.id);
    if (current) current.count += 1;
    else groupRows.set(catalogItem.id, { name: customerFriendlyDeviceName(catalogItem), symbol: catalogItem.symbol, count: 1 });
    groups.set(groupTitle, groupRows);
  }
  const order = ["Switches and controls", "Light fixtures and fans", "Outlets", "Safety devices", "Dedicated circuits and appliances", "Data and TV", "Panels and service", "Other"];
  return order
    .map((title) => ({ title, rows: [...(groups.get(title)?.values() ?? [])].sort((a, b) => a.name.localeCompare(b.name)) }))
    .filter((group) => group.rows.length > 0);
}

function customerFriendlyDeviceName(item: DeviceCatalogItem): string {
  const replacements: Record<string, string> = {
    "15A receptacle": "Standard wall outlet",
    "20A receptacle": "Heavy-duty wall outlet",
    "1-pole switch": "Standard light switch",
    "3-way switch": "Light switch controlled from two locations",
    "4-way switch": "Light switch controlled from three or more locations",
    "GFCI receptacle": "Safety-protected outlet (GFCI)",
    "Exterior weather-rated GFCI receptacle": "Weatherproof outdoor outlet",
    "Ceiling light": "Light fixture",
  };
  return replacements[item.name] ?? item.name;
}

function customerDeviceGroup(item: DeviceCatalogItem): string {
  if (item.category === "Controls") return "Switches and controls";
  if (item.category === "Lighting") return "Light fixtures and fans";
  if (item.category === "Receptacles") return "Outlets";
  if (item.category === "Life safety") return "Safety devices";
  if (item.category === "Dedicated circuits" || item.category === "Appliance") return "Dedicated circuits and appliances";
  if (item.category === "Low voltage") return "Data and TV";
  if (item.category === "Service") return "Panels and service";
  return "Other";
}

function annotateCustomerPlanCanvas(
  canvas: HTMLCanvasElement,
  pageNumber: number,
  rooms: Room[],
  devices: ElectricalDevice[],
  connections: DeviceConnection[],
) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const planHeight = (canvas.height / canvas.width) * OVERLAY_SIZE;
  const scaleX = canvas.width / OVERLAY_SIZE;
  const scaleY = canvas.height / planHeight;
  const pageRooms = rooms.filter((room) => room.pdfPageNumber === pageNumber && room.status !== "ignored");
  const pageDevices = devices.filter(
    (device) => device.pdfPageNumber === pageNumber && device.inclusionStatus === "included" && device.catalogItemId !== "floor-riser",
  );
  const pageDeviceIds = new Set(pageDevices.map((device) => device.id));

  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.setLineDash([10, 8]);
  context.strokeStyle = "rgba(15, 109, 95, 0.72)";
  context.lineWidth = Math.max(2, canvas.width / 520);
  for (const connection of connections) {
    if (connection.pdfPageNumber !== pageNumber || !pageDeviceIds.has(connection.sourceDeviceId) || !pageDeviceIds.has(connection.targetDeviceId)) continue;
    const source = pageDevices.find((device) => device.id === connection.sourceDeviceId);
    const target = pageDevices.find((device) => device.id === connection.targetDeviceId);
    if (!source || !target) continue;
    context.beginPath();
    context.moveTo(source.position.x * scaleX, source.position.y * scaleY);
    context.lineTo(target.position.x * scaleX, target.position.y * scaleY);
    context.stroke();
  }
  context.setLineDash([]);

  for (const room of pageRooms) {
    if (room.polygon && room.polygon.length >= 3) {
      context.beginPath();
      room.polygon.forEach((point, index) => {
        const x = point.x * scaleX;
        const y = point.y * scaleY;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.closePath();
      context.fillStyle = "rgba(15, 109, 95, 0.055)";
      context.strokeStyle = "rgba(15, 109, 95, 0.42)";
      context.lineWidth = Math.max(1.5, canvas.width / 750);
      context.fill();
      context.stroke();
    }
    drawCanvasLabel(context, room.roomName, room.marker.x * scaleX, room.marker.y * scaleY - Math.max(18, canvas.width / 70));
  }

  const markerRadius = Math.max(12, Math.min(20, canvas.width / 70));
  for (const device of pageDevices) {
    const catalogItem = DEVICE_CATALOG.find((item) => item.id === device.catalogItemId);
    if (!catalogItem) continue;
    const x = device.position.x * scaleX;
    const y = device.position.y * scaleY;
    context.beginPath();
    context.arc(x, y, markerRadius, 0, Math.PI * 2);
    context.fillStyle = "#0f6d5f";
    context.fill();
    context.strokeStyle = "#ffffff";
    context.lineWidth = Math.max(2, markerRadius * 0.18);
    context.stroke();
    context.fillStyle = "#ffffff";
    context.font = `800 ${Math.max(8, markerRadius * (catalogItem.symbol.length > 3 ? 0.52 : 0.68))}px Arial, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(catalogItem.symbol.slice(0, 5), x, y + 0.5);
  }
  context.restore();
}

function drawCanvasLabel(context: CanvasRenderingContext2D, text: string, x: number, y: number) {
  const label = text.trim();
  if (!label) return;
  const fontSize = Math.max(10, context.canvas.width / 95);
  context.font = `700 ${fontSize}px Arial, sans-serif`;
  const width = context.measureText(label).width + 14;
  const height = fontSize + 9;
  context.fillStyle = "rgba(255, 255, 255, 0.9)";
  context.strokeStyle = "rgba(15, 109, 95, 0.45)";
  context.lineWidth = 1.5;
  context.beginPath();
  context.roundRect(x - width / 2, y - height / 2, width, height, 5);
  context.fill();
  context.stroke();
  context.fillStyle = "#0a4f45";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, x, y);
}

function drawPlanPdfPage(doc: jsPDF, projectName: string, pageNumber: number, totalPages: number, canvas: HTMLCanvasElement) {
  const pageWidth = 792;
  const pageHeight = 612;
  doc.setFillColor(...PDF_GREEN);
  doc.rect(0, 0, pageWidth, 48, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(projectName, 36, 29, { maxWidth: 500 });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Annotated plan | Page ${pageNumber} of ${totalPages}`, 756, 29, { align: "right" });

  const availableWidth = 720;
  const availableHeight = 492;
  const imageScale = Math.min(availableWidth / canvas.width, availableHeight / canvas.height);
  const imageWidth = canvas.width * imageScale;
  const imageHeight = canvas.height * imageScale;
  const imageX = (pageWidth - imageWidth) / 2;
  const imageY = 61 + (availableHeight - imageHeight) / 2;
  doc.setDrawColor(...PDF_LINE);
  doc.rect(imageX - 1, imageY - 1, imageWidth + 2, imageHeight + 2);
  doc.addImage(canvas.toDataURL("image/jpeg", 0.9), "JPEG", imageX, imageY, imageWidth, imageHeight, undefined, "FAST");

  doc.setFillColor(247, 249, 248);
  doc.rect(0, 564, pageWidth, 48, "F");
  drawLegendMarker(doc, 48, 583, "IN");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_DARK);
  doc.text("Included electrical location", 62, 586);
  doc.setTextColor(...PDF_MUTED);
  doc.text("Dashed lines show linked controls. See the symbol legend on page 1.", 260, 586);
}

function addCustomerPdfFooters(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    doc.setPage(pageNumber);
    const isLandscape = doc.internal.pageSize.getWidth() > doc.internal.pageSize.getHeight();
    if (isLandscape) continue;
    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...PDF_LINE);
    doc.line(48, height - 34, width - 48, height - 34);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...PDF_MUTED);
    doc.text("Electrical Plan Proposal | Prepared with Pack Ops", 48, height - 20);
    doc.text(`Page ${pageNumber} of ${pageCount}`, width - 48, height - 20, { align: "right" });
  }
}

function PlanSymbol({ id, selected }: { id: string; selected: boolean }) {
  const stroke = selected ? "#fff" : "#0a4f45";
  const fill = selected ? "#0a4f45" : "#fff";
  const text = { fill: stroke, stroke: "none", fontSize: 11, fontWeight: 800, textAnchor: "middle" as const };
  const common = { fill, stroke, strokeWidth: 2.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, vectorEffect: "non-scaling-stroke" as const };

  if (id.includes("gfci") || id.includes("weather")) return <g {...common}><circle r="15" /><path d="M-7 -8 V8 M7 -8 V8 M-12 0 H12" /><text x="0" y="28" {...text}>GFI</text></g>;
  if (id.includes("20a")) return <g {...common}><circle r="15" /><path d="M-7 -8 V8 M7 -8 V8 M-12 0 H12" /><text x="0" y="5" {...text}>20</text></g>;
  if (id.includes("switch") || id.includes("dimmer")) {
    const label = id.includes("3-way") ? "S3" : id.includes("4-way") ? "S4" : id.includes("dimmer") ? "SD" : id.includes("motion") ? "SM" : "S1";
    return (
      <g {...common}>
        <rect x="-13" y="-10" width="26" height="20" rx="4" />
        <text x="0" y="4" {...text}>{label}</text>
      </g>
    );
  }
  if (id.includes("ceiling-light")) return <g {...common}><circle r="15" /><path d="M-10 -10 L10 10 M10 -10 L-10 10" /></g>;
  if (id.includes("pot-light")) return <g {...common}><circle r="15" /><circle r="8" fill="none" /></g>;
  if (id.includes("smoke")) return <g {...common}><circle r="16" /><text x="0" y="5" {...text}>SA</text></g>;
  if (id.includes("co-alarm")) return <g {...common}><circle r="16" /><text x="0" y="5" {...text}>CO</text></g>;
  if (id.includes("bathroom-fan")) return <g {...common}><rect x="-14" y="-14" width="28" height="28" rx="3" /><path d="M0 -9 C8 -6 8 6 0 9 C-8 6 -8 -6 0 -9Z" fill="none" /></g>;
  if (id.includes("data")) return <g {...common}><rect x="-14" y="-10" width="28" height="20" rx="3" /><text x="0" y="26" {...text}>D</text></g>;
  if (id.includes("tv")) return <g {...common}><rect x="-14" y="-10" width="28" height="20" rx="3" /><text x="0" y="4" {...text}>TV</text></g>;
  if (id === "100a-subpanel") return <g {...common}><rect x="-18" y="-20" width="36" height="40" rx="2" /><path d="M-9 -9 H9 M-9 0 H9 M-9 9 H9" /><text x="0" y="34" {...text}>100A</text></g>;
  if (isCircuitLoadDevice(id)) {
    const label = DEVICE_CATALOG.find((item) => item.id === id)?.symbol ?? "C";
    return <g {...common}><rect x="-17" y="-13" width="34" height="26" rx="4" /><text x="0" y="4" {...text}>{label}</text></g>;
  }
  if (id.includes("range")) return <g {...common}><rect x="-15" y="-15" width="30" height="30" rx="4" /><text x="0" y="5" {...text}>R</text></g>;
  if (id.includes("dryer")) return <g {...common}><rect x="-15" y="-15" width="30" height="30" rx="4" /><text x="0" y="5" {...text}>DR</text></g>;
  if (id.includes("heat-pump")) return <g {...common}><rect x="-16" y="-15" width="32" height="30" rx="4" /><text x="0" y="4" {...text}>HP</text></g>;
  if (id.includes("floor-riser")) return <g {...common}><path d="M0 -17 L15 9 H5 V17 H-5 V9 H-15Z" /><text x="0" y="32" {...text}>RIS</text></g>;
  if (id.includes("panel")) return <g {...common}><rect x="-15" y="-18" width="30" height="36" rx="2" /><path d="M-8 -8 H8 M-8 0 H8 M-8 8 H8" /></g>;
  return <g {...common}><circle r="15" /><path d="M-7 -8 V8 M7 -8 V8 M-12 0 H12" /></g>;
}

function BoxGroupSymbol({ devices, selectedDeviceId, onDeviceClick }: { devices: ElectricalDevice[]; selectedDeviceId: string | null; onDeviceClick: (device: ElectricalDevice) => void }) {
  const labels = devices.map((device) => DEVICE_CATALOG.find((item) => item.id === device.catalogItemId)?.symbol ?? "?");
  const width = Math.max(34, labels.length * 20 + 10);
  const left = -width / 2;
  const selected = devices.some((device) => device.id === selectedDeviceId);
  const stroke = selected ? "#fff" : "#334155";
  const fill = selected ? "#334155" : "#fff";
  const textFill = selected ? "#fff" : "#172033";

  return (
    <g>
      <rect
        x={left}
        y="-13"
        width={width}
        height="26"
        rx="5"
        fill={fill}
        stroke={stroke}
        strokeWidth="2.4"
        vectorEffect="non-scaling-stroke"
      />
      {labels.map((label, index) => {
        const x = left + 10 + index * 20;
        const device = devices[index];
        const isSelectedGang = device?.id === selectedDeviceId;
        return (
          <g key={`${label}-${index}`}>
            {index > 0 ? <path d={`M ${x - 10} -10 V 10`} stroke={stroke} strokeWidth="1.4" vectorEffect="non-scaling-stroke" /> : null}
            {isSelectedGang ? <rect x={x - 9} y="-10" width="18" height="20" rx="3" fill="#0f6d5f" stroke="none" /> : null}
            <text x={x} y="4" textAnchor="middle" fill={isSelectedGang ? "#fff" : textFill} fontSize="9" fontWeight="900" stroke="none">
              {label}
            </text>
            {device ? (
              <rect
                x={x - 10}
                y="-13"
                width="20"
                height="26"
                fill="transparent"
                onClick={(event) => {
                  event.stopPropagation();
                  onDeviceClick(device);
                }}
              />
            ) : null}
          </g>
        );
      })}
      <text x={width / 2 + 8} y="-10" textAnchor="middle" className="gang-mini-label" fontSize="8">
        {labels.length}G
      </text>
    </g>
  );
}

function DraftScaleLine({ points: scalePoints }: { points: Point[] }) {
  const [start, end] = scalePoints;
  if (!start || !end) return null;
  return <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} className="scale-line draft-scale" />;
}

function SelectedWireRun({ run, devices, currentPageNumber, symbolScale }: { run: CircuitRun; devices: ElectricalDevice[]; currentPageNumber: number; symbolScale: number }) {
  const segments = selectedWireSegments(run.routeDeviceIds, devices, currentPageNumber);
  const start = segments[0]?.[0];
  if (!start) return null;
  return (
    <g>
      {segments.map((segment, index) => (
        <polyline key={index} points={points(rightAnglePathPoints(segment))} className="selected-wire-run" />
      ))}
      <SelectedRiserJumps routeDeviceIds={run.routeDeviceIds} devices={devices} currentPageNumber={currentPageNumber} symbolScale={symbolScale} />
      <text x={start.x} y={start.y - 12 * symbolScale} className="selected-wire-label" fontSize={12 * symbolScale}>
        {run.wireType}
      </text>
    </g>
  );
}

function SelectedWireLine({ line, devices, currentPageNumber, symbolScale }: { line: WireBreakdownLine; devices: ElectricalDevice[]; currentPageNumber: number; symbolScale: number }) {
  const pageRoutes = line.routeDeviceIdsList.flatMap((routeIds) => selectedWireSegments(routeIds, devices, currentPageNumber));
  const labelPoint = pageRoutes[0]?.[0];
  const hasRiserJumps = line.routeDeviceIdsList.some((routeIds) => linkedRiserJumps(routeIds, devices, currentPageNumber).length > 0);
  if (!pageRoutes.length && !hasRiserJumps) return null;
  return (
    <g>
      {pageRoutes.map((route, index) => (
        <polyline key={index} points={points(rightAnglePathPoints(route))} className="selected-wire-run" />
      ))}
      {line.routeDeviceIdsList.map((routeIds, index) => (
        <SelectedRiserJumps key={index} routeDeviceIds={routeIds} devices={devices} currentPageNumber={currentPageNumber} symbolScale={symbolScale} />
      ))}
      {labelPoint ? (
        <text x={labelPoint.x} y={labelPoint.y - 12 * symbolScale} className="selected-wire-label" fontSize={12 * symbolScale}>
          {line.wireType}
        </text>
      ) : null}
    </g>
  );
}

function selectedWireSegments(routeDeviceIds: string[], devices: ElectricalDevice[], currentPageNumber: number): Point[][] {
  const routeDevices = routeDeviceIds
    .map((id) => devices.find((device) => device.id === id))
    .filter((device): device is ElectricalDevice => Boolean(device));
  const segments: Point[][] = [];
  let currentSegment: Point[] = [];

  routeDevices.forEach((device, index) => {
    const previousDevice = index > 0 ? routeDevices[index - 1] : null;
    if (previousDevice && isLinkedRiserPair(previousDevice, device)) {
      if (currentSegment.length >= 2) segments.push(currentSegment);
      currentSegment = device.pdfPageNumber === currentPageNumber ? [device.position] : [];
      return;
    }
    if (device.pdfPageNumber !== currentPageNumber) {
      if (currentSegment.length >= 2) segments.push(currentSegment);
      currentSegment = [];
      return;
    }
    currentSegment.push(device.position);
  });

  if (currentSegment.length >= 2) segments.push(currentSegment);
  return segments;
}

function SelectedRiserJumps({ routeDeviceIds, devices, currentPageNumber, symbolScale }: { routeDeviceIds: string[]; devices: ElectricalDevice[]; currentPageNumber: number; symbolScale: number }) {
  const jumps = linkedRiserJumps(routeDeviceIds, devices, currentPageNumber);
  return (
    <g>
      {jumps.map(([source, target]) => {
        const mid = { x: (source.position.x + target.position.x) / 2, y: (source.position.y + target.position.y) / 2 };
        return (
          <g key={`${source.id}-${target.id}`}>
            <line x1={source.position.x} y1={source.position.y} x2={target.position.x} y2={target.position.y} className="selected-riser-jump" />
            <text x={mid.x} y={mid.y - 8 * symbolScale} textAnchor="middle" className="selected-wire-label" fontSize={11 * symbolScale}>
              riser jump
            </text>
          </g>
        );
      })}
    </g>
  );
}

function linkedRiserJumps(routeDeviceIds: string[], devices: ElectricalDevice[], currentPageNumber: number): Array<[ElectricalDevice, ElectricalDevice]> {
  const routeDevices = routeDeviceIds
    .map((id) => devices.find((device) => device.id === id))
    .filter((device): device is ElectricalDevice => Boolean(device));
  const jumps: Array<[ElectricalDevice, ElectricalDevice]> = [];
  for (let index = 0; index < routeDevices.length - 1; index += 1) {
    const source = routeDevices[index];
    const target = routeDevices[index + 1];
    if (source && target && source.pdfPageNumber === currentPageNumber && target.pdfPageNumber === currentPageNumber && isLinkedRiserPair(source, target)) {
      jumps.push([source, target]);
    }
  }
  return jumps;
}

function textItemToRoom(item: unknown, pageWidth: number, pageHeight: number, overlayHeight: number): Omit<Room, "id" | "planPageId" | "pdfPageNumber" | "floorLevel" | "status" | "detectedBy"> | null {
  if (!isTextItem(item)) return null;
  const value = item.str.trim().replace(/\s+/g, " ");
  const match = ROOM_LABELS.find((entry) => entry.pattern.test(value));
  if (!match) return null;
  const [, , , , x, y] = item.transform;
  return {
    roomName: titleCase(value),
    roomType: match.roomType,
    marker: {
      x: clamp((x / pageWidth) * OVERLAY_SIZE, 0, OVERLAY_SIZE),
      y: clamp(((pageHeight - y) / pageHeight) * overlayHeight, 0, overlayHeight)
    }
  };
}

function isTextItem(value: unknown): value is { str: string; transform: [number, number, number, number, number, number] } {
  const item = value as { str?: unknown; transform?: unknown };
  return typeof item?.str === "string" && Array.isArray(item.transform) && item.transform.length >= 6;
}

function centroid(pointsList: Point[]): Point {
  return {
    x: pointsList.reduce((sum, point) => sum + point.x, 0) / pointsList.length,
    y: pointsList.reduce((sum, point) => sum + point.y, 0) / pointsList.length
  };
}

function nearestRoomFor(point: Point, rooms: Room[]): Room | null {
  return rooms.map((room) => ({ room, distance: Math.hypot(room.marker.x - point.x, room.marker.y - point.y) })).filter((row) => row.distance < 90).sort((a, b) => a.distance - b.distance)[0]?.room ?? null;
}

function distance(start: Point, end: Point): number {
  return Math.hypot(end.x - start.x, end.y - start.y);
}

function rightAngleDistance(start: Point, end: Point): number {
  return Math.abs(end.x - start.x) + Math.abs(end.y - start.y);
}

function feetPerPlanUnitForPage(planScales: PlanScale[], pdfPageNumber: number): number | null {
  const scale = planScales.find((item) => item.pdfPageNumber === pdfPageNumber && item.planPageId === `pdf-page-${pdfPageNumber}`);
  if (!scale) return null;
  const scaleDistance = distance(scale.points[0], scale.points[1]);
  if (!Number.isFinite(scaleDistance) || !Number.isFinite(scale.knownLengthFeet) || scaleDistance <= 0 || scale.knownLengthFeet <= 0) return null;
  return scale.knownLengthFeet / scaleDistance;
}

function points(pointsList: Point[]): string {
  return pointsList.map((point) => `${point.x},${point.y}`).join(" ");
}

function rightAnglePathPoints(pointsList: Point[]): Point[] {
  if (pointsList.length < 2) return pointsList;
  const first = pointsList[0];
  if (!first) return [];
  const path: Point[] = [first];
  for (let index = 0; index < pointsList.length - 1; index += 1) {
    const source = pointsList[index];
    const target = pointsList[index + 1];
    if (!source || !target) continue;
    path.push({ x: target.x, y: source.y }, target);
  }
  return path;
}

function roomKey(name: string, marker: Point): string {
  return `${name.toLowerCase()}-${Math.round(marker.x / 20)}-${Math.round(marker.y / 20)}`;
}

function isSwitchDevice(catalogItemId: string): boolean {
  return catalogItemId.includes("switch") || catalogItemId.includes("dimmer");
}

function isAutoSwitchDevice(catalogItemId: string): boolean {
  return AUTO_SWITCH_IDS.has(catalogItemId);
}

function normalizeAutomaticSwitchTypes(devices: ElectricalDevice[], connections: DeviceConnection[]): ElectricalDevice[] {
  const switchRoleById = new Map<string, AutoSwitchCatalogItemId>();
  const switchPriority: Record<AutoSwitchCatalogItemId, number> = { "switch": 1, "3-way-switch": 2, "4-way-switch": 3 };
  const devicesById = new Map(devices.map((device) => [device.id, device]));
  const lightIds = new Set(devices.filter((device) => isLightOrFanDevice(device.catalogItemId)).map((device) => device.id));
  const visitedLightIds = new Set<string>();

  for (const lightId of lightIds) {
    if (visitedLightIds.has(lightId)) continue;
    const lightingRunIds = new Set<string>();
    const switchIds = new Set<string>();
    const queue = [lightId];

    while (queue.length) {
      const currentLightId = queue.shift();
      if (!currentLightId || visitedLightIds.has(currentLightId)) continue;
      visitedLightIds.add(currentLightId);
      lightingRunIds.add(currentLightId);

      connections.forEach((connection) => {
        const neighborId = connection.sourceDeviceId === currentLightId ? connection.targetDeviceId : connection.targetDeviceId === currentLightId ? connection.sourceDeviceId : null;
        if (!neighborId) return;
        const neighbor = devicesById.get(neighborId);
        if (!neighbor) return;
        if (isLightOrFanDevice(neighbor.catalogItemId) && !visitedLightIds.has(neighbor.id)) {
          queue.push(neighbor.id);
        }
        if (isAutoSwitchDevice(neighbor.catalogItemId)) {
          switchIds.add(neighbor.id);
        }
      });
    }

    if (lightingRunIds.size === 0) continue;
    const orderedSwitchIds = devices.filter((device) => switchIds.has(device.id)).map((device) => device.id);
    orderedSwitchIds.forEach((switchId, index) => {
      const nextRole: AutoSwitchCatalogItemId = orderedSwitchIds.length === 1 ? "switch" : index < 2 ? "3-way-switch" : "4-way-switch";
      const currentRole = switchRoleById.get(switchId) ?? "switch";
      if (switchPriority[nextRole] > switchPriority[currentRole]) {
        switchRoleById.set(switchId, nextRole);
      }
    });
  }

  let changed = false;
  const normalized = devices.map((device) => {
    if (!isAutoSwitchDevice(device.catalogItemId)) return device;
    const nextCatalogItemId = switchRoleById.get(device.id) ?? "switch";
    if (device.catalogItemId === nextCatalogItemId) return device;
    changed = true;
    return { ...device, catalogItemId: nextCatalogItemId };
  });

  return changed ? normalized : devices;
}

function isBoxDevice(catalogItemId: string): boolean {
  const item = DEVICE_CATALOG.find((catalogItem) => catalogItem.id === catalogItemId);
  return isSwitchDevice(catalogItemId) || item?.category === "Receptacles";
}

function canStartConnection(catalogItemId: string): boolean {
  return isSwitchDevice(catalogItemId) || isLightOrFanDevice(catalogItemId) || isLightingCircuitReceptacle(catalogItemId) || isHeatingControlDevice(catalogItemId);
}

function canConnectDevices(sourceCatalogItemId: string, targetCatalogItemId: string): boolean {
  const sourceIsLight = isLightOrFanDevice(sourceCatalogItemId);
  const targetIsLight = isLightOrFanDevice(targetCatalogItemId);
  const sourceIsSwitch = isSwitchDevice(sourceCatalogItemId);
  const targetIsSwitch = isSwitchDevice(targetCatalogItemId);
  const sourceIsLightingReceptacle = isLightingCircuitReceptacle(sourceCatalogItemId);
  const targetIsLightingReceptacle = isLightingCircuitReceptacle(targetCatalogItemId);
  const sourceIsHeatingControl = isHeatingControlDevice(sourceCatalogItemId);
  const targetIsHeatingControl = isHeatingControlDevice(targetCatalogItemId);

  return (
    (sourceIsSwitch && targetIsLight) ||
    (sourceIsLight && targetIsSwitch) ||
    (sourceIsLight && targetIsLight) ||
    (sourceIsLightingReceptacle && (targetIsLight || targetIsSwitch || targetIsLightingReceptacle)) ||
    (targetIsLightingReceptacle && (sourceIsLight || sourceIsSwitch || sourceIsLightingReceptacle)) ||
    (sourceIsHeatingControl && targetIsHeatingControl && (sourceCatalogItemId === "baseboard-thermostat") !== (targetCatalogItemId === "baseboard-thermostat"))
  );
}

function nextConnectionAnchorId(source: ElectricalDevice, target: ElectricalDevice): string {
  if (isLightOrFanDevice(source.catalogItemId) && isAutoSwitchDevice(target.catalogItemId)) return source.id;
  if (source.catalogItemId === "baseboard-thermostat" && isHeaterDevice(target.catalogItemId)) return source.id;
  if (target.catalogItemId === "baseboard-thermostat" && isHeaterDevice(source.catalogItemId)) return target.id;
  return target.id;
}

function isLightOrFanDevice(catalogItemId: string): boolean {
  return (
    catalogItemId.includes("light") ||
    catalogItemId.includes("pot-light") ||
    catalogItemId.includes("bathroom-fan")
  );
}

function isLightingCircuitReceptacle(catalogItemId: string): boolean {
  return catalogItemId === "15a-receptacle" || catalogItemId === "gfci-receptacle";
}

function isLightingCircuitDevice(catalogItemId: string): boolean {
  return isSwitchDevice(catalogItemId) || isLightOrFanDevice(catalogItemId) || isLightingCircuitReceptacle(catalogItemId);
}

function isHeaterDevice(id: string): boolean {
  return id === "baseboard-heater" || id === "wall-fan-heater";
}

function assignHeaterThermostat(connections: DeviceConnection[], heater: ElectricalDevice, thermostatId: string): DeviceConnection[] {
  const remaining = connections.filter((line) => line.sourceDeviceId !== heater.id && line.targetDeviceId !== heater.id);
  return thermostatId ? [...remaining, { id: crypto.randomUUID(), planPageId: heater.planPageId, pdfPageNumber: heater.pdfPageNumber, sourceDeviceId: thermostatId, targetDeviceId: heater.id }] : remaining;
}

function isHeatingControlDevice(catalogItemId: string): boolean {
  return catalogItemId === "baseboard-thermostat" || isHeaterDevice(catalogItemId);
}

function isBaseboardHeatingDevice(catalogItemId: string): boolean {
  return catalogItemId === "baseboard-thermostat" || isHeaterDevice(catalogItemId);
}

function isDeviceFedByLightingCircuit(device: ElectricalDevice, devices: ElectricalDevice[], connections: DeviceConnection[]): boolean {
  if (!isLightingCircuitReceptacle(device.catalogItemId)) return false;
  const devicesById = new Map(devices.map((item) => [item.id, item]));
  const visited = new Set<string>();
  const queue = [device.id];

  while (queue.length) {
    const currentId = queue.shift();
    if (!currentId || visited.has(currentId)) continue;
    visited.add(currentId);
    const currentDevice = devicesById.get(currentId);
    if (!currentDevice) continue;
    if (currentId !== device.id && (isLightOrFanDevice(currentDevice.catalogItemId) || isSwitchDevice(currentDevice.catalogItemId))) {
      return true;
    }

    connections.forEach((connection) => {
      const nextId = connection.sourceDeviceId === currentId ? connection.targetDeviceId : connection.targetDeviceId === currentId ? connection.sourceDeviceId : null;
      if (!nextId || visited.has(nextId)) return;
      const nextDevice = devicesById.get(nextId);
      if (nextDevice && isLightingCircuitDevice(nextDevice.catalogItemId)) {
        queue.push(nextId);
      }
    });
  }

  return false;
}

function lightingLoadAmps(catalogItemId: string): number {
  if (catalogItemId === "pot-light") return 0.2;
  if (catalogItemId === "ceiling-light") return 1;
  if (catalogItemId === "bathroom-fan") return 1;
  return 0;
}

function estimateLightingBreakerCount(devices: ElectricalDevice[]): number {
  const totalAmps = devices
    .filter((device) => device.inclusionStatus !== "excluded")
    .reduce((total, device) => total + lightingLoadAmps(device.catalogItemId), 0);
  return totalAmps > 0 ? Math.ceil(totalAmps / 15) : 0;
}

function groupBounds(devices: ElectricalDevice[], symbolScale: number): { x: number; y: number; width: number; height: number } | null {
  if (!devices.length) return null;
  const padding = 22 * symbolScale;
  const xs = devices.map((device) => device.position.x);
  const ys = devices.map((device) => device.position.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    x: minX - padding,
    y: minY - padding,
    width: Math.max(maxX - minX + padding * 2, 42 * symbolScale),
    height: Math.max(maxY - minY + padding * 2, 30 * symbolScale),
  };
}

function boxGroupPath(bounds: { x: number; y: number; width: number; height: number }): string {
  const corner = Math.min(10, bounds.width / 4, bounds.height / 4);
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;
  return [
    `M ${bounds.x + corner} ${bounds.y}`,
    `H ${right - corner}`,
    `M ${bounds.x} ${bounds.y + corner}`,
    `V ${bottom - corner}`,
    `M ${right} ${bounds.y + corner}`,
    `V ${bottom - corner}`,
    `M ${bounds.x + corner} ${bottom}`,
    `H ${right - corner}`,
  ].join(" ");
}

function boundsCenter(bounds: { x: number; y: number; width: number; height: number }): Point {
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
}

function estimateLightingWire(
  devices: ElectricalDevice[],
  connections: DeviceConnection[],
  planScales: PlanScale[],
  wastePercent: number,
): { planFeet: number; allowanceFeet: number; totalFeet: number } | null {
  if (connections.length === 0) return null;
  let planFeet = 0;
  const allowanceDeviceIds = new Set<string>();

  for (const connection of connections) {
    const source = devices.find((device) => device.id === connection.sourceDeviceId);
    const target = devices.find((device) => device.id === connection.targetDeviceId);
    if (!source || !target || source.inclusionStatus === "excluded" || target.inclusionStatus === "excluded") continue;
    if (!isLightingCircuitDevice(source.catalogItemId) || !isLightingCircuitDevice(target.catalogItemId)) continue;
    if (source.pdfPageNumber !== target.pdfPageNumber) continue;
    const feetPerPlanUnit = feetPerPlanUnitForPage(planScales, source.pdfPageNumber);
    if (!feetPerPlanUnit) continue;
    planFeet += rightAngleDistance(source.position, target.position) * feetPerPlanUnit;
    allowanceDeviceIds.add(source.id);
    allowanceDeviceIds.add(target.id);
  }

  if (planFeet <= 0) return null;
  const allowanceFeet = allowanceForDeviceIds(devices, allowanceDeviceIds);
  const subtotal = planFeet + allowanceFeet;
  return {
    planFeet,
    allowanceFeet,
    totalFeet: subtotal * (1 + wastePercent / 100),
  };
}

function estimateTravelerWire(
  devices: ElectricalDevice[],
  connections: DeviceConnection[],
  planScales: PlanScale[],
  wastePercent: number,
): { planFeet: number; allowanceFeet: number; totalFeet: number } | null {
  if (connections.length === 0) return null;
  const switchRuns = lightingSwitchRuns(devices, connections);
  let planFeet = 0;
  const allowanceDeviceIds = new Set<string>();

  for (const switches of switchRuns) {
    const travelerSwitches = switches.filter((device) => device.catalogItemId === "3-way-switch" || device.catalogItemId === "4-way-switch");
    if (travelerSwitches.length < 2) continue;
    const orderedSwitches = orderDevicesByNearestNeighbor(travelerSwitches);
    for (let index = 0; index < orderedSwitches.length - 1; index += 1) {
      const source = orderedSwitches[index];
      const target = orderedSwitches[index + 1];
      if (!source || !target) continue;
      const feetPerPlanUnit = feetPerPlanUnitForPage(planScales, source.pdfPageNumber);
      if (!feetPerPlanUnit) continue;
      planFeet += rightAngleDistance(source.position, target.position) * feetPerPlanUnit;
      allowanceDeviceIds.add(source.id);
      allowanceDeviceIds.add(target.id);
    }
  }

  if (planFeet <= 0) return null;
  const allowanceFeet = allowanceForDeviceIds(devices, allowanceDeviceIds);
  const subtotal = planFeet + allowanceFeet;
  return {
    planFeet,
    allowanceFeet,
    totalFeet: subtotal * (1 + wastePercent / 100),
  };
}

function estimateLifeSafetyAlarmWire(
  devices: ElectricalDevice[],
  planScales: PlanScale[],
  wastePercent: number,
): { planFeet: number; allowanceFeet: number; totalFeet: number } | null {
  const lifeSafetyAlarms = devices.filter((device) => isLifeSafetyInterconnectDevice(device.catalogItemId) && device.inclusionStatus !== "excluded");
  if (lifeSafetyAlarms.length < 2) return null;
  const orderedAlarms = orderDevicesByNearestNeighbor(lifeSafetyAlarms);
  let planFeet = 0;
  const allowanceDeviceIds = new Set<string>();

  for (let index = 0; index < orderedAlarms.length - 1; index += 1) {
    const source = orderedAlarms[index];
    const target = orderedAlarms[index + 1];
    if (!source || !target) continue;
    if (source.pdfPageNumber === target.pdfPageNumber) {
      const feetPerPlanUnit = feetPerPlanUnitForPage(planScales, source.pdfPageNumber);
      if (!feetPerPlanUnit) continue;
      planFeet += rightAngleDistance(source.position, target.position) * feetPerPlanUnit;
    } else {
      planFeet += Math.abs(source.pdfPageNumber - target.pdfPageNumber) * metersToFeet(DEFAULT_RISER_DROP_METERS);
    }
    allowanceDeviceIds.add(source.id);
    allowanceDeviceIds.add(target.id);
  }

  if (planFeet <= 0) return null;
  const allowanceFeet = allowanceForDeviceIds(devices, allowanceDeviceIds);
  const subtotal = planFeet + allowanceFeet;
  return {
    planFeet,
    allowanceFeet,
    totalFeet: subtotal * (1 + wastePercent / 100),
  };
}

function isLifeSafetyInterconnectDevice(catalogItemId: string): boolean {
  return catalogItemId === "smoke-alarm" || catalogItemId === "co-alarm";
}

function buildWireBreakdown(
  devices: ElectricalDevice[],
  connections: DeviceConnection[],
  circuitRuns: CircuitRun[],
  planScales: PlanScale[],
  wastePercent: number,
): WireBreakdownLine[] {
  const lines: WireBreakdownLine[] = [];
  const lighting = estimateLightingWire(devices, connections, planScales, wastePercent);
  if (lighting) {
    lines.push({
      id: "lighting-2c14",
      source: "Lighting branch circuits",
      wireType: "2c14",
      ...lighting,
      deviceIds: lightingCircuitDeviceIds(devices, connections),
      routeDeviceIdsList: lightingCircuitRouteDeviceIds(devices, connections),
    });
  }

  const travelers = estimateTravelerWire(devices, connections, planScales, wastePercent);
  if (travelers) {
    lines.push({
      id: "traveler-3c14",
      source: "S3/S4 travelers",
      wireType: "3c14",
      ...travelers,
      deviceIds: devices.filter((device) => device.catalogItemId === "3-way-switch" || device.catalogItemId === "4-way-switch").map((device) => device.id),
      routeDeviceIdsList: travelerRouteDeviceIds(devices, connections),
    });
  }

  const lifeSafety = estimateLifeSafetyAlarmWire(devices, planScales, wastePercent);
  if (lifeSafety) {
    lines.push({
      id: "life-safety-3c14",
      source: "Smoke/CO interconnect",
      wireType: "3c14",
      ...lifeSafety,
      deviceIds: devices.filter((device) => isLifeSafetyInterconnectDevice(device.catalogItemId)).map((device) => device.id),
      routeDeviceIdsList: lifeSafetyRouteDeviceIds(devices),
    });
  }

  if (planScales.length) {
    const groupedRuns = new Map<string, WireBreakdownLine>();
    circuitRuns.forEach((run) => {
      const runEstimate = estimateCircuitRunWire(run, devices, planScales, wastePercent);
      if (!runEstimate) return;
      const source = circuitRunSourceLabel(run);
      const wireType = normalizeWireType(run.wireType);
      const id = `${source}-${wireType}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const current = groupedRuns.get(id) ?? { id, source, wireType, planFeet: 0, allowanceFeet: 0, totalFeet: 0, deviceIds: [], routeDeviceIdsList: [] };
      current.planFeet += runEstimate.planFeet;
      current.allowanceFeet += runEstimate.allowanceFeet;
      current.totalFeet += runEstimate.totalFeet;
      current.deviceIds.push(...run.deviceIds);
      current.routeDeviceIdsList.push(run.routeDeviceIds);
      groupedRuns.set(id, current);
    });
    lines.push(...groupedRuns.values());
  }

  return lines.filter((line) => line.totalFeet > 0).sort((a, b) => a.source.localeCompare(b.source) || a.wireType.localeCompare(b.wireType));
}

function summarizeWireBreakdown(lines: WireBreakdownLine[]): MaterialLine[] {
  const totals = new Map<string, number>();
  lines.forEach((line) => {
    const wireType = normalizeWireType(line.wireType);
    totals.set(wireType, (totals.get(wireType) ?? 0) + line.totalFeet);
  });
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([item, quantity]) => ({ item, quantity }));
}

function estimateCircuitRunWire(
  run: CircuitRun,
  devices: ElectricalDevice[],
  planScales: PlanScale[],
  wastePercent: number,
): { planFeet: number; allowanceFeet: number; totalFeet: number } | null {
  if (run.path.length < 2) return null;
  let planFeet = 0;
  for (let index = 0; index < run.path.length - 1; index += 1) {
    const source = run.path[index];
    const target = run.path[index + 1];
    if (!source || !target) continue;
    const sourceDevice = devices.find((device) => device.id === run.routeDeviceIds[index]);
    const targetDevice = devices.find((device) => device.id === run.routeDeviceIds[index + 1]);
    if (sourceDevice && targetDevice && sourceDevice.pdfPageNumber !== targetDevice.pdfPageNumber) continue;
    const feetPerPlanUnit = feetPerPlanUnitForPage(planScales, sourceDevice?.pdfPageNumber ?? targetDevice?.pdfPageNumber ?? 1);
    if (!feetPerPlanUnit) return null;
    planFeet += rightAngleDistance(source, target) * feetPerPlanUnit;
  }
  planFeet += crossFloorAllowanceForRun(devices, run);
  const allowanceFeet = allowanceForDeviceIds(devices, new Set(run.deviceIds));
  const totalFeet = (planFeet + allowanceFeet) * (1 + wastePercent / 100);
  return totalFeet > 0 ? { planFeet, allowanceFeet, totalFeet } : null;
}

function circuitRunSourceLabel(run: CircuitRun): string {
  const loadCatalogItemId = run.deviceIds.length > 1 ? run.label : "";
  const label = run.label.toLowerCase();
  if (label.includes("branch circuit")) return "Branch circuits";
  if (label.includes("baseboard") || label.includes("fireplace")) return "Heating circuits";
  if (label.includes("range") || label.includes("dryer") || label.includes("heat pump") || label.includes("hwt") || label.includes("ev")) return "Appliance circuits";
  if (label.includes("subpanel")) return "Panel feeders";
  if (label.includes("counter")) return "Counter receptacles";
  if (label.includes("outdoor") || label.includes("exterior") || label.includes("weather")) return "Exterior receptacles";
  if (label.includes("receptacle")) return "General receptacles";
  if (loadCatalogItemId) return "Dedicated circuits";
  return "Panel runs";
}

function lightingCircuitDeviceIds(devices: ElectricalDevice[], connections: DeviceConnection[]): string[] {
  const connectedIds = new Set<string>();
  connections.forEach((connection) => {
    const source = devices.find((device) => device.id === connection.sourceDeviceId);
    const target = devices.find((device) => device.id === connection.targetDeviceId);
    if (!source || !target) return;
    if (isLightingCircuitDevice(source.catalogItemId) && isLightingCircuitDevice(target.catalogItemId)) {
      connectedIds.add(source.id);
      connectedIds.add(target.id);
    }
  });
  return [...connectedIds];
}

function lightingCircuitRouteDeviceIds(devices: ElectricalDevice[], connections: DeviceConnection[]): string[][] {
  return connections
    .filter((connection) => {
      const source = devices.find((device) => device.id === connection.sourceDeviceId);
      const target = devices.find((device) => device.id === connection.targetDeviceId);
      return source && target && isLightingCircuitDevice(source.catalogItemId) && isLightingCircuitDevice(target.catalogItemId);
    })
    .map((connection) => [connection.sourceDeviceId, connection.targetDeviceId]);
}

function travelerRouteDeviceIds(devices: ElectricalDevice[], connections: DeviceConnection[]): string[][] {
  return lightingSwitchRuns(devices, connections)
    .flatMap((switches) => {
      const orderedSwitches = orderDevicesByNearestNeighbor(switches.filter((device) => device.catalogItemId === "3-way-switch" || device.catalogItemId === "4-way-switch"));
      const routes: string[][] = [];
      for (let index = 0; index < orderedSwitches.length - 1; index += 1) {
        const source = orderedSwitches[index];
        const target = orderedSwitches[index + 1];
        if (source && target) routes.push([source.id, target.id]);
      }
      return routes;
    });
}

function lifeSafetyRouteDeviceIds(devices: ElectricalDevice[]): string[][] {
  const orderedAlarms = orderDevicesByNearestNeighbor(devices.filter((device) => isLifeSafetyInterconnectDevice(device.catalogItemId) && device.inclusionStatus !== "excluded"));
  const routes: string[][] = [];
  for (let index = 0; index < orderedAlarms.length - 1; index += 1) {
    const source = orderedAlarms[index];
    const target = orderedAlarms[index + 1];
    if (source && target) routes.push([source.id, target.id]);
  }
  return routes;
}

function materialSummaryForDevice(
  device: ElectricalDevice,
  devices: ElectricalDevice[],
  connections: DeviceConnection[],
  boxGroups: ElectricalBoxGroup[],
  circuitRuns: CircuitRun[],
  wireBreakdown: WireBreakdownLine[],
): DeviceMaterialSummary {
  const run = circuitRuns.find((item) => item.deviceIds.includes(device.id));
  return {
    title: "Material source",
    details: ["Uses your saved Pack Ops device materials. Review materials in Pack Ops to see quantities.", ...(run ? [`Estimated cable: ${run.wireType}.`] : [])],
    materials: [],
  };
}

function groupMaterialTakeoff(lines: MaterialLine[]): MaterialGroup[] {
  const groups = new Map<string, MaterialLine[]>();
  lines.forEach((line) => {
    const title = materialCategory(line.item);
    const groupLines = groups.get(title) ?? [];
    groupLines.push(line);
    groups.set(title, groupLines);
  });

  return MATERIAL_CATEGORY_ORDER
    .map((title) => ({ title, lines: (groups.get(title) ?? []).sort((a, b) => a.item.localeCompare(b.item)) }))
    .filter((group) => group.lines.length > 0);
}

const MATERIAL_CATEGORY_ORDER = ["Wire", "Breakers", "Boxes & Plates", "Devices & Fixtures", "Connectors & Flex", "Other"];

function materialCategory(item: string): string {
  const value = item.toLowerCase();
  if (value.includes("wire")) return "Wire";
  if (value.includes("breaker")) return "Breakers";
  if (value.includes("box") || value.includes("plate") || value.includes("cover")) return "Boxes & Plates";
  if (value.includes("connector") || value.includes("flex") || value.includes("whip")) return "Connectors & Flex";
  if (value.includes("placeholder")) return "Other";
  return "Devices & Fixtures";
}

function materialCategoryRank(item: string): number {
  const rank = MATERIAL_CATEGORY_ORDER.indexOf(materialCategory(item));
  return rank === -1 ? MATERIAL_CATEGORY_ORDER.length : rank;
}

function estimateLabour(
  devices: ElectricalDevice[],
  boxGroups: ElectricalBoxGroup[],
  circuitRuns: CircuitRun[],
  wireBreakdown: WireBreakdownLine[],
  settings: LabourSettings,
): LabourTakeoff {
  const includedDevices = devices.filter((device) => device.inclusionStatus !== "excluded");
  const lines: LabourLine[] = [];
  const add = (phase: string, item: string, quantity: number) => {
    if (quantity <= 0) return;
    const existing = lines.find((line) => line.phase === phase && line.item === item);
    if (existing) existing.quantity += quantity;
    else lines.push({ phase, item, quantity });
  };
  const count = (predicate: (device: ElectricalDevice) => boolean) => includedDevices.filter(predicate).length;
  const panelCount = count((device) => isPanelDevice(device.catalogItemId));
  const includedBoxIds = new Set(includedDevices.filter((device) => isBoxDevice(device.catalogItemId)).map((device) => device.id));
  const includedGroups = boxGroups.map((group) => ({ ...group, deviceIds: group.deviceIds.filter((id) => includedBoxIds.has(id)) })).filter((group) => group.deviceIds.length > 1);
  const boxGroupDeviceIds = new Set(includedGroups.flatMap((group) => group.deviceIds));
  const singleBoxDeviceCount = count((device) => isBoxDevice(device.catalogItemId) && !boxGroupDeviceIds.has(device.id));
  const groupedBoxCount = includedGroups.length;
  const groupedGangCount = includedGroups.reduce((total, group) => total + group.deviceIds.length, 0);
  const switchCount = count((device) => isSwitchDevice(device.catalogItemId));
  const potCount = count((device) => device.catalogItemId === "pot-light");
  const lightFixtureCount = count((device) => device.catalogItemId === "ceiling-light");
  const fanCount = count((device) => device.catalogItemId === "bathroom-fan");
  const receptacleCount = count((device) => isBoxDevice(device.catalogItemId) && !isSwitchDevice(device.catalogItemId) && DEVICE_CATALOG.find((item) => item.id === device.catalogItemId)?.category === "Receptacles");
  const circuitCount = circuitRuns.length;
  const smokeCount = count((device) => isLifeSafetyInterconnectDevice(device.catalogItemId));
  const difficultWireMeters = wireBreakdown.reduce((total, line) => total + (isDifficultWireType(line.wireType) ? line.totalFeet * FEET_TO_METERS : 0), 0);
  const standardWireMeters = wireBreakdown.reduce((total, line) => total + (!isDifficultWireType(line.wireType) ? line.totalFeet * FEET_TO_METERS : 0), 0);

  add("Setup", "Project setup/coordination", settings.setupHours);
  add("Rough-in", `Single boxes (${singleBoxDeviceCount} x 0.12 hr)`, singleBoxDeviceCount * 0.12);
  add("Rough-in", `Grouped boxes (${groupedBoxCount} boxes + ${groupedGangCount} gangs)`, groupedBoxCount * 0.18 + groupedGangCount * 0.04);
  add("Rough-in", `Pot light rough-in (${potCount} x 0.18 hr)`, potCount * 0.18);
  add("Rough-in", `Ceiling/fan outlet rough-in (${lightFixtureCount + fanCount} x 0.2 hr)`, (lightFixtureCount + fanCount) * 0.2);
  add("Rough-in", `Smoke/CO rough-in (${smokeCount} x 0.15 hr)`, smokeCount * 0.15);
  add("Wire", `Standard wire pulls (${standardWireMeters.toFixed(2)} m x 0.012 hr)`, standardWireMeters * 0.012);
  add("Wire", `Large wire pulls (${difficultWireMeters.toFixed(2)} m x 0.025 hr)`, difficultWireMeters * 0.025);
  add("Circuits", `Circuit home runs/terminations (${circuitCount} x 0.5 hr)`, circuitCount * 0.5);
  add("Panel", `Panels/subpanels (${panelCount} x 8 hr)`, panelCount * 8);
  add("Finish", `Switches (${switchCount} x 0.12 hr)`, switchCount * 0.12);
  add("Finish", `Receptacles (${receptacleCount} x 0.12 hr)`, receptacleCount * 0.12);
  add("Finish", `Pot lights (${potCount} x 0.12 hr)`, potCount * 0.12);
  add("Finish", `Ceiling fixtures (${lightFixtureCount} x 0.33 hr)`, lightFixtureCount * (20 / 60));
  add("Finish", `Fan fixtures (${fanCount} x 0.8 hr)`, fanCount * 0.8);
  add("Finish", `Smoke/CO devices (${smokeCount} x 0.1 hr)`, smokeCount * 0.1);

  const fieldHours = lines.reduce((total, line) => total + line.quantity, 0) - settings.setupHours;
  const multiplier = settings.projectTypeMultiplier * settings.accessMultiplier * settings.ceilingHeightMultiplier;
  add("Modifiers", `Field condition multiplier (${multiplier.toFixed(2)}x)`, Math.max(0, fieldHours * (multiplier - 1)));

  return {
    lines: lines.filter((line) => line.quantity > 0),
    totalHours: lines.reduce((total, line) => total + line.quantity, 0),
  };
}

function isDifficultWireType(wireType: string): boolean {
  const normalized = normalizeWireType(wireType).toLowerCase();
  const gauge = normalized.match(/(?:^|\s)\d+c(\d+)(?:\s|$)/)?.[1] ?? normalized.match(/^(\d+)\//)?.[1];
  return gauge !== undefined && Number(gauge) <= 10;
}

function withWireMaterialLines(materialLines: MaterialLine[], wireBreakdown: WireBreakdownLine[]): MaterialLine[] {
  const quantities = new Map(materialLines.map((line) => [line.item, line.quantity]));
  // One calculation feeds the summary, purchasing list, labour, and export.
  for (const { item, quantity } of summarizeWireBreakdown(wireBreakdown)) {
    quantities.set(`${item} wire (m)`, Math.ceil(quantity * FEET_TO_METERS));
  }
  return [...quantities.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([item, quantity]) => ({ item, quantity }));
}

function normalizeWireType(wireType: string): string {
  const normalized = wireType.trim().toLowerCase().replace(/\s+/g, " ");
  if (normalized === "14/2" || normalized === "2c14") return "2c14";
  if (normalized === "14/3" || normalized === "3c14") return "3c14";
  return wireType.trim();
}

function calculateMaterialTakeoff(devices: ElectricalDevice[], boxGroups: ElectricalBoxGroup[], connections: DeviceConnection[], lightingBreakerCount: number): MaterialLine[] {
  // Device materials belong to the user's saved Pack Ops recipes. The editor
  // contributes measured wire only; never manufacture catalog materials here.
  return [];
}

function verticalAllowanceForDevice(catalogItemId: string): number {
  if (isSwitchDevice(catalogItemId)) return SWITCH_VERTICAL_ALLOWANCE_FEET;
  if (CIRCUIT_WIRE_RULES.some((rule) => rule.catalogItemId === catalogItemId)) {
    return APPLIANCE_VERTICAL_ALLOWANCE_FEET;
  }
  return 0;
}

function allowanceForDeviceIds(devices: ElectricalDevice[], deviceIds: Set<string>): number {
  return devices
    .filter((device) => deviceIds.has(device.id))
    .reduce((total, device) => total + verticalAllowanceForDevice(device.catalogItemId), 0);
}

function crossFloorAllowanceForRun(devices: ElectricalDevice[], run: CircuitRun): number {
  let allowanceFeet = 0;
  const crossPageRiserIds = new Set<string>();
  const linkedRiserPairKeys = new Set<string>();
  const linkedRiserIds = new Set<string>();
  for (let index = 0; index < run.routeDeviceIds.length - 1; index += 1) {
    const source = devices.find((device) => device.id === run.routeDeviceIds[index]);
    const target = devices.find((device) => device.id === run.routeDeviceIds[index + 1]);
    if (!source || !target) continue;
    const risers = [source, target].filter((device) => device.catalogItemId === "floor-riser");
    if (risers.length === 2 && source.linkedRiserId === target.id && target.linkedRiserId === source.id) {
      const pairKey = [source.id, target.id].sort().join(":");
      if (!linkedRiserPairKeys.has(pairKey)) {
        linkedRiserPairKeys.add(pairKey);
        allowanceFeet += Math.max(riserDropFeet(source), riserDropFeet(target));
      }
      crossPageRiserIds.add(source.id);
      crossPageRiserIds.add(target.id);
      linkedRiserIds.add(source.id);
      linkedRiserIds.add(target.id);
      continue;
    }
    if (source.pdfPageNumber === target.pdfPageNumber) continue;
    if (risers.length) {
      allowanceFeet += Math.max(...risers.map((riser) => riserDropFeet(riser)));
      risers.forEach((riser) => crossPageRiserIds.add(riser.id));
    } else {
      allowanceFeet += Math.abs(target.pdfPageNumber - source.pdfPageNumber) * metersToFeet(DEFAULT_RISER_DROP_METERS);
    }
  }
  const samePageRiserIds = new Set<string>();
  run.routeDeviceIds
    .map((id) => devices.find((device) => device.id === id))
    .filter((device): device is ElectricalDevice => Boolean(device))
    .filter((device) => device.catalogItemId === "floor-riser" && !crossPageRiserIds.has(device.id) && !linkedRiserIds.has(device.id))
    .forEach((riser) => {
      if (samePageRiserIds.has(riser.id)) return;
      samePageRiserIds.add(riser.id);
      allowanceFeet += riserDropFeet(riser);
    });
  return allowanceFeet;
}

function isCircuitLoadDevice(catalogItemId: string): boolean {
  return CIRCUIT_WIRE_RULES.some((rule) => rule.catalogItemId === catalogItemId);
}

function countBreakersForRule(
  devices: ElectricalDevice[],
  connections: DeviceConnection[],
  rule: { catalogItemId: string; devicesPerCircuit?: number; interconnect?: boolean },
): number {
  if (rule.catalogItemId === "baseboard-thermostat") {
    return devices.filter((device) => device.catalogItemId === "baseboard-thermostat" && device.inclusionStatus !== "excluded").length;
  }
  if (rule.catalogItemId === "baseboard-heater") {
    return devices.filter((device) =>
      isHeaterDevice(device.catalogItemId) &&
      device.inclusionStatus !== "excluded" &&
      !hasConnectedBaseboardThermostat(device, devices, connections),
    ).length;
  }
  const loads = devices.filter((device) =>
    device.catalogItemId === rule.catalogItemId &&
    device.inclusionStatus !== "excluded" &&
    !isDeviceFedByLightingCircuit(device, devices, connections),
  );
  if (!loads.length) return 0;
  if (!rule.interconnect) return loads.length;

  const panels = devices.filter((device) => isPanelDevice(device.catalogItemId) && device.inclusionStatus !== "excluded");
  if (!panels.length) return Math.ceil(loads.length / (rule.devicesPerCircuit ?? loads.length));

  const loadCountsByPanel = new Map<string, number>();
  loads.forEach((load) => {
    const panel = sourcePanelForLoad(load, panels);
    const panelId = panel?.id ?? "unassigned";
    loadCountsByPanel.set(panelId, (loadCountsByPanel.get(panelId) ?? 0) + 1);
  });

  return [...loadCountsByPanel.values()].reduce((total, count) => {
    const chunkSize = rule.devicesPerCircuit ?? count;
    return total + Math.ceil(count / chunkSize);
  }, 0);
}

function buildCircuitRuns(devices: ElectricalDevice[], connections: DeviceConnection[] = []): CircuitRun[] {
  const panels = devices.filter((device) => isPanelDevice(device.catalogItemId) && device.inclusionStatus !== "excluded");
  if (!panels.length) return [];
  const runs: CircuitRun[] = [];
  runs.push(...buildBaseboardHeatingRuns(devices, connections, panels));

  for (const rule of CIRCUIT_WIRE_RULES) {
    if (isBaseboardHeatingDevice(rule.catalogItemId)) continue;
    const loads = devices.filter((device) =>
      device.catalogItemId === rule.catalogItemId &&
      device.inclusionStatus !== "excluded" &&
      !isDeviceFedByLightingCircuit(device, devices, connections),
    );
    if (!loads.length) continue;
    const loadGroups = new Map<string, { panel: ElectricalDevice; loads: ElectricalDevice[] }>();

    loads.forEach((load) => {
      const panel = sourcePanelForLoad(load, panels);
      if (!panel) return;
      const group = loadGroups.get(panel.id) ?? { panel, loads: [] };
      group.loads.push(load);
      loadGroups.set(panel.id, group);
    });

    for (const group of loadGroups.values()) {
      const chunks = circuitLoadChunks(group.loads, [group.panel], rule, devices);
      chunks.forEach((chunk, index) => {
        const route = circuitRoute(group.panel, chunk, devices);
        runs.push({
          id: `${rule.catalogItemId}-${group.panel.id}-${index}`,
          label: DEVICE_CATALOG.find((item) => item.id === rule.catalogItemId)?.name ?? rule.catalogItemId,
          wireType: rule.wireType,
          deviceIds: [group.panel.id, ...chunk.map((device) => device.id)],
          routeDeviceIds: route.deviceIds,
          path: route.path,
        });
      });
    }
  }

  return runs;
}

function buildBaseboardHeatingRuns(devices: ElectricalDevice[], connections: DeviceConnection[], panels: ElectricalDevice[]): CircuitRun[] {
  const includedDevices = devices.filter((device) => device.inclusionStatus !== "excluded");
  const thermostats = includedDevices.filter((device) => device.catalogItemId === "baseboard-thermostat");
  const connectedHeaterIds = new Set<string>();
  const runs: CircuitRun[] = [];

  thermostats.forEach((thermostat, index) => {
    const heaters = connectedBaseboardHeaters(thermostat, includedDevices, connections).filter((heater) => !connectedHeaterIds.has(heater.id));
    heaters.forEach((heater) => connectedHeaterIds.add(heater.id));
    const panel = sourcePanelForLoad(thermostat, panels);
    if (!panel) return;
    const loads = [thermostat, ...orderDevicesByNearestNeighbor(heaters)];
    const route = circuitRoute(panel, loads, devices);
    runs.push({
      id: `baseboard-heating-${thermostat.id}-${index}`,
      label: heaters.length ? "Baseboard thermostat/heater" : "Baseboard thermostat",
      wireType: "2c12",
      deviceIds: [panel.id, ...loads.map((device) => device.id)],
      routeDeviceIds: route.deviceIds,
      path: route.path,
    });
  });

  includedDevices
    .filter((device) => isHeaterDevice(device.catalogItemId) && !connectedHeaterIds.has(device.id))
    .forEach((heater, index) => {
      const panel = sourcePanelForLoad(heater, panels);
      if (!panel) return;
      const route = circuitRoute(panel, [heater], devices);
      runs.push({
        id: `baseboard-heater-${heater.id}-${index}`,
        label: "Baseboard heater",
        wireType: "2c12",
        deviceIds: [panel.id, heater.id],
        routeDeviceIds: route.deviceIds,
        path: route.path,
      });
    });

  return runs;
}

function connectedBaseboardHeaters(thermostat: ElectricalDevice, devices: ElectricalDevice[], connections: DeviceConnection[]): ElectricalDevice[] {
  return connections
    .map((connection) => connection.sourceDeviceId === thermostat.id ? connection.targetDeviceId : connection.targetDeviceId === thermostat.id ? connection.sourceDeviceId : null)
    .filter((id): id is string => Boolean(id))
    .map((id) => devices.find((device) => device.id === id))
    .filter((device): device is ElectricalDevice => device !== undefined && isHeaterDevice(device.catalogItemId) && device.inclusionStatus !== "excluded");
}

function hasConnectedBaseboardThermostat(heater: ElectricalDevice, devices: ElectricalDevice[], connections: DeviceConnection[]): boolean {
  return connections.some((connection) => {
    const neighborId = connection.sourceDeviceId === heater.id ? connection.targetDeviceId : connection.targetDeviceId === heater.id ? connection.sourceDeviceId : null;
    if (!neighborId) return false;
    const neighbor = devices.find((device) => device.id === neighborId);
    return neighbor?.catalogItemId === "baseboard-thermostat" && neighbor.inclusionStatus !== "excluded";
  });
}

function sourcePanelForLoad(load: ElectricalDevice, panels: ElectricalDevice[]): ElectricalDevice | null {
  const sourcePanels = panels.filter((candidate) => candidate.id !== load.id);
  if (!sourcePanels.length) return null;
  if (load.feedFromPanelId) {
    const assignedPanel = sourcePanels.find((panel) => panel.id === load.feedFromPanelId);
    if (assignedPanel) return assignedPanel;
  }
  return nearestDevice(load.position, sourcePanels);
}

function withoutFeedPanel(device: ElectricalDevice): ElectricalDevice {
  const { feedFromPanelId: _feedFromPanelId, ...rest } = device;
  return rest;
}

function withoutLinkedRiser(device: ElectricalDevice): ElectricalDevice {
  const { linkedRiserId: _linkedRiserId, ...rest } = device;
  return rest;
}

function withoutDeviceReferences(device: ElectricalDevice, removedDeviceId: string): ElectricalDevice {
  let nextDevice = device;
  if (nextDevice.feedFromPanelId === removedDeviceId) nextDevice = withoutFeedPanel(nextDevice);
  if (nextDevice.linkedRiserId === removedDeviceId) nextDevice = withoutLinkedRiser(nextDevice);
  return nextDevice;
}

function panelName(panel: ElectricalDevice): string {
  const catalogItem = DEVICE_CATALOG.find((item) => item.id === panel.catalogItemId);
  return `${catalogItem?.name ?? "Panel"} on page ${panel.pdfPageNumber}`;
}

function circuitRoute(panel: ElectricalDevice, loads: ElectricalDevice[], devices: ElectricalDevice[]): { path: Point[]; deviceIds: string[] } {
  const routeDevices: ElectricalDevice[] = [panel];
  let currentDevice = panel;

  for (const load of loads) {
    routeBetweenDevices(currentDevice, load, devices).forEach((device) => {
      if (routeDevices[routeDevices.length - 1]?.id !== device.id) {
        routeDevices.push(device);
      }
    });
    currentDevice = load;
  }

  return {
    path: routeDevices.map((device) => device.position),
    deviceIds: routeDevices.map((device) => device.id),
  };
}

function routeBetweenDevices(from: ElectricalDevice, to: ElectricalDevice, devices: ElectricalDevice[]): ElectricalDevice[] {
  const linkedRiserRoute = linkedRiserRouteBetweenDevices(from, to, devices);
  if (linkedRiserRoute) return linkedRiserRoute;
  if (from.pdfPageNumber === to.pdfPageNumber) {
    const riser = nearestRiserBetweenDevices(from, to, devices);
    return riser ? [riser, to] : [to];
  }
  const fromRiser = nearestRiserForPage(from, devices);
  const toRiser = nearestRiserForPage(to, devices);
  return [fromRiser, toRiser, to].filter((device): device is ElectricalDevice => device !== null && device.id !== from.id);
}

function routeSortDistance(from: ElectricalDevice, to: ElectricalDevice, devices: ElectricalDevice[]): number {
  const routeDevices = [from, ...routeBetweenDevices(from, to, devices)];
  if (from.pdfPageNumber !== to.pdfPageNumber && routeDevices.length <= 2) {
    return Number.POSITIVE_INFINITY;
  }
  let total = 0;
  for (let index = 0; index < routeDevices.length - 1; index += 1) {
    const source = routeDevices[index];
    const target = routeDevices[index + 1];
    if (!source || !target) continue;
    if (isLinkedRiserPair(source, target)) continue;
    if (source.pdfPageNumber !== target.pdfPageNumber) {
      total += OVERLAY_SIZE;
      continue;
    }
    total += rightAngleDistance(source.position, target.position);
  }
  return total;
}

function linkedRiserRouteBetweenDevices(from: ElectricalDevice, to: ElectricalDevice, devices: ElectricalDevice[]): ElectricalDevice[] | null {
  const pairs = linkedRiserPairs(devices);
  if (!pairs.length) return null;
  const best = pairs
    .flatMap(([first, second]) => [
      {
        loadRiser: first,
        sourceRiser: second,
        routeDistance: rightAngleDistance(second.position, from.position) + rightAngleDistance(first.position, to.position),
        loadDistance: rightAngleDistance(first.position, to.position),
        sourceDistance: rightAngleDistance(second.position, from.position),
      },
      {
        loadRiser: second,
        sourceRiser: first,
        routeDistance: rightAngleDistance(first.position, from.position) + rightAngleDistance(second.position, to.position),
        loadDistance: rightAngleDistance(second.position, to.position),
        sourceDistance: rightAngleDistance(first.position, from.position),
      },
    ])
    .filter((option) => option.sourceRiser.pdfPageNumber === from.pdfPageNumber && option.loadRiser.pdfPageNumber === to.pdfPageNumber)
    .sort((a, b) => (a.loadDistance + a.sourceDistance) - (b.loadDistance + b.sourceDistance))[0];
  if (!best) return null;
  const sourceToLoadDistance = rightAngleDistance(from.position, to.position);
  if (from.pdfPageNumber === to.pdfPageNumber && best.routeDistance >= sourceToLoadDistance) return null;
  return [best.sourceRiser, best.loadRiser, to].filter((device) => device.id !== from.id);
}

function linkedRiserPairs(devices: ElectricalDevice[]): Array<[ElectricalDevice, ElectricalDevice]> {
  const deviceById = new Map(devices.map((device) => [device.id, device]));
  const seen = new Set<string>();
  const pairs: Array<[ElectricalDevice, ElectricalDevice]> = [];
  devices
    .filter((device) => device.catalogItemId === "floor-riser" && device.linkedRiserId && device.inclusionStatus !== "excluded")
    .forEach((device) => {
      if (seen.has(device.id)) return;
      const linked = device.linkedRiserId ? deviceById.get(device.linkedRiserId) : null;
      if (!linked || linked.catalogItemId !== "floor-riser" || linked.inclusionStatus === "excluded") return;
      seen.add(device.id);
      seen.add(linked.id);
      pairs.push([device, linked]);
    });
  return pairs;
}

function isLinkedRiserPair(source: ElectricalDevice, target: ElectricalDevice): boolean {
  return (
    source.catalogItemId === "floor-riser" &&
    target.catalogItemId === "floor-riser" &&
    source.linkedRiserId === target.id &&
    target.linkedRiserId === source.id
  );
}

function nearestRiserBetweenDevices(from: ElectricalDevice, to: ElectricalDevice, devices: ElectricalDevice[]): ElectricalDevice | null {
  const risers = devices.filter((candidate) =>
    candidate.catalogItemId === "floor-riser" &&
    candidate.pdfPageNumber === from.pdfPageNumber &&
    candidate.inclusionStatus !== "excluded",
  );
  if (!risers.length) return null;
  const nearest = risers
    .map((riser) => ({
      riser,
      routeDistance: rightAngleDistance(from.position, riser.position) + rightAngleDistance(riser.position, to.position),
    }))
    .sort((a, b) => a.routeDistance - b.routeDistance)[0];
  if (!nearest) return null;
  const sourceToLoadDistance = rightAngleDistance(from.position, to.position);
  return nearest.routeDistance < sourceToLoadDistance ? nearest.riser : null;
}

function nearestRiserForPage(device: ElectricalDevice, devices: ElectricalDevice[]): ElectricalDevice | null {
  const risers = devices.filter((candidate) =>
    candidate.catalogItemId === "floor-riser" &&
    candidate.pdfPageNumber === device.pdfPageNumber &&
    candidate.inclusionStatus !== "excluded",
  );
  return nearestDevice(device.position, risers);
}

function circuitLoadChunks(
  loads: ElectricalDevice[],
  panels: ElectricalDevice[],
  rule: { interconnect?: boolean; devicesPerCircuit?: number },
  devices: ElectricalDevice[],
): ElectricalDevice[][] {
  if (!rule.interconnect) return loads.map((load) => [load]);
  const ordered = orderCircuitLoadsFromPanel(loads, panels, devices).loads;
  const chunkSize = rule.devicesPerCircuit ?? ordered.length;
  const chunks: ElectricalDevice[][] = [];
  for (let index = 0; index < ordered.length; index += chunkSize) {
    chunks.push(ordered.slice(index, index + chunkSize));
  }
  return chunks;
}

function isPanelDevice(catalogItemId: string): boolean {
  return catalogItemId === "panel" || catalogItemId === "subpanel" || catalogItemId === "100a-subpanel";
}

function nearestDevice(point: Point, devices: ElectricalDevice[]): ElectricalDevice | null {
  return devices.map((device) => ({ device, distance: rightAngleDistance(point, device.position) })).sort((a, b) => a.distance - b.distance)[0]?.device ?? null;
}

function orderCircuitLoadsFromPanel(loads: ElectricalDevice[], panels: ElectricalDevice[], devices: ElectricalDevice[]): { panel: ElectricalDevice | null; loads: ElectricalDevice[] } {
  let bestPanel: ElectricalDevice | null = null;
  let bestLoad: ElectricalDevice | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const load of loads) {
    const panel = nearestDevice(load.position, panels);
    if (!panel) continue;
    const loadDistance = routeSortDistance(panel, load, devices);
    if (loadDistance < bestDistance) {
      bestDistance = loadDistance;
      bestPanel = panel;
      bestLoad = load;
    }
  }

  if (!bestPanel || !bestLoad) return { panel: null, loads: [] };
  const remaining = loads.filter((load) => load.id !== bestLoad?.id);
  const orderedLoads = [bestLoad];

  while (remaining.length) {
    const last = orderedLoads[orderedLoads.length - 1];
    if (!last) break;
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    remaining.forEach((load, index) => {
      const loadDistance = routeSortDistance(last, load, devices);
      if (loadDistance < nearestDistance) {
        nearestDistance = loadDistance;
        nearestIndex = index;
      }
    });
    const next = remaining.splice(nearestIndex, 1)[0];
    if (next) orderedLoads.push(next);
  }

  return { panel: bestPanel, loads: orderedLoads };
}

function lightingSwitchRuns(devices: ElectricalDevice[], connections: DeviceConnection[]): ElectricalDevice[][] {
  const devicesById = new Map(devices.map((device) => [device.id, device]));
  const lightIds = new Set(devices.filter((device) => isLightOrFanDevice(device.catalogItemId)).map((device) => device.id));
  const visitedLightIds = new Set<string>();
  const runs: ElectricalDevice[][] = [];

  for (const lightId of lightIds) {
    if (visitedLightIds.has(lightId)) continue;
    const switchIds = new Set<string>();
    const queue = [lightId];

    while (queue.length) {
      const currentLightId = queue.shift();
      if (!currentLightId || visitedLightIds.has(currentLightId)) continue;
      visitedLightIds.add(currentLightId);

      connections.forEach((connection) => {
        const neighborId = connection.sourceDeviceId === currentLightId ? connection.targetDeviceId : connection.targetDeviceId === currentLightId ? connection.sourceDeviceId : null;
        if (!neighborId) return;
        const neighbor = devicesById.get(neighborId);
        if (!neighbor) return;
        if (isLightOrFanDevice(neighbor.catalogItemId) && !visitedLightIds.has(neighbor.id)) {
          queue.push(neighbor.id);
        }
        if (isAutoSwitchDevice(neighbor.catalogItemId)) {
          switchIds.add(neighbor.id);
        }
      });
    }

    const switches = devices.filter((device) => switchIds.has(device.id));
    if (switches.length) runs.push(switches);
  }

  return runs;
}

function orderDevicesByNearestNeighbor(devices: ElectricalDevice[]): ElectricalDevice[] {
  const remaining = [...devices].sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y);
  const first = remaining.shift();
  if (!first) return [];
  const ordered = [first];

  while (remaining.length) {
    const last = ordered[ordered.length - 1];
    if (!last) break;
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    remaining.forEach((device, index) => {
      const deviceDistance = rightAngleDistance(last.position, device.position);
      if (deviceDistance < nearestDistance) {
        nearestDistance = deviceDistance;
        nearestIndex = index;
      }
    });
    const next = remaining.splice(nearestIndex, 1)[0];
    if (next) ordered.push(next);
  }

  return ordered;
}

function boxTakeoff(devices: ElectricalDevice[], boxGroups: ElectricalBoxGroup[]): Array<{ label: string; count: number }> {
  const includedBoxDeviceIds = new Set(
    devices
      .filter((device) => device.inclusionStatus !== "excluded" && isBoxDevice(device.catalogItemId))
      .map((device) => device.id),
  );
  const groupedDeviceIds = new Set<string>();
  const counts = new Map<number, number>();

  for (const group of boxGroups) {
    const includedDevices = group.deviceIds.filter((id) => includedBoxDeviceIds.has(id));
    if (includedDevices.length < 2) continue;
    includedDevices.forEach((id) => groupedDeviceIds.add(id));
    counts.set(includedDevices.length, (counts.get(includedDevices.length) ?? 0) + 1);
  }

  const singleGangCount = [...includedBoxDeviceIds].filter((id) => !groupedDeviceIds.has(id)).length;
  if (singleGangCount) counts.set(1, singleGangCount);

  return [...counts.entries()]
    .sort(([a], [b]) => a - b)
    .map(([gangs, count]) => ({ label: `${gangs}-gang box`, count }));
}

function titleCase(value: string): string {
  return value.toLowerCase().split(/\s+/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatMeters(feet: number, roundUp = false): string {
  const meters = feet * FEET_TO_METERS;
  return `${roundUp ? Math.ceil(meters) : meters.toFixed(1)} m`;
}

function viewerFitScale(viewerSize: { width: number; height: number }, overlayHeight: number): number {
  if (viewerSize.width <= 0 || viewerSize.height <= 0 || overlayHeight <= 0) return 1;
  const padding = 32;
  const widthScale = Math.max(0.2, (viewerSize.width - padding) / OVERLAY_SIZE);
  const heightScale = Math.max(0.2, (viewerSize.height - padding) / overlayHeight);
  return clamp(Math.min(widthScale, heightScale), 0.2, 1.15);
}

function metersToFeet(meters: number): number {
  return meters / FEET_TO_METERS;
}

function riserDropFeet(device: ElectricalDevice): number {
  return metersToFeet(device.riserDropMeters ?? DEFAULT_RISER_DROP_METERS);
}

function parseSavedProject(value: unknown): SavedProjectFile {
  if (!isRecord(value)) throw new Error("Invalid project file.");
  const pdfDataUrl = typeof value.pdfDataUrl === "string" ? value.pdfDataUrl : null;
  return {
    app: "electrical-takeoff",
    version: 1,
    savedAt: typeof value.savedAt === "string" ? value.savedAt : new Date().toISOString(),
    projectName: typeof value.projectName === "string" ? value.projectName : "Saved takeoff",
    pdfName: typeof value.pdfName === "string" ? value.pdfName : "Saved project",
    ...(pdfDataUrl ? { pdfDataUrl } : {}),
    currentPageNumber: Math.max(1, Number(value.currentPageNumber) || 1),
    viewState: isRecord(value.viewState) ? {
      zoom: clamp(Number(value.viewState.zoom) || 1, MIN_ZOOM, MAX_ZOOM),
      pan: isPoint(value.viewState.pan) ? value.viewState.pan : { x: 0, y: 0 },
    } : {
      zoom: 1,
      pan: { x: 0, y: 0 },
    },
    rooms: Array.isArray(value.rooms) ? value.rooms as Room[] : [],
    devices: Array.isArray(value.devices) ? (value.devices as ElectricalDevice[]).map((device) => {
      const { heaterWattage, ...rest } = device;
      return Number.isFinite(heaterWattage) && Number(heaterWattage) > 0 ? { ...rest, heaterWattage: clamp(Math.round(Number(heaterWattage)), 1, 2000) } : rest;
    }) : [],
    connections: Array.isArray(value.connections) ? value.connections as DeviceConnection[] : [],
    boxGroups: Array.isArray(value.boxGroups) ? value.boxGroups as ElectricalBoxGroup[] : [],
    planScales: Array.isArray(value.planScales) ? value.planScales as PlanScale[] : [],
    wireSettings: isRecord(value.wireSettings) ? {
      switchVerticalAllowanceFeet: Number(value.wireSettings.switchVerticalAllowanceFeet) || SWITCH_VERTICAL_ALLOWANCE_FEET,
      applianceVerticalAllowanceFeet: Number(value.wireSettings.applianceVerticalAllowanceFeet) || APPLIANCE_VERTICAL_ALLOWANCE_FEET,
      defaultRiserDropMeters: Number(value.wireSettings.defaultRiserDropMeters) || Number(value.wireSettings.crossFloorAllowanceFeet) * FEET_TO_METERS || DEFAULT_RISER_DROP_METERS,
      wastePercent: clamp(finiteSetting(value.wireSettings.wastePercent, DEFAULT_WASTE_PERCENT), 0, 100),
    } : {
      switchVerticalAllowanceFeet: SWITCH_VERTICAL_ALLOWANCE_FEET,
      applianceVerticalAllowanceFeet: APPLIANCE_VERTICAL_ALLOWANCE_FEET,
      defaultRiserDropMeters: DEFAULT_RISER_DROP_METERS,
      wastePercent: DEFAULT_WASTE_PERCENT,
    },
    labourSettings: parseLabourSettings(value.labourSettings),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function finiteSetting(value: unknown, fallback: number): number { return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) ? Number(value) : fallback; }

function parseLabourSettings(value: unknown): LabourSettings {
  if (!isRecord(value)) return DEFAULT_LABOUR_SETTINGS;
  return {
    projectTypeMultiplier: clamp(Number(value.projectTypeMultiplier) || DEFAULT_LABOUR_SETTINGS.projectTypeMultiplier, 0.5, 3),
    accessMultiplier: clamp(Number(value.accessMultiplier) || DEFAULT_LABOUR_SETTINGS.accessMultiplier, 0.5, 3),
    ceilingHeightMultiplier: clamp(Number(value.ceilingHeightMultiplier) || DEFAULT_LABOUR_SETTINGS.ceilingHeightMultiplier, 0.5, 3),
    setupHours: clamp(finiteSetting(value.setupHours, DEFAULT_LABOUR_SETTINGS.setupHours), 0, 80),
  };
}

function isPoint(value: unknown): value is Point {
  return isRecord(value) && typeof value.x === "number" && Number.isFinite(value.x) && typeof value.y === "number" && Number.isFinite(value.y);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read file."));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

function revokeObjectUrlIfNeeded(url: string | null) {
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
}

function safeFileBaseName(value: string): string {
  return value.replace(/\.[^/.]+$/, "").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "electrical-takeoff";
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable;
}

const root = document.getElementById("root");
if (root) ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

export { canConnectDevices, assignHeaterThermostat, nextConnectionAnchorId, parseSavedProject, App, feetPerPlanUnitForPage, rightAngleDistance, estimateLightingWire, estimateCircuitRunWire, buildCircuitRuns, buildWireBreakdown, summarizeWireBreakdown, withWireMaterialLines, calculateMaterialTakeoff, estimateLabour, isDifficultWireType, boxTakeoff };
export type { ElectricalDevice, DeviceConnection, PlanScale, CircuitRun, WireBreakdownLine };
