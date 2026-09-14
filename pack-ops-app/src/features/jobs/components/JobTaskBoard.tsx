import { createId } from "@/lib/create-id";
import { useMemo, useRef, useState } from "react";
import type { ActionItem } from "@/domain/action-items/types";
import type { User } from "@/domain/users/types";
import { canResolveWorkbenchActionItem } from "@/services/permissions/workbench-permissions";
import {
  isOverdue,
  isTaskOpen,
  jobTasks,
  readTaskContext,
  writeTaskContext,
} from "@/services/jobs/job-organization";
import "./job-organization.css";

export interface JobTaskInput {
  requestId?: string;
  title: string;
  description: string;
  assignedTo?: string | null;
  dueAt?: string | null;
}
interface Props {
  jobId: string;
  items: ActionItem[];
  parts: string[];
  currentUser: User;
  crew: Array<{ id: string; label: string }>;
  canCreate: boolean;
  field?: boolean;
  onCreate: (input: JobTaskInput) => Promise<unknown>;
  onComplete: (item: ActionItem) => Promise<unknown>;
}
export function JobTaskBoard({
  jobId,
  items,
  parts,
  currentUser,
  crew,
  canCreate,
  field = false,
  onCreate,
  onComplete,
}: Props) {
  const requestId = useRef(createId());
  const [title, setTitle] = useState("");
  const [part, setPart] = useState("General");
  const [detail, setDetail] = useState("");
  const [assignee, setAssignee] = useState("");
  const [due, setDue] = useState("");
  const [adding, setAdding] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const lock = useRef(false);
  const tasks = jobTasks(items, jobId);
  const open = tasks.filter(isTaskOpen);
  const done = tasks.filter((x) => x.status === "resolved");
  const names = new Map(crew.map((x) => [x.id, x.label]));
  names.set(currentUser.id, currentUser.fullName);
  const allParts = useMemo(
    () =>
      Array.from(
        new Set([
          ...parts,
          ...tasks.map((t) => readTaskContext(t.description).part),
        ]),
      ),
    [parts, items, jobId],
  );
  const shown = tasks
    .filter(
      (t) =>
        (showDone || isTaskOpen(t)) &&
        (filter === "all" || readTaskContext(t.description).part === filter),
    )
    .sort(
      (a, b) =>
        Number(!isTaskOpen(a)) - Number(!isTaskOpen(b)) ||
        (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999") ||
        a.createdAt.localeCompare(b.createdAt),
    );
  async function create() {
    if (lock.current || !title.trim()) return;
    lock.current = true;
    setPending("new");
    setError("");
    try {
      const dueAt = due ? new Date(`${due}T23:59:59`).toISOString() : null;
      await onCreate({
        requestId: requestId.current,
        title: title.trim(),
        description: writeTaskContext(part, detail),
        assignedTo: assignee || null,
        dueAt,
      });
      requestId.current = createId();
      setTitle("");
      setDetail("");
      setDue("");
      setAdding(false);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not save the task. Your text is still here.",
      );
    } finally {
      lock.current = false;
      setPending(null);
    }
  }
  async function complete(item: ActionItem) {
    if (lock.current) return;
    lock.current = true;
    setPending(item.id);
    setError("");
    try {
      await onComplete(item);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not complete the task.");
    } finally {
      lock.current = false;
      setPending(null);
    }
  }
  return (
    <section
      className={`job-organizer ${field ? "job-organizer--field" : ""}`}
      aria-label="Job tasks"
    >
      <div className="job-organizer__heading">
        <div>
          <p className="job-eyebrow">Next steps</p>
          <h2>{field ? "Your tasks & job parts" : "Tasks & job parts"}</h2>
          <p>
            {open.length
              ? `${open.length} task${open.length === 1 ? "" : "s"} to do`
              : tasks.length
                ? "All listed tasks done"
                : "Keep a short checklist, or organize a bigger job by part."}
            {done.length > 0 ? ` · ${done.length} done` : ""}
          </p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => setAdding(!adding)}
            aria-expanded={adding}
          >
            {adding ? "Close form" : "+ Add task"}
          </button>
        )}
      </div>
      {allParts.length > 1 && (
        <div className="job-chips" aria-label="Filter tasks by job part">
          <button
            type="button"
            aria-pressed={filter === "all"}
            onClick={() => setFilter("all")}
          >
            All parts
          </button>
          {allParts.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={filter === p}
              onClick={() => setFilter(p)}
            >
              {p}{" "}
              <span>
                {
                  tasks.filter(
                    (t) =>
                      isTaskOpen(t) &&
                      readTaskContext(t.description).part === p,
                  ).length
                }
              </span>
            </button>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="job-error">
          {error}
        </p>
      )}
      {adding && (
        <form
          className="job-task-form"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <label>
            What needs doing?
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={160}
              placeholder="e.g. Finish panel labels"
              required
              autoFocus
              disabled={pending !== null}
            />
          </label>
          <div className="job-form-grid">
            <label>
              Job part <span className="job-muted">(optional)</span>
              <input
                list={`parts-${jobId}`}
                value={part}
                onChange={(e) => setPart(e.target.value)}
                maxLength={80}
                placeholder="General, Service, Rough-in…"
              />
              <datalist id={`parts-${jobId}`}>
                {allParts.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </label>
            <label>
              Who?
              <select
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
              >
                <option value="">Unassigned</option>
                {Array.from(names).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <details>
            <summary>Due date & instructions</summary>
            <label>
              Due date
              <input
                type="date"
                value={due}
                onChange={(e) => setDue(e.target.value)}
              />
            </label>
            <label>
              Instructions
              <textarea
                rows={3}
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                maxLength={4000}
              />
            </label>
          </details>
          <button
            className="job-primary"
            type="submit"
            disabled={pending !== null || !title.trim()}
          >
            {pending === "new" ? "Saving…" : "Save task"}
          </button>
        </form>
      )}
      <div className="job-task-list">
        {shown.map((t) => {
          const context = readTaskContext(t.description);
          const isOpen = isTaskOpen(t);
          return (
            <article
              key={t.id}
              className={`job-task ${isOpen ? "" : "job-task--done"}`}
            >
              <div>
                <strong>{t.title}</strong>
                <div className="job-task__meta">
                  <span>{context.part}</span>
                  <span>
                    {t.assignedTo
                      ? (names.get(t.assignedTo) ?? "Assigned crew member")
                      : "Unassigned"}
                  </span>
                  {t.dueAt && (
                    <span
                      className={
                        isOpen && isOverdue(t.dueAt) ? "job-overdue" : ""
                      }
                    >
                      Due{" "}
                      {new Date(t.dueAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  )}
                  {t.status === "snoozed" && <span>Snoozed</span>}
                </div>
                {context.detail && (
                  <p className="job-task__detail">{context.detail}</p>
                )}
              </div>
              {isOpen ? (
                canResolveWorkbenchActionItem(currentUser, t) ? (
                  <button
                    type="button"
                    disabled={pending !== null}
                    onClick={() => void complete(t)}
                    aria-label={`Mark ${t.title} done`}
                  >
                    {pending === t.id ? "Saving…" : "Mark done"}
                  </button>
                ) : (
                  <span className="job-muted">
                    With{" "}
                    {t.assignedTo
                      ? (names.get(t.assignedTo) ?? "assigned crew")
                      : "the office"}
                  </span>
                )
              ) : (
                <span className="job-done">✓ Done</span>
              )}
            </article>
          );
        })}
      </div>
      {shown.length === 0 && (
        <p className="job-muted">
          {tasks.length
            ? "No open tasks in this view."
            : canCreate
              ? "Add the next task. Small jobs can stay in General."
              : "No tasks assigned to you yet. Check the job notes for instructions."}
        </p>
      )}
      {done.length > 0 && (
        <button
          type="button"
          className="job-link"
          onClick={() => setShowDone(!showDone)}
          aria-expanded={showDone}
        >
          {showDone ? "Hide" : "Show"} completed tasks ({done.length})
        </button>
      )}
    </section>
  );
}
