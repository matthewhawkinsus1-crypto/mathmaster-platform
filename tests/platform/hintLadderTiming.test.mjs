/*
 * A HINT ASKED FOR AS THE TOOL LOADS IS THE TOOL'S (hint-ladder timing).
 *
 * A registry tool's chunk loads after the question (toolRegistry.js lazy), and
 * its panels publish their rungs once it has mounted (toolHintChannel.js). For
 * the first second or so the ladder of an item with no hints of its own was
 * only the fallbacks, so a fast press opened "Underline what the question asks
 * you to find…" where a press a second later opened the tool's own first rung.
 * Every tool did this. Now:
 *   - a press counts at once, as every press does: the count, hintUsed (what
 *     the teacher and the attempt see) and the cost are the same;
 *   - a fallback it opens while the tool's rungs are on their way is pending:
 *     the panel says the hint is loading, never the fallback, and once the
 *     rungs are here it is the rung a press then would open, kept as read;
 *   - an authored or family rung is decided at once, as before: a tool's rungs
 *     come after it;
 *   - a tool that takes too long, or fails to load, gives the fallback.
 * The browser driver (tests/browser/hintsThatFit.mjs, "a press as the tool
 * mounts") presses before the Polynomial Workshop and the Systems Workspace
 * load, on a laptop and a phone.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

import { executableSource, region } from './helpers/sourceContract.mjs';
import { buildQuestionHints, hintLadderView, hintRelease } from '../../src/platform/supports/hints/questionHints.js';
import { PENDING_RUNG_TEXT } from '../../src/platform/supports/hints/hintCopy.js';
import { addSubtractKey } from '../../src/tools/polynomialWorkshop/polynomialMath.js';
import { addSubtractHints } from '../../src/tools/polynomialWorkshop/addSubtractHints.js';
import { getPlatformQuestionFamily } from '../../functions/shared/questionFamilyRegistry.mjs';
import { resolveFamilyConstraints } from '../../functions/shared/questionFamilyContract.mjs';
import { buildFamilyQuestion, createFamilyInstanceSequence } from '../../functions/shared/questionFamilyEngine.mjs';

const engine = executableSource(readFileSync(new URL('../../src/QuestionEngine.jsx', import.meta.url), 'utf8'));

// A Recovery version of Operations on Polynomials' exit ticket 1: a Polynomial
// Workshop item with no hints of its own, so the Workshop's rungs are its ladder.
const recoveryItem = () => {
  const family = getPlatformQuestionFamily('polynomials.subtractMissingTerm');
  const { values } = resolveFamilyConstraints(family, {});
  const instance = createFamilyInstanceSequence(family, values, 'hint-ladder-timing').instanceAt(0);
  return buildFamilyQuestion({ family, instance, constraintValues: values, authored: { questionId: 'hint-ladder-timing' }, tool: family.defaultTool });
};
const ITEM = recoveryItem();
const RUNGS = addSubtractHints(addSubtractKey(ITEM));
const BEFORE = buildQuestionHints(ITEM);
const AFTER = buildQuestionHints(ITEM, { toolHints: RUNGS });
const releaseOf = (view, attemptCount = 0) => hintRelease({ hints: view.hints, revealed: view.revealed, attemptCount });

test('the item is one the defect reached: only fallbacks before the Workshop mounts, its own rungs after', () => {
  assert.equal(ITEM.type, 'polynomialWorkshop');
  assert.ok(BEFORE.length && BEFORE.every((hint) => hint.source === 'generic'), BEFORE.map((hint) => hint.source).join());
  assert.deepEqual(AFTER.map((hint) => hint.text), RUNGS, 'the Workshop\'s rungs, written for this item');
  assert.ok(AFTER.every((hint) => hint.source === 'tool'));
});

test('a fallback asked for before the tool\'s rungs arrive is pending, in its place in the count', () => {
  // The press as QuestionEngine makes it then: counted, no text kept.
  const waiting = hintLadderView({ ladder: BEFORE, revealedTexts: [], revealedCount: 1, toolRungsPending: true });
  assert.equal(waiting.revealed, 1, 'the press is counted');
  assert.equal(waiting.hints[0].pending, true, 'and what it opened is not decided yet');
  assert.equal(waiting.hints.length, BEFORE.length);
  // The release rule reads it exactly as it reads the fallback it stands for.
  const asBefore = hintLadderView({ ladder: BEFORE, revealedTexts: [BEFORE[0]], revealedCount: 1 });
  assert.deepEqual(releaseOf(waiting), releaseOf(asBefore));
  assert.deepEqual(releaseOf(waiting, 1), releaseOf(asBefore, 1));
  // Once the tool has mounted, nothing is marked: the ladder is as it always was.
  assert.deepEqual(hintLadderView({ ladder: BEFORE, revealedTexts: [], revealedCount: 1 }).hints, BEFORE);
});

test('once the rungs arrive, the hint pressed for is the one a press then opens, and it is kept as read', () => {
  const late = hintLadderView({ ladder: AFTER, revealedTexts: [], revealedCount: 0 }).next;
  const arrived = hintLadderView({ ladder: AFTER, revealedTexts: [], revealedCount: 1 });
  assert.deepEqual(arrived.hints[0], late, 'the Workshop\'s first rung, not the fallback');
  assert.equal(arrived.hints[0].text, RUNGS[0]);
  assert.equal(arrived.revealed, 1, 'still one hint');
  // What QuestionEngine keeps as read then is that rung: a later stage of the
  // tool does not move it.
  const kept = arrived.hints.slice(0, arrived.revealed);
  const moved = hintLadderView({ ladder: [{ text: 'A later stage', source: 'tool' }], revealedTexts: kept, revealedCount: 1 });
  assert.equal(moved.hints[0].text, RUNGS[0]);
  // The next hint opens after a try, as it would have.
  assert.deepEqual(releaseOf(arrived), releaseOf(hintLadderView({ ladder: AFTER, revealedTexts: [late], revealedCount: 1 })));
  assert.equal(releaseOf(arrived).canRevealNext, false);
  assert.equal(releaseOf(arrived, 1).canRevealNext, true);
});

test('an authored or family rung is decided at once: the tool\'s rungs come after it', () => {
  const authored = { ...ITEM, hints: ['Line up the like terms first.'] };
  const view = hintLadderView({ ladder: buildQuestionHints(authored), revealedTexts: [], revealedCount: 1, toolRungsPending: true });
  assert.equal(view.hints[0].source, 'authored');
  assert.equal(view.hints[0].pending, undefined);
  assert.equal(buildQuestionHints(authored, { toolHints: RUNGS })[0].text, 'Line up the like terms first.', 'and stays first once they come');
});

test('in a pending rung\'s place the panel says the hint is loading, never the fallback, and says nothing about general hints yet', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const panel = await server.ssrLoadModule('/src/platform/supports/hints/HintPanel.jsx');
    const HintPanel = panel.default;
    const render = (view, props = {}) => renderToStaticMarkup(React.createElement(HintPanel, {
      hints: view.hints, revealed: view.revealed, release: releaseOf(view), onReveal: () => {}, askTeacher: { requested: false, onToggle: () => {} }, ...props,
    }));
    const waiting = render(hintLadderView({ ladder: BEFORE, revealedTexts: [], revealedCount: 1, toolRungsPending: true }), { rungsPending: true });
    assert.match(waiting, /<li data-hint-source="pending"[^>]*><span role="status">Loading the hint for this question…<\/span><\/li>/);
    assert.equal(PENDING_RUNG_TEXT, 'Loading the hint for this question…');
    assert.ok(!waiting.includes(BEFORE[0].text), 'the fallback is not shown');
    assert.doesNotMatch(waiting, /data-hint-fallback-ask/, 'nor the pointer that says the hints are general');
    assert.doesNotMatch(waiting, /Try again with that hint/, 'the next-try line waits for the hint it speaks of');
    assert.match(waiting, /Hints never lower your grade\. Your teacher can see you used one\./, 'the cost is said as ever');
    // Before any press, while the rungs are on their way: the offer, no pointer.
    const opened = render(hintLadderView({ ladder: BEFORE, revealedTexts: [], revealedCount: 0, toolRungsPending: true }), { rungsPending: true });
    assert.match(opened, />Show a hint<\/button>/);
    assert.doesNotMatch(opened, /data-hint-fallback-ask/);
    // The rungs here: the Workshop's first, as a press then shows it.
    const arrived = render(hintLadderView({ ladder: AFTER, revealedTexts: [], revealedCount: 1 }));
    assert.match(arrived, /<li data-hint-source="tool"/);
    assert.doesNotMatch(arrived, /data-hint-source="pending"|Loading the hint/);
    assert.match(arrived, /Try again with that hint/);
    // A tool with no rungs: the fallback, and the pointer, as before.
    const none = render(hintLadderView({ ladder: BEFORE, revealedTexts: [], revealedCount: 1 }));
    assert.ok(none.includes(BEFORE[0].text));
    assert.match(none, /data-hint-fallback-ask/);
    // The wait has an end: a tool that takes longer gets the rung the ladder has.
    assert.ok(panel.PENDING_RUNG_WAIT_MS >= 2000 && panel.PENDING_RUNG_WAIT_MS <= 8000, String(panel.PENDING_RUNG_WAIT_MS));
  } finally {
    await server.close();
  }
});

test('QuestionEngine waits for the registry tool it mounts, and only for it', () => {
  // The signal stands inside the tool's Suspense, after the tool: its effect
  // runs after every panel the tool mounted has published.
  const mount = region(engine, '<Suspense fallback={<p role="status" className="mathmaster-work-view-loading">', '</Suspense>', 'the registry tool mount');
  // (A JSX comment between them is left as "{ }" by executableSource.)
  assert.match(mount, /<Tool questionData=\{presentationQuestion\}[^>]*\/>\s*(?:\{\s*\}\s*)?<ToolRungsReadySignal question=\{processedQuestion\} onReady=\{setToolRungsReadyFor\} \/>/);
  const signal = region(engine, 'const ToolRungsReadySignal = ({ question, onReady }) => {', '};', 'the signal');
  assert.match(signal, /useEffect\(\(\) => \{\s*onReady\(question\);\s*\}, \[question, onReady\]\);/);
  // Pending: a registry tool, hints offered, not failed, not yet mounted with
  // this question.
  assert.match(engine, /\n\s*const toolRungsPending = Boolean\(missingToolDefinition\) && hintControlAllowed && !moduleFailed && toolRungsReadyFor !== processedQuestion;/);
  // Meanwhile no rung the channel holds is read, and the view marks what is owed.
  assert.match(engine, /buildQuestionHints\(processedQuestion, \{ toolHints: toolRungsPending \? \[\] : toolHints \}\)/);
  assert.match(engine, /hintLadderView\(\{ ladder: questionHints, revealedTexts: revealedHintTexts, revealedCount: hintsRevealed, toolRungsPending \}\)/);
  assert.match(engine, /rungsPending=\{toolRungsPending\}/);
});

test('a press while the rungs are on their way counts at once, and its rung is kept as read once they arrive', () => {
  const reveal = region(engine, 'const revealNextHint = (place) => {', '};', 'revealing a hint');
  // The count, hintUsed and the panel: on every press, before or after.
  assert.match(reveal, /\n\s*setHintsRevealed\(\(count\) => count \+ 1\);\s*recordHintUse\(\);\s*placeHintPanel\(place\);\s*setHintPanelOpen\(true\);/);
  // Only a fallback opened while pending waits; anything else is kept now.
  assert.match(reveal, /if \(toolRungsPending && next\.source === 'generic'\) toolRungsAwaited\.current = true;\s*else setRevealedHintTexts\(\(\) => \[\.\.\.hintLadder\.hints\.slice\(0, hintLadder\.revealed\), next\]\);/);
  // When the rungs arrive, what was read is kept as the ladder then gives it.
  const kept = region(engine, 'if (toolRungsPending || !toolRungsAwaited.current) return;', '}, [toolRungsPending]);', 'keeping the rung');
  assert.match(kept, /toolRungsAwaited\.current = false;\s*setRevealedHintTexts\(hintLadder\.hints\.slice\(0, hintLadder\.revealed\)\);/);
  // A new question starts with nothing awaited.
  assert.match(region(engine, 'setRevealedHintTexts([]);', 'setHintPanelOpen(false);', 'the reset'), /toolRungsAwaited\.current = false;/);
});
