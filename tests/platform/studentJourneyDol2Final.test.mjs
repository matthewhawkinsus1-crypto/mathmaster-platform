/*
 * FINAL STUDENT JOURNEY — ALGEBRA I DISTRICT DOL #2 (issue #380).
 *
 * Each block pins a behaviour a student hit while completing the whole
 * assignment in the real student player. Pure helpers are called; screen
 * wiring is asserted against the region of source that does the work.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { region, executableSource } from './helpers/sourceContract.mjs';

import { solvedStageUpdate } from '../../src/tools/stepAlgebra2/linearInterceptsMath.js';
import { unicodeSubscriptsToMathMarkup } from '../../src/mathDisplayFormat.js';
import { formatProblemForResponse } from '../../src/platform/interaction/answerShapeGuard.js';
import { checkedGraphIsPointOnly } from '../../src/platform/workflow/workflowGraphVisuals.js';
import { bringActiveStageIntoView } from '../../src/platform/workflow/stageNavigationScroll.js';
import { pinnedBottom, revealBelowSticky } from '../../src/platform/layout/stickyReveal.js';
import { CALCULATOR_MODES, getCalculatorDrawerLabel, getCalculatorModeLabel } from '../../src/platform/policies/calculatorPolicy.js';
import { formatCorrelation } from '../../src/tools/dataModeling/dataModelingMath.js';
import { questionAsksAboutQuadrants, quadrantLabelPositions } from '../../src/platform/graph/quadrantLabels.js';
import { givenRelationInstruction } from '../../src/tools/relationMapping/relationMappingCopy.js';
import { resolveNextAction } from '../../src/studentDashboardModel.js';

const source = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

// ─── Linear intercepts: the solve stage settles instead of looping ─────────

test('an unchanged solver report produces no intercept stage update, solved or not', () => {
  const unsolvedReport = {
    isComplete: false,
    isCorrect: false,
    parts: [{ id: 'algebra-objective', response: '2x=6' }],
  };
  // The first report of an unsolved equation changes nothing that is stored.
  assert.equal(solvedStageUpdate({ solved: false, solvedEquationLatex: '' }, unsolvedReport), null);
  // Solving is a change, and applying it makes the same report a no-op —
  // the idempotence that stops the report → update → re-render → report loop.
  const solvedReport = { isComplete: true, isCorrect: true, parts: [{ id: 'algebra-objective', response: 'x=3' }] };
  const update = solvedStageUpdate({ solved: false, solvedEquationLatex: '' }, solvedReport);
  assert.deepEqual(update, { solved: true, solvedEquationLatex: 'x=3' });
  assert.equal(solvedStageUpdate({ ...update }, solvedReport), null);
});

test('the intercept orchestrator decides stage updates with solvedStageUpdate', () => {
  const orchestrator = source('src/LinearInterceptsOrchestrator.jsx');
  const handler = region(orchestrator, 'const handleSubEquationStateChange', 'const setPoint', 'sub-equation handler');
  assert.match(handler, /solvedStageUpdate\(stage, payload\)/);
  assert.match(handler, /if \(!update\) return;/);
});

test('Enter in an intercept ordered-pair field checks the point', () => {
  const orchestrator = source('src/LinearInterceptsOrchestrator.jsx');
  const pairField = region(orchestrator, 'value={stage.point}', 'placeholder="(x, y)"', 'ordered-pair field');
  assert.match(pairField, /onSubmit=\{disabled \? null : checkCurrentIntercept\}/);
});

test('both intercepts checked shows one completion summary and is re-reported after a reload', () => {
  const orchestrator = source('src/LinearInterceptsOrchestrator.jsx');
  const content = region(orchestrator, 'const content = bothInterceptsFound ?', ') : !stage.committed ?', 'completion content');
  assert.match(content, /Both intercepts found\./);
  assert.match(content, /\{!disabled \? .*Submit your answer to finish this question\./s);
  // Both reports are the same payload — the shared grader's verdict on the
  // recorded pairs, graded against the question's own line
  // (interceptOutcomePolicy.test.mjs) — built from the work as it stands.
  const restore = region(orchestrator, 'const bothInterceptsFound =', 'const standardUsable', 'restored completion effect');
  assert.match(restore, /onStateChange\?\.\(interceptCompletionPayload\(work\)\)/);
  assert.match(restore, /completionReportedRef\.current = true/);
  const check = region(orchestrator, 'const finishedWork = {', 'const activeRedirect', 'final check');
  assert.match(check, /onStateChange\?\.\(interceptCompletionPayload\(finishedWork\)\)/);
});

test('intercept controls use student words, never staging vocabulary', () => {
  for (const path of ['src/LinearInterceptsOrchestrator.jsx', 'src/tools/stepAlgebra2/LinearIntercepts.jsx']) {
    const text = executableSource(source(path));
    assert.doesNotMatch(text, /Commit substitution|staged substitution/i, path);
    assert.match(text, /Substitute and solve/, path);
  }
});

test('an intercept question submits as "Submit Intercepts", not as a solved equation', () => {
  const engine = source('src/QuestionEngine.jsx');
  const label = region(engine, 'const submitLabel = submitting', 'const workspaceActions', 'submit label');
  const intercept = label.indexOf('ALGEBRA_WORKSPACE_ROUTES.LINEAR_INTERCEPTS');
  const stepAlgebra = label.indexOf("'Submit Solved Equation'");
  assert.ok(intercept > -1 && stepAlgebra > intercept, 'the intercept route is decided before the Step Algebra label');
  assert.match(label, /'Submit Intercepts'/);
});

// ─── Locked work is inert to the keyboard, not only to the mouse ───────────

test('the locked tool region passes a boolean inert (React 19 reads "" as false)', () => {
  const engine = source('src/QuestionEngine.jsx');
  const lockedRegion = region(engine, '<div aria-disabled={locked', '<QuestionModuleBoundary', 'locked tool region');
  assert.match(lockedRegion, /inert=\{[^}]*\? true : undefined\}/);
  assert.doesNotMatch(lockedRegion, /inert=\{[^}]*\? '' : undefined\}/);
});

// ─── Math display: Unicode subscripts become subscripts ────────────────────

test('Unicode subscripts are rewritten into the syntax of the format that parses them', () => {
  assert.equal(unicodeSubscriptsToMathMarkup('a₄', 'ascii-math'), 'a_4');
  assert.equal(unicodeSubscriptsToMathMarkup('aₙ₋₁', 'ascii-math'), 'a_(n-1)');
  assert.equal(unicodeSubscriptsToMathMarkup('aₙ₋₁', 'latex'), 'a_{n-1}');
  assert.equal(unicodeSubscriptsToMathMarkup('x^2 + 1', 'ascii-math'), 'x^2 + 1');
  const display = source('src/MathDisplay.jsx');
  assert.match(display, /const typesetValue = unicodeSubscriptsToMathMarkup\(cleanValue, resolvedFormat\)/);
  assert.match(region(display, '<Element', '</Element>', 'rendered math'), /\{typesetValue\}/);
});

// ─── Answer shape is checked before it can cost a try ──────────────────────

test('an expression field holding an equation is held back with a reason; its key decides', () => {
  const expression = { answerFormat: 'expression', answer: '3*2^(n-1)' };
  assert.match(formatProblemForResponse(expression, 'a_{n}=3\\cdot2^{n-1}'), /without an equals sign/);
  assert.equal(formatProblemForResponse(expression, '3\\cdot2^{n-1}'), '');
  assert.equal(formatProblemForResponse(expression, ''), '');
  // A field whose own key contains "=" is never blocked for containing one.
  assert.equal(formatProblemForResponse({ answerFormat: 'expression', answer: 'y=2x' }, 'y=2x'), '');
  assert.match(formatProblemForResponse({ answerFormat: 'equation', answer: 'x=2' }, '2'), /including the equals sign/);
  assert.equal(formatProblemForResponse({ answerFormat: 'number', answer: '-9' }, '-9'), '');

  const multi = source('src/MultiAnswerGrader.jsx');
  const completeness = region(multi, 'const graded = gradeMultiAnswerResponse', 'useEffect(', 'multi-answer completeness');
  assert.match(completeness, /formatProblemForResponse\(field, answers\[field\.id\]\)/);
  assert.match(completeness, /const isComplete = graded\.isComplete && !Object\.values\(formatProblems\)\.some\(Boolean\)/);
});

// ─── Discrete models are reviewed as points ────────────────────────────────

test('a checked graph follows the student\'s discrete/continuous answer', () => {
  const graphStage = { kind: 'functionGraph', continuityStageId: 'continuity' };
  assert.equal(checkedGraphIsPointOnly({ graphStage, responses: { continuity: 'discrete' } }), true);
  assert.equal(checkedGraphIsPointOnly({ graphStage, responses: { continuity: 'continuous' } }), false);
  assert.equal(checkedGraphIsPointOnly({ graphStage: { kind: 'coordinatePlot' } }), true);
  assert.equal(checkedGraphIsPointOnly({ graphStage: { kind: 'functionGraph' } }), false);
  const runner = source('src/platform/workflow/WorkflowRunner.jsx');
  const review = region(runner, 'const checkedGraphReference', 'export default function WorkflowRunner', 'checked graph review');
  assert.match(review, /if \(checkedGraphIsPointOnly\(\{ graphStage, responses \}\)\) \{/);
});

// ─── Sticky-aware reveals measure instead of stacking scroll offsets ───────

const fakeWindow = ({ desktop = true, styles = new Map(), rootOffset = '38px' } = {}) => {
  const scrolled = [];
  const documentElement = {};
  return {
    scrolled,
    document: { documentElement },
    matchMedia: () => ({ matches: desktop }),
    getComputedStyle: (element) => (element === documentElement
      ? { getPropertyValue: () => rootOffset }
      : styles.get(element) || { position: 'static', top: 'auto' }),
    scrollBy: (options) => scrolled.push(options.top),
  };
};
const box = (top, height = 100) => ({ getBoundingClientRect: () => ({ top, height }) });

test('a target is brought to just below the pinned sticky element', () => {
  const sticky = box(196, 225);
  const win = fakeWindow({ styles: new Map([[sticky, { position: 'sticky', top: '196px' }]]) });
  assert.equal(pinnedBottom(sticky, win), 421);
  assert.equal(revealBelowSticky({ target: box(758), sticky, win }), true);
  assert.deepEqual(win.scrolled, [758 - 429]);
});

test('an element that is not pinned on this screen covers nothing but the identity bar', () => {
  const nav = box(0, 300);
  const win = fakeWindow({ styles: new Map([[nav, { position: 'relative', top: 'auto' }]]) });
  assert.equal(pinnedBottom(nav, win), 38);
});

// A phone does not get this reveal: it has no pinned task card, and the step's
// answer area is brought into its own scroller instead
// (stageNavigationPhoneReveal.test.mjs). This root has no active stage, so the
// phone call has nothing to reveal — and would scroll the window under the
// anchor if the desktop reveal ever ran there.
test('student step navigation brings the step card under the task, on desktop only', () => {
  const anchor = box(196, 225);
  const workspace = box(700);
  const ownerDocument = { querySelector: (selector) => (selector === '.mathmaster-desktop-question-anchor' ? anchor : null) };
  const root = {
    ownerDocument,
    closest: () => null,
    querySelector: (selector) => (selector === '.workflow-focus__workspace' ? workspace : null),
  };
  const desktop = fakeWindow({ styles: new Map([[anchor, { position: 'sticky', top: '196px' }]]) });
  assert.equal(bringActiveStageIntoView(root, { win: desktop }), true);
  assert.deepEqual(desktop.scrolled, [700 - 429]);
  const phone = fakeWindow({ desktop: false });
  assert.equal(bringActiveStageIntoView(root, { win: phone }), false);
  const inWorkView = { ...root, closest: () => ({}) };
  assert.equal(bringActiveStageIntoView(inWorkView, { win: desktop }), false);

  const runner = source('src/platform/workflow/WorkflowRunner.jsx');
  const navigation = region(runner, 'const goToStage = useCallback', 'if (!workflow.length) return null;', 'step navigation');
  assert.match(navigation, /bringActiveStageIntoView\(focusRootRef\.current\)/);
  const footer = region(runner, '<footer className="workflow-focus__footer">', '</footer>', 'step footer');
  assert.equal((footer.match(/goToStage\(/g) || []).length, 2, 'Previous and Next both go through goToStage');
  assert.doesNotMatch(footer, /setActiveStageIndex/);
});

test('a question change reveals the question by measuring on desktop', () => {
  const app = source('src/App.jsx');
  const reveal = region(app, 'const reveal = (behavior) => {', 'const firstFrame', 'question reveal');
  assert.match(reveal, /if \(isDesktopStickyLayout\(\)\) \{/);
  assert.match(reveal, /revealBelowSticky\(\{ target: stage, sticky: document\.querySelector\('\.mathmaster-assignment-unified-nav'\)/);
  assert.match(app, /import \{ isDesktopStickyLayout, revealBelowSticky \} from '\.\/platform\/layout\/stickyReveal\.js';/);
});

// ─── Calculator, correlation, quadrants, relation copy ─────────────────────

test('the calculator drawer never calls itself a graphing calculator', () => {
  assert.equal(getCalculatorDrawerLabel(CALCULATOR_MODES.GRAPHING), 'SCIENTIFIC');
  assert.equal(getCalculatorDrawerLabel(CALCULATOR_MODES.BASIC), getCalculatorModeLabel(CALCULATOR_MODES.BASIC));
  const panel = source('src/components/CalculatorPanel.jsx');
  assert.match(panel, /\{getCalculatorDrawerLabel\(policy\.mode\)\} CALCULATOR/);
  assert.doesNotMatch(panel, /Graph construction stays in the MathMaster graph workspace/);
});

test('r is never shown as a perfect ±1 unless it is one', () => {
  assert.equal(formatCorrelation(0.99966), '0.9997');
  assert.equal(formatCorrelation(0.998), '0.998');
  assert.equal(formatCorrelation(-0.99999), '-0.99999');
  assert.equal(formatCorrelation(1), '1');
  assert.equal(formatCorrelation(Number.NaN), '—');
  const lab = source('src/tools/dataModeling/DataModelingLab.jsx');
  assert.doesNotMatch(lab, /round\(r, 3\)/);
});

test('quadrant questions name the quadrants on their graph', () => {
  assert.equal(questionAsksAboutQuadrants({ prompt: 'Which quadrants does the line pass through?' }), true);
  assert.equal(questionAsksAboutQuadrants({ prompt: 'Find the vertex.', answerFields: [{ label: 'Which quadrants does the graph pass through?' }] }), true);
  assert.equal(questionAsksAboutQuadrants({ prompt: 'State the domain.' }), false);
  const positions = quadrantLabelPositions({ xMin: -4, xMax: 4, yMin: -2, yMax: 8 });
  assert.deepEqual(positions.map((entry) => entry.label), ['I', 'II', 'III', 'IV']);
  assert.ok(positions.every((entry) => Math.sign(entry.x) !== 0 && Math.sign(entry.y) !== 0));
  assert.deepEqual(quadrantLabelPositions({ xMin: 0, xMax: 10, yMin: -5, yMax: 5 }), [], 'no labels without both axes');
  assert.match(source('src/QuestionVisual.jsx'), /questionAsksAboutQuadrants\(question\)\s*\n?\s*\? \{ \.\.\.authoredGraph, quadrantLabels: true \}/);
  assert.match(source('src/GraphDisplay.jsx'), /quadrantLabelPositions\(\{ xMin, xMax, yMin, yMax \}\)/);
});

test('the given-relation line names only the parts this question asks for', () => {
  assert.equal(givenRelationInstruction(['mapping', 'isFunction']), 'Use these ordered pairs to build the mapping and decide whether it is a function.');
  assert.equal(givenRelationInstruction(['mapping', 'plot', 'domain', 'range']), 'Use these ordered pairs to build the mapping, plot the points, find the domain, and find the range.');
  assert.match(source('src/tools/relationMapping/RelationMapping.jsx'), /\{givenRelationInstruction\(ask\)\}/);
});

// ─── Regression technology, Work View, dialogs, dashboard ──────────────────

test('running linear regression makes its line the student\'s model and keeps the estimate visible', () => {
  const lab = source('src/tools/dataModeling/DataModelingLab.jsx');
  const run = region(lab, 'onClick={() => {\n                            if (!regressionTechnologyRun)', 'Run linear regression', 'run regression');
  assert.match(run, /setRegressionEstimate\(\{ m, b \}\)/);
  assert.match(run, /setM\(round\(regression\.m, 3\)\)/);
  assert.match(run, /setB\(round\(regression\.b, 3\)\)/);
  assert.match(lab, /Your estimate was y =/);
});

test('the Work View rail renders the finishing action as the primary one', () => {
  const figure = source('src/components/common/EnlargeableFigure.jsx');
  assert.match(figure, /const primaryShellActions = new Set\(registeredCapabilities\.primaryActions \|\| \[\]\)/);
  assert.match(figure, /data-action-emphasis=\{primaryShellActions\.has\(action\) \? 'primary' : undefined\}/);
  assert.match(source('src/components/common/WorkViewShell.css'), /button\[data-action-emphasis="primary"\]:not\(\[disabled\]\) \{[^}]*background: var\(--mm-primary\)/);
});

test('the shared confirm dialog stacks above Work View and its phone keypad', () => {
  const toast = source('src/ui/Toast.jsx');
  const confirmZ = Number(region(toast, '{confirmState && (', 'role="alertdialog"', 'confirm overlay').match(/zIndex: (\d+)/)[1]);
  const shell = source('src/components/common/WorkViewShell.css');
  const workViewLayers = [...shell.matchAll(/z-index: (\d{6,})/g)].map((match) => Number(match[1]));
  assert.ok(workViewLayers.length > 0);
  assert.ok(confirmZ > Math.max(...workViewLayers), `confirm ${confirmZ} must be above ${Math.max(...workViewLayers)}`);
});

test('the DOL "do this next" opens the first DOL question the student has not tried', () => {
  const dashboard = {
    activeDols: [{
      assignment: { id: 'a1', title: 'Review' },
      state: { questionIndices: [30, 31, 32, 33] },
      records: [{ totalAttempts: 1 }, { totalAttempts: 0 }, { totalAttempts: 0 }, { totalAttempts: 0 }],
    }],
    groups: {},
  };
  const next = resolveNextAction({ dashboard });
  assert.equal(next.kind, 'dol');
  assert.equal(next.questionIndex, 31);
});

test('the Warm-Up banner leaves once every Warm-Up question is finished', () => {
  const app = source('src/App.jsx');
  const banner = region(app, 'const renderStudentWarmupBanner', 'const renderIdleOverlay', 'warm-up banner');
  assert.match(banner, /const warmupFinished = questionIndices\.every/);
  assert.match(banner, /questionIndices\.length && !warmupFinished \?/);
});

test('the DOL question note is one quiet line in student words', () => {
  const engine = executableSource(source('src/QuestionEngine.jsx'));
  assert.doesNotMatch(engine, /records the daily DOL grade during the active class window/);
  assert.match(engine, /DOL exit ticket · this question counts toward today&apos;s DOL grade\./);
});

// The media features App.css uses, evaluated the way a browser does, so the
// test says WHICH screens a rule reaches rather than how its query is spelled.
const mediaMatches = (query, { width, height }) => query.split(/\s+and\s+/).every((part) => {
  const [, feature, value] = part.match(/\(\s*([a-z-]+)\s*:\s*([^)]+?)\s*\)/) || [];
  const px = Number.parseFloat(value);
  if (feature === 'orientation') return value === (width > height ? 'landscape' : 'portrait');
  if (feature === 'min-width') return width >= px;
  if (feature === 'max-width') return width <= px;
  if (feature === 'min-height') return height >= px;
  if (feature === 'max-height') return height <= px;
  throw new Error(`unsupported media feature in ${part}`);
});

test('short landscape screens let the navigator and task scroll; dark nav text stays readable', () => {
  const css = source('src/App.css');
  const short = region(css, 'A PHONE ON ITS SIDE HAS NO ROOM TO PIN ANYTHING.', '/* Short laptop / zoomed classroom view', 'short landscape rule');
  assert.match(short, /\.mathmaster-assignment-unified-nav,[\s\S]*position: relative;/);
  // Every phone held sideways, not only the ones 769px wide: narrower ones kept
  // the navigator sticky 44px down, over the top of the question.
  const query = short.match(/@media ([^{]+)\{/)[1].trim();
  for (const phone of [{ width: 844, height: 390 }, { width: 740, height: 360 }, { width: 667, height: 375 }, { width: 664, height: 390 }]) {
    assert.ok(mediaMatches(query, phone), `${phone.width}×${phone.height} keeps a pinned navigator (${query})`);
  }
  for (const screen of [{ width: 1366, height: 768 }, { width: 1024, height: 768 }, { width: 820, height: 1180 }, { width: 390, height: 844 }, { width: 390, height: 664 }]) {
    assert.ok(!mediaMatches(query, screen), `${screen.width}×${screen.height} loses its pinned navigator (${query})`);
  }
  assert.match(css, /:root\[data-theme='dark'\] \.mathmaster-overview-button,[\s\S]*?color: var\(--mm-primary\);/);
  assert.match(css, /\.mathmaster-current-section-summary strong \{\s*color: #1f2937;/);
});
