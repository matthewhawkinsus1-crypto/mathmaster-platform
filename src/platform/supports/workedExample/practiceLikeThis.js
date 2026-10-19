/*
 * "PRACTISE ONE LIKE THIS" — AN UNSCORED SIBLING AFTER THE LAST MISS
 * (student pass 3, HELP-1 / decision D3; HELP-9's "Try one like this (no
 * score)"; HELP-12's wrong rows in Review My Work).
 *
 *   buildPracticeLikeThis(question, { seed, avoidPrompts }) → practice | null
 *   checkPracticeAnswers(practice, responses)               → { parts, allCorrect, anyChecked }
 *   practiceLikeThisOffered({ ... })                        → boolean
 *
 * The sibling is the question family's own worked sibling
 * (similarProblem.js: different numbers, never this question in disguise,
 * steps that never state this question's answer). Its answer is one line of
 * text — "domain [-1, 4]; range [-4, 6]", "(7, -6), (3, 5), (-6, 8), in that
 * order", "f⁻¹(x) = (x − 5)/7" — so it is read here into labelled parts the
 * student can answer one box at a time.
 *
 * A verdict is given only when it can be trusted. Each part is compared with
 * the platform's own answer matcher (compareMathAnswer, the one that grades
 * multi-answer fields), then, for an expression or an equation, by value at
 * sample points. A part said in words ("rises, then falls", "6 units to the
 * left"), a roster with an ellipsis, a mapping, or a line named by two of its
 * points (any two points would do) is never marked right or wrong: the
 * student compares it with the worked solution. A sibling with no part that
 * can be checked is still offered, as "work it, then compare".
 *
 * NOTHING HERE IS RECORDED. This module returns values; the component that
 * shows it (PracticeLikeThis.jsx) keeps the student's boxes in its own state
 * and hands nothing to a grader, an attempt recorder, a grade or the
 * evidence log. Credit back is Recovery's alone, under its own rules.
 *
 * WHERE: a Classwork or Practice item that has closed on a miss, with outcome
 * feedback open and help allowed — never a Warm-Up (it has Recovery), a DOL,
 * a quiz, a test, a server-graded host (Recovery practice, corrections, Path)
 * or a teacher who switched help off.
 */
import { compareMathAnswer } from '../../../../functions/shared/answerUtils.mjs';
import { sameNumberWithThousandsSeparators } from '../../../../functions/shared/answerEquivalence.mjs';
import { sameEquivalentExpression } from '../../../../functions/shared/equivalentExpression.mjs';
import { latexToExpression } from '../../../../functions/shared/algebra/latexToExpression.mjs';
import { parse } from '../../math/mathjs.js';
import { buildSimilarWorkedExample } from './similarProblem.js';

export const PRACTICE_LIKE_THIS_ROLES = Object.freeze(['classwork', 'practice']);

export const PRACTICE_VERDICT = Object.freeze({
  CORRECT: 'correct',
  INCORRECT: 'incorrect',
  BLANK: 'blank',
  // Not decided here: compare with the worked solution.
  COMPARE: 'compare',
});

const text = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);

/**
 * Offered only on a closed Classwork or Practice item the host vouched for.
 * `hostAllows` is the host's own opt-in (the classroom assignment, Review My
 * Work) — a Recovery runner or a Path session running on a "practice" policy
 * never passes it.
 */
export const practiceLikeThisOffered = ({
  hostAllows = false,
  activityRole = null,
  closedOnMiss = false,
  feedbackOpen = false,
  hintsAllowed = true,
  serverGraded = false,
} = {}) => Boolean(
  hostAllows === true
  && PRACTICE_LIKE_THIS_ROLES.includes(text(activityRole).toLowerCase())
  && closedOnMiss
  && feedbackOpen
  && hintsAllowed !== false
  && !serverGraded,
);

/* ------------------------------------------------------- reading the answer */

const OPEN = '([{';
const CLOSE = ')]}';

