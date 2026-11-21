/*
 * ALGEBRA II HONORS · THANKSGIVING BREAK PACKET, AS A TEACHER IMPORTS IT.
 *
 * teacher-import-jsons/thanksgiving-packet/Algebra2_Honors_Thanksgiving_Packet.json
 * is a cumulative review students work alone over the break: eleven units in
 * the order they were taught, one Classwork section each, 72 questions, and a
 * short Practice section of six audited Digital SAT items. It is written by
 * scripts/content/build-algebra2-honors-thanksgiving-packet.mjs.
 *
 * What this holds:
 *   - the committed file is exactly what its builder writes;
 *   - it compiles the way the Assignment Creator compiles it, and Pre-Flight
 *     shows a teacher nothing: no error, warning, dropped hint or
 *     worked-solution note;
 *   - the structure: one Classwork section per unit with the agreed counts and
 *     standards, each unit from its building block to grade level, and every
 *     question with three hints, a "Let's back up" step, worked steps and the
 *     usual mistake;
 *   - worked examples: every Classwork question is covered, every authored
 *     example is a sibling problem with 3 to 6 explained steps that gives
 *     away no answer of a question that plays it, and the first question on
 *     each skill carries short guided notes;
 *   - tools: at least three questions in four are worked in a tool, and the
 *     answer boxes with three or more parts each carry a follow-through or a
 *     checkpoint;
 *   - keys: every one of the 72 answers is WORKED OUT HERE from what the
 *     student is shown (the prompt's own mathematics, the system the tool
 *     prints, the graph it draws), never read back from the key, then given
 *     to the platform's own grader, which must accept it and refuse a wrong
 *     one;
 *   - the SAT items are the bank's own, and their keys grade in every version;
 *   - Honors: the version Pre-Flight builds for an Honors class is READY,
 *     replaces nothing, and is what Create accepts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { create, all } from 'mathjs';

import { PACKET_FILE, PACKET_SAT_ITEMS, packetText } from '../../scripts/content/build-algebra2-honors-thanksgiving-packet.mjs';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { gradeMultiAnswerResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { relationWorkspaceWork, stepAlgebraWorkGrader } from '../../functions/shared/serverGrading/stepAlgebraWorkspaceGrading.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { classworkExampleCoverage } from '../../src/platform/supports/workedExample/classworkCoverage.js';
import { authoredExampleProblem, authoredExampleWarnings, authoredStepCard, lessonExampleContext } from '../../src/platform/supports/workedExample/lessonExample.js';
import { buildSimilarWorkedExample } from '../../src/platform/supports/workedExample/similarProblem.js';
import { collectReviewBlockers, summarizePreflightReadiness } from '../../src/components/teacher/preflightSteps.js';
import { HONORS_CCMR_STATUS, confirmHonorsCandidateForCreate } from '../../src/platform/assignments/canonicalCcmrHydration.js';
import {
  VERSIONS,
  auditedItemFindings,
  backUpFindings,
  compiled,
  honorsCandidateOf,
  keyFindings,
  preflightFindings,
  readRepoFile,
  reviewedModel,
  supportFindings,
  versionsOf,
} from './helpers/lessonFileChecks.mjs';

const TEXT = readRepoFile(PACKET_FILE);
const RAW = JSON.parse(TEXT);
const PACKET = compiled(TEXT);
const UNITS = RAW.sections.filter((section) => section.role === 'classwork');
const CLASSWORK = UNITS.flatMap((section) => section.questions);
const item = (id) => {
  const question = PACKET.questions.find((candidate) => candidate.questionId === id);
  assert.ok(question, `the packet compiles ${id}`);
  return question;
};
const raw = (id) => CLASSWORK.find((question) => question.questionId === id);
const failing = (result) => JSON.stringify((result.parts || []).filter((part) => !part.isCorrect).map((part) => part.id || part.label));

/* ---------------------------------------------------------------- shape -- */

test('the committed file is exactly what its builder writes', () => {
  assert.equal(TEXT, packetText(), 'run node scripts/content/build-algebra2-honors-thanksgiving-packet.mjs and commit the file');
});

test('it compiles as the Assignment Creator compiles it, and Pre-Flight shows a teacher nothing to fix', () => {
  assert.deepEqual(PACKET.model.errors, []);
  assert.deepEqual(PACKET.semantic.errors, []);
  assert.equal(PACKET.model.isValid, true);
  // Every warning, dropped hint and worked-solution note a teacher would see: none.
  assert.deepEqual(preflightFindings(TEXT), []);
  const model = reviewedModel(TEXT);
  assert.equal(model.isValid, true, model.errors.join('\n'));
  assert.equal(model.authoringState, 'ready');
});

const UNIT_PLAN = [
  ['Unit 1 — Interval notation, domain and range', 6, ['A2.7I']],
  ['Unit 2 — Parent functions and transformations', 6, ['A2.2A']],
  ['Unit 3 — Inverses, operations on functions and composition', 7, ['A2.2B', 'A2.2D']],
  ['Unit 4 — Absolute value: graphs, equations and inequalities', 8, ['A2.6C', 'A2.6D', 'A2.6E', 'A2.6F']],
  ['Unit 5 — 3×3 systems and matrices', 7, ['A2.3A', 'A2.3B']],
  ['Unit 6 — Operations on polynomials', 5, ['A2.7B']],
  ['Unit 7 — Dividing polynomials; the Remainder and Factor Theorems', 8, ['A2.7C', 'A2.7D']],
  ['Unit 8 — Factoring', 7, ['A2.7E']],
  ['Unit 9 — nth roots and operations with radical expressions', 7, ['A2.7G']],
  ['Unit 10 — Rational exponents', 5, ['A2.7G']],
  ['Unit 11 — Solving radical equations', 6, ['A2.4G', 'A2.6B', 'A2.7H']],
];

test('one review assignment: a Classwork section for each of the eleven units, in taught order, then the SAT check', () => {
  assert.equal(RAW.schemaVersion, 5);
  assert.equal(RAW.assignment.courseId, 'algebra2');
  assert.equal(RAW.assignment.instructionalPurpose, 'review');
  assert.equal(RAW.assignment.gradingPurpose, 'classwork');
  assert.equal(RAW.assignment.folder, 'Algebra II Honors/Thanksgiving Packet');
  assert.equal(/courseLevel|isHonors/.test(TEXT), false, 'Honors placement comes from the destination class, never from the file');
  assert.equal(RAW.sections.length, 12);
  assert.equal(UNITS.length, 11);
  UNIT_PLAN.forEach(([title, count, standards], index) => {
    const section = RAW.sections[index];
    assert.equal(section.id, `unit-${index + 1}`);
    assert.equal(section.role, 'classwork', `${title}: worked examples open by themselves only on Classwork`);
    assert.equal(section.title, title);
    assert.deepEqual([section.feedbackMode, section.hintsAllowed, section.attemptsAllowed], ['immediate', true, undefined], title);
    assert.equal(section.questions.length, count, title);
    assert.deepEqual([...new Set(section.questions.map((question) => question.standard))].sort(), standards, title);
    section.questions.forEach((question, place) => assert.equal(question.questionId, `tgp-u${index + 1}-${place + 1}`));
  });
  assert.equal(CLASSWORK.length, 72);
  assert.equal(PACKET.questions.length, 78, 'every question survives the import');
  const last = RAW.sections[11];
  assert.deepEqual([last.role, last.questions.length], ['practice', PACKET_SAT_ITEMS.length]);
  // Classwork is the same for everyone; only the SAT items deal each student their own numbers.
  assert.deepEqual(RAW.variantPolicy.sectionModes, { classwork: 'shared', practice: 'personalized' });
});

test('every unit starts at its building block and reaches grade level', () => {
  UNITS.forEach((section) => {
    const [first] = section.questions;
    assert.equal(first.difficultyBand, 1, `${section.title}: the first question is the building block`);
    assert.ok(first.dok <= 2, section.title);
    const bands = section.questions.map((question) => question.difficultyBand);
    assert.ok(Math.max(...bands) >= 3, `${section.title}: reaches grade level (${bands})`);
    assert.ok(bands.filter((band) => band <= 2).length >= 3, `${section.title}: at least three easy or middle questions (${bands})`);
    assert.ok(bands.at(-1) >= 3, `${section.title}: ends at grade level`);
  });
});

test('every question has a short prompt, three hints, a "Let\'s back up" step, worked steps and the usual mistake', () => {
  assert.deepEqual(supportFindings(RAW), []);
  assert.deepEqual(backUpFindings(PACKET.questions), []);
  CLASSWORK.forEach((question) => {
    const id = question.questionId;
    assert.equal(question.hints.length, 3, `${id}: three hints`);
    assert.ok(question.solutionReview.reasoning.length >= 2, `${id}: worked steps`);
    assert.ok(question.solutionReview.commonError, `${id}: the usual mistake`);
    assert.ok(question.alignments.some((alignment) => alignment.role === 'primary' && alignment.code === question.standard), `${id}: its primary standard`);
    assert.ok([1, 2, 3].includes(question.dok) && [1, 2, 3, 4].includes(question.difficultyBand), id);
    assert.ok(question.prompt.split(/(?<=[.?!])\s+/).length <= 4 && question.prompt.length <= 330, `${id}: a short prompt (${question.prompt.length} characters)`);
  });
});

/* ------------------------------------------------------ worked examples -- */

test('worked examples: every Classwork question is covered, and nothing is left for a later lesson to fill', () => {
  const { questions, summary } = classworkExampleCoverage(PACKET.model.assignmentV5);
  assert.equal(summary.total, 72);
  assert.deepEqual(questions.filter((entry) => entry.status === 'uncovered').map((entry) => entry.questionId), []);
  assert.equal(summary.covered + summary.exempt, 72);
  // A question that names an example names one the lesson has.
  assert.deepEqual(questions.filter((entry) => entry.missingExample).map((entry) => entry.questionId), []);
  // The first question of every unit has an example of its own: one the lesson
  // wrote or, for Unit 2's parent function (below), the platform's sibling.
  UNITS.forEach((section) => {
    const first = questions.find((entry) => entry.questionId === section.questions[0].questionId);
    assert.ok(['own', 'builtIn'].includes(first.status), `${section.title}: ${first.status}`);
  });
  // No example is shown where it may not be: the Practice section names none.
  RAW.sections[11].questions.forEach((question) => assert.equal(question.example, undefined, question.questionId));
});

