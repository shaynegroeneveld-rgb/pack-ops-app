import { useEffect, useState } from "react";

interface ContactOption {
  id: string;
  label: string;
  subtitle: string | null;
}

export interface EditJobPanelProps {
  canEdit: boolean;
  title: string;
  description: string | null;
  estimatedHours: number | null;
  contactId: string;
  contacts: ContactOption[];
  isSaving: boolean;
  isArchiving: boolean;
  onSave: (input: { title: string; description: string; contactId: string; estimatedHours?: number | null }) => Promise<void>;
  onArchive: () => Promise<void>;
}

export function EditJobPanel({
  canEdit,
  title,
  description,
  estimatedHours,
  contactId,
  contacts,
  isSaving,
  isArchiving,
  onSave,
  onArchive,
}: EditJobPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftDescription, setDraftDescription] = useState(description ?? "");
  const [draftEstimatedHours, setDraftEstimatedHours] = useState(estimatedHours?.toString() ?? "");
  const [draftContactId, setDraftContactId] = useState(contactId);

  useEffect(() => {
    setDraftTitle(title);
    setDraftDescription(description ?? "");
    setDraftEstimatedHours(estimatedHours?.toString() ?? "");
    setDraftContactId(contactId);
    setIsEditing(false);
  }, [title, description, estimatedHours, contactId]);

  if (!canEdit) {
    return null;
  }

  return (
    <div style={{ marginBottom: "20px", border: "1px solid #d9dfeb", borderRadius: "14px", padding: "14px", background: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap", marginBottom: "10px" }}>
        <div>
          <h3 style={{ marginTop: 0, marginBottom: "4px" }}>Job Maintenance</h3>
          <p style={{ color: "#5b6475", margin: 0 }}>
            Update the basic job details you use every day, or archive the job without deleting its history.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {!isEditing ? (
            <button onClick={() => setIsEditing(true)}>
              Edit Job
            </button>
          ) : null}
          <button
            onClick={() => {
              if (window.confirm("Archive this job? It will be hidden from the default Workbench list but kept for history.")) {
                void onArchive();
              }
            }}
            disabled={isArchiving}
            style={{ color: "#8f1d1d" }}
          >
            {isArchiving ? "Archiving..." : "Archive Job"}
          </button>
        </div>
      </div>

      {isEditing ? (
        <div style={{ display: "grid", gap: "10px" }}>
          <label style={{ display: "grid", gap: "6px" }}>
            <span style={{ fontSize: "13px", color: "#5b6475" }}>Title</span>
            <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} />
          </label>

          <label style={{ display: "grid", gap: "6px" }}>
            <span style={{ fontSize: "13px", color: "#5b6475" }}>Contact</span>
            <select value={draftContactId} onChange={(event) => setDraftContactId(event.target.value)}>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.label}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: "6px" }}>
            <span style={{ fontSize: "13px", color: "#5b6475" }}>Description</span>
            <textarea
              value={draftDescription}
              onChange={(event) => setDraftDescription(event.target.value)}
              rows={3}
            />
          </label>

          <label style={{ display: "grid", gap: "6px" }}>
            <span style={{ fontSize: "13px", color: "#5b6475" }}>Estimated Hours</span>
            <input
              type="number"
              min="0.5"
              step="0.5"
              value={draftEstimatedHours}
              onChange={(event) => setDraftEstimatedHours(event.target.value)}
              placeholder="Optional"
            />
          </label>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              onClick={async () => {
                const normalizedEstimatedHours = draftEstimatedHours.trim();
                await onSave({
                  title: draftTitle,
                  description: draftDescription,
                  contactId: draftContactId,
                  ...(normalizedEstimatedHours
                    ? { estimatedHours: Number(normalizedEstimatedHours) }
                    : { estimatedHours: null }),
                });
                setIsEditing(false);
              }}
              disabled={isSaving || !draftTitle.trim() || !draftContactId}
            >
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
            <button
              onClick={() => {
                setDraftTitle(title);
                setDraftDescription(description ?? "");
                setDraftEstimatedHours(estimatedHours?.toString() ?? "");
                setDraftContactId(contactId);
                setIsEditing(false);
              }}
              disabled={isSaving}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
