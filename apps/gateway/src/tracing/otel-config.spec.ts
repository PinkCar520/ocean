import { resolveTraceEndpoint } from './otel-config';

describe('optional OTLP tracing', () => {
  const endpoint = 'http://collector:4318/v1/traces';
  it('does not export without a configured backend in production', () => {
    expect(resolveTraceEndpoint({ NODE_ENV: 'production' })).toBeUndefined();
    expect(resolveTraceEndpoint({ NODE_ENV: 'production', OTEL_EXPORTER_OTLP_ENDPOINT: ' ' })).toBeUndefined();
  });
  it('uses an explicit endpoint in production', () => {
    expect(resolveTraceEndpoint({ NODE_ENV: 'production', OTEL_EXPORTER_OTLP_ENDPOINT: endpoint })).toBe(endpoint);
  });
  it('prefers the trace-specific endpoint', () => {
    expect(resolveTraceEndpoint({ NODE_ENV: 'production', OTEL_EXPORTER_OTLP_ENDPOINT: 'http://other', OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: endpoint })).toBe(endpoint);
  });
  it('honors explicit disable switches', () => {
    expect(resolveTraceEndpoint({ NODE_ENV: 'production', ENABLE_TRACING: 'false', OTEL_EXPORTER_OTLP_ENDPOINT: endpoint })).toBeUndefined();
    expect(resolveTraceEndpoint({ NODE_ENV: 'production', OTEL_SDK_DISABLED: 'true', OTEL_EXPORTER_OTLP_ENDPOINT: endpoint })).toBeUndefined();
  });
  it('requires explicit opt-in outside production', () => {
    expect(resolveTraceEndpoint({ OTEL_EXPORTER_OTLP_ENDPOINT: endpoint })).toBeUndefined();
    expect(resolveTraceEndpoint({ ENABLE_TRACING: 'true', OTEL_EXPORTER_OTLP_ENDPOINT: endpoint })).toBe(endpoint);
  });
});
