import { z } from 'zod';

export const registerSchema = z.object({
  email: z.email().max(320),
  password: z.string().min(8).max(200),
  displayName: z.string().max(200).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.email().max(320),
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

export const forgotPasswordSchema = z.object({
  email: z.email().max(320),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(200),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const apiKeyCreateSchema = z.object({
  name: z.string().max(200).optional(),
});
export type ApiKeyCreateInput = z.infer<typeof apiKeyCreateSchema>;

// "Sign in with mindlog id" can return a profile without an email (mindlog
// accounts are handle-based; the recovery email is optional). In that case the
// callback hands the SPA a short-lived pending token and we ask the user for an
// email to finish creating/linking their todo account.
export const completeMindlogIdSchema = z.object({
  pendingToken: z.string().min(1),
  email: z.email().max(320),
});
export type CompleteMindlogIdInput = z.infer<typeof completeMindlogIdSchema>;

/** Wire shape of a user. Schema-first so OpenAPI is generated, never retyped. */
export const userSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  googleSub: z.string().nullable(),
  mindlogIdSub: z.string().nullable(),
  createdAt: z.string(),
});
export type User = z.infer<typeof userSchema>;

// Local profile edits (display name + avatar). Avatar accepts an http(s) URL or
// a small data: URL (local upload), capped to keep the users row reasonable.
export const profileUpdateSchema = z.object({
  displayName: z.string().max(200).nullable().optional(),
  avatarUrl: z
    .string()
    .max(1_500_000)
    .refine((v) => /^https?:\/\//.test(v) || /^data:image\//.test(v), {
      message: 'avatarUrl must be an http(s) URL or a data:image/ URL',
    })
    .nullable()
    .optional(),
});
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

export const apiKeySchema = z.object({
  id: z.uuid(),
  name: z.string().nullable(),
  prefix: z.string(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
});
export type ApiKey = z.infer<typeof apiKeySchema>;

/**
 * Wire shape of POST /api-keys. The secret is returned exactly once, at
 * creation — only its hash is stored, so it can never be shown again.
 *
 * Deliberately a distinct type rather than an optional field on `ApiKey`: with
 * `secret?` on the base type, listing keys would suggest a secret might be
 * present when it never is. The web client used to declare it that way, which
 * is how it type-checked against a shape core never described.
 */
export const apiKeyCreatedSchema = apiKeySchema.extend({ secret: z.string() });
export type ApiKeyCreated = z.infer<typeof apiKeyCreatedSchema>;

export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  /** Access-token lifetime in seconds. */
  expiresIn: z.number().int(),
});
export type AuthTokens = z.infer<typeof authTokensSchema>;

export const authResultSchema = authTokensSchema.extend({ user: userSchema });
export type AuthResult = z.infer<typeof authResultSchema>;
