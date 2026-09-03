"use client";

import {
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "./cn";
import { Tooltip } from "./tooltip";

// ---------------------------------------------------------------- Button
type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white hover:bg-brand-dark",
  secondary: "bg-gray-100 text-gray-900 hover:bg-gray-200",
  outline: "border border-gray-300 bg-white text-gray-900 hover:bg-gray-50",
  ghost: "text-gray-700 hover:bg-gray-100",
  danger: "bg-red-600 text-white hover:bg-red-700",
};
const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", loading, disabled, className, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        // focus-visible: el anillo de foco solo aparece con teclado (no al hacer clic
        // con mouse) → accesible para navegación por teclado y pulido con puntero.
        // active:scale = "press state" (feel iOS); se anula si está deshabilitado o
        // si el usuario pide reducir movimiento.
        "inline-flex items-center justify-center gap-2 rounded-lg font-semibold outline-none transition duration-fast ease-standard focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 motion-reduce:transition-none motion-reduce:active:scale-100",
        buttonVariants[variant],
        buttonSizes[size],
        className
      )}
      {...props}
    >
      {loading ? "…" : children}
    </button>
  )
);
Button.displayName = "Button";

// ---------------------------------------------------------------- IconButton
// Botón de solo ícono con área táctil adecuada y nombre accesible OBLIGATORIO.
type IconButtonSize = "sm" | "md";
type IconButtonTone = "default" | "danger";
const iconButtonSizes: Record<IconButtonSize, string> = { sm: "h-8 w-8", md: "h-10 w-10" };
const iconButtonTones: Record<IconButtonTone, string> = {
  default: "text-gray-500 hover:bg-gray-100 hover:text-gray-700",
  danger: "text-gray-400 hover:bg-red-50 hover:text-red-600",
};

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string; // nombre accesible (aria-label + title)
  size?: IconButtonSize;
  tone?: IconButtonTone;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, size = "md", tone = "default", type = "button", className, children, ...props }, ref) => (
    // El Tooltip (label) aparece en hover y en foco de teclado; aria-label da el
    // nombre accesible. shrink-0 en el wrapper para que no se encoja en filas flex.
    <Tooltip label={label} className="shrink-0">
      <button
        ref={ref}
        type={type}
        aria-label={label}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-lg outline-none transition duration-fast ease-standard focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100",
          iconButtonSizes[size],
          iconButtonTones[tone],
          className
        )}
        {...props}
      >
        {children}
      </button>
    </Tooltip>
  )
);
IconButton.displayName = "IconButton";

// ---------------------------------------------------------------- Input
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none transition-colors focus:border-brand focus:ring-1 focus:ring-brand disabled:bg-gray-50",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

// ---------------------------------------------------------------- Textarea
export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand",
      className
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

// ---------------------------------------------------------------- Select
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand",
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
);
Select.displayName = "Select";

// ---------------------------------------------------------------- Checkbox
export const Checkbox = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        "h-4 w-4 rounded border-gray-300 text-brand outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1",
        className
      )}
      {...props}
    />
  )
);
Checkbox.displayName = "Checkbox";

// ---------------------------------------------------------------- Label
export function Label({
  children,
  htmlFor,
  className,
}: {
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <label htmlFor={htmlFor} className={cn("text-xs font-medium text-gray-600", className)}>
      {children}
    </label>
  );
}

// ---------------------------------------------------------------- FormField
export function FormField({
  label,
  htmlFor,
  error,
  hint,
  children,
  className,
}: {
  label?: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label ? <Label htmlFor={htmlFor}>{label}</Label> : null}
      {children}
      {error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p className="text-xs text-gray-400">{hint}</p>
      ) : null}
    </div>
  );
}
