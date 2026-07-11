import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { useAuthContext } from "@/app/contexts/auth-context";
import type { CatalogItem } from "@/domain/materials/types";
import type { QuoteLineItemInput, QuoteView } from "@/domain/quotes/types";
import { brand, pageStyle } from "@/features/shared/ui/mobile-styles";
import { useMaterialsSlice } from "@/features/materials/hooks/use-materials-slice";
import { useQuotesSlice } from "@/features/quotes/hooks/use-quotes-slice";

interface TakeoffMaterialLine {
  section: string;
  item: string;
  quantity: number;
}

interface MatchedTakeoffMaterialLine extends TakeoffMaterialLine {
  match: CatalogItem | null;
  matchScore: number;
  lineCost: number | null;
  source: "takeoff" | "manual";
  adjustmentKind?: "device" | "material";
  note?: string;
}

interface ManualAdjustmentDraft {
  adjustmentKind: "device" | "material";
  catalogItemId: string;
  customItem: string;
  quantity: string;
  note: string;
}

interface ManualAdjustment {
  id: string;
  adjustmentKind: "device" | "material";
  item: string;
  quantity: number;
  catalogItemId: string | null;
  note: string | null;
}

interface TakeoffLabourLine {
  phase: string;
  item: string;
  hours: number;
}

interface QuoteDraft {
  customerName: string;
  companyName: string;
  contactName: string;
  phone: string;
  email: string;
  siteAddress: string;
  title: string;
  materialMarkup: string;
  laborCostRate: string;
  laborSellRate: string;
  taxRate: string;
}

interface AutomationPosition {
  x: number;
  y: number;
}

interface AutomationTextCandidate {
  pageNumber: number;
  text: string;
  position: AutomationPosition;
  width: number;
  height: number;
  source: "text" | "line";
}

interface AutomationDeviceSuggestion {
  id: string;
  pageNumber: number;
  catalogItemId: string;
  label: string;
  sourceText: string;
  position: AutomationPosition;
  confidence: number;
  reason: string;
}

interface AutomationRoomSuggestion {
  id: string;
  pageNumber: number;
  roomType: string;
  sourceText: string;
  position: AutomationPosition;
  confidence: number;
}

interface AutomationScaleCandidate {
  id: string;
  pageNumber: number;
  sourceText: string;
  position: AutomationPosition;
  confidence: number;
}

interface AutomationPageSummary {
  pageNumber: number;
  pageLabel: string | null;
  width: number;
  height: number;
  textItemCount: number;
  electricalScore: number;
  isLikelyElectrical: boolean;
  matchedKeywords: string[];
}

interface AutomationAnalysisResult {
  fileName: string;
  analyzedAt: string;
  pageCount: number;
  pages: AutomationPageSummary[];
  devices: AutomationDeviceSuggestion[];
  rooms: AutomationRoomSuggestion[];
  scaleCandidates: AutomationScaleCandidate[];
  warnings: string[];
  projectJson: Record<string, unknown>;
}

const frameStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  border: 0,
  display: "block",
  background: "#eef2f1",
};

const toolbarButtonStyle: CSSProperties = {
  border: `1px solid ${brand.border}`,
  borderRadius: "10px",
  background: "#ffffff",
  color: brand.text,
  padding: "8px 12px",
  fontWeight: 700,
  cursor: "pointer",
};

const inputStyle: CSSProperties = {
  border: `1px solid ${brand.border}`,
  borderRadius: "10px",
  padding: "8px 10px",
  background: "#ffffff",
  color: brand.text,
  minWidth: 0,
};

const emptyAdjustmentDraft: ManualAdjustmentDraft = {
  adjustmentKind: "material",
  catalogItemId: "",
  customItem: "",
  quantity: "1",
  note: "",
};

const TAKEOFF_CATALOG_STORAGE_KEY = "packops-takeoff-material-catalog-v1";
const TAKEOFF_AUTOMATION_PDF_WORKER_SRC = "/takeoff/assets/pdf.worker.min-qwK7q_zL.mjs";
const AUTOMATION_PAGE_WIDTH = 820;

const AUTOMATION_ELECTRICAL_KEYWORDS = [
  "electrical",
  "lighting",
  "power",
  "receptacle",
  "switch",
  "panel",
  "circuit",
  "smoke",
  "gfci",
  "light fixture",
  "luminaire",
  "e-",
];

const AUTOMATION_ROOM_RULES = [
  { roomType: "Bedroom", pattern: /\b(?:BEDROOM|BED\s*\d*|PRIMARY BEDROOM|MASTER BEDROOM)\b/i },
  { roomType: "Kitchen", pattern: /\bKITCHEN\b/i },
  { roomType: "Living", pattern: /\b(?:LIVING|GREAT ROOM|FAMILY ROOM)\b/i },
  { roomType: "Dining", pattern: /\bDINING\b/i },
  { roomType: "Bathroom", pattern: /\b(?:BATH|BATHROOM|ENSUITE|POWDER)\b/i },
  { roomType: "Garage", pattern: /\bGARAGE\b/i },
  { roomType: "Laundry", pattern: /\bLAUNDRY\b/i },
  { roomType: "Mechanical", pattern: /\b(?:MECHANICAL|MECH\.?|UTILITY)\b/i },
  { roomType: "Closet", pattern: /\b(?:CLOSET|WIC|W\/I CLOSET)\b/i },
  { roomType: "Pantry", pattern: /\bPANTRY\b/i },
  { roomType: "Hall", pattern: /\b(?:HALL|HALLWAY|CORRIDOR)\b/i },
  { roomType: "Foyer", pattern: /\b(?:FOYER|ENTRY)\b/i },
  { roomType: "Porch", pattern: /\bPORCH\b/i },
  { roomType: "Deck", pattern: /\bDECK\b/i },
];

