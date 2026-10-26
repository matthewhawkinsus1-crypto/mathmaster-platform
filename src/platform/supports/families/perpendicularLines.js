// Question family: perpendicular, parallel, horizontal and vertical lines, and the slope facts behind them (a reciprocal, a negative reciprocal, a product of slopes, a quarter turn about the origin): multiAnswer items, and the figureMatch and graphChoicePreview steps that sort or choose lines by them. It speaks only in the closed-question review.
//
// Contract (./index.js):
//   matches(question)            → true when this family can explain EVERY part of the question
//   hints(question)              → [] (see WHY IT ONLY SPEAKS ONCE THE QUESTION IS CLOSED)
//   similarProblem(question, { seed }) → null
//   expectedValues(question)     → []
//   backUpQuestion(question)     → null (the item's own step, or the platform's, is kept)
//   workedSolution(question)     → { headline, steps: [text], answerSummary } | null
//                                  THIS question worked part by part, for the
//                                  closed-question review only (it states the answers)
// `implemented` stays false until the family is real: the index skips it.
//
// WHY IT ONLY SPEAKS ONCE THE QUESTION IS CLOSED (CT02). It was written so that
// the closed questions of Algebra I Module 2 Topic 2 Lesson 3 ("Slopes of
// Perpendicular Lines and Horizontal & Vertical Lines", Regular and Honors) stop
// showing only the answer. No family claimed them, so every hint, back-up step
// and leak check a student meets while one is open is the item's own (its
// authored hints and scaffold) or the platform's. A family that claims an item
// is also asked for those, and anything it returned would change what a student
// sees while working. So this one returns nothing there: no hint, no back-up
// step, no sibling, and no extra answer spellings for the hint guard (the guard
// already reads every key the item carries). What a student sees before the
// question closes is exactly what they saw before this family existed.
//
// WHAT THIS FAMILY OWNS (last in the index order, so it only ever takes an item
// no other family claims). Every part must be one it reads; one part it cannot
// read and the item is not claimed.
//
//   multiAnswer  each answer field is read from its label, against what the
//                prompt states (points named like A(1, 1); lines given by an
//                equation, by two points, or as a 90° turn of another line
//                about a point on both; "the line perpendicular to … that
//                passes through …"; "two perpendicular lines intersect at …";
//                a claim someone makes), and the field's key must be what that
//                reading gives:
//                  - the reciprocal or negative reciprocal of a number;
//                  - the slope of a line perpendicular to a line of given slope;
//                  - the image of a named point after a 90°, 180° or 270° turn
//                    about the origin;
//                  - the slope of a segment, of a named line, of the line
//                    through two points, of the perpendicular line;
//                  - the y-intercept and slope-intercept equation of that line,
//                    or of a named line; the product of two named lines' slopes;
//                  - a horizontal or vertical line through a point, one parallel
//                    or perpendicular to an axis or to x = c or y = c, and the
//                    slope of such a line (0, or undefined);
//                  - the facts every horizontal and vertical line shares;
//                  - a verdict: are two lines perpendicular (when they are), is
//                    a quadrilateral a rectangle, who is right about two lines,
//                    is a claimed perpendicular slope right (and which half of
//                    the rule it missed);
//                  - the worked proof that a 90° turn about the origin makes
//                    slopes negative reciprocals (R(a, b) turned to D).
//   figureMatch  one sort stage into perpendicular / parallel / neither: of
//                pairs of slopes ("m₁ = 2 and m₂ = −1/2"), or of lines (a graph
//                or an equation) against a reference line.
//   graphChoicePreview  one multiple-choice stage: the equation of the line
//                through two named points, or of the line perpendicular to a
//                given line through a point. Exactly one choice is that line.
//
// SAFETY.
//   - Exact rational arithmetic only (questionFamilyExact); nothing is decided
//     with a float. A graph's float slope (0.3333333333333333) is only compared
//     with the exact line the prompt gives, never used.
//   - Every value is read from what the student is shown (the prompt, the
//     field's label, the graph, the card) and must be the item's own key; an item
//     whose key the reading contradicts is not claimed.
//   - workedSolution states each answer in a spelling the part's own grader
//     accepts: matchesFieldAnswer for a field, gradeStage (the grader the
//     composed workflow marks each stage with) for a sort or a choice. null
//     otherwise, and null for anything it cannot explain: never a wrong step.
//
// Pure: no React, no I/O.
import { matchesFieldAnswer } from '../../../../functions/shared/answerUtils.mjs';
import { readComposedQuestion } from '../../../../functions/shared/toolMath/workflow/questionWorkflow.mjs';
import { gradeStage } from '../../../../functions/shared/toolMath/workflow/workflowGrading.mjs';
import {
  buildFigureMatchResponse,
  figureLabel,
  figureNoun,
  matchCategories,
  matchItems,
} from '../../../../functions/shared/toolMath/workflow/figureMatch.mjs';
import {
  ONE,
  ZERO,
  absolute,
  add,
  divide,
  equals,
  isInteger,
  isZero,
  multiply,
  negate,
  rational,
  rationalText,
  subtract,
  toNumber,
} from '../../../../functions/shared/questionFamilyExact.mjs';

export const family = 'perpendicularLines';
export const implemented = true;

const MINUS_ONE = rational(-1);

const text = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const ascii = (value) => String(value ?? '').replace(/[−–]/g, '-');
const squash = (value) => text(value).replace(/\s+/g, ' ');
const capitalize = (value) => (value ? value[0].toUpperCase() + value.slice(1) : value);
const endSentence = (value) => (/[.?!]$/.test(value) ? value : `${value}.`);
/** Sentences after a label: the first runs on from "Label: ", the rest start with a capital. */
const sentences = (parts) => parts.filter(Boolean).map((part, index) => (index ? capitalize(part) : part)).join('. ');

/* ---------------------------------------------------------------------------
 * Exact numbers and lines, read from text: 3, −10, 1/5, −(3/4), 0.25,
 * y = (1/3)x + 5, 2y = −x + 8, y − 1 = 2(x + 3), x = 5, 2*x - 4.
 * ------------------------------------------------------------------------- */

const linear = (x, y, c) => ({ x, y, c });
const isConstant = (value) => isZero(value.x) && isZero(value.y);
const addLinear = (a, b) => linear(add(a.x, b.x), add(a.y, b.y), add(a.c, b.c));
const scaleLinear = (a, k) => linear(multiply(a.x, k), multiply(a.y, k), multiply(a.c, k));
const multiplyLinear = (a, b) => {
  if (isConstant(a)) return scaleLinear(b, a.c);
  if (isConstant(b)) return scaleLinear(a, b.c);
  throw new Error('not linear');
};

/** A linear expression in x and y with exact coefficients ({ x, y, c }), or null. */
const parseLinear = (source) => {
  const s = ascii(source).replace(/\s+/g, '').replace(/[·×]/g, '*');
  if (!s || s.length > 80 || /[^0-9xy+\-*/().]/.test(s)) return null;
  let at = 0;
  const peek = () => s[at];
  let expression = null;
  const atom = () => {
    if (peek() === '(') {
      at += 1;
      const inner = expression();
      if (s[at] !== ')') throw new Error('unclosed');
      at += 1;
      return inner;
    }
    const digits = /^\d+(?:\.\d+)?/.exec(s.slice(at));
    if (digits) {
      at += digits[0].length;
      const [whole, fraction = ''] = digits[0].split('.');
      return linear(ZERO, ZERO, rational(Number(`${whole}${fraction}`), 10 ** fraction.length));
    }
    if (peek() === 'x' || peek() === 'y') {
      const name = s[at];
      at += 1;
      return name === 'x' ? linear(ONE, ZERO, ZERO) : linear(ZERO, ONE, ZERO);
    }
    throw new Error('unexpected');
  };
  const unary = () => {
    if (peek() === '-') {
      at += 1;
      return scaleLinear(unary(), MINUS_ONE);
    }
    if (peek() === '+') {
      at += 1;
      return unary();
    }
    return atom();
  };
  const term = () => {
    let value = unary();
    for (;;) {
      if (peek() === '*') {
        at += 1;
        value = multiplyLinear(value, unary());
      } else if (peek() === '/') {
        at += 1;
        const divisor = unary();
        if (!isConstant(divisor) || isZero(divisor.c)) throw new Error('not a number');
        value = scaleLinear(value, divide(ONE, divisor.c));
      } else if (peek() === '(' || peek() === 'x' || peek() === 'y' || /\d/.test(peek() ?? '')) {
        // Written side by side: 2x, 2(x + 3), (1/3)x.
        value = multiplyLinear(value, unary());
      } else {
        return value;
      }
    }
  };
  expression = () => {
    let value = term();
    while (peek() === '+' || peek() === '-') {
      const sign = s[at];
      at += 1;
      const next = term();
      value = addLinear(value, sign === '+' ? next : scaleLinear(next, MINUS_ONE));
    }
    return value;
  };
  try {
    const value = expression();
    return at === s.length ? value : null;
  } catch {
    return null;
  }
};

