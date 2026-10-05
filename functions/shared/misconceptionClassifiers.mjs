/*
 * SERVER MISCONCEPTION CLASSIFIERS — EVIDENCE FROM AUTHORITATIVE WORK, NEVER A GRADE.
 *
 *   classifyMisconceptions({ question, response, grading, familyValues })
 *
 * reads exactly three things:
 *
 *   question      the AUTHORITATIVE question the server graded (for a Question
 *                 Family slot, the instance rebuilt from its validated pin)
 *   response      the student's normalized raw work, as the server read it
 *   grading       the server's own grading result for that work
 *   familyValues  for a Question Family instance, the generated parameters
 *                 the server reproduced from the pin (never from the browser)
 *
 * and returns `{ classifier, findings, evidence }` — the codes from
 * misconceptionCodes.mjs the work proves, and the provenance block to store on
 * the attempt's evidence event (null when nothing is proved).
 *
 * WHAT "PROVES" MEANS HERE. Each classifier models a small set of specific
 * wrong strategies for a specific question shape and computes the exact value
 * each strategy produces from the authoritative question. A code is recorded
 * only when:
 *
 *   - the server graded the work, and graded the part(s) the code concerns
 *     complete and NOT correct (correct work is never classified);
 *   - the submitted value equals the value that strategy produces;
 *   - that value differs from the correct answer; and
 *   - no OTHER modeled strategy — including the "known but unnamed" ones listed
 *     as blockers, such as a value two different errors both produce — yields
 *     the same value. Two explanations for one value is no explanation.
 *
 * Everything else — an unreadable value, an unmodeled wrong answer, a shape
 * this file does not know — is no code. That is the expected outcome for most
 * wrong answers, and it is the honest one.
 *
 * NEVER A GRADE. This runs after grading, reads the grading result without
 * changing it, and nothing it returns is passed to the attempt policy. A throw
 * anywhere here is caught and is "no code": classification can never block,
 * delay or alter a submission. It sees no accommodation or support usage at
 * all, so support cannot create a code.
 *
 * Pure. The tool registry (serverGrading/toolGraders.mjs) is not loaded —
 * only the helpers each grader itself uses to read the same work.
 */
import { parseNumericAnswer, parseOrderedPair } from './answerUtils.mjs';
import { buildMisconceptionEvidence, getMisconceptionCode, MISCONCEPTION_EXCLUSIVITY } from './misconceptionCodes.mjs';
import { isToolResponse, readToolWork } from './serverGrading/toolResponseContract.mjs';
import { lineFeatureKey } from './serverGrading/tools/graphing.mjs';
import { normalizeIntervals, parseIntervalNotation } from './toolMath/intervalNumberLine/intervalMath.mjs';
import { readRelationshipModelWork } from './toolMath/scenario/scenarioWork.mjs';
import { distanceToBoundaryLine, studentBuildInequalityEnabled } from './toolMath/systemsWorkspace/inequalityBuilderAdapter.mjs';
import { studentBuildInequalityState } from './serverGrading/tools/systemsWorkspace/graphical.mjs';
import { parseNumericAnswer as parseToolNumber, correlation } from './toolMath/shared/toolMath.mjs';
import { fitTableLine, intervalTruth, normalizeRows, tableClassification } from './toolMath/linearTableWorkbench/linearTableWorkbenchMath.mjs';
import {
  composeValue, evaluateSpecWithDomain, inverseLabFunctions, inverseLabInitialX, inverseLabInputLocked,
} from './toolMath/inverseComposition/inverseCompositionMath.mjs';
import { relationPairsOf, sameSet, uniqueSorted } from './serverGrading/tools/relationMapping.mjs';
import { graphingModeOf, graphingTargetLine } from './toolMath/graphing2/graphingMath.mjs';
import { formAwareAnchorsForMode } from './toolMath/graphing2/constructionPolicy.mjs';
import { correlationDescriptor } from './toolMath/dataModeling/dataModelingMath.mjs';
import { dataModelingPoints } from './toolMath/dataModeling/dataModelingPlan.mjs';
import { choicesAreOwn } from './toolMath/shared/judgmentChoices.mjs';
import {
  parseNumericOrFraction, parseOrderedPair as parseBoardPair, validateContextField,
} from './toolMath/representationBridge/linearMultipleRepresentationsMath.mjs';
import { isProcessModeQuestion } from './toolMath/representationBridge/lmrProcessModel.mjs';

const EPSILON = 1e-9;
const text = (value) => String(value ?? '');
const list = (value) => (Array.isArray(value) ? value : []);
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const near = (a, b) => finite(a) && finite(b) && Math.abs(a - b) <= EPSILON * Math.max(1, Math.abs(a), Math.abs(b));
const nearPair = (pair, x, y) => Array.isArray(pair) && near(pair[0], x) && near(pair[1], y);
const ratio = (numerator, denominator) => (finite(numerator) && finite(denominator) && denominator !== 0 ? numerator / denominator : null);

/** The graded parts, by id. */
const partsById = (grading) => new Map(list(grading?.parts).filter((part) => part && part.id !== undefined).map((part) => [text(part.id), part]));

/** A part the server graded complete and not correct — the only kind a code may describe. */
const wrongPart = (parts, id) => {
  const part = parts.get(id);
  return part && part.graded !== false && part.isComplete === true && part.isCorrect !== true ? part : null;
};

const numberIn = (part) => (part ? parseNumericAnswer(text(part.response)) : null);
const pairIn = (part) => (part ? parseOrderedPair(text(part.response)) : null);

/*
 * THE UNIQUENESS RULE, shared by every numeric classifier.
 *
 * `candidates`: [{ code, value }], where `code: null` is a blocker — a wrong
 * strategy we can recognize but deliberately do not name (because two causes
 * produce it, say). Returns the one code whose value the student's matches,
 * or null when the value matches nothing, matches the correct answer, matches
 * a blocker, or matches two strategies.
 */
