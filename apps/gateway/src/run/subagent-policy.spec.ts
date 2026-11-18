import { childPolicy, permitsSubagentTool } from './subagent-policy';
const previous = process.env.OCEAN_SUBAGENT_POLICIES;
afterEach(() => { if (previous === undefined) delete process.env.OCEAN_SUBAGENT_POLICIES; else process.env.OCEAN_SUBAGENT_POLICIES = previous; });
describe('Nested agent privilege limits', () => {
 it('does not let a nested broad template widen parent tool or turn permissions', () => {
  process.env.OCEAN_SUBAGENT_POLICIES = JSON.stringify({ reader: { allowedTools: ['echo'], maxTurns: 2 }, broad: { allowedTools: ['*'], maxTurns: 10 } });
  const parent = childPolicy('reader', null, {});
  const child = childPolicy('broad', 'parent-run', { subagentPolicy: parent });
  expect(permitsSubagentTool(child, 'echo')).toBe(true);
  expect(permitsSubagentTool(child, 'counter.increment')).toBe(false);
  expect(child.maxTurns).toBe(2);
 });
 it('rejects invalid configured turn limits instead of coercing/clamping them', () => {
  process.env.OCEAN_SUBAGENT_POLICIES = '{"reader":{"maxTurns":"Infinity"}}';
  expect(() => childPolicy('reader', null, {})).toThrow();
 });
});
