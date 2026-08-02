import {
  apiKeyCreateSchema,
  apiKeyCreatedSchema,
  apiKeySchema,
  authTokensSchema,
  changeEventSchema,
  completeMindlogIdSchema,
  config,
  filterCreateSchema,
  filterSchema,
  filterUpdateSchema,
  forgotPasswordSchema,
  labelCreateSchema,
  labelSchema,
  labelUpdateSchema,
  loginSchema,
  profileUpdateSchema,
  projectCreateSchema,
  projectSchema,
  projectUpdateSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  sectionCreateSchema,
  sectionSchema,
  sectionUpdateSchema,
  taskAskResultSchema,
  taskAskSchema,
  taskCreateSchema,
  taskQuickAddSchema,
  taskSchema,
  taskSearchHitSchema,
  taskSearchSchema,
  taskUpdateSchema,
  userSchema,
  versionInfoSchema,
  TASK_STATUSES,
} from '@mindlog/core';
import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  OpenApiGeneratorV31,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

/**
 * Name a schema so it lands in `components/schemas` and is referenced by `$ref`.
 *
 * The `.clone()` is load-bearing, not cosmetic. `extendZodWithOpenApi` patches
 * the Zod class prototypes at call time, so only schemas *constructed after* it
 * runs get an `.openapi()` method — and everything imported from `@mindlog/core`
 * is constructed earlier, since the ESM graph loads core first. Calling
 * `.openapi()` on one of those throws `zodSchema.openapi is not a function`,
 * which `getOpenApiDocument()` would then swallow into an empty document. A
 * clone is rebuilt through the patched constructor and behaves.
 */
const ref = <T extends z.ZodType>(name: string, schema: T): T =>
  (schema as unknown as { clone(): T }).clone().openapi(name) as T;

/** Shape produced by the error handler (`middleware/errors.ts`). */
const errorSchema = z
  .object({ error: z.string(), message: z.string(), details: z.array(z.any()).optional() })
  .openapi('Error');

/**
 * Documentation shape of the task-listing query.
 *
 * `taskListQuerySchema` itself is a *parser*: it leans on `z.coerce` and
 * `z.preprocess` to turn query strings into dates and booleans, and those wrap
 * their inner type in a way OpenAPI cannot express. Describing the accepted
 * wire values is the honest translation — the field list is what must not
 * drift, and `test/openapi.test.ts` asserts it matches the parser key for key.
 */
const taskListQueryDocSchema = z.object({
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.number().int().min(1).max(4).optional(),
  assignee: z.string().optional(),
  parentId: z.uuid().optional(),
  projectId: z.uuid().optional(),
  sectionId: z.uuid().optional(),
  labelId: z.uuid().optional(),
  dueBefore: z.string().optional(),
  dueAfter: z.string().optional(),
  overdue: z.boolean().optional(),
  noDate: z.boolean().optional(),
  completed: z.boolean().optional().describe('true → only completed; false → only open'),
  root: z.boolean().optional(),
  tree: z.boolean().optional(),
  limit: z.number().int().min(1).max(200).optional().describe('Default 50, max 200.'),
  offset: z.number().int().min(0).optional(),
});

/** Same, for `GET /projects?includeArchived=`. */
const projectListQueryDocSchema = z.object({
  includeArchived: z.boolean().optional(),
});

