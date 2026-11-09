// A KEY TYPED INTO AN ANSWER BOX IS GRADED ONCE AND HANDS THE ENGINE NOTHING NEW.
//
// Measured on the student's flow (tests/browser/teacherWorkflow/
// studentRuntimePerformance.mjs: a production build, 4x-throttled), each key
// typed into a multi-part answer drew the whole question twice. The grader
// handed QuestionEngine its Undo on every keystroke — the same Undo in a new
// object — and the engine drew the question again for it (89 component
// renders a key, then 43). And each render graded the answers again and
// checked every box's example against the grader, though the example does not
// depend on what is typed.
//
// Here the grader keeps its hooks between renders (rerenderingHookShim.mjs), as
// in the browser, and four keys are typed into its box. Undo is handed over
// when it becomes possible, not again for each key; the answers are graded once
// a key; what the box shows that the key does not change (its example, its
// keys) is worked out once; and the engine still hears every answer.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { RERENDERING_SHIM, findElement, startRerenderingLoader } from './helpers/rerenderingComponent.mjs';

let loader = null;
let Grader = null;
let mount = null;
before(async () => {
  loader = await startRerenderingLoader();
  Grader = (await loader.ssrLoadModule('/src/MultiAnswerGrader.jsx')).default;
  ({ mount } = await loader.ssrLoadModule(RERENDERING_SHIM));
});
after(async () => { await loader?.close(); });

// Every grading of the answers spreads the question into the grader's input
// ({ ...question, answerFields }), so counting the question's own-key reads
// counts gradings: of the answers, and of each example a box considers.
const countedQuestion = (question) => {
  const counter = { gradings: 0 };
  const proxy = new Proxy(question, {
    ownKeys(target) {
      counter.gradings += 1;
      return Reflect.ownKeys(target);
    },
  });
  return { proxy, counter };
};

const typeInto = (view, values) => values.forEach((value) => {
  const box = findElement(view.output, (element) => typeof element.props?.onChange === 'function' && 'ariaLabel' in element.props);
  assert.ok(box, 'the answer box is drawn');
  box.props.onChange(value);
});

for (const [label, field] of [
  ['an expression box', { id: 'simplified', label: 'Simplified expression', answer: '2x+6' }],
  // A number box's example is checked against the grader (numberExampleFor).
  ['a number box', { id: 'x', label: 'x', answer: '4', inputContract: { format: 'number' } }],
]) {
  test(`${label}: four keys hand Undo over once and grade once a key`, () => {
    const { proxy, counter } = countedQuestion({ type: 'multiAnswer', prompt: 'Simplify 3(x + 2) − x.', answerFields: [field] });
    const published = [];
    const handedOver = [];
    const view = mount(Grader, {
      question: proxy,
      onStateChange: (state) => published.push(state),
      onUndoStateChange: (controller) => handedOver.push(controller),
      feedback: null,
      draftKey: null,
    });
    const gradingsBeforeTyping = counter.gradings;
    const undoBeforeTyping = handedOver.filter(Boolean).length;
    assert.equal(undoBeforeTyping, 1, 'the grader hands its Undo over when it mounts');
    assert.equal(handedOver.at(-1).canUndo, false, 'with nothing to undo yet');

    const keys = ['2', '2x', '2x+', '2x+6'];
    const rendersBeforeTyping = view.renders;
    typeInto(view, keys);

    assert.equal(view.renders - rendersBeforeTyping, keys.length, 'one render a key');
    // Undo becomes possible with the first key and is handed over then; the
    // other three keys leave it as it was.
    const controllers = handedOver.filter(Boolean);
    assert.equal(controllers.length - undoBeforeTyping, 1, `Undo was handed over ${controllers.length - undoBeforeTyping} times for ${keys.length} keys`);
    assert.equal(controllers.at(-1).canUndo, true);
    assert.equal(typeof controllers.at(-1).onUndo, 'function');
    // One grading of the answers a key; the examples were checked once, before typing.
    assert.equal(counter.gradings - gradingsBeforeTyping, keys.length, `${counter.gradings - gradingsBeforeTyping} gradings for ${keys.length} keys`);
    // The engine still hears every answer, and the last one is right.
    assert.deepEqual(published.slice(-keys.length).map((state) => JSON.parse(state.responseKey)[field.id]), keys);
    assert.equal(published.at(-1).isCorrect, field.answer === '2x+6');
  });
}

test('Undo is handed over again when it stops being possible', () => {
  const { proxy } = countedQuestion({ type: 'multiAnswer', prompt: 'Solve 3x = 12.', answerFields: [{ id: 'x', label: 'x', answer: '4' }] });
  const handedOver = [];
  const view = mount(Grader, { question: proxy, onStateChange: () => {}, onUndoStateChange: (controller) => handedOver.push(controller), feedback: null, draftKey: null });
  typeInto(view, ['4']);
  const live = handedOver.filter(Boolean).at(-1);
  assert.equal(live.canUndo, true);
  live.onUndo();
  assert.equal(handedOver.filter(Boolean).at(-1).canUndo, false, 'after the only entry is undone, the engine is told there is nothing left to undo');
});
