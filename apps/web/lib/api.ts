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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    credentials: "include",
    cache: "no-store",
  });

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
