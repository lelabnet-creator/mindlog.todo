import { z } from 'zod';

const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'color must be #rrggbb');

export const notebookCreateSchema = z.object({
  name: z.string().min(1).max(200),
  color: colorSchema.optional(),
});
export type NotebookCreateInput = z.infer<typeof notebookCreateSchema>;

export const notebookUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  color: colorSchema.nullable().optional(),
});
export type NotebookUpdateInput = z.infer<typeof notebookUpdateSchema>;

// Content can embed pasted images as base64 data URLs, so allow a generous size.
const PAGE_CONTENT_MAX = 12_000_000;

/** Total notes content allowed per user across all pages (100 MB, UTF-8 bytes). */
export const USER_NOTES_QUOTA = 100 * 1024 * 1024;

export const pageCreateSchema = z.object({
  title: z.string().max(300).optional(),
  content: z.string().max(PAGE_CONTENT_MAX).optional(),
  inRag: z.boolean().optional(),
});
export type PageCreateInput = z.infer<typeof pageCreateSchema>;

export const pageUpdateSchema = z.object({
  title: z.string().max(300).optional(),
  content: z.string().max(PAGE_CONTENT_MAX).optional(),
  position: z.number().int().min(0).optional(),
  inRag: z.boolean().optional(),
  color: colorSchema.nullable().optional(),
});
export type PageUpdateInput = z.infer<typeof pageUpdateSchema>;

/**
 * Formes renvoyées par l'API. Schémas Zod plutôt qu'interfaces, comme
 * `projectSchema` : seuls les schémas atteignent le document OpenAPI, et donc
 * les DTO des clients générés.
 */
export const notebookSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  name: z.string(),
  color: z.string().nullable(),
  position: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Notebook = z.infer<typeof notebookSchema>;

/**
 * Le résumé est la forme de RÉFÉRENCE, la page complète en est l'extension.
 * Dans l'autre sens — un `Omit<NotePage, 'content'>` — le contrat publierait
 * deux objets sans lien visible, et les générateurs en tireraient deux classes
 * dont rien ne dirait que l'une est l'autre sans son contenu.
 */
export const notePageSummarySchema = z.object({
  id: z.uuid(),
  notebookId: z.uuid(),
  userId: z.uuid(),
  title: z.string(),
  position: z.number().int(),
  inRag: z.boolean(),
  color: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type NotePageSummary = z.infer<typeof notePageSummarySchema>;

export const notePageSchema = notePageSummarySchema.extend({
  content: z.string(),
});
export type NotePage = z.infer<typeof notePageSchema>;

/** Résultat de recherche : un résumé plus son score de pertinence. */
export const notePageHitSchema = notePageSummarySchema.extend({
  score: z.number(),
});
export type NotePageHit = z.infer<typeof notePageHitSchema>;

/**
 * Corps et réponses des routes de notes.
 *
 * Ils vivaient dans `rest/notes.routes.ts`, hors de portée du document OpenAPI
 * qui ne lit que ce module : le contrat ne pouvait donc pas les décrire. Les
 * remonter ici donne UNE définition qui sert à la fois de parseur, de contrat et
 * de DTO généré.
 */
export const noteSearchSchema = z.object({
  query: z.string().min(1),
  k: z.coerce.number().int().min(1).max(50).default(10),
  notebookIds: z.array(z.uuid()).optional(),
});
export type NoteSearchInput = z.infer<typeof noteSearchSchema>;

export const drawShapeSchema = z.object({
  type: z.string(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  stroke: z.string().optional(),
  fill: z.string().optional(),
  fillStyle: z.string().optional(),
  text: z.string().optional(),
});

export const drawCleanupSchema = z.object({
  shapes: z.array(drawShapeSchema).min(1),
  /** What to make of the sketch, e.g. "clean schema", "bar chart", "flowchart". */
  instruction: z.string().max(200).optional(),
  width: z.number().positive().max(4000),
  height: z.number().positive().max(4000),
});

export const drawCleanupResultSchema = z.object({ svg: z.string() });

/** Tâches PROPOSÉES par le modèle : un aperçu, rien n'est créé côté serveur. */
export const extractedTasksSchema = z.object({ tasks: z.array(z.string()) });

export const notebookRagSchema = z.object({ inRag: z.boolean() });
export const notebookRagResultSchema = z.object({ updated: z.number().int() });

/** Plain-text of a page (title + de-HTML'd box content) for embedding. */
export function notePageText(title: string, content: string): string {
  const strip = (html: string) =>
    html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
  let body = '';
  try {
    const parsed = JSON.parse(content) as { boxes?: { html: string }[]; markdown?: string };
    const parts: string[] = [];
    if (Array.isArray(parsed.boxes)) parts.push(parsed.boxes.map((b) => strip(b.html)).join('\n'));
    // Raw-text mode stores plain CommonMark; index it as-is.
    if (typeof parsed.markdown === 'string' && parsed.markdown.trim()) parts.push(parsed.markdown);
    body = parts.length ? parts.join('\n') : strip(content);
  } catch {
    body = strip(content);
  }
  return [title, body].filter(Boolean).join('\n').trim();
}
