#!/usr/bin/env node
// Algebra I TEKS Fidelity V2 bank builder.
//
// SOURCE OF TRUTH: drafts/algebra1.json
// MIRRORS:
//   seed/pathQuestionBank/algebra1_pathQuestionBank_seed.json
//   functions/seeds/pathQuestionBank/algebra1_pathQuestionBank_seed.json
//
// The Aug. 23 Adaptive V2 migration explicitly established the draft package as
// the authoring copy whose documents match the installed seed. Older
// seed/pathQuestionBank/authoring/algebra1*.mjs modules are a different,
// non-overlapping generation of content and MUST NOT be used to rebuild the
// shipping Algebra I bank during Fidelity V2.
//
// Usage:
//   node scripts/build-algebra1-fidelity-v2-bank.mjs --check
//   node scripts/build-algebra1-fidelity-v2-bank.mjs

import { readFileSync, writeFileSync } from 'node:fs';

const SOURCE = 'drafts/algebra1.json';
const MIRRORS = [
  'seed/pathQuestionBank/algebra1_pathQuestionBank_seed.json',
  'functions/seeds/pathQuestionBank/algebra1_pathQuestionBank_seed.json',
];
const checkOnly = process.argv.includes('--check');

const parse = (path) => JSON.parse(readFileSync(path, 'utf8'));
const source = parse(SOURCE);
const documents = Array.isArray(source.documents) ? source.documents : [];

if (documents.length !== 245) {
  throw new Error(`Algebra I Fidelity V2 source must contain 245 documents (49 standards × 5 families); found ${documents.length}.`);
}

const codes = new Map();
const ids = new Set();
for (const doc of documents) {
  if (!doc?.id) throw new Error('Every Algebra I family needs an id.');
  if (ids.has(doc.id)) throw new Error(`Duplicate Algebra I family id: ${doc.id}`);
  ids.add(doc.id);

  const texas = (doc.alignmentKeys || []).find((key) => String(key).startsWith('texas:'));
  if (!texas) throw new Error(`${doc.id} has no Texas alignment key.`);
  const code = String(texas).replace(/^texas:/, '');
  codes.set(code, (codes.get(code) || 0) + 1);
}

if (codes.size !== 49) {
  throw new Error(`Algebra I Fidelity V2 source must cover 49 standards; found ${codes.size}.`);
}
for (const [code, count] of codes) {
  if (count !== 5) throw new Error(`${code} must have exactly five production families; found ${count}.`);
}

const payload = {
  schemaVersion: 1,
  targetCollection: 'pathQuestionBank',
  courseId: 'algebra1',
  generatedBy: 'MathMaster Algebra I TEKS Fidelity V2 — drafts/algebra1.json',
  documents,
};
const rendered = `${JSON.stringify(payload, null, 2)}\n`;

if (checkOnly) {
  let drift = 0;
  for (const path of MIRRORS) {
    const mirror = parse(path);
    const sameDocs = JSON.stringify(mirror.documents || []) === JSON.stringify(documents);
    if (!sameDocs) {
      drift += 1;
      console.error(`✗ ${path} documents drift from ${SOURCE}`);
    } else {
      console.log(`✓ ${path} documents match ${SOURCE}`);
    }
  }
  console.log(`\n${documents.length} families · ${codes.size} standards · source ${SOURCE}`);
  if (drift) process.exitCode = 1;
} else {
  for (const path of MIRRORS) {
    writeFileSync(path, rendered);
    console.log(`Wrote ${path}`);
  }
  console.log(`\nBuilt Algebra I Fidelity V2 bank from ${SOURCE}: ${documents.length} families across ${codes.size} standards.`);
  console.log('Next: verify the draft, run semantic/cognitive/generator audits, rebuild the Path manifest, then run the full platform suite.');
}
