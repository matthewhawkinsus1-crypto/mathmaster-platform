/*
 * MODELING LINEAR INEQUALITIES (A.5B) — the Warm-Up and DOL families behind
 * the Algebra I lesson "Modeling Linear Inequalities" (Module 3, Topic 1,
 * Lesson 3).
 *
 *   linear.contextFunction      Warm-Up: a situation with a starting amount
 *                               and a constant rate. Name the independent and
 *                               dependent quantities, write the function, and
 *                               say what its slope and y-intercept mean.
 *                               multiAnswer.
 *   inequalities.translatePhrase  Warm-Up: four statements — "at least",
 *                               "no more than", "exceeds", "fewer than" … —
 *                               each written as an inequality, one of each
 *                               symbol. multiAnswer.
 *   inequalities.contextModel   DOL: a situation that asks "at least / at most
 *                               / below …". Choose the inequality that models
 *                               it, solve it, and give the whole-number answer
 *                               the situation needs (the least weeks, the most
 *                               boxes). Half the situations decrease, so the
 *                               solving step divides by a negative and the
 *                               sign reverses. multiAnswer.
 *
 * KEEPING ANSWERS EXACT. Every number in a version is a whole number or a
 * dollar amount with cents, and every solved boundary terminates within two
 * decimal places (a rate whose prime factors are 2s and 5s, checked exactly in
 * hundredths), so the solved inequality a student types is never a rounded
 * value graded against an unrounded one.
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
  choiceKnob,
  composeFamilyPrompt,
  defineQuestionFamily,
  fingerprintOf,
  intDomain,
} from './questionFamilyContract.mjs';

const MINUS = '−';

/** A deterministic rotation of a choice list, so the key is not always first. */
const rotate = (options, offset) => {
  const count = options.length;
  const shift = ((Math.round(Number(offset) || 0) % count) + count) % count;
  return [...options.slice(shift), ...options.slice(0, shift)];
};

/* ---------------------------------------------------------------------------
 * Exact decimals in hundredths. Every amount a family here writes is an
 * integer number of cents, so arithmetic on it is integer arithmetic.
 * ------------------------------------------------------------------------- */

/** 375 -> "3.75", 2500 -> "25", 1250 -> "12.5" (an answer key's spelling). */
export const hundredthsText = (cents) => {
  const sign = cents < 0 ? '-' : '';
  const size = Math.abs(cents);
  const whole = Math.floor(size / 100);
  const part = size % 100;
  if (part === 0) return `${sign}${whole}`;
  const decimals = part % 10 === 0 ? String(part / 10) : String(part).padStart(2, '0');
  return `${sign}${whole}.${decimals}`;
};
/** The same amount as a prompt writes money: "$3.75", "$25". */
const dollars = (cents) => `$${hundredthsText(cents).replace(/^(\d+)\.(\d)$/, '$1.$20')}`;

/**
 * a / b in hundredths when it terminates within two decimal places, else null.
 * a and b are in the same unit (both cents or both whole units).
 */
export const exactQuotientHundredths = (numerator, denominator) => {
  if (!denominator) return null;
  const scaled = numerator * 100;
  return scaled % denominator === 0 ? scaled / denominator : null;
};

/* ---------------------------------------------------------------------------
 * linear.contextFunction
 * ------------------------------------------------------------------------- */

/*
 * Each situation names its quantities once; the choices offered for the
 * independent and dependent quantity are the same four for every version of
 * that situation (the two quantities, the rate and the starting amount).
 * Amounts are in cents for money and in whole units otherwise.
 */
