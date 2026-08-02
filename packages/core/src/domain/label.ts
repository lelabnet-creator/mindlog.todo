import { z } from 'zod';

const colorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'color must be a #rrggbb hex string');

export const labelCreateSchema = z.object({
  name: z.string().min(1).max(100),
  color: colorSchema.optional(),
  isFavorite: z.boolean().optional(),
});
export type LabelCreateInput = z.infer<typeof labelCreateSchema>;

export const labelUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: colorSchema.nullable().optional(),
  isFavorite: z.boolean().optional(),
});
export type LabelUpdateInput = z.infer<typeof labelUpdateSchema>;

/** Wire shape of a label. Schema-first so OpenAPI is generated, never retyped. */
export const labelSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  name: z.string(),
  color: z.string().nullable(),
  isFavorite: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Label = z.infer<typeof labelSchema>;
