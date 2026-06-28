import { describe, it, expect } from 'vitest';
import { redactSecrets } from './redact.js';

describe('redactSecrets', () => {
  it('redacts an Authorization header value', () => {
    const out = redactSecrets('Authorization: Basic c2VjcmV0OnRva2Vu failed');
    expect(out).not.toContain('c2VjcmV0OnRva2Vu');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts bare Bearer/Basic tokens anywhere', () => {
    expect(redactSecrets('header bearer abcdef1234567890')).toContain('bearer [REDACTED]');
    expect(redactSecrets('x Basic c2VjcmV0dG9rZW4= y')).toContain('Basic [REDACTED]');
  });

  it('leaves ordinary text untouched', () => {
    expect(redactSecrets('Pull request #42 not found')).toBe('Pull request #42 not found');
  });
});
