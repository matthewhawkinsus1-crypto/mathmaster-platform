/*
 * A VARIABLE STRAIGHT BEFORE A BRACKET IS A PRODUCT: x(x - 5) IS x TIMES (x - 5).
 *
 * The relation workspace's parser (mathjs, through
 * functions/shared/toolMath/algebra-relations/algebraRelationFoundation.mjs)
 * reads `x(x - 5)` as a CALL of a function named x. No relation defines one, so
 * an equation written that way can never be evaluated ("'x' is not a
 * function"): every candidate check fails, and a correct final answer is marked
 * wrong.
 *
 * One rule, read in three places:
 *   - the radical / quadratic tools, for what a student types
 *     (withExplicitProducts, through src/relationRadicalToolsModel.js);
 *   - the compiler, for an authored relation given
 *     (explicitRelationGivenProducts, in assignmentBlueprint.js
 *     normalizeQuestionStorageShapes): an author's `x(x - 5) = 0` is stored as
 *     `x*(x - 5) = 0`, and the import lists the repair;
 *   - Pre-Flight (relationGivenProductProblem, in semanticValidation.js), for
 *     an item that reaches it without that compile (a Question Editor
 *     replacement, a repair pack, an assignment stored before imports wrote
 *     it): a warning with the line to write instead, never a refusal, so no
 *     existing assignment is blocked from being saved or reused.
 *
 * Only the item's own variable is read as a factor. Another letter keeps its
 * function notation (f(x), h(t)), and so does the variable itself where the
 * item writes it as a function of another letter (x(t)). The shared parser is
 * left alone, so nothing already stored is read differently.
 *
 * Pure and light: no mathjs.
 */
import { withPromptRelationSource } from '../../../functions/shared/runtime/stepAlgebraRelationRouting.mjs';
import { usesRelationWorkspace } from '../../../functions/shared/serverGrading/stepAlgebraRouting.mjs';

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

// The letter, not part of a longer name or a LaTeX command (a digit before it
// is a coefficient: 2x(x - 3)) ...
const NOT_IN_A_NAME = '(?<![A-Za-z_\\\\])';
// ... then a bracket. MathLive writes it x\left(.
const BRACKET = '\\s*(?:\\\\left)?\\s*\\(';

/** What a student types into the tools, read with the variable's products explicit: x(x - 5) is x*(x - 5). */
export const withExplicitProducts = (raw, variable = 'x') => {
  const letter = /^[A-Za-z]$/.test(String(variable)) ? String(variable) : 'x';
  return String(raw ?? '').replace(new RegExp(`${NOT_IN_A_NAME}${letter}${BRACKET}`, 'g'), `${letter}*(`);
};

// An authored given keeps everything the author wrote around the multiplication
// sign: its spacing and a \left( that its \right) closes.
const explicitInGiven = (text, letter) => text.replace(new RegExp(`${NOT_IN_A_NAME}${letter}(?=${BRACKET})`, 'g'), `${letter}*`);

// Every field the relation workspace reads its relation from
// (stepAlgebraRouting.mjs relationSourceFromQuestion, and
// stepAlgebraRelationRouting.mjs withPromptRelationSource). The prompt is
// display text and is never rewritten.
const GIVEN_FIELDS = Object.freeze([
  'equation', 'equationAscii', 'initialEquation', 'formula', 'equationLatex',
  'leftExpression', 'rightExpression', 'inequalityText', 'inequality',
]);
const METADATA_GIVEN_FIELDS = Object.freeze(['equation', 'inequalityText', 'inequality']);
// The types QuestionEngine opens Step Algebra for, which hand a relation to the
// relation workspace (a literal question reads its formula through its own
// literal reader).
const STEP_ALGEBRA_TYPES = new Set(['stepAlgebra', 'algebra']);

const givenTexts = (question) => [
  ...GIVEN_FIELDS.map((field) => question[field]),
  ...(Array.isArray(question.expressions) ? question.expressions : []),
  ...(isObject(question.metadata) ? METADATA_GIVEN_FIELDS.map((field) => question.metadata[field]) : []),
].filter((value) => typeof value === 'string');

/** The variable the relation workspace solves for, read as it reads it, when it is one letter. */
const workspaceVariable = (question) => {
  const routed = withPromptRelationSource(question);
  const variable = String(routed.solveFor || routed.variable || routed.objective?.variable || 'x');
  return /^[A-Za-z]$/.test(variable) ? variable : null;
};

/** Does the item write `letter` as a function of another letter, x(t), in a given or its prompt? */
const writesAsFunction = (question, letter) => {
  const call = new RegExp(`${NOT_IN_A_NAME}${letter}${BRACKET}\\s*([A-Za-z])\\s*(?:\\\\right)?\\s*\\)`, 'g');
  return [...givenTexts(question), typeof question.prompt === 'string' ? question.prompt : '']
    .some((text) => [...text.matchAll(call)].some((match) => match[1] !== letter));
};

/** The letter this item's givens are read with explicit products for, or null. */
const productLetter = (question) => {
  if (!isObject(question) || !STEP_ALGEBRA_TYPES.has(String(question.toolId || question.type || ''))) return null;
  if (!usesRelationWorkspace(question)) return null;
  const letter = workspaceVariable(question);
  return letter && !writesAsFunction(question, letter) ? letter : null;
};

/**
 * The item with its relation given's products written out, and what changed:
 * `{ question, changes: [{ field, before, after }], variable }`. An item with
 * nothing to change comes back as the same object, with no changes.
 */
export const explicitRelationGivenProducts = (question) => {
  const letter = productLetter(question);
  if (!letter) return { question, changes: [], variable: null };
  const changes = [];
  const rewrite = (field, text) => {
    if (typeof text !== 'string') return text;
    const after = explicitInGiven(text, letter);
    if (after !== text) changes.push({ field, before: text, after });
    return after;
  };
  const next = { ...question };
  GIVEN_FIELDS.forEach((field) => {
    if (typeof question[field] === 'string') next[field] = rewrite(field, question[field]);
  });
  if (Array.isArray(question.expressions)) {
    next.expressions = question.expressions.map((expression, index) => rewrite(`expressions[${index}]`, expression));
  }
  if (isObject(question.metadata)) {
    next.metadata = { ...question.metadata };
    METADATA_GIVEN_FIELDS.forEach((field) => {
      if (typeof question.metadata[field] === 'string') next.metadata[field] = rewrite(`metadata.${field}`, question.metadata[field]);
    });
  }
  return changes.length ? { question: next, changes, variable: letter } : { question, changes: [], variable: null };
};

/** The first given Pre-Flight refuses, `{ field, before, after, variable }`, or null. */
export const relationGivenProductProblem = (question) => {
  const { changes, variable } = explicitRelationGivenProducts(question);
  return changes.length ? { ...changes[0], variable } : null;
};
