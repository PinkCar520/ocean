import { describe, it, expect } from 'vitest';
import { isSafeRefName, isValidGitSha } from './git-fs';

describe('cli git-fs security utils', () => {
  it('rejects unsafe ref names', () => {
    expect(isSafeRefName('')).toBe(false);
    expect(isSafeRefName('-branch')).toBe(false);
    expect(isSafeRefName('/abs')).toBe(false);
    expect(isSafeRefName('a..b')).toBe(false);
    expect(isSafeRefName('a//b')).toBe(false);
    expect(isSafeRefName('a/./b')).toBe(false);
    expect(isSafeRefName('bad space')).toBe(false);
  });

  it('accepts safe ref names', () => {
    expect(isSafeRefName('main')).toBe(true);
    expect(isSafeRefName('feature/foo-bar_1')).toBe(true);
    expect(isSafeRefName('v1.2.3+meta')).toBe(true);
  });

  it('validates git SHAs', () => {
    expect(isValidGitSha('a'.repeat(40))).toBe(true);
    expect(isValidGitSha('a'.repeat(64))).toBe(true);
    expect(isValidGitSha('a'.repeat(20))).toBe(false);
    expect(isValidGitSha('zzz')).toBe(false);
  });
});
