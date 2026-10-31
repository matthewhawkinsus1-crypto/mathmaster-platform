/*
 * TL39 (findings E2-9, D-76): A SEQUENCE QUESTION CAN WRITE ITS TERMS AS f(n).
 *
 * Sequence Explorer wrote every term as aₙ while the Algebra I DOL writes a
 * sequence in function form (f(1) = −7, f(n) = f(n − 1) + 4), and DOL #3
 * Review's question 13 explained the mapping in its prompt. An authored
 * `notation: "f(n)"` now picks the words for the table, the graph labels, the
 * directions, the feedback and the solution review.
 *
 * It is a LABEL: no verdict depends on it (the grader is held to that below), and
 * where the student types a rule in the tool — the rule-writing mode, or Build the
 * Sequence Model with a rule to write — the screen stays aₙ and the authoring
 * check refuses f(n), because those boxes and their grader read aₙ.
 *
 * What the screen says is read from the real tool, rendered (Vite SSR), for every
 * mode that can say it; the default is held to the way it has always read.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';

import { closeEngine, loadEngine } from './helpers/actionBarRender.mjs';
import { render, text, withBrowser } from './helpers/studentToolRender.mjs';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { validateToolQuestion } from '../../src/tools/toolSchemas.js';
import { fullBridgeMissMessage } from '../../src/tools/sequenceExplorer/fullBridgeFeedback.js';
import { sequenceWords, sequenceWritesRules, shownSequenceNotation } from '../../src/tools/sequenceExplorer/sequenceNotation.js';
import { buildToolSolutionReviewModel } from '../../src/tools/shared/toolSolutionReview.js';
import sequenceExplorerGrader from '../../functions/shared/serverGrading/tools/sequenceExplorer.mjs';
import { generateSequence } from '../../functions/shared/toolMath/sequenceExplorer/sequenceMath.mjs';

after(closeEngine);

const ARITHMETIC = { kind: 'arithmetic', first: -7, difference: 4 };
const GEOMETRIC = { kind: 'geometric', first: 3, ratio: 2 };
const TABLE_AND_GRAPH = ['buildSequenceTable', 'plotSequence', 'analyzeSequence'];
const WITH_RULES = [...TABLE_AND_GRAPH, 'writeRecursive', 'writeExplicit', 'findSequenceTerm'];

const question = (extra) => ({ type: 'sequenceExplorer', prompt: 'Work with the sequence.', sequence: ARITHMETIC, ...extra });
const withNotation = (extra) => question({ notation: 'f(n)', ...extra });

// Every way aₙ could still show: aₙ, a₁, aₙ₋₁, a₍36₎, a₃₆, a6 as a label, a<sub>6</sub>.
const A_NOTATION = /aₙ|a₁|a₂|a₍|a[₀-₉]|<sub>|\ba\d/;
// In markup a subscript is a tag (the text helper would make it a space), so it is read there.
const A_IN_MARKUP = /a<sub>|aₙ|a[₀-₉]|a₍|(?:Sequence output |aria-label=")a\d/;

// A tool, rendered as a student opens it; its markup and the words in it.
const screen = async (questionData) => {
  const { server } = await loadEngine();
  const registry = await server.ssrLoadModule('/src/tools/toolRegistry.js');
  const { ToolRuntimeProvider } = await server.ssrLoadModule('/src/tools/shared/ToolRuntimeContext.jsx');
  const Tool = registry.getToolDefinition('sequenceExplorer').component;
  const markup = await withBrowser(() => {
    window.localStorage.getItem = (key) => (String(key).startsWith('mm.tool.') ? 'open' : null);
    return render(React.createElement(ToolRuntimeProvider, {}, React.createElement(Tool, { questionData, onAction() {}, attemptRecord: null })));
  });
  return { markup, words: text(markup) };
};

/* ------------------------------------------------------------ the words */

