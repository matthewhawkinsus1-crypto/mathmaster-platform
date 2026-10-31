// ONE SIMPLIFY, EVERYWHERE (student push Q): the shared engine.
//
// Simplify finds the parts of an expression that get shorter by computing —
// numbers multiplied, like terms combined, a numeric fraction reduced,
// parentheses removed, a factor of 1 left behind — from the math tree. The
// student supplies every result; the engine only checks it is equal AND
// simpler. These tests pin that contract on many shapes, including the
// owner's case 2x + (1)(-4x) + (1)(12) = 2.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SIMPLIFY_MESSAGES,
  SIMPLIFY_PART_KINDS,
  checkRegionRewrite,
  commitSimplifyPart,
  detectSimplifyParts,
  highlightedTermIndices,
  partNeedsAnswer,
  partNeedsSigns,
  partsForTerm,
  simplifyStepFor,
} from '../../src/platform/algebra/simplify/simplifyEngine.js';
import { expressionsEquivalent } from '../../src/algebraAstEngine.js';
import { EQUATION_REWRITE_KINDS, RELATION_STEP_KINDS } from '../../functions/shared/serverGrading/stepAlgebraStepVerification.mjs';

const regionsOf = (left, right = '0', variable = 'x') => [
  { key: 'left', label: 'left side', expression: left, variable },
  { key: 'right', label: 'right side', expression: right, variable },
];
const kinds = (parts) => parts.map((part) => `${part.region}:${part.kind}:${part.termIndices.join('.')}`);
const commit = (left, right, id, work) => commitSimplifyPart(regionsOf(left, right), id, work);

test('detection finds each kind of part from the math tree, in reading order', () => {
  const cases = [
    // The owner's case, as a draft from before job Q holds it.
    // (1)(-4x) keeps a sign beside its 1, so the student writes the term;
    // (1)(12) is a plain factor of 1, removed with one press.
    ['2 * x + (1) * (-4 * x) + (1) * (12)', '2', ['left:likeTerms:0.1', 'left:product:1', 'left:unit:2']],
    // Arithmetic hidden in a number, or a sign product behind a 1, is the student's.
    ['2 * (1/2) * x', '3', ['left:product:0']],
    ['-(-1) * (4)', '3', ['left:product:0']],
    // A substituted group after a plus and after a minus sign.
    ['2 * x + 1 * (-4 * x + 12)', '2', ['left:parentheses:1']],
    ['3 * x - 1 * (-4 * x + 12)', '4', ['left:parentheses:1']],
    ['-1 * (x + 2) + 3', '1', ['left:parentheses:0']],
    // Products of numbers, with and without letters.
    ['3 * (5 * (x - 3))', '6', ['left:product:0']],
    ['(-2/3) * (3)', 'x', ['left:product:0']],
    ['-3 * (2 * x)', '6', ['left:product:0']],
    ['(-1) * (-4 * x)', '8', ['left:product:0']],
    // Like terms: letters, constants, both sides independently.
    ['2 * x + 5 - 4 * x', '7 + 3', ['left:likeTerms:0.2', 'right:likeTerms:0.1']],
    // A numeric fraction not in lowest terms; a divide by 1.
    ['x + 6 / 4', 'x / 1', ['left:fraction:1', 'right:unit:0']],
    // Nothing left to compute.
    ['2 * x + 12', '5', []],
    ['15 * (x - 3)', 'y', []],
    ['x / 2 + 3', '5 / 2', []],
    ['-6 * x + 12', '0', []],
  ];
  for (const [left, right, expected] of cases) {
    assert.deepEqual(kinds(detectSimplifyParts(regionsOf(left, right))), expected, `${left} = ${right}`);
  }
});

test('a substituted group is never a like term and never crosses into one', () => {
  // 2x + (-4x + 12): the -4x is inside the group until the student removes it.
  const parts = detectSimplifyParts(regionsOf('2 * x + 1 * (-4 * x + 12)', '2'));
  assert.equal(parts.filter((part) => part.kind === SIMPLIFY_PART_KINDS.LIKE_TERMS).length, 0);
});

