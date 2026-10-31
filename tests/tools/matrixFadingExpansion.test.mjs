/*
 * R-7: THE ROW-BY-COLUMN TERMS FADE IN PRACTICE (student pass 3, matrices walkthrough).
 *
 * `showExpansion: true` writes out the terms of the product cell being filled,
 * every cell, every time (Classwork 3 and 5). Practice jumped from that to
 * nothing. `showExpansion: "fading"` keeps the FIRST cell's terms as a worked
 * example and shows any other cell's only when the student asks; and where the
 * activity withholds the method (an exit ticket, quiz or test) it shows nothing
 * and cannot be asked for. `true` is exactly what it was.
 *
 * Nothing here is graded: the terms name the products and leave the adding to
 * the student, so no verdict, score or recorded work changes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { expansionPlan } from '../../src/tools/matrixLab/matrixCalculatorDisplay.js';
import { validateToolQuestion } from '../../src/tools/toolSchemas.js';
import { buildAuthoringContract } from '../../src/platform/contract/authoringContract.js';
import { TOOL_STATE_PERSISTENCE } from '../../src/tools/toolStatePersistence.js';
import { componentSource, executableSource } from '../platform/helpers/sourceContract.mjs';

// Outside the repository: lint scans the tree.
const VITE_CACHE = join(tmpdir(), 'mathmaster-vite-ssr');

const FIRST = { i: 0, j: 0 };
const OTHER = { i: 0, j: 1 };
const ANOTHER = { i: 1, j: 0 };
const SAME_ROW = { i: 0, j: 2 }; // the row of OTHER, a different column
const SAME_COLUMN = { i: 1, j: 1 }; // the column of OTHER, a different row

test('true is unchanged: every cell shows its terms, every time, and nothing is offered', () => {
  [FIRST, OTHER, ANOTHER].forEach((focus) => assert.deepEqual(expansionPlan({ authored: true, focus }), { show: true, offer: false }));
  // As authored on Classwork, whatever the activity: it is not the new option's to change.
  assert.deepEqual(expansionPlan({ authored: true, focus: OTHER, methodWithheld: true }), { show: true, offer: false });
  assert.deepEqual(expansionPlan({ authored: true, focus: null }), { show: false, offer: false }, 'no cell has focus');
});

test('fading: the first cell is the worked example, every other cell waits to be asked for', () => {
  assert.deepEqual(expansionPlan({ authored: 'fading', focus: FIRST }), { show: true, offer: false }, 'shown, and nothing to ask');
  assert.deepEqual(expansionPlan({ authored: 'fading', focus: OTHER }), { show: false, offer: true });
  assert.deepEqual(expansionPlan({ authored: 'fading', focus: ANOTHER }), { show: false, offer: true });
  // Asked for: the terms show, and the button stays so the student can hide them again.
  assert.deepEqual(expansionPlan({ authored: 'fading', focus: OTHER, requested: OTHER }), { show: true, offer: true });
  // A request is for one cell. It does not open another, and the first cell is never "requested away".
  assert.deepEqual(expansionPlan({ authored: 'fading', focus: ANOTHER, requested: OTHER }), { show: false, offer: true });
  assert.deepEqual(expansionPlan({ authored: 'fading', focus: SAME_ROW, requested: OTHER }), { show: false, offer: true }, 'same row, another column');
  assert.deepEqual(expansionPlan({ authored: 'fading', focus: SAME_COLUMN, requested: OTHER }), { show: false, offer: true }, 'same column, another row');
  assert.deepEqual(expansionPlan({ authored: 'fading', focus: FIRST, requested: OTHER }), { show: true, offer: false });
  assert.deepEqual(expansionPlan({ authored: 'fading', focus: null, requested: OTHER }), { show: false, offer: false }, 'no cell has focus');
  assert.deepEqual(expansionPlan({ authored: 'fading' }), { show: false, offer: false });
});

test('fading shows nothing, and cannot be asked for, where the activity withholds the method', () => {
  [FIRST, OTHER, ANOTHER].forEach((focus) => {
    assert.deepEqual(expansionPlan({ authored: 'fading', focus, methodWithheld: true }), { show: false, offer: false });
    assert.deepEqual(expansionPlan({ authored: 'fading', focus, requested: focus, methodWithheld: true }), { show: false, offer: false }, 'asking does not get around it');
  });
});

test('only the two authored values mean anything', () => {
  [false, undefined, null, 'true', 'fade', 'Fading', 'always', 1, 0, {}, []].forEach((authored) => {
    [FIRST, OTHER].forEach((focus) => assert.deepEqual(expansionPlan({ authored, focus, requested: focus }), { show: false, offer: false }, JSON.stringify(authored)));
  });
  assert.deepEqual(expansionPlan(), { show: false, offer: false });
});

test('what a student sees: the first cell\'s terms, a button for the rest, the terms once asked, nothing on an exit ticket', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent', cacheDir: VITE_CACHE });
  try {
    const { ProductExpansion } = await server.ssrLoadModule('/src/tools/matrixLab/MatrixLab.jsx');
    const { readMatrixLabQuestion } = await server.ssrLoadModule('/src/tools/matrixLab/matrixLabMath.js');
    const model = readMatrixLabQuestion({
      mode: 'operate', operation: 'multiply', left: 'A', right: 'B',
      matrices: { A: { rows: [[1, 2], [-1, 3]] }, B: { rows: [[5, 6], [7, 8]] } },
    });
    const render = (props) => renderToStaticMarkup(React.createElement(ProductExpansion, {
      left: { name: 'A', values: model.leftMatrix.values },
      right: { name: 'B', values: model.rightMatrix.values },
      ...props,
    }));
    const button = /<button type="button" aria-expanded="(true|false)"[^>]*>(Show|Hide) the multiplication for this cell<\/button>/;
    const terms = (markup) => (markup.match(/<p aria-live="polite"[^>]*>(.*?)<\/p>/) || [])[1] || null;

    // The first cell: row 1 of A with column 1 of B, products named and not added. No button.
    const first = render({ authored: 'fading', focus: FIRST });
    assert.equal(terms(first), 'Row 1 of A · column 1 of B = <span>1(5) + 2(7)</span>');
    assert.doesNotMatch(first, /<button/);

    // Another cell: only the button, closed. The terms are not on the page.
    const other = render({ authored: 'fading', focus: OTHER });
    assert.match(other, button);
    assert.equal(other.match(button)[1], 'false');
    assert.equal(other.match(button)[2], 'Show');
    assert.equal(terms(other), null);
    assert.doesNotMatch(other, /1\(6\)/);

    // Asked for: that cell's terms (a negative factor in parentheses), and the button now hides them.
    const asked = render({ authored: 'fading', focus: ANOTHER, requested: ANOTHER });
    assert.equal(asked.match(button)[1], 'true');
    assert.equal(asked.match(button)[2], 'Hide');
    assert.equal(terms(asked), 'Row 2 of A · column 1 of B = <span>(−1)(5) + 3(7)</span>');
    // The button comes before its terms in reading order, as a disclosure does.
    assert.ok(asked.indexOf('<button') < asked.indexOf('<p aria-live'));
    // Asking about one cell shows nothing on another.
    assert.equal(terms(render({ authored: 'fading', focus: OTHER, requested: ANOTHER })), null);

    // An exit ticket, quiz or test: nothing, even for the first cell, even if asked.
    assert.equal(render({ authored: 'fading', focus: FIRST, methodWithheld: true }), '');
    assert.equal(render({ authored: 'fading', focus: OTHER, requested: OTHER, methodWithheld: true }), '');

    // true: every cell's terms, as before, with no button.
    const always = render({ authored: true, focus: ANOTHER });
    assert.equal(terms(always), 'Row 2 of A · column 1 of B = <span>(−1)(5) + 3(7)</span>');
    assert.doesNotMatch(always, /<button/);

    // Neither: nothing.
    assert.equal(render({ authored: undefined, focus: FIRST }), '');
  } finally {
    await server.close();
  }
});

test('the lab hands the component the authored value and the activity\'s own answer to "may the method show?"', () => {
  const lab = executableSource(componentSource('src/tools/matrixLab/MatrixLab.jsx'));
  const element = lab.slice(lab.indexOf('<ProductExpansion'), lab.indexOf('/>', lab.indexOf('<ProductExpansion')));
  assert.match(element, /authored=\{questionData\.showExpansion\}/, 'what the author wrote, as written');
  assert.match(element, /methodWithheld=\{methodWithheld\}/);
  assert.match(lab, /const methodWithheld = useMethodWithheld\(\);/, 'the platform\'s rule, not the tool\'s own');
  assert.match(element, /focus=\{focusHasTerms \? focus : null\}/, 'only a cell that has terms: not an addition, not an undefined product');
  // The request is held beside the focus, and named in the persistence contract as presentation.
  assert.match(lab, /const \[requestedCell, setRequestedCell\] = useState\(null\);/);
  assert.ok(TOOL_STATE_PERSISTENCE.matrixLab.transientState.requestedCell, 'requestedCell is declared as transient presentation');
});

test('the option survives the teacher import, on a Practice item, and a misspelling shows nothing instead of everything', () => {
  const FILE = new URL('../../teacher-import-jsons/algebra2-honors-module1/T2_L3_Solving_Systems_with_Matrices.json', import.meta.url);
  const lesson = JSON.parse(readFileSync(FILE, 'utf8'));
  const withExpansion = (ids, value) => JSON.stringify({
    ...lesson,
    sections: lesson.sections.map((section) => ({
      ...section,
      questions: section.questions.map((question) => (ids.includes(question.questionId) ? { ...question, showExpansion: value } : question)),
    })),
  });
  const compiled = compileTeacherImport(withExpansion(['l3m-pr-1', 'l3m-pr-2'], 'fading'));
  assert.deepEqual(compiled.model.errors, []);
  ['l3m-pr-1', 'l3m-pr-2'].forEach((id) => {
    const question = compiled.questions.find((candidate) => candidate.questionId === id);
    assert.equal(question.showExpansion, 'fading', `${id} keeps the option through the import`);
    assert.equal(question.type, 'matrixLab');
    assert.deepEqual(validateToolQuestion(question).errors, [], `${id} is a valid Matrix Lab question`);
  });
  // The items that did not ask for it do not get it.
  const untouched = compiled.questions.find((candidate) => candidate.questionId === 'l3m-pr-3');
  assert.equal(untouched.showExpansion, undefined);
  // The published lesson is unchanged: Classwork's two stay `true`, and no Practice item opts in until a teacher does.
  const shipped = compileTeacherImport(readFileSync(FILE, 'utf8'));
  assert.deepEqual(shipped.questions.filter((question) => question.showExpansion !== undefined).map((question) => [question.questionId, question.showExpansion]), [['l3m-cw-3', true], ['l3m-cw-5', true]]);
  // A misspelling is not "true": nothing fades or shows (expansionPlan, above).
  const typo = compileTeacherImport(withExpansion(['l3m-pr-1'], 'fade'));
  assert.equal(typo.questions.find((question) => question.questionId === 'l3m-pr-1').showExpansion, 'fade');
  assert.deepEqual(expansionPlan({ authored: 'fade', focus: OTHER }), { show: false, offer: false });
});

test('the authoring contract tells an author about it', () => {
  const contract = buildAuthoringContract({ generatedAt: new Date('2026-10-25T00:00:00Z') });
  assert.match(contract, /"showExpansion": true` shows the row × column terms of the cell being filled as a scaffold; `"showExpansion": "fading"` \(for Practice\) shows them for the first cell and then only when the student asks, and never on an exit ticket, quiz or test/);
});
