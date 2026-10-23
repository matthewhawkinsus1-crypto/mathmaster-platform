// A field that asks for another kind of answer moves familyVersion (the
// owner, 2026-10-20; student pass 3, W7-1 decision 5).
//
// scripts/check-family-version-bumps.mjs compares each bank item with the PR's
// base: at the same version, a response field may change its key's text but
// not the kind of answer it asks for (inputProfile, answerFormat,
// equivalence). Run against `dc2ae1ad^` it listed exactly the ten Algebra I
// fields re-asked there as inequalities, until their families moved (GR21,
// below); CI runs it on every pull request that touches a bank.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { documentsIn, familyVersionViolations, fieldKind } from '../../scripts/check-family-version-bumps.mjs';
import { runsOnPullRequest } from './helpers/ciWorkflows.mjs';

const item = ({ id = 'mm_A_2A_v2_bounded-range', familyVersion = 3, fields }) => ({ id, familyVersion, responseFields: fields });
const field = (overrides = {}) => ({ id: 'answer', expected: '[2, 5]', inputProfile: 'interval', ...overrides });
const check = (before, after) => familyVersionViolations({ file: 'bank.json', baseDocuments: [before], headDocuments: [after] });

test('a field re-asked as another kind of answer at the same version is refused', () => {
  const violations = check(item({ fields: [field()] }), item({ fields: [field({ expected: '2 <= y <= 5', inputProfile: 'inequality' })] }));
  assert.equal(violations.length, 1);
  assert.deepEqual(violations[0], {
    file: 'bank.json', id: 'mm_A_2A_v2_bounded-range', version: 3, field: 'answer',
    before: fieldKind(field()), after: fieldKind({ inputProfile: 'inequality' }),
  });
  for (const change of [{ answerFormat: 'mixedNumber' }, { equivalence: 'interval' }, { inputProfile: 'number' }]) {
    assert.equal(check(item({ fields: [field()] }), item({ fields: [field(change)] })).length, 1, JSON.stringify(change));
  }
});

test('the same change with a version move, a key spelled anew, a new item or field, and a removed field pass', () => {
  assert.deepEqual(check(item({ fields: [field()] }), item({ familyVersion: 4, fields: [field({ inputProfile: 'inequality' })] })), []);
  assert.deepEqual(check(item({ fields: [field()] }), item({ fields: [field({ expected: '[2,5]' })] })), []);
  assert.deepEqual(familyVersionViolations({ file: 'bank.json', baseDocuments: [], headDocuments: [item({ fields: [field()] })] }), []);
  assert.deepEqual(check(item({ fields: [field()] }), item({ fields: [field(), field({ id: 'range', inputProfile: 'inequality' })] })), []);
  assert.deepEqual(check(item({ fields: [field(), field({ id: 'range' })] }), item({ fields: [field()] })), []);
});

test('an item without familyVersion is versioned by `version`; one without either compares as unversioned', () => {
  const plain = (version, inputProfile) => ({ id: 'x', version, responseFields: [field({ inputProfile })] });
  assert.equal(check(plain(2, 'interval'), plain(2, 'inequality')).length, 1);
  assert.deepEqual(check(plain(2, 'interval'), plain(3, 'inequality')), []);
  const bare = (inputProfile) => ({ id: 'y', responseFields: [field({ inputProfile })] });
  assert.equal(check(bare('interval'), bare('inequality')).length, 1);
});

test('the kind is read from the stored document the compiler makes', () => {
  const compile = (authored) => ({ ...authored, responseFields: (authored.fields || []).map((entry) => ({ ...entry })) });
  const violations = familyVersionViolations({
    file: 'bank.json',
    baseDocuments: [{ id: 'z', familyVersion: 1, fields: [field()] }],
    headDocuments: [{ id: 'z', familyVersion: 1, fields: [field({ inputProfile: 'inequality' })] }],
    compile,
  });
  assert.equal(violations.length, 1);
});

