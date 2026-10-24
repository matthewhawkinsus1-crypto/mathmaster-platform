/*
 * MP19: THE PRE-#456 MY MATH PATH CHOICE MISSES LEAVE MASTERY AS NOT ATTEMPTED.
 *
 * The owner's decision (2026-10-23), after the read-only report
 * (scripts/report-path-choice-id-regrade.mjs). The decisions are
 * scripts/lib/pathChoiceMasteryRemoval.mjs; the operator script is
 * scripts/remove-path-choice-misses-from-mastery.mjs. Proved here:
 *
 *   - "not attempted" is exact: removing a listed answer leaves every skill it
 *     fed equal to the entry the mastery trigger (applyMasteryEvent) builds
 *     from the same evidence without it;
 *   - what cannot be removed exactly is left alone and named (a later attempt
 *     counts, a compacted row, an unlisted attempt at the same question), and
 *     an answer is removed whole or not at all;
 *   - the removal is recorded on the profile, a second run changes nothing,
 *     and the mastery backfill keeps voided answers out when it rescores;
 *   - the script reads only by default (a database that throws on every
 *     write), writes only after a confirmation, only studentMasteryProfiles,
 *     and refuses --yes outside the emulator.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { executableSource } from './helpers/sourceContract.mjs';
import { applyMasteryEvent, masteryEventFacts } from '../../functions/shared/masteryScoring.mjs';
import {
  PATH_CHOICE_VOID_REASON,
  REMOVAL_OUTCOME,
  VOIDED_EVIDENCE_FIELD,
  planStudentChoiceMissRemoval,
  voidRecordKey,
} from '../../scripts/lib/pathChoiceMasteryRemoval.mjs';
import { planStudentMasteryBackfill } from '../../scripts/lib/masteryScoringBackfill.mjs';
import {
  PROFILES_COLLECTION,
  parseRemovalArgs,
  runPathChoiceMasteryRemoval,
} from '../../scripts/remove-path-choice-misses-from-mastery.mjs';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');

const T = Date.parse('2026-10-05T15:00:00Z');
const STUDENT = 'stu-mp19';

// One My Math Path answer, as submitPathResponse records its evidence.
const pathEvent = ({
  id, instance, attempt = 1, at, isCorrect, codes = ['A.5A'], dok = 2, family = 'f-linear', questionId = 'bank-choice', sessionId = null,
}) => ({
  id,
  evidence: {
    eventKey: id,
    studentId: STUDENT,
    occurredAt: at,
    alignmentKeys: codes.map((code) => `texas:${code}`),
    masteryEvidenceKeys: codes.map((code) => `texas:${code}`),
    questionSnapshot: { questionId, questionInstanceId: instance, dok, familyId: family },
    performance: { isCorrect, score: isCorrect ? 1 : 0, attemptNumber: attempt, status: 'finalized', isMathematicallyIndependent: true },
    source: { kind: 'myMathPath', activitySessionId: sessionId || `session-${instance}`, activityRole: 'practice' },
    supportUsage: {},
  },
});

// The profile the trigger builds from these events, in this order.
const profilesFrom = (events) => {
  const profiles = {};
  events.forEach(({ id, evidence }) => {
    const facts = masteryEventFacts(evidence, mathPath, { eventId: id });
    facts.codes.forEach((code) => { profiles[code] = applyMasteryEvent(profiles[code], facts, code, { now: T }).entry; });
  });
  return profiles;
};

const listedFor = ({ id }, applied = true) => ({ eventId: id, eventKey: id, evidencePath: `grades/${STUDENT}/evidenceEvents/${id}`, submissionDocId: `sub-${id}`, applied });

// Everything an entry's scoring decides; `updatedAt` is when, not what.
const scoring = (entry) => {
  const { updatedAt: _when, ...rest } = entry || {};
  return rest;
};

const plan = (stored, events, listed) => planStudentChoiceMissRemoval({ studentId: STUDENT, stored, events, listed, helpers: mathPath, now: T + 60_000 });

/* ------------------------------------------------------------- the planner */

