import { z } from 'zod';
/** Kinds of generative AI activity recorded for transparency / cost tracking. */
export const AI_LOG_KINDS = ['ask', 'extract_tasks', 'summarize', 'cleanup_drawing'] as const;
export type AiLogKind = (typeof AI_LOG_KINDS)[number];

export const aiLogSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  kind: z.enum(AI_LOG_KINDS),
  model: z.string().nullable(),
  prompt: z.string(),
  response: z.string().nullable(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  createdAt: z.string(),
});
export type AiLog = z.infer<typeof aiLogSchema>;

export const aiUsageSchema = z.object({
  calls: z.number().int(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  totalTokens: z.number().int(),
});
export type AiUsage = z.infer<typeof aiUsageSchema>;

/** Per-user AI credit balance for the current month (cloud-hosted mode). */
export const aiCreditsSchema = z.object({
  /** Tokens consumed since the start of the current month. */
  usedTokens: z.number().int(),
  /** Monthly allowance (AI_MONTHLY_TOKEN_LIMIT). */
  limitTokens: z.number().int(),
  /** ISO timestamp when the allowance resets (start of next month). */
  resetAt: z.string(),
});
export type AiCredits = z.infer<typeof aiCreditsSchema>;