test('parts carry an accessible name, and board taps map to them', () => {
  const parts = detectSimplifyParts(regionsOf('2 * x + (1) * (-4 * x) + (1) * (12)', '2'));
  assert.match(parts[0].name, /^like terms: 2 times x and 1 times negative 4 times x$/);
  assert.match(parts[1].name, /^product: 1 times negative 4 times x$/);
  assert.match(parts[2].name, /^a factor of 1: /);
  assert.deepEqual(highlightedTermIndices(parts, 'left'), [0, 1, 2]);
  assert.deepEqual(highlightedTermIndices(parts, 'right'), []);
  // The middle term belongs to two parts; a repeated tap alternates.
  assert.deepEqual(partsForTerm(parts, 'left', 1).map((part) => part.kind), ['likeTerms', 'product']);
  const sub = detectSimplifyParts(regionsOf('3 * x - 1 * (-4 * x + 12)', '4'))[0];
  assert.equal(sub.name, 'parentheses: minus the quantity negative 4 times x plus 12');
});

test('the platform never supplies a result: no part, prompt or message names one', () => {
  const left = '3 * (5 * (x - 3)) + 2 * x + 4 * x';
  const right = '6 / 4 + (-2/3) * (3)';
  const parts = detectSimplifyParts(regionsOf(left, right));
  const shown = parts.flatMap((part) => [part.latex, part.name, part.productLatex || '']).join(' | ');
  // 3 × 5 = 15, 2x + 4x = 6x, 6/4 = 3/2, (-2/3)(3) = -2: none of them is shown.
  for (const result of ['15', '6x', '6 x', '\\frac{3}{2}', '3/2', '3 over 2', 'negative 2,', '-2 ']) {
    assert.ok(!shown.includes(result), `"${result}" appears in ${shown}`);
  }
  // Nothing a part shows is ever "… = result", for every kind of part.
  const everyKind = detectSimplifyParts(regionsOf('(-1) * (-4 * x) + 3 * (5 * x) + (1) * (12) + 2 * x', '6 / 4 - 1 * (x - 2)'));
  for (const part of everyKind) {
    assert.doesNotMatch(`${part.latex} ${part.productLatex || ''} ${part.name}`, /=/, `${part.id} shows a result`);
  }
  // No message carries a number, except the rule that a 1 is not written.
  for (const [reason, message] of Object.entries(SIMPLIFY_MESSAGES)) {
    assert.doesNotMatch(message.replace(/write x, not 1x/, ''), /\d/, `${reason}: ${message}`);
  }
  // Every typed part refuses to commit with nothing typed: nothing is filled in.
  for (const part of parts.filter(partNeedsAnswer)) {
    if (partNeedsSigns(part)) continue;
    assert.deepEqual(commitSimplifyPart(regionsOf(left, right), part.id, { answer: '' }), { ok: false, reason: 'empty' });
  }
});

