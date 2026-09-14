import { expect, it } from 'vitest';
import { zoomAt, wheelPixels } from '../takeoff-editor/src/use-plan-navigation';
it('keeps the plan point under the pointer while zooming', () => {
  const before = { zoom: 2, pan: { x: 50, y: -30 } }; const anchor = { x: 130, y: 90 };
  const next = zoomAt(before, 3, anchor);
  expect((anchor.x - next.pan.x) / next.zoom).toBe((anchor.x - before.pan.x) / before.zoom);
  expect((anchor.y - next.pan.y) / next.zoom).toBe((anchor.y - before.pan.y) / before.zoom);
});
it('clamped zoom does not drift the page at its limit', () => {
  const before = { zoom: 6, pan: { x: 90, y: 40 } };
  expect(zoomAt(before, 10, { x: 200, y: -80 })).toEqual(before);
});
it('normalizes pixel, line, and page wheel distances', () => {
  expect(wheelPixels({ deltaMode: 0, deltaX: 12, deltaY: 30 }, 400)).toEqual({ x: 12, y: 30 });
  expect(wheelPixels({ deltaMode: 1, deltaX: 1, deltaY: 3 }, 400)).toEqual({ x: 16, y: 48 });
  expect(wheelPixels({ deltaMode: 2, deltaX: 0, deltaY: 1 }, 400)).toEqual({ x: 0, y: 400 });
});
