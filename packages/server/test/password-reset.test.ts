/**
 * Password reset must serve federated accounts too.
 *
 * A Google / mindlog id sign-up has no `password_hash`, and the flow used to
 * return silently for exactly that case — indistinguishable, from the UI, from
 * a broken mailer. The email on file is what the flow trusts, so such an account
 * now gets a link that SETS a first password.
 *
 * The silent return is kept for an unknown address: the route always answers 202
 * and must not become an account-enumeration oracle.
 *
 * SMTP is unconfigured under test, so `sendMail` logs instead of sending; these
 * tests assert on the token in the database and on the rendered copy.
 */
import { createHash } from 'node:crypto';
import { authService, closePool, getPool } from '@mindlog/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ensureSchema, resetDb } from './helpers.js';

/** Register, then strip the password: what an OAuth-only account looks like. */
async function federatedOnlyUser(email: string) {
  const { user } = await authService.register({ email, password: 'password123' });
  await getPool().query(
    "UPDATE users SET password_hash = NULL, mindlog_id_sub = 'idp-sub-1' WHERE id = $1",
    [user.id],
  );
  return user.id;
}

function countResetTokens(userId: string) {
  return getPool()
    .query('SELECT count(*)::int AS n FROM password_reset_tokens WHERE user_id = $1', [userId])
    .then((r) => r.rows[0].n as number);
}

beforeAll(async () => {
  await ensureSchema();
});
beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await closePool();
});

describe('password reset for federated accounts', () => {
  it('issues a token for an account that has no password yet', async () => {
    const userId = await federatedOnlyUser('fed@ex.com');

    await authService.requestPasswordReset('fed@ex.com');

    expect(await countResetTokens(userId)).toBe(1);
  });

  it('still issues a token for a normal local account', async () => {
    const { user } = await authService.register({
      email: 'local@ex.com',
      password: 'password123',
    });

    await authService.requestPasswordReset('local@ex.com');

    expect(await countResetTokens(user.id)).toBe(1);
  });

  it('stays silent for an unknown address (no throw, no token)', async () => {
    await expect(authService.requestPasswordReset('nobody@ex.com')).resolves.toBeUndefined();

    const { rows } = await getPool().query('SELECT count(*)::int AS n FROM password_reset_tokens');
    expect(rows[0].n).toBe(0);
  });

  it('lets a federated account sign in by password once the link is used', async () => {
    const userId = await federatedOnlyUser('fed2@ex.com');

    // No password on file: login must fail before the flow runs.
    await expect(
      authService.login({ email: 'fed2@ex.com', password: 'brand-new-pass' }),
    ).rejects.toThrow();

    // The raw token only ever exists in the email, so plant a known one the same
    // way the service stores it (sha256 hex) instead of reaching into the mailer.
    const token = 'known-test-token';
    await getPool().query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + interval '1 hour')`,
      [userId, createHash('sha256').update(token).digest('hex')],
    );

    await authService.resetPassword(token, 'brand-new-pass');

    await expect(
      authService.login({ email: 'fed2@ex.com', password: 'brand-new-pass' }),
    ).resolves.toMatchObject({ user: { email: 'fed2@ex.com' } });
  });
});
