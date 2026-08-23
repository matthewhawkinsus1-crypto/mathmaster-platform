import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (relative) => readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');
const engine = read('src/QuestionEngine.jsx');
const app = read('src/App.jsx');
const pathPlayer = read('src/components/student/PathSessionPlayer.jsx');
const securePlayer = read('src/components/assessment/SecureExamQuestionPlayer.jsx');
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
  assert.doesNotMatch(securePlayer, /StandardBadge/);
  assert.match(securePlayer, /<MathText as="h1"/);
  assert.match(securePlayer, /<PathQuestionStimulus stimulus=\{question\.stimulus\}/);
  assert.match(securePlayer, /type="text"/);
  assert.match(securePlayer, /inputMode=\{isNumericProfile/);
  assert.doesNotMatch(securePlayer, /type="number"/);
  const activeBranch = secureDashboard.slice(secureDashboard.indexOf('if (active)'), secureDashboard.indexOf('return (', secureDashboard.indexOf('if (active)') + 15));
  assert.match(activeBranch, /onExitAfterFinished/);
  assert.doesNotMatch(activeBranch, /<button/);
  assert.doesNotMatch(activeBranch, /Back to dashboard/);
});

test('journey 5 review: standards return only after teacher-released feedback', () => {
  assert.match(secureDashboard, /Review released feedback/);
  assert.match(secureReview, /Released feedback/);
  assert.match(secureReview, /standards and CCMR connections are shown now/);
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
