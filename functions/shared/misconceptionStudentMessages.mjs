// WHAT A STUDENT IS TOLD WHEN A MISCONCEPTION CODE FITS THEIR MISS.
//
// One message per code in misconceptionCodes.mjs. Each one:
//
//   - names the likely error, as a thing to check — never the student
//     ("check which coordinate you subtracted first", not "you are careless");
//   - never contains the answer, a value from the question, or anything that
//     narrows the answer to one value (the messages are fixed text: no number
//     from the item can reach them);
//   - is shown ONLY after a graded miss, on a question whose outcome feedback
//     is open (practice/classwork, or a DOL/test whose results were released
//     and whose item is closed). Never while an assessment item can still be
//     answered (src/platform/supports/feedback/attemptFeedbackPlan.js).
//
// A message is display text. It is never stored, never graded, and the code
// it was chosen by is computed for display only — the recorded evidence stays
// the server's own classification at ingestion (misconceptionCodes.mjs).

import { MISCONCEPTION_REGISTRY } from './misconceptionCodes.mjs';

export const MISCONCEPTION_STUDENT_MESSAGES = Object.freeze({
  'slope-run-over-rise': 'Check the order of your slope fraction. Slope is the change in y divided by the change in x — it looks like the two changes were divided the other way around.',
  'slope-sign-reversed': 'Your slope has the right size but the wrong sign. Subtract the coordinates in the same order on the top and the bottom (second point minus first point both times).',
  'slope-intercept-swapped': 'It looks like the slope and the y-intercept traded places. In y = mx + b, the number multiplying x is the slope and the constant term is the y-intercept.',
  'intercepts-swapped': 'It looks like the x- and y-intercepts traded places. The x-intercept is where y = 0, and the y-intercept is where x = 0.',
  'ordered-pair-reversed': 'Check the order inside your ordered pair. An ordered pair is written (x, y): the x-coordinate comes first.',
  'inverse-operation-sign': 'Check how you moved a term to the other side. To undo adding, subtract from both sides; to undo subtracting, add to both sides.',
  'partial-division': 'When you divided by the coefficient, every term on that side has to be divided — or undo the added or subtracted constant first, then divide.',
  'inequality-boundary-style': 'Your boundary line is in the right place. Check its style: a strict inequality (< or >) uses a dashed line, and ≤ or ≥ uses a solid line.',
  'inequality-shaded-wrong-side': 'Your boundary line is in the right place. Check the shading with a test point: shade the side whose points make the inequality true.',
  'endpoint-inclusion-error': 'Your endpoints are in the right places. Check whether each endpoint is included: < and > use an open circle (or parenthesis), ≤ and ≥ use a closed circle (or bracket).',
  'inequality-direction-reversed': 'Your solution starts at the right value but points the other way. Test a number on each side of the endpoint, and remember to flip the symbol when you multiply or divide by a negative.',
  'substitution-partial-distribution': 'When you substituted the expression, it needed parentheses: the coefficient multiplies every term inside, not just the first one.',
  'system-point-on-one-line-only': 'Your point works in one equation but not the other. A solution to a system has to make both equations true — check it in each one.',
  'independent-dependent-swapped': 'It looks like the independent and dependent quantities traded places. Ask which quantity depends on the other: that one is the dependent (output) quantity.',
  'initial-value-from-later-reading': 'Your rate looks right. Check the starting value: it is the value when x = 0, which may not be one of the readings you were given — work back to x = 0.',
  'composition-order-reversed': 'Check the order of the composition. In f(g(x)), apply g first, then put that result into f.',
  'domain-range-swapped': 'It looks like the domain and range traded places. The domain is the set of inputs (x-values) and the range is the set of outputs (y-values).',
  'correlation-direction-reversed': 'Check the direction of the association. When one quantity tends to increase as the other increases, the association is positive; when it tends to decrease, it is negative.',
  'correlation-treated-as-causation': 'An association in data does not show that one quantity causes the other. Without a controlled experiment, the data show a correlation only.',
  'absolute-value-negated-solution': 'For the second case, set the expression inside the bars equal to the negative value and solve again — the second solution is not just the first one with its sign changed.',
  'absolute-value-one-case-only': 'An absolute value equation usually has two cases: the inside equals the positive value, and the inside equals the negative value. Solve both cases.',
  'vertex-x-sign-reversed': 'Check the sign of the vertex x-coordinate. In y = a(x − h)² + k the vertex x-coordinate is h, which has the opposite sign of the number written inside the parentheses; from standard form, x = −b/(2a).',
  // Right line, wrong form (R-3): the form is named, the line is not touched.
  'line-wrong-form-slope-intercept': 'Right line, wrong form: write it as y = mx + b.',
  'line-wrong-form-point-slope': 'Right line, wrong form: write it as y − y₁ = m(x − x₁).',
  'line-wrong-form-standard': 'Right line, wrong form: write it as Ax + By = C.',
  // The value is right; the form is not (simplifiedPolynomialForm.mjs). Said
  // where no answer can be read (a Test Cycle skill, across items); a miss on
  // one answer is told what is left in it (POLYNOMIAL_NOT_SIMPLIFIED_MESSAGES).
  'polynomial-not-simplified': 'Equal, but not simplified: multiply out any product, then combine any like terms.',
  // The key's value, refused for its form (walkthrough 2026-10-23).
  'radical-not-simplest-form': 'Equal, but not in simplest form: take every perfect power out of the root, combine like terms, and leave no root in a denominator.',
  'radical-decimal-not-exact': 'That is a decimal approximation. Give the exact value instead, written the way the question uses: with a radical or with an exponent.',
  'radical-other-notation': 'Equal, but in the other notation: write it with radicals or with rational exponents, the way the question asks.',
  'polynomial-not-fully-factored': 'Equal, but not fully factored: take out any common factor first, then check whether each factor can be factored again.',
  'polynomial-unit-coefficient': 'Equal, but a coefficient of one is never written: leave it out in front of a variable, and keep only the sign.',
  'zeros-sign-reversed': 'Check the signs of your zeros. A zero is the x-value that makes a factor equal 0, so set each factor equal to 0 and solve.',
});