/** A plain number (−5/4, (1/3), 0.25), or null. */
const readNumber = (raw) => {
  const value = parseLinear(raw);
  return value && isConstant(value) ? value.c : null;
};

/** Both sides of an equation as A·x + B·y + C = 0, or null. */
const equationParts = (raw) => {
  const sides = ascii(raw).split('=');
  if (sides.length !== 2) return null;
  const left = parseLinear(sides[0]);
  const right = parseLinear(sides[1]);
  if (!left || !right) return null;
  return { left, right, A: subtract(left.x, right.x), B: subtract(left.y, right.y), C: subtract(left.c, right.c) };
};

/** A line: { vertical: false, m, b } or { vertical: true, x }; null unless the equation is one line. */
const lineOfEquation = (raw) => {
  const parts = equationParts(raw);
  if (!parts) return null;
  const { A, B, C } = parts;
  if (!isZero(B)) return { vertical: false, m: divide(negate(A), B), b: divide(negate(C), B) };
  if (!isZero(A)) return { vertical: true, x: divide(negate(C), A) };
  return null;
};

const lineThrough = ([x1, y1], [x2, y2]) => {
  if (equals(x1, x2)) return equals(y1, y2) ? null : { vertical: true, x: x1 };
  const m = divide(subtract(y2, y1), subtract(x2, x1));
  return { vertical: false, m, b: subtract(y1, multiply(m, x1)) };
};
const sameLine = (a, b) => Boolean(a && b) && (a.vertical
  ? Boolean(b.vertical) && equals(a.x, b.x)
  : !b.vertical && equals(a.m, b.m) && equals(a.b, b.b));
const samePoint = (a, b) => Boolean(a && b) && equals(a[0], b[0]) && equals(a[1], b[1]);
const onLine = (line, [x, y]) => (line.vertical ? equals(line.x, x) : equals(y, add(multiply(line.m, x), line.b)));
const isHorizontal = (line) => !line.vertical && isZero(line.m);
/** The line through `point` perpendicular to `line`. */
const perpendicularThrough = (line, [x, y]) => {
  if (line.vertical) return { vertical: false, m: ZERO, b: y };
  if (isZero(line.m)) return { vertical: true, x };
  const m = divide(MINUS_ONE, line.m);
  return { vertical: false, m, b: subtract(y, multiply(m, x)) };
};
const arePerpendicular = (a, b) => {
  if (a.vertical || b.vertical) return a.vertical ? isHorizontal(b) : isHorizontal(a);
  return equals(multiply(a.m, b.m), MINUS_ONE);
};
const areParallel = (a, b) => (a.vertical ? Boolean(b.vertical) : !b.vertical && equals(a.m, b.m));

/* ---------------------------------------------------------------------------
 * Writing numbers and lines the way the lesson prints them: a minus sign
 * (−), a fraction in parentheses in front of x: y = −(1/2)x + 5.
 * ------------------------------------------------------------------------- */

const num = (value) => rationalText(value).replace(/-/g, '−');
/** A number being subtracted or divided by: 6 − (−2), 2 ÷ (−1). */
const paren = (value) => (value.n < 0 ? `(${num(value)})` : num(value));
/** A number being multiplied: (−1/2)(6), (1/3) × (−3). */
const factor = (value) => (value.n < 0 || !isInteger(value) ? `(${num(value)})` : num(value));
const pt = ([x, y]) => `(${num(x)}, ${num(y)})`;
const termIn = (coefficient, variable) => {
  if (equals(coefficient, ONE)) return variable;
  if (equals(coefficient, MINUS_ONE)) return `−${variable}`;
  const size = absolute(coefficient);
  const body = isInteger(size) ? `${num(size)}${variable}` : `(${num(size)})${variable}`;
  return coefficient.n < 0 ? `−${body}` : body;
};
/** m·x + b as the lesson writes the right side of y = mx + b. */
const rightSide = (m, b) => {
  if (isZero(m)) return num(b);
  const tail = isZero(b) ? '' : ` ${b.n < 0 ? '−' : '+'} ${num(absolute(b))}`;
  return `${termIn(m, 'x')}${tail}`;
};
const lineText = (line) => (line.vertical ? `x = ${num(line.x)}` : `y = ${rightSide(line.m, line.b)}`);
const joinList = (parts) => (parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);

/** "(5 − 9) ÷ (6 − (−2)) = −4 ÷ 8 = −1/2": the slope from one point to another (null for a vertical pair). */
const slopeWork = (from, to) => {
  const dy = subtract(to[1], from[1]);
  const dx = subtract(to[0], from[0]);
  if (isZero(dx)) return null;
  const m = divide(dy, dx);
  return { m, text: `(${num(to[1])} − ${paren(from[1])}) ÷ (${num(to[0])} − ${paren(from[0])}) = ${num(dy)} ÷ ${paren(dx)} = ${num(m)}` };
};
/** The work without its result, so the result can be the stated answer: "… = −4 ÷ 8 = ". */
const withoutResult = (work) => work.replace(/= [^=]+$/, '= ');

/** Flip and change the sign: "flip 2/3 to 3/2 and change the sign: −3/2". */
const negativeReciprocalWork = (m) => {
  const flipped = divide(ONE, m);
  const result = negate(flipped);
  let flip = `flip ${num(m)} to ${num(flipped)}`;
  if (equals(absolute(m), ONE)) flip = `flip ${num(m)} (it stays ${num(flipped)})`;
  else if (isInteger(m)) flip = `flip ${num(m)} (that is ${num(m)}/1) to ${num(flipped)}`;
  return { value: result, text: `${flip} and change the sign: ${num(result)}` };
};
const withoutLastAnswer = (work) => work.replace(/: [^:]+$/, ': ');

/** b from the slope and one point: "put (6, 2) into …: 2 = (−1/2)(6) + b, so 2 = −3 + b and b = 2 − (−3) = 5". */
const interceptWork = (m, [x, y]) => {
  const b = subtract(y, multiply(m, x));
  if (isZero(x)) return { b, text: `it passes through ${pt([x, y])} on the y-axis, so b = ${num(b)}` };
  const mx = multiply(m, x);
  return {
    b,
    text: `put ${pt([x, y])} into y = ${termIn(m, 'x')} + b: ${num(y)} = ${factor(m)}(${num(x)}) + b, so ${num(y)} = ${num(mx)} + b and b = ${num(y)} − ${paren(mx)} = ${num(b)}`,
  };
};

/* ---------------------------------------------------------------------------
 * Reading the prompt: the points it names, the lines it gives, and what it asks.
 * ------------------------------------------------------------------------- */

const NUM = '[-−]?\\d+(?:\\.\\d+)?(?:\\/\\d+)?';
const PT = `\\(\\s*(${NUM})\\s*,\\s*(${NUM})\\s*\\)`;
// An equation as the prompts print one: y = −(3/4)x, y = 2x + 1, x = 5.
const EQ = '([xy]\\s*=\\s*[-−(0-9x][0-9x()+\\-−/.\\s]*?)';
const pointOf = (xText, yText) => {
  const x = readNumber(xText);
  const y = readNumber(yText);
  return x && y ? [x, y] : null;
};

const namedPointsIn = (prompt) => {
  const points = new Map();
  for (const match of prompt.matchAll(new RegExp(`\\b([A-Z])${PT}`, 'g'))) {
    const point = pointOf(match[2], match[3]);
    if (!point || (points.has(match[1]) && !samePoint(points.get(match[1]), point))) return null;
    points.set(match[1], point);
  }
  return points;
};

/** Every line the prompt names, resolved exactly, in the order the prompt names them; null when one is named two incompatible ways. */
const resolveNamedLines = (facts) => {
  const resolved = new Map();
  for (let round = 0; round < facts.size; round += 1) {
    for (const entry of facts.values()) {
      if (resolved.has(entry.name)) continue;
      let line = null;
      let how = null;
      if (entry.equation) {
        line = entry.equation.line;
        how = 'equation';
      } else if (entry.points.length >= 2) {
        line = lineThrough(entry.points[0], entry.points[1]);
        how = 'points';
      } else if (entry.turnOf && resolved.has(entry.turnOf.of)) {
        // A 90° turn about a point on the line is the perpendicular through that point.
        line = perpendicularThrough(resolved.get(entry.turnOf.of).line, entry.turnOf.about);
        how = 'turn';
      }
      if (!line) continue;
      if (!entry.points.every((point) => onLine(line, point))) return null;
      resolved.set(entry.name, { ...entry, line, how });
    }
  }
  if (resolved.size !== facts.size) return null;
  // A line said to be a 90° turn of another, about a point on both, is perpendicular to it.
  for (const entry of resolved.values()) {
    if (!entry.turnOf) continue;
    const original = resolved.get(entry.turnOf.of).line;
    if (!onLine(original, entry.turnOf.about) || !arePerpendicular(entry.line, original)) return null;
  }
  return new Map([...facts.keys()].map((name) => [name, resolved.get(name)]));
};

