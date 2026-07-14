import type { HTMLAttributes, ReactNode } from "react";

import styles from "./Card.module.css";

export type CardVariant = "surface" | "soft" | "elevated";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  children?: ReactNode;
}

export function Card({ variant = "surface", className, children, ...rest }: CardProps) {
  const classNames = [styles.card, styles[`variant-${variant}`], className ?? ""].filter(Boolean).join(" ");
  return (
    <div className={classNames} {...rest}>
      {children}
    </div>
  );
}
