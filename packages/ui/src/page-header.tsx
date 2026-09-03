import { type ReactNode } from "react";
import { cn } from "./cn";

// Encabezado de página consistente en toda la app: título (rampa text-title),
// subtítulo opcional y una zona de acciones a la derecha. Da el mismo "andamiaje"
// a cada pantalla (sello de un SaaS pulido).
export function PageHeader({
  title,
  subtitle,
  actions,
  icon,
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-title text-gray-900">
          {icon}
          {title}
        </h1>
        {subtitle ? <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
