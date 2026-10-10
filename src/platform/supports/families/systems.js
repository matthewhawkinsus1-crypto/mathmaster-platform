// Question family: systems of two linear equations: system, systemsWorkspace, and multiAnswer items from families systems.elimination / systems.substitution.
//
// Contract (./index.js):
//   matches(question)            → true when this family can help with the question
//   hints(question)              → hint sentences, least to most specific, built from
//                                  the question's OWN numbers; never the answer
//   similarProblem(question, { seed }) → { prompt, steps: [text], answer: text } | null
//                                  a worked sibling with DIFFERENT numbers whose answer is
//                                  not this question's answer
//   expectedValues(question)     → this question's answer value(s) as text, so the runtime
//                                  guard (hintRevealsAnswer) can drop a hint that leaks one
//   backUpQuestion(question)     → { prompt, options: [text, text], correct } | null
//                                  the inclusion "Let's back up" check: one quick
//                                  question about THIS problem's first move (never its
//                                  answer); null keeps the platform's generic one
// `implemented` stays false until the family is real: the index skips it.
//
// WHAT THIS FAMILY OWNS (matches):
//   system            every one (the legacy 2×2 screen; generator and family instances)
//   systemsWorkspace  the three modes that ARE two linear equations in two
//                     variables: algebraic (exactly two equations, two
//                     variables), linear (two lines y = mx + b) and matrix
//                     (a 2×3 augmented matrix). Inequalities, linear-quadratic,
//                     3×3 and spatial are not two linear equations: not ours.
//   multiAnswer       only by its family id (systems.elimination /
//                     systems.substitution / systems.algebraic2x2), or by an
//                     unmistakable signal: the prompt shows two linear
//                     equations in two variables AND the key is an ordered pair
//                     that makes both of them true.
//   `literal` systems (formula "x+y=12 and y=x-2") belong to linearEquations,
//   which owns the `literal` type and comes first.
//
// HOW IT STAYS SAFE:
//   - Hints are built from what the student can SEE (the equations, the method
//     the question names). The only thing read from the key is the guard: each
//     hint level has a specific wording that quotes this problem's numbers and
//     a plain wording with no digits; the plain one is used when the specific
//     one would contain an answer value. No hint says or narrows a value, a
//     point, or which outcome (one / none / infinitely many) is right.
//   - A question whose task includes deciding how many solutions there are
//     lists EVERY outcome phrase in expectedValues, so the guard drops a hint
//     that names any outcome, whichever is right — its silence cannot tell.
//   - The worked sibling is always a one-solution system of the same kind
//     (substitution, set-equal, elimination with the same kind of first move,
//     graph, matrix) whose every printed number avoids this question's
//     coordinates, so its steps cannot contain this answer and its answer is
//     never this one. Its outcome never depends on this question's outcome.
import { hintRevealsAnswer } from '../../../../functions/shared/pathSolutionSupport.mjs';
import { answerCandidatesForField } from '../../../../functions/shared/answerUtils.mjs';
import { latexToExpression } from '../../../../functions/shared/algebra/latexToExpression.mjs';
import { linearEquationForm } from '../../../../functions/shared/toolMath/systemsWorkspace/algebraicSystemsEngine.mjs';
import { SYSTEMS_WORKSPACE_DEFAULTS, matrix3x4Rows } from '../../../../functions/shared/toolMath/systemsWorkspace/systemsMath.mjs';
import { resolveSystemsWorkspaceMode } from '../../../../functions/shared/toolMath/systemsWorkspace/systemsWorkspaceMode.mjs';

export const family = 'systems';
export const implemented = true;

export const SYSTEM_FAMILY_IDS = Object.freeze(['systems.elimination', 'systems.substitution', 'systems.algebraic2x2']);

// Every phrase that names an outcome of "how many solutions?".
export const OUTCOME_PHRASES = Object.freeze(['one solution', 'no solution', 'infinitely many', 'infinite solutions', 'infinite number']);

const EPS = 1e-9;
const text = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]);
const unique = (values) => [...new Set(values.filter(Boolean))];
const tidy = (value) => {
  const rounded = Math.round(Number(value) * 1e9) / 1e9;
  return Object.is(rounded, -0) || Math.abs(rounded) < EPS ? 0 : rounded;
};
const isInt = (value) => Number.isInteger(tidy(value));
const gcd = (a, b) => {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x;
};
const lcm = (a, b) => (a && b ? Math.abs(a * b) / gcd(a, b) : 0);

/** { n, d } for a value that is a fraction with a denominator up to 1000, else null. */
const rationalize = (value) => {
  const v = tidy(value);
  if (!Number.isFinite(v)) return null;
  for (let d = 1; d <= 1000; d += 1) {
    const n = Math.round(v * d);
    if (Math.abs(n / d - v) < 1e-9) return { n, d };
  }
  return null;
};

const parseNumber = (raw) => {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const value = text(raw).replace(/[−–]/g, '-').replace(/\s+/g, '').replace(/^\$|\$$/g, '');
  if (!value) return null;
  const frac = value.match(/^(-?)\\frac\{(-?\d+(?:\.\d+)?)\}\{(-?\d+(?:\.\d+)?)\}$/);
  if (frac) return Number(frac[3]) ? (frac[1] ? -1 : 1) * Number(frac[2]) / Number(frac[3]) : null;
  if (/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(value)) return Number(value);
  const slash = value.match(/^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/);
  return slash && Number(slash[2]) ? Number(slash[1]) / Number(slash[2]) : null;
};

/** "(3, -2)", "( 1/2 , 3 )" → [x, y]; anything else → null. */
const parsePair = (raw) => {
  if (typeof raw !== 'string') return null;
  const match = text(raw).replace(/^\$|\$$/g, '').match(/^\(\s*([^,()]+?)\s*,\s*([^,()]+?)\s*\)$/);
  if (!match) return null;
  const x = parseNumber(match[1]);
  const y = parseNumber(match[2]);
  return x === null || y === null ? null : [x, y];
};

/* ------------------------------------------------------------- formatting */

/*
 * One formatter per piece of text. `latex` writes fractions as \frac (the
 * hint panel renders $…$); plain writes 1/2 (the back-up step's buttons are
 * plain text). `printed` records the magnitude of every number written with
 * digits, so a worked sibling can be checked against this question's
 * coordinates before its text is.
 */
const formatter = ({ latex = true } = {}) => {
  const printed = [];
  const num = (value) => {
    const v = tidy(value);
    printed.push(Math.abs(v));
    const r = rationalize(v);
    if (!r) return String(Math.round(v * 1e4) / 1e4);
    if (r.d === 1) return String(r.n);
    const sign = r.n < 0 ? '-' : '';
    return latex ? `${sign}\\frac{${Math.abs(r.n)}}{${r.d}}` : `${r.n}/${r.d}`;
  };
  const coef = (magnitude) => {
    const written = num(magnitude);
    return !latex && written.includes('/') ? `(${written})` : written;
  };
  // terms: [[coefficient, symbol | null]] — null is the constant. Zero terms are left out.
  const linear = (terms) => {
    let out = '';
    terms.forEach(([coefficient, symbol]) => {
      const c = tidy(coefficient);
      if (!c) return;
      const magnitude = Math.abs(c);
      const body = symbol ? (magnitude === 1 ? symbol : `${coef(magnitude)}${symbol}`) : num(magnitude);
      if (!out) out = c < 0 ? `-${body}` : body;
      else out += c < 0 ? ` - ${body}` : ` + ${body}`;
    });
    return out || num(0);
  };
  const term = (coefficient, symbol) => linear([[coefficient, symbol]]);
  const paren = (value) => `(${num(value)})`;
  // c·(value) as a student writes it: 3(-2), -(4), (5).
  const times = (coefficient, value) => {
    const c = tidy(coefficient);
    // A zero keeps its parentheses: "x - (0)" and "-(0) + 4(-6)", never "-0".
    if (c === 1) return tidy(value) <= 0 ? paren(value) : num(value);
    if (c === -1) return `-${paren(value)}`;
    return `${num(c)}${paren(value)}`;
  };
  // a(p) + b(q) with each product shown.
  const products = (pairs) => {
    let out = '';
    pairs.forEach(([coefficient, value]) => {
      const c = tidy(coefficient);
      if (!c) return;
      const body = times(Math.abs(c), value);
      if (!out) out = c < 0 ? `-${body}` : body;
      else out += c < 0 ? ` - ${body}` : ` + ${body}`;
    });
    return out || num(0);
  };
  const std = ({ a, b, c }, [X, Y]) => `${linear([[a, X], [b, Y]])} = ${num(c)}`;
  return { latex, printed, num, coef, linear, term, paren, times, products, std };
};

