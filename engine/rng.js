// Deterministic, serializable random number generator (mulberry32).
// The generator state is a plain integer so whole worlds can be cloned,
// saved as JSON, replayed and forked for counterfactual evaluation.

export function seedFrom(value) {
  // Hash any string/number into a 32-bit seed.
  const s = String(value);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h || 1;
}

/** Advance a state holder `{ s: <uint32> }` and return a float in [0, 1). */
export function next(holder) {
  let t = (holder.s = (holder.s + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function createRng(seed = 1) {
  const holder = { s: seedFrom(seed) };
  const rng = () => next(holder);
  rng.holder = holder;
  rng.int = n => Math.floor(rng() * n);
  rng.pick = arr => arr[Math.floor(rng() * arr.length)];
  rng.chance = p => rng() < p;
  return rng;
}

/** Use an existing serialized holder (e.g. from a world state) as a generator. */
export function rngFromHolder(holder) {
  const rng = () => next(holder);
  rng.holder = holder;
  rng.int = n => Math.floor(rng() * n);
  rng.pick = arr => arr[Math.floor(rng() * arr.length)];
  rng.chance = p => rng() < p;
  return rng;
}
