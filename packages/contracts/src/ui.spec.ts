import { describe, expect, it } from 'vitest';

import { createToolResultSchema, uiKitSchema } from './index.js';

describe('generative UI contracts', () => {
  it('accepts a component that previously existed only in the UI package', () => {
    const component = {
      uiType: 'diff_viewer',
      props: {
        fileName: 'src/app.ts',
        diff: [{ lineNumber: 1, type: 'addition', content: 'export {}' }],
      },
    };

    expect(uiKitSchema.parse(component)).toEqual(component);
  });

  it('rejects an unknown component type for safe client fallback', () => {
    expect(uiKitSchema.safeParse({ uiType: 'unknown_card', props: {} }).success).toBe(false);
  });

  it('validates tool data with a caller-provided schema', () => {
    const schema = createToolResultSchema(uiKitSchema);
    const result = { data: { uiType: 'text', props: { content: 'Ready' } } };

    expect(schema.parse(result)).toEqual(result);
  });
});
