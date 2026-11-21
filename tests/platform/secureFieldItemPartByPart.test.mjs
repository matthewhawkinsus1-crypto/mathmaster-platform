// A SECURE TEST'S FIELD ITEM OPENS ONE PART AT A TIME (SP-1b, docs/platform/SHOWING_THE_PROCESS.md section 3).
//
// A field item with several responseFields is drawn by RichQuestionRuntime's
// FieldItem, not MultiAnswerGrader, so part by part (P1) did not reach it: on
// a secure Test every field was on one screen. For the student in a secure
// Test it now goes as a multi-answer question does:
//   - one field is open, with "Part N of M" and Next part;
//   - an answered field is one line (its label, the answer, Change);
//   - a field after the open one is not drawn;
//   - once every field has an answer, "Review all parts, then submit" lists
//     them all before the item's own Record answer;
//   - in a test the student moves around in (navigation mode), there is no
//     per-question action, before or after the review.
// A teacher's preview, Corrections and a student with See every part at once
// draw every field, as before. Nothing about what is saved changes: the draft
// is the responses.
//
// The real RichQuestionRuntime is mounted (helpers/toolUndoRender.mjs).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { openToolUndoRenderer, errorText } from './helpers/toolUndoRender.mjs';

let rendererPromise = null;
const renderer = () => { rendererPromise ||= openToolUndoRenderer({ cacheName: 'secure-field-parts' }); return rendererPromise; };
after(async () => { if (rendererPromise) await (await rendererPromise).close(); });

const QUESTION = Object.freeze({
  questionInstanceId: 'sp1b-two-parts',
  prompt: 'A line passes through (0, 3) and (2, 13). Enter its slope and its y-intercept.',
  responseFields: [
    { id: 'slope', label: 'Slope', inputProfile: 'number' },
    { id: 'intercept', label: 'Intercept', inputProfile: 'number' },
  ],
});

const open = async (props = {}, question = QUESTION) => (await renderer()).openModule('/src/components/question/RichQuestionRuntime.jsx', {
  render: ({ Module, h }) => h(Module, {
    question,
    mode: 'secureTest',
    draftKey: null,
    initialResponsePayload: null,
    onSubmit: async () => ({}),
    onDraftChange() {},
    ...props,
  }),
});

const labelOf = (node) => String(node.getAttribute('aria-label') || node.textContent || '').trim();
const buttonNamed = (opened, name) => opened.interact.buttons().find((node) => labelOf(node) === name) || null;
const press = async (opened, name) => {
  const button = buttonNamed(opened, name);
  assert.ok(button, `"${name}" can be pressed`);
  await opened.interact.press(button);
};

test('a secure Test field item of two fields opens one part at a time, then Review all parts, then Record', async () => {
  const opened = await open();
  try {
    assert.match(opened.text(), /Part 1 of 2/, 'the first part is open, by name');
    assert.equal(opened.interact.boxes().length, 1, 'one answer box on the screen');
    assert.doesNotMatch(opened.text(), /Intercept/, 'the later part is not drawn');
    assert.equal(buttonNamed(opened, 'Next part'), null, 'Next part waits for an answer');
    assert.doesNotMatch(opened.text(), /Record answer|Answer to continue/, 'no Record before the review');

    await opened.interact.type('5', 0);
    await press(opened, 'Next part');
    assert.match(opened.text(), /Part 2 of 2/);
    assert.deepEqual(opened.interact.answeredParts(), [{ id: 'slope', value: '5' }], 'the answered part is one line, with its answer');
    assert.equal(opened.interact.boxes().length, 1, 'still one box: the open part\'s');
    assert.ok(buttonNamed(opened, 'Change part 1, Slope'), 'the line can be changed, named by its part');

    await opened.interact.type('3', 0);
    await press(opened, 'Review all parts');
    assert.match(opened.text(), /Review all parts, then submit/);
    assert.deepEqual(opened.interact.answeredParts(), [{ id: 'slope', value: '5' }, { id: 'intercept', value: '3' }], 'the review lists every part');
    assert.equal(opened.interact.boxes().length, 0, 'no box is open in the review');
    // The item's own submit button (a form submit, so not in the press list).
    assert.match(opened.text(), /Record answer & continue/, 'the item\'s Record comes after the review');

    await press(opened, 'Change part 1, Slope');
    assert.match(opened.text(), /Part 1 of 2/, 'Change opens that part again');
    assert.equal(opened.interact.boxes().length, 1);
  } finally {
    await opened.close();
  }
  assert.deepEqual(errorText(opened), []);
});

test('in a test the student moves around in, the review comes with no per-question action', async () => {
  const opened = await open({ navigationMode: true });
  try {
    await opened.interact.type('5', 0);
    await press(opened, 'Next part');
    await opened.interact.type('3', 0);
    await press(opened, 'Review all parts');
    assert.match(opened.text(), /Review all parts, then submit/);
    assert.doesNotMatch(opened.text(), /Record answer|Answer to continue/, 'moving on is the test\'s Next');
  } finally {
    await opened.close();
  }
  assert.deepEqual(errorText(opened), []);
});

test('a teacher\'s preview, Corrections, See every part at once and a one-field item draw every field', async () => {
  const cases = [
    ['a teacher\'s preview', { executionScope: 'teacher' }, QUESTION],
    ['Corrections', { mode: 'corrections' }, QUESTION],
    ['See every part at once', { studentSupportProfile: { accommodations: ['every-part-at-once'] } }, QUESTION],
    ['a one-field item', {}, { ...QUESTION, responseFields: [QUESTION.responseFields[0]] }],
  ];
  for (const [name, props, question] of cases) {
    // eslint-disable-next-line no-await-in-loop
    const opened = await open(props, question);
    try {
      assert.doesNotMatch(opened.text(), /Part 1 of/, `${name}: not walked`);
      assert.equal(opened.interact.boxes().length, question.responseFields.length, `${name}: every field is drawn`);
      assert.deepEqual(opened.interact.answeredParts(), [], `${name}: no part lines`);
    } finally {
      // eslint-disable-next-line no-await-in-loop
      await opened.close();
    }
    assert.deepEqual(errorText(opened), [], name);
  }
});
