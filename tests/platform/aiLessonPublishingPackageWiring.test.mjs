import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';

const read = (path) => fs.readFileSync(path, 'utf8');

test('V5 AI contract asks for Classroom integration and one/two page PDF notes', () => {
  const src = read('src/platform/contract/authoringContract.js');
  assert.match(src, /"classroomIntegration"/);
  assert.match(src, /"lessonNotesPdf"/);
  assert.match(src, /targetPages/);
  assert.doesNotMatch(src, /"lessonResources"\s*:/);
});

test('V5 compiler preserves canonical publishing intent without reviving legacy publishing fields', () => {
  const compiled = compileAuthoringIntentV5({
    schemaVersion: 5,
    assignment: { title: 'Publishing intent', courseId: 'algebra1' },
    classroomIntegration: { enabled: true },
    outputProfiles: {
      digital: { enabled: true },
      lessonNotesPdf: { enabled: true, targetPages: 2, sections: [] },
    },
    sections: [{
      role: 'classwork',
      questions: [{
        standard: 'A.5A',
        prompt: 'Solve 2x = 8.',
        studentActions: ['solveStepByStep'],
        equation: '2x = 8',
      }],
    }],
  }).package;

  assert.equal(compiled.classroomIntegration.enabled, true);
  assert.equal(compiled.outputProfiles.lessonNotesPdf.enabled, true);
  assert.equal(compiled.outputProfiles.lessonNotesPdf.targetPages, 2);
  assert.equal(compiled.classroom, undefined);
  assert.equal(compiled.lessonResources, undefined);
});

test('Assignment Review bridges canonical V5 publishing fields into the runtime Classroom package', () => {
  const app = read('src/App.jsx');
  assert.match(app, /assignmentV5\.classroomIntegration/);
  assert.match(app, /assignmentV5\.outputProfiles\?\.lessonNotesPdf/);
  assert.match(app, /normalizeLessonPublishingIntentV5/);
  assert.match(app, /classroomIntegration: assignmentV5\.classroomIntegration/);
  assert.match(app, /outputProfiles: assignmentV5\.outputProfiles/);
});

test('Preflight previews AI prepared Classroom and PDF plan without owning classes or dates', () => {
  const src = read('src/components/teacher/LessonPreflightModal.jsx');
  assert.match(src, /AI-prepared Classroom and notes package/);
  assert.match(src, /Student notes PDF/);
  assert.match(src, /teacher still chooses classes and dates/i);
});

test('Classroom manager automatically generates, uploads and publishes the V5 notes PDF', () => {
  const src = read('src/ClassroomManagerV2.jsx');
  assert.match(src, /generateLessonNotesPdfBlob/);
  assert.match(src, /storeLessonNotesPdf/);
  assert.match(src, /AI-prepared publishing package/);
  assert.match(src, /classroomTitle:/);
  assert.match(src, /gradePassbackEnabled:/);
});

test('server stores generated PDF in Firebase Storage and saves its reusable link', () => {
  const src = read('functions/index.js');
  assert.match(src, /getStorage/);
  assert.match(src, /exports\.storeLessonNotesPdf = onCall/);
  assert.match(src, /classroomResources\/\$\{teacherUid\}/);
  assert.match(src, /firebaseStorageDownloadTokens/);
  assert.match(src, /lessonResources.*notesPdf.*asset/s);
});

test('frontend has the PDF rasterizer dependency and callable wiring', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.dependencies.html2canvas, '^1.4.1');
  const api = read('src/classroomApi.js');
  assert.match(api, /storeLessonNotesPdf/);
  const renderer = read('src/platform/resources/lessonNotesPdf.js');
  assert.match(renderer, /convertLatexToMarkup/);
  assert.match(renderer, /html2canvas/);
});
