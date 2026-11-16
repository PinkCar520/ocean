/** Shared permission policy contract used by the Gateway and local CLI. */
export const IS_PUBLIC_KEY = 'isPublic';

export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'dontAsk' | 'bypassPermissions';
export type PermissionAction = 'allow' | 'deny' | 'ask';

export interface PermissionRule {
  action: PermissionAction;
  pattern: string;
  skill?: string;
  comment?: string;
}

export interface PermissionSettings {
  mode?: PermissionMode;
  rules?: PermissionRule[];
  allow?: string[];
  deny?: string[];
  ask?: string[];
  mcp?: {
    servers?: Record<string, { enabled?: boolean; permissions?: PermissionAction }>;
  };
  maxMcpOutputTokens?: number;
}

export interface NormalizedRule extends PermissionRule {
  regex: RegExp;
}

export function isPermissionSettings(value: unknown): value is PermissionSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const settings = value as Record<string, any>;
  const validActions = ['allow', 'deny', 'ask'];
  const validModes = ['default', 'acceptEdits', 'plan', 'dontAsk', 'bypassPermissions'];
  const validPatterns = (items: unknown) => items === undefined
    || (Array.isArray(items) && items.every((item) => typeof item === 'string' && item.length > 0 && item.length <= 512));
  const validMcp = settings.mcp === undefined || (!!settings.mcp && typeof settings.mcp === 'object' && !Array.isArray(settings.mcp)
    && (settings.mcp.servers === undefined || (!!settings.mcp.servers && typeof settings.mcp.servers === 'object'
      && !Array.isArray(settings.mcp.servers) && Object.values(settings.mcp.servers).every((server: any) =>
        server && typeof server === 'object' && !Array.isArray(server)
        && (server.enabled === undefined || typeof server.enabled === 'boolean')
        && (server.permissions === undefined || validActions.includes(server.permissions))))));
  return (settings.mode === undefined || validModes.includes(settings.mode))
    && validPatterns(settings.allow) && validPatterns(settings.deny) && validPatterns(settings.ask)
    && (settings.rules === undefined || (Array.isArray(settings.rules) && settings.rules.every((rule: any) =>
      rule && typeof rule === 'object' && validActions.includes(rule.action)
      && typeof rule.pattern === 'string' && rule.pattern.length > 0 && rule.pattern.length <= 512
      && (rule.skill === undefined || (typeof rule.skill === 'string' && rule.skill.length <= 128))
      && (rule.comment === undefined || (typeof rule.comment === 'string' && rule.comment.length <= 1_000)))))
    && validMcp
    && (settings.maxMcpOutputTokens === undefined || (Number.isInteger(settings.maxMcpOutputTokens)
      && settings.maxMcpOutputTokens >= 1_000 && settings.maxMcpOutputTokens <= 100_000));
}