const CONTEXT_FUNCTION_SITUATIONS = Object.freeze([
  {
    id: 'popcorn',
    direction: 'increasing',
    money: true,
    starts: [1500, 2000, 2500, 3000, 4000],
    rates: [250, 300, 350, 375, 425, 450],
    fn: 'f',
    variable: 'b',
    text: (start, rate) => `A scout troop sells popcorn to earn money for a camping trip. Each camper starts with a credit of ${dollars(start)} toward sales, and each box of popcorn sells for ${dollars(rate)}.`,
    independent: 'the number of boxes sold (boxes)',
    dependent: 'the camper’s total sales (dollars)',
    rateQuantity: 'the price of one box (dollars per box)',
    startQuantity: 'the starting credit (dollars)',
    slopeMeaning: (rate) => `The total sales increase by ${dollars(rate)} for each box sold.`,
    slopeWrong: (rate, start) => [`The camper starts with ${dollars(rate)} in sales.`, `The camper must sell ${hundredthsText(rate)} boxes.`, `The total sales increase by ${dollars(start)} for each box sold.`],
    interceptMeaning: (start) => `The camper has ${dollars(start)} in total sales before selling any boxes.`,
    interceptWrong: (start, rate) => [`Each box of popcorn sells for ${dollars(start)}.`, `The camper sells ${hundredthsText(start)} boxes.`, `The total sales increase by ${dollars(rate)} for each box sold.`],
  },
  {
    id: 'savings',
    direction: 'increasing',
    money: true,
    starts: [2000, 3500, 4500, 6000, 7500],
    rates: [500, 800, 1000, 1200, 1500, 2000],
    fn: 's',
    variable: 'w',
    text: (start, rate) => `Marisol has ${dollars(start)} in a savings account. Marisol deposits ${dollars(rate)} into the account at the end of every week.`,
    independent: 'the number of weeks (weeks)',
    dependent: 'the amount in the account (dollars)',
    rateQuantity: 'the weekly deposit (dollars per week)',
    startQuantity: 'the starting balance (dollars)',
    slopeMeaning: (rate) => `The amount in the account increases by ${dollars(rate)} each week.`,
    slopeWrong: (rate, start) => [`The account starts with ${dollars(rate)}.`, `Marisol saves for ${hundredthsText(rate)} weeks.`, `The amount in the account increases by ${dollars(start)} each week.`],
    interceptMeaning: (start) => `The account has ${dollars(start)} before any weekly deposits.`,
    interceptWrong: (start, rate) => [`Marisol deposits ${dollars(start)} each week.`, `Marisol saves for ${hundredthsText(start)} weeks.`, `The amount in the account increases by ${dollars(rate)} each week.`],
  },
  {
    id: 'plant',
    direction: 'increasing',
    money: false,
    starts: [4, 6, 8, 10, 12, 15],
    rates: [2, 3, 4, 5],
    fn: 'H',
    variable: 'w',
    text: (start, rate) => `A bean plant is ${start} centimeters tall when it is planted, and it grows ${rate} centimeters each week.`,
    independent: 'the number of weeks since planting (weeks)',
    dependent: 'the height of the plant (centimeters)',
    rateQuantity: 'the growth rate (centimeters per week)',
    startQuantity: 'the height at planting (centimeters)',
    slopeMeaning: (rate) => `The plant grows ${rate} centimeters taller each week.`,
    slopeWrong: (rate, start) => [`The plant is ${rate} centimeters tall when it is planted.`, `The plant grows for ${rate} weeks.`, `The plant grows ${start} centimeters taller each week.`],
    interceptMeaning: (start) => `The plant is ${start} centimeters tall at 0 weeks, when it is planted.`,
    interceptWrong: (start, rate) => [`The plant grows ${start} centimeters each week.`, `The plant grows for ${start} weeks.`, `The plant grows ${rate} centimeters taller each week.`],
  },
  {
    id: 'hike',
    direction: 'decreasing',
    money: false,
    starts: [3600, 4200, 4800, 5400, 6000],
    rates: [15, 20, 25, 30, 40],
    fn: 'h',
    variable: 'm',
    text: (start, rate) => `A hiking troop leaves its campsite at an elevation of ${start} feet and hikes down the mountain at a rate of ${rate} feet per minute.`,
    independent: 'the time spent hiking (minutes)',
    dependent: 'the troop’s elevation (feet)',
    rateQuantity: 'the rate of descent (feet per minute)',
    startQuantity: 'the elevation of the campsite (feet)',
    slopeMeaning: (rate) => `The troop’s elevation decreases by ${rate} feet each minute.`,
    slopeWrong: (rate, start) => [`The troop’s elevation increases by ${rate} feet each minute.`, `The troop hikes for ${rate} minutes.`, `The troop’s elevation decreases by ${start} feet each minute.`],
    interceptMeaning: (start) => `The troop is at ${start} feet at 0 minutes, when it leaves the campsite.`,
    interceptWrong: (start, rate) => [`The troop hikes down ${start} feet each minute.`, `The troop hikes for ${start} minutes.`, `The troop’s elevation decreases by ${rate} feet each minute.`],
  },
  {
    id: 'pool',
    direction: 'decreasing',
    money: false,
    starts: [900, 1200, 1500, 1800, 2400],
    rates: [12, 15, 20, 25, 30],
    fn: 'P',
    variable: 't',
    text: (start, rate) => `A pool holds ${start} gallons of water. It is drained at a rate of ${rate} gallons per minute.`,
    independent: 'the time the pool drains (minutes)',
    dependent: 'the water left in the pool (gallons)',
    rateQuantity: 'the draining rate (gallons per minute)',
    startQuantity: 'the water in the pool at the start (gallons)',
    slopeMeaning: (rate) => `The water in the pool decreases by ${rate} gallons each minute.`,
    slopeWrong: (rate, start) => [`The water in the pool increases by ${rate} gallons each minute.`, `The pool drains for ${rate} minutes.`, `The water in the pool decreases by ${start} gallons each minute.`],
    interceptMeaning: (start) => `The pool holds ${start} gallons at 0 minutes, before it starts to drain.`,
    interceptWrong: (start, rate) => [`The pool drains ${start} gallons each minute.`, `The pool drains for ${start} minutes.`, `The water in the pool decreases by ${rate} gallons each minute.`],
  },
]);

