import { useEffect, useMemo, useState } from "react";

import type { JobAssignment, Job } from "@/domain/jobs/types";
import type { ScheduleBlock } from "@/domain/scheduling/types";
import type { AuthenticatedUser } from "@/domain/users/types";
import { computeJobCapacitySummary, getActiveUniqueAssignments } from "@/services/scheduling/job-capacity";
import type { SchedulingUserOption } from "@/services/scheduling/scheduling-service";

export interface ScheduleEditorDraft {
  scheduleBlockId?: ScheduleBlock["id"];
  jobId: Job["id"];
  day: string;
  timeBucket: ScheduleBlock["timeBucket"];
  startTime: string;
  durationHours: string;
  userId: string;
  notes: string;
}

interface ScheduleEditorPanelProps {
  authenticatedUser: AuthenticatedUser;
  availableJobs: Job[];
  assignmentsByJobId: Map<Job["id"], JobAssignment[]>;
  scheduledJobIds: Set<Job["id"]>;
  assignableUsers: SchedulingUserOption[];
  initialDraft: ScheduleEditorDraft | null;
  isPending: boolean;
  onSubmit: (draft: ScheduleEditorDraft) => Promise<void>;
  onUpdateEstimatedHours?: (jobId: Job["id"], estimatedHours: number | null) => Promise<void>;
  onUpdateFullCrewRule?: (jobId: Job["id"], requiresFullCrewTogether: boolean) => Promise<void>;
  onAutoFillDays?: (draft: ScheduleEditorDraft) => Promise<void>;
  onAutoFillNextAvailable?: (draft: ScheduleEditorDraft) => Promise<void>;
  onAssignUser?: (jobId: Job["id"], userId: SchedulingUserOption["id"]) => Promise<void>;
  onRemoveAssignment?: (assignmentId: JobAssignment["id"]) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

function getAssignmentLabel(
  assignment: JobAssignment,
  authenticatedUser: AuthenticatedUser,
): string {
  if (assignment.userId === authenticatedUser.user.id) {
    return `You (${assignment.assignmentRole})`;
  }

  return `${assignment.assignmentRole} · ${assignment.userId.slice(0, 8)}`;
}

export function ScheduleEditorPanel({
  authenticatedUser,
  availableJobs,
  assignmentsByJobId,
  scheduledJobIds,
  assignableUsers,
  initialDraft,
  isPending,
  onSubmit,
  onUpdateEstimatedHours,
  onUpdateFullCrewRule,
  onAutoFillDays,
  onAutoFillNextAvailable,
  onAssignUser,
  onRemoveAssignment,
  onDelete,
  onClose,
}: ScheduleEditorPanelProps) {
  const [draft, setDraft] = useState<ScheduleEditorDraft | null>(initialDraft);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [estimatedHoursDraft, setEstimatedHoursDraft] = useState("");

  useEffect(() => {
    setDraft(initialDraft);
  }, [initialDraft]);

  const selectedJob = useMemo(
    () => availableJobs.find((job) => job.id === draft?.jobId) ?? null,
    [availableJobs, draft?.jobId],
  );

  useEffect(() => {
    setEstimatedHoursDraft(selectedJob?.estimatedHours ? String(selectedJob.estimatedHours) : "");
  }, [selectedJob?.id, selectedJob?.estimatedHours]);

  const assignmentOptions = useMemo(
    () => (draft ? getActiveUniqueAssignments(assignmentsByJobId.get(draft.jobId) ?? []) : []),
    [assignmentsByJobId, draft],
  );
  const assignedUserIds = useMemo(
    () => new Set(assignmentOptions.map((assignment) => assignment.userId)),
    [assignmentOptions],
  );
  const unassignedUsers = useMemo(
    () => assignableUsers.filter((user) => !assignedUserIds.has(user.id)),
    [assignableUsers, assignedUserIds],
  );
  const capacity = useMemo(
    () => {
      if (!selectedJob) {
        return null;
      }

      const parsedEstimate = Number(estimatedHoursDraft);
      const estimatedHours =
        estimatedHoursDraft.trim() === ""
          ? null
          : Number.isFinite(parsedEstimate) && parsedEstimate > 0
            ? parsedEstimate
            : selectedJob.estimatedHours;

      return computeJobCapacitySummary({
        estimatedHours,
        assignedCrewCount: assignmentOptions.length,
        startDay: draft?.day ?? null,
      });
    },
    [assignmentOptions.length, draft?.day, estimatedHoursDraft, selectedJob],
  );
  const selectedJobHasSchedule = selectedJob ? scheduledJobIds.has(selectedJob.id) : false;

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
        zIndex: 20,
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: "640px",
          maxHeight: "min(90vh, 760px)",
          overflow: "auto",
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
            <h3 style={{ margin: 0 }}>{draft.scheduleBlockId ? "Edit Schedule Block" : "Quick Schedule"}</h3>
            <p style={{ margin: "4px 0 0", color: "#5b6475" }}>
              Pick the start day and crew. New jobs auto-fill normal 8-hour workdays by default.
            </p>
          </div>
          <button onClick={onClose} disabled={isPending}>
            Close
          </button>
        </div>

        <label style={{ display: "grid", gap: "6px" }}>
          <span>Job</span>
          <select
            value={draft.jobId}
            disabled={isPending}
            onChange={(event) =>
              setDraft((current) =>
                current
                  ? {
                      ...current,
                      jobId: event.target.value as Job["id"],
                      userId: "",
                    }
                  : current,
              )
            }
          >
            {availableJobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.number} · {job.title}
              </option>
            ))}
          </select>
        </label>

        <section
          style={{
            border: "1px solid #e4e8f1",
            borderRadius: "14px",
            padding: "12px",
            display: "grid",
            gap: "10px",
          }}
        >
          <div>
            <strong style={{ display: "block" }}>Assigned Crew</strong>
            <small style={{ color: "#5b6475" }}>This updates the job assignment, not just this schedule block.</small>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {assignmentOptions.length === 0 ? (
              <span style={{ color: "#5b6475", fontSize: "13px" }}>No crew assigned yet.</span>
            ) : null}
            {assignmentOptions.map((assignment) => {
              const user = assignableUsers.find((option) => option.id === assignment.userId);
              return (
                <span
                  key={assignment.id}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    borderRadius: "999px",
                    background: "#eef2f8",
                    color: "#172033",
                    padding: "7px 10px",
                    fontSize: "13px",
                  }}
                >
                  {user?.label ?? assignment.userId.slice(0, 8)}
                  {onRemoveAssignment ? (
                    <button
                      type="button"
                      onClick={() => void onRemoveAssignment(assignment.id)}
                      disabled={isPending}
                      aria-label={`Remove ${user?.label ?? "crew member"}`}
                      style={{ minHeight: "28px", padding: "2px 8px" }}
                    >
                      x
                    </button>
                  ) : null}
                </span>
              );
            })}
          </div>
          {onAssignUser ? (
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <select
                value={selectedUserId}
                disabled={isPending || unassignedUsers.length === 0}
                onChange={(event) => setSelectedUserId(event.target.value)}
              >
                <option value="">{unassignedUsers.length === 0 ? "Everyone assigned" : "Add crew member"}</option>
                {unassignedUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={isPending || !selectedUserId}
                onClick={() => {
                  if (!selectedUserId) {
                    return;
                  }

                  void onAssignUser(draft.jobId, selectedUserId as SchedulingUserOption["id"]).then(() => {
                    setSelectedUserId("");
                  });
                }}
              >
                Add Person
              </button>
            </div>
          ) : null}
        </section>

        {selectedJob ? (
          <section
            style={{
              border: "1px solid #e4e8f1",
              borderRadius: "14px",
              padding: "12px",
              display: "grid",
              gap: "10px",
            }}
          >
            <div>
              <strong style={{ display: "block" }}>Estimated Hours</strong>
              <small style={{ color: "#5b6475" }}>
                Updates the job estimate used by auto-fill and next available scheduling.
              </small>
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "end" }}>
              <label style={{ display: "grid", gap: "6px", minWidth: "150px" }}>
                <span>Hours</span>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={estimatedHoursDraft}
                  disabled={isPending}
                  placeholder="Not set"
                  onChange={(event) => setEstimatedHoursDraft(event.target.value)}
                />
              </label>
              {onUpdateEstimatedHours ? (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    const normalized = estimatedHoursDraft.trim();
                    const nextEstimate =
                      normalized === ""
                        ? null
                        : Number.isFinite(Number(normalized)) && Number(normalized) > 0
                          ? Number(normalized)
                          : null;
                    void onUpdateEstimatedHours(selectedJob.id, nextEstimate);
                  }}
                >
                  Save Estimate
                </button>
              ) : null}
            </div>
            {selectedJobHasSchedule ? (
              <div style={{ color: "#92400e", fontSize: "13px", fontWeight: 700 }}>
                This job is already scheduled. Save the estimate, then use Recalculate to reflow the plan.
              </div>
            ) : null}
            <label
              style={{
                display: "flex",
                gap: "10px",
                alignItems: "center",
                borderTop: "1px solid #e4e8f1",
                paddingTop: "10px",
              }}
            >
              <input
                type="checkbox"
                checked={selectedJob.requiresFullCrewTogether}
                disabled={isPending || !onUpdateFullCrewRule}
                onChange={(event) =>
                  void onUpdateFullCrewRule?.(selectedJob.id, event.target.checked)
                }
              />
              <span>
                <strong style={{ display: "block" }}>Requires full crew together</strong>
                <small style={{ color: "#5b6475" }}>
                  Next Available will only place work when every assigned crew member can work together.
                </small>
              </span>
            </label>
            {selectedJobHasSchedule && selectedJob.requiresFullCrewTogether ? (
              <div style={{ color: "#92400e", fontSize: "13px", fontWeight: 700 }}>
                Recalculate this scheduled job if crew availability has changed.
              </div>
            ) : null}
          </section>
        ) : null}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px" }}>
          <label style={{ display: "grid", gap: "6px" }}>
            <span>Scheduled Date</span>
            <input
              type="date"
              value={draft.day}
              disabled={isPending}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, day: event.target.value } : current))
              }
            />
          </label>

          <label style={{ display: "grid", gap: "6px" }}>
            <span>Duration Hint (hours)</span>
            <input
              type="number"
              min="0.5"
              max="24"
              step="0.5"
              value={draft.durationHours}
              disabled={isPending}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, durationHours: event.target.value } : current))
              }
            />
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px" }}>
          <label style={{ display: "grid", gap: "6px" }}>
            <span>Time Bucket</span>
            <select
              value={draft.timeBucket}
              disabled={isPending}
              onChange={(event) =>
                setDraft((current) =>
                  current
                    ? {
                      ...current,
                      timeBucket: event.target.value as ScheduleBlock["timeBucket"],
                      startTime:
                          !current.startTime
                            ? event.target.value === "pm"
                              ? "13:00"
                              : event.target.value === "am"
                                ? "08:00"
                                : "09:00"
                            : current.startTime,
                    }
                  : current,
                )
              }
            >
              <option value="anytime">Anytime</option>
              <option value="am">AM</option>
              <option value="pm">PM</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: "6px" }}>
            <span>Assigned User</span>
            <select
              value={draft.userId}
              disabled={isPending}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, userId: event.target.value } : current))
              }
            >
              <option value="">Unassigned</option>
              {assignmentOptions.map((assignment) => (
                <option key={assignment.id} value={assignment.userId}>
                  {getAssignmentLabel(assignment, authenticatedUser)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label style={{ display: "grid", gap: "6px" }}>
          <span>Optional Start Time</span>
          <input
            type="time"
            value={draft.startTime}
            disabled={isPending}
            onChange={(event) =>
              setDraft((current) => (current ? { ...current, startTime: event.target.value } : current))
            }
          />
          <small style={{ color: "#5b6475" }}>
            Leave blank to keep this as a day-level scheduled item that only uses the time bucket.
          </small>
        </label>

        <label style={{ display: "grid", gap: "6px" }}>
          <span>Notes</span>
          <textarea
            rows={4}
            placeholder={selectedJob?.description ?? "Optional planning notes"}
            value={draft.notes}
            disabled={isPending}
            onChange={(event) =>
              setDraft((current) => (current ? { ...current, notes: event.target.value } : current))
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
          {selectedJob ? (
            <div style={{ display: "grid", gap: "10px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "8px" }}>
                <div>
                  <div style={{ color: "#5b6475", fontSize: "12px" }}>Estimated Hours</div>
                  <strong style={{ color: "#172033" }}>{capacity?.estimatedHours ? `${capacity.estimatedHours}h` : "Not set"}</strong>
                </div>
                <div>
                  <div style={{ color: "#5b6475", fontSize: "12px" }}>Assigned Crew</div>
                  <strong style={{ color: "#172033" }}>
                    {capacity
                      ? capacity.assignedCrewCount > 0
                        ? `${capacity.assignedCrewCount}`
                        : "Crew TBD (planning as 1)"
                      : "—"}
                  </strong>
                </div>
                <div>
                  <div style={{ color: "#5b6475", fontSize: "12px" }}>Days Needed</div>
                  <strong style={{ color: "#172033" }}>
                    {capacity?.daysNeededRaw ? `${capacity.daysNeededRaw.toFixed(2)} days` : "—"}
                  </strong>
                </div>
                <div>
                  <div style={{ color: "#5b6475", fontSize: "12px" }}>Suggested End</div>
                  <strong style={{ color: "#172033" }}>{capacity?.suggestedEndDate ?? "—"}</strong>
                </div>
              </div>
              {capacity?.daysNeededRounded && capacity.daysNeededRounded > 1 ? (
                <div style={{ color: "#172033" }}>
                  This job is estimated to take {capacity.daysNeededRounded} workdays with the current crew.
                </div>
              ) : (
                <div>Default duration comes from estimated hours and assigned crew. You can still override it manually.</div>
              )}
            </div>
          ) : (
            "Choose a job to see its planning defaults."
          )}
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button
            onClick={() => void onSubmit(draft)}
            disabled={isPending}
            style={{ fontWeight: 600 }}
          >
            {isPending ? "Saving..." : draft.scheduleBlockId ? "Save Changes" : "Schedule Job"}
          </button>
          {!draft.scheduleBlockId && onAutoFillDays ? (
            <button
              type="button"
              onClick={() => void onAutoFillDays(draft)}
              disabled={isPending}
            >
              {isPending ? "Saving..." : "Auto-fill Days"}
            </button>
          ) : null}
          {!draft.scheduleBlockId && onAutoFillNextAvailable ? (
            <button
              type="button"
              onClick={() => void onAutoFillNextAvailable(draft)}
              disabled={isPending}
            >
              {isPending ? "Saving..." : "Next Available"}
            </button>
          ) : null}
          {draft.scheduleBlockId && onDelete ? (
            <button
              onClick={() => void onDelete()}
              disabled={isPending}
              style={{ color: "#b42318" }}
            >
              {isPending ? "Working..." : "Delete Block"}
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
