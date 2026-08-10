// Logger estructurado (JSON) sin dependencias. Emite una línea JSON por evento,
// apto para ingestión por cualquier colector. Reemplazable por pino sin tocar los
// call sites. NUNCA registrar secretos ni contraseñas (responsabilidad del caller).

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface LoggerOptions {
  service: string;
  minLevel?: LogLevel;
  // Contexto base incluido en cada línea (p.ej. { env }).
  base?: Record<string, unknown>;
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  // Crea un logger hijo con contexto adicional (p.ej. { correlationId }).
  child(context: Record<string, unknown>): Logger;
}

function createWithContext(
  options: Required<Pick<LoggerOptions, "service" | "minLevel">>,
  context: Record<string, unknown>
): Logger {
  const threshold = LEVEL_WEIGHT[options.minLevel];

  function emit(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (LEVEL_WEIGHT[level] < threshold) return;
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      service: options.service,
      message,
      ...context,
      ...(meta ?? {}),
    });
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  }

  return {
    debug: (m, meta) => emit("debug", m, meta),
    info: (m, meta) => emit("info", m, meta),
    warn: (m, meta) => emit("warn", m, meta),
    error: (m, meta) => emit("error", m, meta),
    child: (extra) => createWithContext(options, { ...context, ...extra }),
  };
}

export function createLogger(options: LoggerOptions): Logger {
  return createWithContext(
    { service: options.service, minLevel: options.minLevel ?? "info" },
    options.base ?? {}
  );
}