test('worked examples: each is an authored sibling problem with 3 to 6 small steps, every step with its reason', () => {
  const { examples, referenceCards } = RAW.lessonSupports;
  const named = new Set(CLASSWORK.map((question) => question.example).filter((value) => typeof value === 'string'));
  assert.deepEqual(examples.map((example) => example.id).filter((id) => !named.has(id)), [], 'every example is opened by a question');
  assert.equal(new Set(examples.map((example) => example.id)).size, examples.length);
  const prompts = new Set(PACKET.questions.map((question) => question.prompt));
  const shown = PACKET.questions.flatMap((question) => [question.equation, question.inequalityText, question.equationLatex]).filter(Boolean).map((value) => String(value).replace(/\s/g, ''));
  examples.forEach((example) => {
    assert.equal(example.source, 'authored', example.id);
    assert.ok(example.skill && example.problem, example.id);
    assert.ok(example.steps.length >= 3 && example.steps.length <= 6, `${example.id}: ${example.steps.length} steps`);
    example.steps.forEach((step) => assert.ok(step.show && step.why, `${example.id}: a step shows something and says why`));
    assert.equal(prompts.has(example.problem), false, `${example.id} is not an item of the packet`);
    if (example.sibling?.equation) assert.equal(shown.includes(example.sibling.equation.replace(/\s/g, '')), false, `${example.id}: its equation is not an item's`);
    // A tool replay is written only for Step Algebra, in the documented vocabulary.
    if (example.moves) {
      assert.equal(example.tool, 'stepAlgebra', example.id);
      example.moves.forEach((move) => assert.ok(['subtract', 'add', 'divide', 'multiply', 'square'].includes(move.op) || move.check === true, `${example.id}: ${JSON.stringify(move)}`));
    }
  });
  assert.ok(examples.some((example) => example.moves && example.steps), 'the Step Algebra example carries its step card and its replay');
  assert.deepEqual(referenceCards, [{ id: 'cubes', skill: 'factor.sumDifferenceOfCubes', sections: ['unit-8'] }]);
});

/*
 * THE PLAYER HIDES AN EXAMPLE THAT GIVES ITS QUESTION'S ANSWER AWAY
 * (lessonExample.js authoredExampleProblem): its problem or a step holds one
 * of the question's expressions, points or words, or states one of its
 * numbers as a result. Every Classwork question is checked against the
 * example it would play, its own or the one it borrows from an earlier
 * question on its skill. A question with no authored example must have the
 * platform's sibling instead.
 */
const NO_AUTHORED_EXAMPLE = ['tgp-u2-1', 'tgp-u2-2'];
test('worked examples: none gives away the answer of a question that plays it, so the player shows every one', () => {
  assert.deepEqual(authoredExampleWarnings(PACKET.model.assignmentV5), []);
  const supports = PACKET.model.assignmentV5.lessonSupports;
  const hidden = [];
  const withoutOne = [];
  let played = 0;
  PACKET.questions.forEach((question, index) => {
    if (question.activityRole !== 'classwork') return;
    const context = lessonExampleContext({ questions: PACKET.questions, index, lessonSupports: supports, roleOf: (entry) => entry.activityRole });
    const card = authoredStepCard(context?.example);
    if (!card) { withoutOne.push(question.questionId); return; }
    const problem = authoredExampleProblem(question, card);
    if (problem) hidden.push(`${question.questionId} (${card.id}): ${problem.reason}`);
    else played += 1;
  });
  assert.deepEqual(hidden, []);
  assert.equal(played, 70);
  // Unit 2's parent functions: any honest sibling of "the domain, range and
  // vertex of x²" states the same facts (|x| has that vertex, that domain and
  // that range), so the lesson writes none and the platform's own sibling, a
  // graph on part of the plane, is the example.
  assert.deepEqual(withoutOne, NO_AUTHORED_EXAMPLE);
  NO_AUTHORED_EXAMPLE.forEach((id) => {
    assert.ok(buildSimilarWorkedExample(item(id))?.steps?.length, `${id}: the platform works a sibling`);
    assert.equal(raw(id).example, undefined);
  });
});

test('worked examples: a question that opens one carries two guided notes, the idea and a one-line example', () => {
  const byId = new Map(RAW.lessonSupports.examples.map((example) => [example.id, example]));
  CLASSWORK.forEach((question) => {
    if (typeof question.example !== 'string') {
      // No authored example: no notes, or the idea alone on a first question.
      assert.deepEqual((question.guidedNotes?.steps || []).map((step) => step.title), question.questionId === 'tgp-u2-1' ? ['Key idea'] : [], `${question.questionId}: notes belong to the first question on a skill`);
      return;
    }
    const steps = question.guidedNotes.steps;
    assert.deepEqual(steps.map((step) => step.title), ['Key idea', 'Worked example'], question.questionId);
    // The one-line example is the sibling's, so it never works the student's own item.
    assert.ok(steps[1].instruction.startsWith(byId.get(question.example).problem), question.questionId);
  });
});

/* ----------------------------------------------------------------- tools -- */

test('tools first: three questions in four are worked in a tool, and only units 9 and 10 lean on answer boxes', () => {
  const boxes = (questions) => questions.filter((question) => item(question.questionId).type === 'multiAnswer');
  assert.ok(boxes(CLASSWORK).length <= 18, `${boxes(CLASSWORK).length} of 72 are answer boxes`);
  UNITS.forEach((section, index) => {
    const share = boxes(section.questions).length / section.questions.length;
    if ([8, 9].includes(index)) assert.ok(share >= 0.8, `${section.title}: no dedicated tool`);
    else assert.ok(share <= 0.45, `${section.title}: ${boxes(section.questions).length} answer boxes`);
  });
  // No Classwork question is made only of choices.
  CLASSWORK.forEach((question) => {
    const fields = item(question.questionId).answerFields || [];
    assert.equal(fields.length > 0 && fields.every((field) => field.type === 'choice'), false, question.questionId);
  });
  assert.ok(new Set(CLASSWORK.map((question) => item(question.questionId).type)).size >= 12, 'a dozen different tools');
});

test('an answer box with three or more parts carries a follow-through or a checkpoint, and each part keeps its own key', () => {
  let held = 0;
  CLASSWORK.filter((question) => Array.isArray(question.responses)).forEach((question) => {
    question.responses.forEach((part) => assert.ok(part.id && String(part.answer).length, `${question.questionId}: every part has an id and its own answer`));
    if (question.responses.length < 3) return;
    held += 1;
    assert.ok(question.responses.some((part) => part.followThrough || part.checkpoint), `${question.questionId}: ${question.responses.length} parts`);
    question.responses.forEach((part, index) => (part.followThrough?.from || []).forEach((name) => {
      assert.ok(question.responses.slice(0, index).some((earlier) => earlier.id === name), `${question.questionId}.${part.id} builds on the earlier part ${name}`);
    }));
    // A student sees a label as written today, so no label holds a {name}.
    question.responses.forEach((part) => assert.doesNotMatch(part.label, /\{[a-z]+\}/i, `${question.questionId}.${part.id}`));
  });
  assert.ok(held >= 12, `${held} answer boxes with three or more parts`);
});

/* ------------------------------------------------------------- the math -- */

const math = create(all);
const near = (a, b, tolerance = 1e-9) => Math.abs(Number(a) - Number(b)) <= tolerance;
const minus = (text) => String(text).replace(/[−–]/g, '-');
/** The mathematics a prompt shows, span by span, in plain characters. */
const spans = (id) => [...raw(id).prompt.matchAll(/\$([^$]+)\$/g)].map((match) => minus(match[1])
  .replace(/\\le\b/g, '<=').replace(/\\ge\b/g, '>=').replace(/\\cdot/g, '*').replace(/\\circ/g, 'o').replace(/\\d?frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)'));
const span = (id, pattern) => {
  const found = spans(id).find((text) => pattern.test(text));
  assert.ok(found, `${id}: its prompt shows ${pattern}`);
  return found;
};

/* Polynomials in one letter, as coefficient lists, highest power first. */
const poly = (text) => {
  const source = minus(text).replace(/\s|\{|\}/g, '');
  const terms = source.match(/[+-]?[^+-]+/g) || [];
  const byPower = new Map();
  terms.forEach((term) => {
    const match = /^([+-]?)(\d*)(?:[a-zA-Z](?:\^(\d+))?)?$/.exec(term);
    assert.ok(match, `a polynomial term: ${term} in ${text}`);
    const hasLetter = /[a-zA-Z]/.test(term);
    const power = hasLetter ? Number(match[3] || 1) : 0;
    const size = match[2] === '' ? 1 : Number(match[2]);
    byPower.set(power, (byPower.get(power) || 0) + (match[1] === '-' ? -size : size));
  });
  const degree = Math.max(...byPower.keys());
  return Array.from({ length: degree + 1 }, (_, index) => byPower.get(degree - index) || 0);
};
const trim = (p) => { const out = [...p]; while (out.length > 1 && near(out[0], 0)) out.shift(); return out; };
const pad = (p, length) => [...Array(Math.max(0, length - p.length)).fill(0), ...p];
const addP = (p, q) => { const n = Math.max(p.length, q.length); return trim(pad(p, n).map((value, i) => value + pad(q, n)[i])); };
const scaleP = (p, k) => p.map((value) => value * k);
const subP = (p, q) => addP(p, scaleP(q, -1));
const mulP = (p, q) => {
  const out = Array(p.length + q.length - 1).fill(0);
  p.forEach((a, i) => q.forEach((b, j) => { out[i + j] += a * b; }));
  return trim(out);
};
const valueP = (p, x) => p.reduce((sum, coefficient) => sum * x + coefficient, 0);
const composeP = (outer, inner) => outer.reduce((sum, coefficient) => addP(mulP(sum, inner), [coefficient]), [0]);
const termText = (coefficient, power, letter = 'x') => {
  if (power === 0) return String(coefficient);
  const body = power === 1 ? letter : `${letter}^${power}`;
  return coefficient === 1 ? body : coefficient === -1 ? `-${body}` : `${coefficient}${body}`;
};
const polyText = (p, letter = 'x') => {
  const terms = trim(p).map((coefficient, index, list) => [coefficient, list.length - 1 - index]).filter(([coefficient]) => coefficient !== 0);
  if (!terms.length) return '0';
  return terms.map(([coefficient, power], index) => (index && coefficient > 0 ? '+' : '') + termText(coefficient, power, letter)).join('');
};
/** The terms of a polynomial as the student reads them, left to right: [coefficient, power]. */
const termsOf = (p) => trim(p).map((coefficient, index, list) => [coefficient, list.length - 1 - index]).filter(([coefficient]) => coefficient !== 0);
/** Long division, round by round: each round's quotient term, the product, and what is left. */
const divideP = (dividend, divisor) => {
  let left = [...dividend];
  const quotient = [];
  const rounds = [];
  while (left.length >= divisor.length) {
    const coefficient = left[0] / divisor[0];
    const power = left.length - divisor.length;
    const term = [coefficient, ...Array(power).fill(0)];
    const product = mulP(term, divisor);
    quotient.push(coefficient);
    left = pad(subP(left, product), left.length - 1).slice(-(left.length - 1));
    rounds.push({ term: termText(coefficient, power), product: polyText(product), left: polyText(left) });
  }
  return { quotient, remainder: trim(left.length ? left : [0]), rounds };
};
const horner = (coefficients, r) => {
  const middle = [];
  const bottom = [coefficients[0]];
  for (let index = 1; index < coefficients.length; index += 1) {
    middle.push(r * bottom[index - 1]);
    bottom.push(coefficients[index] + middle[index - 1]);
  }
  return { middle, bottom };
};
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));

