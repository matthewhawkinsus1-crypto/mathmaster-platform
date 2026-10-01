/*
 * INTERPRETING AN EARNED IDENTITY OR CONTRADICTION (#390, #392).
 *
 * The statement comes from the student's checked work; this module holds what
 * the student is then asked about it, and how an answer is judged:
 *
 *   1. what kind of statement it is — identity, contradiction, or the
 *      "0 = 0 means (0, 0, 0)" misconception;
 *   2. what that means for the system;
 *   3. how each pair of planes meets.
 *
 * No React here, so the rules are testable in node.
 */
import { linearEquationForm } from './algebraicSystemsEngine.js';
import {
  describePlaneRelationships,
  planePairs,
  planeRelationshipFeedback,
  planeRelationshipTypes,
} from './spatialFeedback.js';

export const STATEMENT_KINDS = Object.freeze([
  // Short enough to read in a closed phone-width select (#392).
  { value: 'identity', label: 'Identity (always true)' },
  { value: 'contradiction', label: 'Contradiction (never true)' },
  { value: 'origin', label: 'True only at (0, 0, 0)' },
]);

export const SYSTEM_MEANINGS = Object.freeze([
  { value: 'unique', label: 'Exactly one solution' },
  { value: 'infinite', label: 'Infinitely many — dependent' },
  { value: 'none', label: 'No solution — inconsistent' },
]);

const KIND_FOR = Object.freeze({ infinite: 'identity', none: 'contradiction' });

/** Is the student's reading of the statement right? Only then is a classification recorded. */
export const statementKindCorrect = (outcome, kind) => Boolean(outcome && kind === KIND_FOR[outcome.type]);

/**
 * A nudge tied to what the student chose — never the classification itself.
 * The kind of statement is judged first: whether `0 = 0` is always true is the
 * idea the meaning rests on (#390: "0 = 0 means (0, 0, 0)").
 */
export const classificationFeedback = (outcome, kind, choice) => {
  if (!outcome) return null;
  if (kind === 'origin') return 'A statement with no variables does not fix any coordinate. Does its truth change when x, y, or z changes?';
  if (!statementKindCorrect(outcome, kind)) return 'Evaluate both sides of your statement. Is it true or false — and does that depend on the values of the variables?';
  if (choice === outcome.type) return null;
  if (outcome.type === 'infinite') {
    return choice === 'none'
      ? 'An identity is true for every choice of the variables, so it rules no point out. Did any part of your work produce a false statement?'
      : 'An identity places no condition on the variables. With every original equation accounted for, is the system pinned to a single ordered triple?';
  }
  return 'A contradiction is false for every choice of the variables. Can any ordered triple make all three equations true at once?';
};

export const emptyPlaneWork = () => ({ answers: {}, checked: false });

const questionVariables = (questionData) => (
  Array.isArray(questionData?.variables) && questionData.variables.length ? questionData.variables.map(String) : ['x', 'y', 'z']
);
const questionEquations = (questionData) => (Array.isArray(questionData?.equations) ? questionData.equations.map(String) : []);

/** How each pair of this question's planes meets — for judging, never for display. */
export const planeTruthFor = (questionData) => {
  const variables = questionVariables(questionData);
  return planeRelationshipTypes(questionEquations(questionData).map((equation) => linearEquationForm(equation, variables)), variables);
};

/** Are the stated plane relationships right for these equations? Re-judged, never trusted. */
export const planeWorkEarned = (planeWork, questionData) => {
  if (!planeWork?.checked || questionEquations(questionData).length !== 3) return false;
  const truth = planeTruthFor(questionData);
  return planePairs(3).every(({ id }) => planeWork.answers?.[id] === truth[id]);
};

const optionLabel = (options, value) => options.find((option) => option.value === value)?.label || '';

/**
 * A 2×2 THAT REDUCES TO A STATEMENT WITH NO VARIABLE: WHAT ITS ANSWERS SHOW.
 *
 * The student says whether the statement is true, what that means for the
 * system, and how to classify it. Where outcomes are shown the line under the
 * three answers is a verdict the moment all three are chosen ("Correct
 * interpretation." or a nudge), the work trail ticks the step only when it is
 * right and the statement card turns green. On a DOL, quiz or test that is an
 * answer key the student can query by changing a select, so there the line
 * only says the answers are recorded, the trail ticks the step once all three
 * are chosen, and nothing turns green. Grading is unchanged either way: the
 * submitted interpretation is right only when all three answers are.
 */
export const resolveSpecialCaseReport = ({ showImmediateFeedback = true, answered = false, correct = false } = {}) => {
  const verdictsShown = showImmediateFeedback !== false;
  return {
    verdictsShown,
    line: !answered ? null : verdictsShown ? { kind: 'verdict', correct: Boolean(correct) } : { kind: 'recorded' },
    stageComplete: verdictsShown ? Boolean(correct) : Boolean(answered),
    showsCorrect: verdictsShown && Boolean(correct),
  };
};