const uniqueNumericMatch = (value, correct, candidates, close = near) => {
  if (!finite(value)) return null;
  // A strategy whose value IS the answer is not a wrong strategy here.
  const matched = candidates.filter((candidate) => finite(candidate.value) && !close(candidate.value, correct) && close(value, candidate.value));
  const codes = new Set(matched.map((candidate) => candidate.code));
  if (codes.size !== 1 || codes.has(null)) return null;
  return [...codes][0];
};

/** Same rule for a whole-response pattern: exactly one named pattern may hold. */
const uniquePattern = (patterns) => {
  const held = patterns.filter((pattern) => pattern.holds === true);
  const codes = new Set(held.map((pattern) => pattern.code));
  if (codes.size !== 1 || codes.has(null)) return null;
  return held[0];
};

const finding = (code, parts) => ({ code, parts });

/*
 * Values a student typed or plotted, compared at a stated tolerance — used
 * where the grader itself compares at one (a table interval at 1e-6, a lab
 * box at 0.02) or where coordinates are stored to six decimals (a snapped
 * plotted point). `within(t)` is symmetric and never true for a non-number.
 */
const within = (tolerance) => (a, b) => finite(a) && finite(b) && Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(a), Math.abs(b));
const absWithin = (tolerance) => (a, b) => finite(a) && finite(b) && Math.abs(a - b) <= tolerance;

/* ---------------------------------------------------------------------------
 * QUESTION FAMILY CLASSIFIERS — keyed by family id and version, because they
 * read that version's generated parameters by name.
 * ------------------------------------------------------------------------- */

