import { MetricsService } from './metrics.service';

describe('MetricsService (Phase 7 runtime counters)', () => {
  let svc: MetricsService;
  beforeEach(() => {
    svc = new MetricsService();
  });

  it('counts plain increments', () => {
    svc.inc('run.created');
    svc.inc('run.created');
    const snap = svc.snapshot();
    expect(snap.find((p) => p.key === 'run.created')?.value).toBe(2);
  });

  it('counts labeled increments separately', () => {
    svc.inc('tool.executed', { tool: 'web.get' });
    svc.inc('tool.executed', { tool: 'web.get' });
    svc.inc('tool.executed', { tool: 'fs.read' });
    const snap = svc.snapshot();
    const web = snap.find(
      (p) => p.key === 'tool.executed' && p.labels.tool === 'web.get',
    );
    const fs = snap.find(
      (p) => p.key === 'tool.executed' && p.labels.tool === 'fs.read',
    );
    expect(web?.value).toBe(2);
    expect(fs?.value).toBe(1);
  });

  it('renders Prometheus text with labels', () => {
    svc.inc('http.requests', { method: 'GET', status: '200' });
    const text = svc.prometheusText();
    expect(text).toContain('ocean_http_requests');
    expect(text).toContain('method="GET"');
    expect(text).toContain('status="200"');
    expect(text).toContain('1');
  });

  it('escapes quotes in label values', () => {
    svc.inc('x', { a: 'va"l' });
    expect(svc.prometheusText()).toContain('a="va\\"l"');
  });
});
