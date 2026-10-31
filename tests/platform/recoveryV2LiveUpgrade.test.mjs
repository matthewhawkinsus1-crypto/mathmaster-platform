/*
 * RECOVERY V2 — THE SAFE, VERSIONED UPGRADE OF A LIVE ASSIGNMENT.
 *
 * "Algebra I — Vertical and Horizontal Transformations of Linear Functions"
 * is live: students have started it. Its Warm-Up and DOL gain Recovery
 * through a dry run a teacher approves, and these tests hold that path to its
 * promises:
 *
 *   the dry run says exactly what will change — six Recovery bindings, the
 *     readiness of both sections before and after — and everything that will
 *     not: every question, every student record, dates, classes, Classroom;
 *   the approval is bound to the plan hash, which moves when a question does
 *     and does NOT move while students keep working;
 *   applying writes one field (recoveryContent) and one audit event, never a
 *     question and never a student document — and applying again changes
 *     nothing (no second version, no second event);
 *   the Standard and the Honors copy are each planned from their own
 *     questions, and a copy that is not a live copy is never touched;
 *   the operator's prepared migration does all of this against Firestore
 *     with a typed confirmation and an approved hash per copy.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { runRecoveryV2Upgrade, verifyLiveCopy, parseRecoveryV2Args } from '../../scripts/recovery-v2-upgrade.mjs';
import {
  RECOVERY_UPGRADE_EVENT_TYPE,
  applyRecoveryUpgrade,
  buildRecoveryUpgradePreview,
  renderRecoveryUpgradeReportText,
} from '../../functions/shared/recoveryContentUpgrade.mjs';
import { serverRecoveryKeyCheck } from '../../functions/shared/recoveryCertificationGrading.mjs';
import { flattenAssignmentQuestions } from '../../functions/shared/recoveryContentPlan.mjs';
import { recoverySourceSignature } from '../../functions/shared/recoveryContent.mjs';
import { ALGEBRA1_TRANSFORMATIONS_RECOVERY_V2 as MIGRATION, matchPreparedRecoveryMigration } from '../../functions/shared/recoveryMigrations.mjs';

const LESSON = compileTeacherImport(readFileSync(new URL(`../../${MIGRATION.lessonFile}`, import.meta.url), 'utf8')).model;
const TITLE = LESSON.assignmentV5.assignment.title;
const AT = '2026-10-21T15:00:00.000Z';

const liveCopy = ({ id = 'live-l2-standard', variant = 'standard', classIds = ['class-p1', 'class-p3'] } = {}) => ({
  ...structuredClone(LESSON.assignmentV5),
  id,
  title: TITLE,
  courseProfile: { course: 'algebra1', courseLevel: variant },
  rigorVariant: variant,
  assignedClassIds: classIds,
  assignedClassPeriods: ['Period 1', 'Period 3'],
  dueAt: '2026-10-14T23:59:00.000Z',
  lateDueAt: '2026-10-31T23:59:00.000Z',
  classroomPackage: { publicationId: 'classroom-post-1' },
  assignmentRevision: 3,
});

const questionIndex = (assignment, questionId) => flattenAssignmentQuestions(assignment).findIndex((question) => question.questionId === questionId);

// A class mid-assignment: finished, part-way, Warm-Up only, not started, and
// one already in a Recovery record from a family-backed copy.
const classTrackers = (assignment) => {
  const at = (questionId) => questionIndex(assignment, questionId);
  const done = (status = 'correct') => ({ status, attemptCount: 1, totalAttempts: 1, gradedBy: 'server' });
  const finished = Object.fromEntries(flattenAssignmentQuestions(assignment).map((question, index) => [index, done(index % 3 ? 'correct' : 'expired')]));
  return [
    { tracker: finished, recovery: null },
    { tracker: { [at('l2-wu-1')]: done(), [at('l2-wu-2')]: done(), [at('l2-wu-3')]: done('expired'), [at('l2-dol-1')]: done() }, recovery: null },
    { tracker: { [at('l2-wu-1')]: done(), [at('l2-wu-2')]: done('expired') }, recovery: null },
    { tracker: {}, recovery: null },
    { tracker: finished, recovery: { dol: { section: 'dol', status: 'practicing' } } },
  ];
};

const preview = (assignment, trackers = classTrackers(assignment), at = AT) => buildRecoveryUpgradePreview({
  assignment,
  manifest: MIGRATION,
  gradeSample: serverRecoveryKeyCheck,
  trackers,
  at,
});

test('the dry run says exactly what changes, and everything that does not', () => {
  const assignment = liveCopy();
  const { report, planHash } = preview(assignment);
  assert.match(planHash, /^rup1:[0-9a-f]{32}$/);
  assert.equal(report.changed, true);
  assert.equal(report.migrationId, MIGRATION.id);
  assert.deepEqual(report.migrationMatch, { matches: true, reasons: [], variant: 'standard' });
  assert.deepEqual(report.changes.map((change) => `${change.label}:${change.questionId}:${change.action}:${change.family.id}`), [
    'Warm-Up Q1:l2-wu-1:add:linear.graphFromSlopeIntercept',
    'Warm-Up Q2:l2-wu-2:add:linear.keyCharacteristics',
    'Warm-Up Q3:l2-wu-3:add:linear.keyCharacteristics',
    'DOL Q1:l2-dol-1:add:transformations.linearPlotImages',
    'DOL Q2:l2-dol-2:add:transformations.linearHorizontalShiftAlgebra',
    'DOL Q3:l2-dol-3:add:transformations.linearCompareEffects',
  ]);
  report.changes.forEach((change) => {
    assert.ok(change.freshVersions >= 12, `${change.label}: ${change.freshVersions} fresh versions`);
    assert.ok(change.describes, `${change.label} says which live question it is for`);
    assert.ok(change.standards.length && change.rigor?.dok, `${change.label} reports its TEKS and rigor`);
  });
  assert.deepEqual(report.readiness, {
    warmup: { before: 'unavailable', after: 'ready', message: null },
    dol: { before: 'unavailable', after: 'ready', message: null },
  });
  assert.equal(report.fullyReadyAfter, true);
  assert.deepEqual(report.notReady, []);
  assert.deepEqual(report.recoveryContent, { versionBefore: 0, versionAfter: 1, bindingsBefore: 0, bindingsAfter: 6 });

  // What will not change.
  assert.equal(report.untouched.questionCount, flattenAssignmentQuestions(assignment).length);
  assert.deepEqual(report.untouched.questions.map((entry) => entry.signature), flattenAssignmentQuestions(assignment).map(recoverySourceSignature));
  assert.deepEqual(report.untouched.studentRecords, { students: 5, withAnyWork: 4, withWarmupWork: 4, withDolWork: 3, withCompletedDol: 2, withRecoveryRecords: 1 });
  assert.ok(report.untouched.statements.some((statement) => /No question is edited, added, removed, reordered or retired/.test(statement)));
  assert.ok(report.untouched.statements.some((statement) => /No student record is written/.test(statement)));
  assert.ok(report.untouched.statements.some((statement) => /Classroom posts and gradebook columns are untouched, and no Classroom grade sync is requested/.test(statement)));
  assert.deepEqual(report.writes, [
    'assignments/live-l2-standard: the recoveryContent field only (version 0 → 1)',
    'assignmentVersionEvents/<new>: one recoveryUpgrade audit event',
  ]);
  // The report a teacher (or operator) saves names no student.
  assert.ok(!JSON.stringify(report).includes('student-'), 'counts only, never an id');
  const text = renderRecoveryUpgradeReportText(report);
  assert.match(text, /WILL CHANGE/);
  assert.match(text, /WILL NOT CHANGE/);
  assert.match(text, /5 student records \(4 with Warm-Up work, 3 with DOL work, 2 with a finished DOL, 1 with Recovery records\) stay exactly as they are/);
});

test('the approval is bound to the questions, not to the students: work in progress never invalidates it, an edited question always does', () => {
  const assignment = liveCopy();
  const { planHash } = preview(assignment);
  // Students keep working between the preview and the approval.
  const busier = classTrackers(assignment).map((row) => ({ ...row, tracker: { ...row.tracker, 99: { status: 'correct' } } }));
  assert.equal(preview(assignment, busier, '2026-10-21T16:00:00.000Z').planHash, planHash, 'later student work and a later clock do not move the plan');
  // A presentation change (a weight, a hint) does not either.
  const reweighted = structuredClone(assignment);
  reweighted.sections.find((section) => section.role === 'dol').questions[0].questionWeight = 3;
  assert.equal(preview(reweighted).planHash, planHash);
  // A changed question does: the commit refuses and asks for a new preview.
  const edited = structuredClone(assignment);
  const dol = edited.sections.find((section) => section.role === 'dol');
  dol.questions[1] = { ...dol.questions[1], prompt: `${dol.questions[1].prompt} (edited)` };
  assert.notEqual(preview(edited).planHash, planHash);
});

test('applying writes one field beside the questions and one audit event — and applying again changes nothing', () => {
  const assignment = liveCopy();
  const before = structuredClone(assignment);
  const { plan, planHash, report } = preview(assignment);
  const applied = applyRecoveryUpgrade({
    assignment,
    plan,
    planHash,
    migrationId: report.migrationId,
    at: AT,
    actorUid: 'teacher-uid',
    actorEmail: 'teacher@school.org',
    authorizationType: 'teacherOfRecord',
    approvedBy: 'teacher@school.org',
    affectedStudentCount: 5,
  });
  assert.equal(applied.changed, true);
  assert.deepEqual(assignment, before, 'the stored assignment object is not touched by planning or applying');
  assert.equal(applied.recoveryContent.version, 1);
  assert.equal(applied.recoveryContent.history[0].source, 'migration');
  assert.equal(applied.recoveryContent.history[0].migrationId, MIGRATION.id);
  assert.equal(applied.recoveryContent.history[0].planHash, planHash);
  assert.deepEqual(Object.keys(applied.recoveryContent.bindings).sort(), Object.keys(MIGRATION.bindings).sort());
  const event = applied.auditEvent;
  assert.equal(event.eventType, RECOVERY_UPGRADE_EVENT_TYPE);
  assert.equal(event.assignmentId, 'live-l2-standard');
  assert.equal(event.approvedBy, 'teacher@school.org');
  assert.equal(event.recoveryContentVersionFrom, 0);
  assert.equal(event.recoveryContentVersionTo, 1);
  assert.equal(event.questionsChanged, 0);
  assert.equal(event.studentRecordsWritten, 0);
  assert.equal(event.classroomSyncRequested, false);
  assert.equal(event.affectedStudentCount, 5);

  // The upgraded document: everything is what it was, plus recoveryContent.
  const upgraded = { ...assignment, recoveryContent: applied.recoveryContent };
  const { recoveryContent: _added, ...rest } = upgraded;
  assert.deepEqual(rest, before, 'ids, order, mathematics, dates, classes, Classroom post: all unchanged');

  // Repeating the migration: nothing to apply, no new version, no new event.
  const again = preview(upgraded);
  assert.equal(again.report.changed, false);
  assert.deepEqual(again.report.writes, []);
  assert.deepEqual(again.report.readiness, {
    warmup: { before: 'ready', after: 'ready', message: null },
    dol: { before: 'ready', after: 'ready', message: null },
  });
  const reapplied = applyRecoveryUpgrade({ assignment: upgraded, plan: again.plan, planHash: again.planHash, at: '2026-10-22T09:00:00.000Z' });
  assert.equal(reapplied.changed, false);
  assert.equal(reapplied.auditEvent, null);
  assert.equal(reapplied.recoveryContent.version, 1);
});

test('the Standard and the Honors copy are each planned from their own questions; other documents are never live copies', () => {
  const standard = liveCopy();
  const honors = liveCopy({ id: 'live-l2-honors', variant: 'honors', classIds: ['class-p5'] });
  // The Honors copy's Practice differs (CCMR, an extension); its Warm-Up and DOL do not.
  const practice = honors.sections.find((section) => section.role === 'practice');
  practice.questions = [...practice.questions.slice(1), { ...structuredClone(practice.questions[0]), questionId: 'honors-ccmr-1', prompt: 'An audited CCMR item.' }];
  const standardPlan = preview(standard);
  const honorsPlan = preview(honors);
  assert.equal(honorsPlan.report.migrationMatch.variant, 'honors');
  assert.equal(honorsPlan.report.changes.length, 6);
  assert.notEqual(honorsPlan.planHash, standardPlan.planHash, 'one approval never covers another copy');
  assert.equal(matchPreparedRecoveryMigration(MIGRATION, { ...standard, title: 'Algebra I - Vertical  and Horizontal Transformations of Linear Functions' }).matches, true, 'dashes and spacing are read the way a teacher reads them');

  const classesById = { 'class-p1': { status: 'active' }, 'class-p3': { status: 'active' }, 'class-p5': { status: 'active' }, 'class-old': { status: 'archived' } };
  assert.equal(verifyLiveCopy({ migration: MIGRATION, assignment: standard, classesById }).live, true);
  assert.equal(verifyLiveCopy({ migration: MIGRATION, assignment: honors, classesById }).live, true);
  const refused = (overrides) => verifyLiveCopy({ migration: MIGRATION, assignment: { ...standard, ...overrides }, classesById }).reasons;
  assert.ok(refused({ assignedClassIds: [] }).includes('not-assigned-to-a-class'), 'a Library copy is not a live copy');
  assert.ok(refused({ assignedClassIds: ['class-old'] }).includes('class-archived:class-old'));
  assert.ok(refused({ courseProfile: { course: 'algebra2' } }).includes('course-differs'));
  assert.ok(refused({ title: 'Algebra I — Slopes of Perpendicular Lines' }).includes('title-differs'));
  assert.ok(refused({ archived: true }).includes('archived'));
  const missing = structuredClone(standard);
  missing.sections.find((section) => section.role === 'dol').questions.pop();
  assert.ok(verifyLiveCopy({ migration: MIGRATION, assignment: missing, classesById }).reasons.some((reason) => reason.startsWith('questions-missing:')));
});

test('a large class is counted, never read into the report, and planned in reasonable time', () => {
  const assignment = liveCopy();
  const one = classTrackers(assignment);
  const trackers = Array.from({ length: 160 }, (_, index) => one[index % one.length]);
  const started = Date.now();
  const { report } = preview(assignment, trackers);
  const elapsed = Date.now() - started;
  assert.equal(report.untouched.studentRecords.students, 160);
  assert.equal(report.untouched.studentRecords.withCompletedDol, 64);
  assert.ok(elapsed < 10_000, `planned in ${elapsed} ms`);
});

/* ---------------------------------------------------------------------------
 * The operator's prepared migration, against an in-memory Firestore.
 * ------------------------------------------------------------------------- */

