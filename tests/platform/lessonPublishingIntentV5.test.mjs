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

test('notes normalization remains backward-compatible while publishing requires two pages', () => {
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
  assert.ok(validation.errors.some((message) => /at least two authored content sections/i.test(message)));
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

test('notes validator requires two pages, a learning goal, and at least two content sections', () => {
  const incomplete = validateLessonPublishingIntent({
    classroomPackage: { enabled: true, topic: { name: 'Module 1' } },
    lessonResources: { notesPdf: { enabled: true, targetPages: 1, sections: [{ content: ['Short notes'] }] } },
  });
  assert.ok(incomplete.errors.some((message) => /target 2 pages/i.test(message)));
  assert.ok(incomplete.errors.some((message) => /learning goal/i.test(message)));
  assert.ok(incomplete.errors.some((message) => /at least two authored content sections/i.test(message)));

  const long = Array.from({ length: 800 }, (_, i) => `word${i}`).join(' ');
  const complete = validateLessonPublishingIntent({
    classroomPackage: { enabled: true, topic: { name: 'Module 1' } },
    lessonResources: {
      notesPdf: {
        enabled: true,
        targetPages: 2,
        learningGoal: 'Interpret transformations.',
        sections: [{ heading: 'Key ideas', content: [long] }, { heading: 'Reference', bullets: ['Check the parent function first.'] }],
      },
    },
  });
  assert.equal(complete.errors.length, 0);
  assert.ok(complete.warnings.some((warning) => /shorten/i.test(warning)));
});


test('outside-AI compact notes package with string content satisfies the two-page publishing gate', () => {
  const outsideAi = {
    lessonNotesPdf: {
      enabled: true,
      targetPages: 2,
      title: 'Module 1 Topic 1 Review — Quantities and Relationships — Student Notes',
      learningGoal: 'Students will analyze real-world and mathematical relationships by identifying independent and dependent quantities, writing algebraic models, classifying relations as functions, determining domain and range, and distinguishing discrete and continuous graphs.',
      sections: [
        { heading: '1. Quantities and Functions', content: 'Independent quantities are inputs. Dependent quantities are outputs. A function assigns exactly one output to each input.' },
        { heading: '2. Domain and Range', content: 'Domain describes possible inputs. Range describes possible outputs. Use realistic restrictions from the context.' },
        { heading: '3. Function Families', content: 'Linear, quadratic, exponential, and absolute-value families have distinct graphical characteristics.' },
        { heading: '4. Modeling Reference', content: 'Define variables, write a rule, build a table, determine continuity, and state realistic constraints.' },
      ],
    },
    classroomIntegration: {
      enabled: true,
      topic: { name: 'Module 1 • Quantities and Relationships' },
      assignmentPost: { title: 'Module 1 Topic 1 Review — Quantities and Relationships', instructions: 'Complete the lesson in MathMaster.' },
      resourcesPost: { enabled: true, postingMode: 'separateMaterial' },
      gradePassback: { enabled: true, when: 'finalized', mode: 'assignedGrade' },
    },
  };

  const normalized = normalizeLessonPublishingIntentV5({
    classroom: outsideAi.classroomIntegration,
    lessonResources: { notesPdf: outsideAi.lessonNotesPdf },
  }, { title: 'Module 1 Topic 1 Review', folder: 'Algebra I/Module 1/Quantities and Relationships' }, []);

  assert.equal(normalized.lessonResources.notesPdf.learningGoal.startsWith('Students will analyze'), true);
  assert.equal(normalized.lessonResources.notesPdf.sections.length, 4);
  assert.equal(normalized.lessonResources.notesPdf.sections[0].content.length, 1, 'string content becomes one content paragraph');
  assert.deepEqual(validateLessonPublishingIntent(normalized).errors, []);
});
