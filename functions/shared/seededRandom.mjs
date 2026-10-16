/*
 * SEEDED RANDOMNESS FOR GENERATED GAME QUESTIONS.
 *
 * Generated Live Challenge questions are regenerated, never stored: the
 * server rebuilds a student's question from its seed text to grade an
 * attempt on it. That only works if the same seed text yields the same
 * numbers on every machine, forever — so the generator is integer-only
 * (cyrb128 hashing into sfc32), with no Math.random and no floating-point
 * state that could differ between engines.
 *
 * Shared by Graph Feature Rush (graphFeatureGenerator.mjs, which re-exports
 * it) and Graph the Line (lineGraphGenerator.mjs). Changing ANYTHING here
 * changes every question both games generate: it would have to bump both
 * generators' versions, and rooms already running would refuse to grade.
 * The tests pin generated questions so such a change cannot go unnoticed.
 *
 * Pure: Cloud Functions and tests.
 */

// cyrb128 → sfc32: small, fast, integer-only (so identical on every engine).
const cyrb128 = (text) => {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  const value = String(text);
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    h1 = h2 ^ Math.imul(h1 ^ code, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ code, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ code, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ code, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
};

export const createRng = (seedText) => {
  let [a, b, c, d] = cyrb128(seedText);
  const next = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) >>> 0;
    return t / 4294967296;
  };
  // Warm up so similar seeds diverge immediately.
  for (let index = 0; index < 12; index += 1) next();
  const int = (low, high) => {
    const lo = Math.ceil(Math.min(low, high));
    const hi = Math.floor(Math.max(low, high));
    return lo + Math.floor(next() * (hi - lo + 1));
  };
  const pick = (values) => values[Math.floor(next() * values.length)];
  const chance = (probability) => next() < probability;
  const shuffle = (values) => {
    const out = [...values];
    for (let index = out.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(next() * (index + 1));
      [out[index], out[swap]] = [out[swap], out[index]];
    }
    return out;
  };
  const weighted = (entries, weightOf = (entry) => entry.weight) => {
    const total = entries.reduce((sum, entry) => sum + Math.max(0, weightOf(entry)), 0);
    if (!(total > 0)) return entries[0] ?? null;
    let roll = next() * total;
    for (const entry of entries) {
      roll -= Math.max(0, weightOf(entry));
      if (roll < 0) return entry;
    }
    return entries[entries.length - 1];
  };
  return Object.freeze({ next, int, pick, chance, shuffle, weighted });
};
