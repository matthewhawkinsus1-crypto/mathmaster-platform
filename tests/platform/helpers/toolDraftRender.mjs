/*
 * A REGISTRY TOOL OPENED ON A RESTORED DRAFT, FOR THE DRAFT-SHAPE TESTS.
 *
 * Rendered through Vite SSR, as a saved draft comes back on a reload: the
 * first render, the one that threw on every load while a damaged draft was
 * still saved (toolDraftShape.js). The test's own server adds three probes to
 * usePersistentToolState.js, seen in that server only:
 *
 *   field     every draft-backed field a render reaches: its name, its initial
 *             value, its `normalize`, and the tool file that declared it;
 *   hydrated  what hydrateToolDraftField restored for each field (value,
 *             issues), with the record it read;
 *   rawRecord a record handed to the in-memory cache as it is, for values JSON
 *             cannot carry (NaN, Infinity, undefined): a remount in the same
 *             session reads the cache, not storage.
 *
 * The scenes are every registry tool's preview-bench question, the captured
 * fixtures, the draft-persistence journey's questions and
 * fixtures/toolDraftScenes.mjs, each with a stable id.
 */
import React from 'react';
import { prerenderToNodeStream } from 'react-dom/static';
import { createServer } from 'vite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REGISTRY_TOOL_QUESTIONS } from '../fixtures/registryToolQuestions.mjs';
import { PATH_TOOL_QUESTIONS } from '../fixtures/pathToolQuestions.mjs';
import { TOOL_DRAFT_EXTRA_SCENES } from '../fixtures/toolDraftScenes.mjs';
import { DRAFT_SCENES } from '../../browser/draftPersistenceScenes.mjs';

const PROBES = Symbol.for('mathmaster.toolDraftRender');
const HOOK_FILE = '/src/tools/shared/usePersistentToolState.js';

const probes = {
  name: 'tool-draft-render-probes',
  enforce: 'pre',
  transform(code, id) {
    if (!id.split('?')[0].endsWith(HOOK_FILE)) return null;
    const inject = (marker, line) => {
      if (!code.includes(marker)) throw new Error(`toolDraftRender: "${marker}" is not in ${HOOK_FILE}; update the probes.`);
      code = code.replace(marker, `${marker}\n${line}`);
    };
    const probe = `globalThis[Symbol.for('mathmaster.toolDraftRender')]`;
    inject(
      'export default function usePersistentToolState(field, initialValue, options = {}) {',
      `  ${probe}?.field?.(field, typeof initialValue === 'function' ? initialValue() : initialValue, options, new Error().stack);`,
    );
    inject('const readRecord = (key) => {', `  { const raw = ${probe}?.rawRecord?.(key); if (raw) return { fields: raw, fresh: null }; }`);
    inject(
      '  const result = hydrateToolDraftField({ record, field, initialValue, normalize });',
      `  ${probe}?.hydrated?.({ key, field, record, initialValue, normalize, result });`,
    );
    return code;
  },
};

const memoryStorage = (seed = {}) => {
  const values = new Map(Object.entries(seed));
  return {
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => { values.set(key, String(value)); },
    removeItem: (key) => { values.delete(key); },
  };
};
export const envelope = (value) => JSON.stringify({ version: 2, savedAt: Date.now(), touchedAt: Date.now(), value });

// The tool file that declared a field, from the probe's stack.
const declaredIn = (stack) => {
  const frame = String(stack || '').split('\n').find((line) => line.includes('/src/tools/') && !line.includes('usePersistentToolState.js'));
  const match = frame && frame.match(/\/src\/tools\/([^?):]+)/);
  return match ? match[1] : null;
};

/** `cacheName`: one per test file, so two files run side by side never share a cache. */
export async function openToolDraftRenderer({ cacheName = 'tool-drafts' } = {}) {
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
  const { SAMPLE_SPECS } = await load('/src/dev/MathToolsLab.jsx');
  const toolIds = registry.listTools().map((tool) => tool.toolId);
  const scene = (id, question) => Object.freeze({ prompt: 'Prompt.', ...question, questionId: id, id, toolId: question.type });
  const scenes = Object.freeze([
    ...toolIds.map((toolId) => scene(`sample:${toolId}`, { ...SAMPLE_SPECS[toolId], type: toolId })),
    ...Object.entries(REGISTRY_TOOL_QUESTIONS).map(([key, question]) => scene(`registry:${key}`, question)),
    ...Object.entries(PATH_TOOL_QUESTIONS).filter(([, question]) => toolIds.includes(question.type)).map(([key, question]) => scene(`path:${key}`, question)),
    ...TOOL_DRAFT_EXTRA_SCENES.map(({ id, ...question }) => scene(`extra:${id}`, question)),
    ...DRAFT_SCENES.filter(({ question }) => toolIds.includes(question.type)).map(({ id, question }) => scene(`journey:${id}`, question)),
  ]);

  let opened = 0;
  /**
   * Open `question` on `record` (written to storage, as a reload reads it) or
   * on `raw` (handed to the cache as it is). Every error React reports is
   * collected; the render never rejects.
   */
  const open = async (question, { record = null, raw = null } = {}) => {
    opened += 1;
    const draftKey = `tool-draft-test-${opened}`;
    const key = `${draftKey}:work:tool`;
    const fields = [];
    const hydrated = [];
    const Tool = registry.getToolDefinition(question.toolId || question.type).component;
    const element = React.createElement(ToolRuntimeProvider, { showImmediateFeedback: true },
      React.createElement(ToolDraftScopeProvider, { draftKey },
        React.createElement(Tool, { questionData: question, onAction() {}, draftKey })));
    const previous = globalThis.window;
    globalThis.window = {
      localStorage: memoryStorage(record ? { [key]: envelope(record) } : {}),
      sessionStorage: memoryStorage(),
      addEventListener() {},
      removeEventListener() {},
      matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
      innerWidth: 1366,
      innerHeight: 768,
      requestAnimationFrame: () => 0,
      cancelAnimationFrame() {},
    };
    globalThis[PROBES] = {
      field: (name, initial, options, stack) => fields.push({ name, initial, normalize: options?.normalize ?? null, file: declaredIn(stack) }),
      hydrated: (entry) => { if (entry.key === key) hydrated.push(entry); },
      rawRecord: raw ? (candidate) => (candidate === key ? raw : null) : undefined,
    };
    // A repaired draft is reported once, as the student's console would.
    const warn = console.warn;
    const warnings = [];
    console.warn = (...args) => warnings.push(args.join(' '));
    const errors = [];
    let html = '';
    try {
      const { prelude } = await prerenderToNodeStream(element, { onError: (error) => { errors.push(error); } });
      for await (const chunk of prelude) html += chunk;
    } catch (error) {
      if (!errors.includes(error)) errors.push(error);
    } finally {
      console.warn = warn;
      delete globalThis[PROBES];
      if (previous === undefined) delete globalThis.window;
      else globalThis.window = previous;
    }
    return { html, errors, fields, hydrated, warnings };
  };

  return { scenes, open, load, toolIds, close: () => server.close() };
}

export const errorText = (result) => result.errors.map((error) => String(error?.message || error));
