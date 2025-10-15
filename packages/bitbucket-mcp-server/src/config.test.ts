import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadConfig, validateConfig } from './config.js';

describe('Config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment before each test
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('loadConfig', () => {
    it('should load config from environment variables', () => {
      process.env.BITBUCKET_WORKSPACE = 'test-workspace';
      process.env.BITBUCKET_USERNAME = 'test-user';
      process.env.BITBUCKET_APP_PASSWORD = 'test-password';

      const config = loadConfig();

      expect(config.workspace).toBe('test-workspace');
      expect(config.username).toBe('test-user');
      expect(config.appPassword).toBe('test-password');
      expect(config.logLevel).toBe('info');
    });

    it('should load optional default repo', () => {
      process.env.BITBUCKET_WORKSPACE = 'workspace';
      process.env.BITBUCKET_USERNAME = 'user';
      process.env.BITBUCKET_APP_PASSWORD = 'pass';
      process.env.BITBUCKET_DEFAULT_REPO = 'my-repo';

      const config = loadConfig();

      expect(config.defaultRepo).toBe('my-repo');
    });

    it('should load custom log level', () => {
      process.env.BITBUCKET_WORKSPACE = 'workspace';
      process.env.BITBUCKET_USERNAME = 'user';
      process.env.BITBUCKET_APP_PASSWORD = 'pass';
      process.env.LOG_LEVEL = 'debug';

      const config = loadConfig();

      expect(config.logLevel).toBe('debug');
    });

    it('should default to info log level if not specified', () => {
      process.env.BITBUCKET_WORKSPACE = 'workspace';
      process.env.BITBUCKET_USERNAME = 'user';
      process.env.BITBUCKET_APP_PASSWORD = 'pass';

      const config = loadConfig();

      expect(config.logLevel).toBe('info');
    });

    it('should throw error if BITBUCKET_WORKSPACE is missing', () => {
      process.env.BITBUCKET_USERNAME = 'user';
      process.env.BITBUCKET_APP_PASSWORD = 'pass';

      expect(() => loadConfig()).toThrow('BITBUCKET_WORKSPACE environment variable is required');
    });

    it('should throw error if BITBUCKET_USERNAME is missing', () => {
      process.env.BITBUCKET_WORKSPACE = 'workspace';
      process.env.BITBUCKET_APP_PASSWORD = 'pass';

      expect(() => loadConfig()).toThrow('BITBUCKET_USERNAME environment variable is required');
    });

    it('should throw error if BITBUCKET_APP_PASSWORD is missing', () => {
      process.env.BITBUCKET_WORKSPACE = 'workspace';
      process.env.BITBUCKET_USERNAME = 'user';

      expect(() => loadConfig()).toThrow('BITBUCKET_APP_PASSWORD environment variable is required');
    });
  });

  describe('validateConfig', () => {
    it('should validate a correct config', () => {
      const config = {
        workspace: 'workspace',
        username: 'user',
        appPassword: 'pass',
        logLevel: 'info' as const,
      };

      expect(() => validateConfig(config)).not.toThrow();
    });

    it('should throw error if workspace is empty', () => {
      const config = {
        workspace: '',
        username: 'user',
        appPassword: 'pass',
        logLevel: 'info' as const,
      };

      expect(() => validateConfig(config)).toThrow('Workspace cannot be empty');
    });

    it('should throw error if workspace is only whitespace', () => {
      const config = {
        workspace: '   ',
        username: 'user',
        appPassword: 'pass',
        logLevel: 'info' as const,
      };

      expect(() => validateConfig(config)).toThrow('Workspace cannot be empty');
    });

    it('should throw error if username is empty', () => {
      const config = {
        workspace: 'workspace',
        username: '',
        appPassword: 'pass',
        logLevel: 'info' as const,
      };

      expect(() => validateConfig(config)).toThrow('Username cannot be empty');
    });

    it('should throw error if username is only whitespace', () => {
      const config = {
        workspace: 'workspace',
        username: '   ',
        appPassword: 'pass',
        logLevel: 'info' as const,
      };

      expect(() => validateConfig(config)).toThrow('Username cannot be empty');
    });

    it('should throw error if appPassword is empty', () => {
      const config = {
        workspace: 'workspace',
        username: 'user',
        appPassword: '',
        logLevel: 'info' as const,
      };

      expect(() => validateConfig(config)).toThrow('App password cannot be empty');
    });

    it('should throw error if appPassword is only whitespace', () => {
      const config = {
        workspace: 'workspace',
        username: 'user',
        appPassword: '   ',
        logLevel: 'info' as const,
      };

      expect(() => validateConfig(config)).toThrow('App password cannot be empty');
    });

    it('should accept config with optional fields', () => {
      const config = {
        workspace: 'workspace',
        username: 'user',
        appPassword: 'pass',
        defaultRepo: 'my-repo',
        logLevel: 'debug' as const,
      };

      expect(() => validateConfig(config)).not.toThrow();
    });
  });
});
