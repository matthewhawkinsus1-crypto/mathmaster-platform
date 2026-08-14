import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('assignment navigation merges section tabs, numbered question jumps, and next/previous controls', async () => {
  const [app, css] = await Promise.all([
    read('src/App.jsx'),
    read('src/App.css'),
  ]);

  assert.match(app, /mathmaster-assignment-unified-nav/);
  assert.match(app, /mathmaster-section-tab/);
  assert.match(app, /mathmaster-question-number/);
  assert.match(app, /sectionNavigationTarget/);
  assert.match(app, /status !== 'correct'/);
  assert.match(app, /disabled=\{!sectionAvailable\}/);
  assert.match(app, /disabled=\{!available\}/);
  assert.match(app, /mathmaster-unified-question-controls/);
  assert.match(css, /mathmaster-section-tab\.is-locked/);
  assert.match(css, /mathmaster-question-number\.is-current/);
  assert.match(css, /mathmaster-question-number\.is-correct/);
  assert.match(css, /mathmaster-question-number\.is-attempted/);
});
