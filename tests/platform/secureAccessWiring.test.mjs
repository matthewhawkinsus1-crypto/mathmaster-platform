import test from 'node:test';
import assert from 'node:assert/strict';

import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

/*
 * ACCESS PARITY, WIRED INTO THE SECURE TEST.
 *
 * The components are tested on their own (secureAccessComponents,
 * secureMathAnswerRoundTrip, secureItemAccess, satReferenceSheet,
 * graphingCalculatorModel, examToolLayout). These contracts hold the wiring:
 * every secure field item types its answer in the math editor where the
 * grader reads it, gets Read aloud / Translate / Vocabulary for its PROMPT
 * from the student's own plan, and a Digital SAT practice test carries a real
 * reference sheet and a graphing calculator in its toolbar. Nothing renders
 * React in node, so each is anchored to the statement that does the work,
 * with its import asserted beside it.
 */

const runtime = componentSource('src/components/question/RichQuestionRuntime.jsx');
const container = componentSource('src/components/assessment/SecureExamContainer.jsx');
const header = componentSource('src/components/assessment/ExamPrepHeader.jsx');
const dashboard = componentSource('src/components/assessment/StudentSecureExamDashboard.jsx');

test('a typed answer is entered in the math editor component, which picks the editor or a text box per profile', () => {
  assert.match(runtime, /^import SecureMathAnswerField from '\.\.\/assessment\/SecureMathAnswerField\.jsx';$/m);
  const field = region(runtime, 'const FieldItem = (', '\n};\n', 'FieldItem');
  assert.match(field, /<SecureMathAnswerField\s+field=\{field\}\s+value=\{responses\[field\.id\] \?\? ''\}\s+onChange=\{\(next\) => updateResponse\(field\.id, next\)\}\s+readOnly=\{locked\}/);
  // The plain text input is gone from the typed branch.
  assert.doesNotMatch(executableSource(field), /<input\s+autoComplete="off"/);
});

test("a secure field item offers prompt-only supports from the student's own plan, not the flattened profile", () => {
  assert.match(runtime, /^import SecureItemAccessSupports from '\.\.\/assessment\/SecureItemAccessSupports\.jsx';$/m);
  const field = region(runtime, 'const FieldItem = (', '\n};\n', 'FieldItem');
  assert.match(field, /\{policy\.secure && <SecureItemAccessSupports question=\{question\} studentSupportProfile=\{rawStudentSupportProfile\} \/>\}/);
  const root = region(runtime, 'export default function RichQuestionRuntime(', '\n}\n', 'root');
  const fieldProps = region(root, '<FieldItem', '/>', 'FieldItem props');
  assert.match(fieldProps, /rawStudentSupportProfile=\{studentSupportProfile\}/);
  assert.match(fieldProps, /studentSupportProfile=\{supportProfile\}/);
});

