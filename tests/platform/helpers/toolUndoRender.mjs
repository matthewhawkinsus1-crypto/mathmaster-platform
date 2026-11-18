/*
 * A REGISTRY TOOL MOUNTED IN NODE, WITH ITS SAVED UNDO HISTORY, AND UNDO PRESSED.
 *
 * toolDraftRender.mjs opens a tool once, as a reload renders it. An Undo is an
 * action: the tool mounts, registers with the platform Undo in an effect, and
 * a press re-renders it with what the history held. So here React really
 * mounts the tool (react-dom/client on helpers/minimalDom.mjs) inside the
 * providers QuestionEngine opens for it (ToolRuntimeProvider,
 * WorkViewUndoProvider, ToolDraftScopeProvider), loaded through Vite SSR as
 * the draft tests load them, and undo() presses the controller the provider
 * hands QuestionEngine's Undo button.
 *
 * The test's own server adds two probes, seen in that server only:
 *
 *   undo     every useMathUndoHistory that keeps its history across a reload
 *            (`persist`), each render: its owner id, the key its history is
 *            saved under, the question's reset key, the state it records
 *            (the tool's answer as Undo sees it) and the keys of its
 *            `draftFields`; and the stack it read back when it mounted;
 *   hydrated what hydrateToolDraftField restored for each field of the tool's
 *            own draft (as toolDraftRender.mjs records it);
 *   checked  every draft a response module reads through
 *            checkedQuestionDraft.js (`asked`: its key, its starting value
 *            and the module's normalize, whether or not a draft is stored;
 *            `checked`: what was stored and what was restored, when one is);
 *            and every read of a draft that does NOT go through it
 *            (`direct`), with the file that made it, so a module reading
 *            storage unchecked is found.
 *
 * openModule() mounts one of the question engine's own response modules (the
 * multi-answer boxes, a table, a graph workspace, Step Algebra, a composed
 * workflow) the way QuestionEngine does, with `drafts` saved under its keys.
 *
 * Both handles also act as a student does first (interact.*): type into the
 * first box, press a button, and, for a module, the engine's Submit (the
 * module is drawn again with the attempt's feedback, as after a submit).
 * React's own handlers are called on the elements it rendered, since the
 * minimal document dispatches no events.
 *
 * Every error React reports while mounting or after a press is collected, as
 * QuestionModuleBoundary would catch it; nothing rejects.
 */
import { createServer } from 'vite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installMinimalDom } from './minimalDom.mjs';
import { REGISTRY_TOOL_QUESTIONS } from '../fixtures/registryToolQuestions.mjs';
import { PATH_TOOL_QUESTIONS } from '../fixtures/pathToolQuestions.mjs';
import { TOOL_DRAFT_EXTRA_SCENES } from '../fixtures/toolDraftScenes.mjs';
import { DRAFT_SCENES } from '../../browser/draftPersistenceScenes.mjs';

const PROBES = Symbol.for('mathmaster.toolUndoRender');

const probes = {
  name: 'tool-undo-render-probes',
  enforce: 'pre',
  transform(code, id) {
    const file = id.split('?')[0];
    const inject = (path, marker, line) => {
      if (!code.includes(marker)) throw new Error(`toolUndoRender: "${marker}" is not in ${path}; update the probes.`);
      code = code.replace(marker, `${marker}\n${line}`);
    };
    const probe = `globalThis[Symbol.for('mathmaster.toolUndoRender')]`;
    if (file.endsWith('/src/platform/workView/useMathUndoHistory.js')) {
      const path = 'useMathUndoHistory.js';
      inject(path, '  const stackRef = useRef(initialStack);',
        `  if (persist) ${probe}?.read?.({ ownerId, persistKey, stack: initialStack });`);
      inject(path, '  const canUndo = enabled && depth > 0;',
        `  if (persist) ${probe}?.undo?.({ ownerId, persistKey, resetKey, state, draftFields: typeof draftFields === 'object' && draftFields ? Object.keys(draftFields) : [] });`);
      return code;
    }
    if (file.endsWith('/src/tools/shared/usePersistentToolState.js')) {
      inject('usePersistentToolState.js', '  const result = hydrateToolDraftField({ record, field, initialValue, normalize });',
        `  ${probe}?.hydrated?.({ key, field, result });`);
      return code;
    }
    if (file.endsWith('/src/platform/persistence/checkedQuestionDraft.js')) {
      inject('checkedQuestionDraft.js', '  const stored = readQuestionDraft(key, null);',
        `  ${probe}?.asked?.({ key, field, fallback, normalize, stored });`);
      inject('checkedQuestionDraft.js', '  const result = hydrateToolDraftField({ record: { [field]: stored }, field, initialValue: () => fallback, normalize });',
        `  ${probe}?.checked?.({ key, field, fallback, normalize, stored, result });`);
      return code;
    }
    if (file.endsWith('/src/questionDraftStorage.js')) {
      inject('questionDraftStorage.js', 'export const readQuestionDraft = (key, fallback = null) => {',
        `  ${probe}?.read?.(key, new Error().stack);`);
      return code;
    }
    return null;
  },
};

