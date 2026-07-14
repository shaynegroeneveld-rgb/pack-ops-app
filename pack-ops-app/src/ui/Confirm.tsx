import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { Button } from "./Button";
import { Input } from "./Input";
import { Modal } from "./Modal";
import type { ModalTheme } from "./Modal";

export type ConfirmTone = "default" | "danger";

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Use "danger" for destructive actions (archive, delete, remove, discard). */
  tone?: ConfirmTone;
  theme?: ModalTheme;
}

export interface PromptOptions {
  title: string;
  description?: ReactNode;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  theme?: ModalTheme;
}

interface ConfirmContextValue {
  /** Promise-based replacement for window.confirm — resolves true/false. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** Promise-based replacement for window.prompt — resolves the entered text, or null if cancelled. */
  promptText: (options: PromptOptions) => Promise<string | null>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

type PendingRequest =
  | { kind: "confirm"; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { kind: "prompt"; options: PromptOptions; resolve: (value: string | null) => void };

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<PendingRequest | null>(null);
  const [promptValue, setPromptValue] = useState("");
  const promptInputRef = useRef<HTMLInputElement | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setRequest({ kind: "confirm", options, resolve });
    });
  }, []);

  const promptText = useCallback((options: PromptOptions) => {
    setPromptValue(options.defaultValue ?? "");
    return new Promise<string | null>((resolve) => {
      setRequest({ kind: "prompt", options, resolve });
    });
  }, []);

  useEffect(() => {
    if (request?.kind === "prompt") {
      // Modal focuses its own panel on open; a text-entry dialog is more
      // useful with focus already in the field, so steal it right after.
      const frame = window.requestAnimationFrame(() => promptInputRef.current?.focus());
      return () => window.cancelAnimationFrame(frame);
    }
    return undefined;
  }, [request]);

  function handleCancel() {
    if (!request) {
      return;
    }
    if (request.kind === "confirm") {
      request.resolve(false);
    } else {
      request.resolve(null);
    }
    setRequest(null);
  }

  function handleConfirm() {
    if (!request) {
      return;
    }
    if (request.kind === "confirm") {
      request.resolve(true);
    } else {
      request.resolve(promptValue);
    }
    setRequest(null);
  }

  const value = useMemo(() => ({ confirm, promptText }), [confirm, promptText]);
  const isPromptEmpty = request?.kind === "prompt" && promptValue.trim().length === 0;

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Modal
        open={Boolean(request)}
        onClose={handleCancel}
        title={request?.options.title}
        theme={request?.options.theme}
        footer={
          request ? (
            <>
              <Button variant="ghost" onClick={handleCancel}>
                {request.options.cancelLabel ?? "Cancel"}
              </Button>
              <Button
                variant={request.kind === "confirm" && request.options.tone === "danger" ? "danger" : "primary"}
                onClick={handleConfirm}
                disabled={isPromptEmpty}
              >
                {request.options.confirmLabel ?? (request.kind === "prompt" ? "Save" : "Confirm")}
              </Button>
            </>
          ) : null
        }
      >
        {request ? (
          <>
            {request.options.description ? (
              <p style={{ margin: 0, color: "var(--color-text-soft)" }}>{request.options.description}</p>
            ) : null}
            {request.kind === "prompt" ? (
              <Input
                ref={promptInputRef}
                label={request.options.label}
                placeholder={request.options.placeholder}
                value={promptValue}
                onChange={(event) => setPromptValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && promptValue.trim()) {
                    event.preventDefault();
                    handleConfirm();
                  }
                }}
              />
            ) : null}
          </>
        ) : null}
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmContextValue {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error("useConfirm must be used within a ConfirmProvider");
  }
  return context;
}