const AUTOMATION_DEVICE_RULES = [
  {
    catalogItemId: "100a-subpanel",
    label: "100A subpanel",
    pattern: /\b(?:100\s*A|100A).{0,18}(?:SUB\s*PANEL|SUBPANEL)\b|\b(?:SUB\s*PANEL|SUBPANEL).{0,18}(?:100\s*A|100A)\b/i,
    confidence: 0.78,
    reason: "Text references a 100A subpanel.",
  },
  {
    catalogItemId: "subpanel",
    label: "Subpanel",
    pattern: /\b(?:SUB\s*PANEL|SUBPANEL)\b/i,
    confidence: 0.72,
    reason: "Text references a subpanel.",
  },
  {
    catalogItemId: "panel",
    label: "Panel",
    pattern: /\b(?:PANEL|MAIN PANEL|SERVICE PANEL)\b/i,
    confidence: 0.68,
    reason: "Text references an electrical panel.",
  },
  {
    catalogItemId: "3-way-switch",
    label: "3-way switch",
    pattern: /\b(?:S3|S\/3|3\s*WAY|3-WAY|THREE\s*WAY)\b/i,
    confidence: 0.76,
    reason: "Text matches a 3-way switch label.",
  },
  {
    catalogItemId: "4-way-switch",
    label: "4-way switch",
    pattern: /\b(?:S4|S\/4|4\s*WAY|4-WAY|FOUR\s*WAY)\b/i,
    confidence: 0.76,
    reason: "Text matches a 4-way switch label.",
  },
  {
    catalogItemId: "dimmer",
    label: "Dimmer switch",
    pattern: /\b(?:DIMMER|S\s*D|SD)\b/i,
    confidence: 0.7,
    reason: "Text references a dimmer switch.",
  },
  {
    catalogItemId: "motion-switch",
    label: "Motion switch",
    pattern: /\b(?:MOTION|OCCUPANCY|S\s*M|SM)\b/i,
    confidence: 0.68,
    reason: "Text references a motion/occupancy switch.",
  },
  {
    catalogItemId: "switch",
    label: "Switch",
    pattern: /\b(?:SWITCH|S1|S\/1|SINGLE POLE)\b|^S$/i,
    confidence: 0.58,
    reason: "Text matches a switch label.",
  },
  {
    catalogItemId: "pot-light",
    label: "Pot light",
    pattern: /\b(?:POT\s*LIGHT|RECESSED|RECESS|DOWNLIGHT)\b/i,
    confidence: 0.68,
    reason: "Text references a recessed/pot light.",
  },
  {
    catalogItemId: "ceiling-light",
    label: "Ceiling light",
    pattern: /\b(?:CEILING\s*LIGHT|LIGHT\s*FIXTURE|LUMINAIRE)\b/i,
    confidence: 0.62,
    reason: "Text references a ceiling light or fixture.",
  },
  {
    catalogItemId: "smoke-alarm",
    label: "Smoke alarm",
    pattern: /\b(?:SMOKE|SMOKE\s*ALARM|S\/A|SA|SD)\b/i,
    confidence: 0.72,
    reason: "Text references a smoke alarm.",
  },
  {
    catalogItemId: "co-alarm",
    label: "CO alarm",
    pattern: /\b(?:CO|CARBON\s*MONOXIDE)\b/i,
    confidence: 0.7,
    reason: "Text references a CO alarm.",
  },
  {
    catalogItemId: "bathroom-fan",
    label: "Bathroom fan",
    pattern: /\b(?:BATH\s*FAN|EXHAUST\s*FAN|FAN FIXTURE)\b/i,
    confidence: 0.68,
    reason: "Text references a bath or exhaust fan.",
  },
  {
    catalogItemId: "data-jack",
    label: "Data jack",
    pattern: /\b(?:DATA|CAT\s*6|CAT6|ETHERNET)\b/i,
    confidence: 0.66,
    reason: "Text references data cabling.",
  },
  {
    catalogItemId: "tv-coax-outlet",
    label: "TV/coax",
    pattern: /\b(?:TV|COAX|CABLE)\b/i,
    confidence: 0.62,
    reason: "Text references TV/coax.",
  },
  {
    catalogItemId: "exterior-weather-rated-gfci-receptacle",
    label: "Exterior weatherproof GFCI receptacle",
    pattern: /\b(?:(?:EXTERIOR|OUTDOOR|WEATHER|WP).{0,24}(?:GFCI|GFI|RECEPTACLE|REC|PLUG)|(?:GFCI|GFI).{0,24}(?:EXTERIOR|OUTDOOR|WEATHER|WP))\b/i,
    confidence: 0.74,
    reason: "Text references an exterior/weatherproof GFCI receptacle.",
  },
  {
    catalogItemId: "garage-receptacle",
    label: "Garage receptacle",
    pattern: /\bGARAGE.{0,24}(?:RECEPTACLE|REC|PLUG)\b/i,
    confidence: 0.7,
    reason: "Text references a garage receptacle.",
  },
  {
    catalogItemId: "counter-receptacle",
    label: "Counter receptacle",
    pattern: /\b(?:COUNTER|KITCHEN).{0,24}(?:RECEPTACLE|REC|PLUG)\b/i,
    confidence: 0.72,
    reason: "Text references a counter receptacle.",
  },
  {
    catalogItemId: "gfci-receptacle",
    label: "GFCI receptacle",
    pattern: /\b(?:GFCI|GFI)\b/i,
    confidence: 0.66,
    reason: "Text references a GFCI/GFI device.",
  },
  {
    catalogItemId: "20a-receptacle",
    label: "20A receptacle",
    pattern: /\b(?:20\s*A|20A).{0,24}(?:RECEPTACLE|REC|PLUG)\b/i,
    confidence: 0.68,
    reason: "Text references a 20A receptacle.",
  },
  {
    catalogItemId: "15a-receptacle",
    label: "15A receptacle",
    pattern: /\b(?:RECEPTACLE|DUPLEX|REC\.?|PLUG)\b/i,
    confidence: 0.55,
    reason: "Text references a general receptacle or plug.",
  },
  {
    catalogItemId: "range-outlet",
    label: "Range outlet",
    pattern: /\b(?:RANGE|STOVE)\b/i,
    confidence: 0.72,
    reason: "Text references a range/stove circuit.",
  },
  {
    catalogItemId: "dryer-outlet",
    label: "Dryer outlet",
    pattern: /\bDRYER\b/i,
    confidence: 0.72,
    reason: "Text references a dryer circuit.",
  },
  {
    catalogItemId: "ev-charger",
    label: "EV charger",
    pattern: /\b(?:EV|ELECTRIC VEHICLE|CAR CHARGER|CHARGER)\b/i,
    confidence: 0.66,
    reason: "Text references an EV charger.",
  },
  {
    catalogItemId: "fridge",
    label: "Fridge circuit",
    pattern: /\b(?:FRIDGE|REFRIGERATOR)\b/i,
    confidence: 0.7,
    reason: "Text references a fridge circuit.",
  },
  {
    catalogItemId: "dishwasher",
    label: "Dishwasher circuit",
    pattern: /\b(?:DISHWASHER|D\/W|DW)\b/i,
    confidence: 0.7,
    reason: "Text references a dishwasher circuit.",
  },
  {
    catalogItemId: "washer",
    label: "Washer circuit",
    pattern: /\bWASHER\b/i,
    confidence: 0.68,
    reason: "Text references a washer circuit.",
  },
  {
    catalogItemId: "freezer",
    label: "Freezer circuit",
    pattern: /\bFREEZER\b/i,
    confidence: 0.68,
    reason: "Text references a freezer circuit.",
  },
  {
    catalogItemId: "microwave",
    label: "Microwave circuit",
    pattern: /\b(?:MICROWAVE|MICRO)\b/i,
    confidence: 0.68,
    reason: "Text references a microwave circuit.",
  },
  {
    catalogItemId: "hrv",
    label: "HRV circuit",
    pattern: /\bHRV\b/i,
    confidence: 0.7,
    reason: "Text references an HRV circuit.",
  },
  {
    catalogItemId: "furnace",
    label: "Furnace circuit",
    pattern: /\bFURNACE\b/i,
    confidence: 0.68,
    reason: "Text references a furnace circuit.",
  },
  {
    catalogItemId: "gas-hwt",
    label: "Gas HWT circuit",
    pattern: /\b(?:GAS\s*HWT|GAS WATER HEATER)\b/i,
    confidence: 0.68,
    reason: "Text references a gas hot water tank.",
  },
  {
    catalogItemId: "electric-hwt",
    label: "Electric HWT circuit",
    pattern: /\b(?:ELECTRIC\s*HWT|ELECTRIC WATER HEATER|EWH)\b/i,
    confidence: 0.68,
    reason: "Text references an electric hot water tank.",
  },
  {
    catalogItemId: "heat-pump",
    label: "Heat pump",
    pattern: /\b(?:HEAT\s*PUMP|HP)\b/i,
    confidence: 0.66,
    reason: "Text references a heat pump.",
  },
  {
    catalogItemId: "heat-pump-disconnect",
    label: "Heat pump disconnect",
    pattern: /\b(?:HEAT\s*PUMP|HP).{0,24}DISCONNECT|DISCONNECT.{0,24}(?:HEAT\s*PUMP|HP)\b/i,
    confidence: 0.74,
    reason: "Text references a heat pump disconnect.",
  },
  {
    catalogItemId: "heat-trace",
    label: "Heat trace",
    pattern: /\bHEAT\s*TRACE\b/i,
    confidence: 0.68,
    reason: "Text references heat trace.",
  },
  {
    catalogItemId: "radon",
    label: "Radon circuit",
    pattern: /\bRADON\b/i,
    confidence: 0.68,
    reason: "Text references a radon circuit.",
  },
  {
    catalogItemId: "gas-range",
    label: "Gas range circuit",
    pattern: /\bGAS\s*RANGE\b/i,
    confidence: 0.68,
    reason: "Text references a gas range circuit.",
  },
  {
    catalogItemId: "baseboard-thermostat",
    label: "Baseboard thermostat",
    pattern: /\b(?:THERMOSTAT|T-?STAT|TSTAT)\b/i,
    confidence: 0.66,
    reason: "Text references a thermostat.",
  },
  {
    catalogItemId: "baseboard-heater",
    label: "Baseboard heater",
    pattern: /\b(?:BASEBOARD|BBH|HEATER)\b/i,
    confidence: 0.62,
    reason: "Text references baseboard heating.",
  },
  {
    catalogItemId: "floor-riser",
    label: "Floor riser",
    pattern: /\b(?:RISER|FLOOR RISER)\b/i,
    confidence: 0.64,
    reason: "Text references a floor riser.",
  },
];

const emptyQuoteDraft: QuoteDraft = {
  customerName: "",
  companyName: "",
  contactName: "",
  phone: "",
  email: "",
  siteAddress: "",
  title: "",
  materialMarkup: "30",
  laborCostRate: "0",
  laborSellRate: "95",
  taxRate: "5",
};

