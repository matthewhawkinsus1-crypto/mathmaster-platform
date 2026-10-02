/*
 * A COMPLETE, CORRECT MULTIPLE REPRESENTATIONS BOARD — FOR ANY QUESTION.
 *
 * Built from the question's own canonical line (deriveLinearMultipleRepresentations),
 * never from a hand-written key, so a family test can grade EVERY generated
 * version: if a version's GIVEN, context or window disagreed with its line, the
 * board below would not score 100% on it.
 *
 * The answers are written the way a student types them on the board: plain
 * text for integers, LaTeX \frac for a fractional slope, ordered pairs in
 * parentheses, graph points as [x, y].
 *
 * A Process Mode board (interactionMode "process") also carries the process
 * that established its key facts — a complete, correct process log for THIS
 * version (keyProcessLog) — because there a typed fact is worth nothing and a
 * card the facts have not opened holds nothing.
 */
import {
  deriveLinearMultipleRepresentations,
  gradedContextFields,
  resolveRequiredCards,
} from '../../../functions/shared/toolMath/representationBridge/linearMultipleRepresentationsMath.mjs';
import { isProcessModeQuestion } from '../../../functions/shared/toolMath/representationBridge/lmrProcessModel.mjs';
import { keyProcessLog } from '../../../functions/shared/toolMath/representationBridge/lmrProcessVerify.mjs';

const fractionText = ({ n, d }) => (d === 1 ? String(n) : `${n}/${d}`);
const fractionLatex = ({ n, d }) => (d === 1 ? String(n) : `${n < 0 ? '-' : ''}\\frac{${Math.abs(n)}}{${d}}`);
const add = (a, b) => {
  const n = a.n * b.d + b.n * a.d;
  const d = a.d * b.d;
  const g = gcd(n, d) || 1;
  return { n: n / g, d: d / g };
};
const gcd = (a, b) => {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x;
};
const times = (k, f) => {
  const n = k * f.n;
  const g = gcd(n, f.d) || 1;
  return { n: n / g, d: f.d / g };
};
const num = ({ n, d }) => n / d;
const pairText = (x, y) => `(${fractionText(x)}, ${fractionText(y)})`;

/** "x", "-x", "3x", "\frac{1}{2}x" */
const slopeTermLatex = (m) => {
  if (m.d === 1 && m.n === 1) return 'x';
  if (m.d === 1 && m.n === -1) return '-x';
  return `${fractionLatex(m)}x`;
};

const signedLatex = (value) => (value.n === 0 ? '' : ` ${value.n < 0 ? '-' : '+'} ${fractionLatex({ n: Math.abs(value.n), d: value.d })}`);

export const correctLinearBoardResponse = (question) => {
  const facts = deriveLinearMultipleRepresentations(question);
  if (!facts.isValid) throw new Error(`no line: ${facts.error}`);
  const m = facts.slopeFraction;
  const b = facts.yInterceptFraction;
  const zero = facts.zeroFraction;
  // Two lattice-friendly points: the y-intercept and one slope step along.
  const step = { n: m.d, d: 1 };
  const second = { x: step, y: add(b, { n: m.n, d: 1 }) };
  const required = new Set(resolveRequiredCards(question));
  const { A, B, C } = facts.standard;

  const anchor = question.source?.kind === 'pointSlope' && Array.isArray(facts.sourcePoint)
    ? { x: { n: facts.sourcePoint[0], d: 1 }, y: { n: facts.sourcePoint[1], d: 1 } }
    : second;
  const anchorNext = { x: add(anchor.x, step), y: add(anchor.y, { n: m.n, d: 1 }) };

  const response = {};
  if (required.has('standardForm')) {
    const y = B === 1 ? 'y' : B === -1 ? 'y' : `${Math.abs(B)}y`;
    response.standardFormEquation = `${A === 1 ? '' : A}x ${B < 0 ? '-' : '+'} ${y} = ${C}`;
  }
  if (required.has('slopeIntercept')) response.slopeInterceptEquation = `y = ${slopeTermLatex(m)}${signedLatex(b)}`;
  if (required.has('pointSlope')) {
    const xOffset = anchor.x.n === 0 ? ' - 0' : signedLatex({ n: -anchor.x.n, d: anchor.x.d });
    response.pointSlopeEquation = `y${signedLatex({ n: -anchor.y.n, d: anchor.y.d }) || ' - 0'} = ${fractionLatex(m)}\\left(x${xOffset}\\right)`;
  }
  if (required.has('slope')) response.featureSlope = fractionText(m);
  if (required.has('xIntercept')) response.featureXIntercept = pairText(zero, { n: 0, d: 1 });
  if (required.has('yIntercept')) response.featureYIntercept = pairText({ n: 0, d: 1 }, b);
  if (required.has('twoPoints')) {
    response.featurePoint1 = pairText({ n: 0, d: 1 }, b);
    response.featurePoint2 = pairText(second.x, second.y);
  }
  if (required.has('table')) {
    response.tableRows = [0, 1, 2, 3].map((k) => ({
      x: fractionText(times(k, step)),
      y: fractionText(add(b, times(k, { n: m.n, d: 1 }))),
    }));
  }
  if (required.has('graphIntercepts')) response.graph1Points = [[num(zero), 0], [0, num(b)]];
  if (required.has('graphSlopeIntercept')) response.graph2Points = [[0, num(b)], [num(second.x), num(second.y)]];
  if (required.has('graphPointSlope')) response.graph3Points = [[num(anchor.x), num(anchor.y)], [num(anchorNext.x), num(anchorNext.y)]];

  const context = question.source?.context || question.context || {};
  gradedContextFields(question).forEach(({ field, key }) => {
    const entry = key === 'domain' ? (context.domain ?? question.domain) : context[key];
    response[field] = typeof entry === 'object' && entry !== null ? String(entry.value ?? '') : String(entry ?? '');
  });
  if (isProcessModeQuestion(question)) response.processLog = keyProcessLog(question);
  return response;
};

/** The same board with one card wrong, for "a wrong answer is not credited". */
export const oneWrongLinearBoardResponse = (question) => {
  const response = correctLinearBoardResponse(question);
  const facts = deriveLinearMultipleRepresentations(question);
  if (isProcessModeQuestion(question)) {
    // A typed fact is ignored in Process Mode, so the wrong part is a card the
    // process opened: an equation of another line.
    const wrongSlope = facts.slopeNumber + 7;
    if ('slopeInterceptEquation' in response) response.slopeInterceptEquation = `y = ${wrongSlope}x + ${facts.yInterceptNumber}`;
    else if ('pointSlopeEquation' in response) response.pointSlopeEquation = `y - ${facts.yInterceptNumber} = ${wrongSlope}(x - 0)`;
    else if ('standardFormEquation' in response) response.standardFormEquation = `${wrongSlope}x - y = ${-facts.yInterceptNumber}`;
    else if ('graph2Points' in response) response.graph2Points = [[0, facts.yInterceptNumber], [1, facts.yInterceptNumber + wrongSlope]];
    return response;
  }
  if ('featureSlope' in response) response.featureSlope = String(facts.slopeNumber + 7);
  else if ('featureYIntercept' in response) response.featureYIntercept = `(0, ${facts.yInterceptNumber + 7})`;
  return response;
};
