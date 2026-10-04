/*
 * SHARED BY THE EQUATION SPECIAL-CASE AND ALGEBRAIC 2×2 SYSTEM SUITES.
 *
 * The oracles here are deliberately independent of the families they judge:
 * they read the question as a student is shown it (the engine expressions AND
 * the LaTeX on screen; the equation texts of a system) and classify it with
 * mathjs in exact fraction arithmetic — never with questionFamilyExact.mjs,
 * whose classification the families themselves use.
 *
 * The work builders produce exactly the work each workspace reports
 * (stepAlgebraWorkspaceGrading equationWorkspaceWork / relationWorkspaceWork,
 * and the Systems Workspace shape in algebraicSystemWork.mjs), so a verdict
 * here is the verdict the browser and the server reach on real work.
 */
import { create, all } from 'mathjs';

import { latexToExpression } from '../../../functions/shared/algebra/algebraAstEngine.mjs';
import { planSeatAdditions, resolveGenerationAllocation, resolveLearnerSeat } from '../../../functions/shared/questionGenerationIdentity.mjs';
import { familySlotKey, resolveFamilyQuestionInstance } from '../../../functions/shared/questionFamilyInstance.mjs';
import { resolveServerGradingQuestion } from '../../../functions/shared/questionFamilyGrading.mjs';
import { gradeServerResponse, gradeToolWork } from '../../../functions/shared/serverGrading/serverResponseGrading.mjs';
import {
  equationWorkspaceWork,
  relationWorkspaceWork,
  stepAlgebraWorkGrader,
} from '../../../functions/shared/serverGrading/stepAlgebraWorkspaceGrading.mjs';
import { gradeToolCheck } from '../../../src/tools/shared/sharedToolGrading.js';
import { correctAlgebraicSystemWork, wrongAlgebraicSystemWork } from './algebraicSystemWork.mjs';

const math = create(all, { number: 'Fraction' });
const F = (value) => math.fraction(value);
const fractionText = (value) => {
  const fraction = F(value);
  const sign = fraction.s < 0 ? '-' : '';
  return Number(fraction.d) === 1 ? `${sign}${fraction.n}` : `${sign}${fraction.n}/${fraction.d}`;
};

/** a·v + b of one side, exactly — null unless the side is linear in v. */
const linearOf = (expression, variable) => {
  try {
    const node = math.parse(String(expression));
    const at = (value) => F(node.evaluate({ [variable]: F(value) }));
    const b = at(0);
    const a = math.subtract(at(1), b);
    if (!math.equal(at(2), math.add(math.multiply(a, 2), b))) return null;
    if (!math.equal(at(-3), math.add(math.multiply(a, -3), b))) return null;
    return { a, b };
  } catch {
    return null;
  }
};

/**
 * What the equation the student SEES says: one solution (and which), none or
 * infinitely many. Read from every place the equation is shown — the sides the
 * workspace opens with (leftExpression / rightExpression), the `equation` text,
 * and the LaTeX the prompt shows when the author wrote {{equation}} — which
 * must all agree, or the oracle says so.
 */
export const equationOracle = (question) => {
  const variable = question.variable || 'x';
  const readings = [[question.leftExpression, question.rightExpression]];
  const equation = String(question.equation || '').split('=');
  if (equation.length === 2) readings.push(equation);
  const promptLatex = /\$([^$]*=[^$]*)\$/.exec(String(question.prompt || ''))?.[1];
  if (promptLatex) readings.push(promptLatex.split('=').map((side) => latexToExpression(side.trim())));
  const parsed = readings.map((sides) => sides.map((side) => linearOf(side, variable)));
  if (parsed.some((sides) => sides.length !== 2 || sides.some((side) => !side))) return { case: 'unreadable' };
  const [[left, right], ...others] = parsed;
  const same = (one, two) => math.equal(one.a, two.a) && math.equal(one.b, two.b);
  if (!others.every(([otherLeft, otherRight]) => same(otherLeft, left) && same(otherRight, right))) return { case: 'display-mismatch' };
  const a = math.subtract(left.a, right.a);
  const b = math.subtract(right.b, left.b);
  if (!math.equal(a, 0)) return { case: 'one', value: fractionText(math.divide(b, a)), readings: parsed.length };
  return { case: math.equal(b, 0) ? 'infinite' : 'none', readings: parsed.length };
};

/** a·x + b·y = c from "3x - 2y = 7", exactly. */
export const systemRow = (equation) => {
  const [left, right] = String(equation).split('=');
  const node = math.parse(`(${left}) - (${right})`);
  const at = (x, y) => F(node.evaluate({ x: F(x), y: F(y) }));
  const c0 = at(0, 0);
  return { a: math.subtract(at(1, 0), c0), b: math.subtract(at(0, 1), c0), c: math.unaryMinus(c0) };
};

/**
 * What the system the student SEES has: one intersection (and where), none,
 * or infinitely many — from the 2×2 determinant and the augmented minors,
 * exactly.
 */