/* ------------------------------------------------------------ reading */

const typeOf = (question) => text(question?.type || question?.toolId);
const familyIdOf = (question) => text(
  question?.familyInstance?.familyId || question?.familyId || question?.questionFamily?.id || question?.familyDelivery?.familyId,
);

const cleanMath = (raw) => text(raw)
  .replace(/\$/g, '')
  .replace(/[−–]/g, '-')
  .replace(/\\left|\\right/g, '')
  .replace(/\\[,;!]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const mentions = (side, variable) => new RegExp(`(^|[^A-Za-z\\\\])${variable}([^A-Za-z]|$)`).test(side);

/** One linear equation in exactly the two variables, or null. */
const parseEquation = (raw, variables) => {
  const display = cleanMath(raw);
  if (!display || (display.match(/=/g) || []).length !== 1 || /[<>≤≥]|\\[lg]e/.test(display)) return null;
  let plain = display;
  try { plain = latexToExpression(display); } catch { /* the display is already plain */ }
  const form = linearEquationForm(plain, variables);
  if (!form) return null;
  const a = tidy(form.coefficients[variables[0]]);
  const b = tidy(form.coefficients[variables[1]]);
  const c = tidy(form.constant);
  if (!a && !b) return null;
  const [left, right] = display.split('=').map((side) => side.trim());
  let isolated = null;
  variables.forEach((variable) => {
    if (isolated) return;
    if (left === variable && !mentions(right, variable)) isolated = { variable, expression: right };
    else if (right === variable && !mentions(left, variable)) isolated = { variable, expression: left };
  });
  return { display, a, b, c, isolated };
};

/** The math segments of a prompt that hold equations: "$a$ and $b$", "$\begin{cases}…\end{cases}$". */
const equationsInPrompt = (prompt) => {
  const segments = [...text(prompt).matchAll(/\$\$?([^$]+)\$\$?/g)].map((match) => match[1]);
  return segments.flatMap((segment) => segment
    .replace(/\\begin\{(?:cases|aligned|array)\}(?:\{[^}]*\})?|\\end\{(?:cases|aligned|array)\}/g, '')
    .split(/\\\\|;|,(?![^{]*\})|\\text\{\s*and\s*\}|\\quad|\\qquad/)
    .map((piece) => piece.replace(/&/g, '').trim())
    .filter((piece) => piece.includes('=')));
};

const variablesOf = (question) => (Array.isArray(question?.variables) && question.variables.length === 2
  && question.variables.every((value) => /^[A-Za-z]$/.test(text(value)))
  ? question.variables.map(text)
  : ['x', 'y']);

// The authored equation lists must be exactly two linear equations; a prompt
// may hold other math too, so from a prompt the two that parse are kept.
const twoEquations = (sources, variables, prompt = '') => {
  for (const source of sources) {
    const raws = list(source).filter((value) => typeof value === 'string');
    if (raws.length !== 2) continue;
    const parsed = raws.map((raw) => parseEquation(raw, variables));
    if (parsed.every(Boolean)) return parsed;
  }
  const fromPrompt = equationsInPrompt(prompt).map((raw) => parseEquation(raw, variables)).filter(Boolean);
  return fromPrompt.length === 2 ? fromPrompt : null;
};

const workspaceMode = (question) => {
  try { return resolveSystemsWorkspaceMode(question); } catch { return ''; }
};

const lineEquation = (m, k, f) => `y = ${f.linear([[m, 'x'], [k, null]])}`;

const lineAsEquation = (m, k) => {
  const f = formatter();
  return {
    display: lineEquation(m, k, f),
    a: tidy(-m),
    b: 1,
    c: tidy(k),
    isolated: { variable: 'y', expression: f.linear([[m, 'x'], [k, null]]) },
    line: { m: tidy(m), b: tidy(k) },
  };
};

/*
 * The system a question shows, in one shape:
 *   { kind: 'graph' | 'matrix' | 'equations' | 'unparsed', variables, equations: [eq, eq] }
 * or null when the question is not a two-equation linear system at all.
 */
const readSystem = (question) => {
  if (!question || typeof question !== 'object') return null;
  const type = typeOf(question);
  if (type === 'systemsWorkspace') {
    const mode = workspaceMode(question);
    if (mode === 'linear') {
      // What the workspace shows (and grades) when nothing is authored.
      const source = question.system || SYSTEMS_WORKSPACE_DEFAULTS.system;
      const values = ['m1', 'b1', 'm2', 'b2'].map((key) => Number(source?.[key]));
      if (!values.every(Number.isFinite)) return null;
      return { kind: 'graph', variables: ['x', 'y'], equations: [lineAsEquation(values[0], values[1]), lineAsEquation(values[2], values[3])] };
    }
    if (mode === 'matrix') {
      const source = question.matrix || SYSTEMS_WORKSPACE_DEFAULTS.matrix;
      if (matrix3x4Rows(source)) return null;
      // Read exactly as the workspace's solve2x2System reads it.
      const [a11, a12, b1, a21, a22, b2] = [
        source.a11 ?? 1, source.a12 ?? 0, source.b1 ?? 0, source.a21 ?? 0, source.a22 ?? 1, source.b2 ?? 0,
      ].map(Number);
      if (![a11, a12, b1, a21, a22, b2].every(Number.isFinite)) return null;
      const f = formatter();
      const rows = [{ a: tidy(a11), b: tidy(a12), c: tidy(b1) }, { a: tidy(a21), b: tidy(a22), c: tidy(b2) }];
      if (rows.some((row) => !row.a && !row.b)) return null;
      return { kind: 'matrix', variables: ['x', 'y'], equations: rows.map((row) => ({ ...row, display: f.std(row, ['x', 'y']), isolated: null })) };
    }
    if (mode === 'algebraic') {
      if (!Array.isArray(question.equations) || question.equations.length !== 2) return null;
      if (Array.isArray(question.variables) && question.variables.length !== 2) return null;
      const variables = variablesOf(question);
      const equations = twoEquations([question.equations], variables);
      return equations ? { kind: 'equations', variables, equations } : null;
    }
    return null;
  }
  if (type === 'system') {
    const variables = variablesOf(question);
    const equations = twoEquations([question.equationsLatex, question.equations], variables, question.prompt);
    return { kind: equations ? 'equations' : 'unparsed', variables, equations };
  }
  if (type === 'multiAnswer') {
    const variables = variablesOf(question);
    const equations = twoEquations([question.equationsLatex, question.equations], variables, question.prompt);
    return { kind: equations ? 'equations' : 'unparsed', variables, equations };
  }
  return null;
};

/* --------------------------------------------------------------- the key */

const solveEquations = (equations) => {
  const [e1, e2] = equations;
  const det = e1.a * e2.b - e1.b * e2.a;
  if (Math.abs(det) > EPS) {
    return { outcome: 'point', x: tidy((e1.c * e2.b - e1.b * e2.c) / det), y: tidy((e1.a * e2.c - e1.c * e2.a) / det) };
  }
  const consistent = Math.abs(e1.a * e2.c - e1.c * e2.a) <= EPS && Math.abs(e1.b * e2.c - e1.c * e2.b) <= EPS;
  return { outcome: consistent ? 'infinite' : 'none' };
};

