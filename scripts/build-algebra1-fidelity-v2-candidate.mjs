#!/usr/bin/env node
// Build a non-shipping Algebra I Fidelity V2 candidate by replacing complete
// five-family standards in drafts/algebra1.json with staged override packages.
//
// Nothing in this script writes the shipping draft or seed mirrors. It creates:
//   drafts/algebra1.fidelity-v2.candidate.json
//
// Staged packages live in:
//   drafts/fidelity-v2/algebra1/<TEKS>.json
//
// This lets each standard be authored and verified independently, while the
// candidate still passes the same whole-bank checks before any promotion.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'drafts/algebra1.json';
const OVERRIDE_DIR = 'drafts/fidelity-v2/algebra1';
const OUTPUT = 'drafts/algebra1.fidelity-v2.candidate.json';

const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const codeOf = (doc) => String((doc.alignmentKeys || []).find((key) => String(key).startsWith('texas:')) || '')
  .replace(/^texas:/, '');

const base = read(BASE);
const baseDocs = Array.isArray(base.documents) ? base.documents : [];
if (baseDocs.length !== 245) throw new Error(`Expected 245 base Algebra I families; found ${baseDocs.length}.`);

const overrideFiles = readdirSync(OVERRIDE_DIR)
  .filter((name) => name.endsWith('.json'))
  .sort();

const overrides = new Map();
const stagedIds = new Set();

for (const file of overrideFiles) {
  const path = join(OVERRIDE_DIR, file);
  const payload = read(path);
  const code = String(payload.standard || '').trim().toUpperCase();
  const docs = Array.isArray(payload.documents) ? payload.documents : [];

  if (!/^A\.\d+[A-Z]$/.test(code)) throw new Error(`${path}: invalid or missing standard code.`);
  if (docs.length !== 5) throw new Error(`${path}: ${code} must stage exactly five replacement families; found ${docs.length}.`);
  if (overrides.has(code)) throw new Error(`${code} is staged by more than one override file.`);

  for (const doc of docs) {
    if (codeOf(doc) !== code) throw new Error(`${path}: ${doc.id || 'unnamed family'} does not align to ${code}.`);
    if (!doc.id || !doc.familyId) throw new Error(`${path}: every staged family needs id and familyId.`);
    if (stagedIds.has(doc.id)) throw new Error(`${path}: duplicate staged id ${doc.id}.`);
    stagedIds.add(doc.id);
  }
  overrides.set(code, docs);
}

const stagedCodes = new Set(overrides.keys());
const carried = baseDocs.filter((doc) => !stagedCodes.has(codeOf(doc)));
const replacedCounts = new Map();
baseDocs.forEach((doc) => {
  const code = codeOf(doc);
  if (stagedCodes.has(code)) replacedCounts.set(code, (replacedCounts.get(code) || 0) + 1);
});
for (const code of stagedCodes) {
  if (replacedCounts.get(code) !== 5) throw new Error(`${code}: base bank did not contain exactly five families to replace.`);
}

const replacementDocs = [...overrides.values()].flat();
const documents = [...carried, ...replacementDocs].sort((a, b) => String(a.id).localeCompare(String(b.id)));
if (documents.length !== 245) throw new Error(`Candidate must contain 245 families; found ${documents.length}.`);

const ids = new Set();
const counts = new Map();
for (const doc of documents) {
  if (ids.has(doc.id)) throw new Error(`Candidate duplicate id ${doc.id}.`);
  ids.add(doc.id);
  const code = codeOf(doc);
  counts.set(code, (counts.get(code) || 0) + 1);
}
if (counts.size !== 49) throw new Error(`Candidate must cover 49 standards; found ${counts.size}.`);
for (const [code, count] of counts) if (count !== 5) throw new Error(`${code}: candidate contains ${count} families.`);

writeFileSync(OUTPUT, `${JSON.stringify({ documents }, null, 2)}\n`);
console.log(`Built ${OUTPUT}`);
console.log(`Staged standards: ${[...stagedCodes].join(', ') || 'none'}`);
console.log(`Candidate: ${documents.length} families across ${counts.size} standards.`);
console.log('\nNext commands:');
console.log(`  node scripts/verify-path-drafts.mjs ${OUTPUT} --allow-existing-ids`);
console.log(`  node scripts/audit-algebra1-cognitive-fidelity-v2.mjs --bank ${OUTPUT}`);
console.log(`  node scripts/audit-algebra1-semantic-fidelity-v2.mjs --bank ${OUTPUT}`);
console.log('\nDo not promote until all staged standards pass generated-instance inspection and the full suite.');
