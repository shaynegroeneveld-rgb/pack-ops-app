import { AssemblyMaterialCounters } from "./AssemblyMaterialCounters";
import { useEffect, useMemo, useRef, useState } from "react";
import type { JobMaterialView } from "@/domain/jobs/types";
import type { AssemblyView, CatalogItem } from "@/domain/materials/types";
import { parseMaterialQuantity } from "@/services/jobs/job-organization";
import { createId } from "@/lib/create-id";
import "@/features/jobs/components/job-organization.css";

interface FieldMaterialsUsedPanelProps {
  onCounterSaved?: () => void;
  jobId: string;
  draftScope: string;
  parts: string[];
  plannedMaterialIds?: string[];
  catalogItems: CatalogItem[];
  assemblies: AssemblyView[];
  usedMaterials: JobMaterialView[];
  onCreateUsedMaterial: (input: {
    jobId: string;
    requestId?: string;
    catalogItemId: string;
    kind: "used";
    quantity: number;
    note?: string | null;
    displayName?: string | null;
    skuSnapshot?: string | null;
    unitSnapshot?: string | null;
    unitCost?: number | null;
    unitSell?: number | null;
    markupPercent?: number | null;
    sectionName?: string | null;
    sourceAssemblyId?: string | null;
    sourceAssemblyName?: string | null;
    sourceAssemblyMultiplier?: number | null;
  }) => Promise<unknown>;
  onUpdateUsedMaterial: (input: {
    jobMaterialId: string;
    catalogItemId: string;
    quantity: number;
    note?: string | null;
    displayName?: string | null;
    skuSnapshot?: string | null;
    unitSnapshot?: string | null;
    unitCost?: number | null;
    unitSell?: number | null;
    markupPercent?: number | null;
    sectionName?: string | null;
  }) => Promise<unknown>;
  onDeleteUsedMaterial: (jobMaterialId: string) => Promise<unknown>;
}

