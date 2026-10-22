// ON A PHONE, THE GRAPH PANEL IS NOT PINNED OVER THE CONTROLS AFTER IT.
//
// Oct 15, 2026 (docs/qa/algebra1-m2t2-student-walkthrough.md, P0-1): the
// phone column pinned a graph tool's first panel (sticky, max-height 46dvh)
// inside a workspace that is only ~346px tall on a 390x844 phone. The pin was
// taller than the space it lived in, so it covered everything after it at
// every scroll position — on every Graphing item, the student's construction
// and its "Check construction" button. tests/browser/phoneToolPanelReach.mjs
// proves the controls are reachable by touch in a real browser; this file
// keeps the rule from coming back and keeps that browser gate running.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runsOnPullRequest } from './helpers/ciWorkflows.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const withoutComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

test('the phone column does not pin a graph tool panel', () => {
  const css = withoutComments(read('src/components/student/MathToolMobileLayout.css'));
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map(([, selector, body]) => ({ selector: selector.trim(), body }))
    .filter(({ selector }) => /\.mathmaster-tool-panel/.test(selector) && /mode-portrait|math-tool-workspace|tool-split/.test(selector));
  const pinned = rules.filter(({ body }) => /position\s*:\s*(sticky|fixed)/.test(body));
  assert.deepEqual(pinned.map(({ selector }) => selector.replace(/\s+/g, ' ')), [],
    'a pinned panel taller than the phone workspace covers every control after it');
});

test('the student-runtime gate taps every graph tool control on a phone', () => {
  const workflow = read('.github/workflows/student-runtime-browser-gates.yml');
  assert.match(workflow, /run: node tests\/browser\/phoneToolPanelReach\.mjs/);
  assert.ok(runsOnPullRequest('student-runtime-browser-gates.yml', 'tests/browser/phoneToolPanelReach.mjs'), 'a change to the gate runs it');
  assert.ok(runsOnPullRequest('student-runtime-browser-gates.yml', 'teacher-import-jsons/algebra1-module2-topic2/lesson.json'), 'the gate drives these lessons, so a change to them runs it');
  const gate = read('tests/browser/phoneToolPanelReach.mjs');
  assert.match(gate, /width: 390, height: 844/);
  assert.match(gate, /hasTouch: true/);
  assert.match(gate, /Check construction/);
  assert.match(gate, /process\.exit\(1\)/, 'a failure fails the job');
});
