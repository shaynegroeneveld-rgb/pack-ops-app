const DEFAULT_QUOTE_TAX_RATE = 0.05;
const DEFAULT_QUOTE_LABOR_COST_RATE = 65;
const DEFAULT_QUOTE_LABOR_SELL_RATE = 95;
const DEFAULT_QUOTE_MATERIAL_MARKUP = 30;

export interface OrgBusinessSettings {
  companyPhone: string;
  companyEmail: string;
  companyAddressLine1: string;
  companyAddressLine2: string;
  companyCity: string;
  companyRegion: string;
  companyPostalCode: string;
  jobNumberPrefix: string;
  jobNumberIncludeYear: boolean;
  quoteNumberPrefix: string;
  quoteNumberIncludeYear: boolean;
  defaultTaxRate: number;
  defaultLaborCostRate: number;
  defaultLaborSellRate: number;
  defaultMaterialMarkup: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }
  return value;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function readOrgBusinessSettings(value: unknown): OrgBusinessSettings {
  const settings = asRecord(value);

  return {
    companyPhone: asString(settings?.companyPhone),
    companyEmail: asString(settings?.companyEmail),
    companyAddressLine1: asString(settings?.companyAddressLine1),
    companyAddressLine2: asString(settings?.companyAddressLine2),
    companyCity: asString(settings?.companyCity),
    companyRegion: asString(settings?.companyRegion),
    companyPostalCode: asString(settings?.companyPostalCode),
    jobNumberPrefix: asString(settings?.jobNumberPrefix),
    jobNumberIncludeYear: asBoolean(settings?.jobNumberIncludeYear, true),
    quoteNumberPrefix: asString(settings?.quoteNumberPrefix) || "Q",
    quoteNumberIncludeYear: asBoolean(settings?.quoteNumberIncludeYear, false),
    defaultTaxRate: asNumber(settings?.defaultTaxRate, DEFAULT_QUOTE_TAX_RATE),
    defaultLaborCostRate: asNumber(settings?.defaultLaborCostRate, DEFAULT_QUOTE_LABOR_COST_RATE),
    defaultLaborSellRate: asNumber(settings?.defaultLaborSellRate, DEFAULT_QUOTE_LABOR_SELL_RATE),
    defaultMaterialMarkup: asNumber(settings?.defaultMaterialMarkup, DEFAULT_QUOTE_MATERIAL_MARKUP),
  };
}

export function mergeOrgBusinessSettings(
  original: unknown,
  next: Partial<OrgBusinessSettings> & Record<string, unknown>,
): Json {
  return {
    ...(asRecord(original) ?? {}),
    ...next,
  } as Json;
}

export function getNumberingConfig(
  kind: "job" | "quote",
  settings: OrgBusinessSettings,
  date = new Date(),
): { counterType: string; prefix: string } {
  const year = String(date.getFullYear());

  if (kind === "job") {
    const includeYear = settings.jobNumberIncludeYear;
    const prefixBase = settings.jobNumberPrefix.trim();
    return {
      counterType: includeYear ? `job:${year}` : "job",
      prefix: includeYear ? (prefixBase ? `${prefixBase}-${year}` : year) : prefixBase || "J",
    };
  }

  const includeYear = settings.quoteNumberIncludeYear;
  const prefixBase = settings.quoteNumberPrefix.trim() || "Q";
  return {
    counterType: includeYear ? `quote:${year}` : "quote",
    prefix: includeYear ? `${prefixBase}-${year}` : prefixBase,
  };
}

export function buildNextNumberPreview(prefix: string, lastValue: number | null): string {
  const nextValue = (lastValue ?? 0) + 1;
  return `${prefix}-${String(nextValue).padStart(3, "0")}`;
}
import type { Json } from "@/data/supabase/types";