test('a removed answer leaves every skill it fed exactly as the trigger builds it without that answer', () => {
  const A = pathEvent({ id: 'ev-a', instance: 'qi-a', at: T - 3000, isCorrect: true, dok: 2, family: 'f1' });
  // The listed miss: a DOK 3 item of its own family, feeding two skills.
  const B = pathEvent({ id: 'ev-b', instance: 'qi-b', at: T - 2000, isCorrect: false, dok: 3, family: 'f2', codes: ['A.5A', 'A.2A'] });
  const C = pathEvent({ id: 'ev-c', instance: 'qi-c', at: T - 1000, isCorrect: true, dok: 2, family: 'f1' });
  const D = pathEvent({ id: 'ev-d', instance: 'qi-d', at: T - 500, isCorrect: true, dok: 1, family: 'f3', codes: ['A.2A'] });
  const stored = { studentId: STUDENT, authorizedTeacherEmails: ['t@example.org'], profiles: profilesFrom([A, B, C, D]) };
  const neverAnswered = profilesFrom([A, C, D]);
  const result = plan(stored, [A, B, C, D], [listedFor(B)]);
  assert.equal(result.action, 'write');
  for (const code of ['A.5A', 'A.2A']) {
    assert.deepEqual(scoring(result.document.profiles[code]), scoring(neverAnswered[code]), `${code}: as if never answered`);
  }
  // The DOK level and the family only the miss stood for went with it.
  assert.deepEqual(result.document.profiles['A.5A'].dimensions.dokRepresented, [2]);
  assert.deepEqual(result.document.profiles['A.5A'].dimensions.familiesRepresented, ['f1']);
  // One answer of two in A.2A: what is left is not enough evidence to label.
  const twoA = result.changes.find((change) => change.code === 'A.2A');
  assert.deepEqual([twoA.from.status, twoA.to.status], ['Developing', 'Not Enough Evidence']);
  // Recorded on the profile, and nothing else on it changes.
  const record = result.document[VOIDED_EVIDENCE_FIELD][voidRecordKey(STUDENT, 'ev-b', mathPath)];
  assert.equal(record.eventKey, 'ev-b');
  assert.equal(record.reason, PATH_CHOICE_VOID_REASON);
  assert.equal(record.evidencePath, `grades/${STUDENT}/evidenceEvents/ev-b`);
  assert.deepEqual(record.skills.map((skill) => skill.outcome), [REMOVAL_OUTCOME.REMOVED, REMOVAL_OUTCOME.REMOVED]);
  assert.deepEqual(result.document.authorizedTeacherEmails, ['t@example.org']);
  assert.deepEqual(result.counts, { listed: 1, alreadyVoided: 0, voided: 1, refused: 0, rowsRemoved: 2 });
  // A second run over what was written changes nothing.
  const again = plan(result.document, [A, B, C, D], [listedFor(B)]);
  assert.equal(again.action, 'nothing');
  assert.equal(again.counts.alreadyVoided, 1);
});

