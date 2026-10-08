import test from 'node:test';
import assert from 'node:assert/strict';

import {
  correctionTargetTitle,
  retestPolicyRelevant,
  reviewSkillRows,
  testReviewLabel,
  testReviewSessionIdFor,
  testSkillsSection,
} from '../../src/platform/student/testCycleDiscovery.js';
import { TEST_CYCLE_STAGE as S } from '../../src/platform/assessment/testCycle.js';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

/*
 * RESULTS THAT TEACH, ON THE SCREENS THAT SHOW THEM.
 *
 * The released review (SecureExamReview), the Test Cycle card and Corrections,
 * and the teacher's practice-test form. Nothing here renders React, so the
 * screens are held to their logic by source contracts bound to the code that
 * does the work, and the card's decisions are tested directly as helpers.
 */

const reviewScreen = componentSource('src/components/assessment/SecureExamReview.jsx');
const card = componentSource('src/components/student/TestCycleCard.jsx');
const corrections = componentSource('src/components/student/TestCycleCorrections.jsx');
const teacher = componentSource('src/components/assessment/TeacherSecureExamDashboard.jsx');

/* --- the card's decisions ------------------------------------------------ */

test('"Review my Test" is offered only where no secure item can be answered', () => {
  const card_ = (stage, extra = {}) => ({ stage, reviewExamSessionId: 'test-1', testReviewExamSessionId: 'test-1', ...extra });
  assert.equal(testReviewSessionIdFor(card_(S.CORRECTIONS)), 'test-1');
  assert.equal(testReviewSessionIdFor(card_(S.RETEST_READY)), 'test-1');
  assert.equal(testReviewSessionIdFor(card_(S.RETEST_SUBMITTED)), 'test-1');
  assert.equal(testReviewSessionIdFor(card_(S.RETEST_CLOSED)), 'test-1');
  // A Retest that is assigned or under way: the Test's worked solutions would
  // sit one tap from a parallel secure question.
  assert.equal(testReviewSessionIdFor(card_(S.RETEST)), null);
  assert.equal(testReviewSessionIdFor(card_(S.TEST)), null);
  assert.equal(testReviewSessionIdFor(card_(S.REVIEW)), null);
  assert.equal(testReviewSessionIdFor(card_(S.AWAITING_RELEASE)), null);
  // Passed: the main action already opens this review — no second button.
  assert.equal(testReviewSessionIdFor(card_(S.PASSED)), null);
  // Complete after a retest: the main action opens the Retest, this the Test.
  assert.equal(testReviewSessionIdFor(card_(S.COMPLETE, { reviewExamSessionId: 'retest-1' })), 'test-1');
  // An older server without the dedicated field: never mislabel a Retest review.
  assert.equal(testReviewSessionIdFor({ stage: S.COMPLETE, reviewExamSessionId: 'retest-1' }), null);
  assert.equal(testReviewSessionIdFor({ stage: S.CORRECTIONS, reviewExamSessionId: 'test-1' }), 'test-1');
  assert.equal(testReviewSessionIdFor({ stage: S.CORRECTIONS }), null, 'nothing released, nothing offered');
});

test('the server\'s "not now" stands: no fallback to the main review while a Retest is open', () => {
  // Closing retesting does not end a Retest already issued; the server then
  // sends null, exactly when getStudentSecureExamReview would refuse.
  assert.equal(testReviewSessionIdFor({ stage: S.RETEST_CLOSED, reviewExamSessionId: 'test-1', testReviewExamSessionId: null }), null);
  assert.equal(testReviewSessionIdFor({ stage: S.CORRECTIONS, reviewExamSessionId: 'test-1', testReviewExamSessionId: null }), null);
  // An external cycle's one secure session is the student's Retest.
  assert.equal(testReviewLabel({ policy: { external: true } }), 'Review my Retest');
  assert.equal(testReviewLabel({ policy: { external: false } }), 'Review my Test');
  assert.equal(testReviewLabel({}), 'Review my Test');
});