export function ElectricalTakeoffPage() {
  const { currentUser } = useAuthContext();
  if (!currentUser) {
    return null;
  }

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [reviewLines, setReviewLines] = useState<MatchedTakeoffMaterialLine[] | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [manualAdjustments, setManualAdjustments] = useState<ManualAdjustment[]>([]);
  const [manualAdjustmentDraft, setManualAdjustmentDraft] = useState<ManualAdjustmentDraft>(emptyAdjustmentDraft);
  const [isAdjustmentsOpen, setIsAdjustmentsOpen] = useState(false);
  const [isQuotePanelOpen, setIsQuotePanelOpen] = useState(false);
  const [quoteDraft, setQuoteDraft] = useState<QuoteDraft>(emptyQuoteDraft);
  const [createdQuote, setCreatedQuote] = useState<QuoteView | null>(null);
  const [isAutomationOpen, setIsAutomationOpen] = useState(false);
  const [automationFile, setAutomationFile] = useState<File | null>(null);
  const [automationResult, setAutomationResult] = useState<AutomationAnalysisResult | null>(null);
  const [automationError, setAutomationError] = useState<string | null>(null);
  const [isAutomationAnalyzing, setIsAutomationAnalyzing] = useState(false);
  const { catalogQuery } = useMaterialsSlice(currentUser);
  const { builderResourcesQuery, createQuote } = useQuotesSlice(currentUser);
  const catalogItems = useMemo(() => catalogQuery.data ?? [], [catalogQuery.data]);
  const builderResources = builderResourcesQuery.data ?? null;
  const pricedCatalogItems = useMemo(
    () => catalogItems.filter((item) => item.isActive && item.costPrice !== null),
    [catalogItems],
  );
  const takeoffCatalogItems = useMemo(
    () =>
      catalogItems
        .filter((item) => item.isActive)
        .map((item) => ({
          id: item.id,
          name: item.name,
          sku: item.sku,
          unit: item.unit,
          category: item.category,
          costPrice: item.costPrice,
          aliases: item.aliases,
        })),
    [catalogItems],
  );

  const matchedReviewLines = useMemo(
    () => buildReviewLines(reviewLines ?? [], manualAdjustments, pricedCatalogItems),
    [manualAdjustments, pricedCatalogItems, reviewLines],
  );

  const reviewDisplayTotals = useMemo(() => {
    const lines = matchedReviewLines;
    const labourLines = reviewLines ? readTakeoffLabourLines(iframeRef.current) : [];
    return {
      matched: lines.filter((line) => line.match).length,
      unmatched: lines.filter((line) => !line.match).length,
      totalCost: lines.reduce((total, line) => total + (line.lineCost ?? 0), 0),
      labourHours: labourLines.reduce((total, line) => total + line.hours, 0),
    };
  }, [matchedReviewLines]);

  useEffect(() => {
    if (!builderResources) {
      return;
    }

    setQuoteDraft((current) => ({
      ...current,
      materialMarkup: current.materialMarkup || String(builderResources.defaultMaterialMarkup),
      laborCostRate: current.laborCostRate === emptyQuoteDraft.laborCostRate
        ? String(builderResources.defaultLaborCostRate)
        : current.laborCostRate,
      laborSellRate: current.laborSellRate === emptyQuoteDraft.laborSellRate
        ? String(builderResources.defaultLaborSellRate)
        : current.laborSellRate,
      taxRate: current.taxRate === emptyQuoteDraft.taxRate
        ? String(builderResources.defaultTaxRate)
        : current.taxRate,
    }));
  }, [builderResources]);

  function syncTakeoffCatalog() {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(TAKEOFF_CATALOG_STORAGE_KEY, JSON.stringify(takeoffCatalogItems));
  }

  useEffect(() => {
    syncTakeoffCatalog();
  }, [takeoffCatalogItems]);

  function handleReviewMaterials() {
    const lines = readTakeoffMaterialLines(iframeRef.current);
    if (lines.length === 0) {
      setReviewLines(null);
      setReviewError("No takeoff material rows found yet. Place devices on the plan first, then review materials.");
      return;
    }

    setReviewLines(lines.map((line) => matchTakeoffLine(line, pricedCatalogItems)));
    setReviewError(null);
    setCreatedQuote(null);
  }

  function handleAddManualAdjustment() {
    const quantity = Number(manualAdjustmentDraft.quantity);
    if (!Number.isFinite(quantity) || quantity === 0) {
      setReviewError("Manual adjustment quantity must be a positive or negative number.");
      return;
    }

    const catalogItem = catalogItems.find((item) => item.id === manualAdjustmentDraft.catalogItemId) ?? null;
    const itemName = catalogItem?.name ?? manualAdjustmentDraft.customItem.trim();
    if (!itemName) {
      setReviewError("Choose a catalog item or type a custom manual adjustment item.");
      return;
    }

    setManualAdjustments((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        adjustmentKind: manualAdjustmentDraft.adjustmentKind,
        item: itemName,
        quantity: Math.round(quantity * 100) / 100,
        catalogItemId: catalogItem?.id ?? null,
        note: manualAdjustmentDraft.note.trim() || null,
      },
    ]);
    setManualAdjustmentDraft(emptyAdjustmentDraft);
    setReviewError(null);
  }

  async function handleCopyCsv() {
    if (!matchedReviewLines.length) {
      return;
    }

    const csv = [
      ["Section", "Source", "Kind", "Takeoff item", "Quantity", "Catalog match", "Catalog SKU", "Unit", "Unit cost", "Line cost", "Note"],
      ...matchedReviewLines.map((line) => [
        line.section,
        line.source,
        line.adjustmentKind ?? "",
        line.item,
        String(line.quantity),
        line.match?.name ?? "",
        line.match?.sku ?? "",
        line.match?.unit ?? "",
        line.match?.costPrice?.toFixed(2) ?? "",
        line.lineCost?.toFixed(2) ?? "",
        line.note ?? "",
      ]),
    ]
      .map((row) => row.map((value) => `"${value.replace(/"/g, '""')}"`).join(","))
      .join("\n");

    await navigator.clipboard.writeText(csv);
    setReviewError("Copied matched material CSV to your clipboard.");
  }

  function openQuotePanel() {
    if (!matchedReviewLines.length) {
      setReviewError("Review the takeoff materials first, then create a quote.");
      return;
    }

    const title = quoteDraft.title.trim() || getTakeoffProjectName(iframeRef.current) || "Electrical takeoff quote";
    setQuoteDraft((current) => ({
      ...current,
      title,
      customerName: current.customerName || current.companyName || "Takeoff customer",
    }));
    setIsQuotePanelOpen(true);
    setReviewError(null);
  }

  async function handleCreateQuote() {
    const materialMarkup = Number(quoteDraft.materialMarkup);
    const laborCostRate = Number(quoteDraft.laborCostRate);
    const laborSellRate = Number(quoteDraft.laborSellRate);
    const taxRate = Number(quoteDraft.taxRate);

    if (!quoteDraft.customerName.trim()) {
      setReviewError("Customer name is required before creating a quote.");
      return;
    }

    if (!quoteDraft.title.trim()) {
      setReviewError("Project / site is required before creating a quote.");
      return;
    }

    if (![materialMarkup, laborCostRate, laborSellRate, taxRate].every(Number.isFinite)) {
      setReviewError("Markup, labour rates, and tax rate must be valid numbers.");
      return;
    }

    const labourLines = readTakeoffLabourLines(iframeRef.current);
    const lineItems = buildQuoteLineItems({
      materialLines: matchedReviewLines,
      labourLines,
      materialMarkup,
      laborCostRate,
      laborSellRate,
    });

    if (lineItems.length === 0) {
      setReviewError("No positive material or labour lines are ready to quote yet.");
      return;
    }

    try {
      const quote = await createQuote.mutateAsync({
        customerName: quoteDraft.customerName,
        companyName: quoteDraft.companyName || null,
        contactName: quoteDraft.contactName || null,
        phone: quoteDraft.phone || null,
        email: quoteDraft.email || null,
        siteAddress: quoteDraft.siteAddress || null,
        title: quoteDraft.title,
        description: "Generated from the electrical takeoff material and labour review.",
        notes: "Created from Electrical Takeoff. Review unmatched/zero-dollar lines before sending.",
        laborCostRate,
        laborSellRate,
        taxRate,
        status: "draft",
        lineItems,
      });
      setCreatedQuote(quote);
      setReviewError(`Created draft quote ${quote.number}. Open Quotes to review pricing and customer PDF.`);
      setIsQuotePanelOpen(false);
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "Quote creation failed.");
    }
  }

  async function handleAnalyzeAutomationPdf() {
    if (!automationFile) {
      setAutomationError("Choose a PDF first.");
      return;
    }

    if (!isPdfFile(automationFile)) {
      setAutomationError("That file does not look like a PDF. Choose a normal .pdf file.");
      return;
    }

    setIsAutomationAnalyzing(true);
    setAutomationError(null);
    setAutomationResult(null);

    try {
      const result = await analyzeTakeoffPdf(automationFile);
      setAutomationResult(result);
    } catch (error) {
      setAutomationError(error instanceof Error ? error.message : "PDF analysis failed.");
    } finally {
      setIsAutomationAnalyzing(false);
    }
  }

  function handleDownloadAutomationTakeoff() {
    if (!automationResult) {
      return;
    }

    downloadJsonFile(
      automationResult.projectJson,
      `${slugifyFileName(automationResult.fileName.replace(/\.pdf$/i, "")) || "auto-takeoff"}.auto-suggested.takeoff.json`,
    );
  }

  return (
    <section
      style={{
        ...pageStyle(),
        padding: 0,
        height: "calc(100vh - 73px)",
        minHeight: "720px",
        overflow: "hidden",
        background: brand.surfaceAlt,
        display: "grid",
        gridTemplateRows: "auto minmax(0, 1fr)",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          padding: "10px 14px",
          borderBottom: `1px solid ${brand.border}`,
          background: "#ffffff",
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <strong style={{ display: "block", color: brand.text }}>Electrical Takeoff</strong>
          <span style={{ color: brand.textSoft, fontSize: "13px" }}>
            Review the takeoff material summary against your Pack Ops catalog pricing.
          </span>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button type="button" style={toolbarButtonStyle} onClick={() => setIsAutomationOpen(true)}>
            Automation Lab
          </button>
          <button type="button" style={toolbarButtonStyle} onClick={handleReviewMaterials}>
            Review Takeoff Materials
          </button>
          <button type="button" style={toolbarButtonStyle} onClick={() => setIsAdjustmentsOpen(true)}>
            Add / Modify Devices
          </button>
          {reviewLines?.length ? (
            <button type="button" style={toolbarButtonStyle} onClick={() => void handleCopyCsv()}>
              Copy CSV
            </button>
          ) : null}
        </div>
        {reviewError ? (
          <div
            role="status"
            style={{
              flexBasis: "100%",
              border: "1px solid #f0d59c",
              borderRadius: "10px",
              padding: "8px 10px",
              background: "#fff9ec",
              color: "#7a4d00",
              fontSize: "13px",
              fontWeight: 700,
            }}
          >
            {reviewError}
          </div>
        ) : null}
      </header>

      <div style={{ position: "relative", minHeight: 0 }}>
        <iframe
          ref={iframeRef}
          src="/takeoff/index.html"
          title="Residential Electrical Takeoff"
          style={frameStyle}
          onLoad={syncTakeoffCatalog}
        />

        {reviewLines ? (
          <aside
            style={{
              position: "absolute",
              top: "14px",
              right: "14px",
              width: "min(520px, calc(100% - 28px))",
              maxHeight: "calc(100% - 28px)",
              overflow: "auto",
              border: `1px solid ${brand.border}`,
              borderRadius: "14px",
              background: "#ffffff",
              boxShadow: "0 20px 50px rgba(15, 23, 42, 0.22)",
              padding: "14px",
              display: "grid",
              gap: "12px",
              zIndex: 4,
            }}
          >
            <header style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "start" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "18px", color: brand.text }}>Catalog Material Review</h2>
                <p style={{ margin: "4px 0 0", color: brand.textSoft, fontSize: "13px" }}>
                  {reviewDisplayTotals.matched} matched, {reviewDisplayTotals.unmatched} unmatched · Estimated catalog cost ${reviewDisplayTotals.totalCost.toFixed(2)}
                  {" · "}
                  Labour {reviewDisplayTotals.labourHours.toFixed(2)} hr
                </p>
              </div>
              <button type="button" style={toolbarButtonStyle} onClick={() => setReviewLines(null)}>
                Close
              </button>
            </header>

            <section
              style={{
                border: `1px solid ${brand.border}`,
                borderRadius: "12px",
                padding: "10px",
                background: brand.surfaceAlt,
                display: "flex",
                justifyContent: "space-between",
                gap: "10px",
                alignItems: "center",
              }}
            >
              <div>
                <strong style={{ display: "block", color: brand.text }}>Manual adjustments</strong>
                <span style={{ color: brand.textSoft, fontSize: "13px" }}>
                  {manualAdjustments.length} device/material change{manualAdjustments.length === 1 ? "" : "s"} included.
                </span>
              </div>
              <button type="button" style={toolbarButtonStyle} onClick={() => setIsAdjustmentsOpen(true)}>
                Open
              </button>
            </section>

            <section
              style={{
                border: `1px solid ${brand.border}`,
                borderRadius: "12px",
                padding: "10px",
                background: "#ffffff",
                display: "grid",
                gap: "8px",
              }}
            >
              <div>
                <strong style={{ display: "block", color: brand.text }}>Quote prep</strong>
                <span style={{ color: brand.textSoft, fontSize: "13px" }}>
                  Builds a new draft quote with grouped material lines and takeoff labour lines.
                </span>
              </div>
              <button type="button" style={{ ...toolbarButtonStyle, justifySelf: "start" }} onClick={openQuotePanel}>
                Create Quote
              </button>
              {createdQuote ? (
                <span style={{ color: brand.primaryDark, fontSize: "13px", fontWeight: 800 }}>
                  Draft quote {createdQuote.number} created.
                </span>
              ) : null}
            </section>

            <div style={{ display: "grid", gap: "8px" }}>
              {matchedReviewLines.map((line) => (
                <article
                  key={`${line.source}-${line.section}-${line.item}-${line.note ?? ""}`}
                  style={{
                    border: `1px solid ${line.match ? brand.border : "#f0c2a7"}`,
                    borderRadius: "10px",
                    padding: "10px",
                    display: "grid",
                    gap: "6px",
                    background: line.match ? "#ffffff" : "#fff8f4",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                    <strong style={{ color: brand.text }}>{line.item}</strong>
                    <span style={{ color: brand.primaryDark, fontWeight: 800 }}>{line.quantity}</span>
                  </div>
                  <div style={{ color: brand.textSoft, fontSize: "12px" }}>{line.section}</div>
                  {line.source === "manual" ? (
                    <div style={{ color: brand.primaryDark, fontSize: "12px", fontWeight: 800 }}>
                      Manual {line.adjustmentKind} adjustment{line.note ? ` · ${line.note}` : ""}
                    </div>
                  ) : null}
                  {line.match ? (
                    <div style={{ color: brand.textSoft, fontSize: "13px" }}>
                      Matched to <strong style={{ color: brand.text }}>{line.match.name}</strong>
                      {line.match.sku ? ` (${line.match.sku})` : ""} · {line.match.unit} · $
                      {line.match.costPrice?.toFixed(2)} each · Line ${line.lineCost?.toFixed(2)}
                    </div>
                  ) : (
                    <div style={{ color: "#9a3412", fontSize: "13px", fontWeight: 700 }}>
                      No priced catalog match yet. Add a catalog item or alias, then review again.
                    </div>
                  )}
                </article>
              ))}
            </div>
          </aside>
        ) : null}

        {isAutomationOpen ? (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="takeoff-automation-title"
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(15, 23, 42, 0.38)",
              display: "grid",
              placeItems: "center",
              padding: "18px",
              zIndex: 10,
            }}
          >
            <section
              style={{
                width: "min(920px, 100%)",
                maxHeight: "min(820px, 100%)",
                overflow: "auto",
                border: `1px solid ${brand.border}`,
                borderRadius: "14px",
                background: "#ffffff",
                boxShadow: "0 24px 70px rgba(15, 23, 42, 0.3)",
                padding: "16px",
                display: "grid",
                gap: "14px",
              }}
            >
              <header style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "start" }}>
                <div>
                  <h2 id="takeoff-automation-title" style={{ margin: 0, fontSize: "20px", color: brand.text }}>
                    Automation Lab
                  </h2>
                  <p style={{ margin: "4px 0 0", color: brand.textSoft, fontSize: "13px" }}>
                    Upload a PDF to create a separate suggested takeoff file. This does not change the active takeoff until you import the downloaded JSON.
                  </p>
                </div>
                <button type="button" style={toolbarButtonStyle} onClick={() => setIsAutomationOpen(false)}>
                  Close
                </button>
              </header>

              <div
                style={{
                  border: `1px solid ${brand.border}`,
                  borderRadius: "12px",
                  padding: "12px",
                  background: brand.surfaceAlt,
                  display: "grid",
                  gap: "10px",
                }}
              >
                <label style={{ display: "grid", gap: "6px", color: brand.textSoft, fontSize: "12px", fontWeight: 700 }}>
                  Plan PDF
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      setAutomationFile(file);
                      setAutomationResult(null);
                      setAutomationError(null);
                    }}
                    style={inputStyle}
                  />
                </label>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                  <button
                    type="button"
                    style={{ ...toolbarButtonStyle, background: brand.primary, borderColor: brand.primary, color: "#ffffff" }}
                    onClick={() => void handleAnalyzeAutomationPdf()}
                    disabled={isAutomationAnalyzing || !automationFile}
                  >
                    {isAutomationAnalyzing ? "Analyzing..." : "Analyze PDF"}
                  </button>
                  {automationResult ? (
                    <button type="button" style={toolbarButtonStyle} onClick={handleDownloadAutomationTakeoff}>
                      Download Suggested Takeoff
                    </button>
                  ) : null}
                  <span style={{ color: brand.textSoft, fontSize: "12px" }}>
                    Safe mode: output is a new import file with suggested devices only.
                  </span>
                </div>
                {automationError ? (
                  <div
                    role="status"
                    style={{
                      border: "1px solid #f0c2a7",
                      borderRadius: "10px",
                      padding: "8px 10px",
                      background: "#fff8f4",
                      color: "#9a3412",
                      fontSize: "13px",
                      fontWeight: 700,
                    }}
                  >
                    {automationError}
                  </div>
                ) : null}
              </div>

              {automationResult ? (
                <div style={{ display: "grid", gap: "12px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "8px" }}>
                    {[
                      ["Pages", String(automationResult.pageCount)],
                      ["Electrical pages", String(automationResult.pages.filter((page) => page.isLikelyElectrical).length)],
                      ["Suggested devices", String(automationResult.devices.length)],
                      ["Room labels", String(automationResult.rooms.length)],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        style={{
                          border: `1px solid ${brand.border}`,
                          borderRadius: "10px",
                          padding: "10px",
                          background: "#ffffff",
                          display: "grid",
                          gap: "4px",
                        }}
                      >
                        <span style={{ color: brand.textSoft, fontSize: "12px", fontWeight: 700 }}>{label}</span>
                        <strong style={{ color: brand.text, fontSize: "18px" }}>{value}</strong>
                      </div>
                    ))}
                  </div>

                  {automationResult.warnings.length ? (
                    <div
                      style={{
                        border: "1px solid #f0d59c",
                        borderRadius: "10px",
                        padding: "10px",
                        background: "#fff9ec",
                        color: "#7a4d00",
                        fontSize: "13px",
                      }}
                    >
                      <strong style={{ display: "block", marginBottom: "4px" }}>Review notes</strong>
                      {automationResult.warnings.join(" ")}
                    </div>
                  ) : null}

                  <section style={{ display: "grid", gap: "8px" }}>
                    <strong style={{ color: brand.text }}>Page classification</strong>
                    <div style={{ display: "grid", gap: "6px", maxHeight: "150px", overflow: "auto" }}>
                      {automationResult.pages.map((page) => (
                        <div
                          key={page.pageNumber}
                          style={{
                            border: `1px solid ${brand.border}`,
                            borderRadius: "10px",
                            padding: "8px 10px",
                            color: brand.textSoft,
                            fontSize: "13px",
                            display: "flex",
                            justifyContent: "space-between",
                            gap: "10px",
                          }}
                        >
                          <span>
                            <strong style={{ color: brand.text }}>Page {page.pageNumber}</strong>
                            {page.pageLabel ? ` · ${page.pageLabel}` : ""}
                            {" · "}
                            {page.textItemCount} text item{page.textItemCount === 1 ? "" : "s"}
                          </span>
                          <span style={{ color: page.isLikelyElectrical ? brand.primaryDark : brand.textSoft, fontWeight: 800 }}>
                            {page.isLikelyElectrical ? "Likely electrical" : "Needs review"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section style={{ display: "grid", gap: "8px" }}>
                    <strong style={{ color: brand.text }}>Suggested devices</strong>
                    {automationResult.devices.length ? (
                      <div style={{ display: "grid", gap: "6px", maxHeight: "250px", overflow: "auto" }}>
                        {automationResult.devices.slice(0, 90).map((device) => (
                          <div
                            key={device.id}
                            style={{
                              border: `1px solid ${brand.border}`,
                              borderRadius: "10px",
                              padding: "8px 10px",
                              display: "grid",
                              gap: "4px",
                              fontSize: "13px",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                              <strong style={{ color: brand.text }}>{device.label}</strong>
                              <span style={{ color: brand.primaryDark, fontWeight: 800 }}>
                                {(device.confidence * 100).toFixed(0)}%
                              </span>
                            </div>
                            <span style={{ color: brand.textSoft }}>
                              Page {device.pageNumber} · {device.catalogItemId} · "{device.sourceText}" · {device.reason}
                            </span>
                          </div>
                        ))}
                        {automationResult.devices.length > 90 ? (
                          <span style={{ color: brand.textSoft, fontSize: "12px" }}>
                            Showing first 90 of {automationResult.devices.length}. The downloaded file includes them all.
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <div
                        style={{
                          border: `1px dashed ${brand.border}`,
                          borderRadius: "10px",
                          padding: "12px",
                          color: brand.textSoft,
                          fontSize: "13px",
                          background: brand.surfaceAlt,
                        }}
                      >
                        No obvious device labels were found in the PDF text layer. This can still happen on scanned plans or drawings where the symbols are just linework.
                      </div>
                    )}
                  </section>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "10px" }}>
                    <section style={{ display: "grid", gap: "8px", minWidth: 0 }}>
                      <strong style={{ color: brand.text }}>Room label clues</strong>
                      <div style={{ display: "grid", gap: "6px", maxHeight: "170px", overflow: "auto" }}>
                        {automationResult.rooms.length ? automationResult.rooms.slice(0, 50).map((room) => (
                          <div
                            key={room.id}
                            style={{
                              border: `1px solid ${brand.border}`,
                              borderRadius: "10px",
                              padding: "8px 10px",
                              color: brand.textSoft,
                              fontSize: "13px",
                            }}
                          >
                            <strong style={{ color: brand.text }}>{room.roomType}</strong>
                            {" · "}
                            Page {room.pageNumber} · "{room.sourceText}" · {(room.confidence * 100).toFixed(0)}%
                          </div>
                        )) : (
                          <div style={{ color: brand.textSoft, fontSize: "13px" }}>No room label clues found.</div>
                        )}
                      </div>
                    </section>

                    <section style={{ display: "grid", gap: "8px", minWidth: 0 }}>
                      <strong style={{ color: brand.text }}>Scale clues</strong>
                      <div style={{ display: "grid", gap: "6px", maxHeight: "170px", overflow: "auto" }}>
                        {automationResult.scaleCandidates.length ? automationResult.scaleCandidates.slice(0, 30).map((scale) => (
                          <div
                            key={scale.id}
                            style={{
                              border: `1px solid ${brand.border}`,
                              borderRadius: "10px",
                              padding: "8px 10px",
                              color: brand.textSoft,
                              fontSize: "13px",
                            }}
                          >
                            Page {scale.pageNumber} · "{scale.sourceText}" · {(scale.confidence * 100).toFixed(0)}%
                          </div>
                        )) : (
                          <div style={{ color: brand.textSoft, fontSize: "13px" }}>
                            No scale text found. You should set scale manually in the takeoff before trusting wire quantities.
                          </div>
                        )}
                      </div>
                    </section>
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        ) : null}

        {isQuotePanelOpen ? (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="takeoff-create-quote-title"
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(15, 23, 42, 0.36)",
              display: "grid",
              placeItems: "center",
              padding: "18px",
              zIndex: 9,
            }}
          >
            <section
              style={{
                width: "min(760px, 100%)",
                maxHeight: "min(760px, 100%)",
                overflow: "auto",
                border: `1px solid ${brand.border}`,
                borderRadius: "14px",
                background: "#ffffff",
                boxShadow: "0 24px 70px rgba(15, 23, 42, 0.28)",
                padding: "16px",
                display: "grid",
                gap: "14px",
              }}
            >
              <header style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "start" }}>
                <div>
                  <h2 id="takeoff-create-quote-title" style={{ margin: 0, fontSize: "20px", color: brand.text }}>
                    Create Quote From Takeoff
                  </h2>
                  <p style={{ margin: "4px 0 0", color: brand.textSoft, fontSize: "13px" }}>
                    Creates a brand new draft quote. Review it in Quotes before sending the customer PDF.
                  </p>
                </div>
                <button type="button" style={toolbarButtonStyle} onClick={() => setIsQuotePanelOpen(false)}>
                  Close
                </button>
              </header>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "10px" }}>
                {([
                  ["Customer name", "customerName"],
                  ["Company", "companyName"],
                  ["Contact name", "contactName"],
                  ["Phone", "phone"],
                  ["Email", "email"],
                  ["Site address", "siteAddress"],
                  ["Project / site", "title"],
                ] satisfies Array<[string, keyof QuoteDraft]>).map(([label, key]) => (
                  <label key={key} style={{ display: "grid", gap: "4px", color: brand.textSoft, fontSize: "12px", fontWeight: 700 }}>
                    {label}
                    <input
                      value={quoteDraft[key as keyof QuoteDraft]}
                      onChange={(event) => setQuoteDraft((draft) => ({ ...draft, [key]: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "10px" }}>
                {([
                  ["Material markup %", "materialMarkup"],
                  ["Labour cost/hr", "laborCostRate"],
                  ["Labour sell/hr", "laborSellRate"],
                  ["Tax %", "taxRate"],
                ] satisfies Array<[string, keyof QuoteDraft]>).map(([label, key]) => (
                  <label key={key} style={{ display: "grid", gap: "4px", color: brand.textSoft, fontSize: "12px", fontWeight: 700 }}>
                    {label}
                    <input
                      type="number"
                      step="0.01"
                      value={quoteDraft[key as keyof QuoteDraft]}
                      onChange={(event) => setQuoteDraft((draft) => ({ ...draft, [key]: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                ))}
              </div>

              <div
                style={{
                  border: `1px solid ${brand.border}`,
                  borderRadius: "12px",
                  padding: "10px",
                  background: brand.surfaceAlt,
                  color: brand.textSoft,
                  fontSize: "13px",
                }}
              >
                Quote will include {matchedReviewLines.filter((line) => line.quantity > 0).length} material line(s) and{" "}
                {readTakeoffLabourLines(iframeRef.current).length} labour line(s). Unmatched materials are included at $0 so you can price them in the quote editor.
              </div>

              <button
                type="button"
                className="primary"
                style={{ ...toolbarButtonStyle, background: brand.primary, borderColor: brand.primary, color: "#ffffff", justifySelf: "start" }}
                onClick={() => void handleCreateQuote()}
                disabled={createQuote.isPending}
              >
                {createQuote.isPending ? "Creating..." : "Create Draft Quote"}
              </button>
            </section>
          </div>
        ) : null}

        {isAdjustmentsOpen ? (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="takeoff-adjustments-title"
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(15, 23, 42, 0.36)",
              display: "grid",
              placeItems: "center",
              padding: "18px",
              zIndex: 8,
            }}
          >
            <section
              style={{
                width: "min(720px, 100%)",
                maxHeight: "min(760px, 100%)",
                overflow: "auto",
                border: `1px solid ${brand.border}`,
                borderRadius: "14px",
                background: "#ffffff",
                boxShadow: "0 24px 70px rgba(15, 23, 42, 0.28)",
                padding: "16px",
                display: "grid",
                gap: "14px",
              }}
            >
              <header style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "start" }}>
                <div>
                  <h2 id="takeoff-adjustments-title" style={{ margin: 0, fontSize: "20px", color: brand.text }}>
                    Device & Material Adjustments
                  </h2>
                  <p style={{ margin: "4px 0 0", color: brand.textSoft, fontSize: "13px" }}>
                    Add or subtract one-off devices and materials. These roll into the review, CSV, and quote prep list.
                  </p>
                </div>
                <button type="button" style={toolbarButtonStyle} onClick={() => setIsAdjustmentsOpen(false)}>
                  Done
                </button>
              </header>

              <div
                style={{
                  border: `1px solid ${brand.border}`,
                  borderRadius: "12px",
                  padding: "12px",
                  background: brand.surfaceAlt,
                  display: "grid",
                  gap: "10px",
                }}
              >
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <label style={{ display: "grid", gap: "4px", color: brand.textSoft, fontSize: "12px", fontWeight: 700 }}>
                    Type
                    <select
                      value={manualAdjustmentDraft.adjustmentKind}
                      onChange={(event) =>
                        setManualAdjustmentDraft((draft) => ({
                          ...draft,
                          adjustmentKind: event.target.value as ManualAdjustmentDraft["adjustmentKind"],
                        }))
                      }
                      style={inputStyle}
                    >
                      <option value="material">Material</option>
                      <option value="device">Device</option>
                    </select>
                  </label>
                  <label style={{ display: "grid", gap: "4px", color: brand.textSoft, fontSize: "12px", fontWeight: 700 }}>
                    Quantity +/-
                    <input
                      value={manualAdjustmentDraft.quantity}
                      onChange={(event) => setManualAdjustmentDraft((draft) => ({ ...draft, quantity: event.target.value }))}
                      type="number"
                      step="0.25"
                      style={inputStyle}
                    />
                  </label>
                </div>

                <label style={{ display: "grid", gap: "4px", color: brand.textSoft, fontSize: "12px", fontWeight: 700 }}>
                  Catalog material/device
                  <select
                    value={manualAdjustmentDraft.catalogItemId}
                    onChange={(event) =>
                      setManualAdjustmentDraft((draft) => ({
                        ...draft,
                        catalogItemId: event.target.value,
                        customItem: event.target.value ? "" : draft.customItem,
                      }))
                    }
                    style={inputStyle}
                  >
                    <option value="">Custom / unmatched</option>
                    {catalogItems
                      .filter((item) => item.isActive)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}{item.sku ? ` (${item.sku})` : ""}
                        </option>
                      ))}
                  </select>
                </label>

                {!manualAdjustmentDraft.catalogItemId ? (
                  <label style={{ display: "grid", gap: "4px", color: brand.textSoft, fontSize: "12px", fontWeight: 700 }}>
                    Custom item
                    <input
                      value={manualAdjustmentDraft.customItem}
                      onChange={(event) => setManualAdjustmentDraft((draft) => ({ ...draft, customItem: event.target.value }))}
                      placeholder="Example: 1-gang box"
                      style={inputStyle}
                    />
                  </label>
                ) : null}

                <label style={{ display: "grid", gap: "4px", color: brand.textSoft, fontSize: "12px", fontWeight: 700 }}>
                  Note
                  <input
                    value={manualAdjustmentDraft.note}
                    onChange={(event) => setManualAdjustmentDraft((draft) => ({ ...draft, note: event.target.value }))}
                    placeholder="Optional reason"
                    style={inputStyle}
                  />
                </label>

                <button type="button" style={{ ...toolbarButtonStyle, justifySelf: "start" }} onClick={handleAddManualAdjustment}>
                  Add adjustment
                </button>
              </div>

              <section style={{ display: "grid", gap: "8px" }}>
                <strong style={{ color: brand.text }}>
                  Current adjustments ({manualAdjustments.length})
                </strong>
                {manualAdjustments.length ? (
                  <div style={{ display: "grid", gap: "8px" }}>
                    {manualAdjustments.map((adjustment) => (
                      <div
                        key={adjustment.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr auto auto",
                          gap: "10px",
                          alignItems: "center",
                          border: `1px solid ${brand.border}`,
                          borderRadius: "10px",
                          padding: "10px",
                          color: brand.textSoft,
                          fontSize: "13px",
                        }}
                      >
                        <span>
                          <strong style={{ color: brand.text }}>
                            {adjustment.adjustmentKind === "device" ? "Device" : "Material"}
                          </strong>
                          {" · "}
                          {adjustment.item}
                          {adjustment.note ? ` · ${adjustment.note}` : ""}
                        </span>
                        <strong style={{ color: adjustment.quantity < 0 ? "#9a3412" : brand.primaryDark }}>
                          {adjustment.quantity > 0 ? "+" : ""}{adjustment.quantity}
                        </strong>
                        <button
                          type="button"
                          style={{ ...toolbarButtonStyle, padding: "5px 8px" }}
                          onClick={() =>
                            setManualAdjustments((current) => current.filter((item) => item.id !== adjustment.id))
                          }
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    style={{
                      border: `1px dashed ${brand.border}`,
                      borderRadius: "10px",
                      padding: "14px",
                      color: brand.textSoft,
                      fontSize: "13px",
                      background: brand.surfaceAlt,
                    }}
                  >
                    No manual adjustments yet. Use this for quick adds, deletes, or custom materials before building the quote.
                  </div>
                )}
              </section>
            </section>
          </div>
        ) : null}
      </div>
    </section>
  );
}

async function loadAutomationPdfJs() {
  const { pdfjs } = await import("react-pdf");
  pdfjs.GlobalWorkerOptions.workerSrc = TAKEOFF_AUTOMATION_PDF_WORKER_SRC;
  return pdfjs;
}

async function analyzeTakeoffPdf(file: File): Promise<AutomationAnalysisResult> {
  const analyzedAt = new Date().toISOString();
  const pdfjs = await loadAutomationPdfJs();
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer.slice(0)) });
  const pdf = await loadingTask.promise;
  const pages: AutomationPageSummary[] = [];
  const allDevices: AutomationDeviceSuggestion[] = [];
  const allRooms: AutomationRoomSuggestion[] = [];
  const allScaleCandidates: AutomationScaleCandidate[] = [];
  const warnings: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();
    const textItems = normalizePdfTextItems({
      items: (textContent.items ?? []) as Array<Record<string, unknown>>,
      pageNumber,
      pageWidth: viewport.width,
      pageHeight: viewport.height,
    });
    const textLines = buildAutomationTextLines(textItems);
    const pageSummary = classifyAutomationPage(pageNumber, viewport.width, viewport.height, textItems, textLines);
    pages.push(pageSummary);
    allRooms.push(...detectAutomationRooms(textLines, pageSummary));
    allScaleCandidates.push(...detectAutomationScaleCandidates(textLines));
    allDevices.push(...detectAutomationDevices([...textItems, ...textLines], pageSummary));
  }

  const devices = dedupeAutomationDevices(allDevices).slice(0, 350);
  const rooms = dedupeAutomationRooms(allRooms).slice(0, 160);
  const scaleCandidates = dedupeAutomationScales(allScaleCandidates).slice(0, 80);

  if (devices.length === 0) {
    warnings.push("No importable device suggestions were found. The PDF may be scanned, flattened, or mostly symbol linework with no useful text layer.");
  }

  if (scaleCandidates.length === 0) {
    warnings.push("No reliable scale text was found. Set page scale manually before trusting wire quantities.");
  }

  if (pages.every((page) => !page.isLikelyElectrical)) {
    warnings.push("No page strongly classified as electrical. Suggestions may be from legends, notes, or architectural pages.");
  }

  const result: AutomationAnalysisResult = {
    fileName: file.name,
    analyzedAt,
    pageCount: pdf.numPages,
    pages,
    devices,
    rooms,
    scaleCandidates,
    warnings,
    projectJson: buildAutomationTakeoffProject({
      fileName: file.name,
      pdfData: buffer,
      analyzedAt,
      pageCount: pdf.numPages,
      pages,
      devices,
      rooms,
      scaleCandidates,
      warnings,
    }),
  };

  await pdf.destroy();
  return result;
}

