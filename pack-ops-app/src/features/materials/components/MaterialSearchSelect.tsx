import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import type { CatalogItem } from "@/domain/materials/types";
import { rankCatalogItems } from "@/services/materials/material-search";

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

export const MaterialSearchSelect = forwardRef<
  MaterialSearchSelectHandle,
  MaterialSearchSelectProps
>(function MaterialSearchSelect(
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
    catalogItems.find(
      (material) => material.id === (selectedMaterialId as CatalogItem["id"]),
    ) ?? null;
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listId = useId();
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

  const matchedItems = useMemo(() => {
    const baseItems = query.trim()
      ? rankCatalogItems(catalogItems, query)
      : catalogItems;

    return baseItems;
  }, [catalogItems, query]);

  const filteredItems = matchedItems.slice(0, 12);
  useEffect(() => setActiveIndex(-1), [query]);
  useEffect(() => {
    if (activeIndex >= 0)
      document
        .getElementById(`${listId}-${activeIndex}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, listId]);
  function choose(material: CatalogItem) {
    onSelect(material.id);
    setQuery("");
    setIsOpen(false);
    setActiveIndex(-1);
  }
  return (
    <div
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsOpen(false);
          setQuery("");
        }
      }}
      style={{ position: "relative", display: "grid", gap: "6px" }}
    >
      <input
        ref={inputRef}
        role="combobox"
        aria-label="Search materials"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listId : undefined}
        aria-activedescendant={
          isOpen && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined
        }
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setIsOpen(false);
            setActiveIndex(-1);
            event.preventDefault();
          }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setIsOpen(true);
            setActiveIndex((index) =>
              event.key === "ArrowDown"
                ? Math.min(index + 1, filteredItems.length - 1)
                : Math.max(index - 1, 0),
            );
          }
          if (event.key === "Enter" && isOpen) {
            event.preventDefault();
            const item = filteredItems[activeIndex];
            if (item) choose(item);
          }
        }}
        style={{ fontSize: "16px", padding: "12px" }}
        value={
          isOpen
            ? query
            : selectedMaterial
              ? getMaterialLabel(selectedMaterial)
              : query
        }
        placeholder={placeholder.replace(
          "name or SKU",
          "name, alias, category, or SKU",
        )}
        disabled={isPending}
        onFocus={() => {
          setIsOpen(true);
          setQuery("");
          setActiveIndex(-1);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setIsOpen(true);
        }}
      />

      {isOpen ? (
        <div
          id={listId}
          role="listbox"
          aria-label="Material matches"
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
            <div style={{ padding: "10px 12px", color: "#5b6475" }}>
              No materials match that search.
            </div>
          ) : (
            filteredItems.map((material, index) => (
              <button
                key={material.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={activeIndex === index}
                type="button"
                disabled={isPending}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  choose(material);
                }}
                style={{
                  width: "100%",
                  textAlign: "left",
                  border: 0,
                  borderBottom: "1px solid #eef2f7",
                  background:
                    activeIndex === index || material.id === selectedMaterialId
                      ? "#eef4ff"
                      : "#fff",
                  padding: "10px 12px",
                  display: "grid",
                  gap: "2px",
                }}
              >
                <strong style={{ color: "#172033" }}>{material.name}</strong>
                <span style={{ color: "#5b6475", fontSize: "13px" }}>
                  {material.sku ? `${material.sku} · ` : ""}
                  {material.category || "Uncategorized"} · {material.unit}
                </span>
                {material.aliases.length > 0 ? (
                  <span
                    style={{
                      color: "#7b8698",
                      fontSize: "12px",
                      overflowWrap: "anywhere",
                    }}
                  >
                    Also found by: {material.aliases.slice(0, 3).join(", ")}
                  </span>
                ) : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
});
