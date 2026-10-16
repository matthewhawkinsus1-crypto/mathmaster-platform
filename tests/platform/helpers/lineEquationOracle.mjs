/*
 * AN INDEPENDENT READER FOR GRAPH THE LINE'S EQUATIONS.
 *
 * Reads an equation's PLAIN TEXT — what a student sees — without any code
 * from lineGraphForms.mjs: the two sides become a JavaScript expression for
 * (left − right), which is affine in x and y, and three evaluations recover
 * its coefficients. A forms module that wrote "y + 3 = −2(x + 4)" for the
 * line through (4, −3) is caught here, because this reader has no idea what
 * line was intended.
 *
 * Only for tests: it evaluates text with the Function constructor, after
 * refusing anything but the characters an equation can contain.
 */

import { lineFromCoefficients } from '../../../functions/shared/lineGraphMath.mjs';

const ALLOWED = /^[0-9xy+\-*/(). ]*$/;

const toExpression = (side) => {
  const js = side
    .replace(/−/g, '-')
    // Implicit multiplication: 2x, 0.5x, (2/3)x, 2(x, )(, )x.
    .replace(/([0-9)])\s*(?=[xy(])/g, '$1*');
  if (!ALLOWED.test(js)) throw new Error(`Unexpected characters in "${side}".`);
  return js;
};

// The smallest denominator that makes a float an integer (values here are
// small exact fractions).
const asFraction = (value) => {
  for (let den = 1; den <= 1000; den += 1) {
    const num = Math.round(value * den);
    if (Math.abs(num / den - value) < 1e-9) return [num, den];
  }
  throw new Error(`${value} is not a small fraction.`);
};

/** The line an equation's plain text describes, as a canonical triple. */
export const lineOfText = (text) => {
  const sides = String(text).split('=');
  if (sides.length !== 2) throw new Error(`"${text}" is not one equation.`);
  // eslint-disable-next-line no-new-func
  const f = new Function('x', 'y', `return (${toExpression(sides[0])}) - (${toExpression(sides[1])});`);
  const origin = f(0, 0);
  const a = f(1, 0) - origin;
  const b = f(0, 1) - origin;
  const c = -origin;
  // Affine check: a stray product (x·y) or a misplaced bracket would break it.
  if (Math.abs(f(3, -2) - origin - (3 * a - 2 * b)) > 1e-9) throw new Error(`"${text}" is not linear.`);
  const [an, ad] = asFraction(a);
  const [bn, bd] = asFraction(b);
  const [cn, cd] = asFraction(c);
  return lineFromCoefficients([an, ad], [bn, bd], [cn, cd]);
};
