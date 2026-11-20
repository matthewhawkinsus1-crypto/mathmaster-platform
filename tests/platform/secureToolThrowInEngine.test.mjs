/*
 * A TOOL THAT THROWS INSIDE THE QUESTION ENGINE, ON A SECURE TEST.
 *
 * SecureExamQuestionPlayer puts each item in QuestionResolutionBoundary, in
 * the words a secure Test can keep: the saved answers are kept, Try again, and
 * no copyable report (secureItemThrowKeepsTheTest.test.mjs). A tool item's
 * tool, though, is drawn inside QuestionEngine, whose own module boundary
 * (QuestionModuleBoundary) caught a throw first. Its panel said "your grade is
 * not affected", which a secure Test cannot promise of an item that cannot be
 * answered; offered "Copy details for your teacher"; and offered "Start this
 * question fresh", which sets aside the very answer the Test is saving.
 *
 * Now the secure player hands its words down (`itemFailure`), and the engine's
 * module boundary hands the failure up to the engine's own
 * QuestionResolutionBoundary, which says them. The browser walk
 * (tests/browser/secureExamNavigation.mjs, journey toolThrows) throws from a
 * real tool on a Chromebook and a phone.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { executableSource, region } from './helpers/sourceContract.mjs';

let vite = null;
before(async () => {
  const { createServer } = await import('vite');
  vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
});
after(async () => { await vite?.close(); });

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const SECURE_NOTE = 'Your saved answers are kept exactly as they are.';
const toolError = () => new TypeError("Cannot read properties of undefined (reading 'map')");

test('the module boundary hands a failure to its host when told to, and draws its own panel otherwise', async () => {
  const { default: QuestionModuleBoundary } = await vite.ssrLoadModule('/src/QuestionModuleBoundary.jsx');
  const error = toolError();
  const handing = new QuestionModuleBoundary({ failuresToHost: true, questionType: 'intervalNumberLine', onRecover: () => {} });
  handing.state = QuestionModuleBoundary.getDerivedStateFromError(error);
  assert.throws(() => handing.render(), (thrown) => thrown === error, 'the same error goes on up');

  // Every other question keeps its panel, words and all.
  const own = new QuestionModuleBoundary({ questionType: 'intervalNumberLine', onRecover: () => {} });
  own.state = QuestionModuleBoundary.getDerivedStateFromError(toolError());
  const html = renderToStaticMarkup(own.render());
  assert.match(html, /This question could not be displayed/);
  assert.match(html, /your grade is not affected/);
  assert.match(html, /Start this question fresh/);
  assert.match(html, /Copy details for your teacher/);
});

test('the engine\'s boundary, given the secure Test\'s words, says only what the Test can promise', async () => {
  const { default: QuestionResolutionBoundary } = await vite.ssrLoadModule('/src/QuestionResolutionBoundary.jsx');
  // As QuestionEngine mounts it for a secure item: its retry, the host's note,
  // no copyable report, and no landmark of its own (the item's is around it).
  const boundary = new QuestionResolutionBoundary({
    context: { questionId: 'q-2', activityRole: 'secureTest' },
    executionScope: 'student',
    onRetry: () => {},
    technicalDetails: false,
    savedWorkNote: SECURE_NOTE,
  });
  boundary.state = QuestionResolutionBoundary.getDerivedStateFromError(toolError());
  const html = renderToStaticMarkup(boundary.render());
  assert.match(html, /This question did not load/);
  assert.match(html, />Try again</);
  assert.match(html, new RegExp(SECURE_NOTE.replace(/\./g, '\\.')));
  assert.doesNotMatch(html, /grade is not affected|could not be displayed|Start this question fresh/);
  assert.doesNotMatch(html, /Copy details for your teacher|Teacher details/);
  assert.doesNotMatch(html, /<main\b/);
});

test('the secure player\'s words reach the engine, and only through the tool item', () => {
  const player = executableSource(read('src/components/assessment/SecureExamQuestionPlayer.jsx'));
  const runtime = region(player, '<RichQuestionRuntime', '/>', 'the item');
  assert.match(runtime, /itemFailure=\{itemFailure\}/);

  const rich = executableSource(read('src/components/question/RichQuestionRuntime.jsx'));
  assert.match(rich, /\n {2}itemFailure = null,\n {2}onSubmit,/, 'the export takes the host\'s words');
  assert.match(region(rich, '<ToolItem', '/>', 'the tool item'), /itemFailure=\{itemFailure\}/);
  assert.doesNotMatch(region(rich, '<FieldItem', '/>', 'the field item'), /itemFailure/, 'a field item is inside the host\'s own boundary already');
  const engine = region(rich, '<QuestionEngine', '/>', 'the tool item\'s engine');
  assert.match(engine, /\{\.\.\.\(itemFailure \? \{\s*moduleFailuresToHost: true,\s*resolutionTechnicalDetails: itemFailure\.technicalDetails !== false,\s*resolutionSavedWorkNote: itemFailure\.savedWorkNote \|\| '',\s*\} : \{\}\)\}/);

  const questionEngine = executableSource(read('src/QuestionEngine.jsx'));
  assert.match(questionEngine, /\n {2}resolutionSavedWorkNote = '',\n/);
  assert.match(questionEngine, /\n {2}moduleFailuresToHost = false,\n/);
  assert.match(region(questionEngine, '<QuestionModuleBoundary', '</QuestionModuleBoundary>', 'the module boundary'), /failuresToHost=\{moduleFailuresToHost\}\s*>/);
  assert.match(region(questionEngine, '<QuestionResolutionFailure', '/>', 'the panel for a question that could not be prepared'), /savedWorkNote=\{resolutionSavedWorkNote \|\| ''\}/);
  assert.match(region(questionEngine, '<QuestionResolutionBoundary', '</QuestionResolutionBoundary>', 'the engine\'s boundary'), /technicalDetails=\{props\.resolutionTechnicalDetails !== false\}\s+savedWorkNote=\{props\.resolutionSavedWorkNote \|\| ''\}/);

  // The other hosts of the rich runtime keep the engine's own panel.
  for (const file of ['src/components/teacher/TestCyclePreview.jsx', 'src/components/student/TestCycleCorrections.jsx']) {
    assert.doesNotMatch(read(file), /itemFailure/, file);
  }
});

test('the browser walk that throws from a real tool runs in CI with the others', () => {
  const driver = read('tests/browser/secureExamNavigation.mjs');
  assert.match(driver, /const toolThrowsJourney = async \(context, device\) =>/);
  assert.match(driver, /brokenItemJourney, toolThrowsJourney, toolGoneJourney/);
  const harness = read('tests/browser/secureExamNavigationMain.jsx');
  assert.match(harness, /if \(scenario === 'toolThrows'\) installCrashProbe\(\);/);
  assert.match(harness, /scenario === 'toolThrows' \? crashingToolItem\(\) : undrawable\(\)/);
  // The probe stands in for a catalogue tool, and the item is drawn as it
  // (drawnQuestionKind.test.mjs holds every harness that swaps a tool to that).
  const probe = read('tests/browser/secureExamCrashProbe.jsx');
  assert.match(probe, /TOOL_REGISTRY\.intervalNumberLine = \{ \.\.\.TOOL_REGISTRY\.intervalNumberLine, component: CrashProbe \};/);
  assert.match(probe, /questionType: 'intervalNumberLine'/);
});
