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
      if (numericLabel(choice.label) > key) above.set(code, (above.get(code) || 0) + 1);
    }
  }
  if (!counted) { console.log(`${question.id}: non-numeric`); continue; }
  const parts = [...total.entries()].map(([code, n]) => `${code}=${Math.round(100 * (above.get(code) || 0) / n)}%`);
  keys.sort((a, b) => a - b);
  const at = (fraction) => keys[Math.min(keys.length - 1, Math.floor(fraction * keys.length))];
  const span = `key ${at(0.05)}..${at(0.95)} mid ${at(0.5)}`;
  console.log(`${String(question.id).padEnd(48)} above-key: ${parts.join('  ')}   [${span}]`);
}
