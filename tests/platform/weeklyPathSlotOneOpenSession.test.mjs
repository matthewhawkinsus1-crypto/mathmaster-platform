/*
 * ONE WEEKLY SLOT, ONE OPEN SESSION (student push D, "Swap a skill" fix pass).
 *
 * The server's session lock is keyed by TARGET: `pathlock(student, target,
 * framework, weeklySlotKey)`. Before swaps, a weekly slot could only ever be
 * launched on its own standard, so a second launch for the slot always hit the
 * same lock and resumed. A slot frozen with alternatives can be launched on
 * more than one standard — and a launch on the recommendation for a slot whose
 * swapped session was already open (a reload that showed the recommendation
 * before the student's sessions loaded, or an older browser) found no lock and
 * opened a SECOND active session for the same slot. The student restarted from
 * zero, and once both finished their card and the teacher's row disagreed about
 * what had filled the slot.
 *
 * These tests run the REAL startMyMathPathSession source from functions/index.js
 * against the strict Firestore stand-in, with the shared rule
 * (openWeeklySlotSession) it consults, and pin that a launch for a slot that
 * already has an open session resumes it — on whichever of the slot's
 * standards it was opened — and that nothing else changed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { FakeFirestore, HttpsError, topLevelFunction } from './helpers/serverCallableHarness.mjs';
import { region } from './helpers/sourceContract.mjs';
import {
  freezeWeeklyPathGoalProposal,
  openWeeklySlotSession,
} from '../../functions/shared/weeklyPathSlotAuthority.mjs';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');
const pathContentRelease = require('../../functions/lib/pathContentRelease.js');

const SERVER = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');

// ---------------------------------------------------------------------------
// The rule itself.
// ---------------------------------------------------------------------------

const doc = (id, data) => ({ id, data: { studentId: 'S1', weekKey: 'w1', weeklySlotKey: 'k1', status: 'active', ...data } });

test('a slot\'s open session is the one a launch for that slot must resume', () => {
  const sessions = [
    doc('older', { updatedAt: 10 }),
    doc('newer', { updatedAt: 20 }),
    doc('finished', { status: 'completed', updatedAt: 99 }),
    doc('superseded', { status: 'superseded', updatedAt: 98 }),
    doc('other-slot', { weeklySlotKey: 'k2', updatedAt: 97 }),
    doc('other-week', { weekKey: 'w0', updatedAt: 96 }),
    doc('other-student', { studentId: 'S2', updatedAt: 95 }),
    doc('open-practice', { weekKey: null, weeklySlotKey: null, updatedAt: 94 }),
  ];
  const find = (extra = {}) => openWeeklySlotSession({ sessions, studentId: 'S1', weekKey: 'w1', weeklySlotKey: 'k1', ...extra });

  // Only an ACTIVE session of this student, this week and this slot counts;
  // the most recently updated wins.
  assert.equal(find()?.id, 'newer');
  // The target's own lock names one of them: that one, whatever its age.
  assert.equal(find({ preferSessionId: 'older' })?.id, 'older');
  // A lock naming a finished session does not resurrect it.
  assert.equal(find({ preferSessionId: 'finished' })?.id, 'newer');
  assert.equal(find({ weeklySlotKey: 'k3' }), null);
  assert.equal(find({ weekKey: 'w9' }), null);
  // Not a weekly launch: there is no slot to hold a session.
  assert.equal(find({ weeklySlotKey: null }), null);
  assert.equal(find({ weekKey: '' }), null);
  assert.equal(openWeeklySlotSession(), null);
});

// ---------------------------------------------------------------------------
// The callable, as written.
// ---------------------------------------------------------------------------

const constantDeclaration = (name) => {
  const match = SERVER.match(new RegExp(`^const ${name} = [^\\n]+;$`, 'm'));
  assert.ok(match, `functions/index.js no longer declares const ${name} on one line; update this harness`);
  return match[0];
};

const unexpected = (name) => () => {
  throw new Error(`${name} is not reached by a course weekly launch; this harness does not model it`);
};

// The dynamic import of a shared module, resolved from functions/ as the
// deployed callable resolves it.
const sharedImport = (specifier) => import(new URL(`../../functions/${String(specifier).replace(/^\.\//, '')}`, import.meta.url));

const startCallable = (db, overrides = {}) => {
  const callable = `${region(SERVER, 'exports.startMyMathPathSession = onCall(', '\n}));\n', 'startMyMathPathSession')}\n}));`
    .replaceAll('import("./shared/', 'sharedImport("./shared/');
  const tools = `${region(SERVER, 'const WEEKLY_SLOT_TEKS_TOOLS = ', '\n});\n', 'weekly slot TEKS tools')}\n});`;
  const collaborators = {
    onCall: (handler) => handler,
    withPathCallableDiagnostics: async (operation, handler) => handler(),
    HttpsError,
    mathPath,
    pathContentRelease,
    getFirestore: () => db,
    logger: { info() {}, warn() {}, error() {} },
    sharedImport,
    loadCcmrProgress: unexpected('loadCcmrProgress'),
    resolveServerCcmrChallengeTier: unexpected('resolveServerCcmrChallengeTier'),
    loadCoursePathPassProgress: unexpected('loadCoursePathPassProgress'),
    pathCoverage: unexpected('pathCoverage'),
    livePathSkillIsLaunchable: unexpected('livePathSkillIsLaunchable'),
    rebuildStoredPathCoverage: unexpected('rebuildStoredPathCoverage'),
    loadAssessmentContentReleaseState: unexpected('loadAssessmentContentReleaseState'),
    safeBuildTemplateIssuePlan: unexpected('safeBuildTemplateIssuePlan'),
    ...overrides,
  };
  const body = [
    ...['CLASS_COLLECTION', 'COVERAGE_COLLECTION', 'COURSE_PATH_MAX_LEVEL', 'WEEKLY_PATH_GOAL_SNAPSHOTS', 'PATH_ASSESSMENT_FRAMEWORKS']
      .map(constantDeclaration),
    ...['requireStudent', 'loadStudentClass', 'pathSessionRequiredQuestions', 'normalizePathAssessmentFramework',
      'pathQuestionMatchesFramework', 'coverageCourseIdFor', 'publicPathSession', 'assessmentReleaseUpdateError']
      .map(topLevelFunction),
    tools,
    'const exports = {};',
    callable,
    'return exports.startMyMathPathSession;',
  ].join('\n');
  const factory = new Function(...Object.keys(collaborators), `"use strict";\n${body}`);
  return factory(...Object.values(collaborators));
};

const WEEK = '2026-10-05';
const STUDENT = 'S1';
// The week's real deadline: Sunday 11 October, 23:59 Central time.
const SUNDAY_NIGHT = Date.parse('2026-10-11T23:59:59.999-05:00');

const slotProposal = (teksCode, extra = {}) => ({
  skillId: `teks:${teksCode}`,
  teksCode,
  purpose: 'current_learning',
  purposeLabel: 'Current learning',
  context: 'course',
  dok: 2,
  difficultyBand: 3,
  studentLabel: `Skill ${teksCode}`,
  ...extra,
});

const frozenWeek = () => ({
  ...freezeWeeklyPathGoalProposal({
    weekKey: WEEK,
    courseId: 'algebra1',
    goalSessions: 3,
    dueAt: SUNDAY_NIGHT,
    sessions: [
      slotProposal('A.5A', { alternatives: [{ skillId: 'teks:A.7C', teksCode: 'A.7C', studentLabel: 'Skill A.7C' }] }),
      slotProposal('A.3B'),
      slotProposal('A.2C'),
    ],
  }, {
    studentId: STUDENT,
    classId: 'class-1',
    courseId: 'algebra1',
    canonicalTeks: mathPath.canonicalAlignmentKey,
    displayTeks: mathPath.displayAlignmentKey,
  }),
  assignmentState: 'assigned',
});

const seededDb = () => {
  const week = frozenWeek();
  const db = new FakeFirestore({
    grades: { [STUDENT]: { classId: 'class-1', classPeriod: '2' } },
    classes: { 'class-1': { course: 'algebra1', courseLevel: 'standard', period: '2' } },
    weeklyPathGoalSnapshots: { [`${STUDENT}__${WEEK}`]: week },
  });
  return { db, week };
};

const launch = (db, data, overrides = {}) => startCallable(db, overrides)({
  auth: { uid: 'uid-s1', token: { role: 'student', studentId: STUDENT } },
  data,
});

const openSessionsOf = (db, weeklySlotKey) => [...db.docsOf('pathSessions').values()]
  .filter((session) => session.status === 'active' && session.weeklySlotKey === weeklySlotKey);

test('a recommendation launched on a slot whose swap is open resumes the swap; it never opens a second session', async () => {
  const { db, week } = seededDb();
  const [slot] = week.sessions;

  // The student swaps slot 1 to A.7C and opens it.
  const swapped = await launch(db, { targetAlignmentKey: 'A.7C', weekKey: WEEK, weeklySlotKey: slot.weeklySlotKey, chosenSkillId: 'teks:A.7C' });
  assert.equal(swapped.session.target.alignmentKey, mathPath.canonicalAlignmentKey('A.7C'));
  assert.equal(swapped.session.swappedFromTeks, 'A.5A');
  assert.equal(openSessionsOf(db, slot.weeklySlotKey).length, 1);

  // They reload. Before their sessions arrive the card shows the
  // recommendation, and Start sends it: a different target, so a different
  // lock — no lock exists for it.
  const writesBefore = db.writes.length;
  const relaunch = await launch(db, { targetAlignmentKey: 'A.5A', weekKey: WEEK, weeklySlotKey: slot.weeklySlotKey });
  assert.equal(relaunch.session.sessionId, swapped.session.sessionId, 'the open swap is resumed');
  assert.equal(relaunch.session.target.alignmentKey, mathPath.canonicalAlignmentKey('A.7C'), 'on the standard it was opened with');
  assert.equal(openSessionsOf(db, slot.weeklySlotKey).length, 1, 'one slot, one open session');
  assert.equal(db.writes.length, writesBefore, 'a resume writes nothing: no session, no lock');
  // The slot's sessions were read inside the transaction, by student and week.
  assert.ok(db.reads.some((read) => read.via === 'transaction.get(query)'
    && read.collection === 'pathSessions'
    && read.filters.some((filter) => filter.field === 'studentId' && filter.value === STUDENT)
    && read.filters.some((filter) => filter.field === 'weekKey' && filter.value === WEEK)));

  // The swap itself still resumes through its own lock.
  const again = await launch(db, { targetAlignmentKey: 'A.7C', weekKey: WEEK, weeklySlotKey: slot.weeklySlotKey, chosenSkillId: 'teks:A.7C' });
  assert.equal(again.session.sessionId, swapped.session.sessionId);
  assert.equal(db.docsOf('pathSessions').size, 1);
});

test('the guard is per open slot: other slots, open practice and a finished slot still start their own sessions', async () => {
  const { db, week } = seededDb();
  const [first, second] = week.sessions;
  const swapped = await launch(db, { targetAlignmentKey: 'A.7C', weekKey: WEEK, weeklySlotKey: first.weeklySlotKey });

  // Another slot of the same week is its own commitment.
  const other = await launch(db, { targetAlignmentKey: 'A.3B', weekKey: WEEK, weeklySlotKey: second.weeklySlotKey });
  assert.notEqual(other.session.sessionId, swapped.session.sessionId);
  assert.equal(other.session.weeklySlotKey, second.weeklySlotKey);

  // Open practice on the swapped standard is never folded into the weekly
  // slot's session. (Open course practice first reads the student's pass
  // level; the harness answers that one read.)
  const openPractice = await launch(db, { targetAlignmentKey: 'A.7C' }, {
    loadCoursePathPassProgress: async () => ({ byTeksCode: {} }),
  });
  assert.notEqual(openPractice.session.sessionId, swapped.session.sessionId);
  assert.equal(openPractice.session.weeklySlotKey, null);

  // A FINISHED slot holds no open session, so nothing is resumed (what a
  // second launch of a done slot does is unchanged by this rule).
  const stored = db.docsOf('pathSessions').get(swapped.session.sessionId);
  db.docsOf('pathSessions').set(swapped.session.sessionId, { ...stored, status: 'completed', completedAt: Date.now() });
  const afterFinish = await launch(db, { targetAlignmentKey: 'A.5A', weekKey: WEEK, weeklySlotKey: first.weeklySlotKey });
  assert.notEqual(afterFinish.session.sessionId, swapped.session.sessionId);
  assert.equal(afterFinish.session.target.alignmentKey, mathPath.canonicalAlignmentKey('A.5A'));
});

test('a launch the frozen week does not permit is still refused before any session is touched', async () => {
  const { db, week } = seededDb();
  const [slot] = week.sessions;
  await launch(db, { targetAlignmentKey: 'A.7C', weekKey: WEEK, weeklySlotKey: slot.weeklySlotKey });
  // An open session on the slot is no back door for another standard.
  await assert.rejects(
    launch(db, { targetAlignmentKey: 'A.9D', weekKey: WEEK, weeklySlotKey: slot.weeklySlotKey }),
    (error) => error instanceof HttpsError && error.code === 'failed-precondition' && error.details?.reason === 'target-mismatch',
  );
  assert.equal(db.docsOf('pathSessions').size, 1);
});
