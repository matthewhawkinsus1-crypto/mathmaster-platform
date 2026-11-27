// Question family: Algebra I linear reasoning in answer boxes — multiAnswer items (studentActions multipleResponses) on linear equations and their solution counts, linear inequalities in one and two variables, systems of linear equations and of linear inequalities, the intercepts of a linear model, and shifts and stretches of a linear function. It speaks only through its worked sibling ("See a similar problem worked").
//
// Contract (./index.js):
//   matches(question)            → true when this family has a sibling for the question's skill
//   hints(question)              → [] (see WHAT A STUDENT SEES WHILE THE ITEM IS OPEN)
//   similarProblem(question, { seed }) → { prompt, steps: [text], answer: text } | null
//                                  a worked sibling with DIFFERENT numbers and a different
//                                  situation, each step saying why it is done
//   expectedValues(question)     → []
//   backUpQuestion(question)     → null (the item's own scaffold, or the platform's, is kept)
// `implemented` stays false until the family is real: the index skips it.
//
// WHY IT EXISTS (WE-I). The Algebra I Module 3 lessons ask most of their
// Classwork as multi-part answer boxes (an equation, a value, a verdict, an
// inequality, one per field), and no family claimed them, so a student met each
// new skill there with no example to open. This family works one sibling per
// skill: the same task on new numbers, in a new situation.
//
// WHAT A STUDENT SEES WHILE THE ITEM IS OPEN. Exactly what they saw before this
// family existed, plus the sibling. A family that claims an item is also asked
// for hints, a back-up step and extra answer spellings for the hint guard; this
// one returns none of them (the perpendicularLines precedent, CT02), so the
// item's authored hints and scaffold are unchanged. Its own sibling check uses
// more spellings of the item's answers than the platform's (below).
//
// WHAT IT OWNS (after every other family in the index, so it only ever takes an
// item no family above claims). An item is claimed only when all hold:
//   - its type is multiAnswer and its first student action multipleResponses;
//   - its primary standard is an Algebra I one ("A.", never "A2.");
//   - its prompt and field labels are one of the KINDS below, recognised from
//     the mathematics the student is shown (an equation, an inequality, a rule,
//     a graph's lines) and the words of its fields;
//   - no field asks the student to NAME a property of equality (the sibling
//     would have to name the same properties, and they are the answers);
//   - the sibling it works passes the checks under SAFETY.
//
//   inequalityModel     a linear sales or savings model S(n) = rn + s (or its
//                       graph) and a goal: write the inequality, solve it,
//                       answer with whole numbers, closed or open dot (A.5B);
//                       two such models compared when the prompt gives two.
//   inequalityReverse   a one-variable inequality whose solving divides by a
//                       negative number: solved two ways, a decreasing model
//                       h(m) = A − km, or a coefficient that is a letter (A.5B).
//   solutionCount       how many solutions a linear equation has, and the
//                       value of a letter that makes it none or infinitely many
//                       (A.5A).
//   verifySolution      checking a solution by substituting it into both sides
//                       of equations built from it (A.5A).
//   systemWord          a situation with two unknowns written as a system,
//                       then solved by substitution (A.2I, A.2C, A.3G).
//   systemSubstitution  a given system solved by substitution and checked in
//                       both equations; the point where two graphs cross
//                       (A.2I, A.5C, A.3G).
//   systemCases         parallel lines, the same line, and lines that cross:
//                       what substitution leaves in each case, and a letter
//                       that decides the case (A.2I, A.3F, A.5C).
//   linearIntercepts    the intercepts, slope and reasonable domain of a linear
//                       model in standard form or as a decreasing rule (A.3C,
//                       A.2A, A.3B).
//   twoVariableContext  a linear inequality in two variables written from a
//                       situation, and points tested against it (A.2H, A.3D).
//   inequalityGraph     the inequality a half-plane shows: boundary, solid or
//                       dashed, above or below, a test point (A.2H, A.3D).
//   inequalitySystemPoints  a system of two linear inequalities: written from a
//                       situation, points tested against each one (A.3H, A.2H).
//   inequalitySystemRegion  which region a system's solutions fill: above both
//                       lines, below both, between, or none (A.3H).
//   linearShift         a linear function shifted up, down, left or right, or
//                       stretched in its inputs or outputs (A.3E).
//
// SAFETY. The sibling is generated, never copied:
//   - its numbers and its situation are drawn from the seed and the item's
//     visible text, and it is offered only when its prompt, every step and its
//     answer avoid every answer of the item: each field's key and accepted
//     answers, in the spellings a step could use (≤ for <=, − for -, spaces
//     around signs, (1/2)x for 1/2x), compared by the platform's own guard
//     (hintRevealsAnswer); the platform runs similarExampleIsSafe after this;
//   - a sibling that decides a case (no solution, the same line, which region)
//     works every case side by side, so it never says which case the item is;
//   - its prompt is not the item's, and its equations are not the item's.
//
// Pure: no React, no I/O.
import { firstSafeSibling } from './siblingGuard.js';

export const family = 'linearReasoning';
export const implemented = true;

const text = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const MINUS = '−';

/* ---------------------------------------------------------------------------
 * Numbers, as a student reads them.
 * ------------------------------------------------------------------------- */

const gcd = (a, b) => {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x || 1;
};

/** 3 → "3", −2.5 → "−2.5", 1600 → "1600"; at most two decimals. */
const num = (value) => {
  const rounded = Math.round(Number(value) * 100) / 100;
  const body = String(Math.abs(rounded));
  return rounded < 0 ? `${MINUS}${body}` : body;
};