export function wildcardToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regex = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${regex}$`);
}

export function matchRule(pattern: string, toolName: string): boolean {
  return wildcardToRegex(pattern).test(toolName);
}

export function normalizeRules(settings: PermissionSettings): NormalizedRule[] {
  const rules: NormalizedRule[] = [];
  for (const rule of settings.rules ?? []) rules.push({ ...rule, regex: wildcardToRegex(rule.pattern) });
  for (const [action, patterns] of [
    ['ask', settings.ask],
    ['allow', settings.allow],
    ['deny', settings.deny],
  ] as const) {
    for (const pattern of patterns ?? []) rules.push({ action, pattern, regex: wildcardToRegex(pattern) });
  }
  return rules;
}

/** Deny is final; MCP grants may never override a tool-level ask rule. */
export function evaluatePermission(
  toolName: string, settings: PermissionSettings, rules: NormalizedRule[],
  args?: unknown, mcpServer?: string,
): PermissionAction {
  if (!isPermissionSettings(settings)) return 'deny';
  const action = evaluateTool(toolName, rules, args, settings.mode ?? 'default');
  if (action === 'deny') return action;
  const serverName = mcpServer ?? /^mcp__([^_:]+)(?:__|:)/.exec(toolName)?.[1];
  const server = serverName ? settings.mcp?.servers?.[serverName] : undefined;
  if (server?.enabled === false || server?.permissions === 'deny') return 'deny';
  if (server?.permissions === 'ask') return settings.mode === 'dontAsk' ? 'deny' : 'ask';
  if (server?.permissions === 'allow' && !rules.some(rule => rule.action === 'ask' && permissionRuleMatches(rule, toolName, args))) return 'allow';
  return action;
}

export function evaluateTool(
  toolName: string,
  rules: NormalizedRule[],
  args?: any,
  mode: PermissionMode = 'default',
): PermissionAction {
  const matchingRules = rules.filter((rule) => permissionRuleMatches(rule, toolName, args));
  if (matchingRules.some((rule) => rule.action === 'deny')) return 'deny';

  if (mode === 'plan') return isReadOnlyTool(toolName, args) ? 'allow' : 'deny';

  const explicitRule = matchingRules.find((rule) => rule.action !== 'deny');
  if (explicitRule) {
    if (mode === 'dontAsk' && explicitRule.action === 'ask') return 'deny';
    return explicitRule.action;
  }

  if (mode === 'bypassPermissions') return 'allow';
  if (mode === 'acceptEdits' && isFileEditTool(toolName)) return 'allow';
  if (isReadOnlyTool(toolName, args)) return 'allow';
  if (mode === 'dontAsk') return 'deny';
  return 'ask';
}

function permissionRuleMatches(rule: NormalizedRule, toolName: string, args?: any): boolean {
  const parsed = parseToolPattern(rule.pattern);
  if (!parsed) return rule.regex.test(toolName);

  const aliases: Record<string, string[]> = {
    bash: ['bash', 'local_bash', 'Bash'],
    local_bash: ['bash', 'local_bash', 'Bash'],
    powershell: ['powershell', 'local_powershell', 'PowerShell'],
    local_powershell: ['powershell', 'local_powershell', 'PowerShell'],
    local_file_read: ['local_file_read', 'file_read', 'Read'],
    file_read: ['local_file_read', 'file_read', 'Read'],
    local_file_edit: ['local_file_edit', 'file_edit', 'Edit'],
    file_edit: ['local_file_edit', 'file_edit', 'Edit'],
    file_write: ['file_write', 'Write', 'Edit'],
    file_patch: ['file_patch', 'Edit'],
    notebook_edit: ['notebook_edit', 'NotebookEdit', 'Edit'],
    local_notebook_edit: ['local_notebook_edit', 'notebook_edit', 'NotebookEdit', 'Edit'],
    local_notebook_read: ['local_notebook_read', 'file_read', 'Read'],
    local_git: ['local_git', 'Git'],
  };
  if (!(aliases[toolName] ?? [toolName]).includes(parsed.toolName)) return false;
  if (parsed.content === undefined) return true;

  const candidates: string[] = [];
  if (['Bash', 'bash', 'local_bash', 'PowerShell', 'powershell', 'local_powershell'].includes(parsed.toolName)) {
    if (typeof args?.command === 'string') candidates.push(args.command.trim());
  } else if (['Edit', 'Write', 'Read', 'NotebookEdit', 'notebook_edit', 'local_notebook_edit', 'local_notebook_read', 'file_edit', 'file_write', 'file_read', 'local_file_edit', 'local_file_read'].includes(parsed.toolName)) {
    if (typeof args?.path === 'string') candidates.push(args.path.replace(/\\/g, '/'));
  } else if (parsed.toolName === 'Git' || parsed.toolName === 'local_git') {
    if (typeof args?.action === 'string') candidates.push(args.action);
  }
  if (Array.isArray(args?.paths)) candidates.push(...args.paths.filter((value: unknown): value is string => typeof value === 'string'));

  const content = parsed.content;
  if (['Bash', 'bash', 'local_bash', 'PowerShell', 'powershell', 'local_powershell'].includes(parsed.toolName)) {
    const caseInsensitive = ['PowerShell', 'powershell', 'local_powershell'].includes(parsed.toolName);
    return candidates.some((candidate) => shellRuleMatches(content, candidate, caseInsensitive));
  }

  const prefix = content.endsWith(':*') ? content.slice(0, -2) : null;
  return candidates.some((candidate) => {
    if (prefix !== null && (candidate === prefix || candidate.startsWith(`${prefix} `))) return true;
    if (wildcardToRegex(content).test(candidate)) return true;
    return !content.includes('*') && !content.includes('?') && candidate.startsWith(content);
  });
}

/** Mirrors the shell permission rule grammar: exact, legacy prefix, and escaped wildcard. */
function shellRuleMatches(pattern: string, command: string, caseInsensitive: boolean): boolean {
  const trimmed = pattern.trim();
  if (trimmed.endsWith(':*')) {
    const prefix = trimmed.slice(0, -2).trimEnd();
    return command === prefix || command.startsWith(`${prefix} `);
  }

  let regexPattern = '';
  let unescapedStars = 0;
  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    const next = trimmed[index + 1];
    if (char === '\\' && next === '*') {
      regexPattern += '\\*';
      index += 1;
    } else if (char === '\\' && next === '\\') {
      regexPattern += '\\\\';
      index += 1;
    } else if (char === '*') {
      regexPattern += '.*';
      unescapedStars += 1;
    } else {
      regexPattern += /[.+?^${}()|[\]\\'\"]/.test(char) ? `\\${char}` : char;
    }
  }

  if (regexPattern.endsWith(' .*') && unescapedStars === 1) {
    regexPattern = `${regexPattern.slice(0, -3)}( .*)?`;
  }
  const flags = `s${caseInsensitive ? 'i' : ''}`;
  return new RegExp(`^${regexPattern}$`, flags).test(command);
}

function parseToolPattern(pattern: string): { toolName: string; content?: string } | null {
  const open = pattern.indexOf('(');
  if (open <= 0 || !pattern.endsWith(')')) return null;
  const toolName = pattern.slice(0, open);
  const content = pattern.slice(open + 1, -1)
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\');
  if (!toolName || content === '' || content === '*') return { toolName };
  return { toolName, content };
}

function isFileEditTool(toolName: string): boolean {
  return ['local_file_edit', 'local_file_write', 'local_file_patch', 'file_edit', 'file_write', 'file_patch', 'edit', 'write', 'notebook_edit', 'local_notebook_edit']
    .includes(toolName.toLowerCase());
}

export function isReadOnlyTool(toolName: string, args?: any): boolean {
  if ([
    'echo', 'web.get', 'artifact.load', 'rag_search', 'getBugInfo', 'searchBugs',
    'local_file_read', 'file_read', 'local_notebook_read', 'grep', 'glob', 'ls', 'cat', 'task_plan', 'activate_skill',
    'mcp__zentao:getBugInfo', 'mcp__zentao:searchBugs', 'mcp__zentao:getStoryInfo',
  ].includes(toolName)) return true;

  if (toolName === 'local_git' && typeof args?.action === 'string') {
    return ['status', 'diff', 'log', 'branch', 'show', 'worktree_list'].includes(args.action);
  }

  if (['bash', 'local_bash'].includes(toolName) && typeof args?.command === 'string') {
    const command = args.command.trim();
    if (!command || /[;|&><`$()\r\n]/.test(command)) return false;
    const tokens: string[] = command.split(/\s+/);
    const executable = tokens[0].toLowerCase();
    if (['pwd', 'whoami'].includes(executable)) return tokens.length === 1;
    if (executable === 'ls') {
      return tokens.slice(1).filter((token) => !token.startsWith('-')).every((operand) => !isExternalPath(operand));
    }
    if (executable === 'git') {
      const subcommand = tokens[1]?.toLowerCase();
      const safeSubcommands = new Set(['status', 'diff', 'log', 'branch', 'show']);
      const safeFlags = new Set([
        '--short', '--porcelain', '--porcelain=v1', '--porcelain=v2', '--stat', '--name-only', '--name-status',
        '--oneline', '--cached', '--staged', '--no-ext-diff', '--no-textconv', '--decorate', '--max-count', '-n',
      ]);
      if (!subcommand || !safeSubcommands.has(subcommand)) return false;
      const rest = tokens.slice(2);
      if (rest.some((token) => token.startsWith('-') && !safeFlags.has(token) && !/^--max-count=\d+$/.test(token))) return false;
      return rest.filter((token) => !token.startsWith('-')).every((token) => !isExternalPath(token));
    }
  }
  return false;
}

function isExternalPath(value: string): boolean {
  const normalized = value.replace(/\\/g, '/');
  return normalized.startsWith('/') || normalized.startsWith('~') || /^[a-z]:/i.test(normalized)
    || normalized.split('/').some((segment) => segment === '..');
}