/* Intervals, written the way a student types them. */
const endText = (value) => (value === null ? null : String(value));
const notation = (pieces) => pieces.map(([lo, hi, loClosed, hiClosed]) => (
  `${lo !== null && loClosed ? '[' : '('}${endText(lo) ?? '-∞'}, ${endText(hi) ?? '∞'}${hi !== null && hiClosed ? ']' : ')'}`
)).join(' ∪ ');
const drawn = (pieces) => pieces.map(([min, max, minClosed, maxClosed]) => ({ min, max, minClosed: min !== null && minClosed, maxClosed: max !== null && maxClosed }));
/** "-2 < x <= 6", "x >= -1", "x < -3": the piece of the number line it describes. */
const pieceOf = (text) => {
  const between = /^(-?\d+)\s*(<=|<)\s*x\s*(<=|<)\s*(-?\d+)$/.exec(text.trim());
  if (between) return [Number(between[1]), Number(between[4]), between[2] === '<=', between[3] === '<='];
  const ray = /^x\s*(<=|>=|<|>)\s*(-?\d+)$/.exec(text.trim());
  assert.ok(ray, `an inequality in x: ${text}`);
  return ray[1].startsWith('<') ? [null, Number(ray[2]), false, ray[1] === '<='] : [Number(ray[2]), null, ray[1] === '>=', false];
};
/** The solution set of a relation in x, read off a quarter-unit grid: its pieces, with their ends open or closed. */
const absToCall = (text) => { let out = text; for (let guard = 0; guard < 6 && out.includes('|'); guard += 1) out = out.replace(/\|([^|]*)\|/, 'abs($1)'); return out; };
const relationOf = (text) => {
  const relation = ['>=', '<=', '>', '<', '='].find((symbol) => text.includes(symbol));
  const [left, right] = text.split(relation).map((side) => math.parse(absToCall(side)).compile());
  const holds = { '=': (l, r) => near(l, r), '<': (l, r) => l < r - 1e-12, '>': (l, r) => l > r + 1e-12, '<=': (l, r) => l <= r + 1e-12, '>=': (l, r) => l >= r - 1e-12 }[relation];
  return (x) => holds(left.evaluate({ x }), right.evaluate({ x }));
};
const GRID = Array.from({ length: 321 }, (_, index) => -40 + index / 4);
const rootsOf = (text) => GRID.filter(relationOf(text));
const solutionPieces = (text) => {
  const truth = relationOf(text);
  const pieces = [];
  let start = null;
  GRID.forEach((x, index) => {
    // Between grid points the set is read at the midpoint, so an open end is seen as open.
    const inside = truth(x + 0.125);
    if (inside && start === null) start = index === 0 ? null : [x, truth(x)];
    if (!inside && start !== null) { pieces.push([start === 0 ? null : start, [x, truth(x)]]); start = null; }
    if (index === 0 && inside) start = 0;
  });
  if (start !== null) pieces.push([start === 0 ? null : start, null]);
  return pieces.map(([lo, hi]) => [lo ? lo[0] : null, hi ? hi[0] : null, Boolean(lo && lo[1]), Boolean(hi && hi[1])]);
};

/* a·f(x − h) + k, read from "2\sqrt{x + 1} - 4", "-(x - 3)^2 + 2", "2|x - 1| - 3". */
const AHK = /^\s*(-?\d*)\s*(?:\\sqrt\{x\s*([+-])\s*(\d+)\}|\(x\s*([+-])\s*(\d+)\)\^[23]|\|x\s*([+-])\s*(\d+)\|)\s*(?:([+-])\s*(\d+))?\s*$/;
const ahkOf = (text) => {
  const match = AHK.exec(text);
  assert.ok(match, `a transformed parent function: ${text}`);
  const sign = match[2] || match[4] || match[6];
  const shift = Number(match[3] || match[5] || match[7]);
  return {
    a: match[1] === '' ? 1 : match[1] === '-' ? -1 : Number(match[1]),
    h: sign === '-' ? shift : -shift,
    k: match[8] ? (match[8] === '-' ? -1 : 1) * Number(match[9]) : 0,
  };
};
const PARENTS = { quadratic: (x) => x * x, absolute: Math.abs, cubic: (x) => x ** 3, squareRoot: Math.sqrt };
const curve = ({ family, type, a, h, k }) => (x) => a * PARENTS[family || type](x - h) + k;

/* Square roots in simplest form. */
const simplestRoot = (n) => {
  let outside = 1;
  for (let k = Math.floor(Math.sqrt(n)); k > 1; k -= 1) if (n % (k * k) === 0) { outside = k; break; }
  return [outside, n / (outside * outside)];
};
const rootText = (outside, inside) => (inside === 1 ? String(outside) : `${outside === 1 ? '' : outside}√${inside}`);
const fraction = (numerator, denominator) => { const g = gcd(numerator, denominator); return denominator / g === 1 ? String(numerator / g) : `${numerator / g}/${denominator / g}`; };

/* A system the tool prints, as rows [a, b, c, d] of ax + by + cz = d. */
const rowOf = (equation, variables) => {
  const [left, right] = equation.split('=').map((side) => math.parse(side).compile());
  const at = (values) => { const scope = Object.fromEntries(variables.map((name, index) => [name, values[index]])); return left.evaluate(scope) - right.evaluate(scope); };
  const zero = at(variables.map(() => 0));
  return [...variables.map((_, index) => at(variables.map((__, other) => (other === index ? 1 : 0))) - zero), -zero];
};
const det = (m) => (m.length === 2
  ? m[0][0] * m[1][1] - m[0][1] * m[1][0]
  : m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]));
const cramer = (rows) => {
  const A = rows.map((row) => row.slice(0, -1));
  const B = rows.map((row) => row.at(-1));
  const D = det(A);
  assert.ok(!near(D, 0), 'the system has exactly one solution');
  return A.map((_, column) => det(A.map((row, r) => row.map((value, c) => (c === column ? B[r] : value)))) / D);
};

/* ------------------------------------------------------------ the graders -- */

const tool = (id, work) => gradeToolWork({ toolId: item(id).type, question: item(id), work });
const stepAlgebra = (id, work) => gradeToolCheck(stepAlgebraWorkGrader, item(id), work);
const boxes = (id, responses) => gradeMultiAnswerResponse(item(id), responses);
/** The right work is accepted and each wrong one is refused, by the grader the server runs. */
const judge = (id, grade, right, wrongs) => {
  const accepted = grade(right);
  assert.equal(accepted.isCorrect, true, `${id}: the answer worked out here is graded right (${failing(accepted)})`);
  assert.ok(wrongs.length >= 1, `${id}: a wrong answer to refuse`);
  wrongs.forEach(([what, wrong]) => assert.notEqual(grade(wrong).isCorrect, true, `${id}: ${what} is graded wrong`));
};
const judgeTool = (id, right, wrongs) => judge(id, (work) => tool(id, work), right, wrongs);
const judgeBoxes = (id, right, wrongs) => {
  assert.deepEqual(Object.keys(right).sort(), item(id).answerFields.map((field) => field.id).sort(), `${id}: every part is worked out`);
  judge(id, (responses) => boxes(id, responses), right, wrongs.map(([field, value]) => [`${field} = ${value}`, { ...right, [field]: value }]));
};

const numberLine = (id, pieces) => judgeTool(id, { intervals: drawn(pieces), notation: notation(pieces) }, [
  ['an end drawn the other way', { intervals: drawn(pieces.map(([lo, hi, a, b], index) => (index ? [lo, hi, a, b] : [lo, hi, !a, !b]))), notation: notation(pieces) }],
  ['the other bracket', { intervals: drawn(pieces), notation: notation(pieces.map(([lo, hi, a, b], index) => (index ? [lo, hi, a, b] : [lo, hi, !a, !b]))) }],
]);
const analysis = (id, answers, selections, wrongs) => judgeTool(id, { analysis: { answers, selections } }, wrongs.map(([part, value]) => [`${part} = ${value}`, { analysis: { answers: { ...answers, [part]: value }, selections } }]));

