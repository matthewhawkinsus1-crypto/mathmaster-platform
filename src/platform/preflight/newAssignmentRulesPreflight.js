/*
 * TWO PRE-FLIGHT WARNINGS FOR NEW ASSIGNMENTS (SP-5; SHOWING_THE_PROCESS.md
 * section 6, AUTHORING_LEARNING_SUPPORTS.md rules 5 and 6).
 *
 *   auditNewAssignmentRules(questions, { isNew }) → { isNew, toolFirst, showTheStep }
 *     each { warnings: [text], findings: [{ questionNumber, questionId, ... }] }
 *
 *   TOOL FIRST. A new answer-box question asks for what a tool produces:
 *     solveEquation  an equation to solve          → Step Algebra
 *     graph          a line, inequality or system  → the graphing plane
 *     divide         a polynomial to divide        → synthetic or long division
 *   SHOW THE STEP. A new answer-box question with three or more parts has
 *   neither a `checkpoint` nor a `followThrough` on any part.
 *
 * NEW ASSIGNMENTS ONLY. The caller says which, by the rule the worked-example
 * coverage panel already uses (LessonPreflightModal: a review that is not an
 * existing assignment's setup edit, `reviewMode !== 'update'`). For an existing
 * assignment nothing is looked at and nothing is returned, not even
 * information: existing assignments are not rewritten (the authoring guide's
 * Scope). `isNew` defaults to false, so every other caller of the Pre-Flight
 * model (the Question Editor, the Repair Center, a stored draft) sees nothing.
 *
 * ADVICE, NEVER READINESS. Like the coverage panel these never enter the
 * diagnostics: a warning diagnostic makes an assignment "Needs Review", which
 * students never see. They never stop the teacher creating the assignment.
 *
 * PRECISION BEFORE RECALL. A warning on a good question teaches teachers to
 * ignore Pre-Flight, so tool first reads the question's own fields, never a
 * word on its own:
 *   - it is an answer box (`type` "multiAnswer", or `multipleResponses` before
 *     compiling), not a composed workflow with a tool stage;
 *   - EITHER its Question Family is one whose own tool is Step Algebra, the
 *     plane or the division workshop (TOOL_FIRST_FAMILIES);
 *   - OR its prompt or a part's label gives the instruction itself, as an
 *     imperative that opens a sentence ("Solve …", "Graph …", "Divide … by …",
 *     "Use synthetic division to …"), on mathematics that parses as that kind:
 *       solveEquation  one equation, linear in its one variable (no powers,
 *                      roots, absolute values or words), AND a part's key is
 *                      its solution (checked by substituting it);
 *       graph          every relation named is linear in x and y (a line, a
 *                      linear inequality, or two or more of them: a system);
 *       divide         a polynomial divided by a divisor of two or more terms
 *                      (not a monomial), AND a part asks for the quotient or
 *                      the remainder, or its key is a polynomial;
 *   - and the question does not already do the step in that tool: a part's
 *     `checkpoint` of the tool's own kind (stepMoves in Step Algebra,
 *     pickPoints on the plane) is the tool.
 * A {{template}} is not read (its numbers are not known here), and neither is
 * a radical or quadratic equation: those have tools of their own, and the spec
 * names Step Algebra for an equation.
 *
 * Pure: no React, no Firestore, no mathjs. Teacher-side only: nothing a student
 * loads imports it (tests/platform/newAssignmentRulesPreflight.test.mjs).
 */
import { questionAnswerParts } from '../contract/lessonSupportsV5.js';

export const TOOL_FIRST_KINDS = Object.freeze({
  SOLVE_EQUATION: 'solveEquation',
  GRAPH: 'graph',
  DIVIDE: 'divide',
});

/*
 * Question Families whose own tool produces the answer (their registry
 * `defaultTool`, held by the test): asked in an answer box, the tool's work is
 * done in the student's head.
 */
export const TOOL_FIRST_FAMILIES = Object.freeze({
  'linear.twoStepEquation': TOOL_FIRST_KINDS.SOLVE_EQUATION,
  'linear.multiStepEquation': TOOL_FIRST_KINDS.SOLVE_EQUATION,
  'linear.graphFromSlopeIntercept': TOOL_FIRST_KINDS.GRAPH,
  'systems.graphical2x2': TOOL_FIRST_KINDS.GRAPH,
  'polynomials.longDivisionLinear': TOOL_FIRST_KINDS.DIVIDE,
  'polynomials.syntheticDivision': TOOL_FIRST_KINDS.DIVIDE,
});