const addLineFact = (facts, name, fact) => {
  const entry = facts.get(name) || { name, points: [], equation: null, turnOf: null };
  if (fact.point && !entry.points.some((point) => samePoint(point, fact.point))) entry.points.push(fact.point);
  if (fact.equation) entry.equation = fact.equation;
  if (fact.turnOf) entry.turnOf = fact.turnOf;
  facts.set(name, entry);
};

/** What the prompt states, read once. null when it states something this family reads two ways. */
const readScene = (prompt) => {
  const scene = { points: namedPointsIn(prompt), lines: new Map(), reference: null, target: null, pair: null, rotate: null, claims: null, claim: null, quadrilateral: null };
  if (!scene.points) return null;
  const facts = new Map();
  // "Line B is y = (1/3)x + 5."
  for (const match of prompt.matchAll(new RegExp(`\\bLine ([A-Za-z]′?) is ${EQ}\\.(?=\\s|$)`, 'g'))) {
    const line = lineOfEquation(match[2]);
    if (!line) return null;
    addLineFact(facts, match[1], { equation: { raw: squash(match[2]), line } });
  }
  // "Line B and its image B′ after a 90° rotation about their intersection point (0, 5)",
  // "Line C and its 90° rotation C′ intersect at (6, 5)".
  const turns = [
    new RegExp(`\\bLine ([A-Za-z]) and its image \\1′ after a 90° rotation about their intersection point ${PT}`, 'g'),
    new RegExp(`\\bLine ([A-Za-z]) and its 90° rotation \\1′ intersect at ${PT}`, 'g'),
  ];
  for (const pattern of turns) {
    for (const match of prompt.matchAll(pattern)) {
      const about = pointOf(match[2], match[3]);
      if (!about) return null;
      addLineFact(facts, match[1], { point: about });
      addLineFact(facts, `${match[1]}′`, { point: about, turnOf: { of: match[1], about } });
    }
  }
  // "Line C passes through (−2, 9)", "line C′ passes through (0, −7)", "Line a passes through (0, 2) and (4, 4)."
  for (const match of prompt.matchAll(new RegExp(`\\b[Ll]ine ([A-Za-z]′?) passes through ${PT}(?: and ${PT})?`, 'g'))) {
    for (const [x, y] of [[match[2], match[3]], [match[4], match[5]]]) {
      if (x === undefined) continue;
      const point = pointOf(x, y);
      if (!point) return null;
      addLineFact(facts, match[1], { point });
    }
  }
  if (facts.size) {
    scene.lines = resolveNamedLines(facts);
    if (!scene.lines) return null;
  }

  // The line some parts ask for: perpendicular to a given line, through a point.
  const given = (raw) => {
    const line = lineOfEquation(raw);
    return line ? { line, display: squash(raw), via: 'equation' } : null;
  };
  const throughTwo = (a, b) => {
    const points = [pointOf(...a), pointOf(...b)];
    const line = points.every(Boolean) ? lineThrough(points[0], points[1]) : null;
    return line ? { line, points, via: 'points' } : null;
  };
  const asked = [];
  let match = new RegExp(`\\bthe line perpendicular to ${EQ} that passes through (?:the point )?${PT}`, 'i').exec(prompt);
  if (match) asked.push({ reference: given(match[1]), through: pointOf(match[2], match[3]) });
  match = new RegExp(`\\bthe line that passes through ${PT} and is perpendicular to the line through ${PT} and ${PT}`, 'i').exec(prompt);
  if (match) asked.push({ reference: throughTwo([match[3], match[4]], [match[5], match[6]]), through: pointOf(match[1], match[2]) });
  match = new RegExp(`^A line passes through ${PT} and ${PT}\\. Write the equation of the line perpendicular to it that passes through ${PT}\\.$`).exec(prompt);
  if (match) asked.push({ reference: throughTwo([match[1], match[2]], [match[3], match[4]]), through: pointOf(match[5], match[6]) });
  match = new RegExp(`\\bTwo perpendicular lines intersect at ${PT}\\. One of them also passes through ${PT}\\. Write the equation of the OTHER line\\.`).exec(prompt);
  if (match) asked.push({ reference: throughTwo([match[1], match[2]], [match[3], match[4]]), through: pointOf(match[1], match[2]), other: true });
  // "Priya says the line perpendicular to y = 4x − 1 has a slope of −4."
  match = new RegExp(`\\b([A-Z][a-z]+) says the line perpendicular to ${EQ} has a slope of (${NUM})\\.`).exec(prompt);
  if (match) {
    const slope = readNumber(match[3]);
    if (!slope) return null;
    scene.claim = { who: match[1], slope };
    asked.push({ reference: given(match[2]), through: null, claimed: true });
  }
  if (asked.length > 1) return null;
  if (asked.length) {
    const [{ reference, through, other = false, claimed = false }] = asked;
    // The family writes the perpendicular as y = mx + b: the given line must have a nonzero slope.
    if (!reference || reference.line.vertical || isZero(reference.line.m) || (!claimed && !through)) return null;
    scene.reference = reference;
    scene.target = { through, other };
  }

  // "Line j and line k are perpendicular. Given each slope of line j, determine the slope of line k."
  match = /\bLine ([a-z]) and line ([a-z]) are perpendicular\. Given each slope of line \1, determine the slope of line \2\./.exec(prompt);
  if (match) scene.pair = { given: match[1], asked: match[2] };
  // "Rotate AB about the origin"
  match = /\bRotate ([A-Z])([A-Z]) about the origin\b/.exec(prompt);
  if (match) scene.rotate = { segment: `${match[1]}${match[2]}` };
  // "Linh says the lines are perpendicular. Jackson says they are not."
  match = /\b([A-Z][a-z]+) says the lines are perpendicular\. ([A-Z][a-z]+) says they are not\./.exec(prompt);
  if (match) scene.claims = { yes: match[1], no: match[2] };
  // "Quadrilateral ABCD has vertices A(1, 1), …"
  match = /\bQuadrilateral ([A-Z])([A-Z])([A-Z])([A-Z]) has vertices\b/.exec(prompt);
  if (match) {
    const names = match.slice(1, 5);
    if (new Set(names).size !== 4 || !names.every((name) => scene.points.has(name))) return null;
    scene.quadrilateral = names;
  }
  return scene;
};

/** The perpendicular line a part asks for: its slope, and the line itself when it has a point. */
const targetOf = (scene, through = scene.target?.through) => {
  if (!scene.target) return null;
  const m = divide(MINUS_ONE, scene.reference.line.m);
  return { m, point: through, line: through ? { vertical: false, m, b: subtract(through[1], multiply(m, through[0])) } : null };
};

/** How the given line's slope is known: "the given line y = 2x + 1 is in the form y = mx + b, so its slope is 2". */
const referenceSlopeText = (scene) => {
  const { reference } = scene;
  if (reference.via === 'equation') return `the given line ${reference.display} is in the form y = mx + b, so its slope is ${num(reference.line.m)}`;
  const [from, to] = reference.points;
  return `the line through ${pt(from)} and ${pt(to)} has slope ${slopeWork(from, to).text}`;
};

/* ---------------------------------------------------------------------------
 * Reading one answer field. Each reader takes the field's label and returns
 * { kind, truth, say(stated) } (kind: number | line | pair | choice), or null.
 * `said` remembers what an earlier step has already worked out, so a later
 * step uses it rather than working it again; a reader marks it only when it
 * returns a reading.
 * ------------------------------------------------------------------------- */

const labelOf = (field) => squash(field?.label);
/** The label as the start of a sentence: "The slope of every horizontal line is …" → "… is". */
const leadOf = (label) => label.replace(/\s*…$/, '').replace(/\s*[:?.]$/, '');
/** Does the label's sentence wait for its answer ("… is …", "m₁ · m₂ = ?")? */
const waitsForAnswer = (label) => /…$|=\s*\?$/.test(label);

const optionsOf = (field) => list(field?.options).map(text).filter(Boolean);
/** The one option the pattern picks, or null (none, or more than one). */
const onlyOption = (field, pattern) => {
  const found = optionsOf(field).filter((option) => pattern.test(option));
  return found.length === 1 ? found[0] : null;
};
const optionNamed = (field, wanted) => onlyOption(field, new RegExp(`^${wanted}$`, 'i'));

const numberRead = (truth, say) => ({ kind: 'number', truth, say });
const lineRead = (truth, say) => ({ kind: 'line', truth, say });
const pairRead = (truth, say) => ({ kind: 'pair', truth, say });
const choiceRead = (truth, say) => (truth ? { kind: 'choice', truth, say } : null);

const reciprocalReader = (label) => {
  const match = new RegExp(`^(Negative reciprocal|Reciprocal) of (${NUM})$`).exec(label);
  const value = match && readNumber(match[2]);
  if (!value || isZero(value)) return null;
  if (match[1] === 'Reciprocal') {
    const flipped = divide(ONE, value);
    const start = isInteger(value) ? `${num(value)} is ${num(value)}/1, and flipping it gives` : `flipping ${num(value)} gives`;
    return numberRead(flipped, (stated) => `${label}: ${start} ${stated}. Check: ${factor(value)} × ${factor(flipped)} = 1.`);
  }
  const work = negativeReciprocalWork(value);
  return numberRead(work.value, (stated) => `${label}: ${withoutLastAnswer(work.text)}${stated}. Check: ${factor(value)} × ${factor(work.value)} = −1.`);
};

