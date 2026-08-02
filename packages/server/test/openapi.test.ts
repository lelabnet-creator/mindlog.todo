import { taskListQuerySchema, taskSchema } from '@mindlog/core';
import { describe, expect, it } from 'vitest';

import { buildDocument } from '../src/openapi.js';

// These call `buildDocument` directly rather than `getOpenApiDocument()`. The
// public wrapper catches generation failures and serves `{ paths: {} }`, so a
// broken document would look healthy from the outside — which is exactly the
// regression this file exists to catch.

type Doc = {
  paths: Record<string, Record<string, unknown>>;
  components: { schemas: Record<string, { properties?: Record<string, unknown> }> };
};

const v31 = buildDocument('3.1.0') as unknown as Doc;
const v30 = buildDocument('3.0.3') as unknown as Doc;

describe('OpenAPI document', () => {
  it('describes the whole milestone-1 surface, not just tasks', () => {
    expect(Object.keys(v31.paths).length).toBeGreaterThanOrEqual(25);
  });

  it.each([
    '/api/v1/version',
    '/api/v1/events',
    '/api/v1/tasks',
    '/api/v1/tasks/quickadd',
    '/api/v1/projects',
    '/api/v1/projects/{id}',
    '/api/v1/sections',
    '/api/v1/labels',
    '/api/v1/auth/login',
    '/api/v1/auth/refresh',
    '/api/v1/auth/mindlog-id/complete',
  ])('documents %s', (path) => {
    expect(v31.paths[path]).toBeDefined();
  });

  it('describes Task with every field the domain declares', () => {
    // The point of generating from `taskSchema`: a field added to the domain
    // cannot silently stay out of the contract, and out of every client built
    // from it.
    const documented = Object.keys(v31.components.schemas.Task!.properties ?? {}).sort();
    expect(documented).toEqual(Object.keys(taskSchema.shape).sort());
  });

  it('accepts every task-listing filter the server actually parses', () => {
    const params = (v31.paths['/api/v1/tasks']!.get as { parameters?: { name: string }[] })
      .parameters!.map((p) => p.name)
      .sort();
    expect(params).toEqual(Object.keys(taskListQuerySchema.shape).sort());
  });

  it('exposes the SSE stream as text/event-stream', () => {
    const get = v31.paths['/api/v1/events']!.get as {
      responses: { 200: { content: Record<string, unknown> } };
    };
    expect(Object.keys(get.responses[200].content)).toContain('text/event-stream');
  });

  it('emits 3.0-style nullability for code generators', () => {
    // 3.1 writes `type: ["string","null"]`; openapi-generator's Kotlin backend
    // reads that as a plain non-null string, so the 3.0 document is what the
    // Android client generates from.
    const description = v30.components.schemas.Task!.properties!.description as Record<
      string,
      unknown
    >;
    expect(description).toMatchObject({ type: 'string', nullable: true });
    expect(Array.isArray(description.type)).toBe(false);
  });

  it('references named schemas instead of inlining them', () => {
    const post = v31.paths['/api/v1/tasks']!.post as {
      responses: { 201: { content: { 'application/json': { schema: { $ref?: string } } } } };
    };
    expect(post.responses[201].content['application/json'].schema.$ref).toBe(
      '#/components/schemas/Task',
    );
  });

  it('leaves no anonymous object nested inside a named schema', () => {
    // Un objet imbriqué sans `$ref` est publié inline, et openapi-generator lui
    // invente alors un nom tiré du chemin : `DashboardStatsTasksByPriority`,
    // `DrawCleanupRequestShapesInner`. Le défaut est INVISIBLE dans le document
    // — ces noms n'y figurent pas, ils naissent à la génération — et se
    // découvrait jusqu'ici en lisant le Kotlin produit, une génération trop
    // tard. Nommer le schéma dans le domaine ne suffit pas : il doit passer par
    // `ref()` pour atterrir dans `components`.
    const offenders: string[] = [];
    const walk = (node: unknown, path: string): void => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        node.forEach((item, i) => walk(item, `${path}[${i}]`));
        return;
      }
      const obj = node as Record<string, unknown>;
      const nested = path.split('.').length > 2;
      if (nested && obj.type === 'object' && obj.properties && !obj.$ref) offenders.push(path);
      for (const [key, value] of Object.entries(obj)) walk(value, `${path}.${key}`);
    };
    for (const [name, schema] of Object.entries(v30.components.schemas!)) walk(schema, name);

    expect(offenders).toEqual([]);
  });
});
