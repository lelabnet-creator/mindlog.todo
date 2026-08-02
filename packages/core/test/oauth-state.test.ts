/**
 * The OAuth `state` does two jobs, and both are security-relevant.
 *
 * It proves the callback belongs to a round trip we started — until now the
 * value was generated and then never looked at again — and it carries which
 * kind of client is waiting, which is what lets a native app receive its tokens
 * on a custom scheme without the return address ever being caller-supplied.
 */
import { signOAuthState, verifyOAuthState } from '@mindlog/core';
import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';

const SECRET = process.env.JWT_SECRET ?? 'test-secret';

describe('OAuth state', () => {
  it('round-trips the client kind', () => {
    for (const client of ['web', 'native'] as const) {
      const state = verifyOAuthState(signOAuthState({ nonce: 'n-1', client }));
      expect(state).toEqual({ nonce: 'n-1', client });
    }
  });

  it('rejects a state we did not sign', () => {
    // The whole point: before this, any value at all was accepted and turned
    // into a session.
    expect(verifyOAuthState('nimportequoi')).toBeNull();
    expect(verifyOAuthState('')).toBeNull();
  });

  it('rejects a state signed with another key', () => {
    const forged = jwt.sign({ nonce: 'n', client: 'native', purpose: 'oauth-state' }, 'other-key');
    expect(verifyOAuthState(forged)).toBeNull();
  });

  it('rejects a token minted for a different purpose', () => {
    // Our own signing key also signs access tokens and mindlog-id pending
    // tokens; without the purpose check, one could be replayed as the other.
    const accessTokenShaped = jwt.sign({ sub: 'user-1', nonce: 'n' }, SECRET);
    expect(verifyOAuthState(accessTokenShaped)).toBeNull();
  });

  it('rejects an expired state', () => {
    const expired = jwt.sign(
      { nonce: 'n', client: 'web', purpose: 'oauth-state' },
      SECRET,
      { expiresIn: -1 },
    );
    expect(verifyOAuthState(expired)).toBeNull();
  });

  it('treats an unknown client kind as web', () => {
    // Fail towards the SPA: an unrecognised hint must never be read as "send
    // the tokens somewhere else".
    const odd = jwt.sign({ nonce: 'n', client: 'smartwatch', purpose: 'oauth-state' }, SECRET);
    expect(verifyOAuthState(odd)).toEqual({ nonce: 'n', client: 'web' });
  });
});
