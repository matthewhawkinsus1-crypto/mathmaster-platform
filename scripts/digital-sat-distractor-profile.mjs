#!/usr/bin/env node
// For each Digital SAT family, where does every distractor sit relative to the
// key? A family whose distractors all fall on one side is answerable by picking
// the biggest (or smallest) number, whatever the misconceptions are called.
//
// This is the diagnostic the ASVAB rebuild was tuned against: read the
// above-key percentage per distractor, find the one that is meant to straddle
// the key, and move the parameter that drives it until it lands near 50%.
//
//   node scripts/digital-sat-distractor-profile.mjs [familyIdSubstring] [--draws 400]
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { samplePathInstances } from '../functions/shared/pathQuestionGeneration.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');
const args = process.argv.slice(2);
const drawsIndex = args.indexOf('--draws');
const DRAWS = drawsIndex === -1 ? 400 : Number(args[drawsIndex + 1]);
// Skip the flag and its value when looking for the family filter, or `--draws
// 200` donates "200" as the filter and nothing matches.
const filter = args.filter((a, i) => !a.startsWith('--') && i !== drawsIndex + 1)[0] || '';

const docs = JSON.parse(readFileSync(path.join(ROOT, 'drafts/digitalSAT.v2.1.json'), 'utf8')).documents;

const numericLabel = (label) => {
  // Labels arrive as numbers as often as strings — a generator that derives an
  // integer emits an integer. An earlier version of this check tested
  // `typeof label !== 'string'` and returned null for every numeric label,
  // which silently reduced two of the checks below to the LaTeX-labelled
  // families only.
  if (typeof label === 'number') return Number.isFinite(label) ? label : null;
  if (typeof label !== 'string') return null;
  const cleaned = label
    .replace(/\$/g, '')
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/[{}]/g, ' ')
    .replace(/,/g, '')
    .trim();
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
};

let printed = 0;
for (const doc of docs) {
  if (filter && !doc.id.includes(filter)) continue;
  if (doc.assessmentItemFormat !== 'multipleChoice') continue;
  const above = new Map();
  const total = new Map();
  const keys = [];
  for (const { question } of samplePathInstances(doc, DRAWS)) {
    if (!question) continue;
    const keyId = (question.responseFields || [])[0]?.expected;
    const key = numericLabel((question.choices || []).find((c) => c.id === keyId)?.label);
    if (key === null) continue;
    keys.push(key);
    for (const choice of question.choices || []) {
      if (choice.id === keyId) continue;
      const value = numericLabel(choice.label);
      if (value === null) continue;
      total.set(choice.id, (total.get(choice.id) || 0) + 1);
      if (value > key) above.set(choice.id, (above.get(choice.id) || 0) + 1);
    }
  }
  if (!keys.length) continue;
  printed += 1;
  keys.sort((a, b) => a - b);
  const at = (f) => keys[Math.min(keys.length - 1, Math.floor(f * keys.length))];
  const parts = [...total.entries()]
    .map(([id, n]) => `${id.replace('choice-', '')}=${Math.round((100 * (above.get(id) || 0)) / n)}%`);
  const pcts = [...total.entries()].map(([id, n]) => (100 * (above.get(id) || 0)) / n);
  const straddles = pcts.some((p) => p > 10 && p < 90);
  console.log(`${straddles ? '  ok' : 'FLAT'}  ${doc.id.padEnd(60)} above-key ${parts.join(' ')}  [key ${at(0.05)}..${at(0.95)}]`);
}
console.log(`\n${printed} numeric multiple-choice families profiled.`);
