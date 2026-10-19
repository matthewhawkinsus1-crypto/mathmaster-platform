import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (relative) => readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');
const engine = read('src/QuestionEngine.jsx');
const app = read('src/App.jsx');
const pathPlayer = read('src/components/student/PathSessionPlayer.jsx');
const securePlayerAdapter = read('src/components/assessment/SecureExamQuestionPlayer.jsx');
// The secure player renders through the shared Rich Question Runtime: its
// field items in FieldItem, its Rich Tool items in ToolItem (QuestionEngine).
const secureRuntime = read('src/components/question/RichQuestionRuntime.jsx');
const securePlayer = secureRuntime.slice(secureRuntime.indexOf('const FieldItem = ('), secureRuntime.indexOf('const ToolItem = ('));
const secureToolItem = secureRuntime.slice(secureRuntime.indexOf('const ToolItem = ('), secureRuntime.indexOf('export default function RichQuestionRuntime'));
const secureDashboard = read('src/components/assessment/StudentSecureExamDashboard.jsx');
const secureReview = read('src/components/assessment/SecureExamReview.jsx');
const functionSource = read('functions/index.js');

// Journey 1 — regular assignment: one clickable alignment owner, not an exam label.
test('journey 1: regular assignment exposes one instructional standards control', () => {
  assert.match(engine, /showStandardBadge = true/);
  assert.match(engine, /<StandardBadge/);
  assert.match(engine, /questionAssessmentFramework/);
});

// Journey 2 — Honors practice: direct exam-style items are distinguishable in navigation.
test('journey 2: Honors practice marks genuinely authored assessment practice in question navigation', () => {
  assert.match(app, /questionAssessmentFramework\(questions\[index\]/);
  assert.match(app, /cardAssessmentLabel/);
  assert.match(app, /practice/);
});

// Journey 3 + 4 — Path: ordinary course questions show TEKS; direct exam questions show the framework;
// prerequisite repairs inside an exam session are honestly labelled as a course foundation bridge.
test('journeys 3 and 4: My Path distinguishes direct exam practice from a course foundation bridge', () => {
  assert.match(pathPlayer, /framework=\{directFramework\}/);
  assert.match(pathPlayer, /Foundation bridge for/);
  assert.match(pathPlayer, /assessmentBridgeFramework/);
  assert.match(functionSource, /usingCourseBridge/);
  assert.match(functionSource, /assessmentBridgeFramework: usingCourseBridge/);
});

// Journey 5 — secure simulation: no instructional cue while answering, but math/stimulus render
// and fractions remain typeable. The student cannot leave the monitored shell through a dashboard
// back button while the exam is live.
test('journey 5: secure testing hides standards while preserving usable math and response controls', () => {
  assert.match(securePlayerAdapter, /<RichQuestionRuntime\b/);
  assert.ok(securePlayer.length > 200 && secureToolItem.length > 200, 'both secure renderers were found');
  assert.doesNotMatch(securePlayer, /StandardBadge/);
  // A Rich Tool item hides the standard too: the engine is told not to show it.
  assert.match(secureToolItem, /showStandardBadge=\{false\}/);
  assert.match(securePlayer, /<MathText as="h1"/);
  assert.match(securePlayer, /<PathQuestionStimulus stimulus=\{question\.stimulus\}/);
  // Fractions stay typeable: a typed answer goes through the secure answer
  // field, which is the math editor (3/4 arrives as \\frac34, which the
  // server grader accepts — secureMathAnswerRoundTrip.test.mjs) or a TEXT box,
  // and never an HTML number input, which refuses 3/4.
  const answerField = read('src/components/assessment/SecureMathAnswerField.jsx');
  assert.match(securePlayer, /<SecureMathAnswerField\b/);
  assert.match(answerField, /data-secure-answer-editor="text"\s+data-secure-answer-profile=\{entry\.profile\}\s+type="text"/);
  assert.doesNotMatch(securePlayer, /type="number"/);
  assert.doesNotMatch(answerField, /type="number"/);
  const activeBranch = secureDashboard.slice(secureDashboard.indexOf('if (active)'), secureDashboard.indexOf('return (', secureDashboard.indexOf('if (active)') + 15));
  assert.match(activeBranch, /onExitAfterFinished/);
  assert.doesNotMatch(activeBranch, /<button/);
  assert.doesNotMatch(activeBranch, /Back to dashboard/);
});

test('journey 5 review: standards return only after teacher-released feedback', () => {
  // The list opens the review only once results are released.
  // …and never for an attempt a teacher's reset replaced: the card has the current one.
  assert.match(secureDashboard, /const canReview = done && session\.feedbackReleased === true && !sessionWasReplaced\(session\);/);
  assert.match(secureDashboard, /onClick=\{\(\) => canReview \? setReviewing\(session\) : setActive\(session\)\}/);
  assert.match(secureDashboard, /\{canReview \? 'See your results'/);
  assert.match(secureReview, /Released feedback/);
  // The released-only wording is pinned in secureResultsWiring.test.mjs ("the
  // review names standards only once released, in plain words").
  assert.match(secureReview, /<StandardBadge/);
  assert.match(functionSource, /exports\.getStudentSecureExamReview/);
  assert.match(functionSource, /session\.feedbackReleased !== true/);
});

test('secure simulations draw from the verified generator-backed assessment Path banks', () => {
  assert.match(functionSource, /loadBuiltInStarterPathSeed\(\)\.filter/);
  assert.match(functionSource, /context\.examStyle === true/);
  assert.match(functionSource, /String\(context\.framework \|\| ""\) === session\.examType/);
  assert.match(functionSource, /mathPath\.instantiateQuestion\(authored/);
  assert.match(functionSource, /secureExam\.nextDomainId\(session\)/);
  assert.doesNotMatch(functionSource.slice(functionSource.indexOf('exports.issueSecureExamQuestion'), functionSource.indexOf('function sanitizeSecureExamDraft')), /collection\("examQuestionBank"\)/);
});
