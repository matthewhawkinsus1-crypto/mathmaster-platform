/*
 * Shared grader for the `inverseCompositionLab` registry tool — run by the
 * browser tool for feedback, by QuestionEngine for the recorded verdict, and
 * by the server as the authority. See ../toolGraderDefinition.mjs for the
 * contract.
 *
 * THE LAB (full, composition, inverse, restriction) — extracted check-for-check
 * from InverseCompositionLab.jsx's Check: the same default f and g, the same
 * x (the question's own x when it is a given input), the same tolerance 0.02,
 * the same numeric parsing (fractions accepted, a blank never matches), the
 * same expected restriction, and the same parts per view — only the parts a
 * view asks for are marked, and score = parts right / parts asked for.
 *
 * THE DERIVATION (deriveInverse) — extracted from InverseDerivationLab.jsx:
 * 0.4 for swapping x and y, 0.6 for isolating y, correct only when y is
 * isolated. The verdict is read from the derivation's current equation, and
 * an isolated equation must also be the inverse of THIS f. Every balanced move
 * keeps the equation equivalent to x = f(y), so for any derivation the lab
 * can actually build that is the lab's own rule; it only refuses an equation
 * the lab never derived from this f (a tampered response, a draft from before
 * a teacher edited f) or one whose terms `clean` rounded away
 * (inverseDerivationMath.mjs).
 */
import declaration from '../declarations/inverseCompositionLab.mjs';
import { bindToolGrader } from '../toolGraderDefinition.mjs';
import { gradedResult } from '../gradingResult.mjs';
import { matchesNumericAnswer } from '../../toolMath/shared/toolMath.mjs';
import {
  DEFAULT_INVERSE_LAB_F,
  INVERSE_RESTRICTION_CHOICES,
  composeValue,
  evaluateSpecWithDomain,
  expectedInverseRestriction,
  hasFunctionalInverse,
  inverseLabFunctions,
  inverseLabInitialX,
  inverseLabInputLocked,
  inverseLabRequiredParts,
  inverseLabRoundTrip,
} from '../../toolMath/inverseComposition/inverseCompositionMath.mjs';
import {
  createLinearInverseDerivation,
  derivationEquationIsSwapped,
  derivationEquationIsolatesY,
  derivationEquationSolvesInverse,
  readDerivationEquation,
} from '../../toolMath/inverseComposition/inverseDerivationMath.mjs';

const TOLERANCE = 0.02;

// A box holds what was typed. Anything that is not text or a number was never
// typed into it, and counts as blank.
const typed = (value) => (typeof value === 'string' || typeof value === 'number' ? String(value) : '');
const filled = (value) => typed(value).trim() !== '';

const PART_LABELS = Object.freeze({
  fog: '(f ∘ g)(x)',
  gof: '(g ∘ f)(x)',
  inverse: 'f⁻¹(f(x))',
  restriction: 'Domain restriction',
});

const gradeLab = (question, work) => {
  const { f, g } = inverseLabFunctions(question);
  // The lab's own view of the question: which panels are on screen.
  const labMode = question.mode || 'full';
  const showComposition = labMode === 'composition' || labMode === 'full';
  const showInverse = labMode !== 'composition';
  // A given input is the question's, not the response's. A chosen input is the
  // x box as typed — read with Number() exactly as the lab reads it, so a
  // cleared box is x = 0 — and anything that is not text or a number was never
  // typed there and is no input at all.
  const x = inverseLabInputLocked(question)
    ? Number(inverseLabInitialX(question))
    : (typeof work.x === 'string' || typeof work.x === 'number' ? Number(work.x) : Number.NaN);

  const canInvert = hasFunctionalInverse(f);
  const fx = evaluateSpecWithDomain(f, x);
  const fog = composeValue(f, g, x);
  const gof = composeValue(g, f, x);
  // f⁻¹(f(x)) on f's kept branch: x, or 2h − x for an input off a parabola's kept branch.
  const inverseAtFx = inverseLabRoundTrip(f, x);
  const restrictionChoice = INVERSE_RESTRICTION_CHOICES.includes(work.restrictionChoice) ? work.restrictionChoice : null;

  const results = {
    fog: Number.isFinite(fog) && matchesNumericAnswer(typed(work.fogAnswer), fog, TOLERANCE),
    gof: Number.isFinite(gof) && matchesNumericAnswer(typed(work.gofAnswer), gof, TOLERANCE),
    // f⁻¹(f(x)): the x the student started from when it is on f's kept branch.
    inverse: canInvert && Number.isFinite(inverseAtFx) && matchesNumericAnswer(typed(work.inverseAnswer), inverseAtFx, TOLERANCE),
    restriction: restrictionChoice !== null && restrictionChoice === expectedInverseRestriction(f),
  };
  // A part is complete when its input holds a value — or when the screen shows
  // no input for it at all (the inverse box is replaced by a "no inverse"
  // notice): there is nothing left for the student to enter. The restriction
  // select is on screen whenever the restriction is asked (for any f, not only
  // a quadratic) and opens on "Choose…" (''), which is no choice: neither
  // complete nor right, never the "No restriction needed" it used to default to.
  const complete = {
    fog: !showComposition || filled(work.fogAnswer),
    gof: !showComposition || filled(work.gofAnswer),
    inverse: !(showInverse && canInvert && Number.isFinite(fx)) || filled(work.inverseAnswer),
    restriction: restrictionChoice !== null,
  };
  const responses = {
    fog: typed(work.fogAnswer),
    gof: typed(work.gofAnswer),
    inverse: typed(work.inverseAnswer),
    restriction: restrictionChoice || '',
  };

  const required = inverseLabRequiredParts(labMode, f);
  const right = required.filter((id) => results[id]).length;
  return gradedResult({
    isCorrect: right === required.length,
    score: right / required.length,
    parts: required.map((id) => ({
      id,
      label: PART_LABELS[id],
      isComplete: complete[id],
      isCorrect: results[id],
      response: responses[id],
    })),
  });
};

const deriveInverse = (question, work) => {
  const f = question.f || DEFAULT_INVERSE_LAB_F;
  // Throws for anything but a non-constant linear f — the declaration already
  // refuses those questions, and the screen cannot open on one.
  createLinearInverseDerivation(f);
  const equation = readDerivationEquation(work.equation);
  const swapped = derivationEquationIsSwapped(equation);
  // Finished when y is isolated — a deadline submits a finished derivation,
  // never a half-done one — and right only when it is THIS f's inverse.
  const isolated = derivationEquationIsolatesY(equation);
  const solved = isolated && derivationEquationSolvesInverse(equation, f);
  return gradedResult({
    isComplete: isolated,
    isCorrect: solved,
    // The lab's weighting: 0.4 for the swap, 0.6 for isolating y. The parts
    // carry the same 2:3 weights, so the recorded part credit agrees.
    score: (swapped ? 0.4 : 0) + (solved ? 0.6 : 0),
    parts: [
      { id: 'swapped', label: 'Swap x and y', isComplete: swapped, isCorrect: swapped, weight: 2 },
      { id: 'isolated', label: 'Isolate y to state f⁻¹(x)', isComplete: isolated, isCorrect: solved, weight: 3 },
    ],
  });
};

export default bindToolGrader(declaration, 'inverseCompositionLab', {
  full: gradeLab,
  composition: gradeLab,
  inverse: gradeLab,
  restriction: gradeLab,
  deriveInverse,
});