const pairReader = (label, scene) => {
  if (!scene.pair) return null;
  const match = new RegExp(`^Slope of ${scene.pair.given} is (${NUM})$`).exec(label);
  const value = match && readNumber(match[1]);
  if (!value || isZero(value)) return null;
  const work = negativeReciprocalWork(value);
  const { given, asked } = scene.pair;
  return numberRead(work.value, (stated) => `${label}: line ${asked} is perpendicular to line ${given}, so its slope is the negative reciprocal: ${withoutLastAnswer(work.text)}${stated}. Check: ${factor(value)} × ${factor(work.value)} = −1.`);
};

const TURNS = Object.freeze({
  '90 counterclockwise': ['(x, y) to (−y, x)', ([x, y]) => [negate(y), x]],
  '90 clockwise': ['(x, y) to (y, −x)', ([x, y]) => [y, negate(x)]],
  180: ['(x, y) to (−x, −y)', ([x, y]) => [negate(x), negate(y)]],
  '270 counterclockwise': ['(x, y) to (y, −x)', ([x, y]) => [y, negate(x)]],
  '270 clockwise': ['(x, y) to (−y, x)', ([x, y]) => [negate(y), x]],
});

const rotationReader = (label, scene) => {
  if (!scene.rotate) return null;
  const match = /^([A-Z])(?:′|″|‴) after a (90|180|270)° (?:(counterclockwise|clockwise) )?rotation$/.exec(label);
  if (!match) return null;
  const [, name, degrees, direction] = match;
  if (!scene.rotate.segment.includes(name) || !scene.points.has(name) || (degrees !== '180' && !direction)) return null;
  const [rule, turn] = TURNS[degrees === '180' ? '180' : `${degrees} ${direction}`];
  const from = scene.points.get(name);
  const how = degrees === '180' ? 'a 180° turn' : `a ${degrees}° ${direction} turn`;
  return pairRead(turn(from), (stated) => `${label}: ${how} about the origin sends ${rule}, so ${name}${pt(from)} goes to ${stated}.`);
};

const segmentSlopeReader = (label, scene) => {
  const match = /^Slope of ([A-Z])([A-Z])$/.exec(label);
  if (!match || !scene.points.has(match[1]) || !scene.points.has(match[2])) return null;
  const [, a, b] = match;
  const work = slopeWork(scene.points.get(a), scene.points.get(b));
  if (!work) return null;
  return numberRead(work.m, (stated) => `${label}: from ${a}${pt(scene.points.get(a))} to ${b}${pt(scene.points.get(b))}, the slope is (change in y) ÷ (change in x) = ${withoutResult(work.text)}${stated}.`);
};

/** Does the graph draw this exact line (as { type: 'line', m, b } with float m and b), with both points in its window? */
const graphShows = (question, line, points) => {
  const graph = question?.graph;
  const near = (value, exact) => Math.abs(Number(value) - toNumber(exact)) < 1e-9;
  const drawn = list(graph?.functions).some((entry) => text(entry?.type) === 'line' && near(entry.m, line.m) && near(entry.b, line.b));
  const inside = ([x, y]) => Number(graph?.xMin) <= toNumber(x) && toNumber(x) <= Number(graph?.xMax) && Number(graph?.yMin) <= toNumber(y) && toNumber(y) <= Number(graph?.yMax);
  return drawn && points.every(inside);
};

const namedLineSlopeReader = (label, scene, said, question) => {
  const match = /^Slope of line ([A-Za-z]′?)( \(read it from the graph\))?$/.exec(label);
  const entry = match && scene.lines.get(match[1]);
  if (!entry || entry.line.vertical) return null;
  const { line, name } = entry;
  if (entry.how === 'equation') {
    return numberRead(line.m, (stated) => `${label}: line ${name} is ${entry.equation.raw}, in the form y = mx + b, and the slope m is the number multiplying x: ${stated}.`);
  }
  if (entry.how === 'points') {
    const [from, to] = entry.points;
    const work = slopeWork(from, to);
    return numberRead(line.m, (stated) => `${label}: line ${name} passes through ${pt(from)} and ${pt(to)}, so its slope is ${withoutResult(work.text)}${stated}.`);
  }
  // A 90° turn of another line: read off the graph when the label says so, and
  // say why it is the negative reciprocal.
  const original = scene.lines.get(entry.turnOf.of);
  const why = `that is the negative reciprocal of ${num(original.line.m)}, the slope of line ${original.name}, as a 90° turn always gives`;
  if (!match[2]) {
    return numberRead(line.m, (stated) => `${label}: line ${name} is line ${original.name} turned 90° about a point on it, so it is perpendicular to line ${original.name}: its slope is the negative reciprocal of ${num(original.line.m)}, ${stated}.`);
  }
  const start = entry.turnOf.about;
  const next = [add(start[0], rational(line.m.d)), add(start[1], rational(line.m.n))];
  if (!graphShows(question, line, [start, next])) return null;
  const rise = rational(line.m.n);
  const move = `right ${line.m.d} and ${rise.n < 0 ? 'down' : 'up'} ${num(absolute(rise))}`;
  return numberRead(line.m, (stated) => `${label}: ${sentences([`on the graph, line ${name} goes from ${pt(start)} to ${pt(next)}, ${move}, so its slope is ${num(rise)} ÷ ${line.m.d} = ${stated}`, why])}.`);
};

const productReader = (label, scene) => {
  if (!/^Product of the (?:two )?slopes$/.test(label)) return null;
  const named = [...scene.lines.values()];
  if (named.length !== 2 || named.some((entry) => entry.line.vertical)) return null;
  const [first, second] = named;
  return numberRead(multiply(first.line.m, second.line.m), (stated) => `${label}: ${factor(first.line.m)} × ${factor(second.line.m)} = ${stated}.`);
};

const namedLineEquationReader = (label, scene) => {
  const match = /^Equation of line ([A-Za-z]′?)(?: in slope-intercept form)?$/.exec(label);
  const entry = match && scene.lines.get(match[1]);
  if (!entry || entry.line.vertical) return null;
  const point = entry.points.find((candidate) => isZero(candidate[0])) || entry.points[0];
  if (!point) return null;
  const work = interceptWork(entry.line.m, point);
  return lineRead(entry.line, (stated) => `${label}: ${sentences([`line ${entry.name} has slope ${num(entry.line.m)}`, work.text, `the line is ${stated}`])}.`);
};

/** "Slope of the line through (5, 9) and (−4, 4)", "Slope of the line through the two points". */
const referenceSlopeReader = (label, scene, said) => {
  const { reference } = scene;
  if (!reference || reference.via !== 'points') return null;
  const named = new RegExp(`^Slope of the line through ${PT} and ${PT}$`).exec(label);
  if (named) {
    const asked = [pointOf(named[1], named[2]), pointOf(named[3], named[4])];
    if (!asked.every((point) => point && reference.points.some((other) => samePoint(point, other)))) return null;
  } else if (label !== 'Slope of the line through the two points') {
    return null;
  }
  const [from, to] = reference.points;
  const work = slopeWork(from, to);
  said.add('reference');
  return numberRead(work.m, (stated) => `${label}: from ${pt(from)} to ${pt(to)}, the slope is (change in y) ÷ (change in x) = ${withoutResult(work.text)}${stated}.`);
};

const targetSlopeReader = (label, scene, said) => {
  if (!/^(?:Slope of the perpendicular line|Slope of the other line|The correct perpendicular slope)$/.test(label)) return null;
  const target = targetOf(scene);
  if (!target) return null;
  const known = said.has('reference');
  said.add('reference');
  said.add('target');
  const work = negativeReciprocalWork(scene.reference.line.m);
  const why = scene.target.other ? 'the other line is perpendicular to it' : 'perpendicular slopes are negative reciprocals';
  return numberRead(target.m, (stated) => `${label}: ${sentences([known ? null : referenceSlopeText(scene), `${why}, so ${withoutLastAnswer(work.text)}${stated}`])}.`);
};

const targetInterceptReader = (label, scene, said) => {
  if (label !== 'Its y-intercept, b' || !said.has('target')) return null;
  const target = targetOf(scene);
  if (!target?.line) return null;
  const work = interceptWork(target.m, target.point);
  said.add('intercept');
  return numberRead(target.line.b, (stated) => `${label}: ${withoutResult(work.text)}${stated}.`);
};

