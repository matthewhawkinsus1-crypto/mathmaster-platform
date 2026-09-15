import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { assignmentQuestionEditorSource } from './helpers/splitComponentSource.mjs';

import {
  GRAPH_VIEWPORT_REPAIR_KIND,
  analyzeSafeResponseEntryRepair,
} from '../../functions/shared/liveResponseRepairPolicy.mjs';
import { classifyContentQuestionChange } from '../../functions/shared/assignmentContentUpgradePolicy.mjs';
import {
  analyzeResponseEntryRepair,
  repairAssignmentTrackerForLiveCorrections,
} from '../../src/platform/assignment/liveQuestionCorrection.js';
import { stageSingleQuestionRepairImport } from '../../src/platform/preflight/questionRepairImport.js';

/*
 * The live case this exists for: a2sys-cw-05 graphs y = 6x + 18 and
 * y = 3x + 42, whose intersection is (8, 66). The authored window stopped at
 * y = 10, so students were asked to read an intersection the picture did not
 * contain. Reframing the same two lines to {0..10, 0..85} changes nothing
 * about the mathematics, the task, or anything a student already submitted.
 */
const liveSystemQuestion = () => ({
  questionId: 'a2sys-cw-05',
  type: 'systemsGraphing',
  prompt: 'Graph the system and state the solution as an ordered pair.',
  system: [
    { id: 'line-1', equation: 'y=6x+18', slope: 6, intercept: 18 },
    { id: 'line-2', equation: 'y=3x+42', slope: 3, intercept: 42 },
  ],
  graph: {
    xMin: -10,
    xMax: 10,
    yMin: -10,
    yMax: 10,
    functions: [
      { id: 'f1', type: 'linear', slope: 6, intercept: 18 },
      { id: 'f2', type: 'linear', slope: 3, intercept: 42 },
    ],
    lines: [{ id: 'l1', from: [0, 18], to: [8, 66] }],
    points: [{ id: 'solution', x: 8, y: 66, label: 'Solution' }],
  },
  alignments: [{ framework: 'teks', code: 'A.3F', role: 'primary' }],
  answerFields: [{ id: 'solution', label: 'Solution', answer: '(8, 66)', inputProfile: 'orderedPair' }],
  teacherExcluded: false,
  questionWeight: 2,
});

const withViewport = (question, viewport) => ({
  ...question,
  graph: { ...question.graph, ...viewport },
});

const TEACHER_VIEWPORT = { xMin: 0, xMax: 10, yMin: 0, yMax: 85 };

test('a viewport-only graph change is a safe live repair on a question students already received', () => {
  const before = liveSystemQuestion();
  const after = withViewport(before, TEACHER_VIEWPORT);

  const result = analyzeSafeResponseEntryRepair(before, after);
  assert.equal(result.safe, true);
  assert.equal(result.repairKind, GRAPH_VIEWPORT_REPAIR_KIND);
  assert.equal(result.presentationOnly, true);
  assert.deepEqual(result.affectedFieldIds, []);
  assert.deepEqual(result.changedViewportKeys, ['xMin', 'yMin', 'yMax']);
  assert.deepEqual(result.viewport, TEACHER_VIEWPORT);

  // The intersection the teacher needs visible really is inside the new window.
  assert.ok(result.viewport.xMin <= 8 && 8 <= result.viewport.xMax);
  assert.ok(result.viewport.yMin <= 66 && 66 <= result.viewport.yMax);
});

test('a viewport repair is classified as presentation-only, not as a response-control correction', () => {
  const before = liveSystemQuestion();
  const after = withViewport(before, TEACHER_VIEWPORT);
  const classified = classifyContentQuestionChange(before, after);

  assert.equal(classified.classification, 'graphViewportRepair');
  assert.equal(classified.safe, true);
  assert.equal(classified.presentationOnly, true);
  assert.deepEqual(classified.affectedFieldIds, []);
});

