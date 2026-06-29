import { describe, it, expect } from 'vitest';
import { seg } from './path.js';

describe('seg', () => {
  it('passes ordinary slugs through unchanged', () => {
    expect(seg('acme')).toBe('acme');
    expect(seg('my-repo_1')).toBe('my-repo_1');
  });

  it('encodes slashes so a segment cannot reach another endpoint', () => {
    expect(seg('x/pullrequests/1')).toBe('x%2Fpullrequests%2F1');
  });

  it('encodes query/fragment delimiters so params cannot be injected', () => {
    expect(seg('repo?role=admin')).toBe('repo%3Frole%3Dadmin');
    expect(seg('repo#frag')).toBe('repo%23frag');
  });

  it('encodes traversal sequences', () => {
    expect(seg('../../secret')).toBe('..%2F..%2Fsecret');
  });
});
