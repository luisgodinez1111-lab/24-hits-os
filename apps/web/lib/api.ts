// Cliente HTTP único del frontend. Habla con la API (NestJS) por MISMO ORIGEN:
// las rutas /api/v1/* las reenvía Next (rewrite en next.config) al despliegue de la
// API. Así la cookie de sesión es de primera parte y funciona en móvil.

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Refresco silencioso del access token. El access dura poco (15 min) pero el
// refresh 30 días: cuando una petición da 401 por access expirado, renovamos con
// el refresh_token (cookie httpOnly) y reintentamos. Así la sesión se mantiene
// hasta ~30 días deslizantes (muy por encima de las 24 h) sin sacar al usuario,
// y el access sigue siendo corto (seguro y revocable). Single-flight: varios 401
// simultáneos comparten un solo refresh.
let refreshInFlight: Promise<boolean> | null = null;
function refreshOnce(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const r = await fetch("/api/v1/auth/refresh", { method: "POST", credentials: "include", cache: "no-store" });
        return r.ok;
      } catch {
        return false;
      }
    })();
    // Libera el candado al terminar para permitir un refresh futuro.
    void refreshInFlight.finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

async function request<T>(path: string, init?: RequestInit, retried = false): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    credentials: "include",
    cache: "no-store",
  });

  // 401 por access expirado → renueva y reintenta una vez. Excluye las rutas de
  // auth (un 401 en login/refresh es real, no debe disparar otro refresh).
  if (res.status === 401 && !retried && !path.startsWith("/auth/")) {
    const ok = await refreshOnce();
    if (ok) return request<T>(path, init, true);
  }

  const text = await res.text();
  const body: unknown = text ? JSON.parse(text) : {};

  if (!res.ok) {
    const errBody = body as { error?: { code?: string; message?: string; details?: unknown } };
    throw new ApiError(
      res.status,
      errBody.error?.code ?? "ERROR",
      errBody.error?.message ?? "Ocurrió un error",
      errBody.error?.details
    );
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "POST", body: data ? JSON.stringify(data) : undefined }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "PATCH", body: data ? JSON.stringify(data) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
