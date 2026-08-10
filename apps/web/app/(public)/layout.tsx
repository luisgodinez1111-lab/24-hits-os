import type { ReactNode } from "react";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-base font-bold text-white">
            24
          </span>
          <h1 className="mt-2 text-xl font-bold text-gray-900">HITS OS</h1>
        </div>
        {children}
      </div>
    </div>
  );
}