const FAMILY_CLASSIFIERS = {
  // Slope of the line through (x1, y1), (x2, y2): multiAnswer field `slope`.
  'linear.slopeFromPoints@1': ({ question, grading, values }) => {
    if (text(question?.type) !== 'multiAnswer') return [];
    const part = wrongPart(partsById(grading), 'slope');
    const { rise, run } = values;
    const slope = ratio(rise, run);
    if (!part || slope === null) return [];
    const code = uniqueNumericMatch(numberIn(part), slope, [
      { code: 'slope-run-over-rise', value: ratio(run, rise) },
      { code: 'slope-sign-reversed', value: slope === 0 ? null : -slope },
      // Both errors at once: recognizable, but it would be one code or the other.
      { code: null, value: ratio(-run, rise) },
    ]);
    return code ? [finding(code, ['slope'])] : [];
  },

  // Intercepts of the line through (p, 0) and (0, q): fields xIntercept, yIntercept.
  'functions.identifyIntercepts@1': ({ question, grading, values }) => {
    if (text(question?.type) !== 'multiAnswer') return [];
    const parts = partsById(grading);
    // Both intercepts must be graded wrong: a pattern is read across the pair.
    const X = pairIn(wrongPart(parts, 'xIntercept'));
    const Y = pairIn(wrongPart(parts, 'yIntercept'));
    const { p, q } = values;
    if (!X || !Y || !finite(p) || !finite(q)) return [];
    const matched = uniquePattern([
      // Each intercept given as the other point, or with the other's value.
      { code: 'intercepts-swapped', holds: (nearPair(X, 0, q) && nearPair(Y, p, 0)) || (nearPair(X, q, 0) && nearPair(Y, 0, p)) },
      // The right values written (y, x).
      { code: 'ordered-pair-reversed', holds: nearPair(X, 0, p) && nearPair(Y, q, 0) },
    ]);
    return matched ? [finding(matched.code, ['xIntercept', 'yIntercept'])] : [];
  },

  // a·x + b = c: multiAnswer field `solution`.
  'linear.twoStepEquation@1': ({ question, grading, values }) => {
    if (text(question?.type) !== 'multiAnswer') return [];
    const part = wrongPart(partsById(grading), 'solution');
    const { x, a, b, c } = values;
    if (!part || !finite(x)) return [];
    const code = uniqueNumericMatch(numberIn(part), x, [
      { code: 'inverse-operation-sign', value: ratio(c + b, a) },
      { code: 'partial-division', value: finite(c / a) ? c / a - b : null },
      // −x has two causes (dividing by |a|, or subtracting c − b the wrong
      // way round), and c − b is "did not divide": recognized, never named.
      { code: null, value: -x },
      { code: null, value: c - b },
    ]);
    return code ? [finding(code, ['solution'])] : [];
  },

  // a·x + b = cc·x + d: multiAnswer field `solution`.
  'linear.multiStepEquation@1': ({ question, grading, values }) => {
    if (text(question?.type) !== 'multiAnswer') return [];
    const part = wrongPart(partsById(grading), 'solution');
    const { x, a, b, cc, d } = values;
    if (!part || !finite(x)) return [];
    const code = uniqueNumericMatch(numberIn(part), x, [
      // The constant, the variable term, or both moved without changing sign.
      { code: 'inverse-operation-sign', value: ratio(d + b, a - cc) },
      { code: 'inverse-operation-sign', value: ratio(d - b, a + cc) },
      { code: 'inverse-operation-sign', value: ratio(d + b, a + cc) },
      { code: null, value: -x },
    ]);
    return code ? [finding(code, ['solution'])] : [];
  },

  'systems.elimination@1': ({ question, grading, values }) => {
    const { a1, b1, c1, a2, b2, c2 } = values;
    return classifySystem({
      question,
      grading,
      values,
      equations: [[a1, b1, c1], [a2, b2, c2]],
    });
  },

  'systems.substitution@1': ({ question, grading, values }) => {
    const { m, k, a, b, c } = values;
    // y = m·x + k is −m·x + y = k.
    return classifySystem({
      question,
      grading,
      values,
      equations: [[-m, 1, k], [a, b, c]],
      specific: (point) => {
        // a·x + b·(m·x) + k = c: b multiplied mx and not k.
        const partialX = ratio(c - k, a + b * m);
        if (partialX === null || !near(point[0], partialX)) return false;
        return near(point[1], m * partialX + k) || near(point[1], ratio(c - a * partialX, b));
      },
    });
  },

  // a|x − h| + k = c: fields smallerSolution, largerSolution.
  'absoluteValue.solveEquation@1': ({ question, grading, values }) => {
    if (text(question?.type) !== 'multiAnswer') return [];
    const parts = partsById(grading);
    const first = parts.get('smallerSolution');
    const second = parts.get('largerSolution');
    // Graded wrong as a whole; each value read as typed.
    if (!wrongPart(parts, 'smallerSolution') && !wrongPart(parts, 'largerSolution')) return [];
    if (first?.isComplete !== true || second?.isComplete !== true) return [];
    const s = [numberIn(first), numberIn(second)];
    const { low, high } = values;
    if (!s.every(finite) || !finite(low) || !finite(high)) return [];
    const isSolution = (value) => near(value, low) || near(value, high);
    const sameSet = (u, v) => (near(s[0], u) && near(s[1], v)) || (near(s[0], v) && near(s[1], u));
    // The right solutions in the wrong boxes match neither pattern: −t is not
    // a solution in the first, and the two solutions differ in the second.
    const matched = uniquePattern([
      { code: 'absolute-value-negated-solution', holds: [low, high].some((t) => !isSolution(-t) && sameSet(t, -t)) },
      { code: 'absolute-value-one-case-only', holds: near(s[0], s[1]) && isSolution(s[0]) },
    ]);
    return matched ? [finding(matched.code, ['smallerSolution', 'largerSolution'])] : [];
  },

  // Vertex (h, k) of y = a(x − h)² + k: field `vertex`.
  'quadratics.identifyVertex@1': ({ question, grading, values }) => {
    if (text(question?.type) !== 'multiAnswer') return [];
    const part = wrongPart(partsById(grading), 'vertex');
    const P = pairIn(part);
    const { h, k, a } = values;
    if (!P || !finite(h) || !finite(k) || !finite(a)) return [];
    const valueAtNegatedH = a * (-h - h) ** 2 + k;
    const matched = uniquePattern([
      { code: 'vertex-x-sign-reversed', holds: h !== 0 && (nearPair(P, -h, k) || nearPair(P, -h, valueAtNegatedH)) },
      { code: 'ordered-pair-reversed', holds: h !== k && nearPair(P, k, h) },
    ]);
    return matched ? [finding(matched.code, ['vertex'])] : [];
  },

  // Zeros r1 < r2 of a(x − r1)(x − r2): fields smallerZero, largerZero.
  'functions.identifyZeros@1': ({ question, grading, values }) => {
    if (text(question?.type) !== 'multiAnswer') return [];
    const parts = partsById(grading);
    const first = parts.get('smallerZero');
    const second = parts.get('largerZero');
    if (!wrongPart(parts, 'smallerZero') && !wrongPart(parts, 'largerZero')) return [];
    if (first?.isComplete !== true || second?.isComplete !== true) return [];
    const s = [numberIn(first), numberIn(second)];
    const { low, high } = values;
    if (!s.every(finite) || !finite(low) || !finite(high)) return [];
    const sameSet = (u, v) => (near(s[0], u) && near(s[1], v)) || (near(s[0], v) && near(s[1], u));
    // {−r1, −r2} = {r1, r2} when the zeros are opposites: nothing is visible.
    const opposites = near(-low, high);
    return !opposites && sameSet(-low, -high) ? [finding('zeros-sign-reversed', ['smallerZero', 'largerZero'])] : [];
  },

  /*
   * THE LINEAR REPRESENTATIONS BOARD (representationBridge /
   * linearMultipleRepresentations), Worksheet mode. The line is the family's
   * own: slope n/d, y-intercept (0, b), x-intercept (zero, 0); a reading
   * story also has its later reading (readTime, readAmount). The board's own
   * parsers read each box (LaTeX included), and the part verdicts are the
   * server's. Process Mode keeps its facts in a log with its own checks and
   * is not read here.
   */
  'linear.multipleRepresentations@1': ({ question, response, grading, values }) => {
    if (text(question?.type) !== 'representationBridge' || isProcessModeQuestion(question)) return [];
    const work = toolWork(response);
    if (!work) return [];
    const parts = partsById(grading);
    const { n, d, b, zero } = values;
    if (![n, d, b, zero].every(finite) || n === 0 || d === 0) return [];
    const slope = n / d;
    const story = finite(values.readAmount) && finite(values.readTime) && finite(values.rate) && finite(values.per);
    const findings = [];

    // Slope: Δx/Δy, or the opposite. A reading story's other rate readings
    // (the stated rate without its period, the line through the origin and
    // the reading) and a non-story's rise without its run are recognized and
    // never named.
    if (wrongPart(parts, 'slope')) {
      // −d/n ties with −m when |m| = 1. A reading story's line through the
      // origin and its reading (−readAmount/readTime) can equal d/n (2 lost
      // every 3 minutes, 18 left at minute 12: both −3/2). The family's
      // rules already keep the stated rate without its period (−rate) and a
      // non-story's rise without its run (n) off d/n and −m.
      const blockers = [
        -d / n,
        ...(story ? [-values.readAmount / values.readTime, values.readAmount / values.readTime] : []),
      ];
      const code = uniqueNumericMatch(parseNumericOrFraction(work.featureSlope)?.number, slope, [
        { code: 'slope-run-over-rise', value: d / n },
        { code: 'slope-sign-reversed', value: -slope },
        ...blockers.map((value) => ({ code: null, value })),
      ]);
      if (code) findings.push(finding(code, ['slope']));
    }

    // The later reading as the start: the rate is right (the slope part is
    // graded correct), and the y-intercept is exactly (0, readAmount) — a
    // number the story states once, that no other story number equals.
    const xWrong = wrongPart(parts, 'xIntercept');
    const yWrong = wrongPart(parts, 'yIntercept');
    if (story && yWrong && parts.get('slope')?.isCorrect === true) {
      const Y = parseBoardPair(work.featureYIntercept);
      const others = [values.rate, -values.rate, values.per, zero, values.readTime, values.remaining, -b, slope, d / n];
      if (Y && near(Y[0], 0) && near(Y[1], values.readAmount) && !others.some((value) => near(value, values.readAmount))) {
        findings.push(finding('initial-value-from-later-reading', ['yIntercept']));
      }
    }

    // The two intercepts exchanged, or each written (y, x).
    if (xWrong && yWrong) {
      const X = parseBoardPair(work.featureXIntercept);
      const Y = parseBoardPair(work.featureYIntercept);
      if (X && Y) {
        const matched = uniquePattern([
          { code: 'intercepts-swapped', holds: (nearPair(X, 0, b) || nearPair(X, b, 0)) && (nearPair(Y, zero, 0) || nearPair(Y, 0, zero)) },
          { code: 'ordered-pair-reversed', holds: nearPair(X, 0, zero) && nearPair(Y, b, 0) },
        ]);
        if (matched) findings.push(finding(matched.code, ['xIntercept', 'yIntercept']));
      }
    }

    // The two quantities exchanged, read against the slot's own context.
    const context = question?.source?.context || question?.context || {};
    if (wrongPart(parts, 'contextIndependent') && wrongPart(parts, 'contextDependent')
      && context.independentQuantity != null && context.dependentQuantity != null
      && validateContextField(work.contextIndependent, context.dependentQuantity).valid
      && validateContextField(work.contextDependent, context.independentQuantity).valid) {
      findings.push(finding('independent-dependent-swapped', ['contextIndependent', 'contextDependent']));
    }
    return findings;
  },
};

