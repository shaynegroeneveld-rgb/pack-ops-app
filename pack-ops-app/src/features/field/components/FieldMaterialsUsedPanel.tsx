import { useEffect, useMemo, useRef, useState } from "react";
import type { JobMaterialView } from "@/domain/jobs/types";
import type { AssemblyView, CatalogItem } from "@/domain/materials/types";
import { rankCatalogItems } from "@/services/materials/material-search";
import { parseMaterialQuantity } from "@/services/jobs/job-organization";
import { createId } from "@/lib/create-id";
import "@/features/jobs/components/job-organization.css";

interface FieldMaterialsUsedPanelProps {
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
  const [draft, setDraft] = useState<Draft>(() => readDraft(storageKey));
  const [search, setSearch] = useState("");
  const [resultLimit, setResultLimit] = useState(12);
  useEffect(() => setResultLimit(12), [search]);
  const [tab, setTab] = useState<"job" | "all" | "assemblies">("job");
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
  const selected = catalogById.get(draft.materialId);
  const quantity = parseMaterialQuantity(draft.quantity);
  const allParts = [
    ...new Set([
      "General",
      ...parts,
      ...usedMaterials.map((x) => x.sectionName?.trim() || "General"),
      draft.part,
    ]),
  ];
  const suggestedIds = [
    ...new Set([
      ...plannedMaterialIds,
      ...[...usedMaterials]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((x) => String(x.catalogItemId)),
    ]),
  ];
  const resultItems = (
    search.trim()
      ? rankCatalogItems(catalogItems, search)
      : tab === "job"
        ? suggestedIds
            .map((id) => catalogById.get(id))
            .filter((x): x is CatalogItem => !!x)
        : catalogItems
  ).filter((x) => x.isActive);
  const recent = [...usedMaterials]
    .filter(
      (x) =>
        logPart === "all" || (x.sectionName?.trim() || "General") === logPart,
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  useEffect(() => {
    try {
      if (draft.materialId)
        localStorage.setItem(storageKey, JSON.stringify(draft));
      else localStorage.removeItem(storageKey);
    } catch {
      setStorageAvailable(false);
    }
  }, [storageKey, draft]);
  useEffect(() => {
    const prevent = (e: BeforeUnloadEvent) => {
      if (draft.materialId || pending) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [draft.materialId, pending]);
  function choose(item: CatalogItem) {
    setDraft({ ...blank(), materialId: String(item.id), part: draft.part });
    setMessage("");
    setError("");
  }
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
  async function add() {
    if (!selected || quantity === null) return;
    const captured = { ...draft };
    const item = selected;
    await run(
      () =>
        onCreateUsedMaterial({
          jobId,
          requestId: captured.requestId,
          catalogItemId: String(item.id),
          kind: "used",
          quantity,
          displayName: item.name,
          skuSnapshot: item.sku,
          unitSnapshot: item.unit,
          unitCost: item.costPrice,
          unitSell: item.unitPrice,
          note: captured.note.trim() || null,
          sectionName: captured.part === "General" ? null : captured.part,
        }),
      () => {
        setDraft({ ...blank(), part: captured.part });
        setSearch("");
        setMessage(
          `Added ${quantity} ${item.unit} of ${item.name} to ${captured.part}.`,
        );
        try {
          localStorage.removeItem(storageKey);
        } catch {
          /* UI still reports saved server result. */
        }
      },
    );
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
            Choose the item, enter what you used, then save. Each entry stays
            with its job part.
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
      {draft.materialId && (
        <form
          className="job-task-form"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <strong>
            {selected?.name ??
              "Previously selected material is no longer available"}
          </strong>
          {selected && (
            <p className="job-muted">
              {selected.sku ?? "No SKU"} · Priced and counted in {selected.unit}
            </p>
          )}
          <div className="job-form-grid">
            <label>
              Quantity used {selected ? `(${selected.unit})` : ""}
              <input
                inputMode="decimal"
                value={draft.quantity}
                onChange={(e) =>
                  setDraft({ ...draft, quantity: e.target.value })
                }
                disabled={pending}
                required
                aria-invalid={quantity === null}
              />
            </label>
            <label>
              Job part
              <select
                value={draft.part}
                onChange={(e) => setDraft({ ...draft, part: e.target.value })}
                disabled={pending}
              >
                {allParts.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
          </div>
          {quantity === null && (
            <p className="job-error">
              Enter a quantity greater than zero, with up to 2 decimal places.
            </p>
          )}
          <details>
            <summary>Add a note / location</summary>
            <textarea
              aria-label="Material note or location"
              rows={2}
              value={draft.note}
              disabled={pending}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              placeholder="e.g. Suite kitchen, east wall"
            />
          </details>
          <p className="job-muted">
            {storageAvailable
              ? "Draft kept on this device until you save. It is not in the job yet."
              : "Device storage is unavailable. Keep this page open until you save."}
          </p>
          <div className="job-chips">
            <button
              className="job-primary"
              disabled={pending || !selected || quantity === null}
              type="submit"
            >
              {pending
                ? "Saving…"
                : `Add ${quantity ?? ""} ${selected?.unit ?? ""} used`}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setDraft({ ...blank(), part: draft.part })}
            >
              Discard entry
            </button>
          </div>
        </form>
      )}
      <label>
        Find a material
        <input
          type="search"
          placeholder="Name, nickname or supplier code"
          value={search}
          disabled={pending}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <div className="job-chips" aria-label="Material sources">
        {(
          [
            ["job", "On this job"],
            ["all", "All materials"],
            ["assemblies", "Browse assemblies"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab !== "assemblies" ? (
        <div className="job-task-list">
          {resultItems.slice(0, resultLimit).map((item) => (
            <article className="job-task" key={item.id}>
              <div>
                <strong>{item.name}</strong>
                <p className="job-muted">
                  {item.sku ?? "No SKU"} · {item.unit}
                </p>
              </div>
              <button
                type="button"
                disabled={pending || !!draft.materialId}
                onClick={() => choose(item)}
                aria-label={`Choose ${item.name}`}
              >
                Choose
              </button>
            </article>
          ))}
          {resultItems.length === 0 && (
            <p className="job-muted">
              {search
                ? "No matching material. Try a nickname or code; add a job note if the office needs to create it."
                : "No materials on this job yet. Search or choose All materials."}
            </p>
          )}
          {resultItems.length > resultLimit && (
            <p className="job-muted">
              Showing {resultLimit} of {resultItems.length}.{" "}
              <button
                type="button"
                onClick={() => setResultLimit((n) => n + 12)}
              >
                Show more matches
              </button>
            </p>
          )}
        </div>
      ) : (
        <div className="job-task-list">
          {assemblies
            .filter(
              (a) =>
                !search.trim() ||
                a.name.toLowerCase().includes(search.toLowerCase()),
            )
            .slice(0, 12)
            .map((a) => (
              <details key={a.id}>
                <summary>
                  {a.name} · {a.items.length} materials
                </summary>
                <p className="job-muted">
                  Choose only the materials actually used. This does not add the
                  whole assembly.
                </p>
                {a.items.map((line, i) => {
                  const item = catalogById.get(String(line.catalogItemId));
                  return item ? (
                    <div key={`${line.id}-${i}`} className="job-task">
                      <div>
                        <strong>{item.name}</strong>
                        <p className="job-muted">{item.unit}</p>
                      </div>
                      <button
                        type="button"
                        disabled={pending || !!draft.materialId}
                        onClick={() => choose(item)}
                      >
                        Choose
                      </button>
                    </div>
                  ) : null;
                })}
              </details>
            ))}
        </div>
      )}
      <details open className="job-task-form">
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