const fakeFirestore = (collections) => {
  const data = structuredClone(collections);
  const writes = [];
  let auto = 0;
  const snapshotOf = (name, id) => {
    const value = data[name]?.[id];
    return { id, exists: value !== undefined, data: () => (value === undefined ? undefined : structuredClone(value)) };
  };
  const ref = (name, id) => ({ name, id, get: async () => snapshotOf(name, id) });
  const query = (name, filters, fields = null) => ({
    where: (field, op, value) => query(name, [...filters, [field, op, value]], fields),
    select: (...selected) => query(name, filters, selected),
    get: async () => ({
      docs: Object.keys(data[name] || {})
        .filter((id) => filters.every(([field, op, value]) => {
          const actual = data[name][id][field];
          return op === 'in' ? value.includes(actual) : actual === value;
        }))
        .map((id) => {
          const full = snapshotOf(name, id);
          return fields ? { ...full, data: () => Object.fromEntries(fields.map((field) => [field, full.data()[field]])) } : full;
        }),
    }),
  });
  return {
    data,
    writes,
    collection: (name) => ({
      doc: (id = `auto-${(auto += 1)}`) => ref(name, id),
      where: (field, op, value) => query(name, [[field, op, value]]),
    }),
    runTransaction: async (work) => work({
      get: async (target) => snapshotOf(target.name, target.id),
      update: (target, patch) => {
        writes.push({ op: 'update', path: `${target.name}/${target.id}`, fields: Object.keys(patch) });
        Object.assign(data[target.name][target.id], structuredClone(patch));
      },
      set: (target, value) => {
        writes.push({ op: 'set', path: `${target.name}/${target.id}`, fields: Object.keys(value) });
        (data[target.name] ||= {})[target.id] = value;
      },
    }),
  };
};

