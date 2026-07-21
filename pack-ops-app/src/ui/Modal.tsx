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
  theme?: ModalTheme | undefined;
  /**
   * Set false for content-heavy forms where an accidental click just outside
   * the panel (e.g. while scrolling) shouldn't discard in-progress input.
   * Escape and the explicit close button still always work. Defaults to true
   * to preserve existing behavior for every other modal.
   */
  dismissOnBackdropClick?: boolean;
  /**
   * Overrides the CSS module's default panel width (560px centered / 760px
   * bottom sheet) for modals whose content — e.g. a multi-column line-item
   * table — needs more horizontal room than that to avoid its own internal
   * horizontal scrollbar.
   */
  maxWidth?: string;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  placement = "center",
  theme,
  dismissOnBackdropClick = true,
  maxWidth,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const generatedTitleId = useId();
  const titleId = title ? generatedTitleId : undefined;

  // Callers almost always pass an inline `onClose` (a new function identity
  // every render), so this must not sit in the effect below's dependency
  // array — otherwise every keystroke-triggered re-render while the modal is
  // open would re-run the effect and yank focus back to the panel container,
  // making it impossible to type into any field inside the modal.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) {
      return;
    }

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }

      // Keep keyboard focus inside the dialog while it's open — without this,
      // Tab past the last control (or Shift+Tab past the first) escapes into
      // whatever page content sits behind the modal.
      if (event.key === "Tab" && panelRef.current) {
        const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
        if (focusable.length === 0) {
          event.preventDefault();
          return;
        }

        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        const active = document.activeElement;

        if (event.shiftKey && active === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocusedRef.current?.focus?.();
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      className={styles.backdrop}
      role="presentation"
      onClick={dismissOnBackdropClick ? onClose : undefined}
      data-theme={theme === "field" ? "field" : undefined}
    >
      <div
        ref={panelRef}
        className={[styles.panel, placement === "bottom" ? styles.panelBottom : styles.panelCenter].join(" ")}
        style={maxWidth ? { width: `min(${maxWidth}, 100%)` } : undefined}
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
