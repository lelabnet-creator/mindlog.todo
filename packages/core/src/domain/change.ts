import { z } from 'zod';

export const CHANGE_ENTITIES = ['task', 'project', 'section', 'label', 'filter'] as const;
export type ChangeEntity = (typeof CHANGE_ENTITIES)[number];

export const CHANGE_ACTIONS = ['create', 'update', 'delete'] as const;
export type ChangeAction = (typeof CHANGE_ACTIONS)[number];

/**
 * What the SSE endpoint pushes after a successful mutation.
 *
 * An *invalidation signal*, not a delta: it says which kind of thing changed,
 * never what it became. Clients re-read; there is no `changedSince` cursor and
 * no tombstone to reconcile against.
 */
export const changeEventSchema = z.object({
  entity: z.enum(CHANGE_ENTITIES),
  action: z.enum(CHANGE_ACTIONS),
  id: z.uuid().optional(),
});
export type ChangeEvent = z.infer<typeof changeEventSchema>;
