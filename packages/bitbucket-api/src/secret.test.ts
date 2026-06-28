import { describe, it, expect } from 'vitest';
import { inspect } from 'node:util';
import { Secret } from './secret.js';

describe('Secret', () => {
  const secret = new Secret('super-secret-value');

  it('exposes the raw value only via expose()', () => {
    expect(secret.expose()).toBe('super-secret-value');
  });

  it('redacts under toString, template literals, and JSON', () => {
    expect(secret.toString()).toBe('[REDACTED]');
    expect(String(secret)).toBe('[REDACTED]');
    expect(JSON.stringify({ secret })).not.toContain('super-secret-value');
  });

  it('redacts under util.inspect / console.log', () => {
    expect(inspect(secret)).not.toContain('super-secret-value');
    expect(inspect({ secret })).not.toContain('super-secret-value');
  });

  it('does not expose the value as an enumerable property', () => {
    expect(Object.keys(secret)).toHaveLength(0);
    expect(JSON.stringify(Object.values(secret))).not.toContain('super-secret-value');
  });
});
