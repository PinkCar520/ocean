import { z } from 'zod';

export const chatMessagePartSchema = z
  .object({
    type: z.string().min(1),
    name: z.string().min(1).optional(),
    text: z.string().optional(),
  })
  .passthrough();

export const chatMessageSchema = z
  .object({
    id: z.string().optional(),
    role: z.enum(['system', 'user', 'assistant', 'tool']),
    content: z.string().optional(),
    parts: z.array(chatMessagePartSchema).optional(),
    parentId: z.string().nullable().optional(),
    experimental_attachments: z.array(z.unknown()).optional(),
  })
  .passthrough();

export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const chatRequestSchema = z
  .object({
    id: z.string().optional(),
    text: z.string().min(1).optional(),
    messages: z.array(chatMessageSchema).optional(),
    modelId: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
    sessionId: z.string().min(1).nullable().optional(),
    parentId: z.string().min(1).nullable().optional(),
    workspacePath: z.string().min(1).optional(),
    skillId: z.string().min(1).optional(),
    skillIds: z.array(z.string().min(1)).optional(),
    activeSkills: z.array(z.string().min(1)).optional(),
    skills: z.array(z.string().min(1)).optional(),
    search: z.boolean().optional(),
    knowledge: z.boolean().optional(),
    trigger: z.string().optional(),
    messageId: z.string().optional(),
  })
  .passthrough()
  .refine(
    request => Boolean(request.text || request.messages?.length),
    { message: 'Either text or at least one message is required' },
  );

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const generateTitleRequestSchema = z.object({
  message: z.string().min(1),
  modelId: z.string().min(1).optional(),
});

export const autocompleteRequestSchema = z.object({
  prefix: z.string(),
});
