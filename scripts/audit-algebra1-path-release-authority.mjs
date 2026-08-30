#!/usr/bin/env node
// Algebra I Path-bank release-authority audit.
// Read-only. Use --strict in CI after Phase 0 retires the stale compiler path.

import { readFileSync } from 'node:fs';

const files = {
  draft: 'drafts/algebra1.json',
  primary: 'seed/pathQuestionBank/algebra1_pathQuestionBank_seed.json',
  mirror: 'functions/seeds/pathQuestionBank/algebra1_pathQuestionBank_seed.json',
  builder: 'scripts/build-path-bank.mjs',
  verifier: 'scripts/verify-path-drafts.mjs',
};

const modules = [
  'algebra1LinearWriting.mjs',
  'algebra1LinearGraphing.mjs',
  'algebra1SystemsAndData.mjs',
  'algebra1Quadratics.mjs',
  'algebra1Exponentials.mjs',
  'algebra1PolynomialsAndFunctions.mjs',
  'algebra1Functions.mjs',
].map((name) => 'seed/pathQuestionBank/authoring/' + name);

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const docsIn = (value) => Array.isArray(value) ? value : (value.documents || value.items || value.questions || []);
const stableDocs = (value) => JSON.stringify(docsIn(value));

const draft = readJson(files.draft);
const primary = readJson(files.primary);
const mirror = readJson(files.mirror);
const builder = readFileSync(files.builder, 'utf8');
const verifier = readFileSync(files.verifier, 'utf8');
const oldSource = modules.map((path) => readFileSync(path, 'utf8')).join('\n');

const draftDocs = docsIn(draft);
const primaryDocs = docsIn(primary);
const mirrorDocs = docsIn(mirror);
const draftIds = new Set(draftDocs.map((doc) => String(doc?.id || '')).filter(Boolean));
const primaryIds = new Set(primaryDocs.map((doc) => String(doc?.id || '')).filter(Boolean));

const sourcePairs = [...oldSource.matchAll(/code:\s*'([^']+)'[\s\S]{0,240}?slug:\s*'([^']+)'/g)]
  .map((match) => match[1].toUpperCase() + '|' + match[2]);
const shippingPairs = primaryDocs.map((doc) =>
  String(doc.assessedConstruct || '').toUpperCase() + '|' + String(doc.familyId || '').split(':').pop()
);
const sourceSet = new Set(sourcePairs);
const shippingSet = new Set(shippingPairs);
const overlap = [...sourceSet].filter((pair) => shippingSet.has(pair));

const draftMatchesPrimary = stableDocs(draft) === stableDocs(primary);
const primaryMatchesMirror = stableDocs(primary) === stableDocs(mirror);
const builderCanWriteAlgebra1 = /algebra1:\s*['"]algebra1_pathQuestionBank_seed\.json['"]/.test(builder)
  && /writeFileSync\(/.test(builder)
  && /ALL_AUTHORED_STANDARDS/.test(builder);
const ordinaryVerifierBlocksPublishedIds = /existingIds\.has\(id\)/.test(verifier)
  && /id_already_published/.test(verifier);
const alreadyPublishedDraftIds = [...draftIds].filter((id) => primaryIds.has(id)).length;

console.log('# Algebra I Path release authority audit\n');
console.log('Draft documents: ' + draftDocs.length);
console.log('Primary shipping documents: ' + primaryDocs.length);
console.log('Functions mirror documents: ' + mirrorDocs.length);
console.log('draft documents == primary shipping documents: ' + (draftMatchesPrimary ? 'YES' : 'NO'));
console.log('primary shipping documents == Functions mirror: ' + (primaryMatchesMirror ? 'YES' : 'NO') + '\n');

console.log('## Competing legacy compiler\n');
console.log('Old Algebra I source families parsed: ' + sourceSet.size);
console.log('Shipping Algebra I families: ' + shippingSet.size);
console.log('Matching code+slug pairs: ' + overlap.length);
console.log('scripts/build-path-bank.mjs can write Algebra I from the old source: ' + (builderCanWriteAlgebra1 ? 'YES' : 'no') + '\n');

console.log('## Release verification gap\n');
console.log('Current draft ids already present in the shipping Algebra I bank: ' + alreadyPublishedDraftIds + '/' + draftIds.size);
console.log('Ordinary draft verifier blocks already-published ids: ' + (ordinaryVerifierBlocksPublishedIds ? 'YES' : 'no'));
console.log('A replacement release needs a bank-aware verifier/promotion path that allows ids already owned by Algebra I while still rejecting cross-bank collisions.\n');

const redFlags = [];
if (!draftMatchesPrimary) redFlags.push('draft_primary_drift');
if (!primaryMatchesMirror) redFlags.push('seed_mirror_drift');
if (builderCanWriteAlgebra1 && overlap !== shippingSet.size) redFlags.push('stale_builder_can_overwrite_shipping_bank');
if (ordinaryVerifierBlocksPublishedIds && alreadyPublishedDraftIds === draftIds.size) redFlags.push('no_in_place_release_verification_path');

console.log('Red flags: ' + (redFlags.length ? redFlags.join(', ') : 'none'));
if (process.argv.includes('--strict') && redFlags.length) process.exitCode = 1;
