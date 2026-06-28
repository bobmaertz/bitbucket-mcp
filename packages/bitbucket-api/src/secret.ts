/**
 * Secret — a wrapper for sensitive strings (API tokens, passwords).
 *
 * The raw value is stored behind a non-enumerable symbol so it is never
 * exposed by `JSON.stringify`, `util.inspect`, template literals, or
 * accidental logging. Call `.expose()` only at the exact point of use
 * (building the Authorization header) to keep the credential isolated.
 */
const VALUE = Symbol('Secret.value');

export class Secret {
  constructor(value: string) {
    Object.defineProperty(this, VALUE, {
      value,
      enumerable: false,
      writable: false,
      configurable: false,
    });
  }

  /** Reveal the underlying secret. Use sparingly, at the point of use only. */
  expose(): string {
    return (this as unknown as Record<symbol, string>)[VALUE];
  }

  /** True when the wrapped value is empty. */
  isEmpty(): boolean {
    return this.expose().length === 0;
  }

  toString(): string {
    return '[REDACTED]';
  }

  toJSON(): string {
    return '[REDACTED]';
  }

  // Node's util.inspect / console.log hook.
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return '[REDACTED]';
  }
}
