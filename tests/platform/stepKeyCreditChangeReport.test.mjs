// The read-only report behind the release runbook's step 0 (W5-5 decision 7):
// which recorded step credits release 1's step-state key would move.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { compactStepStateKey } from '../../functions/shared/attemptPolicy.mjs';
import {
  derivedStepCredit,
  gradeDocumentChanges,
  liveStateKey,
  mixesPushQRenderings,
  parseReportArgs,
  releaseStateKey,
  runStepKeyCreditReport,
} from '../../scripts/report-step-key-credit-changes.mjs';

const runtime = createRequire(import.meta.url)('../../functions/lib/classroomGradeRuntime.js');
const SOURCE = readFileSync(new URL('../../scripts/report-step-key-credit-changes.mjs', import.meta.url), 'utf8');
// The code alone: the header comment names the write modes it does not have.
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const step = (equationAfter, extra = {}) => ({ variantIndex: 0, equationAfter, earned: 1, possible: 1, expectedTotalPoints: 4, ...extra });
const record = (steps, extra = {}) => ({ status: 'attempted', bestPartialCredit: 0, variantIndex: 0, stepGrades: steps, ...extra });

test('release 1\'s key is compactStepStateKey, rule for rule', () => {
  for (const value of ['2~ x = 4', '2 x=4', '1\\left(x+1\\right)=3', 'x − 2 = 5', '=1\\left(x\\right)', '{1\\left(2\\right)}', ' 3~x ']) {
    assert.equal(releaseStateKey(value), compactStepStateKey(value), value);
  }
});

test('the live key keeps the tie and push Q\'s 1 apart; the release key does not', () => {
  assert.notEqual(liveStateKey('2~ x=4'), liveStateKey('2 x=4'));
  assert.equal(releaseStateKey('2~ x=4'), releaseStateKey('2 x=4'));
  assert.notEqual(liveStateKey('1\\left(x+1\\right)=3'), liveStateKey('\\left(x+1\\right)=3'));
  assert.equal(releaseStateKey('1\\left(x+1\\right)=3'), releaseStateKey('\\left(x+1\\right)=3'));
});

test('the derivation is the release\'s own, on every case here', () => {
  const cases = [
    record([step('2~ x=4'), step('2 x=4'), step('x=2')]),
    record([step('1\\left(x\\right)=3'), step('\\left(x\\right)=3')]),
    record([step('x=1', { accepted: false }), step('x=1')]),
    record([step('x=1', { expectedTotalPoints: 0 }), step('x=1', { expectedTotalPoints: 0 })]),
    record([step('x=1', { variantIndex: 1 })], { variantIndex: 1 }),
    record([]),
  ];
  for (const entry of cases) {
    const normalized = runtime.normalizeStoredQuestionRecord(entry);
    assert.equal(derivedStepCredit(normalized, releaseStateKey), runtime.storedAlgebraStepPartialCredit(normalized));
  }
});

test('a state written in both renderings is counted once: its credit falls to what the server stored, never below', () => {
  // Live: three new states (3 of 4 points, 75). Release: the tie and its spacing are one state (2 of 4, 50).
  const mixed = record([step('2~ x=4'), step('2 x=4'), step('x=2')], { bestPartialCredit: 60 });
  const { changes, counts } = gradeDocumentChanges('s1', { gradesByAssignment: { a1: { 0: mixed } } });
  assert.equal(counts.recordsWithSteps, 1);
  assert.equal(counts.recordsWithTie, 1);
  assert.equal(counts.parityMismatches, 0);
  assert.equal(changes.length, 1);
  assert.deepEqual(
    { liveDerived: changes[0].liveDerived, releaseDerived: changes[0].releaseDerived, liveCredit: changes[0].liveCredit, releaseCredit: changes[0].releaseCredit, direction: changes[0].direction },
    { liveDerived: 75, releaseDerived: 50, liveCredit: 75, releaseCredit: 60, direction: 'down' },
  );
});

