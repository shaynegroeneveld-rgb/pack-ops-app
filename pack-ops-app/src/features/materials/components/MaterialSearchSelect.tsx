import { forwardRef, useEffect, useImperativeHandle, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { rankCatalogItems, type MaterialSearchItem } from "@/services/materials/material-search";

export interface MaterialSearchSelectHandle { focus: () => void; clear: () => void; }
export interface MaterialSearchOption extends MaterialSearchItem { id: string; unit?: string; secondaryLabel?: string; }
interface MaterialSearchSelectProps {
  catalogItems: MaterialSearchOption[];
  selectedMaterialId: string;
  isPending: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  label?: string;
  onSelect: (materialId: string) => void;
}
export const MaterialSearchSelect = forwardRef<MaterialSearchSelectHandle, MaterialSearchSelectProps>(function MaterialSearchSelect(
  { catalogItems, selectedMaterialId, isPending, placeholder = 'Search name, SKU, size, or nickname…', autoFocus = false, label = 'Search materials', onSelect }, ref,
) {
  const supportsPopover = typeof HTMLElement !== 'undefined' && 'showPopover' in HTMLElement.prototype;
  const selected = catalogItems.find(item => item.id === selectedMaterialId);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [limit, setLimit] = useState(12);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0, maxHeight: 320 });
  const inputRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const matched = useMemo(() => rankCatalogItems(catalogItems, query), [catalogItems, query]);
  const visible = matched.slice(0, limit);
  function close() { setOpen(false); setActive(-1); }
  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus(), clear: () => { setQuery(''); close(); } }), []);
  useEffect(() => { if (autoFocus) inputRef.current?.focus(); }, [autoFocus]);
  useEffect(() => { setLimit(12); setActive(-1); }, [query]);
  useEffect(() => { if (isPending) close(); }, [isPending]);
  useEffect(() => { if (active >= visible.length) setActive(-1); }, [active, visible.length]);
  useEffect(() => { if (active >= 0) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: 'nearest' }); }, [active, id]);
  useLayoutEffect(() => {
    if (!open) return;
    const reposition = () => {
      const box = inputRef.current?.getBoundingClientRect();
      if (!box) return;
      const viewport = window.visualViewport;
      const topEdge = viewport?.offsetTop ?? 0;
      const bottomEdge = topEdge + (viewport?.height ?? window.innerHeight);
      const below = bottomEdge - box.bottom - 12, above = box.top - topEdge - 12;
      const upwards = below < 180 && above > below;
      const maxHeight = Math.max(64, Math.min(320, upwards ? above : below));
      setPosition({ left: Math.max(8, box.left), top: upwards ? Math.max(topEdge + 8, box.top - maxHeight - 4) : box.bottom + 4, width: Math.min(box.width, window.innerWidth - 16), maxHeight });
    };
    if (supportsPopover) popupRef.current?.showPopover();
    reposition();
    const outside = (event: PointerEvent) => {
      if (!inputRef.current?.contains(event.target as Node) && !popupRef.current?.contains(event.target as Node)) close();
    };
    // Capturing scroll also follows scrollable job cards and quote sections.
    const onScroll = (event: Event) => { if (!popupRef.current?.contains(event.target as Node)) reposition(); };
    window.addEventListener('scroll', onScroll, true); window.addEventListener('resize', reposition);
    window.visualViewport?.addEventListener('resize', reposition); window.visualViewport?.addEventListener('scroll', reposition);
    document.addEventListener('pointerdown', outside);
    return () => { window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', reposition); window.visualViewport?.removeEventListener('resize', reposition); window.visualViewport?.removeEventListener('scroll', reposition); document.removeEventListener('pointerdown', outside); };
  }, [open, supportsPopover]);
  function choose(item: MaterialSearchOption) { if (isPending) return; onSelect(item.id); inputRef.current?.focus({ preventScroll: true }); setQuery(''); close(); }
  return <div style={{ position: 'relative', minWidth: 0 }}>
    <input ref={inputRef} role="combobox" aria-label={label} aria-autocomplete="list" aria-expanded={open} aria-controls={open ? id : undefined}
      aria-activedescendant={open && active >= 0 && visible[active] ? `${id}-${active}` : undefined}
      autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false}
      disabled={isPending} placeholder={placeholder} style={{ fontSize: 16, padding: 12, width: '100%', boxSizing: 'border-box' }}
      value={open ? query : selected ? `${selected.name}${selected.sku ? ` (${selected.sku})` : ''}` : query}
      onFocus={() => { if (!open) { setQuery(''); setActive(-1); } setOpen(true); }}
      onClick={() => setOpen(true)}
      onChange={event => { setQuery(event.target.value); setOpen(true); }}
      onBlur={event => { if (!popupRef.current?.contains(event.relatedTarget)) close(); }}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); }
        if (event.key === 'Tab') close();
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); setOpen(true);
          const next = event.key === 'ArrowDown' ? Math.min(active + 1, matched.length - 1) : active < 0 ? visible.length - 1 : Math.max(active - 1, 0);
          if (next >= limit) setLimit(value => value + 12);
          setActive(next);
        }
        if (event.key === 'Enter' && open) {
          event.preventDefault();
          const item = visible[active] ?? (matched.length === 1 ? matched[0] : undefined);
          if (item) choose(item);
        }
      }} />
    {open && createPortal(<div ref={popupRef} popover={supportsPopover ? "manual" : undefined} style={{ margin: 0, padding: 0, boxSizing: "border-box", position: 'fixed', ...position, overflowY: 'auto', overscrollBehavior: 'contain', zIndex: 10000, border: '1px solid #cbd5e1', borderRadius: 12, background: '#fff', boxShadow: '0 10px 30px #17203325' }}>
      <div role="status" style={{ padding: '8px 12px', fontSize: 12, color: '#5b6475', borderBottom: '1px solid #eef2f7' }}>
        {matched.length ? `${matched.length} ${matched.length === 1 ? 'match' : 'matches'}${query.trim() ? ' · best matches first' : ' · type to narrow the list'}` : 'No matches. Try a shorter name, SKU, or nickname.'}
      </div>
      <div id={id} role="listbox" aria-label={label === 'Search materials' ? 'Material matches' : 'Assembly matches'}>
        {visible.map((item, index) => <button key={item.id} id={`${id}-${index}`} role="option" aria-selected={active === index} tabIndex={-1} type="button"
          onMouseDown={event => event.preventDefault()} onClick={() => choose(item)}
          style={{ width: '100%', minHeight: 52, textAlign: 'left', border: 0, borderBottom: '1px solid #eef2f7', background: active === index || selectedMaterialId === item.id ? '#eef4ff' : '#fff', padding: '10px 12px', display: 'grid', gap: 3, cursor: 'pointer' }}>
          <strong style={{ color: '#172033', overflowWrap: 'anywhere' }}>{item.name}</strong>
          <span style={{ color: '#5b6475', fontSize: 13 }}>{item.secondaryLabel ?? [item.sku, item.category, item.unit].filter(Boolean).join(' · ')}</span>
          {!!item.aliases?.length && <span style={{ color: '#64748b', fontSize: 12, overflowWrap: 'anywhere' }}>Also: {item.aliases.slice(0, 3).join(', ')}</span>}
        </button>)}
      </div>
      {matched.length > limit && <button type="button" tabIndex={-1} onMouseDown={event => event.preventDefault()} onClick={() => { setLimit(value => value + 12); inputRef.current?.focus({ preventScroll: true }); }} style={{ width: '100%', padding: 12, minHeight: 44, border: 0, color: '#163fcb', background: '#f3f6fb' }}>Show more ({matched.length - limit} remaining)</button>}
    </div>, (supportsPopover ? inputRef.current?.closest('[role="dialog"],dialog') : null) ?? document.body)}
  </div>;
});