/*
 * A system answered as a `system` question (parts system-x / system-y over one
 * typed pair) or a multiAnswer `solution` pair. `equations`: [[A, B, C]] for
 * A·x + B·y = C. `specific(point)`: a more specific strategy that supersedes
 * "on one line only".
 */
const classifySystem = ({ question, grading, values, equations, specific = null }) => {
  const type = text(question?.type);
  const parts = partsById(grading);
  let point = null;
  let partIds = [];
  if (type === 'system') {
    const xPart = parts.get('system-x');
    const yPart = parts.get('system-y');
    if (!xPart || !yPart || xPart.isComplete !== true || yPart.isComplete !== true) return [];
    if (xPart.isCorrect === true && yPart.isCorrect === true) return [];
    point = [parseNumericAnswer(text(xPart.response)), parseNumericAnswer(text(yPart.response))];
    partIds = ['system-x', 'system-y'];
  } else if (type === 'multiAnswer') {
    point = pairIn(wrongPart(parts, 'solution'));
    partIds = ['solution'];
  }
  const { x0, y0 } = values;
  if (!point || !point.every(finite) || !finite(x0) || !finite(y0)) return [];
  if (nearPair(point, x0, y0)) return [];
  const satisfies = ([A, B, C]) => [A, B, C].every(finite) && near(A * point[0] + B * point[1], C);
  const onLines = equations.filter(satisfies).length;
  const patterns = [
    { code: 'ordered-pair-reversed', holds: x0 !== y0 && nearPair(point, y0, x0) },
    { code: 'substitution-partial-distribution', holds: Boolean(specific) && specific(point) === true },
  ];
  const matched = uniquePattern(patterns);
  if (matched) return [finding(matched.code, partIds)];
  // Two specific strategies fit: ambiguous, so not the generic code either.
  if (patterns.some((pattern) => pattern.holds)) return [];
  // The generic code only when no specific strategy explains the point.
  return onLines === 1 ? [finding('system-point-on-one-line-only', partIds)] : [];
};

/* ---------------------------------------------------------------------------
 * TOOL CLASSIFIERS — keyed by grading surface and mode, reading the work the
 * server graded with the same light helpers the grader used.
 * ------------------------------------------------------------------------- */

const toolWork = (response) => {
  if (!isToolResponse(response)) return null;
  const read = readToolWork(response);
  return read.ok ? read.work : null;
};