const fixtureDatabase = () => {
  const standard = liveCopy();
  const honors = liveCopy({ id: 'live-l2-honors', variant: 'honors', classIds: ['class-p5'] });
  const library = { ...liveCopy({ id: 'library-l2', classIds: [] }) };
  const grades = Object.fromEntries(classTrackers(standard).map((row, index) => [`student-${index}`, {
    classId: index % 2 ? 'class-p3' : 'class-p1',
    gradesByAssignment: { 'live-l2-standard': row.tracker },
    sectionRecoveryByAssignment: row.recovery ? { 'live-l2-standard': row.recovery } : {},
  }]));
  return fakeFirestore({
    assignments: { 'live-l2-standard': standard, 'live-l2-honors': honors, 'library-l2': library },
    classes: { 'class-p1': { status: 'active' }, 'class-p3': { status: 'active' }, 'class-p5': { status: 'active' } },
    grades,
  });
};

test('the prepared migration: a dry run writes nothing; execute writes exactly the approved copies; a repeat writes nothing', async () => {
  const db = fixtureDatabase();
  const gradesBefore = structuredClone(db.data.grades);
  const questionsBefore = Object.fromEntries(Object.entries(db.data.assignments).map(([id, entry]) => [id, structuredClone(entry.sections)]));
  const now = () => AT;

  const dry = await runRecoveryV2Upgrade({ db, migration: MIGRATION, now });
  assert.equal(dry.mode, 'dryRun');
  assert.deepEqual(db.writes, [], 'a dry run writes nothing');
  const live = dry.copies.filter((copy) => copy.live);
  assert.deepEqual(live.map((copy) => copy.assignmentId).sort(), ['live-l2-honors', 'live-l2-standard']);
  assert.deepEqual(dry.copies.find((copy) => copy.assignmentId === 'library-l2').reasons, ['not-assigned-to-a-class']);
  assert.equal(live.find((copy) => copy.assignmentId === 'live-l2-standard').report.untouched.studentRecords.students, 5, 'the real student rows are counted');

  // Execute needs an approved hash per copy; a wrong one is refused.
  const expect = Object.fromEntries(live.map((copy) => [copy.assignmentId, copy.planHash]));
  const wrongHash = await runRecoveryV2Upgrade({
    db, migration: MIGRATION, now, execute: true, actor: 'operator@school.org', approvedBy: 'teacher@school.org',
    expect: { 'live-l2-standard': 'rup1:00000000000000000000000000000000' },
    confirm: async () => true,
  });
  assert.deepEqual(wrongHash.execution.applied, []);
  assert.deepEqual(wrongHash.execution.refused, [{ assignmentId: 'live-l2-standard', reason: 'plan-hash-differs-from-approval' }]);
  assert.deepEqual(db.writes, []);

  // A declined confirmation writes nothing either.
  const declined = await runRecoveryV2Upgrade({ db, migration: MIGRATION, now, execute: true, actor: 'operator@school.org', approvedBy: 'teacher@school.org', expect, confirm: async () => false });
  assert.equal(declined.aborted, true);
  assert.deepEqual(db.writes, []);

  const executed = await runRecoveryV2Upgrade({ db, migration: MIGRATION, now, execute: true, actor: 'operator@school.org', approvedBy: 'teacher@school.org', expect, confirm: async () => true });
  assert.deepEqual(executed.execution.applied.map((entry) => entry.assignmentId).sort(), ['live-l2-honors', 'live-l2-standard']);
  // Per copy: the recoveryContent field, and one audit event. Nothing else.
  const updates = db.writes.filter((write) => write.op === 'update');
  assert.deepEqual(updates.map((write) => write.path).sort(), ['assignments/live-l2-honors', 'assignments/live-l2-standard']);
  updates.forEach((write) => assert.deepEqual(write.fields, ['recoveryContent'], `${write.path}: one field`));
  assert.equal(db.writes.filter((write) => write.op === 'set' && write.path.startsWith('assignmentVersionEvents/')).length, 2);
  assert.ok(db.writes.every((write) => !write.path.startsWith('grades/')), 'no student document is written');
  assert.deepEqual(db.data.grades, gradesBefore, 'every student record is exactly as it was');
  Object.entries(questionsBefore).forEach(([id, sections]) => assert.deepEqual(db.data.assignments[id].sections, sections, `${id}: questions unchanged`));
  assert.equal(db.data.assignments['library-l2'].recoveryContent, undefined, 'the Library copy is untouched');
  const event = Object.values(db.data.assignmentVersionEvents)[0];
  assert.equal(event.eventType, 'recoveryUpgrade');
  assert.equal(event.actorAuthorizationType, 'operatorWithTeacherApproval');
  assert.equal(event.approvedBy, 'teacher@school.org');

  // Running it again with the same approval (a retry after a network failure,
  // say): the copies are current, so their plan is no longer the approved one
  // and nothing is written — no second version, no second audit event.
  const writesSoFar = db.writes.length;
  const repeat = await runRecoveryV2Upgrade({ db, migration: MIGRATION, now, execute: true, actor: 'operator@school.org', approvedBy: 'teacher@school.org', expect, confirm: async () => true });
  assert.deepEqual(repeat.execution.applied, []);
  assert.deepEqual(repeat.execution.refused.map((entry) => `${entry.assignmentId}:${entry.reason}`).sort(), [
    'live-l2-honors:plan-hash-differs-from-approval',
    'live-l2-standard:plan-hash-differs-from-approval',
  ]);
  assert.equal(db.writes.length, writesSoFar, 'no second version, no second audit event');
  const after = await runRecoveryV2Upgrade({ db, migration: MIGRATION, now });
  after.copies.filter((copy) => copy.live).forEach((copy) => assert.equal(copy.report.changed, false, `${copy.assignmentId} is already current`));
});