test('changing the mathematics alongside the viewport is refused', () => {
  const before = liveSystemQuestion();
  const after = withViewport(before, TEACHER_VIEWPORT);
  after.system = [
    { id: 'line-1', equation: 'y=5x+18', slope: 5, intercept: 18 },
    after.system[1],
  ];

  const result = analyzeSafeResponseEntryRepair(before, after);
  assert.equal(result.safe, false);
  assert.match(result.reason, /only the viewport bounds/i);
});

test('prompt, standards, and tool-type rewrites are refused with or without a viewport change', () => {
  const before = liveSystemQuestion();
  const cases = [
    { prompt: 'Solve the system algebraically instead.' },
    { alignments: [{ framework: 'teks', code: 'A.5C', role: 'primary' }] },
    { type: 'algebra' },
  ];
  for (const change of cases) {
    const after = { ...withViewport(before, TEACHER_VIEWPORT), ...change };
    const result = analyzeSafeResponseEntryRepair(before, after);
    assert.equal(result.safe, false, `${Object.keys(change)[0]} must not be changeable live`);
    assert.match(result.reason, /only the viewport bounds/i);
  }
});

test('graph points, functions, and lines stay frozen even when the viewport also moves', () => {
  const before = liveSystemQuestion();
  const mutations = {
    points: (graph) => ({ ...graph, points: [{ id: 'solution', x: 9, y: 66, label: 'Solution' }] }),
    functions: (graph) => ({ ...graph, functions: [{ id: 'f1', type: 'linear', slope: 7, intercept: 18 }, graph.functions[1]] }),
    lines: (graph) => ({ ...graph, lines: [{ id: 'l1', from: [0, 18], to: [9, 66] }] }),
  };
  for (const [name, mutate] of Object.entries(mutations)) {
    const after = withViewport(before, TEACHER_VIEWPORT);
    after.graph = mutate(after.graph);
    const result = analyzeSafeResponseEntryRepair(before, after);
    assert.equal(result.safe, false, `graph ${name} must not be changeable live`);
    assert.match(result.reason, /only the viewport bounds/i);
  }
});

test('viewport bounds must be finite and correctly ordered', () => {
  const before = liveSystemQuestion();
  const rejected = [
    { xMin: 10, xMax: 10, yMin: 0, yMax: 85 },
    { xMin: 0, xMax: 10, yMin: 85, yMax: 0 },
    { xMin: 0, xMax: 10, yMin: 0, yMax: Number.POSITIVE_INFINITY },
    { xMin: 0, xMax: 10, yMin: 0, yMax: 'eighty-five' },
  ];
  for (const viewport of rejected) {
    const result = analyzeSafeResponseEntryRepair(before, withViewport(before, viewport));
    assert.equal(result.safe, false, `${JSON.stringify(viewport)} must be refused`);
  }
});

test('a live viewport repair leaves every student attempt, grade, and history record untouched', () => {
  const before = liveSystemQuestion();
  const after = withViewport(before, TEACHER_VIEWPORT);
  const analysis = analyzeResponseEntryRepair(before, after);
  assert.equal(analysis.safe, true);
  assert.equal(analysis.repairKind, GRAPH_VIEWPORT_REPAIR_KIND);

  const tracker = {
    0: {
      status: 'expired',
      attemptCount: 3,
      totalAttempts: 3,
      partialCredit: 40,
      bestPartialCredit: 40,
      partGrades: [
        { id: 'solution', label: 'Solution', isComplete: true, isCorrect: false, response: '(1, 24)' },
      ],
      liveCorrectionHistory: [],
    },
  };
  const snapshot = structuredClone(tracker);

  const next = repairAssignmentTrackerForLiveCorrections({
    assignmentTracker: tracker,
    questions: [after],
    repairs: [{
      questionId: 'a2sys-cw-05',
      questionIndex: 0,
      affectedFieldIds: analysis.affectedFieldIds,
      repairKind: analysis.repairKind,
    }],
    correctedAt: '2026-09-15T12:00:00.000Z',
  });

  // No returned attempt, no correction credit, no history entry claiming a
  // response was repaired: the student record is byte-for-byte what it was.
  assert.deepEqual(next, snapshot);
  assert.equal(next[0], tracker[0]);
});