/** 1600 → "$1,600", 2.5 → "$2.50". */
const money = (value) => {
  const cents = Math.round(Number(value) * 100);
  const whole = Math.floor(Math.abs(cents) / 100);
  const rest = Math.abs(cents) % 100;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${cents < 0 ? MINUS : ''}$${grouped}${rest ? `.${String(rest).padStart(2, '0')}` : ''}`;
};

/** n/d in lowest terms: "3/4", "−2", "5". */
const frac = (n, d = 1) => {
  if (!d) throw new RangeError('zero denominator');
  const sign = (n < 0) !== (d < 0) && n !== 0 ? -1 : 1;
  const g = gcd(n, d);
  const top = Math.abs(n) / g;
  const bottom = Math.abs(d) / g;
  const body = bottom === 1 ? String(top) : `${top}/${bottom}`;
  return sign < 0 ? `${MINUS}${body}` : body;
};

/** The coefficient part of a term: 1 → "", −1 → "−", 3 → "3", (2/3) → "(2/3)". */
const coefficient = (n, d = 1) => {
  if (!Number.isInteger(n) && d === 1) return num(n);
  const value = frac(n, d);
  if (value === '1') return '';
  if (value === `${MINUS}1`) return MINUS;
  if (value.includes('/')) return value.startsWith(MINUS) ? `${MINUS}(${value.slice(1)})` : `(${value})`;
  return value;
};

/** m·v + b as a student writes it: "3x + 5", "−x − 2", "(1/2)x + 4", "7". */
const linear = (m, b, v = 'x', mDen = 1) => {
  const parts = [];
  if (m !== 0) parts.push(`${coefficient(m, mDen)}${v}`);
  if (b !== 0 || !parts.length) {
    if (!parts.length) parts.push(num(b));
    else parts.push(b < 0 ? `${MINUS} ${num(-b)}` : `+ ${num(b)}`);
  }
  return parts.join(' ');
};

/** a·x + b·y as a student writes it: "4x + 3y", "x − y", "2x − 5y". */
const twoTerms = (a, b, x = 'x', y = 'y') => {
  const first = `${coefficient(a)}${x}`;
  if (b === 0) return first;
  const second = `${coefficient(Math.abs(b))}${y}`;
  return `${first} ${b < 0 ? MINUS : '+'} ${second}`;
};

const pair = (x, y) => `(${num(x)}, ${num(y)})`;
/** mx + b with a number put in for x: "3(−2) + 5", "−(4) + 28", "6 + 3". */
const substituted = (m, b, value, mDen = 1) => {
  const shown = num(value);
  const inner = m === 1 && mDen === 1 && value >= 0 ? shown : `${coefficient(m, mDen)}(${shown})`;
  return b === 0 ? inner : `${inner} ${b < 0 ? MINUS : '+'} ${num(Math.abs(b))}`;
};
/** The move that removes the term mx from a side: "subtracting 3x from", "adding 2x to". */
const removeX = (m) => (m < 0 ? `adding ${coefficient(-m)}x to` : `subtracting ${coefficient(m)}x from`);
/** The move that removes the constant c from a side: "subtract 4 from", "add 8 to". */
const undo = (c) => (c < 0 ? `add ${num(-c)} to` : `subtract ${num(c)} from`);
const capital = (value) => value.charAt(0).toUpperCase() + value.slice(1);

/* ---------------------------------------------------------------------------
 * Draws from the seeded random (siblingGuard.js), so a seed always gives the
 * same sibling.
 * ------------------------------------------------------------------------- */

const integer = (random, low, high) => low + Math.floor(random() * (high - low + 1));
const pick = (random, values) => values[Math.floor(random() * values.length)];
const nonZero = (random, low, high) => {
  for (let tries = 0; tries < 50; tries += 1) {
    const value = integer(random, low, high);
    if (value !== 0) return value;
  }
  return high || 1;
};

/* ---------------------------------------------------------------------------
 * Reading the item: what the student is shown.
 * ------------------------------------------------------------------------- */

const fieldsOf = (question) => list(question?.answerFields).filter(isObject);
const labelsOf = (question) => fieldsOf(question).map((field) => text(field.label || field.id));
const shownText = (question) => [text(question?.prompt), ...labelsOf(question)].join('\n');
const normalized = (value) => text(value).replace(/[−–]/g, '-').replace(/\s+/g, ' ');

const primaryStandard = (question) => {
  const alignment = list(question?.alignments).find((entry) => isObject(entry) && entry.role === 'primary' && text(entry.code));
  return text(alignment?.code || question?.standard);
};
const isAlgebraOneStandard = (standard) => /^A\.\d/.test(standard);

const isMultiAnswer = (question) => text(question?.type) === 'multiAnswer'
  && text(list(question?.studentActions)[0]) === 'multipleResponses'
  && fieldsOf(question).length > 0;

// A field that asks the student to name a property is answered by its name.
const namesAProperty = (question) => fieldsOf(question).some((field) => /\bpropert(y|ies)\b/i.test(text(field.answer)));

// The rules S(n) = rn + s and h(m) = A − km the student is shown, from the prompt.
const RULE = /\b([a-zA-Z])\s*\(\s*([a-z])\s*\)\s*=\s*(\d+(?:\.\d+)?)\s*([a-z](?![a-z]))?\s*(?:([+-])\s*(\d+(?:\.\d+)?)\s*([a-z](?![a-z]))?)?/g;
const shownRules = (question) => {
  const rules = [];
  const source = normalized(question?.prompt).replace(/(\d),(\d{3})/g, '$1$2');
  for (const match of source.matchAll(RULE)) {
    const [, name, variable, first, firstLetter, sign, second, secondLetter] = match;
    const signed = sign === '-' ? -1 : 1;
    if (firstLetter === variable && !secondLetter) {
      rules.push({ name, variable, slope: Number(first), start: second ? signed * Number(second) : 0 });
    } else if (!firstLetter && secondLetter === variable && second) {
      rules.push({ name, variable, slope: signed * Number(second), start: Number(first) });
    }
  }
  return rules;
};

const graphLines = (question) => list(question?.graph?.functions)
  .filter((entry) => isObject(entry) && entry.type === 'line' && Number.isFinite(Number(entry.m)));

const hasInequalitySymbol = (value) => /[<>≤≥]/.test(value);

/* ---------------------------------------------------------------------------
 * THE KINDS: how each is recognised, and its sibling.
 * Each sibling is { prompt, steps, answer }; steps say the move, then why.
 * ------------------------------------------------------------------------- */

const SALES_SITUATIONS = Object.freeze([
  { who: 'The robotics club', sells: 'sells raffle tickets', item: 'raffle tickets', one: 'raffle ticket', letter: 't', started: 'already has' },
  { who: 'The band', sells: 'sells T-shirts', item: 'T-shirts', one: 'T-shirt', letter: 'n', started: 'already has' },
  { who: 'The garden club', sells: 'sells potted plants', item: 'potted plants', one: 'potted plant', letter: 'p', started: 'already has' },
  { who: 'The swim team', sells: 'washes cars', item: 'car washes', one: 'car wash', letter: 'w', started: 'starts with a donation of' },
  { who: 'The art club', sells: 'sells greeting cards', item: 'greeting cards', one: 'greeting card', letter: 'c', started: 'already has' },
]);

const RATES = Object.freeze([2.5, 4, 4.5, 6, 7.5, 8, 12]);

// inequalityModel: a goal reached "at least" and a total kept "less than".
const inequalityModelSibling = (random) => {
  const place = pick(random, SALES_SITUATIONS);
  const rate = pick(random, RATES);
  const start = 5 * integer(random, 2, 16);
  const v = place.letter;
  const rule = `S(${v}) = ${linear(rate, start, v)}`;
  // At least G: G − start not a multiple of the rate, so the student must round up.
  const lowCount = integer(random, 18, 90);
  const goal = Math.round(start + rate * lowCount + rate / 2);
  const exact = (goal - start) / rate;
  const least = Math.ceil(exact - 1e-9);
  // Less than H: H − start a multiple of the rate, so the boundary is left out.
  const highCount = least + integer(random, 15, 60);
  const ceiling = start + rate * highCount;
  const greatest = highCount - 1;
  // The boundary exactly when it has at most two decimals (61.6), else rounded and said so.
  const boundary = Math.abs(exact * 100 - Math.round(exact * 100)) < 1e-9 ? num(exact) : `about ${num(exact)}`;
  const prompt = `${place.who} ${place.sells} for ${money(rate)} each and ${place.started} ${money(start)}, so its total is ${rule} for ${v} ${place.item}. a. At least how many ${place.item} must it sell to have at least ${money(goal)}? b. What is the greatest number of ${place.item} it can sell and still have less than ${money(ceiling)}?`.replace(/must it sell|can sell/g, (verb) => (place.sells.startsWith('sells') ? verb : verb.replace('sell', 'do')));
  const steps = [
    `a. “At least ${money(goal)}” means the total is ${money(goal)} or more, so write ${linear(rate, start, v)} ≥ ${num(goal)}. The symbol ≥ keeps the goal itself in.`,
    `Subtract ${num(start)} from both sides to undo the starting amount: ${linear(rate, 0, v)} ≥ ${num(goal - start)}.`,
    `Divide both sides by ${num(rate)} to get ${v} alone. ${num(rate)} is positive, so the symbol stays the same: ${v} ≥ ${boundary}.`,
    `On a graph this boundary is where the horizontal line y = ${num(goal)} meets the graph of S, and every point of S on or above that line reaches the goal.`,
    `The letter ${v} counts whole ${place.item}, so round UP to the next whole number: ${least}. Rounding down would fall short.`,
    `Check: S(${least}) = ${num(rate)}(${least}) + ${num(start)} = ${num(rate * least + start)}, at least ${num(goal)}; one fewer, S(${least - 1}) = ${num(rate * (least - 1) + start)}, is not enough.`,
    `b. “Less than ${money(ceiling)}” leaves ${money(ceiling)} itself out, so write ${linear(rate, start, v)} < ${num(ceiling)}, then subtract ${num(start)} and divide by ${num(rate)}: ${v} < ${num(highCount)}.`,
    `On a number line ${v} < ${num(highCount)} is an OPEN dot at ${num(highCount)}, because ${num(highCount)} ${place.item} give exactly ${money(ceiling)}, which is not less than ${money(ceiling)}; ${v} ≥ ${boundary} in part a is a closed dot, because its boundary is included.`,
    `The greatest whole number less than ${num(highCount)} is ${greatest}, and only whole numbers from 0 up make sense here: no one sells part of a ${place.one} or a negative number of them.`,
  ];
  return { prompt, steps, answer: `a. ${least} ${place.item} (${v} ≥ ${boundary}); b. ${greatest} ${place.item} (${v} < ${num(highCount)})` };
};

// inequalityModel, two models: when does the one with no head start earn more?
const compareModelsSibling = (random) => {
  const place = pick(random, SALES_SITUATIONS);
  const v = place.letter;
  for (let tries = 0; tries < 40; tries += 1) {
    const slow = pick(random, [2, 3, 4, 5, 6]);
    const fast = slow + pick(random, [0.5, 1, 1.5, 2, 2.5]);
    const meet = integer(random, 8, 40);
    const head = (fast - slow) * meet;
    if (!Number.isInteger(head) || head <= 0) continue;
    const meetValue = fast * meet;
    const prompt = `${place.who} can earn money from ${place.item} two ways. Plan A earns ${money(slow)} per ${place.one} plus ${money(head)} up front: A(${v}) = ${linear(slow, head, v)}. Plan B earns ${money(fast)} per ${place.one} with nothing up front: B(${v}) = ${linear(fast, 0, v)}. For which numbers of ${place.item} does Plan B earn more?`;
    const steps = [
      `The graphs meet where the plans earn the same, so set them equal: ${linear(fast, 0, v)} = ${linear(slow, head, v)}.`,
      `Subtract ${linear(slow, 0, v)} from both sides to collect the ${v}-terms: ${linear(fast - slow, 0, v)} = ${num(head)}${fast - slow === 1 ? '' : `, so ${v} = ${num(meet)}`}. Both plans earn ${num(meetValue)} there, so the graphs meet at ${pair(meet, meetValue)}.`,
      `“Plan B earns more” is B(${v}) > A(${v}): ${linear(fast, 0, v)} > ${linear(slow, head, v)}. The same moves give ${fast - slow === 1 ? `${v} > ${num(meet)}; the symbol is the one the question asks for, because no step multiplied or divided by a negative.` : `${linear(fast - slow, 0, v)} > ${num(head)}, and dividing by the positive ${num(fast - slow)} keeps the symbol: ${v} > ${num(meet)}.`}`,
      `The symbol is > and not ≥ because at ${num(meet)} ${place.item} the plans earn the same, which is not more. The least whole number of ${place.item} is the next one, ${meet + 1}.`,
      `On the graph, Plan B’s line is above Plan A’s to the right of the meeting point: B earns ${money(fast - slow)} more on each ${place.one}, so it catches up with A’s head start and then passes it.`,
    ];
    return { prompt, steps, answer: `${v} > ${num(meet)}; at least ${meet + 1} ${place.item}` };
  }
  return null;
};

// inequalityReverse: dividing by a negative number reverses the symbol.
const reverseTwoWaysSibling = (random) => {
  for (let tries = 0; tries < 40; tries += 1) {
    const k = integer(random, 2, 7);
    const root = nonZero(random, -9, 9);
    const p = integer(random, 3, 30);
    const q = p - k * root;
    const symbol = pick(random, ['<', '≤', '>', '≥']);
    const flipped = { '<': '>', '≤': '≥', '>': '<', '≥': '≤' }[symbol];
    const reading = { '<': 'less than', '≤': 'at most', '>': 'greater than', '≥': 'at least' }[flipped];
    const inequality = `${num(p)} ${MINUS} ${k}x ${symbol} ${num(q)}`;
    const test = root + (flipped === '>' || flipped === '≥' ? 1 : -1) * integer(random, 1, 4);
    const small = integer(random, 3, 8);
    const large = small + integer(random, 2, 9);
    const value = p - k * test;
    const prompt = `Solve ${inequality} two ways: once keeping the x-term on the left, and once moving it to the right. Then check a number.`;
    const steps = [
      `First way: ${undo(p)} both sides to leave the x-term alone: ${MINUS}${k}x ${symbol} ${num(q - p)}.`,
      `Divide both sides by ${MINUS}${k}. Dividing by a negative number reverses the order of numbers (${small} < ${large}, but ${MINUS}${small} > ${MINUS}${large}), so ${symbol} turns into ${flipped}: x ${flipped} ${num(root)}.`,
      `Second way: add ${k}x to both sides so the x-term is positive: ${num(p)} ${symbol} ${num(q)} + ${k}x. Then ${undo(q)} both sides: ${num(p - q)} ${symbol} ${k}x.`,
      `Divide both sides by the positive ${k}. The symbol stays: ${num(root)} ${symbol} x.`,
      `${num(root)} ${symbol} x and x ${flipped} ${num(root)} say the same thing, read from opposite sides: x is ${reading} ${num(root)}. The two ways agree.`,
      `Check x = ${num(test)}, a number in the solution set: ${num(p)} ${MINUS} ${k}(${num(test)}) = ${num(value)}, and ${num(value)} ${symbol} ${num(q)} is true.`,
    ];
    return { prompt, steps, answer: `x ${flipped} ${num(root)}` };
  }
  return null;
};

const reverseDistributiveSibling = (random) => {
  for (let tries = 0; tries < 40; tries += 1) {
    const k = integer(random, 2, 6);
    const h = nonZero(random, -8, 8);
    const root = h + pick(random, [-3, -2, -1, 1, 2, 3]);
    const c = -k * (root - h);
    const symbol = pick(random, ['<', '≥']);
    const flipped = symbol === '<' ? '>' : '≤';
    const inside = h > 0 ? `x ${MINUS} ${h}` : `x + ${-h}`;
    const inequality = `${MINUS}${k}(${inside}) ${symbol} ${num(c)}`;
    const prompt = `Solve ${inequality} two ways: distribute first, or divide both sides by ${MINUS}${k} first.`;
    const steps = [
      `First way: distribute ${MINUS}${k} to both terms in the parentheses: ${linear(-k, k * h)} ${symbol} ${num(c)}.`,
      `${capital(undo(k * h))} both sides: ${MINUS}${k}x ${symbol} ${num(c - k * h)}.`,
      `Divide both sides by ${MINUS}${k}. Dividing by a negative number reverses the symbol, so ${symbol} becomes ${flipped}: x ${flipped} ${num(root)}.`,
      `Second way: divide both sides by ${MINUS}${k} first, reversing the symbol now because ${MINUS}${k} is negative: ${inside} ${flipped} ${num(c / -k)}.`,
      `Then ${h > 0 ? `add ${h} to` : `subtract ${-h} from`} both sides: x ${flipped} ${num(root)}, the same answer as the first way.`,
    ];
    return { prompt, steps, answer: `x ${flipped} ${num(root)}` };
  }
  return null;
};

const DRAINING = Object.freeze([
  { what: 'A water tank', rule: 'V', variable: 't', unit: 'liters', time: 'minutes', rateWord: 'drains', measure: 'the water in it, in liters', empty: 'the tank is empty' },
  { what: 'A hot-air balloon', rule: 'H', variable: 't', unit: 'feet', time: 'minutes', rateWord: 'descends', measure: 'its height, in feet', empty: 'the balloon is on the ground' },
  { what: 'A phone battery', rule: 'B', variable: 't', unit: 'percent', time: 'hours', rateWord: 'loses', measure: 'its charge, in percent', empty: 'the battery is flat' },
]);

const decreasingModelSibling = (random) => {
  const place = pick(random, DRAINING);
  const rate = pick(random, [5, 8, 12, 15, 25, 30]);
  const total = rate * integer(random, 20, 60);
  const v = place.variable;
  const ruleText = `${place.rule}(${v}) = ${num(total)} ${MINUS} ${rate}${v}`;
  const t1 = integer(random, 3, Math.floor(total / rate / 2));
  const above = total - rate * t1;
  const t2 = integer(random, t1 + 2, Math.floor(total / rate) - 1);
  const below = total - rate * t2;
  const prompt = `${place.what} ${place.rateWord} ${rate} ${place.unit} each ${place.time === 'hours' ? 'hour' : 'minute'}: ${ruleText}. Solve ${place.rule}(${v}) > ${num(above)} and ${place.rule}(${v}) ≤ ${num(below)} for ${v}, and compare the symbols.`;
  const steps = [
    `${place.rule}(${v}) > ${num(above)} means ${num(total)} ${MINUS} ${rate}${v} > ${num(above)}. Subtract ${num(total)} from both sides: ${MINUS}${rate}${v} > ${num(above - total)}.`,
    `Divide both sides by ${MINUS}${rate}. Dividing by a negative number reverses the symbol: ${v} < ${num(t1)}. The amount is still above ${num(above)} only BEFORE ${num(t1)} ${place.time}, because it goes down as time goes on.`,
    `${place.rule}(${v}) ≤ ${num(below)} means ${num(total)} ${MINUS} ${rate}${v} ≤ ${num(below)}, so ${MINUS}${rate}${v} ≤ ${num(below - total)}; dividing by ${MINUS}${rate} reverses ≤ to ≥: ${v} ≥ ${num(t2)}.`,
  ];
  return { prompt, steps, answer: `${v} < ${num(t1)}; ${v} ≥ ${num(t2)}` };
};

const letterCoefficientSibling = (random) => {
  const c = nonZero(random, -9, 9);
  const d = c + pick(random, [6, 8, 10, 12, 15, 18]) * pick(random, [1, -1]);
  const gap = d - c;
  const positive = pick(random, [2, 3, 5, 6]);
  const prompt = `In kx ${c < 0 ? MINUS : '+'} ${Math.abs(c)} < ${num(d)}, the letter k stands for a number. Solve it when k = ${positive}, when k = ${MINUS}${positive}, and when k = 0.`;
  const steps = [
    `${capital(undo(c))} both sides first, whatever k is: kx < ${num(gap)}.`,
    `k = ${positive}: divide both sides by ${positive}, a positive number, so the symbol stays: x < ${frac(gap, positive)}.`,
    `k = ${MINUS}${positive}: divide both sides by ${MINUS}${positive}, a negative number, so the symbol reverses: x > ${frac(gap, -positive)}.`,
    `In general, for k > 0 the solutions are x < ${num(gap)}/k, and for k < 0 they are x > ${num(gap)}/k: the sign of k decides the direction.`,
    `k = 0: you cannot divide by 0. Put 0 in for k instead: 0 < ${num(gap)}, which is ${gap > 0 ? 'true, so every real number x is a solution' : 'false, so no x is a solution'}.`,
  ];
  return { prompt, steps, answer: `k = ${positive}: x < ${frac(gap, positive)}; k = ${MINUS}${positive}: x > ${frac(gap, -positive)}; k = 0: ${gap > 0 ? 'all x' : 'none'}` };
};

// solutionCount: one, none, or infinitely many, side by side.
const solutionCountSibling = (random) => {
  for (let tries = 0; tries < 40; tries += 1) {
    const a = integer(random, 2, 5);
    const h = nonZero(random, -6, 6);
    const e = nonZero(random, -9, 9);
    const m = a;
    const b = -a * h + e; // a(x − h) + e = ax + b: the same line
    const other = b + nonZero(random, -7, 7);
    const steeper = a + pick(random, [1, 2, 3]);
    const oneRhs = nonZero(random, -12, 12);
    const xOne = (b - oneRhs) / (steeper - a);
    if (!Number.isInteger(xOne) || xOne === 0) continue;
    const left = `${a}(${h > 0 ? `x ${MINUS} ${h}` : `x + ${-h}`}) ${e > 0 ? '+' : MINUS} ${Math.abs(e)}`;
    const simplified = linear(m, b);
    const p = pick(random, [3, 4, 6]);
    const q = nonZero(random, -5, 5);
    const prompt = `How many solutions does each equation have? A: ${left} = ${simplified}. B: ${left} = ${linear(m, other)}. C: ${left} = ${linear(steeper, oneRhs)}. Then find k so that ${p}(x ${q > 0 ? '+' : MINUS} ${Math.abs(q)}) = ${p}x + k has infinitely many solutions.`;
    const steps = [
      `Simplify the left side first, the same in A, B and C: distribute ${a}, then combine the constants: ${left} = ${simplified}.`,
      `A: ${simplified} = ${simplified}. Whatever number x is, the two sides give the same value, so every x makes it true: infinitely many solutions.`,
      `B: ${simplified} = ${linear(m, other)}. The x-terms are the same, so subtracting ${coefficient(m)}x from both sides leaves ${num(b)} = ${num(other)}, which is false for every x: no solution.`,
      `C: ${simplified} = ${linear(steeper, oneRhs)}. Here the x-terms do not cancel (${num(m)}x on the left, ${num(steeper)}x on the right): subtract ${coefficient(m)}x from both sides and ${undo(oneRhs).replace(/ (from|to)$/, '')}, to get ${num(b - oneRhs)} = ${coefficient(steeper - a)}x, so x = ${num(xOne)}: exactly one solution.`,
      `Check C: ${a}(${num(xOne)} ${h > 0 ? MINUS : '+'} ${Math.abs(h)}) ${e > 0 ? '+' : MINUS} ${Math.abs(e)} = ${num(m * xOne + b)}, and ${substituted(steeper, oneRhs, xOne)} = ${num(steeper * xOne + oneRhs)}.`,
      `For infinitely many solutions both sides must be the same: ${p}(x ${q > 0 ? '+' : MINUS} ${Math.abs(q)}) = ${linear(p, p * q)}, so k must be ${num(p * q)}. Any other k leaves a false statement, so no solution.`,
    ];
    return { prompt, steps, answer: `A: infinitely many; B: none; C: x = ${num(xOne)}; k = ${num(p * q)}` };
  }
  return null;
};

// verifySolution: build equations from a solution, then check by substituting.
const verifySolutionSibling = (random) => {
  for (let tries = 0; tries < 40; tries += 1) {
    const s = nonZero(random, -6, 7);
    const add = integer(random, 3, 11);
    const times = integer(random, 2, 5);
    const minus = integer(random, 2, 6);
    // x = s → x + add = s + add → times x + times·add = times(s + add) → (times − minus)x + times·add = times(s + add) − minus x
    const c1 = times * add;
    const r1 = times * (s + add);
    const left = linear(times - minus, c1);
    const right = `${num(r1)} ${MINUS} ${minus}x`;
    if (times - minus === 0) continue;
    const leftValue = (times - minus) * s + c1;
    const rightValue = r1 - minus * s;
    const prompt = `Start with x = ${num(s)} and build a new equation by doing the same thing to both sides three times. Then check that x = ${num(s)} still makes the final equation true.`;
    const steps = [
      `Add ${add} to both sides: x + ${add} = ${num(s + add)}. Adding the same number to both sides keeps the two sides equal.`,
      `Multiply both sides by ${times}: ${times}x + ${c1} = ${num(r1)}. Multiplying both sides by the same number (not 0) keeps them equal.`,
      `Subtract ${minus}x from both sides: ${left} = ${right}. A variable term can be subtracted from both sides too; it is the same amount on each side for any one x.`,
      `Check by substituting x = ${num(s)} into each side of the final equation: ${substituted(times - minus, c1, s)} = ${num(leftValue)}, and ${num(r1)} ${MINUS} ${minus}(${num(s)}) = ${num(rightValue)}.`,
      `The two sides are equal, so x = ${num(s)} is still a solution: each move did the same thing to both sides, so every equation in the chain is equivalent, with the same solution.`,
    ];
    return { prompt, steps, answer: `${left} = ${right}, true for x = ${num(s)}` };
  }
  return null;
};

/* ------------------------------------------------------------ systems */

const COUNT_AND_VALUE = Object.freeze([
  { place: 'A snack stand', sold: 'sold', first: 'hot dogs', second: 'drinks', x: 'h', y: 'd', unit: 'items' },
  { place: 'A museum', sold: 'admitted', first: 'adults', second: 'students', x: 'a', y: 's', unit: 'visitors' },
  { place: 'A bake sale', sold: 'sold', first: 'pies', second: 'loaves of bread', x: 'p', y: 'b', unit: 'items' },
  { place: 'A plant nursery', sold: 'sold', first: 'trees', second: 'shrubs', x: 't', y: 's', unit: 'plants' },
]);

const systemWordSibling = (random) => {
  const story = pick(random, COUNT_AND_VALUE);
  for (let tries = 0; tries < 40; tries += 1) {
    const high = integer(random, 6, 15);
    const low = integer(random, 2, high - 1);
    const xCount = integer(random, 20, 140);
    const yCount = integer(random, 20, 140);
    const total = xCount + yCount;
    const value = high * xCount + low * yCount;
    const { x, y } = story;
    const prompt = `${story.place} ${story.sold} ${total} ${story.unit}: ${story.first} at ${money(high)} each and ${story.second} at ${money(low)} each, for ${money(value)} in all. Let ${x} be the number of ${story.first} and ${y} the number of ${story.second}. Write a system and solve it by substitution.`;
    const steps = [
      `Count equation: every one of the ${total} ${story.unit} is one or the other, so ${x} + ${y} = ${total}.`,
      `Value equation: each kind brings in its price times how many were ${story.sold}, so ${high}${x} + ${low}${y} = ${value}. Both equations use the same ${x} and ${y}, so one pair of numbers must make both true.`,
      `Solve the count equation for ${y}, because ${y} has a coefficient of 1 there: ${y} = ${total} ${MINUS} ${x}.`,
      `Substitute ${total} ${MINUS} ${x} for ${y} in the value equation: ${high}${x} + ${low}(${total} ${MINUS} ${x}) = ${value}. Distribute and combine: ${linear(high - low, low * total, x)} = ${value}.`,
      `Subtract ${low * total}${high - low === 1 ? '' : ` and divide by ${high - low}`}: ${x} = ${xCount}. Then ${y} = ${total} ${MINUS} ${xCount} = ${yCount}.`,
      `Check in both: ${xCount} + ${yCount} = ${total}, and ${high}(${xCount}) + ${low}(${yCount}) = ${value}. So ${xCount} ${story.first} and ${yCount} ${story.second}.`,
    ];
    return { prompt, steps, answer: `${xCount} ${story.first} and ${yCount} ${story.second}` };
  }
  return null;
};

const substitutionSibling = (random, { exactVersusGraph = false } = {}) => {
  for (let tries = 0; tries < 60; tries += 1) {
    const m = nonZero(random, -4, 4);
    const b = nonZero(random, -8, 8);
    const A = integer(random, 2, 6);
    const B = nonZero(random, -5, 5);
    if (A + B * m === 0) continue;
    if (exactVersusGraph) {
      // A solution that falls between grid lines: a fraction with denominator A + Bm.
      const C = nonZero(random, -30, 30);
      const den = A + B * m;
      const xNum = C - B * b;
      if (Math.abs(den) < 2 || xNum % den === 0) continue;
      const yNum = m * xNum + b * den;
      const prompt = `The lines y = ${linear(m, b)} and ${twoTerms(A, B)} = ${num(C)} cross between grid lines. Estimate is not enough: find the exact solution by substitution.`;
      const steps = [
        `y = ${linear(m, b)} is already solved for y, so substitute ${linear(m, b)} for y in the other equation: ${A}x ${B < 0 ? MINUS : '+'} ${coefficient(Math.abs(B))}(${linear(m, b)}) = ${num(C)}. Both equations describe the same y at the crossing point.`,
        `Distribute and combine like terms: ${linear(den, B * b)} = ${num(C)}.`,
        `${capital(undo(B * b))} both sides and divide by ${num(den)}: x = ${frac(xNum, den)}.`,
        `Substitute x into y = ${linear(m, b)}: y = ${frac(yNum, den)}.`,
        `So the solution is (${frac(xNum, den)}, ${frac(yNum, den)}). A graph can only show it roughly, about (${num(xNum / den)}, ${num(yNum / den)}), because the lines cross between grid lines; substitution gives the exact point.`,
      ];
      return { prompt, steps, answer: `(${frac(xNum, den)}, ${frac(yNum, den)})` };
    }
    const x0 = nonZero(random, -6, 6);
    const y0 = m * x0 + b;
    const C = A * x0 + B * y0;
    const prompt = `Solve the system by substitution, then check: y = ${linear(m, b)} and ${twoTerms(A, B)} = ${num(C)}.`;
    const steps = [
      `y = ${linear(m, b)} is already solved for y, so substitute ${linear(m, b)} for y in the other equation. Both equations describe the same y, so the solution must make both true.`,
      `${A}x ${B < 0 ? MINUS : '+'} ${coefficient(Math.abs(B))}(${linear(m, b)}) = ${num(C)}. Distribute and combine like terms: ${linear(A + B * m, B * b)} = ${num(C)}.`,
      `${capital(undo(B * b))} both sides${A + B * m === 1 ? '' : ` and divide by ${num(A + B * m)}`}: x = ${num(x0)}.`,
      `Substitute x = ${num(x0)} into the equation solved for y, the easiest one: y = ${substituted(m, b, x0)} = ${num(y0)}.`,
      `Check in BOTH equations: ${substituted(m, b, x0)} = ${num(y0)} ✓ and ${A}(${num(x0)}) ${B < 0 ? MINUS : '+'} ${coefficient(Math.abs(B))}(${num(y0)}) = ${num(C)} ✓.`,
      `So ${pair(x0, y0)} is the solution: it lies on both lines, the point where their graphs cross.`,
    ];
    return { prompt, steps, answer: pair(x0, y0) };
  }
  return null;
};

const systemCasesSibling = (random, { withLetter = false } = {}) => {
  for (let tries = 0; tries < 40; tries += 1) {
    const m = nonZero(random, -4, 4);
    const b = nonZero(random, -8, 8);
    const other = b + nonZero(random, -6, 6);
    if (other === 0) continue;
    const scale = pick(random, [2, 3, 4, 5]);
    const m2 = m + pick(random, [-5, -4, -3, -2, 2, 3, 4, 5]);
    if (m2 === 0) continue;
    const xCross = nonZero(random, -5, 5);
    const yCross = m * xCross + b;
    const b2 = yCross - m2 * xCross;
    // Same line in standard form: scale(mx − y) = −scale·b.
    const sameLine = `${twoTerms(scale * m, -scale)} = ${num(-scale * b)}`;
    const prompt = `What does substitution leave in each system, and how many solutions does each have? A: y = ${linear(m, b)} and y = ${linear(m, other)}. B: y = ${linear(m, b)} and ${sameLine}. C: y = ${linear(m, b)} and y = ${linear(m2, b2)}.${withLetter ? ` Then: for which k does y = ${linear(m, b)} and y = kx ${other < 0 ? MINUS : '+'} ${Math.abs(other)} have no solution?` : ''}`;
    const steps = [
      `A: substitute: ${linear(m, b)} = ${linear(m, other)}. ${capital(removeX(m))} both sides leaves ${num(b)} = ${num(other)}, a false statement. The lines have the same slope and different y-intercepts, so they are parallel and never meet: no solution.`,
      `B: rewrite ${sameLine} with y alone: y = ${linear(m, b)}. Every term of ${sameLine} is ${scale} times a term of ${twoTerms(m, -1)} = ${num(-b)}, which is the first equation rearranged, so both describe one line. Substituting leaves a true statement such as ${num(b)} = ${num(b)}: every point on that line is a solution, infinitely many.`,
      `C: the slopes ${num(m)} and ${num(m2)} are different, so the lines must cross once. Substitute: ${linear(m, b)} = ${linear(m2, b2)}, so ${linear(m - m2, 0)} = ${num(b2 - b)}, x = ${num(xCross)}, and y = ${num(yCross)}.`,
      `Check C in both: ${substituted(m, b, xCross)} = ${num(yCross)} and ${substituted(m2, b2, xCross)} = ${num(yCross)}. Exactly one solution, ${pair(xCross, yCross)}.`,
      ...(withLetter ? [`No solution needs parallel lines: the same slope with a different y-intercept. The intercepts ${num(b)} and ${num(other)} are already different, so k = ${num(m)} gives none, and no k can give the same line.`] : []),
    ];
    return { prompt, steps, answer: `A: none; B: infinitely many; C: ${pair(xCross, yCross)}${withLetter ? `; k = ${num(m)}` : ''}` };
  }
  return null;
};

const FUNDRAISERS = Object.freeze([
  { goal: 'raise', first: 'pins', second: 'mugs', x: 'p', y: 'm' },
  { goal: 'collect', first: 'small pizzas', second: 'large pizzas', x: 's', y: 'l' },
  { goal: 'raise', first: 'bookmarks', second: 'posters', x: 'b', y: 'p' },
]);

const interceptsSibling = (random) => {
  const story = pick(random, FUNDRAISERS);
  for (let tries = 0; tries < 40; tries += 1) {
    const a = pick(random, [2, 3, 4, 5, 6]);
    const b = a * pick(random, [2, 3, 4]);
    const C = b * integer(random, 8, 30);
    const xi = C / a;
    const yi = C / b;
    if (!Number.isInteger(xi) || !Number.isInteger(yi)) continue;
    const ratio = b / a;
    const { x, y } = story;
    const prompt = `A club wants to ${story.goal} ${money(C)} selling ${story.first} at ${money(a)} and ${story.second} at ${money(b)}: ${a}${x} + ${b}${y} = ${C}. Find both intercepts and what they mean, the slope and what it means, and the reasonable domain.`;
    const steps = [
      `The ${x}-intercept: substitute 0 for ${y}, because the intercept is where the line meets the ${x}-axis: ${a}${x} = ${C}, so ${x} = ${xi}. The point is ${pair(xi, 0)}: ${xi} ${story.first} and no ${story.second} make exactly ${money(C)}.`,
      `The ${y}-intercept: substitute 0 for ${x}: ${b}${y} = ${C}, so ${y} = ${yi}. The point is ${pair(0, yi)}: ${yi} ${story.second} and no ${story.first}.`,
      `Slope: from ${pair(0, yi)} to ${pair(xi, 0)}, ${y} changes by ${MINUS}${yi} while ${x} changes by ${xi}, so the slope is ${frac(-yi, xi)}: every ${ratio} more ${story.first} sold means 1 fewer ${story.second.replace(/s$/, '')} is needed.`,
      `With the axes swapped (${y} across, ${x} up), the same points give a slope of ${frac(-xi, yi)}, the reciprocal: the graph is still right, it just reads the change the other way.`,
      random() < 0.5
        ? `As a mathematical line the domain is all real numbers, but here only whole numbers of ${story.first} from 0 to ${xi} make sense, and whole numbers of ${story.second} from 0 to ${yi}.`
        : `In this situation only whole numbers of ${story.first} from 0 to ${xi} make sense (no one sells part of one, or fewer than none), and whole numbers of ${story.second} from 0 to ${yi}.`,
    ];
    return { prompt, steps, answer: `${pair(xi, 0)} and ${pair(0, yi)}; slope ${frac(-yi, xi)}` };
  }
  return null;
};

const decreasingInterceptsSibling = (random) => {
  const place = pick(random, DRAINING);
  const rate = pick(random, [4, 6, 8, 12, 15, 25]);
  const steps0 = integer(random, 12, 60);
  const total = rate * steps0;
  const v = place.variable;
  const each = place.time === 'hours' ? 'hour' : 'minute';
  const prompt = `${place.what} ${place.rateWord} at a steady rate: ${place.rule}(${v}) = ${num(total)} ${MINUS} ${rate}${v} is ${place.measure}, after ${v} ${place.time}. Find the slope, the y-intercept and the ${v}-intercept, and what each means.`;
  const steps = [
    `Slope: the number multiplying ${v}, ${MINUS}${rate}. It is the change in ${place.rule} each ${each}: the amount goes DOWN ${rate} ${place.unit} each ${each}, which is why it is negative.`,
    `y-intercept: the value when ${v} = 0, ${place.rule}(0) = ${num(total)}: the amount at the start, before any time passes.`,
    `${v}-intercept: the ${v} that makes ${place.rule}(${v}) = 0. Solve ${num(total)} ${MINUS} ${rate}${v} = 0: add ${rate}${v} to both sides and divide by ${rate}, so ${v} = ${steps0}: after ${steps0} ${place.time}, ${place.empty}.`,
    `So the reasonable domain runs from 0 to ${steps0} ${place.time}: before 0 the situation has not started, and after ${steps0} the rule would give a negative amount.`,
  ];
  return { prompt, steps, answer: `slope ${MINUS}${rate}; y-intercept ${num(total)}; ${v}-intercept ${steps0}` };
};

/* ------------------------------------------- inequalities in two variables */

const SPENDING = Object.freeze([
  { who: 'A florist', verb: 'spend', first: 'roses', second: 'lilies' },
  { who: 'A coach', verb: 'spend', first: 'water bottles', second: 'towels' },
  { who: 'Maya', verb: 'spend', first: 'songs', second: 'movies' },
]);

const twoVariableContextSibling = (random) => {
  const story = pick(random, SPENDING);
  for (let tries = 0; tries < 40; tries += 1) {
    const a = integer(random, 2, 9);
    const b = integer(random, 2, 9);
    if (a === b) continue;
    const xOn = integer(random, 1, 6);
    const yOn = integer(random, 1, 6);
    const C = a * xOn + b * yOn;
    const below = [Math.max(0, xOn - 1), Math.max(0, yOn - 1)];
    const above = [xOn + 2, yOn + 1];
    const costBelow = a * below[0] + b * below[1];
    const costAbove = a * above[0] + b * above[1];
    const prompt = `${story.who} can ${story.verb} at most ${money(C)} on ${story.first} at ${money(a)} each and ${story.second} at ${money(b)} each. Let x be the number of ${story.first} and y the number of ${story.second}. Write the inequality, then test ${pair(...below)}, ${pair(xOn, yOn)} and ${pair(...above)}.`;
    const steps = [
      `The total cost is ${a}x + ${b}y: each kind’s price times how many are bought, added.`,
      `“At most ${money(C)}” means the cost can equal ${money(C)} or be less, so the symbol is ≤: ${a}x + ${b}y ≤ ${C}. Its boundary line ${a}x + ${b}y = ${C} is solid, because spending exactly ${money(C)} is allowed.`,
      `Test ${pair(...below)}: ${a}(${below[0]}) + ${b}(${below[1]}) = ${costBelow}, less than ${C}. True: it is below the line, and money is left over.`,
      `Test ${pair(xOn, yOn)}: ${a}(${xOn}) + ${b}(${yOn}) = ${C}. True: it is ON the line, spending exactly ${money(C)}.`,
      `Test ${pair(...above)}: ${a}(${above[0]}) + ${b}(${above[1]}) = ${costAbove}, more than ${C}. False: it is above the line and costs too much.`,
      `A point like (1.5, 2) can make the inequality true, but it does not make sense here: no one buys half of one, so only whole numbers, 0 or more, are solutions in this situation.`,
    ];
    return { prompt, steps, answer: `${a}x + ${b}y ≤ ${C}` };
  }
  return null;
};

const inequalityGraphSibling = (random) => {
  for (let tries = 0; tries < 40; tries += 1) {
    const rise = nonZero(random, -5, 5);
    const run = integer(random, 1, 4);
    if (gcd(rise, run) !== 1) continue;
    const b = nonZero(random, -6, 6);
    const slope = frac(rise, run);
    const boundary = `${coefficient(rise, run)}x ${b < 0 ? MINUS : '+'} ${Math.abs(b)}`;
    const zeroTrue = 0 > b; // (0, 0) is above the boundary when b < 0
    const prompt = `The boundary of a shaded half-plane passes through (0, ${num(b)}) and rises ${num(rise)} for every ${run} to the right. Write the inequality for each graph: solid and shaded above, dashed and shaded above, solid and shaded below, dashed and shaded below.`;
    const steps = [
      `The y-intercept is ${num(b)}, where the line crosses the y-axis, and the slope is rise over run, ${slope}. So the boundary is y = ${boundary}.`,
      `A solid line means points ON the line are solutions, so the symbol includes “equal to” (≤ or ≥); a dashed line leaves them out (< or >).`,
      `Shaded above means y is greater than the line’s y-value, so > or ≥; shaded below means y is less, so < or ≤.`,
      `So: solid and above, y ≥ ${boundary}; dashed and above, y > ${boundary}; solid and below, y ≤ ${boundary}; dashed and below, y < ${boundary}.`,
      `Check with a test point not on the line, (0, 0): in y ≥ ${boundary} it gives 0 ≥ ${num(b)}, which is ${zeroTrue ? 'true, so (0, 0) must be in the shaded region above the line' : 'false, so (0, 0) must be outside the shading, which is above the line'}.`,
    ];
    return { prompt, steps, answer: `y ≥ ${boundary}; y > ${boundary}; y ≤ ${boundary}; y < ${boundary}` };
  }
  return null;
};

/* --------------------------------------------- systems of inequalities */

const TRIPS = Object.freeze([
  { who: 'A van driver', room: 'seats for at most', limit: 'people', first: 'adults', second: 'children', money: 'fares', label: 'Seats' },
  { who: 'A caterer', room: 'oven space for at most', limit: 'trays', first: 'sandwich trays', second: 'fruit trays', money: 'sales', label: 'Oven space' },
  { who: 'A tutor', room: 'time for at most', limit: 'hours', first: 'math hours', second: 'reading hours', money: 'earnings', label: 'Time' },
]);

const inequalitySystemPointsSibling = (random) => {
  const story = pick(random, TRIPS);
  for (let tries = 0; tries < 60; tries += 1) {
    const cap = integer(random, 8, 14);
    const p1 = integer(random, 9, 20);
    const p2 = integer(random, 4, p1 - 3);
    const good = [integer(random, 3, cap - 3), 0];
    good[1] = integer(random, 1, cap - good[0]);
    const goal = p1 * good[0] + p2 * good[1] - integer(random, 1, 8);
    const failMoney = [1, 1];
    const failCount = [cap, 3];
    const moneyFail = p1 * failMoney[0] + p2 * failMoney[1];
    const countFail = failCount[0] + failCount[1];
    const moneyCountFail = p1 * failCount[0] + p2 * failCount[1];
    if (moneyFail >= goal || moneyCountFail < goal || goal <= 0) continue;
    const goodMoney = p1 * good[0] + p2 * good[1];
    const prompt = `${story.who} has ${story.room} ${cap} ${story.limit} and wants at least ${money(goal)} in ${story.money}: ${money(p1)} for each of the ${story.first} (x) and ${money(p2)} for each of the ${story.second} (y). Write the system, then test ${pair(...good)}, ${pair(...failMoney)} and ${pair(...failCount)}.`;
    const steps = [
      `${story.label}: x + y counts all the ${story.limit}, and “at most ${cap}” is ≤, so x + y ≤ ${cap}.`,
      `Money: ${p1}x + ${p2}y is the ${story.money}, and “at least ${money(goal)}” is ≥, so ${p1}x + ${p2}y ≥ ${goal}. The same x and y appear in both, because one choice has to meet both limits at once.`,
      `Test ${pair(...good)}: ${good[0]} + ${good[1]} = ${good[0] + good[1]} ≤ ${cap} ✓, and ${p1}(${good[0]}) + ${p2}(${good[1]}) = ${goodMoney} ≥ ${goal} ✓. It meets both, so it is a solution of the system.`,
      `Test ${pair(...failMoney)}: 2 ≤ ${cap} ✓, but ${p1} + ${p2} = ${moneyFail}, less than ${goal} ✗. It fails only the money inequality, so it is not a solution.`,
      `Test ${pair(...failCount)}: ${countFail} ≤ ${cap} ✗, though ${moneyCountFail} ≥ ${goal} ✓. It fails only the ${story.label.toLowerCase()} inequality: earning enough is not enough.`,
      `So of these three, only ${pair(...good)} is a solution: a solution of a system has to make every one of its inequalities true, and on a graph it lies where the two shadings overlap.`,
    ];
    return { prompt, steps, answer: `x + y ≤ ${cap} and ${p1}x + ${p2}y ≥ ${goal}; only ${pair(...good)} is a solution` };
  }
  return null;
};

const inequalitySystemRegionSibling = (random) => {
  for (let tries = 0; tries < 40; tries += 1) {
    const m = nonZero(random, -3, 3);
    const b1 = integer(random, 4, 12);
    const b2 = b1 - integer(random, 3, 7);
    const left = (bb) => `${num(bb)} ${m < 0 ? MINUS : '+'} ${coefficient(Math.abs(m))}x`;
    const line = (bb) => linear(m, bb);
    const xCheck = nonZero(random, -4, 4);
    const yCheck = m * xCheck + b2 + integer(random, 1, b1 - b2 - 1);
    const prompt = `Rewrite each system with y alone, and decide whether its solutions are above both lines, below both, between them, or none. A: y < ${left(b1)} and ${left(b2)} > y. B: ${left(b1)} < y and y > ${left(b2)}. C: y < ${left(b1)} and y > ${left(b2)}. D: y > ${left(b1)} and ${left(b2)} > y.`;
    const steps = [
      `Write each inequality with y on the left, so the symbol says above (>) or below (<): “${left(b2)} > y” is the same as y < ${line(b2)}, read from the other side.`,
      `The two boundaries y = ${line(b1)} and y = ${line(b2)} have the same slope, so they are parallel: y = ${line(b1)} is the upper line, ${b1 - b2} units above the other.`,
      `A: y < ${line(b1)} and y < ${line(b2)}. Below both lines: below the lower line is below the upper one too, so the solutions are the region below y = ${line(b2)}.`,
      `B: y > ${line(b1)} and y > ${line(b2)}. Above both lines: the region above the upper line.`,
      `C: y < ${line(b1)} and y > ${line(b2)}. Below the upper line and above the lower one: the strip between the lines.`,
      `D: y > ${line(b1)} and y < ${line(b2)}. Above the upper line AND below the lower line at once is impossible, so no point works: no solution.`,
      `Check C with a point between the lines, (${num(xCheck)}, ${num(yCheck)}): the upper line is at ${num(m * xCheck + b1)} there and the lower at ${num(m * xCheck + b2)}, and ${num(yCheck)} < ${num(m * xCheck + b1)} ✓, ${num(yCheck)} > ${num(m * xCheck + b2)} ✓.`,
    ];
    return { prompt, steps, answer: 'A: below both; B: above both; C: between; D: none' };
  }
  return null;
};

/* -------------------------------------------------- linear shifts */

// "up 6" or "down 6": the vertical shift by d.
const vertical = (d) => (d < 0 ? `down ${num(-d)}` : `up ${num(d)}`);

const linearShiftSibling = (random) => {
  for (let tries = 0; tries < 40; tries += 1) {
    const m = pick(random, [-3, -2, 3, 4, 5]);
    const b = nonZero(random, -6, 6);
    const k = integer(random, 2, 6);
    const name = pick(random, ['g', 'h', 'p']);
    const rule = linear(m, b);
    const up = linear(m, b + k);
    const left = linear(m, b + m * k);
    const right = linear(m, b - m * k);
    const down = linear(m, b - k);
    const stretchOut = linear(k * m, k * b);
    const stretchIn = linear(k * m, b);
    const prompt = `Let ${name}(x) = ${rule}. Write and simplify ${name}(x) shifted up ${k}, left ${k}, right ${k} and down ${k}, then compare ${k}·${name}(x) with ${name}(${k}x).`;
    const steps = [
      `Up ${k}: every point rises ${k}, so add ${k} to ${name}(x): ${name}(x) + ${k} = ${rule} + ${k} = ${up}.`,
      `Left ${k}: the line now reaches each height ${k} units sooner, so put x + ${k} in place of x: ${name}(x + ${k}) = ${coefficient(m)}(x + ${k}) ${b < 0 ? MINUS : '+'} ${Math.abs(b)} = ${left}.`,
      `Both have slope ${num(m)}, so they are parallel lines, and left ${k} gives the same line as ${vertical(m * k)}: moving ${k} across on a line of slope ${num(m)} changes the height by ${num(m * k)}.`,
      `Right ${k}: ${name}(x ${MINUS} ${k}) = ${right}. Down ${k}: ${name}(x) ${MINUS} ${k} = ${down}. These are different, parallel lines: right ${k} gives the same line as ${vertical(-m * k)}, by the same slope.`,
      `${k}·${name}(x) multiplies every output by ${k}: ${stretchOut}. ${name}(${k}x) multiplies every input by ${k}: ${stretchIn}. The slopes agree, but the y-intercepts ${num(k * b)} and ${num(b)} differ, so for this ${name} they are different lines.`,
    ];
    return { prompt, steps, answer: `${up}; ${left}; ${right}; ${down}; ${stretchOut} and ${stretchIn}` };
  }
  return null;
};

/* ---------------------------------------------------------------------------
 * Which kind an item is.
 * ------------------------------------------------------------------------- */

const has = (pattern, value) => pattern.test(value);
const NO_EXAMPLE_ROLES = new Set(['dol', 'quiz', 'test']);

const kindOf = (question) => {
  if (!isObject(question) || !isMultiAnswer(question)) return null;
  const standard = primaryStandard(question);
  if (!isAlgebraOneStandard(standard)) return null;
  if (namesAProperty(question)) return null;
  // A DOL, quiz or test never shows an example (exampleSectionRule); this
  // family does not even claim one there.
  if (NO_EXAMPLE_ROLES.has(text(question.activityRole).toLowerCase())) return null;
  const shown = normalized(shownText(question));
  const prompt = normalized(question.prompt);
  const rules = shownRules(question);
  const lines = graphLines(question);

  switch (standard) {
    case 'A.5B': {
      if (has(/stands for a number/i, prompt) && hasInequalitySymbol(prompt)) return { kind: 'inequalityReverse', variant: 'letter' };
      if (has(/\bsolved\b/i, prompt) && hasInequalitySymbol(prompt)) {
        return { kind: 'inequalityReverse', variant: /\(\s*x\s*[-+]/.test(prompt) ? 'distributive' : 'twoWays' };
      }
      if (rules.some((rule) => rule.slope < 0)) return { kind: 'inequalityReverse', variant: 'decreasing' };
      const increasing = rules.filter((rule) => rule.slope > 0);
      if (increasing.length >= 2) return { kind: 'inequalityModel', variant: 'compare' };
      const goalWords = has(/inequality/i, shown) && has(/\$\s?\d/, shown) && has(/whole number|at least|greatest|least/i, shown);
      if (increasing.length === 1 || lines.some((line) => Number(line.m) > 0) || has(/your solution is/i, prompt) || goalWords) {
        return { kind: 'inequalityModel', variant: 'goal' };
      }
      return null;
    }
    case 'A.3B':
      if (rules.some((rule) => rule.slope < 0) && has(/intercept/i, shown)) return { kind: 'linearIntercepts', variant: 'decreasing' };
      return null;
    case 'A.5A':
      if (has(/no solution|infinite|every real number|no value of x|never be equal|every value of x|how many solutions|which values of x make it true/i, shown)) return { kind: 'solutionCount' };
      if (has(/\bverify\b|\bcheck that\b/i, prompt) && has(/when x =/i, shown)) return { kind: 'verifySolution' };
      return null;
    case 'A.3C':
    case 'A.2A':
      if (has(/intercept|domain|range|slope/i, shown) && /\d\s*[a-z]\s*\+\s*\d+\s*[a-z]\s*=\s*\d/.test(prompt)) return { kind: 'linearIntercepts', variant: 'standard' };
      return null;
    case 'A.3E':
      if (has(/shift|translat|in terms of [a-z]\(x\)|outputs|inputs/i, shown)) return { kind: 'linearShift' };
      return null;
    case 'A.2I':
    case 'A.2C':
    case 'A.3F':
    case 'A.3G':
    case 'A.5C': {
      if (has(/parallel|same line|infinitely many|no solution|ever earn as much|true statement|false statement|what do you know about the solutions|saving more each week|seem never to meet/i, shown)) {
        return { kind: 'systemCases', variant: has(/stands for a number|parameter/i, shown) ? 'letter' : 'plain' };
      }
      if (has(/estimate|exact solution|between grid lines/i, shown)) return { kind: 'systemSubstitution', variant: 'exact' };
      if (has(/substitut|cross at|crosses at|satisfy both|solution of the system/i, shown) && (/=/.test(shown))) {
        if (has(/\blet [a-z] be\b/i, prompt) && has(/\$/, prompt)) return { kind: 'systemWord' };
        return { kind: 'systemSubstitution', variant: 'plain' };
      }
      if (has(/\blet [a-z] be\b/i, prompt) && has(/\$|tickets|price/i, prompt) && has(/equation/i, shown)) return { kind: 'systemWord' };
      // Two equations about the same counts in a situation (s + a = 450 and 5s + 10a = C).
      if (has(/tickets|\$|money collected/i, prompt) && (prompt.match(/[a-z]\s*\+\s*\d*\s*[a-z]\s*=/g) || []).length >= 2) return { kind: 'systemWord' };
      return null;
    }
    case 'A.2H':
    case 'A.3D':
    case 'A.3H': {
      if (has(/system/i, shown) || standard === 'A.3H') {
        if (has(/region|between the lines|above both|below both|match each system|match a possible/i, shown)) return { kind: 'inequalitySystemRegion' };
        return { kind: 'inequalitySystemPoints' };
      }
      if (has(/\bgraphs? [a-c]\b|boundary|shaded|half-plane|dashed|solid|fine line/i, shown) && !has(/\blet x be\b|\bwhere x is\b|\bx is (?:her|his|the)\b/i, prompt)) return { kind: 'inequalityGraph' };
      if (has(/\blet x be\b|\bwhere x is\b|\bx is (?:her|his|the)\b|\bcombination/i, prompt)) return { kind: 'twoVariableContext' };
      if (/\d\s*x\s*[+-]\s*\d*\s*y\s*[<>≤≥=]/.test(prompt) && has(/makes? sense|points? (?:below|above|on)/i, shown)) return { kind: 'twoVariableContext' };
      return null;
    }
    default:
      return null;
  }
};

const siblingFor = (model, random) => {
  switch (model.kind) {
    case 'inequalityModel':
      return model.variant === 'compare' ? compareModelsSibling(random) : inequalityModelSibling(random);
    case 'inequalityReverse':
      if (model.variant === 'letter') return letterCoefficientSibling(random);
      if (model.variant === 'distributive') return reverseDistributiveSibling(random);
      if (model.variant === 'decreasing') return decreasingModelSibling(random);
      return reverseTwoWaysSibling(random);
    case 'solutionCount':
      return solutionCountSibling(random);
    case 'verifySolution':
      return verifySolutionSibling(random);
    case 'systemWord':
      return systemWordSibling(random);
    case 'systemSubstitution':
      return substitutionSibling(random, { exactVersusGraph: model.variant === 'exact' });
    case 'systemCases':
      return systemCasesSibling(random, { withLetter: model.variant === 'letter' });
    case 'linearIntercepts':
      return model.variant === 'decreasing' ? decreasingInterceptsSibling(random) : interceptsSibling(random);
    case 'twoVariableContext':
      return twoVariableContextSibling(random);
    case 'inequalityGraph':
      return inequalityGraphSibling(random);
    case 'inequalitySystemPoints':
      return inequalitySystemPointsSibling(random);
    case 'inequalitySystemRegion':
      return inequalitySystemRegionSibling(random);
    case 'linearShift':
      return linearShiftSibling(random);
    default:
      return null;
  }
};

/* ---------------------------------------------------------------------------
 * The contract.
 * ------------------------------------------------------------------------- */

/** Which kind of sibling this item gets ({ kind, variant }), or null. */
export const questionKind = (question) => {
  try {
    return kindOf(question);
  } catch {
    return null;
  }
};

export const matches = (question) => Boolean(questionKind(question));
export const hints = () => [];
export const expectedValues = () => [];
export const backUpQuestion = () => null;

export const similarProblem = (question, { seed = 0 } = {}) => {
  try {
    const model = kindOf(question);
    return model ? firstSafeSibling(question, seed, (random) => siblingFor(model, random)) : null;
  } catch {
    return null;
  }
};
