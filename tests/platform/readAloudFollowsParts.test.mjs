// READ ALOUD FOLLOWS THE PARTS (SP-1c, docs/platform/SHOWING_THE_PROCESS.md section 3).
//
// While a multi-part answer opens one part at a time, Read aloud reads the
// open part and the answered lines, never a part the screen does not show yet:
// a part read out before it is shown would hand it over as one recording.
// MultiAnswerGrader tells its engine which parts are on the screen
// (onShownPartsChange); the engine keeps only those answer parts in what Read
// aloud and the tray's "Read a part" say (readingPartsShown). The prompt, the
// figures and the step are read as before, and a host that draws every part
// (a preview, See every part at once, a single box) reads every part.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { RERENDERING_SHIM, findElement, startRerenderingLoader } from './helpers/rerenderingComponent.mjs';
import { questionReadingParts, questionReadingText, readingPartsShown } from '../../src/platform/language/questionReading.js';

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

const LINE = Object.freeze({
  type: 'multiAnswer',
  questionId: 'read-parts-line',
  prompt: 'A line passes through (0, 4) and (3, 2).',
  answerFields: [
    { id: 'm', label: 'Slope', answer: '-2/3' },
    { id: 'b', label: 'Where it crosses the vertical axis', answer: '4' },
    { id: 'kind', label: 'Increasing or decreasing?', choices: ['Increasing', 'Decreasing'], answer: 'Decreasing' },
  ],
});

const textOf = (node) => {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  return textOf(node.props?.children);
};
const findAll = (node, match, found = []) => {
  if (!node || typeof node !== 'object') return found;
  if (Array.isArray(node)) {
    node.forEach((child) => findAll(child, match, found));
    return found;
  }
  if ('props' in node && match(node)) found.push(node);
  return findAll(node.props?.children, match, found);
};
const press = (view, name) => {
  const found = findAll(view.output, (element) => element.type === 'button').find((element) => textOf(element).trim() === name);
  assert.ok(found, `a "${name}" button is drawn`);
  found.props.onClick();
};
const typeInto = (view, label, value) => {
  const box = findElement(view.output, (element) => (
    (typeof element.props?.onChange === 'function' && (element.props.ariaLabel ?? element.props['aria-label']) === label)
    || (typeof element.props?.onSelect === 'function' && element.props.label === label)
  ));
  assert.ok(box, `the box "${label}" is drawn`);
  if (box.props.onSelect) box.props.onSelect(value);
  else if (box.type === 'input') box.props.onChange({ target: { value } });
  else box.props.onChange(value);
};

const mountGrader = (props = {}) => {
  const shown = [];
  const view = mount(Grader, {
    question: LINE,
    onStateChange: () => {},
    onUndoStateChange: () => {},
    feedback: null,
    draftKey: null,
    onShownPartsChange: (ids) => shown.push(ids),
    ...props,
  });
  return { view, shown };
};

test('the grader tells its engine which parts are on the screen, as the student moves through them', () => {
  const { view, shown } = mountGrader({ partByPart: true });
  assert.deepEqual(shown.at(-1), ['m'], 'only the open first part');
  typeInto(view, 'Slope', '-\\frac23');
  assert.deepEqual(shown.at(-1), ['m'], 'typing does not show the next part');
  press(view, 'Next part');
  assert.deepEqual(shown.at(-1), ['m', 'b'], 'the answered line and the open part');
  typeInto(view, 'Where it crosses the vertical axis', '4');
  press(view, 'Next part');
  typeInto(view, 'Increasing or decreasing?', 'Decreasing');
  press(view, 'Review all parts');
  assert.deepEqual(shown.at(-1), ['m', 'b', 'kind'], 'Review all parts shows every part');
});

test('a grader that draws every part says so (null), so every part is read', () => {
  assert.equal(mountGrader({ partByPart: false }).shown.at(-1), null, 'no part by part: every part is drawn');
  const oneBox = { type: 'multiAnswer', prompt: 'Solve 3x = 12.', answerFields: [{ id: 'x', label: 'x', answer: '4' }] };
  assert.equal(mountGrader({ partByPart: true, question: oneBox }).shown.at(-1), null, 'a single box is not walked');
});

test('a part the screen does not show yet is never read aloud', () => {
  const every = questionReadingParts(LINE);
  const wholeQuestion = questionReadingText(every);
  assert.match(wholeQuestion, /vertical axis/, 'the question has a later part to hide');
  assert.match(wholeQuestion, /Increasing/);

  const firstOnly = readingPartsShown(every, ['m']);
  const firstText = questionReadingText(firstOnly);
  assert.match(firstText, /A line passes through/, 'the prompt is read');
  assert.match(firstText, /Slope/, 'the open part is read');
  assert.doesNotMatch(firstText, /vertical axis|Increasing|Decreasing/, 'neither hidden part, label nor choices, is read');
  assert.deepEqual(firstOnly.map((part) => part.id), ['prompt', 'part-m'], 'and "Read a part" offers only what is shown');

  const twoShown = questionReadingText(readingPartsShown(every, ['m', 'b']));
  assert.match(twoShown, /Slope.*vertical axis/, 'the answered line and the open part, in order');
  assert.doesNotMatch(twoShown, /Increasing/);

  assert.deepEqual(readingPartsShown(every, null), every, 'every part drawn: every part read');
  assert.deepEqual(readingPartsShown(every, ['m', 'b', 'kind']), every, 'Review all parts: every part read');
});

test('the engine reads only the shown parts, in the work bar Read and in the tray', () => {
  const engine = read('src/QuestionEngine.jsx');
  assert.match(engine, /<MultiAnswerGrader \{\.\.\.commonModuleProps\}[^>]*onShownPartsChange=\{setShownAnswerParts\}/, 'the multi-part grader reports what it shows');
  assert.match(engine, /const readingParts = useMemo\(\(\) => readingPartsShown\(everyReadingPart, shownAnswerParts\)/, 'what is read keeps only the shown answer parts');
  assert.match(engine, /const referenceSpeechText = useMemo\(\(\) => questionReadingText\(readingParts\)/, 'the work bar Read reads the shown parts');
  assert.match(engine, /readingParts=\{readingParts\}/, 'the tray is handed the shown parts');
  assert.equal((engine.match(/everyReadingPart/g) || []).length, 3, 'the unfiltered parts are used nowhere else');
});
