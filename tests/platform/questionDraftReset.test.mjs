import assert from 'node:assert/strict';
import test from 'node:test';
import {
  readQuestionDraft,
  resetQuestionDraftFamily,
  subscribeToQuestionDrafts,
  writeQuestionDraft,
} from '../../src/questionDraftStorage.js';

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  get length() {
    return this.values.size;
  }

  key(index) {
    return [...this.values.keys()][index] ?? null;
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(String(key), String(value));
  }

  removeItem(key) {
    this.values.delete(String(key));
  }
}

test('resetQuestionDraftFamily tombstones the base and every nested workspace while leaving other questions alone', () => {
  const storage = new MemoryStorage();
  global.window = { localStorage: storage };

  const prefix = 'mathmaster:draft:v2::student:assignment:4:0:student';
  const stepAlgebra = `${prefix}:step-algebra`;
  const intercept = `${prefix}:linear-intercepts`;
  const other = 'mathmaster:draft:v2::student:assignment:5:0:student';

  writeQuestionDraft(prefix, { answer: 'old' });
  writeQuestionDraft(stepAlgebra, { equation: 'x=3' });
  writeQuestionDraft(intercept, { activeKind: 'y' });
  writeQuestionDraft(other, { answer: 'keep-me' });

  const resetEvents = [];
  const unsubscribe = subscribeToQuestionDrafts((entry) => resetEvents.push(entry));

  try {
    assert.equal(resetQuestionDraftFamily(prefix), 3);

    assert.equal(readQuestionDraft(prefix, 'fresh-base'), 'fresh-base');
    assert.equal(readQuestionDraft(stepAlgebra, 'fresh-step'), 'fresh-step');
    assert.equal(readQuestionDraft(intercept, 'fresh-intercept'), 'fresh-intercept');
    assert.deepEqual(readQuestionDraft(other, null), { answer: 'keep-me' });

    assert.deepEqual(
      resetEvents.map(({ key, value }) => ({ key, value })).sort((a, b) => a.key.localeCompare(b.key)),
      [
        { key: prefix, value: null },
        { key: intercept, value: null },
        { key: stepAlgebra, value: null },
      ].sort((a, b) => a.key.localeCompare(b.key)),
    );
  } finally {
    unsubscribe();
    delete global.window;
  }
});
