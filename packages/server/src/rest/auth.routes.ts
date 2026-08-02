import { randomUUID } from 'node:crypto';
import {
  authService,
  completeMindlogIdSchema,
  config,
  forgotPasswordSchema,
  googleEnabled,
  loginSchema,
  mindlogIdEnabled,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  ServiceUnavailable,
  signOAuthState,
  Unauthorized,
  verifyOAuthState,
  type AuthResult,
} from '@mindlog/core';
import { Router, type Response } from 'express';

export const authRouter: Router = Router();

/**
 * Hands a native client back to its app.
 *
 * NOT a 302: a redirect whose target is an app scheme is honoured only under
 * gesture rules that differ per browser — Brave leaves the tab spinning on a
 * navigation that never resolves, and the app is never opened (seen on gra01,
 * 2026-08-02: tokens issued server-side, phone stuck on the consent page). The
 * automatic hop is attempted first, and a button covers the case where the
 * browser wants an explicit gesture.
 *
 * The URL carries the tokens in its FRAGMENT, so they never reach a server log
 * or a Referer; `no-store` and `no-referrer` keep the bounce page itself out of
 * caches and referrers.
 */
function nativeHandoff(res: Response, target: string): void {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  res.set('Cache-Control', 'no-store');
  res.set('Referrer-Policy', 'no-referrer');
  res.type('html').send(
    `<!doctype html><html lang="fr"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>Retour à mindlog.todo</title><style>` +
      `body{margin:0;min-height:100vh;display:grid;place-items:center;background:#111214;color:#e8e6e3;` +
      `font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;text-align:center;padding:1.5rem}` +
      `a{display:inline-block;margin-top:1.5rem;padding:.85rem 1.75rem;border-radius:12px;` +
      `background:#edba6e;color:#1a1206;font-weight:600;text-decoration:none}` +
      `p{color:#9b978f}</style></head><body><main>` +
      `<h1>Connexion réussie</h1><p>Retour à l'application…</p>` +
      `<a id="go" href="${esc(target)}">Ouvrir mindlog.todo</a>` +
      `</main><script>location.replace(${JSON.stringify(target)});</script></body></html>`
  );
}

function authBody(result: AuthResult) {
  return {
    user: result.user,
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    expiresIn: result.expiresIn,
  };
}

authRouter.post('/register', async (req, res) => {
  const result = await authService.register(registerSchema.parse(req.body));
  res.status(201).json(authBody(result));
});

authRouter.post('/login', async (req, res) => {
  const result = await authService.login(loginSchema.parse(req.body));
  res.json(authBody(result));
});

authRouter.post('/refresh', async (req, res) => {
  const { refreshToken } = refreshSchema.parse(req.body);
  res.json(authBody(await authService.refresh(refreshToken)));
});

authRouter.post('/logout', async (req, res) => {
  const { refreshToken } = refreshSchema.parse(req.body);
  await authService.logout(refreshToken);
  res.status(204).end();
});

// --- password reset ---

authRouter.post('/forgot-password', async (req, res) => {
  const { email } = forgotPasswordSchema.parse(req.body);
  await authService.requestPasswordReset(email);
  res.status(202).json({ ok: true }); // always 202: never reveals whether the email exists
});

authRouter.post('/reset-password', async (req, res) => {
  const { token, password } = resetPasswordSchema.parse(req.body);
  await authService.resetPassword(token, password);
  res.status(204).end();
});

// --- Google OAuth (redirect flow) ---

authRouter.get('/google', (_req, res) => {
  if (!googleEnabled()) throw ServiceUnavailable('Google OAuth is not configured');
  // Note: in V0 the `state` is generated but not persisted/verified server-side.
  const url = authService.googleAuthUrl(randomUUID());
  res.redirect(url);
});

authRouter.get('/google/callback', async (req, res) => {
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const result = await authService.loginWithGoogle(code);
  const fragment = new URLSearchParams({
    access_token: result.accessToken,
    refresh_token: result.refreshToken,
    expires_in: String(result.expiresIn),
  }).toString();
  res.redirect(`${config.webUrl}/auth/callback#${fragment}`);
});

// --- mindlog id (central OIDC provider, redirect flow) ---

// `?create=1` — the button pressed was "create an account", not "sign in". The
// hint is forwarded to mindlog id so it opens signup directly; it only changes
// which of ITS screens comes first, never what we get back.
// `?client=native` — a native app started this, so the tokens must come back on
// its custom scheme rather than to the SPA. The hint has to survive a round trip
// through mindlog id, and `state` is the only parameter that does.
authRouter.get('/mindlog-id', async (req, res) => {
  if (!mindlogIdEnabled()) throw ServiceUnavailable('mindlog id is not configured');
  const create = req.query.create === '1';
  const client = req.query.client === 'native' ? 'native' : 'web';
  const state = signOAuthState({ nonce: randomUUID(), client });
  const url = await authService.mindlogIdAuthUrl(state, { create });
  res.redirect(url);
});

authRouter.get('/mindlog-id/callback', async (req, res) => {
  // The state is now verified rather than merely generated: a callback we did
  // not start is refused instead of being turned into a session.
  const state = verifyOAuthState(typeof req.query.state === 'string' ? req.query.state : '');
  if (!state) throw Unauthorized('Invalid or expired OAuth state');

  const isNative = state.client === 'native';
  const returnTo = isNative ? config.nativeCallbackUrl : `${config.webUrl}/auth/callback`;
  // Le web repart en 302 (même origine, navigation ordinaire) ; le natif passe
  // par la page relais, cf. nativeHandoff.
  const handBack = (url: string) => (isNative ? nativeHandoff(res, url) : res.redirect(url));

  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const outcome = await authService.loginWithMindlogId(code);
  // mindlog id returned no email: send the client a pending token so it can ask
  // the user for one and finish via POST /mindlog-id/complete.
  if (outcome.status === 'need-email') {
    const fragment = new URLSearchParams({ mindlog_id_pending: outcome.pendingToken }).toString();
    handBack(`${returnTo}#${fragment}`);
    return;
  }
  const { result } = outcome;
  // The fragment, not the query: it never reaches a server log or a Referer.
  const fragment = new URLSearchParams({
    access_token: result.accessToken,
    refresh_token: result.refreshToken,
    expires_in: String(result.expiresIn),
  }).toString();
  handBack(`${returnTo}#${fragment}`);
});

// Finish a mindlog-id sign-in that lacked an email (the user typed one).
authRouter.post('/mindlog-id/complete', async (req, res) => {
  const { pendingToken, email } = completeMindlogIdSchema.parse(req.body);
  const result = await authService.completeMindlogIdSignup(pendingToken, email);
  res.json(authBody(result));
});
