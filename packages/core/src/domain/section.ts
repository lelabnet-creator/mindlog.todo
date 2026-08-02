import { z } from 'zod';

export const sectionCreateSchema = z.object({
  projectId: z.uuid(),
  name: z.string().min(1).max(200),
  position: z.number().int().min(0).optional(),
});
export type SectionCreateInput = z.infer<typeof sectionCreateSchema>;

export const sectionUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  position: z.number().int().min(0).optional(),
});
export type SectionUpdateInput = z.infer<typeof sectionUpdateSchema>;

/** Wire shape of a section. Schema-first so OpenAPI is generated, never retyped. */
export const sectionSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  name: z.string(),
  position: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Section = z.infer<typeof sectionSchema>;
