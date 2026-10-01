import { parse } from '../../platform/math/mathjs.js';
import { latexToExpression } from '../../algebraAstEngine.js';
import { compareOrderedPair, parseOrderedPair } from '../../answerUtils.js';
import { nearlyEqual, round } from '../shared/toolMath.js';
import {
  formatFraction,
  standardCoefficientsFromEquationText,
  toFraction,
} from '../shared/linearEquations.js';

export const INTERCEPT_FEEDBACK_TIMINGS = Object.freeze([
  'guided',
  'delayed',
  'checkpoint',
  'submitOnly',
]);

const finite = (value) => Number.isFinite(Number(value));

export const resolveStandardCoefficients = (question = {}) => {
  const direct = question.standard || (
    question.equation && typeof question.equation === 'object' && !Array.isArray(question.equation)
      ? question.equation
      : null
  );
  if (direct && [direct.A, direct.B, direct.C].every(finite)) {
    const standard = { A: Number(direct.A), B: Number(direct.B), C: Number(direct.C) };
    return Math.abs(standard.A) <= 1e-12 && Math.abs(standard.B) <= 1e-12 ? null : standard;
  }

  // Fresh V5 compilation preserves both equation and equationText for
  // linearIntercepts, while some stored/legacy paths keep only equationText.
  // The orchestrator must accept every canonical equation-text field instead of
  // failing simply because one serialization omitted `equation`.
  const candidates = [
    typeof question.equation === 'string' ? question.equation : '',
    question.equationText,
    question.equationAscii,
    question.initialEquation,
  ].map((value) => String(value ?? '').trim()).filter(Boolean);

  for (const text of candidates) {
    const standard = standardCoefficientsFromEquationText(text);
    if (standard) return standard;
  }
  return null;
};

const coefficientTerm = (coefficient, variable, { first = false } = {}) => {
  const value = Number(coefficient);
  if (Math.abs(value) <= 1e-12) return '';
  const magnitude = Math.abs(value);
  const body = `${nearlyEqual(magnitude, 1, 1e-12) ? '' : round(magnitude, 6)}${variable}`;
  if (first) return value < 0 ? `−${body}` : body;
  return `${value < 0 ? ' − ' : ' + '}${body}`;
};

export const formatStandardEquation = (standard) => {
  if (!standard) return '';
  let left = coefficientTerm(standard.A, 'x', { first: true });
  const yTerm = coefficientTerm(standard.B, 'y', { first: !left });
  left += yTerm;
  return `${left || '0'} = ${round(Number(standard.C), 6)}`;
};

export const interceptTarget = (kind) => {
  if (kind === 'x') return {
    kind: 'x',
    label: 'x-intercept',
    axis: 'x-axis',
    expectedZeroVariable: 'y',
    solvedVariable: 'x',
  };
  return {
    kind: 'y',
    label: 'y-intercept',
    axis: 'y-axis',
    expectedZeroVariable: 'x',
    solvedVariable: 'y',
  };
};

export const interceptValue = (standard, kind) => {
  if (!standard) return { kind: 'invalid', value: null };
  const coefficient = kind === 'x' ? Number(standard.A) : Number(standard.B);
  const otherCoefficient = kind === 'x' ? Number(standard.B) : Number(standard.A);
  const C = Number(standard.C);
  if (Math.abs(coefficient) > 1e-12) return { kind: 'single', value: C / coefficient };

  // If the requested-axis variable has coefficient 0, the line either never
  // meets that axis or lies on it. Both are real mathematical cases, but
  // neither has one unique intercept point to solve for.
  if (Math.abs(C) <= 1e-12 && Math.abs(otherCoefficient) > 1e-12) {
    return { kind: 'all', value: null };
  }
  return { kind: 'none', value: null };
};

export const expectedInterceptPoint = (standard, kind) => {
  const result = interceptValue(standard, kind);
  if (result.kind !== 'single') return null;
  return kind === 'x' ? [result.value, 0] : [0, result.value];
};

export const initialInterceptStage = () => ({
  conceptualZeroChoice: null,
  placedZeroVariable: null,
  committed: false,
  solverState: null,
  workHistory: [],
  point: { x: '', y: '' },
  completed: false,
  checked: false,
});

