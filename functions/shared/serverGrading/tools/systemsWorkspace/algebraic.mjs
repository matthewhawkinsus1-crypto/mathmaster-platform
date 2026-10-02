/*
 * systemsWorkspace — the `algebraic` mode grader: { algebraic: (question, work) => result }.
 * Every mode declared SHARED in ../../declarations/systemsWorkspace/algebraic.mjs
 * has a grader here, and no other.
 *
 * Extracted check-for-check from the Check handlers the workspace used to run
 * inline, and run by them now through gradeToolCheck:
 *
 *   2×2  AlgebraicSystemMode.jsx
 *        one solution     each value within 0.05 of the true value
 *                         (matchesNumericAnswer), and — unless the question
 *                         turns verification off — each original equation's
 *                         typed sides within 0.05 of the true sides at those
 *                         values with the two sides equal
 *                         (twoByTwoVerificationValid, the rule "Check
 *                         equation n" runs).
 *        none / infinite  the no-variable statement the reduction reached,
 *                         and the three readings of it: true or false, how
 *                         many solutions, which classification.
 *   3×3  SubstitutionReductionMode.jsx / EliminationReductionMode.jsx
 *        unique           each value within 1e-6 relative of the true value
 *                         (reductionValueMatches, gradeReduction's rule), and
 *                         unless turned off every original equation verified
 *                         from its typed sides (verificationEntryValid — the
 *                         checkVerification the screen runs, sides already
 *                         written as numbers taken as given).
 *        none / infinite  (elimination only) the checked statement with no
 *                         variable, the classification the student recorded
 *                         with their reading of that statement, and how they
 *                         say each pair of planes meets.
 *
 * Every verdict but one is all-or-nothing (score 1 or 0); the parts only say
 * which piece is missing or wrong. The exception is the 3×3 interpretation:
 * since a DOL, quiz or test records it unjudged (B-24) it can be submitted
 * half right, and it earns half for the classification and half for the
 * planes (gradeInterpretation).
 *
 * WHICH RUBRIC APPLIES IS DECIDED BY THE AUTHORED SYSTEM, never by the shape
 * of the work. The screen took the special-case branch when the student's own
 * reduction reached a statement with no variable — which a valid reduction
 * does exactly when the authored system is dependent or inconsistent, so the
 * two agree on every state the workspace can reach, and a client cannot pick
 * the rubric by choosing which fields to send.
 *
 * Unauthored fields default exactly as the screen defaults them
 * (normalizeAlgebraicSystemConfig: the x - 2y = -3 / 3x + 5y = 24 system, x/y
 * or x/y/z, studentChoice, verification required).
 */
import { gradedResult, ungradedResult } from '../../gradingResult.mjs';
import { matchesNumericAnswer } from '../../../toolMath/shared/toolMath.mjs';
import {
  algebraicSystemDimension,
  degenerateStatementTruth,
  isDegenerateStatement,
  isPlainArithmetic,
  linearEquationCoefficients,
  noVariableStatementType,
  normalizeAlgebraicSystemConfig,
  solveAlgebraicSystem,
  twoByTwoVerificationValid,
} from '../../../toolMath/systemsWorkspace/algebraicSystemsEngine.mjs';
import {
  buildReductionSystem,
  reductionAnswerKey,
  reductionValueMatches,
  verificationEntryValid,
  verificationGivenSides,
} from '../../../toolMath/systemsWorkspace/substitutionReduction.mjs';
import { STATEMENT_KINDS, SYSTEM_MEANINGS, planeTruthFor, statementKindCorrect } from '../../../toolMath/systemsWorkspace/algebraicOutcomeModel.mjs';
import { PLANE_RELATIONSHIP_OPTIONS, planePairs } from '../../../toolMath/systemsWorkspace/spatialFeedback.mjs';

const text = (value) => (value === null || value === undefined ? '' : String(value));
// What the student entered in a box or select: the screens only ever hold
// strings there, so anything else reads as nothing entered.
const entered = (value) => (typeof value === 'string' ? value : '');
const filled = (value) => text(value).trim() !== '';
const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const own = (object, key) => (isPlainObject(object) && Object.prototype.hasOwnProperty.call(object, key) ? object[key] : undefined);
const safely = (fn, fallback = false) => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

/* ----------------------------------------------------------- work helpers */

/**
 * The values a student has solved, as work: finite numbers only, keyed by
 * variable. The screens hold them as numbers already (Step Algebra's solved
 * value), so nothing is rounded or reformatted on the way.
 */
export const solvedValuesWork = (values) => Object.fromEntries(
  Object.entries(isPlainObject(values) ? values : {})
    .filter(([, value]) => typeof value === 'number' && Number.isFinite(value)),
);

/**
 * The sides a student typed in the original-equation check, as work:
 * `{ [equationId]: { left, right } }`. Only what they typed — the
 * `checked` / `valid` flags a screen keeps are its own feedback, never work.
 */
export const verificationSidesWork = (entries) => Object.fromEntries(
  Object.entries(isPlainObject(entries) ? entries : {})
    .filter(([, entry]) => isPlainObject(entry))
    .map(([id, entry]) => [id, { left: text(entry.leftAnswer), right: text(entry.rightAnswer) }]),
);

