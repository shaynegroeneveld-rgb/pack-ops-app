import { useEffect, useState } from "react";

import type { JobType } from "@/domain/job-types/types";
import type { AssemblyView } from "@/domain/materials/types";
import { Modal } from "@/ui";

export interface JobTypeEditorDraft {
  jobTypeId?: JobType["id"];
  name: string;
  notes: string;
  defaultAssemblyId: string;
  isActive: boolean;
}

interface JobTypeEditorPanelProps {
  initialDraft: JobTypeEditorDraft | null;
  assemblies: AssemblyView[];
  isPending: boolean;
  onSubmit: (draft: JobTypeEditorDraft) => Promise<void>;
  onClose: () => void;
}

export function JobTypeEditorPanel({ initialDraft, assemblies, isPending, onSubmit, onClose }: JobTypeEditorPanelProps) {
  const [draft, setDraft] = useState<JobTypeEditorDraft | null>(initialDraft);

  useEffect(() => {
    setDraft(initialDraft);
  }, [initialDraft]);

  return (
    <Modal
      open={Boolean(draft)}
      onClose={onClose}
      title={draft?.jobTypeId ? "Edit Job Type" : "New Job Type"}
      footer={
        draft ? (
          <button onClick={() => void onSubmit(draft)} disabled={isPending || !draft.name.trim()} style={{ fontWeight: 600 }}>
            {isPending ? "Saving..." : "Save Job Type"}
          </button>
        ) : null
      }
    >
      {draft ? (
        <>
          <p style={{ margin: 0, color: "#5b6475" }}>
            Capture what a field worker should remember for this kind of job: code rules, special tools, gotchas.
          </p>

          <label style={{ display: "grid", gap: "6px" }}>
            <span>Name</span>
            <input
              value={draft.name}
              disabled={isPending}
              placeholder="Genny Install, Panel Upgrade..."
              onChange={(event) => setDraft((current) => (current ? { ...current, name: event.target.value } : current))}
            />
          </label>

          <label style={{ display: "grid", gap: "6px" }}>
            <span>Notes</span>
            <textarea
              rows={6}
              value={draft.notes}
              disabled={isPending}
              placeholder="Needs the feed, two-wire start, and the battery charger..."
              onChange={(event) => setDraft((current) => (current ? { ...current, notes: event.target.value } : current))}
            />
          </label>

          <label style={{ display: "grid", gap: "6px" }}>
            <span>Default Assembly</span>
            <select
              value={draft.defaultAssemblyId}
              disabled={isPending}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, defaultAssemblyId: event.target.value } : current))
              }
            >
              <option value="">None</option>
              {assemblies.map((assembly) => (
                <option key={assembly.id} value={assembly.id}>
                  {assembly.name}
                </option>
              ))}
            </select>
            <span style={{ color: "#8a93a6", fontSize: "13px" }}>
              Picking this job type on a quote will add this assembly&apos;s materials and labor automatically.
            </span>
          </label>

          <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input
              type="checkbox"
              checked={draft.isActive}
              disabled={isPending}
              onChange={(event) => setDraft((current) => (current ? { ...current, isActive: event.target.checked } : current))}
            />
            <span>Active</span>
          </label>
        </>
      ) : null}
    </Modal>
  );
}