const graphAssignmentV5 = () => ({
  schemaVersion: 5,
  assignment: {
    assignmentId: 'a2sys',
    title: 'Systems by graphing',
    courseId: 'algebra2',
    instructionalPurpose: 'lesson',
    gradingPurpose: 'classwork',
  },
  variantPolicy: {
    mode: 'personalized',
    sectionModes: { classwork: 'shared', practice: 'personalized', dol: 'shared' },
  },
  sections: [
    {
      id: 'cw',
      role: 'classwork',
      title: 'Classwork',
      questions: [{ ...liveSystemQuestion(), activityRole: 'classwork', teacherExcluded: true }],
    },
  ],
});

test('a staged viewport repair omitting teacherExcluded preserves it and never shows it as a change', () => {
  const assignmentV5 = graphAssignmentV5();
  // Repair prompts forbid the AI from returning MathMaster-owned fields, so a
  // correct reply omits teacherExcluded entirely.
  const replacement = { ...withViewport(liveSystemQuestion(), TEACHER_VIEWPORT), activityRole: 'classwork' };
  delete replacement.teacherExcluded;

  const staged = stageSingleQuestionRepairImport({
    assignmentV5,
    questionId: 'a2sys-cw-05',
    replacementQuestion: replacement,
    baseRevision: 4,
    currentRevision: 4,
    teacherReviewContext: { flags: [] },
  });

  assert.equal(staged.replacementQuestion.teacherExcluded, true);
  assert.deepEqual(
    staged.diff.filter((change) => change.path === 'teacherExcluded'),
    [],
    'an omitted platform-owned field is not a teacher-visible change',
  );
  assert.deepEqual(
    staged.diff.map((change) => change.path).sort(),
    ['graph.xMin', 'graph.yMax', 'graph.yMin'],
  );
  const staffedQuestion = staged.candidateAssignmentV5.sections[0].questions[0];
  assert.equal(staffedQuestion.teacherExcluded, true);
  assert.equal(staffedQuestion.graph.yMax, 85);
});

test('the staged summary names a viewport change as the viewport, not as the graph', () => {
  const assignmentV5 = graphAssignmentV5();
  const viewportOnly = stageSingleQuestionRepairImport({
    assignmentV5,
    questionId: 'a2sys-cw-05',
    replacementQuestion: { ...withViewport(liveSystemQuestion(), TEACHER_VIEWPORT), activityRole: 'classwork' },
    baseRevision: 4,
    currentRevision: 4,
    teacherReviewContext: { flags: [] },
  });
  assert.deepEqual(viewportOnly.changeSummary, ['graph viewport']);

  const mathematicalChange = { ...withViewport(liveSystemQuestion(), TEACHER_VIEWPORT), activityRole: 'classwork' };
  mathematicalChange.graph.points = [{ id: 'solution', x: 9, y: 66, label: 'Solution' }];
  const broaderChange = stageSingleQuestionRepairImport({
    assignmentV5,
    questionId: 'a2sys-cw-05',
    replacementQuestion: mathematicalChange,
    baseRevision: 4,
    currentRevision: 4,
    teacherReviewContext: { flags: [] },
  });
  assert.deepEqual(broaderChange.changeSummary, ['graph']);
});

test('an unchanged viewport still falls through to the general live-repair protections', () => {
  const before = liveSystemQuestion();
  const after = { ...before, prompt: 'A different prompt.' };
  const result = analyzeSafeResponseEntryRepair(before, after);
  assert.equal(result.safe, false);
  assert.match(result.reason, /response-entry fields only/i);
});

test('the live save path records the repair kind in the assignment audit, never in student records', () => {
  const app = fs.readFileSync('src/App.jsx', 'utf8');
  // The audit entry rides the assignment write that already happens inside the
  // live-repair transaction, so a display-only repair is recorded without any
  // student document being rewritten to say a response was corrected.
  assert.match(app, /liveRepairHistory/);
  assert.match(app, /kind: repair\?\.repairKind/);
  assert.match(app, /changedViewportKeys/);

  const editor = assignmentQuestionEditorSource();
  assert.match(editor, /repairKind: analysis\.repairKind/);
});
