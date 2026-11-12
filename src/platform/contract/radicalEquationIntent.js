/*
 * WHEN AN AUTHORED  solveStepByStep  EQUATION IS A RADICAL THE STEP ALGEBRA
 * RELATION WORKSPACE VERIFIES.
 *
 * `solveStepByStep` stays the one way to author a radical equation. Compiling
 * it asks this module whether the equation is one the relation workspace can
 * check exactly (functions/shared/toolMath/algebra-relations/
 * radicalEquationShape.mjs: one square, cube, 4th or 5th root, a linear
 * radicand, a constant or — for a square root — linear other side). If so the
 * item opens there by default, with the raise / factor / zero-product tools and
 * the candidate check; if not it is left exactly where it always was.
 *
 * The route is an EXPLICIT flag on the compiled item (`relationWorkspace`), not
 * something the runtime works out by reading the equation, so a question
 * already assigned never changes engine or grader.
 *
 * A Question Family slot writes its equation with {{placeholders}}, so its
 * STRUCTURE is judged on a sample fill; Pre-Flight then checks every sampled
 * generated version exactly (semanticValidation.js radicalAuthoringProblem).
 *
 * Pure and light (no mathjs).
 */
import {
  isSupportedRadicalEquation,
  parseRadicalEquation,
  solveRadicalShape,
} from '../../../functions/shared/toolMath/algebra-relations/radicalEquationShape.mjs';

const PLACEHOLDER = /\{\{\s*[A-Za-z_][A-Za-z0-9_]*\s*(?:\|\s*([A-Za-z]+)\s*)?\}\}/g;
const SAMPLE_FILL = Object.freeze({
  signed: '+ 3', term: '+ 3', sign: '+', coef: '3', abs: '3', paren: '3', pow: '', xterm: '+ 3x', xshift: '(x - 3)',
});
const HAS_RADICAL = /(?:\bsqrt\b|\bcbrt\b|\bnthRoot\b|\\sqrt|√|∛)/;
// An absolute-value bar or an inequality makes it another kind of relation item.
const OTHER_RELATION = /[|<>≤≥]/;

/*
 * A family slot writes {{m|coef}}: the pipe of a placeholder's filter is not an
 * absolute-value bar. Placeholders are filled with a sample number first, so
 * that what is tested is the equation a student reads.
 */
const sampleFill = (text) => String(text).replace(PLACEHOLDER, (match, filter) => (
  filter && Object.prototype.hasOwnProperty.call(SAMPLE_FILL, filter) ? SAMPLE_FILL[filter] : '3'
));

/** Does this equation text contain a radical (and nothing that makes it another kind of relation)? */
export const isRadicalEquationText = (text) => {
  const source = sampleFill(text ?? '');
  return HAS_RADICAL.test(source) && !OTHER_RELATION.test(source);
};

/** Should the compiled item open in the relation workspace because its equation is a verified radical? */
export const radicalEquationOpensRelationWorkspace = (equation, solveFor = null) => {
  const source = String(equation ?? '').trim();
  if (!source || !isRadicalEquationText(source)) return false;
  const variable = solveFor ? String(solveFor) : null;
  // A template's own numbers are not known yet: judge its structure on a
  // sample fill (Pre-Flight then checks every version it generates).
  if (/\{\{/.test(source)) return parseRadicalEquation(sampleFill(source), { variable }).ok === true;
  return isSupportedRadicalEquation(source, { variable });
};

const REASON_TEXT = Object.freeze({
  'two-radicals': 'it has more than one radical',
  'nested-radical': 'it has a radical inside a radical',
  nonlinear: 'a radicand or a term is not linear in the variable',
  'variable-beyond-square-root': 'a cube, 4th or 5th root has a variable on its other side, which makes the raised equation nonlinear (only a square root may)',
  index: 'its root index is outside 2 to 5',
  'multiple-variables': 'it has more than one variable',
  'constant-radicand': 'the radicand has no variable',
  'irrational-candidates': 'raising both sides gives candidates that are not rational numbers, which the lesson cannot factor',
  'no-real-candidates': 'raising both sides gives an equation with no real roots',
});

/**
 * Why a radical equation that was told to open in the relation workspace is
 * outside what the workspace verifies, or null when it is inside it (or is not
 * a radical equation at all). A sentence fragment for Pre-Flight.
 */
export const radicalAuthoringProblem = (source, variable = null) => {
  const text = String(source ?? '').trim();
  if (!text || !isRadicalEquationText(text)) return null;
  const parsed = parseRadicalEquation(text, { variable: variable ? String(variable) : null });
  if (!parsed.ok) return REASON_TEXT[parsed.reason] || 'its structure is outside what the radical workspace checks';
  const solved = solveRadicalShape(parsed.shape);
  return solved.ok ? null : (REASON_TEXT[solved.reason] || 'its candidates cannot be found exactly');
};
