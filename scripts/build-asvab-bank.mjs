#!/usr/bin/env node
// Assemble the shipping ASVAB Path bank from the two authored subtests.
//
// This replaces scripts/build-asvab-drafts.mjs, which produced the bank by
// converting the course banks into ASVAB format. That bank was audited family
// by family and replaced: 476 of its 730 families built every distractor as
// correct + 1, + 2, + 3, the key was the smallest of four in 99.8% of numeric
// draws, and the key's choice id was the literal string `asvab-correct`. The
// families here are authored directly against the ASVAB blueprint instead, so
// there is no longer a course bank to convert from.
//
// The two subtests are authored separately because they are separate tests
// with separate registers — Arithmetic Reasoning is practical prose under 48
// words, Mathematics Knowledge is direct symbolic mathematics under 34 — and
// the fidelity gates are applied per subtest. This step only joins them and
// writes the files that ship.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');
const SOURCES = ['drafts/asvab-ar.json', 'drafts/asvab-mk.json'];
const OUTPUTS = [
  'drafts/asvab.json',
  'seed/pathQuestionBank/asvab_pathQuestionBank_seed.json',
  'functions/seeds/pathQuestionBank/asvab_pathQuestionBank_seed.json',
];

const documents = [];
for (const source of SOURCES) {
  const parsed = JSON.parse(readFileSync(path.join(ROOT, source), 'utf8'));
  const items = parsed.documents || [];
  if (!items.length) throw new Error(`${source} holds no documents`);
  documents.push(...items);
}

// The manifest rebuild throws on a document without a texas: alignment key and
// on a duplicate id across the whole seed directory. Fail here instead, where
// the message can name the offending family.
const seen = new Set();
for (const question of documents) {
  const id = String(question?.id || '').trim();
  if (!id) throw new Error('A document has no id');
  if (seen.has(id)) throw new Error(`Duplicate ASVAB id: ${id}`);
  seen.add(id);
  const aligned = (question.alignmentKeys || []).some((key) => /^texas:/i.test(String(key)));
  if (!aligned) throw new Error(`${id} carries no texas: alignment key`);
  const domain = question?.assessmentContext?.domainId;
  if (question?.assessmentContext?.framework !== 'asvab') throw new Error(`${id} is not declared as asvab`);
  if (!['arithmeticReasoning', 'mathematicsKnowledge'].includes(domain)) {
    throw new Error(`${id} declares an unknown ASVAB domain: ${domain}`);
  }
}

const payload = `${JSON.stringify({ documents }, null, 2)}\n`;
for (const output of OUTPUTS) writeFileSync(path.join(ROOT, output), payload);

const byDomain = documents.reduce((counts, q) => {
  const key = q.assessmentContext.domainId;
  return { ...counts, [key]: (counts[key] || 0) + 1 };
}, {});
const standards = new Set(documents.map((q) => `${q.assessedConstruct}/${q.assessmentContext.domainId}`));
console.log(`ASVAB bank: ${documents.length} families across ${standards.size} standard-subtest pairs.`);
console.log(`  arithmeticReasoning ${byDomain.arithmeticReasoning}   mathematicsKnowledge ${byDomain.mathematicsKnowledge}`);
console.log(`  written to ${OUTPUTS.length} files.`);
