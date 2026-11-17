import { createToolAliases } from './tool-aliases';
describe('provider tool aliases', () => {
  it('preserves legal names and round trips dotted, unicode and long names', () => {
    const names = ['read_file', 'mcp.gitlab.search', '工具', 'x'.repeat(100)];
    const { forward, reverse } = createToolAliases(names);
    expect(forward.get('read_file')).toBe('read_file');
    for (const name of names) {
      const alias = forward.get(name)!;
      expect(alias).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
      expect(reverse.get(alias)).toBe(name);
    }
  });
  it('avoids collisions with valid existing tool names', () => {
    const alias = createToolAliases(['a.b']).forward.get('a.b')!;
    const mapped = createToolAliases(['a.b', alias, 'a_b']);
    expect(new Set(mapped.forward.values()).size).toBe(3);
    expect(mapped.forward.get(alias)).toBe(alias);
  });
});
