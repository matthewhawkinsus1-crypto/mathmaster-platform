/*
 * ALGEBRA I · DISTRICT DOL #4 MAKEUP, AS A TEACHER IMPORTS IT.
 *
 * teacher-import-jsons/algebra1-dol4/Algebra1_DOL4_Makeup.json is the makeup
 * for students who did not pass DOL #4 (SY26-27), which they took in
 * Eduphoria. It is a parallel form: question n of the makeup tests the skill
 * of question n of the DOL, in the same order, with new numbers and new
 * situations, so a student cannot pass it by remembering the DOL's answers:
 *
 *    1 A.3B  rate of change and y-intercept from a table (x-steps not 1)
 *    2 A.5A  (a/b)(x − p) = (c/b)(x − q)
 *    3 A.2A  range (and domain) of a decreasing segment, as inequalities
 *    4 A.3C  graph a line from a fractional slope and a y-intercept
 *    5 A.3E  g(x) = f(x) + k, f(x) = x: the move and the y-intercepts
 *    6 A.5A  a(x + p) = c(x − q)
 *    7 A.2A  discrete domain from a payment table
 *    8 A.12C first four terms of aₙ = aₙ₋₁ + d, decimal d
 *    9 A.2B  point-slope equation of a graphed line through two marked points
 *   10 A.3C  intercepts read from a graphed line
 *   11 A.5A  (a/b)x + p = c((1/d)x + q)
 *   12 A.2C  flat fee plus cost per mile from two customers
 *   13 A.4C  linear model for hourly customers, by regression
 *
 * Everything reads the file through the chain a teacher's import uses
 * (scripts/check-teacher-import.mjs), and every verdict comes from the
 * graders the server runs. Each key is worked out HERE from what the student
 * is shown — never read back from the compiled question — so a key that is
 * wrong cannot pass by agreeing with itself.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fraction from 'fraction.js';
import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { gradeServerResponse, gradeToolWork, serverResponseGradingSupport } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { deliveredQuestionForGrading } from '../../functions/shared/serverGrading/deliveredQuestion.mjs';
import { gradeComposedWorkflowWork } from '../../functions/shared/serverGrading/questionGraders/composedWorkflow.mjs';
import { keyProcessLog } from '../../functions/shared/toolMath/representationBridge/lmrProcessVerify.mjs';
import { equationWorkspaceWork, stepAlgebraWorkGrader } from '../../functions/shared/serverGrading/stepAlgebraWorkspaceGrading.mjs';
import { gradeMultiAnswerResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { backUpStepFor, backUpStepWritten } from '../../src/platform/supports/feedback/backUpStep.js';
import { auditAssignmentSolutionReviews, hasAuthoredCommonError, workedSolutionDepth } from '../../src/platform/preflight/solutionReviewPreflight.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const MAKEUP_FILE = path.resolve(here, '../../teacher-import-jsons/algebra1-dol4/Algebra1_DOL4_Makeup.json');
const TEXT = fs.readFileSync(MAKEUP_FILE, 'utf8');
const RAW = JSON.parse(TEXT);
const MAKEUP = compileTeacherImport(TEXT);
const item = (id) => {
  const question = MAKEUP.questions.find((candidate) => candidate.questionId === id);
  assert.ok(question, `the makeup compiles ${id}`);
  return question;
};
const rawItem = (id) => RAW.sections[0].questions.find((question) => question.questionId === id);
const failing = (result) => JSON.stringify((result.parts || []).filter((part) => !part.isCorrect).map((part) => part.id || part.label));
const frac = (value) => new Fraction(String(value).replace(/−/g, '-'));
const lineThrough = ([x1, y1], [x2, y2]) => {
  const m = frac(y2).sub(y1).div(frac(x2).sub(x1));
  return { m, b: frac(y1).sub(m.mul(x1)) };
};
const onLine = ({ m, b }, [x, y]) => m.mul(x).add(b).equals(y);

/** The one solution of the linear equation `left = right` in `variable`, worked exactly from the text. */
const solveLinear = (equation, variable) => {
  const [left, right] = equation.split('=');
  // Each side is linear in the variable, so its value at 0 and at 1 fixes it.
  const at = (side, value) => {
    const expression = side.replace(/\s+/g, '').replace(new RegExp(variable, 'g'), `(${value})`)
      .replace(/\)\(/g, ')*(').replace(/(\d)\(/g, '$1*(');
    // Only digits, operators and parentheses are left; evaluate with fractions.
    assert.match(expression, /^[\d+\-*/().]+$/, expression);
    const tokens = expression.match(/\d+|[+\-*/()]/g);
    let index = 0;
    const peek = () => tokens[index];
    const next = () => tokens[index++];
    const factor = () => {
      if (peek() === '-') { next(); return factor().neg(); }
      if (peek() === '(') { next(); const value = sum(); assert.equal(next(), ')'); return value; }
      return new Fraction(next());
    };
    const product = () => {
      let value = factor();
      while (peek() === '*' || peek() === '/') value = next() === '*' ? value.mul(factor()) : value.div(factor());
      return value;
    };
    const sum = () => {
      let value = product();
      while (peek() === '+' || peek() === '-') value = next() === '+' ? value.add(product()) : value.sub(product());
      return value;
    };
    const result = sum();
    assert.equal(index, tokens.length, expression);
    return result;
  };
  const difference = (value) => at(left, value).sub(at(right, value));
  const slope = difference(1).sub(difference(0));
  assert.ok(!slope.equals(0), `${equation} has one solution`);
  return difference(0).neg().div(slope);
};

/* ------------------------------------------------------------ the shape -- */

test('the makeup passes the teacher import\'s Pre-Flight with no errors and no warnings, and hides none of its hints', () => {
  assert.deepEqual(MAKEUP.model.errors, []);
  assert.deepEqual(MAKEUP.model.warnings || [], []);
  assert.equal(MAKEUP.model.isValid, true);
  assert.deepEqual(MAKEUP.semantic.errors, []);
  assert.deepEqual(MAKEUP.model.hiddenHints?.warnings || [], []);
  assert.deepEqual(MAKEUP.model.hintAnswers?.warnings || [], []);
});

test('it is one Practice section of 13 equal questions, filed with the DOL makeups', () => {
  assert.equal(RAW.assignment.courseId, 'algebra1');
  assert.equal(RAW.assignment.folder, 'Algebra I/DOL Makeups');
  assert.equal(RAW.sections.length, 1);
  const [practice] = RAW.sections;
  assert.equal(practice.role, 'practice');
  assert.equal(practice.attemptsAllowed, 3);
  assert.equal(practice.hintsAllowed, true);
  assert.equal(practice.feedbackMode, 'immediate');
  assert.equal(MAKEUP.questions.length, 13, 'every question survives the import');
  for (const question of MAKEUP.questions) assert.equal(Number(question.questionWeight), 1, `${question.questionId} is worth one question`);
});

test('question n tests the TEKS of DOL #4 question n, in the DOL\'s order', () => {
  const DOL4 = ['A.3B', 'A.5A', 'A.2A', 'A.3C', 'A.3E', 'A.5A', 'A.2A', 'A.12C', 'A.2B', 'A.3C', 'A.5A', 'A.2C', 'A.4C'];
  assert.deepEqual(MAKEUP.questions.map((question) => question.questionId), DOL4.map((_, index) => `dol4-makeup-q${String(index + 1).padStart(2, '0')}`));
  MAKEUP.questions.forEach((question, index) => {
    const primary = question.alignments.filter((alignment) => alignment.role === 'primary');
    assert.equal(primary.length, 1, `${question.questionId} has one primary standard`);
    assert.equal(primary[0].code, DOL4[index], question.questionId);
  });
});

test('every question is graded by the server, and most of them in an interactive tool', () => {
  for (const question of MAKEUP.questions) {
    const support = serverResponseGradingSupport(deliveredQuestionForGrading(question));
    assert.equal(support.supported, true, `${question.questionId}: ${support.reason}`);
  }
  const typed = MAKEUP.questions.filter((question) => question.type === 'multiAnswer').map((question) => question.questionId);
  assert.deepEqual(typed, ['dol4-makeup-q05', 'dol4-makeup-q07'], 'only the transformation and the payment table are typed responses');
});

test('every question carries three hints and a "Let\'s back up" step with the right choice among two', () => {
  for (const question of MAKEUP.questions) {
    assert.equal(question.hints.length, 3, `${question.questionId} hints`);
    const step = backUpStepFor(question);
    assert.ok(backUpStepWritten(step), `${question.questionId} has a back-up step (${step.source})`);
    assert.equal(step.options.length, 2, question.questionId);
    assert.ok(step.options.includes(step.correct), question.questionId);
  }
});

test('after the last try every question walks through worked steps and names the usual mistake', () => {
  assert.deepEqual(auditAssignmentSolutionReviews(MAKEUP.questions).warnings, []);
  for (const question of MAKEUP.questions) {
    assert.equal(workedSolutionDepth(question), 'steps', `${question.questionId} shows steps, not only the answer`);
    assert.ok(hasAuthoredCommonError(question), `${question.questionId} names the usual mistake`);
  }
});

/* -------------------------------------------------------- 1 · A.3B table -- */

test('1 · A.3B: three intervals give the constant rate 5/2, and the rows give b = −3', () => {
  const question = item('dol4-makeup-q01');
  const rows = question.rows.map(({ x, y }) => [x, y]);
  const line = lineThrough(rows[0], rows[rows.length - 1]);
  rows.forEach((row) => assert.ok(onLine(line, row), `(${row}) is on the line`));
  assert.deepEqual([line.m.toFraction(), line.b.toFraction()], ['5/2', '-3']);
  assert.ok(rows.slice(1).some(([x], index) => x - rows[index][0] !== 1), 'the x-values do not step by 1, as on the DOL');
  const intervals = [[0, 1], [1, 2], [2, 3]].map(([i, j]) => ({ i, j, dx: String(rows[j][0] - rows[i][0]), dy: String(rows[j][1] - rows[i][1]), rate: line.m.toFraction() }));
  const work = { intervals, classification: 'linear', m: '5/2', b: '-3', equation: 'y = 5/2x - 3', repairRowIndex: null, repairedValue: '' };
  const grade = (overrides = {}) => gradeToolWork({ toolId: 'linearTableWorkbench', question, work: { ...work, ...overrides } });
  assert.equal(grade().isCorrect, true, failing(grade()));
  assert.equal(grade({ m: '2.5', equation: 'y = 2.5x - 3' }).isCorrect, true, 'the decimal slope');
  assert.equal(grade({ intervals: intervals.map((entry) => ({ ...entry, rate: entry.dy })) }).isCorrect, false, 'Δy alone is not the rate when Δx ≠ 1');
  assert.equal(grade({ b: '3', equation: 'y = 5/2x + 3' }).isCorrect, false, 'the intercept\'s sign');
  assert.equal(grade({ m: '2/5', equation: 'y = 2/5x - 3' }).isCorrect, false, 'the rate upside down');
});

/* ------------------------------------------------- 2, 6, 11 · A.5A solve -- */

for (const [id, variable, expected] of [['dol4-makeup-q02', 'n', '-10'], ['dol4-makeup-q06', 'w', '-27'], ['dol4-makeup-q11', 'z', '-10']]) {
  test(`${id.slice(-3)} · A.5A: ${rawItem(id).equation} is solved step by step, and the server agrees with the browser`, () => {
    const question = item(id);
    assert.equal(question.type, 'stepAlgebra');
    const solution = solveLinear(rawItem(id).equation, variable);
    assert.equal(solution.toFraction(), expected);
    // The worked solution's last line says the same.
    assert.ok(rawItem(id).solutionReview.reasoning.some((line) => line.includes(`${variable} = ${expected.replace('-', '−')}`)), `${id}: the worked solution ends at ${variable} = ${expected}`);
    const verdict = (value) => {
      const work = equationWorkspaceWork({ equation: { left: variable, right: value } });
      const browser = gradeToolCheck(stepAlgebraWorkGrader, question, work);
      const server = gradeServerResponse({ question, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
      assert.equal(server.isCorrect, browser.isCorrect, `${id}: browser and server agree on ${value}`);
      return browser.isCorrect;
    };
    assert.equal(verdict(solution.toFraction()), true, `${variable} = ${solution.toFraction()}`);
    assert.equal(verdict(solution.add(1).toFraction()), false, 'one unit off');
    assert.equal(verdict(solution.neg().toFraction()), false, 'the sign flipped');
  });
}

/* ------------------------------------------------------- 3 · A.2A graph -- */

test('3 · A.2A: 360 candy bars sold at 30 a day last 12 days; domain and range are read from the closed ends', () => {
  const question = item('dol4-makeup-q03');
  const raw = rawItem('dol4-makeup-q03').function;
  assert.deepEqual([raw.m, raw.b, raw.domain.min, raw.domain.minClosed, raw.domain.maxClosed], [-30, 360, 0, true, true]);
  const gone = -raw.b / raw.m;
  assert.equal(gone, raw.domain.max, 'the segment ends when the candy bars are gone');
  const grade = (responses) => gradeComposedWorkflowWork(question, { responses });
  const key = { domain: `0 <= x <= ${gone}`, range: `0 <= y <= ${raw.b}` };
  assert.equal(grade(key).isCorrect, true, failing(grade(key)));
  assert.equal(grade({ domain: '0 ≤ x ≤ 12', range: '0 ≤ y ≤ 360' }).isCorrect, true, 'the ≤ symbol');
  assert.equal(grade({ domain: key.range.replace('y', 'x'), range: key.domain.replace('x', 'y') }).isCorrect, false, 'domain and range swapped (the DOL\'s distractor)');
  assert.equal(grade({ ...key, range: '0 < y <= 360' }).isCorrect, false, 'a closed end written open');
});

/* -------------------------------------------------- 4 · A.3C graph a line -- */

test('4 · A.3C: slope 3/4 and y-intercept −2 are graphed through (0, −2) and (4, 1)', () => {
  const question = item('dol4-makeup-q04');
  assert.match(question.prompt, /slope of 3\/4 and a y-intercept of −2/);
  const grade = (points) => gradeToolWork({ toolId: 'graphing2', question, work: { points } });
  assert.equal(grade([[0, -2], [4, 1]]).isCorrect, true, failing(grade([[0, -2], [4, 1]])));
  assert.equal(grade([[-4, -5], [8, 4]]).isCorrect, true, 'any two points on the line');
  assert.equal(grade([[0, -2], [3, 2]]).isCorrect, false, 'rise 4, run 3');
  assert.equal(grade([[0, 2], [4, 5]]).isCorrect, false, 'the intercept\'s sign');
  assert.equal(grade([[-2, 0], [2, 3]]).isCorrect, false, 'the intercept put on the x-axis');
});

/* ---------------------------------------------- 5 · A.3E transformation -- */

const bothGraders = (question, answers) => {
  const browser = gradeMultiAnswerResponse(question, answers);
  const server = gradeServerResponse({ question, response: { kind: 'fields', fields: Object.entries(answers).map(([id, value]) => ({ id, value })) } });
  assert.equal(server.isCorrect, browser.isCorrect, `${question.questionId}: browser and server agree`);
  return browser.isCorrect;
};

test('5 · A.3E: g(x) = f(x) + 5 moves f(x) = x up 5, so g\'s y-intercept is 5 more than f\'s', () => {
  const question = item('dol4-makeup-q05');
  const k = Number(/g\(x\) = f\(x\) \+ (\d+)/.exec(question.prompt)[1]);
  assert.equal(k, 5);
  const f = (x) => x;
  const g = (x) => f(x) + k;
  const key = {
    direction: 'Up',
    units: String(k),
    fIntercept: String(f(0)),
    gIntercept: String(g(0)),
    compare: `${k} units greater than the y-intercept of the graph of f`,
  };
  assert.equal(bothGraders(question, key), true);
  for (const [what, change] of [
    ['right, not up', { direction: 'Right' }],
    ['down, the DOL\'s own move', { direction: 'Down' }],
    ['g\'s intercept left at 0', { gIntercept: '0' }],
    ['less than', { compare: `${k} units less than the y-intercept of the graph of f` }],
  ]) assert.equal(bothGraders(question, { ...key, ...change }), false, what);
});

/* ----------------------------------------------- 7 · A.2A discrete table -- */

test('7 · A.2A: $150 paid off at $30 a payment allows 0–5 whole payments', () => {
  const question = item('dol4-makeup-q07');
  const rows = rawItem('dol4-makeup-q07').table.rows.map(({ x, y }) => [Number(x), Number(y)]);
  const payment = rows[0][1] - rows[1][1];
  const payments = rows[0][1] / payment;
  assert.equal(payments, 5);
  rows.forEach(([x, y]) => assert.equal(y, rows[0][1] - payment * x));
  const domain = Array.from({ length: payments + 1 }, (_, n) => n);
  const key = {
    kind: 'only whole numbers from 0 to 5',
    domain: `{${domain.join(', ')}}`,
    range: `{${domain.map((n) => n * payment).join(', ')}}`,
  };
  assert.equal(bothGraders(question, key), true);
  assert.equal(bothGraders(question, { ...key, domain: '{5, 4, 3, 2, 1, 0}' }), true, 'a set in any order');
  assert.equal(bothGraders(question, { ...key, domain: key.range }), false, 'the balances are not the domain (the DOL\'s distractor)');
  assert.equal(bothGraders(question, { ...key, domain: '{1, 2, 3, 4, 5}' }), false, 'zero payments is in the domain');
  assert.equal(bothGraders(question, { ...key, kind: 'any real number from 0 to 5' }), false, 'not continuous');
});

/* ------------------------------------------------- 8 · A.12C recursion -- */

test('8 · A.12C: a₁ = 6.5 and aₙ = aₙ₋₁ + 1.7 give 6.5, 8.2, 9.9, 11.6', () => {
  const question = item('dol4-makeup-q08');
  const match = /aₙ = aₙ₋₁ \+ ([\d.]+), where a₁ = ([\d.]+)/.exec(question.prompt);
  assert.ok(match, 'the recursive rule as the DOL writes it');
  const [step, first] = [frac(match[1]), frac(match[2])];
  assert.deepEqual(question.sequence, { kind: 'arithmetic', first: first.valueOf(), difference: step.valueOf() });
  const terms = [first];
  while (terms.length < question.displayCount) terms.push(terms[terms.length - 1].add(step));
  const shown = terms.map((term) => String(term.valueOf()));
  assert.deepEqual(shown, ['6.5', '8.2', '9.9', '11.6']);
  const work = { tableValues: shown, plottedPoints: terms.map((term, index) => [index + 1, term.valueOf()]), kindAnswer: 'arithmetic', changeAnswer: String(step.valueOf()), explicitRule: '', recursiveFirst: '', recursiveRule: '', termAnswer: '' };
  const grade = (overrides = {}) => gradeToolWork({ toolId: 'sequenceExplorer', question, work: { ...work, ...overrides } });
  assert.equal(grade().isCorrect, true, failing(grade()));
  assert.equal(grade({ tableValues: ['6.5', '11.05', '18.785', '31.9345'] }).isCorrect, false, 'multiplying by 1.7');
  assert.equal(grade({ tableValues: ['6.5', '8.2', '10.9', '12.6'] }).isCorrect, false, 'a slip in one term');
  assert.equal(grade({ kindAnswer: 'geometric' }).isCorrect, false, 'adding is not multiplying');
});

/* -------------------------------------------- 9 · A.2B point-slope form -- */

test('9 · A.2B: the graphed line through (−6, 1) and (6, 4) is y − 1 = (1/4)(x + 6)', () => {
  const question = item('dol4-makeup-q09');
  const [p1, p2] = question.source.points.map(({ x, y }) => [x, y]);
  assert.ok(question.prompt.includes('(−6, 1)') && question.prompt.includes('(6, 4)'));
  const line = lineThrough(p1, p2);
  assert.deepEqual([line.m.toFraction(), line.b.toFraction()], ['1/4', '5/2']);
  const work = { pointSlopeEquation: 'y - 1 = 1/4(x + 6)', slopeInterceptEquation: 'y = 1/4x + 5/2', processLog: keyProcessLog(question) };
  const grade = (overrides = {}) => gradeToolWork({ toolId: 'representationBridge', question, work: { ...work, ...overrides } });
  assert.equal(grade().isCorrect, true, failing(grade()));
  assert.equal(grade({ pointSlopeEquation: 'y - 4 = 1/4(x - 6)' }).isCorrect, true, 'point-slope through the other marked point');
  assert.equal(grade({ pointSlopeEquation: 'y - 1 = 1/4(x - 6)' }).isCorrect, false, 'the sign of x₁');
  assert.equal(grade({ slopeInterceptEquation: 'y = 4x + 5/2' }).isCorrect, false, 'the slope upside down');
});

/* ------------------------------------------- 10 · A.3C intercepts read -- */

test('10 · A.3C: the graphed line y = 0.4x − 2 meets the y-axis at −2 and the x-axis at 5', () => {
  const question = item('dol4-makeup-q10');
  const raw = rawItem('dol4-makeup-q10').function;
  const xIntercept = frac(raw.b).neg().div(raw.m);
  assert.deepEqual([xIntercept.valueOf(), raw.b], [5, -2]);
  const { xMin, xMax, yMin, yMax } = rawItem('dol4-makeup-q10').graph;
  [[xIntercept.valueOf(), 0], [0, raw.b]].forEach(([x, y]) => assert.ok(x >= xMin && x <= xMax && y >= yMin && y <= yMax && Number.isInteger(x) && Number.isInteger(y), `(${x}, ${y}) sits on a grid crossing`));
  const grade = (responses) => gradeComposedWorkflowWork(question, { responses });
  const key = {
    xInterceptExists: 'Yes',
    xIntercept: '(5, 0)',
    xInterceptValue: '(5, 0)',
    yInterceptExists: 'Yes',
    yIntercept: '(0, -2)',
    yInterceptValue: '(0, -2)',
  };
  assert.equal(grade(key).isCorrect, true, failing(grade(key)));
  assert.equal(grade({ ...key, yIntercept: '(0, 5)', yInterceptValue: '(0, 5)' }).isCorrect, false, 'the intercepts mixed up');
  assert.equal(grade({ ...key, yIntercept: '(0, 2)', yInterceptValue: '(0, 2)' }).isCorrect, false, 'the intercept\'s sign');
});

/* -------------------------------------------- 12 · A.2C two customers -- */

test('12 · A.2C: 30 miles for $64 and 120 miles for $118 give $0.60 a mile and a $46 fee', () => {
  const question = item('dol4-makeup-q12');
  const pairs = [...question.source.prompt.matchAll(/(\d+) miles for a total cost of \$(\d+)/g)].map(([, miles, cost]) => [Number(miles), Number(cost)]);
  assert.deepEqual(pairs, [[30, 64], [120, 118]]);
  const line = lineThrough(pairs[0], pairs[1]);
  assert.deepEqual([line.m.valueOf(), line.b.valueOf()], [0.6, 46]);
  assert.deepEqual([question.source.rate, question.source.initialValue], [line.m.valueOf(), line.b.valueOf()], 'the board is built from the same line');
  const context = {
    contextIndependent: 'miles driven',
    contextDependent: 'total cost (dollars)',
    contextSlopeMeaning: 'The total cost goes up $0.60 for each mile driven.',
    contextYInterceptMeaning: 'The customer pays a $46 flat fee before driving any miles.',
  };
  const work = { slopeInterceptEquation: 'y = 0.6x + 46', ...context, processLog: keyProcessLog(question) };
  const grade = (overrides = {}) => gradeToolWork({ toolId: 'representationBridge', question, work: { ...work, ...overrides } });
  assert.equal(grade().isCorrect, true, failing(grade()));
  assert.equal(grade({ slopeInterceptEquation: 'y = 3/5x + 46' }).isCorrect, true, 'the fraction form');
  assert.equal(grade({ slopeInterceptEquation: 'y = 0.6x + 64' }).isCorrect, false, 'the first customer\'s cost as the fee (the DOL\'s distractor)');
  assert.equal(grade({ slopeInterceptEquation: 'y = 46x + 0.6' }).isCorrect, false, 'the fee and the rate traded places');
  const FIELDS = { independentQuantity: 'contextIndependent', dependentQuantity: 'contextDependent', slopeMeaning: 'contextSlopeMeaning', yInterceptMeaning: 'contextYInterceptMeaning' };
  for (const [name, field] of Object.entries(FIELDS)) {
    for (const choice of question.context[name].choices) {
      assert.equal(grade({ [field]: choice }).isCorrect, choice === context[field], `${field}: "${choice}"`);
    }
  }
});

/* ------------------------------------------------ 13 · A.4C regression -- */

test('13 · A.4C: regression on the seven hours models the falling customers and predicts hour 8', () => {
  const question = item('dol4-makeup-q13');
  assert.equal(question.mode, 'lineFit');
  const points = question.points.map(({ x, y }) => [x, y]);
  const n = points.length;
  const meanX = points.reduce((sum, [x]) => sum + x, 0) / n;
  const meanY = points.reduce((sum, [, y]) => sum + y, 0) / n;
  const sxy = points.reduce((sum, [x, y]) => sum + (x - meanX) * (y - meanY), 0);
  const sxx = points.reduce((sum, [x]) => sum + (x - meanX) ** 2, 0);
  const m = sxy / sxx;
  const b = meanY - m * meanX;
  assert.deepEqual([Math.round(m), Math.round(b)], [-42, 455], 'about f(x) = 455 − 42x, as the DOL\'s f(x) = 337 − 41x');
  const prediction = Math.round(m * question.predictionX + b);
  assert.equal(prediction, 118);
  const round3 = (value) => Math.round(value * 1000) / 1000;
  const work = { m: round3(m), b: round3(b), predictionX: question.predictionX, predictionY: String(prediction), regressionTechnologyRun: true };
  const grade = (overrides = {}) => gradeToolWork({ toolId: 'dataModelingLab', question, work: { ...work, ...overrides } });
  assert.equal(grade().isCorrect, true, failing(grade()));
  assert.equal(grade({ predictionY: String(prediction + 10) }).isCorrect, false, 'a prediction off the line');
  // The DOL's distractor: the first hour's count as the intercept, with the right slope.
  assert.equal(grade({ m: -42, b: 410, predictionY: String(410 - 42 * 8) }).isCorrect, false, 'the first row as the y-intercept');
});
