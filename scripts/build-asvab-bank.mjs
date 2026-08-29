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
//
// CCMR Fidelity V2 progression
// ----------------------------
// The shipping bank carries two tiers. Tier 1 (`ccmrFamilyRole: 'direct'`) is
// the authored bank this script builds. Tier 2 (`ccmrFamilyRole: 'challenge'`)
// is what a student sees on a repeat session after strong direct evidence, and
// the runtime selects it in functions/index.js by `ccmrChallengeTier`. The
// challenge tier is built by scripts/build-ccmr-fidelity-v2.mjs, not here, so
// this script carries the existing challenge families through untouched rather
// than deleting them every time the authored bank is rebuilt.
//
// The direct metadata is stamped here rather than by build-ccmr-fidelity-v2.mjs
// because that script also rewrites `prompt`, appending "Work without a
// calculator and select the best answer." to every ASVAB item. These families
// are register-controlled — Mathematics Knowledge is capped at 34 words and two
// sentences — so running it over them would push a large share of the bank past
// its own fidelity gate. Stamping the same fields here keeps the metadata
// identical and leaves the authored wording alone.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAssessmentStandardReferences } from '../src/platform/ccmr/assessmentStandardReferences.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');
const SOURCES = ['drafts/asvab-ar.json', 'drafts/asvab-mk.json'];
const SHIPPING = 'seed/pathQuestionBank/asvab_pathQuestionBank_seed.json';
const OUTPUTS = [
  'drafts/asvab.json',
  SHIPPING,
  'functions/seeds/pathQuestionBank/asvab_pathQuestionBank_seed.json',
];

const codeOf = (question) => String((question.alignmentKeys || [])
  .find((key) => /^texas:/i.test(String(key))) || '').replace(/^texas:/i, '').toUpperCase();

// A2.6L is assessed in both subtests, so the standard resolves to two official
// references. Each family belongs to exactly one subtest, so cite the one it is
// actually written for and fall back to the standard's full reference list only
// if the domain does not resolve.
const referencesFor = (question) => {
  const all = getAssessmentStandardReferences(codeOf(question), 'asvab');
  const domain = question?.assessmentContext?.domainId;
  const scoped = all.filter((reference) => reference.domainId === domain);
  return scoped.length ? scoped : all;
};

const stampDirectFidelity = (question) => {
  const references = referencesFor(question);
  if (!references.length) throw new Error(`${question.id} resolves no official ASVAB reference`);
  return {
    ...question,
    ccmrChallengeTier: 1,
    ccmrFamilyRole: 'direct',
    ccmrFidelity: {
      version: 2,
      variantKind: 'direct-framework-adaptation',
      responseMode: 'multipleChoice',
      officialReferenceIds: references.map((reference) => reference.id),
      officialReferenceCodes: references.map((reference) => reference.officialCode).filter(Boolean),
      officialReferencePrecision: references.map((reference) => reference.precision),
      directAssessmentEvidence: true,
      sourceFamilyId: question.familyId,
      sourcePrompt: question.prompt,
    },
  };
};

const authored = [];
for (const source of SOURCES) {
  const parsed = JSON.parse(readFileSync(path.join(ROOT, source), 'utf8'));
  const items = parsed.documents || [];
  if (!items.length) throw new Error(`${source} holds no documents`);
  authored.push(...items.map(stampDirectFidelity));
}

// Carry the challenge tier through from whatever is already shipping.
let challenge = [];
try {
  const shipping = JSON.parse(readFileSync(path.join(ROOT, SHIPPING), 'utf8'));
  challenge = (shipping.documents || []).filter((question) => question.ccmrFamilyRole === 'challenge');
} catch {
  challenge = [];
}

const documents = [...authored, ...challenge];

// The manifest rebuild throws on a document without a texas: alignment key and
// on a duplicate id across the whole seed directory. Fail here instead, where
// the message can name the offending family.
const seen = new Set();
for (const question of documents) {
  const id = String(question?.id || '').trim();
  if (!id) throw new Error('A document has no id');
  if (seen.has(id)) throw new Error(`Duplicate ASVAB id: ${id}`);
  seen.add(id);
  if (!codeOf(question)) throw new Error(`${id} carries no texas: alignment key`);
  const domain = question?.assessmentContext?.domainId;
  if (question?.assessmentContext?.framework !== 'asvab') throw new Error(`${id} is not declared as asvab`);
  if (!['arithmeticReasoning', 'mathematicsKnowledge'].includes(domain)) {
    throw new Error(`${id} declares an unknown ASVAB domain: ${domain}`);
  }
}

const payload = `${JSON.stringify({ documents }, null, 2)}\n`;
for (const output of OUTPUTS) writeFileSync(path.join(ROOT, output), payload);

const byDomain = authored.reduce((counts, q) => {
  const key = q.assessmentContext.domainId;
  return { ...counts, [key]: (counts[key] || 0) + 1 };
}, {});
const standards = new Set(authored.map((q) => `${q.assessedConstruct}/${q.assessmentContext.domainId}`));
console.log(`ASVAB bank: ${authored.length} direct families across ${standards.size} standard-subtest pairs.`);
console.log(`  arithmeticReasoning ${byDomain.arithmeticReasoning}   mathematicsKnowledge ${byDomain.mathematicsKnowledge}`);
console.log(`  challenge families carried through: ${challenge.length}`);
console.log(`  ${documents.length} documents written to ${OUTPUTS.length} files.`);
