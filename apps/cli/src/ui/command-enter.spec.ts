import { describe, expect, it } from 'vitest';
import { resolveCommandEnter } from './command-enter.js';

const commands = [
  { name: '/clear' },
  { name: '/help' },
  { name: '/resume' },
];

describe('resolveCommandEnter', () => {
  it('submits an exact command on the first Enter', () => {
    expect(resolveCommandEnter('/clear', [{ name: '/clear' }], 0)).toEqual({
      type: 'submit',
      value: '/clear',
    });
  });

  it('submits the highlighted command when the input is only a prefix', () => {
    expect(resolveCommandEnter('/cl', [{ name: '/clear' }], 0)).toEqual({
      type: 'submit',
      value: '/clear',
    });
  });

  it('submits the highlighted row rather than the first match', () => {
    expect(resolveCommandEnter('/', commands, 2)).toEqual({
      type: 'submit',
      value: '/resume',
    });
  });

  it('submits ordinary text as typed', () => {
    expect(resolveCommandEnter('hello', [], 0)).toEqual({
      type: 'submit',
      value: 'hello',
    });
  });
});