const pointFromValue = (value) => {
  if (Array.isArray(value) && value.length === 2) {
    const [x, y] = value.map(parseNumber);
    return x === null || y === null ? null : { outcome: 'point', x, y };
  }
  if (value && typeof value === 'object' && 'x' in value && 'y' in value) {
    const x = parseNumber(value.x);
    const y = parseNumber(value.y);
    return x === null || y === null ? null : { outcome: 'point', x, y };
  }
  const pair = parsePair(typeof value === 'number' ? '' : value);
  return pair ? { outcome: 'point', x: pair[0], y: pair[1] } : null;
};

/** The question's own key: { outcome: 'point', x, y } | { outcome: 'none' | 'infinite' } | null. */
const keyOf = (question, variables = ['x', 'y']) => {
  const solutionKey = question?.solutionKey;
  if (solutionKey && typeof solutionKey === 'object') {
    const outcome = text(solutionKey.outcome);
    if (outcome === 'noSolution' || outcome === 'none') return { outcome: 'none' };
    if (outcome === 'infinite') return { outcome: 'infinite' };
    if (outcome === 'point') {
      const x = parseNumber(solutionKey.x);
      const y = parseNumber(solutionKey.y);
      if (x !== null && y !== null) return { outcome: 'point', x, y };
    }
  }
  for (const value of [question?.solution, question?.answer]) {
    const point = pointFromValue(value);
    if (point) return point;
  }
  const fields = list(question?.answerFields);
  for (const field of fields) {
    for (const candidate of answerCandidatesForField(field)) {
      const point = pointFromValue(candidate);
      if (point) return point;
    }
  }
  const named = (variable) => fields.find((field) => [field?.id, field?.label].some((value) => cleanMath(value).replace(/\s*=\s*$/, '') === variable));
  const [fx, fy] = variables.map(named);
  if (fx && fy) {
    const x = parseNumber(answerCandidatesForField(fx)[0]);
    const y = parseNumber(answerCandidatesForField(fy)[0]);
    if (x !== null && y !== null) return { outcome: 'point', x, y };
  }
  return null;
};

/**
 * hintRevealsAnswer, also on the spelling with every "- 2" closed up to "-2".
 * An equation writes a term's sign with a space ("-5x - 2y = 8"), which the
 * platform guard does not read as −2: a coordinate of 2 already turned
 * "2y" into the plain wording while a coordinate of −2 kept "- 2y".
 */
const revealsAnswer = (value, guard) => hintRevealsAnswer(value, guard)
  || hintRevealsAnswer(String(value ?? '').replace(/[-−]\s+(?=[\d.]|\\frac)/g, '-'), guard);

const satisfies = (equation, point) => Math.abs(equation.a * point.x + equation.b * point.y - equation.c) <= 1e-6 * Math.max(1, Math.abs(equation.c));

/** True when what the student SEES asks how many solutions there are. Never reads the key. */
const asksHowMany = (question) => typeOf(question) === 'systemsWorkspace'
  || /no solution|infinitely many|how many solutions|number of solutions/i.test(text(question?.prompt));

/** The guard's reading: the visible task classifies, or the answer itself is an outcome. */
const classifies = (question, system, key) => asksHowMany(question)
  || Boolean(system?.equations && solveEquations(system.equations).outcome !== 'point')
  || Boolean(key && key.outcome !== 'point');

/* ------------------------------------------------------------- matches */

export const matches = (question) => {
  const type = typeOf(question);
  if (type === 'system') return true;
  if (type === 'systemsWorkspace') return Boolean(readSystem(question));
  if (type !== 'multiAnswer') return false;
  if (SYSTEM_FAMILY_IDS.includes(familyIdOf(question))) return true;
  // The unmistakable signal: two linear equations on screen, and the key is
  // an ordered pair that makes both true.
  const system = readSystem(question);
  if (system?.kind !== 'equations') return false;
  const key = keyOf(question, system.variables);
  return key?.outcome === 'point' && system.equations.every((equation) => satisfies(equation, key));
};

/* ------------------------------------------------------- expectedValues */

// One value written each way a student or an author might: exact (7/3),
// LaTeX (\frac{7}{3}), and to 4, 2 and 1 decimal places. Same length for
// every value, so a pair can be written with both coordinates in one style.
const valueStyles = (value) => {
  const v = tidy(value);
  const r = rationalize(v);
  if (r && r.d === 1) return Array(5).fill(String(r.n));
  const decimals = [1e4, 100, 10].map((scale) => String(Math.round(v * scale) / scale));
  if (!r) return [decimals[0], decimals[0], ...decimals];
  return [`${r.n}/${r.d}`, `${r.n < 0 ? '-' : ''}\\frac{${Math.abs(r.n)}}{${r.d}}`, ...decimals];
};
const withUnicodeMinus = (forms) => [...forms, ...forms.filter((form) => form.includes('-')).map((form) => form.replace(/-/g, '−'))];

const pointForms = (point, [X, Y]) => {
  const xs = valueStyles(point.x);
  const ys = valueStyles(point.y);
  const forms = [...xs, ...ys];
  if (!Number.isInteger(tidy(point.x)) && rationalize(point.x)) forms.push(`\\frac{${rationalize(point.x).n}}{${rationalize(point.x).d}}`);
  if (!Number.isInteger(tidy(point.y)) && rationalize(point.y)) forms.push(`\\frac{${rationalize(point.y).n}}{${rationalize(point.y).d}}`);
  xs.forEach((x, index) => forms.push(`(${x}, ${ys[index]})`, `(${x},${ys[index]})`));
  forms.push(`(${xs[0]}, ${ys[3]})`, `(${xs[3]}, ${ys[0]})`);
  xs.forEach((x) => forms.push(`${X} = ${x}`, `${X}=${x}`));
  ys.forEach((y) => forms.push(`${Y} = ${y}`, `${Y}=${y}`));
  return withUnicodeMinus(unique(forms));
};

export const expectedValues = (question) => {
  try {
    const system = readSystem(question);
    const variables = system?.variables || ['x', 'y'];
    const key = keyOf(question, variables);
    const computed = system?.equations ? solveEquations(system.equations) : null;
    const values = [];
    [key, computed].forEach((answer) => {
      if (answer?.outcome === 'point') values.push(...pointForms(answer, variables));
    });
    if (classifies(question, system, key)) values.push(...OUTCOME_PHRASES);
    list(question?.answerFields).forEach((field) => answerCandidatesForField(field).forEach((value) => {
      if (typeof value === 'string' || typeof value === 'number') values.push(text(value));
    }));
    return unique(values.map(text));
  } catch {
    return [];
  }
};

/* ---------------------------------------------------------------- plans */

const preferredMethod = (question) => {
  const method = text(question?.method).toLowerCase();
  const familyId = familyIdOf(question);
  const prompt = text(question?.prompt).toLowerCase();
  if (method === 'substitution' || familyId === 'systems.substitution') return 'substitution';
  if (method === 'elimination' || familyId === 'systems.elimination') return 'elimination';
  const sub = /substitut/.test(prompt);
  const elim = /eliminat/.test(prompt);
  if (sub && !elim) return 'substitution';
  if (elim && !sub) return 'elimination';
  return null;
};

/*
 * Elimination's first move for the variable that is cheapest to cancel:
 *   { v, w, index, u1, u2, k1, k2, op: 'add' | 'subtract' }
 * k1/k2 are the positive multipliers that make the v-terms equal in size;
 * op is how the scaled equations are then combined. null when a coefficient is
 * zero or not a whole number (no clean multiplier to name).
 */