function normalizePdfTextItems(input: {
  items: Array<Record<string, unknown>>;
  pageNumber: number;
  pageWidth: number;
  pageHeight: number;
}): AutomationTextCandidate[] {
  const targetHeight = input.pageHeight > 0 && input.pageWidth > 0
    ? (input.pageHeight / input.pageWidth) * AUTOMATION_PAGE_WIDTH
    : AUTOMATION_PAGE_WIDTH;

  return input.items.flatMap((item) => {
    const text = String(item.str ?? "").replace(/\s+/g, " ").trim();
    const transform = Array.isArray(item.transform) ? item.transform : [];
    const rawX = Number(transform[4]);
    const rawY = Number(transform[5]);
    const rawWidth = Number(item.width);
    const rawHeight = Number(item.height) || Math.abs(Number(transform[3])) || 8;

    if (!text || !Number.isFinite(rawX) || !Number.isFinite(rawY) || input.pageWidth <= 0 || input.pageHeight <= 0) {
      return [];
    }

    const x = clampNumber((rawX / input.pageWidth) * AUTOMATION_PAGE_WIDTH, 0, AUTOMATION_PAGE_WIDTH);
    const y = clampNumber(((input.pageHeight - rawY) / input.pageHeight) * targetHeight, 0, targetHeight);
    const width = Number.isFinite(rawWidth) ? Math.max(1, (rawWidth / input.pageWidth) * AUTOMATION_PAGE_WIDTH) : 1;
    const height = Math.max(1, (rawHeight / input.pageHeight) * targetHeight);

    return [{
      pageNumber: input.pageNumber,
      text,
      position: { x: roundQuantity(x), y: roundQuantity(y) },
      width: roundQuantity(width),
      height: roundQuantity(height),
      source: "text" as const,
    }];
  });
}

