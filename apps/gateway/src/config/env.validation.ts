/**
 * env.validation.ts —— Phase 7：生产配置 fail-fast。
 * NODE_ENV=production 时，缺失或使用默认/弱密钥必须拒绝启动，
 * 避免"默认密钥上线"类生产事故。
 */

export const WEAK_JWT_SECRETS = new Set([
  'ocean-secret-key-2024',
  'secret',
  'changeme',
  'password',
  'jwt-secret',
]);

const AI_PROVIDER_KEY_ENVS: Record<string, string> = {
  dashscope: 'DASHSCOPE_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  local: '', // local provider 不需要云端 key
};

export interface ConfigViolation {
  key: string;
  reason: string;
}

export function validateProductionConfig(env: NodeJS.ProcessEnv = process.env): ConfigViolation[] {
  const violations: ConfigViolation[] = [];

  // 1. 数据库
  const dbUrl = env.DATABASE_URL ?? '';
  if (!dbUrl) {
    violations.push({ key: 'DATABASE_URL', reason: 'missing' });
  } else if (dbUrl.includes('postgres:postgres@') && !dbUrl.includes('@localhost') && !dbUrl.includes('@127.0.0.1')) {
    // 生产连本地默认口令的远端库视为风险；本地开发例外
    violations.push({ key: 'DATABASE_URL', reason: 'looks like a default-credential DSN to a non-local host' });
  }

  // 2. JWT 密钥：必须显式设置且非弱值，长度 ≥ 32（HS256 推荐）
  const jwt = env.JWT_SECRET ?? '';
  if (!jwt) {
    violations.push({ key: 'JWT_SECRET', reason: 'missing' });
  } else if (WEAK_JWT_SECRETS.has(jwt)) {
    violations.push({ key: 'JWT_SECRET', reason: 'uses a known default/weak value' });
  } else if (jwt.length < 32) {
    violations.push({ key: 'JWT_SECRET', reason: `too short (${jwt.length} chars, need >= 32)` });
  }

  // 3. AI 模型供应商 key：按默认 provider 要求
  const provider = env.DEFAULT_AI_PROVIDER ?? 'dashscope';
  const keyEnv = AI_PROVIDER_KEY_ENVS[provider] ?? AI_PROVIDER_KEY_ENVS.dashscope;
  if (keyEnv && !(env[keyEnv] ?? '')) {
    violations.push({ key: keyEnv, reason: `missing (required by DEFAULT_AI_PROVIDER=${provider})` });
  }

  return violations;
}

/**
 * 启动入口调用：校验失败时打印并退出（fail-fast）。
 */
export function assertProductionConfig(env: NodeJS.ProcessEnv = process.env): void {
  if ((env.NODE_ENV ?? 'development') !== 'production') return;
  const violations = validateProductionConfig(env);
  if (violations.length === 0) return;
  console.error('[Config] Production configuration validation FAILED:');
  for (const v of violations) {
    console.error(`  - ${v.key}: ${v.reason}`);
  }
  console.error('[Config] Refusing to start. Fix the above before deploying.');
  process.exit(1);
}
