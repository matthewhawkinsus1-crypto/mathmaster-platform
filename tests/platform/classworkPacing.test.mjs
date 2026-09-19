import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_CLASSWORK_PLANNED_SECONDS,
  analyzeClassworkPlannedTime,
} from '../../src/platform/teacher/classworkPacing.js';
import {
  createWalkthroughTimer,
  updateWalkthroughTimer,
} from '../../src/platform/teacher/liveTeachingSession.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';

const question = (prompt, role, seconds) => ({
  type: 'algebra',
  prompt,
  answer: '3',
  activityRole: role,
  ...(seconds == null ? {} : { suggestedWorkSeconds: seconds }),
  alignments: [
    { framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' },
  ],
});

const assignment = (classworkSeconds = [], extras = {}) => ({
  schemaVersion: 5,
  assignment: {
    title: 'Pacing test',
    courseId: 'algebra1',
    instructionalPurpose: 'lesson',
    gradingPurpose: 'classwork',
  },
  variantPolicy: { mode: 'shared', sectionModes: { classwork: 'shared', warmup: 'shared', practice: 'shared', dol: 'shared' } },
  sections: [
    { id: 'warmup', role: 'warmup', title: 'Warm-Up', questions: [question('Warm-up', 'warmup', extras.warmup ?? 900)] },
    { id: 'cw', role: 'classwork', title: 'Classwork', questions: classworkSeconds.map((seconds, index) => question(`Classwork ${index + 1}`, 'classwork', seconds)) },
    { id: 'practice', role: 'practice', title: 'Practice', questions: [question('Practice', 'practice', extras.practice ?? 1800)] },
    { id: 'dol', role: 'dol', title: 'DOL', questions: [question('DOL', 'dol', extras.dol ?? 600)] },
  ],
});

test('Classwork exactly 1200 seconds is valid and other sections do not count', () => {
  const report = analyzeClassworkPlannedTime(assignment([300, 420, 480]));
  assert.equal(report.totalSeconds, MAX_CLASSWORK_PLANNED_SECONDS);
  assert.equal(report.isWithinBudget, true);
  assert.equal(report.remainingSeconds, 0);
});

test('Classwork above 1200 seconds is a blocking Preflight error', () => {
  const candidate = assignment([601, 600]);
  const report = analyzeClassworkPlannedTime(candidate);
  assert.equal(report.totalSeconds, 1201);
  assert.equal(report.isWithinBudget, false);

  const preflight = buildAssignmentV5PreflightModel(candidate);
  assert.equal(preflight.isValid, false);
  assert.ok(preflight.errors.some((message) => /Classwork planned time is 1201 seconds/.test(message)), preflight.errors.join('\n'));
});

test('one authored Classwork question cannot exceed the 20-minute ceiling', () => {
  const report = analyzeClassworkPlannedTime(assignment([1201]));
  assert.equal(report.isWithinBudget, false);
  assert.ok(report.errors.some((message) => /Classwork question 1 schedules 1201 seconds/.test(message)));
});

test('assignments without suggestedWorkSeconds remain valid for pacing', () => {
  const candidate = assignment([null, null], { warmup: null, practice: null, dol: null });
  candidate.sections.forEach((section) => section.questions.forEach((item) => { delete item.suggestedWorkSeconds; }));
  const report = analyzeClassworkPlannedTime(candidate);
  assert.equal(report.totalSeconds, 0);
  assert.equal(report.hasAuthoredTiming, false);
  assert.equal(report.isWithinBudget, true);
});

test('live extensions can exceed the authored plan without mutating it', () => {
  const authoredQuestion = { suggestedWorkSeconds: 180 };
  const timer = createWalkthroughTimer(authoredQuestion.suggestedWorkSeconds);
  const extended = updateWalkthroughTimer(timer, 'extend', { nowValue: 1000, durationSeconds: 60 });

  assert.equal(authoredQuestion.suggestedWorkSeconds, 180);
  assert.equal(timer.durationSeconds, 180);
  assert.equal(extended.durationSeconds, 240);
  assert.equal(extended.remainingSeconds, 240);
});
