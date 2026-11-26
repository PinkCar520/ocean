import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import {
  resourceFromAttributes,
  defaultResource,
} from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';

const endpoint = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?.trim() ||
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
const exporter = endpoint ? new OTLPTraceExporter({ url: endpoint }) : undefined;

export const otelSDK = new NodeSDK({
  resource: defaultResource().merge(
    resourceFromAttributes({
      [SEMRESATTRS_SERVICE_NAME]: 'ocean-gateway',
    }),
  ),
  ...(exporter ? { traceExporter: exporter } : {}),
  instrumentations: [
    new HttpInstrumentation(),
    new ExpressInstrumentation(),
    new NestInstrumentation(),
  ],
});

// Start the SDK
if (exporter && process.env.ENABLE_TRACING !== 'false' && (
  process.env.NODE_ENV === 'production' ||
  process.env.ENABLE_TRACING === 'true'
)) {
  console.log('[Tracing] Initializing OpenTelemetry SDK...');
  otelSDK.start();
}

// Gracefully shut down the SDK on process exit
process.on('SIGTERM', () => {
  otelSDK
    .shutdown()
    .then(() => console.log('[Tracing] SDK shut down successfully'))
    .catch((err) => console.log('[Tracing] Error shutting down SDK', err))
    .finally(() => process.exit(0));
});