const TOOL_CLASSIFIERS = {
  // The slope and y-intercept of a displayed line, typed (GraphLine).
  'graphing/lineFeatures': ({ question, grading }) => {
    const parts = partsById(grading);
    const slopePart = wrongPart(parts, 'slope');
    const interceptPart = wrongPart(parts, 'intercept');
    const { m, b } = lineFeatureKey(question);
    if (!finite(m) || !finite(b)) return [];
    // The grader reads each box with Number(); so does this.
    const read = (part) => {
      if (!part) return null;
      const value = Number(text(part.response).trim());
      return text(part.response).trim() !== '' && Number.isFinite(value) ? value : null;
    };
    const slope = read(slopePart);
    const intercept = read(interceptPart);
    const swapped = slope !== null && intercept !== null && !near(m, b) && near(slope, b) && near(intercept, m);
    const slopeCode = slope === null ? null : uniqueNumericMatch(slope, m, [
      { code: 'slope-run-over-rise', value: ratio(1, m) },
      { code: 'slope-sign-reversed', value: m === 0 ? null : -m },
      { code: null, value: ratio(-1, m) },
    ]);
    // One part, one exclusive explanation: if the swap and a slope error both
    // fit the slope box, neither is recorded.
    if (swapped && slopeCode) return [];
    if (swapped) return [finding('slope-intercept-swapped', ['slope', 'intercept'])];
    return slopeCode ? [finding(slopeCode, ['slope'])] : [];
  },

  // Legacy inequality construction: per boundary, its points, style and shading.
  'systemsWorkspace/inequalities': ({ question, response, grading }) => {
    if (studentBuildInequalityEnabled(question)) return studentBuildInequalityFindings({ question, response, grading });
    const parts = partsById(grading);
    const findings = [];
    const styleParts = [];
    const shadeParts = [];
    for (const [id, part] of parts) {
      const index = /^boundary-(\d+)$/.exec(id)?.[1];
      // The style and shading are judged only on a boundary drawn correctly.
      if (!index || part.isCorrect !== true) continue;
      if (wrongPart(parts, `boundary-style-${index}`)) styleParts.push(`boundary-style-${index}`);
      if (wrongPart(parts, `shade-${index}`)) shadeParts.push(`shade-${index}`);
    }
    if (styleParts.length) findings.push(finding('inequality-boundary-style', styleParts));
    if (shadeParts.length) findings.push(finding('inequality-shaded-wrong-side', shadeParts));
    return findings;
  },

  // The solution set on a number line, and in interval notation.
  'intervalNumberLine/numberLine': ({ question, response, grading }) => {
    const expected = normalizeIntervals(question?.intervals);
    if (!expected.length) return [];
    const work = toolWork(response);
    if (!work) return [];
    const parts = partsById(grading);
    const byPart = [];
    if (wrongPart(parts, 'graph') && Array.isArray(work.intervals) && work.intervals.every((item) => item && typeof item === 'object' && !Array.isArray(item))) {
      byPart.push(['graph', normalizeIntervals(work.intervals)]);
    }
    if (wrongPart(parts, 'interval') && typeof work.notation === 'string') {
      const parsed = parseIntervalNotation(work.notation);
      if (parsed) byPart.push(['interval', parsed]);
    }
    const codes = new Map();
    byPart.forEach(([partId, built]) => {
      const code = intervalMistake(built, expected);
      if (code) codes.set(code, [...(codes.get(code) || []), partId]);
    });
    return [...codes].map(([code, partIds]) => finding(code, partIds));
  },

  // Which quantity is independent, and which dependent.
  'relationshipModel/standalone': ({ question, response, grading }) => {
    const parts = partsById(grading);
    if (!wrongPart(parts, 'independent') || !wrongPart(parts, 'dependent')) return [];
    const work = toolWork(response);
    if (!work) return [];
    const values = readRelationshipModelWork(work);
    const independent = text(question?.correctIndependentId);
    const dependent = text(question?.correctDependentId);
    if (!independent || !dependent || independent === dependent) return [];
    return values.independentId === dependent && values.dependentId === independent
      ? [finding('independent-dependent-swapped', ['independent', 'dependent'])]
      : [];
  },

  // --- Phase 2 ------------------------------------------------------------------
  'linearTableWorkbench/constantRate': (input) => classifyTableWorkbench(input),
  'linearTableWorkbench/repairValue': (input) => classifyTableWorkbench(input),
  'linearTableWorkbench/deriveEquation': (input) => classifyTableWorkbench(input),
  'inverseCompositionLab/full': (input) => classifyCompositionOrder(input),
  'inverseCompositionLab/composition': (input) => classifyCompositionOrder(input),
  'relationMapping/default': (input) => classifyDomainRangeSwap(input),
  'graphing2/slopeIntercept': (input) => classifyConstructedSlope(input),
  'graphing2/pointSlope': (input) => classifyConstructedSlope(input),
  'graphing2/factoredLinear': (input) => classifyConstructedSlope(input),
  'graphing2/standardForm': (input) => classifyConstructedSlope(input),
  'dataModelingLab/full': (input) => classifyCorrelation(input),
  'dataModelingLab/unrecognized': (input) => classifyCorrelation(input),
  'dataModelingLab/association': (input) => classifyCorrelation(input),
  'dataModelingLab/correlation': (input) => classifyCorrelation(input),
};

/* ---------------------------------------------------------------------------
 * PHASE 2 TOOL CLASSIFIERS. Each reads the work with the helpers its grader
 * reads it with, recomputes the truth from the authoritative question, and
 * names a strategy only where the structured work pins it down. Each one's
 * evidence, blockers, ties, exclusivity and coexistence are tabled in
 * docs/architecture/MISCONCEPTION_EVIDENCE.md.
 * ------------------------------------------------------------------------- */

// A table row index, as the workbench grader reads one.
const rowIndexOf = (value) => {
  if (typeof value === 'number') return Number.isInteger(value) && value >= 0 ? value : null;
  if (typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value)) return Number(value);
  return null;
};
const typedNumber = (value) => (typeof value === 'string' || typeof value === 'number' ? parseToolNumber(String(value)) : null);

/*
 * LINEAR TABLE WORKBENCH.
 *
 *   Rate inverted (slope-run-over-rise), per recorded interval: the student's
 *   own Δx and Δy are right (in increasing-x order, or both negated for the
 *   order the rows were clicked), and the rate typed is exactly Δx/Δy where
 *   |Δx| ≠ |Δy|. Boxes typed into each other (Δy in the Δx box) are not this.
 *   An interval with right Δx and Δy and a DIFFERENT wrong rate is a second
 *   strategy in the same work: no code.
 *
 *   Derive the equation: the slope box, as the line-features slope (1/m, −m;
 *   −1/m a blocker); and the later reading as the starting value — the slope
 *   is graded right, the b box is graded wrong, the equation box is not graded
 *   right, and b equals the y of exactly one row with x > 0. Blockers: the
 *   sign error working back to x = 0 (y_j + m·x_j for any row), "subtracted x
 *   instead of m·x" (y_j − x_j), −b and m.
 */