function buildAutomationTextLines(items: AutomationTextCandidate[]): AutomationTextCandidate[] {
  const sorted = [...items].sort((left, right) =>
    left.position.y - right.position.y || left.position.x - right.position.x,
  );
  const lines: AutomationTextCandidate[] = [];
  let current: AutomationTextCandidate[] = [];
  let baseline = 0;

  function flushCurrent() {
    const firstItem = current[0];
    if (!firstItem) {
      return;
    }

    const minX = Math.min(...current.map((item) => item.position.x));
    const minY = Math.min(...current.map((item) => item.position.y));
    const maxX = Math.max(...current.map((item) => item.position.x + item.width));
    const maxY = Math.max(...current.map((item) => item.position.y + item.height));
    const text = current.map((item) => item.text).join(" ").replace(/\s+/g, " ").trim();

    if (text) {
      lines.push({
        pageNumber: firstItem.pageNumber,
        text,
        position: { x: roundQuantity(minX), y: roundQuantity(minY) },
        width: roundQuantity(maxX - minX),
        height: roundQuantity(maxY - minY),
        source: "line",
      });
    }

    current = [];
    baseline = 0;
  }

  for (const item of sorted) {
    const lastItem = current[current.length - 1];
    const firstItem = current[0];
    const lastRight = lastItem ? lastItem.position.x + lastItem.width : 0;
    const startsNewLine =
      !firstItem || !lastItem
        ? false
        : item.pageNumber !== firstItem.pageNumber
          || Math.abs(item.position.y - baseline) > 6
          || item.position.x - lastRight > 160
          || item.position.x < lastItem.position.x - 4;

    if (startsNewLine) {
      flushCurrent();
    }

    current.push(item);
    baseline = current.reduce((total, candidate) => total + candidate.position.y, 0) / current.length;
  }

  flushCurrent();
  return lines.filter((line) => line.text.length <= 140);
}

