import { describe, expect, it } from "vitest";

import { calculateTsbcElectricalPermitFee, parseTsbcPermitSelection, serializeTsbcPermitSelection } from "@/domain/permits/tsbc-electrical-fees";

describe("TSBC electrical permit fees", () => {
  it("uses the published 2026 declared-value tiers", () => {
    expect(calculateTsbcElectricalPermitFee({ type: "other", declaredValue: 150, scheduleYear: 2026 })).toBe(15);
    expect(calculateTsbcElectricalPermitFee({ type: "other", declaredValue: 151, scheduleYear: 2026 })).toBe(36);
    expect(calculateTsbcElectricalPermitFee({ type: "other", declaredValue: 20_001, scheduleYear: 2026 })).toBe(1236);
    expect(calculateTsbcElectricalPermitFee({ type: "other", declaredValue: 250_000, scheduleYear: 2026 })).toBe(4613);
    expect(calculateTsbcElectricalPermitFee({ type: "other", declaredValue: 1_500_000, scheduleYear: 2026 })).toBe(10478);
  });

  it("uses the detached-home service and EV fixed fees", () => {
    expect(calculateTsbcElectricalPermitFee({ type: "sfr-new-200", declaredValue: 0, scheduleYear: 2026 })).toBe(836);
    expect(calculateTsbcElectricalPermitFee({ type: "sfr-upgrade-200", declaredValue: 0, scheduleYear: 2026 })).toBe(332);
    expect(calculateTsbcElectricalPermitFee({ type: "ev-commercial-only", declaredValue: 0, scheduleYear: 2026 })).toBe(362);
  });

  it("round-trips the stored permit selection", () => {
    const selection = { type: "alternative-energy" as const, declaredValue: 12_345, scheduleYear: 2027 as const };
    expect(parseTsbcPermitSelection(serializeTsbcPermitSelection(selection))).toEqual(selection);
  });
});
