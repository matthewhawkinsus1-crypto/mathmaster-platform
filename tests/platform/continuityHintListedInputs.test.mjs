/*
 * A RULE OVER A LISTED SET OF INPUTS IS HINTED AS ONE (F-CONTINUITY-HINT,
 * student walkthrough 2026-11-06, Algebra II Honors module 1, part 1).
 *
 * L1 Day 2 CW 5 ("f(x) = 0.5x + 1 over x ∈ {−2, 0, 2, 4}") and PR 4 asked
 * "discrete or continuous?" with the hint written for a situation: "Decide
 * whether an input in between makes sense here, for example one and a half of
 * the input." The rule takes 1.5 happily, so a student who followed it said
 * "continuous". What decides it is that only the listed inputs belong, as the
 * worked steps say. The situation items (the District review's bus, van and
 * tank) keep the situation's hint.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { buildQuestionHints } from '../../src/platform/supports/hints/questionHints.js';
import { maskMath } from '../../src/platform/language/mathSafeText.js';
import { loadLanguagePack, translateWithPack, TRANSLATION_COVERAGE } from '../../src/platform/language/translationProviders.js';

const lesson = (path) => parseAssignmentBlueprintText(readFileSync(new URL(`../../teacher-import-jsons/${path}`, import.meta.url), 'utf8')).questions;
const DAY2 = lesson('algebra2-honors-module1/L1_Day2_Function_Attributes_Relations.json');
const DISTRICT = lesson('algebra1-dol1/District_DOL1_Technology_Graph_Analysis_Review.json');
const familyHints = (question) => buildQuestionHints(question).filter((hint) => hint.source === 'family').map((hint) => hint.text);

const LISTED = 'Which inputs belong to this relation: every number between the listed values, or only the listed ones? If only the listed inputs belong, the graph is separate points; if every value between them belongs too, it is one connected piece.';
const LISTED_GRAPH = 'Plot each (x, y) pair from your table; connect the points only if the inputs between them belong to the relation too.';
const SITUATION = /one and a half of the input/;

test('a rule over listed inputs asks which inputs belong, not whether one and a half makes sense', () => {
  const listed = DAY2.filter((question) => /over x ∈ \{/.test(question.prompt || ''));
  assert.deepEqual(listed.map((question) => question.questionId), ['q_classwork-2_2_5', 'q_practice-3_3_4'], 'L1 Day 2 CW 5 and PR 4');
  listed.forEach((question) => {
    const hints = familyHints(question);
    assert.ok(hints.includes(LISTED), `${question.questionId}: ${hints.join(' | ')}`);
    assert.ok(hints.includes(LISTED_GRAPH), `${question.questionId}: ${hints.join(' | ')}`);
    hints.forEach((hint) => assert.doesNotMatch(hint, SITUATION, question.questionId));
    // It asks before it tells.
    assert.ok(hints.indexOf(LISTED) > 0 && LISTED.indexOf('?') < LISTED.indexOf('separate points'));
  });
});

test('a situation keeps the situation\'s hint (the District review\'s bus, van and tank)', () => {
  const situations = DISTRICT.filter((question) => familyHints(question).some((hint) => SITUATION.test(hint)));
  assert.equal(situations.length, 3, situations.map((question) => question.prompt).join('\n'));
  situations.forEach((question) => {
    assert.ok(question.scenario || /bus|van|tank/i.test(question.prompt), question.prompt);
    assert.ok(!familyHints(question).includes(LISTED), question.prompt);
  });
});

test('the new hints are in Spanish, the mathematics untouched', async () => {
  const pack = await loadLanguagePack('es');
  [LISTED, LISTED_GRAPH].forEach((text) => {
    const result = translateWithPack(text, pack);
    assert.equal(result.coverage, TRANSLATION_COVERAGE.FULL, `${text}\n→ ${result.text}`);
    assert.notEqual(result.text, text);
    maskMath(text).tokens.forEach((token) => assert.ok(result.text.includes(token), `${token} in ${result.text}`));
  });
});
