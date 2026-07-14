import type { ButtonHTMLAttributes, ReactNode } from "react";

import styles from "./Chip.module.css";

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  badgeCount?: number;
  children?: ReactNode;
}

export function Chip({ active = false, badgeCount, className, children, type = "button", ...rest }: ChipProps) {
  const classNames = [styles.chip, active ? styles.active : "", className ?? ""].filter(Boolean).join(" ");
  return (
    <button type={type} className={classNames} aria-pressed={active} {...rest}>
      {children}
      {typeof badgeCount === "number" && badgeCount > 0 ? <span className={styles.badge}>{badgeCount}</span> : null}
    </button>
  );
}