/**
 * WHAT "CHECK MY CLASSIFICATION" AND "CHECK THE PLANE RELATIONSHIPS" MAY SAY.
 *
 * Where the activity shows outcomes at once (practice, warm-up, classwork)
 * both checks are verdicts: a classification is recorded only once the
 * student's reading of the statement is right, the planes stay open until
 * every pair is right, and the question can be submitted only after both —
 * so every submission there is a correct one. On an activity that withholds
 * outcomes until it is submitted (a DOL, quiz or test:
 * ToolRuntimeContext.showImmediateFeedback false) that is a free answer key
 * with three choices to try — check, change, check again, then spend the one
 * attempt.
 *
 * So a verdict exists only where outcomes are shown. Without one, a check
 * RECORDS what the student chose and says only that it is recorded; the next
 * step opens whatever was chosen; Submit waits only for both answers to be
 * recorded; and both are graded when the question is submitted (`grade`).
 *
 * `classification` is what is recorded for THIS outcome ({ choice, kind }), or
 * null. A record from before the kind was stored has no `kind`: it could only
 * be made with the right reading of the statement, so it counts as right.
 */
export const resolveInterpretationGate = ({
  showImmediateFeedback = true,
  outcome = null,
  classification = null,
  planeWork = null,
  questionData = {},
} = {}) => {
  const verdictsShown = showImmediateFeedback !== false;
  const record = outcome && classification && classification.choice ? classification : null;
  const recorded = Boolean(record);
  const kindRight = Boolean(record) && (record.kind == null || statementKindCorrect(outcome, record.kind));
  const classificationCorrect = Boolean(record) && kindRight && record.choice === outcome.type;
  // Whether the classification step is done: the form gives way and the
  // next step (the plane relationships, the 3D connection) opens.
  const classified = verdictsShown ? classificationCorrect : recorded;

  const planes = planeWork || emptyPlaneWork();
  const planesAnswered = planePairs(3).every(({ id }) => Boolean(planes.answers?.[id]));
  const planesRecorded = Boolean(outcome) && classified && Boolean(planes.checked) && planesAnswered;
  const planesCorrect = Boolean(outcome) && classified && planeWorkEarned(planes, questionData);
  // Whether the plane step is done (its selects give way to a summary).
  const planesDone = verdictsShown ? planesCorrect : planesRecorded;

  const parts = outcome ? [
    { id: 'classification', label: 'What your result means', isComplete: recorded, isCorrect: classificationCorrect },
    { id: 'planes', label: 'How the planes meet', isComplete: planesRecorded, isCorrect: planesCorrect },
  ] : [];
  const earned = parts.filter((part) => part.isCorrect).length;

  return {
    verdictsShown,
    classified,
    planesDone,
    readyToSubmit: Boolean(outcome) && classified && planesDone,
    // What one press of "Check my classification" records: the choice once
    // the statement is read right where outcomes are shown; whatever was
    // chosen, once both answers are chosen, where they are withheld.
    recordsClassification: (kind, choice) => (verdictsShown
      ? statementKindCorrect(outcome, kind)
      : Boolean(outcome && kind && choice)),
    // The nudge under the form after a press: practice only.
    classificationHint: (kind, choice) => (verdictsShown ? classificationFeedback(outcome, kind, choice) : null),
    // The line that replaces the form once the step is done: the meaning the
    // student earned where outcomes are shown; otherwise the student's own
    // answers, which are not judged here.
    classificationSummary: !classified ? null : verdictsShown
      ? `Your classification: ${outcome.type === 'infinite' ? 'an identity; consistent and dependent; infinitely many solutions' : 'a contradiction; inconsistent; no solution'}.`
      : `Your classification: ${[optionLabel(STATEMENT_KINDS, record.kind), optionLabel(SYSTEM_MEANINGS, record.choice)].filter(Boolean).join('; ')}. It is graded when you submit.`,
    // The nudge under the plane selects after a check: practice only.
    planeHint: verdictsShown && planes.checked && classified && !planesCorrect
      ? planeRelationshipFeedback(planes.answers, planeTruthFor(questionData))
      : null,
    planeSummary: planesDone
      ? `Your plane relationships: ${describePlaneRelationships(planes.answers).join(' ')}${verdictsShown ? '' : ' They are graded when you submit.'}`
      : null,
    // What the submitted attempt says about the interpretation. Judged from
    // the recorded answers, never from the fact that they were recorded.
    grade: {
      isCorrect: Boolean(outcome) && classificationCorrect && planesCorrect,
      score: parts.length ? earned / parts.length : 0,
      parts,
    },
  };
};
