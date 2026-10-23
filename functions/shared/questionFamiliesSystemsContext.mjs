/*
 * MODELING A SITUATION WITH A SYSTEM (A.2I, A.5C) — the DOL family behind the
 * Algebra I lesson "Using Substitution to Solve Linear Systems" (Module 3,
 * Topic 2, Lesson 2), whose objectives are to write a system for a problem
 * context, solve it, and interpret the solution.
 *
 *   systems.contextModel   A situation with two unknown quantities and two
 *                          facts about them. The student writes each fact as
 *                          an equation (any equivalent form is right: the
 *                          fields compare the relation, not the spelling),
 *                          solves the system, and uses the solution to find
 *                          one more number the situation asks for (always a
 *                          number, so every version is the same amount of
 *                          work). multiAnswer.
 *
 * Three shapes, balanced across a class: a count and a total (tickets, a
 * snack stand: a + s = N and Aa + Ss = M), one quantity defined by the other
 * (seat prices, ages: m = b + k beside a total — substitution's own shape),
 * and two costs set equal (bike rentals, gym fees: c = r₁h + F₁ and
 * c = r₂h + F₂). Every version is built from its whole-number solution, so
 * the system always has exactly that one solution.
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

/** "$2,768": whole dollars, grouped the way a price is printed. */
const dollars = (value) => `$${Number(value).toLocaleString('en-US')}`;

/** "4h", "d": a term the way a textbook writes it, never "1d". */
const term = (coefficient, variable) => (coefficient === 1 ? variable : `${coefficient}${variable}`);

/** "8h + 5", "8h": a cost line's right side, never "+ 0". */
const costSide = (rate, variable, fee) => (fee ? `${term(rate, variable)} + ${fee}` : term(rate, variable));

export const CONTEXT_SYSTEM_SHAPES = Object.freeze(['sumAndTotal', 'oneDefined', 'equalCost']);

/*
 * Each situation: its shape, its two variables (in the order the fields ask
 * for them), the domains it draws, `build` (the numbers a version shows and
 * its solution), the text, the two equations, and the follow-up question.
 */