export const systemOracle = (question) => {
  const [first, second] = question.equations.map(systemRow);
  const det = math.subtract(math.multiply(first.a, second.b), math.multiply(first.b, second.a));
  if (!math.equal(det, 0)) {
    const x = math.divide(math.subtract(math.multiply(first.c, second.b), math.multiply(first.b, second.c)), det);
    const y = math.divide(math.subtract(math.multiply(first.a, second.c), math.multiply(first.c, second.a)), det);
    return { case: 'one', x: fractionText(x), y: fractionText(y), rows: [first, second] };
  }
  const proportional = math.equal(math.multiply(first.a, second.c), math.multiply(first.c, second.a))
    && math.equal(math.multiply(first.b, second.c), math.multiply(first.c, second.b));
  return { case: proportional ? 'infinite' : 'none', rows: [first, second] };
};

export const KEY_CASE = Object.freeze({ value: 'one', noSolution: 'none', allReals: 'infinite', point: 'one', infinite: 'infinite' });

/* ------------------------------------------------------------- Step Algebra work */

/**
 * The work Step Algebra reports when a student finishes on `outcome`: in the
 * relation workspace (a special-case or mixed slot) the relation x = v or
 * the declared outcome; in the equation workspace the equation x = v.
 */
export const stepAlgebraWork = (question, { outcome, value = null }) => {
  const variable = question.variable || 'x';
  if (question.relationWorkspace === true) {
    if (outcome === 'noSolution' || outcome === 'allReals') return relationWorkspaceWork({ relationState: { special: outcome, branches: [] } });
    return relationWorkspaceWork({ relationState: { branches: [{ expressions: [variable, String(value)], relations: ['='] }] } });
  }
  return equationWorkspaceWork({ equation: { left: variable, right: String(value) } });
};

export const correctStepAlgebraWork = (question) => stepAlgebraWork(question, {
  outcome: question.solutionKey.outcome,
  value: question.solutionKey.value,
});

/** One wrong conclusion per case: the next value, or the other special outcome / a value. */
export const wrongStepAlgebraWork = (question) => {
  const key = question.solutionKey;
  if (key.outcome === 'value') return stepAlgebraWork(question, { outcome: 'value', value: fractionText(math.add(F(key.value), 1)) });
  if (question.relationWorkspace !== true) throw new Error('a special-case question opens the relation workspace');
  return stepAlgebraWork(question, { outcome: key.outcome === 'noSolution' ? 'allReals' : 'noSolution' });
};

/** The browser verdict (the workspace's own check) and the server verdict on the bytes it sent. */
export const gradeBothWays = (question, work) => {
  if (question.type === 'systemsWorkspace') {
    const browser = gradeToolWork({ toolId: 'systemsWorkspace', question, work });
    const server = gradeServerResponse({ question, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
    return { browser, server };
  }
  const browser = gradeToolCheck(stepAlgebraWorkGrader, question, work);
  const server = gradeServerResponse({ question, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
  return { browser, server };
};

export const correctWork = (question) => (question.type === 'systemsWorkspace' ? correctAlgebraicSystemWork(question) : correctStepAlgebraWork(question));
export const wrongWork = (question) => (question.type === 'systemsWorkspace' ? wrongAlgebraicSystemWork(question) : wrongStepAlgebraWork(question));

/* ------------------------------------------------------------- a seated class */

export const CLASS_ID = 'qf-cases-class';
export const STUDENTS = Object.freeze(Array.from({ length: 30 }, (_, index) => `qf-student-${String(index + 1).padStart(2, '0')}`));

/** One section holding every slot, 30 students seated by the real allocator. */
export const seatedAssignment = (id, slots, { role = 'classwork' } = {}) => {
  const assignment = {
    id,
    schemaVersion: 5,
    assignedClassIds: [CLASS_ID],
    sections: [{ id: role, role, title: role, questions: slots.map((slot) => ({ activityRole: role, prompt: '', ...slot })) }],
  };
  assignment.generationSeats = {
    version: 1,
    byClassId: { [CLASS_ID]: planSeatAdditions({ assignment, classId: CLASS_ID, studentIds: STUDENTS }) },
  };
  return assignment;
};

/** What `studentId` is given for slot `storageIndex`, through the real seat and allocation. */
export const deliverTo = (assignment, storageIndex, studentId, { variant = 0, support = null, excludeFingerprints = [] } = {}) => {
  const question = assignment.sections[0].questions[storageIndex];
  const seatInfo = resolveLearnerSeat({ assignment, studentId, classId: CLASS_ID });
  const allocation = resolveGenerationAllocation({ sectionMode: 'personalized', seatInfo, variant, preview: false });
  return resolveFamilyQuestionInstance({
    question,
    assignmentId: assignment.id,
    storageIndex,
    slotKey: familySlotKey({ assignmentId: assignment.id, question, storageIndex }),
    allocation,
    support,
    excludeFingerprints,
  });
};

/** The server's own instance for a delivery the browser claims: ingestion's resolution, seat-verified. */
export const serverQuestionFor = (assignment, storageIndex, studentId, delivery) => resolveServerGradingQuestion({
  assignment,
  question: assignment.sections[0].questions[storageIndex],
  questionIndex: storageIndex,
  variantIndex: delivery.variant || 0,
  claimedDelivery: delivery,
  studentId,
  classId: CLASS_ID,
});
