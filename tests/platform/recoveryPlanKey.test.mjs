/*
 * THE ASSIGNMENT HUB'S RECOVERY READINESS DOES NOT GO STALE AFTER AN EDIT (TT02).
 *
 * The hub keeps the planner's answer until a key moves (recoveryPlanKey.js),
 * because live refreshes hand it a new assignment object every few seconds. The
 * key used to hold counts and policies but nothing from the questions, and the
 * question editor stamps only `updatedAt`, so after an edit the panel went on
 * showing the old readiness until the hub was reopened.
 *
 * The behaviour held here: whenever an edit changes what the planner says, the
 * key moves (so the panel recomputes), and a refresh that changes nothing does
 * not move it (so it does not recompute every few seconds). The screen is .jsx
 * and cannot be imported, so its wiring is asserted on source, bound to the
 * region that does the work.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { applyRecoveryUpgrade, buildRecoveryUpgradePreview } from '../../functions/shared/recoveryContentUpgrade.mjs';
import { serverRecoveryKeyCheck } from '../../functions/shared/recoveryCertificationGrading.mjs';
import { liveRecoverySections, planAssignmentRecoveryContent } from '../../functions/shared/recoveryContentPlan.mjs';
import { lightRecoveryKeyCheck } from '../../functions/shared/recoveryLightKeyCheck.mjs';
import { ALGEBRA1_TRANSFORMATIONS_RECOVERY_V2 as MIGRATION } from '../../functions/shared/recoveryMigrations.mjs';
import { recoveryPlanKey } from '../../src/platform/recovery/recoveryPlanKey.js';
import { componentSource, region } from './helpers/sourceContract.mjs';

const LESSON = compileTeacherImport(readFileSync(new URL(`../../${MIGRATION.lessonFile}`, import.meta.url), 'utf8')).model;
const AT = '2026-10-21T15:00:00.000Z';

// A live assignment whose Warm-Up and DOL already carry prepared Recovery: the
// state in which a question edit makes a binding stale.
const preparedAssignment = () => {
  const assignment = {
    ...structuredClone(LESSON.assignmentV5),
    id: 'live-l2-standard',
    title: LESSON.assignmentV5.assignment.title,
    courseProfile: { course: 'algebra1', courseLevel: 'standard' },
    assignedClassIds: ['class-p1'],
    assignedClassPeriods: ['Period 1'],
    dueAt: '2026-10-14T23:59:00.000Z',
    assignmentRevision: 3,
    updatedAt: '2026-10-20T12:00:00.000Z',
  };
  const { plan, planHash, report } = buildRecoveryUpgradePreview({
    assignment, manifest: MIGRATION, gradeSample: serverRecoveryKeyCheck, trackers: [], at: AT,
  });
  const applied = applyRecoveryUpgrade({
    assignment, plan, planHash, migrationId: report.migrationId, at: AT, actorUid: 'teacher-uid', actorEmail: 'teacher@school.org', authorizationType: 'teacherOfRecord', approvedBy: 'teacher@school.org', affectedStudentCount: 0,
  });
  return { ...assignment, recoveryContent: applied.recoveryContent };
};

// The plan the hub draws, as it computes it.
const hubPlan = (assignment) => planAssignmentRecoveryContent({ assignment, gradeSample: lightRecoveryKeyCheck });
const rowFor = (plan, questionId) => plan.rows.find((row) => row.questionId === questionId);
const questionsOf = (assignment, role) => assignment.sections.find((section) => section.role === role).questions;

// What saveQuestionEditor does to the stored assignment: the question changes,
// updatedAt moves, and assignmentRevision, contentLineage and recoveryContent
// stay exactly as they were.
const editedLikeTheQuestionEditor = (assignment, change) => {
  const next = structuredClone(assignment);
  change(next);
  next.updatedAt = '2026-10-25T09:30:00.000Z';
  return next;
};

test('the prepared assignment starts ready: every Warm-Up and DOL question has current Recovery', () => {
  const assignment = preparedAssignment();
  const plan = hubPlan(assignment);
  const sections = liveRecoverySections(plan);
  assert.equal(sections.warmup.status, 'ready');
  assert.equal(sections.dol.status, 'ready');
  assert.ok(plan.rows.length >= 6);
  plan.rows.forEach((row) => assert.equal(row.status, 'kept', `${row.label} is kept before any edit`));
});

test('editing a question changes the plan and moves the key; a refresh with the same content does not', () => {
  const assignment = preparedAssignment();
  const before = hubPlan(assignment);
  const target = questionsOf(assignment, 'warmup')[0];
  assert.equal(rowFor(before, target.questionId).status, 'kept');

  const edited = editedLikeTheQuestionEditor(assignment, (next) => {
    const question = questionsOf(next, 'warmup')[0];
    question.prompt = `${question.prompt} (reworded)`;
  });
  // The edit left every old key input alone, as the question editor does.
  assert.equal(edited.assignmentRevision, assignment.assignmentRevision);
  assert.equal(edited.contentLineage?.version, assignment.contentLineage?.version);
  assert.equal(edited.recoveryContent.version, assignment.recoveryContent.version);

  // The planner now says that question's prepared Recovery no longer matches it...
  const after = hubPlan(edited);
  assert.notEqual(rowFor(after, target.questionId).status, 'kept', 'the edited question is no longer kept');
  assert.notDeepEqual(
    after.rows.map((row) => [row.questionId, row.status]),
    before.rows.map((row) => [row.questionId, row.status]),
    'the plan differs after the edit',
  );
  // ...so the hub must recompute: the key moves.
  assert.notEqual(recoveryPlanKey(edited), recoveryPlanKey(assignment));

  // A live refresh hands the hub a new object with the same content: same key,
  // so the plan is not recomputed every few seconds.
  assert.equal(recoveryPlanKey(structuredClone(assignment)), recoveryPlanKey(assignment));
  assert.equal(recoveryPlanKey(structuredClone(edited)), recoveryPlanKey(edited));
});

test('every kind of change the planner reads moves the key', () => {
  const assignment = preparedAssignment();
  const baseKey = recoveryPlanKey(assignment);
  const basePlan = JSON.stringify(hubPlan(assignment).sections);
  const changes = {
    'a Warm-Up question is excluded': (next) => { questionsOf(next, 'warmup')[0].teacherExcluded = true; },
    'a DOL question is reworded': (next) => { questionsOf(next, 'dol')[0].prompt += ' (reworded)'; },
    'Recovery is turned off for the Warm-Up, in the grading policy': (next) => {
      next.gradingPolicy = { ...next.gradingPolicy, recovery: { warmup: { enabled: false } } };
    },
    'Recovery is turned off for the DOL, in the assignment policy': (next) => { next.recoveryPolicy = { dol: { enabled: false } }; },
    'the assignment becomes a secure assessment': (next) => { next.secure = true; },
  };
  Object.entries(changes).forEach(([name, change]) => {
    const next = editedLikeTheQuestionEditor(assignment, change);
    assert.notEqual(recoveryPlanKey(next), baseKey, `${name}: the key moves`);
    // Each of these changes what the panel would say, so the move is needed.
    assert.notEqual(JSON.stringify(hubPlan(next).sections), basePlan, `${name}: the plan changes`);
  });
});

test('swapping which question is excluded keeps the counts and still moves the key', () => {
  const assignment = preparedAssignment();
  const first = editedLikeTheQuestionEditor(assignment, (next) => { questionsOf(next, 'warmup')[0].teacherExcluded = true; });
  const swapped = editedLikeTheQuestionEditor(first, (next) => {
    questionsOf(next, 'warmup')[0].teacherExcluded = false;
    questionsOf(next, 'warmup')[1].teacherExcluded = true;
  });
  const excludedCount = (value) => value.sections.flatMap((section) => section.questions).filter((question) => question.teacherExcluded === true).length;
  assert.equal(excludedCount(first), excludedCount(swapped), 'one question is excluded either way');
  const planned = (value) => hubPlan(value).rows.map((row) => row.questionId);
  assert.notDeepEqual(planned(first), planned(swapped), 'but the plan covers different questions');
  assert.notEqual(recoveryPlanKey(first), recoveryPlanKey(swapped));
});

test('an assignment the hub could not read still has a key', () => {
  assert.equal(typeof recoveryPlanKey(null), 'string');
  assert.equal(typeof recoveryPlanKey({}), 'string');
  assert.equal(recoveryPlanKey({ id: 'a' }), recoveryPlanKey({ id: 'a', sections: undefined }));
  assert.notEqual(recoveryPlanKey({ id: 'a' }), recoveryPlanKey({ id: 'b' }));
});

test('the hub recomputes its plan from that key, not from a count of questions', () => {
  const hub = componentSource('src/components/teacher/AssignmentHub.jsx');
  const section = region(hub, 'function AssignmentRecoverySection({', '\nexport default function AssignmentHub', 'hub Recovery section');
  assert.match(section, /const planKey = useMemo\(\(\) => recoveryPlanKey\(assignment\), \[assignment\]\);/);
  assert.match(section, /const plan = useMemo\(\(\) => \{[\s\S]*planAssignmentRecoveryContent\([\s\S]*\}, \[planKey\]\);/);
  assert.match(hub, /import \{ recoveryPlanKey \} from '\.\.\/\.\.\/platform\/recovery\/recoveryPlanKey\.js';/);
});
