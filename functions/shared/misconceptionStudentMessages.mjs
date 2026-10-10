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
  'zeros-sign-reversed': 'Check the signs of your zeros. A zero is the x-value that makes a factor equal 0, so set each factor equal to 0 and solve.',
});

/** The student-safe message for a registered code, or null. */
export const studentMisconceptionMessage = (code) => {
  const key = String(code ?? '').trim();
  return Object.prototype.hasOwnProperty.call(MISCONCEPTION_STUDENT_MESSAGES, key) ? MISCONCEPTION_STUDENT_MESSAGES[key] : null;
};

/** Registry codes that have no student message (the test keeps this empty). */
export const codesWithoutStudentMessage = () => MISCONCEPTION_REGISTRY
  .map((entry) => entry.id)
  .filter((id) => !studentMisconceptionMessage(id));
