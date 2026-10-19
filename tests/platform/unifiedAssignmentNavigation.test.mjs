import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { region } from './helpers/sourceContract.mjs';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('assignment navigation merges section tabs, numbered question jumps, and next/previous controls', async () => {
  const [app, css] = await Promise.all([
    read('src/App.jsx'),
    read('src/App.css'),
  ]);

  assert.match(app, /mathmaster-assignment-unified-nav/);
  assert.match(app, /mathmaster-section-tab/);
  assert.match(app, /mathmaster-question-number/);
  // A section tab lands through the navigator model (sectionLandingEntry: the
  // first workable question not finished — pass 3, RUN-9), fed what each
  // entry can do and its state.
  const target = region(app, 'const sectionNavigationTarget = (section) => sectionLandingEntry({', 'currentIndex: currentQuestionIndex,', 'the section tab target');
  assert.match(target, /viewable: entryIsAvailable\(entry\)/);
  assert.match(target, /workable: entryIsWorkableNow\(entry\)/);
  assert.match(target, /status: navigatorQuestionFor\(entry\)\.status/);
  // A locked tab stays focusable and says why (RUN-8); a locked number is disabled.
  assert.match(app, /aria-disabled=\{sectionAvailable \? undefined : 'true'\}/);
  assert.match(app, /aria-describedby=\{access\.reason \? reasonId : undefined\}/);
  assert.match(app, /disabled=\{!available\}/);
  assert.match(app, /mathmaster-unified-question-controls/);
  assert.match(css, /mathmaster-section-tab\.is-locked/);
  assert.match(css, /mathmaster-question-number\.is-current/);
  assert.match(css, /mathmaster-question-number\.is-correct/);
  // One class per navigator state (QUESTION_STATUS): try again, closed, and
  // held feedback's neutral "submitted".
  assert.match(app, /className=\{`mathmaster-question-number is-\$\{shown\.status\}/);
  assert.match(css, /mathmaster-question-number\.is-tryAgain/);
  assert.match(css, /mathmaster-question-number\.is-closed/);
  assert.match(css, /mathmaster-question-number\.is-submitted/);
});
