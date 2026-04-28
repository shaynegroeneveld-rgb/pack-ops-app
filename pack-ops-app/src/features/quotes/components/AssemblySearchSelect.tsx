import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import type { AssemblyView } from "@/domain/materials/types";

export interface AssemblySearchSelectHandle {
  focus: () => void;
  clear: () => void;
}

interface AssemblySearchSelectProps {
  assemblies: AssemblyView[];
  selectedAssemblyId: string;
  isPending: boolean;
  placeholder?: string;
  onSelect: (assemblyId: string) => void;
}

function getAssemblyLabel(assembly: AssemblyView): string {
  return `${assembly.name} · ${assembly.items.length} materials · ${assembly.defaultLaborHours} labour hrs`;
}

export const AssemblySearchSelect = forwardRef<AssemblySearchSelectHandle, AssemblySearchSelectProps>(
  function AssemblySearchSelect(
    {
      assemblies,
      selectedAssemblyId,
      isPending,
      placeholder = "Search assemblies by name...",
      onSelect,
    }: AssemblySearchSelectProps,
    ref,
  ) {
    const selectedAssembly =
      assemblies.find((assembly) => assembly.id === (selectedAssemblyId as AssemblyView["id"])) ?? null;
    const [query, setQuery] = useState("");
    const [isOpen, setIsOpen] = useState(false);
    const inputRef = useRef<HTMLInputElement | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        focus: () => inputRef.current?.focus(),
        clear: () => {
          setQuery("");
          setIsOpen(false);
        },
      }),
      [],
    );

    useEffect(() => {
      if (!selectedAssemblyId) {
        setQuery("");
      }
    }, [selectedAssemblyId]);

    const filteredAssemblies = useMemo(() => {
      const normalized = query.trim().toLowerCase();
      const baseItems = normalized
        ? assemblies.filter((assembly) => assembly.name.toLowerCase().includes(normalized))
        : assemblies;

      return baseItems.slice(0, 12);
    }, [assemblies, query]);

    return (
      <div style={{ position: "relative", display: "grid", gap: "6px" }}>
        <input
          ref={inputRef}
          style={{ fontSize: "16px", padding: "12px" }}
          value={isOpen ? query : selectedAssembly ? getAssemblyLabel(selectedAssembly) : query}
          placeholder={placeholder}
          disabled={isPending}
          onFocus={() => {
            setIsOpen(true);
            setQuery(selectedAssembly ? getAssemblyLabel(selectedAssembly) : "");
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
            {filteredAssemblies.length === 0 ? (
              <div style={{ padding: "10px 12px", color: "#5b6475" }}>No assemblies match that search.</div>
            ) : (
              filteredAssemblies.map((assembly) => (
                <button
                  key={assembly.id}
                  type="button"
                  disabled={isPending}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onSelect(assembly.id);
                    setQuery("");
                    setIsOpen(false);
                  }}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    border: 0,
                    borderBottom: "1px solid #eef2f7",
                    background: assembly.id === selectedAssemblyId ? "#eef4ff" : "#fff",
                    padding: "10px 12px",
                    display: "grid",
                    gap: "2px",
                  }}
                >
                  <strong style={{ color: "#172033" }}>{assembly.name}</strong>
                  <span style={{ color: "#5b6475", fontSize: "13px" }}>
                    {assembly.items.length} materials · {assembly.defaultLaborHours} labour hrs
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