test('a product: the student states the product, checked exactly, with near misses refused', () => {
  const left = '3 * (5 * (x - 3))';
  const id = 'left:product:0';
  assert.equal(commit(left, '6', id, { answer: '15' }).expression, '15 * (x - 3)');
  // The whole term is the same work.
  assert.equal(commit(left, '6', id, { answer: '15(x-3)' }).ok, true);
  assert.equal(commit(left, '6', id, { answer: '-15' }).reason, 'sign');
  assert.equal(commit(left, '6', id, { answer: '8' }).reason, 'notEqual');
  assert.equal(commit(left, '6', id, { answer: '3 \\cdot 5' }).reason, 'notSingleNumber');
  assert.equal(commit(left, '6', id, { answer: '30/2' }).reason, 'notSingleNumber');
  // A term's minus sign travels on its first number: -3(2x) asks (-3) × 2.
  const negative = detectSimplifyParts(regionsOf('-3 * (2 * x)', '6'))[0];
  assert.equal(negative.productLatex, '\\left(-3\\right) \\times 2');
  assert.equal(commit('-3 * (2 * x)', '6', negative.id, { answer: '-6' }).expression, '-6 * x');
  assert.equal(commit('-3 * (2 * x)', '6', negative.id, { answer: '6' }).reason, 'sign');
  // The whole term typed must be simplest too: one number, no product left.
  assert.equal(commit('-3 * (2 * x)', '6', negative.id, { answer: '(-2)(3)x' }).reason, 'notSingleNumber');
  // A product of 0 leaves no "+ 0" on the board.
  assert.equal(commit('x + (0) * (5)', '3', 'left:product:1', { answer: '0' }).expression, 'x');
  // The product box keeps what the student typed honest: no unreduced fraction, no extra term.
  assert.equal(commit('-3 * (2 * x)', '6', negative.id, { answer: '-12x/2' }).reason, 'notLowestTerms');
  assert.equal(commit('-3 * (2 * x)', '6', negative.id, { answer: '-6x+0' }).reason, 'notSingleTerm');
  // A sign product is never done for the student: -(-1)(4) asks (-1) × (-1) × 4.
  const signs = detectSimplifyParts(regionsOf('-(-1) * (4)', '3'))[0];
  assert.equal(signs.productLatex, '\\left(-1\\right) \\times \\left(-1\\right) \\times 4');
  // Arithmetic inside a number (2 · 1/2) is typed by the student, never one press.
  const half = detectSimplifyParts(regionsOf('2 * (1/2) * x', '3'))[0];
  assert.equal(half.kind, 'product');
  assert.equal(partNeedsAnswer(half), true);
  // (-1)(-4x) keeps its sign step: the student states 4.
  assert.equal(commit('(-1) * (-4 * x)', '8', 'left:product:0', { answer: '4' }).expression, '4 * x');
  // A product of 1 never writes 1x: (1/2)(2)x -> x.
  assert.equal(commit('(1/2) * (2 * x)', '8', 'left:product:0', { answer: '1' }).expression, 'x');
});

test('like terms: one simplest term equal to their sum; near misses refused', () => {
  const left = '2 * x + 5 - 4 * x';
  const id = 'left:likeTerms:0.2';
  const done = commit(left, '7', id, { answer: '-2x' });
  assert.equal(done.ok, true);
  assert.ok(expressionsEquivalent(done.expression, '-2x + 5'));
  assert.equal(commit(left, '7', id, { answer: '2x' }).reason, 'notEqual');
  assert.equal(commit(left, '7', id, { answer: '2x - 4x' }).reason, 'notSingleTerm');
  assert.equal(commit(left, '7', id, { answer: '-2x + 0' }).reason, 'notSingleTerm');
  assert.equal(commit(left, '7', id, { answer: '(-4/2)x' }).reason, 'notLowestTerms');
  // 1x is never accepted: write x.
  assert.equal(commit('3 * x - 2 * x', '7', 'left:likeTerms:0.1', { answer: '1x' }).reason, 'unitCoefficient');
  assert.equal(commit('3 * x - 2 * x', '7', 'left:likeTerms:0.1', { answer: 'x' }).expression, 'x');
  // A minus sign is not a written 1: -y is simplest, -1y is not (3x3 journey).
  assert.equal(commit('-3 * y + 2 * y', '7', 'left:likeTerms:0.1', { answer: '-y' }).ok, true);
  assert.equal(commit('-3 * y + 2 * y', '7', 'left:likeTerms:0.1', { answer: '-1y' }).reason, 'unitCoefficient');
  // Written simply: 10x/12, 2x/2, x^1 and 0/2 are refused (verifier review).
  assert.equal(commit('x / 2 + x / 3', '1', 'left:likeTerms:0.1', { answer: '10x/12' }).reason, 'notLowestTerms');
  assert.equal(commit('x / 2 + x / 3', '1', 'left:likeTerms:0.1', { answer: '5x/6' }).ok, true);
  assert.equal(commit('4 * x - 3 * x', '1', 'left:likeTerms:0.1', { answer: '\\frac{2x}{2}' }).reason, 'notLowestTerms');
  assert.equal(commit('4 * x - 3 * x', '1', 'left:likeTerms:0.1', { answer: 'x^1' }).reason, 'notSimplest');
  assert.equal(commit('2 * x - 2 * x', '1', 'left:likeTerms:0.1', { answer: '0/2' }).reason, 'notLowestTerms');
  // Terms that cancel leave no "+ 0" behind.
  assert.equal(commit('2 * x - 2 * x + 5', '0', 'left:likeTerms:0.1', { answer: '0' }).expression, '5');
  assert.equal(commit('2 * x - 2 * x', '5', 'left:likeTerms:0.1', { answer: '0' }).expression, '0');
});

