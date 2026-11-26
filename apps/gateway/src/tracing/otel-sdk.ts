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

import { resolveTraceEndpoint } from './otel-config';

const endpoint = resolveTraceEndpoint(process.env);
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
if (exporter) {
  console.log('[Tracing] Initializing OpenTelemetry SDK...');
  otelSDK.start();

  // Only register shutdown for a started SDK.
  process.on('SIGTERM', () => {
  otelSDK
    .shutdown()
    .then(() => console.log('[Tracing] SDK shut down successfully'))
    .catch((err) => console.log('[Tracing] Error shutting down SDK', err))
    .finally(() => process.exit(0));
  });
}
