/*
 * A GRAPH ON THE WHOLE REAL LINE GETS A SIBLING ON THE WHOLE REAL LINE
 * (2026-11-06 walkthrough of the District DOL #2 review: CW 1 and PR 1 analyse
 * a V on the whole real line, and their "Try a similar one" / "Practise one
 * like this" sibling was a V drawn on a closed interval — domain [−2, 7],
 * range [−4, 6] — so the student practised a harder reading).
 *
 * functionFeatures.js's characteristics sibling now draws on a closed interval
 * only where the item's own graph is restricted. On the whole real line every
 * graph of these families has the domain (−∞, ∞), the item's own answer, so
 * the sibling asks the rest; its range is read from the vertex (or the
 * asymptote). Each sibling is re-solved here from the rule its prompt states,
 * independently of the family. The District DOL #1 review's whole-line
 * quadratics and exponentials had the same mismatch and get the same sibling;
 * an item whose graph IS restricted keeps a restricted one.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { create, all } from 'mathjs';

import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { generateQuestion } from '../../src/problemGenerator.js';
import { buildSimilarWorkedExample, similarExampleIsSafe } from '../../src/platform/supports/workedExample/similarProblem.js';
import { PRACTICE_VERDICT, buildPracticeLikeThis, checkPracticePart, readPracticeAnswer } from '../../src/platform/supports/workedExample/practiceLikeThis.js';
import { TRANSLATION_COVERAGE, loadLanguagePack, translateWithPack } from '../../src/platform/language/translationProviders.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const math = create(all);
const DOL2 = 'teacher-import-jsons/algebra2-honors-dol2/District_DOL2_Absolute_Value_and_3x3_Systems_Review.json';
const DOL1 = 'teacher-import-jsons/algebra1-dol1/District_DOL1_Technology_Graph_Analysis_Review.json';
const DOL3 = 'teacher-import-jsons/algebra1-dol3/Algebra1_DOL3_Review.json';

const itemsOf = (file) => compileAuthoringIntentV5(JSON.parse(readFileSync(join(ROOT, file), 'utf8'))).package.sections.flatMap((section) => section.questions);
const itemOf = (file, id) => {
  const found = itemsOf(file).find((question) => question.questionId === id);
  assert.ok(found, `${id} is in ${file}`);
  return found;
};
// The item as compiled, and as a dozen students are dealt it.
const instancesOf = (question) => (question.generator || question.questionFamily
  ? [question, ...Array.from({ length: 12 }, (_, index) => generateQuestion(question, `whole-line|${question.questionId}|variant:${index}`))]
  : [question]);
const siblingsOf = (question) => instancesOf(question).flatMap((instance) => [0, 97, 194].map((seed) => buildSimilarWorkedExample(instance, { seed })).filter(Boolean)
  .map((sibling) => ({ instance, sibling })));

/* ------------------------------------------------- re-solving a sibling, independently */

