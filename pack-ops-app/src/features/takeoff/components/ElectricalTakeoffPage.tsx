import type { CSSProperties } from "react";

import { brand, pageStyle } from "@/features/shared/ui/mobile-styles";

const frameStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  border: 0,
  display: "block",
  background: "#eef2f1",
};

export function ElectricalTakeoffPage() {
  return (
    <section
      style={{
        ...pageStyle(),
        padding: 0,
        height: "calc(100vh - 73px)",
        minHeight: "720px",
        overflow: "hidden",
        background: brand.surfaceAlt,
      }}
    >
      <iframe
        src="/takeoff/index.html"
        title="Residential Electrical Takeoff"
        style={frameStyle}
      />
    </section>
  );
}
