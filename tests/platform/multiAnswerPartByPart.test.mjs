// A MULTI-PART ANSWER SHOWS ONE PART AT A TIME (docs/platform/SHOWING_THE_PROCESS.md, P1).
//
// One photo of a screen holding every answer box answers all of it. Where its
// host asks for it (`partByPart`: the student answering a classroom item or a
// secure item), MultiAnswerGrader opens one part at a time: the parts before it
// that have an answer shrink to one line (the label, the student's answer and a
// Change button), the parts after it are not drawn, "Next part" moves on, and
// once every part has an answer "Review all parts" lists them all before the
// engine's own Submit. After a graded miss the wrong parts are open and the
// right ones stay shrunk. "See every part at once" (a per-student support) and
// every host that does not ask for it draw the question as before.
//
// Only presentation changes: the answers the engine is told about, their
// grading and the draft are the same as before, keystroke for keystroke.
//
// The grader keeps its hooks between renders here (rerenderingHookShim.mjs), so
// a press of Next part or Change is a real state change and a render, as in the
// browser. Children are not rendered: the answer boxes are found by their props
// and typed into through their own onChange.
import test, { after, afterEach, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { RERENDERING_SHIM, findElement, startRerenderingLoader } from './helpers/rerenderingComponent.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';
import { countAnswerParts } from '../../src/platform/interaction/answerEntryUx.js';
import { h } from './helpers/miniDom.mjs';
import { getStudentSupportPresentation } from '../../src/studentSupport.js';
import {
  SUPPORT_AUTOMATION, SUPPORT_CLASSIFICATION, isAccommodation, studentFacingLabel, supportById,
} from '../../functions/shared/supportCatalog.mjs';
import { editorGroups } from '../../src/platform/supportEvidence/supportProfileDraft.js';
import { launchSupportRecords } from '../../src/platform/supportEvidence/studentSupportTelemetry.js';
import { normalizeStudentSupportProfile } from '../../src/platform/supports/supportProfileResolver.js';
import { importSupportProfilesFromCSV } from '../../src/platform/supports/supportProfileImporter.js';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

let loader = null;
let Grader = null;
let mount = null;
before(async () => {
  loader = await startRerenderingLoader();
  Grader = (await loader.ssrLoadModule('/src/MultiAnswerGrader.jsx')).default;
  ({ mount } = await loader.ssrLoadModule(RERENDERING_SHIM));
});
after(async () => { await loader?.close(); });

/* ------------------------------------------------------------- the tree */

const findAll = (node, match, found = []) => {
  if (!node || typeof node !== 'object') return found;
  if (Array.isArray(node)) {
    node.forEach((child) => findAll(child, match, found));
    return found;
  }
  if ('props' in node && match(node)) found.push(node);
  return findAll(node.props?.children, match, found);
};
const textOf = (node) => {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  return textOf(node.props?.children);
};
/** Each part the screen draws, in order: its field id and 'open' or 'answered'. */
const partsOf = (view) => findAll(view.output, (element) => element.props?.['data-part-state'])
  .map((element) => [element.props['data-part-id'], element.props['data-part-state']]);
const partElement = (view, id) => findElement(view.output, (element) => element.props?.['data-part-id'] === id);
const buttonsIn = (node) => findAll(node, (element) => element.type === 'button');
const button = (view, name) => buttonsIn(view.output).find((element) => textOf(element).trim() === name) || null;
const press = (view, name) => {
  const found = button(view, name);
  assert.ok(found, `a "${name}" button is drawn`);
  assert.notEqual(found.props.disabled, true, `"${name}" can be pressed`);
  found.props.onClick();
};
/** The answer boxes drawn (MathInput, a text input, a choice group), by field label. */
const boxes = (view) => findAll(view.output, (element) => (
  (typeof element.props?.onChange === 'function' && ('ariaLabel' in element.props || element.type === 'input'))
  || typeof element.props?.onSelect === 'function'
));
const boxLabel = (box) => box.props.ariaLabel ?? box.props['aria-label'] ?? box.props.label;
const typeInto = (view, label, value) => {
  const box = boxes(view).find((element) => boxLabel(element) === label);
  assert.ok(box, `the box "${label}" is drawn`);
  if (box.props.onSelect) box.props.onSelect(value);
  else if (box.type === 'input') box.props.onChange({ target: { value } });
  else box.props.onChange(value);
};
const liveRegion = (view) => findElement(view.output, (element) => element.props?.role === 'status' && element.props?.['data-part-announcer'] === 'true');
const headings = (view) => findAll(view.output, (element) => /^h[1-6]$/.test(String(element.type))).map((element) => textOf(element).trim());

/* ------------------------------------------------------------ questions */

const LINE = Object.freeze({
  type: 'multiAnswer',
  questionId: 'pbp-line',
  prompt: 'A line passes through (0, 4) and (3, 2).',
  answerFields: [
    { id: 'm', label: 'Slope', answer: '-2/3' },
    { id: 'b', label: 'y-intercept', answer: '4' },
    { id: 'kind', label: 'Increasing or decreasing?', choices: ['Increasing', 'Decreasing'], answer: 'Decreasing' },
    { id: 'why', label: 'Explain', type: 'text', answer: 'the slope is negative' },
  ],
});
const ONE_BOX = Object.freeze({ type: 'multiAnswer', prompt: 'Solve 3x = 12.', answerFields: [{ id: 'x', label: 'x', answer: '4' }] });

const mountGrader = (props = {}) => {
  const published = [];
  const view = mount(Grader, {
    question: LINE,
    onStateChange: (state) => published.push(state),
    onUndoStateChange: () => {},
    feedback: null,
    draftKey: null,
    ...props,
  });
  return { view, published };
};

/* ---------------------------------------------------------- one at a time */

test('one part is open at a time; the answered ones shrink to a line, the later ones are not drawn', () => {
  const { view } = mountGrader({ partByPart: true });
  assert.deepEqual(partsOf(view), [['m', 'open']], 'only the first part, and open');
  assert.deepEqual(boxes(view).map(boxLabel), ['Slope'], 'one answer box on the screen');
  assert.ok(headings(view).includes('Part 1 of 4'));
  assert.equal(button(view, 'Next part').props.disabled, true, 'Next part waits for an answer');

  typeInto(view, 'Slope', '-\\frac23');
  assert.deepEqual(partsOf(view), [['m', 'open']], 'typing does not move on by itself');
  assert.equal(button(view, 'Next part').props.disabled, false);
  press(view, 'Next part');

  assert.deepEqual(partsOf(view), [['m', 'answered'], ['b', 'open']]);
  assert.deepEqual(boxes(view).map(boxLabel), ['y-intercept'], 'the answered part is a line, not a box');
  assert.ok(headings(view).includes('Part 2 of 4'));
  assert.equal(textOf(liveRegion(view)), 'Part 2 of 4', 'the move is announced politely');
  const line = partElement(view, 'm');
  assert.match(textOf(line), /Slope/, 'the line names the part');
  const change = buttonsIn(line).find((element) => textOf(element).trim() === 'Change');
  assert.ok(change, 'and offers Change');
  assert.equal(change.props.type, 'button');
  assert.equal(change.props['aria-label'], 'Change part 1, Slope', 'whose name says which part, and contains its visible text');
  // The student's own answer is on the line (drawn as mathematics).
  assert.ok(findElement(line, (element) => element.props?.value === '-\\frac23'), 'the answer is shown on its line');
});

test('Change reopens an answered part; Next part from there goes on to the first part still empty', () => {
  const { view } = mountGrader({ partByPart: true });
  typeInto(view, 'Slope', '-\\frac23');
  press(view, 'Next part');
  typeInto(view, 'y-intercept', '4');
  press(view, 'Next part');
  assert.deepEqual(partsOf(view), [['m', 'answered'], ['b', 'answered'], ['kind', 'open']]);

  buttonsIn(partElement(view, 'm')).find((element) => textOf(element).trim() === 'Change').props.onClick();
  assert.deepEqual(partsOf(view), [['m', 'open'], ['b', 'answered']], 'the reopened part is the open one, the empty one waits');
  assert.equal(textOf(liveRegion(view)), 'Part 1 of 4');
  typeInto(view, 'Slope', '-\\frac{2}{3}');
  press(view, 'Next part');
  assert.deepEqual(partsOf(view), [['m', 'answered'], ['b', 'answered'], ['kind', 'open']]);
});

test('every part answered: Review all parts lists them all, each one changeable', () => {
  const { view, published } = mountGrader({ partByPart: true });
  typeInto(view, 'Slope', '-\\frac23');
  press(view, 'Next part');
  typeInto(view, 'y-intercept', '4');
  press(view, 'Next part');
  typeInto(view, 'Increasing or decreasing?', 'Decreasing');
  press(view, 'Next part');
  typeInto(view, 'Explain', 'the slope is negative');
  assert.equal(button(view, 'Next part'), null, 'the last part does not offer a part that is not there');
  assert.equal(published.at(-1).isComplete, true, 'the engine may already submit');
  press(view, 'Review all parts');

  assert.deepEqual(partsOf(view), [['m', 'answered'], ['b', 'answered'], ['kind', 'answered'], ['why', 'answered']]);
  assert.ok(headings(view).includes('Review all parts'));
  assert.equal(textOf(liveRegion(view)), 'Review all parts');
  assert.deepEqual(buttonsIn(view.output).map((element) => element.props['aria-label']), [
    'Change part 1, Slope', 'Change part 2, y-intercept', 'Change part 3, Increasing or decreasing?', 'Change part 4, Explain',
  ]);
  assert.match(textOf(partElement(view, 'kind')), /Decreasing/, 'a choice is shown by its words');
  assert.match(textOf(partElement(view, 'why')), /the slope is negative/, 'typed words as typed');

  // Changed from the review, a part goes back to the review.
  buttonsIn(partElement(view, 'b')).find((element) => textOf(element).trim() === 'Change').props.onClick();
  assert.deepEqual(partsOf(view).map(([, state]) => state), ['answered', 'open', 'answered', 'answered']);
  press(view, 'Review all parts');
  assert.ok(headings(view).includes('Review all parts'));
});

test('on a DOL or a Test (verdicts withheld) the review says to submit after it', () => {
  const { view } = mountGrader({ partByPart: true, verdictsWithheld: true });
  for (const [label, value] of [['Slope', '1'], ['y-intercept', '4'], ['Increasing or decreasing?', 'Increasing'], ['Explain', 'up']]) {
    typeInto(view, label, value);
    press(view, button(view, 'Next part') ? 'Next part' : 'Review all parts');
  }
  assert.ok(headings(view).includes('Review all parts, then submit'));
});

test('a part emptied from outside (Undo) opens again, even from the review', () => {
  const controllers = [];
  const view = mount(Grader, { question: { ...LINE, answerFields: LINE.answerFields.slice(0, 2) }, onStateChange: () => {}, onUndoStateChange: (controller) => controllers.push(controller), feedback: null, draftKey: null, partByPart: true });
  typeInto(view, 'Slope', '2');
  press(view, 'Next part');
  typeInto(view, 'y-intercept', '4');
  press(view, 'Review all parts');
  assert.deepEqual(partsOf(view), [['m', 'answered'], ['b', 'answered']]);
  controllers.filter(Boolean).at(-1).onUndo();
  assert.deepEqual(partsOf(view), [['m', 'answered'], ['b', 'open']], 'the part Undo emptied is open, not a blank line');
});

test('a part whose answer breaks its shape cannot be passed: Next part waits, as Submit does', () => {
  const question = { type: 'multiAnswer', prompt: 'A line passes through (0, 4) and (3, 2).', answerFields: [
    { id: 'b', label: 'y-intercept', answer: '4', inputContract: { format: 'number' } },
    { id: 'm', label: 'Slope', answer: '-2/3' },
  ] };
  const { view, published } = mountGrader({ question, partByPart: true });
  typeInto(view, 'y-intercept', 'b=4');
  assert.equal(published.at(-1).isComplete, false, 'the engine holds Submit back for it');
  assert.equal(button(view, 'Next part').props.disabled, true, 'and the part stays open, where the reason is shown');
  typeInto(view, 'y-intercept', '4');
  assert.equal(button(view, 'Next part').props.disabled, false);
});

/* ------------------------------------------------------- after a graded miss */

test('after a graded miss the wrong parts are open and the right ones stay shrunk', () => {
  const { view } = mountGrader({ partByPart: true });
  for (const [label, value] of [['Slope', '2'], ['y-intercept', '4'], ['Increasing or decreasing?', 'Increasing'], ['Explain', 'up']]) {
    typeInto(view, label, value);
    press(view, button(view, 'Next part') ? 'Next part' : 'Review all parts');
  }
  const feedback = { isCorrect: false, partGrades: [
    { id: 'm', isCorrect: false }, { id: 'b', isCorrect: true }, { id: 'kind', isCorrect: false }, { id: 'why', isCorrect: true },
  ] };
  view.update({ question: LINE, onStateChange: () => {}, onUndoStateChange: () => {}, draftKey: null, partByPart: true, feedback });
  assert.deepEqual(partsOf(view), [['m', 'open'], ['b', 'answered'], ['kind', 'open'], ['why', 'answered']]);
  assert.deepEqual(boxes(view).map(boxLabel).sort(), ['Increasing or decreasing?', 'Slope'], 'only the wrong parts can be typed in');
  assert.equal(button(view, 'Next part'), null, 'nothing to move on to: Submit is the engine\'s');
  // A right part says so in words on its line, as a graded box does.
  assert.ok(findElement(partElement(view, 'b'), (element) => element.props?.grade?.isCorrect === true), 'the grade mark is on the line');
  // A right part can still be reopened.
  buttonsIn(partElement(view, 'b')).find((element) => textOf(element).trim() === 'Change').props.onClick();
  assert.deepEqual(partsOf(view).map(([, state]) => state), ['open', 'open', 'open', 'answered']);

  // The engine drops its feedback once the student edits: the parts the miss
  // opened stay open (nothing shrinks under the student's cursor), with no
  // Next part, until the next attempt is graded.
  typeInto(view, 'Slope', '-\\frac23');
  view.update({ question: LINE, onStateChange: () => {}, onUndoStateChange: () => {}, draftKey: null, partByPart: true, feedback: null });
  assert.deepEqual(partsOf(view).map(([, state]) => state), ['open', 'open', 'open', 'answered']);
  assert.equal(button(view, 'Next part'), null);
  // The next graded attempt decides again: all right, every part a line.
  const allRight = { isCorrect: true, partGrades: LINE.answerFields.map((field) => ({ id: field.id, isCorrect: true })) };
  view.update({ question: LINE, onStateChange: () => {}, onUndoStateChange: () => {}, draftKey: null, partByPart: true, feedback: allRight });
  assert.deepEqual(partsOf(view).map(([, state]) => state), ['answered', 'answered', 'answered', 'answered']);
  assert.ok(!headings(view).some((text) => text.startsWith('Review')), 'a graded question is not a review before submitting');
});

/* ---------------------------------------------- all at once, as before */

test('without the host asking, or with See every part at once, every box is drawn as before', () => {
  for (const props of [{}, { partByPart: false }]) {
    const { view } = mountGrader(props);
    assert.deepEqual(partsOf(view), [], 'no part lines');
    assert.deepEqual(boxes(view).map(boxLabel), ['Slope', 'y-intercept', 'Increasing or decreasing?', 'Explain']);
    assert.equal(button(view, 'Next part'), null);
  }
  // One box is one part: unchanged even where the host asks.
  const { view } = mountGrader({ question: ONE_BOX, partByPart: true });
  assert.deepEqual(partsOf(view), []);
  assert.deepEqual(boxes(view).map(boxLabel), ['x']);
  assert.ok(!headings(view).some((text) => /^Part \d/.test(text)));
});

test('the engine is told exactly what it was told before: the same states, for the same answers, and nothing for a move', () => {
  const whole = mountGrader();
  const walked = mountGrader({ partByPart: true });
  assert.deepEqual(walked.published, whole.published, 'on mount');
  const steps = [['Slope', '-\\frac23'], ['y-intercept', '4'], ['Increasing or decreasing?', 'Decreasing'], ['Explain', 'the slope is negative']];
  for (const [label, value] of steps) {
    typeInto(whole.view, label, value);
    typeInto(walked.view, label, value);
    const before = walked.published.length;
    press(walked.view, button(walked.view, 'Next part') ? 'Next part' : 'Review all parts');
    assert.equal(walked.published.length, before, 'a move tells the engine nothing');
  }
  assert.deepEqual(walked.published, whole.published, 'every state, isComplete, isCorrect, responseKey, details and parts alike');
  assert.equal(walked.published.at(-1).isCorrect, true);
  assert.equal(walked.published.at(-1).responseKey, JSON.stringify({ m: '-\\frac23', b: '4', kind: 'Decreasing', why: 'the slope is negative' }));
});

/* ------------------------------------------------- a reload, from the draft */

class MemoryStorage {
  constructor() { this.values = new Map(); }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(String(key), String(value)); }
  removeItem(key) { this.values.delete(String(key)); }
}
const previousWindow = globalThis.window;
afterEach(() => {
  if (previousWindow === undefined) delete globalThis.window;
  else globalThis.window = previousWindow;
});

