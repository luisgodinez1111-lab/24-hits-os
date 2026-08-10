import { AsyncLocalStorage } from "node:async_hooks";

// Contexto de la request activa (viaja por todo el ciclo vía AsyncLocalStorage).
// Se inicializa con el correlationId en el middleware y se enriquece con la
// identidad autenticada en el guard. Servicios y auditoría lo leen sin pasarlo a mano.

export interface AuthContext {
  userId: string;
  sessionId: string;
  organizationId?: string;
  membershipId?: string;
}

export interface RequestStore {
  correlationId: string;
  ip?: string;
  userAgent?: string;
  auth?: AuthContext;
}

const als = new AsyncLocalStorage<RequestStore>();

export const RequestContext = {
  run<T>(store: RequestStore, fn: () => T): T {
    return als.run(store, fn);
  },
  get(): RequestStore | undefined {
    return als.getStore();
  },
  correlationId(): string | undefined {
    return als.getStore()?.correlationId;
  },
  auth(): AuthContext | undefined {
    return als.getStore()?.auth;
  },
  setAuth(auth: AuthContext): void {
    const store = als.getStore();
    if (store) store.auth = auth;
  },
};
