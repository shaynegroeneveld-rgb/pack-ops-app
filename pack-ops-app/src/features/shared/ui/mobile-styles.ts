import type { CSSProperties } from "react";

export const brand = {
  primary: "#0f6d5f",
  primaryDark: "#0a4f45",
  primarySoft: "#e7f5f2",
  border: "#e3e8e6",
  cardBorder: "#e5ebe9",
  text: "#172033",
  textMuted: "#445168",
  textSoft: "#5d6978",
  surface: "#ffffff",
  surfaceAlt: "#f7f9f8",
  shadow: "0 6px 18px rgba(23, 32, 51, 0.045)",
};

export function pageStyle(): CSSProperties {
  return {
    padding: "22px",
    fontFamily: "ui-sans-serif, system-ui",
    color: brand.text,
    background: brand.surfaceAlt,
    minHeight: "100vh",
  };
}

export function pageHeaderStyle(): CSSProperties {
  return {
    display: "flex",
    justifyContent: "space-between",
    gap: "16px",
    alignItems: "center",
    flexWrap: "wrap",
    marginBottom: "18px",
  };
}

export function titleStyle(): CSSProperties {
  return {
    margin: 0,
    fontSize: "31px",
    lineHeight: 1.1,
    letterSpacing: "-0.02em",
  };
}

export function subtitleStyle(): CSSProperties {
  return {
    margin: "6px 0 0",
    color: brand.textMuted,
    fontSize: "15px",
    lineHeight: 1.45,
    maxWidth: "56ch",
  };
}

export function sectionTitleStyle(): CSSProperties {
  return {
    margin: 0,
    fontSize: "21px",
    lineHeight: 1.2,
    letterSpacing: "-0.015em",
  };
}

export function cardStyle(background = brand.surface): CSSProperties {
  return {
    border: `1px solid ${brand.cardBorder}`,
    borderRadius: "20px",
    padding: "18px",
    background,
    boxShadow: brand.shadow,
  };
}

export function softCardStyle(): CSSProperties {
  return {
    ...cardStyle(brand.surfaceAlt),
    boxShadow: "none",
  };
}

export function primaryButtonStyle(): CSSProperties {
  return {
    minHeight: "44px",
    borderRadius: "14px",
    border: "1px solid transparent",
    background: brand.primary,
    color: "#ffffff",
    padding: "12px 16px",
    fontWeight: 700,
    fontSize: "14px",
    boxShadow: "0 8px 16px rgba(15, 109, 95, 0.14)",
  };
}

export function secondaryButtonStyle(active = false): CSSProperties {
  return {
    minHeight: "44px",
    borderRadius: "14px",
    border: `1px solid ${active ? brand.primary : brand.border}`,
    background: active ? brand.primarySoft : "rgba(255,255,255,0.9)",
    color: active ? brand.primaryDark : brand.text,
    padding: "12px 16px",
    fontWeight: 700,
    fontSize: "14px",
  };
}

export function chipStyle(active = false): CSSProperties {
  return {
    borderRadius: "999px",
    border: `1px solid ${active ? brand.primary : brand.border}`,
    background: active ? brand.primarySoft : "rgba(255,255,255,0.88)",
    color: active ? brand.primaryDark : brand.text,
    padding: "10px 14px",
    fontWeight: 700,
    minHeight: "44px",
  };
}

export function badgeStyle(background: string, color: string): CSSProperties {
  return {
    borderRadius: "999px",
    padding: "7px 11px",
    fontSize: "12px",
    fontWeight: 700,
    background,
    color,
  };
}

export function feedbackStyle(tone: "error" | "success"): CSSProperties {
  return {
    border: "1px solid",
    borderColor: tone === "error" ? "#f3b2b2" : "#b7e0c0",
    borderRadius: "14px",
    padding: "14px 16px",
    background: tone === "error" ? "#fff4f4" : "#f2fbf4",
    color: tone === "error" ? "#8f1d1d" : "#1f6b37",
    marginBottom: "16px",
  };
}

export function floatingButtonStyle(): CSSProperties {
  return {
    position: "fixed",
    right: "20px",
    bottom: "20px",
    width: "60px",
    height: "60px",
    borderRadius: "999px",
    border: "none",
    background: brand.primary,
    color: "#fff",
    fontSize: "30px",
    fontWeight: 700,
    boxShadow: "0 12px 24px rgba(15, 109, 95, 0.2)",
  };
}