const CONTEXT_FUNCTION_DIRECTIONS = Object.freeze({
  increasing: ['increasing'],
  decreasing: ['decreasing'],
  any: ['increasing', 'decreasing'],
});

const situationById = (id) => CONTEXT_FUNCTION_SITUATIONS.find((situation) => situation.id === id);

/** "3.75b + 25", "−20m + 4800": the function's rule as a key writes it. */
const ruleKey = (rate, start, variable) => `${rate}${variable}${start < 0 ? '-' : '+'}${Math.abs(start)}`;

export const contextFunctionFamily = defineQuestionFamily({
  id: 'linear.contextFunction',
  version: 1,
  title: 'Write and interpret a linear function from a situation',
  skill: {
    objective: 'Write a linear function for a situation with a starting amount and a constant rate of change, identify the independent and dependent quantities, and interpret the slope and y-intercept in terms of the situation.',
    alignments: ['A.3B', 'A.2C'],
    strand: 'linear',
  },
  difficulty: { band: 2, dok: 2 },
  constraints: {
    direction: choiceKnob('any', Object.keys(CONTEXT_FUNCTION_DIRECTIONS), { label: 'Increasing or decreasing situations' }),
  },
  parameters: (c) => {
    const directions = CONTEXT_FUNCTION_DIRECTIONS[c.direction] || CONTEXT_FUNCTION_DIRECTIONS.any;
    const situations = CONTEXT_FUNCTION_SITUATIONS.filter((situation) => directions.includes(situation.direction));
    return {
      situation: choiceDomain(situations.map((situation) => situation.id)),
      startIndex: intDomain(0, 5),
      rateIndex: intDomain(0, 5),
    };
  },
  derive: ({ situation, startIndex, rateIndex }) => {
    const entry = situationById(situation);
    const start = entry.starts[startIndex];
    const rate = entry.rates[rateIndex];
    const sign = entry.direction === 'decreasing' ? -1 : 1;
    return { start, rate, slope: sign * rate };
  },
  rules: ({ start, rate }) => {
    if (start === undefined || rate === undefined) return [FAMILY_ISSUE.INVALID_PARAMETERS];
    // A starting amount equal to the rate makes "increases by the start"
    // read exactly like the right meaning of the slope: two right options.
    return start === rate ? [FAMILY_ISSUE.TRIVIAL_INSTANCE] : [];
  },
  fingerprint: ({ situation, start, rate }) => fingerprintOf('linear.contextFunction', [situation, start, rate]),
  answer: ({ situation, start, slope }) => {
    const entry = situationById(situation);
    const toKey = (value) => (entry.money ? hundredthsText(value) : String(value));
    const value = {
      independent: entry.independent,
      dependent: entry.dependent,
      function: `${entry.fn}(${entry.variable})=${ruleKey(toKey(slope), Number(toKey(start)), entry.variable)}`,
      slope: toKey(slope),
      slopeMeaning: entry.slopeMeaning(Math.abs(slope)),
      intercept: toKey(start),
      interceptMeaning: entry.interceptMeaning(start),
    };
    return { kind: 'fields', value, display: value.function };
  },
  tools: {
    multiAnswer: (values, { authored }) => {
      const { situation, start, rate, slope } = values;
      const entry = situationById(situation);
      const toKey = (value) => (entry.money ? hundredthsText(value) : String(value));
      const quantities = rotate([entry.independent, entry.dependent, entry.rateQuantity, entry.startQuantity], start + rate);
      const fnName = `${entry.fn}(${entry.variable})`;
      const functionKey = `${fnName}=${ruleKey(toKey(slope), Number(toKey(start)), entry.variable)}`;
      const slopeOptions = rotate([entry.slopeMeaning(rate), ...entry.slopeWrong(rate, start)], rate);
      const interceptOptions = rotate([entry.interceptMeaning(start), ...entry.interceptWrong(start, rate)], start);
      return {
        type: 'multiAnswer',
        prompt: composeFamilyPrompt({
          authored: authored?.prompt,
          tokens: { situation: entry.text(start, rate), function: fnName },
          fallback: `${entry.text(start, rate)} Write a function, ${fnName}, for this situation, then interpret it.`,
        }),
        answerFields: [
          { id: 'independent', label: 'The independent quantity is …', type: 'choice', options: quantities, answer: entry.independent, inputProfile: 'choice' },
          { id: 'dependent', label: 'The dependent quantity is …', type: 'choice', options: quantities, answer: entry.dependent, inputProfile: 'choice' },
          {
            id: 'function',
            label: `The function ${fnName}`,
            answer: functionKey,
            inputProfile: 'equation',
            answerFormat: 'equation',
            requiredSymbols: ['=', '(', ')', entry.variable],
            inputContract: { format: 'equation', requiredSymbols: ['=', '(', ')', entry.variable] },
          },
          { id: 'slope', label: 'The slope', answer: toKey(slope), inputProfile: 'number', answerFormat: 'number', inputContract: { format: 'number' } },
          { id: 'slopeMeaning', label: 'In this situation, the slope means …', type: 'choice', options: slopeOptions, answer: entry.slopeMeaning(rate), inputProfile: 'choice' },
          { id: 'intercept', label: 'The y-intercept (the value of the function at 0)', answer: toKey(start), inputProfile: 'number', answerFormat: 'number', inputContract: { format: 'number' } },
          { id: 'interceptMeaning', label: 'In this situation, the y-intercept means …', type: 'choice', options: interceptOptions, answer: entry.interceptMeaning(start), inputProfile: 'choice' },
        ],
      };
    },
  },
  defaultTool: 'multiAnswer',
  instanceFields: ['answerFields', 'responses'],
  recovery: { eligible: true },
});

