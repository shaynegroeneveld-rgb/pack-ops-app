import { useEffect, useState } from "react";

import type { ScheduleBlock } from "@/domain/scheduling/types";

export interface CarryOverDraft {
  /** IDs of all blocks to carry over (one per worker for multi-worker days). */
  blockIds: Array<ScheduleBlock["id"]>;
  mode: "tomorrow" | "next_workday" | "pick_date";
  day: string;
  reason: string;
}

interface CarryOverPanelProps {
  initialDraft: CarryOverDraft | null;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (draft: CarryOverDraft) => Promise<void>;
}

export function CarryOverPanel({
  initialDraft,
  isPending,
  onClose,
  onSubmit,
}: CarryOverPanelProps) {
  const [draft, setDraft] = useState<CarryOverDraft | null>(initialDraft);

  useEffect(() => {
    setDraft(initialDraft);
  }, [initialDraft]);

  if (!draft) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(23, 32, 51, 0.35)",
        display: "grid",
        placeItems: "center",
        padding: "20px",
        zIndex: 21,
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: "520px",
          border: "1px solid #d9dfeb",
          borderRadius: "18px",
          padding: "18px",
          background: "#fff",
          display: "grid",
          gap: "14px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
          <div>
            <h3 style={{ margin: 0 }}>Carry Over Scheduled Work</h3>
            <p style={{ margin: "4px 0 0", color: "#5b6475" }}>
              Move this scheduled work forward and optionally leave a short reason.
            </p>
          </div>
          <button onClick={onClose} disabled={isPending}>
            Close
          </button>
        </div>

        <label style={{ display: "grid", gap: "6px" }}>
          <span>Move To</span>
          <select
            value={draft.mode}
            disabled={isPending}
            onChange={(event) =>
              setDraft((current) =>
                current
                  ? {
                      ...current,
                      mode: event.target.value as CarryOverDraft["mode"],
                    }
                  : current,
              )
            }
          >
            <option value="tomorrow">Tomorrow</option>
            <option value="next_workday">Next Workday</option>
            <option value="pick_date">Pick a Date</option>
          </select>
        </label>

        {draft.mode === "pick_date" ? (
          <label style={{ display: "grid", gap: "6px" }}>
            <span>Carry Over Date</span>
            <input
              type="date"
              value={draft.day}
              disabled={isPending}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, day: event.target.value } : current))
              }
            />
          </label>
        ) : null}

        <label style={{ display: "grid", gap: "6px" }}>
          <span>Carry Over Reason</span>
          <input
            type="text"
            maxLength={120}
            placeholder="Optional, for example: waiting on material"
            value={draft.reason}
            disabled={isPending}
            onChange={(event) =>
              setDraft((current) => (current ? { ...current, reason: event.target.value } : current))
            }
          />
        </label>

        <div
          style={{
            border: "1px solid #e4e8f1",
            borderRadius: "12px",
            background: "#f8fafc",
            padding: "12px",
            color: "#5b6475",
            fontSize: "14px",
          }}
        >
          Carry over keeps the same job, assignee, duration, dispatch hint, and any explicit start time unless you change the date.
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button onClick={() => void onSubmit(draft)} disabled={isPending} style={{ fontWeight: 600 }}>
            {isPending ? "Moving..." : "Carry Over"}
          </button>
        </div>
      </section>
    </div>
  );
}