test('a reload opens the first part with no answer, from the draft alone (no new saved state)', () => {
  globalThis.window = { localStorage: new MemoryStorage(), addEventListener() {}, removeEventListener() {} };
  const draftKey = 'mathmaster:test:pbp-reload';
  const first = mountGrader({ partByPart: true, draftKey });
  typeInto(first.view, 'Slope', '-\\frac23');
  press(first.view, 'Next part');
  typeInto(first.view, 'y-intercept', '4');
  first.view.unmount();
  const saved = [...globalThis.window.localStorage.values.keys()];
  assert.ok(saved.length > 0, 'the draft was written');
  assert.ok(saved.every((key) => key.includes('pbp-reload:multi-answer')), `only the answers' own draft: ${saved.join(', ')}`);

  // The second part has an answer; it was never moved past. The reload opens
  // the first part with no answer: the third.
  const again = mountGrader({ partByPart: true, draftKey });
  assert.deepEqual(partsOf(again.view), [['m', 'answered'], ['b', 'answered'], ['kind', 'open']]);
  assert.ok(headings(again.view).includes('Part 3 of 4'));
});

/* -------------------------------------------- Enter, and counting the parts */

test('Enter in the open part moves on when it has an answer, and is the part\'s own', () => {
  const { view } = mountGrader({ partByPart: true });
  const owner = () => partElement(view, findAll(view.output, (element) => element.props?.['data-part-state'] === 'open')[0].props['data-part-id']);
  const enter = (target = { tagName: 'MATH-FIELD', closest: () => null }) => {
    let prevented = false;
    owner().props.onKeyDown({ key: 'Enter', target, preventDefault() { prevented = true; }, isComposing: false });
    return prevented;
  };
  assert.equal(owner().props['data-mm-enter-owner'], 'part', 'the engine leaves its Enter alone');
  assert.equal(enter(), true, 'an Enter with nothing typed is kept, and spends nothing');
  assert.deepEqual(partsOf(view), [['m', 'open']]);
  typeInto(view, 'Slope', '1');
  enter();
  assert.deepEqual(partsOf(view), [['m', 'answered'], ['b', 'open']], 'Enter is Next part');
});

