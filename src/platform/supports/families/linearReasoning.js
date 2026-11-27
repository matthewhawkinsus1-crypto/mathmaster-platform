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

/**
 * 1600 → "1,600 dollars", 2.5 → "2.50 dollars". Written in words, not "$": a
 * line with two prices and an "=" between them reads to the translator as one
 * LaTeX span ($…$), so its sentences could not be translated (mathSafeText.js).
 */
const money = (value) => {
  const cents = Math.round(Number(value) * 100);
  const whole = Math.floor(Math.abs(cents) / 100);
  const rest = Math.abs(cents) % 100;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const amount = `${cents < 0 ? MINUS : ''}${grouped}${rest ? `.${String(rest).padStart(2, '0')}` : ''}`;
  return `${amount} ${cents === 100 ? 'dollar' : 'dollars'}`;
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
 * Each sibling is { prompt, steps, answer }; each step says the move and why.
 *
 * WRITTEN TO BE TRANSLATED. Every sentence is one the Spanish pack knows
 * (src/platform/language/packs/esSupport.js, linearReasoningSiblings): the
 * mathematics goes in its slots, and the words of a situation come from the
 * small tables below, which the pack mirrors. A new sentence or a new
 * situation here needs its Spanish there (tests/platform/
 * readAloudAndTranslate.test.mjs counts the real lessons' siblings).
 * ------------------------------------------------------------------------- */

// The situations, by key; the pack has the same keys.
export const SALES_SITUATIONS = Object.freeze([
  { key: 'band', who: 'The band', sells: 'sells T-shirts', item: 'T-shirts', one: 'T-shirt' },
  { key: 'garden', who: 'The garden club', sells: 'sells potted plants', item: 'potted plants', one: 'potted plant' },
  { key: 'art', who: 'The art club', sells: 'sells greeting cards', item: 'greeting cards', one: 'greeting card' },
]);

const RATES = Object.freeze([2.5, 4, 5, 6, 7.5, 8, 12]);

// inequalityModel: a goal reached "at least" and a total kept "less than".
const inequalityModelSibling = (random) => {
  const place = pick(random, SALES_SITUATIONS);
  const rate = pick(random, RATES);
  const start = 5 * integer(random, 2, 16);
  const rule = `S(n) = ${linear(rate, start, 'n')}`;
  // At least G: the boundary falls halfway between two whole numbers, so the student must round up.
  const least = integer(random, 18, 90);
  const boundary = least - 0.5;
  const goal = start + rate * boundary;
  // Less than H: H is reached exactly at a whole number, which is left out.
  const highCount = least + integer(random, 15, 60);
  const ceiling = start + rate * highCount;
  const greatest = highCount - 1;
  const prompt = [
    `${place.who} ${place.sells} for ${money(rate)} each and already has ${money(start)}.`,
    `Its total after selling n ${place.item} is ${rule}.`,
    `At least how many ${place.item} must it sell to have at least ${money(goal)}?`,
    `What is the greatest number of ${place.item} it can sell and still have less than ${money(ceiling)}?`,
  ].join(' ');
  const steps = [
    `At least ${money(goal)} means the total is ${money(goal)} or more, so write ${linear(rate, start, 'n')} ≥ ${num(goal)}. The symbol ≥ keeps the goal itself in.`,
    `Subtract ${num(start)} from both sides to undo the starting amount: ${linear(rate, 0, 'n')} ≥ ${num(goal - start)}.`,
    `Divide both sides by ${num(rate)} to get n alone. ${num(rate)} is positive, so the symbol stays the same: n ≥ ${num(boundary)}.`,
    `On a graph this boundary is where the horizontal line y = ${num(goal)} meets the graph of S.`,
    `n counts whole ${place.item}, so round up to the next whole number: ${least}. Rounding down would fall short.`,
    `Check: S(${least}) = ${num(rate)}(${least}) + ${num(start)} = ${num(rate * least + start)}, which is at least ${num(goal)}. One fewer, S(${least - 1}) = ${num(rate * (least - 1) + start)}, is not enough.`,
    `Less than ${money(ceiling)} leaves ${money(ceiling)} itself out, so write ${linear(rate, start, 'n')} < ${num(ceiling)}. Subtract ${num(start)} and divide by ${num(rate)}: n < ${num(highCount)}.`,
    `On a number line, n < ${num(highCount)} is an open dot at ${num(highCount)}, because ${num(highCount)} ${place.item} give exactly ${money(ceiling)}, which is not less than ${money(ceiling)}. n ≥ ${num(boundary)} is a closed dot, because its boundary is included.`,
    `The greatest whole number less than ${num(highCount)} is ${greatest}. Only whole numbers from 0 up make sense here, because no one sells part of a ${place.one}.`,
  ];
  // One line "Practise one like this" reads into boxes it can check (practiceLikeThis.js).
  return { prompt, steps, answer: `least ${least}; greatest ${greatest}` };
};

// inequalityModel, two models: when does the one with no head start earn more?
const compareModelsSibling = (random) => {
  const place = pick(random, SALES_SITUATIONS);
  for (let tries = 0; tries < 40; tries += 1) {
    const slow = pick(random, [2, 3, 4, 5, 6]);
    const gap = pick(random, [0.5, 1, 1.5, 2, 2.5]);
    const fast = slow + gap;
    const meet = integer(random, 8, 40);
    const head = gap * meet;
    if (!Number.isInteger(head) || head <= 0) continue;
    const prompt = [
      `${place.who} can earn money from ${place.item} in two ways.`,
      `Plan A earns ${money(slow)} per ${place.one} plus ${money(head)} up front: A(n) = ${linear(slow, head, 'n')}.`,
      `Plan B earns ${money(fast)} per ${place.one} with nothing up front: B(n) = ${linear(fast, 0, 'n')}.`,
      `For which numbers of ${place.item} does Plan B earn more?`,
    ].join(' ');
    const steps = [
      `The graphs meet where the plans earn the same, so set them equal: ${linear(fast, 0, 'n')} = ${linear(slow, head, 'n')}.`,
      gap === 1
        ? `Subtract ${linear(slow, 0, 'n')} from both sides to collect the n-terms: n = ${num(meet)}.`
        : `Subtract ${linear(slow, 0, 'n')} from both sides to collect the n-terms: ${linear(gap, 0, 'n')} = ${num(head)}, so n = ${num(meet)}.`,
      `Both plans earn ${num(fast * meet)} there, so the graphs meet at ${pair(meet, fast * meet)}.`,
      `Plan B earns more means B(n) > A(n): ${linear(fast, 0, 'n')} > ${linear(slow, head, 'n')}.`,
      gap === 1
        ? `The same moves give n > ${num(meet)}, and no step multiplies or divides by a negative, so the symbol stays.`
        : `The same moves give ${linear(gap, 0, 'n')} > ${num(head)}, and dividing by the positive ${num(gap)} keeps the symbol: n > ${num(meet)}.`,
      `The symbol is > and not ≥, because at ${num(meet)} ${place.item} the plans earn the same, which is not more. The least whole number of ${place.item} is the next one, ${meet + 1}.`,
      `On the graph, the line of Plan B is above the line of Plan A to the right of the meeting point. Plan B earns ${money(gap)} more on each ${place.one}, so it catches up with the head start of Plan A and then passes it.`,
    ];
    return { prompt, steps, answer: `n > ${num(meet)}; least ${meet + 1}` };
  }
  return null;
};

// inequalityReverse: dividing by a negative number reverses the symbol.
const FLIP = Object.freeze({ '<': '>', '≤': '≥', '>': '<', '≥': '≤' });

const reverseTwoWaysSibling = (random) => {
  const k = integer(random, 2, 7);
  const root = nonZero(random, -9, 9);
  const p = integer(random, 3, 30);
  const q = p - k * root;
  const symbol = pick(random, ['<', '≤', '>', '≥']);
  const flipped = FLIP[symbol];
  const test = root + (flipped === '>' || flipped === '≥' ? 1 : -1) * integer(random, 1, 4);
  const small = integer(random, 3, 8);
  const large = small + integer(random, 2, 9);
  const prompt = `Solve ${num(p)} ${MINUS} ${k}x ${symbol} ${num(q)} in two ways: keep the x-term on the left, then move it to the right. Then check a number.`;
  const steps = [
    `First way: ${undo(p)} both sides to leave the x-term alone: ${MINUS}${k}x ${symbol} ${num(q - p)}.`,
    `Divide both sides by ${MINUS}${k}. Dividing by a negative number reverses the order of numbers: ${small} < ${large}, but ${MINUS}${small} > ${MINUS}${large}. So ${symbol} turns into ${flipped}: x ${flipped} ${num(root)}.`,
    `Second way: add ${k}x to both sides so the x-term is positive: ${num(p)} ${symbol} ${num(q)} + ${k}x.`,
    `Then ${undo(q)} both sides: ${num(p - q)} ${symbol} ${k}x.`,
    `Divide both sides by the positive ${k}, and the symbol stays: ${num(root)} ${symbol} x.`,
    `${num(root)} ${symbol} x and x ${flipped} ${num(root)} say the same thing, read from opposite sides, so the two ways agree.`,
    `Check x = ${num(test)}, a number in the solution set: ${num(p)} ${MINUS} ${k}(${num(test)}) = ${num(p - k * test)}, and ${num(p - k * test)} ${symbol} ${num(q)} is true.`,
  ];
  return { prompt, steps, answer: `x ${flipped} ${num(root)}` };
};

const reverseDistributiveSibling = (random) => {
  const k = integer(random, 2, 6);
  const h = nonZero(random, -8, 8);
  const root = h + pick(random, [-3, -2, -1, 1, 2, 3]);
  const c = -k * (root - h);
  const symbol = pick(random, ['<', '≥']);
  const flipped = FLIP[symbol];
  const inside = h > 0 ? `x ${MINUS} ${h}` : `x + ${-h}`;
  const prompt = `Solve ${MINUS}${k}(${inside}) ${symbol} ${num(c)} in two ways: distribute first, or divide both sides by ${MINUS}${k} first.`;
  const steps = [
    `First way: distribute ${MINUS}${k} to both terms in the parentheses: ${linear(-k, k * h)} ${symbol} ${num(c)}.`,
    `${capital(undo(k * h))} both sides: ${MINUS}${k}x ${symbol} ${num(c - k * h)}.`,
    `Divide both sides by ${MINUS}${k}. Dividing by a negative number reverses the symbol, so ${symbol} becomes ${flipped}: x ${flipped} ${num(root)}.`,
    `Second way: divide both sides by ${MINUS}${k} first, and reverse the symbol now, because ${MINUS}${k} is negative: ${inside} ${flipped} ${num(c / -k)}.`,
    `Then ${undo(-h)} both sides: x ${flipped} ${num(root)}, the same answer as the first way.`,
  ];
  return { prompt, steps, answer: `x ${flipped} ${num(root)}` };
};

export const DRAINING_SITUATIONS = Object.freeze([
  { key: 'tank', what: 'A water tank', rateWord: 'drains', unit: 'liters', time: 'minutes', each: 'minute', measure: 'the water in it, in liters', empty: 'the tank is empty' },
  { key: 'balloon', what: 'A hot-air balloon', rateWord: 'descends', unit: 'feet', time: 'minutes', each: 'minute', measure: 'its height, in feet', empty: 'the balloon is on the ground' },
  { key: 'battery', what: 'A phone battery', rateWord: 'loses', unit: 'percent', time: 'hours', each: 'hour', measure: 'its charge, in percent', empty: 'the battery is flat' },
]);

const decreasingModelSibling = (random) => {
  const place = pick(random, DRAINING_SITUATIONS);
  const rate = pick(random, [5, 8, 12, 15, 25, 30]);
  const total = rate * integer(random, 20, 60);
  const t1 = integer(random, 3, Math.floor(total / rate / 2));
  const above = total - rate * t1;
  const t2 = integer(random, t1 + 2, Math.floor(total / rate) - 1);
  const below = total - rate * t2;
  const rule = `${num(total)} ${MINUS} ${rate}t`;
  const prompt = `${place.what} ${place.rateWord} ${rate} ${place.unit} each ${place.each}: V(t) = ${rule} is ${place.measure} after t ${place.time}. Solve V(t) > ${num(above)} and V(t) ≤ ${num(below)} for t.`;
  const steps = [
    `V(t) > ${num(above)} means ${rule} > ${num(above)}. Subtract ${num(total)} from both sides: ${MINUS}${rate}t > ${num(above - total)}.`,
    `Divide both sides by ${MINUS}${rate}, a negative number, so the symbol reverses: t < ${num(t1)}.`,
    `The amount is above ${num(above)} only before ${num(t1)} ${place.time}, because it goes down as time goes on.`,
    `V(t) ≤ ${num(below)} means ${rule} ≤ ${num(below)}, so ${MINUS}${rate}t ≤ ${num(below - total)}. Dividing by ${MINUS}${rate} reverses ≤ to ≥: t ≥ ${num(t2)}.`,
  ];
  return { prompt, steps, answer: `t < ${num(t1)}; t ≥ ${num(t2)}` };
};

const letterCoefficientSibling = (random) => {
  const c = nonZero(random, -9, 9);
  const d = c + pick(random, [6, 8, 10, 12, 15, 18]) * pick(random, [1, -1]);
  const gap = d - c;
  const positive = pick(random, [2, 3, 5, 6]);
  const prompt = `In kx ${c < 0 ? MINUS : '+'} ${Math.abs(c)} < ${num(d)}, the letter k stands for a number. Solve it when k = ${positive}, when k = ${MINUS}${positive}, and when k = 0.`;
  const steps = [
    `${capital(undo(c))} both sides first, whatever k is: kx < ${num(gap)}.`,
    `When k = ${positive}, divide both sides by ${positive}, a positive number, so the symbol stays: x < ${frac(gap, positive)}.`,
    `When k = ${MINUS}${positive}, divide both sides by ${MINUS}${positive}, a negative number, so the symbol reverses: x > ${frac(gap, -positive)}.`,
    `So for k > 0 the solutions are x < ${num(gap)}/k, and for k < 0 they are x > ${num(gap)}/k: the sign of k decides the direction.`,
    `When k = 0 you cannot divide by 0, so put 0 in for k instead: 0 < ${num(gap)}. ${gap > 0 ? 'That is true, so every real number x is a solution.' : 'That is false, so no x is a solution.'}`,
  ];
  return { prompt, steps, answer: `x < ${frac(gap, positive)}; x > ${frac(gap, -positive)}` };
};

// solutionCount: one, none, or infinitely many, side by side.
const solutionCountSibling = (random) => {
  for (let tries = 0; tries < 40; tries += 1) {
    const a = integer(random, 2, 5);
    const h = nonZero(random, -6, 6);
    const e = nonZero(random, -9, 9);
    const b = -a * h + e; // a(x − h) + e = ax + b: the same line
    const other = b + nonZero(random, -7, 7);
    const steeper = a + pick(random, [1, 2, 3]);
    const oneRhs = nonZero(random, -12, 12);
    const xOne = (b - oneRhs) / (steeper - a);
    if (!Number.isInteger(xOne) || xOne === 0) continue;
    const left = `${a}(${h > 0 ? `x ${MINUS} ${h}` : `x + ${-h}`}) ${e > 0 ? '+' : MINUS} ${Math.abs(e)}`;
    const simplified = linear(a, b);
    const p = pick(random, [3, 4, 6]);
    const q = nonZero(random, -5, 5);
    const parameter = `${p}(x ${q > 0 ? '+' : MINUS} ${Math.abs(q)})`;
    const prompt = [
      'How many solutions does each equation have?',
      `Equation A is ${left} = ${simplified}, equation B is ${left} = ${linear(a, other)}, and equation C is ${left} = ${linear(steeper, oneRhs)}.`,
      `Then find k so that ${parameter} = ${p}x + k has infinitely many solutions.`,
    ].join(' ');
    const steps = [
      `First simplify the left side, which is the same in all three: distribute ${a}, then combine the constants: ${left} = ${simplified}.`,
      `In A, ${simplified} = ${simplified}: whatever number x is, the two sides give the same value, so A has infinitely many solutions.`,
      `In B, ${simplified} = ${linear(a, other)}: subtracting ${coefficient(a)}x from both sides leaves ${num(b)} = ${num(other)}, which is false for every x, so B has no solution.`,
      `In C, ${simplified} = ${linear(steeper, oneRhs)}: the x-terms do not cancel, because ${coefficient(a)}x and ${coefficient(steeper)}x are different.`,
      `Subtract ${coefficient(a)}x from both sides and ${undo(oneRhs).replace(/ (from|to)$/, '')} to get ${num(b - oneRhs)} = ${coefficient(steeper - a)}x, so C has exactly one solution, x = ${num(xOne)}.`,
      `Check C: ${a}(${num(xOne)} ${h > 0 ? MINUS : '+'} ${Math.abs(h)}) ${e > 0 ? '+' : MINUS} ${Math.abs(e)} = ${num(a * xOne + b)}, and ${substituted(steeper, oneRhs, xOne)} = ${num(steeper * xOne + oneRhs)}.`,
      `For infinitely many solutions both sides must be the same: ${parameter} = ${linear(p, p * q)}, so k must be ${num(p * q)}. Any other value of k leaves a false statement, and then there is no solution.`,
    ];
    return { prompt, steps, answer: `C: x = ${num(xOne)}; k = ${num(p * q)}` };
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
    if (times === minus) continue;
    const c1 = times * add;
    const r1 = times * (s + add);
    const left = linear(times - minus, c1);
    const right = `${num(r1)} ${MINUS} ${minus}x`;
    const prompt = `Start with x = ${num(s)} and build a new equation by doing the same thing to both sides three times. Then check that x = ${num(s)} still makes the final equation true.`;
    const steps = [
      `Add ${add} to both sides: x + ${add} = ${num(s + add)}, because adding the same number to both sides keeps them equal.`,
      `Multiply both sides by ${times}: ${times}x + ${c1} = ${num(r1)}, because multiplying both sides by the same number, other than 0, keeps them equal.`,
      `Subtract ${minus}x from both sides: ${left} = ${right}, because for any one x it is the same amount on each side.`,
      `Substitute x = ${num(s)} into each side of the final equation: ${substituted(times - minus, c1, s)} = ${num((times - minus) * s + c1)}, and ${num(r1)} ${MINUS} ${minus}(${num(s)}) = ${num(r1 - minus * s)}.`,
      `The two sides are equal, so x = ${num(s)} is still a solution: each move did the same thing to both sides, so every equation in the chain has the same solution.`,
    ];
    return { prompt, steps, answer: `${left} = ${right}, true for x = ${num(s)}` };
  }
  return null;
};

/* ------------------------------------------------------------ systems */

export const COUNT_AND_VALUE_SITUATIONS = Object.freeze([
  { key: 'snack', place: 'A snack stand', sold: 'sold', first: 'hot dogs', second: 'drinks', unit: 'items' },
  { key: 'museum', place: 'A museum', sold: 'admitted', first: 'adults', second: 'students', unit: 'visitors' },
  { key: 'bake', place: 'A bake sale', sold: 'sold', first: 'pies', second: 'loaves of bread', unit: 'items' },
]);

const systemWordSibling = (random) => {
  const story = pick(random, COUNT_AND_VALUE_SITUATIONS);
  const high = integer(random, 6, 15);
  const low = integer(random, 2, high - 1);
  const xCount = integer(random, 20, 140);
  const yCount = integer(random, 20, 140);
  const total = xCount + yCount;
  const value = high * xCount + low * yCount;
  const diff = high - low;
  const prompt = [
    `${story.place} ${story.sold} ${total} ${story.unit}: ${story.first} at ${money(high)} each and ${story.second} at ${money(low)} each, for ${money(value)} in all.`,
    `Let x be the number of ${story.first} and y the number of ${story.second}.`,
    'Write a system and solve it by substitution.',
  ].join(' ');
  const steps = [
    `Count equation: each of the ${total} ${story.unit} is one kind or the other, so x + y = ${total}.`,
    `Value equation: each kind brings in its price times how many there are, so ${high}x + ${low}y = ${value}. Both equations use the same x and y, so one pair of numbers must make both true.`,
    `Solve the count equation for y, because y has a coefficient of 1 there: y = ${total} ${MINUS} x.`,
    `Substitute ${total} ${MINUS} x for y in the value equation: ${high}x + ${low}(${total} ${MINUS} x) = ${value}.`,
    `Distribute and combine like terms: ${linear(diff, low * total)} = ${value}.`,
    diff === 1 ? `Subtract ${low * total}: x = ${xCount}.` : `Subtract ${low * total} and divide by ${diff}: x = ${xCount}.`,
    `Then y = ${total} ${MINUS} ${xCount} = ${yCount}.`,
    `Check in both: ${xCount} + ${yCount} = ${total}, and ${high}(${xCount}) + ${low}(${yCount}) = ${value}. So there were ${xCount} ${story.first} and ${yCount} ${story.second}.`,
    `The total can only be from ${money(low * total)}, if all of them are ${story.second}, to ${money(high * total)}, if all of them are ${story.first}: any other total would need a negative count.`,
  ];
  return { prompt, steps, answer: `x = ${xCount}, y = ${yCount}` };
};

const substitutionSibling = (random, { exactVersusGraph = false } = {}) => {
  for (let tries = 0; tries < 60; tries += 1) {
    const m = nonZero(random, -4, 4);
    const b = nonZero(random, -8, 8);
    const A = integer(random, 2, 6);
    const B = nonZero(random, -5, 5);
    const den = A + B * m;
    if (den === 0) continue;
    const other = (x0) => `${A}(${num(x0)}) ${B < 0 ? MINUS : '+'} ${coefficient(Math.abs(B))}`;
    const substitutedLine = `${A}x ${B < 0 ? MINUS : '+'} ${coefficient(Math.abs(B))}(${linear(m, b)})`;
    const solveFor = (target) => `${capital(undo(B * b))} both sides${den === 1 ? '' : ` and divide by ${num(den)}`}: x = ${target}.`;
    const opening = [
      `y = ${linear(m, b)} is already solved for y, so substitute ${linear(m, b)} for y in the other equation. Both equations describe the same y, so the solution must make both true.`,
    ];
    if (exactVersusGraph) {
      const C = nonZero(random, -30, 30);
      const xNum = C - B * b;
      if (Math.abs(den) < 2 || xNum % den === 0) continue;
      const yNum = m * xNum + b * den;
      const xs = frac(xNum, den);
      const ys = frac(yNum, den);
      const prompt = `The lines y = ${linear(m, b)} and ${twoTerms(A, B)} = ${num(C)} cross between grid lines. Find the exact solution by substitution.`;
      const steps = [
        ...opening,
        `That gives ${substitutedLine} = ${num(C)}. Distribute and combine like terms: ${linear(den, B * b)} = ${num(C)}.`,
        solveFor(xs),
        `Substitute x = ${xs} into y = ${linear(m, b)}: y = ${ys}. So the solution is (${xs}, ${ys}).`,
        `A graph shows it only roughly, near (${num(xNum / den)}, ${num(yNum / den)}), because the lines cross between grid lines, and substitution gives the exact point.`,
      ];
      return { prompt, steps, answer: `(${xs}, ${ys})` };
    }
    const x0 = nonZero(random, -6, 6);
    const y0 = m * x0 + b;
    const C = A * x0 + B * y0;
    const prompt = `Solve the system by substitution, then check it: y = ${linear(m, b)} and ${twoTerms(A, B)} = ${num(C)}.`;
    const steps = [
      ...opening,
      `That gives ${substitutedLine} = ${num(C)}. Distribute and combine like terms: ${linear(den, B * b)} = ${num(C)}.`,
      solveFor(num(x0)),
      `Substitute x = ${num(x0)} into the equation solved for y, because it is the easiest: y = ${substituted(m, b, x0)} = ${num(y0)}.`,
      `Check in both equations: ${substituted(m, b, x0)} = ${num(y0)}, and ${other(x0)}(${num(y0)}) = ${num(C)}.`,
      `So ${pair(x0, y0)} is the solution: it lies on both lines, where their graphs cross.`,
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
    // The same line in standard form: scale(mx − y) = −scale·b.
    const sameLine = `${twoTerms(scale * m, -scale)} = ${num(-scale * b)}`;
    const letterLine = `y = kx ${other < 0 ? MINUS : '+'} ${Math.abs(other)}`;
    const prompt = [
      'What does substitution leave in each system, and how many solutions does each have?',
      `System A is y = ${linear(m, b)} and y = ${linear(m, other)}, system B is y = ${linear(m, b)} and ${sameLine}, and system C is y = ${linear(m, b)} and y = ${linear(m2, b2)}.`,
      ...(withLetter ? [`Then, for which k do y = ${linear(m, b)} and ${letterLine} have no solution?`] : []),
    ].join(' ');
    const steps = [
      `In A, substituting gives ${linear(m, b)} = ${linear(m, other)}. ${capital(removeX(m))} both sides leaves ${num(b)} = ${num(other)}, a false statement.`,
      'The lines have the same slope and different y-intercepts, so they are parallel and never meet, and A has no solution.',
      `In B, ${sameLine} with y alone is y = ${linear(m, b)}. Every term of ${sameLine} is ${scale} times a term of ${twoTerms(m, -1)} = ${num(-b)}, which is the first equation rearranged, so both describe one line.`,
      `Substituting leaves a true statement such as ${num(b)} = ${num(b)}, so every point on that line is a solution, and B has infinitely many.`,
      `In C, the slopes ${num(m)} and ${num(m2)} are different, so the lines cross once. Substituting gives ${linear(m, b)} = ${linear(m2, b2)}, so ${linear(m - m2, 0)} = ${num(b2 - b)}, x = ${num(xCross)}, and y = ${num(yCross)}.`,
      `Check C in both: ${substituted(m, b, xCross)} = ${num(yCross)}, and ${substituted(m2, b2, xCross)} = ${num(yCross)}, so C has exactly one solution, ${pair(xCross, yCross)}.`,
      ...(withLetter ? [
        'No solution needs parallel lines: the same slope and a different y-intercept.',
        `The intercepts ${num(b)} and ${num(other)} are already different, so k = ${num(m)} gives no solution, and no k gives the same line.`,
      ] : []),
    ];
    return { prompt, steps, answer: withLetter ? `C: ${pair(xCross, yCross)}; k = ${num(m)}` : `C: ${pair(xCross, yCross)}` };
  }
  return null;
};

export const FUNDRAISER_SITUATIONS = Object.freeze([
  { key: 'pins', first: 'pins', second: 'mugs', oneSecond: 'mug' },
  { key: 'pizzas', first: 'small pizzas', second: 'large pizzas', oneSecond: 'large pizza' },
  { key: 'posters', first: 'bookmarks', second: 'posters', oneSecond: 'poster' },
]);

const interceptsSibling = (random) => {
  const story = pick(random, FUNDRAISER_SITUATIONS);
  const a = pick(random, [2, 3, 4, 5, 6]);
  const ratio = pick(random, [2, 3, 4]);
  const b = a * ratio;
  const C = b * integer(random, 8, 30);
  const xi = C / a;
  const yi = C / b;
  const prompt = [
    `A club wants to raise ${money(C)} selling ${story.first} at ${money(a)} and ${story.second} at ${money(b)}: ${a}x + ${b}y = ${C}, where x is the number of ${story.first} and y the number of ${story.second}.`,
    'Find both intercepts and what they mean, the slope and what it means, and the reasonable domain.',
  ].join(' ');
  const steps = [
    `For the x-intercept, substitute 0 for y, because the intercept is where the line meets the x-axis: ${a}x = ${C}, so x = ${xi}. The point ${pair(xi, 0)} means ${xi} ${story.first} and no ${story.second} make exactly ${money(C)}.`,
    `For the y-intercept, substitute 0 for x: ${b}y = ${C}, so y = ${yi}. The point ${pair(0, yi)} means ${yi} ${story.second} and no ${story.first}.`,
    `From ${pair(0, yi)} to ${pair(xi, 0)}, y changes by ${MINUS}${yi} while x changes by ${xi}, so the slope is ${frac(-yi, xi)}. Every ${ratio} more ${story.first} sold means 1 fewer ${story.oneSecond} is needed.`,
    `With the axes swapped, the same points give a slope of ${frac(-xi, yi)}, the reciprocal: the graph is still right, it just reads the change the other way.`,
    random() < 0.5
      ? `As a mathematical line the domain is all real numbers, but here only whole numbers of ${story.first} from 0 to ${xi} make sense. Likewise only whole numbers of ${story.second} from 0 to ${yi}.`
      : `Here only whole numbers of ${story.first} from 0 to ${xi} make sense, because no one sells part of one, or fewer than none. Likewise only whole numbers of ${story.second} from 0 to ${yi}.`,
  ];
  return { prompt, steps, answer: `x-intercept ${pair(xi, 0)}; y-intercept ${pair(0, yi)}; slope ${frac(-yi, xi)}` };
};

const decreasingInterceptsSibling = (random) => {
  const place = pick(random, DRAINING_SITUATIONS);
  const rate = pick(random, [4, 6, 8, 12, 15, 25]);
  const end = integer(random, 12, 60);
  const total = rate * end;
  const prompt = `${place.what} ${place.rateWord} at a steady rate: H(t) = ${num(total)} ${MINUS} ${rate}t is ${place.measure} after t ${place.time}. Find the slope, the y-intercept and the t-intercept, and what each means.`;
  const steps = [
    `The slope is the number multiplying t, ${MINUS}${rate}. It is the change each ${place.each}: the amount goes down ${rate} ${place.unit} each ${place.each}, which is why it is negative.`,
    `The y-intercept is the value when t = 0, H(0) = ${num(total)}: the amount at the start.`,
    `The t-intercept is the t that makes H(t) = 0. Solve ${num(total)} ${MINUS} ${rate}t = 0: add ${rate}t to both sides and divide by ${rate}, so t = ${end}. After ${end} ${place.time}, ${place.empty}.`,
    `So the reasonable domain runs from 0 to ${end} ${place.time}: before 0 the situation has not started, and after ${end} the rule would give a negative amount.`,
  ];
  return { prompt, steps, answer: `slope ${MINUS}${rate}; y-intercept ${num(total)}; t-intercept ${end}` };
};

/* ------------------------------------------- inequalities in two variables */

export const SPENDING_SITUATIONS = Object.freeze([
  { key: 'florist', who: 'A florist', first: 'roses', second: 'lilies' },
  { key: 'coach', who: 'A coach', first: 'water bottles', second: 'towels' },
  { key: 'maya', who: 'Maya', first: 'songs', second: 'movies' },
]);

const twoVariableContextSibling = (random) => {
  const story = pick(random, SPENDING_SITUATIONS);
  for (let tries = 0; tries < 40; tries += 1) {
    const a = integer(random, 2, 9);
    const b = integer(random, 2, 9);
    if (a === b) continue;
    const xOn = integer(random, 1, 6);
    const yOn = integer(random, 1, 6);
    const C = a * xOn + b * yOn;
    const below = [Math.max(0, xOn - 1), Math.max(0, yOn - 1)];
    const above = [xOn + 2, yOn + 1];
    const cost = ([x, y]) => a * x + b * y;
    const shown = ([x, y]) => `${a}(${x}) + ${b}(${y})`;
    const prompt = [
      `${story.who} can spend at most ${money(C)} on ${story.first} at ${money(a)} each and ${story.second} at ${money(b)} each.`,
      `Let x be the number of ${story.first} and y the number of ${story.second}.`,
      `Write the inequality, then test ${pair(...below)}, ${pair(xOn, yOn)} and ${pair(...above)}.`,
    ].join(' ');
    const steps = [
      `The total cost is ${a}x + ${b}y: each price times how many are bought, added.`,
      `At most ${money(C)} means the cost can equal ${money(C)} or be less, so the symbol is ≤: ${a}x + ${b}y ≤ ${C}. Its boundary line ${a}x + ${b}y = ${C} is solid, because spending exactly ${money(C)} is allowed.`,
      `Test ${pair(...below)}: ${shown(below)} = ${cost(below)}, less than ${C}. That is true, so the point is below the line, and money is left over.`,
      `Test ${pair(xOn, yOn)}: ${shown([xOn, yOn])} = ${C}. That is true, so the point is on the line, spending exactly ${money(C)}.`,
      `Test ${pair(...above)}: ${shown(above)} = ${cost(above)}, more than ${C}. That is false, so the point is above the line and costs too much.`,
      'A point like (1.5, 2) can make the inequality true, but it does not make sense here, because no one buys half of one. So only whole numbers, 0 or more, are solutions in this situation.',
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
    const prompt = [
      `The boundary of a shaded half-plane passes through (0, ${num(b)}), and its y changes by ${num(rise)} for every ${run} to the right.`,
      'Write the inequality for each graph: solid and shaded above, dashed and shaded above, solid and shaded below, and dashed and shaded below.',
    ].join(' ');
    const steps = [
      `The y-intercept is ${num(b)}, where the line crosses the y-axis, and the slope is rise over run, ${slope}, so the boundary is y = ${boundary}.`,
      'A solid line means points on the line are solutions, so the symbol includes equal to, ≤ or ≥. A dashed line leaves them out, < or >.',
      'Shaded above means y is greater than the y-value of the line, so > or ≥. Shaded below means y is less, so < or ≤.',
      `So solid and above is y ≥ ${boundary}, dashed and above is y > ${boundary}, solid and below is y ≤ ${boundary}, and dashed and below is y < ${boundary}.`,
      `Check with a test point not on the line, (0, 0): in y ≥ ${boundary} it gives 0 ≥ ${num(b)}. ${b < 0 ? 'That is true, so (0, 0) must be in the shaded region above the line.' : 'That is false, so (0, 0) must be outside the shading above the line.'}`,
    ];
    return { prompt, steps, answer: `slope ${slope}; y-intercept ${num(b)}` };
  }
  return null;
};

/* --------------------------------------------- systems of inequalities */

export const LIMIT_SITUATIONS = Object.freeze([
  { key: 'van', who: 'A van driver', room: 'seats for at most', limit: 'people', first: 'adults', second: 'children', money: 'fares' },
  { key: 'caterer', who: 'A caterer', room: 'oven space for at most', limit: 'trays', first: 'sandwich trays', second: 'fruit trays', money: 'sales' },
  { key: 'tutor', who: 'A tutor', room: 'time for at most', limit: 'hours', first: 'math hours', second: 'reading hours', money: 'earnings' },
]);

const inequalitySystemPointsSibling = (random) => {
  const story = pick(random, LIMIT_SITUATIONS);
  for (let tries = 0; tries < 60; tries += 1) {
    const cap = integer(random, 8, 14);
    const p1 = integer(random, 9, 20);
    const p2 = integer(random, 4, p1 - 3);
    const gx = integer(random, 3, cap - 3);
    const gy = integer(random, 1, cap - gx);
    const goal = p1 * gx + p2 * gy - integer(random, 1, 8);
    const fx = cap;
    const fy = 3;
    if (p1 + p2 >= goal || p1 * fx + p2 * fy < goal || goal <= 0) continue;
    const prompt = [
      `${story.who} has ${story.room} ${cap} ${story.limit} and wants at least ${money(goal)} in ${story.money}.`,
      `Each of the ${story.first} (x) brings ${money(p1)}, and each of the ${story.second} (y) brings ${money(p2)}.`,
      `Write the system, then test ${pair(gx, gy)}, (1, 1) and ${pair(fx, fy)}.`,
    ].join(' ');
    const steps = [
      `x + y counts all the ${story.limit}, and at most ${cap} means ≤, so x + y ≤ ${cap}.`,
      `${p1}x + ${p2}y is the ${story.money}, and at least ${money(goal)} means ≥, so ${p1}x + ${p2}y ≥ ${goal}. The same x and y appear in both, because one choice has to meet both limits at once.`,
      `Test ${pair(gx, gy)}: ${gx} + ${gy} = ${gx + gy} ≤ ${cap}, and ${p1}(${gx}) + ${p2}(${gy}) = ${p1 * gx + p2 * gy} ≥ ${goal}. It meets both, so it is a solution of the system.`,
      `Test (1, 1): 1 + 1 = 2 ≤ ${cap}, but ${p1} + ${p2} = ${p1 + p2}, which is less than ${goal}. It fails only the second inequality, so it is not a solution.`,
      `Test ${pair(fx, fy)}: ${fx} + ${fy} = ${fx + fy}, which is more than ${cap}, though ${p1}(${fx}) + ${p2}(${fy}) = ${p1 * fx + p2 * fy} ≥ ${goal}. It fails only the first inequality: meeting one limit is not enough.`,
      `So of these three, only ${pair(gx, gy)} is a solution: a solution of a system makes every one of its inequalities true, and on a graph it lies where the two shadings overlap.`,
    ];
    return { prompt, steps, answer: `x + y ≤ ${cap}; ${p1}x + ${p2}y ≥ ${goal}; solution ${pair(gx, gy)}` };
  }
  return null;
};

const inequalitySystemRegionSibling = (random) => {
  for (let tries = 0; tries < 40; tries += 1) {
    const m = nonZero(random, -3, 3);
    const b1 = integer(random, 4, 12);
    const b2 = b1 - integer(random, 3, 7);
    const written = (bb) => `${num(bb)} ${m < 0 ? MINUS : '+'} ${coefficient(Math.abs(m))}x`;
    const line = (bb) => linear(m, bb);
    const xCheck = nonZero(random, -4, 4);
    const yCheck = m * xCheck + b2 + integer(random, 1, b1 - b2 - 1);
    const prompt = [
      'Rewrite each system with y alone, and decide whether its solutions are above both lines, below both, between them, or none.',
      `System A is y < ${written(b1)} and ${written(b2)} > y, system B is ${written(b1)} < y and y > ${written(b2)}, system C is y < ${written(b1)} and y > ${written(b2)}, and system D is y > ${written(b1)} and ${written(b2)} > y.`,
    ].join(' ');
    const steps = [
      `Write each inequality with y on the left, so the symbol says above or below: ${written(b2)} > y is the same as y < ${line(b2)}, read from the other side.`,
      `The boundaries y = ${line(b1)} and y = ${line(b2)} have the same slope, so they are parallel, and y = ${line(b1)} is the upper line, ${b1 - b2} units above the other.`,
      `A is y < ${line(b1)} and y < ${line(b2)}: below both lines, which is the region below y = ${line(b2)}.`,
      `B is y > ${line(b1)} and y > ${line(b2)}: above both lines, which is the region above y = ${line(b1)}.`,
      `C is y < ${line(b1)} and y > ${line(b2)}: the strip between the lines.`,
      `D is y > ${line(b1)} and y < ${line(b2)}: above the upper line and below the lower line at once is impossible, so D has no solution.`,
      `Check C with a point between the lines, ${pair(xCheck, yCheck)}: there the upper line is at ${num(m * xCheck + b1)} and the lower at ${num(m * xCheck + b2)}, and ${num(yCheck)} < ${num(m * xCheck + b1)} and ${num(yCheck)} > ${num(m * xCheck + b2)}.`,
    ];
    return { prompt, steps, answer: `upper line y = ${line(b1)}; lower line y = ${line(b2)}` };
  }
  return null;
};

/* -------------------------------------------------- linear shifts */

const linearShiftSibling = (random) => {
  const m = pick(random, [-3, -2, 3, 4, 5]);
  const b = nonZero(random, -6, 6);
  const k = integer(random, 2, 6);
  const rule = linear(m, b);
  const up = linear(m, b + k);
  const left = linear(m, b + m * k);
  const right = linear(m, b - m * k);
  const down = linear(m, b - k);
  const vertical = (d) => (d < 0 ? `down ${num(-d)}` : `up ${num(d)}`);
  const prompt = `Let g(x) = ${rule}. Write and simplify g(x) shifted up ${k}, left ${k}, right ${k} and down ${k}, then compare ${k}·g(x) with g(${k}x).`;
  const steps = [
    `Up ${k}: every point rises ${k}, so add ${k} to g(x): g(x) + ${k} = ${rule} + ${k} = ${up}.`,
    `Left ${k}: the line now reaches each height ${k} units sooner, so put x + ${k} in place of x: g(x + ${k}) = ${coefficient(m)}(x + ${k}) ${b < 0 ? MINUS : '+'} ${Math.abs(b)} = ${left}.`,
    `Both have slope ${num(m)}, so they are parallel lines. Left ${k} gives the same line as ${vertical(m * k)}, because moving ${k} across on a line of slope ${num(m)} changes the height by ${num(m * k)}.`,
    `Right ${k}: g(x ${MINUS} ${k}) = ${right}, and down ${k}: g(x) ${MINUS} ${k} = ${down}. These are different, parallel lines, and right ${k} gives the same line as ${vertical(-m * k)}.`,
    `${k}·g(x) multiplies every output by ${k}, giving ${linear(k * m, k * b)}, and g(${k}x) multiplies every input by ${k}, giving ${linear(k * m, b)}. The slopes agree, but the y-intercepts ${num(k * b)} and ${num(b)} differ, so for this function they are different lines.`,
  ];
  return { prompt, steps, answer: `up ${k}: ${up}; left ${k}: ${left}; right ${k}: ${right}; down ${k}: ${down}` };
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
