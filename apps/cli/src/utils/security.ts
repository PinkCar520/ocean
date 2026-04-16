import * as path from 'node:path';
import { CONFIG } from './config.js';

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
    let normalizedPath = targetPath;

    // 智能修正：如果 AI 传入了网关环境的路径（如 /app/... 或 /Users/gateway/...）
    // 我们尝试提取文件名或子路径，使其相对于本地 workspaceRoot
    if (path.isAbsolute(targetPath)) {
      const parts = targetPath.split(path.sep);
      const appIdx = parts.indexOf('app');
      if (appIdx !== -1 && appIdx < parts.length - 1) {
        // 提取 /app/ 之后的部分
        normalizedPath = path.join(...parts.slice(appIdx + 1));
      } else {
        // 如果是其他绝对路径且不在 workspace 内，尝试取其 basename（仅作为兜底）
        if (!targetPath.startsWith(this.workspaceRoot)) {
          normalizedPath = path.basename(targetPath);
        }
      }
    }

    const absolutePath = path.resolve(this.workspaceRoot, normalizedPath);
    const isValid = absolutePath.startsWith(this.workspaceRoot);
    
    return {
      isValid,
      resolvedPath: absolutePath
    };
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
}

export const security = new SecurityEngine();
