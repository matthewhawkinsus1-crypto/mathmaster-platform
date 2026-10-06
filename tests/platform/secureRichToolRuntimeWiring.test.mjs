/*
 * THE SHARED RICH QUESTION RUNTIME IS WHAT EVERY SECURE SURFACE RENDERS.
 *
 * Node cannot render React, so the wiring between screens is asserted on their
 * source — bound to the region that must do the work (SOURCE_CONTRACT_PLAYBOOK)
 * — and everything that IS importable is tested by behaviour: the integrity
 * logger, the assessment support profile, the calculator rule, the review
 * summary, and the draft key the browser and server must agree on.
 *
 * What is protected, in words:
 *   - a secure exam item, a correction item and a teacher's preview item all
 *     render through RichQuestionRuntime; a Rich Tool item there is the real
 *     tool in QuestionEngine, lazy-loaded, server-graded, under the mode the
 *     server stamped on the payload — never a practice mode;
 *   - every secure callable on the server grades through secureItems and
 *     checks certification before issuing;
 *   - a registry tool's live work reaches the secure autosave;
 *   - tools name their final action "Record answer" on a secure item, and the
 *     self-checks that worked as answer checks are gone where help is withheld;
 *   - Rich Tool work survives on the device and travels with the server draft.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { executableSource, region } from './helpers/sourceContract.mjs';
import { ExamIntegrityLogger, INTEGRITY_EVENT_TYPES } from '../../src/platform/assessment/examIntegrityLogger.js';
import { assessmentSupportProfile } from '../../src/studentSupport.js';
import { resolveExamCalculatorPolicy } from '../../src/platform/policies/examPolicyResolver.js';
import { describeToolWork, rawToolWorkOf, toolWorkLabel } from '../../src/platform/assessment/secureToolWorkSummary.js';
import { secureItemDraftKey } from '../../src/platform/assessment/questionRuntimePolicy.js';

const require = createRequire(import.meta.url);
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const runtime = read('src/components/question/RichQuestionRuntime.jsx');
const player = read('src/components/assessment/SecureExamQuestionPlayer.jsx');
const container = read('src/components/assessment/SecureExamContainer.jsx');
const corrections = read('src/components/student/TestCycleCorrections.jsx');
const preview = read('src/components/teacher/TestCyclePreview.jsx');
const engine = read('src/QuestionEngine.jsx');
const functionsIndex = read('functions/index.js');

test('the secure player is an adapter over the shared runtime, in a secure mode only', () => {
  assert.match(player, /import RichQuestionRuntime from '\.\.\/question\/RichQuestionRuntime\.jsx';/);
  // The mode is chosen by secureShellRuntimeMode (questionRuntimePolicy.test.mjs
  // pins its behaviour, including before the first item arrives).
  assert.match(player, /mode=\{secureShellRuntimeMode\(question\)\}/);
  // It renders nothing of its own any more: no inputs, no choices.
  assert.doesNotMatch(executableSource(player), /<input|<form|<MathText/);
});

test('the runtime lazy-loads QuestionEngine and routes a tool item to it', () => {
  assert.match(runtime, /const QuestionEngine = lazy\(\(\) => import\('\.\.\/\.\.\/QuestionEngine\.jsx'\)\);/);
  assert.doesNotMatch(executableSource(runtime), /import QuestionEngine from/, 'a field-only Test must never download the engine');
  const router = region(runtime, 'export default function RichQuestionRuntime(', null, 'the router');
  assert.match(router, /if \(question\.pathToolId\) \{\s*return \(\s*<ToolItem/);
  assert.match(router, /return \(\s*<FieldItem/);
});

test('a tool item runs the real engine server-graded, under the server-stamped mode policy', () => {
  const toolItem = region(runtime, 'const ToolItem = (', 'export default function RichQuestionRuntime(', 'tool item');
  assert.match(toolItem, /questionFromToolPayload\(question\)/);
  assert.match(toolItem, /serverGrading=\{serverGrading\}/);
  assert.match(toolItem, /pathToolId: question\.pathToolId,/);
  assert.match(toolItem, /activityPolicy=\{activityPolicy\}/);
  assert.match(toolItem, /engineActivityPolicyForMode\(policy\.mode\)/);
  assert.match(toolItem, /onResponseStateChange=\{handleRawWork\}/);
  assert.match(toolItem, /submitLabel=\{policy\.secure \? 'Record answer' : null\}/);
  assert.match(toolItem, /showStandardBadge=\{false\}/);
  assert.match(toolItem, /assessmentContext=\{assessmentContext\}/);
  // The submit carries the raw construction, never a verdict.
  const submit = region(toolItem, 'submit: async (rawWork, engineSupportUsage) => {', '}), [question.questionInstanceId', 'server submit');
  assert.match(submit, /\{ responses: \{\}, raw \}/);
  assert.doesNotMatch(submit, /isCorrect/);
  const resolve = region(runtime, 'export default function RichQuestionRuntime(', 'if (!question) return', 'mode resolution');
  assert.match(resolve, /resolveQuestionRuntimePolicy\(mode \|\| question\?\.runtimeMode\)/);
  assert.match(resolve, /policy\.secure && studentSupportProfile \? assessmentSupportProfile\(studentSupportProfile\)/);
});

test('Rich Tool work survives: device drafts restored before mount, and sent with every autosave', () => {
  const toolItem = region(runtime, 'const ToolItem = (', 'export default function RichQuestionRuntime(', 'tool item');
  // Restored in the state initializer — before QuestionEngine mounts and reads.
  assert.match(toolItem, /useState\(\(\) => \{[\s\S]{0,400}restoreQuestionDrafts\(own\)/);
  const emit = region(toolItem, 'const emitDraft = useCallback(', '}, [draftKey]);', 'draft emission');
  assert.match(emit, /workspaceDrafts: draftKey \? readQuestionDraftFamily\(draftKey\) : \[\]/);
  assert.match(emit, /raw: latestRawRef\.current/);
  // Only the student's own edits go up, not a workspace writing back on mount.
  assert.match(toolItem, /if \(!edit \|\| !belongsToDraft\(key, draftKey\)\) return;/);
});

test('the secure container gives each item its draft key and cleans up after recording', () => {
  assert.match(container, /secureItemDraftKey\(\{ surface: 'exam', sessionId: examSessionId, questionInstanceId \}\)/);
  assert.match(container, /draftKey=\{itemDraftKey\(session\.examSessionId, question\?\.questionInstanceId\)\}/);
  const submit = region(container, 'const submitResponse = async (', 'const autosaveDraft = useCallback(', 'submit');
  assert.match(submit, /removeQuestionDraftFamily\(itemDraftKey\(session\.examSessionId, question\.questionInstanceId\)\)/);
  const clear = region(container, 'const clearLocalDrafts = (', 'const SAVE_LABEL', 'session cleanup');
  assert.match(clear, /removeQuestionDraftFamily\(sessionDraftFamily\(examSessionId\)\)/);
});

test('finishing a Test leaves no Rich Tool work on the device, even what a tool wrote on its way out', () => {
  // Finishing clears while the item is still mounted; the finished view clears
  // again after the unmounting tool's own cleanups have run.
  const afterFinish = region(container, 'Once the finished view is committed', 'const finish = useCallback(', 'post-finish clear');
  assert.match(afterFinish, /if \(session\?\.examSessionId && terminal\.has\(session\.status\)\) clearLocalDrafts\(session\.examSessionId\);/);
  // A help panel the policy switched off stores nothing under the item's key
  // (the device QA found its collapsed state left behind after a Test on iPad).
  const coach = read('src/GuidedClassworkCoach.jsx');
  assert.match(coach, /const persistKey = enabled && draftKey \? draftKey : null;/);
  const hooks = executableSource(coach).match(/useLocalDraftState\(([^,]+),/g) || [];
  assert.equal(hooks.length, 2);
  hooks.forEach((hook) => assert.match(hook, /useLocalDraftState\(persistKey \?/, hook));
});

test('the engine\'s disabled final action is readable in both themes ("Record answer" before work is complete)', () => {
  const tokens = read('src/theme/tokens.css');
  const block = (selector) => {
    const start = tokens.indexOf(selector);
    assert.notEqual(start, -1, selector);
    return tokens.slice(start, tokens.indexOf('}', start));
  };
  const token = (css, name) => {
    const found = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
    assert.ok(found, name);
    return found[1];
  };
  const luminance = (hex) => {
    const channels = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const ratio = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

  const submitButton = region(engine, 'className="mathmaster-bar-submit"', '</button>', 'bar submit');
  const background = submitButton.match(/background: submitDisabled \? 'var\(--([\w-]+)\)'/);
  const color = submitButton.match(/color: submitDisabled \? 'var\(--([\w-]+)\)'/);
  assert.ok(background && color, 'the disabled state takes its colours from theme tokens');
  [[':root {', 'light'], [":root[data-theme='dark'] {", 'dark']].forEach(([selector, theme]) => {
    const css = block(selector);
    const contrast = ratio(token(css, color[1]), token(css, background[1]));
    assert.ok(contrast >= 4.5, `${theme}: ${contrast.toFixed(2)}:1`);
  });
});

test('the browser and the server build the same draft key (the server accepts drafts only inside it)', async () => {
  const secureItems = require('../../functions/lib/secureItems.js');
  assert.equal(
    secureItemDraftKey({ surface: 'exam', sessionId: 'sess/1', questionInstanceId: 'examq_9' }),
    await secureItems.examItemDraftKey('sess/1', 'examq_9'),
  );
});

test('Corrections and the teacher preview render through the same runtime', () => {
  assert.match(corrections, /import RichQuestionRuntime from '\.\.\/question\/RichQuestionRuntime\.jsx';/);
  assert.doesNotMatch(executableSource(corrections), /<input|type="radio"/, 'no second field renderer');
  assert.match(preview, /<SecureExamQuestionPlayer[\s\S]{0,700}executionScope="teacherPreview"/);
  assert.match(preview, /<RichQuestionRuntime[\s\S]{0,200}mode="corrections"/);
  // The preview asks the server for the stage's real policy, and keeps nothing.
  assert.match(preview, /previewTestCycleSecureItems\(\{ assignmentId: assignment\.id, draw: nextDraw, stage \}\)/);
  assert.match(preview, /useEffect\(\(\) => \(\) => clearPreviewDrafts\(assignment\.id\), \[assignment\.id\]\);/);
});

test('QuestionEngine publishes a registry tool\'s live work under server grading, ungraded', () => {
  const handler = region(engine, 'const handleToolWork = useCallback((work) => {', 'const handleMissingToolAction = async', 'tool work handler');
  const serverBranch = region(handler, 'if (serverGrading) {', 'return;\n    }', 'server branch');
  assert.match(serverBranch, /onResponseStateChangeRef\.current\?\.\(work \?\? null\)/);
  assert.doesNotMatch(serverBranch, /gradeRegistryToolWork|setAnswerState/);
  // And the host's label reaches every registry tool.
  assert.match(region(engine, '<ToolRuntimeProvider\n          showImmediateFeedback={showOutcomeFeedback && !serverGrading}\n          hintsAllowed={toolHintsAllowed}\n          onHintUsed={recordHintUse}\n          questionTerminal={locked}\n          attemptOutcome', '>', 'registry provider'), /submitLabel=\{hostSubmitLabel\}/);
});

test('every certified registry tool names its final action through the runtime label', () => {
  [
    'src/tools/graphing2/Graphing2.jsx',
    'src/tools/systemsWorkspace/SystemsWorkspace.jsx',
    'src/tools/systemsWorkspace/StudentBuildInequalityMode.jsx',
    'src/tools/relationMapping/RelationMapping.jsx',
    'src/tools/intervalNumberLine/IntervalNumberLine.jsx',
    'src/tools/dataModeling/DataModelingLab.jsx',
    'src/tools/regressionCalculator/RegressionCalculator.jsx',
  ].forEach((path) => {
    const source = executableSource(read(path));
    assert.match(source, /useSubmitLabel\(/, `${path} reads the host's label`);
    // No final action is hard-coded "Check …" in a primaryActions entry any more.
    assert.doesNotMatch(source, /primaryActions: \[\{ id: '[^']+', label: '(Check|Submit)[^']*'/, `${path} hard-codes its final action`);
  });
  // The Number Line titles the panel holding that action; on a secure item the
  // title follows the host label too (the device QA read "Check your graph"
  // above "Record answer").
  const numberLine = executableSource(read('src/tools/intervalNumberLine/IntervalNumberLine.jsx'));
  assert.match(numberLine, /const hostSubmitLabel = useHostSubmitLabel\(\);/);
  assert.match(numberLine, /responsePanelTitle = asksNotation \? 'Write it in notation' : hostSubmitLabel \? 'Your graph' : 'Check your graph'/);
});

test('Graphing\'s "Your line" readout is a self-check, withheld where help is', () => {
  const graphing = read('src/tools/graphing2/Graphing2.jsx');
  assert.match(graphing, /const showLineReadout = hintsAllowed;/);
  assert.match(graphing, /\{showLineReadout \? \(\s*<>\s*<dt[^>]*>Your line<\/dt>/);
  assert.match(graphing, /label: studentLine && showLineReadout \? `Your line: \$\{formatLine\(studentLine\)\}` : 'Your line'/);
});

test('the Data Modeling Lab\'s teaching notes are hints: withheld where help is', () => {
  // "It does not, by itself, prove causation" sat under "What can this
  // observational data justify?" — the answer to that part, on every secure
  // item that asks it. The same for reading r and residual plots, and for
  // choosing between models.
  const lab = executableSource(read('src/tools/dataModeling/DataModelingLab.jsx'));
  assert.match(lab, /const teachingNotes = useHintsAllowed\(\);/);
  [
    'Interpret r by its sign',
    'It does not, by itself, prove causation',
    'A good residual plot should look randomly scattered',
    'Pick the model with the smaller residual error',
  ].forEach((sentence) => {
    const at = lab.indexOf(sentence);
    assert.notEqual(at, -1, sentence);
    // The nearest guard before the sentence, within its own element.
    const before = lab.slice(Math.max(0, at - 420), at);
    assert.match(before, /\{teachingNotes \? [\s\S]*$/, `${sentence} is rendered only with teachingNotes`);
    assert.doesNotMatch(before.slice(before.lastIndexOf('{teachingNotes ?')), /\) : null\}|: null\}/, `${sentence} sits inside the guarded element`);
  });
});

test('Step Algebra: cue toggle and a draft-borne support level both follow the hint permission', () => {
  const algebra = read('src/StepByStepAlgebraCore.jsx');
  assert.match(algebra, /\(hintsAllowed \? \(savedDraft\?\.supportLevel \?\? savedDraft\?\.mode\) : null\) \?\? question\.workspaceDifficulty/);
  assert.match(algebra, /\(\) => hintsAllowed && getSupportPolicy\(/);
  assert.match(algebra, /\{hintsAllowed \? \(\s*<label[\s\S]{0,400}Cancellation hints/);
  const relation = read('src/MultiRelationAlgebraCore.jsx');
  assert.match(relation, /\{contextHintsAllowed !== false \? \(\s*<label[\s\S]{0,900}Cancellation hints/);
  assert.match(relation, /\{stepCreditPercent > 0 && showImmediateFeedback && \(/);
});

test('every secure callable grades through secureItems; the field grader is not called directly', () => {
  assert.doesNotMatch(executableSource(functionsIndex), /mathPath\.gradeResponse\(/, 'a secure path still calls the field grader directly');
  const submit = region(functionsIndex, 'exports.submitSecureExamResponse = onCall(', 'exports.recordSecureExamIntegrityEvent', 'submit');
  assert.match(submit, /const grading = await secureItems\.gradeIssuedItem\(current, request\.data\?\.responsePayload \|\| \{\}\);\s*\/\/[\s\S]{0,400}if \(grading\.rejected\) \{\s*throw new HttpsError\("invalid-argument"/);
  assert.match(region(functionsIndex, 'async function applyOpenSecureExamDraft(', 'exports.finalizeSecureExam', 'finalize'), /secureItems\.gradeIssuedItem\(current, recordedPayload\)/);
  assert.match(region(functionsIndex, 'exports.submitTestCycleCorrectionResponse = onCall(', 'async function ensureRetestSession', 'corrections submit'), /secureItems\.gradeIssuedItem\(openForGrading,/);
  assert.match(region(functionsIndex, 'exports.gradeTestCyclePreviewItem = onCall(', 'const ASSIGNMENT_EVIDENCE_GRADE_MAPS', 'preview grade'), /secureItems\.gradeItem\(issuePlan\.privateGrading/);
});

test('an issued Rich Tool item is stored with its tool fields encoded (Firestore holds no array inside an array)', () => {
  const storage = require('../../functions/lib/secureItemStorage.js');
  const item = { questionInstanceId: 'q', privateGrading: { pathToolId: 'relationMapping', definition: { arrows: [[1, 2], [3, 4]] } }, tool: { points: [[0, 1]] }, prompt: 'p' };
  const stored = storage.storableItem(item);
  assert.equal(typeof stored.privateGradingJson, 'string');
  assert.equal(typeof stored.toolJson, 'string');
  assert.equal('privateGrading' in stored, false);
  assert.equal(stored.prompt, 'p');
  assert.deepEqual(storage.readStoredItem(stored), item);
  assert.deepEqual(storage.readStoredItem(item), item, 'a document written before the encoding reads back unchanged');
  // Every write of an issued item goes through it.
  assert.match(region(functionsIndex, 'async function issueCourseTestQuestion(', 'exports.updateMyMathPathMasteryFromEvidence', 'course test issue'), /const currentQuestion = secureItems\.storableItem\(\{/);
  assert.match(region(functionsIndex, 'exports.issueTestCycleCorrectionQuestion = onCall(', 'exports.submitTestCycleCorrectionResponse', 'correction issue'), /issued = secureItems\.storableItem\(\{/);
  const submit = region(functionsIndex, 'exports.submitSecureExamResponse = onCall(', 'exports.recordSecureExamIntegrityEvent', 'submit');
  assert.match(submit, /questionSnapshot: secureItems\.storableItem\(await reviewSnapshotOf\(current, session\)\)/);
});

test('every secure issue path checks the item\'s certification and sends the mode-aware payload', () => {
  assert.match(region(functionsIndex, 'async function issueCourseTestQuestion(', 'exports.updateMyMathPathMasteryFromEvidence', 'course test issue'), /secureItems\.certifyItem\(instantiated\.question, \{ mode: runtimeMode \}\)[\s\S]{0,120}if \(!certification\.compatible\)/);
  assert.match(region(functionsIndex, 'exports.issueTestCycleCorrectionQuestion = onCall(', 'exports.submitTestCycleCorrectionResponse', 'correction issue'), /secureItems\.certifyItem\(instantiated\.question, \{ mode: "corrections" \}\);\s*if \(!certification\.compatible\) continue;/);
  assert.match(region(functionsIndex, 'exports.previewTestCycleSecureItems = onCall(', 'exports.gradeTestCyclePreviewItem', 'preview issue'), /secureItems\.certifyItem\(instantiated\.question, \{ mode: runtimeMode \}\)/);
  assert.match(region(functionsIndex, 'async function secureExamPublicQuestion(', 'function assertStudentExamSession', 'public question'), /secureItems\.publicItem\(question, \{ mode: mode \|\| "secureTest" \}\)/);
  const draft = region(functionsIndex, 'exports.saveSecureExamDraft = onCall(', 'exports.submitSecureExamResponse', 'draft save');
  assert.match(draft, /draftKey: await secureItems\.examItemDraftKey\(examSessionId, questionInstanceId\),\s*includeWorkspaceDrafts: true,/);
});

test('a context menu the page already suppressed is not an integrity event; any other still is', () => {
  const events = [];
  const logger = new ExamIntegrityLogger({ examSessionId: 's1', onEvent: (event) => events.push(event) });
  let prevented = 0;
  logger.handleContextMenu({ defaultPrevented: true, preventDefault: () => { prevented += 1; } });
  assert.equal(events.length, 0, 'a long press the math editor consumed opened no menu');
  logger.handleContextMenu({ defaultPrevented: false, preventDefault: () => { prevented += 1; } });
  assert.equal(events.length, 1);
  assert.equal(events[0].type, INTEGRITY_EVENT_TYPES.CONTEXT_MENU);
  assert.equal(prevented, 1, 'the real menu is still cancelled');
});

test('on a secure item a student keeps access accommodations and loses construct changes', () => {
  const profile = assessmentSupportProfile({
    accommodations: ['calculator-scientific', 'text-to-speech', 'large-text', 'algebra-auto-apply'],
    modifications: ['prefill-first-step', 'reduce-complexity'],
  });
  assert.deepEqual(profile.accommodations, ['calculator-scientific', 'text-to-speech', 'large-text']);
  assert.deepEqual(profile.modifications, []);
});

test('a course Test honours an item\'s own calculator requirement under questionSpecific', () => {
  const scientific = resolveExamCalculatorPolicy({ examType: 'courseTest', questionSpec: { calculatorPolicy: 'scientific', sessionCalculatorMode: 'questionSpecific' } });
  assert.equal(scientific.available, true);
  assert.equal(scientific.mode, 'scientific');
  const none = resolveExamCalculatorPolicy({ examType: 'courseTest', questionSpec: { calculatorPolicy: 'none', sessionCalculatorMode: 'questionSpecific' } });
  assert.equal(none.available, false);
  // A session-wide blueprint setting still wins over the item.
  const session = resolveExamCalculatorPolicy({ examType: 'courseTest', questionSpec: { calculatorPolicy: 'scientific', sessionCalculatorMode: 'none' } });
  assert.equal(session.available, false);
});

test('released review reads a tool answer back in the student\'s own values', () => {
  assert.deepEqual(describeToolWork('graphing2', { points: [[1, 2], [3, 4]] }), [{ id: 'points', label: 'Points plotted', value: '(1, 2), (3, 4)' }]);
  assert.deepEqual(describeToolWork('stepAlgebra', { finalEquation: 'x = 4' })[0].value, 'x = 4');
  assert.equal(describeToolWork('intervalNumberLine', { intervals: [{ min: null, max: -3, minClosed: false, maxClosed: true }] })[0].value, '(-∞, -3]');
  assert.deepEqual(rawToolWorkOf({ rawJson: '{"points":[[0,1],[1,3]]}' }), { points: [[0, 1], [1, 3]] });
  assert.equal(toolWorkLabel('graphing2'), 'Graphing');
  const review = read('src/components/assessment/SecureExamReview.jsx');
  assert.match(region(review, 'const responseRows = (item) => {', 'export default function', 'review rows'), /describeToolWork\(toolId, rawToolWorkOf\(item\?\.responsePayload\)\)/);
});