test('the operator script refuses to write without a project, the approver, and an approved plan hash', () => {
  assert.throws(() => parseRecoveryV2Args(['--execute']), /--execute needs --project/);
  assert.throws(() => parseRecoveryV2Args(['--execute', '--project', 'mathmaster-prod']), /--actor and --approved-by/);
  assert.throws(() => parseRecoveryV2Args(['--execute', '--project', 'mathmaster-prod', '--actor', 'a@x.org', '--approved-by', 'b@x.org']), /--expect/);
  // --yes skips the typed project id: only against the emulator (SI10).
  const live = ['--execute', '--project', 'mathmaster-prod', '--actor', 'a@x.org', '--approved-by', 'b@x.org', '--expect', 'asg=hash', '--yes'];
  assert.throws(() => parseRecoveryV2Args(live, {}), /refusing --yes/);
  assert.equal(parseRecoveryV2Args(live, { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' }).yes, true);
  const options = parseRecoveryV2Args(['--project', 'mathmaster-prod']);
  assert.equal(options.execute, false, 'without --execute it is a dry run');
});

/* ---------------------------------------------------------------------------
 * The server's callables keep the same promise (functions/index.js).
 * ------------------------------------------------------------------------- */

test('the commit callable re-plans inside its transaction, refuses a moved plan, and writes only recoveryContent and the audit event', () => {
  const index = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
  const commit = index.slice(index.indexOf('exports.commitRecoveryContentUpgrade = onCall('), index.indexOf('/*\n * AUTHORITATIVE TEACHER QUESTION REPAIR.'));
  const previewCallable = index.slice(index.indexOf('exports.previewRecoveryContentUpgrade = onCall('), index.indexOf('exports.commitRecoveryContentUpgrade = onCall('));
  assert.ok(commit.length > 500 && previewCallable.length > 300, 'both callables found');
  assert.doesNotMatch(previewCallable, /\.(update|set|delete)\(/, 'the preview writes nothing');
  assert.match(commit, /return await db\.runTransaction\(async \(transaction\) => \{[\s\S]*const assignment = requireRecoveryUpgradeAssignment\(await transaction\.get\(ref\)\);[\s\S]*library\.buildRecoveryUpgradePreview\(\{/, 'the plan is rebuilt from the document read inside the transaction');
  assert.match(commit, /if \(preview\.planHash !== expectedPlanHash\) \{\s*throw new HttpsError\("failed-precondition"[^]*?reason: "recovery-upgrade-plan-changed"/);
  const writes = [...commit.matchAll(/transaction\.(update|set|delete|create)\(([^;]+)\);/g)].map((match) => `${match[1]}(${match[2]})`);
  assert.deepEqual(writes, [
    'update(ref, { [library.RECOVERY_CONTENT_FIELD]: applied.recoveryContent })',
    'set(eventRef, { ...applied.auditEvent, createdAt: FieldValue.serverTimestamp() })',
  ]);
  assert.doesNotMatch(commit, /collection\("grades"\)/, 'no student document is read into the write or written');
  assert.match(commit, /if \(!preview\.report\.changed\) \{\s*return \{\s*assignmentId,\s*alreadyCurrent: true,/, 'a repeat approval writes nothing');
});
