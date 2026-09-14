import { describe, expect, it, vi } from 'vitest';
vi.mock('react-pdf', () => ({ Document: () => null, Page: () => null, pdfjs: { GlobalWorkerOptions: {} } }));
vi.mock('jspdf', () => ({ jsPDF: vi.fn() }));
import { parseSavedProject, feetPerPlanUnitForPage, rightAngleDistance, estimateLightingWire, estimateCircuitRunWire, buildCircuitRuns, buildWireBreakdown, withWireMaterialLines, estimateLabour, isDifficultWireType, boxTakeoff, type ElectricalDevice, type PlanScale, type WireBreakdownLine } from '../takeoff-editor/src/main';
const device = (id: string, catalogItemId: string, x = 0, y = 0, page = 1): ElectricalDevice => ({ id, catalogItemId, position: { x, y }, planPageId: `pdf-page-${page}`, pdfPageNumber: page, inclusionStatus: 'included' });
const scale: PlanScale = { planPageId: 'pdf-page-1', pdfPageNumber: 1, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], knownLengthFeet: 10 };
const wire = (wireType: string, totalFeet: number): WireBreakdownLine => ({ id: wireType, source: 'test', wireType, totalFeet, planFeet: totalFeet, allowanceFeet: 0, deviceIds: [], routeDeviceIdsList: [] });
const settings = { setupHours: 2, projectTypeMultiplier: 1, accessMultiplier: 1, ceilingHeightMultiplier: 1 };
describe('takeoff calculations', () => {
  it('calibrates Euclidean scale but measures right-angle cable routes', () => {
    expect(feetPerPlanUnitForPage([scale], 1)).toBe(0.1);
    expect(rightAngleDistance({ x: 0, y: 0 }, { x: 30, y: 40 })).toBe(70);
    expect(feetPerPlanUnitForPage([{ ...scale, points: [{ x: 0, y: 0 }, { x: 30, y: 40 }] }], 1)).toBe(0.2);
  });
  it('rejects invalid, coincident and different-page scales', () => {
    expect(feetPerPlanUnitForPage([scale], 2)).toBeNull();
    expect(feetPerPlanUnitForPage([{ ...scale, knownLengthFeet: Infinity }], 1)).toBeNull();
    expect(feetPerPlanUnitForPage([{ ...scale, points: [{ x: 0, y: 0 }, { x: 0, y: 0 }] }], 1)).toBeNull();
  });
  it.each(['2c14', '3c14', '2c12 NMD', '14/2'])('%s uses standard wire labour', (type) => expect(isDifficultWireType(type)).toBe(false));
  it.each(['3c10 NMD', '3c8 NMD', '2c1 NMD'])('%s uses large wire labour', (type) => expect(isDifficultWireType(type)).toBe(true));
  it('uses 0.012 hours per metre of standard wire and multiplies field work only', () => {
    const result = estimateLabour([], [], [], [wire('2c14', 100 / 0.3048)], { ...settings, projectTypeMultiplier: 1.2 });
    expect(result.totalHours).toBeCloseTo(2 + 1.2 * 1.2);
  });
  it('counts an excluded gang member as neither a box nor labour', () => {
    const devices = [device('a', 'switch'), { ...device('b', 'switch'), inclusionStatus: 'excluded' as const }];
    const groups = [{ id: 'g', planPageId: 'pdf-page-1', pdfPageNumber: 1, deviceIds: ['a', 'b'] }];
    expect(boxTakeoff(devices, groups)).toEqual([{ label: '1-gang box', count: 1 }]);
    expect(estimateLabour(devices, groups, [], [], settings).totalHours).toBeCloseTo(2.24);
  });
  it('ignores excluded lighting and heating connections for lighting cable', () => {
    const a = device('a', 'switch'); const b = device('b', 'pot-light', 100);
    const c = [{ id: 'c', sourceDeviceId: 'a', targetDeviceId: 'b', planPageId: 'pdf-page-1', pdfPageNumber: 1 }];
    expect(estimateLightingWire([a, { ...b, inclusionStatus: 'excluded' }], c, [scale], 12)).toBeNull();
    expect(estimateLightingWire([device('a', 'baseboard-thermostat'), device('b', 'baseboard-heater', 100)], c, [scale], 12)).toBeNull();
  });
  it('applies waste once to length plus vertical allowance', () => {
    const devices = [device('p', 'panel'), device('r', '15a-receptacle', 100, 100)];
    const run = buildCircuitRuns(devices)[0]!;
    const base = estimateCircuitRunWire(run, devices, [scale], 0)!;
    expect(base.planFeet).toBeCloseTo(20);
    expect(estimateCircuitRunWire(run, devices, [scale], 12)!.totalFeet).toBeCloseTo((base.planFeet + base.allowanceFeet) * 1.12);
  });
  it('does not publish a partial run when its page is unscaled', () => {
    const devices = [device('p', 'panel'), device('r', '15a-receptacle', 100)];
    expect(estimateCircuitRunWire(buildCircuitRuns(devices)[0]!, devices, [], 12)).toBeNull();
  });
  it('material wire is the same breakdown, summed before rounding up to metres', () => {
    const result = withWireMaterialLines([{ item: 'box', quantity: 2 }], [wire('14/2', 10), wire('2c14', 10)]);
    expect(result).toContainEqual({ item: '2c14 wire (m)', quantity: 7 });
    expect(result).toContainEqual({ item: 'box', quantity: 2 });
  });
  it('appliance wire reaches both the breakdown and purchasing list', () => {
    const devices = [device('p', 'panel'), device('r', 'dryer-outlet', 100, 100)];
    const breakdown = buildWireBreakdown(devices, [], buildCircuitRuns(devices), [scale], 12);
    expect(breakdown.length).toBeGreaterThan(0);
    const materials = withWireMaterialLines([], breakdown);
    expect(materials[0]!.quantity).toBe(Math.ceil(breakdown[0]!.totalFeet * 0.3048));
  });
});

it('preserves zero waste and zero setup hours when reopening a saved project', () => {
  const project = parseSavedProject({ app: 'electrical-takeoff', version: 1, wireSettings: { wastePercent: 0 }, labourSettings: { setupHours: 0 } });
  expect(project.wireSettings.wastePercent).toBe(0); expect(project.labourSettings!.setupHours).toBe(0);
});
