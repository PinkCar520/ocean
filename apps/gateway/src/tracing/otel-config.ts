/** Resolve an explicitly configured HTTP trace endpoint; never use an implicit backend. */
export function resolveTraceEndpoint(env: NodeJS.ProcessEnv): string | undefined {
  if (env.ENABLE_TRACING === 'false' || env.OTEL_SDK_DISABLED === 'true') return undefined;
  if (env.NODE_ENV !== 'production' && env.ENABLE_TRACING !== 'true') return undefined;
  return env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?.trim() ||
    env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim() || undefined;
}