const areaModel = (id, left, right) => {
  const product = mulP(left, right);
  const terms = termsOf(left).flatMap(([a, m]) => termsOf(right).map(([b, n]) => termText(a * b, m + n)));
  judgeTool(id, { terms, product: polyText(product) }, [
    ['a cell with the wrong sign', { terms: terms.map((term, index) => (index === terms.length - 1 ? polyText(scaleP(poly(term), -1)) : term)), product: polyText(product) }],
    ['a product missing its middle terms', { terms, product: polyText([product[0], ...Array(product.length - 2).fill(0), product.at(-1)]) }],
  ]);
  return product;
};
const addSubtract = (id, first, second, operation) => {
  const result = operation === 'add' ? addP(first, second) : subP(first, second);
  const length = Math.max(first.length, second.length);
  const column = (p) => pad(p, length).map((coefficient, index) => termText(coefficient, length - 1 - index));
  const work = { sums: column(pad(result, length)), result: polyText(result), ...(operation === 'subtract' ? { opposites: column(scaleP(second, -1)) } : {}) };
  judgeTool(id, work, [
    ['a result with one coefficient off', { ...work, result: polyText(addP(result, [1, 0])) }],
    ...(operation === 'subtract' ? [['only the first sign changed', { ...work, opposites: column([-second[0], ...second.slice(1)]) }]] : []),
  ]);
  return result;
};
const longDivision = (id) => {
  const [, dividend, divisor] = /\(([^()]+)\)\s*\\div\s*\(([^()]+)\)/.exec(span(id, /\\div/));
  const { quotient, remainder, rounds } = divideP(poly(dividend), poly(divisor));
  // dividend = divisor · quotient + remainder, multiplied back here.
  assert.deepEqual(addP(mulP(poly(divisor), quotient), remainder), poly(dividend), id);
  const work = { terms: rounds.map((round) => round.term), products: rounds.map((round) => round.product), differences: rounds.map((round) => round.left), quotient: polyText(quotient), remainder: polyText(remainder) };
  judgeTool(id, work, [
    ['a remainder that is off', { ...work, remainder: polyText(addP(remainder, [1])) }],
    ['the answers with no working', { quotient: work.quotient, remainder: work.remainder }],
  ]);
  return { quotient, remainder };
};
const syntheticText = (id) => {
  const [, dividend, divisor] = /\(([^()]+)\)\s*\\div\s*\(([^()]+)\)/.exec(span(id, /\\div/));
  const coefficients = poly(dividend);
  const r = -poly(divisor)[1];
  const { middle, bottom } = horner(coefficients, r);
  assert.equal(valueP(coefficients, r), bottom.at(-1), `${id}: the last number is P(r)`);
  const work = { r: String(r), coefficients: coefficients.map(String), products: middle.map(String), sums: bottom.map(String), quotient: polyText(bottom.slice(0, -1)) };
  judgeTool(id, work, [
    ['the sign of r', { ...work, r: String(-r) }],
    // Where a power is missing, leaving its 0 out shifts every later column.
    ...(coefficients.includes(0) ? [['a missing power left out', { ...work, coefficients: coefficients.filter((value) => value !== 0).map(String) }]] : []),
    ['a quotient that keeps the degree', { ...work, quotient: polyText([...bottom.slice(0, -1), 0]) }],
  ]);
  return bottom;
};
const syntheticTable = (id, coefficients, r, asks) => {
  const { middle, bottom } = horner(coefficients, r);
  const value = valueP(coefficients, r);
  assert.equal(bottom.at(-1), value, `${id}: the remainder is P(r)`);
  const work = {
    root: String(r), top: coefficients.map(String), middle: middle.map(String), bottom: bottom.map(String), value: String(value), factorChoice: value === 0 ? 'yes' : 'no',
    ...(asks.includes('quotient') ? { quotient: polyText(bottom.slice(0, -1)) } : {}),
  };
  judgeTool(id, work, [
    ['the other answer about the factor', { ...work, factorChoice: value === 0 ? 'no' : 'yes' }],
    ['the answers with no table', { value: work.value, factorChoice: work.factorChoice, quotient: work.quotient }],
    ['r with the wrong sign', { ...work, root: String(-r) }],
  ]);
  return bottom;
};
const factorPair = (id) => {
  const [, b, c] = poly(span(id, /x\^2/)).map(Number);
  const pairs = [];
  for (let p = -Math.abs(c); p <= Math.abs(c); p += 1) if (p !== 0 && c % p === 0 && p + c / p === b && p <= c / p) pairs.push([p, c / p]);
  assert.equal(pairs.length, 1, `${id}: one pair multiplies to ${c} and adds to ${b}`);
  const [[p, q]] = pairs;
  assert.deepEqual(mulP([1, p], [1, q]), [1, b, c], `${id}: (x + p)(x + q) multiplies back`);
  judgeTool(id, { p: String(p), q: String(q) }, [
    // (For a difference of squares the pair is its own opposite, so that slip is the same answer.)
    ...(p === -q ? [['a perfect-square pair', { p: String(q), q: String(q) }]] : [['the pair with its signs traded', { p: String(-p), q: String(-q) }]]),
    ['a pair with the right product only', { p: '1', q: String(c) }],
  ]);
  return [p, q];
};
const sort = (id, groupOf) => {
  const question = item(id);
  const groups = question.categories.map((category) => ({
    id: String(category.id), name: String(category.label), rationale: '', itemIds: question.items.filter((card) => groupOf(card.label, category)).map((card) => card.id),
  }));
  assert.deepEqual(groups.flatMap((group) => group.itemIds).sort(), question.items.map((card) => card.id).sort(), `${id}: every card belongs to exactly one group`);
  groups.forEach((group) => assert.ok(group.itemIds.length >= 1, `${id}: ${group.name} has a card`));
  const moved = groups.map((group) => ({ ...group, itemIds: [...group.itemIds] }));
  moved[1].itemIds.push(moved[0].itemIds.shift());
  judgeTool(id, { groups }, [['one card in the wrong group', { groups: moved }]]);
  // The cards are not listed group by group, so the board cannot be read off in order.
  assert.notDeepEqual(question.items.map((card) => card.id), groups.flatMap((group) => group.itemIds), id);
};
const solved = (branches, connective = branches.length > 1 ? 'OR' : null) => ({ connective, branches });
const absoluteEquation = (id) => {
  const roots = rootsOf(span(id, /\|.*=/));
  assert.equal(roots.length, 2, `${id}: two solutions (${roots})`);
  const work = (values) => relationWorkspaceWork({
    relationState: solved(values.map((value) => ({ expressions: ['x', String(value)], relations: ['='] }))),
    candidateChecks: Object.fromEntries(values.map((value) => [String(value), 'valid'])),
  });
  judge(id, (attempt) => stepAlgebra(id, attempt), work(roots), [
    ['one solution only', work([roots[1]])],
    ['a solution with the wrong sign', work([roots[0], -roots[1]])],
    ['a solution marked extraneous', relationWorkspaceWork({ relationState: solved(roots.map((value) => ({ expressions: ['x', String(value)], relations: ['='] }))), candidateChecks: { [roots[0]]: 'extraneous', [roots[1]]: 'valid' } })],
  ]);
  return roots;
};
const absoluteInequality = (id) => {
  const pieces = solutionPieces(span(id, /\|/));
  const symbol = (closed) => (closed ? '<=' : '<');
  const state = pieces.length === 1
    ? solved([{ expressions: [String(pieces[0][0]), 'x', String(pieces[0][1])], relations: [symbol(pieces[0][2]), symbol(pieces[0][3])] }])
    : solved([
      { expressions: ['x', String(pieces[0][1])], relations: [symbol(pieces[0][3])] },
      { expressions: ['x', String(pieces[1][0])], relations: [pieces[1][2] ? '>=' : '>'] },
    ]);
  const work = (shown) => relationWorkspaceWork({ relationState: state, representation: { intervals: drawn(shown), notation: notation(shown), inequality: '' } });
  // The other reading of the same two boundary numbers: between them, or outside them.
  const [low, high] = pieces.length === 1 ? [pieces[0][0], pieces[0][1]] : [pieces[0][1], pieces[1][0]];
  const closed = pieces.length === 1 ? pieces[0][2] : pieces[0][3];
  const other = pieces.length === 1 ? [[null, low, false, closed], [high, null, closed, false]] : [[low, high, closed, closed]];
  judge(id, (attempt) => stepAlgebra(id, attempt), work(pieces), [
    ['the other side of the boundary numbers', work(other)],
    ['the ends drawn the other way', work(pieces.map(([lo, hi, a, b]) => [lo, hi, !a, !b]))],
  ]);
  return pieces;
};
const systemOf = (id) => { const question = item(id); return question.equations.map((equation) => rowOf(equation, question.variables || ['x', 'y', 'z'])); };
/** The system a prompt states, checked against the one the tool prints and grades: they are the same equations. */
const statedSystem = (id) => {
  const variables = item(id).variables || ['x', 'y', 'z'];
  const stated = spans(id).filter((text) => /^[-\dxyz+ ]+=\s*-?\d+$/.test(text)).map((equation) => rowOf(equation, variables));
  assert.deepEqual(stated, systemOf(id), `${id}: the prompt states the system the tool prints`);
  return stated;
};
const solveByHand = (id) => {
  const question = item(id);
  const rows = statedSystem(id);
  const solution = cramer(rows);
  rows.forEach((row) => assert.ok(near(row.slice(0, -1).reduce((sum, value, index) => sum + value * solution[index], 0), row.at(-1)), `${id}: the solution checks`));
  const work = (values) => ({
    dimension: rows.length,
    method: question.method,
    values: Object.fromEntries(question.variables.map((name, index) => [name, values[index]])),
    verification: Object.fromEntries(rows.map((row, index) => [`E${index + 1}`, { left: String(row.at(-1)), right: String(row.at(-1)) }])),
    reducedStatement: null,
    specialCase: { statementTruth: '', solutionCount: '', classification: '' },
  });
  judgeTool(id, work(solution), [
    ['one value off by one', work(solution.map((value, index) => (index === solution.length - 1 ? value + 1 : value)))],
    ['two values traded', work([solution[1], solution[0], ...solution.slice(2)])],
  ]);
  return solution;
};
const cells = (rows) => rows.map((row) => row.map(String));
const radical = (id) => {
  const [, index, radicandText, sign, outsideText, rightText] = /\\sqrt(?:\[(\d)\])?\{([^{}]+)\}\s*(?:([+-])\s*(\d+))?\s*=\s*(.+)$/.exec(span(id, /\\sqrt/));
  const n = Number(index || 2);
  const radicand = poly(radicandText);
  const outside = outsideText ? (sign === '-' ? -1 : 1) * Number(outsideText) : 0;
  const right = poly(rightText);
  const isolated = subP(right, [outside]);
  const raised = Array.from({ length: n }).reduce((product) => mulP(product, isolated), [1]);
  // raised = radicand, moved to one side: a linear or a quadratic equation.
  const zero = subP(raised, radicand);
  const candidates = [];
  for (let x = -60; x <= 60; x += 1) if (valueP(zero, x) === 0) candidates.push(x);
  assert.equal(candidates.length, zero.length - 1, `${id}: every candidate is a whole number (${candidates})`);
  const sides = (x) => [Math.sign(valueP(radicand, x)) * Math.abs(valueP(radicand, x)) ** (1 / n) + outside, valueP(right, x)];
  const rows = candidates.map((x) => { const [left, rightSide] = sides(x); return { left: String(Math.round(left * 1e6) / 1e6), right: String(rightSide), decision: near(left, rightSide, 1e-6) ? 'solution' : 'extraneous' }; });
  const solutions = candidates.filter((_, at) => rows[at].decision === 'solution');
  const list = (values) => values.map((x) => `x = ${x}`).join(', ');
  const final = (values) => (values.length ? { finalAnswer: list(values), noRealSolution: false } : { finalAnswer: '', noRealSolution: true });
  const work = { isolated: polyText(isolated), raised: polyText(raised), candidates: list(candidates), rows, ...final(solutions) };
  judgeTool(id, work, [
    ['every candidate kept, or none', { ...work, ...final(solutions.length === candidates.length ? [] : candidates), rows: rows.map((row) => ({ ...row, decision: solutions.length === candidates.length ? 'extraneous' : 'solution' })) }],
    ['the final answer with no working', final(solutions)],
    ['only one side raised to the power', { ...work, raised: polyText(isolated) === polyText(raised) ? '0' : polyText(isolated) }],
  ]);
  return { candidates, solutions };
};

/*
 * Each question's own mathematics. A check reads what the student is shown,
 * works the answer out, and hands it (and a wrong answer) to the grader.
 */