test('what cannot be removed exactly is left alone, and an answer is removed whole or not at all', () => {
  const other = pathEvent({ id: 'ev-ok', instance: 'qi-ok', at: T - 9000, isCorrect: true });
  // A later attempt at the same question is the one counted.
  const firstTry = pathEvent({ id: 'ev-1', instance: 'qi-1', attempt: 1, at: T - 5000, isCorrect: false });
  const laterRight = pathEvent({ id: 'ev-2', instance: 'qi-1', attempt: 2, at: T - 4000, isCorrect: true });
  const superseded = plan({ profiles: profilesFrom([other, firstTry, laterRight]) }, [other, firstTry, laterRight], [listedFor(firstTry)]);
  assert.deepEqual(superseded.answers.map((answer) => answer.outcome), ['voided']);
  assert.equal(superseded.answers[0].skills[0].outcome, REMOVAL_OUTCOME.SUPERSEDED);
  assert.deepEqual(superseded.document.profiles, profilesFrom([other, firstTry, laterRight]), 'no score moves');
  assert.ok(superseded.document[VOIDED_EVIDENCE_FIELD][voidRecordKey(STUDENT, 'ev-1', mathPath)], 'but the void is recorded, for a rescore');

  // The counted attempt is listed, an earlier one is not: refused.
  const unlistedFirst = pathEvent({ id: 'ev-3', instance: 'qi-3', attempt: 1, at: T - 3000, isCorrect: false });
  const listedSecond = pathEvent({ id: 'ev-4', instance: 'qi-3', attempt: 2, at: T - 2000, isCorrect: false });
  const partial = plan({ profiles: profilesFrom([other, unlistedFirst, listedSecond]) }, [other, unlistedFirst, listedSecond], [listedFor(listedSecond)]);
  assert.equal(partial.action, 'nothing');
  assert.equal(partial.answers[0].skills[0].outcome, REMOVAL_OUTCOME.OTHER_ATTEMPTS);

  // Applied, but its row was compacted away: its share is folded in for good.
  const miss = pathEvent({ id: 'ev-5', instance: 'qi-5', at: T - 1000, isCorrect: false });
  const compacted = profilesFrom([other, miss]);
  delete compacted['A.5A'].questions[masteryEventFacts(miss.evidence, mathPath, { eventId: 'ev-5' }).questionId];
  const folded = plan({ profiles: compacted }, [other, miss], [listedFor(miss, true)]);
  assert.equal(folded.action, 'nothing');
  assert.equal(folded.answers[0].skills[0].outcome, REMOVAL_OUTCOME.ROW_COMPACTED);

  // Never applied (no marker, no row): nothing to remove; recorded.
  const unapplied = plan({ profiles: profilesFrom([other]) }, [other, miss], [listedFor(miss, false)]);
  assert.equal(unapplied.answers[0].skills[0].outcome, REMOVAL_OUTCOME.NEVER_APPLIED);
  assert.deepEqual(unapplied.document.profiles, profilesFrom([other]));

  // An entry from before per-question rows: recorded, left for the rescore.
  const legacy = { profiles: { 'A.5A': { mastery: { estimate: 40, status: 'Developing' }, accumulator: { effectiveWeight: 5, weightedScoreSum: 2 } } } };
  const awaiting = plan(legacy, [other, miss], [listedFor(miss)]);
  assert.equal(awaiting.answers[0].skills[0].outcome, REMOVAL_OUTCOME.AWAITING_RESCORE);
  assert.deepEqual(awaiting.document.profiles, legacy.profiles);

  // An answer whose evidence is gone cannot be named on any skill.
  const missing = plan({ profiles: profilesFrom([other]) }, [other], [{ eventId: 'ev-gone', eventKey: 'ev-gone', applied: true }]);
  assert.equal(missing.answers[0].outcome, REMOVAL_OUTCOME.EVIDENCE_NOT_FOUND);
  assert.equal(missing.action, 'nothing');
});

test('the mastery backfill keeps a voided answer out when it rescores', () => {
  const A = pathEvent({ id: 'ev-a', instance: 'qi-a', at: T - 3000, isCorrect: true });
  const B = pathEvent({ id: 'ev-b', instance: 'qi-b', at: T - 2000, isCorrect: false });
  const C = pathEvent({ id: 'ev-c', instance: 'qi-c', at: T - 1000, isCorrect: true });
  // A profile the old trigger wrote (no rescore yet), its miss voided.
  const legacy = { studentId: STUDENT, profiles: { 'A.5A': { mastery: { estimate: 67, status: 'Developing' }, accumulator: { effectiveWeight: 3, weightedScoreSum: 2, eligibleEvents: 3 } } } };
  const voided = plan(legacy, [A, B, C], [listedFor(B)]).document;
  const backfill = (stored, events) => planStudentMasteryBackfill({
    studentId: STUDENT, stored, events, student: { id: STUDENT, gradesByAssignment: {}, supportUsageByAssignment: {} }, assignments: [], helpers: mathPath, now: T,
  }).document.profiles['A.5A'];
  const withoutTheMiss = backfill(legacy, [A, C]);
  assert.deepEqual(scoring(backfill(voided, [A, B, C])), scoring(withoutTheMiss), 'the voided miss is not rescored back in');
  assert.notDeepEqual(scoring(backfill(legacy, [A, B, C])).accumulator, scoring(withoutTheMiss).accumulator, 'fixture: without the void it would be');
});

/* ------------------------------------------------------- the operator script */

const WRITE_METHODS = new Set(['set', 'update', 'delete', 'create', 'add', 'batch', 'runTransaction', 'bulkWriter', 'recursiveDelete']);
const valueAt = (data, field) => field.split('.').reduce((value, part) => value?.[part], data);
const masked = (data, fields) => {
  if (data === undefined || !fields) return structuredClone(data);
  const out = {};
  fields.forEach((field) => {
    const value = valueAt(data, field);
    if (value === undefined) return;
    const parts = field.split('.');
    let target = out;
    parts.slice(0, -1).forEach((part) => { target[part] ??= {}; target = target[part]; });
    target[parts.at(-1)] = structuredClone(value);
  });
  return out;
};