const SITUATIONS = Object.freeze([
  {
    id: 'tickets',
    shape: 'sumAndTotal',
    variables: ['a', 's'],
    domains: () => ({
      A: choiceDomain([8, 9, 10, 12, 15]),
      S: choiceDomain([4, 5, 6, 7]),
      x0: intDomain(30, 160),
      y0: intDomain(30, 160),
    }),
    build: ({ A, S, x0, y0 }) => ({ A, S, x0, y0, N: x0 + y0, M: A * x0 + S * y0 }),
    valid: ({ x0, y0 }) => x0 !== y0,
    text: ({ A, S, N, M }) => `The drama club sold ${N} tickets to its spring play. Adult tickets cost ${dollars(A)} and student tickets cost ${dollars(S)}. Ticket sales totaled ${dollars(M)}. Let a be the number of adult tickets sold and s be the number of student tickets sold.`,
    equations: ({ A, S, N, M }) => [
      { label: 'An equation for the number of tickets sold', answer: `a + s = ${N}` },
      { label: 'An equation for the ticket sales, in dollars', answer: `${term(A, 'a')} + ${term(S, 's')} = ${M}` },
    ],
    valueLabels: ['a, the number of adult tickets sold', 's, the number of student tickets sold'],
    followUp: ({ A, x0 }) => ({ kind: 'number', label: 'The money collected from adult tickets, in dollars', answer: A * x0 }),
  },
  {
    id: 'snack',
    shape: 'sumAndTotal',
    variables: ['h', 'd'],
    domains: () => ({
      A: choiceDomain([3, 4, 5, 6]),
      S: choiceDomain([1, 2]),
      x0: intDomain(4, 18),
      y0: intDomain(4, 18),
    }),
    build: ({ A, S, x0, y0 }) => ({ A, S, x0, y0, N: x0 + y0, M: A * x0 + S * y0 }),
    valid: ({ x0, y0 }) => x0 !== y0,
    text: ({ A, S, N, M }) => `At a basketball game, the snack stand sells hot dogs for ${dollars(A)} each and bottles of water for ${dollars(S)} each. A team bought ${N} items and paid ${dollars(M)}. Let h be the number of hot dogs and d be the number of bottles of water.`,
    equations: ({ A, S, N, M }) => [
      { label: 'An equation for the number of items bought', answer: `h + d = ${N}` },
      { label: 'An equation for the amount paid, in dollars', answer: `${term(A, 'h')} + ${term(S, 'd')} = ${M}` },
    ],
    valueLabels: ['h, the number of hot dogs', 'd, the number of bottles of water'],
    followUp: ({ A, x0 }) => ({ kind: 'number', label: 'The amount paid for the hot dogs alone, in dollars', answer: A * x0 }),
  },
  {
    id: 'seats',
    shape: 'oneDefined',
    variables: ['m', 'b'],
    domains: () => ({
      p: choiceDomain([120, 150, 180, 200, 240]),
      q: choiceDomain([60, 75, 80, 100]),
      y0: intDomain(12, 40),
      k: choiceDomain([5, 6, 8, 10, 12, 15]),
    }),
    build: ({ p, q, y0, k }) => ({ p, q, k, x0: y0 + k, y0, M: p * (y0 + k) + q * y0 }),
    valid: () => true,
    text: ({ p, q, k, M }) => `A theater sold all ${p} main-floor seats and all ${q} balcony seats for one show and collected ${dollars(M)}. A main-floor seat costs ${dollars(k)} more than a balcony seat. Let m be the price of a main-floor seat and b be the price of a balcony seat, in dollars.`,
    equations: ({ p, q, k, M }) => [
      { label: 'An equation that compares the two prices', answer: `m = b + ${k}` },
      { label: 'An equation for the money collected, in dollars', answer: `${p}m + ${q}b = ${M}` },
    ],
    valueLabels: ['m, the price of a main-floor seat, in dollars', 'b, the price of a balcony seat, in dollars'],
    followUp: ({ x0, y0 }) => ({ kind: 'number', label: 'The cost of 2 main-floor seats and 3 balcony seats, in dollars', answer: 2 * x0 + 3 * y0 }),
  },
  {
    id: 'ages',
    shape: 'oneDefined',
    variables: ['j', 'r'],
    domains: () => ({
      y0: intDomain(8, 30),
      k: intDomain(2, 14),
    }),
    build: ({ y0, k }) => ({ k, x0: y0 + k, y0, S: 2 * y0 + k }),
    valid: () => true,
    text: ({ k, S }) => `Jordan is ${k} years older than Riley. The sum of their ages is ${S}. Let j be Jordan’s age and r be Riley’s age, in years.`,
    equations: ({ k, S }) => [
      { label: 'An equation that compares the two ages', answer: `j = r + ${k}` },
      { label: 'An equation for the sum of the ages', answer: `j + r = ${S}` },
    ],
    valueLabels: ['j, Jordan’s age', 'r, Riley’s age'],
    // In k years Riley is Jordan's age today, and Jordan is k years older again.
    followUp: ({ x0, k }) => ({ kind: 'number', label: 'Jordan’s age when Riley is as old as Jordan is now', answer: x0 + k }),
  },
  {
    id: 'rental',
    shape: 'equalCost',
    variables: ['h', 'c'],
    domains: () => ({
      r1: choiceDomain([6, 7, 8, 9, 10, 12]),
      r2: choiceDomain([2, 3, 4, 5]),
      F1: choiceDomain([0, 5, 8, 10, 12]),
      x0: intDomain(2, 8),
    }),
    build: ({ r1, r2, F1, x0 }) => ({ r1, r2, F1, F2: F1 + (r1 - r2) * x0, x0, y0: r1 * x0 + F1 }),
    valid: ({ F2 }) => F2 <= 60,
    text: ({ r1, r2, F1, F2 }) => `Shop A rents bikes for ${F1 ? `${dollars(F1)} plus ` : ''}${dollars(r1)} per hour. Shop B rents bikes for ${dollars(F2)} plus ${dollars(r2)} per hour. Let h be the number of hours a bike is rented and c be the total cost, in dollars.`,
    equations: ({ r1, r2, F1, F2 }) => [
      { label: 'An equation for the total cost at Shop A', answer: `c = ${costSide(r1, 'h', F1)}` },
      { label: 'An equation for the total cost at Shop B', answer: `c = ${costSide(r2, 'h', F2)}` },
    ],
    valueLabels: ['h, the number of hours when the two shops cost the same', 'c, the cost at that number of hours, in dollars'],
    // Ten hours is past the crossing (at most 8), where the lower hourly rate
    // costs less: the student decides which shop that is, then prices it.
    followUp: ({ r2, F2 }) => ({ kind: 'number', label: 'The lower of the two shops’ prices for a 10-hour rental, in dollars', answer: 10 * r2 + F2 }),
  },
  {
    id: 'gym',
    shape: 'equalCost',
    variables: ['m', 'c'],
    domains: () => ({
      r1: choiceDomain([30, 35, 40, 45, 50]),
      r2: choiceDomain([15, 20, 25]),
      F1: choiceDomain([0, 10, 15, 20, 25]),
      x0: intDomain(2, 9),
    }),
    build: ({ r1, r2, F1, x0 }) => ({ r1, r2, F1, F2: F1 + (r1 - r2) * x0, x0, y0: r1 * x0 + F1 }),
    valid: ({ F2 }) => F2 <= 300,
    text: ({ r1, r2, F1, F2 }) => `Gym A charges ${F1 ? `a ${dollars(F1)} joining fee plus ` : ''}${dollars(r1)} per month. Gym B charges a ${dollars(F2)} joining fee plus ${dollars(r2)} per month. Let m be the number of months and c be the total cost, in dollars.`,
    equations: ({ r1, r2, F1, F2 }) => [
      { label: 'An equation for the total cost at Gym A', answer: `c = ${costSide(r1, 'm', F1)}` },
      { label: 'An equation for the total cost at Gym B', answer: `c = ${costSide(r2, 'm', F2)}` },
    ],
    valueLabels: ['m, the number of months when the two gyms cost the same', 'c, the total cost at that number of months, in dollars'],
    // One month is before the crossing (at least 2), where the smaller joining
    // fee costs less: the student decides which gym that is, then prices it.
    followUp: ({ r1, F1 }) => ({ kind: 'number', label: 'The lower of the two gyms’ total costs for 1 month, in dollars', answer: r1 + F1 }),
  },
]);