/* ---------------------------------------------------------------------------
 * inequalities.translatePhrase
 * ------------------------------------------------------------------------- */

export const RELATIONS = Object.freeze(['>=', '<=', '>', '<']);
const RELATION_SYMBOL = Object.freeze({ '>=': '≥', '<=': '≤', '>': '>', '<': '<' });

// Each phrase finishes "<subject> … <number>" and means one relation.
const PHRASES = Object.freeze({
  '>=': ['is at least', 'is no less than', 'is greater than or equal to'],
  '<=': ['is at most', 'is no more than', 'cannot be more than'],
  '>': ['is more than', 'is greater than', 'exceeds'],
  '<': ['is less than', 'is fewer than', 'is under'],
});

// Who the statement is about, and the letter that stands for it.
const SUBJECTS = Object.freeze([
  { text: 'The number of boxes Elijah sells, b,', variable: 'b', values: [40, 75, 120, 150, 200] },
  { text: 'The amount Diego saves, d, in dollars,', variable: 'd', values: [70, 85, 120, 250, 300] },
  { text: 'The time the troop hikes, m, in minutes,', variable: 'm', values: [45, 80, 90, 120, 240] },
  { text: 'The height of a rider, h, in inches,', variable: 'h', values: [36, 42, 48, 54, 60] },
  { text: 'The number of tickets sold, t,', variable: 't', values: [100, 150, 300, 450, 600] },
  { text: 'The temperature, T, in degrees Fahrenheit,', variable: 'T', values: [32, 40, 50, 65, 80] },
]);

