import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildTeacherRepairPlan,
  buildRepairedAssignment,
} = require('../../functions/lib/teacherQuestionRepair.js');
const {
  migrateTrackerForContentUpgrade,
} = require('../../functions/lib/assignmentContentTrackerMigration.js');

const baseAssignment = () => ({
  id: 'live-1',
  schemaVersion: 5,
  assignmentRevision: 3,
  assignedClassIds: ['class-1'],
  dueAt: '2026-09-11T23:59:00.000Z',
  sections: [{
    id: 'classwork',
    role: 'classwork',
    title: 'Classwork',
    questions: [
      { questionId: 'q1', type: 'choice', prompt: 'Same', answer: 'A', options: ['A', 'B'] },
      {
        questionId: 'q2',
        type: 'multiAnswer',
        prompt: 'Kind?',
        answerFields: [{ id: 'kind', answer: 'interpolation', inputProfile: 'text' }],
      },
      { questionId: 'q3', type: 'dataModelingLab', mode: 'lineFit', prompt: 'Exact fit', points: [[0, 0], [10, 100]] },
      { questionId: 'q4', type: 'relationshipModel', prompt: 'Old prompt wording.', correctIndependentId: 'x', correctDependentId: 'y' },
      { questionId: 'q5', type: 'relationshipModel', prompt: 'Impossible task with no valid answer.', correctIndependentId: 'x', correctDependentId: 'y' },
    ],
  }],
});

const safeResponseCandidate = {
  questionId: 'q2',
  type: 'multiAnswer',
  prompt: 'Kind?',
  answerFields: [{ id: 'kind', answer: 'interpolation', inputProfile: 'choice', type: 'choice', options: ['interpolation', 'extrapolation'] }],
};
const gradingExpansionCandidate = {
  questionId: 'q3',
  type: 'dataModelingLab',
  mode: 'lineFit',
  prompt: 'Exact fit',
  points: [[0, 0], [10, 100]],
  slopeTolerance: 2,
  interceptTolerance: 5,
};
const clarificationCandidate = {
  questionId: 'q4',
  type: 'relationshipModel',
  prompt: 'Clarified prompt wording only.',
  correctIndependentId: 'x',
  correctDependentId: 'y',
};
const fundamentalCandidate = {
  questionId: 'q5',
  type: 'relationshipModel',
  prompt: 'Corrected, mathematically valid task.',
  correctIndependentId: 'y',
  correctDependentId: 'x',
};

const graphViewportBefore = {
  questionId: 'q6',
  type: 'graphAnalysis',
  prompt: 'Analyze the graph.',
  graph: { xMin: -5, xMax: 5, yMin: -5, yMax: 5, functions: [{ expression: 'x^2' }] },
};
const graphViewportCandidate = {
  ...graphViewportBefore,
  graph: { ...graphViewportBefore.graph, xMin: -10, xMax: 10, yMin: -10, yMax: 10 },
};

function assignmentWithGraph() {
  const assignment = baseAssignment();
  assignment.sections[0].questions.push(graphViewportBefore);
  return assignment;
}

test('classification is reused from the Content V2 policy, not reimplemented', async () => {
  const liveAssignment = assignmentWithGraph();
  const replacements = [
    { questionId: 'q2', question: safeResponseCandidate },
    { questionId: 'q3', question: gradingExpansionCandidate },
    { questionId: 'q4', question: clarificationCandidate },
    { questionId: 'q5', question: fundamentalCandidate },
    { questionId: 'q6', question: graphViewportCandidate },
    { questionId: 'q1', question: liveAssignment.sections[0].questions[0] },
  ];
  const plan = await buildTeacherRepairPlan({ liveAssignment, replacements, hasStudentHistory: true });
  const byId = Object.fromEntries(plan.changes.map((change) => [change.questionId, change.classification]));
  assert.deepEqual(byId, {
    q1: 'unchanged',
    q2: 'safeResponseControl',
    q3: 'gradingExpansion',
    q4: 'clarificationOnly',
    q5: 'fundamental',
    q6: 'graphViewportRepair',
  });
});

