import { z } from 'zod';

export const RUN_INQUIRY_TOOL = 'ask_user';
export const runInquirySchema = z.object({
  description: z.string().trim().max(500).optional(),
  inquiries: z.array(z.object({
    id: z.string().trim().min(1).max(40),
    header: z.string().trim().min(1).max(80),
    question: z.string().trim().min(1).max(500),
    type: z.enum(['single_select', 'multi_select', 'text']),
    options: z.array(z.string().trim().min(1).max(200)).min(2).max(4).optional(),
  }).strict()).min(1).max(4),
}).strict().refine(({ inquiries }) =>
  new Set(inquiries.map(q => q.id)).size === inquiries.length &&
  new Set(inquiries.map(q => q.question)).size === inquiries.length &&
  inquiries.every(q => q.type === 'text' ? !q.options : q.options && new Set(q.options).size === q.options.length),
);

export const runInquiryResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('answered'),
    answers: z.record(z.string(), z.union([z.string().trim().min(1).max(2000), z.array(z.string().trim().min(1).max(200)).min(1).max(4)])),
  }).strict(),
  z.object({ status: z.literal('dismissed') }).strict(),
]);