// A checkpoint of the tool's own kind is the step done in that tool.
const TOOL_CHECKPOINT = Object.freeze({
  [TOOL_FIRST_KINDS.SOLVE_EQUATION]: 'stepMoves',
  [TOOL_FIRST_KINDS.GRAPH]: 'pickPoints',
});

export const SHOW_THE_STEP_MIN_PARTS = 3;

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const asArray = (value) => (Array.isArray(value) ? value : []);
const text = (value) => (typeof value === 'string' ? value.trim() : '');

/* ------------------------------------------------------------ the question */

/** An answer-box question: typed boxes, not a tool and not a composed workflow with a tool stage. */
export const isAnswerBoxQuestion = (question) => {
  if (!isObject(question)) return false;
  const type = text(question.type);
  if (type) {
    if (type !== 'multiAnswer') return false;
  } else if (!asArray(question.studentActions).includes('multipleResponses')) {
    return false;
  }
  return !(Array.isArray(question.workflow) && question.workflow.length > 1);
};

const familyIdOf = (question) => text(question?.familyInstance?.familyId)
  || text(question?.questionFamily?.id)
  || (typeof question?.questionFamily === 'string' ? text(question.questionFamily) : '')
  || text(question?.familyId);

const partsOf = (question) => questionAnswerParts(question).parts.filter(isObject);
const partLabel = (part) => text(part.label) || text(part.prompt);
const partAnswers = (part) => [part.answer, ...asArray(part.acceptedAnswers), ...asArray(part.accept)]
  .filter((value) => typeof value === 'string' || typeof value === 'number')
  .map(String);

/* -------------------------------------------------------- the mathematics */

// Superscript digits, as typed prompts write a power.
const SUPERSCRIPTS = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };

/*
 * The words a student reads, with LaTeX made plain where it is arithmetic:
 * $…$ dropped, \frac{a}{b} as (a)/(b), \cdot as *, x^{3} as x^3. Any other
 * LaTeX command (\sqrt, \left|, …) stays, and then nothing in it parses.
 */
const plainMath = (raw) => String(raw ?? '')
  .replace(/\\[,;:! ]/g, ' ')
  .replace(/\$/g, ' ')
  .replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '(($1)/($2))')
  .replace(/\^\{(\d+)\}/g, '^$1')
  .replace(/\\(?:cdot|times)/g, '*')
  .replace(/\\div/g, '÷')
  .replace(/\\(?:le|leq)(?![A-Za-z])/g, '≤')
  .replace(/\\(?:ge|geq)(?![A-Za-z])/g, '≥')
  .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (digits) => `^${[...digits].map((digit) => SUPERSCRIPTS[digit]).join('')}`)
  .replace(/−/g, '-')
  .replace(/\s+/g, ' ');

const tokenize = (source) => {
  const tokens = [];
  let index = 0;
  const value = String(source).replace(/[×·∙]/g, '*');
  while (index < value.length) {
    const char = value[index];
    if (/\s/.test(char)) { index += 1; continue; }
    const number = /^(?:\d+(?:\.\d+)?|\.\d+)/.exec(value.slice(index));
    if (number) { tokens.push({ kind: 'number', value: Number(number[0]) }); index += number[0].length; continue; }
    if (/[A-Za-z]/.test(char)) {
      // A word is not mathematics: only single-letter variables are read.
      if (/[A-Za-z]/.test(value[index + 1] || '')) return null;
      tokens.push({ kind: 'variable', value: char });
      index += 1;
      continue;
    }
    if ('+-*/^()'.includes(char)) { tokens.push({ kind: char }); index += 1; continue; }
    return null;
  }
  return tokens;
};

/*
 * An arithmetic expression as a function of its variables, or null: numbers,
 * single-letter variables, + - * / ( ), whole-number powers, and implicit
 * multiplication ("3x", "2(x + 1)").
 */
