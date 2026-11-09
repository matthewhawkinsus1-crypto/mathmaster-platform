/*
 * WHERE THE VERDICT IS WITHHELD, THE KEYPAD SAYS NOTHING ABOUT THE ANSWER
 * (N56, the PR #537 walkthrough's notes).
 *
 * On the radicals exit ticket the keypad offered m, p, o and w on a problem
 * in x and y, and on "write the inequality for graphs a, b and c" the
 * "Needed for this answer" row showed a fraction key only on the boxes whose
 * answer has a fraction. Both came from the key: the import's reading of it
 * (requiredSymbols, which read the template filter {{m|pow}} as letters) and
 * MultiAnswerGrader's own reading of its accepted answers.
 *
 * Now, on an exit ticket, a quiz or a test before its release
 * (withheldVerdictKeypad.js), the box follows the secure-field rule: no key
 * from the key, the secure profile's keys, the letters the student reads.
 * Practice and classwork keep their scaffold. Nothing graded changes, and
 * every exit ticket's key in every lesson stays typeable on a phone.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { startShallowLoader } from './helpers/shallowComponent.mjs';
import { compiled, readRepoFile, versionsOf } from './helpers/lessonFileChecks.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';
import { inferRequiredAnswerSymbols } from '../../src/platform/interaction/answerEntryTools.js';
import { buildMobileMathTools } from '../../src/platform/interaction/mobileKeypadPolicy.js';
import { declaredKeypadProfile, withheldVerdictKeys } from '../../src/platform/interaction/withheldVerdictKeypad.js';
import { SECURE_PROFILE_KEYS } from '../../src/platform/assessment/secureAnswerEntry.js';
import { answerCandidatesForField } from '../../src/answerUtils.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let shallow = null;
let ssr = null;
before(async () => {
  shallow = await startShallowLoader();
  const { createServer } = await import('vite');
  ssr = await createServer({ server: { middlewareMode: true, ws: false, hmr: false, watch: null }, appType: 'custom', logLevel: 'silent' });
});
after(async () => {
  await shallow?.close();
  await ssr?.close();
});

// What MultiAnswerGrader hands each of its math boxes, on one render (its
// hooks run once: helpers/shallowComponent.mjs), and the state it publishes.
const boxesOf = async (question, verdictsWithheld) => {
  const MathInput = (await shallow.ssrLoadModule('/src/MathInput.jsx')).default;
  const Grader = (await shallow.ssrLoadModule('/src/MultiAnswerGrader.jsx')).default;
  const published = [];
  const tree = Grader({ question, onStateChange: (state) => published.push(state), onUndoStateChange() {}, feedback: null, draftKey: null, verdictsWithheld });
  const boxes = [];
  const walk = (node) => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!node || typeof node !== 'object') return;
    if (node.type === MathInput) boxes.push(node.props);
    if (node.props) walk(node.props.children);
  };
  walk(tree);
  return { boxes, published: published.at(-1) };
};
const labels = (keys) => (keys || []).map((key) => key.label);
// What a box's keypad is made of (its other props are its value, name and handlers).
const keypadOf = (box) => ({
  profile: box.toolProfile, format: box.answerFormat, required: box.requiredSymbols, keys: labels(box.extraKeys),
  hide: Boolean(box.hideNeededSymbols), open: Boolean(box.showToolsInitially),
});
const unescape = (text) => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
// The keys a laptop's keypad shows for those props, opened: MathInput as the
// student gets it (its profile's keys, the extra keys, and the required ones).
const laptopKeys = async (props) => {
  const MathInput = (await ssr.ssrLoadModule('/src/MathInput.jsx')).default;
  const markup = renderToStaticMarkup(createElement(MathInput, { ...props, value: '', onChange() {}, showToolsInitially: true }));
  const toolbar = region(markup, 'aria-label="Math tools"', '</div>', 'the keypad');
  return [...toolbar.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((match) => unescape(match[1]));
};

/* ------------------------------------------- the two tells, both sides */

const GRAPHS = {
  questionId: 'n56-graphs',
  type: 'multiAnswer',
  prompt: 'Write a linear inequality for graphs a, b and c.',
  // As the import stores them: requiredSymbols read from each key.
  answerFields: [
    { id: 'a', label: 'Graph a', answer: 'y < 4x + 2', inputProfile: 'inequality', answerFormat: 'inequality', requiredSymbols: ['<', 'y', 'x'] },
    { id: 'b', label: 'Graph b', answer: 'y >= 1/2x - 3', inputProfile: 'inequality', answerFormat: 'inequality', requiredSymbols: ['≥', 'a⁄b', 'y', 'x'] },
    { id: 'c', label: 'Graph c', answer: 'y < 3/4x - 2', inputProfile: 'inequality', answerFormat: 'inequality', requiredSymbols: ['<', 'a⁄b', 'y', 'x'] },
  ],
};