test('a numeric fraction must be reduced to lowest terms; a divide by 1 needs no typing', () => {
  assert.equal(commit('x + 6 / 4', '1', 'left:fraction:1', { answer: '3/2' }).ok, true);
  assert.equal(commit('x + 6 / 4', '1', 'left:fraction:1', { answer: '6/4' }).reason, 'notLowestTerms');
  assert.equal(commit('x + 6 / 4', '1', 'left:fraction:1', { answer: '-3/2' }).reason, 'sign');
  assert.equal(commit('x', 'x / 1', 'right:unit:0', {}).expression, 'x');
});

test('parentheses: after a plus sign they go with no arithmetic; after a minus the student states every sign', () => {
  // 2x + (-4x + 12) -> 2x - 4x + 12.
  const plus = commit('2 * x + 1 * (-4 * x + 12)', '2', 'left:parentheses:1', {});
  assert.equal(plus.ok, true);
  assert.equal(plus.expression, '2 * x - 4 * x + 12');
  // 3x - (-4x + 12): nothing is filled in; a missing or wrong sign is refused.
  const id = 'left:parentheses:1';
  const minus = detectSimplifyParts(regionsOf('3 * x - 1 * (-4 * x + 12)', '4'))[0];
  assert.equal(partNeedsSigns(minus), true);
  assert.equal(commit('3 * x - 1 * (-4 * x + 12)', '4', id, {}).reason, 'signsMissing');
  assert.equal(commit('3 * x - 1 * (-4 * x + 12)', '4', id, { signs: [1, 0] }).reason, 'signsMissing');
  assert.equal(commit('3 * x - 1 * (-4 * x + 12)', '4', id, { signs: [-1, 1] }).reason, 'signsWrong');
  assert.equal(commit('3 * x - 1 * (-4 * x + 12)', '4', id, { signs: [1, 1] }).reason, 'signsWrong');
  assert.equal(commit('3 * x - 1 * (-4 * x + 12)', '4', id, { signs: [1, -1] }).expression, '3 * x + 4 * x - 12');
});

test('a whole side: equal, changed, and not leaving more to simplify', () => {
  const region = { key: 'left', label: 'left side', expression: '2 * x + 1 * (-4 * x + 12)', variable: 'x' };
  assert.deepEqual(checkRegionRewrite(region, '-2x+12'), { ok: true, expression: '-2x+12' });
  assert.equal(checkRegionRewrite(region, '').reason, 'empty');
  assert.equal(checkRegionRewrite(region, '2x+12').reason, 'notEquivalentSide');
  assert.equal(checkRegionRewrite(region, '2 * x + 1 * (-4 * x + 12)').reason, 'unchanged');
  // Equal, but not simpler: x + x + 12 has like terms that 2x + 12 does not.
  assert.equal(checkRegionRewrite({ ...region, expression: '2 * x + 12' }, 'x + x + 12').reason, 'moreToSimplify');
  assert.equal(checkRegionRewrite({ ...region, expression: '2 * x + 12' }, '2(3)x - 4x + 12').reason, 'moreToSimplify');
  // "+ 0" typed is never accepted onto the board: it leaves a sum to compute.
  assert.equal(checkRegionRewrite(region, '-2x+12+0').reason, 'moreToSimplify');
  // Verifier review: new terms must be written simply, and a run of like terms is not simpler.
  const sum = { ...region, expression: '2 * x + 3 * x' };
  for (const [typed, reason] of [['x+x+x+x+x', 'moreToSimplify'], ['10x/2', 'notLowestTerms'], ['(2+3)x', 'notLowestTerms'], ['5x^1', 'notSimplest']]) {
    assert.equal(checkRegionRewrite(sum, typed).reason, reason, typed);
  }
  assert.equal(checkRegionRewrite({ ...region, expression: '2 * x - x' }, '1x').reason, 'unitCoefficient');
  assert.equal(checkRegionRewrite({ ...region, expression: '3 * x - 4 * x' }, '-1x').reason, 'unitCoefficient');
  // A term kept exactly as it was is not judged again: 3(2x) is still its own part.
  assert.equal(checkRegionRewrite({ ...region, expression: '3 * (2 * x) + 4 + 5' }, '3(2x)+9').ok, true);
  // A distribution or a reshaped fraction is not "more to simplify".
  assert.equal(checkRegionRewrite({ ...region, expression: '3 * (x + 2)' }, '3x + 6').ok, true);
  assert.equal(checkRegionRewrite({ ...region, expression: 'x / 2' }, '(1/2)x').ok, true);
});