test('plan hash is deterministic for the same inputs and changes when a candidate changes', async () => {
  const liveAssignment = baseAssignment();
  const replacements = [{ questionId: 'q2', question: safeResponseCandidate }];
  const planA = await buildTeacherRepairPlan({ liveAssignment, replacements, hasStudentHistory: false });
  const planB = await buildTeacherRepairPlan({ liveAssignment, replacements, hasStudentHistory: false });
  assert.equal(planA.planHash, planB.planHash);

  const planHistory = await buildTeacherRepairPlan({ liveAssignment, replacements, hasStudentHistory: true });
  assert.notEqual(planA.planHash, planHistory.planHash, 'hasStudentHistory changes commit behavior and must change the hash');

  const differentCandidate = { ...safeResponseCandidate, prompt: 'Different wording that changes the fingerprint' };
  const planC = await buildTeacherRepairPlan({
    liveAssignment,
    replacements: [{ questionId: 'q2', question: differentCandidate }],
    hasStudentHistory: false,
  });
  assert.notEqual(planA.planHash, planC.planHash);
});

test('no student history: even a fundamental repair replaces directly under the same questionId', async () => {
  const liveAssignment = baseAssignment();
  const replacements = [{ questionId: 'q5', question: fundamentalCandidate }];
  const plan = await buildTeacherRepairPlan({ liveAssignment, replacements, hasStudentHistory: false });
  assert.equal(plan.changes[0].classification, 'fundamental');
  assert.equal(plan.changes[0].commitBehavior, 'directReplaceSameId');

  const built = await buildRepairedAssignment({ liveAssignment, plan, correctionEventId: 'evt-1' });
  const flat = built.assignment.sections.flatMap((section) => section.questions);
  assert.deepEqual(flat.map((q) => q.questionId), ['q1', 'q2', 'q3', 'q4', 'q5']);
  assert.equal(flat.at(-1).prompt, fundamentalCandidate.prompt);
  assert.equal(flat.at(-1).teacherExcluded, undefined);
  assert.deepEqual(built.replacementQuestionIds, {});
  assert.equal(built.assignment.assignmentRevision, liveAssignment.assignmentRevision + 1);
});

test('live fundamental change never overwrites the historical question: retire in place, append a fresh replacement', async () => {
  const liveAssignment = baseAssignment();
  const replacements = [{ questionId: 'q5', question: fundamentalCandidate }];
  const plan = await buildTeacherRepairPlan({ liveAssignment, replacements, hasStudentHistory: true });
  assert.equal(plan.changes[0].commitBehavior, 'retireAndReplace');

  const built = await buildRepairedAssignment({
    liveAssignment,
    plan,
    correctionEventId: 'evt-2',
    mintQuestionId: () => 'q5-corrected',
  });
  const flat = built.assignment.sections.flatMap((section) => section.questions);

  // The historical question stays at its original, protected index...
  assert.deepEqual(flat.slice(0, 5).map((q) => q.questionId), ['q1', 'q2', 'q3', 'q4', 'q5']);
  const historical = flat.find((q) => q.questionId === 'q5');
  assert.equal(historical.prompt, 'Impossible task with no valid answer.', 'the historical prompt must not be overwritten');
  assert.equal(historical.teacherExcluded, true);

  // ...and the correction is a new, appended question.
  const replacement = flat.at(-1);
  assert.equal(replacement.questionId, 'q5-corrected');
  assert.notEqual(replacement.questionId, 'q5');
  assert.equal(replacement.supersedesQuestionId, 'q5');
  assert.equal(replacement.teacherExcluded, undefined);
  assert.deepEqual(built.replacementQuestionIds, { q5: 'q5-corrected' });
});

