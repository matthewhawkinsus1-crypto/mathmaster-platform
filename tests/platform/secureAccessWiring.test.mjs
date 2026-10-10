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

test("a secure Rich Tool item's own tray offers Read aloud and Translate only", () => {
  assert.match(runtime, /^import \{ secureAccessEntitlement \} from '\.\.\/\.\.\/platform\/assessment\/secureItemAccess\.js';$/m);
  const entitlement = region(runtime, 'const secureToolTrayEntitlement = (rawStudentSupportProfile) => {', '};', 'tray entitlement');
  assert.match(entitlement, /const entitlement = secureAccessEntitlement\(rawStudentSupportProfile\);/);
  // Vocabulary's glossary entries carry worked examples the engine tray cannot hide.
  assert.match(entitlement, /entitlement\.tools\.filter\(\(tool\) => tool !== SUPPORT_TOOL\.VOCABULARY\)/);
  const tool = region(runtime, 'const ToolItem = (', '\n};\n', 'ToolItem');
  assert.match(tool, /\(\) => \(policy\.secure \? secureToolTrayEntitlement\(rawStudentSupportProfile\) : null\)/);
  assert.match(region(tool, '<QuestionEngine', '/>', 'engine props'), /supportEntitlement=\{trayEntitlement\}/);
  const root = region(runtime, 'export default function RichQuestionRuntime(', '\n}\n', 'root');
  assert.match(region(root, '<ToolItem', '/>', 'ToolItem props'), /rawStudentSupportProfile=\{studentSupportProfile\}/);
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
  assert.match(dashboard, /export const StudentSecureExamDashboard = \(\{ studentProfile, onExit, onOpenCourseTest = null, onPracticeSkill = null \}\) => \{/);
  assert.match(dashboard, /<SecureExamReview examSessionId=\{reviewing\.examSessionId\} onBack=\{[^}]*\}[^>]*onPracticeSkill=\{onPracticeSkill\} \/>/);
});