test('the retest cap is read only while a retest could still happen', () => {
  const policy = { passingScore: 70 };
  assert.equal(retestPolicyRelevant({ stage: S.PASSED, grade: { recordedGrade: 85 }, policy }), false);
  assert.equal(retestPolicyRelevant({ stage: S.COMPLETE, grade: { recordedGrade: 70 }, policy }), false);
  assert.equal(retestPolicyRelevant({ stage: S.RETEST_CLOSED, grade: { recordedGrade: 52 }, policy }), false);
  // A recorded passing grade outside those stages (e.g. a released pass
  // whose record has not moved the stage yet) is still a pass.
  assert.equal(retestPolicyRelevant({ stage: S.AWAITING_RELEASE, grade: { recordedGrade: 82 }, policy }), false);
  assert.equal(retestPolicyRelevant({ stage: S.CORRECTIONS, grade: { recordedGrade: 52 }, policy }), true);
  assert.equal(retestPolicyRelevant({ stage: S.REVIEW, grade: { recordedGrade: null }, policy }), true, 'before the Test it is what a retest could do');
  assert.equal(retestPolicyRelevant({ stage: S.RETEST, grade: { recordedGrade: 52 }, policy }), true, 'an open retest can raise a failing grade');
  // A teacher can open a retest after a pass. A cap of 70 cannot raise an 85,
  // and "up to 70%" read by an 85 student reads as being told they failed.
  for (const stage of [S.RETEST_READY, S.RETEST, S.RETEST_SUBMITTED, S.CORRECTIONS]) {
    assert.equal(retestPolicyRelevant({ stage, grade: { recordedGrade: 85 }, policy }), false, stage);
    assert.equal(retestPolicyRelevant({ stage, grade: { recordedGrade: 70 }, policy }), false, `${stage} at exactly passing`);
  }
});

test('"What\'s on this test" lists the blueprint skills before the session they describe', () => {
  const testSkills = [{ alignmentKey: 'texas:A.5A', label: null, questionCount: 4 }, { alignmentKey: 'texas:A.3B', label: 'Slope from a table', questionCount: 1 }];
  const review = testSkillsSection({ stage: S.REVIEW, testSkills, policy: {} });
  assert.equal(review.title, 'What\'s on your Test');
  assert.equal(review.showCounts, true);
  // By name, not in the order the blueprint (and so the Test) runs.
  assert.deepEqual(review.rows.map((row) => [row.label, row.questionCount]), [['Slope from a table', 1], ['Solving linear equations', 4]]);
  assert.equal(testSkillsSection({ stage: S.TEST, testSkills, actionLabel: 'Start Test', policy: {} }).showCounts, true);
  // An ordinary Retest is rebuilt from what was missed: skills, no counts, and
  // no promise that every skill will be on it.
  const retest = testSkillsSection({ stage: S.CORRECTIONS, testSkills, policy: {} });
  assert.equal(retest.title, 'What\'s on your Retest');
  assert.equal(retest.showCounts, false);
  assert.equal(retest.note, 'Your Retest is drawn from these Test skills — mostly the ones you missed.');
  // An external cycle's one secure session IS the blueprint's: counts stay.
  assert.equal(testSkillsSection({ stage: S.TEST, testSkills, policy: { external: true } }).title, 'What\'s on your Retest');
  assert.equal(testSkillsSection({ stage: S.TEST, testSkills, policy: { external: true } }).showCounts, true);
  // Nothing left to prepare for.
  for (const stage of [S.AWAITING_RELEASE, S.PASSED, S.COMPLETE, S.RETEST_SUBMITTED, S.RETEST_CLOSED]) {
    assert.equal(testSkillsSection({ stage, testSkills, policy: {} }), null, stage);
  }
  assert.equal(testSkillsSection({ stage: S.REVIEW, testSkills: [], policy: {} }), null);
});

