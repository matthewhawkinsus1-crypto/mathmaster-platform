/*
 * OPERATIONS ON FUNCTIONS AND COMPOSITION, ON THE EXIT TICKET (A2.2D) —
 * Recovery for Algebra II Honors Module 1, Lesson 4's DOL Q1 and Q2 (RC01's
 * next shapes).
 *
 * Recovery V2 gives a static Warm-Up or DOL question Recovery only when a
 * certified family recognizes it (recoveryContent.mjs). Lesson 4's Warm-Up has
 * it (functions.pointwiseFromValues, functions.compositionFromValues); the
 * first two questions of its exit ticket are choice boards no family
 * recognized:
 *
 *   functions.composeQuadraticLinear     DOL Q1: f(x)=x²−2x+3, g(x)=2x+1 —
 *                                        (f∘g)(x) and (g∘f)(x), chosen
 *   functions.conjugateProductQuotient   DOL Q2: f(x)=x+4, g(x)=x−4 — the
 *                                        product, and the input (f/g)(x)
 *                                        excludes, chosen (a version may
 *                                        ask the other quotient, (g/f)(x))
 *
 * Every wrong choice is the lesson's own mistake with the version's numbers:
 *
 *   (f∘g)(x)   the other order; (mx + n)² with its middle term once, not
 *              twice; x² kept and mx + n written in place of the whole term bx
 *   (g∘f)(x)   the other order; only x² multiplied by m; m not applied at all
 *   (f·g)(x)   the constant's sign slipped (x² + p²); f + g (2x); g times
 *              itself
 *   excluded   the zero of the numerator; 0; p², read off the product
 *
 * Each version keeps its original's shape: f(x) = x² + bx + c with g(x) =
 * mx + n; and f, g a pair x + p, x − p, either one f, with the input either
 * quotient excludes: the zero of its denominator.
 *
 * `recognize` reads exactly those questions — the prompt as the family writes
 * it, the fields' ids and labels, the same choices and the keys the numbers
 * give — and nothing else.
 *
 * WHAT IT NEVER DOES. A family writes a QUESTION: no hint, no step, no worked
 * solution, and no answer in a prompt.
 *
 * Pure: no Firestore, no clock. The registry loads it in the browser, so it
 * imports only the family contract.
 */

import {
  FAMILY_ISSUE,
  choiceDomain,
  defineQuestionFamily,
  fingerprintOf,
  intDomain,
} from './questionFamilyContract.mjs';

const MINUS = '−';
const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);
const normalizedText = (text) => clean(text).replace(/[−–]/g, '-').replace(/\s+/g, ' ');
const sameMembers = (left, right) => left.length === right.length
  && [...left].map(normalizedText).sort().join('|') === [...right].map(normalizedText).sort().join('|');
const shown = (value) => (value < 0 ? `${MINUS}${-value}` : String(value));
const signedSizes = (low, high) => {
  const values = [];
  for (let size = low; size <= high; size += 1) values.push(-size, size);
  return values;
};

/**
 * A polynomial in x from its coefficients [x², x, constant], written as the
 * lesson writes its choices: "4x²+2", "x²−2x+3", "2x", "x²−16".
 */
export const polynomialText = ([square, linear, constant]) => {
  const terms = [[square, 'x²'], [linear, 'x'], [constant, '']].filter(([coefficient]) => coefficient !== 0);
  if (!terms.length) return '0';
  return terms.map(([coefficient, power], index) => {
    const size = Math.abs(coefficient);
    const sign = coefficient < 0 ? MINUS : (index ? '+' : '');
    return `${sign}${size === 1 && power ? '' : size}${power}`;
  }).join('');
};

/** A deterministic rotation of a choice list, so the key is not always first. */
const rotate = (options, offset) => {
  const count = options.length;
  const shift = ((Math.round(Number(offset) || 0) % count) + count) % count;
  return [...options.slice(shift), ...options.slice(0, shift)];
};
const boardOf = (parts, offset) => parts.map((part, index) => ({
  id: part.id,
  label: part.label,
  type: 'choice',
  options: rotate(part.options, offset + index),
  answer: part.answer,
  inputProfile: 'choice',
}));
const fieldsAnswer = (parts) => {
  const value = Object.fromEntries(parts.map((part) => [part.id, part.answer]));
  return { kind: 'fields', value, display: Object.values(value).join('; ') };
};
/** The board's choice fields are exactly the family's: ids, labels, choices and keys. */
const sameChoices = (question, parts) => {
  const fields = list(question?.answerFields);
  if (fields.length !== parts.length) return false;
  return parts.every((part) => {
    const field = fields.find((entry) => clean(entry?.id) === part.id);
    return Boolean(field) && clean(field.type) === 'choice' && normalizedText(field.label) === normalizedText(part.label)
      && sameMembers(list(field.options).map(clean), part.options) && normalizedText(field.answer) === normalizedText(part.answer);
  });
};
const distinctChoices = (parts) => parts.every((part) => new Set(part.options.map(normalizedText)).size === part.options.length);