test('practice keeps its scaffold: the symbols each key needs, a fraction key only where the answer has one', async () => {
  const { boxes } = await boxesOf(GRAPHS, false);
  assert.equal(boxes.length, 3);
  const fraction = boxes.map((box) => box.requiredSymbols.includes('a⁄b'));
  assert.deepEqual(fraction, [false, true, true]);
  for (const box of boxes) {
    assert.equal(box.hideNeededSymbols, false);
    assert.equal(box.extraKeys, undefined);
  }
  // On a laptop the needed keys join the keypad: graph a's has no fraction key.
  assert.equal((await laptopKeys(boxes[0])).includes('a⁄b'), false);
  assert.equal((await laptopKeys(boxes[1])).includes('a⁄b'), true);
});

test('on an exit ticket a box\'s keypad is the same whatever its answer: no needed row, the same keys on all three', async () => {
  const { boxes } = await boxesOf(GRAPHS, true);
  // Each box keyed with its neighbour's answer (and what the import read from it) keeps its keypad.
  const rotated = { ...GRAPHS, answerFields: GRAPHS.answerFields.map((field, index, fields) => ({ ...field, answer: fields[(index + 1) % 3].answer, requiredSymbols: fields[(index + 1) % 3].requiredSymbols })) };
  const others = (await boxesOf(rotated, true)).boxes;
  boxes.forEach((box, index) => assert.deepEqual(keypadOf(others[index]), keypadOf(box), `graph ${'abc'[index]}`));
  for (const box of boxes) {
    assert.deepEqual(box.requiredSymbols, [], 'nothing read from the key');
    assert.equal(box.hideNeededSymbols, true);
    // The secure inequality keys, then the letters read: each label's own
    // letter first ("Graph b"), then the prompt's ("graphs a, b and c").
    assert.deepEqual(labels(box.extraKeys).slice(0, SECURE_PROFILE_KEYS.inequality.length), labels(SECURE_PROFILE_KEYS.inequality));
  }
  assert.deepEqual(boxes.map((box) => labels(box.extraKeys).slice(SECURE_PROFILE_KEYS.inequality.length)), [['x', 'y', 'a', 'b', 'c'], ['b', 'x', 'y', 'a', 'c'], ['c', 'x', 'y', 'a', 'b']]);
  // On a laptop: one set of keys, a fraction on every box.
  const keys = (await Promise.all(boxes.map(laptopKeys))).map((list) => [...list].sort());
  assert.deepEqual(keys[1], keys[0]);
  assert.deepEqual(keys[2], keys[0]);
  assert.ok(keys[0].includes('a⁄b'), 'every box can type a fraction');
});

test('on an exit ticket the letters are the ones the student reads, never the key\'s, whatever the import stored', async () => {
  // The radicals exit ticket as an assignment imported before the import read
  // {{m|pow}} as a number stores it: m, p, o and w among its symbols.
  const field = {
    id: 'simplified', label: 'Simplified', answer: '3|x^3|y^4', inputProfile: 'expression', gradingMode: 'simplestRadicalForm', answerFormat: 'expression',
    requiredSymbols: ['{', '}', 'xⁿ', '|', 'x', 'm', 'p', 'o', 'w', 'y'],
    inputContract: { format: 'expression', requiredSymbols: ['{', '}', 'xⁿ', '|', 'x', 'm', 'p', 'o', 'w', 'y'] },
  };
  const question = { questionId: 'a2r1-dol-1', type: 'multiAnswer', prompt: 'Simplify $\\sqrt[4]{ 81x^{ 12 }y^{ 16 } }$. The variables $x$ and $y$ can be any real numbers, so use absolute value bars where they are needed.', answerFields: [field] };
  const practice = (await boxesOf(question, false)).boxes[0];
  assert.ok(['m', 'p', 'o', 'w'].every((letter) => practice.requiredSymbols.includes(letter)), 'what the import stored is what practice reads');
  const [box] = (await boxesOf(question, true)).boxes;
  assert.deepEqual(box.requiredSymbols, []);
  assert.deepEqual(labels(box.extraKeys), [...labels(SECURE_PROFILE_KEYS.expression), 'x', 'y']);
  const keys = await laptopKeys(box);
  for (const letter of ['m', 'p', 'o', 'w']) assert.ok(!keys.includes(letter), `${letter} on the keypad: ${keys.join(' ')}`);
  // Everything this answer needs is on it: x, y, a power and bars.
  for (const key of ['x', 'y', 'xⁿ', '|x|']) assert.ok(keys.includes(key), `${key} missing: ${keys.join(' ')}`);
  // The same keypad whatever the key and whatever the import stored.
  const other = { ...field, answer: '2|x|y^2', requiredSymbols: ['a⁄b', 'q'], inputContract: { requiredSymbols: ['π'] } };
  assert.deepEqual(keypadOf((await boxesOf({ ...question, answerFields: [other] }, true)).boxes[0]), keypadOf(box));
});

