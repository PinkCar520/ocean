import { parseShellCommand } from './shell-ast.js';
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
  /** Optional administrator-supplied policy version; otherwise derived from content. */
  version?: string;
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
  id?: string;
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
    && (settings.version === undefined || (typeof settings.version === 'string' && settings.version.length <= 128))
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
  return uniquePermissionRuleIds(rules);
}

export function uniquePermissionRuleIds(rules: NormalizedRule[]): NormalizedRule[] {
  const counts = new Map<string, number>();
  const used = new Set<string>();
  return rules.map(rule => {
    const base = `rule:${rule.action}:${rule.pattern}`;
    let occurrence = (counts.get(base) ?? 0) + 1;
    let id = occurrence === 1 ? base : `${base}#${occurrence}`;
    while (used.has(id)) { occurrence++; id = `${base}#${occurrence}`; }
    counts.set(base, occurrence); used.add(id);
    return { ...rule, id };
  });
}

export interface PermissionDecision {
  action: PermissionAction;
  reason: string;
  ruleId?: string;
  policyVersion: string;
  source: 'invalid' | 'deny-rule' | 'plan' | 'mcp-server' | 'session' | 'rule' | 'mode' | 'read-only' | 'default';
}

/** Stable policy fingerprint so approvals/audit can pin the exact rules used. */
export function permissionPolicyVersion(settings: PermissionSettings, rules: NormalizedRule[] = []): string {
  if (settings?.version) return settings.version;
  const snapshot = JSON.stringify({
    mode: settings?.mode ?? 'default',
    mcp: settings?.mcp ?? null,
    rules: rules.map((rule) => [rule.action, rule.pattern, rule.skill ?? null, rule.comment ?? null]),
  });
  let hash = 2166136261;
  for (let index = 0; index < snapshot.length; index += 1) {
    hash ^= snapshot.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function decision(
  action: PermissionAction,
  reason: string,
  policyVersion: string,
  source: PermissionDecision['source'],
  ruleId?: string,
): PermissionDecision {
  return { action, reason, policyVersion, source, ...(ruleId ? { ruleId } : {}) };
}

function matchingRuleDecision(rule: NormalizedRule, policyVersion: string): PermissionDecision {
  return decision(
    rule.action,
    rule.comment ?? `Matched ${rule.action} rule ${rule.pattern}`,
    policyVersion,
    rule.action === 'deny' ? 'deny-rule' : 'rule',
    rule.id ?? `rule:${rule.action}:${rule.pattern}`,
  );
}

export function evaluateToolDecision(
  toolName: string,
  rules: NormalizedRule[],
  args?: any,
  mode: PermissionMode = 'default',
  policyVersion = 'unversioned',
): PermissionDecision {
  const matchingRules = rules.filter((rule) => permissionRuleMatches(rule, toolName, args));
  const deny = matchingRules.find((rule) => rule.action === 'deny');
  if (deny) return matchingRuleDecision(deny, policyVersion);

  if (mode === 'plan') {
    return isReadOnlyTool(toolName, args)
      ? decision('allow', `Plan mode permits read-only tool ${toolName}.`, policyVersion, 'read-only', 'mode:plan')
      : decision('deny', `Plan mode blocks ${toolName} until planning ends.`, policyVersion, 'plan', 'mode:plan');
  }

  const explicitRule = matchingRules.find((rule) => rule.action !== 'deny');
  if (explicitRule) {
    if (mode === 'dontAsk' && explicitRule.action === 'ask') {
      return decision('deny', explicitRule.comment ?? `dontAsk converts ask rule ${explicitRule.pattern} to deny.`, policyVersion, 'rule', `rule:ask:${explicitRule.pattern}`);
    }
    return matchingRuleDecision(explicitRule, policyVersion);
  }

  if (mode === 'bypassPermissions') return decision('allow', 'bypassPermissions mode allows the tool.', policyVersion, 'mode', 'mode:bypassPermissions');
  if (mode === 'acceptEdits' && isFileEditTool(toolName)) return decision('allow', 'acceptEdits mode permits file edits.', policyVersion, 'mode', 'mode:acceptEdits');
  if (isReadOnlyTool(toolName, args)) return decision('allow', `Read-only tool ${toolName}.`, policyVersion, 'read-only', 'read-only');
  if (mode === 'dontAsk') return decision('deny', 'dontAsk mode denies tools without an allow grant.', policyVersion, 'default', 'mode:dontAsk');
  return decision('ask', `Tool ${toolName} requires approval in ${mode} mode.`, policyVersion, 'default');
}

export function evaluateTool(
  toolName: string,
  rules: NormalizedRule[],
  args?: any,
  mode: PermissionMode = 'default',
): PermissionAction {
  return evaluateToolDecision(toolName, rules, args, mode).action;
}

/** Deny is final; MCP grants may never override a tool-level ask rule. */
export function evaluatePermission(
  toolName: string,
  settings: PermissionSettings,
  rules: NormalizedRule[],
  args?: unknown,
  mcpServer?: string,
): PermissionAction {
  return evaluatePermissionDecision(toolName, settings, rules, args, mcpServer).action;
}

export function evaluatePermissionDecision(
  toolName: string,
  settings: PermissionSettings,
  rules: NormalizedRule[],
  args?: unknown,
  mcpServer?: string,
  options: { sessionGrant?: boolean; policyVersion?: string } = {},
): PermissionDecision {
  if (!isPermissionSettings(settings)) {
    return decision('deny', 'Invalid permission settings; denying by default.', 'invalid', 'invalid');
  }
  const policyVersion = options.policyVersion ?? permissionPolicyVersion(settings, rules);
  const matchingRules = rules.filter((rule) => permissionRuleMatches(rule, toolName, args));
  const deny = matchingRules.find((rule) => rule.action === 'deny');
  if (deny) return matchingRuleDecision(deny, policyVersion);

  if ((settings.mode ?? 'default') === 'plan') {
    return evaluateToolDecision(toolName, rules, args, 'plan', policyVersion);
  }

  const serverName = mcpServer ?? /^mcp__([^_:]+)(?:__|:)/.exec(toolName)?.[1];
  const server = serverName ? settings.mcp?.servers?.[serverName] : undefined;
  if (server?.enabled === false || server?.permissions === 'deny') {
    return decision('deny', `MCP server ${serverName} is disabled or denied.`, policyVersion, 'mcp-server', `mcp:${serverName}`);
  }

  if (options.sessionGrant) {
    return decision('allow', `Session grant for ${toolName} with these exact arguments.`, policyVersion, 'session', `session:${toolName}`);
  }

  if (server?.permissions === 'ask') {
    return settings.mode === 'dontAsk'
      ? decision('deny', `dontAsk denies MCP server ${serverName}.`, policyVersion, 'mcp-server', `mcp:${serverName}`)
      : decision('ask', `MCP server ${serverName} requires approval.`, policyVersion, 'mcp-server', `mcp:${serverName}`);
  }
  if (server?.permissions === 'allow' && !matchingRules.some((rule) => rule.action === 'ask')) {
    return decision('allow', `MCP server ${serverName} allows the tool.`, policyVersion, 'mcp-server', `mcp:${serverName}`);
  }

  return evaluateToolDecision(toolName, rules, args, settings.mode ?? 'default', policyVersion);
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
    const tree = parseShellCommand(args.command);
    if (tree.type !== 'command') return false;
    const tokens = tree.words;
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