function classifyAutomationPage(
  pageNumber: number,
  width: number,
  height: number,
  textItems: AutomationTextCandidate[],
  textLines: AutomationTextCandidate[],
): AutomationPageSummary {
  const fullText = [...textItems, ...textLines].map((item) => item.text).join(" ").toLowerCase();
  const matchedKeywords = AUTOMATION_ELECTRICAL_KEYWORDS.filter((keyword) => fullText.includes(keyword));
  const drawingNumberBoost = /\bE[-\s]?\d+(?:\.\d+)?\b/i.test(fullText) ? 1 : 0;
  const electricalScore = matchedKeywords.length + drawingNumberBoost;
  const pageLabelLine = textLines.find((line) =>
    line.text.length <= 90 && /\b(?:ELECTRICAL|POWER|LIGHTING|E[-\s]?\d+(?:\.\d+)?)\b/i.test(line.text),
  );

  return {
    pageNumber,
    pageLabel: pageLabelLine?.text ?? null,
    width: roundQuantity(width),
    height: roundQuantity(height),
    textItemCount: textItems.length,
    electricalScore,
    isLikelyElectrical: electricalScore >= 2 || /\b(?:electrical|lighting plan|power plan)\b/i.test(fullText),
    matchedKeywords,
  };
}

function detectAutomationDevices(
  textCandidates: AutomationTextCandidate[],
  pageSummary: AutomationPageSummary,
): AutomationDeviceSuggestion[] {
  const suggestions: AutomationDeviceSuggestion[] = [];

  for (const candidate of textCandidates) {
    const text = candidate.text.trim();
    if (!text || text.length > 90 || looksLikeNonDevicePlanText(text)) {
      continue;
    }

    for (const rule of AUTOMATION_DEVICE_RULES) {
      if (!rule.pattern.test(text) || shouldSkipAutomationDeviceRule(rule.catalogItemId, text, candidate)) {
        continue;
      }

      const confidence = clampNumber(
        rule.confidence + (pageSummary.isLikelyElectrical ? 0.08 : -0.04) + (candidate.source === "text" ? 0.02 : 0),
        0.35,
        0.92,
      );

      suggestions.push({
        id: makeBrowserId("auto-device"),
        pageNumber: candidate.pageNumber,
        catalogItemId: rule.catalogItemId,
        label: rule.label,
        sourceText: text,
        position: candidate.position,
        confidence: roundQuantity(confidence),
        reason: pageSummary.isLikelyElectrical ? rule.reason : `${rule.reason} Page was not strongly classified as electrical.`,
      });
      break;
    }
  }

  return suggestions;
}

