import { describe, it, expect } from 'vitest';
import { loadConfig, validateConfig, publicConfig } from './config.js';

const base = {
  BITBUCKET_WORKSPACE: 'acme',
  BITBUCKET_EMAIL: 'user@example.com',
  BITBUCKET_API_TOKEN: 'token123',
} as NodeJS.ProcessEnv;

describe('loadConfig', () => {
  it('loads API-token auth as canonical', () => {
    const config = loadConfig(base);
    expect(config.auth).toEqual({ email: 'user@example.com', apiToken: 'token123' });
    expect(config.usedLegacyAuth).toBe(false);
    expect(config.workspace).toBe('acme');
    expect(config.logLevel).toBe('info');
    expect(config.allowWrites).toBe(false);
  });

  it('falls back to legacy username/app-password', () => {
    const config = loadConfig({
      BITBUCKET_WORKSPACE: 'acme',
      BITBUCKET_USERNAME: 'legacy',
      BITBUCKET_APP_PASSWORD: 'pw',
    } as NodeJS.ProcessEnv);
    expect(config.usedLegacyAuth).toBe(true);
    expect(config.auth).toEqual({ username: 'legacy', appPassword: 'pw' });
  });

  it('defaults an invalid LOG_LEVEL to info', () => {
    expect(loadConfig({ ...base, LOG_LEVEL: 'verbose' }).logLevel).toBe('info');
    expect(loadConfig({ ...base, LOG_LEVEL: 'debug' }).logLevel).toBe('debug');
  });

  it('parses allowWrites from truthy strings', () => {
    expect(loadConfig({ ...base, BITBUCKET_ALLOW_WRITES: 'true' }).allowWrites).toBe(true);
    expect(loadConfig({ ...base, BITBUCKET_ALLOW_WRITES: '1' }).allowWrites).toBe(true);
    expect(loadConfig({ ...base, BITBUCKET_ALLOW_WRITES: 'no' }).allowWrites).toBe(false);
  });
});

describe('validateConfig', () => {
  it('passes a valid API-token config', () => {
    expect(() => validateConfig(loadConfig(base))).not.toThrow();
  });

  it('requires a workspace', () => {
    expect(() => validateConfig(loadConfig({ ...base, BITBUCKET_WORKSPACE: '' }))).toThrow(
      /BITBUCKET_WORKSPACE/
    );
  });

  it('requires the email to look like an email under API-token auth', () => {
    expect(() => validateConfig(loadConfig({ ...base, BITBUCKET_EMAIL: 'not-an-email' }))).toThrow(
      /must be your Atlassian account email/
    );
  });

  it('requires both legacy fields when using legacy auth', () => {
    const config = loadConfig({
      BITBUCKET_WORKSPACE: 'acme',
      BITBUCKET_USERNAME: 'legacy',
    } as NodeJS.ProcessEnv);
    expect(() => validateConfig(config)).toThrow(/Legacy auth requires/);
  });
});

describe('publicConfig', () => {
  it('never exposes the credential', () => {
    const summary = publicConfig(loadConfig(base));
    expect(summary.authMode).toBe('api-token');
    expect(JSON.stringify(summary)).not.toContain('token123');
  });
});
