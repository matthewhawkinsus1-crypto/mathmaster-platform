/*
 * 3×3 SYSTEMS BY ELIMINATION — TWO ROUNDS OF PAIR ELIMINATION (#359).
 *
 *   E1, E2, E3 in x, y, z
 *     choose the variable to eliminate       (the student; nothing suggested)
 *     choose a first pair of equations       (any 2 of the 3; nothing suggested)
 *     scale each equation as needed          (the student's own multipliers)
 *     combine them, eliminating the variable (the student's own arithmetic —
 *                                              never calculated for them)
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
 * React, no algebra performed on the student's behalf. Every combined
 * equation is the student's own typed result, checked against the true
 * combination for equivalence and for actually eliminating the chosen
 * variable — never generated or previewed before they submit it.
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
  linearFormsEquivalent,
  substituteIntoEquation,
} from './algebraicSystemsEngine.js';

export const ELIMINATION_STATE_VERSION = 1;
const EPS = 1e-7;

export const emptyRoundState = () => ({
  pair: null,
  multiplierDrafts: {},
  operation: null,
  combinedDraft: '',
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
  const next = clone(state);
  next.rounds[roundKey] = { ...emptyRoundState(), pair: option.equationIds };
  return result(next);
};

/** "Choose a different pair": the student backs out of this round's work entirely. */
export const resetEliminationRound = (state, roundKey) => result({
  ...state,
  rounds: { ...state.rounds, [roundKey]: emptyRoundState() },
});

export const setEliminationMultiplierDraft = (state, roundKey, equationId, value) => {
  const round = state.rounds[roundKey];
  if (!round?.pair?.includes(equationId)) return result(state);
  const next = clone(state);
  next.rounds[roundKey] = { ...round, multiplierDrafts: { ...round.multiplierDrafts, [equationId]: value }, combinedText: null };
  return result(next);
};

export const setEliminationOperation = (state, roundKey, operation) => {
  if (!['add', 'subtract'].includes(operation)) return result(state);
  const round = state.rounds[roundKey];
  if (!round?.pair) return result(state);
  const next = clone(state);
  next.rounds[roundKey] = { ...round, operation, combinedText: null };
  return result(next);
};

export const setEliminationCombinedDraft = (state, roundKey, value) => {
  const round = state.rounds[roundKey];
  if (!round?.pair) return result(state);
  const next = clone(state);
  next.rounds[roundKey] = { ...round, combinedDraft: value };
  return result(next);
};

/** A blank multiplier means "no scaling needed" — the student is never asked to type a multiplier of 1. */
const resolvedMultiplier = (round, equationId) => {
  const raw = String(round.multiplierDrafts?.[equationId] ?? '').trim();
  if (!raw) return 1;
  try {
    const value = Number(evaluate(latexToExpression(raw)));
    return Number.isFinite(value) && Math.abs(value) > EPS ? value : NaN;
  } catch {
    return NaN;
  }
};

/**
 * Check the student's own combined equation against the true combination of
 * the scaled pair. Nothing here computes the combined equation FOR the
 * student — it only judges what they typed: is it equivalent to
 * `multiplierA * eqA (operation) multiplierB * eqB`, and does it actually
 * eliminate the chosen variable?
 */
export const checkEliminationCombination = (state, system, roundKey) => {
  const round = state.rounds[roundKey];
  if (!round?.pair || !round.operation) return result(state);
  const [idA, idB] = round.pair;
  const formA = linearEquationForm(equationById(system, idA).text, system.variables);
  const formB = linearEquationForm(equationById(system, idB).text, system.variables);
  const multiplierA = resolvedMultiplier(round, idA);
  const multiplierB = resolvedMultiplier(round, idB);
  if (!Number.isFinite(multiplierA) || !Number.isFinite(multiplierB)) {
    return result(state, { stage: 'multiplier', reason: 'invalid-multiplier', roundKey });
  }
  const scaledA = applyFormMultiplier(formA, multiplierA, system.variables);
  const scaledB = applyFormMultiplier(formB, multiplierB, system.variables);
  if (!scaledA || !scaledB) return result(state, { stage: 'multiplier', reason: 'invalid-multiplier', roundKey });
  const trueCombined = combineForms(scaledA, scaledB, round.operation, system.variables);

  let studentForm = null;
  try { studentForm = linearEquationForm(latexToExpression(round.combinedDraft), system.variables); } catch { studentForm = null; }
  if (!studentForm) return result(state, { stage: 'combine', reason: 'parse-error', roundKey });
  if (!linearFormsEquivalent(trueCombined, studentForm, system.variables)) {
    return result(state, { stage: 'combine', reason: 'not-equivalent', roundKey });
  }
  if (!formEliminatesVariable(studentForm, state.variable)) {
    return result(state, { stage: 'combine', reason: 'does-not-eliminate', roundKey, variable: state.variable });
  }

  const remaining = system.variables.filter((name) => name !== state.variable);
  const standardText = formatLinearForm({
    coefficients: Object.fromEntries(remaining.map((name) => [name, studentForm.coefficients[name]])),
    constant: studentForm.constant,
  }, remaining);
  const next = clone(state);
  next.rounds[roundKey] = { ...next.rounds[roundKey], combinedText: standardText };
  return result(next);
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
    const chosen = chooseEliminationPair(state, system, roundKey, option.id);
    if (chosen.feedback) continue;
    state = chosen.state;
    state = {
      ...state,
      rounds: {
        ...state.rounds,
        [roundKey]: {
          ...state.rounds[roundKey],
          multiplierDrafts: (storedRound.multiplierDrafts && typeof storedRound.multiplierDrafts === 'object') ? { ...storedRound.multiplierDrafts } : {},
          operation: ['add', 'subtract'].includes(storedRound.operation) ? storedRound.operation : null,
          combinedDraft: typeof storedRound.combinedDraft === 'string' ? storedRound.combinedDraft : '',
        },
      },
    };
    if (typeof storedRound.combinedText === 'string' && state.rounds[roundKey].operation) {
      const rechecked = checkEliminationCombination(state, system, roundKey);
      if (!rechecked.feedback) state = rechecked.state;
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