const eliminationMove = (equations, variables, only = null) => {
  const [e1, e2] = equations;
  const candidates = [
    { v: variables[0], w: variables[1], index: 0, u1: e1.a, u2: e2.a, w1: e1.b, w2: e2.b },
    { v: variables[1], w: variables[0], index: 1, u1: e1.b, u2: e2.b, w1: e1.a, w2: e2.a },
  ].filter((candidate) => (only === null || candidate.index === only)
    && candidate.u1 && candidate.u2 && isInt(candidate.u1) && isInt(candidate.u2));
  if (!candidates.length) return null;
  const scored = candidates.map((candidate) => {
    const L = lcm(candidate.u1, candidate.u2);
    const k1 = L / Math.abs(candidate.u1);
    const k2 = L / Math.abs(candidate.u2);
    const op = Math.sign(candidate.u1) === Math.sign(candidate.u2) ? 'subtract' : 'add';
    const rank = (k1 === 1 && k2 === 1 ? 0 : 10 + L) + (op === 'add' ? 0 : 1);
    return { ...candidate, k1, k2, op, rank };
  });
  scored.sort((p, q) => p.rank - q.rank || p.index - q.index);
  return scored[0];
};

const moveShape = (move) => `${move.k1 === 1 ? 1 : 'k'}|${move.k2 === 1 ? 1 : 'k'}|${move.op}`;

const planFor = (question, system) => {
  if (!system || system.kind === 'unparsed') return { method: 'generic' };
  const { equations, variables } = system;
  if (system.kind === 'graph') return { method: 'graph' };
  if (system.kind === 'matrix') return { method: 'matrix', move: eliminationMove(equations, variables, 0) };
  const preferred = preferredMethod(question);
  const isolated = equations.map((equation, index) => ({ equation, index })).filter((entry) => entry.equation.isolated);
  if (preferred !== 'elimination' && isolated.length === 2 && isolated[0].equation.isolated.variable === isolated[1].equation.isolated.variable) {
    return { method: 'setEqual', v: isolated[0].equation.isolated.variable };
  }
  if (preferred !== 'elimination' && isolated.length >= 1) {
    const { equation, index } = isolated[0];
    const other = equations[1 - index];
    const v = equation.isolated.variable;
    const w = variables.find((name) => name !== v);
    const vIndex = variables.indexOf(v);
    const otherV = vIndex === 0 ? other.a : other.b;
    const isoW = vIndex === 0 ? equation.b : equation.a;
    return { method: 'substitution', iso: equation, other, v, w, otherMentionsV: Boolean(otherV), isoHasW: Boolean(isoW) };
  }
  if (preferred === 'substitution') {
    for (const [index, equation] of equations.entries()) {
      for (const [vIndex, v] of variables.entries()) {
        const coefficient = vIndex === 0 ? equation.a : equation.b;
        const otherCoefficient = vIndex === 0 ? equation.b : equation.a;
        if (Math.abs(coefficient) === 1 && otherCoefficient) {
          return { method: 'isolateFirst', equation, other: equations[1 - index], v, w: variables[1 - vIndex], vIndex, sign: Math.sign(coefficient) };
        }
      }
    }
    // No variable stands alone or has coefficient 1: isolate the one with the
    // smallest coefficient (a fraction appears, and is cleared after substituting).
    let best = null;
    equations.forEach((equation, index) => variables.forEach((v, vIndex) => {
      const coefficient = Math.abs(vIndex === 0 ? equation.a : equation.b);
      if (coefficient && (vIndex === 0 ? equation.b : equation.a) && (!best || coefficient < best.coefficient)) {
        best = { method: 'isolateAny', equation, other: equations[1 - index], v, w: variables[1 - vIndex], vIndex, coefficient };
      }
    }));
    return best || { method: 'generic' };
  }
  // move is null when no whole-number multiplier can be named (fractional
  // coefficients): the ladder then says what to look for instead.
  return { method: 'elimination', move: eliminationMove(equations, variables) };
};

/* ---------------------------------------------------------------- hints */

const math = (value) => `$${value}$`;
const isStandard = (equation, variables) => {
  const squash = (value) => text(value).replace(/\s+/g, '');
  return [formatter({ latex: true }), formatter({ latex: false })].some((f) => squash(f.std(equation, variables)) === squash(equation.display));
};

// No lookbehind: older Safari (school iPads) cannot compile one.
const substituteText = (display, variable, expression) => {
  const replacement = /^\d+(?:\.\d+)?$/.test(text(expression)) ? text(expression) : `(${text(expression)})`;
  return display.replace(new RegExp(`(^|[^A-Za-z\\\\])${variable}(?![A-Za-z])`, 'g'), (match, before) => `${before}${replacement}`);
};

const GENERIC_LADDER = Object.freeze([
  'A solution of a system has to make both equations true at the same time.',
  'Pick a method: substitute when one variable is already by itself, or add or subtract the equations so one variable cancels.',
  'Check your pair in both equations before you submit it.',
]);

