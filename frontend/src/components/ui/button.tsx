import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  href?: string;
  variant?: "primary" | "secondary" | "outline" | "ghost" | "light";
  children: ReactNode;
};

const variantClass: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "button-primary",
  secondary: "button-secondary",
  outline: "button-outline",
  ghost: "button-ghost",
  light: "button-light",
};

export function Button({
  href,
  variant = "primary",
  className = "",
  children,
  ...props
}: ButtonProps) {
  const classes = `button ${variantClass[variant]} ${className}`.trim();
  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }
  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
