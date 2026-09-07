import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
const boundarySource = readFileSync(new URL('../../src/QuestionModuleBoundary.jsx', import.meta.url), 'utf8');
const panelSource = readFileSync(new URL('../../src/components/teacher/TeacherQuestionReviewPanel.jsx', import.meta.url), 'utf8');

test('actual teacher View as Student runtime reaches the review panel through the question runtime boundary', () => {
  assert.match(appSource, /generationStudentKey\s*=([\s\S]{0,200})teacher-preview/,
    'App must continue marking the real View-as-Student question runtime with teacher-preview');
  assert.match(boundarySource, /teacher-preview/);
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

test('the preview marker is derived strictly, so a student runtime cannot look like a preview', () => {
  const start = boundarySource.indexOf('const teacherPreviewTarget');
  const parser = boundarySource.slice(start, boundarySource.indexOf('/*', start));

  assert.match(parser, /parts\.indexOf\(['"]teacher-preview['"]\)/,
    'the marker must be matched as a whole key segment, not as a substring of the key');
  assert.match(parser, /markerIndex\s*<=\s*0/,
    'the marker cannot be the first segment: the assignment id is read from the segment before it');
  assert.match(parser, /Number\.isInteger\(questionIndex\)/,
    'a non-integer question index must not produce a preview target');
  assert.match(parser, /return null/,
    'anything that does not parse as a preview must yield no target rather than a partial one');
});
