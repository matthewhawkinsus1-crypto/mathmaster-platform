#!/usr/bin/env node
/*
 * Capture the golden snapshot of every registered Question Family version.
 *
 *   node scripts/capture-question-family-golden.mjs            print a summary
 *   node scripts/capture-question-family-golden.mjs --write    write the fixture
 *
 * The fixture is a RECORD of what shipped, not something to regenerate: it was
 * written from main at 9396a77, before any family gained special cases, and
 * tests/platform/questionFamilyHistoricalPins.test.mjs holds every later build
 * to it. Re-writing it from a newer build would erase exactly the evidence it
 * exists to keep, so --write refuses to overwrite a family version the fixture
 * already records. A NEW family version is added with --write (it appends);
 * changing a recorded one is never done here.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { allRegisteredQuestionFamilies } from '../functions/shared/questionFamilyRegistry.mjs';
import { computeQuestionFamilyGoldenSnapshot } from '../tests/platform/helpers/questionFamilyGoldenSnapshot.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const GOLDEN_FIXTURE = path.join(ROOT, 'tests/platform/fixtures/questionFamilyGolden.json');

/** JSON indented to `depth` levels, every deeper value on one line: one pin per line, reviewable in a diff. */
const stringifyToDepth = (value, depth, indent = '') => {
  if (depth <= 0 || value === null || typeof value !== 'object') return JSON.stringify(value);
  const inner = `${indent} `;
  const entries = Array.isArray(value)
    ? value.map((entry) => `${inner}${stringifyToDepth(entry, depth - 1, inner)}`)
    : Object.entries(value).map(([key, entry]) => `${inner}${JSON.stringify(key)}: ${stringifyToDepth(entry, depth - 1, inner)}`);
  if (!entries.length) return Array.isArray(value) ? '[]' : '{}';
  return Array.isArray(value)
    ? `[\n${entries.join(',\n')}\n${indent}]`
    : `{\n${entries.join(',\n')}\n${indent}}`;
};

const existing = fs.existsSync(GOLDEN_FIXTURE) ? JSON.parse(fs.readFileSync(GOLDEN_FIXTURE, 'utf8')) : null;
const recorded = new Set(Object.keys(existing?.families || {}));
const pending = allRegisteredQuestionFamilies().filter((family) => (
  family.scope === 'platform' && !recorded.has(`${family.id}@${family.version}`)
));

if (!pending.length) {
  console.log(`Every registered family version is already recorded in ${path.relative(ROOT, GOLDEN_FIXTURE)}.`);
} else {
  const snapshot = computeQuestionFamilyGoldenSnapshot(pending);
  Object.entries(snapshot).forEach(([key, entry]) => {
    console.log(`${key}: ${entry.sequences['golden|slot-a'].length} sequence entries, capacity ${entry.capacity?.capacity}${entry.capacity?.exact ? '' : ' (estimate)'}`);
  });
  if (process.argv.includes('--write')) {
    const next = {
      note: 'Recorded output of each Question Family version. Never regenerate a recorded entry: see scripts/capture-question-family-golden.mjs.',
      recordedAt: existing?.recordedAt || { commit: '9396a77', date: '2026-10-04' },
      families: { ...(existing?.families || {}), ...snapshot },
    };
    fs.mkdirSync(path.dirname(GOLDEN_FIXTURE), { recursive: true });
    fs.writeFileSync(GOLDEN_FIXTURE, `${stringifyToDepth(next, 4)}\n`);
    console.log(`Wrote ${pending.length} family version(s) to ${path.relative(ROOT, GOLDEN_FIXTURE)}.`);
  } else {
    console.log('Dry run. Pass --write to record these.');
  }
}