const ladderFor = (question, system, plan) => {
  const f = formatter({ latex: true });
  // Said to every question whose visible task asks how many solutions there
  // are — never chosen by the outcome, so it cannot point to one.
  const special = system && system.kind !== 'graph' && asksHowMany(question)
    ? ' If both variables cancel, decide whether the statement that is left is true or false: that tells you how many solutions the system has.'
    : '';
  if (plan.method === 'generic') return GENERIC_LADDER.map((sentence) => [sentence]);
  const [e1, e2] = system.equations;
  const [X, Y] = system.variables;
  const check = [
    `Check your pair in both ${math(e1.display)} and ${math(e2.display)}: it has to make each one true.`,
    'Check your pair in both equations: it has to make each one true.',
  ];
  // Each level lists its wordings from most to least specific; hints() keeps
  // the first one that names no answer value.

  if (plan.method === 'graph') {
    const [l1, l2] = system.equations.map((equation) => equation.line);
    return [
      [
        `Graph ${math(e1.display)}: plot its y-intercept, ${math(f.num(l1.b))}, on the y-axis, then use the slope ${math(f.num(l1.m))} to find another point.`,
        `Graph ${math(e1.display)}: plot its y-intercept on the y-axis, then use its slope to find another point.`,
        'Graph the first line: plot its y-intercept on the y-axis, then use its slope to find another point.',
      ],
      [
        `Graph ${math(e2.display)} the same way: start at its y-intercept, ${math(f.num(l2.b))}, and use the slope ${math(f.num(l2.m))}.`,
        `Graph ${math(e2.display)} the same way, from its y-intercept with its slope.`,
        'Graph the second line the same way, from its y-intercept with its slope.',
      ],
      [
        `Compare the slopes, ${math(f.num(l1.m))} and ${math(f.num(l2.m))}, and the y-intercepts: decide whether the lines cross at a single point, never meet, or lie on top of each other.`,
        'Compare the two slopes and the two y-intercepts: decide whether the lines cross at a single point, never meet, or lie on top of each other.',
      ],
      [
        `A solution has to make both ${math(e1.display)} and ${math(e2.display)} true: check any point you read from the graph in both equations.`,
        'A solution has to make both equations true: check any point you read from the graph in both of them.',
      ],
    ];
  }

  if (plan.method === 'setEqual') {
    const { v } = plan;
    const w = system.variables.find((name) => name !== v);
    const [E1, E2] = [e1.isolated.expression, e2.isolated.expression];
    return [
      [
        `Both ${math(e1.display)} and ${math(e2.display)} tell you what ${math(v)} equals.`,
        `Both equations tell you what ${math(v)} equals.`,
      ],
      [
        `Since both right sides equal ${math(v)}, set them equal to each other: ${math(`${E1} = ${E2}`)}. That equation has only ${math(w)} in it.`,
        `Since both expressions equal ${math(v)}, set them equal to each other. That equation has only ${math(w)} in it.`,
      ],
      [
        `Solve ${math(`${E1} = ${E2}`)} for ${math(w)}: get the ${math(w)}-terms on one side and the constants on the other. Then substitute into either equation to find ${math(v)}.${special}`,
        `Solve that equation for ${math(w)}: get the ${math(w)}-terms on one side and the constants on the other. Then substitute into either equation to find ${math(v)}.${special}`,
      ],
      check,
    ];
  }

  if (plan.method === 'substitution') {
    const { iso, other, v, w } = plan;
    const substituted = plan.otherMentionsV ? substituteText(other.display, v, iso.isolated.expression) : null;
    return [
      [
        `Start with ${math(iso.display)}: it already tells you what ${math(v)} equals, so substitution is a good first move.`,
        `One equation already tells you what ${math(v)} equals, so substitution is a good first move.`,
      ],
      substituted ? [
        `Replace ${math(v)} in ${math(other.display)} with ${math(iso.isolated.expression)}, in parentheses: ${math(substituted)}. Now only ${math(w)} is left.`,
        `Replace ${math(v)} in ${math(other.display)} with the expression it equals, in parentheses, so only ${math(w)} is left.`,
        `Replace ${math(v)} in the other equation with ${math(`(${iso.isolated.expression})`)}, so only ${math(w)} is left.`,
        `Replace ${math(v)} in the other equation with the expression it equals, in parentheses, so only ${math(w)} is left.`,
      ] : [
        `${math(other.display)} has only ${math(w)} in it: solve it first, then use ${math(iso.display)} to find ${math(v)}.`,
        `The other equation has only ${math(w)} in it: solve it first, then use the equation for ${math(v)}.`,
      ],
      [
        `Solve the new equation for ${math(w)}: distribute, combine like terms, then undo the constant and the coefficient. Put that value back into ${math(iso.display)} to find ${math(v)}.${special}`,
        `Solve the new equation for ${math(w)}: distribute, combine like terms, then undo the constant and the coefficient. Put that value back in to find ${math(v)}.${special}`,
      ],
      check,
    ];
  }

  if (plan.method === 'isolateFirst') {
    const { equation, other, v, w } = plan;
    return [
      [
        `In ${math(equation.display)} the ${math(v)}-term has no coefficient to divide by, so solve that equation for ${math(v)} first.`,
        `One equation has a ${math(v)}-term with no coefficient to divide by: solve that equation for ${math(v)} first.`,
      ],
      [
        `Then replace ${math(v)} in ${math(other.display)} with that expression, in parentheses, so only ${math(w)} is left.`,
        `Then replace ${math(v)} in the other equation with that expression, in parentheses, so only ${math(w)} is left.`,
      ],
      [
        `Solve for ${math(w)}, then put that value into your expression for ${math(v)}.${special}`,
        `Solve for the remaining variable, then put that value into your expression for the first one.${special}`,
      ],
      check,
    ];
  }

  if (plan.method === 'isolateAny') {
    const { equation, other, v, w } = plan;
    return [
      [
        `Substitution starts by solving one equation for one variable. In ${math(equation.display)} the ${math(v)}-term has the smallest coefficient: solve that equation for ${math(v)} (a fraction is fine).`,
        `Substitution starts by solving one equation for one variable: pick the variable with the smallest coefficient (a fraction is fine).`,
      ],
      [
        `Replace ${math(v)} in ${math(other.display)} with that expression, in parentheses, then multiply every term by the denominator to clear the fraction.`,
        `Replace ${math(v)} in the other equation with that expression, in parentheses, then multiply every term by the denominator to clear the fraction.`,
      ],
      [
        `Solve for ${math(w)}, then put that value into your expression for ${math(v)}.${special}`,
      ],
      check,
    ];
  }

  // elimination and matrix: the same first move, said about equations or rows.
  const { move } = plan;
  const rows = plan.method === 'matrix';
  const thing = rows ? 'row' : 'equation';
  const stdTexts = system.equations.map((equation) => f.std(equation, system.variables));
  const first = rows ? [
    `Each row is an equation: the first row says ${math(stdTexts[0])} and the second row says ${math(stdTexts[1])}.`,
    'Each row of the augmented matrix is one equation: the x-coefficient, the y-coefficient, then the constant.',
  ] : system.equations.every((equation) => isStandard(equation, system.variables)) ? [
    `Line up ${math(e1.display)} and ${math(e2.display)} so the ${math(X)}-terms, the ${math(Y)}-terms and the constants sit in columns.`,
    `Line up the two equations so the ${math(X)}-terms, the ${math(Y)}-terms and the constants sit in columns.`,
  ] : [
    `Write both equations with the variables on the left, in the same order: ${math(stdTexts[0])} and ${math(stdTexts[1])}.`,
    `Write both equations with the variables on the left, in the same order, so like terms sit in columns.`,
  ];
  let second;
  if (!move) {
    second = [
      rows
        ? 'Swap or scale the rows so the first row starts with a nonzero x-entry, then use it to clear the x-entry below it.'
        : `Multiply one or both ${thing}s so the terms of one variable become opposites; adding the ${thing}s then cancels that variable.`,
    ];
  } else {
    const { v, u1, u2, k1, k2, op } = move;
    const scaled = [f.term(u1 * k1, v), f.term(u2 * k2, v)];
    const combine = op === 'add' ? `add the ${thing}s` : `subtract the second ${thing} from the first`;
    let specific;
    let named;
    if (k1 === 1 && k2 === 1) {
      specific = op === 'add'
        ? `The ${math(v)}-terms, ${math(f.term(u1, v))} and ${math(f.term(u2, v))}, are opposites, so adding the ${thing}s eliminates ${math(v)}.`
        : `The ${math(v)}-terms are both ${math(f.term(u1, v))}, so subtracting one ${thing} from the other eliminates ${math(v)}.`;
      named = op === 'add'
        ? `The ${math(v)}-terms are opposites, so adding the ${thing}s eliminates ${math(v)}.`
        : `The ${math(v)}-terms are equal, so subtracting one ${thing} from the other eliminates ${math(v)}.`;
    } else {
      const multiply = [k1 !== 1 ? `the first ${thing} by ${math(f.num(k1))}` : null, k2 !== 1 ? `the second ${thing} by ${math(f.num(k2))}` : null]
        .filter(Boolean).join(' and ');
      const which = k1 !== 1 && k2 !== 1 ? `both ${thing}s` : `the ${k1 !== 1 ? 'first' : 'second'} ${thing}`;
      specific = `Multiply ${multiply} so the ${math(v)}-terms become ${math(scaled[0])} and ${math(scaled[1])}; then ${combine} to eliminate ${math(v)}.`;
      named = `Multiply ${which} so the ${math(v)}-terms match in size; then ${combine} to eliminate ${math(v)}.`;
    }
    second = [
      specific,
      named,
      `Find a variable whose terms are opposites (add the ${thing}s) or equal (subtract them); if there is none, multiply one or both ${thing}s first so a pair matches.`,
    ];
  }
  const w = move?.w || Y;
  const v = move?.v || X;
  const third = rows ? [
    `Once a row has only ${math(w)}, solve it, then back-substitute into the first row's equation to find ${math(v)}.${special.replace('both variables cancel', 'a whole row of coefficients becomes zero')}`,
  ] : [
    `Once ${math(v)} cancels, solve the equation that is left for ${math(w)}, then substitute that value into ${math(e1.display)} to find ${math(v)}.${special}`,
    `Once ${math(v)} cancels, solve the equation that is left for ${math(w)}, then substitute that value into either original equation to find ${math(v)}.${special}`,
    `Once one variable cancels, solve the equation that is left, then substitute that value into either original equation to find the other variable.${special}`,
  ];
  return [first, second, third, check];
};

