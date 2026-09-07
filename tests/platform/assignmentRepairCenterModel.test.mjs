import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAssignmentRepairCenterModel } from '../../src/platform/preflight/assignmentRepairCenterModel.js';
import {
  addTeacherReviewFlag,
  resolveTeacherReviewFlag,
} from '../../src/platform/preflight/teacherReviewContext.js';

const question = (questionId, prompt) => ({
  questionId,
  type: 'algebra',
  prompt,
  answer: '1',
  alignments: [{ framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' }],
});

const assignmentV5 = {
  schemaVersion: 5,
  assignment: {
    title: 'Repair Center Model',
    courseId: 'algebra1',
    instructionalPurpose: 'lesson',
    gradingPurpose: 'classwork',
  },
  sections: [
    {
      id: 'warmup',
      role: 'warmup',
      title: 'Warm-Up',
      questions: [
        question('q-wu-1', 'Warm-up one'),
        question('q-wu-2', 'Warm-up two'),
      ],
    },
    {
      id: 'classwork',
      role: 'classwork',
      title: 'Classwork',
      questions: [question('q-cw-1', 'Classwork one')],
    },
  ],
};

const diagnostic = (overrides = {}) => ({
  severity: 'blocking',
  source: 'interaction',
  code: 'interaction.tool-intent',
  message: 'Question needs a supported student interaction.',
  repairRequirement: 'Choose a supported student interaction.',
  questionIndex: 0,
  questionNumber: 1,
  questionId: 'q-wu-1',
  sectionId: 'warmup',
  fieldPath: 'sections[0].questions[0].studentActions',
  componentId: null,
  issueKind: 'assignmentIssue',
  ...overrides,
});

const addFlag = (context, flag, id, minute) => addTeacherReviewFlag(context, flag, {
  flagId: id,
  nowIso: `2026-09-07T15:${String(minute).padStart(2, '0')}:00.000Z`,
  assignmentRevision: 12,
});

test('automated findings and teacher flags for the same question become one Repair Center row', () => {
  let teacherReviewContext = null;
  teacherReviewContext = addFlag(teacherReviewContext, {
    scope: 'question',
    targetId: 'q-wu-1',
    category: 'studentInteraction',
    severity: 'blocking',
    note: 'Students should manipulate the graph, not only read it.',
  }, 'flag-q1', 1);

  const model = buildAssignmentRepairCenterModel({
    assignmentV5,
    diagnostics: [diagnostic()],
    teacherReviewContext,
  });

  const row = model.questions.find((entry) => entry.questionId === 'q-wu-1');
  assert.ok(row);
  assert.equal(row.automatedFindings.length, 1);
  assert.equal(row.teacherFlags.length, 1);
  assert.equal(row.directTeacherFlags.length, 1);
  assert.equal(row.teacherConstraints.length, 1);
  assert.equal(row.teacherConstraints[0].hardConstraint, true);
  assert.equal(row.teacherConstraints[0].note, 'Students should manipulate the graph, not only read it.');
  assert.equal(row.status, 'needsRepair');
  assert.equal(row.isTeacherFlagged, true);
});

test('a validator-pass question still appears and becomes warning when the teacher flags it for editing', () => {
  let teacherReviewContext = null;
  teacherReviewContext = addFlag(teacherReviewContext, {
    scope: 'question',
    targetId: 'q-wu-2',
    category: 'directions',
    severity: 'needsEditing',
    note: 'Make the direction shorter without changing the task.',
  }, 'flag-q2', 2);

  const model = buildAssignmentRepairCenterModel({
    assignmentV5,
    diagnostics: [],
    teacherReviewContext,
  });

  const row = model.questions.find((entry) => entry.questionId === 'q-wu-2');
  assert.equal(row.status, 'warning');
  assert.equal(row.automatedFindings.length, 0);
  assert.equal(row.isTeacherFlagged, true);
  assert.equal(model.summary.teacherFlagged, 1);
});

test('resolved teacher flags stay in history but do not count as active Repair Center findings or constraints', () => {
  let teacherReviewContext = null;
  teacherReviewContext = addFlag(teacherReviewContext, {
    scope: 'question',
    targetId: 'q-wu-2',
    category: 'grading',
    severity: 'blocking',
    note: 'Check the accepted answer.',
  }, 'flag-resolved', 3);
  teacherReviewContext = resolveTeacherReviewFlag(teacherReviewContext, 'flag-resolved', {
    status: 'fixed',
    nowIso: '2026-09-07T15:04:00.000Z',
  });

  const model = buildAssignmentRepairCenterModel({ assignmentV5, diagnostics: [], teacherReviewContext });
  const row = model.questions.find((entry) => entry.questionId === 'q-wu-2');

  assert.equal(row.teacherFlags.length, 0);
  assert.equal(row.teacherConstraints.length, 0);
  assert.equal(row.isTeacherFlagged, false);
  assert.equal(row.status, 'passed');
  assert.equal(model.summary.teacherFlagged, 0);
});

test('assignment and section review notes inherit only where relevant and unrelated question flags never leak', () => {
  let teacherReviewContext = null;
  teacherReviewContext = addFlag(teacherReviewContext, {
    scope: 'assignment',
    category: 'standardsRigor',
    severity: 'suggestion',
    note: 'Keep all repairs at Algebra I rigor.',
  }, 'flag-assignment', 5);
  teacherReviewContext = addFlag(teacherReviewContext, {
    scope: 'section',
    targetId: 'warmup',
    category: 'difficulty',
    severity: 'needsEditing',
    note: 'Keep Warm-Up more guided than Classwork.',
  }, 'flag-warmup', 6);
  teacherReviewContext = addFlag(teacherReviewContext, {
    scope: 'question',
    targetId: 'q-wu-2',
    category: 'content',
    severity: 'needsEditing',
    note: 'This note belongs only to q-wu-2.',
  }, 'flag-q2', 7);

  const model = buildAssignmentRepairCenterModel({ assignmentV5, diagnostics: [], teacherReviewContext });
  const q1 = model.questions.find((entry) => entry.questionId === 'q-wu-1');
  const q2 = model.questions.find((entry) => entry.questionId === 'q-wu-2');
  const q3 = model.questions.find((entry) => entry.questionId === 'q-cw-1');

  assert.deepEqual(q1.teacherFlags.map((flag) => flag.id), ['flag-assignment', 'flag-warmup']);
  assert.deepEqual(q2.teacherFlags.map((flag) => flag.id), ['flag-assignment', 'flag-warmup', 'flag-q2']);
  assert.deepEqual(q3.teacherFlags.map((flag) => flag.id), ['flag-assignment']);
  assert.equal(q1.teacherFlags.some((flag) => flag.id === 'flag-q2'), false);
  assert.equal(q3.teacherFlags.some((flag) => flag.id === 'flag-warmup'), false);
  assert.equal(q1.isTeacherFlagged, false, 'inherited assignment/section context should not inflate direct question-flag count');
  assert.equal(q2.isTeacherFlagged, true);
  assert.equal(q3.isTeacherFlagged, false);
  assert.deepEqual(q1.teacherConstraints.map((entry) => entry.note), [
    'Keep all repairs at Algebra I rigor.',
    'Keep Warm-Up more guided than Classwork.',
  ]);
});

test('stable question identity and flat question numbering survive section boundaries', () => {
  const model = buildAssignmentRepairCenterModel({ assignmentV5, diagnostics: [] });
  assert.deepEqual(model.questions.map((entry) => ({
    questionId: entry.questionId,
    sectionId: entry.sectionId,
    sectionRole: entry.sectionRole,
    questionNumber: entry.questionNumber,
  })), [
    { questionId: 'q-wu-1', sectionId: 'warmup', sectionRole: 'warmup', questionNumber: 1 },
    { questionId: 'q-wu-2', sectionId: 'warmup', sectionRole: 'warmup', questionNumber: 2 },
    { questionId: 'q-cw-1', sectionId: 'classwork', sectionRole: 'classwork', questionNumber: 3 },
  ]);
});

test('summary counts each question once even when a question has several findings', () => {
  let teacherReviewContext = null;
  teacherReviewContext = addFlag(teacherReviewContext, {
    scope: 'question',
    targetId: 'q-wu-1',
    category: 'rendering',
    severity: 'needsEditing',
    note: 'The graph is visually confusing.',
  }, 'flag-q1', 8);
  teacherReviewContext = addFlag(teacherReviewContext, {
    scope: 'question',
    targetId: 'q-wu-2',
    category: 'directions',
    severity: 'needsEditing',
    note: 'Clarify the direction.',
  }, 'flag-q2', 9);

  const diagnostics = [
    diagnostic(),
    diagnostic({ code: 'semantic.answer', source: 'semantic', message: 'Question answer is malformed.' }),
    diagnostic({
      severity: 'warning',
      code: 'alignment.specificity',
      source: 'alignmentSpecificity',
      message: 'Question 3 alignment is unusually broad.',
      repairRequirement: 'Review alignment specificity.',
      questionIndex: 2,
      questionNumber: 3,
      questionId: 'q-cw-1',
      sectionId: 'classwork',
      fieldPath: '',
    }),
  ];

  const model = buildAssignmentRepairCenterModel({ assignmentV5, diagnostics, teacherReviewContext });

  assert.deepEqual(model.summary, {
    totalQuestions: 3,
    passed: 0,
    needsRepair: 1,
    warnings: 2,
    teacherFlagged: 2,
  });
  assert.equal(model.questions.find((entry) => entry.questionId === 'q-wu-1').automatedFindings.length, 2);
});

console.log('assignmentRepairCenterModel.test.mjs: all assertions passed');