test('platform-owned fields (teacherExcluded, attempts) come from MathMaster, never from the candidate', async () => {
  const liveAssignment = baseAssignment();
  liveAssignment.sections[0].questions[1].attempts = 2;
  liveAssignment.sections[0].questions[1].teacherExcluded = false;
  const candidateTryingToSetOwnedFields = {
    ...safeResponseCandidate,
    attempts: 99,
    teacherExcluded: true,
  };
  const plan = await buildTeacherRepairPlan({
    liveAssignment,
    replacements: [{ questionId: 'q2', question: candidateTryingToSetOwnedFields }],
    hasStudentHistory: false,
  });
  const built = await buildRepairedAssignment({ liveAssignment, plan, correctionEventId: 'evt-3' });
  const repaired = built.assignment.sections[0].questions[1];
  assert.equal(repaired.attempts, 2, 'attempts is platform-owned and must come from the live question');
  assert.equal(repaired.teacherExcluded, false, 'teacherExcluded is a teacher decision, not authoring input');
  assert.equal(repaired.questionId, 'q2');
});

test('grading expansion is a superset repair: tracker credit can only increase, never decrease', async () => {
  const liveAssignment = baseAssignment();
  const plan = await buildTeacherRepairPlan({
    liveAssignment,
    replacements: [{ questionId: 'q3', question: gradingExpansionCandidate }],
    hasStudentHistory: true,
  });
  assert.equal(plan.changes[0].classification, 'gradingExpansion');

  const tracker = {
    2: {
      status: 'expired',
      attemptCount: 3,
      totalAttempts: 3,
      partialCredit: 0,
      bestPartialCredit: 0,
      lastResponseKey: JSON.stringify({ m: 9, b: 4 }),
      partGrades: [],
    },
  };
  const result = migrateTrackerForContentUpgrade({ tracker, plan, correctedAt: '2026-09-10T21:30:00.000Z' });
  assert.equal(result.tracker[2].status, 'correct');
  assert.equal(result.tracker[2].bestPartialCredit, 100);
  assert.equal(result.tracker[2].totalAttempts, 3, 'attempt history is preserved, not reset');
  assert.equal(result.gradeMayChange, true);
});

test('a candidate that cannot be proven a superset preserves prior credit exactly (never lowers it)', async () => {
  const liveAssignment = baseAssignment();
  const plan = await buildTeacherRepairPlan({
    liveAssignment,
    replacements: [{ questionId: 'q3', question: gradingExpansionCandidate }],
    hasStudentHistory: true,
  });
  const tracker = {
    2: { status: 'expired', attemptCount: 3, totalAttempts: 3, partialCredit: 40, bestPartialCredit: 60, lastResponseKey: 'not-json', partGrades: [] },
  };
  const result = migrateTrackerForContentUpgrade({ tracker, plan });
  assert.equal(result.tracker[2].bestPartialCredit, 60);
  assert.equal(result.tracker[2].totalAttempts, 3);
});

test('graph viewport repair is classified presentation-only and never touches saved trackers', async () => {
  const liveAssignment = assignmentWithGraph();
  const plan = await buildTeacherRepairPlan({
    liveAssignment,
    replacements: [{ questionId: 'q6', question: graphViewportCandidate }],
    hasStudentHistory: true,
  });
  assert.equal(plan.changes[0].classification, 'graphViewportRepair');
  assert.equal(plan.changes[0].commitBehavior, 'presentationOnlyViewportUpdate');
  assert.deepEqual(plan.changes[0].affectedFieldIds, []);

  const tracker = {
    5: { status: 'correct', attemptCount: 1, totalAttempts: 1, partialCredit: 100, bestPartialCredit: 100, partGrades: [{ id: 'a', isComplete: true, isCorrect: true }] },
  };
  const before = JSON.stringify(tracker);
  const result = migrateTrackerForContentUpgrade({ tracker, plan });
  assert.equal(result.changed, false);
  assert.equal(JSON.stringify(result.tracker), before);
});

