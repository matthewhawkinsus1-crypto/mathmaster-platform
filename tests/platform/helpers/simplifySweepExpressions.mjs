/*
 * GENERATED EXPRESSIONS FOR THE SIMPLIFY SWEEP (simplifyRulesSweep.test.mjs).
 *
 * A seeded, repeatable set of the kinds of expression the platform's graders
 * and Step Algebra hand to mathjs's simplify: fractions (numeric, algebraic,
 * mixed, over a binomial), radicals (square and nth roots, products and
 * quotients of them, a root of a binomial), exponents (positive, negative,
 * zero, fractional, a power of a power, products and quotients of powers),
 * logarithms (natural, with a base, base 10, of a power, of e), inequalities
 * (each relation, and a few chained ones, which mathjs's simplify refuses),
 * and implicit products (2x, 3xy, 2(x + 1), (x + 1)(x - 2), 2 pi r), in sums,
 * differences, products and quotients of up to four terms.
 */
export const generatedExpressions = (count = 3000, seed = 20261116) => {
  let state = seed >>> 0;
  const random = () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = (list) => list[Math.floor(random() * list.length)];
  const int = (low, high) => low + Math.floor(random() * (high - low + 1));
  const VARIABLES = ['x', 'x', 'x', 'y', 'a', 'b', 'n', 't'];
  const number = () => pick([
    () => String(int(1, 12)), () => String(int(1, 12)), () => String(int(2, 9)), () => '0', () => `-${int(1, 9)}`,
    () => pick(['0.5', '1.5', '0.25', '2.5', '0.1', '0.75', '3.2']), () => pick(['pi', 'e']),
  ])();
  const variable = () => pick(VARIABLES);
  const fraction = () => pick([
    () => `${int(1, 9)}/${int(2, 12)}`, () => `-${int(1, 9)}/${int(2, 9)}`, () => `${variable()}/${int(2, 9)}`,
    () => `${int(1, 9)}/${variable()}`, () => `(${linear()})/${int(2, 6)}`, () => `(${linear()})/(${linear()})`,
    () => `${int(1, 5)} + ${int(1, 3)}/${int(4, 8)}`, () => `(${int(1, 9)}/${int(2, 9)})${variable()}`,
  ])();
  const radical = () => pick([
    () => `sqrt(${int(2, 200)})`, () => `${int(2, 6)} sqrt(${int(2, 75)})`, () => `sqrt(${variable()})`, () => `sqrt(${variable()}^2)`,
    () => `sqrt(${int(2, 50)} ${variable()}^${int(2, 5)})`, () => `nthRoot(${int(2, 128)}, ${int(3, 5)})`, () => `nthRoot(${variable()}, 3)`,
    () => `sqrt(${linear()})`, () => `${variable()}^(1/2)`, () => `sqrt(${int(2, 20)})/sqrt(${int(2, 20)})`, () => `sqrt(${int(2, 12)}) sqrt(${int(2, 12)})`,
  ])();
  const power = () => pick([
    () => `${variable()}^${int(2, 5)}`, () => `${variable()}^-${int(1, 3)}`, () => `${variable()}^0`, () => `${variable()}^1`,
    () => `(${linear()})^${int(2, 3)}`, () => `${int(2, 5)}^${variable()}`, () => `${variable()}^${int(1, 4)} * ${variable()}^${int(1, 4)}`,
    () => `(${variable()}^${int(2, 3)})^${int(2, 3)}`, () => `${variable()}^${int(3, 6)} / ${variable()}^${int(1, 3)}`, () => `${int(2, 4)}^${int(2, 6)}`,
    () => `(${int(2, 5)} ${variable()})^${int(2, 3)}`, () => `${variable()}^(${int(1, 3)}/${int(2, 4)})`,
  ])();
  const logarithm = () => pick([
    () => `log(${variable()})`, () => `log(${int(2, 1000)}, ${int(2, 10)})`, () => `log10(${pick(['10', '100', '1000', '0.01'])})`, () => 'log(e)',
    () => `log(${variable()}^${int(2, 4)})`, () => `log(${variable()}, ${int(2, 10)})`, () => `${int(2, 5)} log(${variable()})`,
    () => `log(${variable()}) + log(${variable()})`, () => `log(e^${variable()})`, () => `log(${int(2, 9)} ${variable()})`,
  ])();
  const implicit = () => pick([
    () => `${int(2, 9)}${variable()}`, () => `${int(2, 9)}${variable()}${variable()}`, () => `${int(2, 9)}(${linear()})`,
    () => `(${linear()})(${linear()})`, () => `${variable()}(${linear()})`, () => `2 pi r`, () => `-${int(2, 9)}${variable()}^${int(2, 3)}`,
    () => `${int(2, 5)}sqrt(${int(2, 30)})`, () => `${variable()} ${variable()}`, () => `-(${linear()})`, () => `${int(2, 6)}(${variable()} - ${int(1, 9)})^2`,
  ])();
  const term = () => pick([number, variable, () => `${int(2, 9)} ${variable()}`, fraction, radical, power, logarithm, implicit])();
  const linear = () => {
    const coefficient = int(-9, 9) || 1;
    const constant = int(-12, 12);
    const v = variable();
    const lead = coefficient === 1 ? v : coefficient === -1 ? `-${v}` : `${coefficient}${v}`;
    return constant === 0 ? lead : `${lead} ${constant < 0 ? '-' : '+'} ${Math.abs(constant)}`;
  };
  const sum = () => {
    const terms = Array.from({ length: int(1, 4) }, term);
    return terms.reduce((text, next) => `${text} ${pick(['+', '-', '+', '*', '/'])} ${next}`);
  };
  const relation = () => `${sum()} ${pick(['<', '<=', '>', '>=', '<', '>'])} ${pick([number, term, sum])()}`;
  const chained = () => `${int(-9, 0)} ${pick(['<', '<='])} ${linear()} ${pick(['<', '<='])} ${int(1, 12)}`;
  const shape = () => (random() < 0.02 ? chained() : pick([sum, sum, sum, () => `(${sum()}) - (${sum()})`, () => `(${sum()}) / (${sum()})`, relation, relation, fraction, radical, power, logarithm, implicit])());
  const out = new Set();
  let attempts = 0;
  while (out.size < count && attempts < count * 20) {
    attempts += 1;
    const text = shape();
    if (text.length <= 120) out.add(text);
  }
  return [...out];
};