const classifyTableWorkbench = ({ question, response, grading }) => {
  const work = toolWork(response);
  if (!work) return [];
  const parts = partsById(grading);
  const rows = normalizeRows(question?.rows);
  const close = absWithin(1e-6);
  const findings = [];

  const intervalRateParts = [];
  if (wrongPart(parts, 'evidenceAccuracy')) {
    let inverted = 0;
    let otherWrongRate = false;
    list(work.intervals).forEach((raw) => {
      const entry = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
      const i = rowIndexOf(entry.i);
      const j = rowIndexOf(entry.j);
      const truth = i === null || j === null ? null : intervalTruth(rows[i], rows[j]);
      if (!truth) return;
      const [dx, dy, rate] = [typedNumber(entry.dx), typedNumber(entry.dy), typedNumber(entry.rate)];
      if (![dx, dy, rate].every(finite)) return;
      const ownDifferences = (close(dx, truth.dx) && close(dy, truth.dy)) || (close(dx, -truth.dx) && close(dy, -truth.dy));
      if (!ownDifferences || close(rate, truth.rate)) return;
      // Δx/Δy is never the rate here: equal to it only when |Δx| = |Δy|, and
      // then a rate equal to the truth has already returned above.
      if (close(rate, truth.dx / truth.dy)) inverted += 1;
      else otherWrongRate = true;
    });
    if (inverted > 0 && !otherWrongRate) intervalRateParts.push('evidenceAccuracy');
  }

  const mode = text(grading?.mode);
  const fit = mode === 'deriveEquation' && rows.length >= 2 && tableClassification(rows) === 'linear' ? fitTableLine(rows) : null;
  const slopeClose = absWithin(1e-4);
  let slopeCode = null;
  if (fit && finite(fit.m) && finite(fit.b) && wrongPart(parts, 'slope')) {
    slopeCode = uniqueNumericMatch(typedNumber(work.m), fit.m, [
      { code: 'slope-run-over-rise', value: ratio(1, fit.m) },
      { code: 'slope-sign-reversed', value: fit.m === 0 ? null : -fit.m },
      { code: null, value: ratio(-1, fit.m) },
    ], slopeClose);
  }
  const runOverRiseParts = [...intervalRateParts, ...(slopeCode === 'slope-run-over-rise' ? ['slope'] : [])];
  if (runOverRiseParts.length) findings.push(finding('slope-run-over-rise', runOverRiseParts));
  if (slopeCode === 'slope-sign-reversed') findings.push(finding('slope-sign-reversed', ['slope']));

  if (fit && finite(fit.m) && finite(fit.b) && parts.get('slope')?.isCorrect === true
    && wrongPart(parts, 'intercept') && parts.get('equation')?.isCorrect !== true) {
    // A linear table with m ≠ 0 holds each y once, so a matching row is the
    // one reading the value came from; with m = 0 every row holds b, which
    // the wrong intercept part rules out.
    const typedB = typedNumber(work.b);
    const blockers = [
      -fit.b,
      fit.m,
      ...rows.map((row) => row.y + fit.m * row.x),
      ...rows.map((row) => row.y - row.x),
    ];
    if (rows.some((row) => row.x > 0 && close(row.y, typedB)) && !blockers.some((value) => close(value, typedB))) {
      findings.push(finding('initial-value-from-later-reading', ['intercept']));
    }
  }
  return findings;
};

/*
 * INVERSE / COMPOSITION LAB — composition order exchanged. The lab's two boxes
 * name their order ((f ∘ g)(x) and (g ∘ f)(x)), so the order the student used
 * for each is read from its value: both boxes graded wrong, each holding the
 * OTHER composition at the server's x (the grader's 0.02 tolerance), the two
 * compositions more than twice that apart, and neither value also another
 * modeled strategy. One box exchanged and the other right is the same value
 * twice — no code.
 */
const COMPOSITION_TOLERANCE = 0.02;
const classifyCompositionOrder = ({ question, response, grading }) => {
  const parts = partsById(grading);
  if (!wrongPart(parts, 'fog') || !wrongPart(parts, 'gof')) return [];
  const work = toolWork(response);
  if (!work) return [];
  const { f, g } = inverseLabFunctions(question || {});
  const x = inverseLabInputLocked(question || {})
    ? Number(inverseLabInitialX(question || {}))
    : (typeof work.x === 'string' || typeof work.x === 'number' ? Number(work.x) : Number.NaN);
  const fog = composeValue(f, g, x);
  const gof = composeValue(g, f, x);
  if (!finite(fog) || !finite(gof) || Math.abs(fog - gof) <= 2 * COMPOSITION_TOLERANCE) return [];
  const close = absWithin(COMPOSITION_TOLERANCE);
  const typedFog = typedNumber(work.fogAnswer);
  const typedGof = typedNumber(work.gofAnswer);
  if (!close(typedFog, gof) || !close(typedGof, fog)) return [];
  const fx = evaluateSpecWithDomain(f, x);
  const gx = evaluateSpecWithDomain(g, x);
  const others = [fx * gx, fx + gx, composeValue(f, f, x), composeValue(g, g, x), fx, gx].filter(finite);
  if (others.some((value) => close(value, typedFog) || close(value, typedGof))) return [];
  return [finding('composition-order-reversed', ['fog', 'gof'])];
};

/*
 * RELATION MAPPING — domain and range exchanged. Every token of each typed
 * list must be a number (one enclosing { } or [ ] allowed), so a formatting
 * slip is never read as a reversal; the typed domain is exactly the range set
 * and the typed range exactly the domain set; the two sets differ.
 */
const strictNumberList = (value) => {
  if (typeof value !== 'string') return null;
  const inner = value.trim().replace(/^\{(.*)\}$/s, '$1').replace(/^\[(.*)\]$/s, '$1');
  const tokens = inner.split(/[,;]/).map((token) => token.trim().replace(/−/g, '-'));
  if (!tokens.length || tokens.some((token) => token === '')) return null;
  const numbers = tokens.map(Number);
  return numbers.every((number) => Number.isFinite(number)) ? numbers : null;
};
const classifyDomainRangeSwap = ({ question, response, grading }) => {
  const parts = partsById(grading);
  if (!wrongPart(parts, 'domain') || !wrongPart(parts, 'range')) return [];
  const work = toolWork(response);
  if (!work) return [];
  const pairs = relationPairsOf(question?.pairs);
  if (!pairs.length) return [];
  const domain = uniqueSorted(pairs.map(([x]) => x));
  const range = uniqueSorted(pairs.map(([, y]) => y));
  // When the domain IS the range, an exchanged answer is the right answer,
  // and both parts graded wrong already rules it out.
  const typedDomain = strictNumberList(work.domainText);
  const typedRange = strictNumberList(work.rangeText);
  if (!typedDomain || !typedRange) return [];
  return sameSet(typedDomain, range) && sameSet(typedRange, domain)
    ? [finding('domain-range-swapped', ['domain', 'range'])]
    : [];
};

