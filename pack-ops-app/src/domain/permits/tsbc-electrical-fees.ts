export type TsbcElectricalPermitType =
  | "other"
  | "alternative-energy"
  | "sfr-new-125"
  | "sfr-new-200"
  | "sfr-new-400"
  | "sfr-new-over-400"
  | "sfr-upgrade-200"
  | "sfr-upgrade-400"
  | "sfr-upgrade-over-400"
  | "ev-residential-with-permit"
  | "ev-residential-only"
  | "ev-commercial-with-permit"
  | "ev-commercial-only"
  | "temporary-construction-service";

export type TsbcFeeScheduleYear = 2026 | 2027;

export interface TsbcPermitSelection {
  type: TsbcElectricalPermitType;
  declaredValue: number;
  scheduleYear: TsbcFeeScheduleYear;
}

export const TSBC_PERMIT_LINE_MARKER = "PACK_OPS_TSBC_PERMIT:";
export const TSBC_PERMIT_DESCRIPTION = "TSBC electrical installation permit";
export const TSBC_PERMIT_SECTION = "Permit & fees";

export const TSBC_PERMIT_TYPE_OPTIONS: Array<{ value: TsbcElectricalPermitType; label: string; usesDeclaredValue: boolean }> = [
  { value: "other", label: "Other electrical work · declared value", usesDeclaredValue: true },
  { value: "alternative-energy", label: "Alternative energy system · declared value", usesDeclaredValue: true },
  { value: "sfr-new-125", label: "Detached home · new service ≤125A", usesDeclaredValue: false },
  { value: "sfr-new-200", label: "Detached home · new service 126–200A", usesDeclaredValue: false },
  { value: "sfr-new-400", label: "Detached home · new service 201–400A", usesDeclaredValue: false },
  { value: "sfr-new-over-400", label: "Detached home · new service >400A", usesDeclaredValue: false },
  { value: "sfr-upgrade-200", label: "Detached home · service upgrade/relocation ≤200A", usesDeclaredValue: false },
  { value: "sfr-upgrade-400", label: "Detached home · service upgrade/relocation 201–400A", usesDeclaredValue: false },
  { value: "sfr-upgrade-over-400", label: "Detached home · service upgrade/relocation >400A", usesDeclaredValue: false },
  { value: "ev-residential-with-permit", label: "Residential EV charger · with other permit", usesDeclaredValue: false },
  { value: "ev-residential-only", label: "Residential EV charger · stand-alone", usesDeclaredValue: false },
  { value: "ev-commercial-with-permit", label: "Commercial EV charger · with other permit", usesDeclaredValue: false },
  { value: "ev-commercial-only", label: "Commercial EV charger · stand-alone", usesDeclaredValue: false },
  { value: "temporary-construction-service", label: "Temporary construction service · 12 months", usesDeclaredValue: false },
];

const FIXED_FEES: Record<Exclude<TsbcElectricalPermitType, "other" | "alternative-energy">, Record<TsbcFeeScheduleYear, number>> = {
  "sfr-new-125": { 2026: 513, 2027: 539 },
  "sfr-new-200": { 2026: 836, 2027: 878 },
  "sfr-new-400": { 2026: 1223, 2027: 1284 },
  "sfr-new-over-400": { 2026: 1706, 2027: 1791 },
  "sfr-upgrade-200": { 2026: 332, 2027: 349 },
  "sfr-upgrade-400": { 2026: 513, 2027: 539 },
  "sfr-upgrade-over-400": { 2026: 1223, 2027: 1284 },
  "ev-residential-with-permit": { 2026: 139, 2027: 146 },
  "ev-residential-only": { 2026: 219, 2027: 230 },
  "ev-commercial-with-permit": { 2026: 282, 2027: 296 },
  "ev-commercial-only": { 2026: 362, 2027: 380 },
  "temporary-construction-service": { 2026: 84, 2027: 88 },
};

const VALUE_TIERS: Record<TsbcFeeScheduleYear, Array<{ max: number; fee: number }>> = {
  2026: [
    { max: 150, fee: 15 }, { max: 400, fee: 36 }, { max: 1000, fee: 115 }, { max: 2500, fee: 207 },
    { max: 5000, fee: 335 }, { max: 10000, fee: 515 }, { max: 20000, fee: 843 }, { max: 35000, fee: 1236 },
    { max: 50000, fee: 1722 }, { max: 100000, fee: 2469 }, { max: 200000, fee: 3699 },
  ],
  2027: [
    { max: 150, fee: 16 }, { max: 400, fee: 38 }, { max: 1000, fee: 121 }, { max: 2500, fee: 217 },
    { max: 5000, fee: 352 }, { max: 10000, fee: 541 }, { max: 20000, fee: 885 }, { max: 35000, fee: 1298 },
    { max: 50000, fee: 1808 }, { max: 100000, fee: 2592 }, { max: 200000, fee: 3884 },
  ],
};

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function currentTsbcFeeScheduleYear(date = new Date()): TsbcFeeScheduleYear {
  return date.getFullYear() >= 2027 ? 2027 : 2026;
}

export function calculateTsbcElectricalPermitFee(selection: TsbcPermitSelection): number {
  if (selection.type !== "other" && selection.type !== "alternative-energy") {
    return FIXED_FEES[selection.type][selection.scheduleYear];
  }

  const value = Math.max(0, Number(selection.declaredValue) || 0);
  const tier = VALUE_TIERS[selection.scheduleYear].find((item) => value <= item.max);
  if (tier) return tier.fee;
  if (value <= 1_000_000) return roundMoney((selection.scheduleYear === 2026 ? 3363 : 3531) + value * 0.005);
  return roundMoney((selection.scheduleYear === 2026 ? 6728 : 7064) + value * 0.0025);
}

export function serializeTsbcPermitSelection(selection: TsbcPermitSelection): string {
  return `${TSBC_PERMIT_LINE_MARKER}${JSON.stringify(selection)}`;
}

export function parseTsbcPermitSelection(note: string | null | undefined): TsbcPermitSelection | null {
  if (!note?.startsWith(TSBC_PERMIT_LINE_MARKER)) return null;
  try {
    const parsed = JSON.parse(note.slice(TSBC_PERMIT_LINE_MARKER.length)) as Partial<TsbcPermitSelection>;
    if (!TSBC_PERMIT_TYPE_OPTIONS.some((option) => option.value === parsed.type)) return null;
    const scheduleYear = parsed.scheduleYear === 2027 ? 2027 : 2026;
    return { type: parsed.type as TsbcElectricalPermitType, declaredValue: Math.max(0, Number(parsed.declaredValue) || 0), scheduleYear };
  } catch {
    return null;
  }
}

export function isTsbcPermitLine(line: { note?: string | null }): boolean {
  return Boolean(parseTsbcPermitSelection(line.note));
}
