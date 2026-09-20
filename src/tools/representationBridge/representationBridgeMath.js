// Pure math/grading helpers for representationBridge.
//
// This tool has no independent mathematics of its own. It is a workspace that
// connects representations already graded elsewhere on main:
//   - table/rate evidence            -> linearTableWorkbenchMath.js
//   - equation canonicalization      -> shared/linearEquations.js
//   - structural form validation     -> stepAlgebra2/rewriteLinearFormMath.js
//   - plotted-line/anchor grading    -> graphing2/graphingMath.js + constructionPolicy.js
//   - contextual-meaning matching    -> expressionMeaning/expressionMeaningMath.js
// Every stage below calls the SAME functions those tools call. There is
// deliberately no second implementation of interval math, line equivalence,
// factored-form structure, or construction grading here.
import {
  fitTableLine,
  intervalTruth,
  isCollinear,
  normalizeRows,
  pairKey,
} from '../linearTableWorkbench/linearTableWorkbenchMath.js';
import { matchesNumericAnswer } from '../shared/toolMath.js';
import { canonicalFromEquationText, canonicalFromSlopeIntercept, linesEquivalent } from '../shared/linearEquations.js';
import { buildInitialEquationState, describeRewriteGap } from '../stepAlgebra2/rewriteLinearFormMath.js';
import { lineFromPoints, targetLineFromQuestion } from '../graphing2/graphingMath.js';
import { evaluateConstruction } from '../graphing2/constructionPolicy.js';
import { scoreExpressionMeaning } from '../expressionMeaning/expressionMeaningMath.js';

export const REPRESENTATION_BRIDGE_MODES = Object.freeze(['linear']);
export const REPRESENTATION_BRIDGE_STAGES = Object.freeze(['rateEvidence', 'generalForm', 'factoredForm', 'graph', 'meaning']);
export const REPRESENTATION_BRIDGE_FEEDBACK_TIMINGS = Object.freeze(['guided', 'checkpoint', 'submitOnly']);
export const REPRESENTATION_BRIDGE_HIGHLIGHTS = Object.freeze(['rate', 'start', 'zero']);

// The three fixed mathematical roles the meaning stage connects to context.
// Never authored: what "b" IS structurally does not vary by question.
export const REPRESENTATION_BRIDGE_MEANING_ROLES = Object.freeze({
  rate: 'rate of change / slope',
  yIntercept: 'y-intercept / constant term',
  zero: 'zero / x-intercept',
});

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isFiniteRow = (row) => Boolean(row) && Number.isFinite(row.x) && Number.isFinite(row.y);
const maxDistinctPairs = (rowCount) => (rowCount * (rowCount - 1)) / 2;

export const resolveRequiredStages = (question = {}) => {
  const authored = Array.isArray(question.requiredStages)
    ? [...new Set(question.requiredStages.filter((stage) => REPRESENTATION_BRIDGE_STAGES.includes(stage)))]
    : [];
  return authored.length ? authored : [...REPRESENTATION_BRIDGE_STAGES];
};

export const resolveFeedbackTiming = (question = {}) => (
  REPRESENTATION_BRIDGE_FEEDBACK_TIMINGS.includes(question.feedbackTiming) ? question.feedbackTiming : 'checkpoint'
);

/**
 * THE ONE DERIVATION OF THE CANONICAL LINE.
 *
 * Every stage below checks the student against `m`, `b`, and `zero` computed
 * here from the authored table — never against a separately authored m/b/zero
 * that could silently disagree with the rows a student is actually looking
 * at. `fitTableLine` is the exact same least-squares fit
 * linearTableWorkbench's own deriveEquation mode uses, so a genuinely
 * collinear table (guaranteed by validateRepresentationBridgeQuestion) comes
 * back exact.
 */
export const deriveLinearBridge = (question = {}) => {
  const rows = normalizeRows(question.source?.rows);
  const { m, b } = fitTableLine(rows);
  const hasSlope = Number.isFinite(m) && Math.abs(m) > 1e-9;
  const zero = hasSlope ? -b / m : null;
  return { rows, m, b, zero: Number.isFinite(zero) ? zero : null };
};

/** Safe platform default when an author does not supply graphBounds: pad the
 * data (and the derived intercepts) enough that both anchors stay visible. */
