// Seedable pseudo-random number generator.
//
// Replaces Python's `random` module. The original game called module-level
// `random.*` throughout plus a per-Dungeon `random.Random`; here every module
// shares one seedable generator so a whole run is reproducible from one seed.
//
// Note: this does NOT reproduce CPython's Mersenne Twister stream byte-for-byte
// (that has no value at runtime). "Determinism" here means: same seed -> same
// game, which is what the save system and parity tests rely on.

// sfc32 — fast, well-distributed 32-bit generator.
function sfc32(a: number, b: number, c: number, d: number): () => number {
  return function () {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

// Hash a string/number seed into four 32-bit integers (xmur3).
function seedToInts(seed: string): [number, number, number, number] {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  const next = () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
  return [next(), next(), next(), next()];
}

export class RNG {
  private next: () => number;
  public seed: string;

  constructor(seed?: string | number) {
    this.seed = seed === undefined ? String(Date.now()) + ':' + Math.random() : String(seed);
    const [a, b, c, d] = seedToInts(this.seed);
    this.next = sfc32(a, b, c, d);
  }

  reseed(seed: string | number): void {
    this.seed = String(seed);
    const [a, b, c, d] = seedToInts(this.seed);
    this.next = sfc32(a, b, c, d);
  }

  /** Float in [0, 1). Equivalent to Python random.random(). */
  random(): number {
    return this.next();
  }

  /** Integer in [a, b] inclusive. Equivalent to Python random.randint(a, b). */
  randint(a: number, b: number): number {
    return a + Math.floor(this.next() * (b - a + 1));
  }

  /** Integer in [0, n). Equivalent to Python random.randrange(n). */
  randrange(n: number): number {
    return Math.floor(this.next() * n);
  }

  /** Random element of a non-empty array. Equivalent to random.choice(seq). */
  choice<T>(seq: readonly T[]): T {
    return seq[Math.floor(this.next() * seq.length)];
  }

  /** In-place Fisher–Yates shuffle. Equivalent to random.shuffle(seq). */
  shuffle<T>(seq: T[]): T[] {
    for (let i = seq.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = seq[i];
      seq[i] = seq[j];
      seq[j] = tmp;
    }
    return seq;
  }

  /**
   * Weighted sampling with replacement (k draws). Mirrors
   * random.choices(population, weights=..., k=...).
   */
  choices<T>(population: readonly T[], weights: readonly number[], k = 1): T[] {
    const cum: number[] = [];
    let total = 0;
    for (const w of weights) {
      total += w;
      cum.push(total);
    }
    const out: T[] = [];
    for (let i = 0; i < k; i++) {
      const r = this.next() * total;
      let lo = 0;
      let hi = cum.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (r < cum[mid]) hi = mid;
        else lo = mid + 1;
      }
      out.push(population[lo]);
    }
    return out;
  }
}

// Shared singleton used by every engine module, mirroring Python's module-level
// `random`. The engine reseeds this at the start of each game.
export const rng = new RNG();
