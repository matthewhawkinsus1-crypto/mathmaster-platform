import test from 'node:test';
import assert from 'node:assert/strict';

import { buildExpressionMeaningReview } from '../../src/tools/shared/reviews/expressionMeaningReview.js';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';

/*
 * JOB K AUDIT — THE MEANING-MAP WORKED SOLUTION, CHECKED INDEPENDENTLY.
 *
 * The matrix has no arithmetic: its answer is, per row, the bank option that
 * reads as the authored unit, meaning and role. Over 300 seeded questions
 * (answers authored in another case or spacing than the bank, decoy options,
 * numeric ids, repeated answers across rows) and the edge cases, every row the
 * review names is read back from its text and checked here, with this file's
 * own normaliser — never the tool's: each pick is an entry of that column's
 * bank exactly as written, it reads as the authored answer, every row is
 * covered once in matrix order, and the shared grader marks the picks correct
 * and complete. Where the review is null, the question really has no
 * followable answer (an answer no button carries, a duplicate row id, …).
 */

const TOOL_ID = 'expressionMeaning';
const DIMENSIONS = ['unit', 'contextMeaning', 'mathRole'];
const BANK_KEY = { unit: 'units', contextMeaning: 'contextMeanings', mathRole: 'mathRoles' };
const LABEL = { unit: 'Unit', contextMeaning: 'Contextual meaning', mathRole: 'Mathematical role' };
const grade = (question, work) => gradeToolWork({ toolId: TOOL_ID, question, work });
const same = (left, right) => String(left).trim().toLowerCase().split(/\s+/).join(' ') === String(right).trim().toLowerCase().split(/\s+/).join(' ');

const prng = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const int = (random, low, high) => low + Math.floor(random() * (high - low + 1));
const pick = (random, list) => list[Math.floor(random() * list.length)];

const UNITS = ['dollars', 'dollars per hour', 'hours', 'miles', 'miles per hour', 'people', 'tickets', 'degrees per minute'];
const MEANINGS = ['starting balance', 'cost of each ticket', 'number of hours worked', 'total distance after t hours', 'fixed fee charged once', 'temperature drop each minute', 'people at the event'];
const ROLES = ['rate of change / slope', 'y-intercept / initial value', 'independent variable', 'dependent variable', 'coefficient', 'constant term'];
const EXPRESSIONS = ['15', '-45', '(t - 3)', '12n', 'C', '2.5h', '$40', 'x + 7', '0.5', 'd/t'];

// The way a teacher retypes an option: another case, extra spaces.
const retype = (random, text) => {
  const variants = [text, text.toUpperCase(), `  ${text}  `, text.replace(/ /g, '  '), text[0].toUpperCase() + text.slice(1)];
  return pick(random, variants);
};

const drawQuestion = (random, index) => {
  const rows = int(random, 1, 6);
  const banks = { units: [...UNITS], contextMeanings: [...MEANINGS], mathRoles: [...ROLES] };
  const expressions = Array.from({ length: rows }, (_, row) => ({
    id: random() < 0.3 ? row + 1 : `row-${row}`,
    expression: pick(random, EXPRESSIONS),
    unit: retype(random, pick(random, UNITS)),
    contextMeaning: retype(random, pick(random, MEANINGS)),
    mathRole: retype(random, pick(random, ROLES)),
  }));
  return { type: TOOL_ID, questionId: `audit-${index}`, expressions, choiceBanks: banks };
};

// The review's steps read back: "For <expr>: it stands for “…”, it is measured in “…”, and its mathematical role is “…”."
const STEP = /^For (.+): it stands for “(.+)”, it is measured in “(.+)”, and its mathematical role is “(.+)”\. Choose those three options in its row\.$/;

const auditQuestion = (question, label) => {
  const model = buildExpressionMeaningReview(question);
  assert.ok(model, `${label}: a review`);
  const texts = [model.title, model.why, model.note, ...model.steps, ...model.items.flatMap((item) => [item.label, item.value])].filter(Boolean);
  texts.forEach((text) => assert.doesNotMatch(text, /undefined|NaN|Infinity|\[object|\bnull\b/, `${label}: "${text}"`));
  assert.equal(model.steps.length, question.expressions.length + 1, `${label}: an intro and one step per row`);
  assert.equal(model.items.length, question.expressions.length, `${label}: one item per row`);

  const assignments = {};
  question.expressions.forEach((expr, row) => {
    const match = model.steps[row + 1].match(STEP);
    assert.ok(match, `${label}: row ${row + 1} step "${model.steps[row + 1]}"`);
    assert.equal(match[1], String(expr.expression).trim(), `${label}: row ${row + 1} names its own expression`);
    const picks = { contextMeaning: match[2], unit: match[3], mathRole: match[4] };
    DIMENSIONS.forEach((dimension) => {
      const bank = question.choiceBanks[BANK_KEY[dimension]];
      assert.ok(bank.some((option) => String(option).trim() === picks[dimension]), `${label}: "${picks[dimension]}" is a ${dimension} button`);
      assert.ok(same(picks[dimension], expr[dimension]), `${label}: "${picks[dimension]}" reads as the authored ${dimension} "${expr[dimension]}"`);
    });
    // The item for the row says the same three picks.
    const item = model.items[row];
    assert.equal(item.label, String(expr.expression).trim(), `${label}: item label`);
    assert.equal(item.value, DIMENSIONS.map((dimension) => `${LABEL[dimension]}: ${picks[dimension]}`).join(' · '), `${label}: item value`);
    assignments[expr.id] = picks;
  });

  // The work the matrix submits for those taps, graded by the shared grader.
  const work = { selections: question.expressions.map((expr) => ({ id: expr.id, ...assignments[expr.id] })) };
  const result = grade(question, work);
  assert.equal(result.isCorrect, true, `${label}: graded correct`);
  assert.equal(result.isComplete, true, `${label}: complete`);
  assert.equal(result.score, 1, `${label}: full credit`);
  // And one changed pick is not.
  const first = question.expressions[0];
  const wrong = question.choiceBanks.units.find((option) => !same(option, first.unit));
  const changed = { selections: work.selections.map((entry, row) => (row ? entry : { ...entry, unit: wrong })) };
  assert.equal(grade(question, changed).isCorrect, false, `${label}: a changed pick is refused`);
};

test('300 seeded meaning maps: every pick is a bank button reading as the authored answer, and the grader accepts the map', () => {
  const random = prng(0xe9);
  for (let index = 0; index < 300; index += 1) {
    const question = drawQuestion(random, index);
    // '$40' renders as currency, so every drawn question is quotable as written.
    auditQuestion(question, `draw ${index}`);
  }
});

test('null only when the map cannot be followed: an answer no button carries, a duplicate row, no rows, or text that would render as math', () => {
  const base = drawQuestion(prng(7), 0);
  const variants = {
    'answer missing from the bank': { ...base, expressions: base.expressions.map((expr, row) => (row ? expr : { ...expr, unit: 'furlongs' })) },
    'duplicate id (1 and "1")': { ...base, expressions: [{ ...base.expressions[0], id: 1 }, { ...base.expressions[0], id: '1' }] },
    'no expressions': { ...base, expressions: [] },
    'TeX expression': { ...base, expressions: [{ ...base.expressions[0], expression: '$3x$ + $2$' }] },
    'blank answer': { ...base, expressions: [{ ...base.expressions[0], mathRole: '  ' }] },
  };
  Object.entries(variants).forEach(([label, question]) => {
    assert.doesNotThrow(() => buildExpressionMeaningReview(question), label);
    assert.equal(buildExpressionMeaningReview(question), null, label);
  });
});
