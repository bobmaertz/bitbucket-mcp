import { redactSecrets } from '@bobmaertz/bitbucket-api';
import type { LogLevel } from './config.js';

const ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

function format(message: string, args: unknown[]): string {
  const extra = args
    .map((a) => {
      if (typeof a === 'string') return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ');
  const line = extra ? `${message} ${extra}` : message;
  return redactSecrets(line);
}

/**
 * Create a leveled logger that writes to **stderr only** (stdout is reserved
 * for the MCP protocol) and scrubs any credential-looking substrings from
 * every line before emitting it.
 */
export function createLogger(level: LogLevel = 'info'): Logger {
  const threshold = ORDER[level];
  const emit = (lineLevel: LogLevel, message: string, args: unknown[]): void => {
    if (ORDER[lineLevel] < threshold) return;
    process.stderr.write(`[${lineLevel}] ${format(message, args)}\n`);
  };

  return {
    debug: (m, ...a) => emit('debug', m, a),
    info: (m, ...a) => emit('info', m, a),
    warn: (m, ...a) => emit('warn', m, a),
    error: (m, ...a) => emit('error', m, a),
  };
}