const ruleOf = (prompt) => {
  const match = /^The graph of f\(x\) = (.+?)( for .+?)? is shown\. Describe (.+)\.$/.exec(String(prompt).replace(/−/g, '-'));
  assert.ok(match, `a graph sibling: ${prompt}`);
  return { rhs: match[1], restricted: Boolean(match[2]), asks: match[3] };
};
const evaluator = (rhs) => {
  const compiled = math.compile(rhs.replace(/\|([^|]*)\|/g, 'abs($1)').replace(/²/g, '^2').replace(/·/g, '*'));
  return (x) => compiled.evaluate({ x });
};
const pointOf = (text) => text.replace(/[()]/g, '').split(',').map(Number);
// "x-intercepts (0, 0) and (6, 0), zeros {0, 6}; …; axis x = 3; rises, then falls; range (-∞, 6]" → { 'x-intercepts': '(0, 0) and (6, 0)', … }
const clausesOf = (answer) => Object.fromEntries(String(answer).split('; ').map((clause) => {
  const match = /^([a-z][a-z -]*?) ([-−([{\dxy].*)$/i.exec(clause);
  return match ? [match[1], match[2].replace(/, zeros \{.*\}$/, '')] : [clause, null];
}));

test('the DOL #2 review\'s CW 1 and PR 1: a V on the whole real line gets a sibling V on the whole real line', () => {
  ['dol2r-cw-1', 'dol2r-pr-1'].forEach((id) => {
    const item = itemOf(DOL2, id);
    const siblings = siblingsOf(item);
    // CW 1 has fixed numbers; PR 1 is dealt from its family, so a dozen students are read.
    assert.ok(siblings.length >= (item.questionFamily ? 20 : 3), `${id}: siblings (${siblings.length})`);
    siblings.forEach(({ instance, sibling }) => {
      assert.ok(!instance.functionSpec?.domain, `${id}: the item's graph is on the whole real line`);
      const { rhs, restricted, asks } = ruleOf(sibling.prompt);
      assert.equal(restricted, false, `${id}: no closed interval — ${sibling.prompt}`);
      assert.match(rhs, /\|x( [+-] \d+)?\|/, `${id}: an absolute value V`);
      assert.doesNotMatch(asks, /domain/, `${id}: the domain, (−∞, ∞) for every V, is the item's own answer`);
      assert.match(asks, /the range$/, `${id}: the range is asked`);
      assert.ok(sibling.steps.every((step) => !/drawn from|closed dots|check the ends/.test(step)), `${id}: no end dots to read`);
      // Each clause, from the rule the prompt states.
      const f = evaluator(rhs);
      const clauses = clausesOf(sibling.answer);
      const vertex = pointOf(clauses['highest point'] || clauses['lowest point']);
      assert.equal(f(vertex[0]), vertex[1], `${id}: the vertex is on the V`);
      [-3, -1, 1, 3].forEach((dx) => assert.ok(clauses['highest point'] ? f(vertex[0] + dx) < vertex[1] : f(vertex[0] + dx) > vertex[1], `${id}: the vertex is the ${clauses['highest point'] ? 'highest' : 'lowest'} point`));
      assert.equal(clauses.axis, `x = ${vertex[0]}`);
      const range = clauses.range.replace(/−/g, '-');
      assert.equal(range, clauses['highest point'] ? `(-∞, ${vertex[1]}]` : `[${vertex[1]}, ∞)`, `${id}: the range runs from the vertex`);
      clauses['x-intercepts'].split(' and ').forEach((point) => assert.equal(f(pointOf(point)[0]), 0, `${id}: ${point} is on the x-axis`));
      assert.equal(f(0), pointOf(clauses['y-intercept'])[1], `${id}: the y-intercept`);
      // The guard every sibling passes: never the item's own answer.
      assert.ok(similarExampleIsSafe(instance, sibling), `${id}: safe`);
    });
  });
});

test('the practice reads a range on the whole real line in either notation', () => {
  const item = itemOf(DOL2, 'dol2r-cw-1');
  const practice = buildPracticeLikeThis(item, { seed: 0 });
  const range = practice.parts.find((part) => part.label === 'Range');
  assert.ok(range?.checkable, 'the range is a box that is checked');
  const [open, end, close] = /^([[(])(.+?)(\]|\))$/.exec(range.expected.replace(/−/g, '-')).slice(1);
  const [low, high] = end.split(',').map((piece) => piece.trim());
  const bound = low.includes('∞') ? Number(high) : Number(low);
  const inequality = low.includes('∞') ? `y\\le${bound}` : `y\\ge${bound}`;
  assert.equal(checkPracticePart(range, range.expected), PRACTICE_VERDICT.CORRECT, 'as written');
  assert.equal(checkPracticePart(range, inequality), PRACTICE_VERDICT.CORRECT, `${inequality}: the same numbers`);
  assert.equal(checkPracticePart(range, `${open === '[' ? '(' : open}${low},${high}${close === ']' ? ')' : close}`), PRACTICE_VERDICT.INCORRECT, 'the vertex left out');
  assert.equal(checkPracticePart(range, low.includes('∞') ? `x\\le${bound}` : `x\\ge${bound}`), PRACTICE_VERDICT.INCORRECT, 'a range is in y');
  // And the other way round: a range stated as an inequality takes the ray.
  const [part] = readPracticeAnswer('range y ≥ -12').parts;
  assert.deepEqual([part.label, part.expected, part.checkable], ['Range', 'y ≥ -12', true]);
  assert.equal(checkPracticePart(part, '[-12,\\infty)'), PRACTICE_VERDICT.CORRECT);
  assert.equal(checkPracticePart(part, '-12\\le y'), PRACTICE_VERDICT.CORRECT);
  assert.equal(checkPracticePart(part, '(-12,\\infty)'), PRACTICE_VERDICT.INCORRECT, '−12 itself is in the range');
  assert.equal(checkPracticePart(part, 'y\\ge-11'), PRACTICE_VERDICT.INCORRECT);
});

test('the same everywhere a graph on the whole real line asks for its range; a restricted graph keeps a restricted sibling', () => {
  // The District DOL #1 review's whole-line quadratics and exponentials.
  ['q_section-2_2_5', 'q_section-2_2_6', 'q_section-2_2_11', 'q_section-3_3_3', 'q_section-3_3_6'].forEach((id) => {
    const item = itemOf(DOL1, id);
    assert.ok(!item.functionSpec?.domain, `${id}: on the whole real line`);
    const sibling = buildSimilarWorkedExample(item);
    assert.equal(ruleOf(sibling.prompt).restricted, false, `${id}: ${sibling.prompt}`);
    assert.match(sibling.answer, /^range y [≥>≤<] -?\d+$/, `${id}: ${sibling.answer}`);
  });
  // A graph drawn on a closed interval that asks for its domain and range is practised on one.
  const restrictedItem = itemOf(DOL3, 'dol3-review-q01');
  assert.ok(restrictedItem.functionSpec?.domain, 'the item\'s graph is restricted');
  assert.equal(ruleOf(buildSimilarWorkedExample(restrictedItem).prompt).restricted, true);
});

test('the new siblings read in Spanish, every sentence', async () => {
  const pack = await loadLanguagePack('es');
  let texts = 0;
  [[DOL2, 'dol2r-cw-1'], [DOL2, 'dol2r-pr-1'], [DOL1, 'q_section-2_2_5'], [DOL1, 'q_section-2_2_11'], [DOL1, 'q_section-3_3_3']].forEach(([file, id]) => {
    siblingsOf(itemOf(file, id)).forEach(({ sibling }) => [sibling.prompt, ...sibling.steps, `Answer: ${sibling.answer}`].forEach((text) => {
      const result = translateWithPack(text, pack);
      assert.equal(result.coverage, TRANSLATION_COVERAGE.FULL, `${id}: ${text}`);
      texts += 1;
    }));
  });
  assert.ok(texts > 200, `${texts} texts`);
});