test('TL39: the words of each notation, and the default is aₙ as it always was', () => {
  for (const unauthored of [question({ mode: 'analyze' }), question({ notation: 'a_n' }), question({ notation: 'F(n)' }), question({ notation: undefined }), {}, null]) {
    const words = sequenceWords(unauthored);
    assert.deepEqual([words.general, words.first, words.previous, words.term(6), words.inSentence(36), words.subscripted(36)], ['aₙ', 'a₁', 'aₙ₋₁', 'a6', 'a₍36₎', 'a₃₆']);
  }
  const words = sequenceWords(withNotation({ mode: 'analyze' }));
  assert.deepEqual([words.general, words.first, words.previous, words.term(6), words.inSentence(36), words.subscripted(36)], ['f(n)', 'f(1)', 'f(n − 1)', 'f(6)', 'f(36)', 'f(36)']);
});

test('TL39: f(n) is drawn wherever no rule is typed, and aₙ wherever one is', () => {
  for (const mode of ['analyze', 'missingTerm', 'partialSum', 'compare', undefined, 'not-a-mode']) {
    assert.equal(shownSequenceNotation(withNotation({ mode })), 'f(n)', `${mode}: no rule to type`);
  }
  assert.equal(shownSequenceNotation(withNotation({ mode: 'fullBridge', studentActions: TABLE_AND_GRAPH })), 'f(n)');
  assert.equal(shownSequenceNotation(withNotation({ mode: 'fullBridge', studentActions: [...TABLE_AND_GRAPH, 'findSequenceTerm'] })), 'f(n)');
  assert.equal(shownSequenceNotation(withNotation({ mode: 'fullBridge' })), 'f(n)', 'with no actions there is no rule');
  // The rule boxes and their grader read aₙ: authored or not, that is what they get.
  for (const rules of [
    { mode: 'ruleBridge' },
    { mode: 'fullBridge', studentActions: ['buildSequenceTable', 'writeExplicit'] },
    { mode: 'fullBridge', studentActions: ['buildSequenceTable', 'writeRecursive'] },
    { mode: 'fullBridge', studentActions: WITH_RULES },
  ]) {
    assert.equal(sequenceWritesRules(withNotation(rules)), true);
    assert.equal(shownSequenceNotation(withNotation(rules)), 'a_n', JSON.stringify(rules));
  }
});

/* ---------------------------------------------------------- the screens */

