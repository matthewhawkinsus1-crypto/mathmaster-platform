/*
 * The real QuestionEngine, prerendered through Vite (it is .jsx), for tests of
 * what its action bar, tries strip and results area say (student pass 3,
 * Batch 5). Static markup only: no effects run, so this is the first render a
 * student sees for a given record.
 */
import React from 'react';
import { prerenderToNodeStream } from 'react-dom/static';
import { getEffectiveActivityPolicy } from '../../../src/platform/policies/activityPolicies.js';
import { resolveQuestionMaximumAttempts } from '../../../src/attemptPolicy.js';
import { within } from './boundedWait.mjs';

/*
 * ONE SERVER PER TEST FILE, NOTHING IT DOES NOT NEED, AND NEVER LEFT OPEN.
 *
 * toolWordsMatchButton.test.mjs (TL29) hung a full `npm run test:platform`
 * for 25 minutes. A server whose first load failed was never kept, so
 * closeEngine closed only the next one: the first one's file watcher, one
 * handle for each of about 6,400 files and folders of the repository, kept
 * the process alive with nothing left to do, and `node --test` waited for the
 * file forever, its failure never reported. The server is now closed when its
 * first load fails, and has no watcher, no hot-reload socket and no
 * dependency optimizer to keep a process alive: they serve a browser that
 * never connects. The optimizer also cost the most under load: in each test
 * file it scanned every page of the repository and bundled 13 packages on
 * the test's own thread (45–80 s at a load of 48), and a server with another
 * plugin list (figureCapture.mjs, toolTableReadings.test.mjs beside TL29)
 * deleted the cache these servers share and started its own. Every wait on
 * the server is bounded (boundedWait.mjs), so a load that never ends fails
 * the test, naming what it waited for.
 */
let renderer = null;

export const loadEngine = async () => {
  if (renderer) return renderer;
  const { createServer } = await import('vite');
  const server = await within(createServer({
    server: { middlewareMode: true, ws: false, hmr: false, watch: null },
    appType: 'custom',
    logLevel: 'silent',
    // Not `noDiscovery` alone: the React plugin adds four packages to
    // `include`, which leaves an optimizer that bundles them as the server
    // starts, into the same shared cache. Vite 8 still reads `disabled: true`
    // as discovery off and `include` cleared after the plugins (with a
    // deprecation warning this silent server does not print).
    optimizeDeps: { disabled: true },
  }), 'starting the Vite dev server');
  // A test loads further modules through this server; each load is bounded too.
  const load = server.ssrLoadModule.bind(server);
  server.ssrLoadModule = (url, options) => within(load(url, options), `loading ${url} through Vite`);
  try {
    const engine = await server.ssrLoadModule('/src/QuestionEngine.jsx');
    renderer = { server, QuestionEngine: engine.default };
    return renderer;
  } catch (error) {
    await within(server.close(), 'closing the Vite dev server after a failed load').catch(() => {});
    throw error;
  }
};

export const closeEngine = async () => {
  const current = renderer;
  renderer = null;
  if (current) await within(current.server.close(), 'closing the Vite dev server');
};

const memoryStorage = () => {
  const values = new Map();
  return {
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => { values.set(key, String(value)); },
    removeItem: (key) => { values.delete(key); },
  };
};

export const LITERAL_QUESTION = Object.freeze({
  id: 'b5-literal',
  questionId: 'b5-literal',
  type: 'literal',
  prompt: 'Write 6/8 in lowest terms.',
  answer: '3/4',
});

export const CHOICE_QUESTION = Object.freeze({
  id: 'b5-choice',
  questionId: 'b5-choice',
  type: 'multipleChoice',
  prompt: 'Which is equal to 6/8?',
  options: ['3/4', '2/3', '4/3'],
  answer: '3/4',
});

/**
 * Render one question as App.jsx's assignment player mounts it, for an
 * activity role and a record. Returns { html, errors }.
 */
export const renderEngine = async ({ question = LITERAL_QUESTION, role = 'classwork', record = {}, props = {} } = {}) => {
  const { QuestionEngine } = await loadEngine();
  const policy = getEffectiveActivityPolicy(role);
  const previous = globalThis.window;
  globalThis.window = { localStorage: memoryStorage(), sessionStorage: memoryStorage(), addEventListener() {}, removeEventListener() {} };
  // The render waits for the engine's lazy parts; it is bounded like a load.
  const stop = new AbortController();
  try {
    const errors = [];
    const rendered = prerenderToNodeStream(React.createElement(QuestionEngine, {
      question,
      questionRecord: { status: 'unattempted', attemptCount: 0, totalAttempts: 0, variantIndex: 0, ...record },
      generationKey: `${question.id}|0`,
      onGrade: async () => null,
      activityRole: role,
      activityPolicy: policy,
      maximumAttempts: resolveQuestionMaximumAttempts({ question, maximumAttempts: policy.attempts, activityPolicy: policy }),
      draftKey: `b5:${question.id}`,
      assignmentId: 'b5-assignment',
      executionScope: 'student',
      ...props,
    }), { onError: (error) => { errors.push(error); }, signal: stop.signal });
    const html = await within((async () => {
      const { prelude } = await rendered;
      let markup = '';
      for await (const chunk of prelude) markup += chunk;
      return markup;
    })(), `rendering QuestionEngine (${question.type}), which waits for its lazy parts' code`);
    return { html, errors };
  } catch (error) {
    stop.abort();
    throw error;
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
};

/** The action bar's Submit button: its accessible name, visible words and state. */
export const submitButton = (html) => {
  const match = html.match(/<button[^>]*class="mathmaster-bar-submit[^"]*"[^>]*>([\s\S]*?)<\/button>/);
  if (!match) return null;
  const tag = match[0].slice(0, match[0].indexOf('>') + 1);
  const attr = (name) => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? null;
  return {
    name: attr('aria-label'),
    className: attr('class'),
    cost: attr('data-try-cost'),
    disabled: /\sdisabled=""/.test(tag),
    inner: match[1],
  };
};

export const decode = (text) => String(text ?? '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
