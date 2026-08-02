import { z } from 'zod';

const colorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'color must be a #rrggbb hex string');

export const filterCreateSchema = z.object({
  name: z.string().min(1).max(200),
  query: z.string().min(1).max(1000),
  color: colorSchema.optional(),
  position: z.number().int().min(0).optional(),
});
export type FilterCreateInput = z.infer<typeof filterCreateSchema>;

export const filterUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  query: z.string().min(1).max(1000).optional(),
  color: colorSchema.nullable().optional(),
  position: z.number().int().min(0).optional(),
});
export type FilterUpdateInput = z.infer<typeof filterUpdateSchema>;

/**
 * Forme renvoyée par l'API. Schéma Zod plutôt qu'interface, comme `projectSchema`
 * ou `labelSchema` : c'est lui que le document OpenAPI référence, et donc lui qui
 * fait naître les DTO des clients générés. Une interface ne peut pas être
 * publiée dans le contrat, et un filtre décrit à la main d'un côté dérive de
 * l'autre sans qu'aucun test n'échoue.
 */
export const filterSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  name: z.string(),
  query: z.string(),
  color: z.string().nullable(),
  position: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Filter = z.infer<typeof filterSchema>;