const situationById = (id) => SITUATIONS.find((situation) => situation.id === id);

/*
 * The displayed equations as rows a·u + b·v = c, read back from the text the
 * student sees — an independent check that the solution a version was built
 * from is the one solution of the system it shows.
 */
const rowOf = (equation, [u, v]) => {
  const [left, right] = equation.split('=').map((side) => side.trim());
  const terms = (side) => side.replace(/\s+/g, '').replace(/-/g, '+-').split('+').filter(Boolean);
  const row = { a: 0, b: 0, c: 0 };
  const add = (term, sign) => {
    const match = term.match(/^(-?\d*)([a-z]?)$/);
    if (!match) throw new Error(`unreadable term ${term}`);
    const [, coefficient, letter] = match;
    const number = coefficient === '' || coefficient === '-' ? (coefficient === '-' ? -1 : 1) : Number(coefficient);
    if (letter === u) row.a += sign * number;
    else if (letter === v) row.b += sign * number;
    else if (letter === '') row.c -= sign * number;
    else throw new Error(`unexpected variable ${letter}`);
  };
  terms(left).forEach((term) => add(term, 1));
  terms(right).forEach((term) => add(term, -1));
  return row;
};

export const solveDisplayedContextSystem = (equations, variables) => {
  const [r1, r2] = equations.map((equation) => rowOf(equation, variables));
  const determinant = r1.a * r2.b - r2.a * r1.b;
  if (determinant === 0) return null;
  return { x: (r1.c * r2.b - r2.c * r1.b) / determinant, y: (r1.a * r2.c - r2.a * r1.c) / determinant };
};

