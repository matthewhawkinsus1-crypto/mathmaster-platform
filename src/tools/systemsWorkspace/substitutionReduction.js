/*
 * SUBSTITUTION AS DIMENSIONAL REDUCTION (#341).
 *
 * A k×k linear system is solved by substitution in rounds:
 *
 *   k equations, k variables
 *     -> the student isolates ONE variable in ONE equation      (Step Algebra)
 *     -> substitutes that expression into each OTHER equation   (k - 1 targets)
 *     -> simplifies each result to standard form                 (Step Algebra)
 *   = k - 1 equations in k - 1 variables — the reduced system — solved the same
 *     way, down to the 2×2 workflow that already exists
 *     -> the known values go back into an equation holding the isolated
 *        variable, and the student solves it                     (Step Algebra)
 *     -> every value is verified in every ORIGINAL equation.
 *
 * This module is the round, as data. It holds no React and performs no
 * algebra a student is meant to do: every expression it stores was produced by
 * Step Algebra or typed by the student and checked for equivalence. What it
 * does is record LINEAGE — which original equation was the source, which
 * variable was isolated, which target produced which reduced equation — so the
 * workflow can say where every equation came from, a draft can be repaired
 * deterministically after a deploy, and a grader can see the whole chain.
 *
 * Nothing here is 3-specific. The 3×3 workspace is the first caller; a 4×4
 * system would run one more round of the same state.
 *
 * Every transition is a pure function `(state, system, ...) -> { state, feedback }`.
 * `feedback` is transient interaction text for the student (a neutral
 * rejection), never mathematics, and never persisted.
 */
import { evaluate } from 'mathjs';
import { expressionsEquivalent, isLinearStandardFormEquation, latexToExpression } from '../../algebraAstEngine.js';
import {
  classifyLinearSystem,
  equationMentionsVariable,
  evaluateEquationSides,
  exactNumberText,
  isolatedExpressionFor,
  linearEquationForm,
  linearFormsEquivalent,
  presentableExpression,
  repairPersistedIsolation,
  substituteIntoEquation,
  variableIsIsolated,
} from './algebraicSystemsEngine.js';

export const REDUCTION_STATE_VERSION = 1;

/** The isolated variable's own relationship, e.g. x = 6 - y - z, as a back-substitution destination. */
export const RELATION_DESTINATION_ID = 'relation';

export const emptyTokenPreparation = () => ({
  expression: null,
  tokenExpression: null,
  simplificationDraft: '',
  simplifying: false,
  simplificationChecked: false,
  simplificationValid: false,
});

export const emptyVerificationEntry = () => ({ placed: {}, leftAnswer: '', rightAnswer: '', checked: false, valid: false });

export const emptyReductionState = () => ({
  version: REDUCTION_STATE_VERSION,
  // { equationId, variable } — the student's choice of what to isolate first.
  source: null,
  // Step Algebra's isolated expression, then the token the student made from it.
  isolation: emptyTokenPreparation(),
  // Keyed by ORIGINAL equation id. `substituted`: the token went into this
  // equation. `carried`: the equation never contained the isolated variable
  // and the student carried it forward as it was. `standardText` is the
  // student's Step Algebra result in standard form, once they have finished it.
  targets: {},
  // Which reduced equation the student has open in Step Algebra.
  activeTargetId: null,
  // Back-substitution for the isolated variable, once the reduced system is solved.
  back: { destinationId: null, placed: {}, solved: null },
  // Verification in the ORIGINAL equations, keyed by equation id.
  verification: {},
});

const clone = (value) => JSON.parse(JSON.stringify(value));
const result = (state, feedback = null) => ({ state, feedback });

/* ----------------------------------------------------------------- system */

/**
 * The authored system in the shape the round works on: ordered variables and
 * equations with stable lineage ids (E1, E2, …) and display labels.
 */
export const buildReductionSystem = ({ variables, equations }) => ({
  variables: [...variables],
  equations: equations.map((text, index) => ({
    id: `E${index + 1}`,
    text: String(text),
    label: `Equation ${index + 1}`,
    short: `E${index + 1}`,
  })),
});

const equationById = (system, id) => system.equations.find((equation) => equation.id === id) || null;

/** The equations the isolated expression must go into, in authored order. */
export const reductionTargets = (state, system) => (
  state.source ? system.equations.filter((equation) => equation.id !== state.source.equationId) : []
);