function shouldSkipAutomationDeviceRule(catalogItemId: string, text: string, candidate: AutomationTextCandidate): boolean {
  const upper = text.toUpperCase();

  if (catalogItemId === "panel" && /\b(?:SUB\s*PANEL|SUBPANEL)\b/i.test(text)) {
    return true;
  }

  if (catalogItemId === "range-outlet" && /\bGAS\s*RANGE\b/i.test(text)) {
    return true;
  }

  if (catalogItemId === "heat-pump" && /\bDISCONNECT\b/i.test(text)) {
    return true;
  }

  if (catalogItemId === "baseboard-heater" && /\b(?:WATER HEATER|HWT)\b/i.test(text)) {
    return true;
  }

  if (catalogItemId === "switch" && candidate.source === "line" && !/\bSWITCH\b/i.test(text) && upper !== "S" && upper !== "S1") {
    return true;
  }

  if (catalogItemId === "co-alarm" && /\bCO\b/i.test(text) && text.length > 28 && !/\bCARBON\b/i.test(text)) {
    return true;
  }

  if (catalogItemId === "tv-coax-outlet" && /\bCABLE\b/i.test(text) && /\b(?:WIRE|NMD|AWG|CIRCUIT)\b/i.test(text)) {
    return true;
  }

  return false;
}

function looksLikeNonDevicePlanText(text: string): boolean {
  return /\b(?:GENERAL NOTES|DRAWING LIST|ISSUED FOR|REVISION|SHEET|DETAIL|SECTION|SCALE|NORTH|PROJECT|ADDRESS|SPECIFICATION)\b/i.test(text)
    || /^\d+(?:\.\d+)?$/.test(text.trim());
}

function detectAutomationRooms(
  textLines: AutomationTextCandidate[],
  pageSummary: AutomationPageSummary,
): AutomationRoomSuggestion[] {
  const rooms: AutomationRoomSuggestion[] = [];

  for (const line of textLines) {
    const text = line.text.trim();
    if (!text || text.length > 55 || looksLikeNonRoomText(text)) {
      continue;
    }

    for (const rule of AUTOMATION_ROOM_RULES) {
      if (!rule.pattern.test(text)) {
        continue;
      }

      rooms.push({
        id: makeBrowserId("auto-room"),
        pageNumber: line.pageNumber,
        roomType: rule.roomType,
        sourceText: text,
        position: line.position,
        confidence: roundQuantity(clampNumber(pageSummary.isLikelyElectrical ? 0.74 : 0.6, 0.35, 0.9)),
      });
      break;
    }
  }

  return rooms;
}

function looksLikeNonRoomText(text: string): boolean {
  return /\b(?:SCALE|NOTE|LEGEND|SCHEDULE|PANEL|CIRCUIT|DRAWING|PROJECT|LIGHTING|POWER|RECEPTACLE|SWITCH)\b/i.test(text);
}

function detectAutomationScaleCandidates(textLines: AutomationTextCandidate[]): AutomationScaleCandidate[] {
  return textLines.flatMap((line) => {
    const text = line.text.trim();
    const hasArchitecturalScale = /\b(?:SCALE\s*)?(?:\d+\/\d+|\d+(?:\.\d+)?)\s*(?:"|IN|INCH)?\s*=\s*\d+(?:\.\d+)?\s*(?:'|FT|FEET|M|MM|IN|")/i.test(text);
    const hasRatioScale = /\bSCALE\s*[:=]?\s*1\s*:\s*\d+\b/i.test(text);

    if (!hasArchitecturalScale && !hasRatioScale) {
      return [];
    }

    return [{
      id: makeBrowserId("auto-scale"),
      pageNumber: line.pageNumber,
      sourceText: text,
      position: line.position,
      confidence: hasArchitecturalScale ? 0.72 : 0.62,
    }];
  });
}

function dedupeAutomationDevices(devices: AutomationDeviceSuggestion[]): AutomationDeviceSuggestion[] {
  const sorted = [...devices].sort((left, right) => right.confidence - left.confidence);
  const accepted: AutomationDeviceSuggestion[] = [];

  for (const device of sorted) {
    const duplicate = accepted.some((current) =>
      current.pageNumber === device.pageNumber
      && current.catalogItemId === device.catalogItemId
      && distanceBetween(current.position, device.position) < 22,
    );

    if (!duplicate) {
      accepted.push(device);
    }
  }

  return accepted.sort((left, right) =>
    left.pageNumber - right.pageNumber
    || left.position.y - right.position.y
    || left.position.x - right.position.x,
  );
}

function dedupeAutomationRooms(rooms: AutomationRoomSuggestion[]): AutomationRoomSuggestion[] {
  const accepted: AutomationRoomSuggestion[] = [];

  for (const room of rooms) {
    const duplicate = accepted.some((current) =>
      current.pageNumber === room.pageNumber
      && current.roomType === room.roomType
      && distanceBetween(current.position, room.position) < 24,
    );

    if (!duplicate) {
      accepted.push(room);
    }
  }

  return accepted;
}

function dedupeAutomationScales(scales: AutomationScaleCandidate[]): AutomationScaleCandidate[] {
  const accepted: AutomationScaleCandidate[] = [];

  for (const scale of scales) {
    const duplicate = accepted.some((current) =>
      current.pageNumber === scale.pageNumber
      && normalizeMatchText(current.sourceText) === normalizeMatchText(scale.sourceText),
    );

    if (!duplicate) {
      accepted.push(scale);
    }
  }

  return accepted;
}

function buildAutomationTakeoffProject(input: {
  fileName: string;
  pdfData: ArrayBuffer;
  analyzedAt: string;
  pageCount: number;
  pages: AutomationPageSummary[];
  devices: AutomationDeviceSuggestion[];
  rooms: AutomationRoomSuggestion[];
  scaleCandidates: AutomationScaleCandidate[];
  warnings: string[];
}): Record<string, unknown> {
  return {
    app: "electrical-takeoff-app",
    version: 3,
    savedAt: input.analyzedAt,
    projectName: `${input.fileName.replace(/\.pdf$/i, "")} auto suggested`,
    pdfName: input.fileName,
    pdfDataUrl: `data:application/pdf;base64,${arrayBufferToBase64(input.pdfData)}`,
    currentPageNumber: 1,
    viewState: { zoom: 1, pan: { x: 0, y: 0 } },
    rooms: [],
    devices: input.devices.map((device) => ({
      id: device.id,
      planPageId: `pdf-page-${device.pageNumber}`,
      pdfPageNumber: device.pageNumber,
      catalogItemId: device.catalogItemId,
      position: device.position,
      inclusionStatus: "included",
    })),
    connections: [],
    boxGroups: [],
    planScales: [],
    wireSettings: {
      switchVerticalAllowanceFeet: 5,
      applianceVerticalAllowanceFeet: 8,
      defaultRiserDropMeters: 3,
      wastePercent: 12,
    },
    automationReport: {
      generatedBy: "Pack Ops Automation Lab",
      generatedAt: input.analyzedAt,
      reversible: true,
      note: "Generated as a suggested import file. Review every device, set scale, and correct circuiting before quoting.",
      pages: input.pages,
      suggestedDevices: input.devices,
      roomLabelClues: input.rooms,
      scaleClues: input.scaleCandidates,
      warnings: input.warnings,
    },
  };
}

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function downloadJsonFile(data: unknown, fileName: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return window.btoa(binary);
}

function slugifyFileName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function makeBrowserId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function distanceBetween(left: AutomationPosition, right: AutomationPosition): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function readTakeoffMaterialLines(iframe: HTMLIFrameElement | null): TakeoffMaterialLine[] {
  const document = iframe?.contentDocument;
  if (!document) {
    return [];
  }

  const sections = Array.from(document.querySelectorAll(".material-section"));
  const materialLines = sections.flatMap((section) => {
    const sectionName = section.querySelector("h3")?.textContent?.trim() || "Materials";
    return Array.from(section.querySelectorAll(".takeoff.compact > div")).flatMap((row) => {
      const item = row.querySelector("span")?.textContent?.trim();
      const quantityText = row.querySelector("strong")?.textContent?.trim() ?? "";
      const quantity = parseTakeoffQuantity(quantityText);

      if (!item || !Number.isFinite(quantity) || quantity <= 0) {
        return [];
      }

      return [{ section: sectionName, item, quantity }];
    });
  });

  if (materialLines.some(isWireLikeLine)) {
    return materialLines;
  }

  const wireLines = Array.from(document.querySelectorAll(".wire-results .wire-row")).flatMap((row) => {
    const label = row.querySelector("span")?.textContent?.trim() ?? "";
    const quantityText = row.querySelector("strong")?.textContent?.trim() ?? "";
    const wireType = label.split(" - ").pop()?.trim();
    const quantity = parseTakeoffQuantity(quantityText);

    if (!wireType || !Number.isFinite(quantity) || quantity <= 0) {
      return [];
    }

    return [{ section: "Wire", item: `${wireType} wire (m)`, quantity }];
  });

  return rollUpTakeoffMaterialLines([...materialLines, ...wireLines]);
}

function readTakeoffLabourLines(iframe: HTMLIFrameElement | null): TakeoffLabourLine[] {
  const document = iframe?.contentDocument;
  if (!document) {
    return [];
  }

  return Array.from(document.querySelectorAll(".takeoff.compact > div")).flatMap((row) => {
    const item = row.querySelector("span")?.textContent?.trim();
    const quantityText = row.querySelector("strong")?.textContent?.trim() ?? "";

    if (!item || item.toLowerCase().includes("total labour") || !quantityText.toLowerCase().includes("hr")) {
      return [];
    }

    const hours = parseTakeoffQuantity(quantityText);
    if (!Number.isFinite(hours) || hours <= 0) {
      return [];
    }

    const [phase, ...rest] = item.split(":");
    return [{
      phase: phase?.trim() || "Labour",
      item: rest.join(":").trim() || item,
      hours,
    }];
  });
}