const targetEquationReader = (label, scene, said) => {
  const origin = label === 'The perpendicular line through the origin, in slope-intercept form';
  if (!origin && !/^Equation(?: of the (?:perpendicular|other) line)? in slope-intercept form$/.test(label)) return null;
  if (!scene.target || (origin && scene.target.through)) return null;
  const target = targetOf(scene, origin ? [ZERO, ZERO] : scene.target.through);
  if (!target?.line) return null;
  const parts = [];
  if (!said.has('target')) {
    if (!said.has('reference')) parts.push(referenceSlopeText(scene));
    parts.push(`the perpendicular slope is its negative reciprocal: ${negativeReciprocalWork(scene.reference.line.m).text}`);
  }
  const knowsIntercept = said.has('intercept');
  if (!knowsIntercept) parts.push(interceptWork(target.m, target.point).text);
  said.add('reference');
  said.add('target');
  return lineRead(target.line, (stated) => (knowsIntercept
    ? `${label}: with m = ${num(target.m)} and b = ${num(target.line.b)}, the line is ${stated}.`
    : `${label}: ${sentences([...parts, `the line is ${stated}`])}.`));
};

// Horizontal and vertical lines, through a point or beside an axis or a given line.
const axisLineReader = (label) => {
  let kind = null;
  let point = null;
  let why = '';
  let match = new RegExp(`^(?:A|The) (horizontal|vertical) line through ${PT}$`).exec(label);
  if (match) {
    [kind, point] = [match[1], pointOf(match[2], match[3])];
  }
  match = new RegExp(`^The line through ${PT} that is (perpendicular|parallel) to the (x|y)-axis$`).exec(label);
  if (match) {
    const axisKind = match[4] === 'y' ? 'vertical' : 'horizontal';
    point = pointOf(match[1], match[2]);
    kind = match[3] === 'parallel' ? axisKind : (axisKind === 'vertical' ? 'horizontal' : 'vertical');
    why = `the ${match[4]}-axis is ${axisKind}, so this line is ${kind}${kind === axisKind ? ' too' : ''}, and `;
  }
  match = new RegExp(`^The line perpendicular to ([xy]) = (${NUM}) through ${PT}$`).exec(label);
  if (match) {
    if (!readNumber(match[2])) return null;
    const givenKind = match[1] === 'x' ? 'vertical' : 'horizontal';
    point = pointOf(match[3], match[4]);
    kind = givenKind === 'vertical' ? 'horizontal' : 'vertical';
    why = `${match[1]} = ${match[2]} is a ${givenKind} line, so a line perpendicular to it is ${kind}, and `;
  }
  if (!kind || !point) return null;
  const line = kind === 'horizontal' ? { vertical: false, m: ZERO, b: point[1] } : { vertical: true, x: point[0] };
  const coordinate = kind === 'horizontal' ? 'y' : 'x';
  return lineRead(line, (stated) => `${label}: ${why}every point on it has the same ${coordinate}-coordinate as ${pt(point)}: ${stated}.`);
};

const AXIS_SLOPES = Object.freeze({
  horizontal: ['0', 'a horizontal line rises 0 for any run, and 0 ÷ run = 0'],
  vertical: ['undefined', 'a vertical line has a run of 0, and you cannot divide by 0'],
});
const axisSlopeReader = (label, scene, said, question, field) => {
  let kind = null;
  let lead = '';
  let match = /^The slope of (?:every|the) (horizontal|vertical) line is …$/.exec(label);
  if (match) kind = match[1];
  match = /^The slope of the line (perpendicular|parallel) to the (x|y)-axis is …$/.exec(label);
  if (match) {
    const axisKind = match[2] === 'y' ? 'vertical' : 'horizontal';
    kind = match[1] === 'parallel' ? axisKind : (axisKind === 'vertical' ? 'horizontal' : 'vertical');
    lead = `the ${match[2]}-axis is ${axisKind}, so this line is ${kind}: `;
  }
  if (!kind) return null;
  const [word, why] = AXIS_SLOPES[kind];
  return choiceRead(optionNamed(field, word), (stated) => `${leadOf(label)} ${stated}: ${lead}${why}.`);
};

const changeReader = (label) => {
  const match = /^On any (horizontal|vertical) line, when (x|y) increases by 1, (x|y) changes by …$/.exec(label);
  if (!match) return null;
  const [, kind, moves, changes] = match;
  const fits = kind === 'horizontal' ? moves === 'x' && changes === 'y' : moves === 'y' && changes === 'x';
  if (!fits) return null;
  return numberRead(ZERO, (stated) => `${leadOf(label)} ${stated}: every point on a ${kind} line has the same ${changes}-coordinate, so ${changes} does not change.`);
};

const FACTS = Object.freeze([
  [/^All vertical lines are parallel\.$/, 'Always true', 'every vertical line goes straight up and down, so two different vertical lines never meet'],
  [/^All horizontal lines are parallel\.$/, 'Always true', 'every horizontal line goes straight across, so two different horizontal lines never meet'],
  [/^Any vertical line and any horizontal line are …$/, 'perpendicular', 'one goes straight up and down and the other straight across, so they meet at a right angle'],
]);
const factReader = (label, scene, said, question, field) => {
  const fact = FACTS.find(([pattern]) => pattern.test(label));
  if (!fact) return null;
  return choiceRead(optionNamed(field, fact[1]), (stated) => (waitsForAnswer(label)
    ? `${leadOf(label)} ${stated}: ${fact[2]}.`
    : `${leadOf(label)}: ${stated}. ${capitalize(fact[2])}.`));
};

const perpendicularVerdictReader = (label, scene, said, question, field) => {
  const match = /^Are lines ([A-Za-z]′?) and ([A-Za-z]′?) perpendicular\?$/.exec(label);
  const first = match && scene.lines.get(match[1]);
  const second = match && scene.lines.get(match[2]);
  if (!first || !second || first.line.vertical || second.line.vertical) return null;
  // Only "yes": which of several "No — …" reasons is the right one is not a slope fact.
  if (!arePerpendicular(first.line, second.line)) return null;
  const product = multiply(first.line.m, second.line.m);
  return choiceRead(onlyOption(field, /^Yes\b/), (stated) => endSentence(`${leadOf(label)}? Their slopes multiply to ${factor(first.line.m)} × ${factor(second.line.m)} = ${num(product)}, so they meet at a right angle: ${stated}`));
};

const rectangleReader = (label, scene, said, question, field) => {
  const match = /^Is ([A-Z]{4}) a rectangle\?$/.exec(label);
  if (!match || !scene.quadrilateral || match[1] !== scene.quadrilateral.join('')) return null;
  const names = scene.quadrilateral;
  const corners = names.map((name) => scene.points.get(name));
  const sides = corners.map((corner, index) => lineThrough(corner, corners[(index + 1) % 4]));
  if (sides.some((side) => !side || side.vertical)) return null;
  const sideName = (index) => `${names[index]}${names[(index + 1) % 4]}`;
  const unequal = [[0, 2], [1, 3]].filter(([first, second]) => !areParallel(sides[first], sides[second]));
  const perpendicular = arePerpendicular(sides[0], sides[1]);
  if (unequal.length) {
    // Not a parallelogram: that alone settles it.
    const differ = unequal.map(([first, second]) => `${sideName(first)} has slope ${num(sides[first].m)} but ${sideName(second)} has slope ${num(sides[second].m)}`).join(', and ');
    return choiceRead(onlyOption(field, /^No\b.*\bnot parallel\b/), (stated) => endSentence(`${leadOf(label)}? ${capitalize(differ)}, so ${unequal.length === 2 ? 'opposite sides are' : 'those opposite sides are'} not parallel: ${stated}`));
  }
  const opposite = `${sideName(0)} and ${sideName(2)} both have slope ${num(sides[0].m)}, and ${sideName(1)} and ${sideName(3)} both have slope ${num(sides[1].m)}, so opposite sides are parallel`;
  const product = multiply(sides[0].m, sides[1].m);
  const corner = perpendicular
    ? `${factor(sides[0].m)} × ${factor(sides[1].m)} = −1, so sides that meet at a corner are perpendicular`
    : `${factor(sides[0].m)} × ${factor(sides[1].m)} = ${num(product)}, not −1, so sides that meet at a corner are not perpendicular`;
  const option = perpendicular ? onlyOption(field, /^Yes\b/) : onlyOption(field, /^No\b.*\bnot perpendicular\b/);
  return choiceRead(option, (stated) => endSentence(`${leadOf(label)}? ${capitalize(opposite)}. ${capitalize(corner)}: ${stated}`));
};

const whoReader = (label, scene, said, question, field) => {
  if (label !== 'Who is correct?' || !scene.claims) return null;
  const named = [...scene.lines.values()];
  if (named.length !== 2 || named.some((entry) => entry.line.vertical)) return null;
  const [first, second] = named;
  const perpendicular = arePerpendicular(first.line, second.line);
  const right = perpendicular ? scene.claims.yes : scene.claims.no;
  const product = multiply(first.line.m, second.line.m);
  const reason = perpendicular
    ? `the slopes multiply to ${num(product)}, so the lines are perpendicular`
    : `perpendicular slopes multiply to −1, and these multiply to ${num(product)}, so the lines are not perpendicular, however they look on a sketch`;
  return choiceRead(onlyOption(field, new RegExp(`^${right}\\b`)), (stated) => endSentence(`${leadOf(label)}? ${capitalize(reason)}: ${stated}`));
};

