/*
 * ONE SECURE ITEM THAT THROWS KEEPS THE TEST.
 *
 * Nothing caught a throw between a secure item and the app, so one item that
 * could not be drawn replaced the whole Test screen: the header, the question
 * list, Next and Submit. In tests/browser/secureExamNavigation.mjs (journey
 * brokenItem) the page went blank at the second item, on a Chromebook and on a
 * phone. The item now sits in QuestionResolutionBoundary, as a question does
 * everywhere else, and the student keeps the rest of the Test.
 *
 * These read the wiring and render the panel the student meets in its place.
 * The browser journey drives the rest: Try again, Next, Previous with the
 * first answer kept, the review and Submit.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { executableSource, region } from './helpers/sourceContract.mjs';

let vite = null;
before(async () => {
  const { createServer } = await import('vite');
  vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
});
after(async () => { await vite?.close(); });

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');

// The boundary as it draws itself once a child has thrown while drawing.
const fallback = async (props = {}) => {
  const { default: QuestionResolutionBoundary } = await vite.ssrLoadModule('/src/QuestionResolutionBoundary.jsx');
  const boundary = new QuestionResolutionBoundary({
    context: { questionId: 'q-2', activityRole: 'secureTest' },
    executionScope: 'student',
    onRetry: () => {},
    ...props,
  });
  boundary.state = QuestionResolutionBoundary.getDerivedStateFromError(new TypeError("Cannot read properties of null (reading 'id')"));
  return renderToStaticMarkup(boundary.render());
};

const SECURE_NOTE = 'Your saved answers are kept exactly as they are.';

test('the secure item sits in the boundary, and Try again draws it afresh', () => {
  const player = executableSource(read('src/components/assessment/SecureExamQuestionPlayer.jsx'));
  assert.match(player, /import QuestionResolutionBoundary, \{ questionFailureContext \} from '\.\.\/\.\.\/QuestionResolutionBoundary\.jsx';/);
  const boundary = region(player, '<QuestionResolutionBoundary', '</QuestionResolutionBoundary>', 'the boundary around the item');
  assert.match(boundary, /<RichQuestionRuntime\s+key=\{attempt\}/, 'the item, keyed by the retry');
  assert.match(boundary, /resetKey=\{attempt\}\s+onRetry=\{\(\) => setAttempt\(\(count\) => count \+ 1\)\}/);
  assert.match(boundary, /context=\{questionFailureContext\(\{ question, activityRole: 'secureTest', executionScope \}\)\}/, 'the diagnostic names the slot, never the student');
  assert.match(boundary, /executionScope=\{executionScope\}\s+draftKey=\{draftKey\}/);
  // What the student is told, and where.
  assert.match(boundary, /technicalDetails=\{false\}/, 'no copyable report on a secure Test');
  assert.match(boundary, new RegExp(`savedWorkNote="${SECURE_NOTE.replace(/\./g, '\\.')}"`));
  assert.match(boundary, /fallbackLandmark=\{mainLandmark \? 'main' : null\}/);
  // Try again draws the item as the student last left it, from the latest
  // answer handed to the container, as "Back to questions" does.
  assert.match(player, /const latestDraft = useRef\(initialResponsePayload\);/);
  assert.match(player, /const draftChanged = useCallback\(\(payload, usage\) => \{\s*latestDraft\.current = payload;\s*return onDraftChange\?\.\(payload, usage\);\s*\}, \[onDraftChange\]\);/);
  assert.match(player, /const submitted = useCallback\(\(payload, usage\) => \{\s*latestDraft\.current = payload;\s*return onSubmit\?\.\(payload, usage\);\s*\}, \[onSubmit\]\);/);
  assert.match(boundary, /initialResponsePayload=\{attempt \? latestDraft\.current : initialResponsePayload\}/);
  assert.match(boundary, /onSubmit=\{submitted\}\s+onDraftChange=\{draftChanged\}/);
  // Nothing else is drawn by the player: the Test's header, list and moves are
  // the container's, outside the boundary.
  assert.equal((player.match(/<RichQuestionRuntime\b/g) || []).length, 1);
  assert.doesNotMatch(player, /data-secure-nav|data-secure-navigator/);
});

test('a new item starts clean: both hosts key the player by the item', () => {
  assert.match(read('src/components/assessment/SecureExamContainer.jsx'), /<SecureExamQuestionPlayer\s+key=\{question\?\.questionInstanceId \|\| 'waiting'\}/);
  assert.match(read('src/components/teacher/TestCyclePreview.jsx'), /<SecureExamQuestionPlayer\s+key=\{`\$\{draw\}-\$\{item\.ordinal\}-/);
});

test('the student reads that the item did not load, in the page\'s main, with no promise about the grade and no report', async () => {
  const html = await fallback({ technicalDetails: false, savedWorkNote: SECURE_NOTE, fallbackLandmark: 'main' });
  assert.match(html, /^<main\b/, 'the panel takes the item\'s place as the page\'s main landmark');
  assert.match(html, /data-question-resolution-failure="resolution-exception"/);
  assert.match(html, /This question did not load/);
  assert.match(html, />Try again</);
  assert.match(html, /continue with the other questions and let your teacher know\. Your saved answers are kept exactly as they are\./);
  // An item that cannot be shown cannot be answered: nothing promises the grade.
  assert.doesNotMatch(html, /grade is not affected|grade for this question/);
  assert.doesNotMatch(html, /Copy details for your teacher|Teacher details|resolution-exception ·/);
});

test('in a teacher\'s preview the page already has its main: the panel is plain, with the teacher\'s details', async () => {
  const html = await fallback({ executionScope: 'teacherPreview', technicalDetails: false, savedWorkNote: SECURE_NOTE, fallbackLandmark: null });
  assert.doesNotMatch(html, /<main\b/);
  assert.match(html, /^<div data-question-resolution-failure=/);
  assert.match(html, /data-teacher-resolution-detail/);
  assert.match(html, /Copy details for your teacher/, 'a teacher previewing gets the report');
});

test('every other host keeps its words and its element', async () => {
  const plain = await fallback();
  assert.doesNotMatch(plain, /<main\b/);
  assert.match(plain, /Nothing you did caused this, and your grade is not affected\./);
  const recorded = await fallback({ hasRecordedWork: true });
  assert.match(recorded, /Your recorded answers, tries and grade for this question are kept exactly as they are\./);
  // The engine's own boundary, around every practice and assignment question,
  // passes neither a note nor a landmark.
  const engine = executableSource(read('src/QuestionEngine.jsx'));
  const engineBoundary = region(engine, '<QuestionResolutionBoundary', '</QuestionResolutionBoundary>', 'the engine\'s boundary');
  assert.doesNotMatch(engineBoundary, /savedWorkNote|fallbackLandmark/);
});

test('the browser journey that found it runs in CI with the others', () => {
  const driver = read('tests/browser/secureExamNavigation.mjs');
  assert.match(driver, /const brokenItemJourney = async \(context, device\) =>/);
  assert.match(driver, /const journeys = \[[^\]]*\bbrokenItemJourney\b[^\]]*\]/);
  assert.match(read('tests/browser/secureExamNavigationMain.jsx'), /scenario === 'brokenItem'/);
  // The secure screens job runs every journey: no SECURE_NAV_JOURNEYS filter.
  const workflow = read('.github/workflows/student-runtime-browser-gates.yml');
  const step = region(workflow, '- name: Moving through a secure test', 'run: node tests/browser/secureExamNavigation.mjs', 'the secure navigation step');
  assert.doesNotMatch(step, /SECURE_NAV_JOURNEYS/);
});