test('a terminating coefficient may be typed as one decimal, in every route (coordinator review)', () => {
  const partOf = (left, kind, variable = 'x') => detectSimplifyParts(regionsOf(left, '4', variable)).find((part) => part.region === 'left' && part.kind === kind);
  const typedOn = (left, kind, answer, variable = 'x') => {
    const part = partOf(left, kind, variable);
    assert.ok(part, `${left}: no ${kind} part`);
    return commitSimplifyPart(regionsOf(left, '4', variable), part.id, { answer, signs: [] });
  };
  for (const [left, kind, right, wrong, variable] of [
    ['0.5 * x + 2 * x', SIMPLIFY_PART_KINDS.LIKE_TERMS, '2.5x', '2.6x'],
    ['0.25 * x + 0.1 * x', SIMPLIFY_PART_KINDS.LIKE_TERMS, '0.35x', '0.36x'],
    ['0.25 * x + 0.25 * x', SIMPLIFY_PART_KINDS.LIKE_TERMS, '0.5x', '0.6x'],
    ['-0.5 * x - 2 * x', SIMPLIFY_PART_KINDS.LIKE_TERMS, '-2.5x', '2.5x'],
    ['1.2 * y + 0.3 * y', SIMPLIFY_PART_KINDS.LIKE_TERMS, '1.5y', '1.4y', 'y'],
    ['(0.5) * (3) * x', SIMPLIFY_PART_KINDS.PRODUCT, '1.5x', '1.6x'],
  ]) {
    assert.equal(typedOn(left, kind, right, variable).ok, true, `${left} -> ${right}`);
    assert.equal(typedOn(left, kind, wrong, variable).ok, false, `${left} -> ${wrong}`);
  }
  // Still one number only, and a fraction stays in lowest terms beside it.
  assert.equal(typedOn('0.5 * x + 2 * x', SIMPLIFY_PART_KINDS.LIKE_TERMS, '5x/2').ok, true);
  assert.equal(typedOn('0.5 * x + 2 * x', SIMPLIFY_PART_KINDS.LIKE_TERMS, '0.5(5)x').ok, false);
  // The one decimal must be the coefficient itself: x/0.4 and 2.5x/1 are equal, not simplest.
  assert.equal(typedOn('0.5 * x + 2 * x', SIMPLIFY_PART_KINDS.LIKE_TERMS, 'x/0.4').reason, 'notLowestTerms');
  assert.equal(typedOn('0.5 * x + 2 * x', SIMPLIFY_PART_KINDS.LIKE_TERMS, '2.5x/1').ok, false);
  const region = { key: 'left', label: 'left side', variable: 'x' };
  assert.equal(checkRegionRewrite({ ...region, expression: '0.5 * x + 2 * x + 4' }, '2.5x + 4').ok, true);
  assert.equal(checkRegionRewrite({ ...region, expression: '0.25 * x + 0.1 * x' }, '0.35x').ok, true);
  assert.equal(checkRegionRewrite({ ...region, expression: '0.25 * x + 0.1 * x' }, '0.36x').ok, false);
});

