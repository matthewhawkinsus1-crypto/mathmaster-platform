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
const asMath = (text) => String(text).replace(/²/g, '^2').replace(/−/g, '-').replace(/(\d)([a-z(])/g, '$1*$2').replace(/\)\(/g, ')*(');
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