export const hints = (question) => {
  try {
    if (!matches(question)) return [];
    const system = readSystem(question);
    const plan = planFor(question, system);
    const guard = expectedValues(question);
    return ladderFor(question, system, plan)
      .map((candidates) => candidates.find((candidate) => candidate && !revealsAnswer(candidate, guard)) || null)
      .filter(Boolean)
      .slice(0, 4);
  } catch {
    return [];
  }
};

/* ------------------------------------------------------ similar problem */

const hashText = (value) => {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const randomFrom = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const integer = (random, low, high) => low + Math.floor(random() * (high - low + 1));
const nonZero = (random, low, high) => {
  for (;;) {
    const value = integer(random, low, high);
    if (value) return value;
  }
};

/*
 * THE WORKERS. Each builds one sibling from free numbers and works it in
 * full; null when those numbers do not make a clean problem of that kind.
 * Every step's equations are true at the sibling's solution.
 */

// v = m·w + k and a·X + b·Y = c, solved by substitution (optionally after
// isolating v from a standard-form first equation).
const workSubstitution = ({ variables, v, w, wValue, vValue, m, isoFirst, aV, aW, methodWord }) => {
  const f = formatter();
  const [X, Y] = variables;
  const vIsX = v === X;
  if (!wValue && !vValue) return null;
  const k = vValue - m * wValue;
  const c = aV * vValue + aW * wValue;
  const A = aW + aV * m;
  const B = aV * k;
  if (!A || Math.abs(k) > 24 || Math.abs(c) > 48 || Math.abs(B) > 60) return null;
  const isoExpression = f.linear([[m, w], [k, null]]);
  const isoDisplay = `${v} = ${isoExpression}`;
  // The first equation as shown: v = m·w + k, or (isolateFirst) v - m·w = k with v first.
  const firstDisplay = isoFirst ? f.std(vIsX ? { a: 1, b: -m, c: k } : { a: -m, b: 1, c: k }, variables) : isoDisplay;
  const pair = (vCoef, wCoef) => (vIsX ? [[vCoef, X], [wCoef, Y]] : [[wCoef, X], [vCoef, Y]]);
  const otherDisplay = `${f.linear(pair(aV, aW))} = ${f.num(c)}`;
  const vTerm = (() => {
    if (aV === 1) return `(${isoExpression})`;
    if (aV === -1) return `-(${isoExpression})`;
    return `${f.num(aV)}(${isoExpression})`;
  })();
  const wTerm = f.term(aW, w);
  const joinTerms = (left, right) => (right.startsWith('-') ? `${left} - ${right.slice(1)}` : `${left} + ${right}`);
  const substituted = vIsX ? joinTerms(vTerm, wTerm) : joinTerms(wTerm, vTerm);
  const distributedTerms = vIsX ? [[aV * m, w], [aV * k, null], [aW, w]] : [[aW, w], [aV * m, w], [aV * k, null]];
  const steps = [];
  if (isoFirst) steps.push(`Solve the first equation for ${math(v)}: ${math(isoDisplay)}.`);
  else steps.push(`The first equation already gives ${math(isoDisplay)}.`);
  steps.push(`Substitute ${math(isoExpression)} for ${math(v)} in the second equation: ${math(`${substituted} = ${f.num(c)}`)}.`);
  if (m && aV !== 1) steps.push(`Distribute: ${math(`${f.linear(distributedTerms)} = ${f.num(c)}`)}.`);
  if (m) steps.push(`Combine the ${math(w)}-terms: ${math(`${f.linear([[A, w], [B, null]])} = ${f.num(c)}`)}.`);
  if (B) steps.push(`${B > 0 ? 'Subtract' : 'Add'} ${math(f.num(Math.abs(B)))} ${B > 0 ? 'from' : 'to'} both sides: ${math(`${f.term(A, w)} = ${f.num(c - B)}`)}.`);
  if (A !== 1) steps.push(`Divide both sides by ${math(f.num(A))}: ${math(`${w} = ${f.num(wValue)}`)}.`);
  const back = m ? `${f.times(m, wValue)}${k ? (k > 0 ? ` + ${f.num(k)}` : ` - ${f.num(-k)}`) : ''}` : f.num(k);
  steps.push(m
    ? `Substitute ${math(`${w} = ${f.num(wValue)}`)} into ${math(isoDisplay)}: ${math(`${v} = ${back} = ${f.num(vValue)}`)}.`
    : `The first equation gives ${math(`${v} = ${f.num(vValue)}`)} directly.`);
  const [xValue, yValue] = vIsX ? [vValue, wValue] : [wValue, vValue];
  steps.push(`Check in the second equation: ${math(`${f.products([[vIsX ? aV : aW, xValue], [vIsX ? aW : aV, yValue]])} = ${f.num(c)}`)}, which is true.`);
  return {
    prompt: `Solve the system${methodWord ? ` by ${methodWord}` : ''}: ${math(firstDisplay)} and ${math(otherDisplay)}.`,
    steps,
    answer: `(${f.num(xValue)}, ${f.num(yValue)})`,
    printed: f.printed,
    point: { x: xValue, y: yValue },
  };
};

// v = m1·w + b1 and v = m2·w + b2: set the right sides equal (graph: draw both first).
const workSetEqual = ({ variables = ['x', 'y'], v, w, wValue, vValue, m1, m2, graph }) => {
  const f = formatter();
  if (m1 === m2 || (!wValue && !vValue)) return null;
  const b1 = vValue - m1 * wValue;
  const b2 = vValue - m2 * wValue;
  if (Math.abs(b1) > 20 || Math.abs(b2) > 20) return null;
  const E1 = f.linear([[m1, w], [b1, null]]);
  const E2 = f.linear([[m2, w], [b2, null]]);
  const A = m1 - m2;
  const steps = [];
  if (graph) {
    steps.push(`Graph ${math(`${v} = ${E1}`)}: start at its y-intercept, ${math(f.num(b1))}, and use the slope ${math(f.num(m1))}.`);
    steps.push(`Graph ${math(`${v} = ${E2}`)}: start at its y-intercept, ${math(f.num(b2))}, and use the slope ${math(f.num(m2))}.`);
    steps.push(`The slopes are different, so the lines cross at a single point. To find it exactly, set the right sides equal: ${math(`${E1} = ${E2}`)}.`);
  } else {
    steps.push(`Both equations give ${math(v)}, so set the right sides equal: ${math(`${E1} = ${E2}`)}.`);
  }
  steps.push(`${m2 > 0 ? 'Subtract' : 'Add'} ${math(f.term(Math.abs(m2), w))} ${m2 > 0 ? 'from' : 'to'} both sides: ${math(`${f.linear([[A, w], [b1, null]])} = ${f.num(b2)}`)}.`);
  if (b1) steps.push(`${b1 > 0 ? 'Subtract' : 'Add'} ${math(f.num(Math.abs(b1)))} ${b1 > 0 ? 'from' : 'to'} both sides: ${math(`${f.term(A, w)} = ${f.num(b2 - b1)}`)}.`);
  if (A !== 1) steps.push(`Divide both sides by ${math(f.num(A))}: ${math(`${w} = ${f.num(wValue)}`)}.`);
  const back = (m, b) => `${f.times(m, wValue)}${b ? (b > 0 ? ` + ${f.num(b)}` : ` - ${f.num(-b)}`) : ''}`;
  steps.push(`Substitute ${math(`${w} = ${f.num(wValue)}`)} into ${math(`${v} = ${E1}`)}: ${math(`${v} = ${back(m1, b1)} = ${f.num(vValue)}`)}.`);
  steps.push(`Check in the other equation: ${math(`${back(m2, b2)} = ${f.num(vValue)}`)}, the same value.`);
  const prompt = graph
    ? `Graph ${math(`${v} = ${E1}`)} and ${math(`${v} = ${E2}`)}, and find where the lines intersect.`
    : `Solve the system: ${math(`${v} = ${E1}`)} and ${math(`${v} = ${E2}`)}.`;
  const [xValue, yValue] = v === variables[0] ? [vValue, wValue] : [wValue, vValue];
  return { prompt, steps, answer: `(${f.num(xValue)}, ${f.num(yValue)})`, printed: f.printed, point: { x: xValue, y: yValue } };
};

// a1·X + b1·Y = c1 and a2·X + b2·Y = c2, by elimination (or row operations).
const workElimination = ({ variables, rows, point, only = null, matrix = false, methodWord }) => {
  const f = formatter();
  const [X, Y] = variables;
  const [r1, r2] = rows;
  const move = eliminationMove(rows, variables, only);
  if (!move) return null;
  const { v, w, index, u1, u2, k1, k2, op } = move;
  const vValue = index === 0 ? point.x : point.y;
  const wValue = index === 0 ? point.y : point.x;
  const wOf = (row) => (index === 0 ? row.b : row.a);
  const sign = op === 'add' ? 1 : -1;
  const A = k1 * wOf(r1) + sign * k2 * wOf(r2);
  const C = k1 * r1.c + sign * k2 * r2.c;
  if (!A) return null;
  const E = rows.map((row) => f.std(row, variables));
  const scale = (row, k) => ({ a: row.a * k, b: row.b * k, c: row.c * k });
  const steps = [];
  if (matrix) {
    steps.push(`Read each row as an equation: ${math(E[0])} and ${math(E[1])}.`);
    const s1 = sign * k2;
    const multiplier = (k) => (k === 1 ? '' : `${f.num(k)}·`);
    const description = op === 'add'
      ? `${multiplier(k1)}(first row) + ${multiplier(k2)}(second row)`
      : `${multiplier(k1)}(first row) - ${multiplier(Math.abs(s1))}(second row)`;
    steps.push(`Replace the second row with ${description}. The ${math(v)}-entries cancel, so the new second row means ${math(`${f.term(A, w)} = ${f.num(C)}`)}.`);
  } else {
    steps.push(`Line up the equations: ${math(E[0])} and ${math(E[1])}.`);
    if (k1 === 1 && k2 === 1) {
      steps.push(op === 'add'
        ? `The ${math(v)}-terms, ${math(f.term(u1, v))} and ${math(f.term(u2, v))}, are opposites. Add the equations: ${math(`${f.term(A, w)} = ${f.num(C)}`)}.`
        : `The ${math(v)}-terms are both ${math(f.term(u1, v))}. Subtract the second equation from the first: ${math(`${f.term(A, w)} = ${f.num(C)}`)}.`);
    } else {
      if (k1 !== 1) steps.push(`Multiply the first equation by ${math(f.num(k1))}: ${math(f.std(scale(r1, k1), variables))}.`);
      if (k2 !== 1) steps.push(`Multiply the second equation by ${math(f.num(k2))}: ${math(f.std(scale(r2, k2), variables))}.`);
      steps.push(op === 'add'
        ? `Add the equations; the ${math(v)}-terms cancel: ${math(`${f.term(A, w)} = ${f.num(C)}`)}.`
        : `Subtract the second equation from the first; the ${math(v)}-terms cancel: ${math(`${f.term(A, w)} = ${f.num(C)}`)}.`);
    }
  }
  if (A !== 1) steps.push(`Divide both sides by ${math(f.num(A))}: ${math(`${w} = ${f.num(wValue)}`)}.`);
  const known = wOf(r1) * wValue;
  const substitutedTerms = index === 0
    ? `${f.term(r1.a, X)}${wOf(r1) < 0 ? ' - ' : ' + '}${f.times(Math.abs(wOf(r1)), wValue)}`
    : `${f.times(r1.a, wValue)}${r1.b < 0 ? ' - ' : ' + '}${f.term(Math.abs(r1.b), Y)}`;
  const solved = u1 === 1 ? '' : `, and ${math(`${v} = ${f.num(vValue)}`)}`;
  steps.push(`Substitute ${math(`${w} = ${f.num(wValue)}`)} into the first ${matrix ? 'row\'s equation' : 'equation'}: ${math(`${substitutedTerms} = ${f.num(r1.c)}`)}, so ${math(`${f.term(u1, v)} = ${f.num(r1.c - known)}`)}${solved}.`);
  steps.push(`Check in the second equation: ${math(`${f.products([[r2.a, point.x], [r2.b, point.y]])} = ${f.num(r2.c)}`)}, which is true.`);
  const prompt = matrix
    ? `Solve the system whose augmented matrix has the rows [${f.num(r1.a)}  ${f.num(r1.b)} | ${f.num(r1.c)}] and [${f.num(r2.a)}  ${f.num(r2.b)} | ${f.num(r2.c)}].`
    : `Solve the system${methodWord ? ` by ${methodWord}` : ''}: ${math(E[0])} and ${math(E[1])}.`;
  return { prompt, steps, answer: `(${f.num(point.x)}, ${f.num(point.y)})`, printed: f.printed, point, shape: moveShape(move) };
};

const ATTEMPTS = 3000;

export const similarProblem = (question, { seed = 0 } = {}) => {
  try {
    if (!matches(question)) return null;
    const system = readSystem(question);
    const plan = planFor(question, system);
    if (plan.method === 'generic') return null;
    const guard = expectedValues(question);
    const key = keyOf(question, system.variables) || solveEquations(system.equations);
    // Magnitudes this question's answer is written with: a sibling prints none of them.
    const forbidden = key?.outcome === 'point' ? [Math.abs(tidy(key.x)), Math.abs(tidy(key.y))] : [];
    const computed = solveEquations(system.equations);
    if (computed.outcome === 'point') forbidden.push(Math.abs(computed.x), Math.abs(computed.y));
    const random = randomFrom(hashText(`${Number(seed) || 0}|${plan.method}|${system.equations.map((e) => [e.a, e.b, e.c].join(',')).join('|')}`));
    const methodWord = text(question?.method) === 'substitution' || /substitut/i.test(text(question?.prompt)) ? 'substitution'
      : text(question?.method) === 'elimination' || /eliminat/i.test(text(question?.prompt)) ? 'elimination' : '';
    const [X, Y] = system.variables;
    const originalShape = plan.move ? moveShape(plan.move) : null;
    const coordinate = () => integer(random, -7, 7);

    const build = (strict) => {
      if (plan.method === 'graph') {
        return workSetEqual({ v: 'y', w: 'x', wValue: coordinate(), vValue: coordinate(), m1: nonZero(random, -4, 4), m2: nonZero(random, -4, 4), graph: true });
      }
      if (plan.method === 'setEqual') {
        const w = system.variables.find((name) => name !== plan.v);
        return workSetEqual({ variables: system.variables, v: plan.v, w, wValue: coordinate(), vValue: coordinate(), m1: nonZero(random, -5, 5), m2: nonZero(random, -5, 5) });
      }
      if (plan.method === 'substitution' || plan.method === 'isolateFirst' || plan.method === 'isolateAny') {
        return workSubstitution({
          variables: system.variables,
          v: plan.v,
          w: plan.w,
          wValue: coordinate(),
          vValue: coordinate(),
          m: plan.method === 'substitution' && !plan.isoHasW ? 0 : nonZero(random, -4, 4),
          isoFirst: plan.method !== 'substitution',
          aV: nonZero(random, -5, 5),
          aW: nonZero(random, -5, 5),
          methodWord,
        });
      }
      // elimination / matrix: a one-solution system whose first move has the same shape.
      const point = { x: coordinate(), y: coordinate() };
      if (!point.x && !point.y) return null;
      const coefficients = [0, 0, 0, 0].map(() => nonZero(random, -6, 6));
      const rows = [
        { a: coefficients[0], b: coefficients[1], c: coefficients[0] * point.x + coefficients[1] * point.y },
        { a: coefficients[2], b: coefficients[3], c: coefficients[2] * point.x + coefficients[3] * point.y },
      ];
      if (coefficients[0] * coefficients[3] - coefficients[1] * coefficients[2] === 0) return null;
      if (rows.some((row) => !row.c || Math.abs(row.c) > 50 || gcd(gcd(row.a, row.b), row.c) !== 1)) return null;
      const result = workElimination({ variables: [X, Y], rows, point, only: plan.method === 'matrix' ? 0 : null, matrix: plan.method === 'matrix', methodWord });
      // The same first move (direct, one multiplier, two; add or subtract)
      // while one can be found; after that any elimination is still the same kind.
      if (!result || (strict && plan.method === 'elimination' && originalShape && result.shape !== originalShape)) return null;
      return result;
    };

    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
      const candidate = build(attempt < ATTEMPTS / 2);
      if (!candidate) continue;
      if (candidate.printed.some((value) => forbidden.some((bad) => Math.abs(value - bad) < 1e-9))) continue;
      const pieces = [candidate.prompt, ...candidate.steps, candidate.answer];
      if (pieces.some((piece) => revealsAnswer(piece, guard))) continue;
      if (text(candidate.prompt) === text(question?.prompt)) continue;
      return { prompt: candidate.prompt, steps: candidate.steps, answer: candidate.answer };
    }
    return null;
  } catch {
    return null;
  }
};

