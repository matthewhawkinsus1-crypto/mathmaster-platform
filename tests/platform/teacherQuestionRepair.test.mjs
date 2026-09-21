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
        answerFields: [{ id: 'kind', label: 'Kind', answer: 'interpolation', inputProfile: 'text' }],
      },
      { questionId: 'q3', type: 'dataModelingLab', mode: 'lineFit', prompt: 'Exact fit', points: [[0, 0], [10, 100]] },
      {
        questionId: 'q4',
        type: 'relationshipModel',
        prompt: 'Old prompt wording.',
        scenario: 'A car rental company charges a flat fee plus a per-mile rate.',
        quantities: [{ id: 'x', label: 'Miles driven' }, { id: 'y', label: 'Total cost' }],
        correctIndependentId: 'x',
        correctDependentId: 'y',
      },
      {
        questionId: 'q5',
        type: 'relationshipModel',
        prompt: 'Impossible task with no valid answer.',
        scenario: 'A tank drains at a constant rate.',
        quantities: [{ id: 'x', label: 'Time' }, { id: 'y', label: 'Volume' }],
        correctIndependentId: 'x',
        correctDependentId: 'y',
      },
    ],
  }],
});

const safeResponseCandidate = {
  questionId: 'q2',
  type: 'multiAnswer',
  prompt: 'Kind?',
  answerFields: [{ id: 'kind', label: 'Kind', answer: 'interpolation', inputProfile: 'choice', type: 'choice', options: ['interpolation', 'extrapolation'] }],
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
  scenario: 'A car rental company charges a flat fee plus a per-mile rate.',
  quantities: [{ id: 'x', label: 'Miles driven' }, { id: 'y', label: 'Total cost' }],
  correctIndependentId: 'x',
  correctDependentId: 'y',
};
const fundamentalCandidate = {
  questionId: 'q5',
  type: 'relationshipModel',
  prompt: 'Corrected, mathematically valid task.',
  scenario: 'A tank drains at a constant rate.',
  quantities: [{ id: 'x', label: 'Time' }, { id: 'y', label: 'Volume' }],
  correctIndependentId: 'y',
  correctDependentId: 'x',
};

// systemsGraphing is not in the core type catalog (it's an interactive tool
// validated by its own client-side schema), so this fixture exercises the
// generic prompt/answerFields baseline instead of a catalogued type's
// required-field rules -- matching the real graph-viewport-repair fixture in
// tests/platform/liveGraphViewportRepair.test.mjs.
const graphViewportBefore = {
  questionId: 'q6',
  type: 'systemsGraphing',
  prompt: 'Graph the system and state the solution as an ordered pair.',
  system: [
    { id: 'line-1', equation: 'y=6x+18', slope: 6, intercept: 18 },
    { id: 'line-2', equation: 'y=3x+42', slope: 3, intercept: 42 },
  ],
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
    scenario: 'A car rental company charges a flat fee plus a per-mile rate.',
    quantities: [{ id: 'x', label: 'Miles driven' }, { id: 'y', label: 'Total cost' }],
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
        { questionId: 'q1', question: { questionId: 'q1', type: 'choice', prompt: 'Same', answer: 'A', options: ['A', 'B'] } },
        { questionId: 'q1', question: { questionId: 'q1', type: 'choice', prompt: 'Same', answer: 'A', options: ['A', 'B'] } },
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

test('server validation is authoritative, not just questionId + type: it runs the real V5 type contract', async () => {
  const liveAssignment = baseAssignment();

  // graphAnalysis is a catalogued type that requires functionSpec.type and a
  // non-empty analysisRequests array -- a candidate that only "looks" like a
  // question (has a type and a prompt) is not enough.
  await assert.rejects(
    buildTeacherRepairPlan({
      liveAssignment: {
        ...liveAssignment,
        sections: [{
          ...liveAssignment.sections[0],
          questions: [...liveAssignment.sections[0].questions, {
            questionId: 'q7', type: 'graphAnalysis', prompt: 'Analyze the graph.',
          }],
        }],
      },
      replacements: [{
        questionId: 'q7',
        question: { questionId: 'q7', type: 'graphAnalysis', prompt: 'A shallow, structurally invalid repair.' },
      }],
      hasStudentHistory: false,
    }),
    /failed V5 authoring validation/,
  );

  // relationshipModel requires quantities whose ids match
  // correctIndependentId/correctDependentId -- a candidate with a dangling
  // reference is rejected even though every field it has is well-typed.
  await assert.rejects(
    buildTeacherRepairPlan({
      liveAssignment,
      replacements: [{
        questionId: 'q4',
        question: {
          questionId: 'q4', type: 'relationshipModel', prompt: 'Rewritten.',
          scenario: 'A scenario.', quantities: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
          correctIndependentId: 'x', correctDependentId: 'y', // not among quantity ids
        },
      }],
      hasStudentHistory: false,
    }),
    /must match one of the quantity ids/,
  );

  // The same catalog accepts a genuinely well-formed candidate for that type.
  const plan = await buildTeacherRepairPlan({
    liveAssignment,
    replacements: [{
      questionId: 'q4',
      question: {
        questionId: 'q4', type: 'relationshipModel', prompt: 'Rewritten and valid.',
        scenario: 'A scenario.', quantities: [{ id: 'x', label: 'X' }, { id: 'y', label: 'Y' }],
        correctIndependentId: 'x', correctDependentId: 'y',
      },
    }],
    hasStudentHistory: false,
  });
  assert.ok(plan.changes[0]);
});

test('an un-catalogued (interactive/composed) type still gets a real baseline check: prompt, and well-formed answerFields', async () => {
  const liveAssignment = baseAssignment();
  await assert.rejects(
    buildTeacherRepairPlan({
      liveAssignment,
      replacements: [{ questionId: 'q1', question: { questionId: 'q1', type: 'someInteractiveTool' } }],
      hasStudentHistory: false,
    }),
    /needs a prompt or scenario/,
  );
  await assert.rejects(
    buildTeacherRepairPlan({
      liveAssignment,
      replacements: [{
        questionId: 'q1',
        question: { questionId: 'q1', type: 'someInteractiveTool', prompt: 'Do the thing.', answerFields: [{ label: 'no id' }] },
      }],
      hasStudentHistory: false,
    }),
    /needs an id/,
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