export const defaultGraphBounds = (derived) => {
  const xs = derived.rows.map((row) => row.x);
  const ys = derived.rows.map((row) => row.y);
  if (Number.isFinite(derived.zero)) xs.push(derived.zero);
  if (Number.isFinite(derived.b)) ys.push(derived.b);
  const xMinData = Math.min(...xs);
  const xMaxData = Math.max(...xs);
  const yMinData = Math.min(...ys);
  const yMaxData = Math.max(...ys);
  const xPad = Math.max(2, (xMaxData - xMinData) * 0.25);
  const yPad = Math.max(2, (yMaxData - yMinData) * 0.25);
  return {
    xMin: Math.floor(xMinData - xPad),
    xMax: Math.ceil(xMaxData + xPad),
    yMin: Math.floor(yMinData - yPad),
    yMax: Math.ceil(yMaxData + yPad),
  };
};

export const resolveGraphBounds = (question = {}, derived) => {
  const authored = question.graphBounds;
  const finite = isObject(authored) && [authored.xMin, authored.xMax, authored.yMin, authored.yMax].every((value) => Number.isFinite(Number(value)));
  if (finite && Number(authored.xMin) < Number(authored.xMax) && Number(authored.yMin) < Number(authored.yMax)) {
    return { xMin: Number(authored.xMin), xMax: Number(authored.xMax), yMin: Number(authored.yMin), yMax: Number(authored.yMax) };
  }
  return defaultGraphBounds(derived);
};

/**
 * The synthetic graphing2-shaped question the graph stage grades against.
 * This is deliberately the SAME shape graphing2 itself accepts for
 * `mode: 'factoredLinear'` with a required x-intercept anchor, so
 * `targetLineFromQuestion` and `evaluateConstruction` need no bridge-specific
 * branch — the Bridge is just another caller of graphing2's own grading.
 */
export const graphQuestionFor = (question = {}, derived) => ({
  mode: 'factoredLinear',
  factored: { a: derived.m, c: derived.zero },
  constructionPolicy: { strategy: 'formAware', requiredAnchor: 'xIntercept' },
  graphBounds: resolveGraphBounds(question, derived),
  tolerance: question.tolerance,
});

const bridgeMeaningExpressions = (context = {}) => ([
  { id: 'rate', expression: 'm', unit: context.rateUnit, contextMeaning: context.rateMeaning, mathRole: REPRESENTATION_BRIDGE_MEANING_ROLES.rate },
  { id: 'yIntercept', expression: 'b', unit: context.outputUnit, contextMeaning: context.yInterceptMeaning, mathRole: REPRESENTATION_BRIDGE_MEANING_ROLES.yIntercept },
  { id: 'zero', expression: 'c', unit: context.inputUnit, contextMeaning: context.zeroMeaning, mathRole: REPRESENTATION_BRIDGE_MEANING_ROLES.zero },
]);

/**
 * Recasts the Bridge's three fixed concepts (rate, y-intercept, zero) as an
 * `expressionMeaning`-shaped question so the meaning stage can call
 * `scoreExpressionMeaning` directly rather than re-implementing a second
 * meaning-matching algorithm. The three concepts' own authored unit/meaning
 * values double as each other's multiple-choice distractors.
 */
export const bridgeMeaningQuestion = (question = {}) => {
  const context = question.context || {};
  return {
    expressions: bridgeMeaningExpressions(context),
    choiceBanks: {
      units: [context.rateUnit, context.outputUnit, context.inputUnit],
      contextMeanings: [context.rateMeaning, context.yInterceptMeaning, context.zeroMeaning],
      mathRoles: Object.values(REPRESENTATION_BRIDGE_MEANING_ROLES),
    },
  };
};

const equationEquivalentToTrue = (equationText, m, b) => {
  const authored = canonicalFromEquationText(equationText);
  const target = canonicalFromSlopeIntercept(m, b);
  return Boolean(authored && target && linesEquivalent(authored, target));
};

/** Structural check reused verbatim from stepAlgebra2's rewrite engine: the
 * left side must simplify to exactly `y`, and the right side must be
 * structurally slope-intercept ("mx + b") or factored ("a(x - c)") form,
 * never merely an equivalent-but-different-shaped equation. */
