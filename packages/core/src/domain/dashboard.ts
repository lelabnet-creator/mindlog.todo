import { z } from 'zod';
import { karmaSchema } from './karma.js';

// Les blocs sont nommés séparément : imbriqués anonymement, ils ressortiraient
// du générateur en `DashboardStatsTasksInner` et consorts.
export const dashboardPriorityCountsSchema = z.object({
  p1: z.number().int(),
  p2: z.number().int(),
  p3: z.number().int(),
  p4: z.number().int(),
});

export const dashboardTaskStatsSchema = z.object({
  total: z.number().int(),
  active: z.number().int(),
  completed: z.number().int(),
  overdue: z.number().int(),
  dueToday: z.number().int(),
  completedThisWeek: z.number().int(),
  /** 0..100, completed / total */
  completionRate: z.number(),
  byPriority: dashboardPriorityCountsSchema,
});

export const dashboardNoteStatsSchema = z.object({
  notebooks: z.number().int(),
  pages: z.number().int(),
  /** Pages opted into the RAG (the rest are invisible to semantic "Ask AI"). */
  ragPages: z.number().int(),
  storageBytes: z.number().int(),
  storageQuota: z.number().int(),
});

export const dashboardTrendPointSchema = z.object({
  date: z.string(),
  count: z.number().int(),
});

/** Aggregated KPIs for the Dashboard view (task management + note-taking). */
export const dashboardStatsSchema = z.object({
  tasks: dashboardTaskStatsSchema,
  notes: dashboardNoteStatsSchema,
  /** Tasks completed per day over the last 14 days (for the trend chart). */
  completedTrend: z.array(dashboardTrendPointSchema),
  karma: karmaSchema.nullable(),
});
export type DashboardStats = z.infer<typeof dashboardStatsSchema>;
