import { describe, it, expect } from 'vitest';
import { AuthHandler, resolveCredentials } from './auth.js';

describe('resolveCredentials', () => {
  it('prefers email + apiToken', () => {
    const { identity, secret, usedLegacy } = resolveCredentials({
      email: 'user@example.com',
      apiToken: 'token123',
    });
    expect(identity).toBe('user@example.com');
    expect(secret).toBe('token123');
    expect(usedLegacy).toBe(false);
  });

  it('falls back to legacy username + appPassword', () => {
    const { identity, secret, usedLegacy } = resolveCredentials({
      username: 'legacyuser',
      appPassword: 'legacypass',
    });
    expect(identity).toBe('legacyuser');
    expect(secret).toBe('legacypass');
    expect(usedLegacy).toBe(true);
  });

  it('prefers an access token (Bearer) over Basic credentials', () => {
    const { scheme, secret, usedLegacy } = resolveCredentials({
      accessToken: 'ATCTT-abc',
      email: 'user@example.com',
      apiToken: 'token123',
    });
    expect(scheme).toBe('bearer');
    expect(secret).toBe('ATCTT-abc');
    expect(usedLegacy).toBe(false);
  });

  it('reports the basic scheme for API-token credentials', () => {
    expect(resolveCredentials({ email: 'user@example.com', apiToken: 'token123' }).scheme).toBe(
      'basic'
    );
  });

  it('throws when identity is missing', () => {
    expect(() => resolveCredentials({ apiToken: 'token' })).toThrow(/email \+ API token/);
  });

  it('throws when secret is missing', () => {
    expect(() => resolveCredentials({ email: 'user@example.com' })).toThrow(/email \+ API token/);
  });
});

describe('AuthHandler', () => {
  it('builds a Basic header from email:apiToken', () => {
    const handler = new AuthHandler({ email: 'user@example.com', apiToken: 'token123' });
    const expected = Buffer.from('user@example.com:token123').toString('base64');
    expect(handler.getAuthHeader()).toBe(`Basic ${expected}`);
  });

  it('builds a Basic header from legacy credentials', () => {
    const handler = new AuthHandler({ username: 'testuser', appPassword: 'testpass' });
    const expected = Buffer.from('testuser:testpass').toString('base64');
    expect(handler.getAuthHeader()).toBe(`Basic ${expected}`);
  });

  it('builds a Bearer header from an access token', () => {
    const handler = new AuthHandler({ accessToken: 'ATCTT-abc' });
    expect(handler.getAuthHeader()).toBe('Bearer ATCTT-abc');
  });

  it('never exposes an access token through serialization', () => {
    const handler = new AuthHandler({ accessToken: 'ATCTT-super-secret' });
    expect(JSON.stringify(handler)).not.toContain('ATCTT-super-secret');
  });

  it('returns headers that spread cleanly', () => {
    const handler = new AuthHandler({ email: 'user@example.com', apiToken: 'token123' });
    const headers = { 'Content-Type': 'application/json', ...handler.getHeaders() };
    expect(headers).toHaveProperty('Content-Type');
    expect(headers.Authorization).toContain('Basic ');
  });

  it('never exposes the token through enumeration or serialization', () => {
    const handler = new AuthHandler({ email: 'user@example.com', apiToken: 'super-secret-token' });
    const serialized = JSON.stringify(handler);
    expect(serialized).not.toContain('super-secret-token');
    // The raw secret is not an own-enumerable property.
    expect(JSON.stringify(Object.values(handler))).not.toContain('super-secret-token');
  });
});
