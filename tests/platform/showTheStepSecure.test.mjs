/*
 * SHOW THE STEP ON A SECURE TEST, CORRECTIONS AND MY MATH PATH (SP-4b;
 * docs/platform/SHOWING_THE_PROCESS.md section 5).
 *
 * These screens draw a part's answer box themselves, with no question engine
 * around it. They open its step as the assignment's runner does. What these
 * tests hold:
 *   1. THE STEP IS ISSUED with the field's public copy, as { kind, count, of }
 *      and nothing else. `of` is stimulus, never a key, and the field's answer
 *      stays private.
 *   2. NO SCORE CHANGES. The step's line rides among the responses
 *      (`<id>::step`), and every verdict and score is the same with it, right
 *      or wrong. A step with no answer is still an unanswered item.
 *   3. THE SCREENS open the step with the same engine: a secure Test gives no
 *      verdict in words; Corrections and the Path say what is off and offer
 *      "Answer without this step"; See every part at once opens the box at
 *      once; the answer waits for the step. The step loads only for a part
 *      that has one.
 *   4. THE REVIEW shows the step in a row of its own, after its part.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkpointWorkKey } from '../../src/platform/supports/showTheStep/checkpointShape.js';
import { writeCheckpointWork } from '../../src/platform/supports/showTheStep/checkpointLine.js';
import { stepFieldId } from '../../functions/shared/showTheStepFields.mjs';
import { responseRowOrder } from '../../functions/shared/showTheStepRows.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';
import { fieldItem, mathPath, secureGrade, secureScore, simulatorGrade } from './helpers/followThroughFixtures.mjs';

const require = createRequire(import.meta.url);
const secureItems = require('../../functions/lib/secureItems.js');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = (file) => executableSource(readFileSync(path.join(ROOT, file), 'utf8'));

const POINTS = { kind: 'pickPoints', count: 2, of: '(0, 3) and (1, 1)' };
const withStep = (checkpoint = POINTS) => {
  const item = structuredClone(fieldItem);
  item.responseFields[0].checkpoint = checkpoint;
  return item;
};
const RIGHT_STEP = writeCheckpointWork('pickPoints', { points: [[0, 3], [1, 1]], rise: '-2', run: '1' });
const WRONG_STEP = writeCheckpointWork('pickPoints', { points: [[0, 3], [2, 2]], rise: '-1', run: '2' });

// ------------------------------------------------------------------ 1. issued

test('a secure or Path field is issued with its checkpoint, bounded, and its answer stays private', () => {
  const item = withStep({ ...POINTS, count: 2, answer: '-2', expected: '-2', note: 'x' });
  const issued = mathPath.buildSanitizedQuestion(item, {});
  assert.deepEqual(issued.responseFields[0].checkpoint, POINTS, 'kind, count and of, and nothing else');
  assert.equal(issued.responseFields[1].checkpoint, undefined, 'a field with none has none');
  assert.doesNotMatch(JSON.stringify(issued.responseFields), /"expected"|"answer"|"-2"/, 'no key reaches the screen');
  // A step in Step Algebra has no count; a count above the limit is the limit.
  assert.deepEqual(mathPath.buildSanitizedQuestion(withStep({ kind: 'stepMoves', count: 3, of: '4x + 7 = x - 8' }), {}).responseFields[0].checkpoint, { kind: 'stepMoves', of: '4x + 7 = x - 8' });
  assert.equal(mathPath.buildSanitizedQuestion(withStep({ kind: 'tableRow', count: 40, of: 'y = 2x + 1' }), {}).responseFields[0].checkpoint.count, 6);
  // Something that is not a checkpoint is not issued as one.
  for (const bad of [{ kind: 'drawAnything', of: 'y = x' }, { kind: 'pickPoints', of: '' }, { kind: 'pickPoints', of: 'x'.repeat(241) }, 'pickPoints', ['pickPoints']]) {
    assert.equal(mathPath.buildSanitizedQuestion(withStep(bad), {}).responseFields[0].checkpoint, undefined, JSON.stringify(bad));
  }
});

test('the private grading of an item is the same with a checkpoint on it', async () => {
  const [plain, stepped] = await Promise.all([mathPath.buildIssuePlan(fieldItem), mathPath.buildIssuePlan(withStep())]);
  assert.equal(stepped.issuable, true, stepped.reason);
  assert.deepEqual(stepped.privateGrading, plain.privateGrading);
});

// ------------------------------------------------------------------ 2. no score changes

test('a step among the responses changes no verdict and no score, right, wrong or skipped', async () => {
  const item = withStep();
  for (const responses of [{ slope: '-2', inequality: 'y > -2x + 3' }, { slope: '2', inequality: 'y > 2x + 3' }, { slope: '5', inequality: 'y < x' }, { slope: '', inequality: '' }]) {
    for (const line of [RIGHT_STEP, WRONG_STEP, writeCheckpointWork('pickPoints', { points: [[0, 3]], skipped: true })]) {
      const held = { ...responses, [stepFieldId('slope')]: line };
      const label = JSON.stringify(held);
      assert.deepEqual(await secureGrade(item, held), await secureGrade(fieldItem, responses), label);
      assert.equal(await secureScore(item, held), await secureScore(fieldItem, responses), label);
      assert.deepEqual(simulatorGrade(item, held), simulatorGrade(fieldItem, responses), label);
    }
  }
});

test('a step with no answer is still an unanswered item', async () => {
  assert.equal(await secureItems.payloadHasWork({ responses: { [stepFieldId('slope')]: RIGHT_STEP } }), false);
  assert.equal(await secureItems.payloadHasWork({ responses: { [stepFieldId('slope')]: RIGHT_STEP, slope: '-2' } }), true);
  assert.equal(await secureItems.payloadHasWork({ responses: { slope: '-2' } }), true);
  // The sandbox the browser drivers use reads it the same way.
  assert.match(region(source('src/services/secureExamService.js'), 'const mockHasWork', '\n);', 'the sandbox'), /!id\.endsWith\('::step'\)/);
});

test('the step is kept under the name the response carries it by', () => {
  assert.equal(checkpointWorkKey('slope'), stepFieldId('slope'));
});

// ------------------------------------------------------------------ 3. the screens

test('a secure Test and Corrections open the step above the field, with no verdict on a secure item', () => {
  const runtime = source('src/components/question/RichQuestionRuntime.jsx');
  // Loaded only for a field with a step, through the engine's module the item
  // already loads lazily (so no new chunk joins a first load).
  assert.match(runtime, /const StepForPart = lazy\(\(\) => import\('\.\.\/\.\.\/QuestionEngine\.jsx'\)\.then\(\(module\) => \(\{ default: module\.ShowTheStepForField \}\)\)\);/);
  assert.doesNotMatch(runtime, /^import .*(showTheStep\/(ShowTheStep|checkpointEngine)|QuestionEngine)/m);
  const item = region(runtime, 'const FieldItem = ', '\n};\n', 'the field item');
  // No verdict in words on a secure item, or anywhere feedback waits.
  assert.match(item, /const verdictsWithheld = policy\.secure \|\| !policy\.capabilities\?\.immediateFeedback;/);
  // See every part at once opens the box at once.
  assert.match(item, /const everyPartAtOnce = getStudentSupportPresentation\(studentSupportProfile\)\.everyPartAtOnce === true;/);
  assert.match(item, /const stepIsOpen = \(field\) => everyPartAtOnce \|\| !stepOf\(field\) \|\| [^;]*stepStatus\[field\.id\]\?\.open === true;/);
  // The field is not answered, nor the item ready, until the step lets the box open.
  assert.match(item, /const complete = fields\.every\(\(field\) => String\(responses\[field\.id\] \?\? ''\)\.trim\(\) && stepIsOpen\(field\)\)/);
  assert.match(item, /const fieldDone = \(field\) => [^\n]*&& stepIsOpen\(field\);/);
  // The step is the line beside the answer, saved as every response is.
  const step = region(item, '<StepForPart', '/>', 'the step');
  for (const wiring of [/value=\{String\(responses\[stepKey\] \?\? ''\)\}/, /onChange=\{\(line\) => updateResponse\(stepKey, line\)\}/, /verdictsWithheld=\{verdictsWithheld\}/, /optional=\{everyPartAtOnce\}/, /disabled=\{locked\}/]) {
    assert.match(step, wiring);
  }
  assert.match(item, /const stepKey = checkpointWorkKey\(field\.id\);/);
  // The answer control is drawn once the box is open.
  assert.match(item, /\{!boxOpen \? null : fieldChoices\.length \? fieldChoices\.map/);
  // A closed item draws no step.
  assert.match(item, /const stepOf = \(field\) => \(closed \? null : checkpointOf\(field\)\);/);
});

test('My Math Path opens the step, says what is off, and Check waits for it', () => {
  const fields = source('src/components/student/PathResponseFields.jsx');
  assert.match(fields, /const StepForPart = lazy\(\(\) => import\('\.\.\/\.\.\/QuestionEngine\.jsx'\)\.then\(\(module\) => \(\{ default: module\.ShowTheStepForField \}\)\)\);/);
  const step = region(fields, '<StepForPart', '/>', 'the step');
  // The Path says right or wrong, so the step does too (no verdictsWithheld).
  assert.doesNotMatch(step, /verdictsWithheld/);
  for (const wiring of [/value=\{String\(values\?\.\[stepKey\] \?\? ''\)\}/, /onChange=\{\(line\) => onChangeField\(stepKey, line\)\}/, /optional=\{stepsOptional\}/]) {
    assert.match(step, wiring);
  }
  assert.match(fields, /const box = stepIsOpen\(field\) \? fieldBox\(field, index\) : null;/);
  const player = source('src/components/student/PathSessionPlayer.jsx');
  assert.match(player, /const stepsOptional = getStudentSupportPresentation\(studentProfile\)\.everyPartAtOnce === true;/);
  assert.match(player, /const complete = pathResponseComplete\(fields, values\) && stepsReady;/);
  // What is sent is every value, the step's line among them.
  assert.match(region(player, 'const submit = async () => {', '\n  };', 'the Path submit'), /\{ responses: values \}/);
});

test('the step these screens load is the engine\'s: ShowTheStep, handed the Step Algebra workspace the engine holds', () => {
  const engine = source('src/QuestionEngine.jsx');
  assert.match(engine, /const LazyShowTheStep = lazy\(\(\) => import\('\.\/platform\/supports\/showTheStep\/ShowTheStep\.jsx'\)\);/);
  assert.match(engine, /const ShowTheStep = \(props\) => <LazyShowTheStep \{\.\.\.props\} StepByStepAlgebraCore=\{StepByStepAlgebraCore\} \/>;/);
  assert.match(engine, /^export const ShowTheStepForField = ShowTheStep;$/m);
});

test('an answer saved before the item opened is never locked behind redoing the step (another device)', () => {
  // The browser proof: secureExamNavigation.mjs, the step journey's "another
  // device" checks (a draft with answers and no step state).
  const item = region(source('src/components/question/RichQuestionRuntime.jsx'), 'const FieldItem = ', '\n};\n', 'the field item');
  // The fields answered when the item opened, read once from the saved draft.
  assert.match(item, /const \[answeredOnOpen\] = useState\(\(\) => new Set\(Object\.entries\(restoredFieldResponses\(initialResponsePayload\)\)/);
  assert.match(item, /\.filter\(\(\[id, value\]\) => !id\.endsWith\('::step'\) && String\(value \?\? ''\)\.trim\(\)\)/);
  // Its box is open…
  assert.match(item, /const stepIsOpen = \(field\) => everyPartAtOnce \|\| !stepOf\(field\) \|\| answeredOnOpen\.has\(field\.id\) \|\| stepStatus\[field\.id\]\?\.open === true;/);
  assert.match(region(item, '<StepForPart', '/>', 'the step'), /carriedOver=\{answeredOnOpen\.has\(field\.id\)\}/);
  // …and the step says it was not carried over: not done, not skipped, and no line is written for it.
  const step = source('src/platform/supports/showTheStep/ShowTheStep.jsx');
  assert.match(step, /const open = !source\.ok \|\| optional \|\| carriedOver \|\| /);
  assert.match(step, /carriedOver && !check\.done \? 'Your answer from before is kept\. Your step was not carried over/);
  // A Step Algebra workspace that opens with no moves (no draft on this
  // device) does not erase the moves the saved line records.
  const moves = region(step, 'function StepMoves(', '\n}\n', 'the moves step');
  assert.match(moves, /if \(lines\.length > 1\) heldMoves\.current = true;\n\s+else if \(!heldMoves\.current && String\(valueRef\.current \|\| ''\)\.trim\(\)\) return;/);
});

// ------------------------------------------------------------------ 4. the review

test('the released review shows a step in a row of its own after its part, named for what was done', () => {
  const fields = [{ id: 'slope', label: 'Slope' }, { id: 'inequality', label: 'Inequality', checkpoint: POINTS }];
  // The question's order, each step after its part, whatever order the record holds.
  assert.deepEqual(responseRowOrder({ 'inequality::step': RIGHT_STEP, inequality: 'y > -2x + 3', slope: '-2' }, fields), ['slope', 'inequality', 'inequality::step']);
  // A step whose part has no answer never drops out: its part keeps its place
  // (a "No answer" row), and the step follows it.
  assert.deepEqual(responseRowOrder({ slope: '-2', 'inequality::step': RIGHT_STEP }, fields), ['slope', 'inequality', 'inequality::step']);
  assert.deepEqual(responseRowOrder({ slope: '-2', inequality: '', 'inequality::step': RIGHT_STEP }, fields), ['slope', 'inequality', 'inequality::step']);
  // An empty step line is no work, and has no row; a step-shaped name no
  // checkpoint asked for is left where it was.
  assert.deepEqual(responseRowOrder({ slope: '-2', 'inequality::step': '' }, fields), ['slope']);
  assert.deepEqual(responseRowOrder({ 'slope::step': 'x', slope: '-2' }, fields), ['slope', 'slope::step']);
  const review = source('src/components/assessment/SecureExamReview.jsx');
  const rows = region(review, 'const responseRows = ', '\n};\n', 'the review rows');
  assert.match(rows, /return responseRowOrder\(responses, snapshotFields\)/);
  assert.match(rows, /label: stepRowLabel\(stepPart\.checkpoint\.kind, label\)/);
  // An unfinished answer keeps its note (#621) on its own row, in the same order.
  assert.match(rows, /const unfinished = Array\.isArray\(raw\) \? '' : unfinishedReviewNote\(raw, field \|\| null\);/);
  // The part with no answer says so, rather than being filtered out with its value.
  assert.match(rows, /if \(!value && stepParts\.has\(fieldId\) && String\(responses\[stepFieldId\(fieldId\)\] \?\? ''\)\.trim\(\)\) \{\n\s+return \{ id: fieldId, label: field\?\.label \|\| 'Your response', value: 'No answer', math: false \};/);
});
