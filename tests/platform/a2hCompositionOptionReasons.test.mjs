/*
 * A ONE-TRY CHOICE'S REASON NAMES THE SLIP THAT GIVES ITS OPTION
 * (student walkthrough 2026-11-06, Algebra II Honors module 1, part 2).
 *
 * Algebra II Honors L4 PR 5 asks for (f∘g)(x) with f(x) = x² + 2x + 3 and
 * g(x) = x + 5, as a choice with one try. After the try the student reads the
 * author's reason for the option they chose (oneTryChoice.js). The reason for
 * x² + 10x + 28 said "This replaces the x in x² but not the x in 2x", but that
 * slip gives (x + 5)² + 2x + 3 = x² + 12x + 28. The option is (x + 5)² + 3:
 * the 2x term left out. The reason now says so.
 *
 * Each option here is paired with the work that gives it, checked equal at many
 * x, and the reason must name that work. The lesson is compiled as an import
 * compiles it, so the reason is the one a student's device receives.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { create, all } from 'mathjs';

import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { chosenOptionReasons } from '../../src/platform/supports/feedback/oneTryChoice.js';

const math = create(all, {});
const L4 = new URL('../../teacher-import-jsons/algebra2-honors-module1/L4_Operations_on_Functions_Composition.json', import.meta.url);
const asMath = (text) => String(text).replace(/²/g, '^2').replace(/³/g, '^3').replace(/−/g, '-').replace(/(\d)([a-z(])/g, '$1*$2').replace(/\)\(/g, ')*(');
const sameAt = (left, right) => [-3, -0.5, 0, 1.25, 4].every((x) => Math.abs(math.evaluate(asMath(left), { x }) - math.evaluate(asMath(right), { x })) < 1e-9);

// [option, the work that gives it, what the reason the student reads must name]
const SLIPS = [
  ['x²+2x+8', '(x^2+2x+3)+5', /\(g∘f\)\(x\)/],
  ['x²+10x+28', '(x+5)^2+3', /leaves out the 2x term/],
];

test('L4 PR 5: each (f∘g)(x) option covered here comes from the slip its reason names', () => {
  const questions = parseAssignmentBlueprintText(readFileSync(L4, 'utf8')).questions;
  const question = questions.find((entry) => entry.prompt === 'For f(x)=x²+2x+3 and g(x)=x+5, find both compositions.');
  assert.ok(question, 'L4 PR 5 compiles');
  const field = question.answerFields.find((entry) => entry.id === 'fog');
  assert.ok(sameAt(field.answer, '(x+5)^2+2(x+5)+3'), 'the key is f(g(x))');
  for (const [option, work, named] of SLIPS) {
    assert.ok(field.options.includes(option), `${option} is an option`);
    assert.ok(sameAt(option, work), `${option} is ${work}`);
    assert.ok(!sameAt(option, field.answer), `${option} is wrong`);
    // The reason as the device shows it after the one try.
    const [shown] = chosenOptionReasons({ question, parts: [{ id: 'fog', response: option, isCorrect: false }] });
    assert.ok(shown, `${option} has a reason the student reads`);
    assert.match(shown.rationale, named, `the reason for ${option} names the slip that gives it`);
  }
});

/*
 * The exit ticket's Q1 (f(x) = x² − 2x + 3, g(x) = 2x + 1). The reason for
 * x² + 2x + 4 said "This keeps x² as it is; every x in f … becomes 2x + 1",
 * but keeping x² gives x² − 2(2x + 1) + 3 = x² − 4x + 1. The option is
 * x² + (2x + 1) + 3: 2x + 1 written in place of the whole term −2x. The
 * student reads it once the ticket closes. Only the reason changed: the prompt,
 * numbers, options and key are what this question's Recovery will bind to.
 */
test('L4 exit ticket Q1: the reason for x² + 2x + 4 names the slip that gives it, and nothing else moved', () => {
  const questions = parseAssignmentBlueprintText(readFileSync(L4, 'utf8')).questions;
  const question = questions.find((entry) => entry.prompt === 'Given f(x)=x²−2x+3 and g(x)=2x+1, find both compositions.');
  assert.ok(question, 'L4 exit ticket Q1 compiles, with its prompt as it was');
  assert.equal(question.activityRole, 'dol');
  const field = question.answerFields.find((entry) => entry.id === 'fog');
  assert.deepEqual(field.options, ['4x²+2', '2x²−4x+7', '4x²−2x+2', 'x²+2x+4'], 'the options as they were');
  assert.equal(field.answer, '4x²+2', 'the key as it was');
  assert.ok(sameAt(field.answer, '(2x+1)^2-2(2x+1)+3'), 'the key is f(g(x))');
  const option = 'x²+2x+4';
  assert.ok(sameAt(option, 'x^2+(2x+1)+3'), 'the option is 2x + 1 in place of −2x, with x² kept');
  assert.ok(!sameAt(option, 'x^2-2(2x+1)+3'), 'keeping x² alone gives x² − 4x + 1, another polynomial');
  const [shown] = chosenOptionReasons({ question, parts: [{ id: 'fog', response: option, isCorrect: false }] });
  assert.ok(shown, `${option} has a reason the student reads`);
  assert.match(shown.rationale, /2x \+ 1 in place of the whole term −2x/, 'the reason names the slip that gives the option');
  assert.match(shown.rationale, /x² \+ \(2x \+ 1\) \+ 3/, 'and shows its work');
  assert.ok(sameAt(option, shown.rationale.match(/x² \+ \(2x \+ 1\) \+ 3/)[0].replace(/\s+/g, '')), 'which equals the option');
});

