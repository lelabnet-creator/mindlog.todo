/**
 * CORS allowlist. The stakes are asymmetric: too loose is a defence-in-depth
 * weakness, too tight silently breaks the Capacitor mobile shells — which serve
 * their bundle from `https://localhost` and therefore call the API cross-origin
 * on every single request. That case is the one worth pinning down.
 */
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/rest/app.js';

const app = createApp();

/** `access-control-allow-origin` echoed back for a given Origin, if any. */
async function allowedOrigin(origin: string): Promise<string | undefined> {
  const res = await request(app).get('/api/v1/version').set('Origin', origin);
  return res.headers['access-control-allow-origin'];
}

describe('CORS allowlist', () => {
  it('allows the Capacitor Android WebView origin', async () => {
    expect(await allowedOrigin('https://localhost')).toBe('https://localhost');
  });

  it('allows the Capacitor iOS WebView origin', async () => {
    expect(await allowedOrigin('capacitor://localhost')).toBe('capacitor://localhost');
  });

  it('refuses an unrelated origin', async () => {
    expect(await allowedOrigin('https://evil.example.com')).toBeUndefined();
  });

  it('still serves requests that carry no Origin at all', async () => {
    // curl, native HTTP clients, the MCP connector: not browser requests, so the
    // same-origin policy is not what protects them — the Bearer credential is.
    const res = await request(app).get('/api/v1/version');
    expect(res.status).toBe(200);
    expect(res.body.version).toBeTruthy();
  });

  it('a refused origin still gets a response — CORS blocks the reader, not the server', async () => {
    // The browser is what enforces this; the server must not start 500-ing.
    const res = await request(app).get('/api/v1/version').set('Origin', 'https://evil.example.com');
    expect(res.status).toBe(200);
  });
});