test('the engine counts every part, not only the box on screen, so Enter never takes one box for the whole answer', () => {
  const walk = h('div', { 'data-answer-part-count': '4' }, h('input', { type: 'text', value: '' }));
  assert.equal(countAnswerParts(walk), 4);
  assert.equal(countAnswerParts(h('div', {}, h('input', { type: 'text', value: '' }))), 1, 'a plain box is still one');
  const { view } = mountGrader({ partByPart: true });
  assert.ok(findElement(view.output, (element) => element.props?.['data-answer-part-count'] === 4), 'the walk declares its parts');
});

/* -------------------------------------------------------------- focus */

test('a new part takes focus at its heading, without a scroll jump', () => {
  const source = executableSource(read('src/MultiAnswerGrader.jsx'));
  const focusing = region(source, 'const partFocusRef', '}, [walk.focus]);', 'the part focus effect');
  assert.match(focusing, /\.focus\(\{ preventScroll: true \}\)/, 'focus without the browser\'s own scroll');
  assert.match(focusing, /scrollIntoView\?\.\(\{ block: 'nearest' \}\)/, 'and only as far as needed to show it');
  assert.match(focusing, /if \(!walk\.focus\) return;/, 'never on mount: only after the student moved');
  const { view } = mountGrader({ partByPart: true });
  const heading = findElement(view.output, (element) => element.type === 'h3' && textOf(element) === 'Part 1 of 4');
  assert.equal(heading.props.tabIndex, -1, 'the heading can take focus');
});