/* ------------------------------------------------------- back-up question */

const GENERIC_BACK_UP = Object.freeze({
  prompt: 'Let’s back up. Does the solution of a system have to make both equations true?',
  options: ['Yes, both equations', 'Only one of them'],
  correct: 'Yes, both equations',
});

export const backUpQuestion = (question) => {
  try {
    if (!matches(question)) return null;
    const system = readSystem(question);
    const plan = planFor(question, system);
    const guard = expectedValues(question);
    const f = formatter({ latex: false });
    const plainOf = (equation) => {
      // The back-up step is plain text: a LaTeX equation is shown in standard form.
      const display = equation.display;
      return /\\/.test(display) ? f.std(equation, system.variables) : display;
    };
    // Which button comes first is decided by the equations (what the student
    // sees), so the right answer is not always the first button.
    const order = (correct, wrong) => {
      const flip = hashText(system?.equations?.map((equation) => equation.display).join('|') || '') % 2 === 1;
      return { options: flip ? [wrong, correct] : [correct, wrong], correct };
    };
    // Most to least specific; the first that names no answer value is asked.
    const steps = [];
    if (plan.method === 'substitution' && plan.otherMentionsV) {
      const expression = /\\/.test(plan.iso.isolated.expression)
        ? f.linear(plan.v === system.variables[0] ? [[-plan.iso.b, system.variables[1]], [plan.iso.c, null]] : [[-plan.iso.a, system.variables[0]], [plan.iso.c, null]])
        : plan.iso.isolated.expression;
      const wrong = 'Add the two equations as they are';
      steps.push(
        { prompt: `Let’s back up. ${plainOf(plan.iso)} tells you what ${plan.v} equals. What is a good first move with ${plainOf(plan.other)}?`, ...order(`Replace ${plan.v} with (${expression})`, wrong) },
        { prompt: `Let’s back up. One equation tells you what ${plan.v} equals. What is a good first move?`, ...order(`Replace ${plan.v} in the other equation with (${expression})`, wrong) },
        { prompt: `Let’s back up. One equation tells you what ${plan.v} equals. What is a good first move?`, ...order(`Replace ${plan.v} in the other equation with what it equals`, wrong) },
      );
    } else if (plan.method === 'isolateAny') {
      steps.push({
        prompt: 'Let’s back up. To solve this system by substitution, what do you do first?',
        ...order('Solve one equation for one variable', 'Add the two equations as they are'),
      });
    } else if (plan.method === 'isolateFirst') {
      const wrong = 'Add the two equations as they are';
      steps.push(
        { prompt: `Let’s back up. In ${plainOf(plan.equation)}, the ${plan.v}-term has no coefficient. What is a good first move?`, ...order(`Solve ${plainOf(plan.equation)} for ${plan.v}`, wrong) },
        { prompt: `Let’s back up. One equation has a ${plan.v}-term with no coefficient. What is a good first move?`, ...order(`Solve that equation for ${plan.v}`, wrong) },
      );
    } else if (plan.method === 'setEqual') {
      const [e1, e2] = system.equations;
      if (!/\\/.test(e1.isolated.expression + e2.isolated.expression)) {
        steps.push({
          prompt: `Let’s back up. ${plainOf(e1)} and ${plainOf(e2)} both say what ${plan.v} equals. What is a good first move?`,
          ...order(`Set ${e1.isolated.expression} equal to ${e2.isolated.expression}`, `Set ${e1.isolated.expression} equal to 0`),
        });
      }
      steps.push({
        prompt: `Let’s back up. Both equations say what ${plan.v} equals. What is a good first move?`,
        ...order(`Set the two expressions for ${plan.v} equal to each other`, 'Set one of the expressions equal to 0'),
      });
    } else if ((plan.method === 'elimination' || plan.method === 'matrix') && plan.move) {
      const { v, u1, u2, k1, k2, op } = plan.move;
      const thing = plan.method === 'matrix' ? 'row' : 'equation';
      const [s1, s2] = system.equations.map((equation) => f.std(equation, system.variables));
      if (k1 === 1 && k2 === 1) {
        const add = `Add the two ${thing}s`;
        const subtract = `Subtract the second ${thing} from the first`;
        const choice = op === 'add' ? order(add, subtract) : order(subtract, add);
        steps.push(
          { prompt: `Let’s back up. In ${s1} and ${s2}, the ${v}-terms are ${f.term(u1, v)} and ${f.term(u2, v)}. Which move eliminates ${v}?`, ...choice },
          { prompt: `Let’s back up. Look at the ${v}-terms of the two ${thing}s. Which move eliminates ${v}?`, ...choice },
        );
      } else {
        const which = [k1 !== 1 ? `the first ${thing} by ${f.num(k1)}` : null, k2 !== 1 ? `the second ${thing} by ${f.num(k2)}` : null].filter(Boolean).join(' and ');
        const choice = order('Every term, on both sides', `Only the ${v}-term`);
        steps.push(
          { prompt: `Let’s back up. To match the ${v}-terms in ${s1} and ${s2}, you multiply ${which}. What gets multiplied?`, ...choice },
          { prompt: `Let’s back up. To match the ${v}-terms, you multiply ${which}. What gets multiplied?`, ...choice },
          { prompt: `Let’s back up. To match the ${v}-terms, you multiply ${thing === 'row' ? 'a row' : 'an equation'} by a number. What gets multiplied?`, ...choice },
        );
      }
    } else if (plan.method === 'graph') {
      system.equations.map((equation) => equation.line).forEach((line) => {
        if (!line.b) return;
        steps.push({
          prompt: `Let’s back up. Where does the graph of ${lineEquation(line.m, line.b, f)} cross the y-axis?`,
          ...order(`(0, ${f.num(line.b)})`, `(${f.num(line.b)}, 0)`),
        });
      });
      steps.push({
        prompt: 'Let’s back up. Where does a line in the form y = mx + b cross the y-axis?',
        ...order('At (0, b)', 'At (b, 0)'),
      });
    }
    const safe = (candidate) => candidate
      && candidate.options.length === 2
      && candidate.options[0] !== candidate.options[1]
      && candidate.options.includes(candidate.correct)
      && ![candidate.prompt, ...candidate.options].some((piece) => revealsAnswer(piece, guard));
    const step = steps.find(safe);
    if (step) return step;
    return { ...GENERIC_BACK_UP, options: [...GENERIC_BACK_UP.options] };
  } catch {
    return null;
  }
};