export const initialInterceptWork = () => ({
  activeKind: 'x',
  x: initialInterceptStage(),
  y: initialInterceptStage(),
});

export const buildSubstitutionState = (standard, placedZeroVariable) => {
  if (!standard || !['x', 'y'].includes(placedZeroVariable)) return null;
  if (placedZeroVariable === 'y') {
    return {
      zeroVariable: 'y',
      variable: 'x',
      coefficient: Number(standard.A),
      constant: 0,
      right: Number(standard.C),
    };
  }
  return {
    zeroVariable: 'x',
    variable: 'y',
    coefficient: Number(standard.B),
    constant: 0,
    right: Number(standard.C),
  };
};

export const formatSubstitutionEquation = (standard, zeroVariable) => {
  if (!standard || !['x', 'y'].includes(zeroVariable)) return formatStandardEquation(standard);
  const xPart = zeroVariable === 'x'
    ? `${round(Number(standard.A), 6)}(0)`
    : coefficientTerm(standard.A, 'x', { first: true });
  const yCoefficient = Number(standard.B);
  const yRaw = zeroVariable === 'y'
    ? `${Math.abs(yCoefficient)}(0)`
    : `${Math.abs(yCoefficient) === 1 ? '' : Math.abs(round(yCoefficient, 6))}y`;
  let left = xPart || '0';
  if (Math.abs(yCoefficient) > 1e-12) {
    if (zeroVariable === 'x') {
      const body = yRaw;
      left = yCoefficient < 0 ? `${left} − ${body}` : `${left} + ${body}`;
    } else if (xPart) {
      left = yCoefficient < 0 ? `${left} − ${yRaw}` : `${left} + ${yRaw}`;
    } else {
      left = yCoefficient < 0 ? `−${yRaw}` : yRaw;
    }
  }
  return `${left} = ${round(Number(standard.C), 6)}`;
};

export const formatSolverEquation = (state) => {
  if (!state) return '';
  const coefficient = round(Number(state.coefficient), 6);
  const constant = round(Number(state.constant), 6);
  const right = round(Number(state.right), 6);
  let left = '';
  if (!nearlyEqual(coefficient, 0, 1e-9)) {
    if (nearlyEqual(coefficient, 1, 1e-9)) left = state.variable;
    else if (nearlyEqual(coefficient, -1, 1e-9)) left = `−${state.variable}`;
    else left = `${coefficient}${state.variable}`;
  }
  if (!nearlyEqual(constant, 0, 1e-9)) {
    if (!left) left = String(constant);
    else left += ` ${constant >= 0 ? '+' : '−'} ${Math.abs(constant)}`;
  }
  return `${left || '0'} = ${right}`;
};

export const applyInterceptOperation = (state, operation, value) => {
  if (!state || !finite(value)) return null;
  const operand = Number(value);
  if (operation === 'divide' && nearlyEqual(operand, 0, 1e-12)) return null;
  if (operation === 'multiply' && nearlyEqual(operand, 0, 1e-12)) return null;
  const next = { ...state };
  if (operation === 'add') { next.constant += operand; next.right += operand; }
  if (operation === 'subtract') { next.constant -= operand; next.right -= operand; }
  if (operation === 'multiply') {
    next.coefficient *= operand;
    next.constant *= operand;
    next.right *= operand;
  }
  if (operation === 'divide') {
    next.coefficient /= operand;
    next.constant /= operand;
    next.right /= operand;
  }
  return next;
};

export const solverIsSolved = (state) => Boolean(
  state
  && !nearlyEqual(Number(state.coefficient), 0, 1e-12)
  && nearlyEqual(Number(state.coefficient), 1, 1e-9)
  && nearlyEqual(Number(state.constant), 0, 1e-9)
);

export const solverValue = (state) => (solverIsSolved(state) ? Number(state.right) : null);

/**
 * What the embedded solver's latest report changes about the intercept stage,
 * or null when it changes nothing.
 *
 * The solver re-reports its state whenever its `onStateChange` identity
 * changes, and the orchestrator re-renders on every stage update. If "nothing
 * changed" is judged against anything other than the value that would actually
 * be stored, every report becomes a new stage and every new stage a new report:
 * while unsolved the report still carries the current equation, but the stage
 * stores '' for it, so comparing the two never matched and the solve step ran
 * an endless render + draft-write loop. Compare what would be written.
 */
