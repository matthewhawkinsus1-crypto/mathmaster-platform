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
import { EXPRESSION_MEANING_DIMENSIONS, scoreExpressionMeaning } from '../expressionMeaning/expressionMeaningMath.js';
import {
  deriveLinearMultipleRepresentations,
  scoreLinearMultipleRepresentations,
  validateLinearMultipleRepresentationsQuestion,
} from './linearMultipleRepresentationsMath.js';

export * from './linearMultipleRepresentationsMath.js';

export const REPRESENTATION_BRIDGE_MODES = Object.freeze(['linear', 'linearMultipleRepresentations']);
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

/** How many distinct row intervals the rate stage asks for: the authored count
 * (default 3), never more than the table has pairs, never fewer than one. The
 * scorer, the stage-completion check and the panel all read this one rule. */
export const resolveRequiredComparisons = (question = {}, rowCount = 0) => (
  Math.max(1, Math.min(Number(question.requiredComparisons) || 3, maxDistinctPairs(rowCount)))
);

const filled = (value) => String(value ?? '').trim() !== '';

/**
 * WHETHER EACH STAGE IS FINISHED — NEVER WHETHER IT IS RIGHT.
 *
 * A stage is finished when every entry it is graded on has been made: the
 * intervals and their Δx, Δy and rate, the conclusion and m; m, b and the
 * equation; a, c and the equation; two plotted points; every meaning. Nothing
 * here is compared with the canonical line, which is what makes it safe to
 * report where outcomes are withheld (see resolveRepresentationBridgeStageGate).
 */
export const representationBridgeStageCompletion = (question = {}, response = {}) => {
  const rows = normalizeRows(question.source?.rows);
  const requiredComparisons = resolveRequiredComparisons(question, rows.length);
  const tableEvidence = Array.isArray(response.tableEvidence) ? response.tableEvidence : [];
  const distinctPairs = new Set(tableEvidence.map((entry) => pairKey(entry?.i, entry?.j))).size;
  const general = response.generalForm || {};
  const factored = response.factoredForm || {};
  const points = Array.isArray(response.graphConstruction?.points) ? response.graphConstruction.points : [];
  const meanings = isObject(response.meaningAssignments) ? response.meaningAssignments : {};
  return {
    rateEvidence: distinctPairs >= requiredComparisons
      && tableEvidence.every((entry) => filled(entry?.dx) && filled(entry?.dy) && filled(entry?.rate))
      && filled(response.rateConclusion)
      && filled(response.studentSlope),
    generalForm: filled(general.m) && filled(general.b) && filled(general.equation),
    factoredForm: filled(factored.a) && filled(factored.c) && filled(factored.equation),
    graph: points.length >= 2,
    meaning: Object.keys(REPRESENTATION_BRIDGE_MEANING_ROLES)
      .every((rowId) => EXPRESSION_MEANING_DIMENSIONS.every((dimension) => filled(meanings[rowId]?.[dimension]))),
  };
};

/**
 * WHAT "CHECK THIS STAGE" MAY SAY, AND WHAT IT MUST HOLD BACK.
 *
 * In `checkpoint` timing (the default) each stage check is a verdict that has to
 * pass before the next stage opens and before Submit. That is good practice. On
 * an activity that withholds outcomes until submission — a DOL, quiz or test —
 * it is a free answer key the student can query as often as they like: edit,
 * check, edit again until it says correct, then spend the one attempt.
 *
 * So a verdict exists only where the activity shows outcomes at once
 * (`showImmediateFeedback`, from ToolRuntimeContext: false on a DOL, quiz or
 * test, and under secure server grading, where this tool holds no key at all).
 * Without it a check reports only that the stage is FINISHED, no stage waits on
 * another being right, the highlights reveal nothing, and Submit waits only for
 * every required stage to be finished. With it, everything below is exactly
 * the behaviour practice always had.
 *
 * `stageChecks` holds what the last press of a stage's check recorded; a stored
 * check never stands alone — it counts only while the CURRENT draft still
 * passes, so editing earlier work re-locks what follows it.
 */
export const resolveRepresentationBridgeStageGate = ({
  feedbackTiming = 'checkpoint',
  showImmediateFeedback = true,
  requiredStages = REPRESENTATION_BRIDGE_STAGES,
  stageChecks = {},
  parts = {},
  completion = {},
  submissionFeedbackShown = false,
} = {}) => {
  const verdictsShown = showImmediateFeedback !== false;
  const checkpoint = feedbackTiming === 'checkpoint';
  const checks = isObject(stageChecks) ? stageChecks : {};
  const verdicts = isObject(parts) ? parts : {};
  const finished = isObject(completion) ? completion : {};
  const required = Array.isArray(requiredStages) ? requiredStages : REPRESENTATION_BRIDGE_STAGES;
  const passed = (stage) => checks[stage] === true && verdicts[stage] === true;
  const complete = (stage) => finished[stage] === true;

  return {
    verdictsShown,
    // Whether a stage is locked behind the ones before it. Only a verdict can
    // lock: without one, locking a stage until the last one "passes" would
    // itself tell the student the last one is right.
    stageBlocked: (stage) => {
      if (!checkpoint || !verdictsShown) return false;
      const prior = REPRESENTATION_BRIDGE_STAGES.slice(0, REPRESENTATION_BRIDGE_STAGES.indexOf(stage));
      return prior.filter((entry) => required.includes(entry)).some((entry) => !passed(entry));
    },
    readyToSubmit: !checkpoint || (verdictsShown ? required.every(passed) : required.every(complete)),
    // Whether a highlight may show the student's own value for a concept —
    // which it does only once that value is right, so it is a verdict too.
    revealAllowed: (stage) => {
      if (!verdictsShown) return false;
      if (feedbackTiming === 'guided') return true;
      if (checkpoint) return checks[stage] === true;
      return Boolean(submissionFeedbackShown);
    },
    // What one press of the stage's check records in `stageChecks`.
    recordCheck: (stage) => (verdictsShown ? Boolean(verdicts[stage]) : complete(stage)),
    // What the result beside a checked stage says: a verdict, or only whether
    // the stage is finished. Null until the stage has been checked.
    checkReport: (stage) => {
      if (checks[stage] == null) return null;
      return verdictsShown
        ? { kind: 'verdict', passed: passed(stage) }
        : { kind: 'completion', complete: complete(stage) };
    },
  };
};

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
  if (question.mode === 'linearMultipleRepresentations') {
    return deriveLinearMultipleRepresentations(question);
  }
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
  if (question.mode === 'linearMultipleRepresentations') {
    return scoreLinearMultipleRepresentations(question, response);
  }
  const derived = deriveLinearBridge(question);
  const requiredStages = resolveRequiredStages(question);
  const requiredComparisons = resolveRequiredComparisons(question, derived.rows.length);

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
  if (mode === 'linearMultipleRepresentations') {
    return validateLinearMultipleRepresentationsQuestion(question);
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
