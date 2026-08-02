import { z } from 'zod';

/** Per-user storage consumption across the account's large data stores. */
export const storageUsageSchema = z.object({
  /** Bytes of note-page content (HTML + inline base64 images). */
  notesBytes: z.number().int(),
  /** Bytes of task attachments. */
  attachmentsBytes: z.number().int(),
  /** Sum of all tracked stores. */
  totalBytes: z.number().int(),
  /** Notes quota in bytes (USER_NOTES_QUOTA); informational in cloud-hosted mode. */
  quota: z.number().int(),
  /** True when running against the shared cloud deployment. */
  cloudHosted: z.boolean(),
});
export type StorageUsage = z.infer<typeof storageUsageSchema>;
