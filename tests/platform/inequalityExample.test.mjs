/*
 * THE EXAMPLE IN AN EMPTY INEQUALITY BOX (F-GRAPH-IN-WORDS, PR #537
 * walkthrough; the November build's remaining work).
 *
 * A typed inequality box with no placeholder of its author's showed
 * "0 ≤ x ≤ 4" (answerFormatHints.js, and MultiAnswerGrader's own copy of it):
 * a compound inequality in one variable, the wrong shape beside "write each
 * statement as an inequality, where x is her two-point shots and y her
 * three-point shots". And numbers can be an answer: the authoring contract
 * asks for domains written just so, and a Path family draws 0 <= x <= 4 as
 * its key. Now:
 *
 *   - where what the student reads (the prompt and the field's label, never
 *     the key) names both x and y, the example is "y ≥ mx + b";
 *   - elsewhere "a ≤ x ≤ b";
 *   - neither is any item's answer, in any bank or any version of any lesson;
 *   - a secure field keeps its neutral profile: no example at all.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describeBoxPlaceholder, exampleFor, readsXAndY } from '../../src/platform/interaction/answerFormatHints.js';
import { secureAnswerEntryFor } from '../../src/platform/assessment/secureAnswerEntry.js';
import { answerCandidatesForField } from '../../src/answerUtils.js';
import { compiled, constraintText, versionsOf } from './helpers/lessonFileChecks.mjs';
import { gradeMultiAnswerResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { sameLinearInequality } from '../../functions/shared/linearInequalityEquivalence.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TWO = 'y ≥ mx + b';
const ONE = 'a ≤ x ≤ b';
// What the boxes show, as the code has it: the corpus checks below read these.
const SHOWN = [exampleFor('inequality', { twoVariables: true }), exampleFor('inequality')];

test('an inequality box shows an inequality in x and y when the prompt or the label names both, else one in a single variable', () => {
  const box = (prompt, label, extra = {}) => describeBoxPlaceholder({ id: 'answer', label, answerFormat: 'inequality', ...extra }, { prompt }).example;
  // Statements about a situation in x and y (L4 CW 5): the prompt names both.
  assert.equal(box('Write each statement about Kai’s game as an inequality, where x is her two-point shots and y her three-point shots.', 'She scores at least 20 points.'), TWO);
  // In the prompt's mathematics, a coefficient and a product included.
  assert.equal(box('Check both points in the system $y \\ge -x + 2$ and $y < 3x - 1$.', 'Inequality'), TWO);
  assert.equal(box('A linear inequality has boundary line 3x − 4y = 12.', 'Standard form'), TWO);
  // A part's name is not a variable: "(b)" and "Graph a" leave it to the prompt.
  assert.equal(box('Let x and y be the two numbers. (b) Twice the first number minus the second number is more than 4.', '(b)'), TWO);
  assert.equal(box('Let x and y be the two numbers.', 'Graph a'), TWO);
  // A name in the label is not a letter: "César" names no C.
  assert.equal(box('The table shows minutes for calls within the United States, x, and calls to Mexico, y.', 'Inequality for the minutes César can use'), TWO);
  // A label that names its own variable asks about that one, whatever the prompt is written in.
  assert.equal(box('For which values of k is the point (2, 3) a solution of y > kx − 1?', 'Values of k'), ONE);
  assert.equal(box('Use the car-rental models y = 0.25x + 40 (Company A) and y = 0.4x + 25 (Company B).', 'The miles x for which Company A costs less than Company B'), ONE);
  assert.equal(box('Use the graph of $f(b) = 3.75b + 25$ and the line $y = 1600$.', 'An inequality for the number of boxes, b'), ONE);
  // One variable, or none, in what the student reads.
  assert.equal(box('Solve $3x + 4 > 19$.', 'Solution set'), ONE);
  assert.equal(box('Write the system the graph shows.', 'Inequality for the solid boundary'), ONE);
  // An article and a pronoun are words.
  assert.equal(readsXAndY({ prompt: 'I think a line is y = 2x.', label: 'A guess' }), true);
  assert.equal(readsXAndY({ prompt: 'Find the maximum.', label: '' }), false, '"max" holds an x, "y" in "yes" is a word');
});

test('the shape comes from what the student reads, never the key; an author\'s placeholder still wins', () => {
  const prompt = 'Let x and y be the two numbers.';
  // The same box with keys of either shape shows the same example.
  for (const key of ['x + y <= 12', 'k < 2', '0 <= x <= 4', 'y >= mx + b']) {
    const field = { id: 'answer', label: 'Inequality', answerFormat: 'inequality', answer: key, acceptedAnswers: [key] };
    assert.equal(describeBoxPlaceholder(field, { prompt }).example, TWO, key);
    assert.equal(describeBoxPlaceholder(field, { prompt: 'Solve the inequality.' }).example, ONE, key);
  }
  // A box whose kind implies an inequality (MultiAnswerGrader's inferred format) reads the same way.
  assert.deepEqual(describeBoxPlaceholder({ id: 'answer', label: 'Inequality' }, { inferredFormat: 'inequality', prompt }), { placeholder: TWO, example: TWO });
  assert.deepEqual(describeBoxPlaceholder({ id: 'answer', label: 'Inequality' }, { inferredFormat: 'inequality' }), { placeholder: ONE, example: ONE });
  assert.deepEqual(describeBoxPlaceholder({ id: 'answer', answerFormat: 'inequality', placeholder: 'y ≥ 3x + 5' }, { prompt }), { placeholder: 'y ≥ 3x + 5', example: '' });
  // Other shapes have one example whatever the student reads.
  assert.equal(describeBoxPlaceholder({ id: 'answer', answerFormat: 'orderedPair' }, { prompt }).example, '(2, -5)');
  assert.equal(describeBoxPlaceholder({ id: 'zeros' }, { inferredFormat: 'set', prompt }).example, '{1, 2, 3}');
  assert.equal(exampleFor('inequality'), ONE);
  assert.equal(exampleFor('inequality', { twoVariables: true }), TWO);
  assert.equal(exampleFor('orderedPair', { twoVariables: true }), '(2, -5)');
});

test('the multi-answer box asks for its example with the prompt the student reads', () => {
  const source = executableSource(readFileSync(path.join(ROOT, 'src/MultiAnswerGrader.jsx'), 'utf8'));
  const call = region(source, 'const box = describeBoxPlaceholder(field, {', '});', 'the box\'s example');
  assert.match(call, /inferredFormat: shouldUseSetInput\(field\) \? 'set' : shouldUseInequalityInput\(field\) \? 'inequality' : ''/);
  assert.match(call, /\bprompt,?\n/);
  // `prompt` is the question's own, the text above the boxes.
  assert.match(source, /const \{ prompt, answerFields = NO_FIELDS \} = question;/);
  assert.match(source, /<QuestionPrompt>\{prompt \|\| 'Enter an answer for every part\.'\}<\/QuestionPrompt>/);
});

/*
 * NO ITEM'S ANSWER: every lesson the platform ships, every version a class of
 * 32 receives, graded as MultiAnswerGrader would grade a student who typed the
 * example its box shows; every constraint a student builds in the Systems
 * Workspace; and every key in every bank, as text.
 */
