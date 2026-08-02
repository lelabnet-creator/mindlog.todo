import { z } from 'zod';

/**
 * Body of `GET /api/v1/version` — public, unauthenticated.
 *
 * `authProviders` says which sign-in paths this deployment actually has
 * configured. Clients use it to hide the others: offering an unconfigured one
 * is worse than not offering it, since Google / mindlog id answer 503 and
 * password reset answers 202 without ever sending anything.
 */
export const authProvidersSchema = z.object({
  mindlogId: z.boolean(),
  google: z.boolean(),
  passwordReset: z.boolean(),
});

export const versionInfoSchema = z.object({
  version: z.string(),
  buildDate: z.string(),
  authProviders: authProvidersSchema,
});
export type VersionInfo = z.infer<typeof versionInfoSchema>;
