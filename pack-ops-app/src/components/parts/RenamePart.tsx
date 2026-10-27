import { useState } from "react";

/** Inline editing keeps the surrounding material/time entry form intact. */
export function RenamePart({ name, names, disabled, onRename }: {
  name: string; names: string[]; disabled?: boolean;
  onRename: (name: string) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    const next = value.trim();
    if (!next || /[\r\n]/.test(next)) { setError("Enter a part name on one line."); return; }
    if (names.some(item => item !== name && item.toLowerCase() === next.toLowerCase())) {
      setError("That part already exists. Choose a different name."); return;
    }
    if (next === name) { setEditing(false); return; }
    setBusy(true); setError("");
    try { await onRename(next); setEditing(false); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not rename the part. Try again."); }
    finally { setBusy(false); }
  }
  if (!editing) return <button type="button" disabled={disabled} onClick={() => {setValue(name); setError(""); setEditing(true);}} aria-label={`Rename ${name}`}>Rename</button>;
  return <span style={{display:"inline-flex", gap:8, flexWrap:"wrap", alignItems:"center"}}>
    <input autoFocus aria-label={`New name for ${name}`} maxLength={120} value={value} disabled={busy || disabled}
      onChange={e=>setValue(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault(); void save();} if(e.key==="Escape"&&!busy){e.preventDefault();setEditing(false);}}}/>
    <button type="button" disabled={busy || disabled} onClick={()=>void save()}>{busy ? "Saving…" : "Save name"}</button>
    <button type="button" disabled={busy} onClick={()=>setEditing(false)}>Cancel</button>
    {error && <span role="alert" style={{color:"#b42318"}}>{error}</span>}
  </span>;
}