/*
 * GRAPHING2 — the slope of a constructed line. Only the plotted points are
 * stored, so the student's slope is read from them, and only when the
 * construction leaves one explanation: every plotted point is on one
 * non-vertical line, that line passes EXACTLY through the point the
 * question's form gives (the y-intercept of y = mx + b, the given point of
 * point-slope, the x-intercept of a(x − c), an intercept of Ax + By = C), and
 * its slope is exactly 1/m or −m (−1/m and any tie a blocker). A line that
 * misses the anchor has two errors in it (where it starts and how it climbs):
 * no code. The target slope comes from the authored fields, never from the
 * eight-place rounding the grader's line carries.
 */
const authoredGraphSlope = (question, mode) => {
  if (mode === 'slopeIntercept') return Number(question?.line?.m ?? graphingTargetLine(question)?.m);
  if (mode === 'pointSlope') return Number(question?.slope);
  if (mode === 'factoredLinear') return Number(question?.factored?.a);
  if (mode === 'standardForm') {
    const A = Number(question?.standard?.A);
    const B = Number(question?.standard?.B);
    return B === 0 ? Number.NaN : -A / B;
  }
  return Number.NaN;
};
const classifyConstructedSlope = ({ question, response, grading }) => {
  // The grader's own verdict on the line (graded or reported): a line it
  // judged right is never read for a slope error.
  const line = partsById(grading).get('line');
  if (!line || line.isCorrect === true) return [];
  const work = toolWork(response);
  if (!work || !Array.isArray(work.points)) return [];
  const points = work.points.filter((point) => Array.isArray(point) && point.length === 2 && point.every((value) => typeof value === 'number' && Number.isFinite(value)));
  if (points.length !== work.points.length) return [];
  const distinct = points.filter((point, index) => points.findIndex((other) => Math.abs(other[0] - point[0]) < 1e-9 && Math.abs(other[1] - point[1]) < 1e-9) === index);
  if (distinct.length < 2) return [];
  const mode = graphingModeOf(question || {});
  const target = graphingTargetLine(question || {});
  const m = authoredGraphSlope(question || {}, mode);
  if (!target || target.kind !== 'slopeIntercept' || !finite(m) || m === 0) return [];
  const [first, second] = distinct;
  if (Math.abs(second[0] - first[0]) < 1e-9) return [];
  const slope = (second[1] - first[1]) / (second[0] - first[0]);
  const close = within(1e-6);
  const onStudentLine = ([x, y]) => close(y, first[1] + slope * (x - first[0]));
  if (!distinct.every(onStudentLine)) return [];
  const anchors = formAwareAnchorsForMode(mode, question || {}, target).anchors || [];
  if (!anchors.some(({ point }) => Array.isArray(point) && onStudentLine(point.map(Number)))) return [];
  const code = uniqueNumericMatch(slope, m, [
    { code: 'slope-run-over-rise', value: ratio(1, m) },
    { code: 'slope-sign-reversed', value: -m },
    { code: null, value: ratio(-1, m) },
  ], close);
  return code ? [finding(code, ['line'])] : [];
};

/*
 * DATA MODELING LAB — the direction of the association, and a causation claim.
 *
 *   Direction reversed: r from the authoritative points (as the grader
 *   computes it) has |r| ≥ 0.2, so the direction is not borderline; the
 *   student chose the opposite direction in a graded part that is wrong, or
 *   typed r with the opposite sign (within the grader's tolerance of −r).
 *   The chosen direction counts only when the work says its choices are the
 *   student's own (older work could hold a pre-selected "positive"), and a
 *   correct chosen direction beside a sign-flipped r is a contradiction: no
 *   code.
 *
 *   Causation: the structured causation choice is exactly "causation", the
 *   question does not mark causation as supported, and the association part
 *   is wrong. A selection, never text. Coexists with the direction code.
 */
const classifyCorrelation = ({ question, response, grading }) => {
  const work = toolWork(response);
  if (!work) return [];
  const parts = partsById(grading);
  const r = correlation(dataModelingPoints(question || {}));
  if (!finite(r)) return [];
  const key = correlationDescriptor(r);
  const opposite = { positive: 'negative', negative: 'positive' }[key.direction];
  const ownChoices = choicesAreOwn(work);
  const findings = [];
  if (opposite && Math.abs(r) >= 0.2 && !(ownChoices && work.direction === key.direction)) {
    const reversed = [];
    if (ownChoices && work.direction === opposite) {
      ['association', 'correlationInterpretation'].forEach((id) => { if (wrongPart(parts, id)) reversed.push(id); });
    }
    if (wrongPart(parts, 'correlation')) {
      const typedR = typedNumber(work.r);
      const tolerance = Number(question?.correlationTolerance ?? 0.03);
      if (finite(typedR) && Math.abs(typedR + r) <= tolerance) reversed.push('correlation');
    }
    if (reversed.length) findings.push(finding('correlation-direction-reversed', reversed));
  }
  if (ownChoices && work.causation === 'causation' && question?.causationSupported !== true && wrongPart(parts, 'association')) {
    findings.push(finding('correlation-treated-as-causation', ['association']));
  }
  return findings;
};

/*
 * SYSTEMS WORKSPACE, STUDENT-BUILD INEQUALITIES. One graded part per
 * constraint folds rewrite, boundary, style and shading together, so each
 * step's status is recomputed by the grader's own state function. A style or
 * shading code is named on a constraint graded wrong whose rewrite (if asked)
 * verified and whose boundary is right:
 *
 *   boundary style — a style was chosen, and it is the other one;
 *   shaded side    — the shading point is on the other side of the boundary,
 *                    and clear of it (> 0.25), so the student's own line and
 *                    the authoritative one agree which side it is on.
 *
 * Modeling questions are graded against the student's own model and are not
 * read here. A wrong boundary line (equation or construction) is not named:
 * from the stored line alone a wrong slope, a wrong intercept and a rewrite
 * slip cannot be told apart.
 */