test('the letters the student reads include the prompt\'s words: "Let j be Jordan\'s age"', () => {
  const keys = (prompt, label = 'An equation', toolProfile = 'basic') => labels(withheldVerdictKeys({ id: 'eq', label, inputProfile: 'equation' }, { prompt, toolProfile })).filter((key) => /^[A-Za-z]$/.test(key));
  assert.deepEqual(keys('Jordan is 13 years older than Riley. Let j be Jordan’s age and r be Riley’s age, in years.'), ['x', 'y', 'j', 'r']);
  // "a" is a variable where the sentence names it, an article everywhere else.
  assert.deepEqual(keys('The club sold a total of 218 tickets. Let a be the number of adult tickets and s the number of student tickets.'), ['x', 'y', 'a', 's']);
  assert.deepEqual(keys('A bike costs a flat fee. I pay $10 plus $6 per hour.'), ['x', 'y']);
  assert.deepEqual(keys('Solve for t: 3t + 4 = 19.'), ['x', 'y', 't']);
  // The label's letters and the prompt's mathematics, as on a secure field.
  assert.deepEqual(keys('Use $h(m) = 4800 - 20m$.', 'h, the height'), ['h', 'm', 'x', 'y']);
  // Never "César": a letter beside an accented one is part of a word.
  assert.deepEqual(keys('César has a phone card.'), ['x', 'y']);
  // Only an inequality, an expression or an equation takes letters.
  assert.deepEqual(labels(withheldVerdictKeys({ id: 'n', label: 'h', inputProfile: 'number' }, { prompt: 'Let h be the height.', toolProfile: 'number' })), labels(SECURE_PROFILE_KEYS.number));
});

test('on an exit ticket a box\'s pad is the one it declares, never one its key implies', async () => {
  // Declared an expression, keyed 6: the number pad said "a plain number".
  const field = (answer) => ({ id: 'value', label: 'Simplified', answer, inputProfile: 'expression', answerFormat: 'expression' });
  const question = (answer) => ({ questionId: 'n56-pad', type: 'multiAnswer', prompt: 'Simplify $3(x+2)-3x$.', answerFields: [field(answer)] });
  assert.equal((await boxesOf(question('6'), false)).boxes[0].toolProfile, 'number', 'practice: as before');
  const plain = (await boxesOf(question('6'), true)).boxes[0];
  const algebraic = (await boxesOf(question('2x+6'), true)).boxes[0];
  assert.equal(plain.toolProfile, 'basic');
  assert.deepEqual(keypadOf(plain), keypadOf(algebraic), 'the same keypad either way');
  // What a box declares is still its pad.
  assert.equal(declaredKeypadProfile({ inputProfile: 'number', answer: 'x+1' }), 'number');
  assert.equal(declaredKeypadProfile({ inputProfile: 'expression', answer: '6' }), '');
});

test('nothing graded changes: the box publishes the same answer state either way', async () => {
  for (const question of [GRAPHS, { questionId: 'n56-one', type: 'multiAnswer', prompt: 'Simplify.', answerFields: [{ id: 'v', label: 'Value', answer: '6', inputProfile: 'expression' }] }]) {
    const practice = (await boxesOf(question, false)).published;
    const withheld = (await boxesOf(question, true)).published;
    assert.deepEqual(withheld, practice);
  }
  // The answers are graded by the shared grader over the whole question and
  // nothing else: not the withheld verdict, and not its keypad (memoised on
  // the question, its fields and the answers since the keystroke pass).
  const source = executableSource(readFileSync(path.join(ROOT, 'src/MultiAnswerGrader.jsx'), 'utf8'));
  const grading = region(source, 'const graded = ', 'useEffect(', 'grading');
  assert.match(grading, /gradeMultiAnswerResponse\(\{ \.\.\.question, answerFields: safeFields \}, answers\)/);
  assert.doesNotMatch(grading, /verdictsWithheld|withheldKeys/);
});

