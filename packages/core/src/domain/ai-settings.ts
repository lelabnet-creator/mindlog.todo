import { z } from 'zod';
import { aiCreditsSchema } from './ai-log.js';
import { chatModelSchema, chatProviderSchema, CHAT_PROVIDER_IDS } from '../llm/models.js';

// Self-hosted users PATCH their provider, model (a known id or a free-text
// custom one), and/or their own API key (write-only).
export const aiSettingsUpdateSchema = z.object({
  provider: z.enum(['anthropic', 'openai', 'mistral']).optional(),
  model: z.string().min(1).max(100).optional(),
  apiKey: z.string().min(1).max(400).optional(),
});
export type AiSettingsUpdateInput = z.infer<typeof aiSettingsUpdateSchema>;

// Request to list a provider's models live (optionally with an inline key,
// otherwise the stored one is used).
export const aiModelsQuerySchema = z.object({
  provider: z.enum(['anthropic', 'openai', 'mistral']),
  apiKey: z.string().min(1).max(400).optional(),
});
export type AiModelsQueryInput = z.infer<typeof aiModelsQuerySchema>;

/** What GET /ai/settings returns. */
export const aiSettingsViewSchema = z.object({
  /** Cloud-hosted: shared key + metered credits; user cannot edit AI settings. */
  cloudHosted: z.boolean(),
  provider: z.enum(CHAT_PROVIDER_IDS),
  model: z.string(),
  /** Whether a usable key is configured (the key itself is never returned). */
  hasKey: z.boolean(),
  /** Provider options for the picker. */
  providers: z.array(chatProviderSchema),
  /** Static fallback model suggestions (live models are fetched separately). */
  models: z.array(chatModelSchema),
  /** Credit balance (cloud-hosted only; null otherwise). */
  credits: aiCreditsSchema.nullable(),
});
export type AiSettingsView = z.infer<typeof aiSettingsViewSchema>;