// Which subject each of the four statements uses, as a permutation index.
const ORDERINGS = Object.freeze([
  ['>=', '<=', '>', '<'], ['<=', '>', '<', '>='], ['>', '<', '>=', '<='], ['<', '>=', '<=', '>'],
  ['>=', '>', '<=', '<'], ['<=', '<', '>=', '>'], ['>', '>=', '<', '<='], ['<', '<=', '>', '>='],
]);

const statementOptions = (variable, value, offset) => rotate(
  RELATIONS.map((relation) => `${variable} ${RELATION_SYMBOL[relation]} ${value}`),
  offset,
);

export const translatePhraseFamily = defineQuestionFamily({
  id: 'inequalities.translatePhrase',
  version: 1,
  title: 'Write an inequality from words',
  skill: {
    objective: 'Translate statements such as "at least", "no more than", "exceeds" and "fewer than" into inequalities, using each of the symbols ≥, ≤, > and <.',
    alignments: ['A.5B', '7.10A'],
    strand: 'linear',
  },
  difficulty: { band: 1, dok: 1 },
  constraints: {},
  parameters: () => ({
    ordering: intDomain(0, ORDERINGS.length - 1),
    // The four statements use four different subjects: subjects s, s+1, s+2, s+3.
    firstSubject: intDomain(0, SUBJECTS.length - 1),
    phraseA: intDomain(0, 2),
    phraseB: intDomain(0, 2),
    valueIndex: intDomain(0, 4),
  }),
  derive: ({ ordering, firstSubject, phraseA, phraseB, valueIndex }) => {
    const relations = ORDERINGS[ordering];
    const statements = relations.map((relation, index) => {
      const subject = SUBJECTS[(firstSubject + index) % SUBJECTS.length];
      const phraseIndex = index % 2 === 0 ? phraseA : phraseB;
      const value = subject.values[(valueIndex + index) % subject.values.length];
      return {
        relation,
        variable: subject.variable,
        value,
        sentence: `${subject.text} ${PHRASES[relation][phraseIndex]} ${value}.`,
      };
    });
    return { statements };
  },
  rules: () => [],
  fingerprint: ({ statements }) => fingerprintOf('inequalities.translatePhrase', statements.map((statement) => statement.sentence)),
  answer: ({ statements }) => {
    const value = Object.fromEntries(statements.map((statement, index) => [`s${index + 1}`, `${statement.variable} ${RELATION_SYMBOL[statement.relation]} ${statement.value}`]));
    return { kind: 'fields', value, display: Object.values(value).join('; ') };
  },
  tools: {
    multiAnswer: ({ statements, ordering, valueIndex }, { authored }) => ({
      type: 'multiAnswer',
      prompt: composeFamilyPrompt({
        authored: authored?.prompt,
        tokens: {},
        fallback: 'Write each statement as an inequality.',
      }),
      answerFields: statements.map((statement, index) => ({
        id: `s${index + 1}`,
        label: statement.sentence,
        type: 'choice',
        options: statementOptions(statement.variable, statement.value, ordering + valueIndex + index),
        answer: `${statement.variable} ${RELATION_SYMBOL[statement.relation]} ${statement.value}`,
        inputProfile: 'choice',
      })),
    }),
  },
  defaultTool: 'multiAnswer',
  instanceFields: ['answerFields', 'responses'],
  recovery: { eligible: true },
});

