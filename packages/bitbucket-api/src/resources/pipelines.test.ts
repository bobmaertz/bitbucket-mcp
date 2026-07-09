import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PipelinesResource, pipelineRef } from './pipelines.js';
import type { BitbucketClient } from '../client.js';

describe('PipelinesResource', () => {
  let mockClient: BitbucketClient;
  let resource: PipelinesResource;

  beforeEach(() => {
    mockClient = {
      get: vi.fn().mockResolvedValue({ values: [], size: 0 }),
      getText: vi.fn().mockResolvedValue({ text: '', totalBytes: 0, partial: false }),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    } as unknown as BitbucketClient;
    resource = new PipelinesResource(mockClient);
  });

  describe('list', () => {
    it('lists pipelines with no query string by default', async () => {
      await resource.list('ws', 'repo');
      expect(mockClient.get).toHaveBeenCalledWith('/repositories/ws/repo/pipelines');
    });

    it('appends paging, q, and sort', async () => {
      await resource.list('ws', 'repo', {
        page: 2,
        pagelen: 10,
        q: 'state.name="FAILED"',
        sort: '-created_on',
      });
      const [path] = (mockClient.get as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(path).toContain('/repositories/ws/repo/pipelines?');
      expect(path).toContain('page=2');
      expect(path).toContain('pagelen=10');
      expect(path).toContain('q=state.name%3D%22FAILED%22');
      expect(path).toContain('sort=-created_on');
    });
  });

  describe('get', () => {
    it('passes a build number through unchanged', async () => {
      await resource.get('ws', 'repo', '42');
      expect(mockClient.get).toHaveBeenCalledWith('/repositories/ws/repo/pipelines/42');
    });

    it('brace-wraps and encodes a bare UUID', async () => {
      await resource.get('ws', 'repo', 'abc-123');
      expect(mockClient.get).toHaveBeenCalledWith('/repositories/ws/repo/pipelines/%7Babc-123%7D');
    });
  });

  describe('listSteps', () => {
    it('targets the steps subpath of the pipeline', async () => {
      await resource.listSteps('ws', 'repo', '7');
      expect(mockClient.get).toHaveBeenCalledWith('/repositories/ws/repo/pipelines/7/steps');
    });
  });

  describe('getStepLog', () => {
    it('requests the log via getText and returns its metadata', async () => {
      (mockClient.getText as ReturnType<typeof vi.fn>).mockResolvedValue({
        text: 'log output',
        totalBytes: 10,
        partial: false,
      });
      const log = await resource.getStepLog('ws', 'repo', '7', '{step-uuid}');
      expect(log).toEqual({ text: 'log output', totalBytes: 10, partial: false });
      expect(mockClient.getText).toHaveBeenCalledWith(
        '/repositories/ws/repo/pipelines/7/steps/%7Bstep-uuid%7D/log',
        undefined
      );
    });

    it('forwards a Range header value when tailing', async () => {
      await resource.getStepLog('ws', 'repo', '7', '{step-uuid}', 'bytes=-1024');
      expect(mockClient.getText).toHaveBeenCalledWith(
        '/repositories/ws/repo/pipelines/7/steps/%7Bstep-uuid%7D/log',
        'bytes=-1024'
      );
    });
  });

  describe('listSchedules', () => {
    it('targets the pipelines_config schedules path', async () => {
      await resource.listSchedules('ws', 'repo');
      expect(mockClient.get).toHaveBeenCalledWith(
        '/repositories/ws/repo/pipelines_config/schedules'
      );
    });
  });
});

describe('pipelineRef', () => {
  it('passes numeric build numbers through', () => {
    expect(pipelineRef('123')).toBe('123');
  });
  it('wraps and encodes a bare uuid', () => {
    expect(pipelineRef('abc-def')).toBe('%7Babc-def%7D');
  });
  it('encodes an already-braced uuid without double-wrapping', () => {
    expect(pipelineRef('{abc-def}')).toBe('%7Babc-def%7D');
  });
});