test('"What\'s on this test" is a study guide, never a map of the questions', () => {
  // Blueprint order is issue order: questions 1–4 on the first target, 5–7 on the next.
  const testSkills = [
    { alignmentKey: 'texas:A.5A', label: null, questionCount: 4 },
    { alignmentKey: 'texas:A.3B', label: null, questionCount: 3 },
    { alignmentKey: 'texas:A.2A', label: null, questionCount: 2 },
    { alignmentKey: 'texas:G.9A', label: 'texas:G.9A', questionCount: 1 },
  ];
  const rows = testSkillsSection({ stage: S.REVIEW, testSkills, policy: {} }).rows;
  const labels = rows.map((row) => row.label);
  assert.deepEqual(labels, [...labels].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })), 'sorted by name');
  assert.notDeepEqual(rows.map((row) => row.key), testSkills.map((skill) => skill.alignmentKey), 'not in blueprint order');
  assert.ok(labels.includes('Standard G.9A'), 'a code-only label is not shown as the code');
  assert.ok(!labels.some((label) => /texas:/.test(label)));
  // Only before the session: once a Test or Retest is under way, the list goes.
  assert.equal(testSkillsSection({ stage: S.TEST, actionLabel: 'Resume Test', testSkills, policy: {} }), null);
  assert.equal(testSkillsSection({ stage: S.TEST, actionLabel: 'Start Test', phases: [{ id: 'test', status: 'inProgress' }], testSkills, policy: {} }), null);
  assert.equal(testSkillsSection({ stage: S.TEST, actionLabel: 'Resume Retest', testSkills, policy: { external: true } }), null);
  assert.equal(testSkillsSection({ stage: S.RETEST, actionLabel: 'Resume Retest', testSkills, policy: {} }), null);
  assert.ok(testSkillsSection({ stage: S.RETEST, actionLabel: 'Start Retest', testSkills, policy: {} }));
});

test('Review skills read weakest first, unstarted last, in a student\'s words', () => {
  const rows = reviewSkillRows([
    // Listed first in the Review, but not started: nothing to call weak yet.
    { alignmentKey: 'texas:A.2A', label: null, attempted: 0, correct: 0, total: 2 },
    { alignmentKey: 'texas:A.5A', label: null, attempted: 3, correct: 3, total: 3 },
    { alignmentKey: 'texas:A.3B', label: 'Slope', attempted: 2, correct: 1, total: 4 },
    { alignmentKey: null, label: null, attempted: 1, correct: 0, total: 1 },
  ]);
  assert.deepEqual(rows.map((row) => row.key), ['other-3', 'texas:A.3B', 'texas:A.5A', 'texas:A.2A']);
  assert.deepEqual(rows.map((row) => row.summary), [
    '0 of 1 correct',
    '1 of 2 correct so far · 2 still to answer',
    '3 of 3 correct',
    'Not started · 2 questions',
  ]);
  assert.equal(rows[2].label, 'Solving linear equations');
  assert.equal(rows[0].label, 'Other Review questions');
  assert.equal(rows[0].alignmentKey, null, 'no standard, no practise link');
  // Practise what they have started; an unstarted skill's next step is its Review questions.
  assert.deepEqual(rows.map((row) => row.canPractise), [false, true, true, false]);
  // A code the server let through is still not a name.
  assert.equal(reviewSkillRows([{ alignmentKey: 'texas:A.5A', label: 'texas:A.5A', attempted: 1, correct: 1, total: 1 }])[0].label, 'Solving linear equations');
});