/** R1, R2, … — the reduced equation each target becomes, numbered by the target's authored order. */
export const reducedEquationId = (state, system, targetId) => {
  const index = reductionTargets(state, system).findIndex((equation) => equation.id === targetId);
  return index < 0 ? null : `R${index + 1}`;
};

export const remainingVariables = (state, system) => (
  state.source ? system.variables.filter((name) => name !== state.source.variable) : [...system.variables]
);

/** The expression the source variable equals: Step Algebra's result, or the authored side if it was already isolated. */
export const isolatedExpression = (state, system) => {
  if (!state.source) return null;
  const source = equationById(system, state.source.equationId);
  if (source && variableIsIsolated(source.text, state.source.variable)) return isolatedExpressionFor(source.text, state.source.variable);
  return state.isolation?.expression || null;
};

export const sourceAlreadyIsolated = (state, system) => {
  if (!state.source) return false;
  const source = equationById(system, state.source.equationId);
  return Boolean(source && variableIsIsolated(source.text, state.source.variable));
};

export const substitutionToken = (state) => String(state.isolation?.tokenExpression || '').trim() || null;

/* ------------------------------------------------------ choose + isolate */

export const chooseReductionSource = (state, system, equationId, variable) => {
  const equation = equationById(system, equationId);
  if (!equation || !system.variables.includes(variable)) return result(state);
  // Rejected neutrally: the equation does not contain it, so it cannot be
  // isolated from it. Which equation is EASIEST is never said.
  if (!equationMentionsVariable(equation.text, variable)) {
    return result(state, { stage: 'source', reason: 'variable-absent', equationId, variable });
  }
  return result({ ...emptyReductionState(), source: { equationId, variable } });
};

/** "Choose a different equation/variable": everything downstream of the choice goes with it. */
export const resetReductionSource = () => result(emptyReductionState());

export const recordIsolatedExpression = (state, system, expression) => {
  if (!state.source || !expression) return result(state);
  return result({ ...state, isolation: { ...emptyTokenPreparation(), expression: presentableExpression(expression) } });
};

/* ---------------------------------------------------------- token prep */

const anyTargetSubstituted = (state) => Object.values(state.targets || {}).some((target) => target?.mode === 'substituted');

export const useIsolatedExpressionAsToken = (state, system) => {
  const expression = isolatedExpression(state, system);
  if (!expression) return result(state);
  return result({
    ...state,
    isolation: { ...state.isolation, tokenExpression: expression, simplifying: false, simplificationChecked: false, simplificationValid: false },
  });
};

export const startTokenSimplification = (state) => result({
  ...state,
  isolation: { ...state.isolation, tokenExpression: null, simplifying: true, simplificationChecked: false, simplificationValid: false },
});

export const setTokenSimplificationDraft = (state, value) => result({
  ...state,
  isolation: { ...state.isolation, simplificationDraft: value, simplificationChecked: false, simplificationValid: false },
});

/** The optional rewrite is accepted only when it is equivalent to what Step Algebra isolated. */
export const checkTokenSimplification = (state, system) => {
  const expression = isolatedExpression(state, system);
  const draft = String(state.isolation?.simplificationDraft || '').trim();
  if (!draft || !expression || !expressionsEquivalent(draft, expression, state.source?.variable)) {
    return result({ ...state, isolation: { ...state.isolation, simplificationChecked: true, simplificationValid: false } });
  }
  let tokenExpression = draft;
  try { tokenExpression = latexToExpression(draft); } catch { /* already plain */ }
  return result({
    ...state,
    isolation: { ...state.isolation, tokenExpression, simplificationDraft: draft, simplifying: false, simplificationChecked: true, simplificationValid: true },
  });
};

/** A token already substituted somewhere is committed: both reduced equations must come from the same expression. */
export const changeSubstitutionToken = (state) => {
  if (anyTargetSubstituted(state)) return result(state, { stage: 'token', reason: 'token-in-use' });
  return result({
    ...state,
    isolation: { ...state.isolation, tokenExpression: null, simplifying: false, simplificationChecked: false, simplificationValid: false },
  });
};

/* --------------------------------------------------------------- reduce */

export const targetIsReduced = (target) => Boolean(target?.standardText);

/**
 * Drop the token on a variable of a target equation. The student chooses the
 * equation AND the variable; nothing is pre-highlighted, and either target may
 * go first. The token stays available until every target has received it.
 */