const structurallyValidForm = (equationText, targetForm) => {
  if (!String(equationText || '').trim()) return false;
  try {
    const state = buildInitialEquationState({ equation: equationText, targetForm });
    return describeRewriteGap(state) === null;
  } catch {
    return false;
  }
};

/** Canonical line implied by whatever the student has actually plotted, for
 * cross-representation consistency only — never used as an answer key. */
const canonicalFromStudentGraphPoints = (points = []) => {
  if (!Array.isArray(points) || points.length < 2) return null;
  const line = lineFromPoints(points[0], points[1]);
  if (!line || line.kind === 'vertical') return null;
  return canonicalFromSlopeIntercept(line.m, line.b);
};

/**
 * Grades every requested representation individually, then grades whether the
 * student's OWN completed representations agree with each other (section L:
 * coherence). A student who writes `y = 5x - 20` and then `y = 5(x - 3)` has
 * two individually-plausible-looking answers that are not the same line, and
 * that mismatch must cost credit even though neither panel is "blank."
 */
export const scoreRepresentationBridge = (question = {}, response = {}) => {
  const derived = deriveLinearBridge(question);
  const requiredStages = resolveRequiredStages(question);
  const requiredComparisons = Math.max(1, Math.min(Number(question.requiredComparisons) || 3, maxDistinctPairs(derived.rows.length)));

  const parts = {};
  const evidence = {};

  if (requiredStages.includes('rateEvidence')) {
    const tableEvidence = Array.isArray(response.tableEvidence) ? response.tableEvidence : [];
    const seenPairs = new Set();
    const evidenceCorrectness = tableEvidence.map((raw) => {
      const entry = raw || {};
      const key = pairKey(entry.i, entry.j);
      const duplicate = seenPairs.has(key);
      seenPairs.add(key);
      const truth = intervalTruth(derived.rows[entry.i], derived.rows[entry.j]);
      if (!truth) return { key, duplicate, valid: false, complete: false };
      const complete = matchesNumericAnswer(entry.dx, truth.dx, 1e-6)
        && matchesNumericAnswer(entry.dy, truth.dy, 1e-6)
        && matchesNumericAnswer(entry.rate, truth.rate, 1e-6);
      return { key, duplicate, valid: true, complete };
    });
    const distinctPairCount = new Set(evidenceCorrectness.map((entry) => entry.key)).size;
    const noDuplicates = evidenceCorrectness.every((entry) => !entry.duplicate);
    const enoughEvidence = distinctPairCount >= requiredComparisons && noDuplicates;
    const allEvidenceCorrect = evidenceCorrectness.length > 0 && evidenceCorrectness.every((entry) => entry.complete);
    const slopeCorrect = matchesNumericAnswer(response.studentSlope, derived.m, 1e-4);
    // The source table is guaranteed genuinely linear by
    // validateRepresentationBridgeQuestion, so "constant" is always the true
    // conclusion here — but the student still has to state it (step 7 of the
    // table stage), not have it assumed for them.
    const conclusionCorrect = response.rateConclusion === 'constant';
    parts.rateEvidence = enoughEvidence && allEvidenceCorrect && slopeCorrect && conclusionCorrect;
    evidence.tableEvidence = evidenceCorrectness;
    evidence.studentSlope = { value: response.studentSlope, isCorrect: slopeCorrect };
    evidence.rateConclusion = { value: response.rateConclusion, isCorrect: conclusionCorrect };
  }

  let generalCanonical = null;
  if (requiredStages.includes('generalForm')) {
    const g = response.generalForm || {};
    const mCorrect = matchesNumericAnswer(g.m, derived.m, 1e-4);
    const bCorrect = matchesNumericAnswer(g.b, derived.b, 1e-4);
    const structural = structurallyValidForm(g.equation, 'slopeIntercept');
    const equivalent = equationEquivalentToTrue(g.equation, derived.m, derived.b);
    parts.generalForm = mCorrect && bCorrect && structural && equivalent;
    // Coherence compares the student's own parseable representations even
    // when one is mathematically wrong. Otherwise a contradictory but
    // well-formed entry disappears from the coherence check simply because it
    // is not also the answer-key line.
    generalCanonical = canonicalFromEquationText(g.equation);
    evidence.generalForm = { mCorrect, bCorrect, structural, equivalent };
  }

  let factoredCanonical = null;
  if (requiredStages.includes('factoredForm')) {
    const f = response.factoredForm || {};
    const aCorrect = matchesNumericAnswer(f.a, derived.m, 1e-4);
    const cCorrect = matchesNumericAnswer(f.c, derived.zero, 1e-4);
    const structural = structurallyValidForm(f.equation, 'factoredLinear');
    const equivalent = equationEquivalentToTrue(f.equation, derived.m, derived.b);
    parts.factoredForm = aCorrect && cCorrect && structural && equivalent;
    factoredCanonical = canonicalFromEquationText(f.equation);
    evidence.factoredForm = { aCorrect, cCorrect, structural, equivalent };
  }

  let graphCanonical = null;
  if (requiredStages.includes('graph')) {
    const graphQuestion = graphQuestionFor(question, derived);
    const target = targetLineFromQuestion(graphQuestion);
    const points = Array.isArray(response.graphConstruction?.points) ? response.graphConstruction.points : [];
    const graphEvidence = evaluateConstruction(points, graphQuestion, target, Number(question.tolerance ?? 0.12));
    parts.graph = graphEvidence.isCorrect;
    evidence.graph = graphEvidence;
    graphCanonical = canonicalFromStudentGraphPoints(points);
  }

  if (requiredStages.includes('meaning')) {
    const meaningQuestion = bridgeMeaningQuestion(question);
    const meaningResult = scoreExpressionMeaning(meaningQuestion, { assignments: response.meaningAssignments || {} });
    parts.meaning = meaningResult.isCorrect;
    evidence.meaning = meaningResult;
  }

  const canonicalLines = [generalCanonical, factoredCanonical, graphCanonical].filter(Boolean);
  const crossRepresentationConsistency = canonicalLines.length < 2
    || canonicalLines.every((line) => linesEquivalent(line, canonicalLines[0]));
  parts.crossRepresentationConsistency = crossRepresentationConsistency;
  evidence.crossRepresentationConsistency = crossRepresentationConsistency;

  const requiredParts = Object.values(parts);
  const score = requiredParts.length ? requiredParts.filter(Boolean).length / requiredParts.length : 0;
  const isCorrect = requiredParts.every(Boolean);

  return { isCorrect, score, parts, derived, requiredStages, requiredComparisons, evidence };
};

