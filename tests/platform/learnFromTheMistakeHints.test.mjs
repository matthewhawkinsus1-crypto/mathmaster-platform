/*
 * STUDENT PASS 3, BATCH 4 — THE HINT SYSTEM ("LEARN FROM THE MISTAKE").
 *
 *   HELP-2 / D2  "What might have gone wrong?": the miss diagnosis held back
 *                while the question is open, offered as a hint rung — on
 *                request, recorded like a hint, only where hints are allowed,
 *                through the leak guard. Pre-Flight warns (advisory) on a
 *                Practice item with no attempt feedback.
 *   HELP-9       "See a similar problem worked" after a miss: covered with the
 *                tool outcome in toolAttemptOutcomeOffers.test.mjs.
 *   HELP-10      One hint ladder per question: a registry tool's rungs go to
 *                the platform ladder (release rule, leak guard), its own
 *                ladder and the Work View copy step aside, and no rung names
 *                the answer.
 *   HELP-17 / D5 One sentence wherever a hint is offered, and hint 1 offered
 *                in words before the first try on Classwork and Practice.
 *   HELP-4       Recovery practice says a hint stops the item counting, and
 *                the meter carries its rule.
 *
 * Pure modules are run; components are rendered through Vite SSR where node
 * cannot import .jsx, and the wiring that only exists in QuestionEngine is a
 * source contract bound to the region that does the work
 * (docs/handoffs/SOURCE_CONTRACT_PLAYBOOK.md).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

import { executableSource, region } from './helpers/sourceContract.mjs';
import { buildQuestionHints, diagnosisHint, hintLadderView, hintRelease } from '../../src/platform/supports/hints/questionHints.js';
import { HINT_COST_SENTENCE, RECOVERY_HINT_COST_SENTENCE, hintCostSentence, selfCheckCostSentence } from '../../src/platform/supports/hints/hintCopy.js';
import { createToolHintChannel, publishableHints } from '../../src/tools/shared/toolHintChannel.js';
import { diagnoseMiss } from '../../src/platform/supports/feedback/missDiagnosis.js';
import { GENERIC_MISS_MESSAGES } from '../../src/platform/supports/feedback/genericMissChecks.js';
import { auditAssignmentAttemptFeedback, hasAttemptFeedback } from '../../src/platform/preflight/attemptFeedbackPreflight.js';
import {
  RECOVERY_PRACTICE_CORRECT,
  RECOVERY_PRACTICE_CORRECT_WITH_HELP,
  RECOVERY_PRACTICE_MISSED,
  recoveryMeterRule,
  recoveryPracticeOutcomeMessage,
} from '../../src/platform/recovery/recoveryPracticeCopy.js';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const code = (path) => executableSource(read(path));

const withVite = async (run) => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    return await run((path) => server.ssrLoadModule(path));
  } finally {
    await server.close();
  }
};

// ------------------------------------------------------------ the sentence
test('one sentence says what a hint costs; Recovery practice has its own', () => {
  assert.equal(HINT_COST_SENTENCE, 'Hints never lower your score. Your teacher can see you used one.');
  assert.equal(RECOVERY_HINT_COST_SENTENCE, "Hints help you learn, but this question then won't count toward unlocking.");
  assert.equal(hintCostSentence(), HINT_COST_SENTENCE);
  assert.equal(hintCostSentence('  '), HINT_COST_SENTENCE, 'a blank override is no override');
  assert.equal(hintCostSentence(RECOVERY_HINT_COST_SENTENCE), RECOVERY_HINT_COST_SENTENCE);
  assert.equal(selfCheckCostSentence(), `This counts as a hint. ${HINT_COST_SENTENCE}`);
  assert.equal(selfCheckCostSentence(RECOVERY_HINT_COST_SENTENCE), `This counts as a hint. ${RECOVERY_HINT_COST_SENTENCE}`);
});

test('the old wordings are gone from every place a hint is offered', () => {
  for (const path of ['src/platform/supports/hints/HintPanel.jsx', 'src/tools/shared/ToolShell.jsx', 'src/InteractiveGraphWorkspace.jsx']) {
    const source = code(path);
    assert.doesNotMatch(source, /noted with your attempt/i, path);
    assert.doesNotMatch(source, /Recorded for your teacher/i, path);
  }
  // The graph check and the solver's strategic hint say it in the same words,
  // the host's where it has its own.
  const graph = region(code('src/InteractiveGraphWorkspace.jsx'), '{selfCheckAllowed && !construction.pointsValidated && (', 'Check my points', 'the graph check');
  assert.match(graph, /title=\{`Compares your plotted points with the function\. \$\{selfCheckCostSentence\(hintCostNote\)\}`\}/);
  assert.match(code('src/InteractiveGraphWorkspace.jsx'), /data-hint-cost-note="">\{selfCheckCostSentence\(hintCostNote\)\}<\/span>/);
  assert.match(code('src/StepByStepAlgebraCore.jsx'), /<summary[^>]*>Need a strategic hint\? <span data-hint-cost-note=""[^>]*>\{hintCostSentence\(hintCostNote\)\}<\/span><\/summary>/);
  const engine = code('src/QuestionEngine.jsx');
  assert.match(region(engine, 'const graphModuleProps = {', '};', 'graph props'), /\n\s*hintCostNote,\n/);
  assert.match(region(engine, 'const stepAlgebraHintProps = {', '};', 'solver props'), /\n\s*hintCostNote,\n/);
  assert.match(region(code('src/LinearInterceptsOrchestrator.jsx'), '<StepByStepAlgebraCore', '/>', 'the intercept solver'), /hintCostNote=\{hintCostNote\}/);
});

// --------------------------------------------------------- the platform panel
const HINTS = [{ text: 'Find a number that divides 6 and 8.', source: 'authored' }, { text: 'Divide the top and the bottom by 2.', source: 'authored' }];
const RELEASE = { canRevealNext: true, waitingForAttempt: false };

test('the Hint panel says the sentence, or the host\'s, and nothing about cost where only Ask is offered', async () => {
  await withVite(async (load) => {
    const HintPanel = (await load('/src/platform/supports/hints/HintPanel.jsx')).default;
    const render = (props) => renderToStaticMarkup(React.createElement(HintPanel, { hints: HINTS, release: RELEASE, onReveal: () => {}, ...props }));
    const before = render({ revealed: 0 });
    assert.match(before, /<p data-hint-cost-note=""[^>]*>Hints never lower your score\. Your teacher can see you used one\.<\/p>/);
    assert.match(before, />Show a hint<\/button>/);
    assert.match(render({ revealed: 1 }), /data-hint-cost-note=""[^>]*>Hints never lower your score/, 'still said beside "Show the next hint"');
    assert.match(render({ revealed: 0, costNote: RECOVERY_HINT_COST_SENTENCE }), /data-hint-cost-note=""[^>]*>Hints help you learn, but this question then won(&#x27;|')t count toward unlocking\.<\/p>/);
    assert.doesNotMatch(render({ revealed: 0, costNote: RECOVERY_HINT_COST_SENTENCE }), /never lower your score/);
    const askOnly = renderToStaticMarkup(React.createElement(HintPanel, { hints: [], askTeacher: { requested: false, onToggle: () => {} } }));
    assert.doesNotMatch(askOnly, /data-hint-cost-note/, 'a DOL\'s Ask-only panel says nothing about hints');
  });
});

test('"What might have gone wrong?" is offered, then shows the diagnosis once asked for', async () => {
  await withVite(async (load) => {
    const HintPanel = (await load('/src/platform/supports/hints/HintPanel.jsx')).default;
    const render = (props) => renderToStaticMarkup(React.createElement(HintPanel, { hints: HINTS, release: RELEASE, onReveal: () => {}, revealed: 0, ...props }));
    const sign = GENERIC_MISS_MESSAGES['sign-flipped'];
    const offered = render({ diagnosis: { shown: null, onShow: () => {} } });
    assert.match(offered, /<button type="button" data-miss-diagnosis-offer=""[^>]*>What might have gone wrong\?<\/button>/);
    assert.ok(!offered.includes(sign), 'offered, never shown unasked');
    const shown = render({ diagnosis: { shown: { text: sign, source: 'generic' }, onShow: () => {} } });
    assert.match(shown, /<div data-miss-diagnosis-hint="generic"[^>]*><strong[^>]*>What might have gone wrong<\/strong>/);
    assert.ok(shown.includes('Your answer has the right size but the opposite sign.'));
    assert.doesNotMatch(shown, /data-miss-diagnosis-offer/, 'not offered again once read');
    assert.doesNotMatch(render({}), /What might have gone wrong/, 'nothing without a diagnosis');
  });
});

// ------------------------------------------------------------ the ladder
const QUESTION = { type: 'fraction', prompt: 'Write 6/8 in lowest terms.', answer: '3/4' };

test('a tool\'s rungs join the ladder after the authored and family ones, through the leak guard', () => {
  const authored = { ...QUESTION, hints: ['Look for a common factor.'] };
  const ladder = buildQuestionHints(authored, { toolHints: ['Drag the slider to compare.', 'The answer is 3/4.', 'look for a common factor.'] });
  // Authored first, then the family's own hints, then the tool's.
  const sources = ladder.map((hint) => hint.source);
  assert.equal(sources[0], 'authored');
  assert.ok(sources.indexOf('tool') > sources.lastIndexOf('family'), sources.join());
  assert.deepEqual(ladder.filter((hint) => hint.source === 'tool').map((hint) => hint.text), ['Drag the slider to compare.'],
    'a rung naming the answer is dropped, a repeat is dropped');
  // No tool rungs: exactly the ladder it always was.
  assert.deepEqual(buildQuestionHints(authored), buildQuestionHints(authored, { toolHints: [] }));
  // A tool's rungs replace the generic fallback: it is only for an empty ladder.
  const TOOL_QUESTION = { type: 'toolActivity', toolId: 'graphing2', prompt: 'Graph the line.' };
  const toolOnly = buildQuestionHints(TOOL_QUESTION, { toolHints: ['Drag the slider to compare.'] });
  assert.deepEqual(toolOnly.map((hint) => hint.source), ['tool']);
  assert.ok(buildQuestionHints(TOOL_QUESTION).every((hint) => hint.source === 'generic'));
});

test('a hint read stays as read; the next is the first rung of the current ladder not yet read', () => {
  const stageOne = [{ text: 'A', source: 'tool' }, { text: 'B', source: 'tool' }];
  const stageTwo = [{ text: 'C', source: 'tool' }, { text: 'D', source: 'tool' }];
  const opened = hintLadderView({ ladder: stageOne, revealedTexts: [], revealedCount: 0 });
  assert.deepEqual(opened, { hints: stageOne, revealed: 0, next: stageOne[0] });
  // A read on stage one; the tool moves to stage two.
  const moved = hintLadderView({ ladder: stageTwo, revealedTexts: [stageOne[0]], revealedCount: 1 });
  assert.deepEqual(moved.hints.map((hint) => hint.text), ['A', 'C', 'D']);
  assert.equal(moved.revealed, 1);
  assert.equal(moved.next.text, 'C', 'not B, a rung of the stage the student left');
  // The release rule reads the view unchanged: one more hint per attempt.
  assert.equal(hintRelease({ hints: moved.hints, revealed: moved.revealed, attemptCount: 0 }).canRevealNext, false);
  assert.equal(hintRelease({ hints: moved.hints, revealed: moved.revealed, attemptCount: 1 }).canRevealNext, true);
  // A restored count without its texts (supportUseMemory) is filled in order.
  assert.deepEqual(hintLadderView({ ladder: stageOne, revealedTexts: [], revealedCount: 1 }).hints.slice(0, 1), [stageOne[0]]);
  assert.equal(hintLadderView({ ladder: stageOne, revealedTexts: [], revealedCount: 1 }).next.text, 'B');
  assert.equal(hintLadderView({ ladder: stageOne, revealedTexts: stageOne, revealedCount: 2 }).next, null);
});

// ------------------------------------------------------ the diagnosis rung
const MISS_QUESTION = { type: 'multiAnswer', prompt: 'Solve −4x + 8 = 36.', answerFields: [{ id: 'x', label: 'x', answer: '-7' }] };
const MISS_GRADING = { graded: true, isCorrect: false, parts: [{ id: 'x', graded: true, isComplete: true, isCorrect: false, response: '7' }] };

test('the rung carries the diagnosis the open box holds back, through the leak guard', () => {
  // While attempts are left the box names no move (QA M1)...
  assert.equal(diagnoseMiss({ question: MISS_QUESTION, grading: MISS_GRADING, attemptsLeft: true }), null);
  // ...the rung asks as if the item had closed.
  const diagnosis = diagnoseMiss({ question: MISS_QUESTION, grading: MISS_GRADING, attemptsLeft: false });
  assert.equal(diagnosis?.code, 'sign-flipped');
  assert.deepEqual(diagnosisHint({ question: MISS_QUESTION, diagnosis }), { text: GENERIC_MISS_MESSAGES['sign-flipped'], code: 'sign-flipped', source: 'generic' });
  assert.equal(diagnosisHint({ question: MISS_QUESTION, diagnosis, alreadyShown: diagnosis.message }), null, 'not when the box already says it');
  assert.equal(diagnosisHint({ question: MISS_QUESTION, diagnosis: null }), null);
  // A message that ever carried an answer is dropped like any hint.
  assert.equal(diagnosisHint({ question: MISS_QUESTION, diagnosis: { message: 'Try x = -7.', code: 'x', source: 'generic' } }), null);
});

test('QuestionEngine offers the rung only where hints are, while the item is open, and records it like a hint', () => {
  const engine = code('src/QuestionEngine.jsx');
  const offer = region(engine, 'const missRungOffer = useMemo(() => {', '}, [', 'the rung offer');
  assert.match(offer, /\n\s*if \(!hintControlAllowed \|\| locked \|\| !feedbackOpen\) return null;/);
  assert.match(offer, /\n\s*if \(!feedback \|\| feedback\.isCorrect \|\| feedback\.blocked\) return null;/);
  assert.match(offer, /diagnoseMiss\(\{[^}]*attemptsLeft: false \}\)/);
  assert.match(offer, /return diagnosisHint\(\{ question: processedQuestion, diagnosis, alreadyShown: missDetail\?\.message \|\| '' \}\);/);
  // The permission it reads is the one that withholds hints on a DOL, quiz,
  // test and a server-graded host.
  assert.match(engine, /\n\s*const hintControlAllowed = toolHintsAllowed && !serverGrading && ladderRoleKnown;/);
  const show = region(engine, 'const showMissDiagnosis = () => {', '};', 'reading the rung');
  assert.match(show, /\n\s*recordHintUse\(\);/);
  assert.match(engine, /diagnosis=\{missRung && !locked \? \{ shown: missRung\.shown \? missRung\.hint : null, onShow: showMissDiagnosis \} : null\}/);
  // The open box itself still names no move.
  assert.match(region(engine, 'const missDetail = useMemo(() => {', '}, [', 'the box message'), /attemptsLeft: !isExpired/);
});

// ---------------------------------------------------------- one ladder
test('the channel hands every mounted panel\'s rungs over, once, and withdraws them on unmount', () => {
  const heard = [];
  const channel = createToolHintChannel((hints) => heard.push(hints));
  const withdrawA = channel.publish(['One', 'Two']);
  const withdrawB = channel.publish(['two', 'Three', 7, '']);
  assert.deepEqual(channel.current(), ['One', 'Two', 'Three']);
  channel.publish(['One']);
  assert.equal(heard.length, 2, 'a panel adding nothing new is not news');
  withdrawA();
  withdrawB();
  assert.deepEqual(channel.current(), ['One']);
  assert.deepEqual(publishableHints(['  a  ', null, 3, 'b']), ['a', 'b']);
});

test('inside a question with the platform ladder a tool shows no ladder of its own', async () => {
  await withVite(async (load) => {
    const { HintPanel } = await load('/src/tools/shared/ToolShell.jsx');
    const { ToolRuntimeProvider } = await load('/src/tools/shared/ToolRuntimeContext.jsx');
    const render = (provider) => renderToStaticMarkup(React.createElement(ToolRuntimeProvider, provider, React.createElement(HintPanel, { hints: ['Plot the intercept first.'] })));
    const own = render({});
    assert.match(own, />Stuck\? Show a hint<\/button>/, 'the tools lab keeps the tool\'s panel');
    assert.match(own, /data-hint-cost-note=""[^>]*>Hints never lower your score/);
    assert.equal(render({ publishHints: () => () => {} }), '', 'handed to the platform ladder instead');
    assert.equal(render({ hintsAllowed: false }), '', 'and nothing where hints are withheld');
  });
  const shell = code('src/tools/shared/ToolShell.jsx');
  const panel = region(shell, 'export const HintPanel', 'const revealNext', 'the tool hint panel');
  assert.match(panel, /useEffect\(\(\) => \{\s*if \(!publishHints \|\| !hintsAllowed\) return undefined;\s*return publishHints\(JSON\.parse\(rungsKey\)\);\s*\}, \[publishHints, hintsAllowed, rungsKey\]\);/);
});

test('QuestionEngine feeds the tool\'s rungs into its ladder, and hands every tool the channel', () => {
  const engine = code('src/QuestionEngine.jsx');
  assert.match(engine, /import \{ createToolHintChannel \} from '\.\/tools\/shared\/toolHintChannel\.js';/);
  assert.match(engine, /buildQuestionHints\(processedQuestion, \{ toolHints \}\)/);
  assert.match(engine, /\n\s*const toolHintPublisher = hintControlAllowed \? toolHintChannel\.publish : null;/);
  assert.match(engine, /\n\s*const hintLadder = hintLadderView\(\{ ladder: questionHints, revealedTexts: revealedHintTexts, revealedCount: hintsRevealed \}\);/);
  assert.match(engine, /hintRelease\(\{ hints: hintLadder\.hints, revealed: hintLadder\.revealed,/);
  const render = region(engine, 'const renderModule = () => {', null, 'renderModule');
  const providers = [...render.matchAll(/<ToolRuntimeProvider\b[^>]*>/g)].map((match) => match[0]);
  const solver = region(engine, 'const withSolverRuntime = (node) => (', '{node}', 'the solver provider');
  [...providers, solver].forEach((tag) => assert.match(tag, /\spublishHints=\{toolHintPublisher\}/, tag.slice(0, 80)));
  assert.ok(providers.length >= 2, 'the composed and the registry mounts');
  const reveal = region(engine, 'const revealNextHint = () => {', '};', 'revealing a hint');
  assert.match(reveal, /if \(!hintState\.canRevealNext \|\| !hintLadder\.next\) return;/);
  assert.match(reveal, /setRevealedHintTexts\(\(\) => \[\.\.\.hintLadder\.hints\.slice\(0, hintLadder\.revealed\), next\]\);/);
});

test('the Work View copies step aside where the platform ladder is the Help', () => {
  const view = code('src/tools/shared/RegisteredToolWorkView.jsx');
  assert.match(view, /const platformLadder = Boolean\(useToolHintPublisher\(\)\);/);
  assert.match(region(view, 'const capabilities = Object.fromEntries', ';', 'the capabilities'), /\.filter\(\(key\) => !\(platformLadder && key === 'help'\)\)/);
});

const ON_LINE = (target, [x, y]) => Math.abs(target.m * x + target.b - y) < 1e-9;
const pairs = (text) => [...String(text).matchAll(/\((-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\)/g)].map((match) => [Number(match[1]), Number(match[2])]);

test('no Graphing 2 rung names a point the student has to find', async () => {
  await withVite(async (load) => {
    const { hintsForMode } = await load('/src/tools/graphing2/Graphing2.jsx');
    const slope = hintsForMode('slopeIntercept', { m: 2, b: 3 }, {});
    slope.forEach((rung) => assert.ok(!pairs(rung).some((point) => ON_LINE({ m: 2, b: 3 }, point)), rung));
    assert.ok(slope.some((rung) => /run of 1 and a rise of 2/.test(rung)), 'the move is still named');
    hintsForMode('verticalHorizontal', null, { orientation: 'horizontal', value: 3 }).forEach((rung) => assert.doesNotMatch(rung, /\(\s*-?\d+\s*,\s*3\)/, rung));
    hintsForMode('verticalHorizontal', null, { orientation: 'vertical', value: 4 }).forEach((rung) => assert.doesNotMatch(rung, /\(4,\s*-?\d+\)/, rung));
    hintsForMode('throughPoints', null, { givenPoints: [[1, 2], [3, 6]] }).forEach((rung) => assert.deepEqual(pairs(rung), [], rung));
    // The given point may be restated; the second point may not.
    const pointSlope = hintsForMode('pointSlope', null, { point: [1, 2], slope: 3 });
    assert.deepEqual(pointSlope.flatMap(pairs), [[1, 2]]);
    hintsForMode('factoredLinear', null, { factored: { a: 2, c: 5 } }).forEach((rung) => assert.deepEqual(pairs(rung), [], rung));
  });
});

test('Function Investigation\'s rungs no longer read the hidden parameters or the count', async () => {
  await withVite(async (load) => {
    const { hintsForMode } = await load('/src/tools/functionInvestigation2/FunctionInvestigation2.jsx');
    const spec = { type: 'rational', a: 7, h: 9, k: -6 };
    const features = { anchor: { label: 'centre' } };
    for (const mode of ['features', 'domainRange', 'intercepts', 'behavior']) {
      hintsForMode(mode, spec, features, {}, { x: [1, 2] }, 0).forEach((rung) => {
        assert.doesNotMatch(rung, /[79]|-6|−6/, `${mode}: ${rung}`);
        assert.doesNotMatch(rung, /the answer is|are 2 x-intercepts|is 1 x-intercept/, `${mode}: ${rung}`);
      });
    }
  });
  // And three more rungs that named the answer are rewritten (subagent audit).
  assert.doesNotMatch(code('src/tools/systemsWorkspace/SystemsWorkspace.jsx'), /They differ, so trace across|They are equal, so check the intercepts/);
  assert.doesNotMatch(code('src/tools/stepAlgebra2/StepAlgebra2.jsx'), /After that the equation is \$\{formatEquation/);
  assert.doesNotMatch(code('src/tools/exponentialLog/ExponentialLogBridge.jsx'), /hints=\{\['A function and its inverse undo each other, so composing them should return the value you started with\.', 'f⁻¹\(f\(x\)\) = x/);
});

// ----------------------------------------------------- the first hint (D5)
test('on Classwork and Practice the first hint is offered in words before the first try, never shown', () => {
  const engine = code('src/QuestionEngine.jsx');
  const rule = region(engine, 'const firstHintOffered = Boolean(', ');', 'the first-hint offer');
  assert.match(rule, /\['classwork', 'practice'\]\.includes\(resolvedActivityPolicy\?\.role\)/);
  assert.match(rule, /hintState\.canRevealNext && hintLadder\.revealed === 0 && !hintPanelOpen/);
  assert.match(rule, /!feedback && !locked && !\(Number\(record\.attemptCount\) > 0\)/);
  const offer = region(engine, '{firstHintOffered && (', '</p>', 'the offer');
  assert.match(offer, /A hint is ready if you want one\. \{hintCostSentence\(hintCostNote\)\}/);
  assert.match(offer, /<button type="button" onClick=\{revealNextHint\}[^>]*>Show a hint<\/button>/);
  // On a short Work View (a phone on its side, or the keypad up) the offer
  // folds into Help, which opens the same panel; under the step it took the
  // step's height (studentUxPlatform "staged" and "keypad-short").
  assert.match(code('src/components/common/WorkViewShell.css'), /\[data-open="true"\]\[data-height="short"\] \[data-first-hint-offer\] \{ display: none; \}/);
  // Offered: nothing reveals or records a hint when the question opens.
  assert.doesNotMatch(engine, /useEffect\(\(\) => \{[^}]*revealNextHint\(\)/);
  // canRevealNext is false wherever hints are withheld, so a DOL, quiz or
  // test never shows it.
  assert.equal(hintRelease({ hints: [{ text: 'a' }], revealed: 0, attemptCount: 0, hintsAllowed: false }).canRevealNext, false);
});

// --------------------------------------------------------------- Recovery
test('Recovery practice says what counts, by the meter and after a correct answer given with help', () => {
  assert.equal(recoveryMeterRule({ requiredCorrect: 7, windowSize: 8 }), 'Get 7 of your last 8 practice questions right to unlock it. A question counts only when you answer it without a hint or a worked example.');
  assert.match(recoveryMeterRule({}), /^Get enough of your recent practice questions right to unlock it\. A question counts only when/);
  assert.equal(recoveryPracticeOutcomeMessage({ isCorrect: true, supportUsage: { isMathematicallyIndependent: true } }), RECOVERY_PRACTICE_CORRECT);
  assert.equal(recoveryPracticeOutcomeMessage({ isCorrect: true, supportUsage: { hintUsed: true } }), RECOVERY_PRACTICE_CORRECT_WITH_HELP);
  assert.equal(recoveryPracticeOutcomeMessage({ isCorrect: true, supportUsage: { workedExampleUsed: true } }), RECOVERY_PRACTICE_CORRECT_WITH_HELP);
  assert.equal(recoveryPracticeOutcomeMessage({ isCorrect: false, supportUsage: { hintUsed: true } }), RECOVERY_PRACTICE_MISSED);
  assert.match(RECOVERY_PRACTICE_CORRECT_WITH_HELP, /does not count toward unlocking/);

  const runner = code('src/components/student/SectionRecoveryRunner.jsx');
  const practice = region(runner, 'function PracticeRunner(', 'function AssessmentRunner(', 'the practice runner');
  assert.match(practice, /<RecoveryMasteryMeter percent=\{entry\.masteryPercent\} \/>\s*(?:\{\s*\}\s*)?<p data-recovery-meter-rule=""[^>]*>\s*\{recoveryMeterRule\(\{ requiredCorrect: entry\.masteryRequired, windowSize: entry\.masteryWindow \}\)\}/);
  assert.match(practice, /message: recoveryPracticeOutcomeMessage\(\{ isCorrect, supportUsage \}\),/);
  assert.match(region(practice, '<PinnedQuestion', '/>', 'the practice question'), /hintCostNote=\{RECOVERY_HINT_COST_SENTENCE\}/);
  // The assessment withholds hints, and is not told a hint costs anything.
  assert.doesNotMatch(region(runner, 'function AssessmentRunner(', null, 'the assessment runner'), /RECOVERY_HINT_COST_SENTENCE/);
  assert.match(region(runner, 'function PinnedQuestion(', '\n}\n', 'the pinned question'), /\n\s*hintCostNote=\{hintCostNote\}\n/);
  assert.match(region(code('src/QuestionEngine.jsx'), '<HintPanel', '/>', 'the platform panel'), /costNote=\{hintCostNote\}/);
});

// --------------------------------------------------------------- Pre-Flight
test('Pre-Flight warns on a Practice item with no attempt feedback, as advice that cannot demote the assignment', () => {
  const { warnings } = auditAssignmentAttemptFeedback([
    { activityRole: 'practice', prompt: 'a' },
    { activityRole: 'practice', prompt: 'b', attemptFeedback: ['Check the sign of the constant.'] },
    { activityRole: 'classwork', prompt: 'c' },
    { activityRole: 'practice', prompt: 'd', teacherExcluded: true },
    { activityRole: 'dol', prompt: 'e' },
  ]);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /^Question 1 is a Practice item with no attempt feedback \(attemptFeedback\)\./);
  assert.equal(hasAttemptFeedback({ attemptFeedback: ['  '] }), false);
  // A readiness warning would turn nearly every assignment "Needs Review", so
  // it is its own panel, not a diagnostic group.
  const model = code('src/platform/preflight/assignmentV5PreflightModel.js');
  assert.match(model, /\n\s*const attemptFeedback = auditAssignmentAttemptFeedback\(questions, deliveredOnly\);/);
  assert.doesNotMatch(region(model, 'const diagnosticGroups = [', '];', 'the readiness groups'), /attemptFeedback/);
  assert.match(region(model, 'return {', '};', 'the model'), /\n\s*attemptFeedback,\n/);
  assert.match(code('src/components/teacher/LessonPreflightModal.jsx'), /\{preflightModel\.attemptFeedback\.warnings\.map\(\(warning\) => <li key=\{warning\}>\{warning\}<\/li>\)\}/);
});