/** Split at every top-level match of `separator` (a regex tested at each index). */
const splitTopLevel = (value, separator) => {
  const pieces = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (OPEN.includes(char)) depth += 1;
    else if (CLOSE.includes(char)) depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      const match = separator.exec(value.slice(index));
      if (match && match.index === 0) {
        pieces.push(value.slice(start, index));
        index += match[0].length - 1;
        start = index + 1;
      }
    }
  }
  pieces.push(value.slice(start));
  return pieces.map(text).filter(Boolean);
};

/** The text outside every bracket. */
const outsideBrackets = (value) => {
  let depth = 0;
  let out = '';
  for (const char of value) {
    if (OPEN.includes(char)) depth += 1;
    else if (CLOSE.includes(char)) depth = Math.max(0, depth - 1);
    else if (depth === 0) out += char;
  }
  return out;
};

const words = (value) => (text(value).match(/[A-Za-z]{2,}/g) || [])
  .filter((word) => !/^(?:inf|sqrt|log|ln|sin|cos|tan|and|pi)$/i.test(word));

// A value starts with one of these; a label never does.
const VALUE_START = /^[[({\-−\d∅∞.]/;
// Words that mean "there is none" — any of them answers any other.
const NONE_WORDS = /^(?:never|none|no interval|does not exist|dne|∅|\{\s*\})$/i;

/*
 * A comma that starts a new labelled part: ", zeros {2}", ", h = 4". Never a
 * comma inside a bracket (the scanner skips those), and never ", then falls"
 * (no value follows the word).
 */
const LABELLED_COMMA = /^,\s+(?=[A-Za-z][A-Za-z-]*(?:\s+[A-Za-z][A-Za-z-]*)*\s*(?:=|\s[[({\-−\d∅∞]))/;
const EQUATION_AND = /^\s+and\s+/;

/* A left side that names a value — y, f⁻¹(x), (f ∘ g)(1), t(r(1000)), axis x — rather than an expression (4x − y). */
const nameLike = (lhs) => {
  const outside = outsideBrackets(lhs).trim();
  if (/\d/.test(outside) || /[+\-−*/^·]/.test(outside)) return false;
  return /^(?:[A-Za-z][A-Za-z-]*\s+)*(?:[A-Za-z][A-Za-z⁻¹]*)?$/.test(outside) && (outside !== '' || lhs.startsWith('('));
};

/** The top-level "=" of an equation (not ≤, ≥, <=, >=, !=), or -1. */
const equalsIndex = (value) => {
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (OPEN.includes(char)) depth += 1;
    else if (CLOSE.includes(char)) depth = Math.max(0, depth - 1);
    else if (char === '=' && depth === 0 && !/[<>!=]/.test(value[index - 1] || '') && value[index + 1] !== '=') return index;
  }
  return -1;
};

const capitalise = (value) => (value ? value[0].toUpperCase() + value.slice(1) : value);

/** Can a verdict on this value be trusted at all? */
const valueCheckable = (value) => {
  if (!value) return false;
  if (/→|->|\.\.\.|…/.test(value)) return false; // a mapping, a roster with an ellipsis
  if (NONE_WORDS.test(value)) return true;
  // Prose with a number in it ("6 units to the left"): words, not a value.
  if (words(value).length) return false;
  try {
    return compareMathAnswer(value, value);
  } catch {
    return false;
  }
};

const readPart = (chunk, position, { ordered = false } = {}) => {
  const raw = text(chunk);
  const id = `part-${position + 1}`;
  const prose = { id, label: null, expected: raw, kind: 'words', checkable: false };
  if (!raw) return null;

  const equals = equalsIndex(raw);
  if (equals > 0 && !/[<>≤≥]/.test(raw)) {
    const lhs = text(raw.slice(0, equals));
    const rhs = text(raw.slice(equals + 1));
    if (!rhs) return prose;
    if (/:/.test(lhs)) return prose;
    if (nameLike(lhs)) {
      return { id, label: `${lhs} =`, expected: rhs, kind: 'value', checkable: valueCheckable(rhs) || expressionKind(rhs) };
    }
    return { id, label: 'Equation', expected: raw, kind: 'equation', checkable: valueCheckable(raw) };
  }

  // "increasing never", "decreasing none"
  const none = /^(.*?)\s+(never|none|does not exist)$/i.exec(raw);
  if (none && none[1] && !VALUE_START.test(raw)) {
    return { id, label: capitalise(none[1]), expected: none[2], kind: 'none', checkable: true };
  }

  if (VALUE_START.test(raw) || /^[A-Za-z]\s*[\^²³]/.test(raw)) {
    const label = ordered ? 'In this order' : null;
    const kind = pointList(raw) ? 'points' : 'value';
    return { id, label, expected: raw, kind, ordered, checkable: kind === 'points' || valueCheckable(raw) || expressionKind(raw) };
  }

  // A label, then a value: "domain [-1, 4]", "Horizontal: 6 units left".
  const labelled = /^([A-Za-z][A-Za-z-]*(?:\s+[A-Za-z][A-Za-z-]*)*)\s*:?\s+(.+)$/.exec(raw);
  // "The line through (0, -1) and (1, -7)": any two points of the line would
  // do, so two particular ones are not the answer.
  if (labelled && /\bthrough\b/i.test(labelled[1])) return prose;
  if (labelled && VALUE_START.test(labelled[2])) {
    const value = text(labelled[2]).replace(/\s+and\s+(?=[[({\-−\d])/g, ', ');
    const kind = pointList(value) ? 'points' : 'value';
    const checkable = kind === 'points' || valueCheckable(value) || expressionKind(value);
    return { id, label: capitalise(labelled[1]), expected: value, kind, checkable };
  }
  return prose;
};

/* An expression or equation in letters (checked by value), not a number, pair, set or interval. */
function expressionKind(value) {
  if (words(value).length) return false; // "1 unit to the left" parses in mathjs (units): words are not an expression
  if (/[[{]/.test(value) || /^\(.*\)$/.test(value) && pointList(value)) return false;
  if (!/[a-z]/i.test(value.replace(/inf|∞/gi, ''))) return false;
  return sampleable(value);
}

const NUMBER = /^[-−]?(?:\d+(?:\.\d+)?|\.\d+)(?:\/\d+)?$/;

/** "(1, 2), (3, 4)" (or a single pair) → [["1","2"], ["3","4"]], else null. */
function pointList(value) {
  const pieces = splitTopLevel(text(value).replace(/\s+and\s+(?=\()/g, ', '), /^,/);
  if (!pieces.length) return null;
  const points = pieces.map((piece) => {
    const match = /^\(([^()]*)\)$/.exec(piece);
    if (!match) return null;
    const coordinates = match[1].split(',').map(text);
    // Numbers only: "(-∞, -6] ∪ [6, ∞)" and "(-∞, ∞)" are intervals, not points.
    return coordinates.length >= 2 && coordinates.every((entry) => NUMBER.test(entry)) ? coordinates : null;
  });
  return points.every(Boolean) ? points : null;
}

/**
 * The family's worked sibling, read into parts. `avoidPrompts` keeps "another
 * one" from repeating the one just done, and keeps the sibling the Hint panel
 * showed while the item was open from coming back as "practice".
 */
export const buildPracticeLikeThis = (question, { seed = 0, avoidPrompts = [] } = {}) => {
  const avoid = new Set(list(avoidPrompts).map(text).filter(Boolean));
  for (let offset = 1; offset <= 12; offset += 1) {
    const example = buildSimilarWorkedExample(question, { seed: Number(seed) + 97 * offset });
    if (!example || avoid.has(example.prompt)) continue;
    return { ...example, ...readPracticeAnswer(example.answer) };
  }
  return null;
};

/** The parts of a sibling's answer line. */
export const readPracticeAnswer = (answer) => {
  let line = text(answer);
  // "x² + 7x + 6 (coefficients 1, 7, 6)": a note on the answer, not a part.
  line = line.replace(/\s*\(([^()]*)\)\s*$/, (match, inner) => (words(inner).length >= 1 && /^[a-z]/i.test(text(inner)) ? '' : match));
  const ordered = /,?\s*in that order\.?$/i.test(line);
  line = line.replace(/,?\s*in that order\.?$/i, '');
  const chunks = splitTopLevel(line, /^;/)
    .flatMap((chunk) => {
      const byAnd = splitTopLevel(chunk, EQUATION_AND);
      return byAnd.length > 1 && byAnd.every((piece) => equalsIndex(piece) > 0) ? byAnd : [chunk];
    })
    // "g: asymptotes vertical x = -3, horizontal y = 2" is one statement about
    // g; its pieces mean nothing apart, so it stays whole (and in words).
    .flatMap((chunk) => (/^[^=]*:/.test(chunk) && equalsIndex(chunk) > 0 ? [chunk] : splitTopLevel(chunk, LABELLED_COMMA)));
  const parts = chunks.map((chunk, position) => readPart(chunk, position, { ordered })).filter(Boolean);
  // Parts with the same label read "Domain", "Domain (2)".
  const seen = new Map();
  parts.forEach((part) => {
    if (!part.label) return;
    const count = (seen.get(part.label) || 0) + 1;
    seen.set(part.label, count);
    if (count > 1) part.label = `${part.label} (${count})`;
  });
  const checkableParts = parts.filter((part) => part.checkable);
  return { parts, checkable: checkableParts.length > 0, wordsOnly: parts.filter((part) => !part.checkable) };
};

/* ------------------------------------------------------ checking an answer */

const SUPERSCRIPTS = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };

/** Text a student typed (MathLive LaTeX) or a family wrote (Unicode) → a mathjs expression, or null. */
const toExpression = (value) => {
  const raw = text(value);
  if (!raw || raw.length > 160) return null;
  const expression = latexToExpression(raw)
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (digits) => `^${[...digits].map((digit) => SUPERSCRIPTS[digit]).join('')}`)
    .replace(/[·×]/g, '*')
    .replace(/÷/g, '/')
    .replace(/[−–]/g, '-')
    .replace(/√\(/g, 'sqrt(')
    .replace(/\\/g, '');
  return /[\\{}[\]<>=;∘|]/.test(expression) ? null : expression;
};

const RESERVED = new Set(['pi', 'e', 'sqrt', 'log', 'ln', 'abs', 'sin', 'cos', 'tan', 'exp', 'nthRoot']);
const SAMPLES = [-2.37, -0.61, 0.73, 1.91, 3.29];

const compileExpression = (value) => {
  const expression = toExpression(value);
  if (!expression) return null;
  try {
    const node = parse(expression);
    const names = new Set();
    node.traverse((child) => {
      if (child.type === 'SymbolNode' && !RESERVED.has(child.name)) names.add(child.name);
      if (child.type === 'FunctionNode' && !RESERVED.has(child.fn?.name)) names.add('__unsupported__');
    });
    if (names.has('__unsupported__') || names.size > 3) return null;
    const compiled = node.compile();
    return { names: [...names], evaluate: (scope) => Number(compiled.evaluate({ ...scope })) };
  } catch {
    return null;
  }
};

function sampleable(value) {
  return Boolean(compileExpression(value));
}

const scopeAt = (names, index) => Object.fromEntries(names.map((name, position) => [name, SAMPLES[(index + position * 2) % SAMPLES.length] + position * 0.17]));

/**
 * Two expressions at the same sample points: CORRECT when every finite value
 * agrees, INCORRECT when a finite value differs, COMPARE when nothing could be
 * evaluated. `proportional` compares two sides of equations (left − right),
 * which may differ by a non-zero factor: y = 4x − 12 is 4x − y = 12.
 */
const compareBySampling = (student, expected, { proportional = false } = {}) => {
  const a = compileExpression(student);
  const b = compileExpression(expected);
  if (!a || !b) return PRACTICE_VERDICT.COMPARE;
  const names = [...new Set([...a.names, ...b.names])];
  let ratio = null;
  let compared = 0;
  for (let index = 0; index < SAMPLES.length; index += 1) {
    const scope = scopeAt(names, index);
    let left;
    let right;
    try {
      left = a.evaluate(scope);
      right = b.evaluate(scope);
    } catch {
      continue;
    }
    if (!Number.isFinite(left) || !Number.isFinite(right)) continue;
    compared += 1;
    if (!proportional) {
      if (Math.abs(left - right) > 1e-6 * Math.max(1, Math.abs(right))) return PRACTICE_VERDICT.INCORRECT;
      continue;
    }
    if (Math.abs(right) < 1e-9) {
      if (Math.abs(left) > 1e-6) return PRACTICE_VERDICT.INCORRECT;
      continue;
    }
    const here = left / right;
    if (ratio === null) ratio = here;
    if (Math.abs(here) < 1e-9 || Math.abs(here - ratio) > 1e-6 * Math.max(1, Math.abs(ratio))) return PRACTICE_VERDICT.INCORRECT;
  }
  return compared >= 3 ? PRACTICE_VERDICT.CORRECT : PRACTICE_VERDICT.COMPARE;
};

const sides = (value) => {
  const index = equalsIndex(text(value));
  return index > 0 ? [text(value).slice(0, index), text(value).slice(index + 1)] : null;
};

const safely = (check) => {
  try {
    return Boolean(check());
  } catch {
    return false;
  }
};

/** One part: CORRECT / INCORRECT / BLANK / COMPARE. */
export const checkPracticePart = (part, response) => {
  const typed = text(response);
  if (!part || !part.checkable) return PRACTICE_VERDICT.COMPARE;
  if (!typed) return PRACTICE_VERDICT.BLANK;
  const { expected } = part;

  if (part.kind === 'none') {
    const answer = typed.replace(/\\emptyset|\\varnothing/g, '∅').replace(/\\\{\s*\\\}/g, '{}');
    return NONE_WORDS.test(answer) ? PRACTICE_VERDICT.CORRECT : PRACTICE_VERDICT.INCORRECT;
  }

  if (part.kind === 'points') {
    const want = pointList(expected);
    const got = pointList(typed.replace(/\\left|\\right/g, '').replace(/\\?\s*,\s*/g, ', '));
    if (!want || !got || want.length !== got.length) return PRACTICE_VERDICT.INCORRECT;
    const same = (p, q) => safely(() => compareMathAnswer(`(${p.join(', ')})`, `(${q.join(', ')})`));
    if (part.ordered || want.length === 1) return want.every((point, index) => same(got[index], point)) ? PRACTICE_VERDICT.CORRECT : PRACTICE_VERDICT.INCORRECT;
    const left = [...got];
    const matched = want.every((point) => {
      const at = left.findIndex((candidate) => same(candidate, point));
      if (at < 0) return false;
      left.splice(at, 1);
      return true;
    });
    return matched ? PRACTICE_VERDICT.CORRECT : PRACTICE_VERDICT.INCORRECT;
  }

  if (part.kind === 'equation') {
    if (safely(() => compareMathAnswer(typed, expected))) return PRACTICE_VERDICT.CORRECT;
    const mine = sides(typed);
    const theirs = sides(expected);
    if (!mine || !theirs) return PRACTICE_VERDICT.COMPARE;
    return compareBySampling(`(${toExpression(mine[0])})-(${toExpression(mine[1])})`, `(${toExpression(theirs[0])})-(${toExpression(theirs[1])})`, { proportional: true });
  }

  // A value. A student who wrote the whole equation ("f^{-1}(x)=\frac{x-5}{7}"
  // for the box "f⁻¹(x) =") is read by its right side; one who rearranged it
  // ("-4x+y=8" for the box "y =") is compared as the same relation.
  const boxName = part.label?.endsWith('=') ? text(part.label.replace(/=$/, '')).split(/\s+/).pop() : null;
  const typedSides = boxName ? sides(typed) : null;
  if (typedSides && !nameLike(text(typedSides[0])) && /^[a-z]$/i.test(boxName)) {
    return compareBySampling(`(${toExpression(typedSides[0])})-(${toExpression(typedSides[1])})`, `(${boxName})-(${toExpression(expected)})`, { proportional: true });
  }
  const answer = typedSides ? text(typedSides[1]) : typed;
  if (safely(() => compareMathAnswer(answer, expected))) return PRACTICE_VERDICT.CORRECT;
  if (boxName && safely(() => compareMathAnswer(typed, `${part.label} ${expected}`))) return PRACTICE_VERDICT.CORRECT;
  // 8,050 for 8050, as on every number box (student pass 3, Batch 2).
  if (NUMBER.test(text(expected).replace(/[−]/g, '-')) && safely(() => sameNumberWithThousandsSeparators(answer, expected))) return PRACTICE_VERDICT.CORRECT;
  if (expressionKind(expected)) {
    if (safely(() => sameEquivalentExpression(answer, expected))) return PRACTICE_VERDICT.CORRECT;
    return compareBySampling(answer, expected);
  }
  // [-4, 3] for -4 ≤ x ≤ 3 (or the other way round): the same set, written
  // the other way. Compared once rewritten; a mismatch is then a real one.
  const rewritten = intervalAsInequality(answer, expected) || inequalityAsInterval(answer, expected);
  if (rewritten) return safely(() => compareMathAnswer(rewritten, expected)) ? PRACTICE_VERDICT.CORRECT : PRACTICE_VERDICT.INCORRECT;
  // A number, pair, set, interval or inequality: the matcher already reads
  // every way of writing one, so a mismatch is a different answer.
  return PRACTICE_VERDICT.INCORRECT;
};

const INEQUALITY = /^\s*([-−]?[\d.]+(?:\/\d+)?)\s*(≤|<|<=|\\le|\\leq|\\lt)\s*([A-Za-z](?:\([A-Za-z]\))?)\s*(≤|<|<=|\\le|\\leq|\\lt)\s*([-−]?[\d.]+(?:\/\d+)?)\s*$/;
const INTERVAL = /^\s*(?:\\left)?\s*(\[|\(|\\lbrack)\s*([-−]?[\d.]+(?:\/\d+)?)\s*,\s*([-−]?[\d.]+(?:\/\d+)?)\s*(?:\\right)?\s*(\]|\)|\\rbrack)\s*$/;
const strict = (relation) => /^(?:<|\\lt)$/.test(relation);

/** A typed interval [a, b) as the inequality the key is written as, or null. */
const intervalAsInequality = (typed, expected) => {
  const key = INEQUALITY.exec(text(expected));
  const interval = INTERVAL.exec(text(typed));
  if (!key || !interval) return null;
  const [, open, low, high, close] = interval;
  return `${low} ${open === '(' ? '<' : '≤'} ${key[3]} ${close === ')' ? '<' : '≤'} ${high}`;
};

/** A typed compound inequality as the interval the key is written as, or null. */
const inequalityAsInterval = (typed, expected) => {
  const inequality = INEQUALITY.exec(text(typed));
  if (!inequality || !INTERVAL.exec(text(expected))) return null;
  const [, low, left, , right, high] = inequality;
  return `${strict(left) ? '(' : '['}${low}, ${high}${strict(right) ? ')' : ']'}`;
};

/** Every part at once. `responses` is { [part.id]: text }. */
export const checkPracticeAnswers = (practice, responses = {}) => {
  const parts = list(practice?.parts).map((part) => ({
    id: part.id,
    label: part.label,
    verdict: checkPracticePart(part, responses?.[part.id]),
  }));
  const checked = parts.filter((part) => part.verdict === PRACTICE_VERDICT.CORRECT || part.verdict === PRACTICE_VERDICT.INCORRECT);
  return {
    parts,
    anyChecked: checked.length > 0,
    allCorrect: checked.length > 0 && parts.every((part) => part.verdict === PRACTICE_VERDICT.CORRECT || part.verdict === PRACTICE_VERDICT.COMPARE)
      && parts.some((part) => part.verdict === PRACTICE_VERDICT.CORRECT),
  };
};

/** What the student is told after Check. */
export const practiceCheckMessage = (result) => {
  if (!result?.anyChecked) return 'Fill in a box, then check it.';
  if (result.allCorrect) {
    return result.parts.some((part) => part.verdict === PRACTICE_VERDICT.COMPARE)
      ? 'Your checked answers match. Compare the rest with the worked solution.'
      : 'That matches. Nice work.';
  }
  const wrong = result.parts.filter((part) => part.verdict === PRACTICE_VERDICT.INCORRECT).length;
  return wrong ? `Not quite — ${wrong === 1 ? 'one box does' : `${wrong} boxes do`} not match yet. Try again, or see the worked solution.` : 'Fill in the empty boxes, then check again.';
};