export const validateRepresentationBridgeQuestion = (question = {}) => {
  const errors = [];
  const mode = question.mode == null ? 'linear' : question.mode;
  if (!REPRESENTATION_BRIDGE_MODES.includes(mode)) {
    errors.push(`representationBridge only supports mode: ${REPRESENTATION_BRIDGE_MODES.join(', ')} in this version.`);
    return errors;
  }

  const source = question.source;
  if (!isObject(source) || source.kind !== 'table') {
    errors.push('representationBridge requires source.kind "table" (other source kinds are not implemented yet).');
    return errors;
  }
  const rawRows = Array.isArray(source.rows) ? source.rows : null;
  if (!rawRows || rawRows.length < 3) {
    errors.push('representationBridge requires at least three rows in source.rows.');
    return errors;
  }
  const rows = normalizeRows(rawRows);
  rows.forEach((row, index) => {
    if (!isFiniteRow(row)) errors.push(`representationBridge source row ${index + 1} must have finite x and y values.`);
  });
  if (errors.length) return errors;

  const xValues = rows.map((row) => row.x);
  if (new Set(xValues.map((x) => Number(x.toFixed(9)))).size !== xValues.length) {
    errors.push('representationBridge source rows must have distinct x-values; a repeated x is not a function.');
  }
  if (!isCollinear(rows)) {
    errors.push('representationBridge requires a genuinely linear source table (a constant rate of change); author the table so removing no row is necessary to make it linear.');
    return errors;
  }

  if (question.requiredStages != null) {
    if (!Array.isArray(question.requiredStages) || !question.requiredStages.length) {
      errors.push('representationBridge requiredStages must be a non-empty array.');
    } else {
      question.requiredStages.forEach((stage) => {
        if (!REPRESENTATION_BRIDGE_STAGES.includes(stage)) errors.push(`representationBridge requiredStages contains an unsupported stage: ${stage}.`);
      });
    }
  }
  const stages = resolveRequiredStages(question);

  if (question.requiredComparisons != null) {
    const requiredComparisons = question.requiredComparisons;
    if (!Number.isInteger(Number(requiredComparisons)) || Number(requiredComparisons) < 1) {
      errors.push('representationBridge requiredComparisons must be a positive integer.');
    } else if (Number(requiredComparisons) > maxDistinctPairs(rows.length)) {
      errors.push('representationBridge requiredComparisons cannot exceed the number of distinct row pairs available.');
    }
  }

  const derived = deriveLinearBridge(question);
  const needsNonzeroSlope = stages.some((stage) => ['factoredForm', 'graph', 'meaning'].includes(stage));
  if (needsNonzeroSlope && !(Number.isFinite(derived.m) && Math.abs(derived.m) > 1e-9)) {
    errors.push('representationBridge requires a nonzero derived slope when factoredForm, graph, or meaning stages are required — a zero-slope table has no x-intercept/zero.');
  } else if (needsNonzeroSlope && !Number.isFinite(derived.zero)) {
    errors.push('representationBridge could not derive a finite zero (x-intercept) from the source table.');
  }

  if (question.feedbackTiming != null && !REPRESENTATION_BRIDGE_FEEDBACK_TIMINGS.includes(question.feedbackTiming)) {
    errors.push(`representationBridge feedbackTiming must be one of: ${REPRESENTATION_BRIDGE_FEEDBACK_TIMINGS.join(', ')}.`);
  }

  if (question.graphBounds != null) {
    const bounds = question.graphBounds;
    const finite = isObject(bounds) && [bounds.xMin, bounds.xMax, bounds.yMin, bounds.yMax].every((value) => Number.isFinite(Number(value)));
    if (!finite) {
      errors.push('representationBridge graphBounds must supply finite xMin, xMax, yMin, and yMax.');
    } else if (Number(bounds.xMin) >= Number(bounds.xMax) || Number(bounds.yMin) >= Number(bounds.yMax)) {
      errors.push('representationBridge graphBounds must have xMin < xMax and yMin < yMax.');
    } else if (stages.includes('graph') && Number.isFinite(derived.zero)) {
      const margin = 1e-6;
      if (derived.zero < Number(bounds.xMin) - margin || derived.zero > Number(bounds.xMax) + margin) {
        errors.push('representationBridge graphBounds does not include the derived x-intercept the graph stage requires the student to plot.');
      }
      if (derived.b < Number(bounds.yMin) - margin || derived.b > Number(bounds.yMax) + margin) {
        errors.push('representationBridge graphBounds does not include the derived y-intercept.');
      }
    }
  }

  if (stages.includes('meaning')) {
    const context = question.context || {};
    ['rateUnit', 'outputUnit', 'inputUnit', 'rateMeaning', 'yInterceptMeaning', 'zeroMeaning'].forEach((field) => {
      if (!String(context[field] ?? '').trim()) errors.push(`representationBridge context.${field} is required when the meaning stage is required.`);
    });
    if (String(context.rateUnit ?? '').trim() && String(context.outputUnit ?? '').trim() && String(context.inputUnit ?? '').trim()) {
      const units = [context.rateUnit, context.outputUnit, context.inputUnit].map((value) => String(value).trim().toLowerCase());
      if (new Set(units).size !== units.length) errors.push('representationBridge context rateUnit/outputUnit/inputUnit must be distinct so the meaning stage is not degenerate.');
    }
    if (String(context.rateMeaning ?? '').trim() && String(context.yInterceptMeaning ?? '').trim() && String(context.zeroMeaning ?? '').trim()) {
      const meanings = [context.rateMeaning, context.yInterceptMeaning, context.zeroMeaning].map((value) => String(value).trim().toLowerCase());
      if (new Set(meanings).size !== meanings.length) errors.push('representationBridge context rateMeaning/yInterceptMeaning/zeroMeaning must be distinct so the meaning stage is not degenerate.');
    }
  }

  return errors;
};
