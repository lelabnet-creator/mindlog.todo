import { EventEmitter } from 'node:events';

import type { ChangeEvent } from '../domain/change.js';

// In-process change bus. Service write functions emit a lightweight event after a
// successful mutation; the server's SSE endpoint subscribes per user and relays
// it to connected web clients so the UI can refresh — including changes driven by
// the MCP server, since REST and MCP share these same service functions.
//
// The event shape lives in `domain/change.ts` as a schema, so the SSE payload is
// documented by the OpenAPI document rather than described twice.

// One emitter keyed by userId. No cap on listeners — each SSE connection adds one.
const emitter = new EventEmitter();
emitter.setMaxListeners(0);

export function emitChange(userId: string, event: ChangeEvent): void {
  emitter.emit(userId, event);
}

/** Subscribe to a user's change stream. Returns an unsubscribe function. */
export function subscribeChanges(userId: string, fn: (event: ChangeEvent) => void): () => void {
  emitter.on(userId, fn);
  return () => emitter.off(userId, fn);
}
