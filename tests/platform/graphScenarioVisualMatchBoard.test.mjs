import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../src/GraphScenarioMatch.jsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../../src/GraphScenarioMatch.css', import.meta.url), 'utf8');

test('graph/scenario matching is a visual click-to-connect board instead of dropdown matching', () => {
  assert.match(source, /Visual Match Board/);
  assert.match(source, /Select a graph/);
  assert.match(source, /selectScenario/);
  assert.match(source, /graph-scenario-connector-layer/);
  assert.doesNotMatch(source, /<select/);
});

test('desktop keeps graph and scenario banks visible in independently scrollable panes', () => {
  assert.match(css, /grid-template-columns:\s*minmax\(0, 1fr\) 54px minmax\(0, 1fr\)/);
  assert.match(css, /height:\s*min\(72vh, 730px\)/);
  assert.match(css, /\.graph-scenario-bank[\s\S]*min-height:\s*0[\s\S]*height:\s*100%[\s\S]*overflow:\s*hidden/);
  assert.match(css, /\.graph-scenario-scroll-pane[\s\S]*height:\s*0[\s\S]*overflow-y:\s*scroll/);
  assert.match(source, /onWheel=\{handlePaneWheel\}/);
  assert.match(source, /onKeyDown=\{handlePaneKeyDown\}/);
});

test('students can zoom graphs without leaving the matching question', () => {
  assert.match(source, /Zoom/);
  assert.match(source, /graph-scenario-zoom-dialog/);
  assert.match(source, /event\.key === 'Escape'/);
});

test('mobile swaps connector lines for tap-to-pair cards and a horizontal graph rail', () => {
  assert.match(css, /@media \(max-width: 820px\), \(pointer: coarse\)/);
  assert.match(css, /graph-scenario-connector-layer,[\s\S]*display:\s*none/);
  assert.match(css, /overflow-x:\s*auto/);
  assert.match(source, /graph-scenario-mobile-match-summary/);
});

test('matched cards can be disconnected and reassigned without changing grading data', () => {
  assert.match(source, /Disconnect/);
  assert.match(source, /assignGraph\(scenario\.id, ''\)/);
  assert.match(source, /isCorrect: matches\[scenario\.id\] === correctMatches\[scenario\.id\]/);
});