const CHECKS = {
  /* Unit 1 */
  'tgp-u1-1': (id) => numberLine(id, [pieceOf(span(id, /x/))]),
  'tgp-u1-2': (id) => numberLine(id, [pieceOf(span(id, /x/))]),
  'tgp-u1-3': (id) => {
    const pieces = spans(id).map(pieceOf);
    assert.equal(pieces.length, 2);
    assert.match(raw(id).prompt, /\$ or \$/, 'the two inequalities are joined by "or"');
    numberLine(id, pieces);
  },
  'tgp-u1-4': (id) => {
    const pairs = [...minus(raw(id).prompt).matchAll(/\((-?\d+), (-?\d+)\)/g)].map((match) => [Number(match[1]), Number(match[2])]);
    assert.equal(pairs.length, 4);
    const unique = (values) => [...new Set(values)].sort((a, b) => a - b);
    const [xs, ys] = [unique(pairs.map(([x]) => x)), unique(pairs.map(([, y]) => y))];
    const isFunction = xs.length === pairs.length;
    assert.ok(isFunction && ys.length < pairs.length, 'a function that repeats an output: the case students get wrong');
    const work = { arrows: pairs, plottedPoints: pairs, domainText: xs.join(', '), rangeText: ys.join(', '), isFunction: 'yes-definition' };
    judgeTool(id, work, [
      ['"not a function"', { ...work, isFunction: 'no-input-repeat' }],
      ['domain and range traded', { ...work, domainText: work.rangeText, rangeText: work.domainText }],
      ['an arrow reversed', { ...work, arrows: [[pairs[0][1], pairs[0][0]], ...pairs.slice(1)] }],
    ]);
  },
  'tgp-u1-5': (id) => {
    const [m, b] = poly(span(id, /f\(x\)/).split('=')[1]);
    const [lo, hi, loClosed, hiClosed] = pieceOf(span(id, /<.*x.*</));
    const f = (x) => m * x + b;
    assert.ok(m < 0, 'a falling line: the closed end is the top of the range');
    const range = [[f(hi), f(lo), hiClosed, loClosed]];
    analysis(id, { domain: notation([[lo, hi, loClosed, hiClosed]]), range: notation(range) }, {}, [
      ['range', notation([[f(hi), f(lo), loClosed, hiClosed]])],
      ['domain', notation(range)],
    ]);
  },
  'tgp-u1-6': (id) => {
    const { a, h, k } = ahkOf(span(id, /f\(x\)/).split('=')[1]);
    assert.ok(a < 0 && k > 0, 'a V that opens down from above the x-axis');
    const f = curve({ family: 'absolute', a, h, k });
    const [left, right] = [h - k / Math.abs(a), h + k / Math.abs(a)];
    assert.ok(near(f(left), 0) && near(f(right), 0) && f(h) > 0 && f(h - 1) < f(h) && f(h + 1) < f(h));
    const answers = {
      increasing: notation([[null, h, false, false]]),
      decreasing: notation([[h, null, false, false]]),
      positive: notation([[left, right, false, false]]),
      negative: notation([[null, left, false, false], [right, null, false, false]]),
    };
    analysis(id, answers, {}, [['increasing', answers.decreasing], ['positive', answers.increasing], ['negative', answers.positive]]);
  },

  /* Unit 2 */
  'tgp-u2-1': (id) => {
    const f = (x) => valueP(poly(span(id, /f\(x\)/).split('=')[1]), x);
    const lowest = GRID.reduce((best, x) => (f(x) < f(best) ? x : best));
    analysis(id, { domain: notation([[null, null]]), range: notation([[f(lowest), null, true, false]]) }, { vertex: [[lowest, f(lowest)]] }, [
      ['range', notation([[null, null]])],
      ['range', notation([[f(lowest), null, false, false]])],
    ]);
    assert.notEqual(tool(id, { analysis: { answers: { domain: '(-∞, ∞)', range: '[0, ∞)' }, selections: { vertex: [[1, 1]] } } }).isCorrect, true, 'a point that is not the vertex');
  },
  'tgp-u2-2': (id) => {
    assert.match(span(id, /f\(x\)/), /\\sqrt\{x\}/);
    const real = GRID.filter((x) => !Number.isNaN(Math.sqrt(x)));
    assert.equal(Math.min(...real), 0);
    assert.ok(real.every((x, index) => index === 0 || Math.sqrt(x) > Math.sqrt(real[index - 1])), 'it rises over its whole domain');
    const from = notation([[0, null, true, false]]);
    analysis(id, { domain: from, range: from, increasing: from }, {}, [['domain', notation([[null, null]])], ['range', notation([[null, null]])], ['increasing', '∅']]);
  },
  'tgp-u2-3': (id) => {
    // What the student is shown is the graph the lab draws.
    const drawnCurve = item(id).function;
    const f = curve(drawnCurve);
    const h = GRID.reduce((best, x) => (f(x) < f(best) ? x : best));
    const [k, a] = [f(h), f(h + 1) - f(h)];
    assert.match(span(id, /a\(x - h\)/), /y = a\(x - h\)\^2 \+ k/);
    judgeTool(id, { a: String(a), h: String(h), k: String(k) }, [
      ['h with the wrong sign', { a: String(a), h: String(-h), k: String(k) }],
      ['h and k traded', { a: String(a), h: String(k), k: String(h) }],
    ]);
  },
  'tgp-u2-4': (id) => {
    const { a, h, k } = ahkOf(span(id, /g\(x\)/).split('=')[1]);
    const work = {
      reflection: a < 0 ? 'yes' : 'no', scaleKind: Math.abs(a) > 1 ? 'stretch' : Math.abs(a) < 1 ? 'compression' : 'unchanged', scaleFactor: String(Math.abs(a)),
      horizontalReflection: 'no', horizontalScaleKind: 'unchanged', horizontalScaleFactor: '1',
      horizontalDirection: h > 0 ? 'right' : h < 0 ? 'left' : 'none', horizontalDistance: String(Math.abs(h)),
      verticalDirection: k > 0 ? 'up' : k < 0 ? 'down' : 'none', verticalDistance: String(Math.abs(k)),
    };
    assert.deepEqual([work.scaleKind, work.horizontalDirection, work.verticalDirection], ['stretch', 'left', 'down']);
    judgeTool(id, work, [
      ['a shift the way the sign looks', { ...work, horizontalDirection: 'right' }],
      ['a reflection that is not there', { ...work, reflection: 'yes' }],
      ['the stretch called a compression', { ...work, scaleKind: 'compression' }],
    ]);
  },
  'tgp-u2-5': (id) => {
    const [x, y] = /\((-?\d+), (-?\d+)\)/.exec(span(id, /^\(/)).slice(1).map(Number);
    const spec = ahkOf(spans(id).at(-1).split('=')[1]);
    assert.ok(near(y, x * x), 'the point is on y = x²');
    const image = [x + spec.h, spec.a * y + spec.k];
    assert.ok(near(curve({ family: 'quadratic', ...spec })(image[0]), image[1]), 'its image is on the new graph');
    judgeTool(id, { mappedX: String(image[0]), mappedY: String(image[1]) }, [
      ['k added before multiplying by a', { mappedX: String(image[0]), mappedY: String(spec.a * (y + spec.k)) }],
      ['x moved the wrong way', { mappedX: String(x - spec.h), mappedY: String(image[1]) }],
    ]);
  },
  'tgp-u2-6': (id) => {
    // What the student is shown is the dashed graph: its center, and the next point over.
    const dashed = curve({ family: item(id).family, ...item(id).target });
    const { a, h, k } = item(id).target;
    assert.ok(near(dashed(h), k) && near(dashed(h + 1) - k, a) && near(dashed(h - 1) - k, -a), 'the center and one step each way');
    judgeTool(id, { a: String(a), h: String(h), k: String(k) }, [
      ['no reflection', { a: String(-a), h: String(h), k: String(k) }],
      ['the center on the wrong side', { a: String(a), h: String(-h), k: String(k) }],
    ]);
  },

  /* Unit 3 */
  'tgp-u3-1': (id) => {
    const f = poly(span(id, /f\(x\)/).split('=')[1]);
    const x = Number(span(id, /^x =/).split('=')[1]);
    const out = valueP(f, x);
    assert.ok(near((out - f[1]) / f[0], x), 'undoing f returns the input');
    judgeTool(id, { inverseAnswer: String(x) }, [['f(x), not undone', { inverseAnswer: String(out) }]]);
  },
  ...Object.fromEntries(['tgp-u3-2', 'tgp-u3-3'].map((name) => [name, (id) => {
    const [m, b] = poly(span(id, /f\(x\)/).split('=')[1]);
    const inverse = [1 / m, -b / m];
    [-2, 0, 3].forEach((x) => assert.ok(near(valueP(inverse, valueP([m, b], x)), x), 'the inverse undoes f'));
    const work = (slope, intercept) => ({ equation: { left: { x: slope, y: 0, c: intercept }, right: { x: 0, y: 1, c: 0 } } });
    judgeTool(id, work(...inverse), [
      ['only x divided', work(1 / m, -b)],
      ['the sign lost', work(1 / m, b / m)],
      ['f itself', work(m, b)],
    ]);
  }])),
  'tgp-u3-4': (id) => {
    const [f, g] = [span(id, /f\(x\)/), span(id, /^g\(x\)/)].map((text) => poly(text.split('=')[1]));
    addSubtract(id, f, g, 'add');
  },
  'tgp-u3-5': (id) => {
    const [f, g] = [span(id, /f\(x\)/), span(id, /^g\(x\)/)].map((text) => poly(text.split('=')[1]));
    areaModel(id, f, g);
  },
  'tgp-u3-6': (id) => {
    const [f, g] = [span(id, /f\(x\)/), span(id, /^g\(x\)/)].map((text) => poly(text.split('=')[1]));
    const x = Number(/\(f o g\)\((-?\d+)\)/.exec(span(id, /f o g/))[1]);
    const [fog, gof] = [valueP(f, valueP(g, x)), valueP(g, valueP(f, x))];
    assert.notEqual(fog, gof, 'the order matters');
    judgeTool(id, { fogAnswer: String(fog), gofAnswer: String(gof) }, [
      ['the two orders traded', { fogAnswer: String(gof), gofAnswer: String(fog) }],
      ['the outputs multiplied', { fogAnswer: String(valueP(f, x) * valueP(g, x)), gofAnswer: String(gof) }],
    ]);
  },
  'tgp-u3-7': (id) => {
    const [f, g] = [span(id, /f\(x\)/), span(id, /^g\(x\)/)].map((text) => poly(text.split('=')[1]));
    const [fg, gf] = [composeP(f, g), composeP(g, f)];
    [-1, 2].forEach((x) => assert.ok(near(valueP(fg, x), valueP(f, valueP(g, x))) && near(valueP(gf, x), valueP(g, valueP(f, x)))));
    judgeBoxes(id, { inside: polyText(fg), square: polyText(mulP(f, f)), outside: polyText(gf) }, [
      ['square', polyText([f[0] ** 2, 0, f[1] ** 2])],
      ['outside', polyText(mulP(f, g))],
      ['inside', polyText(gf)],
    ]);
  },

  /* Unit 4 */
  'tgp-u4-1': (id) => {
    const f = curve(item(id).function);
    const h = GRID.reduce((best, x) => (f(x) < f(best) ? x : best));
    const [k, a] = [f(h), f(h + 1) - f(h)];
    judgeTool(id, { a: String(a), h: String(h), k: String(k) }, [
      ['h with the wrong sign', { a: String(a), h: String(-h), k: String(k) }],
      ['k with the wrong sign', { a: String(a), h: String(h), k: String(-k) }],
    ]);
  },
  'tgp-u4-2': (id) => {
    const spec = ahkOf(span(id, /g\(x\)/).split('=')[1]);
    const g = curve({ family: 'absolute', ...spec });
    const source = item(id).sourcePoints.map((point) => [point.x, point.y]);
    source.forEach(([x, y]) => assert.equal(y, Math.abs(x), 'each given point is on f(x) = |x|'));
    const images = source.map(([x, y]) => [x + spec.h, spec.a * y + spec.k]);
    images.forEach(([x, y]) => assert.ok(near(g(x), y), 'each image is on g'));
    const { xMin, xMax, yMin, yMax } = item(id).graphBounds;
    images.forEach(([x, y]) => assert.ok(x > xMin && x < xMax && y > yMin && y < yMax, `(${x}, ${y}) fits on the grid`));
    judgeTool(id, { plottedPoints: images }, [
      ['shifted the way the sign looks', { plottedPoints: source.map(([x, y]) => [x - spec.h, spec.a * y + spec.k]) }],
      ['k applied before a', { plottedPoints: source.map(([x, y]) => [x + spec.h, spec.a * (y + spec.k)]) }],
    ]);
  },
  'tgp-u4-3': (id) => assert.deepEqual(absoluteEquation(id), [-2, 8]),
  'tgp-u4-4': (id) => assert.deepEqual(absoluteEquation(id), [-6, 4]),
  'tgp-u4-5': (id) => {
    const text = raw(id).prompt;
    const center = Number(/set to (\d+)°F/.exec(text)[1]);
    const distance = Number(/are (\d+) degrees away/.exec(text)[1]);
    const right = { center: String(center), distance: String(distance), equation: `|T-${center}|=${distance}`, coldest: String(center - distance), warmest: String(center + distance) };
    assert.deepEqual(rootsOf(right.equation.replace(/T/g, 'x')), [center - distance, center + distance], 'the equation has exactly those two temperatures');
    judgeBoxes(id, right, [
      ['equation', `|T-${distance}|=${center}`],
      ['equation', `T-${center}=${distance}`],
      ['coldest', String(center)],
      ['warmest', String(center + 2 * distance)],
    ]);
    assert.equal(boxes(id, { ...right, equation: `|${center}-T|=${distance}` }).isCorrect, true, 'the distance written the other way round');
  },
  'tgp-u4-6': (id) => assert.deepEqual(absoluteInequality(id), [[-5, 3, false, false]]),
  'tgp-u4-7': (id) => assert.deepEqual(absoluteInequality(id), [[null, 2, false, false], [6, null, false, false]]),
  'tgp-u4-8': (id) => assert.deepEqual(absoluteInequality(id), [[-5, 1, true, true]]),

  /* Unit 5 */
  'tgp-u5-1': (id) => assert.deepEqual(solveByHand(id), [4, 3]),
  'tgp-u5-2': (id) => assert.deepEqual(solveByHand(id), [1, 2, 3]),
  'tgp-u5-3': (id) => assert.deepEqual(solveByHand(id), [3, 1, 1]),
  'tgp-u5-4': (id) => {
    // The two matrices the lab prints (a row is stored as its cells).
    const [A, B] = ['A', 'B'].map((name) => item(id).matrices[name].rows.map((row) => (Array.isArray(row) ? row : row.cells)));
    assert.equal(A[0].length, B.length, 'the inside dimensions match');
    const product = A.map((row) => B[0].map((_, column) => row.reduce((sum, value, index) => sum + value * B[index][column], 0)));
    const work = { defined: 'yes', dimensions: { rows: A.length, cols: B[0].length }, entries: cells(product) };
    judgeTool(id, work, [
      ['counts and prices added', { ...work, entries: cells(A.map((row) => [row.reduce((sum, value, index) => sum + value + B[index][0], 0)])) }],
      ['"not defined"', { ...work, defined: 'no' }],
      ['the dimensions of A', { ...work, dimensions: { rows: 2, cols: 2 } }],
    ]);
  },
  'tgp-u5-5': (id) => {
    const rows = statedSystem(id);
    const work = { A: cells(rows.map((row) => row.slice(0, -1))), B: rows.map((row) => String(row.at(-1))) };
    assert.ok(rows.some((row) => row.slice(0, -1).includes(0)), 'one equation is missing a variable');
    judgeTool(id, work, [
      ['the 0 for the missing variable in the wrong column', { ...work, A: work.A.map((row) => (row.includes('0') ? ['0', ...row.filter((value) => value !== '0')] : row)) }],
      ['a lost minus sign', { ...work, A: work.A.map((row, index) => (index ? row : row.map((value) => String(Math.abs(Number(value)))))) }],
    ]);
  },
  'tgp-u5-6': (id) => {
    const rows = statedSystem(id);
    const solution = cramer(rows);
    assert.deepEqual(solution, [2, 3, 5]);
    const work = { A: cells(rows.map((row) => row.slice(0, -1))), B: rows.map((row) => String(row.at(-1))), classification: 'one', values: solution.map(String) };
    judgeTool(id, work, [
      ['a value off by one', { ...work, values: ['2', '3', '6'] }],
      ['a lost minus sign in A', { ...work, A: work.A.map((row) => row.map((value) => String(Math.abs(Number(value))))) }],
    ]);
  },
  'tgp-u5-7': (id) => {
    const text = raw(id).prompt;
    const [items, money] = /sold (\d+) items for \$(\d+)/.exec(text).slice(1).map(Number);
    const prices = [...text.matchAll(/at \$(\d+)/g)].map((match) => Number(match[1]));
    const more = Number(/sold (\d+) more waters than chips and sandwiches together/.exec(text)[1]);
    assert.equal(prices.length, 3);
    // The three facts of the story, as the student has to write them.
    const story = [[1, 1, 1, items], [...prices, money], [1, -1, -1, more]];
    const solution = cramer(story);
    assert.ok(solution.every((count) => Number.isInteger(count) && count > 0), `whole numbers of items: ${solution}`);
    // The system the lab grades against is the story's (it is hidden from the student).
    systemOf(id).forEach((row, index) => assert.deepEqual(row, story[index], `equation ${index + 1}`));
    assert.equal(item(id).showEquations, false);
    const work = { A: cells(story.map((row) => row.slice(0, -1))), B: story.map((row) => String(row.at(-1))), classification: 'one', values: solution.map(String) };
    judgeTool(id, work, [
      ['the comparison row left as 1, 1, 1', { ...work, A: [work.A[0], work.A[1], ['1', '1', '1']] }],
      ['two counts traded', { ...work, values: [work.values[0], work.values[2], work.values[1]] }],
    ]);
  },

  /* Unit 6 */
  ...Object.fromEntries([['tgp-u6-1', 'add', '\\+'], ['tgp-u6-2', 'subtract', '-']].map(([name, operation, sign]) => [name, (id) => {
    const [, first, second] = new RegExp(`^\\(([^()]+)\\)\\s*${sign}\\s*\\(([^()]+)\\)$`).exec(span(id, /^\(/));
    addSubtract(id, poly(first), poly(second), operation);
  }])),
  'tgp-u6-3': (id) => {
    const [, left, right] = /^([^()]+)\(([^()]+)\)$/.exec(span(id, /\(/));
    assert.deepEqual(areaModel(id, poly(left), poly(right)), [6, -3, 12, 0]);
  },
  ...Object.fromEntries(['tgp-u6-4', 'tgp-u6-5'].map((name) => [name, (id) => {
    const [, left, right] = /^\(([^()]+)\)\(([^()]+)\)$/.exec(span(id, /^\(/));
    const product = areaModel(id, poly(left), poly(right));
    [-2, 1, 3].forEach((x) => assert.ok(near(valueP(product, x), valueP(poly(left), x) * valueP(poly(right), x))));
  }])),

  /* Unit 7 */
  'tgp-u7-1': (id) => assert.deepEqual(longDivision(id), { quotient: [1, 5], remainder: [0] }),
  'tgp-u7-2': (id) => assert.deepEqual(longDivision(id), { quotient: [2, 7], remainder: [10] }),
  'tgp-u7-3': (id) => assert.deepEqual(longDivision(id), { quotient: [3, 4], remainder: [0] }),
  'tgp-u7-4': (id) => assert.deepEqual(syntheticText(id), [1, 1, -2, 0]),
  'tgp-u7-5': (id) => assert.deepEqual(syntheticText(id), [1, -3, 2, 0]),
  'tgp-u7-6': (id) => {
    const P = poly(span(id, /^P\(x\) =/).split('=')[1]);
    const r = Number(/^P\((-?\d+)\)$/.exec(span(id, /^P\(-?\d+\)$/))[1]);
    const value = valueP(P, r);
    assert.notEqual(value, 0, 'this one is not a factor');
    judgeTool(id, { value: String(value), factorChoice: 'no' }, [
      ['"a factor"', { value: String(value), factorChoice: 'yes' }],
      ['P(−r)', { value: String(valueP(P, -r)), factorChoice: 'no' }],
    ]);
  },
  'tgp-u7-7': (id) => {
    const P = poly(span(id, /^P\(x\) =/).split('=')[1]);
    const r = Number(/^P\((-?\d+)\)$/.exec(span(id, /^P\(-?\d+\)$/))[1]);
    assert.deepEqual(syntheticTable(id, P, r, ['value', 'factor']).at(-1), 0);
    assert.match(span(id, /^x [+-] \d+$/), new RegExp(`^x - ${r}$`));
  },
  'tgp-u7-8': (id) => {
    const P = poly(span(id, /^P\(x\) =/).split('=')[1]);
    const r = Number(/^P\((-?\d+)\)$/.exec(span(id, /^P\(-?\d+\)$/))[1]);
    const bottom = syntheticTable(id, P, r, ['value', 'quotient', 'factor']);
    assert.deepEqual(mulP([1, -r], bottom.slice(0, -1)), P, 'P(x) = (x − r) · quotient');
    assert.deepEqual(poly(span(id, /^x [+-] \d+$/)), [1, -r]);
  },

  /* Unit 8 */
  'tgp-u8-1': (id) => {
    const terms = termsOf(poly(span(id, /x\^3/)));
    const number = terms.map(([coefficient]) => coefficient).reduce(gcd);
    const power = Math.min(...terms.map(([, exponent]) => exponent));
    const [first, second] = terms.map(([coefficient, exponent]) => termText(coefficient / number, exponent - power));
    const right = { gcf: termText(number, power), first, second, factored: `${termText(number, power)}(${first}+${second})` };
    assert.deepEqual(mulP(poly(right.gcf), addP(poly(first), poly(second))), poly(span(id, /x\^3/)), 'it multiplies back');
    judgeBoxes(id, right, [
      ['gcf', String(number)],
      ['gcf', termText(1, power)],
      ['factored', polyText(poly(span(id, /x\^3/)))],
      ['factored', `${number}(${termText(terms[0][0] / number, terms[0][1])}+${termText(terms[1][0] / number, terms[1][1])})`],
    ]);
  },
  'tgp-u8-2': (id) => assert.deepEqual(factorPair(id), [3, 4]),
  'tgp-u8-3': (id) => assert.deepEqual(factorPair(id), [-5, 3]),
  'tgp-u8-4': (id) => {
    const [p, q] = factorPair(id);
    assert.equal(p, -q, 'a difference of squares: the two numbers are opposites');
  },
  'tgp-u8-5': (id) => {
    const isSquare = (n) => n > 0 && Number.isInteger(Math.sqrt(n));
    const isCube = (n) => Number.isInteger(Math.round(Math.cbrt(Math.abs(n)))) && Math.round(Math.cbrt(Math.abs(n))) ** 3 === Math.abs(n);
    const methodOf = (label) => {
      const terms = termsOf(poly(label.replace(/²/g, '^2').replace(/³/g, '^3')));
      if (terms.length === 3) return 'trinomial';
      const [[a, m], [b, n]] = terms;
      if (m === 3 && n === 0 && isCube(a) && isCube(b)) return 'cubes';
      if (m === 2 && n === 0 && b < 0 && isSquare(a) && isSquare(-b)) return 'squares';
      assert.ok(gcd(a, b) > 1 && n >= 1, `${label} has a common factor`);
      return 'gcf';
    };
    sort(id, (label, category) => methodOf(label) === category.id);
  },
  'tgp-u8-6': (id) => {
    const [a, b, c] = poly(span(id, /x\^2/));
    const pairs = [];
    for (let m = 1; m <= a * c; m += 1) if ((a * c) % m === 0 && m + (a * c) / m === b && m <= (a * c) / m) pairs.push([m, (a * c) / m]);
    assert.equal(pairs.length, 1);
    const [[small, large]] = pairs;
    // Split the middle term and group: ax² + small·x = x(ax + small), large·x + c = (large/a)(ax + small).
    assert.equal(large * small, a * c);
    const shared = [a, small];
    const other = [1, large / a];
    assert.deepEqual(mulP(shared, other), [a, b, c], 'the factors multiply back');
    judgeBoxes(id, { ac: String(a * c), small: String(small), large: String(large), binomial: polyText(shared), factored: `(${polyText(shared)})(${polyText(other)})` }, [
      ['ac', String(c)],
      ['factored', `(x+${small})(x+${large})`],
      ['factored', polyText([a, b, c])],
      ['binomial', polyText(other)],
    ]);
  },
  'tgp-u8-7': (id) => {
    const P = poly(span(id, /x\^4/));
    const terms = termsOf(P);
    const number = terms.map(([coefficient]) => coefficient).reduce(gcd);
    const power = Math.min(...terms.map(([, exponent]) => exponent));
    const left = terms.map(([coefficient, exponent]) => [coefficient / number, exponent - power]);
    assert.deepEqual(left.map(([, exponent]) => exponent), [3, 0], 'what is left is x³ plus a number');
    const b = Math.round(Math.cbrt(left[1][0]));
    assert.equal(b ** 3, left[1][0], 'and the number is a perfect cube');
    const cubes = [[1, b], [1, -b, b * b]];
    assert.deepEqual(mulP(mulP(poly(termText(number, power)), cubes[0]), cubes[1]), P, 'it multiplies back');
    const right = { gcf: termText(number, power), left: `x^3+${left[1][0]}`, b: String(b), cubes: `(${polyText(cubes[0])})(${polyText(cubes[1])})`, factored: `${termText(number, power)}(${polyText(cubes[0])})(${polyText(cubes[1])})` };
    judgeBoxes(id, right, [
      ['cubes', `(x+${b})(x^2+${b}x+${b * b})`],
      ['factored', `${right.gcf}(${right.left})`],
      ['b', String(left[1][0])],
      ['gcf', String(number)],
    ]);
  },

  /* Unit 9 */
  'tgp-u9-1': (id) => {
    const INDEX = { '√': 2, '∛': 3, '⁴√': 4, '⁵√': 5 };
    const valueOf = (label) => {
      const [, symbol, radicandText] = /^(⁴√|⁵√|√|∛)\(?(−?\d+)\)?$/.exec(label);
      const [n, radicand] = [INDEX[symbol], Number(minus(radicandText))];
      if (radicand < 0 && n % 2 === 0) return null;
      const root = Math.sign(radicand) * Math.round(Math.abs(radicand) ** (1 / n));
      assert.equal(root ** n, radicand, `${label} is a whole number`);
      return root;
    };
    sort(id, (label, category) => (valueOf(label) === null ? category.label === 'Not a real number' : String(valueOf(label)) === minus(category.label)));
  },
  'tgp-u9-2': (id) => {
    const n = Number(/\\sqrt\{(\d+)\}/.exec(span(id, /\\sqrt/))[1]);
    const [outside, inside] = simplestRoot(n);
    judgeBoxes(id, { square: String(outside ** 2), root: String(outside), simplified: rootText(outside, inside) }, [
      ['simplified', rootText(outside ** 2, inside)],
      ['simplified', `√${n}`],
      ['square', String(inside)],
    ]);
  },
  'tgp-u9-3': (id) => {
    const [, coefficient, power] = /\\sqrt\{(\d+)x\^(\d+)\}/.exec(span(id, /\\sqrt/)).map(Number);
    const [outside, inside] = simplestRoot(coefficient);
    const even = power - (power % 2);
    assert.equal(power % 2, 1, 'an odd power: one x stays under the root');
    judgeBoxes(id, { square: `${outside ** 2}x^${even}`, root: `${outside}x^${even / 2}`, simplified: `${outside}x^${even / 2}√(${inside}x)` }, [
      ['simplified', `${outside}x^${even}√(${inside}x)`],
      ['simplified', `√(${coefficient}x^${power})`],
      ['root', `${outside ** 2}x^${even}`],
    ]);
  },
  'tgp-u9-4': (id) => {
    const [first, second] = [...span(id, /\\sqrt/).matchAll(/\\sqrt\{(\d+)\}/g)].map((match) => simplestRoot(Number(match[1])));
    assert.equal(first[1], second[1], 'like radicals once simplified');
    judgeBoxes(id, { first: rootText(...first), second: rootText(...second), coefficient: String(first[0] + second[0]), sum: rootText(first[0] + second[0], first[1]) }, [
      ['sum', `√${first[0] ** 2 * first[1] + second[0] ** 2 * second[1]}`],
      ['sum', rootText(first[0] * second[0], first[1])],
      ['first', rootText(first[0] ** 2, first[1])],
    ]);
  },
  'tgp-u9-5': (id) => {
    const [, a, m, b, n] = /^(\d+)\\sqrt\{(\d+)\} \* (\d+)\\sqrt\{(\d+)\}$/.exec(span(id, /\\sqrt/)).map(Number);
    const [outside, inside] = simplestRoot(m * n);
    assert.ok(outside > 1, 'the product still has a perfect-square factor to take out');
    judgeBoxes(id, { outside: String(a * b), inside: String(m * n), root: rootText(outside, inside), coefficient: String(a * b * outside), product: rootText(a * b * outside, inside) }, [
      ['product', rootText(a * b, m * n)],
      ['product', rootText(a * b, inside)],
      ['inside', String(m + n)],
    ]);
    assert.ok(near(a * Math.sqrt(m) * b * Math.sqrt(n), a * b * outside * Math.sqrt(inside)));
  },
  'tgp-u9-6': (id) => {
    const [, top, n] = /\\dfrac\{(\d+)\}\{\\sqrt\{(\d+)\}\}/.exec(span(id, /\\sqrt/)).map(Number);
    assert.equal(top % n, 0, 'the outside numbers divide evenly');
    judgeBoxes(id, { multiplier: `√${n}`, bottom: String(n), top: rootText(top, n), quotient: String(top / n), simplified: rootText(top / n, n) }, [
      ['simplified', rootText(top, n)],
      ['simplified', String(top / n)],
      ['bottom', String(n * n)],
    ]);
    assert.ok(near(top / Math.sqrt(n), (top / n) * Math.sqrt(n)));
  },
  'tgp-u9-7': (id) => {
    const [, a, n, b, sign] = /^\((\d+) \+ \\sqrt\{(\d+)\}\)\((\d+) ([+-]) \\sqrt\{\2\}\)$/.exec(span(id, /\\sqrt/));
    const [p, q, s] = [Number(a), Number(b), sign === '-' ? -1 : 1];
    // (p + √n)(q + s√n) = pq + (ps + q)√n + sn
    const [whole, radical] = [p * q + s * Number(n), p * s + q];
    assert.ok(near((p + Math.sqrt(n)) * (q + s * Math.sqrt(n)), whole + radical * Math.sqrt(n)));
    judgeBoxes(id, { first: String(p * q), middle: rootText(radical, Number(n)), last: String(s * Number(n)), whole: String(whole), product: `${whole}+${rootText(radical, Number(n))}` }, [
      ['product', rootText(whole + radical, Number(n))],
      ['last', String(-s * Number(n))],
      ['whole', String(p * q - s * Number(n))],
    ]);
  },

  /* Unit 10 */
  'tgp-u10-1': (id) => {
    const X = 2.7;
    const power = (label) => {
      const nested = /^\(x\^\((\d+)\/(\d+)\)\)\^(\d+)$/.exec(label);
      if (nested) return (Number(nested[1]) / Number(nested[2])) * Number(nested[3]);
      const [, top, bottom] = /^x\^\((\d+)\/(\d+)\)$/.exec(label);
      return Number(top) / Number(bottom);
    };
    const radicalValue = (label) => {
      const [, symbol, inner] = /^(√|∛)\(?(x[²³]?)\)?$/.exec(label);
      const insidePower = inner.endsWith('²') ? 2 : inner.endsWith('³') ? 3 : 1;
      return (X ** insidePower) ** (1 / (symbol === '√' ? 2 : 3));
    };
    sort(id, (label, category) => near(X ** power(label), radicalValue(category.label), 1e-9));
  },
  'tgp-u10-2': (id) => {
    const [, base, top, bottom] = /^(\d+)\^(\d+)\/(\d+)$/.exec(span(id, /\^/).replace(/[{}]/g, '')).map(Number);
    const root = Math.round(base ** (1 / bottom));
    assert.equal(root ** bottom, base);
    judgeBoxes(id, { root: String(root), value: String(root ** top) }, [['value', String((base * top) / bottom)], ['value', String(base ** top)], ['root', String(Math.round(Math.sqrt(base)))]]);
  },
  'tgp-u10-3': (id) => {
    const [, base, top, bottom] = /^(\d+)\^-(\d+)\/(\d+)$/.exec(span(id, /\^/).replace(/[{}]/g, '')).map(Number);
    const root = Math.round(base ** (1 / bottom));
    assert.equal(root ** bottom, base);
    const why = item(id).answerFields.find((field) => field.id === 'why');
    const reason = why.options.filter((option) => /one over/.test(option) && /positive/.test(option));
    assert.equal(reason.length, 1);
    judgeBoxes(id, { root: String(root), power: String(root ** top), value: `1/${root ** top}`, why: reason[0] }, [
      ['value', String(-(root ** top))],
      ['value', String(root ** top)],
      ['why', why.options.find((option) => option !== reason[0])],
    ]);
    assert.ok(near(base ** (-top / bottom), 1 / root ** top));
  },
  'tgp-u10-4': (id) => {
    const product = /^x\^(\d+)\/(\d+) \* x\^(\d+)\/(\d+)$/.exec(span(id, /\*/).replace(/[{}]/g, '')).slice(1).map(Number);
    const power = /^\(x\^(\d+)\/(\d+)\)\^(\d+)$/.exec(span(id, /^\(x/).replace(/[{}]/g, '')).slice(1).map(Number);
    const sum = fraction(product[0] * product[3] + product[2] * product[1], product[1] * product[3]);
    const times = fraction(power[0] * power[2], power[1]);
    assert.ok(Number.isInteger(Number(times)), 'the power of a power comes out whole');
    judgeBoxes(id, { sum, product: `x^(${sum})`, times, power: `x^${times}` }, [
      ['product', `x^(${fraction(product[0] * product[2], product[1] * product[3])})`],
      ['power', `x^(${fraction(power[0] + power[2] * power[1], power[1])})`],
      ['sum', fraction(product[0] * product[2], product[1] * product[3])],
    ]);
  },
  'tgp-u10-5': (id) => {
    // A square root (index 2) times a root with the index the prompt shows.
    const [first, second] = [2, Number(/^\\sqrt\{x\} \* \\sqrt\[(\d)\]\{x\}$/.exec(span(id, /\\sqrt/))[1])];
    // 1/first + 1/second, in lowest terms: the numerator is the power, the denominator the index.
    const sum = fraction(first + second, first * second);
    const [top, bottom] = sum.split('/').map(Number);
    assert.ok(bottom < first * second, 'the sum has to be reduced');
    judgeBoxes(id, { first: `x^(1/${first})`, second: `x^(1/${second})`, sum, product: `x^(${sum})`, radical: `root(${bottom})(x^${top})` }, [
      ['product', `x^(1/${first * second})`],
      ['radical', `root(${first * second})(x^2)`],
      ['first', 'x^2'],
      ['sum', fraction(2, first + second)],
    ]);
    assert.ok(near(Math.sqrt(2.7) * 2.7 ** (1 / second), 2.7 ** (top / bottom)));
  },

  /* Unit 11 */
  'tgp-u11-1': (id) => assert.deepEqual(radical(id), { candidates: [13], solutions: [13] }),
  'tgp-u11-2': (id) => {
    const [, radicandText, outsideText, rightText] = /^\\sqrt\{([^{}]+)\} - (\d+) = (\d+)$/.exec(span(id, /\\sqrt/));
    const radicand = poly(radicandText);
    const isolated = Number(rightText) + Number(outsideText);
    const x = (isolated ** 2 - radicand[1]) / radicand[0];
    const left = Math.sqrt(valueP(radicand, x)) - Number(outsideText);
    assert.ok(Number.isInteger(x) && near(left, Number(rightText)), 'the candidate checks in the original equation');
    const work = (value, choice = 'valid') => relationWorkspaceWork({
      relationState: solved([{ expressions: ['x', String(value)], relations: ['='] }]),
      candidateChecks: { [value]: { choice, left: String(Math.sqrt(valueP(radicand, value)) - Number(outsideText)), right: rightText } },
      solutionSet: choice === 'valid' ? { none: false, values: [String(value)] } : { none: true, values: [] },
    });
    assert.equal(x, 12);
    judge(id, (attempt) => stepAlgebra(id, attempt), work(x), [
      ['squared before isolating', work((Number(rightText) ** 2 - radicand[1]) / radicand[0])],
      ['the solution called extraneous', work(x, 'extraneous')],
    ]);
  },
  'tgp-u11-3': (id) => assert.deepEqual(radical(id), { candidates: [12], solutions: [12] }),
  'tgp-u11-4': (id) => assert.deepEqual(radical(id), { candidates: [8], solutions: [] }),
  'tgp-u11-5': (id) => assert.deepEqual(radical(id), { candidates: [-1, 2], solutions: [2] }),
  'tgp-u11-6': (id) => {
    const [, shift, top, bottom, right] = /^\(x \+ (\d+)\)\^(\d+)\/(\d+) = (\d+)$/.exec(span(id, /=/).replace(/[{}]/g, '')).map(Number);
    const root = Math.round(right ** (1 / top));
    assert.equal(root ** top, right);
    const value = root ** bottom;
    const x = value - shift;
    assert.ok(near((x + shift) ** (top / bottom), right), 'the solution checks');
    judgeBoxes(id, { power: fraction(bottom, top), root: String(root), value: String(value), solution: String(x) }, [
      ['solution', String(value)],
      ['value', String((right * bottom) / top)],
      ['power', fraction(top, bottom)],
    ]);
  },
};

test('keys: every Classwork answer, worked out here from what the student is shown, is graded right, and a wrong one wrong', () => {
  assert.deepEqual(CLASSWORK.map((question) => question.questionId).filter((id) => !CHECKS[id]), [], 'every question has its mathematics worked out here');
  assert.equal(Object.keys(CHECKS).length, 72);
  // Every question is checked even when one fails, so the report names them all.
  const problems = [];
  CLASSWORK.forEach((question) => {
    try {
      CHECKS[question.questionId](question.questionId);
    } catch (error) {
      problems.push(`${question.questionId}: ${String(error.message).split('\n').slice(0, 6).join(' ')}`);
    }
  });
  assert.deepEqual(problems, []);
});

test('keys: no answer box hands a student one part\'s answer in another part', () => {
  const { problems, versionsChecked } = keyFindings(PACKET.questions);
  assert.deepEqual(problems, []);
  assert.ok(versionsChecked >= 16 + PACKET_SAT_ITEMS.length * VERSIONS, `${versionsChecked} versions graded`);
});

/* ------------------------------------------------------- SAT and Honors -- */

test('the SAT check: six audited items, the bank\'s own, on standards the packet reviews, each with a version for every student', () => {
  assert.deepEqual(auditedItemFindings(RAW), []);
  const taught = new Set(CLASSWORK.map((question) => question.standard));
  const sat = PACKET.questions.filter((question) => question.ccmrSource);
  assert.deepEqual(sat.map((question) => question.ccmrSource.documentId), PACKET_SAT_ITEMS.map((entry) => entry.documentId));
  sat.forEach((question) => {
    assert.equal(question.sectionId, 'sat-check');
    assert.ok(taught.has(question.standard), `${question.questionId}: ${question.standard} is reviewed in the packet`);
    assert.ok(versionsOf(question, VERSIONS).length >= VERSIONS, `${question.questionId}: a version for each of ${VERSIONS} students`);
  });
  // None was used by an earlier Algebra II Honors lesson or review (students have done those).
  const earlier = ['algebra2-honors-dol2/District_DOL2_Absolute_Value_and_3x3_Systems_Review.json', 'algebra2-honors-radicals/L1_nth_Roots.json', 'algebra2-honors-radicals/L2_Operations_with_Radical_Expressions.json', 'algebra2-honors-radicals/L3_Rational_Exponents.json']
    .map((file) => readRepoFile(`teacher-import-jsons/${file}`)).join('\n');
  PACKET_SAT_ITEMS.forEach((entry) => assert.equal(earlier.includes(entry.documentId), false, entry.documentId));
});

test('Honors: the version Pre-Flight builds for an Honors class is READY, replaces nothing, and is what Create accepts', () => {
  const model = reviewedModel(TEXT);
  const candidate = honorsCandidateOf(model.assignmentV5);
  assert.equal(candidate.status, HONORS_CCMR_STATUS.READY, candidate.errors.join('\n'));
  assert.equal(candidate.model.isValid, true, candidate.errors.join('\n'));
  assert.deepEqual(candidate.model.warnings || [], []);
  assert.deepEqual(candidate.sourced, [], 'the file already holds its CCMR Practice: nothing is swapped in');
  // Six Practice items: round(6 × 0.15) = 1, met six times over by the audited items already there.
  assert.equal(candidate.targetCount, 1);
  assert.equal(candidate.sourcedCount, PACKET_SAT_ITEMS.length);
  assert.equal(candidate.honorsReport.isHonorsReady, true, `missing: ${candidate.honorsReport.missing}`);
  assert.deepEqual([candidate.honorsReport.checks.higherOrderReasoning, candidate.honorsReport.checks.justification, candidate.honorsReport.checks.modelingApplication, candidate.honorsReport.checks.ccmrEnrichment], [true, true, true, true]);
  // Every question of every section is the file's own, in the file's order.
  const keyOf = (question) => JSON.stringify([question.questionId, question.prompt]);
  assert.deepEqual(
    candidate.assignmentV5.sections.map((section) => section.questions.map(keyOf)),
    model.assignmentV5.sections.map((section) => section.questions.map(keyOf)),
  );
  const readiness = summarizePreflightReadiness({
    blockers: collectReviewBlockers({
      draft: { title: 'Thanksgiving Break Packet', assignedClassIds: ['honors-1'], dueAt: '2099-01-01T12:00' },
      honorsSelected: true,
      honorsReport: candidate.honorsReport,
      honorsCcmr: { status: candidate.status, errors: candidate.errors },
    }),
    validationErrors: [],
    bundleIsValid: true,
  });
  assert.equal(readiness.canCreate, true);
  const created = confirmHonorsCandidateForCreate({ honorsCandidate: candidate, reviewedAssignmentV5: model.assignmentV5, honorsEnrichmentQuestion: null });
  assert.deepEqual(created.assignmentV5, candidate.assignmentV5);
});
