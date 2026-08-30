#!/usr/bin/env node
// Development tool: for each family, how often does each distractor sit ABOVE
// the key?
//
// The rank probe says a family is biased; this says why. A distractor at 100%
// or 0% never crosses the key, so it cannot move the key's rank. A healthy
// family has one near 0 (the undershoot), one near 100 (the overshoot) and one
// somewhere in the middle (the situational quantity that straddles).
import { readFileSync } from 'node:fs';
import { samplePathInstances } from '../functions/shared/pathQuestionGeneration.mjs';
// The canonical label reader, not a copy of it. A copy in this file already
// missed escaped dollars and multiples of pi, and reported nothing at all for
// families the rank probe was flagging.
import { numericLabel } from '../functions/shared/asvabFidelity.mjs';

const file = process.argv[2] || 'drafts/asvab-ar.json';
const filter = process.argv[3] || '';
const draws = 300;
const documents = (JSON.parse(readFileSync(file, 'utf8')).documents || [])
  .filter((q) => !filter || q.id.includes(filter));

for (const question of documents) {
  // The template records which error each distractor represents; instances keep
  // it too, since stripping happens at the server boundary, not here.
  const above = new Map();
  const total = new Map();
  const nearKey = new Map();
  const keys = [];
  let counted = 0;
  for (const { question: instance } of samplePathInstances(question, draws)) {
    if (!instance) continue;
    const keyId = instance.responseFields[0].expected;
    const key = numericLabel(instance.choices.find((c) => c.id === keyId)?.label);
    if (key === null) continue;
    counted += 1;
    keys.push(key);
    for (const choice of instance.choices) {
      if (choice.id === keyId) continue;
      const code = choice.error || '(unnamed)';
      total.set(code, (total.get(code) || 0) + 1);
      const value = numericLabel(choice.label);
      if (value > key) above.set(code, (above.get(code) || 0) + 1);
      // The retired tier built every distractor as key + 1, + 2, + 3. A
      // distractor that sits a fixed small step from the key in nearly every
      // draw is that pattern reappearing, whatever the error is called, and it
      // is invisible in the above-key percentage: an always-plus-one distractor
      // reads a healthy 100%.
      //
      // The step has to be judged against the key's own size. An absolute
      // window of 2 flagged three sound families whose answers are fractions
      // between 0 and 1, where every choice is necessarily within 2 of every
      // other. Keys below 8 are left alone for that reason; the pattern this
      // looks for lived on keys like 16 and 504.
      if (Math.abs(key) >= 8 && Math.abs(value - key) <= 2 && value !== key) {
        nearKey.set(code, (nearKey.get(code) || 0) + 1);
      }
    }
  }
  if (!counted) { console.log(`${question.id}: non-numeric`); continue; }
  const parts = [...total.entries()].map(([code, n]) => `${code}=${Math.round(100 * (above.get(code) || 0) / n)}%`);
  keys.sort((a, b) => a - b);
  const at = (fraction) => keys[Math.min(keys.length - 1, Math.floor(fraction * keys.length))];
  const span = `key ${at(0.05)}..${at(0.95)} mid ${at(0.5)}`;
  const stepwise = [...total.entries()]
    .filter(([code, n]) => (nearKey.get(code) || 0) / n > 0.9)
    .map(([code]) => code);
  const warn = stepwise.length ? `  !! within 2 of the key: ${stepwise.join(', ')}` : '';
  console.log(`${String(question.id).padEnd(48)} above-key: ${parts.join('  ')}   [${span}]${warn}`);
}