export const attemptTargetSubstitution = (state, system, targetId, clickedVariable) => {
  const source = state.source;
  if (!source) return result(state);
  if (targetId === source.equationId) {
    return result(state, { stage: 'substitution', reason: 'source-equation', equationId: targetId, variable: clickedVariable });
  }
  const target = equationById(system, targetId);
  if (!target) return result(state);
  if (state.targets?.[targetId]) {
    return result(state, { stage: 'substitution', reason: 'already-substituted', equationId: targetId, variable: clickedVariable });
  }
  if (clickedVariable !== source.variable) {
    return result(state, { stage: 'substitution', reason: 'wrong-variable', equationId: targetId, variable: clickedVariable });
  }
  const token = substitutionToken(state);
  const isolated = isolatedExpression(state, system);
  // Same recovery as the 2×2 handoff: a draft-backed token can outlive a
  // deploy, so try the prepared token, then the equivalent isolated form it
  // was made from, before telling the student anything went wrong.
  const candidates = [...new Set([token, isolated].map((value) => String(value || '').trim()).filter(Boolean))];
  for (const candidate of candidates) {
    try {
      const rawText = substituteIntoEquation(target.text, source.variable, candidate);
      const next = clone(state);
      next.targets[targetId] = { mode: 'substituted', rawText, standardText: null };
      if (candidate !== token) next.isolation.tokenExpression = candidate;
      // The last target to receive the token opens straight into its
      // simplification when it is the only work left; otherwise the student
      // picks which reduced equation to simplify.
      const open = reductionTargets(next, system).filter((equation) => !targetIsReduced(next.targets[equation.id]));
      next.activeTargetId = open.length === 1 && open[0].id === targetId && next.activeTargetId == null ? targetId : next.activeTargetId;
      return result(next);
    } catch {
      // Try the next equivalent form.
    }
  }
  return result(state, { stage: 'substitution', reason: 'expression-parse', equationId: targetId, variable: clickedVariable });
};

/** Standard form in the remaining variables, as a Step Algebra objective would judge it. */
const equationIsStandardIn = (text, variables) => {
  try {
    const [left, right] = String(text).split('=');
    if (right == null) return false;
    return isLinearStandardFormEquation({ left: left.trim(), right: right.trim() }, variables);
  } catch {
    return false;
  }
};

/**
 * A target equation that never contained the isolated variable has nothing to
 * substitute into. The student says so, and it is checked, not assumed: the
 * button is offered on every target, so offering it does not reveal which one.
 */
export const carryTargetUnchanged = (state, system, targetId) => {
  const source = state.source;
  const target = equationById(system, targetId);
  if (!source || !target || targetId === source.equationId || state.targets?.[targetId]) return result(state);
  if (equationMentionsVariable(target.text, source.variable)) {
    return result(state, { stage: 'substitution', reason: 'contains-variable', equationId: targetId, variable: source.variable });
  }
  const next = clone(state);
  const remaining = remainingVariables(state, system);
  next.targets[targetId] = {
    mode: 'carried',
    rawText: target.text,
    standardText: equationIsStandardIn(target.text, remaining) ? target.text : null,
  };
  return result(next);
};

export const openTargetSimplification = (state, targetId) => {
  const target = state.targets?.[targetId];
  if (!target || targetIsReduced(target)) return result(state);
  return result({ ...state, activeTargetId: targetId });
};

/**
 * Step Algebra reports the student's finished standard form. It is recorded
 * only if it is the same equation as the substitution produced (a nonzero
 * multiple is fine — multiplying through by -1 is a legitimate move) and it
 * uses only the remaining variables.
 */
export const recordTargetStandardForm = (state, system, targetId, standardText) => {
  const target = state.targets?.[targetId];
  if (!target || !standardText) return result(state);
  const remaining = remainingVariables(state, system);
  const rawForm = linearEquationForm(target.rawText, system.variables);
  const standardForm = linearEquationForm(standardText, system.variables);
  const valid = rawForm && standardForm
    && standardForm.coefficients[state.source.variable] === 0
    && linearFormsEquivalent(rawForm, standardForm, system.variables)
    && equationIsStandardIn(standardText, remaining);
  if (!valid) return result(state, { stage: 'reduce', reason: 'not-equivalent', equationId: targetId });
  const next = clone(state);
  // Stored with tidy spacing (-3 y+ z = -3 -> -3 y + z = -3); the terms, their
  // order and their signs are exactly the student's.
  next.targets[targetId].standardText = String(standardText).split('=').map((side) => presentableExpression(side.trim())).join(' = ');
  if (next.activeTargetId === targetId) {
    const open = reductionTargets(next, system).filter((equation) => next.targets[equation.id] && !targetIsReduced(next.targets[equation.id]));
    next.activeTargetId = open.length === 1 ? open[0].id : null;
  }
  return result(next);
};