export const parseExpression = (source) => {
  const tokens = tokenize(source);
  if (!tokens || tokens.length === 0) return null;
  const variables = new Set();
  let at = 0;
  const peek = () => tokens[at];
  const take = (kind) => (peek()?.kind === kind ? tokens[at++] : null);
  let sum;
  const primary = () => {
    const token = peek();
    if (!token) return null;
    if (token.kind === 'number') { at += 1; return () => token.value; }
    if (token.kind === 'variable') { at += 1; variables.add(token.value); return (scope) => scope[token.value]; }
    if (take('(')) {
      const inner = sum();
      if (!inner || !take(')')) return null;
      return inner;
    }
    return null;
  };
  const power = () => {
    const base = primary();
    if (!base) return null;
    if (!take('^')) return base;
    const exponent = take('number');
    if (!exponent || !Number.isInteger(exponent.value) || exponent.value > 12) return null;
    return (scope) => base(scope) ** exponent.value;
  };
  const unary = () => {
    if (take('-')) { const inner = unary(); return inner && ((scope) => -inner(scope)); }
    if (take('+')) return unary();
    return power();
  };
  const product = () => {
    let left = unary();
    while (left) {
      if (take('*')) { const right = unary(); if (!right) return null; const l = left; left = (scope) => l(scope) * right(scope); continue; }
      if (take('/')) { const right = unary(); if (!right) return null; const l = left; left = (scope) => l(scope) / right(scope); continue; }
      // "3x", "2(x + 1)", "(x - 1)(x + 2)": a variable or a bracket straight after.
      if (peek()?.kind === 'variable' || peek()?.kind === '(') { const right = power(); if (!right) return null; const l = left; left = (scope) => l(scope) * right(scope); continue; }
      break;
    }
    return left;
  };
  sum = () => {
    let left = product();
    while (left) {
      if (take('+')) { const right = product(); if (!right) return null; const l = left; left = (scope) => l(scope) + right(scope); continue; }
      if (take('-')) { const right = product(); if (!right) return null; const l = left; left = (scope) => l(scope) - right(scope); continue; }
      break;
    }
    return left;
  };
  const evaluate = sum();
  if (!evaluate || at !== tokens.length) return null;
  return { evaluate, variables: [...variables].sort() };
};

const RELATION_OPERATORS = /<=|>=|≤|≥|≠|=|<|>/g;

/** One relation "lhs op rhs", or null: exactly one relation sign. */
export const parseRelation = (source) => {
  const value = plainMath(source).trim();
  const operators = value.match(RELATION_OPERATORS) || [];
  if (operators.length !== 1) return null;
  const [left, right] = value.split(RELATION_OPERATORS);
  const lhs = parseExpression(left);
  const rhs = parseExpression(right);
  if (!lhs || !rhs) return null;
  return {
    operator: operators[0],
    variables: [...new Set([...lhs.variables, ...rhs.variables])].sort(),
    difference: (scope) => lhs.evaluate(scope) - rhs.evaluate(scope),
  };
};

const close = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-9 * (1 + Math.abs(a) + Math.abs(b));

/** f = a·v + c with a ≠ 0, sampled: { slope, intercept } or null. */
const linearIn = (relation, variable) => {
  const at = (value) => relation.difference({ [variable]: value });
  const intercept = at(0);
  const slope = at(1) - intercept;
  if (!Number.isFinite(slope) || close(slope, 0)) return null;
  const linear = [2, -3, 0.5, 7].every((value) => close(at(value), intercept + slope * value));
  return linear ? { slope, intercept } : null;
};

/** f = a·x + b·y + c with (a, b) ≠ (0, 0), sampled. */
const linearInXY = (relation) => {
  const at = (x, y) => relation.difference({ x, y });
  const c = at(0, 0);
  const a = at(1, 0) - c;
  const b = at(0, 1) - c;
  if (![a, b, c].every(Number.isFinite) || (close(a, 0) && close(b, 0))) return false;
  return [[2, -1], [3, 5], [-2, 4], [0.5, 1.5]].every(([x, y]) => close(at(x, y), a * x + b * y + c));
};

