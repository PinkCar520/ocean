import * as path from 'node:path';
import * as fs from 'node:fs/promises';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'DANGEROUS';

export interface SecurityAuditResult {
  allowed: boolean;
  riskLevel: RiskLevel;
  reason?: string;
  suggestion?: string;
}

/**
 * Mature Security Engine - Inspired by Claude Code
 * Responsible for path validation and command auditing.
 */
export class SecurityEngine {
  private workspaceRoot: string;

  constructor(workspaceRoot: string = process.cwd()) {
    this.workspaceRoot = path.resolve(workspaceRoot);
  }

  /**
   * Validates if a path is within the workspace boundary.
   * Prevents path traversal attacks.
   */
  public validatePath(targetPath: string): { isValid: boolean; resolvedPath: string } {
    const absolutePath = path.resolve(this.workspaceRoot, targetPath);
    const relative = path.relative(this.workspaceRoot, absolutePath);
    const isValid = relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
    
    return {
      isValid,
      resolvedPath: absolutePath
    };
  }

  /** Resolve an existing path or a new file path while enforcing the real workspace boundary. */
  public async resolveWorkspacePath(targetPath: string): Promise<string> {
    if (!targetPath.trim()) throw new Error('Path must not be empty');
    const root = await fs.realpath(this.workspaceRoot);
    const lexical = path.resolve(root, targetPath);
    const relative = path.relative(root, lexical);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error(`Access denied: path is outside workspace (${targetPath})`);
    }

