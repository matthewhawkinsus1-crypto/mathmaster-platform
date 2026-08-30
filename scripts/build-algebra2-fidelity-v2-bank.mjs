#!/usr/bin/env node
// Algebra II TEKS Fidelity V2 bank builder.
//
// SOURCE OF TRUTH: drafts/algebra2.json
// MIRRORS:
//   seed/pathQuestionBank/algebra2_pathQuestionBank_seed.json
//   functions/seeds/pathQuestionBank/algebra2_pathQuestionBank_seed.json
//
// The Fidelity V2 audit reconciled one newer inverse-reflection family from the
// shipping seed back into the draft before declaring this source canonical.
// Older executable authoring modules are therefore not allowed to rebuild the
// shipping Algebra II bank during this work.
//
// Usage:
//   node scripts/build-algebra2-fidelity-v2-bank.mjs --check
//   node scripts/build-algebra2-fidelity-v2-bank.mjs

import { readFileSync, writeFileSync } from 'node:fs';

const SOURCE = 'drafts/algebra2.json';
const MIRRORS = [
  'seed/pathQuestionBank/algebra2_pathQuestionBank_seed.json',
  'functions/seeds/pathQuestionBank/algebra2_pathQuestionBank_seed.json',
];
const checkOnly = process.argv.includes('--check');

const parse = (path) => JSON.parse(readFileSync(path, 'utf8'));
const source = parse(SOURCE);
const documents = Array.isArray(source.documents) ? source.documents : [];

if (documents.length !== 240) {
  throw new Error(`Algebra II Fidelity V2 source must contain 240 documents (48 standards × 5 families); found ${documents.length}.`);
}

const codes = new Map();
const ids = new Set();
for (const doc of documents) {
  if (!doc?.id) throw new Error('Every Algebra II family needs an id.');
  if (ids.has(doc.id)) throw new Error(`Duplicate Algebra II family id: ${doc.id}`);
  ids.add(doc.id);
  const texas = (doc.alignmentKeys || []).find((key) => String(key).startsWith('texas:A2.'));
  if (!texas) throw new Error(`${doc.id} has no Algebra II Texas alignment key.`);
  const code = String(texas).replace(/^texas:/, '');
  codes.set(code, (codes.get(code) || 0) + 1);
}

if (codes.size !== 48) {
  throw new Error(`Algebra II Fidelity V2 source must cover 48 standards; found ${codes.size}.`);
}
for (const [code, count] of codes) {
  if (count !== 5) throw new Error(`${code} must have exactly five production families; found ${count}.`);
}

const payload = {
  schemaVersion: 1,
  targetCollection: 'pathQuestionBank',
  courseId: 'algebra2',
  generatedBy: 'MathMaster Algebra II TEKS Fidelity V2 — drafts/algebra2.json',
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
  console.log(`\nBuilt Algebra II Fidelity V2 bank from ${SOURCE}: ${documents.length} families across ${codes.size} standards.`);
}