/** The polynomial's degree in `variable`, sampled (finite differences), or -1 when it is not one. */
const polynomialDegree = (expression, variable) => {
  if (!expression || expression.variables.some((name) => name !== variable)) return -1;
  let values = [0, 1, 2, 3, 4, 5, 6, 7].map((value) => expression.evaluate({ [variable]: value }));
  if (!values.every(Number.isFinite)) return -1;
  for (let degree = 0; degree < 7; degree += 1) {
    if (values.every((value) => close(value, values[0]))) return degree;
    values = values.slice(1).map((value, index) => value - values[index]);
  }
  return -1;
};

// c·v^k, one term: what synthetic and long division are not for.
const isMonomial = (expression, variable, degree) => {
  const at = (value) => expression.evaluate({ [variable]: value });
  const c = at(1);
  return [2, 3, -1, 0.5].every((value) => close(at(value), c * value ** degree));
};

const NUMBER_ANSWER = /^\s*(?:([A-Za-z])\s*=\s*)?(-?\s*\d+(?:\.\d+)?|-?\s*\.\d+)(?:\s*\/\s*(\d+(?:\.\d+)?))?\s*$/;

/** A key that is a number ("5", "-3/4", "x = 2.5"): { variable, value } or null. */
const numericKey = (raw) => {
  const match = NUMBER_ANSWER.exec(plainMath(raw));
  if (!match) return null;
  const numerator = Number(match[2].replace(/\s+/g, ''));
  const value = match[3] === undefined ? numerator : numerator / Number(match[3]);
  return Number.isFinite(value) ? { variable: match[1] || null, value } : null;
};

/* ---------------------------------------------- the instruction, as written */

// An imperative that opens a sentence, a clause after a colon or dash, or a
// lettered part: "Solve …", "Then graph …", "(b) Divide …". Never a word
// inside a sentence ("Mia solved …", "the graph of …").
const OPENS = String.raw`(?:^|[.!?;:]\s+|\n\s*|[—–]\s*|\(\s*[a-z0-9]\s*\)\s*)(?:(?:then|first|now|next|finally),?\s+)?`;

const SOLVE = new RegExp(String.raw`${OPENS}solve\s+(?:(?:the|this)\s+equation\s+)?(?:for\s+([a-z])\s*(?::\s*|\s+in\s+))?`, 'gi');
const GRAPH = new RegExp(String.raw`${OPENS}(?:graph|sketch|draw\s+the\s+graph\s+of|plot\s+the\s+(?:line|graph)(?:\s+of)?)\s+(?:(?:the|this|each|both)\s+)?(?:(?:line|lines|equation|equations|inequality|inequalities|system(?:\s+of\s+(?:linear\s+)?(?:equations|inequalities))?)\s+)?`, 'gi');
const DIVIDE = new RegExp(String.raw`${OPENS}(?:use\s+(?:synthetic|long|polynomial)\s+division\s+to\s+(?:divide\s+|find\s+(?:the\s+)?(?:quotient|remainder)(?:\s+and\s+(?:the\s+)?remainder)?\s+(?:of|when)\s+)|divide\s+)`, 'gi');

// Where the mathematics an instruction names ends.
const SOLVE_ENDS = /\.(?=\s|$)|[,;:?!]|\s[—–]\s|\n|\s(?:and|then|to|by|using|so|if|when|where|for|with|on|in)\s/i;
const GRAPH_ENDS = /\.(?=\s|$)|[;:?!]|\s[—–]\s|\n|,?\s(?:then|to|by|using|so|if|when|where|on|in|with|and\s+(?:find|decide|identify|use|label|write|name|give|state|tell|explain|determine|answer|shade|mark))\b/i;
const DIVIDE_ENDS = /\.(?=\s|$)|[,;:?!]|\s[—–]\s|\n|\s(?:and|then|to|using|so|if|where|with)\s/i;