function buildDocument(version: '3.1.0' | '3.0.3') {
  const r = new OpenAPIRegistry();

  r.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    description: 'JWT access token, or an API key (`mlt_…`).',
  });

  const json = (schema: z.ZodType) => ({ content: { 'application/json': { schema } } });
  const secured = [{ bearerAuth: [] as string[] }];

  const Task = ref('Task', taskSchema);
  const TaskHit = ref('TaskSearchHit', taskSearchHitSchema);
  const Project = ref('Project', projectSchema);
  const Section = ref('Section', sectionSchema);
  const Label = ref('Label', labelSchema);
  const Filter = ref('Filter', filterSchema);
  const User = ref('User', userSchema);
  const ApiKey = ref('ApiKey', apiKeySchema);
  const ApiKeyCreated = ref('ApiKeyCreated', apiKeyCreatedSchema);
  // Composed from the named parts rather than passed straight through.
  // `.openapi()` metadata lives on a schema *instance*, and `authResultSchema`
  // holds the raw `userSchema`, not the clone named above — so passing it
  // as-is inlines a second, anonymous copy of User into the document, and code
  // generators dutifully emit an `AuthResultUser` class beside `User`.
  const AuthResult = ref('AuthResult', authTokensSchema.extend({ user: User }));
  const AskResult = ref('AskResult', taskAskResultSchema.extend({ sources: z.array(Task) }));
  const ChangeEvent = ref('ChangeEvent', changeEventSchema);
  const VersionInfo = ref('VersionInfo', versionInfoSchema);

  // Request bodies are named too. Left anonymous they are still *correct*, but
  // generators fall back to the path — `ApiV1AuthLoginPostRequest` — and every
  // client ends up with a class nobody would have chosen to write.
  const Login = ref('LoginRequest', loginSchema);
  const Register = ref('RegisterRequest', registerSchema);
  const Refresh = ref('RefreshRequest', refreshSchema);
  const ForgotPassword = ref('ForgotPasswordRequest', forgotPasswordSchema);
  const ResetPassword = ref('ResetPasswordRequest', resetPasswordSchema);
  const CompleteMindlogId = ref('CompleteMindlogIdRequest', completeMindlogIdSchema);
  const ApiKeyCreate = ref('ApiKeyCreateRequest', apiKeyCreateSchema);
  const ProfileUpdate = ref('ProfileUpdateRequest', profileUpdateSchema);
  const TaskCreate = ref('TaskCreateRequest', taskCreateSchema);
  const TaskUpdate = ref('TaskUpdateRequest', taskUpdateSchema);
  const TaskQuickAdd = ref('TaskQuickAddRequest', taskQuickAddSchema);
  const TaskSearch = ref('TaskSearchRequest', taskSearchSchema);
  const TaskAsk = ref('TaskAskRequest', taskAskSchema);
  const ProjectCreate = ref('ProjectCreateRequest', projectCreateSchema);
  const ProjectUpdate = ref('ProjectUpdateRequest', projectUpdateSchema);
  const SectionCreate = ref('SectionCreateRequest', sectionCreateSchema);
  const SectionUpdate = ref('SectionUpdateRequest', sectionUpdateSchema);
  const LabelCreate = ref('LabelCreateRequest', labelCreateSchema);
  const LabelUpdate = ref('LabelUpdateRequest', labelUpdateSchema);
  const FilterCreate = ref('FilterCreateRequest', filterCreateSchema);
  const FilterUpdate = ref('FilterUpdateRequest', filterUpdateSchema);

  const id = z.object({ id: z.string() });
  const notFound = { description: 'Not found', ...json(errorSchema) };

  // --- meta -------------------------------------------------------------

  r.registerPath({
    method: 'get', path: '/api/v1/version', tags: ['meta'],
    summary: 'Deployment version and which sign-in paths are configured',
    responses: { 200: { description: 'OK', ...json(VersionInfo) } },
  });

  // --- auth -------------------------------------------------------------

  r.registerPath({
    method: 'post', path: '/api/v1/auth/register', tags: ['auth'],
    request: { body: json(Register) },
    responses: { 201: { description: 'Created', ...json(AuthResult) }, 409: { description: 'Email taken', ...json(errorSchema) } },
  });
  r.registerPath({
    method: 'post', path: '/api/v1/auth/login', tags: ['auth'],
    request: { body: json(Login) },
    responses: { 200: { description: 'OK', ...json(AuthResult) }, 401: { description: 'Invalid', ...json(errorSchema) } },
  });
  r.registerPath({
    method: 'post', path: '/api/v1/auth/refresh', tags: ['auth'],
    summary: 'Exchange a refresh token for a new pair',
    description: 'The refresh token is rotated: the one sent is invalidated. Two concurrent refreshes with the same token will lose one.',
    request: { body: json(Refresh) },
    responses: { 200: { description: 'OK', ...json(AuthResult) }, 401: { description: 'Expired or already used', ...json(errorSchema) } },
  });
  r.registerPath({
    method: 'post', path: '/api/v1/auth/logout', tags: ['auth'],
    request: { body: json(Refresh) },
    responses: { 204: { description: 'No content' } },
  });
  r.registerPath({
    method: 'post', path: '/api/v1/auth/forgot-password', tags: ['auth'],
    request: { body: json(ForgotPassword) },
    responses: { 202: { description: 'Always 202 — never reveals whether the email exists' } },
  });
  r.registerPath({
    method: 'post', path: '/api/v1/auth/reset-password', tags: ['auth'],
    request: { body: json(ResetPassword) },
    responses: { 204: { description: 'No content' } },
  });

  // mindlog id — a browser redirect flow. Documented so native clients know the
  // shape of the round trip; they cannot call these with fetch/XHR.
  r.registerPath({
    method: 'get', path: '/api/v1/auth/mindlog-id', tags: ['auth'],
    summary: 'Start the mindlog id sign-in redirect',
    request: {
      query: z.object({
        create: z.enum(['1']).optional().describe('Open mindlog id on signup rather than sign-in.'),
      }),
    },
    responses: { 302: { description: 'Redirect to mindlog id' }, 503: { description: 'Not configured', ...json(errorSchema) } },
  });
  r.registerPath({
    method: 'get', path: '/api/v1/auth/mindlog-id/callback', tags: ['auth'],
    summary: 'mindlog id return leg',
    description:
      'Redirects to the client with the tokens in the URL **fragment** ' +
      '(`#access_token=…&refresh_token=…&expires_in=…`), or `#mindlog_id_pending=…` ' +
      'when the account has no email and one must be collected.',
    request: { query: z.object({ code: z.string(), state: z.string() }) },
    responses: { 302: { description: 'Redirect back to the client' } },
  });
  r.registerPath({
    method: 'post', path: '/api/v1/auth/mindlog-id/complete', tags: ['auth'],
    summary: 'Finish a mindlog id sign-in that lacked an email',
    request: { body: json(CompleteMindlogId) },
    responses: { 200: { description: 'OK', ...json(AuthResult) } },
  });

  // --- account ----------------------------------------------------------

  r.registerPath({
    method: 'get', path: '/api/v1/me', tags: ['account'], security: secured,
    responses: { 200: { description: 'OK', ...json(User) } },
  });
  r.registerPath({
    method: 'patch', path: '/api/v1/me', tags: ['account'], security: secured,
    request: { body: json(ProfileUpdate) },
    responses: { 200: { description: 'OK', ...json(User) } },
  });
  r.registerPath({
    method: 'get', path: '/api/v1/api-keys', tags: ['account'], security: secured,
    responses: { 200: { description: 'OK', ...json(z.array(ApiKey)) } },
  });
  r.registerPath({
    method: 'post', path: '/api/v1/api-keys', tags: ['account'], security: secured,
    request: { body: json(ApiKeyCreate) },
    responses: { 201: { description: 'Created (secret shown once)', ...json(ApiKeyCreated) } },
  });
  r.registerPath({
    method: 'delete', path: '/api/v1/api-keys/{id}', tags: ['account'], security: secured,
    request: { params: id },
    responses: { 204: { description: 'Revoked' } },
  });

  // --- tasks ------------------------------------------------------------

  r.registerPath({
    method: 'post', path: '/api/v1/tasks', tags: ['tasks'], security: secured,
    request: { body: json(TaskCreate) },
    responses: { 201: { description: 'Created', ...json(Task) } },
  });
  r.registerPath({
    method: 'get', path: '/api/v1/tasks', tags: ['tasks'], security: secured,
    request: { query: taskListQueryDocSchema },
    responses: { 200: { description: 'OK', ...json(z.array(Task)) } },
  });
  r.registerPath({
    method: 'post', path: '/api/v1/tasks/quickadd', tags: ['tasks'], security: secured,
    summary: 'Create a task from one line of natural language',
    description: 'Parses dates, `#project`, `@label` and `p1`–`p4` server-side. Clients should not reimplement this.',
    request: { body: json(TaskQuickAdd) },
    responses: { 201: { description: 'Created', ...json(Task) } },
  });
  r.registerPath({
    method: 'post', path: '/api/v1/tasks/search', tags: ['tasks'], security: secured,
    request: { body: json(TaskSearch) },
    responses: { 200: { description: 'OK', ...json(z.array(TaskHit)) } },
  });
  r.registerPath({
    method: 'post', path: '/api/v1/tasks/ask', tags: ['tasks'], security: secured,
    request: { body: json(TaskAsk) },
    responses: { 200: { description: 'OK', ...json(AskResult) } },
  });
  r.registerPath({
    method: 'get', path: '/api/v1/tasks/{id}', tags: ['tasks'], security: secured,
    request: { params: id, query: z.object({ withChildren: z.boolean().optional() }) },
    responses: { 200: { description: 'OK', ...json(Task) }, 404: notFound },
  });
  r.registerPath({
    method: 'patch', path: '/api/v1/tasks/{id}', tags: ['tasks'], security: secured,
    request: { params: id, body: json(TaskUpdate) },
    responses: { 200: { description: 'OK', ...json(Task) }, 404: notFound },
  });
  r.registerPath({
    method: 'delete', path: '/api/v1/tasks/{id}', tags: ['tasks'], security: secured,
    request: { params: id },
    responses: { 204: { description: 'Deleted' } },
  });
  r.registerPath({
    method: 'get', path: '/api/v1/tasks/{id}/subtasks', tags: ['tasks'], security: secured,
    request: { params: id },
    responses: { 200: { description: 'OK', ...json(z.array(Task)) } },
  });
  r.registerPath({
    method: 'post', path: '/api/v1/tasks/{id}/subtasks', tags: ['tasks'], security: secured,
    request: { params: id, body: json(TaskCreate) },
    responses: { 201: { description: 'Created', ...json(Task) } },
  });

  // --- projects ---------------------------------------------------------

  r.registerPath({
    method: 'get', path: '/api/v1/projects', tags: ['projects'], security: secured,
    request: { query: projectListQueryDocSchema },
    responses: { 200: { description: 'OK', ...json(z.array(Project)) } },
  });
  r.registerPath({
    method: 'post', path: '/api/v1/projects', tags: ['projects'], security: secured,
    request: { body: json(ProjectCreate) },
    responses: { 201: { description: 'Created', ...json(Project) } },
  });
  r.registerPath({
    method: 'get', path: '/api/v1/projects/{id}', tags: ['projects'], security: secured,
    request: { params: id },
    responses: { 200: { description: 'OK', ...json(Project) }, 404: notFound },
  });
  r.registerPath({
    method: 'patch', path: '/api/v1/projects/{id}', tags: ['projects'], security: secured,
    request: { params: id, body: json(ProjectUpdate) },
    responses: { 200: { description: 'OK', ...json(Project) }, 404: notFound },
  });
  r.registerPath({
    method: 'delete', path: '/api/v1/projects/{id}', tags: ['projects'], security: secured,
    request: { params: id },
    responses: { 204: { description: 'Deleted' } },
  });

  // --- sections ---------------------------------------------------------

  r.registerPath({
    method: 'get', path: '/api/v1/sections', tags: ['sections'], security: secured,
    request: { query: z.object({ projectId: z.uuid() }) },
    responses: { 200: { description: 'OK', ...json(z.array(Section)) }, 400: { description: 'projectId is required', ...json(errorSchema) } },
  });
  r.registerPath({
    method: 'post', path: '/api/v1/sections', tags: ['sections'], security: secured,
    request: { body: json(SectionCreate) },
    responses: { 201: { description: 'Created', ...json(Section) } },
  });
  r.registerPath({
    method: 'patch', path: '/api/v1/sections/{id}', tags: ['sections'], security: secured,
    request: { params: id, body: json(SectionUpdate) },
    responses: { 200: { description: 'OK', ...json(Section) }, 404: notFound },
  });
  r.registerPath({
    method: 'delete', path: '/api/v1/sections/{id}', tags: ['sections'], security: secured,
    request: { params: id },
    responses: { 204: { description: 'Deleted' } },
  });

  // --- labels -----------------------------------------------------------

  r.registerPath({
    method: 'get', path: '/api/v1/labels', tags: ['labels'], security: secured,
    responses: { 200: { description: 'OK', ...json(z.array(Label)) } },
  });
  r.registerPath({
    method: 'post', path: '/api/v1/labels', tags: ['labels'], security: secured,
    request: { body: json(LabelCreate) },
    responses: { 201: { description: 'Created', ...json(Label) } },
  });
  r.registerPath({
    method: 'get', path: '/api/v1/labels/{id}', tags: ['labels'], security: secured,
    request: { params: id },
    responses: { 200: { description: 'OK', ...json(Label) }, 404: notFound },
  });
  r.registerPath({
    method: 'patch', path: '/api/v1/labels/{id}', tags: ['labels'], security: secured,
    request: { params: id, body: json(LabelUpdate) },
    responses: { 200: { description: 'OK', ...json(Label) }, 404: notFound },
  });
  r.registerPath({
    method: 'delete', path: '/api/v1/labels/{id}', tags: ['labels'], security: secured,
    request: { params: id },
    responses: { 204: { description: 'Deleted' } },
  });

  // --- filters ----------------------------------------------------------
  // Vues enregistrées : un filtre est un NOM sur une requête, et `/tasks` est
  // la seule route qui l'exécute. Les clients ne rejouent donc pas la syntaxe de
  // requête eux-mêmes — c'est le serveur qui l'interprète.

  r.registerPath({
    method: 'get', path: '/api/v1/filters', tags: ['filters'], security: secured,
    responses: { 200: { description: 'OK', ...json(z.array(Filter)) } },
  });
  r.registerPath({
    method: 'post', path: '/api/v1/filters', tags: ['filters'], security: secured,
    request: { body: json(FilterCreate) },
    responses: { 201: { description: 'Created', ...json(Filter) } },
  });
  r.registerPath({
    method: 'get', path: '/api/v1/filters/{id}', tags: ['filters'], security: secured,
    request: { params: id },
    responses: { 200: { description: 'OK', ...json(Filter) }, 404: notFound },
  });
  r.registerPath({
    method: 'get', path: '/api/v1/filters/{id}/tasks', tags: ['filters'], security: secured,
    summary: 'Run a saved filter and return the matching tasks',
    request: { params: id },
    responses: { 200: { description: 'OK', ...json(z.array(Task)) }, 404: notFound },
  });
  r.registerPath({
    method: 'patch', path: '/api/v1/filters/{id}', tags: ['filters'], security: secured,
    request: { params: id, body: json(FilterUpdate) },
    responses: { 200: { description: 'OK', ...json(Filter) }, 404: notFound },
  });
  r.registerPath({
    method: 'delete', path: '/api/v1/filters/{id}', tags: ['filters'], security: secured,
    request: { params: id },
    responses: { 204: { description: 'Deleted' } },
  });

  // --- events -----------------------------------------------------------

  r.registerPath({
    method: 'get', path: '/api/v1/events', tags: ['events'], security: secured,
    summary: 'Server-Sent Events stream of data changes',
    description:
      'Each `data:` frame is a ChangeEvent — an **invalidation signal, not a delta**. ' +
      'It says what kind of thing changed, never what it became, so clients re-read. ' +
      'There is no `changedSince` cursor and no tombstone. ' +
      'The stream opens with `retry: 3000` and sends a `: ping` comment every 25s. ' +
      'Note that `EventSource` cannot carry an `Authorization` header — read the body as a stream instead.',
    responses: {
      200: {
        description: 'An open event stream',
        content: { 'text/event-stream': { schema: ChangeEvent } },
      },
    },
  });

  const generator =
    version === '3.1.0' ? new OpenApiGeneratorV31(r.definitions) : new OpenApiGeneratorV3(r.definitions);

  return generator.generateDocument({
    openapi: version,
    info: {
      title: 'mindlog.todo API',
      version: '0.0.0',
      description: 'Task management REST API. The same service core also backs the MCP server.',
      license: { name: 'AGPL-3.0-or-later', url: 'https://www.gnu.org/licenses/agpl-3.0.html' },
    },
    servers: [{ url: config.publicUrl }],
  });
}

/** Build the OpenAPI document, falling back to a minimal stub if generation fails. */
export function getOpenApiDocument(): object {
  try {
    return buildDocument('3.1.0');
  } catch (err) {
    console.error('[openapi] generation failed, serving minimal document:', err);
    return {
      openapi: '3.1.0',
      info: { title: 'mindlog.todo API', version: '0.0.0' },
      paths: {},
    };
  }
}

/**
 * Same contract emitted as OpenAPI 3.0.3, for code generators.
 *
 * 3.1 expresses a nullable string as `type: ["string", "null"]`; most
 * generators — openapi-generator's Kotlin one among them — only understand
 * 3.0's `nullable: true` and silently produce a non-null type from it.
 */
export function getOpenApiDocumentV30(): object {
  try {
    return buildDocument('3.0.3');
  } catch (err) {
    console.error('[openapi] 3.0 generation failed, serving minimal document:', err);
    return { openapi: '3.0.3', info: { title: 'mindlog.todo API', version: '0.0.0' }, paths: {} };
  }
}

/** Exposed for tests: throws instead of falling back, so a regression is loud. */
export { buildDocument };
