// A MATCH THAT FINISHES DURING A STUDENT'S PERMANENT DELETION NEVER PAYS OR
// REPORTS THEM (SI07: A2-137, G-5).
//
// runLiveChallengeFinalizationEffects reads the match result once, then writes
// the teacher's report, each student's Warm-Up credit, their mastery evidence
// and their rewards. A deletion running at the same moment scrubs the student
// from the result — but an effect that read it a moment earlier still named
// them, and wrote them back after their records were erased: a report row, a
// re-created grade row (which also woke Classroom passback), evidence under an
// erased row, Class Points and a pass.
//
// permanentlyDeleteStudent now marks the roster row as its FIRST write, and
// every effect reads the roster rows of the students it writes about in the
// transaction that writes (a rerun after a concurrent mark sees it). Proven
// here, running the effects as written in functions/index.js against a
// stand-in: a student whose row is marked, and one whose row is already gone,
// get nothing, while a classmate gets everything; rewards are neither staged
// nor delivered for them; and the mark is the deletion's first write.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { FAKE_FIELD_VALUE, FakeFirestore, topLevelFunction } from './helpers/serverCallableHarness.mjs';
import { region } from './helpers/sourceContract.mjs';
import { buildMatchResult } from '../../functions/shared/liveChallengeResults.mjs';
import { STUDENT_DELETION_MARK, rosterRowAcceptsEffects } from '../../functions/shared/studentDeletionMark.mjs';
import {
  JOBS_COLLECTION,
  rosterAuthorizationFromRecords,
  stageLiveChallengeRewards,
} from '../../functions/shared/liveChallengeClassPoints.mjs';

const require = createRequire(import.meta.url);
const SERVER = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
const REPORTS = SERVER.match(/^const LIVE_CHALLENGE_REPORTS = "([^"]+)";/m)[1];

const effects = new Function(
  'FieldValue', 'LIVE_CHALLENGE_REPORTS', 'mathPath', 'studentDeletionMark', 'liveChallengeReportRules', 'liveChallengeRules',
  'liveChallengeEngine', 'lineGraphModules', 'graphFeatureRushRules', 'warmupChallengeRules', 'liveChallengeEvidenceRules',
  'lineGraphEvidenceEventsFor',
  `"use strict";\n${[
    'liveChallengeEffectRecipients', 'questionSetModeReport', 'writeLiveChallengeReportFromResult',
    'writeWarmupCreditFromResult', 'writeChallengeEvidenceFromResult',
  ].map(topLevelFunction).join('\n')}\nreturn { writeLiveChallengeReportFromResult, writeWarmupCreditFromResult, writeChallengeEvidenceFromResult };`,
)(
  FAKE_FIELD_VALUE,
  REPORTS,
  require('../../functions/lib/mathPath.js'),
  async () => import('../../functions/shared/studentDeletionMark.mjs'),
  async () => import('../../functions/shared/liveChallengeReport.mjs'),
  async () => import('../../functions/shared/liveChallenge.mjs'),
  async () => ({ modes: await import('../../functions/shared/liveChallengeModes.mjs') }),
  async () => ({ attempts: await import('../../functions/shared/lineGraphAttempts.mjs') }),
  async () => ({ rush: await import('../../functions/shared/graphFeatureRush.mjs') }),
  async () => import('../../functions/shared/warmupChallenge.mjs'),
  async () => import('../../functions/shared/liveChallengeEvidence.mjs'),
  // Graph the Line's own evidence is behind the owner's switch; not this game.
  async () => [],
);

const receipt = (roundIndex, isCorrect) => ({ roundIndex, isCorrect, serverConfirmed: true });
const strongPlayer = (studentId, tag) => ({
  studentId, alias: `${tag} Fox`, joined: true, joinedAtRound: 0, score: 3_000, correctCount: 3, roundsAnswered: 3, answeredRounds: [0, 1, 2],
  submissionReceipts: { [`${tag}0`]: receipt(0, true), [`${tag}1`]: receipt(1, true), [`${tag}2`]: receipt(2, true) },
});

// Three students played and did well: one still enrolled, one whose deletion
// has begun (the roster row is marked), one whose row is already gone.
const result = () => ({
  ...buildMatchResult({
    roomId: 'room-9',
    room: { classId: 'class-1', roundCount: 3, currentRound: 2, teacherEmail: 't@school.org', assignmentId: 'A1' },
    privateState: { scheduledRoundCount: 3, questionIds: ['q0', 'q1', 'q2'] },
    players: [strongPlayer('s-live', 'Red'), strongPlayer('s-marked', 'Blue'), strongPlayer('s-gone', 'Gold')],
    status: 'finished',
  }),
  assignmentId: 'A1',
  teacherEmail: 't@school.org',
  roundStandards: { 0: 'A.5A', 1: 'A.5A', 2: 'A.2B' },
  finalizedAtMs: Date.parse('2026-10-20T15:00:00Z'),
});

const world = () => new FakeFirestore({
  classes: { 'class-1': { status: 'active', teacherOfRecord: 't@school.org' } },
  grades: {
    's-live': { classId: 'class-1', assignedTeacherEmail: 't@school.org' },
    's-marked': { classId: 'class-1', assignedTeacherEmail: 't@school.org', [STUDENT_DELETION_MARK]: '2026-10-20T15:00:01Z' },
  },
});