/* ------------------------------------------------------------ work readers */

const solvedValue = (raw, name) => {
  const value = own(raw, name);
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};
const readValues = (raw, variables) => Object.fromEntries(variables.map((name) => [name, solvedValue(raw, name)]));
const allSolved = (values, variables) => variables.every((name) => values[name] !== null);
const typedSides = (work, equationId) => {
  const entry = own(work.verification, equationId);
  return { left: entered(own(entry, 'left')), right: entered(own(entry, 'right')) };
};

// Every algebraic attempt has always been recorded all-or-nothing.
// A statement a client sends is evaluated only when both sides are plain
// arithmetic in the system's variables — never mathjs's wider library.
const statementText = (value) => entered(value).replace(/\u2212/g, '-').trim();
const plainStatement = (statement, variables) => {
  const sides = statement.split('=');
  return sides.length === 2 && sides.every((side) => side.trim() !== '' && isPlainArithmetic(side, variables));
};

const allOrNothing = (parts) => {
  const isCorrect = parts.length > 0 && parts.every((part) => part.isCorrect === true);
  return gradedResult({ parts, isCorrect, score: isCorrect ? 1 : 0 });
};

const valuePart = (name, value, isCorrect) => ({
  id: `value-${name}`,
  label: `Value of ${name}`,
  isComplete: value !== null,
  isCorrect: value !== null && isCorrect,
  response: value === null ? '' : String(value),
});

/* --------------------------------------------------------------------- 2×2 */

// The three selects the special case asks, and the only values they offer.
const SPECIAL_CASE_CHOICES = Object.freeze({
  statementTruth: Object.freeze(['true', 'false']),
  solutionCount: Object.freeze(['none', 'infinite']),
  classification: Object.freeze(['inconsistent', 'consistent-dependent']),
});
const specialCaseChoice = (work, field) => {
  const value = entered(own(work.specialCase, field));
  return SPECIAL_CASE_CHOICES[field].includes(value) ? value : '';
};

const gradeOrderedPair = (config, expected, work) => {
  const { variables, equations } = config;
  const values = readValues(work.values, variables);
  const targets = [expected.x, expected.y];
  const parts = variables.map((name, index) => valuePart(
    name,
    values[name],
    matchesNumericAnswer(values[name], targets[index], 0.05),
  ));
  if (config.requireVerification) {
    const solved = allSolved(values, variables);
    equations.forEach((equationText, index) => {
      const id = `E${index + 1}`;
      const sides = typedSides(work, id);
      const typed = filled(sides.left) && filled(sides.right);
      parts.push({
        id: `verify-${id}`,
        label: `Verify equation ${index + 1}`,
        isComplete: typed,
        isCorrect: solved && typed && safely(() => twoByTwoVerificationValid(equationText, values, sides.left, sides.right)),
        response: `${sides.left} = ${sides.right}`,
      });
    });
  }
  return allOrNothing(parts);
};

const gradeSpecialCase = (config, isTrue, work) => {
  // The statement the student's reduction reached, read the way the screen
  // reads it (linearEquationCoefficients -> isDegenerateStatement /
  // degenerateStatementTruth). It must agree with the authored system.
  const statement = statementText(work.reducedStatement);
  const coefficients = plainStatement(statement, config.variables) ? linearEquationCoefficients(statement, config.variables) : null;
  const statementHolds = Boolean(coefficients
    && isDegenerateStatement(coefficients)
    && degenerateStatementTruth(coefficients).isTrue === isTrue);
  const truth = specialCaseChoice(work, 'statementTruth');
  const count = specialCaseChoice(work, 'solutionCount');
  const classification = specialCaseChoice(work, 'classification');
  return allOrNothing([
    { id: 'reduced-statement', label: 'Statement with no variable', isComplete: Boolean(statement), isCorrect: statementHolds, response: statement },
    { id: 'statement-truth', label: 'Is the statement true or false?', isComplete: Boolean(truth), isCorrect: Boolean(truth) && (truth === 'true') === isTrue, response: truth },
    { id: 'solution-count', label: 'What it means for the system', isComplete: Boolean(count), isCorrect: count === (isTrue ? 'infinite' : 'none'), response: count },
    { id: 'classification', label: 'Classification', isComplete: Boolean(classification), isCorrect: classification === (isTrue ? 'consistent-dependent' : 'inconsistent'), response: classification },
  ]);
};

const gradeTwoByTwo = (question, work) => {
  const config = normalizeAlgebraicSystemConfig(question);
  const expected = solveAlgebraicSystem(config.coefficients);
  if (expected.type === 'one') return gradeOrderedPair(config, expected, work);
  return gradeSpecialCase(config, expected.type === 'infinite', work);
};

/* --------------------------------------------------------------------- 3×3 */

const MEANINGS = new Set(SYSTEM_MEANINGS.map((option) => option.value));
const KINDS = new Set(STATEMENT_KINDS.map((option) => option.value));
const PLANE_CHOICES = new Set(PLANE_RELATIONSHIP_OPTIONS.map((option) => option.value));