const LESSONS = path.join(ROOT, 'teacher-import-jsons');
const filesUnder = (directory, extension) => readdirSync(directory).flatMap((name) => {
  const file = path.join(directory, name);
  if (statSync(file).isDirectory()) return filesUnder(file, extension);
  return name.endsWith(extension) ? [file] : [];
});
const RELATION = /[<>≤≥]/;
// As MultiAnswerGrader decides a box is an inequality box (shouldUseInequalityInput).
const inequalityBox = (field) => (
  /inequalit/i.test(String(field.answerFormat || field.inputContract?.format || field.notation || field.inputMode || field.inputProfile || field.type || ''))
  || /inequalit/i.test(String(field.label || field.prompt || ''))
  || answerCandidatesForField(field).some((value) => RELATION.test(String(value)))
);
const typedField = (field) => !(field.options || field.choices || field.type === 'choice' || field.inputProfile === 'choice');

test('neither example is any lesson item\'s answer, in any version; and a box shows two variables only where its answer has them', () => {
  const lessons = filesUnder(LESSONS, '.json');
  assert.ok(lessons.length >= 40, `${lessons.length} lesson files`);
  let boxes = 0;
  let versions = 0;
  let twoVariableBoxes = 0;
  const wrongShape = [];
  for (const file of lessons) {
    const { questions } = compiled(readFileSync(file, 'utf8'));
    for (const question of questions) {
      for (const version of versionsOf(question)) {
        versions += 1;
        if (version.type === 'multiAnswer') {
          for (const field of (version.answerFields || []).filter(typedField)) {
            if (!inequalityBox(field)) continue;
            boxes += 1;
            for (const example of SHOWN) {
              const part = gradeMultiAnswerResponse(version, { [field.id]: example }).parts.find((entry) => entry.id === field.id);
              assert.equal(part?.isCorrect, false, `${version.questionId} ${field.id} accepts "${example}"`);
            }
            // What the box shows, beside the shape of its key (read here, in the test, only).
            const shown = describeBoxPlaceholder(field, { inferredFormat: 'inequality', prompt: version.prompt }).example;
            if (shown === SHOWN[0]) {
              twoVariableBoxes += 1;
              const key = String(field.answer ?? '');
              if (!(/(?<![A-Za-z])x(?![A-Za-z])/.test(key) && /(?<![A-Za-z])y(?![A-Za-z])/.test(key))) wrongShape.push(`${version.questionId} ${field.id}: ${key}`);
            }
          }
        }
        if (version.type === 'systemsWorkspace') {
          const constraints = version.expectedConstraints || version.modeling?.expectedConstraints || [];
          for (const graphed of [...(version.sourceConstraints || []), ...constraints.map(constraintText)]) {
            for (const example of SHOWN) assert.equal(sameLinearInequality(example, String(graphed)), false, `${version.questionId}: a student builds ${graphed}`);
          }
        }
      }
    }
  }
  assert.ok(versions > 5000 && boxes > 500, `${versions} versions, ${boxes} inequality boxes`);
  assert.deepEqual(wrongShape, [], 'an inequality in x and y is shown only where the answer is one');
  // Algebra I M3 T2's statements in x and y (L4, L5) are where it is shown.
  assert.ok(twoVariableBoxes >= 30, `${twoVariableBoxes} boxes show an inequality in x and y`);
});