/* ---------------------------------------------------------------------------
 * inequalities.contextModel
 * ------------------------------------------------------------------------- */

/*
 * A situation: start + sign·rate·x  (relation)  goal. `wants` says which
 * whole number the situation asks for: the least x that works ("least") or
 * the greatest ("greatest"). Money is in cents, everything else in whole
 * units; `unit` is 100 for money and 1 otherwise, so `start`, `rate` and
 * `goal` are always integers.
 */
const CONTEXT_MODEL_SITUATIONS = Object.freeze([
  {
    id: 'savings',
    reverses: false,
    relation: '>=',
    variable: 'w',
    unit: 100,
    starts: [2500, 4500, 6000, 7500],
    rates: [500, 800, 1200, 2000, 2500],
    goals: [20000, 25000, 30000],
    text: ({ start, rate, goal }) => `Diego has ${dollars(start)} in a gift fund and plans to save ${dollars(rate)} each week. Diego wants to have at least ${dollars(goal)} for graduation gifts. Let w be the number of weeks Diego saves.`,
    wholeLabel: () => 'The least number of whole weeks Diego must save',
    wants: 'least',
  },
  {
    id: 'candles',
    reverses: false,
    relation: '>=',
    variable: 'c',
    unit: 100,
    starts: [1500, 2000, 2500, 3000],
    rates: [250, 375, 400, 500, 625],
    goals: [15000, 20000, 25000],
    text: ({ start, rate, goal }) => `Each club member starts with a ${dollars(start)} credit and earns ${dollars(rate)} for every candle sold. A member’s goal is at least ${dollars(goal)} in total sales. Let c be the number of candles sold.`,
    wholeLabel: () => 'The least number of candles a member must sell to reach the goal',
    wants: 'least',
  },
  {
    id: 'plan',
    reverses: false,
    relation: '<=',
    variable: 'g',
    unit: 100,
    starts: [2500, 3000, 3500, 4000],
    rates: [250, 400, 500, 625, 800],
    goals: [6000, 7500, 9000],
    text: ({ start, rate, goal }) => `A phone plan costs ${dollars(start)} each month plus ${dollars(rate)} for each gigabyte of data. Tasha can spend no more than ${dollars(goal)} this month. Let g be the number of gigabytes Tasha uses.`,
    wholeLabel: () => 'The greatest number of whole gigabytes Tasha can use',
    wants: 'greatest',
  },
  {
    id: 'elevator',
    reverses: false,
    relation: '<=',
    variable: 'b',
    unit: 1,
    starts: [160, 175, 180, 200],
    rates: [20, 25, 40, 50],
    goals: [1000, 1200, 1500],
    text: ({ start, rate, goal }) => `An elevator can carry at most ${goal} pounds. The operator weighs ${start} pounds, and each box loaded onto the elevator weighs ${rate} pounds. Let b be the number of boxes.`,
    wholeLabel: () => 'The greatest number of boxes the elevator can carry with the operator',
    wants: 'greatest',
  },
  {
    id: 'tank',
    reverses: true,
    relation: '<',
    variable: 'm',
    unit: 1,
    starts: [800, 1000, 1200, 1500],
    rates: [16, 20, 25, 40, 50],
    goals: [200, 300, 450],
    text: ({ start, rate, goal }) => `A water tank holds ${start} gallons and drains at ${rate} gallons per minute. Let m be the number of minutes the tank has been draining. When will the tank hold less than ${goal} gallons?`,
    wholeLabel: ({ goal }) => `The least whole number of minutes after which the tank holds less than ${goal} gallons`,
    wants: 'least',
  },
  {
    id: 'hike',
    reverses: true,
    relation: '<',
    variable: 'm',
    unit: 1,
    starts: [4000, 4800, 5200, 6000],
    rates: [16, 20, 25, 40],
    goals: [2500, 3000, 3200],
    text: ({ start, rate, goal }) => `A hiking troop starts at an elevation of ${start} feet and hikes down at ${rate} feet per minute. Let m be the number of minutes the troop has been hiking. When will the troop be below ${goal} feet?`,
    wholeLabel: ({ goal }) => `The least whole number of minutes after which the troop is below ${goal} feet`,
    wants: 'least',
  },
  {
    id: 'battery',
    reverses: true,
    relation: '>=',
    variable: 't',
    unit: 1,
    starts: [80, 90, 95, 100],
    rates: [4, 5, 8, 10],
    goals: [15, 20, 25],
    text: ({ start, rate, goal }) => `A tablet battery is at ${start}% and drops ${rate} percentage points each hour while a video plays. Let t be the number of hours of video. For how long will the battery stay at least ${goal}%?`,
    wholeLabel: ({ goal }) => `The greatest whole number of hours of video before the battery drops below ${goal}%`,
    wants: 'greatest',
  },
]);

