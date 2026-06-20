import { RNG } from '../src/engine/rng';

describe('RNG', () => {
  it('is deterministic for a given seed', () => {
    const a = new RNG('hello');
    const b = new RNG('hello');
    const seqA = Array.from({ length: 50 }, () => a.random());
    const seqB = Array.from({ length: 50 }, () => b.random());
    expect(seqA).toEqual(seqB);
  });

  it('produces different streams for different seeds', () => {
    const a = new RNG('seed-1');
    const b = new RNG('seed-2');
    const seqA = Array.from({ length: 50 }, () => a.random());
    const seqB = Array.from({ length: 50 }, () => b.random());
    expect(seqA).not.toEqual(seqB);
  });

  it('randint respects inclusive bounds', () => {
    const r = new RNG('bounds');
    for (let i = 0; i < 1000; i++) {
      const v = r.randint(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('randint can reach both endpoints', () => {
    const r = new RNG('endpoints');
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) seen.add(r.randint(1, 6));
    expect(seen.has(1)).toBe(true);
    expect(seen.has(6)).toBe(true);
  });

  it('choice always returns a member', () => {
    const r = new RNG('choice');
    const pool = ['a', 'b', 'c', 'd'];
    for (let i = 0; i < 100; i++) expect(pool).toContain(r.choice(pool));
  });

  it('shuffle preserves the multiset of elements', () => {
    const r = new RNG('shuffle');
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const copy = [...arr];
    r.shuffle(copy);
    expect([...copy].sort((x, y) => x - y)).toEqual(arr);
  });

  it('choices honours weights (heavy option dominates)', () => {
    const r = new RNG('weights');
    const counts = { rare: 0, common: 0 };
    for (let i = 0; i < 2000; i++) {
      const pick = r.choices(['rare', 'common'], [1, 99], 1)[0] as 'rare' | 'common';
      counts[pick] += 1;
    }
    expect(counts.common).toBeGreaterThan(counts.rare * 5);
  });
});
