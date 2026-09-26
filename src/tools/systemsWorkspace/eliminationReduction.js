/*
 * 3×3 SYSTEMS BY ELIMINATION — TWO ROUNDS OF PAIR ELIMINATION (#359).
 *
 *   E1, E2, E3 in x, y, z
 *     choose the variable to eliminate       (the student; nothing suggested)
 *     choose a first pair of equations       (any 2 of the 3; nothing suggested)
 *     scale each equation as needed          (the student's own multiplier,
 *                                              applied term by term — the
 *                                              distribution step, not typed
 *                                              past)
 *     mark the cancelling terms              (an intentional student action,
 *                                              never assumed)
 *     work out what remains                  (the student's own arithmetic,
 *                                              term by term — never generated
 *                                              or previewed before they
 *                                              submit it)
 *   = R1, one equation in the two remaining variables
 *     choose a SECOND, different pair, eliminate the SAME variable
 *   = R2, a second equation in the two remaining variables
 *   = R1, R2 — a genuine reduced 2×2 system
 *     solve that 2×2                          (the REAL 2×2 workflow, embedded,
 *                                              substitution OR elimination)
 *     back-substitute the third value         (the student's placements)
 *     verify in all three ORIGINAL equations  (the student's arithmetic)
 *
 * Any two of the three possible equation pairs — {E1,E2}, {E1,E3}, {E2,E3} —
 * together use all three original equations, so "a different pair" is the
 * only rule needed to guarantee R1 and R2 are independent.
 *
 * This module is the round, as data, mirroring substitutionReduction.js: no
 * React, no algebra performed on the student's behalf. Every scaled term and
 * every combined term is the student's own typed result, checked against the
 * true value — never generated for them. The stage sequence for one equation
 * pair mirrors the mature 2×2 elimination interaction in AlgebraicSystemMode
 * (multiplier -> per-term product entry -> operation choice -> intentional
 * cancellation -> combination arithmetic), generalized from `{a,b,c}` 2×2
 * coefficients to the n-variable `{coefficients:{x,y,z}, constant}` forms a
 * 3×3 round needs.
 *
 * Every transition is a pure function `(state, system, ...) -> { state, feedback }`.
 */
import { evaluate } from 'mathjs';
import { latexToExpression } from '../../algebraAstEngine.js';
import {
  applyFormMultiplier,
  combineForms,
  equationMentionsVariable,
  exactNumberText,
  formatLinearForm,
  formEliminatesVariable,
  linearEquationForm,
  multiplierProductValue,
  substituteIntoEquation,
} from './algebraicSystemsEngine.js';

export const ELIMINATION_STATE_VERSION = 2;
const EPS = 1e-7;

/** One entry field per variable plus the constant — the term-by-term work area for a scaled equation or a combined result. */
const emptyTermWork = (variables) => ({
  ...Object.fromEntries(variables.map((name) => [name, ''])),
  constant: '',
  checked: false,
  valid: false,
});

export const emptyRoundState = () => ({
  pair: null,
  // Raw scale-factor text per equation id. Blank/absent means "no scaling
  // needed" — the student is never asked to type a multiplier of 1.
  multiplierDrafts: {},
  // The confirmed numeric multiplier per equation id, set only once its
  // scaled terms (or its identity) have been accepted.
  multiplierValues: {},
  // The open term-by-term entry work for a non-identity scale factor, keyed
  // by equation id. Present only while that equation's scaling is open.
  multiplierWork: {},
  operation: null,
  operationAttempts: 0,
  // Which of the pair's two equations the student has intentionally marked
  // as having its target-variable term cancel. Both must be marked before
  // the combination arithmetic stage opens.
  cancelledEquations: {},
  // The student's own term-by-term work for the combined equation, open only
  // once cancellation is confirmed.
  combinationWork: null,
  combinedText: null,
});

export const emptyEliminationState = () => ({
  version: ELIMINATION_STATE_VERSION,
  // The variable the student chose to eliminate from both rounds.
  variable: null,
  rounds: { round1: emptyRoundState(), round2: emptyRoundState() },
  // Back-substitution for the eliminated variable, once the reduced 2×2 is solved.
  back: { destinationId: null, placed: {}, solved: null },
  // Verification in the ORIGINAL equations, keyed by equation id.
  verification: {},
});