const contextById = (id) => CONTEXT_MODEL_SITUATIONS.find((situation) => situation.id === id);

/** "45 + 12w ≥ 200", "1200 − 20m < 300": the model as a choice shows it. */
const modelText = ({ start, rate, goal, relation, variable, unit, reverses }) => {
  // Money is stored in cents and written in dollars; counts are written as is.
  const written = (value) => (unit === 100 ? hundredthsText(value) : String(value));
  return `${written(start)} ${reverses ? MINUS : '+'} ${written(rate)}${variable} ${RELATION_SYMBOL[relation]} ${written(goal)}`;
};

const FLIP = Object.freeze({ '>=': '<=', '<=': '>=', '>': '<', '<': '>' });
const STRICT_PAIR = Object.freeze({ '>=': '>', '<=': '<', '>': '>=', '<': '<=' });

/** The four model choices: the key, the flipped symbol, the swapped numbers, the strictness slip. */
const modelChoices = (values) => {
  const key = modelText(values);
  const flipped = modelText({ ...values, relation: FLIP[values.relation] });
  const swapped = modelText({ ...values, start: values.rate, rate: values.start });
  const strictness = modelText({ ...values, relation: STRICT_PAIR[values.relation] });
  return { key, options: [key, flipped, swapped, strictness] };
};

/*
 * Solving start ± rate·x (rel) goal: x (rel') boundary, where the boundary is
 * |goal − start| / rate and the relation reverses when the rate is negative.
 */
const solvedRelation = ({ relation, reverses }) => (reverses ? FLIP[relation] : relation);

