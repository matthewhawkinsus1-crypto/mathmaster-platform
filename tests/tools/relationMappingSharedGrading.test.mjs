/*
 * relationMapping — SERVER-AUTHORITATIVE GRADING PARITY.
 *
 * The Mapping Diagram's Check used to compute its verdict inline in
 * RelationMapping.jsx and hand the platform only the result. It now asks the
 * shared grader (functions/shared/serverGrading/tools/relationMapping.mjs),
 * the same pure function the server runs on the raw work. These tests pin:
 *
 *   - the verdict for every part the lab can ask for (plot, mapping, domain,
 *     range, isFunction, authored analysis fields), with the lab's own
 *     defaults, set semantics and score formula;
 *   - that the browser path (gradeToolCheck) and the server path
 *     (gradeServerResponse over the serialized tool response) agree exactly;
 *   - that tampered or malformed work never crashes and never earns credit;
 *   - that the component is wired to the grader and carries no verdict of its
 *     own.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import relationMappingGrader, {
  FUNCTION_STATUS_CHOICES,
  parseList,
  relationAnalysisFieldsOf,
  relationFieldWork,
} from '../../functions/shared/serverGrading/tools/relationMapping.mjs';
import relationMappingDeclaration from '../../functions/shared/serverGrading/declarations/relationMapping.mjs';
import { GRADING_MANIFEST } from '../../functions/shared/serverGrading/gradingManifest.mjs';
import { GRADING_AUTHORITY } from '../../functions/shared/serverGrading/gradingAuthority.mjs';
import { declaredGradingSupport } from '../../functions/shared/serverGrading/gradingSupport.mjs';
import { resolveToolMode } from '../../functions/shared/serverGrading/toolGraderDefinition.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { TOOL_GRADERS } from '../../functions/shared/serverGrading/toolGraders.mjs';
import { TOOL_RESPONSE_LIMITS, boundToolWork, canonicalToolWorkJson } from '../../functions/shared/serverGrading/toolResponseContract.mjs';
import { buildPrivateToolGrading, gradePathResponse } from '../../functions/shared/pathToolContracts.mjs';
import { FUNCTION_CHOICES } from '../../functions/shared/relationFunctionChoice.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { executableSource, region } from '../platform/helpers/sourceContract.mjs';

const COMPONENT = readFileSync(new URL('../../src/tools/relationMapping/RelationMapping.jsx', import.meta.url), 'utf8');

/*
 * The work exactly as RelationMapping.jsx builds it from its state (the
 * source-contract test below pins that the component builds these keys).
 */
const labWork = (question, {
  plottedPoints = [],
  arrows = [],
  domainAnswer = '',
  rangeAnswer = '',
  functionAnswer = '',
  fieldAnswers = {},
} = {}) => ({
  plottedPoints,
  arrows,
  domainText: domainAnswer,
  rangeText: rangeAnswer,
  domain: parseList(domainAnswer),
  range: parseList(rangeAnswer),
  isFunction: functionAnswer,
  fields: relationFieldWork(relationAnalysisFieldsOf(question.answerFields), fieldAnswers),
});