test('a prompt-only clarification proves the scored meaning is unchanged; a scored change is fundamental instead', async () => {
  const liveAssignment = baseAssignment();
  const clarified = await buildTeacherRepairPlan({
    liveAssignment,
    replacements: [{ questionId: 'q4', question: clarificationCandidate }],
    hasStudentHistory: true,
  });
  assert.equal(clarified.changes[0].classification, 'clarificationOnly');
  assert.equal(clarified.changes[0].commitBehavior, 'inPlaceClarification');

  const scoredChange = {
    questionId: 'q4',
    type: 'relationshipModel',
    prompt: 'Clarified prompt wording only.',
    correctIndependentId: 'y', // scored answer key changed -> not provably clarification-only
    correctDependentId: 'x',
  };
  const notClarified = await buildTeacherRepairPlan({
    liveAssignment,
    replacements: [{ questionId: 'q4', question: scoredChange }],
    hasStudentHistory: true,
  });
  assert.notEqual(notClarified.changes[0].classification, 'clarificationOnly');
});

test('malformed candidates are denied: not an object, mismatched ID, missing type', async () => {
  const liveAssignment = baseAssignment();
  await assert.rejects(
    buildTeacherRepairPlan({ liveAssignment, replacements: [{ questionId: 'q1', question: 'not-an-object' }], hasStudentHistory: false }),
    /not a valid MathMaster question object/,
  );
  await assert.rejects(
    buildTeacherRepairPlan({ liveAssignment, replacements: [{ questionId: 'q1', question: { questionId: 'q9', type: 'choice' } }], hasStudentHistory: false }),
    /does not carry a matching question ID/,
  );
  await assert.rejects(
    buildTeacherRepairPlan({ liveAssignment, replacements: [{ questionId: 'q1', question: { questionId: 'q1' } }], hasStudentHistory: false }),
    /missing its Assignment V5 question type/,
  );
});

test('duplicate and missing question IDs are denied', async () => {
  const liveAssignment = baseAssignment();
  await assert.rejects(
    buildTeacherRepairPlan({
      liveAssignment,
      replacements: [
        { questionId: 'q1', question: { questionId: 'q1', type: 'choice' } },
        { questionId: 'q1', question: { questionId: 'q1', type: 'choice' } },
      ],
      hasStudentHistory: false,
    }),
    /Duplicate corrected question/,
  );
  await assert.rejects(
    buildTeacherRepairPlan({
      liveAssignment,
      replacements: [{ questionId: 'does-not-exist', question: { questionId: 'does-not-exist', type: 'choice' } }],
      hasStudentHistory: false,
    }),
    /is not present in this assignment/,
  );
});

test('multi-question repair is atomic: one malformed entry rejects the whole plan, not just that entry', async () => {
  const liveAssignment = baseAssignment();
  await assert.rejects(
    buildTeacherRepairPlan({
      liveAssignment,
      replacements: [
        { questionId: 'q2', question: safeResponseCandidate },
        { questionId: 'q3', question: { questionId: 'q3' } }, // missing type
      ],
      hasStudentHistory: false,
    }),
    /missing its Assignment V5 question type/,
  );
});

test('committing no replacements is refused rather than faking a revision change', async () => {
  const liveAssignment = baseAssignment();
  await assert.rejects(
    buildTeacherRepairPlan({ liveAssignment, replacements: [], hasStudentHistory: false }),
    /At least one corrected question is required/,
  );
});

test('a plan with only unchanged candidates reports canApply: false', async () => {
  const liveAssignment = baseAssignment();
  const plan = await buildTeacherRepairPlan({
    liveAssignment,
    replacements: [{ questionId: 'q1', question: liveAssignment.sections[0].questions[0] }],
    hasStudentHistory: false,
  });
  assert.equal(plan.canApply, false);
});