test('every committed step reports a kind the server already accepts (Hosting-only)', () => {
  const parts = detectSimplifyParts(regionsOf('2 * x + (1) * (12) + 3 * (5 * x) + 1 * (x + 1)', '6 / 4 - 1 * (x - 2)'));
  const seen = new Set(parts.map((part) => part.kind));
  for (const kind of Object.values(SIMPLIFY_PART_KINDS)) assert.ok(seen.has(kind), `no ${kind} part in the fixture`);
  for (const part of parts) {
    assert.ok(EQUATION_REWRITE_KINDS.includes(simplifyStepFor(part).kind), `${part.kind} -> ${simplifyStepFor(part).kind}`);
    assert.ok(RELATION_STEP_KINDS.includes(simplifyStepFor(part, { host: 'relation' }).kind), `${part.kind} (relation)`);
  }
  assert.ok(EQUATION_REWRITE_KINDS.includes('student-rewrite') && RELATION_STEP_KINDS.includes('student-rewrite'));
});

// GR27: a factor of 1 after a letter, x · 1, was drawn `x1` — on the board
// and in its "Remove 1" part — which reads as "x one". A number after another
// factor is now set in brackets, as 2 · 3 already was: x(1), 2x(1).
test('GR27 — a factor of 1 after a letter is drawn x(1), on the board and in its part', async () => {
  const { expressionToLatex } = await import('../../functions/shared/algebra/algebraAstEngine.mjs');
  assert.equal(expressionToLatex('x * 1 + 2').trim(), 'x\\left(1\\right)+2');
  assert.equal(expressionToLatex('2 * x * 1 - 4').trim(), '2x\\left(1\\right)-4');
  // Unchanged: a number before a letter, two letters, and a number after a number.
  assert.equal(expressionToLatex('2 * x').trim(), '2x');
  assert.equal(expressionToLatex('b * h').trim(), 'bh');
  assert.equal(expressionToLatex('3 * 1 * x').trim(), '3\\left(1\\right)x');
  const [unit] = detectSimplifyParts(regionsOf('x * 1 + 2', '5'));
  assert.equal(unit.kind, SIMPLIFY_PART_KINDS.UNIT);
  assert.equal(unit.latex.trim(), 'x\\left(1\\right)');
});

// GR27, kept as built (the owner): a padded decimal and a long decimal for a
// fraction that does not end are the right value written as one term. Refusing
// them would mark a right answer wrong, so they stay accepted as simplest
// (writtenTermProblem's comment says why); a wrong value is still refused.
test('GR27 — padded and long decimals stay accepted as simplest; a wrong value does not', () => {
  const like = (left) => detectSimplifyParts(regionsOf(left, '7')).find((part) => part.kind === SIMPLIFY_PART_KINDS.LIKE_TERMS);
  const half = like('2 * x + 0.5 * x');
  const sixths = like('x / 2 + x / 3');
  for (const [part, answer] of [[half, '2.50x'], [half, '2.5x'], [sixths, '0.8333333333333334x'], [sixths, '\\frac{5}{6}x']]) {
    assert.equal(commitSimplifyPart(regionsOf(part === half ? '2 * x + 0.5 * x' : 'x / 2 + x / 3', '7'), part.id, { answer }).ok, true, answer);
  }
  assert.equal(checkRegionRewrite(regionsOf('2 * x + 0.5 * x')[0], '2.50x').ok, true);
  assert.equal(checkRegionRewrite(regionsOf('x / 2 + x / 3')[0], '0.8333333333333334x').ok, true);
  assert.equal(commitSimplifyPart(regionsOf('2 * x + 0.5 * x', '7'), half.id, { answer: '2.6x' }).ok, false);
  assert.equal(commitSimplifyPart(regionsOf('x / 2 + x / 3', '7'), sixths.id, { answer: '0.83x' }).ok, false);
});

