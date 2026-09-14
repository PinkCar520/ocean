import { z } from 'zod';

export const spaceTypeSchema = z.enum(['code', 'work', 'life']);

export type SpaceType = z.infer<typeof spaceTypeSchema>;

export const spaceRefSchema = z
  .object({
    id: z.string().min(1),
    type: spaceTypeSchema,
  })
  .strict();

export type SpaceRef = z.infer<typeof spaceRefSchema>;
