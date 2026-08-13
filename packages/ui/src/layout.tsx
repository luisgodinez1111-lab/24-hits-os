import type { ReactNode, HTMLAttributes } from "react";
import { cn } from "./cn";

// ---------------------------------------------------------------- Card
export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-xl border border-gray-200 bg-white shadow-sm", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between border-b border-gray-100 p-5">
      <div>
        <h3 className="font-semibold text-gray-900">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("p-5", className)}>{children}</div>;
}

// ---------------------------------------------------------------- Table
// El contenedor scrollea en horizontal (móvil): en pantallas chicas la tabla se
// desliza dentro de su caja en vez de empujar la página. `-webkit-overflow-scrolling`
// da scroll con inercia en iOS.
export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white [-webkit-overflow-scrolling:touch]">
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  );
}
export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500">
      {children}
    </thead>
  );
}
export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-gray-100">{children}</tbody>;
}
export function TR({ children, className }: { children: ReactNode; className?: string }) {
  return <tr className={cn("hover:bg-gray-50", className)}>{children}</tr>;
}
export function TH({ children, className }: { children: ReactNode; className?: string }) {
  return <th className={cn("whitespace-nowrap px-4 py-3 font-medium", className)}>{children}</th>;
}
export function TD({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn("whitespace-nowrap px-4 py-3 align-middle", className)}>{children}</td>;
}
