import { describe, it, expect } from 'vitest';
import { selectRandom } from '../../utils/payloadUtils';

describe('selectRandom', () => {
  it('returns exactly `count` items when the pool is larger than count', () => {
    const pool = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = selectRandom(pool, 4);
    expect(result).toHaveLength(4);
  });

  it('returns all items when count equals pool length', () => {
    const pool = ['a', 'b', 'c'];
    const result = selectRandom(pool, 3);
    expect(result).toHaveLength(3);
    expect(result.sort()).toEqual(['a', 'b', 'c']);
  });

  it('returns all items when count exceeds pool length', () => {
    const pool = [10, 20, 30];
    const result = selectRandom(pool, 100);
    expect(result).toHaveLength(3);
    expect(result.sort((a, b) => a - b)).toEqual([10, 20, 30]);
  });

  it('returns an empty array for an empty pool', () => {
    const result = selectRandom([], 5);
    expect(result).toHaveLength(0);
  });

  it('returns only unique items (no duplicates)', () => {
    const pool = ['x', 'y', 'z', 'w', 'v'];
    const result = selectRandom(pool, 5);
    const unique = new Set(result);
    expect(unique.size).toBe(result.length);
  });

  it('does not mutate the original pool', () => {
    const pool = [1, 2, 3, 4, 5];
    const original = [...pool];
    selectRandom(pool, 3);
    expect(pool).toEqual(original);
  });

  it('all pool items are selected with roughly equal probability over many runs', () => {
    const pool = ['a', 'b', 'c', 'd', 'e'];
    const counts: Record<string, number> = { a: 0, b: 0, c: 0, d: 0, e: 0 };
    const runs = 2000;

    for (let i = 0; i < runs; i++) {
      const selected = selectRandom(pool, 3);
      selected.forEach(item => {
        counts[item]++;
      });
    }

    // Each item should be selected in roughly 60% of runs (3/5 expected).
    // Allow generous ±15% tolerance to avoid flakiness.
    const expected = runs * (3 / 5);
    Object.values(counts).forEach(count => {
      expect(count).toBeGreaterThan(expected * 0.75);
      expect(count).toBeLessThan(expected * 1.25);
    });
  });

  it('returns items that are all members of the original pool', () => {
    const pool = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];
    const result = selectRandom(pool, 3);
    result.forEach(item => {
      expect(pool).toContain(item);
    });
  });

  it('works with object elements', () => {
    const pool = [
      { id: 1, name: 'first' },
      { id: 2, name: 'second' },
      { id: 3, name: 'third' },
    ];
    const result = selectRandom(pool, 2);
    expect(result).toHaveLength(2);
    result.forEach(item => {
      expect(pool).toContain(item);
    });
  });
});
