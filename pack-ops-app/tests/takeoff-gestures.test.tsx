import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, expect, it, vi } from 'vitest';
import { usePlanNavigation } from '../takeoff-editor/src/use-plan-navigation';
beforeAll(() => {
  class TestPointerEvent extends MouseEvent { pointerId: number; constructor(type: string, input: PointerEventInit = {}) { super(type, input); this.pointerId = input.pointerId ?? 1; } }
  vi.stubGlobal('PointerEvent', TestPointerEvent);
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.releasePointerCapture = () => {};
});
function Harness({ ready = true }: { ready?: boolean }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [clicks, setClicks] = React.useState(0);
  const nav = usePlanNavigation(ref, ready, true, () => {});
  return <div ref={ref} data-testid="viewer" {...nav.bind}>
    <span data-testid="marker" onPointerDown={(e) => e.stopPropagation()} onClick={() => setClicks((v) => v + 1)}>Marker</span>
    <button>Control</button><output data-testid="view">{JSON.stringify({zoom:nav.zoom,pan:nav.pan,isPanning:nav.isPanning,clicks})}</output>
  </div>;
}
const state = () => JSON.parse(screen.getByTestId('view').textContent!);
it('pans over a room marker without activating it, and ends capture', () => {
  render(<Harness />); const marker = screen.getByTestId('marker');
  fireEvent.pointerDown(marker, { pointerId: 1, button: 0, clientX: 30, clientY: 50 });
  fireEvent.pointerMove(marker, { pointerId: 1, clientX: 80, clientY: 90 });
  fireEvent.pointerUp(marker, { pointerId: 1 }); fireEvent.click(marker);
  expect(state()).toMatchObject({ pan: { x: 50, y: 40 }, isPanning: false, clicks: 0 });
});
it('supports middle-button navigation while a drawing tool is selected', () => {
  render(<Harness ready={false} />); const viewer = screen.getByTestId('viewer');
  fireEvent.pointerDown(viewer, { button: 1, pointerId: 1, clientX: 0, clientY: 0 });
  fireEvent.pointerMove(viewer, { pointerId: 1, clientX: 75, clientY: 35 });
  fireEvent.pointerCancel(viewer, { pointerId: 1 });
  expect(state()).toMatchObject({ pan: { x: 75, y: 35 }, isPanning: false });
});
it('lets a normal drawing click through after a completed pan', () => {
  const {rerender} = render(<Harness />); const marker = screen.getByTestId('marker');
  fireEvent.pointerDown(marker, { button: 0, pointerId: 1 }); fireEvent.pointerUp(marker, { pointerId: 1 }); fireEvent.click(marker);
  rerender(<Harness ready={false} />);
  fireEvent.pointerDown(marker, { button: 0, pointerId: 2 }); fireEvent.pointerUp(marker, { pointerId: 2 }); fireEvent.click(marker);
  expect(state().clicks).toBe(1);
});
it('supports two-pointer pinch and cancels cleanly on window blur', () => {
  render(<Harness ready={false} />); const viewer = screen.getByTestId('viewer');
  fireEvent.pointerDown(viewer, { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
  fireEvent.pointerDown(viewer, { button: 0, pointerId: 2, clientX: 100, clientY: 0 });
  fireEvent.pointerMove(viewer, { pointerId: 2, clientX: 200, clientY: 0 });
  expect(state().zoom).toBe(2);
  fireEvent.blur(window); expect(state().isPanning).toBe(false);
});
it('two-finger scroll pans but controls retain ordinary scrolling', () => {
  render(<Harness />); fireEvent.wheel(screen.getByTestId('viewer'), { deltaX: 15, deltaY: 80 });
  expect(state().pan).toEqual({ x: -15, y: -80 });
  fireEvent.wheel(screen.getByRole('button'), { deltaY: 100 }); expect(state().pan.y).toBe(-80);
});
