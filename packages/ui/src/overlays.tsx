"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "./cn";

// ---------------------------------------------------------------- Dialog
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div className="relative z-10 w-full max-w-md rounded-xl bg-white shadow-xl">
        {title ? (
          <div className="border-b border-gray-100 p-5">
            <h3 className="font-semibold text-gray-900">{title}</h3>
          </div>
        ) : null}
        <div className="p-5">{children}</div>
        {footer ? (
          <div className="flex justify-end gap-2 border-t border-gray-100 p-4">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Drawer
export function Drawer({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div className="absolute right-0 top-0 h-full w-full max-w-sm overflow-y-auto bg-white shadow-xl">
        {title ? (
          <div className="border-b border-gray-100 p-5">
            <h3 className="font-semibold text-gray-900">{title}</h3>
          </div>
        ) : null}
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Dropdown
export function Dropdown({
  trigger,
  children,
  align = "right",
}: {
  trigger: ReactNode;
  children: ReactNode;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)}>
        {trigger}
      </button>
      {open ? (
        <div
          className={cn(
            "absolute z-20 mt-2 min-w-44 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg",
            align === "right" ? "right-0" : "left-0"
          )}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function DropdownItem({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
    >
      {children}
    </button>
  );
}