const SHADE_CLEARANCE = 0.25;
const studentBuildInequalityFindings = ({ question, response, grading }) => {
  if (question?.modeling) return [];
  const work = toolWork(response);
  if (!work) return [];
  const parts = partsById(grading);
  const { task, build, workingConstraints, statuses } = studentBuildInequalityState(question, work);
  const { buildConfig } = task;
  const styleParts = [];
  const shadeParts = [];
  statuses.forEach((status, index) => {
    const id = `constraint-${index + 1}`;
    if (!wrongPart(parts, id) || !status.rewriteVerified || !status.boundaryCorrect) return;
    const row = build[index];
    const constraint = workingConstraints[index];
    // (A constraint with no style chosen is incomplete, so never reaches here.)
    if (buildConfig.lineStyle && !status.styleCorrect) styleParts.push(id);
    const point = row?.shadePoint;
    if (buildConfig.shading && point && !status.shadeCorrect && distanceToBoundaryLine(constraint, point[0], point[1]) > SHADE_CLEARANCE) shadeParts.push(id);
  });
  return [
    ...(styleParts.length ? [finding('inequality-boundary-style', styleParts)] : []),
    ...(shadeParts.length ? [finding('inequality-shaded-wrong-side', shadeParts)] : []),
  ];
};

const sameEndpoint = (a, b) => a === b || near(a, b);

/** One interval answer against the key: an inclusion error, a reversed ray, or nothing. */
const intervalMistake = (built, expected) => {
  if (built.length !== expected.length || !built.length) return null;
  const endpointsMatch = built.every((interval, index) => sameEndpoint(interval.min, expected[index].min) && sameEndpoint(interval.max, expected[index].max));
  if (endpointsMatch) {
    const inclusionDiffers = built.some((interval, index) => interval.minClosed !== expected[index].minClosed || interval.maxClosed !== expected[index].maxClosed);
    return inclusionDiffers ? 'endpoint-inclusion-error' : null;
  }
  // A single ray from the same endpoint, pointing the other way, with the
  // endpoint's inclusion unchanged. (Changed too, it is the complement: x ≥ a
  // for x < a is a different misreading, and is not named.)
  if (expected.length !== 1) return null;
  const [want] = expected;
  const [got] = built;
  const rightRay = (interval) => Number.isFinite(interval.min) && interval.max === Number.POSITIVE_INFINITY;
  const leftRay = (interval) => interval.min === Number.NEGATIVE_INFINITY && Number.isFinite(interval.max);
  if (rightRay(want) && leftRay(got) && sameEndpoint(want.min, got.max) && want.minClosed === got.maxClosed) return 'inequality-direction-reversed';
  if (leftRay(want) && rightRay(got) && sameEndpoint(want.max, got.min) && want.maxClosed === got.minClosed) return 'inequality-direction-reversed';
  return null;
};

/** Which classifier, if any, owns this graded question. */
export const misconceptionClassifierIdFor = ({ question, grading, familyValues = null } = {}) => {
  const familyId = text(question?.familyInstance?.familyId);
  const familyVersion = Number(question?.familyInstance?.familyVersion);
  if (familyId && familyValues && typeof familyValues === 'object') {
    const key = `${familyId}@${familyVersion}`;
    return FAMILY_CLASSIFIERS[key] ? `family:${key}` : null;
  }
  const toolKey = `${text(grading?.surfaceId)}/${text(grading?.mode)}`;
  return TOOL_CLASSIFIERS[toolKey] ? `tool:${toolKey}` : null;
};

/** Every classifier this file implements (the registry declares the same set). */
export const IMPLEMENTED_MISCONCEPTION_CLASSIFIERS = Object.freeze([
  ...Object.keys(FAMILY_CLASSIFIERS).map((key) => `family:${key}`),
  ...Object.keys(TOOL_CLASSIFIERS).map((key) => `tool:${key}`),
]);

/*
 * Exclusive codes on one part: two different exclusive codes claiming the same
 * part cancel each other. A superseded code is dropped when its more specific
 * code is present.
 */
const reconcile = (findings) => {
  const exclusiveClaims = new Map();
  findings.forEach(({ code, parts }) => {
    if (getMisconceptionCode(code)?.exclusivity !== MISCONCEPTION_EXCLUSIVITY.EXCLUSIVE) return;
    parts.forEach((partId) => exclusiveClaims.set(partId, new Set([...(exclusiveClaims.get(partId) || []), code])));
  });
  const contested = new Set([...exclusiveClaims].filter(([, codes]) => codes.size > 1).flatMap(([, codes]) => [...codes]));
  const present = new Set(findings.map((entry) => entry.code));
  const superseded = new Set([...present].flatMap((code) => getMisconceptionCode(code)?.supersedes || []));
  return findings.filter(({ code }) => !contested.has(code) && !superseded.has(code));
};

const NONE = Object.freeze({ classifier: null, findings: Object.freeze([]), evidence: null });

/**
 * Classify one graded attempt. Never throws; never touches its arguments.
 */
export const classifyMisconceptions = ({ question = null, response = null, grading = null, familyValues = null } = {}) => {
  try {
    if (!grading || grading.graded !== true || grading.isCorrect === true) return NONE;
    const classifierId = misconceptionClassifierIdFor({ question, grading, familyValues });
    if (!classifierId) return NONE;
    const [kind, key] = [classifierId.slice(0, classifierId.indexOf(':')), classifierId.slice(classifierId.indexOf(':') + 1)];
    const run = kind === 'family' ? FAMILY_CLASSIFIERS[key] : TOOL_CLASSIFIERS[key];
    const raw = run({ question, response, grading, values: familyValues || {} }) || [];
    const findings = reconcile(raw.filter((entry) => getMisconceptionCode(entry?.code)));
    const evidence = buildMisconceptionEvidence({ classifierId, findings });
    if (!evidence) return { ...NONE, classifier: classifierId };
    return { classifier: classifierId, findings: evidence.findings, evidence };
  } catch {
    return NONE;
  }
};

export default classifyMisconceptions;
