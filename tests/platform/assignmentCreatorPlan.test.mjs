import assert from 'node:assert/strict';
import {
  buildAssignmentCreatorRequest,
  defaultAssignmentCreatorPlan,
  normalizeAssignmentCreatorPlan,
} from '../../src/components/teacher/assignmentCreatorPlan.js';

const defaults = defaultAssignmentCreatorPlan('algebra2');
assert.equal(defaults.courseId, 'algebra2');
assert.equal(defaults.sections.warmup.count, 3);
assert.equal(defaults.sections.classwork.count, 6);
assert.equal(defaults.sections.practice.count, 8);
assert.equal(defaults.sections.dol.count, 2);
assert.equal(defaults.sections.quiz.enabled, false);
assert.equal(defaults.sections.test.enabled, false);
assert.equal(defaults.sections.practice.mode, 'personalized');

const normalized = normalizeAssignmentCreatorPlan({
  courseId: 'algebra1',
  topic: 'Operations and compositions of functions',
  adaptivePractice: true,
  sections: {
    warmup: { enabled: false },
    practice: { count: 10 },
  },
});
assert.equal(normalized.sections.warmup.enabled, false);
assert.equal(normalized.sections.practice.count, 10);
assert.equal(normalized.sections.practice.mode, 'adaptive');

const request = buildAssignmentCreatorRequest({
  courseId: 'algebra1',
  title: 'Function Operations',
  topic: 'Students add, subtract, multiply, divide, and compose functions using equations and tables.',
  instructionalPurpose: 'lesson',
  gradingPurpose: 'classwork',
  adaptivePractice: false,
  sections: {
    warmup: { enabled: true, count: 3, mode: 'shared' },
    classwork: { enabled: true, count: 6, mode: 'shared' },
    practice: { enabled: true, count: 8, mode: 'personalized' },
    dol: { enabled: true, count: 2, mode: 'shared' },
  },
  outputs: { studentWorksheetPdf: true, lessonNotesPdf: true },
}, { generatedAt: new Date('2026-08-27T00:00:00Z') });

assert.match(request, /MathMaster Assignment V5/);
assert.match(request, /# Teacher build request/);
assert.match(request, /Function Operations/);
assert.match(request, /Warm-Up: approximately 3 questions/);
assert.match(request, /Practice: approximately 8 questions; delivery mode personalized/);
assert.match(request, /Student worksheet PDF: enabled/);
assert.match(request, /roughly 15%/);
assert.match(request, /Return exactly one complete MathMaster Assignment V5 JSON object/);
assert.throws(() => buildAssignmentCreatorRequest({ topic: '' }), /Describe the lesson\/topic/);

console.log('assignmentCreatorPlan.test.mjs: all assertions passed');