/* ----------------------------------------------------- the support itself */

test('See every part at once is an accommodation the teacher sets, applied by the platform', () => {
  const entry = supportById('every-part-at-once');
  assert.ok(entry, 'in the support catalog');
  assert.ok(isAccommodation('every-part-at-once'));
  assert.equal(entry.classification, SUPPORT_CLASSIFICATION.ACCOMMODATION);
  assert.equal(entry.automation, SUPPORT_AUTOMATION.AUTOMATIC);
  assert.equal(entry.label, 'See every part at once (IEP/504)');
  assert.equal(studentFacingLabel('every-part-at-once'), null, 'nothing new in the student\'s Support tools');
  const offered = editorGroups().platformAccommodations.flatMap((group) => group.items.map((item) => item.id));
  assert.ok(offered.includes('every-part-at-once'), 'the profile editor offers it');

  assert.equal(getStudentSupportPresentation({ accommodations: ['every-part-at-once'] }).everyPartAtOnce, true);
  assert.equal(getStudentSupportPresentation({ accommodations: ['text-to-speech'] }).everyPartAtOnce, false);
  assert.equal(getStudentSupportPresentation({ inclusionStatus: true }).everyPartAtOnce, false, 'inclusion status does not imply it');

  // The district import's shape carries it too.
  assert.equal(normalizeStudentSupportProfile({ accommodations: { everyPartAtOnce: true } }).accommodations.everyPartAtOnce, true);
  assert.equal(normalizeStudentSupportProfile({}).accommodations.everyPartAtOnce, false);
  const imported = importSupportProfilesFromCSV([{ student_id: 'S1', every_part_at_once: 'yes' }]);
  assert.equal(imported.profiles[0].accommodations.everyPartAtOnce, true);

  // Provided where it changed a question (QuestionEngine), never at launch.
  const plan = { supportPlan: { version: 1, active: true, accommodations: [{ id: 'every-part-at-once' }], modifications: [] }, accommodations: ['every-part-at-once'] };
  const { records } = launchSupportRecords({ profile: plan, assignment: {}, roles: ['classwork'] });
  assert.ok(!records.some((record) => record.supportId === 'every-part-at-once'), JSON.stringify(records));
});