test('no change where the stored credit already decides, the answer is correct, or nothing mixes', () => {
  const data = {
    gradesByAssignment: {
      a1: {
        0: record([step('2~ x=4'), step('2 x=4'), step('x=2')], { bestPartialCredit: 80 }), // stored 80 ≥ 75
        1: record([step('2~ x=4'), step('2 x=4')], { status: 'correct' }),
        2: record([step('2~ x=4'), step('x=2')]), // one rendering only: today's data
        3: 'attempted',
        4: { status: 'attempted' },
      },
    },
  };
  const { changes, counts } = gradeDocumentChanges('s1', data);
  assert.equal(changes.length, 0);
  assert.equal(counts.records, 4); // the string record is not an object record
  assert.equal(counts.recordsWithSteps, 3);
});

test('push Q\'s two renderings are found and listed; a teacher override is marked', () => {
  const mixed = record([step('1\\left(x+1\\right)=3'), step('\\left(x+1\\right)=3'), step('x=2')]);
  assert.equal(mixesPushQRenderings(mixed), true);
  assert.equal(mixesPushQRenderings(record([step('1\\left(x\\right)=3'), step('x=3')])), false);
  const { changes, counts } = gradeDocumentChanges('s2', {
    gradesByAssignment: { a9: { 2: mixed } },
    teacherGradeOverridesByAssignment: { a9: { 2: { active: true, score: 100 } } },
  });
  assert.equal(counts.recordsMixingPushQ, 1);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].overridden, true);
  assert.equal(changes[0].questionIndex, '2');
});

test('the report reads grades with a field mask, pages by id, and never writes', async () => {
  const docs = Array.from({ length: 5 }, (_, index) => ({
    id: `s${index}`,
    data: () => ({ gradesByAssignment: { a1: { 0: record([step('2~ x=4'), step('2 x=4'), step('x=2')]) } } }),
  }));
  const calls = [];
  const writeTrap = () => { throw new Error('a write was attempted'); };
  const query = (offset = 0, limit = Infinity) => ({
    orderBy: (field) => { calls.push(['orderBy', field]); return query(offset, limit); },
    select: (...fields) => { calls.push(['select', fields]); return query(offset, limit); },
    limit: (count) => query(offset, count),
    startAfter: (last) => query(docs.findIndex((doc) => doc.id === last.id) + 1, limit),
    get: async () => ({ docs: docs.slice(offset, offset + limit) }),
    add: writeTrap, doc: () => ({ set: writeTrap, update: writeTrap, delete: writeTrap }),
  });
  const db = { collection: (name) => { calls.push(['collection', name]); return query(); }, batch: writeTrap, runTransaction: writeTrap };
  const report = await runStepKeyCreditReport({ db, pageSize: 2, now: () => 0 });
  assert.equal(report.readOnly, true);
  assert.equal(report.totals.gradeDocuments, 5);
  assert.equal(report.summary.creditChanges, 5);
  assert.equal(report.summary.down, 5);
  assert.deepEqual([...new Set(calls.filter(([kind]) => kind === 'collection').map(([, name]) => name))], ['grades']);
  assert.deepEqual(calls.find(([kind]) => kind === 'select')[1], ['gradesByAssignment', 'teacherGradeOverridesByAssignment']);
});

test('the source has no write call and no write mode', () => {
  assert.doesNotMatch(CODE, /\.(set|update|create)\(|runTransaction|\.batch\(|bulkWriter|--execute|--write|--repair/i);
  // The only delete closes the Admin app; the only add fills a Set of visited states.
  assert.deepEqual([...CODE.matchAll(/(\w+)\.delete\(/g)].map((match) => match[1]), ['app']);
  assert.deepEqual([...new Set([...CODE.matchAll(/(\w+)\.add\(/g)].map((match) => match[1]))], ['visitedStates']);
});

test('arguments: a project is required, nothing writes, page size is bounded', () => {
  assert.throws(() => parseReportArgs([]), /--project is required/);
  assert.throws(() => parseReportArgs(['--project', 'p', '--execute']), /unknown argument --execute/);
  assert.throws(() => parseReportArgs(['--project', 'p', '--page-size', '0']), /--page-size/);
  assert.deepEqual(parseReportArgs(['--project', 'p', '--student', 'a', '--student', 'a', '--student', 'b']), {
    help: false, project: 'p', studentIds: ['a', 'b'], pageSize: 100,
  });
});
