/*
 * TWO MORE SCREENS ARE TWO FILES NOW, AND A TEST ABOUT ONE MEANS BOTH.
 *
 * PR #155 split AssignmentQuestionEditor.jsx and AssignmentLibrary.jsx the same
 * way AssignmentIntake.jsx was split earlier: a wrapper that owns the new
 * Repair Center entry points, and a base holding the screen that was already
 * there. The implementation moved; nothing was lost.
 *
 * Ten assertions across nine files inspect those screens by reading their
 * source as text, and after the split those reads found the wrapper instead of
 * the screen. They failed on strings like the weight controls and the Safe Live
 * Repair Pack import — not because a teacher lost anything, but because the
 * markup is next door.
 *
 * This follows ./intakeSource.mjs and ./solverSource.mjs, for the same reasons:
 * reading BOTH rather than repointing each test at the base, because these
 * tests assert about "the question editor" and "the library", and those are now
 * the pair — a test aimed only at the base silently stops covering everything
 * the wrapper owns. And each pairing asserts the seam it depends on, because
 * concatenating two files is only honest while the wrapper still renders the
 * base: drop the element and the screen vanishes for the teacher while every
 * string these tests look for is still present in the concatenation.
 *
 * These are source-inspection tests. They never render, so they cannot catch a
 * behavioural regression and never could. This restores exactly the guard that
 * existed before the refactor — no more.
 */

import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const read = (relativePath) => readFileSync(new URL(`../../../src/${relativePath}`, import.meta.url), 'utf8');

const paired = (wrapperFile, baseFile, element, whatVanishes) => {
  const wrapper = read(wrapperFile);
  assert.match(
    wrapper,
    new RegExp(`<${element}\\b`),
    `${wrapperFile} must render <${element} />; without it ${whatVanishes} and reading both files would assert against orphaned code`,
  );
  return `${wrapper}\n${read(baseFile)}`;
};

/** The whole teacher question editor: repair wrapper and editing screen. */
export const assignmentQuestionEditorSource = () => paired(
  'AssignmentQuestionEditor.jsx',
  'AssignmentQuestionEditorBase.jsx',
  'AssignmentQuestionEditorBase',
  'the editor is not on screen',
);

/** The whole assignment library: repair launcher and library listing. */
export const assignmentLibrarySource = () => paired(
  'AssignmentLibrary.jsx',
  'AssignmentLibraryBase.jsx',
  'AssignmentLibraryBase',
  'the library listing is not on screen',
);

export default { assignmentQuestionEditorSource, assignmentLibrarySource };
