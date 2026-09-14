import * as React from 'react';

type Point = { x: number; y: number };
type View = { zoom: number; pan: Point };
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 6;
export function zoomAt(view: View, requestedZoom: number, anchor: Point): View {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, requestedZoom));
  const ratio = zoom / view.zoom;
  return { zoom, pan: { x: anchor.x - (anchor.x - view.pan.x) * ratio, y: anchor.y - (anchor.y - view.pan.y) * ratio } };
}
export function wheelPixels(event: Pick<WheelEvent, 'deltaX' | 'deltaY' | 'deltaMode'>, height: number): Point {
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1;
  return { x: event.deltaX * unit, y: event.deltaY * unit };
}
const isControl = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest('button,input,select,textarea,a,.floating-catalog,.navigation-controls'));

export function usePlanNavigation(viewerRef: React.RefObject<HTMLElement | null>, panReady: boolean, enabled: boolean, onNavigate: () => void) {
  const [view, setView] = React.useState<View>({ zoom: 1, pan: { x: 0, y: 0 } });
  const latest = React.useRef(view);
  const enabledRef = React.useRef(enabled);
  enabledRef.current = enabled;
  const [isPanning, setIsPanning] = React.useState(false);
  const pointers = React.useRef(new Map<number, Point>());
  const gesture = React.useRef<{ start: Point; view: View; distance?: number } | null>(null);
  const suppressClick = React.useRef(false);
  const update = React.useCallback((next: View) => { latest.current = next; setView(next); }, []);
  const setZoom = (value: React.SetStateAction<number>) => update(zoomAt(latest.current, typeof value === 'function' ? value(latest.current.zoom) : value, { x: 0, y: 0 }));
  const setPan = (value: React.SetStateAction<Point>) => update({ ...latest.current, pan: typeof value === 'function' ? value(latest.current.pan) : value });
  const anchor = (point: Point) => {
    const rect = viewerRef.current!.getBoundingClientRect();
    return { x: point.x - rect.left - rect.width / 2, y: point.y - rect.top - rect.height / 2 };
  };
  const cancel = () => { pointers.current.clear(); gesture.current = null; setIsPanning(false); };
  React.useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const wheel = (event: WheelEvent) => {
      if (!enabledRef.current || isControl(event.target)) return;
      event.preventDefault();
      const delta = wheelPixels(event, viewer.clientHeight);
      if (event.ctrlKey || event.metaKey || event.shiftKey) {
        const amount = Math.abs(delta.y) >= Math.abs(delta.x) ? delta.y : delta.x;
        const rect = viewer.getBoundingClientRect();
        update(zoomAt(latest.current, latest.current.zoom * Math.exp(-amount * 0.003), { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 }));
      } else update({ ...latest.current, pan: { x: latest.current.pan.x - delta.x, y: latest.current.pan.y - delta.y } });
    };
    viewer.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('blur', cancel);
    return () => { viewer.removeEventListener('wheel', wheel); window.removeEventListener('blur', cancel); };
  }, [viewerRef, update]);
  const startPinch = () => {
    const [a, b] = [...pointers.current.values()];
    if (!a || !b) return;
    gesture.current = { start: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), view: latest.current };
    suppressClick.current = true;
  };
  const bind = {
    onPointerDownCapture(event: React.PointerEvent<HTMLElement>) {
      if (!enabled || isControl(event.target) || (event.button !== 0 && event.button !== 1)) return;
      if (!pointers.current.size) suppressClick.current = false;
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.current.size >= 2 || panReady || event.button === 1) {
        event.preventDefault(); event.stopPropagation(); onNavigate();
        event.currentTarget.setPointerCapture(event.pointerId);
        if (pointers.current.size >= 2) {
          for (const id of pointers.current.keys()) event.currentTarget.setPointerCapture(id);
          startPinch();
        }
        else gesture.current = { start: { x: event.clientX, y: event.clientY }, view: latest.current };
        suppressClick.current = true;
        setIsPanning(true);
      }
    },
    onPointerMoveCapture(event: React.PointerEvent<HTMLElement>) {
      if (!pointers.current.has(event.pointerId)) return;
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const active = gesture.current;
      if (!active) return;
      event.preventDefault(); event.stopPropagation();
      if (active.distance && pointers.current.size >= 2) {
        const [a, b] = [...pointers.current.values()];
    if (!a || !b) return;
        const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const next = zoomAt(active.view, active.view.zoom * Math.hypot(b.x - a.x, b.y - a.y) / active.distance, anchor(active.start));
        next.pan.x += center.x - active.start.x; next.pan.y += center.y - active.start.y;
        update(next);
      } else update({ ...latest.current, pan: { x: active.view.pan.x + event.clientX - active.start.x, y: active.view.pan.y + event.clientY - active.start.y } });
    },
    onPointerUpCapture(event: React.PointerEvent<HTMLElement>) {
      pointers.current.delete(event.pointerId);
      if (!gesture.current) return;
      event.stopPropagation();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      const remaining = [...pointers.current.values()][0];
      if (remaining) gesture.current = { start: remaining, view: latest.current };
      else { gesture.current = null; setIsPanning(false); }
    },
    onPointerCancel: cancel,
    onLostPointerCapture(event: React.PointerEvent<HTMLElement>) { if (pointers.current.has(event.pointerId)) cancel(); },
    onClickCapture(event: React.MouseEvent<HTMLElement>) { if (suppressClick.current && !isControl(event.target)) { event.preventDefault(); event.stopPropagation(); } },
    onAuxClick(event: React.MouseEvent<HTMLElement>) { if (event.button === 1) event.preventDefault(); },
  };
  return { ...view, setZoom, setPan, isPanning, bind, fit: () => update({ zoom: 1, pan: { x: 0, y: 0 } }) };
}
