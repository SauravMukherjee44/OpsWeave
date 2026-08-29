"use client";

import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant =
  | "primary"
  | "solid"
  | "secondary"
  | "ghost"
  | "danger"
  | "success";

export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand-gradient shadow-brand text-white hover:brightness-110",
  solid: "bg-primary-500 text-white hover:bg-primary-600 shadow-primary",
  secondary:
    "border border-line bg-surface-2 text-content hover:bg-surface-3 hover:border-line-strong",
  ghost: "text-muted hover:bg-surface-2 hover:text-content",
  danger:
    "border border-danger-border bg-danger-bg text-danger-fg hover:brightness-110",
  success: "bg-success text-white hover:brightness-110",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 px-3 text-2xs rounded-md",
  md: "h-10 gap-2 px-4 text-xs rounded-lg",
  lg: "h-11 gap-2 px-5 text-sm rounded-xl",
};

const ICON_SIZE: Record<ButtonSize, number> = { sm: 14, md: 16, lg: 17 };

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  trailing?: ReactNode;
  block?: boolean;
};

export function Button({
  variant = "secondary",
  size = "md",
  loading,
  icon,
  trailing,
  block,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center font-semibold whitespace-nowrap",
        "transition-[background,color,border-color,filter,transform] duration-150",
        "active:translate-y-px disabled:pointer-events-none disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        block && "w-full",
        className,
      )}
    >
      {loading ? (
        <LoaderCircle size={ICON_SIZE[size]} className="spin shrink-0" />
      ) : (
        icon
      )}
      {children}
      {trailing ? <span className="ml-auto flex items-center">{trailing}</span> : null}
    </button>
  );
}

export function IconButton({
  label,
  size = 38,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: number }) {
  return (
    <button
      {...props}
      aria-label={label}
      title={label}
      style={{ width: size, height: size }}
      className={cn(
        "relative grid shrink-0 place-items-center rounded-lg border border-transparent",
        "text-muted transition-colors duration-150",
        "hover:border-line hover:bg-surface hover:text-content",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
    >
      {children}
    </button>
  );
}