test("a secure Rich Tool item's own tray offers the student's secure supports, Vocabulary without worked examples (H-16)", () => {
  assert.match(runtime, /^import \{ secureAccessEntitlement \} from '\.\.\/\.\.\/platform\/assessment\/secureItemAccess\.js';$/m);
  const entitlement = region(runtime, 'const secureToolTrayEntitlement = (rawStudentSupportProfile) => {', '\n};\n', 'tray entitlement');
  assert.match(entitlement, /const entitlement = secureAccessEntitlement\(rawStudentSupportProfile\);/);
  // Every secure tool the plan grants on a test — Vocabulary included, so a
  // glossary accommodation reaches tool items — and the glossary's examples off.
  // …and the PROMPT's words only, never the tool's own list (H-16 review B2).
  assert.match(entitlement, /return \{ tools: entitlement\.tools, language: entitlement\.language, showExamples: false, promptTermsOnly: true \};/);
  assert.doesNotMatch(executableSource(entitlement), /filter\(/, 'no tool is taken away from the plan\'s secure set');
  const tool = region(runtime, 'const ToolItem = (', '\n};\n', 'ToolItem');
  assert.match(tool, /\(\) => \(policy\.secure \? secureToolTrayEntitlement\(rawStudentSupportProfile\) : null\)/);
  assert.match(region(tool, '<QuestionEngine', '/>', 'engine props'), /supportEntitlement=\{trayEntitlement\}/);
  const root = region(runtime, 'export default function RichQuestionRuntime(', '\n}\n', 'root');
  assert.match(region(root, '<ToolItem', '/>', 'ToolItem props'), /rawStudentSupportProfile=\{studentSupportProfile\}/);
});

test('a secure tool item\'s Vocabulary lists the prompt\'s words, never the tool\'s method words (H-16 review B2)', async () => {
  const { supportToolsForItem } = await import('../../src/platform/language/supportToolsModel.js');
  // The entitlement RichQuestionRuntime hands the engine on a secure tool item.
  const secure = { tools: ['vocabulary'], language: null, showExamples: false, promptTermsOnly: true };
  const METHOD = ['distribute', 'inverse-operation', 'like-terms', 'elimination', 'substitution', 'dashed', 'solid', 'shade', 'boundary'];
  for (const [prompt, toolType] of [
    ['Solve $3(x+2)=18$.', 'stepAlgebra'],
    ['Solve the system $x+y=5$ and $x-y=1$.', 'systemsWorkspace'],
    ['Graph $y<2x-3$.', 'graphing2'],
  ]) {
    const terms = supportToolsForItem({ entitlement: secure, prompt, toolType }).tools[0].termIds;
    assert.deepEqual(terms.filter((id) => METHOD.includes(id)), [], `${toolType}: ${terms.join(', ')}`);
    // A practice surface keeps the tool's words.
    const practice = supportToolsForItem({ entitlement: { tools: ['vocabulary'], language: null }, prompt, toolType }).tools[0].termIds;
    assert.ok(practice.some((id) => METHOD.includes(id)), `${toolType}: practice keeps its tool words`);
  }
  // The prompt's own words stay.
  assert.ok(supportToolsForItem({ entitlement: secure, prompt: 'Graph $y<2x-3$.', toolType: 'graphing2' }).tools[0].termIds.includes('graph'));
});

test('the engine tray\'s Vocabulary panel leaves the examples out when the entitlement says so (H-16)', () => {
  const tray = componentSource('src/components/student/supportTools/SupportToolsTray.jsx');
  assert.match(tray, /<VocabularyPanel tool=\{open\} language=\{entitlement\.language\} showExamples=\{entitlement\.showExamples !== false\}/);
  const panel = region(tray, 'function VocabularyPanel(', '\n}\n', 'VocabularyPanel');
  const secure = region(panel, 'if (!showExamples) {', '\n  }\n', 'the example-free branch');
  // The same pure helper the secure field tray uses, which returns no example.
  assert.match(secure, /secureVocabularyEntries\(glossary, tool\.termIds, \{ language \}\)\.map/);
  assert.doesNotMatch(executableSource(secure), /\.example\b|Example:/);
  assert.ok(panel.indexOf('if (!showExamples) {') < panel.indexOf('entry.example'), 'the example-free branch returns before any example is drawn');
});

test('one calculator on an exam item: where the toolbar has the graphing calculator, the item draws none (H-19)', () => {
  const container = componentSource('src/components/assessment/SecureExamContainer.jsx');
  assert.match(region(container, '<SecureExamQuestionPlayer', '/>', 'player'), /calculatorInToolbar=\{tools\.graphingCalculator\}/);
  const player = componentSource('src/components/assessment/SecureExamQuestionPlayer.jsx');
  assert.match(region(player, '<RichQuestionRuntime', '/>', 'runtime'), /calculatorInToolbar=\{calculatorInToolbar\}/);
  const root = region(runtime, 'export default function RichQuestionRuntime(', '\n}\n', 'root');
  assert.match(region(root, '<ToolItem', '/>', 'ToolItem props'), /calculatorInToolbar=\{calculatorInToolbar\}/);
  assert.match(region(root, '<FieldItem', '/>', 'FieldItem props'), /calculatorInToolbar=\{calculatorInToolbar\}/);
  const field = region(runtime, 'const FieldItem = (', '\n};\n', 'FieldItem');
  assert.match(field, /\{!calculatorInToolbar && <CalculatorPanel policy=\{calculatorPolicy\}/);
  assert.equal((executableSource(field).match(/<CalculatorPanel/g) || []).length, 1);
  const tool = region(runtime, 'const ToolItem = (', '\n};\n', 'ToolItem');
  assert.match(region(tool, '<QuestionEngine', '/>', 'engine props'), /calculatorInToolbar=\{calculatorInToolbar\}/);
  // The engine: no work-bar button, no Work View rail entry, no panel.
  const engine = componentSource('src/QuestionEngine.jsx');
  assert.match(engine, /calculator: calculatorInToolbar \? null : \{\n\s*id: 'calculator',/);
  assert.match(engine, /\{!calculatorInToolbar && <button\n\s*type="button"\n\s*className="mathmaster-work-bar-tool"\n\s*onClick=\{handleCalculatorControl\}/);
  assert.match(engine, /\{!calculatorInToolbar && \(\n\s*<CalculatorPanel\n\s*policy=\{calculatorPolicy\}/);
  assert.equal((executableSource(engine).match(/<CalculatorPanel/g) || []).length, 1);
});

test('the toolbar carries the tools the exam policy grants, and the question is padded clear of them', () => {
  assert.match(container, /^import \{ resolveSecureExamTools \} from '\.\.\/\.\.\/platform\/assessment\/secureExamTools\.js';$/m);
  assert.match(container, /^import SatReferenceSheet from '\.\/SatReferenceSheet\.jsx';$/m);
  assert.match(container, /^import GraphingCalculatorPanel from '\.\/GraphingCalculatorPanel\.jsx';$/m);
  assert.match(container, /^import \{ useExamToolRoom \} from '\.\/examToolDrawerHooks\.js';$/m);
  const tools = region(container, 'const tools = resolveSecureExamTools({', '});', 'tools');
  assert.match(tools, /examType: session\.examType \|\| examType,/);
  assert.match(tools, /sessionCalculatorMode: session\.calculatorMode \|\| null,/);
  assert.match(tools, /question,/);
  const launchers = region(container, 'const toolLaunchers =', ') : null;', 'launchers');
  assert.match(launchers, /\{tools\.referenceSheet && <SatReferenceSheet buttonStyle=\{EXAM_HEADER_CONTROL\} onOpenChange=\{setReferenceSheetOpen\} \/>\}/);
  assert.match(launchers, /available=\{tools\.graphingCalculator && !pause\}/);
  assert.match(launchers, /onOpenChange=\{setGraphingCalculatorOpen\}/);
  assert.match(region(container, '<ExamPrepHeader', '/>', 'header props'), /tools=\{toolLaunchers\}/);
  // The header shows the launchers in place of the old "Reference sheet available" note.
  assert.match(header, /\{tools\}/);
  assert.doesNotMatch(executableSource(header), /Reference sheet available/);
  // Room for the drawers: the hook measures the column it pads.
  assert.match(container, /const room = useExamToolRoom\(columnRef, \{ referenceSheetOpen, graphingCalculatorOpen \}\);/);
  assert.match(container, /<div ref=\{columnRef\} data-secure-question-column="" style=\{\{ paddingLeft: room\.paddingLeft, paddingRight: room\.paddingRight \}\}>/);
});

test('opening the graphing calculator on a question is recorded on that question, as the scientific one is', () => {
  const launchers = region(container, 'const toolLaunchers =', ') : null;', 'launchers');
  assert.match(launchers, /onOpened=\{\(\) => \{ if \(question\?\.questionInstanceId\) calculatorUsedRef\.current\.add\(question\.questionInstanceId\); \}\}/);
  const autosave = region(container, 'const autosaveDraft = useCallback(', '}, [', 'autosave');
  assert.match(autosave, /calculatorUsedRef\.current\.has\(question\.questionInstanceId\)\s*\?\s*\{ \.\.\.supportUsage, calculatorUsed: true \}/);
  assert.match(autosave, /supportUsage: usage, \.\.\.nextDraftStamp\(\) \}/);
});

test("the Tests & Exams list passes Practise this skill through to the review", () => {
  // The prop is taken (the list later gained `testCycles`, so the whole
  // signature is not pinned — only that this prop is one of its props).
  assert.match(dashboard, /export const StudentSecureExamDashboard = \(\{[^)]*\bonPracticeSkill = null\b[^)]*\}\) => \{/);
  assert.match(dashboard, /<SecureExamReview examSessionId=\{reviewing\.examSessionId\} onBack=\{[^}]*\}[^>]*onPracticeSkill=\{onPracticeSkill\} \/>/);
});