const claimReader = (label, scene, said, question, field) => {
  const match = /^Is ([A-Z][a-z]+) correct\?$/.exec(label);
  if (!match || !scene.claim || scene.claim.who !== match[1] || scene.reference.via !== 'equation') return null;
  const { m } = scene.reference.line;
  const claimed = scene.claim.slope;
  const right = divide(MINUS_ONE, m);
  const missed = (half) => `${num(claimed)} is only the ${half} of ${num(m)}: ${factor(m)} × ${factor(claimed)} = ${num(multiply(m, claimed))}, not −1. The negative reciprocal is ${num(right)}`;
  let option = null;
  let reason = '';
  if (equals(claimed, right)) {
    option = onlyOption(field, /^Yes\b/);
    reason = `${num(claimed)} is the negative reciprocal of ${num(m)}: ${factor(m)} × ${factor(claimed)} = −1`;
  } else if (equals(claimed, negate(m))) {
    option = onlyOption(field, /^No\b.*\btook the opposite\b.*\bforgot the reciprocal\b/);
    reason = missed('opposite');
  } else if (equals(claimed, divide(ONE, m))) {
    option = onlyOption(field, /^No\b.*\btook the reciprocal\b.*\bforgot the opposite\b/);
    reason = missed('reciprocal');
  }
  if (!option) return null;
  said.add('reference');
  return choiceRead(option, (stated) => endSentence(`${leadOf(label)}? ${sentences([capitalize(referenceSlopeText(scene)), reason])}: ${stated}`));
};

const READERS = Object.freeze([
  reciprocalReader,
  pairReader,
  rotationReader,
  segmentSlopeReader,
  namedLineSlopeReader,
  productReader,
  namedLineEquationReader,
  referenceSlopeReader,
  targetSlopeReader,
  targetInterceptReader,
  targetEquationReader,
  axisLineReader,
  axisSlopeReader,
  changeReader,
  factReader,
  perpendicularVerdictReader,
  rectangleReader,
  whoReader,
  claimReader,
]);

/*
 * THE PROOF: "Line p passes through O(0, 0) and R(a, b), so its slope is
 * m₁ = b/a. Rotate R 90° CLOCKWISE about O to get point D on line q." Its parts
 * are letters, not numbers, so it is read on its own: the turn's rule, the
 * slope from O, the product, and the name of the relation.
 */
const PROOF = /^Worked example, then you prove it\. Line ([a-z]) passes through O\(0, 0\) and ([A-Z])\(([a-z]), ([a-z])\), so its slope is m₁ = \4\/\3\. Rotate \2 90° (CLOCKWISE|COUNTERCLOCKWISE) about O to get point ([A-Z]) on line ([a-z])\.$/;
const sameLetters = (a, b) => ascii(a).replace(/\s+/g, '') === ascii(b).replace(/\s+/g, '');
const letterOption = (field, wanted) => {
  const found = optionsOf(field).filter((option) => sameLetters(option, wanted));
  return found.length === 1 ? found[0] : null;
};
const proofModel = (question) => {
  const match = PROOF.exec(squash(question.prompt));
  if (!match) return null;
  const [, , R, a, b, turn, D, q] = match;
  if (a === b || ['O', D].includes(R) || D === 'O') return null;
  const clockwise = turn === 'CLOCKWISE';
  // 90° clockwise: (x, y) → (y, −x); counterclockwise: (x, y) → (−y, x). Either way m₂ = −a/b.
  const [x, y] = clockwise ? [b, `−${a}`] : [`−${b}`, a];
  const image = `(${x}, ${y})`;
  const rule = clockwise ? '(x, y) to (y, −x)' : '(x, y) to (−y, x)';
  const slope = `−${a}/${b}`;
  const reads = [];
  for (const field of list(question.answerFields)) {
    const label = labelOf(field);
    let read = null;
    if (label === `The coordinates of ${D} are …`) {
      read = choiceRead(letterOption(field, image), (stated) => `${leadOf(label)} ${stated}: a 90° ${clockwise ? 'clockwise' : 'counterclockwise'} turn about O sends ${rule}, so ${R}(${a}, ${b}) goes to ${D}${image}.`);
    } else if (label === `The slope of line ${q} is m₂ = …`) {
      read = choiceRead(letterOption(field, slope), (stated) => `${leadOf(label)} ${stated}: line ${q} passes through O(0, 0) and ${D}${image}, so m₂ = (${y} − 0) ÷ (${x} − 0) = ${stated}.`);
    } else if (label === 'So m₁ · m₂ = ?') {
      read = numberRead(MINUS_ONE, (stated) => `${leadOf(label)} ${stated}: (${b}/${a}) × (−${a}/${b}) = −(${b}·${a})/(${a}·${b}), and ${b}·${a} is the same product as ${a}·${b}, so it is ${stated}.`);
    } else if (label === 'This proves that the slopes of perpendicular lines are …') {
      read = choiceRead(optionNamed(field, 'negative reciprocals'), (stated) => `${leadOf(label)} ${stated}: m₂ = −${a}/${b} is m₁ = ${b}/${a} flipped over, with its sign changed.`);
    }
    if (!read) return null;
    reads.push({ field, read });
  }
  if (!reads.length) return null;
  return { kind: 'proof', reads, headline: `A 90° turn about the origin swaps the two coordinates and changes one sign. Follow ${R}(${a}, ${b}) through the turn, then compare the two slopes.` };
};

/* ---------------------------------------------------------------------------
 * The key check: the reading must BE the item's key.
 * ------------------------------------------------------------------------- */

const readPair = (value) => {
  const match = new RegExp(`^\\s*${PT}\\s*$`).exec(text(value));
  return match ? pointOf(match[1], match[2]) : null;
};

const agreesWithKey = (field, read) => {
  const key = field?.answer;
  if (key === null || key === undefined || typeof key === 'object') return false;
  if (read.kind === 'choice') return text(key) === read.truth && optionsOf(field).includes(read.truth);
  if (read.kind === 'number') {
    const value = readNumber(key);
    return Boolean(value) && equals(value, read.truth);
  }
  if (read.kind === 'line') return sameLine(lineOfEquation(key), read.truth);
  if (read.kind === 'pair') return samePoint(readPair(key), read.truth);
  return false;
};

const HEADLINES = Object.freeze({
  rotation: 'A turn about the origin moves every point by one rule. Apply each turn’s rule to the point.',
  reciprocal: 'To find a reciprocal, flip the number and keep its sign. For a negative reciprocal, flip it and change the sign.',
  rectangle: 'Use slopes: opposite sides of a rectangle are parallel (equal slopes), and sides that meet at a corner are perpendicular (slopes that multiply to −1).',
  perpendicular: 'Perpendicular lines have slopes that are negative reciprocals: flip the slope and change its sign. The two slopes multiply to −1.',
  axis: 'A horizontal line keeps the same y-coordinate, so it is y = that number, and its slope is 0. A vertical line keeps the same x-coordinate, so it is x = that number, and its slope is undefined: its run is 0.',
});
const AXIS_READERS = new Set([axisLineReader, axisSlopeReader, changeReader, factReader]);
const headlineFor = (reads, scene) => {
  const used = new Set(reads.map(({ reader }) => reader));
  if (used.has(rotationReader)) return HEADLINES.rotation;
  if (used.has(rectangleReader)) return HEADLINES.rectangle;
  if ([...used].every((reader) => reader === reciprocalReader)) return HEADLINES.reciprocal;
  if ([...used].every((reader) => AXIS_READERS.has(reader))) return HEADLINES.axis;
  if (scene.lines.size || scene.target || scene.pair) return HEADLINES.perpendicular;
  return null;
};

const multiAnswerModel = (question) => {
  const fields = list(question.answerFields);
  if (!fields.length || fields.some((field) => !text(field?.id) || !labelOf(field))) return null;
  const proof = proofModel(question);
  if (proof) return proof.reads.every(({ field, read }) => agreesWithKey(field, read)) ? proof : null;
  const scene = readScene(squash(question.prompt));
  if (!scene) return null;
  const said = new Set();
  const reads = [];
  for (const field of fields) {
    const label = labelOf(field);
    let found = null;
    for (const reader of READERS) {
      const read = reader(label, scene, said, question, field);
      if (read) {
        found = { field, read, reader };
        break;
      }
    }
    if (!found || !agreesWithKey(field, found.read)) return null;
    reads.push(found);
  }
  const headline = headlineFor(reads, scene);
  return headline ? { kind: 'parts', reads, headline } : null;
};

/* ---------------------------------------------------------------------------
 * The workflow steps: a sort into perpendicular / parallel / neither, and a
 * choice of one line.
 * ------------------------------------------------------------------------- */

const CATEGORY_WORDS = Object.freeze({ perpendicular: /^Perpendicular\b/i, parallel: /^Parallel\b/i, neither: /^Neither\b/i });
/** { perpendicular, parallel, neither } → { id, label }, or null unless the stage has exactly those three. */
const categoriesOf = (stage) => {
  const categories = matchCategories(stage);
  if (categories.length !== 3) return null;
  const byVerdict = {};
  for (const [verdict, pattern] of Object.entries(CATEGORY_WORDS)) {
    const found = categories.filter((category) => pattern.test(text(category.label)));
    if (found.length !== 1 || !text(found[0].id)) return null;
    byVerdict[verdict] = { id: text(found[0].id), label: text(found[0].label) };
  }
  return byVerdict;
};

