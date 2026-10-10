/*
 * THE DIGITAL SAT MATH REFERENCE SHEET, AS DATA.
 *
 * The College Board gives every Digital SAT math student the same sheet:
 * eleven figures with their formulas and three facts about angles. A practice
 * test that says "Reference sheet available" (ExamPrepHeader) has to give the
 * same sheet — not a summary, not extra formulas a student would not have on
 * test day. tests/platform/satReferenceSheet.test.mjs holds this list to the
 * published one, so a formula cannot be dropped or added unnoticed.
 *
 * `latex` is rendered with the platform's math renderer (MathDisplay);
 * `spoken` is what a screen reader hears for it. The figures themselves are
 * drawn by src/components/assessment/SatReferenceSheet.jsx, keyed by `id`.
 *
 * The sheet is the exam's, not the item's: it carries nothing about any
 * question and is the same on every one.
 */

export const SAT_REFERENCE_SHEET_ID = 'satMathReference';

const formula = (latex, spoken) => Object.freeze({ latex, spoken });
const figure = (id, name, description, formulas) => Object.freeze({ id, name, description, formulas: Object.freeze(formulas) });

export const SAT_REFERENCE_FIGURES = Object.freeze([
  figure('circle', 'Circle', 'A circle with radius r.', [
    formula('A=\\pi r^2', 'A equals pi r squared'),
    formula('C=2\\pi r', 'C equals 2 pi r'),
  ]),
  figure('rectangle', 'Rectangle', 'A rectangle with length l and width w.', [
    formula('A=\\ell w', 'A equals l w'),
  ]),
  figure('triangle', 'Triangle', 'A triangle with base b and height h.', [
    formula('A=\\frac{1}{2}bh', 'A equals one half b h'),
  ]),
  figure('rightTriangle', 'Right triangle', 'A right triangle with legs a and b and hypotenuse c.', [
    formula('c^2=a^2+b^2', 'c squared equals a squared plus b squared'),
  ]),
  figure('special30', 'Special right triangle', 'A 30°-60°-90° triangle: the side across from 30° is x, the side across from 60° is x times the square root of 3, and the hypotenuse is 2x.', [
    formula('x,\\;x\\sqrt{3},\\;2x', 'sides x, x root 3, and 2 x'),
  ]),
  figure('special45', 'Special right triangle', 'A 45°-45°-90° triangle: both legs are s and the hypotenuse is s times the square root of 2.', [
    formula('s,\\;s,\\;s\\sqrt{2}', 'sides s, s, and s root 2'),
  ]),
  figure('rectangularPrism', 'Rectangular prism', 'A rectangular prism with length l, width w and height h.', [
    formula('V=\\ell wh', 'V equals l w h'),
  ]),
  figure('cylinder', 'Cylinder', 'A cylinder with radius r and height h.', [
    formula('V=\\pi r^2h', 'V equals pi r squared h'),
  ]),
  figure('sphere', 'Sphere', 'A sphere with radius r.', [
    formula('V=\\frac{4}{3}\\pi r^3', 'V equals four thirds pi r cubed'),
  ]),
  figure('cone', 'Cone', 'A cone with radius r and height h.', [
    formula('V=\\frac{1}{3}\\pi r^2h', 'V equals one third pi r squared h'),
  ]),
  figure('rectangularPyramid', 'Rectangular pyramid', 'A rectangular pyramid with length l, width w and height h.', [
    formula('V=\\frac{1}{3}\\ell wh', 'V equals one third l w h'),
  ]),
]);

export const SAT_REFERENCE_FACTS = Object.freeze([
  Object.freeze({ id: 'circleDegrees', text: 'The number of degrees of arc in a circle is 360.' }),
  Object.freeze({ id: 'circleRadians', text: 'The number of radians of arc in a circle is 2π.' }),
  Object.freeze({ id: 'triangleAngles', text: 'The sum of the measures in degrees of the angles of a triangle is 180.' }),
]);

export const SAT_REFERENCE_SHEET = Object.freeze({
  id: SAT_REFERENCE_SHEET_ID,
  title: 'Reference sheet',
  subtitle: 'Digital SAT math formulas',
  figures: SAT_REFERENCE_FIGURES,
  facts: SAT_REFERENCE_FACTS,
});

export default SAT_REFERENCE_SHEET;