/* ---------------------------------------------------------------------------
 * functions.composeQuadraticLinear
 * ------------------------------------------------------------------------- */

// f(x) = x² + bx + c, g(x) = mx + n.
const composePrompt = ({ b, c, m, n }) => `Given f(x)=${polynomialText([1, b, c])} and g(x)=${polynomialText([0, m, n])}, find both compositions.`;
const composeParts = ({ b, c, m, n }) => {
  // (f∘g)(x) = (mx + n)² + b(mx + n) + c; (g∘f)(x) = m(x² + bx + c) + n.
  const fog = [m * m, 2 * m * n + b * m, n * n + b * n + c];
  const gof = [m, m * b, m * c + n];
  return [
    {
      id: 'fog',
      label: '(f∘g)(x)',
      options: [
        polynomialText(fog),
        polynomialText(gof),
        // (mx + n)² with its middle term m·n·x once, not twice.
        polynomialText([m * m, m * n + b * m, n * n + b * n + c]),
        // x² kept, and mx + n written in place of the whole term bx.
        polynomialText([1, m, n + c]),
      ],
      answer: polynomialText(fog),
    },
    {
      id: 'gof',
      label: '(g∘f)(x)',
      options: [
        polynomialText(gof),
        polynomialText(fog),
        // Only the first term of f multiplied by m.
        polynomialText([m, b, c + n]),
        // n added to f, which is never multiplied by m.
        polynomialText([1, b, c + n]),
      ],
      answer: polynomialText(gof),
    },
  ];
};
const COMPOSE_DOMAINS = Object.freeze({ b: signedSizes(1, 5), c: [1, 2, 3, 4, 5, 6], m: [2, 3], n: signedSizes(1, 4) });
const coefficientIn = (text) => (text === '+' ? 1 : text === '-' ? -1 : Number(text));

export const composeQuadraticLinearFamily = defineQuestionFamily({
  id: 'functions.composeQuadraticLinear',
  version: 1,
  title: 'Compose a quadratic and a linear function both ways',
  skill: {
    objective: 'Find (f∘g)(x) and (g∘f)(x) for f(x) = x² + bx + c and g(x) = mx + n, and tell them apart.',
    alignments: ['A2.2D'],
    strand: 'functions',
  },
  difficulty: { band: 4, dok: 3 },
  constraints: {},
  parameters: () => ({
    b: choiceDomain(COMPOSE_DOMAINS.b),
    c: choiceDomain(COMPOSE_DOMAINS.c),
    m: choiceDomain(COMPOSE_DOMAINS.m),
    n: choiceDomain(COMPOSE_DOMAINS.n),
  }),
  derive: () => ({}),
  // Every choice of a field is its own polynomial (they are, for these
  // domains: checked so, not assumed).
  rules: (values) => (distinctChoices(composeParts(values)) ? [] : [FAMILY_ISSUE.DEGENERATE_INSTANCE]),
  fingerprint: ({ b, c, m, n }) => fingerprintOf('functions.composeQuadraticLinear', [b, c, m, n]),
  answer: (values) => fieldsAnswer(composeParts(values)),
  tools: {
    multiAnswer: (values) => ({ type: 'multiAnswer', prompt: composePrompt(values), answerFields: boardOf(composeParts(values), values.b + values.c + values.m + values.n) }),
  },
  defaultTool: 'multiAnswer',
  instanceFields: ['answerFields', 'responses'],
  recognize: (question) => {
    if (clean(question?.type) !== 'multiAnswer') return null;
    const match = /^Given f\(x\)=x²([+-]\d*)x([+-]\d+) and g\(x\)=(\d+)x([+-]\d+), find both compositions\.$/.exec(normalizedText(question?.prompt));
    if (!match) return null;
    const values = { b: coefficientIn(match[1]), c: Number(match[2]), m: Number(match[3]), n: Number(match[4]) };
    if (Object.entries(COMPOSE_DOMAINS).some(([name, domain]) => !domain.includes(values[name]))) return null;
    if (normalizedText(composePrompt(values)) !== normalizedText(question.prompt)) return null;
    return sameChoices(question, composeParts(values)) ? { params: values, constraints: {} } : null;
  },
  recovery: { eligible: true },
});

