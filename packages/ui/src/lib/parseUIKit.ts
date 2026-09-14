import { uiKitSchema, type UIKit } from '@ocean/contracts';

export type ParsedUIKit =
  | { status: 'known'; value: UIKit }
  | { status: 'unknown'; value: unknown };

export function parseUIKit(value: unknown): ParsedUIKit {
  const result = uiKitSchema.safeParse(value);
  return result.success
    ? { status: 'known', value: result.data }
    : { status: 'unknown', value };
}
