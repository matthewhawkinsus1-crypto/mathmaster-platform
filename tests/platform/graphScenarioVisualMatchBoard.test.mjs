import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import graphScenarioMatchGrader from '../../functions/shared/serverGrading/tools/graphScenarioMatch.mjs';
import { scenarioMatchWork } from '../../functions/shared/toolMath/scenario/scenarioWork.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

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

/*
 * Disconnecting and reassigning only edits the board's { scenarioId: graphId }
 * state; every verdict is computed from that state against the question's key
 * by the shared grader (serverGrading/tools/graphScenarioMatch.mjs), the same
 * function the server runs. The per-scenario comparison used to be inline in
 * this component; it moved, intact, into the grader.
 */
test('matched cards can be disconnected and reassigned without changing grading data', () => {
  assert.match(source, /Disconnect/);
  assert.match(source, /assignGraph\(scenario\.id, ''\)/);

  // The board grades its own matches — nothing else — through the shared grader.
  const code = executableSource(source);
  const grading = region(code, 'const work = useMemo(', 'const matchedCount', 'the board grading');
  assert.match(grading, /const work = useMemo\(\(\) => scenarioMatchWork\(matches\), \[matches\]\);/);
  assert.match(grading, /gradeToolCheck\(graphScenarioMatchGrader, question, work\)/);
  assert.match(code, /^import graphScenarioMatchGrader from '\.\.\/functions\/shared\/serverGrading\/tools\/graphScenarioMatch\.mjs';$/m);

  // And the grader marks each scenario by its CURRENT match against the key:
  // a disconnected-then-reassigned board grades exactly like one matched directly.
  const question = {
    type: 'graphScenarioMatch',
    scenarios: [{ id: 's1' }, { id: 's2' }],
    graphs: [{ id: 'g1', graph: {} }, { id: 'g2', graph: {} }],
    correctMatches: { s1: 'g1', s2: 'g2' },
  };
  const grade = (matches) => gradeToolCheck(graphScenarioMatchGrader, question, scenarioMatchWork(matches));
  const direct = grade({ s1: 'g1', s2: 'g2' });
  assert.equal(direct.isCorrect, true);
  const swapped = grade({ s1: 'g2', s2: 'g1' });
  assert.equal(swapped.isCorrect, false);
  assert.deepEqual(swapped.parts.map((part) => part.isCorrect), [false, false]);
  const disconnected = grade({ s2: 'g2' });
  assert.equal(disconnected.isComplete, false);
  assert.deepEqual(disconnected.parts.map((part) => [part.id, part.isComplete, part.isCorrect]), [['match:s1', false, false], ['match:s2', true, true]]);
  const reassigned = grade({ s2: 'g2', s1: 'g1' });
  assert.deepEqual(
    reassigned.parts.map((part) => [part.id, part.isCorrect]),
    direct.parts.map((part) => [part.id, part.isCorrect]),
  );
  assert.equal(reassigned.isCorrect, true);
});