const clone = (value) => JSON.parse(JSON.stringify(value));
const result = (state, feedback = null) => ({ state, feedback });
const equationById = (system, id) => system.equations.find((equation) => equation.id === id) || null;
const pairKey = (pair) => (Array.isArray(pair) ? pair.join('|') : '');
const setRound = (state, roundKey, round) => ({ ...state, rounds: { ...state.rounds, [roundKey]: round } });

/** Every possible unordered pair of the system's equations, in authored order. */
export const eliminationPairOptions = (system) => {
  const options = [];
  const equations = system.equations;
  for (let i = 0; i < equations.length; i += 1) {
    for (let j = i + 1; j < equations.length; j += 1) {
      const a = equations[i];
      const b = equations[j];
      options.push({ id: `${a.id}${b.id}`, equationIds: [a.id, b.id], label: `${a.label} and ${b.label}` });
    }
  }
  return options;
};

/** Which round (if any) the student is currently working, in authored order. */
export const activeEliminationRoundKey = (state) => {
  if (!state.rounds.round1.combinedText) return 'round1';
  if (!state.rounds.round2.combinedText) return 'round2';
  return null;
};

export const chooseEliminationVariable = (state, system, variable) => {
  if (!system.variables.includes(variable)) return result(state);
  return result({ ...emptyEliminationState(), variable });
};

/**
 * The student picks any two of the three equations for this round. Rejected
 * neutrally when the variable is not actually written in one of them (there
 * is nothing to eliminate), or when the OTHER round already used this exact
 * pair (the two rounds must draw on different pairs so R1 and R2 are
 * independent equations, not a restatement of the same pair).
 */
export const chooseEliminationPair = (state, system, roundKey, pairId) => {
  if (!state.variable) return result(state);
  const option = eliminationPairOptions(system).find((entry) => entry.id === pairId);
  if (!option) return result(state);
  const otherKey = roundKey === 'round1' ? 'round2' : 'round1';
  const otherPair = state.rounds[otherKey]?.pair;
  if (otherPair && pairKey(otherPair) === pairKey(option.equationIds)) {
    return result(state, { stage: 'pair', reason: 'pair-repeated', roundKey, pairId });
  }
  const missing = option.equationIds.find((id) => !equationMentionsVariable(equationById(system, id).text, state.variable));
  if (missing) {
    return result(state, { stage: 'pair', reason: 'variable-absent', roundKey, equationId: missing, variable: state.variable });
  }
  return result(setRound(state, roundKey, { ...emptyRoundState(), pair: option.equationIds }));
};

/** "Choose a different pair": the student backs out of this round's work entirely. */
export const resetEliminationRound = (state, roundKey) => result(setRound(state, roundKey, emptyRoundState()));

const roundEquationIds = (round) => round?.pair || [];

/* ----------------------------------------------------------- multiplier */

/** A blank multiplier means "no scaling needed". Anything else must be a nonzero number. */
const resolvedMultiplierDraft = (round, equationId) => {
  const raw = String(round.multiplierDrafts?.[equationId] ?? '').trim();
  if (!raw) return 1;
  try {
    const value = Number(evaluate(latexToExpression(raw)));
    return Number.isFinite(value) && Math.abs(value) > EPS ? value : NaN;
  } catch {
    return NaN;
  }
};

export const setEliminationMultiplierDraft = (state, roundKey, equationId, value) => {
  const round = state.rounds[roundKey];
  if (!roundEquationIds(round).includes(equationId)) return result(state);
  const next = clone(round);
  next.multiplierDrafts[equationId] = value;
  delete next.multiplierValues[equationId];
  delete next.multiplierWork[equationId];
  next.operation = null;
  next.operationAttempts = 0;
  next.cancelledEquations = {};
  next.combinationWork = null;
  next.combinedText = null;
  return result(setRound(state, roundKey, next));
};

