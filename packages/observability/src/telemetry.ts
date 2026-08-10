import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

let sdk: NodeSDK | undefined;

// Arranca OpenTelemetry solo si hay un colector configurado. Si no hay endpoint,
// la observabilidad de trazas queda deshabilitada (los logs estructurados siguen).
// El nombre de servicio se propaga vía OTEL_SERVICE_NAME (lo lee el SDK).
export function initTelemetry(opts: { serviceName: string; endpoint?: string }): void {
  if (!opts.endpoint) return;
  if (sdk) return;

  process.env.OTEL_SERVICE_NAME ??= opts.serviceName;

  sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter({
      url: `${opts.endpoint.replace(/\/$/, "")}/v1/traces`,
    }),
  });
  sdk.start();
}

export async function shutdownTelemetry(): Promise<void> {
  if (!sdk) return;
  await sdk.shutdown();
  sdk = undefined;
}
