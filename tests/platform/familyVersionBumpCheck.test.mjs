// A field that asks for another kind of answer moves familyVersion (the
// owner, 2026-10-20; student pass 3, W7-1 decision 5).
//
// scripts/check-family-version-bumps.mjs compares each bank item with the PR's
// base: at the same version, a response field may change its key's text but
// not the kind of answer it asks for (inputProfile, answerFormat,
// equivalence). Run against `dc2ae1ad^` it lists exactly the ten Algebra I
// fields re-asked there as inequalities; CI runs it on every pull request that
// touches a bank.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { familyVersionViolations, fieldKind } from '../../scripts/check-family-version-bumps.mjs';

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

test('CI runs the check against the pull request\'s base on every change to a bank', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/answer-acceptance-audit.yml', import.meta.url), 'utf8');
  const pullRequestPaths = workflow.slice(workflow.indexOf('pull_request:'), workflow.indexOf('jobs:'));
  for (const watched of ["'functions/seeds/pathQuestionBank/**'", "'functions/seeds/secureAssessments/**'", "'scripts/check-family-version-bumps.mjs'"]) {
    assert.ok(pullRequestPaths.includes(watched), `pull requests touching ${watched} run it`);
  }
  assert.match(workflow, /fetch-depth: 2/);
  assert.match(workflow, /if: github\.event_name == 'pull_request'\s*\n\s+env:\s*\n\s+BASE_SHA: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
  assert.match(workflow, /node scripts\/check-family-version-bumps\.mjs --base "\$BASE_SHA"/);
});
