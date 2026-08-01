/**
 * A federated account (Google / mindlog id) has no password, so the recovery
 * link SETS a first one. Telling that user we are "resetting" their password
 * describes something that never happened — the copy has to switch.
 */
import { describe, expect, it } from 'vitest';
import { passwordResetEmail } from '../src/mail/templates/password-reset.js';

const base = {
  resetUrl: 'https://todo.mindlog.today/app/auth/reset?token=t',
  expiresIn: '1 hour',
};

describe('password-reset email copy', () => {
  it('says "set" when the account has no password yet', () => {
    const mail = passwordResetEmail({ ...base, firstPassword: true });
    expect(mail.subject).toBe('Set your mindlog password');
    expect(mail.mjml).toContain('Set my password');
    expect(mail.text).toContain('Set a password');
  });

  it('says "reset" for an account that already has one', () => {
    const mail = passwordResetEmail({ ...base, firstPassword: false });
    expect(mail.subject).toBe('Reset your mindlog password');
    expect(mail.mjml).toContain('Reset my password');
    expect(mail.text).toContain('Reset your mindlog password');
  });

  it('defaults to "reset" when the flag is absent', () => {
    expect(passwordResetEmail(base).subject).toBe('Reset your mindlog password');
  });

  it('carries the link in both the HTML and the plain-text part', () => {
    const mail = passwordResetEmail({ ...base, firstPassword: true });
    expect(mail.mjml).toContain(base.resetUrl);
    expect(mail.text).toContain(base.resetUrl);
  });
});
