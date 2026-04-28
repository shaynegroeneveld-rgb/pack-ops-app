import { useState } from "react";

import { GstSummaryPage } from "@/features/finance/components/GstSummaryPage";
import { MonthlyClosePage } from "@/features/finance/components/MonthlyClosePage";
import { brand, chipStyle, pageStyle } from "@/features/shared/ui/mobile-styles";

type MonthEndTab = "close" | "gst";

export function MonthEndPage({ initialTab = "close" }: { initialTab?: MonthEndTab }) {
  const [activeTab, setActiveTab] = useState<MonthEndTab>(initialTab);

  return (
    <section style={pageStyle()}>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px", borderBottom: `1px solid ${brand.border}`, paddingBottom: "12px" }}>
        <button type="button" style={chipStyle(activeTab === "close")} onClick={() => setActiveTab("close")}>Monthly Close</button>
        <button type="button" style={chipStyle(activeTab === "gst")} onClick={() => setActiveTab("gst")}>GST Summary</button>
      </div>
      <div style={{ margin: "-22px" }}>
        {activeTab === "close" ? <MonthlyClosePage /> : <GstSummaryPage />}
      </div>
    </section>
  );
}