export const allTargetsReduced = (state, system) => {
  const targets = reductionTargets(state, system);
  return targets.length > 0 && targets.every((equation) => targetIsReduced(state.targets?.[equation.id]));
};

/**
 * The (k-1)×(k-1) system the student built, in target order, with lineage:
 * each reduced equation knows the original it came from and the unsimplified
 * substitution the student started with.
 */
export const reducedSystem = (state, system) => {
  if (!allTargetsReduced(state, system)) return null;
  return {
    variables: remainingVariables(state, system),
    equations: reductionTargets(state, system).map((equation, index) => ({
      id: `R${index + 1}`,
      text: state.targets[equation.id].standardText,
      fromEquationId: equation.id,
      rawText: state.targets[equation.id].rawText,
      mode: state.targets[equation.id].mode,
    })),
  };
};

/* ------------------------------------------------------ back-substitute */

export const backSubstitutionDestinations = (state, system) => {
  const expression = substitutionToken(state) || isolatedExpression(state, system);
  if (!state.source || !expression) return [];
  return [
    {
      id: RELATION_DESTINATION_ID,
      text: `${state.source.variable} = ${expression}`,
      label: 'Isolated relationship',
      short: `${state.source.variable} =`,
    },
    ...system.equations,
  ];
};

/**
 * Place a known value's token on a variable of a destination. The student
 * chooses the destination (the isolated relationship or any original
 * equation) and every placement. Choosing a different destination starts its
 * placements fresh.
 */
export const attemptBackPlacement = (state, system, knownValues, destinationId, targetVariable, tokenVariable) => {
  if (!state.source || !tokenVariable || !Object.prototype.hasOwnProperty.call(knownValues || {}, tokenVariable)) return result(state);
  if (state.back?.solved) return result(state);
  const destination = backSubstitutionDestinations(state, system).find((entry) => entry.id === destinationId);
  if (!destination) return result(state);
  if (!equationMentionsVariable(destination.text, state.source.variable)) {
    return result(state, { stage: 'back', reason: 'destination-lacks-unknown', destinationId, variable: state.source.variable });
  }
  if (targetVariable !== tokenVariable) {
    return result(state, { stage: 'back', reason: 'wrong-variable', destinationId, variable: targetVariable, tokenVariable });
  }
  const sameDestination = state.back?.destinationId === destinationId;
  return result({
    ...state,
    back: {
      destinationId,
      placed: { ...(sameDestination ? state.back.placed : {}), [tokenVariable]: true },
      solved: null,
    },
  });
};

export const clearBackDestination = (state) => result({ ...state, back: { destinationId: null, placed: {}, solved: null } });

/** The destination with every known value the student placed, once every known variable it contains has one. */
export const backSubstitutionEquation = (state, system, knownValues) => {
  const destination = backSubstitutionDestinations(state, system).find((entry) => entry.id === state.back?.destinationId);
  if (!destination) return null;
  const needed = Object.keys(knownValues || {}).filter((name) => equationMentionsVariable(destination.text, name));
  if (!needed.length || !needed.every((name) => state.back.placed?.[name])) return null;
  return needed.reduce((text, name) => substituteIntoEquation(text, name, exactNumberText(knownValues[name])), destination.text);
};

export const recordBackSolve = (state, value, text) => {
  if (!Number.isFinite(Number(value)) || !state.back?.destinationId) return result(state);
  return result({ ...state, back: { ...state.back, solved: { value: Number(value), text: String(text ?? exactNumberText(value)) } } });
};

/* --------------------------------------------------------------- verify */

const parseNumericEntry = (value) => {
  try {
    const numeric = Number(evaluate(latexToExpression(value)));
    return Number.isFinite(numeric) ? numeric : NaN;
  } catch {
    return NaN;
  }
};

/** Variables an original equation actually contains — the only ones a student can place in it. */
export const verificationVariables = (system, equationId) => {
  const equation = equationById(system, equationId);
  return equation ? system.variables.filter((name) => equationMentionsVariable(equation.text, name)) : [];
};