// GR36: mathjs reads a typed `xy` as one name, so on a board the engine holds
// as 2·x·y + 3·x·y (drawn 2xy + 3xy) One Simplify refused the student's 5xy.
// Letters typed together now read as their product where the board has each
// of them on its own — and nowhere else.
test('GR36 — a typed 5xy is 5·x·y where the board has x and y; a board name, a function and a missing letter keep their reading', async () => {
  const { letterRunsAsProducts } = await import('../../functions/shared/algebra/latexToExpression.mjs');
  const likeOf = (left) => detectSimplifyParts(regionsOf(left, '10')).find((part) => part.kind === SIMPLIFY_PART_KINDS.LIKE_TERMS);
  const board = '2 * x * y + 3 * x * y';
  const like = likeOf(board);
  for (const answer of ['5xy', '5yx', '5x y', '5x\\cdot y']) {
    assert.equal(commitSimplifyPart(regionsOf(board, '10'), like.id, { answer }).ok, true, answer);
  }
  for (const answer of ['6xy', '5x', '5xyz', '5xy^2']) {
    assert.equal(commitSimplifyPart(regionsOf(board, '10'), like.id, { answer }).ok, false, answer);
  }
  assert.equal(checkRegionRewrite(regionsOf('2 x y + 3 x y + 4')[0], '5xy+4').ok, true, 'the whole side too');
  // The board the browser builds is one the server verifies (no server change).
  const { emptyQuestionRecord } = await import('../../functions/shared/attemptPolicy.mjs');
  const { STEP_ACTIONS, equationStepWork, verifyStepAlgebraStep } = await import('../../functions/shared/serverGrading/stepAlgebraStepVerification.mjs');
  const question = { questionId: 'q-gr36', type: 'stepAlgebra', prompt: 'Simplify.', equation: '2 * x * y + 3 * x * y + 4 = 10', workspaceDifficulty: 3 };
  const before = { left: '2 * x * y + 3 * x * y + 4', right: '10', variable: 'x' };
  const onServer = (kind, left) => verifyStepAlgebraStep({ question, record: emptyQuestionRecord(), stepWork: equationStepWork({ action: STEP_ACTIONS.REWRITE, kind, before, after: { ...before, left }, supportLevel: 3 }) }).verified;
  const sideRegions = regionsOf(before.left, '10');
  const combined = commitSimplifyPart(sideRegions, likeOf(before.left).id, { answer: '5xy' });
  assert.equal(onServer(combined.step.kind, combined.expression), true, combined.expression);
  const whole = checkRegionRewrite(sideRegions[0], '5xy+4');
  assert.equal(onServer('student-rewrite', whole.expression), true, whole.expression);
  const product = detectSimplifyParts(regionsOf('3 * 5 * x * y', '10')).find((part) => part.kind === SIMPLIFY_PART_KINDS.PRODUCT);
  assert.equal(commitSimplifyPart(regionsOf('3 * 5 * x * y', '10'), product.id, { answer: '15xy' }).ok, true);
  // A board that holds xy as ONE name keeps that reading: its own 5xy, not 5x y.
  const named = likeOf('2xy + 3xy');
  assert.equal(commitSimplifyPart(regionsOf('2xy + 3xy', '10'), named.id, { answer: '5xy' }).ok, true);
  assert.equal(commitSimplifyPart(regionsOf('2xy + 3xy', '10'), named.id, { answer: '5x y' }).ok, false);
  // Never a function, a constant, a multi-letter quantity or a subscripted name.
  assert.equal(letterRunsAsProducts('5xy', [board]), '5x y');
  assert.equal(letterRunsAsProducts('xy^2', ['x*y^2']), 'x y^2');
  assert.equal(letterRunsAsProducts('sin(x)', ['s*i*n*x']), 'sin(x)');
  assert.equal(letterRunsAsProducts('pi x', ['p*i*x']), 'pi x');
  assert.equal(letterRunsAsProducts('\\ln x', ['l*n*x']), '\\ln x');
  assert.equal(letterRunsAsProducts('Area', ['Area = l*w']), 'Area');
  assert.equal(letterRunsAsProducts('x_1y', ['x_1*y']), 'x_1y');
  assert.equal(letterRunsAsProducts('xy_1', ['x*y_1']), 'xy_1', 'part of a subscripted name');
  assert.equal(letterRunsAsProducts('xy2', ['x*y2']), 'xy2', 'part of a name with a digit');
  assert.equal(letterRunsAsProducts('2\\theta', ['t*h*e*a']), '2\\theta', 'a LaTeX command');
  assert.equal(letterRunsAsProducts('5xyz', ['x*y']), '5xyz', 'z is not on the board');
  assert.equal(letterRunsAsProducts('5xy', ['xy + x*y']), '5xy', 'a name the board uses stays that name');
});
