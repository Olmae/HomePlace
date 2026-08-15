"use client";

import { useFormStatus } from "react-dom";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

/** Form controls, defined once so every dialog in the panel looks the same. */

const fieldClass =
  "w-full rounded-control border border-line bg-raised px-3 py-2 text-sm text-text placeholder:text-faint " +
  "transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:opacity-50";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-faint">{hint}</span>}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${fieldClass} ${props.className ?? ""}`} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${fieldClass} ${props.className ?? ""}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${fieldClass} ${props.className ?? ""}`} />;
}

type ButtonProps = {
  children: ReactNode;
  variant?: "primary" | "ghost" | "danger" | "quiet";
  size?: "sm" | "md";
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  className?: string;
};

const variants = {
  primary: "bg-accent text-accent-fg hover:opacity-90",
  ghost: "border border-line bg-surface text-text hover:bg-raised",
  quiet: "text-muted hover:bg-raised hover:text-text",
  danger: "border border-danger/40 text-danger hover:bg-danger/10",
} as const;

export function Button({
  children,
  variant = "ghost",
  size = "md",
  type = "button",
  onClick,
  disabled,
  title,
  className = "",
}: ButtonProps) {
  const sizes = { sm: "px-2.5 py-1 text-xs", md: "px-3.5 py-2 text-sm" };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center justify-center gap-1.5 rounded-control font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </button>
  );
}

/**
 * Submit button that disables itself while the action is in flight. Without it,
 * an impatient double-click creates two tiles.
 */
export function SubmitButton({ children, variant = "primary" }: { children: ReactNode; variant?: ButtonProps["variant"] }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {children}
    </Button>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
      {message}
    </p>
  );
}
