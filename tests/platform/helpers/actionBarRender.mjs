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

let renderer = null;

export const loadEngine = async () => {
  if (renderer) return renderer;
  const { createServer } = await import('vite');
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  const engine = await server.ssrLoadModule('/src/QuestionEngine.jsx');
  renderer = { server, QuestionEngine: engine.default };
  return renderer;
};

export const closeEngine = async () => {
  const current = renderer;
  renderer = null;
  await current?.server.close();
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
  try {
    const errors = [];
    const { prelude } = await prerenderToNodeStream(React.createElement(QuestionEngine, {
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
    }), { onError: (error) => { errors.push(error); } });
    let html = '';
    for await (const chunk of prelude) html += chunk;
    return { html, errors };
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