/**
 * Apply the scale factor the student entered. A factor of 1 (or a blank
 * field) changes no term, so it is accepted immediately — the student is
 * never asked to multiply an equation by 1. Any other factor opens the
 * term-by-term distribution stage instead of scaling the equation for them.
 */
export const applyEliminationMultiplier = (state, system, roundKey, equationId) => {
  const round = state.rounds[roundKey];
  if (!roundEquationIds(round).includes(equationId)) return result(state);
  const multiplier = resolvedMultiplierDraft(round, equationId);
  if (!Number.isFinite(multiplier)) {
    return result(state, { stage: 'multiplier', reason: 'invalid-multiplier', roundKey, equationId });
  }
  const next = clone(round);
  if (Math.abs(multiplier - 1) < EPS) {
    next.multiplierValues[equationId] = 1;
    delete next.multiplierWork[equationId];
    return result(setRound(state, roundKey, next));
  }
  delete next.multiplierValues[equationId];
  next.multiplierWork[equationId] = { ...emptyTermWork(system.variables), active: true };
  return result(setRound(state, roundKey, next));
};

export const setEliminationMultiplierProductTerm = (state, roundKey, equationId, key, value) => {
  const round = state.rounds[roundKey];
  const work = round?.multiplierWork?.[equationId];
  if (!work) return result(state);
  const next = clone(round);
  next.multiplierWork[equationId] = { ...work, [key]: value, checked: false, valid: false };
  return result(setRound(state, roundKey, next));
};

/**
 * Distribution, checked: does the student's own scaled term (in each
 * variable, plus the constant) match `multiplier * originalEquation`? Never
 * computed for them — only judged.
 */
export const checkEliminationMultiplierProducts = (state, system, roundKey, equationId) => {
  const round = state.rounds[roundKey];
  const work = round?.multiplierWork?.[equationId];
  if (!work) return result(state);
  const multiplier = resolvedMultiplierDraft(round, equationId);
  const originalForm = linearEquationForm(equationById(system, equationId).text, system.variables);
  const expected = Number.isFinite(multiplier) ? applyFormMultiplier(originalForm, multiplier, system.variables) : null;
  if (!expected) return result(state, { stage: 'multiplier', reason: 'invalid-multiplier', roundKey, equationId });

  const suppliedConstant = multiplierProductValue(work.constant, null, system.variables);
  const constantValid = Number.isFinite(suppliedConstant) && Math.abs(suppliedConstant - expected.constant) <= 1e-7;
  const termsValid = system.variables.every((name) => {
    const supplied = multiplierProductValue(work[name], name, system.variables);
    return Number.isFinite(supplied) && Math.abs(supplied - expected.coefficients[name]) <= 1e-7;
  });
  const valid = termsValid && constantValid;

  const next = clone(round);
  next.multiplierWork[equationId] = { ...work, checked: true, valid };
  if (valid) {
    next.multiplierValues[equationId] = multiplier;
    delete next.multiplierWork[equationId];
  }
  const nextState = setRound(state, roundKey, next);
  return valid ? result(nextState) : result(nextState, { stage: 'multiplier-products', reason: 'incorrect-products', roundKey, equationId });
};

const bothMultipliersApplied = (round) => roundEquationIds(round).every((id) => Number.isFinite(round.multiplierValues?.[id]));

/* -------------------------------------------------------------- combine */

/** The true scaled forms and their combination, from the student's own confirmed multipliers — never exposed until the student's own work matches it. */
const trueRoundCombination = (state, system, roundKey) => {
  const round = state.rounds[roundKey];
  if (!round?.pair || !round.operation || !bothMultipliersApplied(round)) return null;
  const [idA, idB] = round.pair;
  const formA = linearEquationForm(equationById(system, idA).text, system.variables);
  const formB = linearEquationForm(equationById(system, idB).text, system.variables);
  const scaledA = applyFormMultiplier(formA, round.multiplierValues[idA], system.variables);
  const scaledB = applyFormMultiplier(formB, round.multiplierValues[idB], system.variables);
  if (!scaledA || !scaledB) return null;
  return combineForms(scaledA, scaledB, round.operation, system.variables);
};

