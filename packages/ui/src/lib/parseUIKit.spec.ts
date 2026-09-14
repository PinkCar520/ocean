import { describe, expect, it } from 'vitest';

import { parseUIKit } from './parseUIKit';

describe('parseUIKit', () => {
  it('returns a validated known component', () => {
    const component = { uiType: 'text', props: { content: 'Hello' } };

    expect(parseUIKit(component)).toEqual({ status: 'known', value: component });
  });

  it('preserves unknown payloads for a safe fallback', () => {
    const component = { uiType: 'future_component', props: { value: 1 } };

    expect(parseUIKit(component)).toEqual({ status: 'unknown', value: component });
  });
});
