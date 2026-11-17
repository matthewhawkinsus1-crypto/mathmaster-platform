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
 *            own draft (as toolDraftRender.mjs records it).
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
    return {
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

  /** Save `entries` as `owner`'s Undo history, ending at the state it showed. */
  const saveHistory = (owner, entries) => {
    localStorage.setItem(owner.persistKey, envelope({ resetKey: owner.resetKey, snapshot: mathematicalSnapshot(owner.state), entries }));
  };

  return {
    scenes,
    open,
    saveHistory,
    load,
    localStorage,
    mathematicalSnapshot,
    close: async () => { await server.close(); restoreDom(); },
  };
}

export const errorText = (result) => result.errors.map((error) => String(error?.message || error));