export const placeVerificationValue = (state, system, equationId, targetVariable, tokenVariable) => {
  if (!tokenVariable || !equationById(system, equationId)) return result(state);
  if (targetVariable !== tokenVariable) {
    return result(state, { stage: 'verification', reason: 'wrong-variable', equationId, variable: targetVariable, tokenVariable });
  }
  const entry = state.verification?.[equationId] || emptyVerificationEntry();
  return result({
    ...state,
    verification: {
      ...state.verification,
      [equationId]: { ...entry, placed: { ...entry.placed, [targetVariable]: true }, checked: false, valid: false },
    },
  });
};

export const verificationReady = (state, system, equationId) => verificationVariables(system, equationId)
  .every((name) => state.verification?.[equationId]?.placed?.[name]);

export const setVerificationAnswer = (state, equationId, side, value) => {
  const entry = state.verification?.[equationId] || emptyVerificationEntry();
  return result({ ...state, verification: { ...state.verification, [equationId]: { ...entry, [side]: value, checked: false, valid: false } } });
};

/** The student evaluates each side; the check is that both match the true sides and the sides are equal. */
export const checkVerification = (state, system, solution, equationId) => {
  const equation = equationById(system, equationId);
  const entry = state.verification?.[equationId];
  if (!equation || !entry || !solution) return result(state);
  const actual = evaluateEquationSides(equation.text, solution);
  const leftValue = parseNumericEntry(entry.leftAnswer);
  const rightValue = parseNumericEntry(entry.rightAnswer);
  const close = (a, b) => Number.isFinite(a) && Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));
  const valid = close(leftValue, actual.left) && close(rightValue, actual.right) && Math.abs(actual.left - actual.right) < 1e-6;
  return result({ ...state, verification: { ...state.verification, [equationId]: { ...entry, checked: true, valid } } });
};

export const allOriginalsVerified = (state, system) => system.equations
  .every((equation) => state.verification?.[equation.id]?.checked && state.verification?.[equation.id]?.valid);

/* ---------------------------------------------------------------- phase */

/** Every value the student has found so far: the reduced system's, then the isolated variable's. */
export const knownSolution = (state, reducedSolution) => {
  if (!reducedSolution) return null;
  const values = { ...reducedSolution };
  if (state.back?.solved && state.source) values[state.source.variable] = state.back.solved.value;
  return values;
};

/**
 * Where the round is. Derived from the lineage every render, never stored, so
 * a restored draft or an Undo lands in exactly the phase its data implies.
 */
export const reductionPhase = (state, system, { reducedSolution = null, requireVerification = true } = {}) => {
  if (!state.source) return 'choose-source';
  if (!isolatedExpression(state, system)) return 'isolate';
  if (!substitutionToken(state) && !anyTargetSubstituted(state)) return 'prepare-token';
  if (!allTargetsReduced(state, system)) return 'reduce';
  if (!reducedSolution) return 'subsystem';
  if (!state.back?.solved) return 'back-substitute';
  if (requireVerification && !allOriginalsVerified(state, system)) return 'verify';
  return 'complete';
};

/* ---------------------------------------------------------------- grade */

/** The authored system's true solution (never shown), for grading. */
export const reductionAnswerKey = (system) => classifyLinearSystem(
  system.equations.map((equation) => linearEquationForm(equation.text, system.variables)),
  system.variables,
);

export const gradeReduction = (state, system, reducedSolution, { requireVerification = true } = {}) => {
  const key = reductionAnswerKey(system);
  const solution = state.back?.solved ? knownSolution(state, reducedSolution) : null;
  const valuesCorrect = Boolean(solution && key.type === 'unique'
    && system.variables.every((name) => Number.isFinite(solution[name]) && Math.abs(solution[name] - key.solution[name]) <= 1e-6 * Math.max(1, Math.abs(key.solution[name]))));
  const verified = !requireVerification || allOriginalsVerified(state, system);
  return { isCorrect: valuesCorrect && verified, valuesCorrect, verified, solution, expected: key };
};

/* --------------------------------------------------------------- repair */

/**
 * Read a persisted round back safely.
 *
 * Drafts outlive deploys, and a question can be edited under a draft. Each
 * layer is kept only while it is still consistent with the layer beneath it
 * and with the current system — a target whose recorded substitution no
 * longer matches the token is dropped, a standard form that is no longer
 * equivalent is cleared, and so on — so a student comes back to every piece
 * of work that is still true and to nothing that is not. Deterministic, and
 * idempotent: repairing a repaired state changes nothing.
 */