const gradeReadsInTransaction = (db) => db.reads.filter((read) => read.collection === 'grades' && read.via === 'transaction.getAll').map((read) => read.id).sort();

test('the roster row decides: present and unmarked accepts effects; marked or gone does not', () => {
  assert.equal(rosterRowAcceptsEffects({ exists: true, data: () => ({ classId: 'c' }) }), true);
  assert.equal(rosterRowAcceptsEffects({ exists: true, data: () => ({ [STUDENT_DELETION_MARK]: 'now' }) }), false);
  assert.equal(rosterRowAcceptsEffects({ exists: false, data: () => undefined }), false);
  assert.equal(rosterRowAcceptsEffects(null), false);
});

test('the teacher\'s report names only students still on the roster; the class totals are the whole match\'s', async () => {
  const db = world();
  const { writeLiveChallengeReportFromResult } = effects;
  await writeLiveChallengeReportFromResult(db, result());
  const report = db.data(REPORTS, 'room-9');
  assert.deepEqual(report.studentIds, ['s-live']);
  assert.deepEqual(report.players.map((row) => row.studentId), ['s-live']);
  assert.doesNotMatch(JSON.stringify(report), /s-marked|s-gone|Blue Fox|Gold Fox/);
  assert.deepEqual(gradeReadsInTransaction(db), ['s-gone', 's-live', 's-marked'], 'the roster rows are read in the transaction that writes the report');
  assert.match(db.writes.find((write) => write.collection === REPORTS).group || '', /^transaction-/);
});

test('Warm-Up credit reaches only a student still on the roster, and never re-creates a deleted grade row', async () => {
  const db = world();
  const { writeWarmupCreditFromResult } = effects;
  await writeWarmupCreditFromResult(db, result());
  assert.ok(db.data('grades', 's-live').warmupChallengeByAssignment.A1, 'the classmate is credited');
  assert.equal(db.data('grades', 's-marked').warmupChallengeByAssignment, undefined, 'a student being deleted is not');
  assert.equal(db.data('grades', 's-gone'), undefined, 'a deleted student\'s row is not written back into existence');
  assert.deepEqual(db.writes.filter((write) => write.collection === 'grades').map((write) => write.id), ['s-live']);
  assert.deepEqual(gradeReadsInTransaction(db), ['s-gone', 's-live', 's-marked']);
});

test('mastery evidence is written only under a student still on the roster', async () => {
  const db = world();
  const { writeChallengeEvidenceFromResult } = effects;
  await writeChallengeEvidenceFromResult(db, result());
  const written = db.writes.filter((write) => write.collection.endsWith('/evidenceEvents')).map((write) => write.collection);
  assert.ok(written.length >= 2, 'the classmate gets their evidence (one event per standard)');
  assert.ok(written.every((collection) => collection === 'grades/s-live/evidenceEvents'), written.join(', '));
  assert.deepEqual(gradeReadsInTransaction(db), ['s-gone', 's-live', 's-marked']);
});

test('rewards: a student being deleted is neither staged nor paid', async () => {
  const db = world();
  const policy = { rules: [{ ruleId: 'challengeFinisher', criterion: { kind: 'participation' }, reward: { kind: 'classPoints', amount: 2 } }] };
  const staged = await stageLiveChallengeRewards(db, { matchResult: result(), policy });
  assert.equal(staged.status, 'staged');
  assert.deepEqual([...new Set(staged.awards.map((award) => award.studentId))], ['s-live']);
  assert.deepEqual(db.data(JOBS_COLLECTION, 'room-9').studentIds, ['s-live'], 'the job keeps no id of theirs');
  // An award staged before the mark landed is skipped at delivery, in the
  // delivery's own transaction (the roster re-check every award makes).
  const classRecord = { status: 'active', teacherOfRecord: 't@school.org' };
  const marked = rosterAuthorizationFromRecords({
    classId: 'class-1', classRecord, gradeData: { classId: 'class-1', assignedTeacherEmail: 't@school.org', [STUDENT_DELETION_MARK]: 'now' },
  });
  assert.deepEqual(marked, { valid: false, reason: 'student_being_deleted' });
  assert.equal(rosterAuthorizationFromRecords({ classId: 'class-1', classRecord, gradeData: { classId: 'class-1', assignedTeacherEmail: 't@school.org' } }).valid, true);
});

test('the roster mark is permanent deletion\'s first write', () => {
  const deletion = region(SERVER, 'exports.permanentlyDeleteStudent = onCall(', 'await writeAdminAudit(db, actor, "student_permanently_deleted"', 'permanentlyDeleteStudent');
  const mark = deletion.indexOf('await rosterRef.update({ [STUDENT_DELETION_MARK]: FieldValue.serverTimestamp() });');
  assert.ok(mark > -1, 'the deletion marks the roster row');
  const before = deletion.slice(0, mark);
  // Nothing is erased or written before it: only the reads that find the student.
  assert.doesNotMatch(before, /\.(delete|set|update|recursiveDelete)\(|deleteStudent\w*Footprint\(|cleanupStudentLiveChallengeAchievements\(|revokeRefreshTokens\(|deleteUser\(/);
  assert.ok(mark < deletion.indexOf('await deleteStudentClassPointsFootprint(db, studentId, deleted);'), 'before Class Points');
});
