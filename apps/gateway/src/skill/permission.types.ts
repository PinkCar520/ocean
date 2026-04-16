/**
 * Permission rule types matching Claude Code's settings.json format
 * https://docs.anthropic.com/en/docs/claude-code/settings
 */

export const IS_PUBLIC_KEY = 'isPublic';

export type PermissionMode =
  | 'default'       // prompt on first use
  | 'acceptEdits'   // auto-approve file edits, prompt bash
  | 'plan'          // read-only mode
  | 'bypassPermissions'; // CI/CD mode, no prompts

export type PermissionAction = 'allow' | 'deny' | 'ask';

/**
 * A single permission rule.
 * Rules are evaluated top-down, first match wins.
 */
export interface PermissionRule {
  /** Rule action */
  action: PermissionAction;
  /** Tool/resource pattern to match (supports wildcards) */
  pattern: string;
  /** Optional: scope this rule to specific skills */
  skill?: string;
  /** Optional: rule description/comment */
  comment?: string;
}

/**
 * settings.json schema - Claude Code compatible
 */
export interface PermissionSettings {
  /** Permission mode */
  mode?: PermissionMode;
  /** Rules evaluated top-down, first match wins */
  rules?: PermissionRule[];
  /** Allow patterns (shorthand) */
  allow?: string[];
  /** Deny patterns (shorthand) */
  deny?: string[];
  /** Ask patterns (shorthand) */
  ask?: string[];
  /** MCP-specific permissions */
  mcp?: {
    servers?: Record<string, {
      enabled?: boolean;
      permissions?: PermissionAction;
    }>;
  };
  /** Max tokens for MCP tool responses (prevent context overflow) */
  maxMcpOutputTokens?: number;
}

/**
 * Expanded rule with normalized pattern for matching
 */
export interface NormalizedRule extends PermissionRule {
  /** Regex pattern for matching */
  regex: RegExp;
}

/**
 * Convert a wildcard pattern to regex.
 * Supports: `*` (any chars), `?` (single char), exact match.
 * Examples:
 *   "mcp__zentao:*"     → /^mcp__zentao:.*$/
 *   "Bash(git:*)"       → /^Bash\(git:.*\)$/
 *   "Edit(src/**)"      → /^Edit\(src\/.*\)$/
 *   "getBugInfo"        → /^getBugInfo$/
 */
export function wildcardToRegex(pattern: string): RegExp {
  // Escape special regex chars except * and ?
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  // Convert * to .* and ? to .
  const regex = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${regex}$`);
}

/**
 * Match a tool name against a rule pattern.
 * Returns true if the pattern matches the tool.
 */
export function matchRule(pattern: string, toolName: string): boolean {
  return wildcardToRegex(pattern).test(toolName);
}

/**
 * Build normalized rules from settings for efficient matching
 */
export function normalizeRules(settings: PermissionSettings): NormalizedRule[] {
  const rules: NormalizedRule[] = [];

  // Convert shorthand arrays to rules
  if (settings.allow) {
    for (const pattern of settings.allow) {
      rules.push({ action: 'allow', pattern, regex: wildcardToRegex(pattern) });
    }
  }
  if (settings.deny) {
    for (const pattern of settings.deny) {
      rules.push({ action: 'deny', pattern, regex: wildcardToRegex(pattern) });
    }
  }
  if (settings.ask) {
    for (const pattern of settings.ask) {
      rules.push({ action: 'ask', pattern, regex: wildcardToRegex(pattern) });
    }
  }

  // Convert explicit rules
  if (settings.rules) {
    for (const rule of settings.rules) {
      rules.push({ ...rule, regex: wildcardToRegex(rule.pattern) });
    }
  }

  return rules;
}

/**
 * Evaluate a tool against rules.
 * Returns the action for the first matching rule (top-down, first match wins).
 * If no rule matches, returns 'ask' (default behavior).
 */
export function evaluateTool(
  toolName: string,
  rules: NormalizedRule[],
  args?: any,
): PermissionAction {
  // 1. Check explicit rules (user settings take precedence)
  for (const rule of rules) {
    if (rule.regex.test(toolName)) {
      return rule.action;
    }
  }

  // 2. Smart Defaults (Claude Code logic): Auto-allow read-only operations
  if (isReadOnlyTool(toolName, args)) {
    return 'allow';
  }

  return 'ask'; // default: ask on first use
}

/**
 * Identify if a tool call is a safe, read-only operation.
 */
export function isReadOnlyTool(toolName: string, args?: any): boolean {
  // Basic read-only tools
  const READ_ONLY_TOOLS = [
    'local_file_read',
    'grep',
    'glob',
    'ls',
    'cat',
    'mcp__zentao:getBugInfo',
    'mcp__zentao:searchBugs',
    'mcp__zentao:getStoryInfo',
  ];

  if (READ_ONLY_TOOLS.includes(toolName)) return true;

  // Git read-only actions
  if (toolName === 'local_git' && args?.action) {
    const safeGitActions = ['status', 'diff', 'log', 'branch', 'show'];
    if (safeGitActions.includes(args.action)) return true;
  }

  // Bash read-only commands
  if (toolName === 'local_bash' && args?.command) {
    const cmd = args.command.trim().split(/\s+/)[0];
    const safeBashCommands = [
      'ls',
      'pwd',
      'whoami',
      'git status',
      'git diff',
      'git log',
      'cat',
      'grep',
      'find',
      'du',
      'df',
      'type',
      'which',
    ];

    // Check if the command starts with a safe prefix
    if (safeBashCommands.some((safe) => args.command.trim().startsWith(safe))) {
      // Defense in depth: Ensure no dangerous redirections or pipes
      const dangerousChars = [';', '|', '&', '>', '`', '$'];
      const hasDangerousChars = dangerousChars.some((char) =>
        args.command.includes(char),
      );

      // If it's a very simple safe command with no shell metacharacters, allow it
      if (!hasDangerousChars) return true;
    }
  }

  return false;
}
