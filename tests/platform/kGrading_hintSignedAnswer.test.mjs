import test from 'node:test';
import assert from 'node:assert/strict';

import { hintRevealsAnswer } from '../../functions/shared/pathSolutionSupport.mjs';

/*
 * THE HINT LEAK GUARD READS A SPACED OR TYPESET MINUS AS A NEGATIVE NUMBER.
 *
 * A hint that writes the answer -5 as "- 5", "−5" or "− 5" (U+2212) passed the
 * guard, which only knew the ASCII "-5"; three family builders closed the
 * signs up themselves before asking. The guard now reads those spellings as
 * -5 too, IN ADDITION to the text as written, so it only ever drops more
 * hints. A minus after an operand is subtraction and still is not a sign:
 * hints that quote the problem ("-5x - 2" when the answer is -2) are kept.
 */

test('"- 5", "−5" and "− 5" each name the answer -5', () => {
  for (const hint of ['- 5', '−5', '− 5', 'Set x = - 5.', 'The answer is − 5', 'x ≥ −5', '(−5, 2)']) {
    assert.equal(hintRevealsAnswer(hint, ['-5']), true, `"${hint}" names -5`);
  }
  // Decimals and the answer typeset with U+2212 itself.
  assert.equal(hintRevealsAnswer('x = − 2.5', ['-2.5']), true);
  assert.equal(hintRevealsAnswer('x = - 5', ['−5']), true);
  // A non-numeric answer with a negative inside it.
  assert.equal(hintRevealsAnswer('the point (− 3, 4)', ['(-3, 4)']), true);
});

test('what the guard caught before it still catches', () => {
  assert.equal(hintRevealsAnswer('x = -5', ['-5']), true);
  assert.equal(hintRevealsAnswer('the answer is 5', ['5']), true);
  // A typeset minus never hid a positive answer, and a spaced one does not either.
  assert.equal(hintRevealsAnswer('−5', ['5']), true);
  assert.equal(hintRevealsAnswer('- 5', ['5']), true);
  assert.equal(hintRevealsAnswer('the answer is no', ['no']), true);
});

test('number boundaries and subtraction are not read as the answer', () => {
  assert.equal(hintRevealsAnswer('-15', ['-5']), false);
  assert.equal(hintRevealsAnswer('− 5.5', ['-5']), false);
  assert.equal(hintRevealsAnswer('-5', ['5']), false);
  assert.equal(hintRevealsAnswer('15', ['5']), false);
  // Subtraction after a number, a bracket or a variable letter.
  assert.equal(hintRevealsAnswer('Solve -x + 6 ≥ -5x - 2 one step at a time.', ['-2']), false);
  assert.equal(hintRevealsAnswer('3 − 5', ['-5']), false);
  assert.equal(hintRevealsAnswer('f(x) - 5', ['-5']), false);
  assert.equal(hintRevealsAnswer('', ['-5']), false);
});
