import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/*
 * THE ASVAB FIXES LIVE IN THE DRAFTS THE BANK IS BUILT FROM.
 *
 * scripts/build-asvab-bank.mjs writes both shipping seeds (and drafts/asvab.json)
 * from drafts/asvab-{ar,mk}{,-challenge}.json. A fix made only in a seed is
 * undone by the next build, so the committed outputs must be exactly what the
 * drafts build (--check writes nothing), and the six second-right-answer
 * constraints from the bank sweep must be in the drafts themselves.
 */
test('the committed ASVAB seeds are exactly what the drafts build', () => {
  assert.doesNotThrow(() => execFileSync(process.execPath, ['scripts/build-asvab-bank.mjs', '--check'], { stdio: 'pipe' }));
});

test('the sweep constraints are in the drafts, not only the generated seeds', () => {
  const documents = ['drafts/asvab-ar.json', 'drafts/asvab-mk.json']
    .flatMap((file) => JSON.parse(readFileSync(file, 'utf8')).documents);
  const constraints = (id) => documents.find((doc) => doc.id === id)?.generator?.constraints || [];
  assert.ok(constraints('mm_asvab_mk_6_7A_expression_with_the_same_value').includes('a+b*c!=a*b+a*c'));
  assert.ok(constraints('mm_asvab_mk_7_3A_sum_of_two_fractions').includes('prod!=2*sum'));
  for (const id of [
    'mm_asvab_ar_8_8B_which_equation_balances',
    'mm_asvab_mk_8_8A_equation_for_two_plans_meeting',
    'mm_asvab_mk_A_2B_point_slope_form',
    'mm_asvab_mk_A_5C_the_equation_substitution_leaves',
  ]) assert.ok(constraints(id).length > 0, `${id} carries its constraint`);
});
