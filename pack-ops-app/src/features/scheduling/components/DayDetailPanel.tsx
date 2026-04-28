import type { Job } from "@/domain/jobs/types";
import type { UserId } from "@/domain/ids";
import type { ScheduleBlock } from "@/domain/scheduling/types";
import type { DailyJobGroup } from "@/domain/scheduling/board-groups";

interface DayDetailPanelProps {
  day: Date | null;
  groups: DailyJobGroup[];
  userNamesById: Map<UserId, string>;
  canManageSchedule: boolean;
  pendingGroupAction: { groupKey: string; action: string } | null;
  isRecalculating: boolean;
  onClose: () => void;
  onStartWork: (jobId: Job["id"]) => void;
  onEdit: (block: ScheduleBlock) => void;
  onMoveToday: (group: DailyJobGroup) => void;
  onMoveTomorrow: (group: DailyJobGroup) => void;
  onCarryOver: (group: DailyJobGroup) => void;
  onUnschedule: (group: DailyJobGroup) => void;
  onRecalculate: (group: DailyJobGroup) => void;
}

function getDayHeading(day: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(day);
}

function formatCrewNames(
  scheduledUserIds: Array<UserId | null>,
  userNamesById: Map<UserId, string>,
): string {
  if (scheduledUserIds.length === 0) return "Unassigned";
  return scheduledUserIds
    .map((id) => (id ? (userNamesById.get(id) ?? id.slice(0, 8)) : "Unassigned"))
    .join(", ");
}

export function DayDetailPanel({
  day,
  groups,
  userNamesById,
  canManageSchedule,
  pendingGroupAction,
  isRecalculating,
  onClose,
  onStartWork,
  onEdit,
  onMoveToday,
  onMoveTomorrow,
  onCarryOver,
  onUnschedule,
  onRecalculate,
}: DayDetailPanelProps) {
  if (!day) {
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
        zIndex: 22,
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: "760px",
          maxHeight: "min(90vh, 860px)",
          overflow: "auto",
          border: "1px solid #d9dfeb",
          borderRadius: "18px",
          padding: "18px",
          background: "#fff",
          display: "grid",
          gap: "16px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "start" }}>
          <div>
            <h3 style={{ margin: 0 }}>Day Detail</h3>
            <p style={{ margin: "4px 0 0", color: "#5b6475" }}>{getDayHeading(day)}</p>
          </div>
          <button onClick={onClose}>Close</button>
        </div>

        {groups.length === 0 ? (
          <div
            style={{
              border: "1px dashed #d9dfeb",
              borderRadius: "12px",
              padding: "14px",
              background: "#fafcff",
              color: "#5b6475",
            }}
          >
            Nothing is scheduled for this day yet.
          </div>
        ) : null}

        <div style={{ display: "grid", gap: "12px" }}>
          {groups.map((group) => {
            const isPending = pendingGroupAction?.groupKey === group.key;
            const crewLabel = formatCrewNames(group.scheduledUserIds, userNamesById);

            return (
              <article
                key={group.key}
                style={{
                  border: group.hasConflict
                    ? "2px solid #b42318"
                    : group.isNextForJob
                      ? "2px solid #1b4dff"
                      : "1px solid #d9dfeb",
                  borderRadius: "14px",
                  padding: "14px",
                  background: "#ffffff",
                  display: "grid",
                  gap: "8px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "start" }}>
                  <div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                      <strong style={{ fontSize: "14px" }}>{group.job.number}</strong>
                      <span
                        style={{
                          fontSize: "12px",
                          color: "#163fcb",
                          background: "#eef2ff",
                          borderRadius: "999px",
                          padding: "2px 8px",
                          fontWeight: 600,
                        }}
                      >
                        Day {group.dayIndex} of {group.totalDays}
                      </span>
                    </div>
                    <div style={{ fontWeight: 600, fontSize: "15px", marginTop: "3px" }}>{group.job.title}</div>
                  </div>
                  <div style={{ color: "#163fcb", fontWeight: 700, fontSize: "15px", whiteSpace: "nowrap" }}>
                    {group.totalHoursThisDay}h
                  </div>
                </div>

                <div style={{ color: "#334155", fontSize: "13px" }}>
                  <strong>Crew:</strong> {crewLabel}
                </div>

                {group.estimatedHours ? (
                  <div style={{ color: "#5b6475", fontSize: "12px" }}>
                    {group.estimatedHours}h total ·{" "}
                    {group.assignments.length > 0
                      ? `${group.assignments.length} assigned`
                      : "crew TBD"}
                  </div>
                ) : null}

                {group.unavailableWorkerIds.length > 0 ? (
                  <div
                    style={{
                      background: "#fff1f1",
                      border: "1px solid #fca5a5",
                      borderRadius: "8px",
                      padding: "6px 10px",
                      fontSize: "12px",
                      color: "#991b1b",
                    }}
                  >
                    Away today:{" "}
                    {group.unavailableWorkerIds
                      .map((id) => userNamesById.get(id) ?? id.slice(0, 8))
                      .join(", ")}
                  </div>
                ) : null}

                {group.hasConflict ? (
                  <div style={{ color: "#b42318", fontSize: "13px", fontWeight: 700 }}>
                    {group.isMissingRequiredCrew
                      ? "Full crew missing · Recalculation needed"
                      : "Worker off · Recalculation needed"}
                  </div>
                ) : group.needsCrewRecalculation ? (
                  <div style={{ color: "#92400e", fontSize: "13px", fontWeight: 700 }}>
                    Crew assigned · Recalculate to assign workers
                  </div>
                ) : group.isAutoFilled ? (
                  <div style={{ color: "#1f6b37", fontSize: "13px", fontWeight: 700 }}>Auto-filled</div>
                ) : null}

                {group.requiresFullCrewTogether ? (
                  <div style={{ color: "#445168", fontSize: "13px", fontWeight: 700 }}>
                    Full crew required
                  </div>
                ) : null}

                {group.isSplitDay ? (
                  <div style={{ color: "#92400e", fontSize: "13px", fontWeight: 700 }}>
                    Day split · {group.totalHoursThisDay}h scheduled
                  </div>
                ) : null}

                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button onClick={() => onStartWork(group.jobId)}>Start Work</button>
                  {canManageSchedule ? (
                    <>
                      <button onClick={() => onEdit(group.blocks[0]!)} disabled={isPending}>
                        Edit
                      </button>
                      <button onClick={() => onMoveToday(group)} disabled={isPending}>
                        {isPending && pendingGroupAction?.action === "today" ? "Moving..." : "Today"}
                      </button>
                      <button onClick={() => onMoveTomorrow(group)} disabled={isPending}>
                        {isPending && pendingGroupAction?.action === "tomorrow" ? "Moving..." : "Tomorrow"}
                      </button>
                      <button onClick={() => onCarryOver(group)} disabled={isPending}>
                        {isPending && pendingGroupAction?.action === "carryover" ? "Moving..." : "Carry Over"}
                      </button>
                      <button
                        onClick={() => onRecalculate(group)}
                        disabled={isPending || isRecalculating}
                      >
                        {isRecalculating ? "Reflowing..." : "Recalculate"}
                      </button>
                      <button onClick={() => onUnschedule(group)} disabled={isPending}>
                        {isPending && pendingGroupAction?.action === "unschedule"
                          ? "Unscheduling..."
                          : "Unschedule Day"}
                      </button>
                    </>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
