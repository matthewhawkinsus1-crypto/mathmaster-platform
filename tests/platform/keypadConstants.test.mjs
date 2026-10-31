/*
 * π, e AND logₐ ONLY WHERE THE ITEM'S MATH USES THEM (TL23; walkthrough D-54:
 * an Algebra I equation step offered "π e logₐ" for f(x) = 6x).
 *
 * The rule reads the whole item — prompt, givens, every accepted answer, the
 * worked solution — and errs on keeping a key, so a key an answer needs is
 * never taken away. Only on practice: an assessment item keeps every key
 * (QuestionEngine below). Browser proof, both devices, practice and DOL:
 * tests/browser/toolAttemptOutcome.mjs ("π, e and logₐ").
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { keypadConstantsFor, keysForConstants } from '../../src/platform/interaction/keypadConstants.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const code = (path) => executableSource(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
const NONE = { pi: false, e: false, log: false };

test('an item that uses none of them offers none of them', () => {
  // The walkthrough's equation step, and an ordinary linear item.
  assert.deepEqual(keypadConstantsFor({ type: 'relationshipModel', prompt: 'Popcorn costs $6 a bag. Write f(x) for the cost of x bags.', correctAnswer: 'f(x)=6x' }), NONE);
  assert.deepEqual(keypadConstantsFor({ id: 'e1', type: 'literal', prompt: 'Solve 2x + 3 = 7.', correctAnswer: '2' }), NONE, 'an id is not math');
  // Not math the student writes: a colour, a tolerance, a generator placeholder.
  assert.deepEqual(keypadConstantsFor({ prompt: 'Graph y = {{m}}x + {{e}}.', graph: { functions: [{ stroke: '#1a73e8' }] }, tolerance: 1e-6 }), NONE);
});

test('a key the item\'s math uses stays — wherever in the item it is used', () => {
  assert.equal(keypadConstantsFor({ prompt: 'A circle has radius 3. What is its area? Leave your answer in terms of π.', correctAnswer: '9π' }).pi, true);
  assert.equal(keypadConstantsFor({ prompt: 'Give the exact circumference.', correctAnswer: '6pi' }).pi, true, 'only the answer uses it, spelled pi');
  assert.equal(keypadConstantsFor({ prompt: 'Find the area.', acceptedAnswers: ['36\\pi'] }).pi, true);
  // e: alone, raised to a power wherever it stands, named.
  assert.equal(keypadConstantsFor({ prompt: 'The balance is A = Pe^{rt}. Find A after 2 years.' }).e, true);
  assert.equal(keypadConstantsFor({ prompt: 'Evaluate e to two decimal places.' }).e, true);
  assert.equal(keypadConstantsFor({ prompt: 'Money compounded continuously at 5%.' }).e, false, 'compounded is not "continuous compounding"…');
  assert.equal(keypadConstantsFor({ prompt: 'Interest under continuous compounding at 5%.' }).e, true, '…this is');
  // logₐ: an answer only a logarithm writes keeps it (solve 3^x = 20).
  const exact = keypadConstantsFor({ prompt: 'Solve 3^x = 20. Give the exact answer.', correctAnswer: 'x=\\log_3(20)' });
  assert.deepEqual(exact, { pi: false, e: false, log: true });
  assert.equal(keypadConstantsFor({ prompt: 'Solve.', acceptedAnswers: ['ln(20)/ln(3)'] }).log, true);
  assert.equal(keypadConstantsFor({ prompt: 'Analyze the logarithmic parent function.' }).log, true);
  // Words that only contain the letters do not count.
  assert.deepEqual(keypadConstantsFor({ prompt: 'Pick the blog post with the logic puzzle; the kiln and the apiary.' }), NONE);
});

test('no question to read: every key stays', () => {
  assert.equal(keypadConstantsFor(null), null);
  assert.equal(keypadConstantsFor(undefined), null);
  assert.equal(keypadConstantsFor('9π'), null);
});

test('only the tagged constant keys are left off, and only where the item says so', () => {
  const pi = { label: 'π', constant: 'pi' };
  const e = { label: 'e', constant: 'e' };
  const log = { label: 'logₐ', constant: 'log' };
  const root = { label: '√' };
  const neededPi = { label: 'π', command: '\\pi' }; // a key a field declares it needs: untagged
  assert.deepEqual(keysForConstants([pi, e, log, root, neededPi], NONE), [root, neededPi]);
  assert.deepEqual(keysForConstants([pi, e, log, root], { pi: true, e: false, log: true }), [pi, log, root]);
  assert.deepEqual(keysForConstants([pi, e, log, root], null), [pi, e, log, root], 'no answer from the host: all of them');
});

test('MathInput leaves them off the profile keys before extra and needed keys are added', () => {
  const input = code('src/MathInput.jsx');
  const basic = region(input, 'const BASIC_KEYS = [', '];', 'BASIC_KEYS');
  assert.match(basic, /label: 'π', [^\n]*constant: 'pi'/);
  assert.match(basic, /label: 'e', [^\n]*constant: 'e'/);
  assert.match(basic, /label: 'logₐ', [^\n]*constant: 'log'/);
  assert.equal((basic.match(/constant:/g) || []).length, 3, 'no other basic key is a constant');
  const tools = region(input, 'const tools = useMemo(() => {', '}, [toolProfile', 'the keypad');
  assert.match(tools, /mergeToolKeys\(\s*withExtraKeys\(keysForConstants\(getToolKeys\(toolProfile, \{ contextSymbols, functionNotationKeys \}\), keypadConstants\), extraKeys\),\s*requiredTools,/, 'desktop');
  assert.match(tools, /profileKeys: withExtraKeys\(keysForConstants\(getToolKeys\(toolProfile, \{ isMobile: true, contextSymbols, functionNotationKeys \}\), keypadConstants\), extraKeys\),/, 'phone');
  assert.match(input, /const keypadConstants = useKeypadConstants\(\);/);
});

test('QuestionEngine answers for its item only on practice; an assessment keeps every key', () => {
  const engine = code('src/QuestionEngine.jsx');
  assert.match(engine, /const keypadConstants = useMemo\(\s*\(\) => \(toolHintsAllowed && showOutcomeFeedback \? keypadConstantsFor\(processedQuestion\) : null\),/);
  // Around the question's whole tree: the provider holds the root element,
  // and nothing of the question renders outside it.
  const tree = region(engine, '<WorkViewUndoProvider register={setUndoController}', '</WorkViewUndoProvider>', 'the question tree');
  assert.match(tree, /resetKey=\{[^\n]*\}>\s*<KeypadConstantsProvider constants=\{keypadConstants\}>\s*<div\s+ref=\{questionEngineRef\}/, 'opens around the root element');
  assert.match(tree, /<\/div>\s*<\/KeypadConstantsProvider>\s*$/, 'and closes after it');
  // Practice like this: another problem's numbers, so every key.
  const practice = code('src/platform/supports/workedExample/PracticeLikeThis.jsx');
  assert.match(region(practice, 'export default function PracticeLikeThis(', '\n}\n', 'PracticeLikeThis'), /return \(\s*<KeypadConstantsProvider constants=\{null\}>\s*<section[\s\S]*<\/section>\s*<\/KeypadConstantsProvider>\s*\);\s*$/);
});