test('Corrections are headed by the skill, never by its code', () => {
  assert.equal(correctionTargetTitle({ label: 'texas:A.3B', alignmentKey: 'texas:A.3B' }), 'Interpreting rate of change');
  assert.equal(correctionTargetTitle({ label: 'Rate of change from tables and graphs', alignmentKey: 'texas:A.3B' }), 'Rate of change from tables and graphs');
  assert.match(corrections, /const activeTitle = activeTarget \? correctionTargetTitle\(activeTarget\) : '';/);
  const heading = region(corrections, '<h1 tabIndex={-1} data-corrections-heading=""', '</h1>', 'corrections heading');
  assert.match(heading, /\{activeTitle\}$/);
  assert.doesNotMatch(executableSource(corrections), /\{activeTarget\.label\}|\$\{activeTarget\.label\}/);
});

/* --- the released review screen ----------------------------------------- */

test('the review screen renders nothing unless the server released it', () => {
  // Its only data is the callable's answer — no review prop to hand it one.
  const signature = region(reviewScreen, 'export default function SecureExamReview(', ') {', 'signature');
  assert.doesNotMatch(signature, /\breview\b|\bitems\b/);
  assert.match(reviewScreen, /getStudentSecureExamReview\(\{ examSessionId \}\)\s*\n?\s*\.then\(\(result\) => \{ if \(active\) \{ setReview\(result\.review \|\| null\)/);
  // The release check stands between loading and the first result drawn.
  const gate = region(reviewScreen, 'if (loading) return', 'const score = describeReviewScore(review);', 'release gate');
  assert.match(gate, /if \(error \|\| !reviewIsReleased\(review\)\) \{\s*\n\s*return \(/);
  const body = region(reviewScreen, 'const score = describeReviewScore(review);', '\n}\n', 'released body');
  assert.match(body, /items\.map\(\(item, index\) => \{/);
});

test('each question shows the answer given, the right answer and the worked solution', () => {
  const article = region(reviewScreen, 'items.map((item, index) => {', '</article>', 'question card');
  assert.match(article, /const result = reviewItemResult\(item, index\);/);
  assert.match(article, /Your answer/);
  assert.match(article, /answerRows\.length \? <AnswerRows rows=\{answerRows\} \/> : <span[^>]*>Left blank<\/span>/);
  assert.match(article, /\{result\.correctAnswers\.length > 0 && \(/);
  assert.match(article, /Correct answer/);
  assert.match(article, /\? <PathSolutionReview review=\{result\.workedSolution\} wasCorrect=\{result\.status === RESULT_STATUS\.CORRECT\} \/>\s*\n?\s*: <p[^>]*>\{result\.solutionNote\}<\/p>/);
  assert.match(reviewScreen, /import PathSolutionReview from '\.\.\/student\/PathSolutionReview\.jsx';/);
});

test('the score is the model\'s sentence, not "correct of answered"', () => {
  const header = region(reviewScreen, '<header style={sectionCard}>', '</header>', 'score header');
  assert.match(header, /\{score\.percentLabel\}/);
  assert.match(header, /\{score\.detail\}/);
  // The old contradiction: a planned-based percent beside "N of ANSWERED
  // correct". However it is spelled, a count or percent printed from the raw
  // review beside the score is the model's sentence bypassed.
  assert.doesNotMatch(executableSource(header), /review\??\.(correctQuestions|answeredQuestions|plannedQuestions|scorePercent|earnedPoints|possiblePoints)/);
  assert.doesNotMatch(executableSource(reviewScreen), /\{review\??\.(correctQuestions|answeredQuestions|scorePercent)\b/);
});

test('an answer typed in the math editor is drawn as mathematics, not as LaTeX', () => {
  assert.match(reviewScreen, /import MathDisplay from '\.\.\/\.\.\/MathDisplay\.jsx';/);
  const rows = region(reviewScreen, 'const responseRows = (item) => {', '\n};', 'response rows');
  assert.match(rows, /return \{ id: fieldId, label: field\?\.label \|\| 'Your response', value, math: answerIsLatex\(value\) \};/);
  const answerRows = region(reviewScreen, 'const AnswerRows = ', '));', 'answer rows');
  assert.match(answerRows, /\{row\.math\s*\? <span style=\{answerValueStyle\}><MathDisplay value=\{row\.value\} format="latex" inline \/><\/span>\s*: <MathText style=\{answerValueStyle\}>\{row\.value\}<\/MathText>\}/);
  // The correct answer is held to the same rule.
  assert.match(reviewScreen, /value: answer\.display, math: answerIsLatex\(answer\.display\)/);
});

test('the review takes focus when it opens, and each question is a numbered heading', () => {
  assert.match(reviewScreen, /const released = !loading && !error && reviewIsReleased\(review\);/);
  assert.match(reviewScreen, /useEffect\(\(\) => \{\s*if \(released\) headingRef\.current\?\.focus\(\);\s*\}, \[released, examSessionId\]\);/);
  assert.match(region(reviewScreen, '<header style={sectionCard}>', '</header>', 'header'), /<h1 ref=\{headingRef\} tabIndex=\{-1\}/);
  const article = region(reviewScreen, 'items.map((item, index) => {', '</article>', 'question card');
  assert.match(article, /aria-labelledby=\{`result-question-\$\{index\}`\}/);
  assert.match(article, /<h3 id=\{`result-question-\$\{index\}`\}[^>]*>Question \{result\.questionNumber\}<\/h3>/);
});

test('the review names standards only once released, in plain words', () => {
  // The capability studentJourneyUi pins by its old wording: standards appear
  // only in the released body, after the release gate.
  const gate = region(reviewScreen, 'if (loading) return', 'const score = describeReviewScore(review);', 'release gate');
  assert.doesNotMatch(gate, /StandardBadge/);
  const body = region(reviewScreen, 'const score = describeReviewScore(review);', '\n}\n', 'released body');
  assert.match(body, /\{code && <StandardBadge code=\{code\}/);
  // No program jargon in what a student reads first.
  const header = executableSource(region(reviewScreen, '<header style={sectionCard}>', '</header>', 'header'));
  assert.doesNotMatch(header, /CCMR|monitored|delivery/);
});

test('skills are listed weakest first with a practise link that goes where the app says', () => {
  // With the teacher's names for the skills, when the card has them.
  assert.match(reviewScreen, /const skills = groupReviewBySkill\(review, \{ skillLabels \}\);/);
  assert.match(region(reviewScreen, 'export default function SecureExamReview(', ') {', 'signature'), /skillLabels = null/);
  const summary = region(reviewScreen, 'const SkillSummary = ', 'const PracticeEstimate = ', 'skill summary');
  assert.match(summary, /\{onPracticeSkill && group\.practice && \(\s*\n\s*<button type="button" onClick=\{\(\) => onPracticeSkill\(group\.practice\)\}/);
  assert.match(summary, /Practise this skill/);
  // A practice test, and only a practice test, gets the estimate.
  assert.match(reviewScreen, /const estimate = practiceTestScoreReport\(review\);/);
  assert.match(reviewScreen, /\{estimate && <PracticeEstimate report=\{estimate\} \/>\}/);
  const estimate = region(reviewScreen, 'const PracticeEstimate = ', 'export default function', 'estimate card');
  for (const field of ['report.rangeText', 'report.basis', 'report.benchmark', 'report.disclaimer']) {
    assert.match(estimate, new RegExp(`\\{${field.replace('.', '\\.')}\\}`), `${field} must be shown`);
  }
});

/* --- the Test Cycle card ------------------------------------------------- */

test('the card states the student\'s own time and that answers can change until Submit', () => {
  const facts = region(card, '{/* The facts a student would otherwise have to ask about. */}', '</div>', 'facts');
  // Every secure item is a draft until the session is finalized: no "one attempt".
  assert.doesNotMatch(executableSource(card), /one attempt/i);
  assert.match(facts, /questions\. You can change your answers until you submit\./);
  assert.match(facts, /Number\(card\.delivery\.extendedTimeMultiplier\) > 1 \? ', including your extended time' : ''/);
});

test('the card shows the retest rule only while it is relevant', () => {
  const facts = region(card, '{/* The facts a student would otherwise have to ask about. */}', '</div>', 'facts');
  assert.match(facts, /\{card\.policy\?\.summary && retestPolicyRelevant\(card\) && <p style=\{factStyle\}>\{card\.policy\.summary\}<\/p>\}/);
});

test('the Review stage shows accuracy by skill, and no longer says answers need not be right', () => {
  assert.doesNotMatch(executableSource(card), /do not have to be correct/);
  assert.match(card, /const reviewSkills = card\.stage === TEST_CYCLE_STAGE\.REVIEW \? reviewSkillRows\(card\.reviewBySkill\) : \[\];/);
  // The gate sentence is the teacher's rule, from the shared helper.
  assert.match(card, /Review: \{review\.attempted\} of \{review\.total\} questions answered\. \{reviewRequirementText\(review, noun\)\}/);
  const list = region(card, '{reviewSkills.length > 0 && (', '</section>', 'review skills');
  assert.match(list, /\{onPracticeSkill && skill\.canPractise && !previewing && \(/);
  assert.match(list, /onPracticeSkill\(\{ alignmentKey: skill\.alignmentKey, framework: null, domainId: null \}\)/);
});

test('"Review my Test" opens the released Test from the card and from Corrections', () => {
  assert.match(card, /const testReviewId = previewing \? null : testReviewSessionIdFor\(card\);/);
  const button = region(card, '{testReviewId && (', '</button>', 'review my test button');
  assert.match(button, /onClick=\{\(\) => openTestReview\('card'\)\}/);
  assert.match(button, /\{testReviewLabel\(card\)\}/);
  const fromCard = region(card, "if (mode === 'testReview' && testReviewId) {", '\n  }\n', 'test review from the card');
  assert.match(fromCard, /<SecureExamReview\s*\n\s*examSessionId=\{testReviewId\}\s*\n\s*onBack=\{backToCard\}/);
  const correctionsMode = region(card, 'const reviewingFromCorrections = ', '\n  }\n', 'corrections mode');
  assert.match(correctionsMode, /reviewExamSessionId=\{testReviewId\}/);
  assert.match(correctionsMode, /onReviewTest=\{\(\) => openTestReview\('corrections'\)\}/);
  assert.match(correctionsMode, /onBack=\{\(\) => \{ returnFocusRef\.current = 'corrections'; setMode\('corrections'\); \}\}/);
  // Corrections come before the review-from-the-card branch, or a review
  // opened from them would replace them.
  assert.ok(card.indexOf('const reviewingFromCorrections = ') < card.indexOf("if (mode === 'testReview' && testReviewId) {"));
});

test('a review opened from Corrections lies over them: the typed answer survives', () => {
  const correctionsMode = region(card, 'const reviewingFromCorrections = ', '\n  }\n', 'corrections mode');
  assert.match(correctionsMode, /const reviewingFromCorrections = mode === 'testReview' && testReviewReturn === 'corrections' && Boolean\(testReviewId\);/);
  assert.match(correctionsMode, /if \(\(mode === 'corrections' \|\| reviewingFromCorrections\) && card\.corrections\) \{/);
  // Corrections are rendered in BOTH states, hidden (not unmounted) under the review.
  assert.match(correctionsMode, /<div ref=\{correctionsRef\} style=\{reviewingFromCorrections \? \{ display: 'none' \} : undefined\}>\s*<TestCycleCorrections/);
  assert.match(correctionsMode, /\{reviewingFromCorrections && \(\s*<SecureExamReview/);
  // And focus comes back to the corrections heading, or to the card's.
  const focus = region(card, 'const returnFocusRef = useRef(null);', '}, [mode, card]);', 'return focus');
  assert.match(focus, /if \(returnTo === 'corrections'\) correctionsRef\.current\?\.querySelector\('\[data-corrections-heading\]'\)\?\.focus\(\);/);
  assert.match(focus, /else headingRef\.current\?\.focus\(\);/);
  assert.match(card, /<h2 ref=\{headingRef\} tabIndex=\{-1\}/);
});

test('every review the card opens names skills the way the card does', () => {
  const reviews = [...card.matchAll(/<SecureExamReview[\s\S]*?\/>/g)].map((match) => match[0]);
  assert.equal(reviews.length, 3, 'the main review, the review from the card, the review from Corrections');
  for (const review of reviews) assert.match(review, /skillLabels=\{card\.testSkills\}/);
});

test('Corrections asks the card for the review and loads nothing secure itself', () => {
  assert.match(corrections, /const reviewTest = reviewExamSessionId && onReviewTest \? \(\s*\n\s*<button type="button" onClick=\{\(\) => onReviewTest\(reviewExamSessionId\)\}/);
  // Shown on the working screen and on the "complete" screen.
  assert.equal((corrections.match(/\{reviewTest\}/g) || []).length >= 2, true);
  assert.match(region(corrections, 'if (!activeTarget) {', '\n  }\n', 'complete screen'), /\{reviewTest\}/);
  // The instructional screen stays free of the secure review and its callable.
  assert.doesNotMatch(executableSource(corrections), /SecureExamReview|getStudentSecureExamReview|secureExamService/);
});

test('"What\'s on this test" sits below the action, so the action stays on the first screen', () => {
  assert.match(card, /const testSkills = testSkillsSection\(card\);/);
  const section = region(card, '{testSkills && (', '</section>', 'test skills section');
  assert.match(section, /aria-labelledby="test-cycle-skills"/);
  assert.match(section, /\{testSkills\.rows\.map\(\(skill\) => \(/);
  assert.match(section, /testSkills\.showCounts && skill\.questionCount > 0/);
  // Order on the page: the action row first, then the Review progress and the
  // study guide. With either above it, "Continue Review" fell below the fold
  // of a 1366×768 Chromebook (tests/browser/secureResults.mjs measured 871px).
  const actionRow = card.indexOf('disabled={!card.canEnter');
  const skills = card.indexOf('{testSkills && (');
  const reviewProgress = card.indexOf('{reviewSkills.length > 0 && (');
  assert.ok(actionRow > 0 && skills > actionRow, 'the skills list must follow the action button');
  assert.ok(reviewProgress > actionRow, 'the Review progress list must follow the action button');
});

/* --- the teacher's practice-test form ------------------------------------ */

test('a practice test releases automatically unless the teacher holds it', () => {
  assert.match(teacher, /const \[releaseAutomatically, setReleaseAutomatically\] = useState\(true\);/);
  const create = region(teacher, 'const create = async (event) => {', '\n  };', 'create');
  assert.match(create, /releasePolicy: releaseAutomatically \? 'automatic' : 'teacher'/);
  assert.match(teacher, /<input type="checkbox" checked=\{releaseAutomatically\} onChange=\{\(event\) => setReleaseAutomatically\(event\.target\.checked\)\} \/>/);
  assert.match(teacher, /Release results automatically when the student submits\./);
});

test('the form shows the time the server will set, for the count it will create', () => {
  assert.match(teacher, /const timing = describePracticeTestTime\(examType, questionCount\);/);
  const create = region(teacher, 'const create = async (event) => {', '\n  };', 'create');
  assert.match(create, /questionCount: timing\.questionCount,/);
  assert.match(teacher, /<strong>Time: <\/strong>\{timing\.text\}/);
});

test('an empty question count creates nothing', () => {
  // The server reads a missing count as the full test; the form never sends one.
  assert.match(teacher, /const canCreate = Boolean\(studentId\) && timing\.questionCount !== null && !creating;/);
  const create = region(teacher, 'const create = async (event) => {', '\n  };', 'create');
  assert.match(create, /if \(!canCreate\) return;/);
  assert.match(teacher, /<input type="number" required min="1"/);
});