/*
 * 'polynomial-not-simplified' NAMES WHAT IS LEFT IN THE STUDENT'S OWN ANSWER
 * (TL31; walkthrough 2026-10-22, Operations on Polynomials CW 5 / PR 1). One
 * sentence, "multiply out every product and combine like terms", was said for
 * every miss, so a subtraction answer with only like terms left was told to
 * multiply out products it did not have. The first thing left to do in the
 * typed answer — the problem the simplest-form check found in it
 * (simplifiedPolynomialForm.mjs SIMPLIFIED_POLYNOMIAL_PROBLEMS) — chooses one
 * of these fixed sentences: a kind of work, never a term, a value or the key.
 * Keyed by the problem's name, so this file stays free of imports (the student
 * first load reaches it through testCycleDiscovery.js); missDiagnosis.js reads
 * the answer. A problem with no sentence here keeps the code's own message.
 */
export const POLYNOMIAL_NOT_SIMPLIFIED_MESSAGES = Object.freeze({
  likeTerms: 'Equal, but not simplified: combine like terms, so each kind of term appears only once.',
  product: 'Equal, but not simplified: multiply out every product, then combine any like terms.',
  grouping: 'Equal, but not simplified: remove every set of parentheses, then combine any like terms.',
  power: 'Equal, but not simplified: write each power simply — no exponent of one, and nothing to the power zero.',
  lowestTerms: 'Equal, but not simplified: write every coefficient in lowest terms.',
  zeroTerm: 'Equal, but not simplified: leave out any term with a coefficient of zero.',
});

/** The sentence for what is left in an unsimplified answer (a SIMPLIFIED_POLYNOMIAL_PROBLEMS value), or null. */
export const polynomialNotSimplifiedMessage = (problem) => {
  const key = String(problem ?? '');
  return Object.prototype.hasOwnProperty.call(POLYNOMIAL_NOT_SIMPLIFIED_MESSAGES, key) ? POLYNOMIAL_NOT_SIMPLIFIED_MESSAGES[key] : null;
};

/** The student-safe message for a registered code, or null. */
export const studentMisconceptionMessage = (code) => {
  const key = String(code ?? '').trim();
  return Object.prototype.hasOwnProperty.call(MISCONCEPTION_STUDENT_MESSAGES, key) ? MISCONCEPTION_STUDENT_MESSAGES[key] : null;
};

/** Registry codes that have no student message (the test keeps this empty). */
export const codesWithoutStudentMessage = () => MISCONCEPTION_REGISTRY
  .map((entry) => entry.id)
  .filter((id) => !studentMisconceptionMessage(id));
