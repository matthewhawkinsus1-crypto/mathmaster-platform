import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { answerInStem } from '../../scripts/digital-sat-spr-stem-probe.mjs';

const compiled = () => JSON.parse(readFileSync(new URL('../../drafts/digitalSAT.v2.1.json', import.meta.url), 'utf8')).documents;

// The certification sweep's strong checks - answer-key rank bias, choice-id
// leakage, arithmetic ladders, duplicate options - all need four options, so
// none of them looks at the student-produced-response families. Fifteen of
// those printed their own expected answer in the stem. Seven were genuine
// disclosures and were repaired; the eight below are the ones where the value
// has to be there, or where the answer coincides with a printed number because
// of the mathematics rather than because of a leak.
//
// Every entry carries the reason it is allowed. A family that prints its answer
// and is NOT on this list fails, and so does a listed family that no longer
// prints it - which forces the list to be pruned when an item is repaired
// rather than left to rot.
const ALLOWED = Object.freeze({
  // The maximum of a(x-h)^2+k with a<0 is k, which is part of the function's
  // own definition and cannot be withheld. Knowing to read it is the skill.
  'mm_sat_A_7A_challenge_challenge-max-value_v21':
    'necessary given: k is the printed function\'s own constant',

  // The intersection must be stated - there are no equations to solve. The task
  // is interpreting which coordinate is revenue, and the item is labelled band
  // 2 / DOK 1 accordingly.
  'mm_sat_A_3G_4_context-intersection-output_v21':
    'necessary given: the intersection is the stimulus; the task is interpretation',

  // Vieta's relation: the product of the zeros of a monic quadratic IS the
  // constant term. That the answer appears in the stem is the theorem.
  'mm_sat_A_7B_product-of-zeros_v21':
    'necessary given: the product of the zeros is the constant term by Vieta',

  // A repeated input must map to a single output for the relation to be a
  // function, so k has to equal the printed partner. The other printed output
  // is equally available and wrong, so copying a number does not score.
  'mm_sat_A_12A_challenge_1_parameter-repeated-input_v21':
    'coincidence: the answer equals the partner output because that is the definition of a function',

  // The expression is undefined exactly when the denominator vanishes, which is
  // exactly at the proposed solution. The equality is the concept being tested.
  'mm_sat_A2_6J_challenge_2_parameter-denominator_v21':
    'coincidence: k equals the proposed solution precisely when the denominator vanishes',

  // Cancelling the common linear factor leaves the quadratic unchanged, so the
  // middle coefficient carries through. The work is recognising the cancellation.
  'mm_sat_A2_7C_challenge_quotient_linear_coefficient_v21':
    'coincidence: cancelling the common factor leaves the printed coefficient unchanged',

  // Dividing by x leaves the leading coefficient unchanged, for the same reason.
  'mm_sat_A_10C_4_quotient-parameter_v21':
    'coincidence: dividing by x leaves the printed leading coefficient unchanged',

  // x^2 = kx has the non-zero solution x = k, so the answer equals the printed
  // slope as a consequence of the algebra.
  'mm_sat_A2_3C_nonzero-intersection-parabola-line_v21':
    'coincidence: x^2 = kx gives x = k, so the answer equals the printed slope',
});

test('every SPR family that prints its own answer is a reviewed, justified exception', () => {
  const flagged = answerInStem(compiled(), 150).map((row) => row.id);

  const unreviewed = flagged.filter((id) => !(id in ALLOWED));
  assert.deepEqual(unreviewed, [],
    `SPR families print their own answer in the stem and are not on the reviewed list.\n`
    + `Read each one: repair it if the answer is genuinely disclosed, or add it to ALLOWED with the reason it must be there.\n  `
    + unreviewed.join('\n  '));

  const stale = Object.keys(ALLOWED).filter((id) => !flagged.includes(id));
  assert.deepEqual(stale, [],
    `these families no longer print their answer, so their exception is stale and should be deleted:\n  ${stale.join('\n  ')}`);
});
