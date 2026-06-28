import { describe, it, expect, vi } from 'vitest';
import { PaginationHelper } from './pagination.js';

describe('PaginationHelper.getAllPages', () => {
  it('follows the opaque next link until it is absent', async () => {
    const fetchNext = vi.fn();
    fetchNext.mockResolvedValueOnce({
      values: [{ id: 1 }, { id: 2 }],
      next: 'https://api.bitbucket.org/2.0/x?page=2',
    });
    fetchNext.mockResolvedValueOnce({ values: [{ id: 3 }], next: undefined });

    const results = await PaginationHelper.getAllPages(fetchNext);

    expect(fetchNext).toHaveBeenCalledTimes(2);
    // First call uses undefined (first page), second follows the next URL verbatim.
    expect(fetchNext).toHaveBeenNthCalledWith(1, undefined);
    expect(fetchNext).toHaveBeenNthCalledWith(2, 'https://api.bitbucket.org/2.0/x?page=2');
    expect(results).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
  });

  it('respects maxPages and reports truncation', async () => {
    const fetchNext = vi.fn().mockResolvedValue({ values: [{ id: 1 }], next: 'next-url' });
    const onTruncate = vi.fn();

    const results = await PaginationHelper.getAllPages(fetchNext, { maxPages: 3, onTruncate });

    expect(fetchNext).toHaveBeenCalledTimes(3);
    expect(results).toHaveLength(3);
    expect(onTruncate).toHaveBeenCalledWith({ pagesFetched: 3, itemsCollected: 3 });
  });

  it('handles a single-page response without truncation', async () => {
    const fetchNext = vi
      .fn()
      .mockResolvedValue({ values: [{ id: 1 }, { id: 2 }], next: undefined });
    const onTruncate = vi.fn();

    const results = await PaginationHelper.getAllPages(fetchNext, { onTruncate });

    expect(fetchNext).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(2);
    expect(onTruncate).not.toHaveBeenCalled();
  });
});
