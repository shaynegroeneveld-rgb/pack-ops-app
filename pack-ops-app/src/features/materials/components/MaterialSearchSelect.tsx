import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import type { CatalogItem } from "@/domain/materials/types";

export interface MaterialSearchSelectHandle {
  focus: () => void;
  clear: () => void;
}

interface MaterialSearchSelectProps {
  catalogItems: CatalogItem[];
  selectedMaterialId: string;
  isPending: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  onSelect: (materialId: string) => void;
}

function getMaterialLabel(material: CatalogItem): string {
  return `${material.category ? `${material.category} · ` : ""}${material.name}${material.sku ? ` (${material.sku})` : ""}`;
}

export const MaterialSearchSelect = forwardRef<MaterialSearchSelectHandle, MaterialSearchSelectProps>(
  function MaterialSearchSelect(
    {
      catalogItems,
      selectedMaterialId,
      isPending,
      placeholder = "Search by name or SKU...",
      autoFocus = false,
      onSelect,
    }: MaterialSearchSelectProps,
    ref,
  ) {
    const selectedMaterial =
      catalogItems.find((material) => material.id === (selectedMaterialId as CatalogItem["id"])) ?? null;
    const [query, setQuery] = useState("");
    const [isOpen, setIsOpen] = useState(false);
    const inputRef = useRef<HTMLInputElement | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        focus: () => {
          inputRef.current?.focus();
        },
        clear: () => {
          setQuery("");
          setIsOpen(false);
        },
      }),
      [],
    );

    useEffect(() => {
      if (autoFocus) {
        inputRef.current?.focus();
      }
    }, [autoFocus]);

    const filteredItems = useMemo(() => {
      const normalized = query.trim().toLowerCase();
      const baseItems = normalized
        ? catalogItems.filter((material) => {
            const nameMatch = material.name.toLowerCase().includes(normalized);
            const skuMatch = material.sku?.toLowerCase().includes(normalized) ?? false;
            return nameMatch || skuMatch;
          })
        : catalogItems;

      return baseItems.slice(0, 12);
    }, [catalogItems, query]);

    return (
      <div style={{ position: "relative", display: "grid", gap: "6px" }}>
        <input
          ref={inputRef}
          style={{ fontSize: "16px", padding: "12px" }}
          value={isOpen ? query : selectedMaterial ? getMaterialLabel(selectedMaterial) : query}
          placeholder={placeholder}
          disabled={isPending}
          onFocus={() => {
            setIsOpen(true);
            setQuery(selectedMaterial ? getMaterialLabel(selectedMaterial) : "");
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
          onBlur={() => {
            window.setTimeout(() => {
              setIsOpen(false);
              setQuery("");
            }, 120);
          }}
        />

        {isOpen ? (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              right: 0,
              border: "1px solid #d9dfeb",
              borderRadius: "12px",
              background: "#fff",
              boxShadow: "0 10px 30px rgba(23, 32, 51, 0.12)",
              maxHeight: "240px",
              overflow: "auto",
              zIndex: 10,
            }}
          >
            {filteredItems.length === 0 ? (
              <div style={{ padding: "10px 12px", color: "#5b6475" }}>No materials match that search.</div>
            ) : (
              filteredItems.map((material) => (
                <button
                  key={material.id}
                  type="button"
                  disabled={isPending}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onSelect(material.id);
                    setQuery("");
                    setIsOpen(false);
                  }}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    border: 0,
                    borderBottom: "1px solid #eef2f7",
                    background: material.id === selectedMaterialId ? "#eef4ff" : "#fff",
                    padding: "10px 12px",
                    display: "grid",
                    gap: "2px",
                  }}
                >
                  <strong style={{ color: "#172033" }}>{material.name}</strong>
                  <span style={{ color: "#5b6475", fontSize: "13px" }}>
                    {material.sku ? `${material.sku} · ` : ""}
                    {material.category || "Uncategorized"}
                  </span>
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>
    );
  },
);
