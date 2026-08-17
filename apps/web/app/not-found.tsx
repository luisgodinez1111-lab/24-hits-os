import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 px-6 text-center">
      <p className="text-7xl font-black tracking-tight text-brand">404</p>
      <h1 className="text-xl font-bold text-gray-900">Página no encontrada</h1>
      <p className="max-w-sm text-sm text-gray-500">La ruta que buscas no existe o fue movida.</p>
      <Link
        href="/app"
        className="mt-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark"
      >
        Volver al inicio
      </Link>
    </div>
  );
}
