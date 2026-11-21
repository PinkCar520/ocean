import ignore from 'ignore';
import * as path from 'node:path';
import { homedir } from 'node:os';
export { getManagedPermissionPaths } from './managed-permission-settings.js';
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
  allowManagedPermissionRulesOnly?: boolean;
  permissions?: { defaultMode?: PermissionMode; allow?: string[]; ask?: string[]; deny?: string[] };
  mcp?: {
    servers?: Record<string, { enabled?: boolean; permissions?: PermissionAction }>;
  };
  maxMcpOutputTokens?: number;
}

export interface PermissionRuleOrigin {
  settingsRoot: string;
  workspaceRoot?: string;
  homeRoot?: string;
}

export interface NormalizedRule extends PermissionRule {
  origin?: PermissionRuleOrigin;
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
  const permissions = settings.permissions;
  const validPermissions = permissions === undefined || (!!permissions && typeof permissions === 'object'
    && !Array.isArray(permissions)
    && (permissions.defaultMode === undefined || validModes.includes(permissions.defaultMode))
    && validPatterns(permissions.allow) && validPatterns(permissions.ask) && validPatterns(permissions.deny));
  return validPermissions
    && (settings.allowManagedPermissionRulesOnly === undefined || typeof settings.allowManagedPermissionRulesOnly === 'boolean')
    && (settings.mode === undefined || validModes.includes(settings.mode))
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

/** Resolve a settings file's permission mode while retaining its rule lists. */
export function parsePermissionSettings(value: unknown): PermissionSettings | null {
  if (!isPermissionSettings(value)) return null;
  const mode = value.mode ?? value.permissions?.defaultMode;
  return mode === undefined ? value : { ...value, mode };
}

export function wildcardToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regex = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${regex}$`);
}

export function matchRule(pattern: string, toolName: string): boolean {
  return wildcardToRegex(pattern).test(toolName);
}

export function normalizeRules(settings: PermissionSettings, origin?: PermissionRuleOrigin): NormalizedRule[] {
  const rules: NormalizedRule[] = [];
  for (const rule of settings.rules ?? []) rules.push({ ...rule, regex: wildcardToRegex(rule.pattern), ...(origin && { origin }) });
  for (const [action, patterns] of [
    ['ask', settings.ask],
    ['allow', settings.allow],
    ['deny', settings.deny],
  ] as const) {
    for (const pattern of [...(patterns ?? []), ...(settings.permissions?.[action] ?? [])]) rules.push({ action, pattern, regex: wildcardToRegex(pattern), ...(origin && { origin }) });
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
  managedRulesOnly?: boolean;
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
  mcpServer?: string,
): PermissionDecision {
  const matchingRules = rules.filter((rule) => permissionRuleMatches(rule, toolName, args, mcpServer));
  const deny = matchingRules.find((rule) => rule.action === 'deny');
  if (deny) return matchingRuleDecision(deny, policyVersion);

  const ask = matchingRules.find((rule) => rule.action === 'ask');
  if (ask) {
    if (mode === 'dontAsk') {
      return decision('deny', ask.comment ?? `dontAsk converts ask rule ${ask.pattern} to deny.`, policyVersion, 'rule', ask.id ?? `rule:ask:${ask.pattern}`);
    }
    return matchingRuleDecision(ask, policyVersion);
  }

  if (mode === 'plan') {
    return isReadOnlyTool(toolName, args)
      ? decision('allow', `Plan mode permits read-only tool ${toolName}.`, policyVersion, 'read-only', 'mode:plan')
      : decision('deny', `Plan mode blocks ${toolName} until planning ends.`, policyVersion, 'plan', 'mode:plan');
  }

  const allow = matchingRules.find((rule) => rule.action === 'allow');
  if (allow) return matchingRuleDecision(allow, policyVersion);

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
  const servers = settings.mcp?.servers;
  const gatewayServer = /^mcp__([^:]+):/.exec(toolName)?.[1];
  const cliServer = Object.keys(servers ?? {})
    .filter(name => toolName.startsWith(`mcp__${name}__`))
    .sort((a, b) => b.length - a.length)[0];
  const serverName = mcpServer ?? gatewayServer ?? cliServer;
  const matchingRules = rules.filter((rule) => permissionRuleMatches(rule, toolName, args, serverName));
  const deny = matchingRules.find((rule) => rule.action === 'deny');
  if (deny) return matchingRuleDecision(deny, policyVersion);

  const server = serverName && servers && Object.hasOwn(servers, serverName) ? servers[serverName] : undefined;
  if (server?.enabled === false || server?.permissions === 'deny') {
    return decision('deny', `MCP server ${serverName} is disabled or denied.`, policyVersion, 'mcp-server', `mcp:${serverName}`);
  }

  if ((settings.mode ?? 'default') === 'plan') {
    return evaluateToolDecision(toolName, rules, args, 'plan', policyVersion, serverName);
  }

  if (matchingRules.some((rule) => rule.action === 'ask')) {
    return evaluateToolDecision(toolName, rules, args, settings.mode ?? 'default', policyVersion, serverName);
  }

  if (options.sessionGrant) {
    return decision('allow', `Session grant for ${toolName} with these exact arguments.`, policyVersion, 'session', `session:${toolName}`);
  }

  if (server?.permissions === 'ask') {
    return settings.mode === 'dontAsk'
      ? decision('deny', `dontAsk denies MCP server ${serverName}.`, policyVersion, 'mcp-server', `mcp:${serverName}`)
      : decision('ask', `MCP server ${serverName} requires approval.`, policyVersion, 'mcp-server', `mcp:${serverName}`);
  }
  if (server?.permissions === 'allow') {
    return decision('allow', `MCP server ${serverName} allows the tool.`, policyVersion, 'mcp-server', `mcp:${serverName}`);
  }

  return evaluateToolDecision(toolName, rules, args, settings.mode ?? 'default', policyVersion, serverName);
}

function permissionRuleMatches(rule: NormalizedRule, toolName: string, args?: any, mcpServer?: string): boolean {
  const parsed = parseToolPattern(rule.pattern);
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
    lsp: ['lsp', 'local_lsp', 'LSP'],
    local_lsp: ['lsp', 'local_lsp', 'LSP'],
  };
  const names = [...(aliases[toolName] ?? [toolName])];
  const server = mcpServer ?? /^mcp__(.+?):/.exec(toolName)?.[1]
    ?? /^mcp__(.+?)__/.exec(toolName)?.[1];
  if (server) {
    const prefix = `mcp__${server}`;
    const remoteName = toolName.startsWith(`${prefix}:`) ? toolName.slice(prefix.length + 1)
      : toolName.startsWith(`${prefix}__`) ? toolName.slice(prefix.length + 2) : undefined;
    if (remoteName) names.push(prefix, `${prefix}:${remoteName}`, `${prefix}__${remoteName}`);
  }
  if (!parsed) return names.some((name) => rule.regex.test(name));
  if (!names.includes(parsed.toolName)) return false;
  if (parsed.content === undefined) return true;

  const content = parsed.content;
  const candidates = Array.isArray(args?.paths) ? args.paths.filter((value: unknown): value is string => typeof value === 'string') : [];
  if (['Bash', 'bash', 'local_bash', 'PowerShell', 'powershell', 'local_powershell'].includes(parsed.toolName)) {
    const caseInsensitive = ['PowerShell', 'powershell', 'local_powershell'].includes(parsed.toolName);
    if (typeof args?.command === 'string') candidates.push(args.command.trim());
    return candidates.some((candidate: string) => shellRuleMatches(content, candidate, caseInsensitive));
  }
  if (['Edit', 'Write', 'Read', 'NotebookEdit', 'notebook_edit', 'local_notebook_edit', 'local_notebook_read',
    'file_edit', 'file_write', 'file_read', 'file_patch', 'local_file_edit', 'local_file_read', 'lsp', 'local_lsp', 'LSP'].includes(parsed.toolName)) {
    if (typeof args?.path === 'string') candidates.push(args.path);
    return candidates.some((candidate: string) => matchesFileRule(content, candidate, rule.origin));
  }
  if ((parsed.toolName === 'Git' || parsed.toolName === 'local_git') && typeof args?.action === 'string') {
    candidates.push(args.action);
  }

  const prefix = content.endsWith(':*') ? content.slice(0, -2) : null;
  return candidates.some((candidate: string) => {
    if (prefix !== null && (candidate === prefix || candidate.startsWith(`${prefix} `))) return true;
    if (wildcardToRegex(content).test(candidate)) return true;
    return !content.includes('*') && !content.includes('?') && candidate.startsWith(content);
  });
}

function matchesFileRule(pattern: string, candidate: string, origin?: PermissionRuleOrigin): boolean {
  const workspace = origin?.workspaceRoot ?? process.cwd();
  const home = origin?.homeRoot ?? homedir();
  const target = candidate.startsWith('~/')
    ? path.resolve(home, candidate.slice(2))
    : path.resolve(workspace, candidate);
  let root = workspace;
  if (pattern.startsWith('//')) {
    root = path.parse(target).root;
    pattern = pattern.slice(1);
    if (process.platform === 'win32' && /^\/[a-z]\//i.test(pattern)) {
      if (root[0].toLowerCase() !== pattern[1].toLowerCase()) return false;
      pattern = pattern.slice(2);
    }
  } else if (pattern.startsWith('~/')) {
    root = home;
    pattern = pattern.slice(1);
  } else if (pattern.startsWith('/')) {
    root = origin?.settingsRoot ?? workspace;
  } else if (pattern.startsWith('./')) {
    pattern = pattern.slice(2);
  }
  const local = path.relative(root, target);
  if (!local || local === '..' || local.startsWith(`..${path.sep}`) || path.isAbsolute(local)) return false;
  if (pattern.endsWith('/**')) pattern = pattern.slice(0, -3);
  return ignore().add(pattern).ignores(local.split(path.sep).join('/'));
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
    'local_file_read', 'file_read', 'local_notebook_read', 'grep', 'glob', 'ls', 'cat', 'task_plan', 'activate_skill', 'delegate_task', 'lsp', 'local_lsp', 'cron_list', 'list_team_members',
    'mcp__zentao:getBugInfo', 'mcp__zentao:searchBugs', 'mcp__zentao:getStoryInfo',
  ].includes(toolName)) return true;

  if (toolName === 'project_memory') return args?.action === 'list';

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

export interface PermissionHookOutcome {
  blocked: boolean;
  reason: string;
  permission?: 'allow' | 'deny';
  updatedInput?: Record<string, unknown>;
  interrupt?: boolean;
  updatedPermissions?: readonly unknown[];
}

export function permissionHookVerdict(event: string, specific: Record<string, unknown> | undefined): PermissionHookOutcome | undefined {
  if (event !== 'PermissionRequest' || specific?.hookEventName !== event) return;
  const decision = specific.decision;
  if (!decision || typeof decision !== 'object') return;
  const verdict = decision as Record<string, unknown>;
  if (verdict.behavior === 'deny') {
    return { blocked: true, reason: typeof verdict.message === 'string' ? verdict.message : 'Permission denied by hook', permission: 'deny', ...(verdict.interrupt === true && { interrupt: true }) };
  }
  if (verdict.behavior === 'allow') {
    const input = verdict.updatedInput;
    if (input !== undefined && (!input || typeof input !== 'object' || Array.isArray(input))) {
      return { blocked: true, reason: 'Invalid replacement tool input', permission: 'deny' };
    }
    if (verdict.updatedPermissions !== undefined && !Array.isArray(verdict.updatedPermissions)) {
      return { blocked: true, reason: 'Invalid permission updates', permission: 'deny' };
    }
    return {
      blocked: false, reason: '', permission: 'allow',
      ...(verdict.updatedPermissions?.length && { updatedPermissions: verdict.updatedPermissions }),
      ...(input !== undefined && { updatedInput: input as Record<string, unknown> }),
    };
  }
}
