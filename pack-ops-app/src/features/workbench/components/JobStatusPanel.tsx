import { useState } from "react";

import {
  getWorkbenchJobPhaseLabel,
  getWorkbenchJobStatusActions,
  getWorkbenchWaitingReasonLabel,
  WORKBENCH_WAITING_REASON_OPTIONS,
} from "@/domain/jobs/status";
import type { Job } from "@/domain/jobs/types";

export interface JobStatusPanelProps {
  job: Job;
  canEdit: boolean;
  isPending: boolean;
  onUpdateStatus: (input: {
    status: "scheduled" | "in_progress" | "waiting" | "work_complete";
    waitingReason?: "parts" | "permit" | "customer_decision" | "weather" | "other" | null;
  }) => Promise<void>;
}

export function JobStatusPanel({
  job,
  canEdit,
  isPending,
  onUpdateStatus,
}: JobStatusPanelProps) {
  const [waitingReason, setWaitingReason] = useState<"parts" | "permit" | "customer_decision" | "weather" | "other">(
    job.waitingReason ?? "other",
  );
  const actions = getWorkbenchJobStatusActions(job);

  return (
    <div style={{ marginBottom: "20px", border: "1px solid #d9dfeb", borderRadius: "14px", padding: "14px", background: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "start", flexWrap: "wrap" }}>
        <div>
          <h3 style={{ marginTop: 0, marginBottom: "4px" }}>Job Status</h3>
          <p style={{ color: "#5b6475", margin: 0 }}>
            Keep the job in the right daily-work state without leaving Workbench.
          </p>
        </div>
        <div
          style={{
            border: "1px solid #d9dfeb",
            borderRadius: "999px",
            padding: "6px 10px",
            background: job.status === "waiting" ? "#fff8e8" : job.status === "in_progress" ? "#eef4ff" : "#f3f8f2",
            color: job.status === "waiting" ? "#8a5a00" : job.status === "in_progress" ? "#2440a8" : "#1f6b37",
            fontSize: "13px",
            fontWeight: 600,
          }}
        >
          {getWorkbenchJobPhaseLabel(job)}
        </div>
      </div>

      <p style={{ color: "#5b6475", marginBottom: actions.length > 0 ? "10px" : 0 }}>
        {job.status === "waiting" && job.waitingReason
          ? `Waiting on: ${getWorkbenchWaitingReasonLabel(job.waitingReason)}`
          : job.status === "scheduled"
            ? "This job has not started yet."
            : job.status === "work_complete"
              ? "Field work is marked complete."
              : null}
      </p>

      {canEdit && actions.length > 0 ? (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          {actions.map((action) => (
            action.needsWaitingReason ? (
              <div key={action.targetStatus} style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                <select value={waitingReason} onChange={(event) => setWaitingReason(event.target.value as typeof waitingReason)}>
                  {WORKBENCH_WAITING_REASON_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <button
                  disabled={isPending}
                  onClick={() => void onUpdateStatus({ status: action.targetStatus, waitingReason })}
                >
                  {isPending ? "Updating..." : action.label}
                </button>
              </div>
            ) : (
              <button
                key={action.targetStatus}
                disabled={isPending}
                onClick={() => void onUpdateStatus({ status: action.targetStatus })}
              >
                {isPending ? "Updating..." : action.label}
              </button>
            )
          ))}
        </div>
      ) : null}
    </div>
  );
}
