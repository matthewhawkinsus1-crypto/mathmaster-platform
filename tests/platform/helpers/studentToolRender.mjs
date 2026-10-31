/*
 * Rendering what a student is shown, for the tests that read words
 * (studentRuntimeWords.test.mjs, studentToolWords.test.mjs): the real
 * components through Vite, as markup, with a browser that can speak.
 */
import { prerenderToNodeStream } from 'react-dom/static';

export const text = (markup) => markup.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

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

// A browser that can speak, with storage: what a tool or the tray reads.
export const withBrowser = async (run) => {
  const previous = globalThis.window;
  globalThis.window = {
    localStorage: memoryStorage(),
    sessionStorage: memoryStorage(),
    addEventListener() {},
    removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    innerWidth: 1366,
    innerHeight: 768,
    speechSynthesis: { cancel() {}, speak() {} },
    SpeechSynthesisUtterance: function Utterance() {},
  };
  try {
    return await run();
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
};

// Server render that waits for lazy components (the registry tools are lazy).
export const render = async (element) => {
  const { prelude } = await prerenderToNodeStream(element);
  let markup = '';
  for await (const chunk of prelude) markup += chunk;
  return markup;
};

export const buttonsOf = (markup) => [...markup.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map((match) => ({
  attrs: match[1],
  text: text(match[2]),
  name: /aria-label="([^"]*)"/.exec(match[1])?.[1] || text(match[2]),
  finalAction: /data-primary-answer-action|data-mm-enter-action="submit"|data-work-view-check/.test(match[1]),
}));
