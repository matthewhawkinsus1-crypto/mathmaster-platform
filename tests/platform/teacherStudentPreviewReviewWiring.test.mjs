import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
const boundarySource = readFileSync(new URL('../../src/QuestionModuleBoundary.jsx', import.meta.url), 'utf8');
const panelSource = readFileSync(new URL('../../src/components/teacher/TeacherQuestionReviewPanel.jsx', import.meta.url), 'utf8');

test('actual teacher View as Student runtime reaches the review panel through the question runtime boundary', () => {
  assert.match(appSource, /teacherPreview=\{preview === true\}/,
    'App must tell the question runtime outright that it is a teacher preview');
  assert.match(appSource, /previewAssignmentId=\{activeAssignmentId\}/);
  assert.match(appSource, /previewQuestionIndex=\{currentQuestionIndex\}/);
  assert.match(boundarySource, /TeacherQuestionReviewPanel/);
  assert.match(boundarySource, /assignmentId=\{previewTarget\.assignmentId\}/);
  assert.match(boundarySource, /questionIndex=\{previewTarget\.questionIndex\}/);
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
test('the review panel is mounted only for a teacher preview, never unconditionally', () => {
  const start = boundarySource.indexOf('const reviewPanel');
  assert.notEqual(start, -1, 'the boundary must decide whether to mount the review panel');
  const decision = boundarySource.slice(start, boundarySource.indexOf(';', start));

  assert.match(decision, /previewTarget\s*\n?\s*\?/,
    'the panel must be mounted on the preview target itself; any always-true gate puts teacher note controls inside a student assignment');
  assert.match(decision, /:\s*null/,
    'the non-preview case must render nothing at all');
  assert.doesNotMatch(decision, /\|\||true/,
    'a fallback or literal in the gate defeats it: the panel must mount only when this runtime is genuinely a teacher preview');
});

test('teacher preview is stated by the caller, never inferred from the generation key', () => {
  const start = boundarySource.indexOf('const teacherPreviewTarget');
  const parser = boundarySource.slice(start, boundarySource.indexOf('/*', start + 10));

  assert.match(parser, /teacherPreview !== true/,
    'the preview decision must come from an explicit flag');
  assert.match(parser, /Number\.isInteger\(questionIndex\)/,
    'a non-integer question index must not produce a preview target');
  assert.match(parser, /return null/,
    'anything that does not parse as a preview must yield no target rather than a partial one');

  assert.doesNotMatch(
    parser,
    /resetKey/,
    'the preview decision must not be read out of resetKey. That is a cache key: in a shared-version section it reads shared-version:<assignment>:<role> for teacher and student alike, on purpose, so the teacher previews the version the class receives. Sniffing it for a marker found nothing in exactly the sections that show "SAME VERSION", and the review controls silently never appeared there.',
  );
});

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
