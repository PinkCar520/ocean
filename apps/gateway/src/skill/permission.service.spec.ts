import {
  evaluateTool,
  isReadOnlyTool,
  NormalizedRule,
  wildcardToRegex,
} from './permission.types';

describe('Permission Logic (Claude Code Style)', () => {
  describe('isReadOnlyTool', () => {
    it('should allow basic read-only tools', () => {
      expect(isReadOnlyTool('local_file_read')).toBe(true);
      expect(isReadOnlyTool('grep')).toBe(true);
      expect(isReadOnlyTool('mcp__zentao:getBugInfo')).toBe(true);
    });

    it('should allow safe git actions', () => {
      expect(isReadOnlyTool('local_git', { action: 'status' })).toBe(true);
      expect(isReadOnlyTool('local_git', { action: 'diff' })).toBe(true);
      expect(isReadOnlyTool('local_git', { action: 'commit' })).toBe(false);
    });

    it('should allow safe bash commands', () => {
      expect(isReadOnlyTool('local_bash', { command: 'ls -la' })).toBe(true);
      expect(isReadOnlyTool('local_bash', { command: 'pwd' })).toBe(true);
      expect(isReadOnlyTool('local_bash', { command: 'git status' })).toBe(true);
    });

    it('should block dangerous bash commands even if they start with safe prefix', () => {
      expect(isReadOnlyTool('local_bash', { command: 'ls; rm -rf /' })).toBe(false);
      expect(isReadOnlyTool('local_bash', { command: 'cat /etc/passwd > /tmp/out' })).toBe(false);
      expect(isReadOnlyTool('local_bash', { command: 'ls | wall' })).toBe(false);
    });
  });

  describe('evaluateTool', () => {
    const emptyRules: NormalizedRule[] = [];

    it('should auto-allow read-only tools when no rules match', () => {
      expect(evaluateTool('local_file_read', emptyRules)).toBe('allow');
    });

    it('should fallback to ask for unknown tools', () => {
      expect(evaluateTool('unknown_tool', emptyRules)).toBe('ask');
    });

    it('should respect explicit deny rules over smart defaults', () => {
      const rules: NormalizedRule[] = [
        {
          action: 'deny',
          pattern: 'local_file_read',
          regex: wildcardToRegex('local_file_read'),
        },
      ];
      expect(evaluateTool('local_file_read', rules)).toBe('deny');
    });

    it('should handle bash arguments in evaluation', () => {
      expect(evaluateTool('local_bash', emptyRules, { command: 'ls' })).toBe('allow');
      expect(evaluateTool('local_bash', emptyRules, { command: 'rm -rf' })).toBe('ask');
    });
  });
});
