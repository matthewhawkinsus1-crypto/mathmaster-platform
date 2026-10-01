/*
 * STUDENT TEXT THE EXPRESSION ENGINE MUST NOT RUN ON THE SERVER.
 *
 * Marking a composed question parses and evaluates what the student typed:
 * equivalence.mjs simplifies an equation, domain or range with mathjs, and
 * modelExpression.mjs compiles and evaluates the student's function, their
 * table cells and the model a table was built from. mathjs is a full
 * language, not a calculator: `sum(1:1000000000)` allocates a billion-entry
 * range, `zeros(600, 600)` makes `simplify` run for half a minute, and
 * `createUnit(...)` changes the engine for every later caller. In a browser
 * that only ever hurt the student's own tab; on the server it would stall or
 * crash the function grading everyone's work.
 *
 * So before the shared grader marks a composed question it asks
 * unsafeExpressionStage(): does any response that WILL reach mathjs contain a
 * range (`:`) or call a function that is not elementary (single-letter
 * function notation such as f(x) and W(t), sin, sqrt, log, abs, max, ...)? If
 * so the grader declines (`unsafe-expression`) without running anything:
 * ingestion holds the attempt for teacher review, and the browser records no
 * attempt and tells the student their work was saved but not checked. A
 * legitimate answer in these stages is not a range; an unusual multi-letter
 * function name (Cost(h) = 5h + 40) is declined too, which the device would
 * have marked wrong anyway (definesAFunction accepts single letters only).
 *
 * Light and pure: no mathjs.
 */
import { GRAPH_CONSTRUCTION_STAGE_KINDS } from './composedWorkflowContract.mjs';

const MAX_ALGEBRAIC_EXPRESSION_LENGTH = 300;

/**
 * The text equivalence.mjs hands to mathjs for a student or key expression,
 * or null when it never reaches the parser (empty, too long, or containing a
 * set, matrix, object or statement separator).
 */
export const algebraicExpressionInput = (value) => {
  const text = String(value ?? '').trim();
  if (!text || text.length > MAX_ALGEBRAIC_EXPRESSION_LENGTH || /[;[\]{}]/.test(text)) return null;
  return text.replace(/\^/g, '^');
};

// Functions a student's algebra can legitimately call. Single letters (f(x),
// W(t), and implicit products such as x(x + 1)) are always allowed.
const ELEMENTARY_FUNCTIONS = new Set([
  'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'asin', 'acos', 'atan', 'asec', 'acsc', 'acot',
  'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'sqrt', 'cbrt', 'nthroot', 'abs', 'exp',
  'log', 'ln', 'lg', 'floor', 'ceil', 'round', 'fix', 'sign', 'mod', 'max', 'min', 'pow', 'pi',
  // LaTeX remnants the model reader converts or the parser rejects.
  'frac', 'dfrac', 'tfrac', 'text', 'mathrm',
]);

const CALL = /([A-Za-z_][A-Za-z0-9_]*)\(/g;

const allowedCall = (name) => {
  // log_2(x), log10(x), x_1(...): judge the name, not its subscript.
  const match = name.match(/^([A-Za-z]+)(?:_[A-Za-z0-9_]*|\d+)?$/);
  if (!match) return false;
  const base = match[1].toLowerCase();
  return base.length === 1 || ELEMENTARY_FUNCTIONS.has(base);
};

/*
 * The text in the form a parser could see it: `\left`/`\right` removed,
 * subscripts dropped (log_2, x_{1}), every other LaTeX command reduced to a
 * separator (`\frac{zeros(9,9)}{1}` still shows its call, `\sin(x)` shows
 * none), braces and spaces removed. modelExpression.mjs strips the same
 * wrappers before compiling and turns only \frac, \sqrt, \pi, \cdot and
 * \times into parser syntax (any other command is a parse error there), and
 * equivalence.mjs parses the raw text, whose calls this form also shows. A
 * reader that starts turning more commands into names must extend this.
 */
const screeningForm = (value) => value
  .replace(/\\left|\\right/g, '')
  .replace(/_\{[^{}]*\}|_[A-Za-z0-9]/g, '')
  .replace(/\\[A-Za-z]+/g, '#')
  .replace(/[{}\s]/g, '');

/** Could this text make mathjs allocate, loop or reconfigure itself? */
export const unsafeMathText = (value) => {
  if (typeof value !== 'string' || !value) return false;
  const text = screeningForm(value);
  return text.includes(':') || [...text.matchAll(CALL)].some(([, name]) => !allowedCall(name));
};

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const stringsIn = (value, out = [], depth = 0) => {
  if (typeof value === 'string') out.push(value);
  else if (value && typeof value === 'object' && depth < 8) Object.values(value).forEach((entry) => stringsIn(entry, out, depth + 1));
  return out;
};

// Stages whose response is compiled and evaluated as the student's model
// (modelExpression.mjs) whenever the workflow is marked: the equation is read
// to name the student's variables for domain and range. A table's cells and
// source model are evaluated only by a `consistentWith` rule, below.
const MODEL_STAGE_KINDS = new Set(['equationInput']);
// Stages whose response is simplified by equivalence.mjs when it parses.
const ALGEBRAIC_STAGE_KINDS = new Set(['algebraWorkspace', 'domainInput', 'rangeInput', 'intervalInput']);

/**
 * The id of the first stage whose response would hand mathjs something unsafe
 * while gradeWorkflow marks it, or null. Mirrors where workflowGrading.mjs
 * reaches the engine: every stage the student is on (`active`, from
 * questionWorkflow.mjs activeStageIds), and — whether or not they are on it —
 * any stage a `consistentWith` rule reads, and the source of every graph-
 * construction stage the student is on: rebuilding that graph
 * (workflowGraphStage.mjs) evaluates the source table's cells and the model
 * it follows, or the equation itself, and the graph grader samples it.
 */
export const unsafeExpressionStage = ({ workflow = [], grading = null, responses = {}, active = null } = {}) => {
  // Without the student's branch, every stage counts as one they are on.
  const isActive = (stageId) => !(active instanceof Set) || active.has(stageId);
  const stages = Array.isArray(workflow) ? workflow : [];
  const answers = isPlainObject(responses) ? responses : {};
  const rules = isPlainObject(grading) ? grading : {};
  const evaluated = new Set();
  Object.entries(rules).forEach(([stageId, rule]) => {
    if (isPlainObject(rule) && rule.consistentWith) {
      evaluated.add(String(stageId));
      evaluated.add(String(rule.consistentWith));
    }
  });
  stages.forEach((stage) => {
    if (isActive(stage.id) && MODEL_STAGE_KINDS.has(stage.kind)) evaluated.add(String(stage.id));
    if (isActive(stage.id) && GRAPH_CONSTRUCTION_STAGE_KINDS.includes(stage.kind) && stage.sourceStageId) {
      evaluated.add(String(stage.sourceStageId));
    }
  });

  for (const stageId of evaluated) {
    if (stringsIn(answers[stageId]).some(unsafeMathText)) return stageId;
  }
  for (const stage of stages) {
    if (!isActive(stage.id) || !ALGEBRAIC_STAGE_KINDS.has(stage.kind)) continue;
    if (stringsIn(answers[stage.id]).some((text) => algebraicExpressionInput(text) !== null && unsafeMathText(text))) {
      return String(stage.id);
    }
  }
  return null;
};