export const solvedStageUpdate = (stage, payload) => {
  const solved = Boolean(payload?.isComplete && payload?.isCorrect);
  const response = payload?.parts?.find((part) => part?.id === 'algebra-objective')?.response || '';
  const solvedEquationLatex = solved ? response : '';
  if (solved === Boolean(stage?.solved) && solvedEquationLatex === (stage?.solvedEquationLatex || '')) return null;
  return { solved, solvedEquationLatex };
};

export const choicePlacementMismatch = (stage) => Boolean(
  stage?.conceptualZeroChoice
  && stage?.placedZeroVariable
  && stage.conceptualZeroChoice !== stage.placedZeroVariable
);

export const stageOnWrongInterceptPath = (stage, kind) => {
  const target = interceptTarget(kind);
  return Boolean(stage?.committed && stage?.placedZeroVariable && stage.placedZeroVariable !== target.expectedZeroVariable);
};

export const shouldShowConceptRedirect = (stage, kind, feedbackTiming = 'delayed') => {
  if (!stageOnWrongInterceptPath(stage, kind)) return false;
  if (feedbackTiming === 'guided') return true;
  if (feedbackTiming === 'delayed') return (stage?.workHistory?.length || 0) >= 1;
  return false;
};

/*
 * WHAT "CHECK x-INTERCEPT" DOES WITH THE POINT THE STUDENT WROTE.
 *
 * Where the activity shows outcomes at once (practice, warm-up, classwork)
 * the check is a verdict: only the right point completes the intercept, a
 * wrong one is named as wrong ("That point does not match this equation…",
 * "an x-intercept … its y-coordinate is 0") and costs nothing, and a right one
 * earns its step credit. That is the same behaviour practice always had.
 *
 * On a DOL, quiz or test (QuestionEngine's showOutcomeFeedback false →
 * `revealCorrectness` false) that free, repeatable check is an answer key. So
 * there any readable ordered pair is RECORDED — right or wrong, in the same
 * words — and the workflow moves on; nothing earns step credit before Submit
 * (credit that arrived only for a right point would itself be the verdict, in
 * the "% partial credit so far" line); and the point is graded when the
 * question is submitted (interceptCompletionPayload). Only an unreadable entry
 * is turned back, and that says nothing about correctness.
 */
export const resolveInterceptCheck = ({ revealCorrectness = true, kind = 'x', point = '', expectedPoint = null } = {}) => {
  const pair = parseOrderedPair(point);
  const isCorrect = Boolean(pair && expectedPoint && compareOrderedPair(point, expectedPoint, 1e-6));
  if (!pair) {
    return { completes: false, isCorrect: false, earnsStepCredit: false, message: 'Enter the intercept as an ordered pair, such as (3, 0).' };
  }
  if (revealCorrectness === false) return { completes: true, isCorrect, earnsStepCredit: false, message: '' };
  if (isCorrect) return { completes: true, isCorrect: true, earnsStepCredit: true, message: '' };
  let message = 'That point does not match this equation. Recheck the value you solved for.';
  if (kind === 'x' && Math.abs(pair[1]) > 1e-6) message = 'An x-intercept is a point on the x-axis, so its y-coordinate is 0.';
  else if (kind === 'y' && Math.abs(pair[0]) > 1e-6) message = 'A y-intercept is a point on the y-axis, so its x-coordinate is 0.';
  return { completes: false, isCorrect: false, earnsStepCredit: false, message };
};

/*
 * WHAT THE HOST IS TOLD ONCE BOTH INTERCEPTS ARE IN.
 *
 * Each part is graded against the equation's own intercept — never assumed.
 * In practice only a right point can complete, so every part is right there
 * (exactly what this always reported); on a DOL, quiz or test a recorded
 * point can be wrong, and the submitted attempt has to say so: that part is
 * complete and wrong, earns nothing, and the question is not correct.
 */
