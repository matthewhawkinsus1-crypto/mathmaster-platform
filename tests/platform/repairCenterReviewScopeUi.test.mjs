import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../src/components/teacher/IncompleteAssignmentRepairCenter.jsx', import.meta.url), 'utf8');

test('Repair Center exposes assignment, section, and question review scopes', () => {
  assert.match(source, /Review scope/i);
  assert.match(source, /value=['"]assignment['"]/);
  assert.match(source, /value=['"]section['"]/);
  assert.match(source, /value=['"]question['"]/);
});

test('scope target is derived from the current assignment/section/question rather than typed freehand', () => {
  assert.match(source, /reviewScope/);
  assert.match(source, /focusedRow\?\.sectionId|focusedRow\.sectionId/);
  assert.match(source, /actualFocusedQuestionId/);
  assert.match(source, /scope:\s*reviewScope/);
});

/*
 * The three assertions above match names. They pass just as happily when the
 * selector is cosmetic — when `flagTargetId` ignores the scope it was given and
 * always points at the focused question — which records `scope: 'section'`
 * against a question id and silently inherits to nothing. Verified: replacing
 * the derivation with `const flagTargetId = actualFocusedQuestionId;` left the
 * contract above green.
 *
 * So the derivation is checked where it happens, and the inheritance the wider
 * scopes exist for is checked by running it.
 */
test('the flag target is derived from the selected scope, not fixed to the focused question', () => {
  const start = source.indexOf('const flagTargetId');
  assert.notEqual(start, -1, 'the Repair Center must derive a flag target');
  const end = source.indexOf(';', source.indexOf('actualFocusedQuestionId', start));
  const derivation = source.slice(start, end);

  assert.match(derivation, /reviewScope/,
    'the flag target must depend on the selected scope; a target that ignores it records a section flag against a question id, which inherits to nothing');
  assert.match(derivation, /sectionId/,
    'the section scope must target the section the focused question belongs to');
});

test('a section-scoped flag governs every question in that section, and only that section', async () => {
  const { addTeacherReviewFlag, emptyTeacherReviewContext } = await import('../../src/platform/preflight/teacherReviewContext.js');
  const { buildAssignmentRepairCenterModel } = await import('../../src/platform/preflight/assignmentRepairCenterModel.js');

  const assignmentV5 = {
    schemaVersion: 5,
    title: 'Scope inheritance',
    sections: [
      { id: 'sec-dol', role: 'dol', questions: [{ questionId: 'q-1' }, { questionId: 'q-2' }] },
      { id: 'sec-warmup', role: 'warmup', questions: [{ questionId: 'q-3' }] },
    ],
  };

  const context = addTeacherReviewFlag(emptyTeacherReviewContext(), {
    scope: 'section',
    targetId: 'sec-dol',
    category: 'teacherReview',
    severity: 'needsEditing',
    note: 'Every graph in the DOL uses the wrong axis labels.',
  });

  const model = buildAssignmentRepairCenterModel({ assignmentV5, diagnostics: [], teacherReviewContext: context });
  const governed = model.questions.filter((row) => row.teacherFlags.length > 0).map((row) => row.questionId).sort();

  assert.deepEqual(
    governed,
    ['q-1', 'q-2'],
    'one section flag must reach every question in its section and no question outside it — that reach is the whole reason the wider scopes exist',
  );
});