const spansAfter = (source, pattern, ends) => {
  const value = plainMath(source);
  if (/\{\{/.test(value)) return [];
  return [...value.matchAll(pattern)].map((match) => {
    const rest = value.slice(match.index + match[0].length);
    const end = rest.search(ends);
    return { span: (end === -1 ? rest : rest.slice(0, end)).trim(), named: match[1] || null, instruction: match[0] };
  }).filter(({ span }) => span);
};

// The mathematics as a teacher wrote it, near enough: \frac{1}{2} reads (1/2).
const quoteOf = (span) => {
  const shown = span.replace(/\(\(([^()]*)\)\/\(([^()]*)\)\)/g, '($1/$2)');
  return shown.length <= 70 ? shown : `${shown.slice(0, 67).trim()}…`;
};

const questionTexts = (question) => [
  text(question.prompt),
  ...partsOf(question).map(partLabel),
].filter(Boolean);

/** An equation to solve, linear in its one variable, whose solution a part's key is. */
const equationToSolve = (question) => {
  const parts = partsOf(question);
  for (const source of questionTexts(question)) {
    for (const { span, named } of spansAfter(source, SOLVE, SOLVE_ENDS)) {
      const relation = parseRelation(span);
      if (!relation || relation.operator !== '=' || relation.variables.length !== 1) continue;
      const [variable] = relation.variables;
      if (named && named.toLowerCase() !== variable.toLowerCase()) continue;
      const line = linearIn(relation, variable);
      if (!line) continue;
      const solution = -line.intercept / line.slope;
      const solved = parts.some((part) => partAnswers(part).some((raw) => {
        const key = numericKey(raw);
        return key && (!key.variable || key.variable === variable) && close(key.value, solution);
      }));
      if (solved) return { kind: TOOL_FIRST_KINDS.SOLVE_EQUATION, quote: quoteOf(span) };
    }
  }
  return null;
};

// "f(x) = 2x + 1" is the line y = 2x + 1.
const asLine = (relation) => relation.replace(/\b[a-z]\s*\(\s*x\s*\)/g, 'y');

/** A line, linear inequality or system of them to graph. */
const relationsToGraph = (question) => {
  for (const source of questionTexts(question)) {
    for (const { span } of spansAfter(source, GRAPH, GRAPH_ENDS)) {
      const pieces = span.split(/,|\band\b/).map((piece) => piece.trim()).filter(Boolean);
      const relations = pieces.filter((piece) => (piece.match(RELATION_OPERATORS) || []).length > 0);
      if (relations.length === 0) continue;
      const all = relations.every((piece) => {
        const relation = parseRelation(asLine(piece));
        return relation
          && relation.operator !== '≠'
          && relation.variables.length > 0
          && relation.variables.every((name) => name === 'x' || name === 'y')
          && linearInXY(relation);
      });
      if (all) return { kind: TOOL_FIRST_KINDS.GRAPH, quote: quoteOf(span) };
    }
  }
  return null;
};

const ASKS_QUOTIENT = /\b(?:quotient|remainder)\b/i;

/** A polynomial divided by a divisor of two or more terms, with a part that asks for the result. */
const polynomialToDivide = (question) => {
  const parts = partsOf(question);
  for (const source of questionTexts(question)) {
    for (const { span, instruction } of spansAfter(source, DIVIDE, DIVIDE_ENDS)) {
      const pair = span.split(/\s+(?:is\s+)?divided\s+by\s+|\s+by\s+|\s*÷\s*/);
      if (pair.length !== 2) continue;
      const dividend = parseExpression(plainMath(pair[0]).replace(/^\s*[A-Za-z]\s*\(\s*[a-z]\s*\)\s*=\s*/, ''));
      const divisor = parseExpression(plainMath(pair[1]));
      if (!dividend || !divisor || dividend.variables.length !== 1) continue;
      const [variable] = dividend.variables;
      const dividendDegree = polynomialDegree(dividend, variable);
      const divisorDegree = polynomialDegree(divisor, variable);
      if (dividendDegree < 2 || divisorDegree < 1 || divisorDegree > dividendDegree || isMonomial(divisor, variable, divisorDegree)) continue;
      // "Use synthetic division to find the quotient …" asks for it itself.
      const asks = ASKS_QUOTIENT.test(instruction) || parts.some((part) => ASKS_QUOTIENT.test(partLabel(part)) || partAnswers(part).some((raw) => {
        const key = parseExpression(plainMath(raw));
        return key && key.variables.length === 1 && key.variables[0] === variable && polynomialDegree(key, variable) >= 1;
      }));
      if (asks) return { kind: TOOL_FIRST_KINDS.DIVIDE, quote: quoteOf(span) };
    }
  }
  return null;
};

const doesTheStepIn = (question, kind) => {
  const checkpoint = TOOL_CHECKPOINT[kind];
  return Boolean(checkpoint) && partsOf(question).some((part) => isObject(part.checkpoint) && part.checkpoint.kind === checkpoint);
};

/**
 * What a tool would produce that this answer-box question asks for in a box,
 * or null: { kind, source: 'family' | 'prompt', familyId?, quote? }.
 */
export const toolFirstFinding = (question) => {
  if (!isAnswerBoxQuestion(question)) return null;
  const familyId = familyIdOf(question);
  const familyKind = Object.hasOwn(TOOL_FIRST_FAMILIES, familyId) ? TOOL_FIRST_FAMILIES[familyId] : null;
  const found = familyKind
    ? { kind: familyKind, source: 'family', familyId }
    : (() => {
      const asked = equationToSolve(question) || relationsToGraph(question) || polynomialToDivide(question);
      return asked ? { ...asked, source: 'prompt' } : null;
    })();
  if (!found || doesTheStepIn(question, found.kind)) return null;
  return found;
};

/** A multi-part answer box with three or more parts and no checked or follow-through part: { parts } or null. */
export const showTheStepFinding = (question) => {
  if (!isAnswerBoxQuestion(question)) return null;
  const parts = partsOf(question);
  if (parts.length < SHOW_THE_STEP_MIN_PARTS) return null;
  const supported = parts.some((part) => part.checkpoint !== undefined || part.followThrough !== undefined);
  return supported ? null : { parts: parts.length };
};

/* ------------------------------------------------------------ the words */

const TOOL_ADVICE = Object.freeze({
  [TOOL_FIRST_KINDS.SOLVE_EQUATION]: {
    asks: 'an equation to solve',
    use: 'Step Algebra ("studentActions": ["solveStepByStep"]), so students solve it one move at a time and you see their moves',
  },
  [TOOL_FIRST_KINDS.GRAPH]: {
    asks: 'something to graph',
    use: 'the graphing plane, so students draw it: "constructLine" for a line, "graphSystem" for a system of equations, "solveInequalitySystem" for inequalities',
  },
  [TOOL_FIRST_KINDS.DIVIDE]: {
    asks: 'a polynomial to divide',
    use: 'synthetic or long division ("syntheticDivision" or "longDivision"), so students do the division in the tool',
  },
});

export const toolFirstWarning = (questionNumber, finding) => {
  const advice = TOOL_ADVICE[finding.kind];
  const what = finding.quote ? `${advice.asks} (${finding.quote})` : advice.asks;
  return `Question ${questionNumber} gives students ${what} but has them answer only in boxes. In a new assignment, use ${advice.use}. Keep answer boxes for reading and explaining the result.`;
};

export const showTheStepWarning = (questionNumber, finding) => (
  `Question ${questionNumber} has ${finding.parts} answer boxes and none of them checks a step. In a new assignment, give one part a checkpoint (a step done in a tool, such as picking two points on the line) or a followThrough (a later part that uses the student's own earlier answer, so one early slip is not marked wrong twice).`
);

const empty = () => ({ warnings: [], findings: [] });

/**
 * The two warnings for a new assignment's delivered questions. An existing
 * assignment (`isNew` false, the default) gets none: nothing is looked at.
 * Questions are numbered as Pre-Flight numbers its other findings.
 */
export const auditNewAssignmentRules = (questions = [], { isNew = false, deliveredOnly = true } = {}) => {
  const result = { isNew: isNew === true, toolFirst: empty(), showTheStep: empty() };
  if (!result.isNew) return result;
  asArray(questions).forEach((question, index) => {
    if (!isObject(question)) return;
    if (deliveredOnly && question.teacherExcluded === true) return;
    const questionNumber = index + 1;
    const questionId = question.questionId ?? null;
    const tool = toolFirstFinding(question);
    if (tool) {
      result.toolFirst.findings.push({ questionNumber, questionId, ...tool });
      result.toolFirst.warnings.push(toolFirstWarning(questionNumber, tool));
    }
    const step = showTheStepFinding(question);
    if (step) {
      result.showTheStep.findings.push({ questionNumber, questionId, ...step });
      result.showTheStep.warnings.push(showTheStepWarning(questionNumber, step));
    }
  });
  return result;
};

export default auditNewAssignmentRules;
