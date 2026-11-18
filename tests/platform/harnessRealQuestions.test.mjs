/*
 * A CHECK THAT OPENS A STUDENT'S LESSON QUESTION IN THE APP HARNESS READS A QUESTION, NOT THE FALLBACK.
 *
 * The teacher harness's default lesson (tests/browser/teacherWorkflow/fixture.js, lessonSections) is `freeResponse`,
 * a type the student app does not draw: a question opened in it is QuestionEngine's "This question could not be
 * displayed". The teacher journeys never open one. These checks did, and audited, measured or read that panel instead
 * of a question: the accessibility certification's finished-section scene (and forced colours, the contrast review,
 * the large-text runs and accessible names, which run its screens), the dark-mode certification's, and three journeys
 * that open a question by address or by Continue. Each now opens its student with `?questions=real`
 * (realLessonSections). In a browser each check's own path read the fallback in the default lesson and a question
 * with its answer boxes in the real one.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (file) => executableSource(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'));
const engine = read('src/QuestionEngine.jsx');
const fixture = read('tests/browser/teacherWorkflow/fixture.js');
const typesIn = (source) => [...new Set([...source.matchAll(/\btype: '(\w+)'/g)].map((match) => match[1]))];
// What QuestionEngine draws by its type: a case of its switch, before the default that is the fallback panel.
const SWITCH = region(engine, 'switch (processedQuestion.type) {', 'This question could not be displayed', 'the question switch');
const drawn = (type) => new RegExp(`\\bcase '${type}':`).test(SWITCH);

test('the harness\'s default lesson is a type the student app does not draw, and its real lesson is not', () => {
  const byDefault = typesIn(region(fixture, 'const lessonSections = (id) => ([', '\n]);', 'the default lesson'));
  assert.deepEqual(byDefault, ['freeResponse']);
  assert.equal(drawn('freeResponse'), false, 'it falls to the fallback for a type QuestionEngine does not know');
  const real = typesIn(region(fixture, 'const realLessonSections = (id) => ([', '\n]);', 'the real lesson'));
  assert.ok(real.length >= 4, real.join(', '));
  for (const type of real) assert.ok(drawn(type), `${type} is drawn`);
  assert.match(fixture, /const sectionsFor = questionSet === 'real' \? realLessonSections/, '?questions=real serves it');
});

// Where each check opens its student.
const MOVED = [
  ['tests/browser/accessibilityCertification.mjs', /const appUrl = \(origins\) => `\$\{origins\.app\}\/tests\/browser\/teacherWorkflow\/index\.html\?reset=1&as=student&studentId=\$\{STUDENT_ID\}&questions=real`;/],
  ['tests/browser/darkModeCertification.mjs', /const query = \{ student: '\?reset=1&as=student&studentId=910002&questions=real',/],
  ['tests/browser/teacherWorkflow/appUrlJourneys.mjs', /const asStudent = `as=student&studentId=\$\{STUDENT\}&questions=real`;/],
  ['tests/browser/teacherWorkflow/studentScreenChange.mjs', /const asStudent = 'as=student&studentId=910001&questions=real';/],
  ['tests/browser/teacherWorkflow/supportEvidenceJourneys.mjs', /async S1\(page\) \{\s*await page\.goto\(`\$\{PAGE\}&as=student&studentId=910002&questions=real`/],
];

test('each check that opens a lesson question opens its student in the real lesson', () => {
  for (const [file, statement] of MOVED) assert.match(read(file), statement, file);
  // The certification's student screens open at appUrl, the finished section's among them; the drivers that run its
  // screens (forced colours, the contrast review, large text, accessible names) open them through it.
  const certification = read('tests/browser/accessibilityCertification.mjs');
  assert.match(region(certification, 'const openStudentApp = async', '};', 'the student app\'s opener'), /await page\.goto\(appUrl\(origins\), \{ timeout: 180_000 \}\);/);
  assert.match(region(certification, 'const studentAppScreen = (id, tab, ready) => ({', '});', 'a student app screen'), /open: openStudentApp,/);
  // The journeys sign their student in with it on every reset, so the lesson the question comes from is the real one
  // (the teacher's own loads open no student question; an excused student's address opens a result page).
  for (const file of ['tests/browser/teacherWorkflow/appUrlJourneys.mjs', 'tests/browser/teacherWorkflow/studentScreenChange.mjs']) {
    const resets = [...read(file).matchAll(/page\.goto\(`\$\{ORIGIN\}[^`]*reset=1[^`]*`/g)].map((match) => match[0])
      .filter((url) => /as=student|\$\{asStudent\}/.test(url) && !/controls=retired/.test(url));
    assert.ok(resets.length > 0, file);
    for (const reset of resets) assert.match(reset, /\$\{asStudent\}/, `${file}: ${reset}`);
  }
});
