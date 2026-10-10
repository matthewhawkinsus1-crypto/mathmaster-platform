/*
 * THE CLOSED QUESTION'S VERDICT CHIP COVERS NOTHING (release-candidate QA m7).
 *
 * "Incorrect — review below" / "Almost — review below" used to float over the
 * question's top-right corner (position absolute, top 12, right 12). There it
 * sat on "⤢ Enlarge question" and on the multi-part "Complete Each Part"
 * heading at 1366x768 and 390x844. It is now the first row of the work, in the
 * flow, stopping short of the opener and at least as tall as the opener's
 * bottom edge — so neither the chip nor anything below it starts under the
 * button.
 *
 * Node cannot render React, so this binds the placement to the source; the
 * rendered geometry is proved by tests/browser/closedVerdictChip.mjs at both
 * viewports.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (relativePath) => readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
const engine = executableSource(read('src/QuestionEngine.jsx'));

const CHIP_LABEL = "aria-label={expiredAlmost ? 'Almost' : 'Incorrect'}";
const GATE = '{isExpired && showOutcomeFeedback && (';

// From the chip's own gate to the end of its wording: the whole chip.
const chipBlock = () => {
  const label = engine.indexOf(CHIP_LABEL);
  assert.notEqual(label, -1, 'the verdict chip is rendered');
  const gate = engine.lastIndexOf(GATE, label);
  assert.notEqual(gate, -1, 'the verdict chip has its closed-question gate');
  return region(engine.slice(gate), GATE, "' — review below' : ''}", 'the verdict chip');
};

test('the verdict chip is shown only once the question is closed and outcome feedback is allowed', () => {
  const block = chipBlock();
  // Nothing between the gate and the chip opens another condition: the gate
  // that encloses the chip is exactly "closed (out of attempts) and outcome
  // feedback allowed" — a DOL or an open item never shows it.
  assert.doesNotMatch(block.slice(GATE.length), /\{[^{}]*&&\s*\(/, 'no other condition sits between the gate and the chip');
  assert.match(block, /role="status"/);
  // The region ends at "' — review below' : ''}", so its wording is part of the match.
  assert.match(block, /\{expiredAlmost \? 'Almost' : 'Incorrect'\}\{reviewAvailable && feedbackOpen \? $/);
  // One chip, not a second copy left floating somewhere else.
  assert.equal(engine.split(CHIP_LABEL).length - 1, 1);
});

test('the verdict chip is in the flow, never floated over the work', () => {
  const block = chipBlock();
  assert.doesNotMatch(block, /position:\s*'(absolute|fixed|sticky)'/, 'the chip is not positioned over other content');
  assert.doesNotMatch(block, /pointerEvents:\s*'none'/, 'an in-flow chip has nothing to let clicks through to');
  // It leaves the opener its width and its height.
  assert.match(block, /marginRight:\s*'var\(--mm-work-view-opener-space, 0px\)'/);
  assert.match(block, /minHeight:\s*'var\(--mm-work-view-opener-bottom, 0px\)'/);
});

test('the verdict chip is the first row of the question workspace, above the work', () => {
  const workspace = region(engine, 'className="mathmaster-question-tool-workspace"', '{!solverWorkspaceActive && guidedCoach}', 'the top of the question workspace');
  assert.ok(workspace.includes(CHIP_LABEL), 'the chip opens the workspace, before the coach, hints and the tool');
  // The space it reserves is the space EnlargeableFigure measures and publishes.
  const figure = executableSource(read('src/components/common/EnlargeableFigure.jsx'));
  assert.match(figure, /surface\.style\.setProperty\('--mm-work-view-opener-space', `\$\{Math\.ceil\(opener\.offsetWidth\) \+ 16\}px`\);/);
  assert.match(figure, /surface\.style\.setProperty\('--mm-work-view-opener-bottom', `\$\{Math\.ceil\(opener\.offsetTop \+ opener\.offsetHeight\)\}px`\);/);
});