/* ---------------------------------------------------------------------------
 * functions.conjugateProductQuotient
 * ------------------------------------------------------------------------- */

// f(x) = x + s·p and g(x) = x − s·p, s = 1 (plusFirst) or −1 (minusFirst);
// `quotient` is the one whose excluded input is asked, f/g or g/f.
const signOf = (order) => (order === 'minusFirst' ? -1 : 1);
const QUOTIENTS = Object.freeze(['f/g', 'g/f']);
const conjugatePrompt = ({ p, order }) => {
  const s = signOf(order);
  return `Given f(x)=${polynomialText([0, 1, s * p])} and g(x)=${polynomialText([0, 1, -s * p])}, evaluate the product and quotient descriptions.`;
};
const conjugateParts = ({ p, order, quotient = 'f/g' }) => {
  const s = signOf(order);
  const product = polynomialText([1, 0, -p * p]);
  // g(x) = 0 at x = s·p and f(x) = 0 at x = −s·p: the quotient excludes the
  // zero of its denominator, and the zero of its numerator is the slip.
  const [excluded, numeratorZero] = quotient === 'g/f' ? [-s * p, s * p] : [s * p, -s * p];
  return [
    {
      id: 'product',
      label: '(f·g)(x)',
      options: [product, polynomialText([1, 0, p * p]), polynomialText([0, 2, 0]), polynomialText([1, -2 * s * p, p * p])],
      answer: product,
    },
    {
      id: 'restriction',
      label: `For (${quotient})(x), which input is excluded?`,
      options: [shown(excluded), shown(numeratorZero), '0', String(p * p)],
      answer: shown(excluded),
    },
  ];
};
const CONJUGATE_SIZES = Object.freeze([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

export const conjugateProductQuotientFamily = defineQuestionFamily({
  id: 'functions.conjugateProductQuotient',
  version: 1,
  title: 'The product of x + p and x − p, and the input their quotient excludes',
  skill: {
    objective: 'Multiply f(x) = x ± p by g(x) = x ∓ p, and name the input the quotient f/g or g/f excludes: the zero of its denominator.',
    alignments: ['A2.2D'],
    strand: 'functions',
  },
  difficulty: { band: 3, dok: 2 },
  constraints: {},
  parameters: () => ({ p: intDomain(2, 11), order: choiceDomain(['plusFirst', 'minusFirst']), quotient: choiceDomain(QUOTIENTS) }),
  derive: () => ({}),
  rules: (values) => (distinctChoices(conjugateParts(values)) ? [] : [FAMILY_ISSUE.DEGENERATE_INSTANCE]),
  fingerprint: ({ p, order, quotient }) => fingerprintOf('functions.conjugateProductQuotient', [signOf(order) * p, quotient]),
  answer: (values) => fieldsAnswer(conjugateParts(values)),
  tools: {
    multiAnswer: (values) => ({ type: 'multiAnswer', prompt: conjugatePrompt(values), answerFields: boardOf(conjugateParts(values), values.p + (values.order === 'minusFirst' ? 1 : 0) + (values.quotient === 'g/f' ? 2 : 0)) }),
  },
  defaultTool: 'multiAnswer',
  instanceFields: ['answerFields', 'responses'],
  recognize: (question) => {
    if (clean(question?.type) !== 'multiAnswer') return null;
    const match = /^Given f\(x\)=x([+-])(\d+) and g\(x\)=x([+-])(\d+), evaluate the product and quotient descriptions\.$/.exec(normalizedText(question?.prompt));
    if (!match || match[1] === match[3] || match[2] !== match[4]) return null;
    const asked = /^For \((f\/g|g\/f)\)\(x\), which input is excluded\?$/.exec(clean(list(question?.answerFields).find((field) => clean(field?.id) === 'restriction')?.label));
    if (!asked) return null;
    const values = { p: Number(match[2]), order: match[1] === '+' ? 'plusFirst' : 'minusFirst', quotient: asked[1] };
    if (!CONJUGATE_SIZES.includes(values.p)) return null;
    return sameChoices(question, conjugateParts(values)) ? { params: values, constraints: {} } : null;
  },
  recovery: { eligible: true },
});

export const FUNCTION_OPERATION_FAMILIES = Object.freeze([composeQuadraticLinearFamily, conjugateProductQuotientFamily]);
