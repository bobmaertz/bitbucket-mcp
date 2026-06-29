import { describe, it, expect } from 'vitest';
import { compact, presentPullRequestSummary, presentComment, presentBranch } from './presenters.js';
import type { PullRequest, Comment, Branch } from 'bitbucket-api';

describe('compact', () => {
  it('drops null/undefined/empty but keeps false and 0', () => {
    expect(compact({ a: null, b: undefined, c: '', d: [], e: {}, f: false, g: 0, h: 'x' })).toEqual(
      {
        f: false,
        g: 0,
        h: 'x',
      }
    );
  });

  it('recurses into nested objects and arrays', () => {
    expect(compact({ a: { b: null, c: 1 }, d: [{ e: '' }, { f: 2 }] })).toEqual({
      a: { c: 1 },
      d: [{ f: 2 }],
    });
  });
});

describe('presentPullRequestSummary', () => {
  it('flattens branches, surfaces the html url, and omits empties', () => {
    const pr = {
      id: 7,
      title: 'Fix bug',
      state: 'OPEN',
      author: { display_name: 'Jo' },
      source: { branch: { name: 'feature/x' } },
      destination: { branch: { name: 'main' } },
      comment_count: 3,
      task_count: 0,
      updated_on: '2026-01-01T00:00:00Z',
      links: { html: { href: 'https://bitbucket.org/acme/repo/pull-requests/7' } },
      description: '',
    } as unknown as PullRequest;

    expect(presentPullRequestSummary(pr)).toEqual({
      id: 7,
      title: 'Fix bug',
      state: 'OPEN',
      author: 'Jo',
      source_branch: 'feature/x',
      dest_branch: 'main',
      comment_count: 3,
      task_count: 0,
      updated_on: '2026-01-01T00:00:00Z',
      url: 'https://bitbucket.org/acme/repo/pull-requests/7',
    });
  });
});

describe('presentComment', () => {
  it('keeps raw content only and drops rendered html', () => {
    const comment = {
      id: 1,
      content: { raw: 'hello', html: '<p>hello</p>', markup: 'markdown' },
      user: { display_name: 'Jo' },
      created_on: '2026-01-01T00:00:00Z',
      deleted: false,
    } as unknown as Comment;

    const out = presentComment(comment);
    expect(out).toMatchObject({ id: 1, author: 'Jo', content: 'hello' });
    expect(JSON.stringify(out)).not.toContain('<p>hello</p>');
    expect(out).not.toHaveProperty('deleted'); // false is dropped here via undefined mapping
  });

  it('omits resolved for non-inline comments', () => {
    const comment = {
      id: 1,
      content: { raw: 'general note' },
      user: { display_name: 'Jo' },
      created_on: '2026-01-01T00:00:00Z',
    } as unknown as Comment;

    expect(presentComment(comment)).not.toHaveProperty('resolved');
  });

  it('surfaces resolved:false for an unresolved inline thread', () => {
    const comment = {
      id: 2,
      content: { raw: 'needs work' },
      user: { display_name: 'Jo' },
      created_on: '2026-01-01T00:00:00Z',
      inline: { path: 'src/a.ts', to: 10 },
    } as unknown as Comment;

    expect(presentComment(comment)).toMatchObject({ resolved: false });
  });

  it('surfaces resolved status with resolver and timestamp for a resolved thread', () => {
    const comment = {
      id: 3,
      content: { raw: 'fixed' },
      user: { display_name: 'Jo' },
      created_on: '2026-01-01T00:00:00Z',
      inline: { path: 'src/a.ts', to: 10 },
      resolution: {
        type: 'comment_resolution',
        user: { display_name: 'Sam' },
        created_on: '2026-01-02T00:00:00Z',
      },
    } as unknown as Comment;

    expect(presentComment(comment)).toMatchObject({
      resolved: true,
      resolved_by: 'Sam',
      resolved_on: '2026-01-02T00:00:00Z',
    });
  });
});

describe('presentBranch', () => {
  it('shortens the target hash to 12 chars', () => {
    const branch = {
      name: 'main',
      target: {
        hash: '0123456789abcdef0123456789abcdef01234567',
        date: '2026-01-01T00:00:00Z',
        author: { display_name: 'Jo' },
        message: 'init\n',
      },
    } as unknown as Branch;

    expect(presentBranch(branch)).toEqual({
      name: 'main',
      target_hash: '0123456789ab',
      target_date: '2026-01-01T00:00:00Z',
      author: 'Jo',
      message: 'init',
    });
  });
});