export const interceptCompletionPayload = (finishedWork, standard) => {
  const partFor = (kind) => {
    const point = finishedWork?.[kind]?.point ?? '';
    const expected = expectedInterceptPoint(standard, kind);
    const isCorrect = Boolean(parseOrderedPair(point) && expected && compareOrderedPair(point, expected, 1e-6));
    const label = kind === 'x' ? 'x-intercept' : 'y-intercept';
    return { id: label, label, isComplete: true, isCorrect, response: point };
  };
  const parts = [partFor('x'), partFor('y')];
  return {
    isComplete: true,
    isCorrect: parts.every((part) => part.isCorrect),
    questionDetails: `x-intercept ${finishedWork?.x?.point ?? ''}, y-intercept ${finishedWork?.y?.point ?? ''}`,
    responseKey: JSON.stringify({ x: parseOrderedPair(finishedWork?.x?.point), y: parseOrderedPair(finishedWork?.y?.point) }),
    parts,
  };
};

export const conceptualRedirect = (kind) => {
  const target = interceptTarget(kind);
  const opposite = kind === 'x' ? 'y-intercept' : 'x-intercept';
  return `Check your target. Your current substitution is finding the ${opposite}, but the task asks for the ${target.label}. What is the ${kind === 'x' ? 'y' : 'x'}-coordinate of every point on the ${target.axis}?`;
};

export const parseNumericMath = (value) => {
  try {
    const expression = latexToExpression(String(value ?? '')).trim();
    if (!expression) return null;
    const result = Number(parse(expression).evaluate());
    return Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
};

export const pointFromStage = (stage) => {
  const x = parseNumericMath(stage?.point?.x);
  const y = parseNumericMath(stage?.point?.y);
  return x == null || y == null ? null : [x, y];
};

export const pointsNearlyEqual = (left, right, tolerance = 1e-6) => (
  Array.isArray(left)
  && Array.isArray(right)
  && left.length === 2
  && right.length === 2
  && nearlyEqual(Number(left[0]), Number(right[0]), tolerance)
  && nearlyEqual(Number(left[1]), Number(right[1]), tolerance)
);

export const evaluateInterceptStage = (stage, standard, kind) => {
  const expectedPoint = expectedInterceptPoint(standard, kind);
  const target = interceptTarget(kind);
  const point = pointFromStage(stage);
  const solved = solverIsSolved(stage?.solverState);
  const solvedNumber = solverValue(stage?.solverState);
  const correctZeroChoice = stage?.conceptualZeroChoice === target.expectedZeroVariable;
  const correctPlacement = stage?.placedZeroVariable === target.expectedZeroVariable;
  const scalarExpected = expectedPoint ? expectedPoint[kind === 'x' ? 0 : 1] : null;
  const scalarCorrect = expectedPoint && solved && nearlyEqual(solvedNumber, scalarExpected, 1e-6);
  const pointCorrect = expectedPoint && pointsNearlyEqual(point, expectedPoint);
  return {
    correctZeroChoice,
    correctPlacement,
    solved,
    solvedNumber,
    scalarCorrect: Boolean(scalarCorrect),
    point,
    pointCorrect: Boolean(pointCorrect),
    isCorrect: Boolean(correctZeroChoice && correctPlacement && scalarCorrect && pointCorrect),
  };
};

export const describeExpectedPoint = (standard, kind) => {
  const point = expectedInterceptPoint(standard, kind);
  if (!point) return '';
  const format = (value) => formatFraction(toFraction(value)) || String(round(Number(value), 6));
  return `(${format(point[0])}, ${format(point[1])})`;
};

export const buildInterceptEvidence = (work, standard) => ({
  xIntercept: {
    conceptualZeroChoice: work?.x?.conceptualZeroChoice || null,
    placedZeroVariable: work?.x?.placedZeroVariable || null,
    substitution: work?.x?.placedZeroVariable ? formatSubstitutionEquation(standard, work.x.placedZeroVariable) : null,
    workHistory: work?.x?.workHistory || [],
    solvedValue: solverValue(work?.x?.solverState),
    point: pointFromStage(work?.x),
    completed: Boolean(work?.x?.completed),
  },
  yIntercept: {
    conceptualZeroChoice: work?.y?.conceptualZeroChoice || null,
    placedZeroVariable: work?.y?.placedZeroVariable || null,
    substitution: work?.y?.placedZeroVariable ? formatSubstitutionEquation(standard, work.y.placedZeroVariable) : null,
    workHistory: work?.y?.workHistory || [],
    solvedValue: solverValue(work?.y?.solverState),
    point: pointFromStage(work?.y),
    completed: Boolean(work?.y?.completed),
  },
});