// "m₁ = 2 and m₂ = −1/2", "m₁ = 0 and m₂ is undefined"
const SLOPE_SIDE = `(?:= (${NUM})|is undefined)`;
const slopePairOf = (cardText) => {
  const match = new RegExp(`^m₁ ${SLOPE_SIDE} and m₂ ${SLOPE_SIDE}$`).exec(squash(cardText));
  if (!match) return null;
  const side = (written) => (written === undefined ? { undefined: true } : { value: readNumber(written), written: written.replace(/-/g, '−') });
  const pair = [side(match[1]), side(match[2])];
  return pair.every((entry) => entry.undefined || entry.value) ? pair : null;
};
const pairVerdict = ([first, second]) => {
  if (first.undefined || second.undefined) {
    if (first.undefined && second.undefined) return { verdict: 'parallel', why: 'both slopes are undefined, so both lines are vertical' };
    const other = first.undefined ? second : first;
    return isZero(other.value)
      ? { verdict: 'perpendicular', why: 'a slope of 0 is a horizontal line and an undefined slope is a vertical line' }
      : { verdict: 'neither', why: `an undefined slope is a vertical line, and a slope of ${other.written} is not horizontal` };
  }
  if (equals(first.value, second.value)) {
    // −0.25 beside −1/4: say they are the same number first.
    const otherSpelling = [first, second].find((side) => side.written !== num(side.value));
    return { verdict: 'parallel', why: otherSpelling ? `${otherSpelling.written} is ${num(otherSpelling.value)}, the same slope` : 'the slopes are equal' };
  }
  const product = multiply(first.value, second.value);
  if (equals(product, MINUS_ONE)) return { verdict: 'perpendicular', why: `${factor(first.value)} × ${factor(second.value)} = −1` };
  return { verdict: 'neither', why: `the slopes are not equal, and ${factor(first.value)} × ${factor(second.value)} = ${num(product)}, not −1` };
};

/** Two grid points of a card's line inside its window: where the student can read the slope off the graph. */
const graphPoints = (line, graph) => {
  const inside = ([x, y]) => [['xMin', x, -1], ['xMax', x, 1], ['yMin', y, -1], ['yMax', y, 1]].every(([key, value, side]) => {
    const bound = Number(graph?.[key]);
    if (!Number.isFinite(bound)) return false;
    return side < 0 ? toNumber(value) >= bound : toNumber(value) <= bound;
  });
  for (const start of [0, 1, -1, 2, -2, 3, -3]) {
    const first = [rational(start), add(multiply(line.m, rational(start)), line.b)];
    const second = [add(first[0], rational(line.m.d)), add(first[1], rational(line.m.n))];
    if (isInteger(first[1]) && inside(first) && inside(second)) return [first, second];
  }
  return null;
};

// How a card's equation is written (spaces removed, ASCII minus): y = mx + b
// with m a whole number, a decimal, a/b or (a/b); y − y₁ = m(x − x₁).
const SLOPE_INTERCEPT_RIGHT = /^-?(?:\d+(?:\.\d+)?(?:\/\d+)?|\(\d+\/\d+\))?x(?:[+-]\d+(?:\.\d+)?(?:\/\d+)?)?$/;
const POINT_SLOPE_LEFT = /^y[+-]\d+(?:\.\d+)?$/;
const POINT_SLOPE_RIGHT = /^-?(?:\d+(?:\.\d+)?(?:\/\d+)?|\(\d+\/\d+\))\(x[+-]\d+(?:\.\d+)?\)$/;

/**
 * One card of a sort against a reference line: its line, what the card shows
 * ("a graph", or its equation), and how the slope is read from it.
 */
const cardLine = (item) => {
  if (isObject(item.graph) && text(item.graph.model) && !text(item.math) && !text(item.text)) {
    const value = parseLinear(item.graph.model);
    if (!value || !isZero(value.y)) return null;
    const line = { vertical: false, m: value.x, b: value.c };
    const points = graphPoints(line, item.graph);
    if (!points) return null;
    const rise = rational(line.m.n);
    const move = isZero(rise) ? 'level' : `${rise.n < 0 ? 'falling' : 'rising'} ${num(absolute(rise))} for each ${line.m.d} to the right`;
    return { line, what: 'a graph', how: `it passes through ${pt(points[0])} and ${pt(points[1])}, ${move}, so its slope is ${num(line.m)}` };
  }
  const math = text(item.math);
  if (!math || item.graph || text(item.text)) return null;
  const parts = equationParts(math);
  const line = lineOfEquation(math);
  if (!parts || !line || line.vertical) return null;
  const written = squash(math);
  const [left, right] = ascii(written).split('=').map((side) => side.replace(/\s+/g, ''));
  if (left === 'y' && SLOPE_INTERCEPT_RIGHT.test(right)) return { line, what: written, how: `it is in the form y = mx + b, so its slope is ${num(line.m)}` };
  if (POINT_SLOPE_LEFT.test(left) && POINT_SLOPE_RIGHT.test(right)) {
    return { line, what: written, how: `it is in point-slope form, y − y₁ = m(x − x₁), so its slope is ${num(line.m)}` };
  }
  // Solve for y: the y-term alone on one side, then divide by its coefficient.
  const { A, B, C } = parts;
  const onlyY = isZero(parts.left.x) && isZero(parts.left.c) && isZero(parts.right.y);
  let solved = `get the y-term alone, ${termIn(B, 'y')} = ${rightSide(negate(A), negate(C))}, then divide both sides by ${paren(B)} to get ${lineText(line)}`;
  if (onlyY && equals(B, ONE)) solved = `written as y = mx + b, it is ${lineText(line)}`;
  else if (onlyY) solved = `divide both sides by ${paren(B)} to get ${lineText(line)}`;
  else if (equals(B, ONE)) solved = `get the y-term alone: ${lineText(line)}`;
  return { line, what: written, how: `${solved}, so its slope is ${num(line.m)}` };
};

const sortModel = (composed) => {
  const stage = composed.workflow[0];
  const key = composed.grading?.[stage.id]?.match;
  const categories = categoriesOf(stage);
  const items = matchItems(stage);
  if (!isObject(key) || !categories || !items.length || Object.keys(key).length !== items.length) return null;
  const noun = figureNoun(stage);
  const verdictOfCategory = Object.fromEntries(Object.entries(categories).map(([verdict, category]) => [category.id, verdict]));
  const referenceMatch = new RegExp(`^The reference line is ${EQ}\\. Sort each line\\b`).exec(squash(stage.prompt));
  let reference = null;
  if (referenceMatch) {
    const line = lineOfEquation(referenceMatch[1]);
    if (!line || line.vertical || isZero(line.m)) return null;
    reference = { line, display: squash(referenceMatch[1]) };
  }
  const reads = [];
  for (const [index, item] of items.entries()) {
    const id = text(item.id);
    const name = figureLabel(index, noun);
    let verdict = null;
    let step = '';
    if (reference) {
      const card = cardLine(item);
      if (!card || sameLine(card.line, reference.line)) return null;
      const product = multiply(card.line.m, reference.line.m);
      let verdictText = '';
      if (areParallel(card.line, reference.line)) {
        verdict = 'parallel';
        verdictText = 'That is the reference line’s slope, so it is parallel.';
      } else if (equals(product, MINUS_ONE)) {
        verdict = 'perpendicular';
        verdictText = `${factor(card.line.m)} × ${factor(reference.line.m)} = −1, so it is perpendicular.`;
      } else {
        verdict = 'neither';
        verdictText = `That is not ${num(reference.line.m)}, and ${factor(card.line.m)} × ${factor(reference.line.m)} = ${num(product)}, not −1, so it is neither.`;
      }
      step = `${name}, ${card.what}: ${card.how}. ${verdictText}`;
    } else {
      const pair = !item.graph && !text(item.math) ? slopePairOf(item.text) : null;
      if (!pair) return null;
      const read = pairVerdict(pair);
      verdict = read.verdict;
      step = `${name}, ${squash(item.text)}: ${read.why}, so the lines are ${verdict === 'neither' ? 'neither parallel nor perpendicular' : verdict}.`;
    }
    if (verdictOfCategory[text(key[id])] !== verdict) return null;
    reads.push({ id, verdict, step });
  }
  const headline = reference
    ? `The reference line ${reference.display} has slope ${num(reference.line.m)}. A parallel line has the same slope; a perpendicular line has the negative reciprocal, ${num(divide(MINUS_ONE, reference.line.m))}.`
    : 'Parallel lines have equal slopes. Perpendicular slopes multiply to −1, or one line is horizontal (slope 0) and the other vertical (undefined slope).';
  return { kind: 'sort', stage, composed, categories, reads, headline, noun };
};