function getTakeoffProjectName(iframe: HTMLIFrameElement | null): string | null {
  const document = iframe?.contentDocument;
  if (!document) {
    return null;
  }

  const projectInput = Array.from(document.querySelectorAll("input")).find((input) =>
    input.previousSibling?.textContent?.toLowerCase().includes("project"),
  );
  return projectInput?.value?.trim() || null;
}

function matchTakeoffLine(line: TakeoffMaterialLine, catalogItems: CatalogItem[]): MatchedTakeoffMaterialLine {
  const rankedMatches = catalogItems
    .map((item) => ({ item, score: scoreCatalogMatch(line.item, item) }))
    .sort((left, right) => right.score - left.score);
  const best = rankedMatches[0];
  const match = best && best.score >= 0.52 ? best.item : null;
  const lineCost = match?.costPrice !== null && match?.costPrice !== undefined
    ? Math.round(match.costPrice * line.quantity * 100) / 100
    : null;

  return {
    ...line,
    match,
    matchScore: best?.score ?? 0,
    lineCost,
    source: "takeoff",
  };
}

function buildReviewLines(
  takeoffLines: MatchedTakeoffMaterialLine[],
  manualAdjustments: ManualAdjustment[],
  catalogItems: CatalogItem[],
): MatchedTakeoffMaterialLine[] {
  const manualLines = manualAdjustments.map((adjustment) => {
    const catalogMatch = adjustment.catalogItemId
      ? catalogItems.find((item) => item.id === adjustment.catalogItemId) ?? null
      : null;
    const baseLine: TakeoffMaterialLine = {
      section: adjustment.adjustmentKind === "device" ? "Manual Devices" : "Manual Materials",
      item: adjustment.item,
      quantity: adjustment.quantity,
    };
    const matchedLine = catalogMatch
      ? {
          ...baseLine,
          match: catalogMatch,
          matchScore: 1,
          lineCost: catalogMatch.costPrice !== null
            ? Math.round(catalogMatch.costPrice * adjustment.quantity * 100) / 100
            : null,
          source: "manual" as const,
          adjustmentKind: adjustment.adjustmentKind,
          ...(adjustment.note ? { note: adjustment.note } : {}),
        }
      : {
          ...matchTakeoffLine(baseLine, catalogItems),
          source: "manual" as const,
          adjustmentKind: adjustment.adjustmentKind,
          ...(adjustment.note ? { note: adjustment.note } : {}),
        };

    return matchedLine;
  });

  return rollUpReviewLines([...takeoffLines, ...manualLines]);
}

function rollUpReviewLines(lines: MatchedTakeoffMaterialLine[]): MatchedTakeoffMaterialLine[] {
  const rolledUp = new Map<string, MatchedTakeoffMaterialLine>();

  for (const line of lines) {
    const key = [
      line.source,
      line.section,
      line.item,
      line.match?.id ?? "unmatched",
      line.adjustmentKind ?? "",
      line.note ?? "",
    ].join("::");
    const current = rolledUp.get(key);
    if (!current) {
      rolledUp.set(key, line);
      continue;
    }

    const quantity = Math.round((current.quantity + line.quantity) * 100) / 100;
    rolledUp.set(key, {
      ...current,
      quantity,
      lineCost: current.match?.costPrice !== null && current.match?.costPrice !== undefined
        ? Math.round(current.match.costPrice * quantity * 100) / 100
        : null,
    });
  }

  return [...rolledUp.values()].filter((line) => line.quantity !== 0);
}

function buildQuoteLineItems(input: {
  materialLines: MatchedTakeoffMaterialLine[];
  labourLines: TakeoffLabourLine[];
  materialMarkup: number;
  laborCostRate: number;
  laborSellRate: number;
}): QuoteLineItemInput[] {
  const lineItems: QuoteLineItemInput[] = [];

  input.materialLines
    .filter((line) => line.quantity > 0)
    .forEach((line, index) => {
      const unitCost = line.match?.costPrice ?? 0;
      lineItems.push({
        catalogItemId: line.match?.id ?? null,
        sortOrder: index,
        description: line.match?.name ?? line.item,
        sku: line.match?.sku ?? null,
        note: line.note ?? (line.match ? null : `Unmatched takeoff item: ${line.item}`),
        sectionName: normalizeQuoteSection(line.section, line.item),
        sourceType: line.match ? "material" : "manual",
        lineKind: "item",
        quantity: roundQuantity(line.quantity),
        unit: line.match?.unit ?? inferTakeoffUnit(line),
        unitCost,
        unitSell: roundMoney(unitCost * (1 + input.materialMarkup / 100)),
      });
    });

  rollUpLabourForQuote(input.labourLines)
    .forEach((line, index) => {
      lineItems.push({
        sortOrder: lineItems.length + index,
        description: `${line.phase} labour`,
        note: line.item,
        sectionName: normalizeQuoteSection(line.phase),
        sourceType: "manual",
        lineKind: "labor",
        quantity: roundQuantity(line.hours),
        unit: "hr",
        unitCost: roundMoney(input.laborCostRate),
        unitSell: roundMoney(input.laborSellRate),
      });
    });

  return lineItems;
}

function normalizeQuoteSection(section: string, item = ""): string {
  const lower = `${section} ${item}`.toLowerCase();
  if (lower.includes("panel") || lower.includes("subpanel")) {
    return "Service";
  }
  if (lower.includes("breaker") || lower.includes("plate") || lower.includes("device") || lower.includes("fixture")) {
    return "Finish";
  }
  if (
    lower.includes("box")
    || lower.includes("wire")
    || lower.includes("nmd")
    || lower.includes("cable")
    || lower.includes("awg")
    || lower.includes("vapour")
    || lower.includes("vapor")
    || lower.includes("boot")
  ) {
    return "Rough-in";
  }
  if (lower.includes("finish")) {
    return "Finish";
  }
  return "Rough-in";
}

function rollUpTakeoffMaterialLines(lines: TakeoffMaterialLine[]): TakeoffMaterialLine[] {
  const rolledUp = new Map<string, TakeoffMaterialLine>();
  for (const line of lines) {
    const key = `${line.section.toLowerCase()}::${line.item.toLowerCase()}`;
    const current = rolledUp.get(key);
    rolledUp.set(key, current
      ? { ...current, quantity: roundQuantity(current.quantity + line.quantity) }
      : line);
  }
  return [...rolledUp.values()];
}

function rollUpLabourForQuote(lines: TakeoffLabourLine[]): TakeoffLabourLine[] {
  const grouped = new Map<string, TakeoffLabourLine>();
  for (const line of lines) {
    if (line.hours <= 0) {
      continue;
    }
    const phase = normalizeQuoteSection(line.phase);
    const current = grouped.get(phase);
    grouped.set(phase, current
      ? {
          phase,
          item: [current.item, line.item].filter(Boolean).join("; "),
          hours: roundQuantity(current.hours + line.hours),
        }
      : { phase, item: line.item, hours: roundQuantity(line.hours) });
  }
  return ["Service", "Rough-in", "Finish"]
    .map((phase) => grouped.get(phase))
    .filter((line): line is TakeoffLabourLine => Boolean(line));
}

function inferTakeoffUnit(line: TakeoffMaterialLine): string {
  const lower = `${line.section} ${line.item}`.toLowerCase();
  if (lower.includes("wire") || lower.includes("nmd") || lower.includes("cable") || lower.includes("awg")) {
    return "m";
  }
  return "each";
}

function isWireLikeLine(line: TakeoffMaterialLine): boolean {
  const lower = `${line.section} ${line.item}`.toLowerCase();
  return lower.includes("wire") || lower.includes("nmd") || lower.includes("cable") || lower.includes("awg");
}

function parseTakeoffQuantity(value: string): number {
  const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : Number.NaN;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function scoreCatalogMatch(takeoffItem: string, catalogItem: CatalogItem): number {
  const query = normalizeMatchText(takeoffItem);
  const candidates = [
    catalogItem.name,
    catalogItem.sku ?? "",
    catalogItem.category ?? "",
    catalogItem.notes ?? "",
    ...catalogItem.aliases,
  ].map(normalizeMatchText).filter(Boolean);

  if (!query || candidates.length === 0) {
    return 0;
  }

  let bestScore = 0;
  for (const candidate of candidates) {
    if (candidate === query) {
      bestScore = Math.max(bestScore, 1);
    } else if (candidate.includes(query) || query.includes(candidate)) {
      bestScore = Math.max(bestScore, 0.88);
    } else {
      bestScore = Math.max(bestScore, tokenOverlap(query, candidate), bigramSimilarity(query, candidate));
    }
  }

  return bestScore;
}

function normalizeMatchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b14\/2\b/g, "2c14")
    .replace(/\b14\/3\b/g, "3c14")
    .replace(/\bromex\b/g, "nmd")
    .replace(/\bgfci\b/g, "gfi")
    .replace(/\bafci\b/g, "arc fault")
    .replace(/\bpot\s*light\b/g, "recessed light")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenOverlap(left: string, right: string): number {
  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let shared = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      shared += 1;
    }
  }
  return shared / Math.max(leftTokens.size, rightTokens.size);
}

function bigramSimilarity(left: string, right: string): number {
  const leftSet = bigramSet(left.replace(/\s+/g, ""));
  const rightSet = bigramSet(right.replace(/\s+/g, ""));
  if (leftSet.size === 0 || rightSet.size === 0) {
    return 0;
  }

  let shared = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) {
      shared += 1;
    }
  }
  return (2 * shared) / (leftSet.size + rightSet.size);
}

function bigramSet(value: string): Set<string> {
  if (value.length < 2) {
    return new Set(value ? [value] : []);
  }

  const result = new Set<string>();
  for (let index = 0; index < value.length - 1; index += 1) {
    result.add(value.slice(index, index + 2));
  }
  return result;
}
