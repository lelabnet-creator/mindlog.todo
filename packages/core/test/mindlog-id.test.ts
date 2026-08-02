import { afterEach, describe, expect, it, vi } from 'vitest';
import { getMindlogIdAuthUrl, hasAgendaScope, MINDLOG_ID_AGENDA_SCOPE } from '../src/auth/mindlog-id.js';

describe('getMindlogIdAuthUrl', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  /** Discovery is the only network call this builder makes. */
  function stubDiscovery() {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            authorization_endpoint: 'https://idp.example/oauth/authorize',
            token_endpoint: 'https://idp.example/oauth/token',
            userinfo_endpoint: 'https://idp.example/oauth/userinfo',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    ) as typeof fetch;
  }

  it('asks mindlog id for its signup screen when creating an account', async () => {
    stubDiscovery();
    const url = new URL(await getMindlogIdAuthUrl('st4te', { create: true }));
    expect(url.searchParams.get('prompt')).toBe('create');
    // The hint changes which IdP screen comes first, nothing else.
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('state')).toBe('st4te');
  });

  it('omits the hint when signing in', async () => {
    stubDiscovery();
    const url = new URL(await getMindlogIdAuthUrl('st4te'));
    expect(url.searchParams.has('prompt')).toBe(false);
  });
});

describe('hasAgendaScope', () => {
  it('detects the agenda scope among granted scopes', () => {
    expect(hasAgendaScope('openid email profile mindlog:agenda')).toBe(true);
    expect(hasAgendaScope(MINDLOG_ID_AGENDA_SCOPE)).toBe(true);
  });

  it('is false when the agenda scope was not granted', () => {
    expect(hasAgendaScope('openid email profile mindlog:relations')).toBe(false);
    expect(hasAgendaScope('')).toBe(false);
  });

  it('does not match a scope that merely contains the substring', () => {
    expect(hasAgendaScope('mindlog:agenda-readonly')).toBe(false);
  });
});