// An in-memory Firestore with the reads the report and the script use, and
// transactions that apply their writes when the work resolves. `readOnly`
// makes every write method throw, and records the attempt.
const memoryFirestore = (seed, { readOnly = false } = {}) => {
  const documents = new Map(Object.entries(structuredClone(seed)));
  const writes = [];
  const attempts = [];
  const guard = (target, label) => (readOnly ? new Proxy(target, {
    get(object, property) {
      if (WRITE_METHODS.has(property)) {
        return () => { attempts.push(`${label}.${String(property)}`); throw new Error(`write refused: ${label}.${String(property)}`); };
      }
      return object[property];
    },
  }) : target);
  const snapshot = (docPath, fields = null) => {
    const data = documents.get(docPath);
    return { id: docPath.split('/').at(-1), exists: data !== undefined, ref: { path: docPath }, data: () => masked(data, fields) };
  };
  const query = (collectionPath, state = { filters: [], order: null, descending: false, fields: null, limit: Infinity, after: null }) => guard({
    kind: 'query',
    where: (field, op, value) => query(collectionPath, { ...state, filters: [...state.filters, [field, op, value]] }),
    orderBy: (field, direction = 'asc') => query(collectionPath, { ...state, order: field, descending: direction === 'desc' }),
    select: (...fields) => query(collectionPath, { ...state, fields }),
    limit: (count) => query(collectionPath, { ...state, limit: count }),
    startAfter: (doc) => query(collectionPath, { ...state, after: doc }),
    run: () => {
      const ops = { '==': (a, b) => a === b, '>=': (a, b) => a >= b, '<': (a, b) => a < b, '<=': (a, b) => a <= b };
      let rows = [...documents.keys()]
        .filter((key) => key.startsWith(`${collectionPath}/`) && !key.slice(collectionPath.length + 1).includes('/'))
        .filter((key) => state.filters.every(([field, op, value]) => ops[op](valueAt(documents.get(key), field), value)));
      const sortKey = (key) => [state.order ? valueAt(documents.get(key), state.order) : 0, key];
      rows.sort((a, b) => {
        const [x, y] = [sortKey(a), sortKey(b)];
        return x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : 0;
      });
      if (state.descending) rows.reverse();
      if (state.after) rows = rows.slice(rows.indexOf(state.after.ref.path) + 1);
      const docs = rows.slice(0, state.limit).map((key) => snapshot(key, state.fields));
      return { docs, size: docs.length, empty: !docs.length };
    },
    get: async () => query(collectionPath, state).run(),
  }, `query(${collectionPath})`);
  const docRef = (docPath) => guard({
    kind: 'doc',
    id: docPath.split('/').at(-1),
    path: docPath,
    get: async () => snapshot(docPath),
    collection: (name) => collectionRef(`${docPath}/${name}`),
  }, `doc(${docPath})`);
  const collectionRef = (collectionPath) => guard({ ...query(collectionPath), doc: (id) => docRef(`${collectionPath}/${id}`) }, `collection(${collectionPath})`);
  const db = guard({
    collection: (name) => collectionRef(name),
    getAll: async (...args) => {
      const options = args.at(-1)?.fieldMask ? args.pop() : {};
      return args.map((ref) => snapshot(ref.path, options.fieldMask || null));
    },
    runTransaction: async (work) => {
      const pending = [];
      const transaction = {
        get: async (target) => (target.kind === 'doc' ? snapshot(target.path) : target.run()),
        set: (ref, data) => { pending.push([ref.path, structuredClone(data)]); return transaction; },
      };
      const result = await work(transaction);
      pending.forEach(([docPath, data]) => { writes.push(docPath); documents.set(docPath, data); });
      return result;
    },
  }, 'db');
  return { db, documents, writes, attempts };
};

