/*
 * UNDO NEVER HANDS ONE QUESTION ANOTHER QUESTION'S ANSWER (pass 3 review).
 *
 * My Math Path renders ONE QuestionEngine and swaps the question under it
 * (PathSessionPlayer), so two consecutive items that use the same tool keep it
 * mounted. The tool's persistent fields re-read the new question's draft; that
 * re-read used to land one render late, in an effect, after Universal Undo had
 * re-baselined on the previous question's answers. The late re-read was
 * recorded as an edit, so the next question opened blank with ↶ Undo enabled,
 * and one press wrote the previous question's answers into it and into its
 * draft, where they could be submitted.
 *
 * React really renders here (react-dom in node, a minimal window/localStorage),
 * through QuestionEngine's own wiring: the undo controller it holds, the effect
 * that clears it on a question change, and the provider's reset key. Both ways
 * a tool reaches the platform Undo are covered: useFieldUndoHistory (the ten
 * pass-3 tools) and useMathUndoHistory over usePersistentToolState directly
 * (the older tools).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
const localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => { store.set(key, String(value)); },
  removeItem: (key) => { store.delete(key); },
  key: (index) => [...store.keys()][index] ?? null,
  get length() { return store.size; },
  clear: () => store.clear(),
};
globalThis.window = globalThis.window || { localStorage, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; }, HTMLIFrameElement: class {} };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const container = () => ({
  nodeType: 1, nodeName: 'DIV', tagName: 'DIV', namespaceURI: 'http://www.w3.org/1999/xhtml', ownerDocument: null,
  addEventListener() {}, removeEventListener() {}, childNodes: [], firstChild: null,
  set textContent(value) {}, get textContent() { return ''; }, appendChild() {}, removeChild() {}, insertBefore() {},
});

const React = (await import('react')).default;
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { default: usePersistentToolState, ToolDraftScopeProvider } = await import('../../src/tools/shared/usePersistentToolState.js');
const { default: useFieldUndoHistory } = await import('../../src/tools/shared/useFieldUndoHistory.js');
const { default: useMathUndoHistory, WorkViewUndoProvider, questionUndoResetKey } = await import('../../src/platform/workView/useMathUndoHistory.js');

const h = React.createElement;
const { useEffect, useMemo, useRef, useState } = React;

const draftValue = (draftKey) => {
  const raw = store.get(`${draftKey}:work:tool`);
  return raw ? JSON.parse(raw).value : undefined;
};

const harness = (useUndo) => {
  const tool = { current: null };
  const engine = { current: null };
  function Tool({ questionData }) {
    const [choice, setChoice] = usePersistentToolState('choice', '__unanswered__');
    const [value, setValue] = usePersistentToolState('value', '');
    useUndo({ questionData, choice, setChoice, value, setValue });
    tool.current = { choice, value, setChoice, setValue };
    return null;
  }
  // QuestionEngine's wiring (QuestionEngine.jsx: undoController, the reset on
  // a question change, WorkViewUndoProvider's resetKey).
  function Engine({ question, draftKey }) {
    const [undoController, setUndoController] = useState(null);
    const seenQuestion = useRef(question);
    useEffect(() => {
      if (seenQuestion.current === question) return;
      seenQuestion.current = question;
      setUndoController(null);
    }, [question]);
    engine.current = undoController;
    return h(WorkViewUndoProvider, { register: setUndoController, resetKey: `${question.questionId}|0` },
      h(ToolDraftScopeProvider, { draftKey }, h(Tool, { questionData: question })));
  }
  return { tool, engine, Engine };
};

const viaFieldHook = ({ questionData, choice, setChoice, value, setValue }) => useFieldUndoHistory({
  questionData,
  fields: { value: [value, setValue], factorChoice: [choice, setChoice] },
});
const viaMathHook = ({ questionData, choice, setChoice, value, setValue }) => {
  const state = useMemo(() => ({ value, choice }), [value, choice]);
  return useMathUndoHistory({
    state,
    resetKey: questionUndoResetKey(questionData),
    persist: true,
    onRestore: (restored) => { setValue(restored.value); setChoice(restored.choice); },
  });
};

for (const [name, useUndo] of [['useFieldUndoHistory', viaFieldHook], ['useMathUndoHistory directly', viaMathHook]]) {
  test(`${name}: the next question under a mounted tool opens with nothing to undo, and Undo never writes the previous answer into it`, async () => {
    store.clear();
    const { tool, engine, Engine } = harness(useUndo);
    const root = createRoot(container());
    const q1 = { questionId: `${name}-item-1` };
    const q2 = { questionId: `${name}-item-2` };
    await act(async () => { root.render(h(Engine, { question: q1, draftKey: `${name}-i1` })); });
    await act(async () => { tool.current.setValue('-3'); });
    await act(async () => { tool.current.setChoice('factor'); });
    assert.equal(engine.current?.canUndo, true, 'the first question has work to undo');

    // The path moves on; the same tool stays mounted.
    await act(async () => { root.render(h(Engine, { question: q2, draftKey: `${name}-i2` })); });
    assert.deepEqual({ value: tool.current.value, choice: tool.current.choice }, { value: '', choice: '__unanswered__' });
    assert.notEqual(engine.current?.canUndo, true, 'opening a question is not an edit: nothing to undo');
    await act(async () => { engine.current?.onUndo?.(); });
    assert.deepEqual({ value: tool.current.value, choice: tool.current.choice }, { value: '', choice: '__unanswered__' }, 'an Undo press gives the question nothing of the last one');
    assert.equal(draftValue(`${name}-i2`), undefined, 'and writes nothing into its draft');

    // Its own edit is undoable, back to its own blank start.
    await act(async () => { tool.current.setValue('7'); });
    assert.equal(engine.current?.canUndo, true);
    await act(async () => { engine.current.onUndo(); });
    assert.equal(tool.current.value, '');

    // Back to the first question: its own work, as the student left it.
    await act(async () => { root.render(h(Engine, { question: q1, draftKey: `${name}-i1` })); });
    assert.deepEqual({ value: tool.current.value, choice: tool.current.choice }, { value: '-3', choice: 'factor' });
    assert.notEqual(engine.current?.canUndo, true, 'coming back is not an edit either');
    await act(async () => { root.unmount(); });
  });
}