test('the engine walks the parts only where its host asks, and never for a student with the support', () => {
  const engine = executableSource(read('src/QuestionEngine.jsx'));
  const mountLine = region(engine, 'return <MultiAnswerGrader', '/>;', 'the multi-answer mount');
  assert.match(mountLine, /partByPart=\{walkAnswerParts\}/);
  assert.match(engine, /const walkAnswerParts = partByPart === true && supportPresentation\.everyPartAtOnce !== true;/);
  assert.match(engine, /reportSupportEvidence\('every-part-at-once', 'provided'\)/, 'recorded where it changed the question');
});

test('the hosts: the student\'s assignment and a secure item walk the parts; previews, reviews, Path and Live Challenge do not', () => {
  const workspace = executableSource(read('src/app/student/assignmentWorkspaceView.jsx'));
  assert.match(workspace, /partByPart=\{!preview\}/, 'the student answering a classroom item; a teacher preview sees every part');
  const rich = executableSource(read('src/components/question/RichQuestionRuntime.jsx'));
  assert.match(rich, /partByPart=\{policy\.secure && executionScope === 'student'\}/, 'a secure Test item; Corrections and the teacher\'s Test preview see every part');
  for (const host of [
    'src/components/teacher/TeacherQuestionReviewPanel.jsx',
    'src/components/teacher/PathSimulator.jsx',
    'src/components/student/PathSessionPlayer.jsx',
    'src/components/liveChallenge/LiveChallengeStudent.jsx',
    'src/components/student/SectionRecoveryRunner.jsx',
    'src/components/demo/DemoExperience.jsx',
    'src/platform/ToolWrapper.jsx',
  ]) {
    assert.doesNotMatch(executableSource(read(host)), /partByPart/, `${host} draws every part at once`);
  }
});
