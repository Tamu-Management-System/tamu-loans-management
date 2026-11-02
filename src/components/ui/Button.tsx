import type { ButtonHTMLAttributes } from "react";
import styles from "./Button.module.css";

type ButtonVariant = "primary" | "secondary" | "icon";
type ButtonSize = "medium" | "small";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/** Buttons from the approved design. Icon buttons need an aria-label. */
export function Button({ variant = "primary", size = "medium", className = "", type = "button", ...props }: ButtonProps) {
  return <button type={type} className={`${styles.button} ${styles[variant]} ${styles[size]} ${className}`} {...props} />;
}
