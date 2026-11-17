import { createHash } from 'node:crypto';

/** Provider aliases are confined to model I/O; runtime names remain unchanged. */
export function createToolAliases(names: string[]) {
  const forward = new Map<string, string>();
  const reverse = new Map<string, string>();
  const reserved = new Set(names.filter(name => /^[a-zA-Z0-9_-]{1,64}$/.test(name)));
  for (const name of new Set(names)) {
    let alias = name;
    if (!reserved.has(name)) {
      const base = `tool_${createHash('sha256').update(name).digest('hex').slice(0, 48)}`;
      alias = base;
      let suffix = 0;
      while (reserved.has(alias) || reverse.has(alias)) alias = `${base}_${++suffix}`;
    }
    forward.set(name, alias);
    reverse.set(alias, name);
  }
  return { forward, reverse };
}

