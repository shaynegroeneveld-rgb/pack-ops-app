import { useEffect, useState } from "react";

import type { TimeEntry } from "@/domain/time-entries/types";

interface EditableTimeEntryItemProps {
  entry: TimeEntry;
  workedByLabel: string;
  enteredByLabel: string;
  canApprove: boolean;
  canEdit: boolean;
  canDelete: boolean;
  isApproving: boolean;
  isSaving: boolean;
  isDeleting: boolean;
  onApprove: () => void;
  onSave: (input: {
    workDate: string;
    startTime: string | null;
    endTime: string | null;
    hours: number;
    description: string | null;
    hourlyRate: number | null;
    sectionName?: string | null;
  }) => Promise<void>;
  onDelete: () => void;
}

export function EditableTimeEntryItem({
  entry,
  workedByLabel,
  enteredByLabel,
  canApprove,
  canEdit,
  canDelete,
  isApproving,
  isSaving,
  isDeleting,
  onApprove,
  onSave,
  onDelete,
}: EditableTimeEntryItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [workDate, setWorkDate] = useState(entry.workDate);
  const [startTime, setStartTime] = useState(entry.startTime ?? "");
  const [endTime, setEndTime] = useState(entry.endTime ?? "");
  const [hours, setHours] = useState(String(entry.hours));
  const [description, setDescription] = useState(entry.description ?? "");
  const [hourlyRate, setHourlyRate] = useState(entry.hourlyRate != null ? String(entry.hourlyRate) : "");
  const [sectionName, setSectionName] = useState(entry.sectionName ?? "");

  useEffect(() => {
    setWorkDate(entry.workDate);
    setStartTime(entry.startTime ?? "");
    setEndTime(entry.endTime ?? "");
    setHours(String(entry.hours));
    setDescription(entry.description ?? "");
    setHourlyRate(entry.hourlyRate != null ? String(entry.hourlyRate) : "");
    setSectionName(entry.sectionName ?? "");
    setIsEditing(false);
  }, [entry.description, entry.endTime, entry.hourlyRate, entry.hours, entry.id, entry.sectionName, entry.startTime, entry.updatedAt, entry.workDate]);

  return (
    <li style={{ marginBottom: "10px" }}>
      {!isEditing ? (
        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ display: "grid", gap: "2px" }}>
            <span>
            {entry.workDate}
            {entry.startTime && entry.endTime ? ` · ${entry.startTime}-${entry.endTime}` : ""}
            {` · ${entry.hours}h · ${entry.status.replaceAll("_", " ")}`}
            {entry.hourlyRate !== null ? ` · $${entry.hourlyRate.toFixed(2)}/h` : ""}
            {entry.sectionName ? ` · ${entry.sectionName}` : ""}
            {entry.description ? ` · ${entry.description}` : ""}
            </span>
            <span style={{ color: "#5b6475", fontSize: "13px" }}>
              Worked by {workedByLabel} · Entered by {enteredByLabel}
            </span>
          </span>
          {entry.status === "pending" && canApprove ? (
            <button style={{ marginLeft: "4px" }} onClick={onApprove} disabled={isApproving}>
              {isApproving ? "Approving..." : "Approve"}
            </button>
          ) : null}
          {canEdit ? (
            <button style={{ marginLeft: "4px" }} onClick={() => setIsEditing(true)}>
              Edit
            </button>
          ) : null}
          {canDelete ? (
            <button
              style={{ marginLeft: "4px" }}
              onClick={onDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </button>
          ) : null}
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gap: "8px",
            border: "1px solid #d9dfeb",
            borderRadius: "12px",
            padding: "12px",
            background: "#fafcff",
          }}
        >
          <div style={{ display: "grid", gap: "8px", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
            <label style={{ display: "grid", gap: "4px" }}>
              <span style={{ fontSize: "13px", color: "#5b6475" }}>Date</span>
              <input type="date" value={workDate} onChange={(event) => setWorkDate(event.target.value)} />
            </label>
            <label style={{ display: "grid", gap: "4px" }}>
              <span style={{ fontSize: "13px", color: "#5b6475" }}>Start</span>
              <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
            </label>
            <label style={{ display: "grid", gap: "4px" }}>
              <span style={{ fontSize: "13px", color: "#5b6475" }}>End</span>
              <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
            </label>
            <label style={{ display: "grid", gap: "4px" }}>
              <span style={{ fontSize: "13px", color: "#5b6475" }}>Hours</span>
              <input
                type="number"
                min="0.05"
                step="0.25"
                value={hours}
                onChange={(event) => setHours(event.target.value)}
              />
            </label>
            <label style={{ display: "grid", gap: "4px" }}>
              <span style={{ fontSize: "13px", color: "#5b6475" }}>Billable Rate</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={hourlyRate}
                onChange={(event) => setHourlyRate(event.target.value)}
              />
            </label>
          </div>
          <label style={{ display: "grid", gap: "4px" }}>
            <span style={{ fontSize: "13px", color: "#5b6475" }}>Note</span>
            <input value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <label style={{ display: "grid", gap: "4px" }}>
            <span style={{ fontSize: "13px", color: "#5b6475" }}>Part</span>
            <input value={sectionName} onChange={(event) => setSectionName(event.target.value)} placeholder="General, Service, Rough-in..." />
          </label>
          <div style={{ color: "#5b6475", fontSize: "13px" }}>
            Worked by {workedByLabel} · Entered by {enteredByLabel}
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              onClick={() =>
                void onSave({
                  workDate,
                  startTime: startTime || null,
                  endTime: endTime || null,
                  hours: Number(hours),
                  description: description.trim() || null,
                  hourlyRate: hourlyRate.trim() ? Number(hourlyRate) : null,
                  sectionName: sectionName.trim() || null,
                }).then(() => {
                  setIsEditing(false);
                })
              }
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
            <button
              onClick={() => {
                setWorkDate(entry.workDate);
                setStartTime(entry.startTime ?? "");
                setEndTime(entry.endTime ?? "");
                setHours(String(entry.hours));
                setDescription(entry.description ?? "");
                setHourlyRate(entry.hourlyRate != null ? String(entry.hourlyRate) : "");
                setSectionName(entry.sectionName ?? "");
                setIsEditing(false);
              }}
              disabled={isSaving}
            >
              Cancel
            </button>
            {canDelete ? (
              <button
                onClick={onDelete}
                disabled={isSaving || isDeleting}
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            ) : null}
          </div>
        </div>
      )}
    </li>
  );
}