/** Does the chosen operation actually eliminate the target variable? Derived, never stored, so it always reflects the student's current choices. */
export const eliminationRoundEliminates = (state, system, roundKey) => {
  const combined = trueRoundCombination(state, system, roundKey);
  return combined ? formEliminatesVariable(combined, state.variable) : false;
};

export const setEliminationOperation = (state, roundKey, operation) => {
  if (!['add', 'subtract'].includes(operation)) return result(state);
  const round = state.rounds[roundKey];
  if (!round?.pair || !bothMultipliersApplied(round)) return result(state);
  const next = clone(round);
  next.operation = operation;
  next.operationAttempts += 1;
  next.cancelledEquations = {};
  next.combinationWork = null;
  next.combinedText = null;
  return result(setRound(state, roundKey, next));
};

/**
 * Marking the cancelling term in each equation is one student decision per
 * equation — it must not also perform the arithmetic. The combination stage
 * opens only once BOTH equations of the pair have been marked.
 */
export const toggleEliminationCancellation = (state, system, roundKey, equationId) => {
  const round = state.rounds[roundKey];
  if (!round?.pair?.includes(equationId)) return result(state);
  if (!round.operation || !eliminationRoundEliminates(state, system, roundKey)) return result(state);
  const next = clone(round);
  next.cancelledEquations[equationId] = !next.cancelledEquations[equationId];
  const bothMarked = round.pair.every((id) => next.cancelledEquations[id]);
  if (!bothMarked) {
    next.combinationWork = null;
    next.combinedText = null;
  } else if (!next.combinationWork) {
    next.combinationWork = emptyTermWork(system.variables.filter((name) => name !== state.variable));
  }
  return result(setRound(state, roundKey, next));
};

const cancellationConfirmed = (round) => Boolean(round?.pair?.every((id) => round.cancelledEquations?.[id]));

export const setEliminationCombinationTerm = (state, roundKey, key, value) => {
  const round = state.rounds[roundKey];
  if (!round || !cancellationConfirmed(round) || !round.combinationWork) return result(state);
  const next = clone(round);
  next.combinationWork = { ...next.combinationWork, [key]: value, checked: false, valid: false };
  return result(setRound(state, roundKey, next));
};

/**
 * Check the student's own term-by-term combination against the true
 * combination of the scaled, cancelled pair. Nothing here computes the
 * combined equation FOR the student — it only judges what they typed, one
 * term (and the constant) at a time.
 */
export const checkEliminationCombination = (state, system, roundKey) => {
  const round = state.rounds[roundKey];
  if (!round || !cancellationConfirmed(round) || !round.combinationWork) return result(state);
  const trueCombined = trueRoundCombination(state, system, roundKey);
  if (!trueCombined || !formEliminatesVariable(trueCombined, state.variable)) {
    return result(state, { stage: 'combine', reason: 'does-not-eliminate', roundKey, variable: state.variable });
  }
  const remaining = system.variables.filter((name) => name !== state.variable);
  const work = round.combinationWork;
  const suppliedConstant = multiplierProductValue(work.constant, null, system.variables);
  const constantValid = Number.isFinite(suppliedConstant) && Math.abs(suppliedConstant - trueCombined.constant) <= 1e-7;
  const termsValid = remaining.every((name) => {
    const supplied = multiplierProductValue(work[name], name, system.variables);
    return Number.isFinite(supplied) && Math.abs(supplied - trueCombined.coefficients[name]) <= 1e-7;
  });
  const valid = termsValid && constantValid;

  const next = clone(round);
  next.combinationWork = { ...work, checked: true, valid };
  if (!valid) {
    return result(setRound(state, roundKey, next), { stage: 'combine', reason: 'not-equivalent', roundKey });
  }
  next.combinedText = formatLinearForm({
    coefficients: Object.fromEntries(remaining.map((name) => [name, trueCombined.coefficients[name]])),
    constant: trueCombined.constant,
  }, remaining);
  return result(setRound(state, roundKey, next));
};

