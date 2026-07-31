/**
 * mindlog id is the identity authority: a session it revoked must not survive
 * here. `refresh()` therefore re-validates federated accounts against the IdP.
 *
 * The three branches matter for different reasons, so all three are covered:
 *  - no connection row  → local/Google accounts must be left completely alone;
 *  - IdP unreachable    → must FAIL OPEN, or an IdP outage signs everyone out;
 *  - IdP says 4xx       → must FAIL CLOSED, and kill *every* token we minted.
 *
 * `refreshMindlogIdToken` goes through global fetch, so the IdP is stubbed there.
 */
import { authService, closePool, getPool } from '@mindlog/core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureSchema, resetDb } from './helpers.js';

const ISSUER = process.env.MINDLOG_ID_ISSUER ?? 'https://id.mindlog.today';
const realFetch = globalThis.fetch;

/** Route the two calls `refreshMindlogIdToken` makes: discovery, then token. */
function stubIdp(tokenResponse: () => Promise<Response> | Response) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('.well-known/openid-configuration')) {
      return new Response(
        JSON.stringify({
          authorization_endpoint: `${ISSUER}/oauth/authorize`,
          token_endpoint: `${ISSUER}/oauth/token`,
          userinfo_endpoint: `${ISSUER}/oauth/userinfo`,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    return tokenResponse();
  }) as typeof fetch;
}

/** A federated user: a real account plus a stored IdP connection. */
async function federatedUser(email: string) {
  const { user, refreshToken } = await authService.register({
    email,
    password: 'password123',
  });
  await getPool().query(
    `INSERT INTO mindlog_id_connections (user_id, access_token, refresh_token, expires_at, scope)
     VALUES ($1, 'idp-access', 'idp-refresh', now() + interval '1 hour', 'openid email')`,
    [user.id],
  );
  return { userId: user.id, refreshToken };
}

function countRefreshTokens(userId: string) {
  return getPool()
    .query('SELECT count(*)::int AS n FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL', [userId])
    .then((r) => r.rows[0].n as number);
}

beforeAll(async () => {
  await ensureSchema();
});
beforeEach(async () => {
  await resetDb();
});
afterEach(() => {
  globalThis.fetch = realFetch;
});
afterAll(async () => {
  await closePool();
});

describe('mindlog id revocation propagates to todo sessions', () => {
  it('leaves a non-federated account alone (no IdP call at all)', async () => {
    const { refreshToken } = await authService.register({
      email: 'local@ex.com',
      password: 'password123',
    });
    const spy = vi.fn();
    globalThis.fetch = spy as unknown as typeof fetch;

    await expect(authService.refresh(refreshToken)).resolves.toMatchObject({
      user: { email: 'local@ex.com' },
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('fails OPEN when the IdP is unreachable — an outage must not sign users out', async () => {
    const { refreshToken } = await federatedUser('down@ex.com');
    stubIdp(() => Promise.reject(new Error('connect ECONNREFUSED')));

    await expect(authService.refresh(refreshToken)).resolves.toMatchObject({
      user: { email: 'down@ex.com' },
    });
  });

  it('fails OPEN on a 5xx too — it says nothing about the session', async () => {
    const { refreshToken } = await federatedUser('five@ex.com');
    stubIdp(() => new Response('boom', { status: 503 }));

    await expect(authService.refresh(refreshToken)).resolves.toBeTruthy();
  });

  it('fails CLOSED on an explicit 4xx and revokes every token of that user', async () => {
    const { userId, refreshToken } = await federatedUser('gone@ex.com');
    // A second session for the same user: revocation must reach it too.
    const second = await authService.login({ email: 'gone@ex.com', password: 'password123' });
    expect(await countRefreshTokens(userId)).toBe(2);

    stubIdp(() => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }));

    await expect(authService.refresh(refreshToken)).rejects.toThrow(/revoked/i);
    expect(await countRefreshTokens(userId)).toBe(0);

    // The other session is dead as well, and the connection row is gone.
    globalThis.fetch = realFetch;
    await expect(authService.refresh(second.refreshToken)).rejects.toThrow();
    const { rows } = await getPool().query(
      'SELECT 1 FROM mindlog_id_connections WHERE user_id = $1',
      [userId],
    );
    expect(rows).toHaveLength(0);
  });
});