interface Draft {
  materialId: string;
  quantity: string;
  part: string;
  note: string;
  requestId: string;
}
const blank = (): Draft => ({
  materialId: "",
  quantity: "1",
  part: "General",
  note: "",
  requestId: createId(),
});
function readDraft(key: string): Draft {
  try {
    const d = JSON.parse(localStorage.getItem(key) ?? "null");
    if (
      d &&
      [d.materialId, d.quantity, d.part, d.note, d.requestId].every(
        (x) => typeof x === "string",
      )
    )
      return d;
  } catch {
    /* Storage can be unavailable in private browsing. */
  }
  return blank();
}
export function FieldMaterialsUsedPanel(props: FieldMaterialsUsedPanelProps) {
  // A new job/user gets a separate draft and component lifetime.
  return (
    <MaterialEntry key={`${props.draftScope}:${props.jobId}`} {...props} />
  );
}
function MaterialEntry({
  onCounterSaved,
  jobId,
  draftScope,
  parts,
  plannedMaterialIds = [],
  catalogItems,
  assemblies,
  usedMaterials,
  onCreateUsedMaterial,
  onUpdateUsedMaterial,
  onDeleteUsedMaterial,
}: FieldMaterialsUsedPanelProps) {
  const storageKey = `pack-ops:material-draft:${draftScope}:${jobId}`;
  const [draft, setDraft] = useState<Draft>(() => { const saved=readDraft(storageKey);try { saved.part=localStorage.getItem(`${storageKey}:part`) || saved.part; } catch {} return saved; });
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editQty, setEditQty] = useState("");
  const [editPart, setEditPart] = useState("General");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [logPart, setLogPart] = useState("all");
  const [storageAvailable, setStorageAvailable] = useState(true);
  const catalogById = useMemo(
    () => new Map(catalogItems.map((x) => [String(x.id), x])),
    [catalogItems],
  );
  const allParts = [
    ...new Set([
      "General",
      ...parts,
      ...usedMaterials.map((x) => x.sectionName?.trim() || "General"),
      draft.part,
    ]),
  ];
  const recent = [...usedMaterials]
    .filter(
      (x) =>
        logPart === "all" || (x.sectionName?.trim() || "General") === logPart,
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  useEffect(() => {
    try { localStorage.setItem(`${storageKey}:part`, draft.part); } catch { /* Counter saves report storage errors separately. */ }
  }, [storageKey,draft.part]);
  async function run(action: () => Promise<unknown>, success: () => void) {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    setError("");
    setMessage("");
    try {
      await action();
      success();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not save. Your entry is still here. Check your connection and try again.",
      );
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  function saveEdit(line: JobMaterialView) {
    const qty = parseMaterialQuantity(editQty);
    if (qty === null) return;
    void run(
      () =>
        onUpdateUsedMaterial({
          jobMaterialId: line.id,
          catalogItemId: line.catalogItemId,
          quantity: qty,
          sectionName: editPart === "General" ? null : editPart,
        }),
      () => {
        setEditing(null);
        setMessage("Entry updated.");
      },
    );
  }
  return (
    <section
      className="job-organizer job-organizer--field field-materials"
      aria-label="Materials used"
    >
      <div className="job-organizer__heading">
        <div>
          <p className="job-eyebrow">Before you leave</p>
          <h2>Log materials used</h2>
          <p>
            Choose materials or an assembly, then count what you use. Tap a quantity to set it.
          </p>
        </div>
      </div>
      {error && (
        <p role="alert" className="job-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="job-done">
          {message}
        </p>
      )}
      <label>Job part<select value={draft.part} onChange={e=>setDraft({...draft,part:e.target.value})}>{allParts.map(p=><option key={p}>{p}</option>)}</select></label>
      <AssemblyMaterialCounters key={`${draftScope}:${jobId}:${draft.part}`} assemblies={assemblies} catalog={catalogItems} jobId={jobId} part={draft.part} scope={draftScope} onSaved={()=>{onCounterSaved?.();}} />
      <details className="job-task-form">
        <summary>Saved entries · {usedMaterials.length}</summary>
        {allParts.length > 1 && (
          <label>
            Show job part
            <select
              value={logPart}
              onChange={(e) => setLogPart(e.target.value)}
            >
              <option value="all">All parts</option>
              {allParts.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
        )}
        {recent.length === 0 && (
          <p className="job-muted">No materials saved in this view.</p>
        )}
        {recent.slice(0, showAll ? undefined : 8).map((line) => (
          <article className="job-task" key={line.id}>
            <div>
              <strong>{line.displayName ?? line.materialName}</strong>
              <p>
                {line.quantity} {line.unitSnapshot ?? line.materialUnit} ·{" "}
                {line.sectionName ?? "General"}
              </p>
              {line.note && <p className="job-muted">{line.note}</p>}
              <p className="job-muted">
                {new Date(line.createdAt).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
              {editing === line.id && (
                <div className="job-task-form">
                  <label>
                    Correct quantity
                    <input
                      inputMode="decimal"
                      value={editQty}
                      onChange={(e) => setEditQty(e.target.value)}
                      disabled={pending}
                    />
                  </label>
                  <label>
                    Job part
                    <select
                      value={editPart}
                      onChange={(e) => setEditPart(e.target.value)}
                      disabled={pending}
                    >
                      {allParts.map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={
                      pending || parseMaterialQuantity(editQty) === null
                    }
                    onClick={() => saveEdit(line)}
                  >
                    Save correction
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setEditing(null)}
                  >
                    Cancel
                  </button>
                </div>
              )}
              {deleteId === line.id && (
                <div role="group" aria-label="Confirm material removal">
                  <p>Remove this saved entry? Other entries will stay.</p>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      void run(
                        () => onDeleteUsedMaterial(line.id),
                        () => {
                          setDeleteId(null);
                          setMessage("Entry removed.");
                        },
                      )
                    }
                  >
                    Remove entry
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setDeleteId(null)}
                  >
                    Keep entry
                  </button>
                </div>
              )}
            </div>
            {editing !== line.id && deleteId !== line.id && (
              <div className="job-chips">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setEditing(line.id);
                    setEditQty(String(line.quantity));
                    setEditPart(line.sectionName ?? "General");
                    setDeleteId(null);
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setDeleteId(line.id);
                    setEditing(null);
                  }}
                >
                  Remove
                </button>
              </div>
            )}
          </article>
        ))}
        {recent.length > 8 && (
          <button type="button" onClick={() => setShowAll(!showAll)}>
            {showAll ? "Show fewer" : `Show all ${recent.length}`}
          </button>
        )}
      </details>
    </section>
  );
}