export const contextModelFamily = defineQuestionFamily({
  id: 'inequalities.contextModel',
  version: 1,
  title: 'Model a situation with an inequality and interpret the solution',
  skill: {
    objective: 'Write a linear inequality that models a situation, solve it — reversing the inequality symbol when dividing by a negative — and state the whole-number solution the situation needs.',
    alignments: ['A.5B', 'A.1A'],
    strand: 'linear',
  },
  difficulty: { band: 3, dok: 2 },
  constraints: {
    direction: choiceKnob('mixed', ['increasing', 'decreasing', 'mixed'], { label: 'Rate of change (decreasing situations reverse the symbol)' }),
  },
  // A mixed slot alternates growing and shrinking situations across a class,
  // so every block of two seats has one that reverses the symbol.
  strata: {
    balance: 'reversal',
    values: (c) => (c.direction === 'mixed'
      ? [{ reversal: 'no' }, { reversal: 'yes' }]
      : [{ reversal: c.direction === 'decreasing' ? 'yes' : 'no' }]),
  },
  parameters: (c, stratum) => {
    const reverses = stratum?.reversal === 'yes';
    const situations = CONTEXT_MODEL_SITUATIONS.filter((situation) => situation.reverses === reverses);
    return {
      situation: choiceDomain(situations.map((situation) => situation.id)),
      startIndex: intDomain(0, 3),
      rateIndex: intDomain(0, 4),
      goalIndex: intDomain(0, 2),
    };
  },
  derive: ({ situation, startIndex, rateIndex, goalIndex }) => {
    const entry = contextById(situation);
    const start = entry.starts[startIndex];
    const rate = entry.rates[rateIndex];
    const goal = entry.goals[goalIndex];
    if (start === undefined || rate === undefined || goal === undefined) return { start, rate, goal, boundary: null };
    // In hundredths of the variable's unit: (goal − start) / rate, signed.
    const change = entry.reverses ? start - goal : goal - start;
    const boundary = exactQuotientHundredths(change, rate);
    const relation = solvedRelation(entry);
    let whole = null;
    if (boundary !== null) {
      const floor = Math.floor(boundary / 100);
      const isWhole = boundary % 100 === 0;
      if (relation === '>=') whole = isWhole ? boundary / 100 : floor + 1;
      else if (relation === '>') whole = floor + 1;
      else if (relation === '<=') whole = floor;
      else whole = isWhole ? boundary / 100 - 1 : floor;
    }
    return { start, rate, goal, boundary, solved: relation, whole };
  },
  rules: ({ start, rate, goal, boundary, whole, situation }) => {
    if (start === undefined || rate === undefined || goal === undefined) return [FAMILY_ISSUE.INVALID_PARAMETERS];
    const issues = [];
    if (boundary === null) issues.push(FAMILY_ISSUE.UNINTENDED_DECIMAL);
    else if (boundary <= 0) issues.push(FAMILY_ISSUE.DEGENERATE_INSTANCE);
    // The answer must be a sensible count: at least 1, and not absurdly large.
    if (whole === null || whole < 1 || whole > 400) issues.push(FAMILY_ISSUE.VALUE_OUT_OF_RANGE);
    const entry = contextById(situation);
    // A start equal to the rate makes the swapped-numbers choice the key itself.
    if (start === rate) issues.push(FAMILY_ISSUE.TRIVIAL_INSTANCE);
    // A start already past the goal is no question at all.
    if (entry && !entry.reverses && start >= goal) issues.push(FAMILY_ISSUE.DEGENERATE_INSTANCE);
    if (entry && entry.reverses && start <= goal) issues.push(FAMILY_ISSUE.DEGENERATE_INSTANCE);
    return issues;
  },
  fingerprint: ({ situation, start, rate, goal }) => fingerprintOf('inequalities.contextModel', [situation, start, rate, goal]),
  answer: (values) => {
    const entry = contextById(values.situation);
    const { key } = modelChoices({ ...values, relation: entry.relation, variable: entry.variable, unit: entry.unit, reverses: entry.reverses });
    const solution = `${entry.variable}${values.solved}${hundredthsText(values.boundary)}`;
    const value = { model: key, solution, whole: String(values.whole) };
    return { kind: 'fields', value, display: `${key}; ${solution}; ${values.whole}` };
  },
  tools: {
    multiAnswer: (values, { authored }) => {
      const entry = contextById(values.situation);
      const model = { ...values, relation: entry.relation, variable: entry.variable, unit: entry.unit, reverses: entry.reverses };
      const { key, options } = modelChoices(model);
      return {
        type: 'multiAnswer',
        prompt: composeFamilyPrompt({
          authored: authored?.prompt,
          tokens: { situation: entry.text(values) },
          fallback: `${entry.text(values)} Model the situation with an inequality, solve it, and answer in terms of the situation.`,
        }),
        answerFields: [
          { id: 'model', label: 'Which inequality models the situation?', type: 'choice', options: rotate(options, values.start + values.goal), answer: key, inputProfile: 'choice' },
          {
            id: 'solution',
            label: `Solve the inequality for ${entry.variable}.`,
            answer: `${entry.variable}${values.solved}${hundredthsText(values.boundary)}`,
            inputProfile: 'inequality',
            answerFormat: 'inequality',
            requiredSymbols: ['<', '≤', '>', '≥', entry.variable],
            inputContract: { format: 'inequality', requiredSymbols: ['<', '≤', '>', '≥', entry.variable] },
          },
          { id: 'whole', label: entry.wholeLabel(values), answer: String(values.whole), inputProfile: 'number', answerFormat: 'number', inputContract: { format: 'number' } },
        ],
      };
    },
  },
  defaultTool: 'multiAnswer',
  instanceFields: ['answerFields', 'responses'],
  recovery: { eligible: true },
});

export const INEQUALITY_FAMILIES = Object.freeze([
  contextFunctionFamily,
  translatePhraseFamily,
  contextModelFamily,
]);
