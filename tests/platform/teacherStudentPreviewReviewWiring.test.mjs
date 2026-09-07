import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
const boundarySource = readFileSync(new URL('../../src/QuestionModuleBoundary.jsx', import.meta.url), 'utf8');
const panelSource = readFileSync(new URL('../../src/components/teacher/TeacherQuestionReviewPanel.jsx', import.meta.url), 'utf8');

/*
 * WHERE THE REVIEW CONTROLS LIVE, AND WHY IT IS NOT THE QUESTION RUNTIME.
 *
 * View as Student exists so a teacher can see the formatting and sizing a
 * student gets. Anything these controls add to that layout defeats the purpose,
 * so the panel portals to a fixed overlay and never enters the student flow.
 *
 * It is mounted once for the whole preview rather than inside the question
 * module boundary. Mounted there it existed only while a response module was on
 * screen — not on the section overview, not between questions, and not when a
 * module failed to render, which is the moment a teacher most needs to write a
 * note about it. A teacher looking at student-facing work should always be one
 * click from sending one.
 */
test('the review panel is mounted once for the whole teacher preview', () => {
  const start = appSource.indexOf('<TeacherQuestionReviewPanel');
  assert.notEqual(start, -1, 'the teacher preview must mount the review panel');
  const mount = appSource.slice(appSource.lastIndexOf('{', start), appSource.indexOf('/>', start));

  assert.match(mount, /preview &&/,
    'the panel must be gated on preview, so a student never mounts teacher controls');
  assert.match(mount, /assignmentId=\{activeAssignmentId\}/,
    'the panel must be told which assignment is on screen');
  assert.match(mount, /questionIndex=\{currentQuestionIndex\}/,
    'the panel must follow the question the teacher is looking at');
  assert.match(mount, /question=\{questions\[currentQuestionIndex\]/,
    'handing over the live question avoids a second fetch and keeps the note attached to the question actually on screen');
});

test('the review panel is not mounted inside the question runtime', () => {
  assert.doesNotMatch(
    boundarySource,
    /TeacherQuestionReviewPanel/,
    'QuestionModuleBoundary is an error boundary. Mounting the review panel there tied a teacher tool to whether a response module happened to render, and left it absent from every other part of the student view.',
  );
  assert.doesNotMatch(
    boundarySource,
    /teacherPreview|previewAssignmentId/,
    'the boundary must not carry preview wiring at all',
  );
});

test('the panel stays out of the student layout it exists to let a teacher judge', () => {
  // Anchored to the return: a bare /createPortal/ also matches the import line,
  // so the panel could stop portalling and render inline with this green.
  assert.match(panelSource, /return createPortal\(/,
    'the panel must RENDER through a portal, not merely import one; rendered inline it lands in the student layout the teacher is trying to judge');
  assert.match(panelSource, /position:\s*['"]fixed['"]/,
    'it must be positioned against the viewport, not laid out inside the assignment');
  assert.match(panelSource, /zIndex/,
    'it must sit above the student view rather than displacing it');
});

test('teacher preview review panel resolves the canonical saved question to its stable questionId', () => {
  assert.match(panelSource, /getStoredAssignmentQuestions/);
  assert.match(panelSource, /resolvedQuestion\?\.questionId/);
  assert.match(panelSource, /assignments/);
});

test('teacher preview review panel saves notes, resolves them, and builds a question-only repair request', () => {
  assert.match(panelSource, /loadAssignmentTeacherReviewContext/);
  assert.match(panelSource, /saveAssignmentTeacherReviewContext/);
  assert.match(panelSource, /addTeacherReviewFlag/);
  assert.match(panelSource, /resolveTeacherReviewFlag/);
  assert.match(panelSource, /buildQuestionRepairRequest/);
  assert.match(panelSource, /Flag question for editing|Save teacher flag/i);
  assert.match(panelSource, /Verify fixed|Resolve/i);
  assert.match(panelSource, /Copy repair request/i);
});

/*
 * This is the assertion the panel's placement depends on, so it is written to
 * fail for the reason it names.
 *
 * The panel mounts inside the student question runtime — the same boundary that
 * wraps a student's response module — and is kept off a student's screen only by
 * the preview marker. The previous version of this test matched
 * `parts.indexOf('teacher-preview')` anywhere in the file and a `doesNotMatch`
 * that nothing realistic produces. Verified by mutation: replacing the gate with
 * an always-true expression, so the panel renders for every student, left all of
 * it green under a test named "student runtime never mounts teacher review
 * controls".
 *
 * Worth being exact about what this protects. The notes themselves are guarded
 * by the assignmentQuestionReviews rules, which are covered against the emulator
 * in tests/firestore-rules.test.mjs — a student who somehow mounted this panel
 * would be denied the read. What this assertion protects is the student's
 * screen: teacher-only note-entry controls, and a permission error, appearing in
 * the middle of their assignment.
 */
/*
 * The regression this file exists for, asserted where it actually broke.
 *
 * The teacher-preview marker was built into generationStudentKey, and that
 * expression checks shared variant mode FIRST. So in any shared-version section
 * the key was shared-version:... and never carried the marker, teacher or not.
 * Every source contract passed while View as Student showed no review controls
 * at all on the sections a teacher is most likely to open.
 *
 * The key must keep behaving that way — a teacher has to preview the version
 * the class receives — which is precisely why the preview flag cannot live in
 * it.
 */
test('shared-version sections still generate the version students receive, preview or not', () => {
  // Anchored on currentSectionVariantMode, which is unique to the interactive
  // runtime. A bare 'const generationStudentKey' also matches an earlier
  // non-interactive path that has no preview concept at all, and anchoring
  // there made this assertion vacuous — verified: folding the preview flag into
  // the real expression left it green.
  const start = appSource.indexOf('const generationStudentKey = currentSectionVariantMode');
  assert.notEqual(start, -1, 'the interactive runtime must still derive a generation student key');
  const expression = appSource.slice(start, appSource.indexOf(';', start));

  assert.match(expression, /shared-version/,
    'a shared-version section must still key generation on the shared version');
  assert.doesNotMatch(
    expression,
    /teacherPreview/,
    'the explicit preview flag must not be folded back into the generation key, or a teacher would preview a different variant than the class receives in shared-version sections',
  );
});
