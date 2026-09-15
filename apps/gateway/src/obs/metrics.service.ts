/**
 * metrics.service.ts —— Phase 7：Run/模型/工具/队列/审批指标。
 * 双写：OTel Meter（push 到 collector）+ 进程内快照（GET /api/metrics Prometheus 文本）。
 */
import { Injectable } from '@nestjs/common';
import { metrics } from '@opentelemetry/api';

const METER_NAME = 'ocean-gateway';

export interface MetricPoint {
  key: string;
  value: number;
  labels: Record<string, string>;
}

@Injectable()
export class MetricsService {
  private readonly meter = metrics.getMeter(METER_NAME);
  /** key -> value；带 label 的 key 用 `key|k=v,k2=v2` 编码。 */
  private readonly counters = new Map<string, number>();

  // OTel 基础计数器（无维度，维度保留在 /api/metrics 快照）
  private readonly otelCounters: Record<
    string,
    ReturnType<typeof this.meter.createCounter>
  > = {};

  constructor() {
    for (const name of [
      'run.created',
      'run.terminal',
      'tool.executed',
      'approval.requested',
      'approval.resolved',
      'outbox.enqueued',
      'http.requests',
    ]) {
      this.otelCounters[name] = this.meter.createCounter(`ocean.${name}`, {
        description: `ocean ${name}`,
      });
    }
  }

  inc(key: string, labels: Record<string, string> = {}, delta = 1): void {
    const labelKey = Object.keys(labels).length
      ? `${key}|${Object.entries(labels)
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .map(([k, v]) => `${k}=${v}`)
          .join(',')}`
      : key;
    this.counters.set(labelKey, (this.counters.get(labelKey) ?? 0) + delta);
    // OTel 侧取基础计数（去掉 label 维度）
    const base = this.otelCounters[key.split('.')[0] + '.' + key.split('.')[1]];
    if (base) base.add(delta);
  }

  snapshot(): MetricPoint[] {
    return [...this.counters.entries()].map(([labelKey, value]) => {
      const [key, labelsRaw] = labelKey.split('|');
      const labels: Record<string, string> = {};
      if (labelsRaw) {
        for (const pair of labelsRaw.split(',')) {
          const [k, v] = pair.split('=');
          labels[k] = v;
        }
      }
      return { key, value, labels };
    });
  }

  /** Prometheus 文本格式（供 GET /api/metrics）。 */
  prometheusText(): string {
    const lines: string[] = [
      '# HELP ocean_metrics gateway runtime counters',
      '# TYPE ocean_metrics counter',
    ];
    for (const point of this.snapshot()) {
      const labels = Object.entries(point.labels)
        .map(([k, v]) => `${k}="${v.replace(/"/g, '\\"')}"`)
        .join(',');
      lines.push(
        `ocean_${point.key.replace(/\./g, '_')}${labels ? `{${labels}}` : ''} ${point.value}`,
      );
    }
    return lines.join('\n') + '\n';
  }
}