// Two students, each with a pre-hotfix choice answer recorded wrong in the
// window (no recap), and a typed answer that was never affected.
const seedDatabase = () => {
  const docs = {
    'pathQuestionBank/bank-choice': {
      id: 'bank-choice',
      choices: [{ id: 'opt-1', label: '$x = 7$' }, { id: 'opt-2', label: '$x = 4$' }],
      responseFields: [{ id: 'answer', label: 'Answer', inputProfile: 'choice', expected: 'opt-2' }],
    },
    'pathQuestionBank/bank-typed': { id: 'bank-typed', responseFields: [{ id: 'answer', inputProfile: 'number', expected: '4' }] },
  };
  for (const [index, studentId] of ['stu-p1', 'stu-p2'].entries()) {
    const at = T + index * 1000;
    const instance = `qi-${studentId}`;
    const miss = pathEvent({ id: `ev-${studentId}-miss`, instance, at, isCorrect: false, sessionId: `sess-${studentId}` });
    const earlier = pathEvent({ id: `ev-${studentId}-a`, instance: `${instance}-a`, at: at - 20_000, isCorrect: true, questionId: 'bank-typed', sessionId: `sess-${studentId}` });
    const typedMiss = pathEvent({ id: `ev-${studentId}-typed`, instance: `${instance}-t`, at: at + 100, isCorrect: false, questionId: 'bank-typed', sessionId: `sess-${studentId}-t` });
    [miss, earlier, typedMiss].forEach((event) => {
      docs[`grades/${studentId}/evidenceEvents/${event.id}`] = { ...event.evidence, studentId };
      docs[`masteryEvidenceApplications/${mathPath.opaqueId('mastery', studentId, event.id)}`] = { studentId, eventKey: event.id, appliedAt: event.evidence.occurredAt + 5 };
    });
    docs[`pathSubmissions/sub-${studentId}`] = {
      studentId, sessionId: `sess-${studentId}`, submissionId: `sub-${studentId}`, createdAt: at,
      result: { grading: { isCorrect: false, score: 0, attemptNumber: 1, questionFinalized: true } },
    };
    docs[`pathSubmissions/sub-${studentId}-typed`] = {
      studentId, sessionId: `sess-${studentId}-t`, submissionId: `sub-${studentId}-typed`, createdAt: at + 100,
      result: { grading: { isCorrect: false, score: 0, attemptNumber: 1, questionFinalized: true } },
    };
    docs[`${PROFILES_COLLECTION}/${studentId}`] = { studentId, profiles: profilesFrom([earlier, miss, typedMiss]) };
  }
  return docs;
};

const WINDOW = { since: T - 864e5, until: T + 864e5 };

test('by default the script only reads: the report\'s answers and what removing each would change', async () => {
  const { db, attempts } = memoryFirestore(seedDatabase(), { readOnly: true });
  const result = await runPathChoiceMasteryRemoval({ db, ...WINDOW, now: () => T + 864e5 * 2 });
  assert.deepEqual(attempts, [], 'no write was even attempted');
  assert.equal(result.mode, 'read-only');
  assert.equal(result.execution, null);
  assert.equal(result.counts.answersListed, 2, 'the two choice misses, not the typed ones');
  assert.equal(result.counts.answersToRemove, 2);
  assert.equal(result.counts.studentsToWrite, 2);
  assert.equal(result.counts.questionRowsRemoved, 2);
  const first = result.students.find((entry) => entry.studentId === 'stu-p1');
  assert.deepEqual(first.answers.map((answer) => [answer.eventKey, answer.outcome]), [['ev-stu-p1-miss', 'voided']]);
  assert.doesNotMatch(JSON.stringify(result), /"(firstName|lastName|displayName|studentName)"/);
});

