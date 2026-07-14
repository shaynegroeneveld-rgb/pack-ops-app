import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

import styles from "./Modal.module.css";

export type ModalPlacement = "center" | "bottom";
export type ModalTheme = "office" | "field";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  // Explicitly `| undefined` (not just optional) so callers deriving the title
  // from possibly-null data (e.g. `invoice?.number`) can pass it straight
  // through under exactOptionalPropertyTypes without a defensive fallback.
  title?: string | undefined;
  children?: ReactNode;
  footer?: ReactNode;
  placement?: ModalPlacement;
  /**
   * Modal portals to document.body, which escapes the data-theme scoping on a
   * page's own root element. Pass "field" when opening a modal from inside
   * Field Mode so it doesn't silently fall back to the office palette.
   */
  theme?: ModalTheme;
}

export function Modal({ open, onClose, title, children, footer, placement = "center", theme }: ModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const generatedTitleId = useId();
  const titleId = title ? generatedTitleId : undefined;

  useEffect(() => {
    if (!open) {
      return;
    }

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocusedRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      className={styles.backdrop}
      role="presentation"
      onClick={onClose}
      data-theme={theme === "field" ? "field" : undefined}
    >
      <div
        ref={panelRef}
        className={[styles.panel, placement === "bottom" ? styles.panelBottom : styles.panelCenter].join(" ")}
        role="dialog"
        aria-modal="true"
        aria-label={title ? undefined : "Dialog"}
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        {title ? (
          <div className={styles.header}>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
        ) : null}
        <div className={styles.body}>{children}</div>
        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