test('a variant\'s own fields, notation and toolProfile are checked too (CI04, Codex on #507)', () => {
  const item = (variantField, extra = {}) => ({ id: 'v', familyVersion: 2, responseFields: [field()], variants: [{ coverageKey: 'core', responseFields: [variantField] }], ...extra });
  const reasked = familyVersionViolations({ file: 'bank.json', baseDocuments: [item(field())], headDocuments: [item(field({ inputProfile: 'inequality' }))] });
  assert.deepEqual(reasked.map((violation) => violation.field), ['variants[core].answer'], 'a variant re-asked as another kind');
  assert.equal(familyVersionViolations({ file: 'bank.json', baseDocuments: [item(field())], headDocuments: [item(field({ inputProfile: 'inequality' }), { familyVersion: 3 })] }).length, 0, 'unless the version moved');
  const notation = familyVersionViolations({ file: 'bank.json', baseDocuments: [{ id: 'n', familyVersion: 1, responseFields: [field()] }], headDocuments: [{ id: 'n', familyVersion: 1, responseFields: [field({ notation: 'interval' })] }] });
  assert.equal(notation.length, 1, 'a notation change grades differently');
  const profile = (toolProfile) => ({ id: 't', familyVersion: 1, responseFields: [field({ toolProfile })] });
  assert.equal(familyVersionViolations({ file: 'bank.json', baseDocuments: [profile({ keypad: 'algebra', calculator: 'none' })], headDocuments: [profile({ calculator: 'none', keypad: 'algebra' })] }).length, 0, 'the same toolProfile in another key order is the same kind');
  assert.equal(familyVersionViolations({ file: 'bank.json', baseDocuments: [profile({ keypad: 'algebra' })], headDocuments: [profile({ keypad: 'number' })] }).length, 1);
});

// The ten fields the check lists at `dc2ae1ad^` (GR21). They asked for
// interval notation at familyVersion 3 and ask for an inequality now; their
// seven families moved to version 4, so an interval answer recorded under the
// old question is never read as an answer to the new one (moved 2026-10-23).
// The other copies of the bank are held to this one by the shipping-seed
// parity check in CI.
const REASKED_AT_DC2AE1AD = Object.freeze({
  'mm_A_2A_v2_bounded-range': ['answer'],
  'mm_A_2A_v2_context-domain-range': ['domain', 'range'],
  'mm_A_2A_v2_decreasing-range-error': ['answer'],
  'mm_A_6A_v2_projectile-context-domain-range': ['domain', 'range'],
  'mm_A_6A_v2_restricted-domain-range': ['domain', 'range'],
  'mm_A_6A_v2_downward-range-error': ['answer'],
  'mm_A_9A_v2_context-restricted-domain': ['answer'],
});

test('the ten Algebra I fields re-asked at dc2ae1ad ship at a version their interval answers were not recorded under', () => {
  const bankFile = 'functions/seeds/pathQuestionBank/algebra1_pathQuestionBank_seed.json';
  const shipped = documentsIn(JSON.parse(readFileSync(new URL(`../../${bankFile}`, import.meta.url), 'utf8')))
    .filter((document) => REASKED_AT_DC2AE1AD[document.id]);
  assert.equal(shipped.length, 7, 'every re-asked family still ships');
  // These families as they stood before dc2ae1ad: interval notation, version 3.
  const before = shipped.map((document) => ({
    ...document,
    familyVersion: 3,
    responseFields: document.responseFields.map((entry) => (
      REASKED_AT_DC2AE1AD[document.id].includes(entry.id) ? { ...entry, inputProfile: 'interval' } : entry
    )),
  }));
  const reasked = shipped.flatMap((document) => document.responseFields
    .filter((entry) => REASKED_AT_DC2AE1AD[document.id].includes(entry.id) && entry.inputProfile === 'inequality'));
  assert.equal(reasked.length, 10, 'the ten fields still ask for an inequality');
  assert.deepEqual(familyVersionViolations({ file: bankFile, baseDocuments: before, headDocuments: shipped }), []);
});

test('CI runs the check against the pull request\'s base on every change to a bank', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/answer-acceptance-audit.yml', import.meta.url), 'utf8');
  for (const changed of ['functions/seeds/pathQuestionBank/algebra1_pathQuestionBank_seed.json', 'functions/seeds/secureAssessments/unit3.json', 'scripts/check-family-version-bumps.mjs']) {
    assert.ok(runsOnPullRequest('answer-acceptance-audit.yml', changed), `a pull request changing ${changed} runs it`);
  }
  assert.match(workflow, /fetch-depth: 2/);
  assert.match(workflow, /if: github\.event_name == 'pull_request'\s*\n\s+env:\s*\n\s+BASE_SHA: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
  assert.match(workflow, /node scripts\/check-family-version-bumps\.mjs --base "\$BASE_SHA"/);
});
