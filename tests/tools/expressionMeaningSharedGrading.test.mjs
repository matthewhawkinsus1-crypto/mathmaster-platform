/*
 * expressionMeaning — SERVER-AUTHORITATIVE GRADING PARITY.
 *
 * The meaning matrix's Submit used to call scoreExpressionMeaning itself and
 * hand the platform only the verdict. It now asks the shared grader
 * (functions/shared/serverGrading/tools/expressionMeaning.mjs), the same pure
 * function the server runs on the raw work. These tests pin:
 *
 *   - the verdict: every pick against the authored answer (trimmed,
 *     case- and spacing-insensitive), the share-of-picks score, the
 *     all-rows-right rule — and the same recorded partial credit as before;
 *   - that the browser path (gradeToolCheck) and the server path
 *     (gradeServerResponse over the serialized tool response) agree exactly;
 *   - that the work is an array keyed by the authored id VALUE, so an id the
 *     response contract would strip as a key still grades;
 *   - that tampered or malformed work never crashes and never earns credit;
 *   - that the component grades and reports through the grader and carries
 *     no verdict of its own.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import expressionMeaningGrader, {
  expressionMeaningDimensionChecks,
  expressionMeaningWork,
} from '../../functions/shared/serverGrading/tools/expressionMeaning.mjs';
import expressionMeaningDeclaration from '../../functions/shared/serverGrading/declarations/expressionMeaning.mjs';
import { scoreExpressionMeaning } from '../../functions/shared/toolMath/expressionMeaning/expressionMeaningMath.mjs';
import { GRADING_MANIFEST } from '../../functions/shared/serverGrading/gradingManifest.mjs';
import { GRADING_AUTHORITY } from '../../functions/shared/serverGrading/gradingAuthority.mjs';
import { declaredGradingSupport } from '../../functions/shared/serverGrading/gradingSupport.mjs';
import { resolveToolMode } from '../../functions/shared/serverGrading/toolGraderDefinition.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { attemptInputsFromGrading } from '../../functions/shared/serverGrading/gradingResult.mjs';
import { TOOL_GRADERS } from '../../functions/shared/serverGrading/toolGraders.mjs';
import { TOOL_RESPONSE_LIMITS, boundToolWork, canonicalToolWorkJson } from '../../functions/shared/serverGrading/toolResponseContract.mjs';
import { emptyQuestionRecord, recordQuestionAttempt } from '../../functions/shared/attemptPolicy.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { executableSource, region } from '../platform/helpers/sourceContract.mjs';

const COMPONENT = readFileSync(new URL('../../src/tools/expressionMeaning/ExpressionMeaning.jsx', import.meta.url), 'utf8');

/** Grade through the browser path and the server path; they must agree exactly. */
const bothPaths = (question, work) => {
  const browser = gradeToolCheck(expressionMeaningGrader, question, work);
  assert.ok(browser.toolResponse, 'the browser path always produces the tool response it would send');
  const server = gradeServerResponse({ question, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
  assert.equal(server.graded, browser.graded, 'graded');
  assert.equal(server.isCorrect, browser.isCorrect, 'isCorrect');
  assert.equal(server.isComplete, browser.isComplete, 'isComplete');
  assert.equal(server.score, browser.score, 'score');
  assert.deepEqual(server.parts, browser.parts, 'parts');
  return { browser, server };
};
/** The matrix's assignments state, as work — exactly what the component submits. */
const grade = (question, assignments) => bothPaths(question, expressionMeaningWork(question, assignments)).browser;
const verdicts = (result) => Object.fromEntries(result.parts.map((part) => [part.id, part.isCorrect]));

const SHIRTS = {
  type: 'expressionMeaning',
  questionId: 'shirts-1',
  expressions: [
    { id: 'rate', expression: '15', unit: 'dollars per shirt', contextMeaning: 'selling price earned for each shirt sold', mathRole: 'rate of change / slope' },
    { id: 'constant', expression: '-45', unit: 'dollars', contextMeaning: 'value associated with the three shirts given away', mathRole: 'y-intercept / constant term' },
    { id: 'adjustedInput', expression: '(t - 3)', unit: 'shirts', contextMeaning: 'shirts available to sell after three are given away', mathRole: 'adjusted input' },
  ],
  choiceBanks: {
    units: ['dollars per shirt', 'dollars', 'shirts', 'minutes'],
    contextMeanings: [
      'selling price earned for each shirt sold',
      'value associated with the three shirts given away',
      'shirts available to sell after three are given away',
      'total time spent selling',
    ],
    mathRoles: ['rate of change / slope', 'y-intercept / constant term', 'adjusted input', 'independent variable'],
  },
};
const answersOf = (question) => Object.fromEntries(question.expressions.map((expr) => [
  expr.id, { unit: expr.unit, contextMeaning: expr.contextMeaning, mathRole: expr.mathRole },
]));
const CORRECT = answersOf(SHIRTS);

// --- The declaration ------------------------------------------------------------

test('expressionMeaning is declared shared-server with one mode, and the manifest and graders agree', () => {
  assert.equal(GRADING_MANIFEST.expressionMeaning, expressionMeaningDeclaration);
  assert.equal(expressionMeaningDeclaration.contractVersion, 1);
  assert.deepEqual(Object.keys(expressionMeaningDeclaration.modes), ['default']);
  assert.equal(expressionMeaningDeclaration.modes.default.authority, GRADING_AUTHORITY.SHARED_SERVER);
  assert.equal(expressionMeaningDeclaration.authority, GRADING_AUTHORITY.SHARED_SERVER);
  assert.equal(TOOL_GRADERS.expressionMeaning, expressionMeaningGrader);
  assert.equal(expressionMeaningGrader.toolId, 'expressionMeaning');
  assert.deepEqual([...expressionMeaningGrader.problems], []);
  assert.equal(typeof expressionMeaningGrader.modeGraders.default, 'function');
});

test('mode resolution matches the component: one view for every question, whatever `mode` says', () => {
  // ExpressionMeaning.jsx never reads `questionData.mode`.
  assert.doesNotMatch(executableSource(COMPONENT), /questionData\??\.mode\b|questionData\[['"]mode['"]\]/);
  for (const mode of [undefined, '', 'default', 'matrix', 'constantRate', 'notAMode']) {
    const question = { ...SHIRTS, ...(mode === undefined ? {} : { mode }) };
    assert.equal(resolveToolMode(expressionMeaningDeclaration, question), 'default', `mode ${mode}`);
    const support = declaredGradingSupport(question);
    assert.equal(support.supported, true, `mode ${mode}`);
    assert.equal(support.mode, 'default');
    assert.equal(grade(question, CORRECT).isCorrect, true, `mode ${mode}`);
  }
  assert.equal(declaredGradingSupport({ toolId: 'expressionMeaning', expressions: SHIRTS.expressions }).supported, true);
});

// --- Fully correct, incorrect, partial ---------------------------------------------

test('a fully correct meaning map earns full credit on both paths', () => {
  const result = grade(SHIRTS, CORRECT);
  assert.equal(result.graded, true);
  assert.equal(result.isCorrect, true);
  assert.equal(result.isComplete, true);
  assert.equal(result.score, 1);
  assert.deepEqual(result.parts.map((part) => [part.id, part.label, part.isCorrect, part.credit]), [
    ['rate', '15', true, 1],
    ['constant', '-45', true, 1],
    ['adjustedInput', '(t - 3)', true, 1],
  ]);
});

test('one wrong pick costs exactly that row and a ninth of the score', () => {
  for (const [id, dimension, wrong] of [
    ['rate', 'unit', 'dollars'],
    ['constant', 'contextMeaning', 'total time spent selling'],
    ['adjustedInput', 'mathRole', 'independent variable'],
  ]) {
    const result = grade(SHIRTS, { ...CORRECT, [id]: { ...CORRECT[id], [dimension]: wrong } });
    assert.equal(result.isCorrect, false, id);
    assert.equal(result.isComplete, true, id);
    assert.equal(result.score, 8 / 9, id);
    const part = result.parts.find((entry) => entry.id === id);
    assert.equal(part.isCorrect, false, id);
    assert.equal(part.credit, 2 / 3, id);
    assert.ok(result.parts.filter((entry) => entry.id !== id).every((entry) => entry.isCorrect), id);
    // The matrix's feedback names that dimension of that row, and only it.
    const index = SHIRTS.expressions.findIndex((expr) => expr.id === id);
    const dimensions = expressionMeaningDimensionChecks(SHIRTS, expressionMeaningWork(SHIRTS, { ...CORRECT, [id]: { ...CORRECT[id], [dimension]: wrong } }));
    assert.deepEqual(Object.entries(dimensions[index]).filter(([, ok]) => !ok).map(([name]) => name), [dimension], id);
  }
});

test('partially complete work is graded (blank picks are wrong) and reported incomplete', () => {
  const assignments = {
    rate: { unit: 'dollars', contextMeaning: CORRECT.rate.contextMeaning, mathRole: CORRECT.rate.mathRole },
    constant: CORRECT.constant,
    adjustedInput: { unit: 'shirts' },
  };
  const result = grade(SHIRTS, assignments);
  assert.equal(result.graded, true);
  assert.equal(result.isComplete, false);
  assert.equal(result.isCorrect, false);
  // rate 2/3, constant 3/3, adjustedInput 1/3 = 6/9.
  assert.equal(result.score, 6 / 9);
  assert.deepEqual(result.parts.map((part) => [part.id, part.isComplete, part.isCorrect, part.credit]), [
    ['rate', true, false, 2 / 3],
    ['constant', true, true, 1],
    ['adjustedInput', false, false, 1 / 3],
  ]);
  // Nothing chosen at all.
  const blank = grade(SHIRTS, {});
  assert.equal(blank.isComplete, false);
  assert.equal(blank.score, 0);
  assert.ok(blank.parts.every((part) => !part.isComplete && part.credit === 0));
});

test('the recorded partial credit is the share of right picks, exactly as the matrix recorded it', () => {
  const fixtures = [
    CORRECT,
    { ...CORRECT, rate: { ...CORRECT.rate, unit: 'dollars' } },
    { rate: { unit: 'dollars', contextMeaning: CORRECT.rate.contextMeaning, mathRole: CORRECT.rate.mathRole }, constant: CORRECT.constant, adjustedInput: {} },
    { rate: { unit: 'shirts', contextMeaning: 'total time spent selling', mathRole: CORRECT.rate.mathRole }, constant: { ...CORRECT.constant, unit: 'minutes' }, adjustedInput: { ...CORRECT.adjustedInput, mathRole: 'independent variable' } },
    {},
  ];
  fixtures.forEach((assignments, index) => {
    // What ExpressionMeaning.jsx computed and QuestionEngine recorded before.
    const previous = scoreExpressionMeaning(SHIRTS, { assignments });
    const previousParts = previous.perExpression.map((entry) => ({ id: entry.id, label: entry.id, isCorrect: entry.complete, isComplete: true }));
    const before = recordQuestionAttempt({ record: emptyQuestionRecord(), isCorrect: previous.isCorrect, parts: previousParts, partialCreditPercent: Math.round(previous.score * 100) });

    const shared = grade(SHIRTS, assignments);
    assert.equal(shared.isCorrect, previous.isCorrect, `fixture ${index}`);
    assert.equal(shared.score, previous.isCorrect ? 1 : previous.score, `fixture ${index}`);
    assert.deepEqual(shared.parts.map((part) => [part.id, part.isCorrect]), previous.perExpression.map((entry) => [entry.id, entry.complete]), `fixture ${index}`);
    const inputs = attemptInputsFromGrading(shared);
    const after = recordQuestionAttempt({ record: emptyQuestionRecord(), isCorrect: inputs.isCorrect, parts: inputs.parts, partialCreditPercent: inputs.partialCreditPercent });
    assert.equal(after.result.status, before.result.status, `fixture ${index}`);
    assert.equal(after.result.partialCredit, before.result.partialCredit, `fixture ${index}`);
    // And the per-dimension feedback is the previous scorer's, row for row.
    assert.deepEqual(expressionMeaningDimensionChecks(SHIRTS, expressionMeaningWork(SHIRTS, assignments)), previous.perExpression.map((entry) => entry.checks), `fixture ${index}`);
  });
});

// --- Equivalent forms and the choice banks ------------------------------------------

test('a pick is matched ignoring case, surrounding space and repeated spaces', () => {
  const loose = {
    ...CORRECT,
    rate: { unit: '  Dollars   per SHIRT ', contextMeaning: CORRECT.rate.contextMeaning.toUpperCase(), mathRole: 'rate of change  /  slope' },
  };
  assert.equal(grade(SHIRTS, loose).isCorrect, true);
  // A near miss is still wrong.
  assert.equal(verdicts(grade(SHIRTS, { ...CORRECT, rate: { ...CORRECT.rate, unit: 'dollar per shirt' } })).rate, false);
});

test('selections are matched by id, in any order, and numeric options read as their text', () => {
  const work = expressionMeaningWork(SHIRTS, CORRECT);
  const reversed = { selections: [...work.selections].reverse() };
  assert.equal(bothPaths(SHIRTS, reversed).browser.isCorrect, true);

  const numeric = {
    type: 'expressionMeaning',
    expressions: [
      { id: 1, expression: 'n', unit: 'items', contextMeaning: 'count', mathRole: 1 },
      { id: 2, expression: '2n', unit: 'items', contextMeaning: 'double', mathRole: 2 },
    ],
    choiceBanks: { units: ['items', 'hours'], contextMeanings: ['count', 'double'], mathRoles: [1, 2] },
  };
  const numericWork = expressionMeaningWork(numeric, { 1: { unit: 'items', contextMeaning: 'count', mathRole: 1 }, 2: { unit: 'items', contextMeaning: 'double', mathRole: 2 } });
  assert.equal(bothPaths(numeric, numericWork).browser.isCorrect, true);
  assert.equal(bothPaths(numeric, { selections: numericWork.selections.map((entry) => ({ ...entry, id: String(entry.id) })) }).browser.isCorrect, true);

  // Any scalar id is a row, exactly as the matrix keys its `assignments`
  // (a property key): a boolean id is answerable on screen, so it grades.
  const scalarIds = {
    type: 'expressionMeaning',
    expressions: [
      { id: true, expression: 'p', unit: 'items', contextMeaning: 'count', mathRole: 'slope' },
      { id: 'b', expression: 'q', unit: 'hours', contextMeaning: 'double', mathRole: 'intercept' },
    ],
  };
  const scalarState = { true: { unit: 'items', contextMeaning: 'count', mathRole: 'slope' }, b: { unit: 'hours', contextMeaning: 'double', mathRole: 'intercept' } };
  assert.equal(scoreExpressionMeaning(scalarIds, { assignments: scalarState }).isCorrect, true, 'the previous scorer');
  const scalarResult = grade(scalarIds, scalarState);
  assert.equal(scalarResult.isCorrect, true);
  assert.equal(scalarResult.isComplete, true);
});

test('completeness is the matrix\'s own: an option authored as 0 or false is marked, but never completes a row', () => {
  // ExpressionMeaning.jsx's row completeness and Submit gate, verbatim: a
  // dimension counts only when `String(given[dimension] || '').trim()` is
  // non-empty. Its matrix cell (`given[dimension] || '—'`) and its selected
  // button (`assignments[id]?.[dimension] || ''`) read the same way, so an
  // option authored as 0 never shows as chosen on screen.
  const rowGate = (given = {}) => ['unit', 'contextMeaning', 'mathRole'].every((dimension) => String(given[dimension] || '').trim());
  const zero = {
    type: 'expressionMeaning',
    expressions: [
      { id: 'n', expression: 'n', unit: 'items', contextMeaning: 'count', mathRole: 0 },
      { id: 'flag', expression: 'f', unit: 'items', contextMeaning: 'switch', mathRole: false },
    ],
    choiceBanks: { units: ['items', 'hours'], contextMeanings: ['count', 'switch'], mathRoles: [0, 1, false] },
  };
  const assignments = { n: { unit: 'items', contextMeaning: 'count', mathRole: 0 }, flag: { unit: 'items', contextMeaning: 'switch', mathRole: false } };
  const work = expressionMeaningWork(zero, assignments);
  // The work carries the option the student chose, not a rewritten one.
  assert.deepEqual(work.selections.map((entry) => entry.mathRole), [0, false]);
  const result = bothPaths(zero, work).browser;
  // Marked exactly as the previous scorer marked it: every pick is right...
  const previous = scoreExpressionMeaning(zero, { assignments });
  assert.equal(previous.isCorrect, true);
  assert.equal(result.isCorrect, previous.isCorrect);
  assert.equal(result.score, 1);
  // ...but no row is complete, just as the matrix's Submit gate says.
  assert.deepEqual(result.parts.map((part) => part.isComplete), zero.expressions.map((expr) => Boolean(rowGate(assignments[expr.id]))));
  assert.deepEqual(result.parts.map((part) => part.isComplete), [false, false]);
  assert.equal(result.isComplete, false);
  // Any other option, the number 1 or true included, is chosen.
  const one = bothPaths(zero, expressionMeaningWork(zero, { ...assignments, n: { ...assignments.n, mathRole: 1 }, flag: { ...assignments.flag, mathRole: true } })).browser;
  assert.deepEqual(one.parts.map((part) => part.isComplete), [true, true]);
  assert.equal(one.isComplete, true);
  assert.equal(one.isCorrect, false);

  // And over many matrices the grader's completeness is that gate, row by row
  // (a seeded mix of blank, whitespace, text, 0/1 and true/false options:
  // about a quarter of the rows complete, a few whole matrices complete).
  const options = ['dollars', 'shirts', ' ', '', 0, 1, true, false, 'Dollars '];
  let completeRows = 0;
  let completeMatrices = 0;
  for (let seed = 1; seed <= 300; seed += 1) {
    let state = seed;
    const next = () => { state = (state * 48271) % 2147483647; return state; };
    const assignmentsForSeed = {};
    SHIRTS.expressions.forEach((expr) => {
      const row = {};
      ['unit', 'contextMeaning', 'mathRole'].forEach((dimension) => {
        const choice = next() % (options.length + 3);
        row[dimension] = choice < options.length ? options[choice] : 'dollars';
      });
      if (next() % 6) assignmentsForSeed[expr.id] = row;
    });
    const graded = grade(SHIRTS, assignmentsForSeed);
    const gate = SHIRTS.expressions.map((expr) => Boolean(rowGate(assignmentsForSeed[expr.id] || {})));
    assert.deepEqual(graded.parts.map((part) => part.isComplete), gate, `seed ${seed}`);
    assert.equal(graded.isComplete, gate.every(Boolean), `seed ${seed}`);
    completeRows += gate.filter(Boolean).length;
    if (gate.every(Boolean)) completeMatrices += 1;
  }
  assert.ok(completeRows > 100 && completeMatrices > 0, `${completeRows} complete rows, ${completeMatrices} complete matrices`);
});

test('the choice banks play no part: trimmed, reordered or missing banks never change a verdict', () => {
  const partial = { ...CORRECT, rate: { ...CORRECT.rate, unit: 'dollars' } };
  const baseline = grade(SHIRTS, partial);
  for (const choiceBanks of [
    // What reduce-complexity does: two options per bank.
    { units: ['dollars per shirt', 'dollars'], contextMeanings: SHIRTS.choiceBanks.contextMeanings.slice(0, 2), mathRoles: SHIRTS.choiceBanks.mathRoles.slice(0, 2) },
    { units: [...SHIRTS.choiceBanks.units].reverse(), contextMeanings: [...SHIRTS.choiceBanks.contextMeanings].reverse(), mathRoles: [...SHIRTS.choiceBanks.mathRoles].reverse() },
    undefined,
  ]) {
    const question = { ...SHIRTS, choiceBanks };
    const result = grade(question, partial);
    assert.equal(result.isCorrect, baseline.isCorrect);
    assert.equal(result.score, baseline.score);
    assert.deepEqual(result.parts, baseline.parts);
    assert.equal(grade(question, CORRECT).isCorrect, true);
  }
});

test('unauthored question fields: no expressions is a graded, incomplete, incorrect zero', () => {
  for (const question of [{ type: 'expressionMeaning' }, { type: 'expressionMeaning', expressions: [] }, { type: 'expressionMeaning', expressions: 'rate' }]) {
    const result = bothPaths(question, expressionMeaningWork(question, CORRECT)).browser;
    assert.equal(result.graded, true);
    assert.equal(result.isCorrect, false);
    assert.equal(result.isComplete, false);
    assert.equal(result.score, 0);
    assert.deepEqual(result.parts, []);
  }
});

// --- The work's shape ---------------------------------------------------------------

test('authored ids the response contract strips as keys still grade, because ids travel as values', () => {
  const awkward = ['score', 'expected', 'solution', '__proto__', 'constructor', 'x'.repeat(120)];
  const question = {
    type: 'expressionMeaning',
    expressions: awkward.map((id, index) => ({ id, expression: `e${index}`, unit: `u${index}`, contextMeaning: `c${index}`, mathRole: `r${index}` })),
  };
  // The component's own state, keyed by id the way `assign` builds it.
  const assignments = {};
  question.expressions.forEach((expr) => {
    Object.defineProperty(assignments, expr.id, { value: { unit: expr.unit, contextMeaning: expr.contextMeaning, mathRole: expr.mathRole }, enumerable: true, configurable: true, writable: true });
  });
  const work = expressionMeaningWork(question, assignments);
  assert.deepEqual(boundToolWork(work).dropped, []);
  assert.equal(bothPaths(question, work).browser.isCorrect, true);
  // The object-keyed shape the matrix used to submit would have lost them.
  assert.deepEqual(boundToolWork({ assignments }).dropped.sort(), ['__proto__', 'constructor', 'expected', 'score', 'solution'].sort());
  // ...and silently cut the 120-character id, which is longer than a key may be.
  assert.equal(boundToolWork({ assignments }).truncated, true);
  assert.equal(boundToolWork(work).truncated, false);
});

test('realistic work never carries a key the response contract strips', () => {
  for (const assignments of [CORRECT, {}, { rate: { unit: 'dollars' } }]) {
    assert.deepEqual(boundToolWork(expressionMeaningWork(SHIRTS, assignments)).dropped, []);
  }
});

test('realistic maximal work stays inside the response limits and is graded', () => {
  const question = {
    type: 'expressionMeaning',
    expressions: Array.from({ length: 20 }, (_, index) => ({
      id: `expression-${index + 1}`,
      expression: `${index + 1}(t - ${index})`,
      unit: `unit ${index} ${'u'.repeat(80)}`,
      contextMeaning: `meaning ${index} ${'m'.repeat(220)}`,
      mathRole: `role ${index} ${'r'.repeat(80)}`,
    })),
  };
  const work = expressionMeaningWork(question, answersOf(question));
  const bounded = boundToolWork(work);
  assert.deepEqual(bounded.dropped, []);
  assert.equal(bounded.truncated, false);
  assert.ok(canonicalToolWorkJson(work).length < TOOL_RESPONSE_LIMITS.maxJsonLength, `${canonicalToolWorkJson(work).length} chars`);
  const { browser } = bothPaths(question, work);
  assert.equal(browser.graded, true);
  assert.equal(browser.isComplete, true);
  assert.equal(browser.isCorrect, true);
});

// --- Malformed and tampered work ------------------------------------------------------

test('verdict-looking keys injected into the work are stripped and change nothing', () => {
  const clean = expressionMeaningWork(SHIRTS, { ...CORRECT, rate: { ...CORRECT.rate, unit: 'dollars' } });
  const baseline = bothPaths(SHIRTS, clean).browser;
  const tampered = {
    ...clean,
    isCorrect: true,
    score: 1,
    checks: { rate: true },
    expected: CORRECT,
    answerKey: SHIRTS.expressions,
    selections: clean.selections.map((entry) => ({ ...entry, correct: true, feedback: 'all right' })),
  };
  assert.deepEqual(boundToolWork(tampered).dropped.sort(), ['answerKey', 'checks', 'correct', 'expected', 'feedback', 'isCorrect', 'score'].sort());
  const result = bothPaths(SHIRTS, tampered).browser;
  assert.equal(result.isCorrect, false);
  assert.equal(result.score, baseline.score);
  assert.deepEqual(result.parts, baseline.parts);
});

test('wrong types and junk entries are graded as wrong, never thrown and never matched by accident', () => {
  for (const work of [{ selections: 'rate' }, { selections: { rate: CORRECT.rate } }, { assignments: CORRECT }, {}]) {
    const result = bothPaths(SHIRTS, work).browser;
    assert.equal(result.graded, true, JSON.stringify(work));
    assert.equal(result.isCorrect, false);
    assert.equal(result.isComplete, false);
    assert.equal(result.score, 0);
  }
  const good = expressionMeaningWork(SHIRTS, CORRECT).selections;
  // Junk entries alongside the real ones are ignored; picks of the wrong type are blank.
  const junkEntries = { selections: [null, 'rate', 7, [good[0]], { id: { nested: 'rate' }, ...CORRECT.rate }, ...good] };
  assert.equal(bothPaths(SHIRTS, junkEntries).browser.isCorrect, true);
  const wrongTypes = { selections: [{ id: 'rate', unit: ['dollars per shirt'], contextMeaning: { text: CORRECT.rate.contextMeaning }, mathRole: null }, good[1], good[2]] };
  const typed = bothPaths(SHIRTS, wrongTypes).browser;
  assert.equal(verdicts(typed).rate, false);
  assert.equal(typed.parts[0].credit, 0);
  assert.equal(typed.parts[0].isComplete, false);
  // A second, conflicting selection for an id never overrides the first.
  const conflicting = { selections: [...good, { ...good[0], unit: 'minutes' }] };
  assert.equal(bothPaths(SHIRTS, conflicting).browser.isCorrect, true);
  const conflictingFirst = { selections: [{ ...good[0], unit: 'minutes' }, ...good] };
  assert.equal(verdicts(bothPaths(SHIRTS, conflictingFirst).browser).rate, false);
  // Selections for ids the question does not have earn nothing.
  assert.equal(bothPaths(SHIRTS, { selections: good.map((entry) => ({ ...entry, id: `${entry.id}-other` })) }).browser.score, 0);
});

test('non-object and oversize work is not gradable on either path', () => {
  for (const work of [null, undefined, 'rate', 42, [expressionMeaningWork(SHIRTS, CORRECT)]]) {
    const { browser, server } = bothPaths(SHIRTS, work);
    assert.equal(browser.graded, false, JSON.stringify(work));
    assert.equal(server.graded, false);
    assert.equal(browser.isCorrect, false);
  }
  const oversize = { selections: Array.from({ length: 40 }, (_, index) => ({ id: `e${index}`, unit: 'u'.repeat(300), contextMeaning: 'c'.repeat(300), mathRole: 'r'.repeat(300) })) };
  const { browser, server } = bothPaths(SHIRTS, oversize);
  assert.equal(browser.graded, false);
  assert.equal(browser.reason, 'oversize-response');
  assert.equal(server.reason, 'oversize-response');
});

// --- Discrimination -------------------------------------------------------------------

test('correct work fails against a question whose key was altered', () => {
  assert.equal(grade(SHIRTS, CORRECT).isCorrect, true);
  const rekeyed = { ...SHIRTS, expressions: SHIRTS.expressions.map((expr) => (expr.id === 'constant' ? { ...expr, mathRole: 'rate of change / slope' } : expr)) };
  const result = grade(rekeyed, CORRECT);
  assert.equal(result.isCorrect, false);
  assert.deepEqual(verdicts(result), { rate: true, constant: false, adjustedInput: true });
  assert.equal(result.score, 8 / 9);
  // An extra authored expression the student never saw an answer for.
  const extended = { ...SHIRTS, expressions: [...SHIRTS.expressions, { id: 'total', expression: 'G', unit: 'dollars', contextMeaning: 'total', mathRole: 'output' }] };
  assert.equal(grade(extended, CORRECT).isCorrect, false);
});

// --- The component is wired to the grader -------------------------------------------

test('the matrix\'s Submit computes its verdict only through the shared grader and submits that verdict with the work', () => {
  const executable = executableSource(COMPONENT);
  assert.match(executable, /import expressionMeaningGrader,?[\s\S]*?from '\.\.\/\.\.\/\.\.\/functions\/shared\/serverGrading\/tools\/expressionMeaning\.mjs'/);
  assert.match(executable, /import \{ gradeToolCheck \} from '\.\.\/shared\/sharedToolGrading\.js'/);
  assert.match(executable, /import useReportToolWork from '\.\.\/shared\/useReportToolWork\.js'/);

  const check = region(executable, 'const check = () => {', 'const feedbackParts', 'the Submit handler');
  assert.match(check, /const result = gradeToolCheck\(expressionMeaningGrader, questionData, work\);/);
  assert.match(check, /submit\(\s*\{ isCorrect: result\.isCorrect, score: result\.score \},\s*work,\s*\{[^}]*parts: result\.parts[^}]*\}/);
  assert.match(check, /dimensions: expressionMeaningDimensionChecks\(questionData, work\)/);
  // No verdict of its own, and no answer material in the metadata.
  assert.doesNotMatch(executable, /scoreExpressionMeaning|\.contextMeaning\b|\.mathRole\b|expr\??\.unit\b/);
  assert.doesNotMatch(check, /expressions|expected|answer/);
});

test('the work the matrix submits is the work it reports live', () => {
  const executable = executableSource(COMPONENT);
  assert.match(executable, /const work = useMemo\(\(\) => expressionMeaningWork\(questionData, assignments\), \[questionData, assignments\]\);\s*useReportToolWork\(work\);/);
  // The live report sits at render scope, before any return.
  assert.ok(executable.indexOf('useReportToolWork(work)') < executable.indexOf('return ('));
});

test('the matrix\'s feedback lists each wrong row\'s dimensions, aligned with the grader\'s parts', () => {
  const executable = executableSource(COMPONENT);
  const feedback = region(executable, 'const feedbackParts', 'return (', 'the feedback rows');
  assert.match(feedback, /const feedbackDimensions = feedback\?\.metadata\?\.dimensions \|\| \[\];/);
  assert.match(feedback, /\.map\(\(part, index\) => \(\{ \.\.\.part, dimensions: feedbackDimensions\[index\] \}\)\)\s*\.filter\(\(part\) => !part\.isCorrect\)/);
  assert.match(executable, /Object\.entries\(part\.dimensions \|\| \{\}\)\.filter\(\(\[, ok\]\) => !ok\)/);
  // The grader's parts and the dimension checks are in the same (matrix) order.
  const work = expressionMeaningWork(SHIRTS, { ...CORRECT, constant: { ...CORRECT.constant, unit: 'shirts' } });
  const result = gradeToolCheck(expressionMeaningGrader, SHIRTS, work);
  const dimensions = expressionMeaningDimensionChecks(SHIRTS, work);
  assert.equal(dimensions.length, result.parts.length);
  result.parts.forEach((part, index) => assert.equal(part.isCorrect, Object.values(dimensions[index]).every(Boolean), part.id));
});