// Every value a bank or a lesson keys a response with, as text: no key is either example.
const KEY_NAMES = new Set(['answer', 'answers', 'accepted', 'acceptedAnswers', 'expected', 'correct', 'correctAnswer', 'correctRange', 'correctDomain', 'domain', 'range', 'inequality', 'inequalityText', 'sourceConstraints', 'value', 'expression']);
// (The relations first: "\ge mx" is ≥ only while its space is there.)
const spelled = (text) => String(text).replace(/≤|\\leq?(?![A-Za-z])/g, '<=').replace(/≥|\\geq?(?![A-Za-z])/g, '>=').replace(/\s+/g, '');
// Each example as a key would spell it, either way round (y ≥ mx + b is mx + b ≤ y).
const FLIP = { '<=': '>=', '>=': '<=', '<': '>', '>': '<' };
const bothWays = (example) => {
  const forward = spelled(example);
  return [forward, forward.split(/(<=|>=|<|>)/).reverse().map((part) => FLIP[part] || part).join('')];
};
const EXAMPLES = new Set(SHOWN.flatMap(bothWays));

test('no bank and no lesson keys anything with either example', () => {
  const found = [];
  let keys = 0;
  const walk = (node, file) => {
    if (Array.isArray(node)) { node.forEach((entry) => walk(entry, file)); return; }
    if (!node || typeof node !== 'object') return;
    for (const [name, value] of Object.entries(node)) {
      if (KEY_NAMES.has(name)) {
        for (const key of (Array.isArray(value) ? value : [value]).filter((entry) => typeof entry === 'string')) {
          keys += 1;
          if (EXAMPLES.has(spelled(key))) found.push(`${path.relative(ROOT, file)}: ${name} ${key}`);
        }
      }
      walk(value, file);
    }
  };
  for (const tree of ['teacher-import-jsons', 'drafts', 'functions/seeds', 'seed']) {
    for (const file of filesUnder(path.join(ROOT, tree), '.json')) walk(JSON.parse(readFileSync(file, 'utf8')), file);
  }
  assert.ok(keys > 30000, `${keys} keys read`);
  assert.deepEqual(found, []);
  // The reader finds a key when one is there, in any of its spellings.
  assert.deepEqual([...EXAMPLES], ['y>=mx+b', 'mx+b<=y', 'a<=x<=b', 'b>=x>=a']);
  assert.ok(EXAMPLES.has(spelled('y \\ge mx + b')) && EXAMPLES.has(spelled('mx + b \\le y')) && EXAMPLES.has(spelled('a≤x≤b')));
});

test('a secure field keeps its neutral profile: no example, whatever its prompt names', () => {
  const prompt = 'Let x be the number of adult tickets and y the number of student tickets.';
  for (const inputProfile of ['inequality', 'expression', 'equation', 'number']) {
    const entry = secureAnswerEntryFor({ id: 'answer', label: 'Inequality', inputProfile }, { prompt });
    assert.equal(entry.placeholder, undefined, inputProfile);
    assert.equal(entry.example, undefined, inputProfile);
    assert.doesNotMatch(entry.hint, /≤ x ≤|mx|for example/i, inputProfile);
  }
  // Its editor shows nothing in an empty box; its text box only the server's own placeholder.
  const field = executableSource(readFileSync(path.join(ROOT, 'src/components/assessment/SecureMathAnswerField.jsx'), 'utf8'));
  assert.doesNotMatch(field, /answerFormatHints/);
  assert.doesNotMatch(region(field, 'function MathEditor(', 'function TextEditor('), /placeholder/);
  assert.match(field, /placeholder=\{String\(field\?\.placeholder \|\| ''\)\}/);
});