/** Grade through the browser path and the server path; they must agree exactly. */
const bothPaths = (question, work) => {
  const browser = gradeToolCheck(relationMappingGrader, question, work);
  assert.ok(browser.toolResponse, 'the browser path always produces the tool response it would send');
  const server = gradeServerResponse({ question, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
  assert.equal(server.graded, browser.graded, 'graded');
  assert.equal(server.isCorrect, browser.isCorrect, 'isCorrect');
  assert.equal(server.isComplete, browser.isComplete, 'isComplete');
  assert.equal(server.score, browser.score, 'score');
  assert.deepEqual(server.parts, browser.parts, 'parts');
  return { browser, server };
};

const partIds = (result) => result.parts.map((part) => part.id);
const partVerdicts = (result) => Object.fromEntries(result.parts.map((part) => [part.id, part.isCorrect]));

// A function: every input has one output.
const FUNCTION_Q = Object.freeze({
  questionId: 'rm-function',
  type: 'relationMapping',
  prompt: 'Build the mapping diagram for the relation.',
  pairs: [{ x: -2, y: 3 }, { x: 1, y: 2 }, { x: 3, y: -1 }],
  ask: ['mapping', 'domain', 'range', 'isFunction'],
});
const FUNCTION_CORRECT = {
  arrows: [[3, -1], [-2, 3], [1, 2]],
  domainAnswer: '3, -2, 1',
  rangeAnswer: '-1, 2, 3',
  functionAnswer: FUNCTION_STATUS_CHOICES.YES_DEFINITION,
};

// Not a function: input 1 goes to 2 and to 3. Stored as legacy [x, y] arrays.
const NON_FUNCTION_Q = Object.freeze({
  questionId: 'rm-nonfunction',
  type: 'relationMapping',
  pairs: [[1, 2], [1, 3], [2, 4]],
  ask: ['mapping', 'isFunction'],
});

const PLOT_Q = Object.freeze({
  questionId: 'rm-plot',
  type: 'relationMapping',
  pairs: [{ x: 0, y: 1 }, { x: 2, y: -1 }, { x: -3, y: 4 }],
  ask: ['plot', 'mapping'],
  plotEntryMode: 'clickOrType',
});

// One field id (`feedback`) deliberately collides with a key the response
// contract strips from work; the array-shaped `fields` must protect it.
const FIELDS_Q = Object.freeze({
  questionId: 'rm-fields',
  type: 'relationMapping',
  pairs: [{ x: -2, y: 3 }, { x: 1, y: 2 }, { x: 3, y: -1 }],
  ask: ['mapping'],
  answerFields: [
    { id: 'kind', label: 'Discrete or continuous?', type: 'choice', options: ['discrete', 'continuous'], answer: 'discrete' },
    { id: 'inputs', label: 'The set of inputs', answer: '{-2, 1, 3}' },
    { id: 'feedback', label: 'How many ordered pairs?', answer: '3' },
    { label: 'A field with no id is never shown, so it is never graded', answer: 'x' },
  ],
});
const FIELDS_ARROWS = [[-2, 3], [1, 2], [3, -1]];

// --- The declaration ------------------------------------------------------------

test('relationMapping is declared shared-server with one mode, and the manifest and graders agree', () => {
  assert.equal(GRADING_MANIFEST.relationMapping, relationMappingDeclaration);
  assert.equal(relationMappingDeclaration.contractVersion, 1);
  assert.deepEqual(Object.keys(relationMappingDeclaration.modes), ['default']);
  assert.equal(relationMappingDeclaration.modes.default.authority, GRADING_AUTHORITY.SHARED_SERVER);
  assert.equal(relationMappingDeclaration.authority, GRADING_AUTHORITY.SHARED_SERVER);
  assert.equal(TOOL_GRADERS.relationMapping, relationMappingGrader);
  assert.equal(relationMappingGrader.toolId, 'relationMapping');
  assert.equal(typeof relationMappingGrader.modeGraders.default, 'function');
});

test('mode resolution matches the component: one view for every question, whatever `mode` says', () => {
  // RelationMapping.jsx never reads `questionData.mode`; `ask` alone decides
  // which panels appear. So no mode value can route it anywhere else.
  const executable = executableSource(COMPONENT);
  assert.doesNotMatch(executable, /questionData\??\.mode\b|questionData\[['"]mode['"]\]/);
  for (const mode of [undefined, '', 'default', 'mapping', 'plot', 'features', 'notAMode']) {
    const question = { ...FUNCTION_Q, ...(mode === undefined ? {} : { mode }) };
    assert.equal(resolveToolMode(relationMappingDeclaration, question), 'default', `mode ${mode}`);
    const support = declaredGradingSupport(question);
    assert.equal(support.supported, true, `mode ${mode}`);
    assert.equal(support.mode, 'default');
    assert.equal(support.authority, GRADING_AUTHORITY.SHARED_SERVER);
  }
  // Addressed by toolId too.
  assert.equal(declaredGradingSupport({ toolId: 'relationMapping', pairs: FUNCTION_Q.pairs }).supported, true);
});

// --- Fully correct ----------------------------------------------------------------

test('a fully correct mapping, domain, range and function decision earns full credit on both paths', () => {
  const work = labWork(FUNCTION_Q, FUNCTION_CORRECT);
  const { browser } = bothPaths(FUNCTION_Q, work);
  assert.equal(browser.graded, true);
  assert.equal(browser.isCorrect, true);
  assert.equal(browser.isComplete, true);
  assert.equal(browser.score, 1);
  assert.deepEqual(partIds(browser), ['mapping', 'domain', 'range', 'isFunction']);
});

test('a non-function is correct only with the "an input has more than one output" choice', () => {
  const arrows = [[1, 3], [2, 4], [1, 2]];
  const right = bothPaths(NON_FUNCTION_Q, labWork(NON_FUNCTION_Q, { arrows, functionAnswer: FUNCTION_STATUS_CHOICES.NO_INPUT_REPEAT })).browser;
  assert.equal(right.isCorrect, true);
  assert.equal(right.score, 1);
  // The distractor that names repeated OUTPUTS is wrong even though it says "No".
  for (const distractor of [FUNCTION_STATUS_CHOICES.NO_OUTPUT_REPEAT, FUNCTION_STATUS_CHOICES.YES_DEFINITION, FUNCTION_STATUS_CHOICES.YES_OUTPUT_RULE]) {
    const wrong = bothPaths(NON_FUNCTION_Q, labWork(NON_FUNCTION_Q, { arrows, functionAnswer: distractor })).browser;
    assert.equal(wrong.isCorrect, false, distractor);
    assert.equal(wrong.score, 0.5, distractor);
    assert.deepEqual(partVerdicts(wrong), { mapping: true, isFunction: false });
  }
});

test('the "every output used once" rationale never earns credit for a function, even one whose outputs are distinct', () => {
  const wrong = bothPaths(FUNCTION_Q, labWork(FUNCTION_Q, { ...FUNCTION_CORRECT, functionAnswer: FUNCTION_STATUS_CHOICES.YES_OUTPUT_RULE })).browser;
  assert.equal(wrong.isCorrect, false);
  assert.equal(wrong.score, 0.75);
  assert.equal(partVerdicts(wrong).isFunction, false);
});

test('plotted points are graded as a set, in any order', () => {
  const arrows = [[0, 1], [2, -1], [-3, 4]];
  const correct = bothPaths(PLOT_Q, labWork(PLOT_Q, { plottedPoints: [[-3, 4], [0, 1], [2, -1]], arrows })).browser;
  assert.equal(correct.isCorrect, true);
  assert.deepEqual(partIds(correct), ['plot', 'mapping']);

  const extra = bothPaths(PLOT_Q, labWork(PLOT_Q, { plottedPoints: [[-3, 4], [0, 1], [2, -1], [1, 1]], arrows })).browser;
  assert.deepEqual(partVerdicts(extra), { plot: false, mapping: true });
  assert.equal(extra.score, 0.5);

  const missing = bothPaths(PLOT_Q, labWork(PLOT_Q, { plottedPoints: [[0, 1], [2, -1]], arrows })).browser;
  assert.deepEqual(partVerdicts(missing), { plot: false, mapping: true });

  const swapped = bothPaths(PLOT_Q, labWork(PLOT_Q, { plottedPoints: [[1, 0], [2, -1], [-3, 4]], arrows })).browser;
  assert.equal(partVerdicts(swapped).plot, false, '(1, 0) is not (0, 1)');
});

test('plotted points match to eight decimal places; a half-unit or 1e-6 miss is a different point', () => {
  const question = { type: 'relationMapping', pairs: [[0.5, 1], [2, -1.25]], ask: ['plot'] };
  const grade = (plottedPoints) => bothPaths(question, labWork(question, { plottedPoints })).browser.isCorrect;
  assert.equal(grade([[2, -1.25], [0.5, 1]]), true);
  // The lab snaps with toFixed(8); float noise below that is the same point.
  assert.equal(grade([[0.5 + 1e-10, 1], [2, -1.25 - 1e-10]]), true);
  assert.equal(grade([[1, 1], [2, -1.25]]), false, '(1, 1) is not (0.5, 1)');
  assert.equal(grade([[0.5, 1], [2, -1]]), false, '(2, -1) is not (2, -1.25)');
  assert.equal(grade([[0.5 + 1e-6, 1], [2, -1.25]]), false, 'a millionth off is a different point');
});

test('typed domain and range compare within 1e-9, and tokens that are not numbers are dropped', () => {
  // 0.1 + 0.2 is how a generated or computed relation stores 0.3.
  const question = { type: 'relationMapping', pairs: [{ x: 0.1 + 0.2, y: 2 }, { x: -1, y: 0.5 }], ask: ['domain', 'range'] };
  const grade = (domainAnswer, rangeAnswer = '2, 0.5') => partVerdicts(bothPaths(question, labWork(question, { domainAnswer, rangeAnswer })).browser);
  assert.deepEqual(grade('0.3, -1'), { domain: true, range: true });
  assert.deepEqual(grade('-1, 0.3005'), { domain: false, range: true }, 'a typed value 5e-4 away is wrong');
  assert.deepEqual(grade('-1, 0.3, abc', '2, .5, ?'), { domain: true, range: true }, 'the lab ignores a token that is not a number');
  assert.deepEqual(grade('-1'), { domain: false, range: true });
});

test('functionhood tolerates float noise between outputs but not a genuine second output', () => {
  const noise = { type: 'relationMapping', pairs: [[1, 2], [1, 2 + 1e-12], [3, 4]], ask: ['isFunction'] };
  assert.equal(bothPaths(noise, labWork(noise, { functionAnswer: FUNCTION_STATUS_CHOICES.YES_DEFINITION })).browser.isCorrect, true);
  // 2 and 2.001 are two outputs, however close.
  const close = { type: 'relationMapping', pairs: [[1, 2], [1, 2.001], [3, 4]], ask: ['isFunction'] };
  assert.equal(bothPaths(close, labWork(close, { functionAnswer: FUNCTION_STATUS_CHOICES.NO_INPUT_REPEAT })).browser.isCorrect, true);
  assert.equal(bothPaths(close, labWork(close, { functionAnswer: FUNCTION_STATUS_CHOICES.YES_DEFINITION })).browser.isCorrect, false);
});

test('a pair the author listed twice is one arrow (behaviour change: it used to be unreachable)', () => {
  // Before: the check wanted two identical arrows, which the lab cannot draw (a
  // second click removes the first), so this mapping could never be right.
  const question = { type: 'relationMapping', pairs: [{ x: 1, y: 2 }, { x: '1', y: '2' }, [3, 4]], ask: ['mapping', 'plot'] };
  const right = bothPaths(question, labWork(question, { arrows: [[3, 4], [1, 2]], plottedPoints: [[1, 2], [3, 4]] })).browser;
  assert.deepEqual(partVerdicts(right), { plot: true, mapping: true });
  assert.equal(right.isCorrect, true);
  // A response that repeats an arrow is not one the lab produces, and is wrong.
  assert.equal(partVerdicts(bothPaths(question, labWork(question, { arrows: [[1, 2], [1, 2], [3, 4]] })).browser).mapping, false);
  // Missing the arrow for the repeated pair is still wrong.
  assert.equal(partVerdicts(bothPaths(question, labWork(question, { arrows: [[3, 4]] })).browser).mapping, false);
});

test('authored analysis fields are graded by their answer key, not by the order or count of choices', () => {
  const answers = { kind: 'discrete', inputs: '{3, -2, 1}', feedback: '3' };
  const work = labWork(FIELDS_Q, { arrows: FIELDS_ARROWS, fieldAnswers: answers });
  assert.deepEqual(boundToolWork(work).dropped, [], 'a field id that matches a stripped key survives as array data');
  const correct = bothPaths(FIELDS_Q, work).browser;
  assert.equal(correct.isCorrect, true);
  assert.deepEqual(partIds(correct), ['mapping', 'field:kind', 'field:inputs', 'field:feedback']);

  // The same answers against a question whose choice list was trimmed or reordered.
  const trimmed = {
    ...FIELDS_Q,
    answerFields: FIELDS_Q.answerFields.map((field) => (field.id === 'kind' ? { ...field, options: ['continuous', 'discrete'].reverse().slice(0, 1) } : field)),
  };
  assert.equal(bothPaths(trimmed, labWork(trimmed, { arrows: FIELDS_ARROWS, fieldAnswers: answers })).browser.isCorrect, true);

  const oneWrong = bothPaths(FIELDS_Q, labWork(FIELDS_Q, { arrows: FIELDS_ARROWS, fieldAnswers: { ...answers, kind: 'continuous' } })).browser;
  assert.equal(oneWrong.isCorrect, false);
  assert.equal(oneWrong.score, 0.75);
  assert.equal(partVerdicts(oneWrong)['field:kind'], false);
});

test('a repeated field id is one check, judged by the last field with that id (as the lab\'s checks object did)', () => {
  const question = {
    ...FIELDS_Q,
    answerFields: [
      { id: 'kind', answer: 'discrete' },
      { id: 'other', answer: '7' },
      { id: 'kind', answer: 'continuous' },
    ],
  };
  const result = bothPaths(question, labWork(question, { arrows: FIELDS_ARROWS, fieldAnswers: { kind: 'continuous', other: '7' } })).browser;
  assert.deepEqual(partIds(result), ['mapping', 'field:kind', 'field:other']);
  assert.equal(result.isCorrect, true);
});

// --- Incorrect and partial ----------------------------------------------------------

test('incorrect work scores the share of parts that are right', () => {
  const work = labWork(FUNCTION_Q, {
    arrows: [[-2, 3], [1, -1], [3, -1]],
    domainAnswer: '-2, 1',
    rangeAnswer: '3, 2, -1',
    functionAnswer: FUNCTION_STATUS_CHOICES.YES_OUTPUT_RULE,
  });
  const { browser } = bothPaths(FUNCTION_Q, work);
  assert.equal(browser.isCorrect, false);
  assert.equal(browser.isComplete, true);
  assert.equal(browser.score, 0.25);
  assert.deepEqual(partVerdicts(browser), { mapping: false, domain: false, range: true, isFunction: false });
});

test('partially complete work is graded (blank parts are incorrect) and reported incomplete', () => {
  const { browser } = bothPaths(FUNCTION_Q, labWork(FUNCTION_Q, { arrows: FUNCTION_CORRECT.arrows }));
  assert.equal(browser.graded, true);
  assert.equal(browser.isComplete, false, 'a deadline must not auto-submit this');
  assert.equal(browser.isCorrect, false);
  assert.equal(browser.score, 0.25);
  assert.deepEqual(
    browser.parts.map((part) => [part.id, part.isComplete, part.isCorrect]),
    [['mapping', true, true], ['domain', false, false], ['range', false, false], ['isFunction', false, false]],
  );

  // Complete only when every asked part has an answer.
  const allButOne = bothPaths(FUNCTION_Q, labWork(FUNCTION_Q, { ...FUNCTION_CORRECT, functionAnswer: '' })).browser;
  assert.equal(allButOne.isComplete, false);
  assert.equal(allButOne.score, 0.75);

  // Each part answers for itself: no point, no arrow, a blank or whitespace-only
  // box, no choice and an empty field are all "not yet answered".
  const everything = { ...PLOT_Q, ask: ['plot', 'mapping', 'domain', 'range', 'isFunction'], answerFields: [FIELDS_Q.answerFields[1]] };
  const completeness = (state) => Object.fromEntries(
    bothPaths(everything, labWork(everything, state)).browser.parts.map((part) => [part.id, part.isComplete]),
  );
  assert.deepEqual(completeness({ domainAnswer: '   ', rangeAnswer: '\t' }), {
    plot: false, mapping: false, domain: false, range: false, isFunction: false, 'field:inputs': false,
  });
  assert.deepEqual(completeness({
    plottedPoints: [[5, 5]], arrows: [[0, 1]], domainAnswer: '9', rangeAnswer: '9',
    functionAnswer: FUNCTION_STATUS_CHOICES.NO_OUTPUT_REPEAT, fieldAnswers: { inputs: 'no idea' },
  }), {
    plot: true, mapping: true, domain: true, range: true, isFunction: true, 'field:inputs': true,
  }, 'complete means answered, not right');

  const missingArrow = bothPaths(FUNCTION_Q, labWork(FUNCTION_Q, { ...FUNCTION_CORRECT, arrows: [[-2, 3], [1, 2]] })).browser;
  assert.equal(missingArrow.isComplete, true);
  assert.equal(partVerdicts(missingArrow).mapping, false, 'two of three arrows is not the relation');

  const extraArrow = bothPaths(FUNCTION_Q, labWork(FUNCTION_Q, { ...FUNCTION_CORRECT, arrows: [...FUNCTION_CORRECT.arrows, [1, 3]] })).browser;
  assert.equal(partVerdicts(extraArrow).mapping, false, 'an extra arrow is not the relation');
});

// --- Equivalent forms -------------------------------------------------------------

test('equivalent typed lists are accepted: any order, repeats, semicolons, spacing and decimal spellings', () => {
  for (const [domainAnswer, rangeAnswer] of [
    ['1, 3, -2', '2, -1, 3'],
    ['1; 3;-2; 1', '3 ,3, 2 , -1'],
    ['-2.0, 1.00, 3', '-1, 2.0, 3e0'],
    ['-2,1,3,', ' 3 , 2 , -1 '],
  ]) {
    const result = bothPaths(FUNCTION_Q, labWork(FUNCTION_Q, { ...FUNCTION_CORRECT, domainAnswer, rangeAnswer })).browser;
    assert.equal(result.isCorrect, true, `${domainAnswer} | ${rangeAnswer}`);
  }
});

test('the relation may be authored as {x, y} objects, [x, y] arrays or numeric strings', () => {
  const variants = [
    FUNCTION_Q.pairs,
    FUNCTION_Q.pairs.map(({ x, y }) => [x, y]),
    FUNCTION_Q.pairs.map(({ x, y }) => ({ x: String(x), y: String(y) })),
  ];
  for (const pairs of variants) {
    const question = { ...FUNCTION_Q, pairs };
    assert.equal(bothPaths(question, labWork(question, FUNCTION_CORRECT)).browser.isCorrect, true, JSON.stringify(pairs));
  }
});

// --- Unauthored defaults ------------------------------------------------------------

test('an unauthored `ask` means mapping, domain and range', () => {
  const question = { questionId: 'rm-default', type: 'relationMapping', pairs: [[0, 0], [1, 1]] };
  const result = bothPaths(question, labWork(question, { arrows: [[1, 1], [0, 0]], domainAnswer: '0, 1', rangeAnswer: '1, 0' })).browser;
  assert.deepEqual(partIds(result), ['mapping', 'domain', 'range']);
  assert.equal(result.isCorrect, true);
  // A non-array `ask` is "unauthored" too.
  const stringAsk = { ...question, ask: 'mapping' };
  assert.deepEqual(partIds(bothPaths(stringAsk, labWork(stringAsk)).browser), ['mapping', 'domain', 'range']);
});

test('an authored empty `ask` with no fields asks nothing, which the lab\'s Check marks correct', () => {
  const question = { ...FUNCTION_Q, ask: [] };
  const result = bothPaths(question, labWork(question)).browser;
  assert.equal(result.graded, true);
  assert.deepEqual(result.parts, []);
  assert.equal(result.isCorrect, true);
  assert.equal(result.isComplete, true);
  assert.equal(result.score, 1);
});

test('a relation with no usable pairs has no verdict (the lab renders "Nothing to map" with no Check)', () => {
  for (const pairs of [undefined, [], [{ x: 'a', y: 1 }, [undefined, 2], [Infinity, 1], { y: 3 }]]) {
    const question = { type: 'relationMapping', ask: ['mapping'], ...(pairs === undefined ? {} : { pairs }) };
    const { browser, server } = bothPaths(question, labWork(question, { arrows: [[1, 1]] }));
    assert.equal(browser.graded, false);
    assert.equal(server.reason, 'relation-has-no-pairs');
    assert.equal(browser.isCorrect, false);
  }
  assert.match(COMPONENT, /if \(!pairs\.length\) \{\s*return \(/, 'the lab still refuses to render a Check for an empty relation');
});

// --- Malformed and tampered work ------------------------------------------------------

test('verdict-looking keys injected into the work are stripped and change nothing', () => {
  const clean = labWork(FUNCTION_Q, { ...FUNCTION_CORRECT, functionAnswer: FUNCTION_STATUS_CHOICES.YES_OUTPUT_RULE });
  const baseline = bothPaths(FUNCTION_Q, clean).browser;
  const tampered = {
    ...clean,
    isCorrect: true,
    score: 1,
    checks: { mapping: true, domain: true, range: true, isFunction: true },
    expected: { isFunction: FUNCTION_STATUS_CHOICES.YES_OUTPUT_RULE },
    answerKey: FUNCTION_Q.pairs,
    fields: [{ id: 'x', value: 'y', correct: true }],
  };
  assert.deepEqual(boundToolWork(tampered).dropped.sort(), ['answerKey', 'checks', 'correct', 'expected', 'isCorrect', 'score'].sort());
  const result = bothPaths(FUNCTION_Q, tampered).browser;
  assert.equal(result.isCorrect, false);
  assert.equal(result.score, baseline.score);
  assert.deepEqual(result.parts, baseline.parts);
});

test('wrong types and junk entries are graded as wrong, never thrown and never matched by accident', () => {
  const junk = {
    plottedPoints: { 0: [0, 1] },
    arrows: 'abc',
    domainText: { value: '-2, 1, 3' },
    rangeText: ['3', '2', '-1'],
    isFunction: true,
    fields: 'kind=discrete',
  };
  const question = { ...FIELDS_Q, ask: ['plot', 'mapping', 'domain', 'range', 'isFunction'] };
  const { browser } = bothPaths(question, junk);
  assert.equal(browser.graded, true);
  assert.equal(browser.isCorrect, false);
  assert.equal(browser.score, 0);
  assert.ok(browser.parts.every((part) => part.isCorrect === false));

  // Junk entries inside otherwise-correct arrays.
  const arrows = [[-2, 3], [1, 2], { x: 3, y: -1 }];
  assert.equal(partVerdicts(bothPaths(FIELDS_Q, { ...labWork(FIELDS_Q), arrows }).browser).mapping, false);
  const nullArrows = [[-2, 3], [1, 2], null];
  assert.equal(partVerdicts(bothPaths(FIELDS_Q, { ...labWork(FIELDS_Q), arrows: nullArrows }).browser).mapping, false);

  // A null coordinate (what NaN becomes in JSON) is not the origin.
  const origin = { type: 'relationMapping', pairs: [[0, 0], [1, 2]], ask: ['plot'] };
  assert.equal(bothPaths(origin, { plottedPoints: [[0, 0], [1, 2]] }).browser.isCorrect, true);
  assert.equal(bothPaths(origin, { plottedPoints: [[null, null], [1, 2]] }).browser.isCorrect, false);
  assert.equal(bothPaths(origin, { plottedPoints: [[0, 0], [1, 2], 'garbage'] }).browser.isCorrect, false);

  // A field answer is a string the student typed or chose; a number or an
  // array in its place is not read as that answer.
  const fieldsOnly = { ...FIELDS_Q, ask: [] };
  const typedFields = (value) => partVerdicts(bothPaths(fieldsOnly, {
    fields: [{ id: 'kind', value: 'discrete' }, { id: 'inputs', value: '{-2, 1, 3}' }, { id: 'feedback', value }],
  }).browser)['field:feedback'];
  assert.equal(typedFields('3'), true);
  assert.equal(typedFields(3), false);
  assert.equal(typedFields(['3']), false);
});

test('the grader reads nothing a student support can change', () => {
  // A support may translate the prompt or title, trim `choices`, or set
  // presentation flags; the server never sees those. Planted as getters that
  // record a read, on a question that reaches every part of the grader.
  const reads = new Set();
  const question = { ...FIELDS_Q, ask: ['plot', 'mapping', 'domain', 'range', 'isFunction'] };
  for (const key of ['prompt', 'title', 'choices', 'translations', 'supportPresentation', 'supportEntitlements', 'prefillFirstStep', 'visualChunking']) {
    Object.defineProperty(question, key, { enumerable: false, configurable: true, get() { reads.add(key); return undefined; } });
  }
  const result = relationMappingGrader.grade(question, labWork(FIELDS_Q, {
    plottedPoints: [[-2, 3]], arrows: FIELDS_ARROWS, domainAnswer: '1', rangeAnswer: '2',
    functionAnswer: FUNCTION_STATUS_CHOICES.YES_DEFINITION, fieldAnswers: { kind: 'discrete', inputs: '{1}', feedback: '3' },
  }));
  assert.equal(result.graded, true);
  assert.equal(result.parts.length, 8);
  assert.deepEqual([...reads], []);
});

test('non-object and oversize work is not gradable on either path', () => {
  for (const work of [null, undefined, 'mapping', 42, [[-2, 3]]]) {
    const { browser, server } = bothPaths(FUNCTION_Q, work);
    assert.equal(browser.graded, false, JSON.stringify(work));
    assert.equal(server.graded, false);
    assert.equal(browser.isCorrect, false);
  }
  const oversize = {
    ...labWork(FUNCTION_Q, FUNCTION_CORRECT),
    fields: Array.from({ length: 30 }, (_, index) => ({ id: `f${index}`, value: 'x'.repeat(1000) })),
  };
  const { browser, server } = bothPaths(FUNCTION_Q, oversize);
  assert.equal(browser.graded, false);
  assert.equal(browser.reason, 'oversize-response');
  assert.equal(server.reason, 'oversize-response');
});

test('realistic maximal work stays inside the response limits and is graded', () => {
  const pairs = Array.from({ length: 12 }, (_, index) => ({ x: index - 6, y: (index * 7) % 12 - 6 }));
  const question = {
    type: 'relationMapping',
    pairs,
    ask: ['plot', 'mapping', 'domain', 'range', 'isFunction'],
    answerFields: Array.from({ length: 10 }, (_, index) => ({ id: `analysis-${index + 1}`, label: `Analysis ${index + 1}`, answer: 'yes' })),
  };
  const xs = pairs.map(({ x }) => x);
  const ys = pairs.map(({ y }) => y);
  const work = labWork(question, {
    plottedPoints: Array.from({ length: TOOL_RESPONSE_LIMITS.maxArrayLength }, (_, index) => [(index % 25) * 0.5 - 6, Math.floor(index / 25) * 0.5 - 3]),
    arrows: xs.flatMap((x) => ys.map((y) => [x, y])).slice(0, 144),
    domainAnswer: `${xs.join(', ')}, ${'0, '.repeat(200)}`.slice(0, TOOL_RESPONSE_LIMITS.maxStringLength),
    rangeAnswer: ys.join(', '),
    functionAnswer: FUNCTION_STATUS_CHOICES.NO_OUTPUT_REPEAT,
    fieldAnswers: Object.fromEntries(question.answerFields.map((field) => [field.id, 'y'.repeat(240)])),
  });
  const bounded = boundToolWork(work);
  assert.deepEqual(bounded.dropped, []);
  assert.equal(bounded.truncated, false);
  assert.ok(canonicalToolWorkJson(work).length < TOOL_RESPONSE_LIMITS.maxJsonLength, `${canonicalToolWorkJson(work).length} chars`);
  const { browser } = bothPaths(question, work);
  assert.equal(browser.graded, true);
  assert.equal(browser.isComplete, true);
});

test('realistic work never carries a key the response contract strips', () => {
  for (const [question, state] of [
    [FUNCTION_Q, FUNCTION_CORRECT],
    [PLOT_Q, { plottedPoints: [[0, 1]], arrows: [[0, 1]] }],
    [FIELDS_Q, { arrows: FIELDS_ARROWS, fieldAnswers: { kind: 'discrete', inputs: '{1}', feedback: '3' } }],
  ]) {
    assert.deepEqual(boundToolWork(labWork(question, state)).dropped, []);
  }
});

// --- Discrimination -----------------------------------------------------------------

test('correct work fails against a question whose key was altered', () => {
  const work = labWork(FUNCTION_Q, FUNCTION_CORRECT);
  assert.equal(bothPaths(FUNCTION_Q, work).browser.isCorrect, true);

  // One output changed: the arrows and the range are now wrong.
  const moved = { ...FUNCTION_Q, pairs: [{ x: -2, y: 3 }, { x: 1, y: 2 }, { x: 3, y: 0 }] };
  const movedResult = bothPaths(moved, work).browser;
  assert.equal(movedResult.isCorrect, false);
  assert.deepEqual(partVerdicts(movedResult), { mapping: false, domain: true, range: false, isFunction: true });

  // A second output for an input: no longer a function, and the mapping is short.
  const notFunction = { ...FUNCTION_Q, pairs: [...FUNCTION_Q.pairs, { x: 1, y: 3 }] };
  assert.deepEqual(partVerdicts(bothPaths(notFunction, work).browser), { mapping: false, domain: true, range: true, isFunction: false });

  // An altered field key.
  const fieldWork = labWork(FIELDS_Q, { arrows: FIELDS_ARROWS, fieldAnswers: { kind: 'discrete', inputs: '{-2, 1, 3}', feedback: '3' } });
  const rekeyed = { ...FIELDS_Q, answerFields: FIELDS_Q.answerFields.map((field) => (field.id === 'feedback' ? { ...field, answer: '4' } : field)) };
  assert.equal(bothPaths(FIELDS_Q, fieldWork).browser.isCorrect, true);
  assert.equal(partVerdicts(bothPaths(rekeyed, fieldWork).browser)['field:feedback'], false);
});

// --- Compatibility with the other readers of this work ------------------------------

test('the same work still grades under the Path contract, which reads the parsed `domain`/`range` arrays', () => {
  const question = { ...FUNCTION_Q, ask: ['mapping', 'domain', 'range'] };
  const privateGrading = buildPrivateToolGrading(question);
  const right = gradePathResponse({ privateGrading, raw: labWork(question, FUNCTION_CORRECT) });
  assert.equal(right.rejected, false);
  assert.equal(right.isCorrect, true);
  const wrong = gradePathResponse({ privateGrading, raw: labWork(question, { ...FUNCTION_CORRECT, domainAnswer: '-2, 1' }) });
  assert.equal(wrong.isCorrect, false);
});

// --- The component is wired to the grader -------------------------------------------

test('the lab\'s Check computes its verdict only through the shared grader and submits that verdict with the work', () => {
  const executable = executableSource(COMPONENT);
  assert.match(executable, /import relationMappingGrader,?[\s\S]*?from '\.\.\/\.\.\/\.\.\/functions\/shared\/serverGrading\/tools\/relationMapping\.mjs'/);
  assert.match(executable, /import \{ gradeToolCheck \} from '\.\.\/shared\/sharedToolGrading\.js'/);
  assert.match(executable, /import useReportToolWork from '\.\.\/shared\/useReportToolWork\.js'/);

  const check = region(executable, 'const check = () => {', 'const message = () =>', 'the Check handler');
  assert.match(check, /const result = gradeToolCheck\(relationMappingGrader, questionData, work\);/);
  assert.match(check, /submit\(\{ isCorrect: result\.isCorrect, score: result\.score \}, work, \{[^}]*parts: result\.parts[^}]*\}\)/);

  // No verdict of its own: none of the inline comparisons remain in the lab.
  for (const inline of [/matchesFieldAnswer/, /samePairSet/, /relationIsFunction/, /->\$\{/, /checks\.\w+\s*=[^=]/, /correctFunctionChoice/, /\bsameSet\(/]) {
    assert.doesNotMatch(executable, inline, `inline verdict code ${inline} must live only in the shared grader`);
  }
  // The answer key never rides in submit metadata.
  assert.doesNotMatch(check, /expected|correctFunctionChoice|domainValues|rangeValues|pairs/);
});

test('the work the lab submits is the work it reports live, and it keeps the keys other readers rely on', () => {
  const executable = executableSource(COMPONENT);
  const workObject = region(executable, 'const work = {', '};', 'the work object');
  // WorkflowRunner reads `response.arrows`; the Path contract reads arrows,
  // domain, range and isFunction; the shared grader reads the rest.
  // Every key carries the student's state as it is — the grader reads the
  // typed boxes and the chosen value unaltered, so an edited value here (a
  // trim, a slice, a default) would grade something the student did not enter.
  for (const entry of [
    /^\s*plottedPoints,$/m,
    /^\s*arrows,$/m,
    /^\s*domainText: domainAnswer,$/m,
    /^\s*rangeText: rangeAnswer,$/m,
    /^\s*domain: parseList\(domainAnswer\),$/m,
    /^\s*range: parseList\(rangeAnswer\),$/m,
    /^\s*isFunction: functionAnswer,$/m,
    /^\s*fields: relationFieldWork\(analysisFields, fieldAnswers\),$/m,
  ]) {
    assert.match(workObject, entry);
  }
  assert.match(executable, /useReportToolWork\(work, \{ enabled: pairs\.length > 0 \}\)/);
  // Reported at render scope, before the empty-relation early return (hooks
  // must run on every render).
  assert.ok(executable.indexOf('useReportToolWork(work') < executable.indexOf('if (!pairs.length)'));
});

test('the lab shows exactly the parts the grader grades, and offers only choices the grader knows', () => {
  const executable = executableSource(COMPONENT);
  // The relation, the asked parts and the analysis fields come from the
  // grader's own readers, so a panel can never appear that is not graded (or
  // be graded without appearing).
  assert.match(executable, /const pairs = useMemo\(\(\) => relationPairsOf\(questionData\.pairs\), \[questionData\.pairs\]\);/);
  assert.match(executable, /const ask = useMemo\(\(\) => relationAskOf\(questionData\.ask\), \[questionData\.ask\]\);/);
  assert.match(executable, /const analysisFields = useMemo\(\(\) => relationAnalysisFieldsOf\(questionData\.answerFields\), \[questionData\.answerFields\]\);/);

  // The four "Is it a function?" buttons submit the grader's values: the lab
  // builds them from the one shared list (relationFunctionChoice.mjs), which
  // holds exactly the values the grader knows — a literal here could never
  // match the key.
  const choices = region(executable, 'const functionChoiceOptions = useMemo(', 'choiceSeed(', 'the function-status choices');
  assert.match(choices, /FUNCTION_CHOICES\.map\(/);
  assert.doesNotMatch(choices, /value: ['"]/, 'no literal choice value');
  assert.deepEqual(
    FUNCTION_CHOICES.map((choice) => choice.value).sort(),
    Object.values(FUNCTION_STATUS_CHOICES).sort(),
  );
});

test('the lab\'s feedback message reads the grader\'s parts by the ids the grader emits', () => {
  const question = {
    ...FIELDS_Q,
    ask: ['plot', 'mapping', 'domain', 'range', 'isFunction'],
    answerFields: [FIELDS_Q.answerFields[0]],
  };
  const result = bothPaths(question, labWork(question)).browser;
  assert.deepEqual(partIds(result), ['plot', 'mapping', 'domain', 'range', 'isFunction', 'field:kind']);
  const message = region(executableSource(COMPONENT), 'const message = () =>', 'if (!pairs.length)', 'the feedback message');
  assert.match(message, /feedback\.metadata\?\.parts/);
  for (const id of ['plot', 'mapping', 'domain', 'range', 'isFunction']) assert.match(message, new RegExp(`checks\\.${id} === false`), id);
  assert.match(message, /checks\[`field:\$\{field\.id\}`\] === false/);
});