/** The reduced 2×2 system, once both rounds have eliminated the same variable from a different pair. */
export const eliminationReducedSystem = (state, system) => {
  if (!state.variable) return null;
  const r1 = state.rounds.round1;
  const r2 = state.rounds.round2;
  if (!r1?.combinedText || !r2?.combinedText) return null;
  const remaining = system.variables.filter((name) => name !== state.variable);
  return {
    variables: remaining,
    equations: [
      { id: 'R1', text: r1.combinedText, fromPair: r1.pair },
      { id: 'R2', text: r2.combinedText, fromPair: r2.pair },
    ],
  };
};

/* ------------------------------------------------------ back-substitute */

/** Every original equation that still contains the eliminated variable — no isolated "relation" destination exists for elimination, unlike substitution. */
export const eliminationBackSubstitutionDestinations = (state, system) => (
  state.variable ? system.equations.filter((equation) => equationMentionsVariable(equation.text, state.variable)) : []
);

export const attemptEliminationBackPlacement = (state, system, knownValues, destinationId, targetVariable, tokenVariable) => {
  if (!state.variable || !tokenVariable || !Object.prototype.hasOwnProperty.call(knownValues || {}, tokenVariable)) return result(state);
  if (state.back?.solved) return result(state);
  const destination = eliminationBackSubstitutionDestinations(state, system).find((entry) => entry.id === destinationId);
  if (!destination) return result(state);
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

export const clearEliminationBackDestination = (state) => result({ ...state, back: { destinationId: null, placed: {}, solved: null } });

export const eliminationBackSubstitutionEquation = (state, system, knownValues) => {
  const destination = eliminationBackSubstitutionDestinations(state, system).find((entry) => entry.id === state.back?.destinationId);
  if (!destination) return null;
  const needed = Object.keys(knownValues || {}).filter((name) => equationMentionsVariable(destination.text, name));
  if (!needed.length || !needed.every((name) => state.back.placed?.[name])) return null;
  return needed.reduce((text, name) => substituteIntoEquation(text, name, exactNumberText(knownValues[name])), destination.text);
};

export const recordEliminationBackSolve = (state, value, text) => {
  if (!Number.isFinite(Number(value)) || !state.back?.destinationId) return result(state);
  return result({ ...state, back: { ...state.back, solved: { value: Number(value), text: String(text ?? exactNumberText(value)) } } });
};

/** Every value the student has found so far: the reduced system's, then the eliminated variable's. */
export const eliminationKnownSolution = (state, reducedSolution) => {
  if (!reducedSolution) return null;
  const values = { ...reducedSolution };
  if (state.back?.solved && state.variable) values[state.variable] = state.back.solved.value;
  return values;
};

/* ---------------------------------------------------------------- phase */

export const eliminationPhase = (state, system, { reducedSolution = null, requireVerification = true, allVerified = false } = {}) => {
  if (!state.variable) return 'choose-variable';
  if (!state.rounds.round1.pair) return 'round1-pair';
  if (!state.rounds.round1.combinedText) return 'round1-combine';
  if (!state.rounds.round2.pair) return 'round2-pair';
  if (!state.rounds.round2.combinedText) return 'round2-combine';
  if (!reducedSolution) return 'subsystem';
  if (!state.back?.solved) return 'back-substitute';
  if (requireVerification && !allVerified) return 'verify';
  return 'complete';
};

/**
 * Where a single equation pair currently stands, for the UI to decide which
 * sub-stage to render. Derived, never stored.
 */
export const eliminationRoundStage = (state, system, roundKey) => {
  const round = state.rounds[roundKey];
  if (!round?.pair) return 'pair';
  if (!bothMultipliersApplied(round)) return 'multiplier';
  if (!round.operation || !eliminationRoundEliminates(state, system, roundKey)) return 'operation';
  if (!cancellationConfirmed(round)) return 'cancellation';
  if (!round.combinedText) return 'combination';
  return 'done';
};

/* --------------------------------------------------------------- repair */

/**
 * Read a persisted round back safely, the same way substitutionReduction's
 * `repairReductionState` does: replay each recorded choice through its own
 * transition against the CURRENT system, and keep only what is still true.
 * A question edited after a student started (or a draft that outlived a
 * deploy) reopens on exactly the work that still holds.
 */
export const repairEliminationState = (stored, system) => {
  if (!stored || typeof stored !== 'object' || stored.version !== ELIMINATION_STATE_VERSION) return emptyEliminationState();
  const variable = stored.variable;
  if (!variable || !system.variables.includes(variable)) return emptyEliminationState();
  let state = { ...emptyEliminationState(), variable };

  for (const roundKey of ['round1', 'round2']) {
    const storedRound = stored.rounds?.[roundKey];
    const storedPair = Array.isArray(storedRound?.pair) ? storedRound.pair : null;
    if (!storedPair || storedPair.length !== 2) continue;
    const option = eliminationPairOptions(system).find((entry) => pairKey(entry.equationIds) === pairKey(storedPair));
    if (!option) continue;
    const chosenPair = chooseEliminationPair(state, system, roundKey, option.id);
    if (chosenPair.feedback) continue;
    state = chosenPair.state;

    for (const equationId of storedPair) {
      const draft = storedRound.multiplierDrafts?.[equationId];
      if (typeof draft === 'string') state = setEliminationMultiplierDraft(state, roundKey, equationId, draft).state;
      // A confirmed multiplierValue already passed the distribution check
      // once (the per-term work that proved it is deleted on success, the
      // same way substitutionReduction's repair trusts a stored standard
      // form rather than replaying Step Algebra). Trust it directly here;
      // the combination check below re-verifies everything against the
      // CURRENT system regardless, so a stale or tampered value still
      // cannot produce an accepted combinedText.
      const storedValue = storedRound.multiplierValues?.[equationId];
      if (Number.isFinite(storedValue) && Math.abs(storedValue) > EPS) {
        const next = clone(state.rounds[roundKey]);
        next.multiplierValues[equationId] = storedValue;
        delete next.multiplierWork[equationId];
        state = setRound(state, roundKey, next);
        continue;
      }
      const applied = applyEliminationMultiplier(state, system, roundKey, equationId);
      if (applied.feedback) continue;
      state = applied.state;
      const storedWork = storedRound.multiplierWork?.[equationId];
      if (state.rounds[roundKey].multiplierWork?.[equationId] && storedWork && typeof storedWork === 'object') {
        for (const key of [...system.variables, 'constant']) {
          if (typeof storedWork[key] === 'string') {
            state = setEliminationMultiplierProductTerm(state, roundKey, equationId, key, storedWork[key]).state;
          }
        }
        const checked = checkEliminationMultiplierProducts(state, system, roundKey, equationId);
        if (!checked.feedback) state = checked.state;
      }
    }

    if (!bothMultipliersApplied(state.rounds[roundKey])) continue;
    if (['add', 'subtract'].includes(storedRound.operation)) {
      const withOperation = setEliminationOperation(state, roundKey, storedRound.operation);
      if (withOperation.feedback) continue;
      state = withOperation.state;
    } else continue;

    if (!eliminationRoundEliminates(state, system, roundKey)) continue;
    for (const equationId of storedPair) {
      if (storedRound.cancelledEquations?.[equationId] === true) {
        state = toggleEliminationCancellation(state, system, roundKey, equationId).state;
      }
    }
    if (!cancellationConfirmed(state.rounds[roundKey])) continue;

    const storedCombination = storedRound.combinationWork;
    if (storedCombination && typeof storedCombination === 'object') {
      const remaining = system.variables.filter((name) => name !== variable);
      for (const key of [...remaining, 'constant']) {
        if (typeof storedCombination[key] === 'string') {
          state = setEliminationCombinationTerm(state, roundKey, key, storedCombination[key]).state;
        }
      }
      if (typeof storedRound.combinedText === 'string') {
        const rechecked = checkEliminationCombination(state, system, roundKey);
        if (!rechecked.feedback) state = rechecked.state;
      }
    }
  }

  if (state.rounds.round1.combinedText && state.rounds.round2.combinedText) {
    const remaining = system.variables.filter((name) => name !== variable);
    const destinations = eliminationBackSubstitutionDestinations(state, system);
    const destination = destinations.find((entry) => entry.id === stored.back?.destinationId);
    if (destination) {
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
