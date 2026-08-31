import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeClassroomIntent,
  normalizeLessonPublishingIntentV5,
  normalizeNotesPdfIntent,
  topicNameFromFolder,
  validateLessonPublishingIntent,
} from '../../src/platform/authoring/lessonPublishingIntent.js';

test('folder hierarchy becomes a reusable Classroom topic, not a course id', () => {
  assert.equal(topicNameFromFolder('Algebra II/Module 1/Transformations/Lesson 3'), 'Module 1 • Transformations');
});

test('AI notes normalize to a one or two page student handout and never expose an answer key', () => {
  const notes = normalizeNotesPdfIntent({
    targetPages: 1,
    includeAnswerKey: true,
    sections: [{ heading: 'Key Ideas', bullets: ['Shift right by h.'], equations: ['y=(x-h)^2+k'] }],
  }, { title: 'Transformations' });
  assert.equal(notes.targetPages, 1);
  assert.equal(notes.includeAnswerKey, false);
  assert.equal(notes.sections[0].equations[0], 'y=(x-h)^2+k');
  assert.match(notes.fileName, /\.pdf$/i);
});

test('missing lesson-note content stays disabled instead of creating a blank Classroom handout', () => {
  const notes = normalizeNotesPdfIntent({}, { title: 'Transformations' });
  assert.equal(notes.enabled, false);
  assert.equal(notes.sections.length, 0);

  const validation = validateLessonPublishingIntent({
    lessonResources: { notesPdf: { ...notes, enabled: true } },
  });
  assert.ok(validation.errors.some((message) => /no authored sections/i.test(message)));
});

test('Classroom intent defaults to a separate material post and finalized grade passback', () => {
  const classroom = normalizeClassroomIntent({}, { title: 'Linear Functions', folder: 'Algebra I/Module 2/Linear Functions' }, { enabled: true });
  assert.equal(classroom.resourcesPost.postingMode, 'separateMaterial');
  assert.equal(classroom.resourcesPost.enabled, true);
  assert.equal(classroom.gradePassback.enabled, true);
  assert.equal(classroom.gradePassback.when, 'finalized');
  assert.equal(classroom.topic.name, 'Module 2 • Linear Functions');
});

test('complete V5 publishing intent carries AI classroom metadata and notes into assignment metadata', () => {
  const repairs = [];
  const result = normalizeLessonPublishingIntentV5({
    classroom: {
      assignmentPost: { title: 'Lesson 4 — Slope', instructions: 'Open MathMaster and complete Lesson 4.' },
      resourcesPost: { postingMode: 'attachToAssignment' },
      additionalLinks: [{ title: 'Reference', url: 'https://example.com/reference' }],
    },
    lessonResources: {
      notesPdf: {
        targetPages: 2,
        learningGoal: 'Interpret slope as a rate of change.',
        sections: [{ heading: 'Slope', content: ['Slope compares vertical and horizontal change.'] }],
      },
    },
  }, { title: 'Slope', folder: 'Algebra I/Module 2/Slope' }, repairs);
  assert.equal(result.classroomPackage.assignmentPost.title, 'Lesson 4 — Slope');
  assert.equal(result.classroomPackage.resourcesPost.postingMode, 'attachToAssignment');
  assert.equal(result.lessonResources.notesPdf.targetPages, 2);
  assert.equal(result.classroomPackage.additionalLinks.length, 1);
});

test('notes validator warns when authored content is too long for its requested page target', () => {
  const long = Array.from({ length: 400 }, (_, i) => `word${i}`).join(' ');
  const result = validateLessonPublishingIntent({
    classroomPackage: { enabled: true, topic: { name: 'Module 1' } },
    lessonResources: { notesPdf: { enabled: true, targetPages: 1, sections: [{ content: [long] }] } },
  });
  assert.equal(result.errors.length, 0);
  assert.ok(result.warnings.some((warning) => /shorten/i.test(warning)));
});