/*
 * THE FIVE REASONS THAT NAMED ONLY PART OF THEIR SLIP (part 2, "Reasons that are
 * true but name only part of a slip"; handoff section 6). Each reason named a
 * slip really in its option, but the rest of the option came from no single
 * slip, so a student who chose it learned one thing to fix, not what they did.
 *
 *   - L4 CW 2's 3x³ − 14x² − 9x + 4 is the last three products with their signs
 *     flipped, not two: the reason now names all three (the option stays).
 *   - L4 CW 6's 3x² + 3x + 4 and 3x² + x + 7, PR 5's x² + 7x + 8 and PR 6's
 *     0.5x − 4 came from no one slip. Each option is now the exact result of
 *     the slip its reason names, and the reason shows that work.
 *
 * Classwork and Practice only: no Recovery binds to them. The keys do not move.
 */
const WHOLE_SLIPS = [
  // [the item's prompt, field, its key, the key's work, option, the work that gives it, what the reason names]
  ['Given f(x)=3x²−2x+1 and g(x)=x−4, identify the product (f·g)(x).', 'product', '3x³−14x²+9x−4', '(3x^2-2x+1)*(x-4)',
    '3x³−14x²−9x+4', '3x^3-12x^2-2x^2-8x-x+4', /flips the signs of the last three products: −2x · \(−4\) is \+8x, 1 · x is \+x and 1 · \(−4\) is −4/],
  ['For f(x)=3x²−x+4 and g(x)=2x−1, find both compositions.', 'fog', '12x²−14x+8', '3(2x-1)^2-(2x-1)+4',
    '3x²−2x+5', '3x^2-(2x-1)+4', /keeps 3x² as it is and puts 2x − 1 only into −x: 3x² − \(2x − 1\) \+ 4/],
  ['For f(x)=3x²−x+4 and g(x)=2x−1, find both compositions.', 'gof', '6x²−2x+7', '2(3x^2-x+4)-1',
    '3x²−2x+7', '3x^2+2(-x+4)-1', /doubles −x \+ 4 but leaves 3x² as it is: 3x² \+ 2\(−x \+ 4\) − 1/],
  ['For f(x)=x²+2x+3 and g(x)=x+5, find both compositions.', 'fog', 'x²+12x+38', '(x+5)^2+2(x+5)+3',
    'x²+2x+13', 'x^2+2(x+5)+3', /keeps x² as it is and puts x \+ 5 only into 2x: x² \+ 2\(x \+ 5\) \+ 3/],
  ['Determine whether f(x)=0.5x+4 and g(x)=2x−8 are inverses.', 'fog', 'x', '0.5(2x-8)+4',
    '0.5x', '0.5(x-8)+4', /puts x − 8 into f instead of 2x − 8, losing the factor of 2 from g: 0\.5\(x − 8\) \+ 4 = 0\.5x/],
];

test('L4 CW 2, CW 6, PR 5 and PR 6: each option\'s reason names the whole slip that gives it, and every key is as it was', () => {
  const questions = parseAssignmentBlueprintText(readFileSync(L4, 'utf8')).questions;
  for (const [prompt, fieldId, key, keyWork, option, work, named] of WHOLE_SLIPS) {
    const question = questions.find((entry) => entry.prompt === prompt);
    assert.ok(question, `${prompt} compiles`);
    const field = question.answerFields.find((entry) => entry.id === fieldId);
    assert.equal(field.answer, key, `${prompt} ${fieldId}: the key as it was`);
    assert.ok(sameAt(key, keyWork), `${key} is ${keyWork}`);
    assert.ok(field.options.includes(option), `${option} is an option`);
    assert.equal(new Set(field.options).size, field.options.length, 'the options are distinct');
    field.options.filter((entry) => entry !== key).forEach((entry) => assert.ok(!sameAt(entry, key), `${entry} is wrong`));
    assert.ok(sameAt(option, work), `${option} is ${work}`);
    const [shown] = chosenOptionReasons({ question, parts: [{ id: fieldId, response: option, isCorrect: false }] });
    assert.ok(shown, `${option} has a reason the student reads`);
    assert.match(shown.rationale, named, `the reason for ${option} names the whole slip`);
  }
  // The options the reasons used to half-name are gone; CW 2's stays.
  const optionsOf = (prompt, fieldId) => questions.find((entry) => entry.prompt === prompt).answerFields.find((entry) => entry.id === fieldId).options;
  assert.ok(!optionsOf(WHOLE_SLIPS[1][0], 'fog').includes('3x²+3x+4'));
  assert.ok(!optionsOf(WHOLE_SLIPS[2][0], 'gof').includes('3x²+x+7'));
  assert.ok(!optionsOf(WHOLE_SLIPS[3][0], 'fog').includes('x²+7x+8'));
  assert.ok(!optionsOf(WHOLE_SLIPS[4][0], 'fog').includes('0.5x−4'));
});
