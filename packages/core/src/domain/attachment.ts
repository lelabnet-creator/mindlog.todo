import { z } from 'zod';

export const attachmentCreateSchema = z.object({
  filename: z.string().min(1).max(255),
  mime: z.string().max(255).optional(),
  /** Extracted text content; folded into the task embedding for RAG. */
  content: z.string().max(500_000).default(''),
});
export type AttachmentCreateInput = z.infer<typeof attachmentCreateSchema>;

/**
 * `content` n'est présent QUE sur la lecture d'une pièce jointe précise : le
 * texte extrait peut peser 500 ko, l'inclure dans une liste la rendrait
 * inutilisable. Optionnel plutôt que deux schémas distincts — c'est ce que le
 * serveur renvoie réellement, et un type union se propagerait à tout le dépôt
 * pour décrire une différence d'une seule clé.
 */
export const attachmentSchema = z.object({
  id: z.uuid(),
  taskId: z.uuid(),
  userId: z.uuid(),
  filename: z.string(),
  mime: z.string().nullable(),
  byteSize: z.number().int(),
  createdAt: z.string(),
  content: z.string().optional(),
});
export type Attachment = z.infer<typeof attachmentSchema>;
