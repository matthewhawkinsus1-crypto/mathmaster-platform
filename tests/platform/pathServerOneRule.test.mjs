/*
 * THE SERVER READS A SKILL BY THE ONE MASTERY RULE (MP22), AND AN OPEN
 * RETENTION CHECK IS DUE AND HAS ITS OWN LOCK (MP21).
 *
 * Every screen reads a skill as the more favourable of the server profile and
 * the assignment record. Two server decisions read the server profile alone:
 * whether a retention check is due (the weekly freeze; an open check had no
 * check at all), and whether a Challenge is earned (which read the TARGET
 * skill's own profile, which a Challenge skill never has, so every Challenge
 * card was refused on its first question and its session stuck). These tests
 * run the server's helpers (functions/lib/favourableMastery.js) on a small
 * Firestore stand-in with the browser's real engine, against what the
 * student's own screen computes from the same records, and the real
 * startMyMathPathSession source through the callable harness.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { FakeFirestore, HttpsError, topLevelFunction } from './helpers/serverCallableHarness.mjs';
import { region } from './helpers/sourceContract.mjs';
import { studentWithAssignmentWork } from './helpers/assignmentWork.mjs';
import { RETENTION_PROBE } from '../../functions/shared/pathRetentionCheck.mjs';
import { freezeWeeklyPathGoalProposal } from '../../functions/shared/weeklyPathSlotAuthority.mjs';
import { buildUnifiedMasteryProfiles } from '../../src/platform/mastery/unifiedMastery.js';
import { evaluateStudentRetentionSchedule } from '../../src/platform/retention/retentionScheduler.js';
import { buildStudentPathOptions } from '../../src/platform/path/studentPathOptions.js';
import { getSkillGraph, teksCodeFromSkillId } from '../../src/platform/path/skillGraph.js';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');
const pathContentRelease = require('../../functions/lib/pathContentRelease.js');
const pathSessionLock = require('../../functions/lib/pathSessionLock.js');
const favourableMastery = require('../../functions/lib/favourableMastery.js');
const { loadWeeklyFreezeInputs } = require('../../functions/lib/weeklyPathFreezeInputs.js');

const SERVER = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
const DAY = 86400000;
const STUDENT = 'S1';
const CLASS = { classId: 'class-1', period: '2', course: 'algebra1', courseLevel: 'standard' };

// Documents by path, the one query these helpers run (the class's
// assignments), and a log of every read so a test can say what was NOT read.
const fakeDb = (documents) => {
  const reads = [];
  const all = (name) => Object.entries(documents)
    .filter(([key]) => key.startsWith(`${name}/`) && !key.slice(name.length + 1).includes('/'))
    .map(([key, data]) => ({ id: key.slice(name.length + 1), data: () => data }));
  return {
    reads,
    collection: (name) => ({
      doc: (id) => ({
        get: async () => {
          reads.push(`${name}/${id}`);
          const data = documents[`${name}/${id}`];
          return { exists: data !== undefined, data: () => data };
        },
      }),
      where: (field, op, value) => ({
        get: async () => {
          assert.equal(op, 'array-contains');
          reads.push(`${name}?${field}=${value}`);
          return { docs: all(name).filter((entry) => (entry.data()?.[field] || []).includes(value)) };
        },
      }),
    }),
  };
};

// A skill the server's evidence calls Secure, not Mastered.
const secureServer = { mastery: { estimate: 72 }, accumulator: { eligibleEvents: 3, effectiveWeight: 3, independentSuccesses: 2 }, dimensions: { eligibleGradeLevelEvents: 3, dokRepresented: [2] } };
// Mastered by the server's own rule.
const masteredServer = { mastery: { estimate: 96 }, accumulator: { eligibleEvents: 10, effectiveWeight: 10, independentSuccesses: 8 }, dimensions: { eligibleGradeLevelEvents: 10, dokRepresented: [2, 3] } };

// --- The lock -------------------------------------------------------------------

test('an open retention check and open practice on one standard hold different locks; a weekly slot holds one (MP21)', () => {
  const base = { studentId: STUDENT, targetAlignmentKey: 'texas:A.3A' };
  const practice = pathSessionLock.pathSessionLockId({ ...base, sessionKind: 'practice' });
  const check = pathSessionLock.pathSessionLockId({ ...base, sessionKind: RETENTION_PROBE });
  assert.notEqual(check, practice, 'neither blocks the other');
  // Open practice keeps the id it always had, so nothing in flight moves.
  assert.equal(practice, mathPath.opaqueId('pathlock', STUDENT, 'texas:A.3A', 'course', 'open-practice'));
  assert.equal(pathSessionLock.openPracticeLockId(base), practice);
  // A weekly slot is one place, whatever kind of session it holds.
  const slot = { ...base, weeklySlotKey: '2|teks:A.3A|A.3A|retention|course|2|3' };
  assert.equal(pathSessionLock.pathSessionLockId({ ...slot, sessionKind: RETENTION_PROBE }), pathSessionLock.pathSessionLockId({ ...slot, sessionKind: 'practice' }));
  assert.equal(pathSessionLock.pathSessionLockId({ ...slot, sessionKind: RETENTION_PROBE }), mathPath.opaqueId('pathlock', STUDENT, 'texas:A.3A', 'course', slot.weeklySlotKey));
  // An exam's practice is its own place too.
  assert.notEqual(pathSessionLock.pathSessionLockId({ ...base, assessmentFramework: 'act' }), practice);
});

test('a session is released by the lock it recorded, and one started before by the lock it took then (MP21)', () => {
  // The old completion's own formula, written out: what every session in
  // flight on deploy day took when it started.
  const oldFormula = (session) => mathPath.opaqueId('pathlock', STUDENT, session.target.alignmentKey, session.assessmentFramework || 'course', session.weeklySlotKey || 'open-practice');
  const inFlight = [
    { target: { alignmentKey: 'texas:A.3A' }, sessionKind: 'practice' },
    { target: { alignmentKey: 'texas:A.3A' }, sessionKind: RETENTION_PROBE },
    { target: { alignmentKey: 'texas:A.3A' }, sessionKind: 'practice', assessmentFramework: 'act' },
    { target: { alignmentKey: 'texas:A.3A' }, sessionKind: RETENTION_PROBE, weeklySlotKey: 'k2' },
  ];
  inFlight.forEach((session) => assert.equal(pathSessionLock.lockIdForSession(session, { studentId: STUDENT }), oldFormula(session), JSON.stringify(session)));
  // A check started now recorded its own lock, and is released by it.
  const recorded = pathSessionLock.pathSessionLockId({ studentId: STUDENT, targetAlignmentKey: 'texas:A.3A', sessionKind: RETENTION_PROBE });
  assert.equal(pathSessionLock.lockIdForSession({ target: { alignmentKey: 'texas:A.3A' }, sessionKind: RETENTION_PROBE, lockId: recorded }, { studentId: STUDENT }), recorded);
  assert.notEqual(recorded, oldFormula(inFlight[1]));
});

// --- Retention: due by the one rule ------------------------------------------------

// A.3A: three assignment questions right first time (Mastered in assignment
// work, the 0.9 record), and Secure on the server's own evidence.
const recordMastered = () => {
  const work = studentWithAssignmentWork({ 'A.3A': [1, 1, 1], 'A.5A': [0, 0, 1] });
  const assignment = { ...work.assignments[0], assignedClassIds: [CLASS.classId] };
  return { student: work.student, assignments: [assignment] };
};

test('a retention check is due for a skill Mastered in assignment work, as the student\'s screen says (MP22)', async () => {
  const now = Date.now();
  const { student, assignments } = recordMastered();
  const serverProfiles = { 'A.3A': secureServer, 'A.5A': secureServer };
  const schedules = {
    'A.3A': { teksCode: 'A.3A', status: 'scheduled', lastVerifiedAt: now - 16 * DAY, successfulCheckCount: 0, nextCheckDueAt: now - 2 * DAY },
    'A.5A': { teksCode: 'A.5A', status: 'scheduled', lastVerifiedAt: now - 16 * DAY, successfulCheckCount: 0, nextCheckDueAt: now - 2 * DAY },
  };
  const db = fakeDb({ [`assignments/${assignments[0].id}`]: assignments[0] });
  const due = await favourableMastery.retentionDueByOneRule({
    db, studentId: STUDENT, studentData: student, classRecord: CLASS, serverProfiles, schedules, displayCodes: ['A.3A', 'A.5A'], now,
  });
  // What the student's own screen computes from the same records.
  const unified = buildUnifiedMasteryProfiles({ student, assignments, serverProfiles, retentionSchedulesByTEKS: schedules });
  const screen = new Set(evaluateStudentRetentionSchedule(unified, schedules, now).pendingProbes.map((probe) => probe.teksCode));
  assert.equal(screen.has('A.3A'), true, 'fixture: the screen offers the check');
  assert.equal(screen.has('A.5A'), false, 'fixture: the screen offers none for a skill neither record masters');
  assert.equal(due.get('A.3A'), true, 'the server agrees: Mastered by the assignment record, and due');
  assert.equal(due.get('A.5A'), false);
  assert.ok(db.reads.includes(`assignments?assignedClassIds=${CLASS.classId}`), 'the record needs the class\'s assignments');
});

test('the class\'s assignments are read only when the server\'s own profile cannot answer, and a failure changes nothing (MP22)', async () => {
  const now = Date.now();
  const { student, assignments } = recordMastered();
  const schedules = { 'A.3A': { status: 'scheduled', successfulCheckCount: 0, nextCheckDueAt: now - 2 * DAY } };
  // Mastered by the server's own rule: due without reading anything more.
  const db = fakeDb({ [`assignments/${assignments[0].id}`]: assignments[0] });
  const own = await favourableMastery.retentionDueByOneRule({
    db, studentId: STUDENT, studentData: student, classRecord: CLASS, serverProfiles: { 'A.3A': masteredServer }, schedules, displayCodes: ['A.3A'], now,
  });
  assert.equal(own.get('A.3A'), true);
  assert.deepEqual(db.reads, [], 'no assignment read when the server\'s profile already says due');
  // The browser's code is not deployed: the server's profile decides, as before.
  const missing = await favourableMastery.retentionDueByOneRule({
    db, studentId: STUDENT, studentData: student, classRecord: CLASS, serverProfiles: { 'A.3A': secureServer }, schedules, displayCodes: ['A.3A'], now,
    plannerOptions: { repoRoot: '/nonexistent-repo', vendorRoot: '/nonexistent-vendor' },
  });
  assert.equal(missing.get('A.3A'), false);
});

test('the weekly freeze keeps a Retention slot as the check for a skill Mastered in assignment work (MP22)', async () => {
  const now = Date.now();
  const weekKey = '2026-10-05';
  const { student, assignments } = recordMastered();
  const documents = {
    [`assignments/${assignments[0].id}`]: assignments[0],
    [`studentMasteryProfiles/${STUDENT}`]: { profiles: { 'A.3A': secureServer, 'A.5A': secureServer } },
    [`studentRetentionSchedules/${STUDENT}`]: { schedules: {
      'A.3A': { status: 'scheduled', successfulCheckCount: 0, nextCheckDueAt: now - 2 * DAY },
      'A.5A': { status: 'scheduled', successfulCheckCount: 0, nextCheckDueAt: now - 2 * DAY },
    } },
  };
  const retentionSlot = (code) => ({ skillId: `teks:${code}`, teksCode: code, purpose: 'retention', purposeLabel: 'Retention check', context: 'course', dok: 2, difficultyBand: 3 });
  const goal = { weekKey, sessions: [retentionSlot('A.3A'), retentionSlot('A.5A')] };
  const db = fakeDb(documents);
  const inputs = await loadWeeklyFreezeInputs({ db, studentId: STUDENT, studentData: student, classRecord: CLASS, goal, now });
  assert.equal(inputs.retentionDue('A.3A'), true, 'Mastered by the record and due: the slot stays a two-question check');
  assert.equal(inputs.retentionDue('A.5A'), false, 'neither record masters it: a Review, as before');
  const frozen = freezeWeeklyPathGoalProposal(
    { weekKey, courseId: 'algebra1', dueAt: Date.parse('2026-10-11T23:59:59.999-05:00'), goalSessions: 2, sessions: goal.sessions },
    { studentId: STUDENT, classId: CLASS.classId, courseId: 'algebra1', retentionDue: inputs.retentionDue, canonicalTeks: mathPath.canonicalAlignmentKey, displayTeks: mathPath.displayAlignmentKey },
  );
  assert.deepEqual(frozen.sessions.map((entry) => entry.purpose), ['retention', 'responsiveReview']);
  // A full week with no Retention slot pays for no extra read (a short one is
  // planned by the server, which reads the assignments for that reason).
  const plain = fakeDb(documents);
  const fullWeek = Array.from({ length: inputs.requestedSessions }, () => ({ ...retentionSlot('A.3A'), purpose: 'current_learning' }));
  const plainInputs = await loadWeeklyFreezeInputs({ db: plain, studentId: STUDENT, studentData: student, classRecord: CLASS, goal: { weekKey, sessions: fullWeek }, now });
  assert.equal(plainInputs.plannedSessions, null, 'fixture: a full week is not planned by the server');
  assert.equal(plain.reads.some((read) => read.startsWith('assignments')), false);
  assert.equal(plainInputs.retentionDue('A.3A'), false, 'asked anyway, the server\'s profile alone answers: no read, no check');
});

// --- Challenge: earned on the student's own Path -------------------------------------

// 24 November 2026, Algebra I between Module 3's topics: with every skill the
// class has reached Mastered, a few skills just ahead are Challenge cards.
const NOVEMBER = Date.parse('2026-11-24T15:00:00Z');
const challengeFixture = () => {
  const skills = getSkillGraph('algebra1');
  const blank = buildStudentPathOptions({ student: { id: STUDENT }, assignments: [], courseId: 'algebra1', nowValue: NOVEMBER });
  const ahead = new Set(Object.values(blank).filter(Array.isArray).flat().filter((row) => row.calendarTiming === 'upcoming').map((row) => row.skillId));
  const reached = skills.filter((skill) => !ahead.has(skill.skillId)).map((skill) => teksCodeFromSkillId(skill.skillId));
  // Half Mastered on the server's evidence, half in assignment work only.
  const serverCodes = reached.filter((code, index) => index % 2 === 0);
  const recordCodes = reached.filter((code, index) => index % 2 === 1);
  const work = studentWithAssignmentWork(Object.fromEntries(recordCodes.map((code) => [code, [1, 1, 1]])));
  const assignment = { ...work.assignments[0], assignedClassIds: [CLASS.classId] };
  const serverProfiles = Object.fromEntries(serverCodes.map((code) => [code, masteredServer]));
  const screen = buildStudentPathOptions({ student: work.student, assignments: [assignment], courseId: 'algebra1', serverMasteryProfiles: serverProfiles, nowValue: NOVEMBER });
  return { skills, work, assignment, serverProfiles, screen };
};

test('a Challenge is earned exactly where the student\'s own Path offers one, by the one rule (MP22)', async () => {
  const { skills, work, assignment, serverProfiles, screen } = challengeFixture();
  const offered = new Set(screen.extension.map((row) => teksCodeFromSkillId(row.skillId)));
  assert.ok(offered.size > 0, 'fixture: the screen shows Challenge cards');
  assert.ok(offered.has('A.5C'), `fixture: A.5C is a Challenge card (${[...offered].join(', ')})`);
  const mastered = new Set(screen.mastered.map((row) => teksCodeFromSkillId(row.skillId)));
  const db = fakeDb({ [`assignments/${assignment.id}`]: assignment });
  for (const skill of skills) {
    const code = teksCodeFromSkillId(skill.skillId);
    const earned = await favourableMastery.courseChallengeEarnedByOneRule({
      db, studentId: STUDENT, studentData: work.student, classRecord: CLASS, courseId: 'algebra1', targetDisplayCode: code, serverProfiles, now: NOVEMBER,
    });
    assert.equal(earned, offered.has(code) || mastered.has(code), `${code}: the server and the student's Path disagree`);
  }
  // The old check asked the TARGET's own profile, which a Challenge skill does
  // not have: it refused every card above.
  const courseChallengeEarned = new Function(`${topLevelFunction('courseChallengeEarned')}\nreturn courseChallengeEarned;`)();
  assert.equal(courseChallengeEarned(serverProfiles['A.5C'] || {}), false);
});

test('the old answer still counts, and a Challenge the server cannot check is not granted (MP22)', async () => {
  const db = fakeDb({});
  assert.equal(await favourableMastery.courseChallengeEarnedByOneRule({ db, studentId: STUDENT, classRecord: CLASS, targetDisplayCode: 'A.5C', ownProfileEarned: true }), true);
  assert.deepEqual(db.reads, [], 'the target\'s own record already earned it: nothing more is read');
  assert.equal(await favourableMastery.courseChallengeEarnedByOneRule({
    db, studentId: STUDENT, classRecord: CLASS, targetDisplayCode: 'A.5C', now: NOVEMBER,
    plannerOptions: { repoRoot: '/nonexistent-repo', vendorRoot: '/nonexistent-vendor' },
  }), false);
});

// --- The callable, as written ----------------------------------------------------------

const constantDeclaration = (name) => {
  const match = SERVER.match(new RegExp(`^const ${name} = [^\\n]+;$`, 'm'));
  assert.ok(match, `functions/index.js no longer declares const ${name} on one line; update this harness`);
  return match[0];
};
const unexpected = (name) => () => { throw new Error(`${name} is not reached here; this harness does not model it`); };
const sharedImport = (specifier) => import(new URL(`../../functions/${String(specifier).replace(/^\.\//, '')}`, import.meta.url));

const startCallable = (db, collaborators = {}) => {
  const callable = `${region(SERVER, 'exports.startMyMathPathSession = onCall(', '\n}));\n', 'startMyMathPathSession')}\n}));`
    .replaceAll('import("./shared/', 'sharedImport("./shared/');
  const tools = `${region(SERVER, 'const WEEKLY_SLOT_TEKS_TOOLS = ', '\n});\n', 'weekly slot TEKS tools')}\n});`;
  const supplied = {
    onCall: (handler) => handler,
    withPathCallableDiagnostics: async (operation, handler) => handler(),
    HttpsError,
    mathPath,
    pathContentRelease,
    pathSessionLock,
    getFirestore: () => db,
    logger: { info() {}, warn() {}, error() {} },
    sharedImport,
    loadCcmrProgress: unexpected('loadCcmrProgress'),
    resolveServerCcmrChallengeTier: unexpected('resolveServerCcmrChallengeTier'),
    loadCoursePathPassProgress: async () => ({ byTeksCode: {} }),
    pathCoverage: unexpected('pathCoverage'),
    livePathSkillIsLaunchable: unexpected('livePathSkillIsLaunchable'),
    rebuildStoredPathCoverage: unexpected('rebuildStoredPathCoverage'),
    loadAssessmentContentReleaseState: unexpected('loadAssessmentContentReleaseState'),
    safeBuildTemplateIssuePlan: unexpected('safeBuildTemplateIssuePlan'),
    favourableMastery: {
      retentionDueByOneRule: unexpected('favourableMastery.retentionDueByOneRule'),
      courseChallengeEarnedByOneRule: unexpected('favourableMastery.courseChallengeEarnedByOneRule'),
    },
    ...collaborators,
  };
  const body = [
    ...['CLASS_COLLECTION', 'COVERAGE_COLLECTION', 'COURSE_PATH_MAX_LEVEL', 'WEEKLY_PATH_GOAL_SNAPSHOTS', 'PATH_ASSESSMENT_FRAMEWORKS']
      .map(constantDeclaration),
    ...['requireStudent', 'loadStudentClass', 'pathSessionRequiredQuestions', 'normalizePathAssessmentFramework',
      'pathQuestionMatchesFramework', 'coverageCourseIdFor', 'publicPathSession', 'assessmentReleaseUpdateError', 'courseChallengeEarned']
      .map(topLevelFunction),
    tools,
    'const exports = {};',
    callable,
    'return exports.startMyMathPathSession;',
  ].join('\n');
  const factory = new Function(...Object.keys(supplied), `"use strict";\n${body}`);
  return factory(...Object.values(supplied));
};

const seeded = () => new FakeFirestore({
  grades: { [STUDENT]: { classId: CLASS.classId, classPeriod: CLASS.period } },
  classes: { [CLASS.classId]: { course: 'algebra1', courseLevel: 'standard', period: CLASS.period } },
});
const launch = (db, data, collaborators) => startCallable(db, collaborators)({
  auth: { uid: 'uid-s1', token: { role: 'student', studentId: STUDENT } },
  data,
});
const dueStub = (answer) => ({
  retentionDueByOneRule: async ({ displayCodes }) => new Map(displayCodes.map((code) => [code, answer])),
  courseChallengeEarnedByOneRule: unexpected('courseChallengeEarnedByOneRule'),
});

test('an open retention check is refused when it is not due, before anything is written (MP21)', async () => {
  const db = seeded();
  const writesBefore = db.writes.length;
  await assert.rejects(
    launch(db, { targetAlignmentKey: 'A.3A', sessionKind: RETENTION_PROBE }, { favourableMastery: dueStub(false) }),
    (error) => error instanceof HttpsError && error.code === 'failed-precondition' && error.details?.reason === 'retention-check-not-due',
  );
  assert.equal(db.writes.length, writesBefore, 'no session and no lock');
  assert.equal(db.docsOf('pathSessions').size, 0);
});

test('a due check opens beside open practice on the same standard, on a lock of its own that it records (MP21)', async () => {
  const db = seeded();
  const practice = await launch(db, { targetAlignmentKey: 'A.3A' });
  assert.equal(practice.session.sessionKind, 'practice');
  const check = await launch(db, { targetAlignmentKey: 'A.3A', sessionKind: RETENTION_PROBE }, { favourableMastery: dueStub(true) });
  assert.notEqual(check.session.sessionId, practice.session.sessionId, 'open practice no longer blocks the check');
  assert.equal(check.session.sessionKind, RETENTION_PROBE);
  assert.equal(check.session.requiredQuestions, 2);
  const target = mathPath.canonicalAlignmentKey('A.3A');
  const expectedLock = pathSessionLock.pathSessionLockId({ studentId: STUDENT, targetAlignmentKey: target, sessionKind: RETENTION_PROBE });
  assert.equal(db.docsOf('pathSessions').get(check.session.sessionId).lockId, expectedLock, 'the session records its lock');
  assert.equal(db.docsOf('activePathLocks').get(expectedLock)?.sessionId, check.session.sessionId);
  // And the other way round: practice resumes its own session, not the check.
  const again = await launch(db, { targetAlignmentKey: 'A.3A' });
  assert.equal(again.session.sessionId, practice.session.sessionId);
  // A second launch of the check resumes it, due or not.
  const resumed = await launch(db, { targetAlignmentKey: 'A.3A', sessionKind: RETENTION_PROBE }, { favourableMastery: dueStub(false) });
  assert.equal(resumed.session.sessionId, check.session.sessionId, 'an open check is always resumed');
});

test('a check opened before its own lock existed is resumed from the open-practice lock, never doubled (MP21)', async () => {
  const db = seeded();
  const target = mathPath.canonicalAlignmentKey('A.3A');
  const oldLock = pathSessionLock.openPracticeLockId({ studentId: STUDENT, targetAlignmentKey: target });
  db.docsOf('pathSessions').set('old-check', {
    sessionId: 'old-check', studentId: STUDENT, status: 'active', sessionKind: RETENTION_PROBE, assessmentFramework: null,
    coursePracticeIntent: null, target: { alignmentKey: target }, requiredQuestions: 2, summary: { completedQuestions: 1 },
  });
  db.docsOf('activePathLocks').set(oldLock, { sessionId: 'old-check', studentId: STUDENT, targetAlignmentKey: target, sessionKind: RETENTION_PROBE });
  const resumed = await launch(db, { targetAlignmentKey: 'A.3A', sessionKind: RETENTION_PROBE }, { favourableMastery: dueStub(true) });
  assert.equal(resumed.session.sessionId, 'old-check');
  assert.equal(db.docsOf('pathSessions').size, 1, 'one open check');
});

test('a Challenge launch keeps its intent only when earned; otherwise it is ordinary practice, never a stuck session (MP22)', async () => {
  const earnedDb = seeded();
  const earned = await launch(earnedDb, { targetAlignmentKey: 'A.5C', coursePracticeIntent: 'challenge' }, {
    favourableMastery: { retentionDueByOneRule: unexpected('retentionDueByOneRule'), courseChallengeEarnedByOneRule: async () => true },
  });
  assert.equal(earned.session.coursePracticeIntent, 'challenge');
  assert.equal(earned.session.challengeEarned, true, 'recorded for issueNextQuestion');
  assert.equal(earned.session.coursePassLevel, null, 'a Challenge is not a numbered round');

  const plainDb = seeded();
  const asked = [];
  const plain = await launch(plainDb, { targetAlignmentKey: 'A.5C', coursePracticeIntent: 'challenge' }, {
    favourableMastery: {
      retentionDueByOneRule: unexpected('retentionDueByOneRule'),
      courseChallengeEarnedByOneRule: async (args) => { asked.push(args); return false; },
    },
  });
  assert.equal(plain.session.coursePracticeIntent, null, 'not earned: ordinary practice on the skill');
  assert.equal(plain.session.challengeEarned, null);
  assert.equal(plain.session.coursePassLevel, 1);
  // The helper was asked about this student's target, with the old answer.
  assert.equal(asked.length, 1);
  assert.equal(asked[0].targetDisplayCode, 'A.5C');
  assert.equal(asked[0].studentId, STUDENT);
  assert.equal(asked[0].ownProfileEarned, false, 'no profile of its own');

  // The target's own server profile Mastered (the old rule) is passed on.
  const ownDb = seeded();
  ownDb.docsOf('studentMasteryProfiles').set(STUDENT, { profiles: { 'A.5C': { mastery: { status: 'mastered', estimate: 93 } } } });
  const ownAsked = [];
  const own = await launch(ownDb, { targetAlignmentKey: 'A.5C', coursePracticeIntent: 'challenge' }, {
    favourableMastery: {
      retentionDueByOneRule: unexpected('retentionDueByOneRule'),
      courseChallengeEarnedByOneRule: async (args) => { ownAsked.push(args); return args.ownProfileEarned === true; },
    },
  });
  assert.equal(ownAsked[0].ownProfileEarned, true);
  assert.equal(own.session.coursePracticeIntent, 'challenge');
});

test('an open check that a new content release supersedes is replaced even when no longer due (MP21 follow-up)', () => {
  // The due rule is for NEW checks. A test-framework check open when its
  // content release changes is superseded and replaced in the same
  // transaction; refusing the replacement as "not due" aborted that
  // transaction, so the old check was neither resumed nor replaced.
  const callable = region(SERVER, 'exports.startMyMathPathSession = onCall(', '\n}));\n', 'startMyMathPathSession');
  const supersede = region(callable, 'pathContentRelease.supersedeSessionForContentRelease(', 'if (assessmentReleaseState.tracked && assessmentReleaseState.available === false)', 'the supersede branch');
  assert.match(supersede, /replacingOpenCheck = existing\.data\(\)\?\.sessionKind === "retentionProbe";/);
  assert.match(callable, /&& !openRetentionCheckDue && !replacingOpenCheck\) \{/);
  assert.equal([...callable.matchAll(/replacingOpenCheck = /g)].length, 2, 'false, then set only where a check is superseded');
});