export const repairReductionState = (stored, system) => {
  if (!stored || typeof stored !== 'object' || stored.version !== REDUCTION_STATE_VERSION) return emptyReductionState();
  const base = emptyReductionState();
  const source = stored.source;
  const sourceEquation = source && equationById(system, source.equationId);
  if (!sourceEquation || !system.variables.includes(source.variable) || !equationMentionsVariable(sourceEquation.text, source.variable)) return base;

  const state = { ...base, source: { equationId: source.equationId, variable: source.variable } };
  const isolation = repairPersistedIsolation({ ...emptyTokenPreparation(), ...stored.isolation });
  state.isolation = {
    expression: typeof isolation.expression === 'string' && isolation.expression.trim() ? isolation.expression : null,
    tokenExpression: typeof isolation.tokenExpression === 'string' && isolation.tokenExpression.trim() ? isolation.tokenExpression : null,
    simplificationDraft: typeof isolation.simplificationDraft === 'string' ? isolation.simplificationDraft : '',
    simplifying: Boolean(isolation.simplifying),
    simplificationChecked: Boolean(isolation.simplificationChecked),
    simplificationValid: Boolean(isolation.simplificationValid),
  };
  const isolated = isolatedExpression(state, system);
  if (!isolated) return { ...state, isolation: { ...state.isolation, tokenExpression: null } };
  if (state.isolation.tokenExpression && !expressionsEquivalent(state.isolation.tokenExpression, isolated, source.variable)) {
    state.isolation.tokenExpression = null;
  }

  const remaining = remainingVariables(state, system);
  const replacement = state.isolation.tokenExpression || isolated;
  reductionTargets(state, system).forEach((equation) => {
    const target = stored.targets?.[equation.id];
    if (!target || !['substituted', 'carried'].includes(target.mode) || typeof target.rawText !== 'string') return;
    let expectedRaw;
    try {
      expectedRaw = target.mode === 'carried'
        ? (equationMentionsVariable(equation.text, source.variable) ? null : equation.text)
        : substituteIntoEquation(equation.text, source.variable, replacement);
    } catch {
      expectedRaw = null;
    }
    const rawForm = linearEquationForm(target.rawText, system.variables);
    if (!expectedRaw || !rawForm || !linearFormsEquivalent(linearEquationForm(expectedRaw, system.variables), rawForm, system.variables)) return;
    const standardForm = typeof target.standardText === 'string' ? linearEquationForm(target.standardText, system.variables) : null;
    const standardValid = standardForm
      && standardForm.coefficients[source.variable] === 0
      && linearFormsEquivalent(rawForm, standardForm, system.variables)
      && equationIsStandardIn(target.standardText, remaining);
    state.targets[equation.id] = { mode: target.mode, rawText: target.rawText, standardText: standardValid ? target.standardText : null };
  });
  const active = stored.activeTargetId;
  state.activeTargetId = active && state.targets[active] && !targetIsReduced(state.targets[active]) ? active : null;

  if (allTargetsReduced(state, system)) {
    const destinations = backSubstitutionDestinations(state, system);
    const destination = destinations.find((entry) => entry.id === stored.back?.destinationId);
    if (destination && equationMentionsVariable(destination.text, source.variable)) {
      const placed = Object.fromEntries(Object.entries(stored.back?.placed || {})
        .filter(([name, value]) => value === true && remaining.includes(name)));
      const solved = stored.back?.solved && Number.isFinite(Number(stored.back.solved.value))
        ? { value: Number(stored.back.solved.value), text: String(stored.back.solved.text ?? exactNumberText(stored.back.solved.value)) }
        : null;
      state.back = { destinationId: destination.id, placed, solved };
    }
    if (state.back.solved) {
      system.equations.forEach((equation) => {
        const entry = stored.verification?.[equation.id];
        if (!entry || typeof entry !== 'object') return;
        state.verification[equation.id] = {
          placed: Object.fromEntries(Object.entries(entry.placed || {}).filter(([name, value]) => value === true && system.variables.includes(name))),
          leftAnswer: typeof entry.leftAnswer === 'string' ? entry.leftAnswer : '',
          rightAnswer: typeof entry.rightAnswer === 'string' ? entry.rightAnswer : '',
          checked: Boolean(entry.checked),
          valid: Boolean(entry.valid),
        };
      });
    }
  }
  return state;
};

/** A stable, short identity for a reduced system — its draft scope and Step Algebra keys hang off it. */
export const reducedSystemIdentity = (reduced) => {
  const text = reduced ? `${reduced.variables.join(',')}|${reduced.equations.map((equation) => equation.text).join('|')}` : '';
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};
