/*
 * THE AUDITED BANK DOES NOT PROMISE A VISUAL IT DOES NOT SHOW (CT01 / E3-12).
 *
 * Of the 1,000 audited CCMR items eligible for an Honors selection, 164 failed
 * MathMaster's one-question check once converted, and the selection (#501) skips
 * them. 128 of those declare a test-prep domain none of their TEKS crosswalks to
 * (a classification question, left as it is). The other 38 had a defect in the item
 * itself:
 *
 *   31  "The graph of y = 2x + 1 …", "lies on the graph", "the vertex of the graph
 *       of f": a graph the question does not contain, when the equation is the
 *       whole of what the student is given.
 *    6  "the table" of a frequency table or of values written out in the prompt
 *       (and one workshop whose "Each table requires 4 units of wood" is furniture).
 *    1  an ordered-pair answer whose response profile was spelled "orderedpair"
 *       when converted, which is no profile, so every version was refused.
 *
 * Each now names what it means (the line, the parabola, the curve, the counts) or
 * is spelled the way the contract spells it. Only wording moved. What a stored
 * answer's meaning rests on is pinned below (fixtures/ccmrVisualPromisePins.json,
 * read from the seed before the repair): the draw, the keyed response fields, the
 * choice ids and every derived expression. The wording itself is free to improve.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { validateQuestionSemantics } from '../../src/platform/contract/semanticValidation.js';
import { validateQuestionInteractionContracts } from '../../src/platform/interaction/interactionContract.js';
import { generatePathInstance } from '../../functions/shared/pathQuestionGeneration.mjs';
import { matchesFieldAnswer } from '../../functions/shared/answerUtils.mjs';

const require = createRequire(import.meta.url);
const bank = require('../../functions/lib/ccmrAssignmentBank.js');

const read = (relPath) => readFileSync(new URL(`../../${relPath}`, import.meta.url), 'utf8');
const PINS = JSON.parse(read('tests/platform/fixtures/ccmrVisualPromisePins.json')).items;
const REPAIRED = Object.keys(PINS);

const documents = new Map();
for (const framework of ['digitalSAT', 'act', 'tsia2']) {
  const payload = JSON.parse(read(`functions/seeds/pathQuestionBank/${framework}_pathQuestionBank_seed.json`));
  for (const document of payload.items || payload.documents || []) documents.set(document.id, document);
}
const documentOf = (id) => {
  const document = documents.get(id);
  assert.ok(document, `${id} is in the bank`);
  return document;
};
const eligible = (document) => document.active !== false
  && document.assessmentContext?.examStyle === true
  && document.ccmrAuthenticLanguage?.authored === true;

const stable = (value) => (Array.isArray(value)
  ? `[${value.map(stable).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`
    : JSON.stringify(value));
const sha = (text) => createHash('sha256').update(text).digest('hex');

const compileInPractice = (document) => compileAuthoringIntentV5({
  schemaVersion: 5,
  assignment: { title: 'Bank item', courseId: document.courseId || 'algebra2' },
  sections: [{ id: 'practice', role: 'practice', title: 'Practice', questions: [bank.bankDocumentToV5Intent(document)] }],
}).package.sections[0].questions[0];

const VISUAL_PROMISE = /refers to (?:a graph|a table|a number line|a diagram) in its prompt/;

test('no audited item refers to a graph, a table, a number line or a diagram it does not show, and every response profile is the contract’s own', () => {
  const items = [...documents.values()].filter(eligible);
  assert.ok(items.length >= 1000, `${items.length} eligible audited items are read`);
  const found = [];
  items.forEach((document) => {
    const question = compileInPractice(document);
    validateQuestionSemantics(question, { label: 'Question 1' }).errors
      .filter((message) => VISUAL_PROMISE.test(message))
      .forEach((message) => found.push(`${document.id}: ${message.slice(0, 100)}`));
    validateQuestionInteractionContracts(question, { label: 'Question 1' }).errors
      .forEach((message) => found.push(`${document.id}: ${message.slice(0, 140)}`));
  });
  assert.deepEqual(found, []);
});

// What a stored answer's meaning rests on: the draw (parameters), what is asked and keyed (response fields), the
// choices' ids in order, the version and the format. The wording around them may improve; these may not move.
const keyShape = (document) => ({
  familyVersion: document.familyVersion,
  assessmentItemFormat: document.assessmentItemFormat,
  parameters: document.generator?.parameters ?? null,
  responseFields: document.responseFields ?? null,
  choiceIds: (document.choices || []).map((choice) => choice.id),
});

test('the 38 repaired items are all still in the bank, active (repaired, not retired), and none changed what its key means', () => {
  assert.equal(REPAIRED.length, 38, '31 graph + 6 table + 1 ordered pair');
  const framework = (id) => PINS[id].exam;
  assert.deepEqual(
    ['digitalSAT', 'act', 'tsia2'].map((exam) => REPAIRED.filter((id) => framework(id) === exam).length),
    [29 + 1, 2, 6],
    'where they live: 29 reworded + the ordered pair in Digital SAT, 2 ACT, 6 TSIA2',
  );
  REPAIRED.forEach((id) => {
    const document = documentOf(id);
    assert.notEqual(document.active, false, `${id} is repaired, not retired`);
    assert.equal(sha(stable(keyShape(document))), PINS[id].keyShape, `${id}: the draw, the keyed response fields and the choice ids are as they were`);
    // Every derived expression it had still computes the same thing; a later edit may add new ones.
    Object.entries(PINS[id].derived).forEach(([name, expression]) => {
      assert.equal(document.generator?.derived?.[name], expression, `${id}: derived ${name} is as it was`);
    });
  });
});

test('every repaired item draws a prompt with no placeholder left, and still names what the student works from', () => {
  REPAIRED.forEach((id) => {
    const document = documentOf(id);
    const question = compileInPractice(document);
    for (let draw = 0; draw < 10; draw += 1) {
      const { question: drawn, reason } = generatePathInstance(question, `ct01-${id}-${draw}`);
      assert.ok(drawn, `${id} draw ${draw}: ${reason}`);
      assert.doesNotMatch(drawn.prompt, /\{\{|\}\}|undefined|NaN|\[object|null/, `${id}: ${drawn.prompt}`);
      assert.doesNotMatch(drawn.prompt, /\b(?:the|this|each|following)\s+(?:graph|scatter\s*plot|table)\b/i, `${id} promises no figure: ${drawn.prompt}`);
    }
  });
});

test('the x-intercept item no longer prints its own answer: the point is (x_0, 0) and the student finds x_0', () => {
  const question = compileInPractice(documentOf('mm_sat_A_3C_2_x-intercept-equation_v21'));
  const seen = new Set();
  for (let draw = 0; draw < 40; draw += 1) {
    const { question: drawn, parameters } = generatePathInstance(question, `ct01-x-intercept-${draw}`);
    assert.ok(drawn, `draw ${draw}`);
    const key = String(parameters.x0);
    seen.add(key);
    assert.match(drawn.prompt, /^The line \$y=-?\d+x [+-] ?\d+\$ intersects the \$x\$-axis at \$\(x_0,0\)\$\. What is the value of \$x_0\$\?$/, drawn.prompt);
    // The old stem was "… at $(4,0)$. What is the value of $x_0$?": the answer, handed over.
    assert.ok(!drawn.prompt.includes(`(${key},0)`), `the key ${key} is not printed in the stem: ${drawn.prompt}`);
    // And the key is still the x-intercept, the only choice that makes y = 0.
    assert.equal(drawn.answerFields[0].answer.replace(/\$/g, ''), key, 'the keyed choice is the x-intercept');
  }
  assert.ok(seen.size > 8, `the draws cover ${seen.size} different intercepts`);
});

test('the ordered-pair item keeps the contract’s spelling, passes every check, and its key solves the printed system', () => {
  const document = documentOf('mm_sat_A_5C_2_elimination_pair_v21');
  assert.equal(document.responseFields[0].inputProfile, 'orderedPair', 'the bank spells the profile the way the contract does');
  const intent = bank.bankDocumentToV5Intent(document);
  assert.equal(intent.answerFields[0].inputProfile, 'orderedPair', 'and conversion hands it on as written (it used to say "orderedpair")');
  const question = compileInPractice(document);
  assert.deepEqual(validateQuestionInteractionContracts(question, { label: 'Question 1' }).errors, []);
  assert.deepEqual(validateQuestionSemantics(question, { label: 'Question 1' }).errors, []);

  const equation = /system \$(\d+)x\+(\d+)y=(-?\d+)\$ and \$(\d+)x\+(\d+)y=(-?\d+)\$/;
  for (let draw = 0; draw < 24; draw += 1) {
    const { question: drawn, reason } = generatePathInstance(question, `ct01-pair-${draw}`);
    assert.ok(drawn, `draw ${draw}: ${reason}`);
    const [, a, b, r1, c, d, r2] = equation.exec(drawn.prompt).map(Number);
    const key = /^\((-?\d+),(-?\d+)\)$/.exec(drawn.answerFields[0].answer);
    assert.ok(key, `the key reads as a pair: ${drawn.answerFields[0].answer}`);
    const [x, y] = [Number(key[1]), Number(key[2])];
    // The key is the system's solution, worked out here from the printed numbers.
    assert.equal(a * x + b * y, r1, `${drawn.prompt} → ${key[0]}`);
    assert.equal(c * x + d * y, r2, `${drawn.prompt} → ${key[0]}`);
    assert.notEqual(a * d - b * c, 0, 'the system has one solution');
    // The grader takes the pair the ways a student writes it, in the order asked, and nothing else.
    const field = drawn.answerFields[0];
    [`(${x},${y})`, `(${x}, ${y})`, `( ${x} , ${y} )`, `\\left(${x},${y}\\right)`].forEach((typed) => assert.equal(matchesFieldAnswer(typed, field), true, `${typed} is right`));
    assert.equal(matchesFieldAnswer(`(${x + 1},${y})`, field), false, 'a different x');
    assert.equal(matchesFieldAnswer(`(${x},${y + 1})`, field), false, 'a different y');
    if (x !== y) assert.equal(matchesFieldAnswer(`(${y},${x})`, field), false, 'the pair in the other order');
  }
});

test('the SAT aggregate kept by hand says the same thing as the seed for every repaired Digital SAT item', () => {
  const aggregate = new Map(JSON.parse(read('drafts/digitalSAT.v2.1.json')).documents.map((document) => [document.id, document]));
  // The aggregate lags the sources on the |coef and |term display filters (#492); the words are what must agree.
  const words = (prompt) => prompt.replace(/\{\{([^}|]+)\|[a-z]+\}\}/g, '{{$1}}');
  let compared = 0;
  REPAIRED.filter((id) => PINS[id].exam === 'digitalSAT').forEach((id) => {
    const held = aggregate.get(id);
    assert.ok(held, `${id} is in drafts/digitalSAT.v2.1.json`);
    assert.equal(words(held.prompt), words(documentOf(id).prompt), `${id}: the aggregate and the seed word it the same`);
    compared += 1;
  });
  assert.equal(compared, 30);
});
