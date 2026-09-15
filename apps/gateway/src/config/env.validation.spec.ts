import { validateProductionConfig } from './env.validation';

describe('env.validation (Phase 7 production config fail-fast)', () => {
  const base = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://app:realpass@pg.internal:5432/ocean?schema=public',
    JWT_SECRET: 'x'.repeat(40),
    DASHSCOPE_API_KEY: 'sk-real',
  };

  it('accepts a fully valid production config', () => {
    expect(validateProductionConfig({ ...base })).toEqual([]);
  });

  it('rejects missing DATABASE_URL', () => {
    const v = validateProductionConfig({ ...base, DATABASE_URL: '' });
    expect(v.some((x) => x.key === 'DATABASE_URL' && x.reason === 'missing')).toBe(true);
  });

  it('rejects default-credential DSN to a non-local host', () => {
    const v = validateProductionConfig({
      ...base,
      DATABASE_URL: 'postgresql://postgres:postgres@pg.internal:5432/ocean?schema=public',
    });
    expect(v.some((x) => x.key === 'DATABASE_URL' && x.reason.includes('default-credential'))).toBe(true);
  });

  it('allows default-credential DSN for localhost', () => {
    const v = validateProductionConfig({
      ...base,
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/ocean?schema=public',
    });
    expect(v.some((x) => x.key === 'DATABASE_URL')).toBe(false);
  });

  it('rejects known weak JWT secret', () => {
    const v = validateProductionConfig({ ...base, JWT_SECRET: 'ocean-secret-key-2024' });
    expect(v.some((x) => x.key === 'JWT_SECRET' && x.reason.includes('known default/weak'))).toBe(true);
  });

  it('rejects short JWT secret', () => {
    const v = validateProductionConfig({ ...base, JWT_SECRET: 'short-key' });
    expect(v.some((x) => x.key === 'JWT_SECRET' && x.reason.includes('too short'))).toBe(true);
  });

  it('rejects missing AI provider key for the default provider', () => {
    const v = validateProductionConfig({ ...base, DASHSCOPE_API_KEY: '' });
    expect(v.some((x) => x.key === 'DASHSCOPE_API_KEY' && x.reason.includes('required by DEFAULT_AI_PROVIDER'))).toBe(true);
  });

  it('does not require a key when provider is local', () => {
    const v = validateProductionConfig({
      ...base,
      DASHSCOPE_API_KEY: '',
      DEFAULT_AI_PROVIDER: 'local',
    });
    expect(v.some((x) => x.key === 'DASHSCOPE_API_KEY')).toBe(false);
  });
});
