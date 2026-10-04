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
import { studentBuildInequalityEnabled } from './toolMath/systemsWorkspace/inequalityBuilderAdapter.mjs';

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
const uniqueNumericMatch = (value, correct, candidates) => {
  if (!finite(value)) return null;
  // A strategy whose value IS the answer is not a wrong strategy here.
  const matched = candidates.filter((candidate) => finite(candidate.value) && !near(candidate.value, correct) && near(value, candidate.value));
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
  'systemsWorkspace/inequalities': ({ question, grading }) => {
    if (studentBuildInequalityEnabled(question)) return [];
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
