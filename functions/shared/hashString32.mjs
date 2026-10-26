/*
 * THE PLATFORM'S 32-BIT STRING HASH, ON ITS OWN (PF01).
 *
 * FNV-1a over a string's UTF-16 code units, the hash the platform's seeded
 * generators and its learner tokens have always used. It was defined inside the
 * question family engine (questionFamilyEngine.mjs, with the family contract
 * under it: about 6 KB gzip), and a student's Home reaches it from
 * questionGenerationIdentity.mjs to name the student's seat on an assignment:
 * the opaque learner token, and where a provisional seat lands. The hash is
 * eight lines and needs nothing, so it lives here and the engine stays out of
 * the first load (scripts/first-load-baseline.json).
 *
 * The engine imports this and re-exports hashString32, so every caller keeps its
 * import and gets the number it always got. Do not change the arithmetic: the
 * seat tokens stored on assignments, and the order each family deals its
 * questions in, come from it (tests/platform/hashString32.test.mjs holds it to a
 * copy of the original).
 *
 * Pure: no Firestore, no DOM, no imports.
 */

export const hashString32 = (value, seed = 0x811c9dc5) => {
  let hash = seed >>> 0;
  const text = String(value ?? '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
};