export const contextSystemFamily = defineQuestionFamily({
  id: 'systems.contextModel',
  version: 1,
  title: 'Write and solve a system that models a situation',
  skill: {
    objective: 'Write a system of two linear equations that models a situation, solve it, and use the solution to answer a question about the situation.',
    alignments: ['A.2I', 'A.5C'],
    strand: 'systems',
  },
  difficulty: { band: 3, dok: 2 },
  constraints: {
    shape: choiceKnob('mixed', [...CONTEXT_SYSTEM_SHAPES, 'mixed'], { label: 'Kind of situation' }),
  },
  conceptConstraints: ['shape'],
  // One stratum per situation, balanced by shape: a mixed slot gives every
  // block of three seats one count-and-total, one defined quantity and one
  // pair of equal costs.
  strata: {
    balance: 'shape',
    values: (c) => SITUATIONS
      .filter((situation) => c.shape === 'mixed' || situation.shape === c.shape)
      .map((situation) => ({ shape: situation.shape, situation: situation.id })),
  },
  parameters: (c, stratum) => (stratum ? situationById(stratum.situation).domains() : {}),
  derive: (values) => {
    const situation = situationById(values.situation);
    return situation ? situation.build(values) : {};
  },
  rules: (values) => {
    const situation = situationById(values.situation);
    if (!situation) return [FAMILY_ISSUE.INVALID_PARAMETERS];
    const issues = [];
    if (!situation.valid(values)) issues.push(FAMILY_ISSUE.VALUE_OUT_OF_RANGE);
    const equations = situation.equations(values).map((entry) => entry.answer);
    const solved = solveDisplayedContextSystem(equations, situation.variables);
    if (!solved || solved.x !== values.x0 || solved.y !== values.y0) issues.push(FAMILY_ISSUE.CASE_MISMATCH);
    // Two equal answers cannot tell a student who swapped the quantities.
    if (values.x0 === values.y0) issues.push(FAMILY_ISSUE.TRIVIAL_INSTANCE);
    return issues;
  },
  fingerprint: (values) => {
    const situation = situationById(values.situation);
    return fingerprintOf('systems.contextModel', [values.situation, ...situation.equations(values).map((entry) => entry.answer)]);
  },
  answer: (values) => {
    const situation = situationById(values.situation);
    const [first, second] = situation.equations(values);
    const followUp = situation.followUp(values);
    const value = { first: first.answer, second: second.answer, x: String(values.x0), y: String(values.y0), followUp: String(followUp.answer) };
    return { kind: 'fields', value, display: `${first.answer} and ${second.answer}; (${values.x0}, ${values.y0}); ${followUp.answer}` };
  },
  tools: {
    multiAnswer: (values, { authored }) => {
      const situation = situationById(values.situation);
      const [u, v] = situation.variables;
      const text = situation.text(values);
      const equationField = (id, { label, answer }) => ({
        id,
        label,
        answer,
        // Any form of the same relation: "c = 8h + 5", "8h − c = −5", "2c = 16h + 10".
        equivalence: 'polynomialRelation',
        inputProfile: 'equation',
        answerFormat: 'equation',
        requiredSymbols: ['=', u, v],
        inputContract: { format: 'equation', requiredSymbols: ['=', u, v] },
      });
      const numberField = (id, label, answer) => ({ id, label, answer: String(answer), inputProfile: 'number', answerFormat: 'number', inputContract: { format: 'number' } });
      const [first, second] = situation.equations(values);
      const followUp = situation.followUp(values);
      return {
        type: 'multiAnswer',
        prompt: composeFamilyPrompt({
          authored: authored?.prompt,
          tokens: { situation: text },
          fallback: `${text} Write a system of equations for the situation, solve it, and use the solution to answer the last question.`,
        }),
        answerFields: [
          equationField('first', first),
          equationField('second', second),
          numberField('x', situation.valueLabels[0], values.x0),
          numberField('y', situation.valueLabels[1], values.y0),
          numberField('followUp', followUp.label, followUp.answer),
        ],
      };
    },
  },
  defaultTool: 'multiAnswer',
  instanceFields: ['answerFields', 'responses'],
  recovery: { eligible: true },
});

export const SYSTEMS_CONTEXT_FAMILIES = Object.freeze([contextSystemFamily]);
