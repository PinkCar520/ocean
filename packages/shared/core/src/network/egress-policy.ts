/**
 * EgressPolicy —— 工具网络出口白名单（Phase 4 第 7 项，借鉴 C3：Claude gVisor egress allowlist）。
 *
 * 语义：默认拒绝（未白名单域一律拒绝）。允许规则两种：
 * - 精确 host：`gitlab.example.com`
 * - 后缀规则（含自身与所有子域）：`.example.com` 匹配 example.com 与 *.example.com
 *
 * 配置来源：环境变量 `SANDBOX_EGRESS_ALLOWLIST`（逗号分隔），由 ToolModule 注入
 * ToolRegistry → 内置 `web.get` 工具在执行 HTTP 请求前强制检查。
 */

export interface EgressVerdict {
  allowed: boolean;
  host: string;
  reason?: 'ok' | 'not_http' | 'not_allowlisted' | 'invalid_url';
}

export class EgressPolicy {
  private readonly exact = new Set<string>();
  private readonly suffixes: string[] = [];

  constructor(rules: string[]) {
    for (const rule of rules) {
      const normalized = rule
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/\/.*$/, '')
        .replace(/:\d+$/, '');
      if (!normalized) continue;
      if (normalized.startsWith('.')) this.suffixes.push(normalized);
      else this.exact.add(normalized);
    }
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env): EgressPolicy {
    const raw = env.SANDBOX_EGRESS_ALLOWLIST ?? '';
    return new EgressPolicy(
      raw
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    );
  }

  checkUrl(raw: string | null | undefined): EgressVerdict {
    if (!raw) return { allowed: false, host: '', reason: 'invalid_url' };
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      return { allowed: false, host: '', reason: 'invalid_url' };
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { allowed: false, host: parsed.hostname, reason: 'not_http' };
    }
    const host = parsed.hostname.toLowerCase();
    if (this.exact.has(host)) return { allowed: true, host, reason: 'ok' };
    for (const suffix of this.suffixes) {
      // `.example.com` → 自身 example.com 或任意子域 *.example.com
      const base = suffix.slice(1);
      if (host === base || host.endsWith(suffix)) {
        return { allowed: true, host, reason: 'ok' };
      }
    }
    return { allowed: false, host, reason: 'not_allowlisted' };
  }
}