test('QuestionEngine withholds the keypad\'s scaffold exactly where it withholds the verdict', () => {
  const engine = executableSource(readFileSync(path.join(ROOT, 'src/QuestionEngine.jsx'), 'utf8'));
  assert.match(engine, /const showOutcomeFeedback = resolvedActivityPolicy\?\.feedback === 'immediate' \|\| feedbackReleased === true;/);
  assert.match(region(engine, "case 'multiAnswer':", "case 'relationshipModel':", 'the multi-answer mount'), /<MultiAnswerGrader \{\.\.\.commonModuleProps\} verdictsWithheld=\{!showOutcomeFeedback\} \/>/);
});

test('the import reads a template\'s filter as a number, not as letters', () => {
  assert.deepEqual(inferRequiredAnswerSymbols(['{{d}}|x{{m|pow}}|y^{{k}}']), ['xⁿ', '|', 'x', 'y']);
  assert.deepEqual(inferRequiredAnswerSymbols(['({{p}}x{{r|signed}})({{q|coef}}x{{t|signed}})']), ['(', ')', 'x']);
  const { questions } = compiled(readRepoFile('teacher-import-jsons/algebra2-honors-radicals/L1_nth_Roots.json'));
  const [field] = questions.find((question) => question.questionId === 'a2r1-dol-1').answerFields;
  assert.deepEqual(field.requiredSymbols, ['xⁿ', '|', 'x', 'y']);
});

/*
 * EVERY EXIT TICKET, QUIZ AND TEST KEY IS STILL TYPEABLE ON A PHONE.
 *
 * A phone opens no keyboard of its own for these boxes: the pad is the
 * keyboard, and the "Needed for this answer" row no longer brings what the
 * key needs. So every typed key of every DOL, quiz and test question, in
 * every version a class receives, is read against the phone pad its box now
 * gets: MathInput's entry keys and its profile's keys, the extra keys and the
 * format's own row, as the laptop keypad shows them, laid out for a phone by
 * mobileKeypadPolicy.js (parentheses added, a number pad's = + , and an
 * equation pad's ⁿ√ dropped).
 */
// MathInput's entry keys (MOBILE_ENTRY_KEYS); mobileKeypadPolicy.js lays out the rest.
const ENTRY = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '.', ',', '−', '+', '='].map((label) => ({ label, command: label }));
const TYPED_BY = { '|': ['|x|', '|'], 'xⁿ': ['xⁿ', 'x²'], '-': ['−'], '−': ['−'], '∞': ['∞', '−∞'] };
const filesUnder = (directory) => readdirSync(directory).flatMap((name) => {
  const file = path.join(directory, name);
  return statSync(file).isDirectory() ? filesUnder(file) : (name.endsWith('.json') ? [file] : []);
});

test('every exit ticket, quiz and test key, in every version of every lesson, can be typed on a phone\'s pad', async () => {
  const padCache = new Map();
  const untypeable = new Set();
  let boxes = 0;
  for (const file of filesUnder(path.join(ROOT, 'teacher-import-jsons'))) {
    const { questions } = compiled(readFileSync(file, 'utf8'));
    for (const question of questions.filter((entry) => ['dol', 'quiz', 'test'].includes(String(entry.activityRole)))) {
      for (const version of versionsOf(question)) {
        if (version.type !== 'multiAnswer') continue;
        for (const field of version.answerFields || []) {
          // The box this field gets, alone in its question (a choice or a
          // box for words gets no math keypad).
          // eslint-disable-next-line no-await-in-loop
          const [box] = (await boxesOf({ ...version, answerFields: [field] }, true)).boxes;
          if (!box) continue;
          boxes += 1;
          const cacheKey = JSON.stringify([box.toolProfile, box.answerFormat, labels(box.extraKeys)]);
          // eslint-disable-next-line no-await-in-loop
          if (!padCache.has(cacheKey)) padCache.set(cacheKey, await laptopKeys(box));
          const pad = new Set(buildMobileMathTools({ toolProfile: box.toolProfile, entryKeys: ENTRY, profileKeys: padCache.get(cacheKey).map((label) => ({ label })) }).map((key) => key.label));
          for (const symbol of inferRequiredAnswerSymbols(answerCandidatesForField(field))) {
            if (!(TYPED_BY[symbol] || [symbol]).some((key) => pad.has(key))) untypeable.add(`${version.questionId} ${field.id}: ${symbol}`);
          }
        }
      }
    }
  }
  assert.ok(boxes > 2000, `${boxes} typed boxes on exit tickets, quizzes and tests`);
  assert.deepEqual([...untypeable], []);
});