    let ancestor = lexical;
    const suffix: string[] = [];
    while (true) {
      try {
        const realAncestor = await fs.realpath(ancestor);
        const resolved = path.resolve(realAncestor, ...suffix.reverse());
        const realRelative = path.relative(root, resolved);
        if (realRelative === '..' || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) {
          throw new Error(`Access denied: path resolves outside workspace (${targetPath})`);
        }
        return resolved;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        const parent = path.dirname(ancestor);
        if (parent === ancestor) throw error;
        suffix.push(path.basename(ancestor));
        ancestor = parent;
      }
    }
  }

  /** Keep common credential files out of model-visible file and search results. */
  public async resolveReadablePath(targetPath: string): Promise<string> {
    const resolved = await this.resolveWorkspacePath(targetPath);
    const relative = path.relative(await fs.realpath(this.workspaceRoot), resolved);
    const segments = relative.split(path.sep).map((part) => part.toLowerCase());
    const base = segments.at(-1) ?? '';
    const sensitiveDirectory = segments.some((part) => ['.ssh', '.aws', '.azure', '.gnupg'].includes(part));
    const envSecret = /^\.env(?:\..+)?$/.test(base) && !/^\.env\.(?:example|sample|template)$/.test(base);
    const keyMaterial = /^(?:id_rsa|id_ed25519|id_ecdsa|credentials\.json|secrets?\.json|service-account.*\.json)$/.test(base)
      || /\.(?:pem|p12|pfx|key)$/.test(base);
    if (sensitiveDirectory || envSecret || keyMaterial) {
      throw new Error(`Access denied: credential-like file is not exposed to the model (${targetPath})`);
    }
    return resolved;
  }

  /**
   * Audits a shell command for dangerous patterns.
   */
  public auditCommand(command: string): SecurityAuditResult {
    const cmd = command.trim().toLowerCase();

    // 1. Dangerous Commands (Strict Block)
    const dangerousPatterns = [
      /rm\s+-[rf].*\//,           // rm -rf /
      />\s*\/dev\/sd/,            // Overwriting disk devices
      /mkfs/,                     // Formatting
      /dd\s+if=/,                 // Low-level disk ops
      /chmod\s+777/,              // Insecure permissions
      /chown/,                    // Ownership change
      /visudo/,                   // Sudoers edit
      /passwd/,                   // Password change
      /\.ssh\//,                  // Accessing SSH keys
      /\.env/                     // Accessing secrets
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(cmd)) {
        return {
          allowed: false,
          riskLevel: 'DANGEROUS',
          reason: 'Command contains dangerous patterns targeting system files or disk devices.',
          suggestion: 'Refactor the command to only target project-specific files.'
        };
      }
    }

    // 2. High Risk (Requires explicit confirmation)
    const highRiskPatterns = [
      /^rm\s+/,                   // Any deletion
      /^git\s+push/,              // Pushing code
      /^npm\s+publish/,           // Publishing
      /^curl\s+.*\|\s*bash/,      // Piping web scripts to bash
      /set\s+.*=/,                // Setting env vars
    ];

    for (const pattern of highRiskPatterns) {
      if (pattern.test(cmd)) {
        return {
          allowed: true, // Still allowed but high risk
          riskLevel: 'HIGH',
          reason: 'This command can modify or delete critical resources.'
        };
      }
    }

    // 3. Medium Risk (Structural changes)
    if (cmd.startsWith('git ') || cmd.startsWith('npm ') || cmd.startsWith('pnpm ')) {
      return { allowed: true, riskLevel: 'MEDIUM' };
    }

    // 4. Low Risk (Read-only)
    return { allowed: true, riskLevel: 'LOW' };
  }

  /** PowerShell gets a separate check because its verbs, aliases and switches differ from POSIX shells. */
  public auditPowerShellCommand(command: string): SecurityAuditResult {
    const normalized = command
      .toLowerCase()
      .replace(/`/g, '')
      .replace(/[\u2012-\u2015]/g, '-');
    const deny = (reason: string): SecurityAuditResult => ({
      allowed: false,
      riskLevel: 'DANGEROUS',
      reason,
      suggestion: 'Use Ocean file tools for workspace files, and keep shell commands scoped to the project.',
    });

    if (/(?:^|\s|\/)-(?:encodedcommand|enc)(?:\s|:|$)/i.test(normalized)) {
      return deny('Encoded PowerShell commands are blocked because their behavior cannot be reviewed.');
    }
    if (/\b(?:invoke-expression|iex)\b/i.test(normalized)) {
      return deny('Invoke-Expression can execute dynamically constructed code and is blocked.');
    }
    if (/\b(?:clear-disk|format-volume|initialize-disk|stop-computer|restart-computer|set-executionpolicy)\b/i.test(normalized)) {
      return deny('PowerShell command targets system security or disk state and is blocked.');
    }
    if (/\bstart-process\b[^;\r\n]*-verb\s*:?\s*["']?runas\b/i.test(normalized)) {
      return deny('PowerShell privilege elevation is blocked.');
    }
    const secretPath = /(?:^|[\\/\s"'=])\.env(?!\.(?:example|sample|template)(?:$|[\\/\s"']))(?:\.[\w-]+)?(?=$|[\\/\s"'])|\.ssh[\\/]|\.aws[\\/](?:credentials|config)|\.azure[\\/]|\.gnupg[\\/]|(?:id_rsa|id_ed25519|id_ecdsa)(?:$|[\\/\s"'])|\.(?:pem|p12|pfx|key)(?:$|[\\/\s"'])/i.test(normalized);
    if (secretPath) return deny('PowerShell command references a credential or private-key path.');

    for (const statement of normalized.split(/[;\r\n|]+/)) {
      if (!/^\s*(?:remove-item|ri|rm|del|erase|rd|rmdir)\b/.test(statement)) continue;
      const recursive = /(?:^|\s)-(?:recurse|r|rf)(?:\s|:|$)/.test(statement);
      const rootTarget = /(?:^|\s)(?:"(?:[a-z]:\\|\\|\/)?"|(?:[a-z]:\\|\\|\/))(?=\s|$)/.test(statement);
      if (recursive && rootTarget) return deny('Recursive deletion of a filesystem root is blocked.');
    }

    // Shell execution remains approval-gated. This audit only blocks high-confidence hazards.
    return { allowed: true, riskLevel: 'HIGH', reason: 'PowerShell execution requires an explicit per-command approval.' };
  }
}

export const security = new SecurityEngine();
