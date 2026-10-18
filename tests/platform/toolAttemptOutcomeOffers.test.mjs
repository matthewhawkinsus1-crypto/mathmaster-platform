/*
 * STUDENT PASS 3, HELP-7 AND A11Y-1: A MISS IN A TOOL SAYS WHY, AND OFFERS WHAT
 * THE BOX BELOW A QUESTION OFFERS.
 *
 * When a registry tool showed its own verdict, the attempt's outcome moved into
 * the tool (PQ-022), and three things stayed behind in the box it replaced: the
 * hint the platform had ready ("A hint is ready if you want one."), Read aloud
 * and Translate for the feedback, and — for a screen reader — the tool's own
 * coaching. A blind student on Graphing heard "Not quite. You have 2 attempts
 * remaining on this version." and never "Point P1 is on the line, but the other
 * one is not." This file pins what the region says and offers (rendered), the
 * rule for the tool's words, the engine's hand-over, and that no tool keeps its
 * coaching where the region cannot read it. A plotted point is announced too:
 * Enter on a coordinate plane used to say nothing at all.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

import { executableSource, region } from './helpers/sourceContract.mjs';
import { verdictText, verdictTextLength, verdictWords } from '../../src/tools/shared/verdictShape.js';
import { describePlot } from '../../src/tools/shared/plotAnnouncement.js';

const ROOT = new URL('../../', import.meta.url);
const code = (path) => executableSource(readFileSync(new URL(path, ROOT), 'utf8'));

const withToolShell = async (run) => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    // Translate is offered only once MathMaster knows it can translate
    // (SupportedText.jsx, pass 3 HELP-3): with the student's pack loaded,
    // that is known on the first paint.
    await (await server.ssrLoadModule('/src/platform/language/translationProviders.js')).loadLanguagePack('es');
    return await run(await server.ssrLoadModule('/src/tools/shared/ToolShell.jsx'));
  } finally {
    await server.close();
  }
};

const MISS = Object.freeze({
  id: 2,
  slot: 1,
  text: 'Not quite. You have 1 attempt remaining on this version.',
  detail: 'Focus on: Domain restriction.',
  tone: 'incorrect',
});
const COACHING = 'Point P1 is on the line, but the other one is not. Keep the good point and move the other.';

test('the region says the tool\'s words with the outcome, and offers the hint, Read aloud and Translate', async () => {
  await withToolShell(({ AttemptOutcomeWords }) => {
    const render = (outcome, props = {}) => renderToStaticMarkup(React.createElement(AttemptOutcomeWords, { outcome, toolWords: COACHING, detail: outcome.detail, ...props }));
    const offered = render({ ...MISS, readAloud: { language: 'en' }, translation: { language: 'es' }, onEvidence: () => {}, onShowHint: () => {} });
    assert.ok(offered.startsWith(MISS.text), 'the outcome comes first, as before');
    // The tool's coaching, for a screen reader only: the eye read it above.
    assert.match(offered, /<span data-attempt-outcome-tool-words=""[^>]*position:absolute[^>]*> Point P1 is on the line, but the other one is not\. Keep the good point and move the other\.<\/span>/);
    assert.ok(offered.indexOf(COACHING) < offered.indexOf('Focus on: Domain restriction.'), 'why, then what to focus on');
    assert.match(offered, /aria-label="Read the feedback aloud"/);
    // The tool's own coaching is English-only text (H-114): Translate says so
    // in words instead of being a button that fails.
    assert.doesNotMatch(offered, /aria-label="Translate the feedback"/);
    assert.match(offered, /No Spanish translation for this text yet\./);
    // A platform miss message is in the Spanish pack: Translate is offered.
    const platformMiss = renderToStaticMarkup(React.createElement(AttemptOutcomeWords, {
      outcome: { ...MISS, readAloud: { language: 'en' }, translation: { language: 'es' }, onEvidence: () => {} },
      detail: 'Check the order of your slope fraction.',
    }));
    assert.match(platformMiss, /aria-label="Translate the feedback"/);
    assert.doesNotMatch(platformMiss, /No Spanish translation/);
    // With the one sentence on what a hint costs (HELP-17).
    assert.match(offered, /A hint is ready if you want one\. Hints never lower your score\. Your teacher can see you used one\.\s*<button type="button"[^>]*>Show a hint<\/button>/);

    // A language with no pack: no dead Translate button, and the student is told.
    const vietnamese = render({ ...MISS, readAloud: { language: 'en' }, translation: { language: 'vi' }, onEvidence: () => {} });
    assert.doesNotMatch(vietnamese, /aria-label="Translate the feedback"/);
    assert.match(vietnamese, /Translate isn’t available in Vietnamese yet\./);

    // Only what the student is entitled to, and only what is ready.
    const plain = render({ ...MISS });
    assert.doesNotMatch(plain, /Read the feedback aloud|Translate the feedback/, 'no Read or Translate without the support');
    assert.doesNotMatch(plain, /A hint is ready|Show a hint/, 'no hint offer unless the engine hands one over');
    assert.match(plain, /Focus on: Domain restriction\./, 'the focus line is still shown');

    // Inside a verdict area that is itself a live region, the words are not said twice.
    assert.doesNotMatch(render({ ...MISS }, { sayToolWords: false }), /data-attempt-outcome-tool-words/);
  });
});

test('a verdict pill shows its coaching under it and hands the region both', async () => {
  await withToolShell(({ ResultPill }) => {
    const markup = renderToStaticMarkup(React.createElement(ResultPill, { ok: false, message: COACHING }, 'Not yet'));
    assert.match(markup, /<span class="mathmaster-result-pill"[^>]*>• Not yet<\/span><p class="mathmaster-result-message"[^>]*>Point P1 is on the line/);
    assert.doesNotMatch(renderToStaticMarkup(React.createElement(ResultPill, { ok: false }, 'Not yet')), /mathmaster-result-message/, 'no empty coaching row');
  });
  const pill = region(code('src/tools/shared/ToolShell.jsx'), 'export const ResultPill', '\n};', 'ResultPill');
  assert.match(pill, /<AttemptOutcome\b[^>]*\bverdict=\{children\}[^>]*\bcoaching=\{message\}[^>]*\/>/, 'the region is handed what the pill shows');
});

test('the tool\'s words: its coaching when it gave some, else the verdict', () => {
  assert.equal(verdictWords({ verdict: 'Not yet', coaching: 'Point P1 is on the line' }), 'Point P1 is on the line.');
  assert.equal(verdictWords({ verdict: 'Some connections need another look' }), 'Some connections need another look.');
  assert.equal(verdictWords({ verdict: 'Use √(−d) = i√d and keep the ± pair; root order does not matter.' }), 'Use √(−d) = i√d and keep the ± pair; root order does not matter.', 'a full sentence is not given a second stop');
  assert.equal(verdictWords({ verdict: ['Not yet', ' — ', 'see what to reconsider'] }), 'Not yet — see what to reconsider.');
  assert.equal(verdictWords({ verdict: { props: { children: ['Keep ', 'going'] } } }), 'Keep going.', 'an element is read by its text');
  assert.equal(verdictWords({ verdict: 'Correct', coaching: '   ' }), 'Correct.', 'blank coaching falls back to the verdict');
  assert.equal(verdictWords({}), '');
  // verdictText reads exactly what verdictTextLength measures.
  const children = ['Focus and directrix are |p|=3 from the vertex; ', { props: { children: 'latus rectum length is 4|p|.' } }, false, null, 7];
  assert.equal(verdictText(children).length, verdictTextLength(children));
});

test('the engine hands a tool what its own box offers, under the same rule', () => {
  const engine = code('src/QuestionEngine.jsx');
  const handOver = region(engine, 'const toolAttemptOutcome = outcomeInTool ? {', '} : null;', 'the tool hand-over');
  assert.match(handOver, /readAloud: supportedTextReadAloud,/);
  assert.match(handOver, /translation: supportedTextTranslation,/);
  assert.match(handOver, /onEvidence: reportSupportedTextUse,/);
  assert.match(handOver, /onShowHint: attemptHintOffered \? revealNextHint : null,/);
  // One rule for the offer, wherever the outcome is shown: a miss, on an open
  // question, once hints are ready (attemptFeedbackPlan.hintOfferedAfterMiss).
  const rule = region(engine, 'const attemptHintOffered = ', ';', 'the hint offer rule');
  assert.match(rule, /!feedback\.isCorrect/);
  assert.match(rule, /hintOfferedAfterMiss\(\{[^}]*hintsAvailable: hintState\.canRevealNext[^}]*open: !locked[^}]*\}\)/);
  const box = region(engine, '{feedback && !feedback.blocked && showOutcomeFeedback', '</div>\n      )}', 'the engine outcome box');
  // The box offers the hint under the same rule (beside, since HELP-9, the
  // worked sibling): the button that reveals a hint renders only under it.
  assert.match(box, /\{attemptHintOffered \? <>A hint is ready if you want one\. \{hintCostSentence\(hintCostNote\)\}\{' '\}\s*<button type="button" onClick=\{revealNextHint\}/, 'the box offers the hint under the same rule');
});

test('after a miss, the box and the tool offer the worked sibling beside the hint (HELP-9)', async () => {
  const engine = code('src/QuestionEngine.jsx');
  // One rule: a worked sibling exists (only where hints are allowed), it is
  // not open already, the question is open, and the attempt was a miss.
  const open = region(engine, 'const similarOffered = ', ';', 'the similar-problem rule');
  assert.match(open, /similarExample && !similarOpen && !locked/);
  const rule = region(engine, 'const attemptSimilarOffered = ', ';', 'the after-a-miss rule');
  assert.match(rule, /similarOffered && feedback && feedback\.isCorrect === false && !feedback\.blocked/);
  const handOver = region(engine, 'const toolAttemptOutcome = outcomeInTool ? {', '} : null;', 'the tool hand-over');
  assert.match(handOver, /onShowSimilar: attemptSimilarOffered \? openSimilarExample : null,/);
  const box = region(engine, '{feedback && !feedback.blocked && showOutcomeFeedback', '</div>\n      )}', 'the engine outcome box');
  assert.match(box, /\{attemptSimilarOffered \? <button type="button" data-similar-offer="" onClick=\{openSimilarExample\}[^>]*>See a similar problem worked<\/button> : null\}/);
  // "Your last try" keeps both offers while the student edits.
  const previous = region(engine, '{!feedback && previousMiss && !locked && showOutcomeFeedback && (', '</div>\n      )}', 'your last try');
  assert.match(previous, /\{similarOffered \? <button type="button" data-similar-offer="" onClick=\{openSimilarExample\}/);
  // The example lives in the Hint panel, so opening it opens the panel, and
  // it is recorded as a worked example.
  const opener = region(engine, 'const openSimilarExample = () => {', '};', 'opening the example');
  assert.match(opener, /setWorkedExampleUsed\(true\);/);
  assert.match(opener, /setHintPanelOpen\(true\);/);

  await withToolShell(({ AttemptOutcomeWords }) => {
    const render = (outcome) => renderToStaticMarkup(React.createElement(AttemptOutcomeWords, { outcome, toolWords: COACHING, detail: outcome.detail }));
    const both = render({ ...MISS, onShowHint: () => {}, onShowSimilar: () => {} });
    assert.match(both, /Show a hint<\/button><button type="button" data-similar-offer=""[^>]*>See a similar problem worked<\/button>/);
    // Both offered: the two buttons, without the lead-in sentence, so the box
    // still fits a phone under the task card (tests/browser/toolAttemptOutcome.mjs);
    // what a hint costs is still said (HELP-17).
    assert.doesNotMatch(both, /A hint is ready/);
    assert.match(both, /<span data-hint-cost-note=""[^>]*>Hints never lower your score\. Your teacher can see you used one\.<\/span>\s*<button type="button"[^>]*>Show a hint<\/button>/);
    const similarOnly = render({ ...MISS, onShowSimilar: () => {} });
    assert.match(similarOnly, />See a similar problem worked<\/button>/);
    assert.doesNotMatch(similarOnly, /A hint is ready/, 'the sibling alone does not promise a hint');
    assert.doesNotMatch(render({ ...MISS }), /See a similar problem worked/, 'only when the engine hands it over');
  });
});

test('HELP-17: the tool box says what a hint costs in the host\'s words — Recovery\'s in a Recovery runner', async () => {
  const { RECOVERY_HINT_COST_SENTENCE, HINT_COST_SENTENCE } = await import('../../src/platform/supports/hints/hintCopy.js');
  const engine = code('src/QuestionEngine.jsx');
  // The engine hands its own sentence (hintCostSentence(hintCostNote): the
  // host's, else the platform's) to the outcome and to every tool runtime.
  const handOver = region(engine, 'const toolAttemptOutcome = outcomeInTool ? {', '} : null;', 'the tool hand-over');
  assert.match(handOver, /hintCost: hintCostSentence\(hintCostNote\),/);
  assert.equal((engine.match(/<ToolRuntimeProvider\s+hintCost=\{hintCostSentence\(hintCostNote\)\}/g) || []).length, 2, 'both tool runtimes carry the host\'s sentence');
  // Recovery hands its sentence to the engine.
  assert.match(code('src/components/student/SectionRecoveryRunner.jsx'), /hintCostNote=\{RECOVERY_HINT_COST_SENTENCE\}/);
  await withToolShell(({ AttemptOutcomeWords }) => {
    const render = (outcome) => renderToStaticMarkup(React.createElement(AttemptOutcomeWords, { outcome, toolWords: COACHING, detail: outcome.detail }));
    const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, '(?:\'|&#x27;)');
    for (const outcome of [{ ...MISS, onShowHint: () => {} }, { ...MISS, onShowHint: () => {}, onShowSimilar: () => {} }]) {
      const recovery = render({ ...outcome, hintCost: RECOVERY_HINT_COST_SENTENCE });
      assert.match(recovery, new RegExp(escaped(RECOVERY_HINT_COST_SENTENCE)), 'Recovery\'s sentence reaches the box');
      assert.doesNotMatch(recovery, /Hints never lower your score/, 'never the platform\'s promise in a Recovery runner');
      assert.match(render(outcome), new RegExp(escaped(HINT_COST_SENTENCE)), 'without a host sentence, the platform\'s');
    }
  });
});

const toolSources = () => {
  const root = fileURLToPath(new URL('src/tools/', ROOT));
  const files = [];
  const walk = (dir) => readdirSync(dir).forEach((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (name.endsWith('.jsx')) files.push(path);
  });
  walk(root);
  return files.map((path) => ({ path: path.slice(root.length), source: executableSource(readFileSync(path, 'utf8')) }));
};

test('no tool keeps its coaching in a paragraph the region cannot read', () => {
  // The paragraph every tool used to put straight after its pill.
  const loose = /<\/ResultPill>\s*<p\b[^>]*>/;
  const offenders = toolSources().filter(({ source }) => loose.test(source)).map(({ path }) => path);
  assert.deepEqual(offenders, [], 'coaching after a pill goes in its `message`');
  const coached = toolSources().filter(({ source }) => /<ResultPill\b[^>]*\bmessage=\{/.test(source)).map(({ path }) => path).sort();
  for (const tool of ['graphing2/Graphing2.jsx', 'stepAlgebra2/StepAlgebra2.jsx', 'relationMapping/RelationMapping.jsx', 'intervalNumberLine/IntervalNumberLine.jsx', 'transformations/TransformationsLab.jsx', 'openSortBoard/OpenSortBoard.jsx']) {
    assert.ok(coached.includes(tool), `${tool} hands its pill the coaching`);
  }
});

test('a plot says what it did', () => {
  assert.equal(describePlot({ point: [3, -2], before: [], after: [[3, -2]] }), 'Plotted (3, -2).');
  assert.equal(describePlot({ point: [3, -2], before: [[1, 1]], after: [[1, 1], [3, -2]], progress: '2 of 2 points plotted.' }), 'Plotted (3, -2). 2 of 2 points plotted.');
  // Graphing's third point starts the line again: say so.
  assert.equal(describePlot({ point: [5, 5], before: [[1, 1], [2, 2]], after: [[5, 5]], progress: '1 of 2 points plotted.' }), 'Plotted (5, 5). It replaced (1, 1) and (2, 2). 1 of 2 points plotted.');
  // Given points the student did not plot never count as replaced.
  assert.equal(describePlot({ point: [0, 4], before: [[2, 2], [0, 0]], after: [[2, 2], [0, 4]] }), 'Plotted (0, 4). It replaced (0, 0).');
  assert.equal(describePlot({ point: [0.1 + 0.2, 1], before: [], after: [[0.3, 1]] }), 'Plotted (0.3, 1).', 'written the way the readout writes it');
  // A plot the tool ignored changed nothing, and says nothing.
  assert.equal(describePlot({ point: [3, -2], before: [[3, -2]], after: [[3, -2]] }), '');
  assert.equal(describePlot({ point: [Number.NaN, 1], before: [], after: [[1, 1]] }), '');
});

test('the plane announces a plot from either hand, in its one live region', () => {
  const plane = code('src/tools/shared/CoordinatePlane.jsx');
  const keyboard = region(plane, 'const handleKeyDown = (event) => {', "case 'Escape':", 'Enter on the plane');
  assert.match(keyboard, /commitPlot\(target\);/);
  assert.doesNotMatch(keyboard, /\bonPlot\(/, 'every keyboard plot is announced');
  const pointer = region(plane, 'const handlePointerUp = (event) => {', 'const handlePointerCancel', 'a pointer lift');
  assert.match(pointer, /else commitPlot\(point\);/);
  const commit = region(plane, 'const commitPlot = (point) => {', '\n  };', 'the commit');
  assert.match(commit, /before: points\.map\(pointXY\)/);
  assert.match(commit, /onPlot\(point\);/);
  assert.match(plane, /describePlot\(\{ point: commit\.point, before: commit\.before, after: points\.map\(pointXY\), progress: plotProgress \}\)/);
  assert.match(plane, /<p aria-live="polite" className="mm-sr-only">\{plotAnnouncement \|\| previewText\}<\/p>/);
  // The crosshair moving again is a new readout, not a stale "Plotted".
  for (const start of ['const moveKeyboardCursor = (dx, dy) => {', 'const handlePointerDown = (event) => {']) {
    assert.match(region(plane, start, '\n  };', start), /setPlotAnnouncement\(''\);/);
  }
  // Graphing counts its construction.
  assert.match(code('src/tools/graphing2/Graphing2.jsx'), /plotProgress=\{`\$\{points\.length\} of \$\{requiredPointCount\} \$\{requiredPointCount === 1 \? 'point' : 'points'\} plotted\.`\}/);
});
