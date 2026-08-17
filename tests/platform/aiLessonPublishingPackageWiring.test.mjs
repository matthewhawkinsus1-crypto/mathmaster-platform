import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

test('V5 AI contract asks for Classroom metadata and one/two page PDF notes', () => {
  const src = read('src/platform/contract/authoringContract.js');
  assert.match(src, /"classroom"/);
  assert.match(src, /"lessonResources"/);
  assert.match(src, /"notesPdf"/);
  assert.match(src, /targetPages/);
  assert.match(src, /separateMaterial/);
});

test('V5 compiler normalizes publishing intent into saved assignment metadata', () => {
  const src = read('src/platform/contract/authoringIntentV5.js');
  assert.match(src, /normalizeLessonPublishingIntentV5/);
  assert.match(src, /assignment\.classroomPackage = publishingIntent\.classroomPackage/);
  assert.match(src, /assignment\.lessonResources = publishingIntent\.lessonResources/);
});

test('assignment blueprint keeps generated Classroom and notes metadata through Preflight', () => {
  const src = read('src/assignmentBlueprint.js');
  assert.match(src, /classroomPackage:/);
  assert.match(src, /lessonResources:/);
  const app = read('src/App.jsx');
  assert.match(app, /classroomPackage: teacherReview\?\.classroomPackage/);
  assert.match(app, /lessonResources: teacherReview\?\.lessonResources/);
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