const gradeOrderedTriple = (config, system, key, work) => {
  const values = readValues(work.values, system.variables);
  const parts = system.variables.map((name) => valuePart(
    name,
    values[name],
    values[name] !== null && reductionValueMatches(values[name], key.solution[name]),
  ));
  if (config.requireVerification) {
    const solution = allSolved(values, system.variables) ? values : null;
    system.equations.forEach((equation) => {
      const sides = typedSides(work, equation.id);
      // A side already written as a number is shown as given, never typed.
      const given = safely(() => verificationGivenSides(system, equation.id), { left: null, right: null });
      const typed = (given.left != null || filled(sides.left)) && (given.right != null || filled(sides.right));
      parts.push({
        id: `verify-${equation.id}`,
        label: `Verify ${equation.label}`,
        isComplete: typed,
        isCorrect: Boolean(solution) && typed
          && safely(() => verificationEntryValid(system, solution, equation.id, { leftAnswer: sides.left, rightAnswer: sides.right })),
        response: `${given.left ?? sides.left} = ${given.right ?? sides.right}`,
      });
    });
  }
  return allOrNothing(parts);
};

const gradeInterpretation = (system, key, work) => {
  const outcome = isPlainObject(work.outcome) ? work.outcome : {};
  const statement = statementText(outcome.statement);
  const choice = MEANINGS.has(entered(outcome.classificationChoice)) ? entered(outcome.classificationChoice) : '';
  // The student's reading of the statement, recorded with the choice. Where
  // outcomes are shown only the right reading is ever recorded; on a DOL,
  // quiz or test whatever was chosen is (B-24), so it is judged here: the
  // right meaning read from the wrong kind of statement is not right. A record
  // from before readings were stored carries none and is judged on its choice,
  // as it always was.
  const kind = KINDS.has(entered(outcome.classificationKind)) ? entered(outcome.classificationKind) : '';
  const statementRight = plainStatement(statement, system.variables) && noVariableStatementType(statement, system.variables) === key.type;
  // How each pair of the authored planes meets — the planeWorkEarned truth.
  const truth = planeTruthFor({ equations: system.equations.map((equation) => equation.text), variables: system.variables });
  const classificationPart = {
    id: 'classification',
    label: 'What the statement means for the system',
    isComplete: Boolean(choice),
    isCorrect: choice === key.type && (!kind || statementKindCorrect(key, kind)),
    response: [choice, kind ? `(${kind})` : ''].filter(Boolean).join(' '),
  };
  const planeParts = planePairs(3).map(({ id, first, second }) => {
    const answer = entered(own(outcome.planes, id));
    const stated = PLANE_CHOICES.has(answer) ? answer : '';
    return {
      id: `planes-${id}`,
      label: `Planes ${first} and ${second}`,
      isComplete: Boolean(stated),
      isCorrect: Boolean(stated) && stated === truth[id],
      response: stated,
    };
  });
  // Two judgments, half the credit each: what the statement means and how
  // the planes meet. Neither counts unless the statement is the system's own:
  // without it there is nothing to interpret.
  const classificationEarned = statementRight && classificationPart.isCorrect;
  const planesEarned = statementRight && planeParts.every((part) => part.isCorrect);
  return gradedResult({
    parts: [
      { id: 'statement', label: 'Statement with no variable', isComplete: Boolean(statement), isCorrect: statementRight, response: statement },
      classificationPart,
      ...planeParts,
    ],
    isCorrect: classificationEarned && planesEarned,
    score: (Number(classificationEarned) + Number(planesEarned)) / 2,
  });
};

const gradeThreeByThree = (question, work) => {
  const config = normalizeAlgebraicSystemConfig(question);
  const system = buildReductionSystem({ variables: config.variables, equations: config.equations });
  const key = reductionAnswerKey(system);
  // Algebraic3SystemMode: the authored method, or the student's pick under
  // studentChoice. No pick is the choice screen; any pick other than
  // elimination renders the substitution workspace.
  const chosen = config.method === 'studentChoice' ? entered(work.method).trim() : config.method;
  if (!chosen) return allOrNothing([{ id: 'method', label: 'Method', isComplete: false, isCorrect: false, response: '' }]);
  const route = chosen === 'elimination' ? 'elimination' : 'substitution';
  if (key.type === 'invalid' || (route === 'substitution' && key.type !== 'unique')) {
    // Both workspaces replace the workflow with an "unsupported" notice and
    // no Check for these systems: there is no verdict to reproduce.
    return ungradedResult('unsupported-system');
  }
  if (key.type === 'unique') return gradeOrderedTriple(config, system, key, work);
  return gradeInterpretation(system, key, work);
};

/* ------------------------------------------------------------------- mode */

// SystemsWorkspace.jsx renders Algebraic3SystemMode exactly when
// algebraicSystemDimension is 3, and AlgebraicSystemMode otherwise.
const algebraic = (question, work) => (
  algebraicSystemDimension(question) === 3 ? gradeThreeByThree(question, work) : gradeTwoByTwo(question, work)
);

export default { algebraic };