test('--execute writes only after the confirmation, only the listed students\' mastery profiles, and a second run writes nothing', async () => {
  const store = memoryFirestore(seedDatabase());
  const run = (options = {}) => runPathChoiceMasteryRemoval({ db: store.db, ...WINDOW, now: () => T + 864e5 * 2, ...options });

  await assert.rejects(run({ execute: true }), /execute needs a confirmation/);
  const declined = await run({ execute: true, confirm: async () => false });
  assert.equal(declined.aborted, true);
  assert.deepEqual(store.writes, [], 'declined: nothing written');

  // A first trial on one student.
  const trial = await run({ execute: true, students: ['stu-p1'], confirm: async (counts) => counts.studentsToWrite === 1 });
  assert.deepEqual(store.writes, [`${PROFILES_COLLECTION}/stu-p1`]);
  assert.equal(trial.counts.studentsWritten, 1);

  const executed = await run({ execute: true, confirm: async () => true });
  assert.deepEqual(store.writes, [`${PROFILES_COLLECTION}/stu-p1`, `${PROFILES_COLLECTION}/stu-p2`], 'only mastery profiles, one write per student');
  assert.equal(executed.counts.alreadyRemoved, 1, 'the trial student\'s answer is not removed twice');
  const profile = store.documents.get(`${PROFILES_COLLECTION}/stu-p2`);
  const miss = pathEvent({ id: 'ev-stu-p2-miss', instance: 'qi-stu-p2', at: T + 1000, isCorrect: false });
  const earlier = pathEvent({ id: 'ev-stu-p2-a', instance: 'qi-stu-p2-a', at: T + 1000 - 20_000, isCorrect: true, questionId: 'bank-typed' });
  const typedMiss = pathEvent({ id: 'ev-stu-p2-typed', instance: 'qi-stu-p2-t', at: T + 1100, isCorrect: false, questionId: 'bank-typed' });
  assert.deepEqual(scoring(profile.profiles['A.5A']), scoring(profilesFrom([earlier, typedMiss])['A.5A']), 'as not attempted');
  assert.ok(profile[VOIDED_EVIDENCE_FIELD][voidRecordKey('stu-p2', miss.id, mathPath)], 'and recorded');
  assert.ok(store.documents.has(`grades/stu-p2/evidenceEvents/${miss.id}`), 'the evidence itself is untouched');

  const before = store.writes.length;
  const repeat = await run({ execute: true, confirm: async () => true });
  assert.equal(store.writes.length, before, 'a second run writes nothing');
  assert.equal(repeat.counts.studentsToWrite, 0);
  assert.equal(repeat.counts.alreadyRemoved, 2);
});

test('the arguments: read-only by default, --execute names the project, and --yes only against the emulator', () => {
  const base = ['--project', 'mathmaster-aleks', '--since', '2026-09-20', '--until', '2026-10-07T21:15:00Z'];
  const options = parseRemovalArgs(base, {});
  assert.equal(options.execute, false, 'without --execute it only reads');
  assert.deepEqual([options.since, options.until], [Date.parse('2026-09-20T00:00:00Z'), Date.parse('2026-10-07T21:15:00Z')]);
  assert.throws(() => parseRemovalArgs(['--since', '2026-09-20', '--until', '2026-10-07', '--execute'], {}), /--project is required/);
  assert.throws(() => parseRemovalArgs(['--project', 'p', '--execute'], {}), /--since and --until are required/);
  assert.throws(() => parseRemovalArgs([...base, '--execute', '--yes'], {}), /--yes is refused unless FIRESTORE_EMULATOR_HOST is set/);
  assert.throws(() => parseRemovalArgs([...base, '--yes'], { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' }), /--yes only means something with --execute/);
  assert.equal(parseRemovalArgs([...base, '--execute', '--yes'], { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' }).yes, true);
  assert.throws(() => parseRemovalArgs([...base, '--force'], {}), /unknown argument --force/);
  assert.deepEqual(parseRemovalArgs([...base, '--student', 'a', '--student', 'b'], {}).students, ['a', 'b']);
});

test('the script\'s one Firestore write is the re-planned profile, inside its transaction', () => {
  const source = executableSource(readFileSync(new URL('../../scripts/remove-path-choice-misses-from-mastery.mjs', import.meta.url), 'utf8'))
    // Not Firestore: a Map, and app.delete() closes the Admin SDK's channels.
    .replace(/\bbyStudent\.set\(/g, 'map-set(')
    .replace(/\bapp\.delete\(\)/g, 'app-close()');
  const writes = [...source.matchAll(/\.(set|update|delete|create|add|batch|bulkWriter|recursiveDelete)\(/g)].map((match) => match[0]);
  assert.deepEqual(writes, ['.set('], 'exactly one write call');
  assert.match(source, /transaction\.set\(profileRef, plan\.document\);/);
  assert.match(source, /const profileRef = db\.collection\(PROFILES_COLLECTION\)\.doc\(studentId\);/);
  assert.match(source, /if \(!\(await confirm\(counts\)\)\) return \{ \.\.\.result, aborted: true \};/);
});