const choiceModel = (question, composed) => {
  const stage = composed.workflow[0];
  const keyId = composed.grading?.[stage.id];
  if (typeof keyId !== 'string' || !text(keyId)) return null;
  const choices = list(stage.choices).map((choice) => (isObject(choice) ? { id: text(choice.id), label: squash(choice.label) } : null));
  if (!choices.length || choices.some((choice) => !choice?.id || !choice.label)) return null;
  const prompt = squash(stage.prompt || question.prompt);
  let truth = null;
  let steps = [];
  let headline = '';
  const throughNamed = new RegExp(`\\bLine ([a-z]) passes through ([A-Z])${PT} and ([A-Z])${PT}\\. Which equation describes line \\1\\?`).exec(prompt);
  const perpendicularTo = new RegExp(`\\bWhich line is perpendicular to ${EQ} AND passes through ${PT}\\?`, 'i').exec(prompt);
  if (throughNamed && !perpendicularTo) {
    const [, name, P, px, py, Q, qx, qy] = throughNamed;
    const first = pointOf(px, py);
    const second = pointOf(qx, qy);
    truth = first && second ? lineThrough(first, second) : null;
    if (!truth) return null;
    if (truth.vertical || isZero(truth.m)) {
      const [coordinate, value, kind] = truth.vertical ? ['x', truth.x, 'vertical'] : ['y', truth.b, 'horizontal'];
      steps = [`${P}${pt(first)} and ${Q}${pt(second)} have the same ${coordinate}-coordinate, ${num(value)}, so line ${name} is ${kind}: every point on it has ${coordinate} = ${num(value)}.`];
      headline = 'Two points with the same y-coordinate lie on a horizontal line, y = that value. Two points with the same x-coordinate lie on a vertical line, x = that value.';
    } else {
      steps = [`The slope from ${P}${pt(first)} to ${Q}${pt(second)} is ${slopeWork(first, second).text}.`, `${capitalize(interceptWork(truth.m, first).text)}.`];
      headline = 'Find the slope between the two points, then put one of them into y = mx + b to find b.';
    }
  } else if (perpendicularTo && !throughNamed) {
    const given = lineOfEquation(perpendicularTo[1]);
    const point = pointOf(perpendicularTo[2], perpendicularTo[3]);
    if (!given || !point || given.vertical || isZero(given.m)) return null;
    truth = perpendicularThrough(given, point);
    const display = squash(perpendicularTo[1]);
    steps = [
      `The given line ${display} is in the form y = mx + b, so its slope is ${num(given.m)}. A perpendicular line has the negative reciprocal slope: ${negativeReciprocalWork(given.m).text}.`,
      `${capitalize(interceptWork(truth.m, point).text)}.`,
      `Check: ${factor(truth.m)} × ${factor(given.m)} = −1, and ${factor(truth.m)}(${num(point[0])}) ${truth.b.n < 0 ? '−' : '+'} ${num(absolute(truth.b))} = ${num(point[1])}.`,
    ];
    headline = 'A perpendicular line has the negative reciprocal slope. Then put the point into y = mx + b to find b.';
  }
  if (!truth) return null;
  const right = choices.filter((choice) => sameLine(lineOfEquation(choice.label), truth));
  if (right.length !== 1 || right[0].id !== text(keyId)) return null;
  return { kind: 'choice', stage, composed, choice: right[0], steps, headline };
};

const workflowModel = (question) => {
  if (!['figureMatch', 'graphChoicePreview'].includes(text(question.type))) return null;
  let composed = null;
  try { composed = readComposedQuestion(question); } catch { composed = null; }
  if (!composed?.composed || composed.workflow.length !== 1 || !isObject(composed.grading)) return null;
  const [stage] = composed.workflow;
  if (stage.kind === 'figureMatch') return sortModel(composed);
  if (stage.kind === 'multipleChoice') return choiceModel(question, composed);
  return null;
};

/* ---------------------------------------------------------------------------
 * The model of one question, cached against its own content.
 * ------------------------------------------------------------------------- */

const MODEL_CACHE = new WeakMap();
const buildModel = (question) => (text(question.type) === 'multiAnswer' ? multiAnswerModel(question) : workflowModel(question));
const modelFor = (question) => {
  if (!isObject(question)) return null;
  let fingerprint = null;
  try { fingerprint = JSON.stringify(question); } catch { fingerprint = null; }
  const cached = MODEL_CACHE.get(question);
  if (cached && fingerprint !== null && cached.fingerprint === fingerprint) return cached.model;
  let model = null;
  try { model = buildModel(question); } catch { model = null; }
  if (fingerprint !== null) MODEL_CACHE.set(question, { fingerprint, model });
  return model;
};

export const matches = (question) => Boolean(modelFor(question));
export const questionKind = (question) => modelFor(question)?.kind || null;

// Nothing while the question is open (see the top of this file).
export const hints = () => [];
export const expectedValues = () => [];
export const backUpQuestion = () => null;
export const similarProblem = () => null;

/* ---------------------------------------------------------------------------
 * workedSolution: THIS question, part by part, for the review panel once the
 * question is closed (closedQuestionReview.js). Each part's answer is written
 * in the first spelling that part's own grader accepts.
 * ------------------------------------------------------------------------- */

const fieldAccepts = (field, spelling) => {
  try {
    return Boolean(text(spelling)) && matchesFieldAnswer(text(spelling), field);
  } catch {
    return false;
  }
};
const spellingsOf = (read) => {
  if (read.kind === 'choice') return [read.truth];
  if (read.kind === 'number') return [num(read.truth), rationalText(read.truth)];
  if (read.kind === 'line') return [lineText(read.truth), ascii(lineText(read.truth))];
  if (read.kind === 'pair') return [pt(read.truth), ascii(pt(read.truth))];
  return [];
};
/** One part of the summary: "Slope of AB: 1/2", "The slope of every vertical line is undefined" (a choice's closing period left out). */
const summaryPart = (label, stated) => {
  const shown = stated.replace(/\.$/, '');
  return waitsForAnswer(label) ? `${leadOf(label)} ${shown}` : `${leadOf(label)}: ${shown}`;
};

const stageAccepts = (stage, composed, response) => {
  try {
    return gradeStage({ stage, rule: composed.grading[stage.id], responses: { [stage.id]: response }, stages: composed.workflow }).isCorrect === true;
  } catch {
    return false;
  }
};

const workedParts = (model) => {
  const steps = [];
  const summary = [];
  for (const { field, read } of model.reads) {
    const stated = spellingsOf(read).find((spelling) => fieldAccepts(field, spelling));
    if (!stated) return null;
    steps.push(read.say(stated));
    summary.push(summaryPart(labelOf(field), stated));
  }
  return { headline: model.headline, steps, answerSummary: `${summary.join('; ')}.` };
};

const workedSort = (model) => {
  const { stage, composed, categories, reads, noun } = model;
  const placements = Object.fromEntries(reads.map(({ id, verdict }) => [id, categories[verdict].id]));
  if (!stageAccepts(stage, composed, buildFigureMatchResponse(stage, placements))) return null;
  const items = matchItems(stage);
  const summary = matchCategories(stage).map((category) => {
    const numbers = items.map((item, index) => (placements[text(item.id)] === text(category.id) ? String(index + 1) : null)).filter(Boolean);
    if (!numbers.length) return null;
    const what = numbers.length === 1 ? noun.toLowerCase() : `${noun.toLowerCase()}s`;
    return `${text(category.label)}: ${what} ${joinList(numbers)}`;
  }).filter(Boolean);
  return { headline: model.headline, steps: reads.map(({ step }) => step), answerSummary: `${summary.join('; ')}.` };
};

const workedChoice = (model) => {
  const { stage, composed, choice } = model;
  if (!stageAccepts(stage, composed, choice.id)) return null;
  return { headline: model.headline, steps: [...model.steps, `So the line is ${choice.label}.`], answerSummary: choice.label };
};

// What a step must never print: a JS leak, a doubled or dangling sign, a 1 or
// −0 left in front of a term. "undefined" may only be the slope word: "is
// undefined", "undefined slope", or the stated answer itself.
const SLOPPY = /NaN|Infinity|\bnull\b|\[object|[+−-]\s*[+−-]\s*\d|(?<![\d./])[-−]0(?![\d./])|(?<![\d.)/])1[xy]\b|\(\s*\+|\+\s*\)/;
const SLOPE_WORD = /\b(?:is|are) undefined\b|\bundefined slope\b|: undefined(?=[.;]|$)/g;
const leaksUndefined = (line) => /undefined/.test(line.replace(SLOPE_WORD, ''));

export const workedSolution = (question) => {
  try {
    const model = modelFor(question);
    if (!model) return null;
    const worked = model.kind === 'sort' ? workedSort(model) : model.kind === 'choice' ? workedChoice(model) : workedParts(model);
    if (!worked || !worked.steps.length || !text(worked.answerSummary)) return null;
    const lines = [worked.headline, ...worked.steps, worked.answerSummary].map(text);
    if (lines.some((line) => !line || SLOPPY.test(line) || leaksUndefined(line))) return null;
    return { headline: text(worked.headline), steps: worked.steps.map(text), answerSummary: text(worked.answerSummary) };
  } catch {
    return null;
  }
};