const memoryStorage = () => {
  const values = new Map();
  return {
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => { values.set(key, String(value)); },
    removeItem: (key) => { values.delete(key); },
    clear: () => values.clear(),
  };
};
export const envelope = (value) => JSON.stringify({ version: 2, savedAt: Date.now(), touchedAt: Date.now(), value });

/** `cacheName`: one per test file, so two files run side by side never share a cache. */
export async function openToolUndoRenderer({ cacheName = 'tool-undo' } = {}) {
  const localStorage = memoryStorage();
  const restoreDom = installMinimalDom({ localStorage, sessionStorage: memoryStorage() });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  // After the document exists: react-dom decides at load whether it has one.
  const React = (await import('react')).default;
  const { createRoot } = await import('react-dom/client');
  const server = await createServer({
    root: fileURLToPath(new URL('../../../', import.meta.url)),
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: 'custom',
    logLevel: 'silent',
    // Outside the repository: lint scans the tree.
    cacheDir: join(tmpdir(), `mathmaster-vite-ssr-${cacheName}`),
    plugins: [probes],
  });
  const load = (path) => server.ssrLoadModule(path);
  const registry = await load('/src/tools/toolRegistry.js');
  const { ToolRuntimeProvider } = await load('/src/tools/shared/ToolRuntimeContext.jsx');
  const { ToolDraftScopeProvider } = await load('/src/tools/shared/usePersistentToolState.js');
  const { WorkViewUndoProvider } = await load('/src/platform/workView/useMathUndoHistory.js');
  const { mathematicalSnapshot } = await load('/src/platform/workView/mathUndoStack.js');
  const { SAMPLE_SPECS } = await load('/src/dev/MathToolsLab.jsx');
  const toolIds = registry.listTools().map((tool) => tool.toolId);
  // The same scenes, with the same ids, as toolDraftRender.mjs.
  const scene = (id, question) => Object.freeze({ prompt: 'Prompt.', ...question, questionId: id, id, toolId: question.type });
  const scenes = Object.freeze([
    ...toolIds.map((toolId) => scene(`sample:${toolId}`, { ...SAMPLE_SPECS[toolId], type: toolId })),
    ...Object.entries(REGISTRY_TOOL_QUESTIONS).map(([key, question]) => scene(`registry:${key}`, question)),
    ...Object.entries(PATH_TOOL_QUESTIONS).filter(([, question]) => toolIds.includes(question.type)).map(([key, question]) => scene(`path:${key}`, question)),
    ...TOOL_DRAFT_EXTRA_SCENES.map(({ id, ...question }) => scene(`extra:${id}`, question)),
    ...DRAFT_SCENES.filter(({ question }) => toolIds.includes(question.type)).map(({ id, question }) => scene(`journey:${id}`, question)),
  ]);

  // The boundary QuestionEngine draws its "could not be displayed" panel with.
  class Boundary extends React.Component {
    constructor(props) { super(props); this.state = { failed: false }; }
    static getDerivedStateFromError() { return { failed: true }; }
    render() { return this.state.failed ? React.createElement('p', null, 'This question could not be displayed') : this.props.children; }
  }
  const { act } = React;
  const settle = async () => {
    // A lazy tool resolves, then its effects and the timers they start run.
    for (let round = 0; round < 4; round += 1) await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 5); }); });
  };
  // React's and the tools' console output is kept out of the test's; what a
  // tool warns (a repaired draft or history says so) is kept on `warnings`.
  let warnings = [];
  const quietly = async (work) => {
    const error = console.error;
    const warn = console.warn;
    console.error = () => {};
    console.warn = (...args) => { warnings.push(args.join(' ')); };
    try { await work(); } finally { console.error = error; console.warn = warn; }
  };

  /*
   * WHAT A STUDENT DOES FIRST, ON WHAT REACT RENDERED (interact.*).
   *
   * The minimal document dispatches no events, so a box is typed into and a
   * button pressed by calling the handler React put on the element it
   * rendered: a native box's onChange with the typed value, a math box's
   * component's onChange (MathLive owns the element itself), a button's
   * onClick. That is the handler a student's keystroke or click reaches.
   */
  const reactKey = (node, prefix) => Object.keys(node).find((name) => name.startsWith(prefix));
  const propsOf = (node) => { const key = reactKey(node, '__reactProps$'); return key ? node[key] : null; };
  const elementsIn = (container) => {
    const found = [];
    const walk = (node) => (node.childNodes || []).forEach((child) => { if (child.nodeType === 1) { found.push(child); walk(child); } });
    walk(container);
    return found;
  };
  const event = (target) => ({
    target, currentTarget: target, type: 'synthetic', key: '', button: 0, pointerId: 1, clientX: 0, clientY: 0, detail: 1,
    preventDefault() {}, stopPropagation() {}, persist() {}, nativeEvent: { stopImmediatePropagation() {} }, isDefaultPrevented: () => false,
  });
  const TEXT_BOX = (node, props) => node.localName === 'math-field' || node.localName === 'textarea'
    || (node.localName === 'input' && !['radio', 'checkbox', 'range', 'button', 'submit', 'hidden'].includes(String(props.type || '').toLowerCase()));
  const labelOf = (node) => String(node.getAttribute('aria-label') || node.textContent || '').trim();
  // MathLive is not loaded here, so a math box's keypad has nothing to write
  // into: each math-field gets the two calls a keypad key makes on it
  // (MathInput.jsx insert), writing the key's text after what is there.
  const standInMathFields = (container) => elementsIn(container).forEach((node) => {
    if (node.localName !== 'math-field' || typeof node.insert === 'function') return;
    node.insert = (text) => { node.value = `${node.value || ''}${String(text).replace(/#[0-9?@]/g, '')}`; return true; };
    node.executeCommand = () => true;
  });
  const interactions = (container, step) => ({
    /** The boxes a student can type into, in order. */
    boxes: () => elementsIn(container).filter((node) => { const props = propsOf(node); return props && !props.disabled && !props.readOnly && TEXT_BOX(node, props); }),
    /** The buttons a student can press, in order (`skip`: labels left alone). */
    buttons: (skip = null) => elementsIn(container).filter((node) => {
      const props = propsOf(node);
      if (!props || props.disabled || String(props['aria-disabled']) === 'true' || typeof props.onClick !== 'function') return false;
      if (!(node.localName === 'button' || props.role === 'button' || props.role === 'radio')) return false;
      return !(skip && skip.test(labelOf(node)));
    }),
    /** Type `value` into the `index`-th box; false when there is none. */
    type: async (value, index = 0, boxes = null) => {
      const node = (boxes || elementsIn(container).filter((candidate) => { const props = propsOf(candidate); return props && !props.disabled && !props.readOnly && TEXT_BOX(candidate, props); }))[index];
      if (!node) return false;
      if (node.localName === 'math-field') {
        let fiber = node[reactKey(node, '__reactFiber$')]?.return;
        while (fiber && !(typeof fiber.type === 'function' && typeof fiber.memoizedProps?.onChange === 'function')) fiber = fiber.return;
        if (!fiber) return false;
        await step(() => fiber.memoizedProps.onChange(value));
        return true;
      }
      const props = propsOf(node);
      node.value = value;
      await step(() => { props.onChange?.(event(node)); props.onInput?.(event(node)); });
      return true;
    },
    /** Press `node` (a button found by buttons()); returns its label. */
    press: async (node) => {
      if (!node) return null;
      standInMathFields(container);
      const props = propsOf(node);
      await step(() => { props.onPointerDown?.(event(node)); props.onClick(event(node)); });
      return labelOf(node);
    },
  });
  // The reads that check what they read back before anything draws it.
  const CHECKED_READERS = ['/src/platform/persistence/checkedQuestionDraft.js', '/src/tools/shared/usePersistentToolState.js', '/src/platform/workView/persistedMathUndo.js'];
  // The chrome a student's first press is not: Undo, a hint, a view control.
  const NOT_WORK = /undo|reset|start over|clear|remove|delete|hint|enlarge|about|how to|hide|show math|close|cancel|full screen|zoom|read aloud|translate|vocabulary/i;

  let opened = 0;
  /**
   * Open `question` with `record` as its saved work (or none) under `draftKey`
   * (a fresh one when omitted). `owners` maps each persisted Undo owner to its
   * latest probe; `read` to the stack it read back when it mounted.
   */
  const open = async (question, { record = null, draftKey = null } = {}) => {
    opened += 1;
    const key = draftKey || `tool-undo-test-${opened}`;
    const workKey = `${key}:work:tool`;
    if (record) localStorage.setItem(workKey, envelope(record));
    const owners = new Map();
    const read = new Map();
    const hydrated = [];
    const errors = [];
    warnings = [];
    const warned = warnings;
    let controller = null;
    globalThis[PROBES] = {
      undo: (entry) => { owners.set(entry.ownerId, entry); },
      read: (entry) => { read.set(entry.ownerId, entry); },
      hydrated: (entry) => { if (entry.key === workKey) hydrated.push(entry); },
    };
    const toolId = question.toolId || question.type;
    await registry.prefetchTool(toolId);
    const Tool = registry.getToolDefinition(toolId).component;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container, { onCaughtError: (error) => errors.push(error), onUncaughtError: (error) => errors.push(error) });
    await quietly(async () => {
      try {
        await act(async () => {
          root.render(React.createElement(Boundary, null,
            React.createElement(ToolRuntimeProvider, { showImmediateFeedback: true },
              React.createElement(WorkViewUndoProvider, { register: (next) => { controller = next; }, resetKey: `${question.questionId}|0` },
                React.createElement(ToolDraftScopeProvider, { draftKey: key },
                  React.createElement(Tool, { questionData: question, onAction() {}, draftKey: key }))))));
        });
        await settle();
      } catch (error) { errors.push(error); }
    });
    // What the tool showed when it was closed; text() reads it after close().
    let shown = null;
    const act1 = async (work) => {
      await quietly(async () => {
        try {
          await act(async () => { await work(); });
          await settle();
        } catch (error) { errors.push(error); }
      });
    };
    const student = interactions(container, act1);
    return {
      interact: { ...student, NOT_WORK },
      draftKey: key,
      owners,
      read,
      hydrated,
      errors,
      warnings: warned,
      canUndo: () => Boolean(controller?.canUndo),
      /** Press the platform Undo once. */
      undo: async () => {
        await quietly(async () => {
          try {
            await act(async () => { controller?.onUndo?.(); });
            await settle();
          } catch (error) { errors.push(error); }
        });
      },
      text: () => shown ?? container.textContent,
      close: async () => {
        shown = container.textContent;
        await quietly(async () => { await act(async () => { root.unmount(); }); });
        container.remove();
        delete globalThis[PROBES];
      },
    };
  };

  /**
   * Mount the response module at `path` (its default export) as QuestionEngine
   * does, for `question`, with `drafts` ({ ':multi-answer': value }) saved
   * under its draft key. `props` are added to the engine's; `render`
   * ({ Module, h, draftKey, ... }) draws the element instead, for a module
   * that takes other props. `checked` lists every
   * checked read; `direct` every draft read that skipped the check, with the
   * file that made it; `hydrated` each draft-backed field of a tool scope in
   * it (the lab's); `states` what the module reported.
   */
  const openModule = async (path, { question = null, props = {}, drafts = {}, raw = {}, draftKey = null, render = null } = {}) => {
    opened += 1;
    const key = draftKey || `mathmaster:draft:v2::module-test:module-test:${opened}:0:student`;
    Object.entries(drafts).forEach(([suffix, value]) => localStorage.setItem(`${key}${suffix}`, envelope(value)));
    Object.entries(raw).forEach(([suffix, value]) => localStorage.setItem(`${key}${suffix}`, value));
    const asked = [];
    const checked = [];
    const direct = [];
    const hydrated = [];
    const states = [];
    const errors = [];
    warnings = [];
    const warned = warnings;
    let controller = null;
    globalThis[PROBES] = {
      asked: (entry) => { if (String(entry.key).startsWith(key)) asked.push(entry); },
      checked: (entry) => { if (String(entry.key).startsWith(key)) checked.push(entry); },
      hydrated: (entry) => { if (String(entry.key).startsWith(key)) hydrated.push(entry); },
      read: (readKey, stack) => {
        if (!String(readKey || '').startsWith(key)) return;
        const frames = String(stack).split('\n').filter((line) => line.includes('/src/'));
        // The first caller outside the storage module: one of the checked
        // reads (a module's draft, a registry tool's record, a saved Undo
        // history), or a module reading storage directly.
        const caller = frames.find((line) => !line.includes('/src/questionDraftStorage.js')) || '';
        if (CHECKED_READERS.some((file) => caller.includes(file))) return;
        const file = (caller.match(/\/src\/[^?):]+/) || [''])[0];
        direct.push({ key: String(readKey).slice(key.length), file });
      },
    };
    const { default: Module } = await load(path);
    const onUndoStateChange = (next) => { controller = next; };
    const onStateChange = (state) => { states.push(state); };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container, { onCaughtError: (error) => errors.push(error), onUncaughtError: (error) => errors.push(error) });
    const element = (extra = {}) => React.createElement(Boundary, null,
      React.createElement(ToolRuntimeProvider, { showImmediateFeedback: true },
        React.createElement(WorkViewUndoProvider, { register: (next) => { if (next) controller = next; }, resetKey: `${question?.questionId || path}|0` },
          React.createElement(ToolDraftScopeProvider, { draftKey: key },
            render
              ? render({ Module, h: React.createElement, draftKey: key, onStateChange, onUndoStateChange, ...extra })
              : React.createElement(Module, { question, draftKey: key, onStateChange, onUndoStateChange, feedback: null, disabled: false, ...props, ...extra })))));
    const step = async (work) => {
      await quietly(async () => {
        try {
          await act(async () => { await work(); });
          await settle();
        } catch (error) { errors.push(error); }
      });
    };
    await step(() => root.render(element()));
    let shown = null;
    const student = interactions(container, step);
    return {
      draftKey: key,
      asked,
      checked,
      direct,
      hydrated,
      states,
      errors,
      warnings: warned,
      interact: {
        ...student,
        NOT_WORK,
        /** Press the platform Undo once, when the module offers it. */
        undo: async () => {
          if (!controller?.canUndo) return false;
          await step(() => controller.onUndo?.());
          return true;
        },
        /** Submit as QuestionEngine does: the module drawn again with the attempt's verdict. */
        submit: async () => {
          const parts = Array.isArray(states.at(-1)?.parts) ? states.at(-1).parts : [];
          await step(() => root.render(element({ feedback: { isCorrect: false, partGrades: parts.map((part) => ({ ...part, isCorrect: false })) } })));
          return true;
        },
      },
      /** The draft stored under `suffix` now. */
      stored: (suffix) => { const value = localStorage.getItem(`${key}${suffix}`); return value === null ? undefined : JSON.parse(value).value; },
      text: () => shown ?? container.textContent,
      close: async () => {
        if (shown !== null) return;
        shown = container.textContent;
        await quietly(async () => { await act(async () => { root.unmount(); }); });
        container.remove();
        delete globalThis[PROBES];
      },
    };
  };

  /** Save `entries` as `owner`'s Undo history, ending at the state it showed. */
  const saveHistory = (owner, entries) => {
    localStorage.setItem(owner.persistKey, envelope({ resetKey: owner.resetKey, snapshot: mathematicalSnapshot(owner.state), entries }));
  };

  return {
    scenes,
    open,
    openModule,
    saveHistory,
    load,
    localStorage,
    mathematicalSnapshot,
    close: async () => { await server.close(); restoreDom(); },
  };
}

export const errorText = (result) => result.errors.map((error) => String(error?.message || error));