test('TL39: Build the Sequence Model writes the table, the directions and the labels in f(n), and not in aₙ', async () => {
  const { markup, words } = await screen(withNotation({ mode: 'fullBridge', studentActions: TABLE_AND_GRAPH, displayCount: 6 }));
  assert.match(words, /Output f\(n\)/);
  assert.match(words, /Each sequence value f\(n\) is the output paired with that input/);
  assert.match(words, /Build the table so the term number n is the input and f\(n\) is the output/);
  assert.match(words, /Plot the ordered pairs \(n, f\(n\)\) as separate discrete points/);
  // What a screen reader says for each box.
  const labels = [...markup.matchAll(/aria-label="Sequence output ([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(labels, ['f(1)', 'f(2)', 'f(3)', 'f(4)', 'f(5)', 'f(6)']);
  assert.doesNotMatch(words, A_NOTATION, 'no aₙ anywhere on the screen');
  assert.doesNotMatch(markup, A_IN_MARKUP, 'nor in what it is built from');
});

test('TL39: the default Build the Sequence Model still says aₙ, a1…a6', async () => {
  const { markup, words } = await screen(question({ mode: 'fullBridge', studentActions: TABLE_AND_GRAPH, displayCount: 6 }));
  assert.match(words, /Output aₙ/);
  assert.match(words, /Each sequence value aₙ is the output paired with that input/);
  assert.deepEqual([...markup.matchAll(/aria-label="Sequence output ([^"]+)"/g)].map((match) => match[1]), ['a1', 'a2', 'a3', 'a4', 'a5', 'a6']);
  assert.doesNotMatch(words, /f\(/);
});

test('TL39: where a rule is typed the screen stays aₙ whatever was authored', async () => {
  for (const asked of [
    withNotation({ mode: 'fullBridge', studentActions: WITH_RULES, displayCount: 6, targetN: 36 }),
    withNotation({ mode: 'ruleBridge' }),
  ]) {
    const { markup, words } = await screen(asked);
    assert.match(words, /aₙ =/, `${asked.mode}: the rule boxes read aₙ`);
    assert.match(markup, /placeholder="Use aₙ₋₁ in your rule"/, `${asked.mode}: and the recursive rule's box asks for aₙ₋₁`);
    assert.doesNotMatch(words, /f\(n\)|f\(1\)|f\(6\)/, `${asked.mode}: no f(n) beside a box that reads aₙ`);
  }
});

test('TL39: Analyze, Missing term and Finite sum write f(n) too', async () => {
  const analyze = await screen(withNotation({ mode: 'analyze', targetN: 8, displayCount: 5 }));
  assert.match(analyze.words, /n 1 2 3 4 5 f\(n\) -7 -3 1 5 9/, 'the table row is f(n)');
  assert.match(analyze.words, /f\(8\)/, 'and the term asked for is f(8)');
  assert.doesNotMatch(analyze.words, A_NOTATION);
  assert.doesNotMatch(analyze.markup, A_IN_MARKUP);

  const gap = await screen(withNotation({ mode: 'missingTerm', missingIndex: 4, sequence: GEOMETRIC }));
  assert.match(gap.words, /f\(1\).*f\(2\).*f\(3\)/, 'the chips are f(1), f(2), f(3)…');
  assert.match(gap.words, /Missing value f\(4\)/);
  assert.doesNotMatch(gap.words, A_NOTATION);
  assert.doesNotMatch(gap.markup, A_IN_MARKUP);

  const sum = await screen(withNotation({ mode: 'partialSum', sumN: 6 }));
  // (The text helper puts a space where a subscript's tag was: "S 6".)
  assert.match(sum.words, /S 6 = f\(1\) \+ f\(2\) \+ ··· \+ f\(6\)/);
  assert.match(sum.words, /Last included term f\(6\)/);
  assert.doesNotMatch(sum.words, A_NOTATION);
  assert.doesNotMatch(sum.markup, A_IN_MARKUP);

  // The default is what it was.
  const plain = await screen(question({ mode: 'partialSum', sumN: 6 }));
  assert.match(plain.words, /S 6 = a₁ \+ a₂ \+ ··· \+ a 6/);
  assert.match(plain.words, /Last included term a 6/);
  assert.doesNotMatch(plain.words, /f\(/);
});

/* --------------------------------------------------- feedback and review */

test('TL39: the feedback after a wrong check speaks f(n) when the question does, and aₙ otherwise', () => {
  const words = sequenceWords(withNotation({ mode: 'fullBridge', studentActions: TABLE_AND_GRAPH }));
  const wrongTable = { parts: [{ id: 'table', isCorrect: false }, { id: 'plot', isCorrect: false }], work: { tableValues: ['-7', '-3'], plottedPoints: [] }, spec: ARITHMETIC };
  const wrongPlot = { parts: [{ id: 'table', isCorrect: true }, { id: 'plot', isCorrect: false }], work: {}, spec: ARITHMETIC };
  const wrongTerm = { parts: [{ id: 'term', isCorrect: false }], work: {}, spec: ARITHMETIC, targetN: 36 };
  const wrongRules = { parts: [{ id: 'explicit-rule', isCorrect: false }, { id: 'recursive-rule', isCorrect: false }], work: {}, spec: ARITHMETIC };
  for (const miss of [wrongTable, wrongPlot, wrongTerm, wrongRules]) {
    const said = fullBridgeMissMessage({ ...miss, words });
    assert.doesNotMatch(said, A_NOTATION, said);
    assert.match(said, /f\(/, said);
    // ...and with no words given it is the message it always was.
    assert.match(fullBridgeMissMessage(miss), A_NOTATION);
  }
  assert.match(fullBridgeMissMessage({ ...wrongTable, words }), /start from f\(1\)/);
  assert.match(fullBridgeMissMessage({ ...wrongPlot, words }), /Plot each pair \(n, f\(n\)\) from it as its own point, with n across and f\(n\) up/);
  assert.match(fullBridgeMissMessage({ ...wrongTerm, words }), /Find f\(36\) by putting n = 36/);
});

test('TL39: the solution review shows the working in f(n) when the question does', () => {
  const asked = [
    withNotation({ mode: 'fullBridge', studentActions: [...TABLE_AND_GRAPH, 'findSequenceTerm'], displayCount: 6, targetN: 20 }),
    withNotation({ mode: 'analyze', targetN: 8 }),
    withNotation({ mode: 'missingTerm', missingIndex: 4 }),
    withNotation({ mode: 'missingTerm', missingIndex: 1 }),
    withNotation({ mode: 'partialSum', sumN: 6 }),
    withNotation({ mode: 'partialSum', sumN: 6, sequence: GEOMETRIC }),
    withNotation({ mode: 'compare', left: ARITHMETIC, right: GEOMETRIC, compareN: 7 }),
  ];
  for (const one of asked) {
    const said = JSON.stringify(buildToolSolutionReviewModel(one));
    assert.doesNotMatch(said, A_NOTATION, `${one.mode}: ${said}`);
    assert.match(said, /f\(/, `${one.mode}: it does say f(n)`);
    // The same question with no notation is the review it always was.
    const unlabelled = { ...one };
    delete unlabelled.notation;
    assert.match(JSON.stringify(buildToolSolutionReviewModel(unlabelled)), A_NOTATION, `${one.mode}: aₙ by default`);
  }
  const build = buildToolSolutionReviewModel(asked[0]);
  assert.ok(build.items.some((item) => item.label === 'Table of (n, f(n))'));
  assert.ok(build.steps.some((step) => /Use f\(n\) = f\(1\) \+ \(n − 1\)d with f\(1\) = −7 and d = 4: f\(20\) = /.test(step)), build.steps.join(' | '));
  // Where a rule is typed, the review keeps aₙ.
  const rules = JSON.stringify(buildToolSolutionReviewModel(withNotation({ mode: 'fullBridge', studentActions: WITH_RULES, displayCount: 6, targetN: 20 })));
  assert.match(rules, /aₙ = aₙ₋₁ \+ 4/);
  assert.doesNotMatch(rules, /f\(/);
});

/* --------------------------------------------- authoring and the schema */

test('TL39: the authoring check accepts the notation where no rule is typed, and refuses it where one is', () => {
  const errorsOf = (extra) => validateToolQuestion({ toolId: 'sequenceExplorer', type: 'sequenceExplorer', sequence: ARITHMETIC, displayCount: 5, ...extra }).errors;
  const notationErrors = (extra) => errorsOf(extra).filter((message) => /notation/.test(message));
  for (const fine of [
    { mode: 'fullBridge', studentActions: TABLE_AND_GRAPH, notation: 'f(n)' },
    { mode: 'fullBridge', studentActions: [...TABLE_AND_GRAPH, 'findSequenceTerm'], targetN: 20, notation: 'f(n)' },
    { mode: 'analyze', targetN: 8, displayCount: 5, notation: 'f(n)' },
    { mode: 'missingTerm', missingIndex: 4, notation: 'f(n)' },
    { mode: 'partialSum', sumN: 6, notation: 'f(n)' },
    { mode: 'ruleBridge', notation: 'a_n' },
    { mode: 'fullBridge', studentActions: WITH_RULES, targetN: 20, notation: 'a_n' },
    { mode: 'fullBridge', studentActions: TABLE_AND_GRAPH },
    { mode: 'fullBridge', studentActions: TABLE_AND_GRAPH, notation: null },
  ]) assert.deepEqual(notationErrors(fine), [], JSON.stringify(fine));
  for (const refused of [
    { mode: 'ruleBridge', notation: 'f(n)' },
    { mode: 'fullBridge', studentActions: ['buildSequenceTable', 'writeExplicit'], notation: 'f(n)' },
    { mode: 'fullBridge', studentActions: ['buildSequenceTable', 'writeRecursive'], notation: 'f(n)' },
    { mode: 'fullBridge', studentActions: WITH_RULES, targetN: 20, notation: 'f(n)' },
  ]) {
    const errors = notationErrors(refused);
    assert.equal(errors.length, 1, JSON.stringify(refused));
    assert.match(errors[0], /writeExplicit \/ writeRecursive/, 'it says what to drop');
  }
  for (const unknown of ['g(n)', 'F(n)', 'aₙ', 'f', '', 5]) {
    assert.equal(notationErrors({ mode: 'analyze', targetN: 8, displayCount: 5, notation: unknown }).length, 1, `${String(unknown)} is neither notation`);
  }
});

test('TL39: authored notation reaches the question the student gets', () => {
  const compile = (extra) => compileAuthoringIntentV5({
    schemaVersion: 5,
    assignment: { title: 'Sequence notation', courseId: 'algebra1' },
    sections: [{ role: 'practice', questions: [{
      standard: 'A.12C', prompt: 'A sequence is given in function form by f(1) = −7 and f(n) = f(n − 1) + 4 for n ≥ 2. Fill the table.',
      studentActions: TABLE_AND_GRAPH, sequence: ARITHMETIC, displayCount: 6, ...extra,
    }] }],
  }).package.sections[0].questions[0];
  assert.equal(compile({ notation: 'f(n)' }).notation, 'f(n)');
  assert.equal(compile({}).notation, undefined, 'unauthored stays unauthored: the default is the screen\'s');
});

/* ------------------------------------------------------ no verdict moves */

test('TL39: no verdict depends on the notation', () => {
  const rows = (spec, count) => generateSequence(spec, count);
  const arithmeticTerms = rows(ARITHMETIC, 6).map((row) => row.value);
  const cases = [
    [{ mode: 'fullBridge', studentActions: TABLE_AND_GRAPH, displayCount: 6 }, [
      { tableValues: arithmeticTerms.map(String), plottedPoints: arithmeticTerms.map((value, index) => [index + 1, value]), kindAnswer: 'arithmetic', changeAnswer: '4' },
      { tableValues: arithmeticTerms.map((value, index) => String(index === 2 ? value + 1 : value)), plottedPoints: arithmeticTerms.map((value, index) => [index + 1, value]), kindAnswer: 'arithmetic', changeAnswer: '4' },
      { tableValues: arithmeticTerms.map(String), plottedPoints: arithmeticTerms.map((value, index) => [index, value]), kindAnswer: 'arithmetic', changeAnswer: '4' },
      { tableValues: arithmeticTerms.map(String), plottedPoints: [], kindAnswer: 'geometric', changeAnswer: '4' },
      { tableValues: [], plottedPoints: [], kindAnswer: '', changeAnswer: '' },
    ]],
    [{ mode: 'analyze', targetN: 8, displayCount: 5 }, [
      { kindAnswer: 'arithmetic', changeAnswer: '4', termAnswer: '21' },
      { kindAnswer: 'arithmetic', changeAnswer: '4', termAnswer: '22' },
      { kindAnswer: 'geometric', changeAnswer: '2', termAnswer: '21' },
    ]],
    [{ mode: 'missingTerm', missingIndex: 4 }, [
      { termAnswer: '5', kindAnswer: 'arithmetic' }, { termAnswer: '6', kindAnswer: 'arithmetic' }, { termAnswer: '5', kindAnswer: 'geometric' },
    ]],
    [{ mode: 'partialSum', sumN: 6 }, [
      { lastTerm: '13', sumAnswer: '18' }, { lastTerm: '13', sumAnswer: '19' }, { lastTerm: '12', sumAnswer: '18' },
    ]],
  ];
  let graded = 0;
  for (const [shape, works] of cases) {
    for (const work of works) {
      const plain = question(shape);
      const labelled = withNotation(shape);
      assert.deepEqual(sequenceExplorerGrader.grade(labelled, work), sequenceExplorerGrader.grade(plain, work), `${shape.mode}: ${JSON.stringify(work)}`);
      graded += 1;
    }
  }
  assert.equal(graded, 14);
  // Not vacuous: these include answers that are right and answers that are wrong.
  const verdicts = new Set(cases.flatMap(([shape, works]) => works.map((work) => sequenceExplorerGrader.grade(withNotation(shape), work).isCorrect)));
  assert.deepEqual([...verdicts].sort(), [false, true]);
});
