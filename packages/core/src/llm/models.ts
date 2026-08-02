import { z } from 'zod';
// Chat LLM providers + a small fallback catalog. The settings UI fetches the
// live model list from each provider's API (see list-models.ts) and also allows
// a free-text custom model id; this catalog is only a sensible default/offline
// fallback.

export const CHAT_PROVIDER_IDS = ['anthropic', 'openai', 'mistral'] as const;
export type ChatProviderId = (typeof CHAT_PROVIDER_IDS)[number];

export const chatProviderSchema = z.object({
  id: z.enum(CHAT_PROVIDER_IDS),
  label: z.string(),
});
export type ChatProvider = z.infer<typeof chatProviderSchema>;

export const CHAT_PROVIDERS: ChatProvider[] = [
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'mistral', label: 'Mistral' },
];

export const chatModelSchema = z.object({
  id: z.string(),
  provider: z.enum(CHAT_PROVIDER_IDS),
  label: z.string(),
});
export type ChatModel = z.infer<typeof chatModelSchema>;

/** Fallback suggestions per provider (used until live models are fetched). */
export const CHAT_MODELS: ChatModel[] = [
  { id: 'claude-opus-4-8', provider: 'anthropic', label: 'Claude Opus 4.8' },
  { id: 'claude-sonnet-4-6', provider: 'anthropic', label: 'Claude Sonnet 4.6' },
  { id: 'claude-haiku-4-5-20251001', provider: 'anthropic', label: 'Claude Haiku 4.5' },
  { id: 'gpt-4o', provider: 'openai', label: 'GPT-4o' },
  { id: 'gpt-4o-mini', provider: 'openai', label: 'GPT-4o mini' },
  { id: 'mistral-large-latest', provider: 'mistral', label: 'Mistral Large' },
  { id: 'mistral-small-latest', provider: 'mistral', label: 'Mistral Small' },
];

export const DEFAULT_CHAT_PROVIDER: ChatProviderId = 'anthropic';
export const DEFAULT_CHAT_MODEL = 'claude-sonnet-4-6';

export function isChatProvider(v: string): v is ChatProviderId {
  return v === 'anthropic' || v === 'openai' || v === 'mistral';
}

/** Best-effort provider for a known model id (fallback when none is stored). */
export function providerOf(modelId: string): ChatProviderId {
  return CHAT_MODELS.find((m) => m.id === modelId)?.provider ?? DEFAULT_CHAT_PROVIDER;
}
