import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

import {
  NO_WORKED_SOLUTION,
  RESULT_STATUS,
  answerIsLatex,
  describePracticeTestTime,
  describeReviewScore,
  groupReviewBySkill,
  isCodeLikeSkillLabel,
  notReachedNote,
  practiceTestQuestionCount,
  practiceTestScoreReport,
  practiceTestTimeLimitSeconds,
  reviewIsReleased,
  reviewItemResult,
  studentSkillName,
  teksKeyOf,
} from '../../src/platform/assessment/secureExamResultsModel.js';
import { practiceSkillLaunch } from '../../src/platform/assessment/practiceSkillLaunch.js';
import { EXAM_BENCHMARKS, EXAM_TYPES } from '../../src/platform/assessment/examDomainRegistry.js';
import { getExamPolicy } from '../../src/platform/policies/examPolicyResolver.js';
import { studentLabelForTeks } from '../../src/platform/path/skillLabels.js';

const require_ = createRequire(import.meta.url);
const secureExam = require_('../../functions/lib/secureExam.js');
const navigation = require_('../../functions/lib/secureExamNavigation.js');

/*
 * RESULTS THAT TEACH — the words and numbers a student reads once a secure
 * test's results are released (src/platform/assessment/secureExamResultsModel.js).
 */

const released = (examType, extra = {}) => ({ examSessionId: 's1', examType, status: 'submitted', feedbackReleased: true, requiredQuestions: 5, ...extra });

const item = (fields = {}) => ({
  questionInstanceId: fields.id || `q-${Math.random()}`,
  position: 0,
  alignmentKeys: ['texas:A.5A'],
  assessmentDomainId: null,
  targetId: null,
  unanswered: false,
  pathToolId: null,
  grading: { score: 0, isCorrect: false },
  responsePayload: { responses: { answer: '3' } },
  questionSnapshot: { prompt: 'Solve.', responseFields: [{ id: 'answer', label: 'Answer' }] },
  solution: null,
  ...fields,
});

/* --- only a released review is ever shown ------------------------------- */

test('a review is shown only for a finished test whose results are released', () => {
  const review = { session: released('digitalSAT'), items: [] };
  assert.equal(reviewIsReleased(review), true);
  for (const status of ['submitted', 'time_expired', 'force_submitted']) {
    assert.equal(reviewIsReleased({ ...review, session: { ...review.session, status } }), true, status);
  }
  // Still answerable, or held by the teacher: nothing is shown.
  assert.equal(reviewIsReleased({ ...review, session: { ...review.session, status: 'in_progress' } }), false);
  assert.equal(reviewIsReleased({ ...review, session: { ...review.session, status: 'locked_proctor' } }), false);
  assert.equal(reviewIsReleased({ ...review, session: { ...review.session, feedbackReleased: false } }), false);
  assert.equal(reviewIsReleased({ ...review, session: { ...review.session, feedbackReleased: 'true' } }), false, 'a truthy string is not a release');
  assert.equal(reviewIsReleased({ items: [] }), false, 'no session, no proof of release');
  assert.equal(reviewIsReleased(null), false);
  assert.equal(reviewIsReleased({ session: review.session }), false, 'no items array');
});

/* --- the score sentence -------------------------------------------------- */

test('a weighted course Test explains why the percent is not correct-out-of-planned', () => {
  const score = describeReviewScore({
    session: released('courseTest'), scorePercent: 52, correctQuestions: 3, answeredQuestions: 5, plannedQuestions: 5,
    earnedPoints: 6.5, possiblePoints: 12.5, weighted: true, scoreBasis: 'plannedWeighted', items: [],
  });
  assert.equal(score.sentence, 'Score 52% — 3 of 5 questions correct. Some questions are worth more than others, so your score is based on points (6.5 of 12.5).');
  assert.equal(score.percentLabel, '52%');
});

test('an unweighted test counts blanks as zero, out loud', () => {
  const base = { session: released('digitalSAT'), correctQuestions: 3, plannedQuestions: 5, weighted: false, scoreBasis: 'planned', items: [] };
  assert.equal(
    describeReviewScore({ ...base, scorePercent: 60, answeredQuestions: 3, earnedPoints: 3, possiblePoints: 5 }).sentence,
    'Score 60% — 3 of 5 questions correct (2 left blank count as 0).',
  );
  assert.equal(
    describeReviewScore({ ...base, scorePercent: 60, answeredQuestions: 4, earnedPoints: 3, possiblePoints: 5 }).sentence,
    'Score 60% — 3 of 5 questions correct (1 left blank counts as 0).',
  );
  // Every question answered: no blank note, no points note.
  assert.equal(
    describeReviewScore({ ...base, scorePercent: 60, answeredQuestions: 5, earnedPoints: 3, possiblePoints: 5 }).sentence,
    'Score 60% — 3 of 5 questions correct.',
  );
});

test('the count is over PLANNED questions, never over the answered ones', () => {
  // The contradiction this replaces: 52% beside "3 of 3 correct".
  const score = describeReviewScore({
    session: released('digitalSAT'), scorePercent: 30, correctQuestions: 3, answeredQuestions: 3, plannedQuestions: 10,
    earnedPoints: 3, possiblePoints: 10, weighted: false, items: [],
  });
  assert.match(score.sentence, /3 of 10 questions correct/);
  assert.doesNotMatch(score.sentence, /3 of 3/);
  assert.match(score.sentence, /\(7 left blank count as 0\)/);
});

test('part credit is named, with the points behind the percent', () => {
  const score = describeReviewScore({
    session: released('digitalSAT'), scorePercent: 70, correctQuestions: 3, answeredQuestions: 5, plannedQuestions: 5,
    earnedPoints: 3.5, possiblePoints: 5, weighted: false, items: [],
  });
  assert.equal(score.sentence, 'Score 70% — 3 of 5 questions correct. Some answers earned part credit, so your score is based on points (3.5 of 5).');
});

test('a review from before points were reported still reads sensibly', () => {
  const score = describeReviewScore({
    session: released('digitalSAT', { requiredQuestions: 4 }), scorePercent: 50, correctQuestions: 2, answeredQuestions: 3,
    items: [item(), item(), item()],
  });
  assert.equal(score.sentence, 'Score 50% — 2 of 4 questions correct (1 left blank counts as 0).');
  assert.equal(describeReviewScore({ session: released('act'), scorePercent: 100, correctQuestions: 1, answeredQuestions: 1, plannedQuestions: 1, earnedPoints: 1, possiblePoints: 1, items: [] }).sentence,
    'Score 100% — 1 of 1 question correct.');
});

test('questions never opened are accounted for below the list', () => {
  const review = { session: released('digitalSAT', { requiredQuestions: 5 }), plannedQuestions: 5, items: [item(), item(), item()] };
  assert.equal(notReachedNote(review), '2 questions were never opened. They count as 0, like a question left blank.');
  assert.equal(notReachedNote({ ...review, plannedQuestions: 4 }), '1 question was never opened. It counts as 0, like a question left blank.');
  assert.equal(notReachedNote({ ...review, plannedQuestions: 3 }), null);
});

test('a question opened and left blank is in the list, so it is not "never opened"', () => {
  // 5 planned: 3 opened and answered, 1 opened and left blank, 1 never opened.
  // Planned minus ANSWERED would say 2 were never opened; only 1 was.
  const review = {
    session: released('digitalSAT', { requiredQuestions: 5 }), plannedQuestions: 5, answeredQuestions: 3, correctQuestions: 2,
    items: [item(), item(), item(), item({ unanswered: true, responsePayload: { responses: {} } })],
  };
  assert.equal(notReachedNote(review), '1 question was never opened. It counts as 0, like a question left blank.');
  // The score line still counts both as zero: 2 not answered, 1 of them unseen.
  assert.match(describeReviewScore({ ...review, scorePercent: 40, earnedPoints: 2, possiblePoints: 5 }).sentence, /\(2 left blank count as 0\)/);
});

/* --- one question -------------------------------------------------------- */

test('each question says right, wrong, part credit or blank — from the server grade', () => {
  assert.equal(reviewItemResult(item({ grading: { score: 1, isCorrect: true } })).status, RESULT_STATUS.CORRECT);
  assert.equal(reviewItemResult(item({ grading: { score: 0, isCorrect: false } })).status, RESULT_STATUS.INCORRECT);
  assert.equal(reviewItemResult(item({ grading: { score: 0.5, isCorrect: false } })).status, RESULT_STATUS.PARTIAL);
  const blank = reviewItemResult(item({ unanswered: true, responsePayload: { responses: {} } }));
  assert.equal(blank.status, RESULT_STATUS.BLANK);
  assert.equal(blank.statusLabel, 'Left blank');
  // The number the student saw while testing, not the list index.
  assert.equal(reviewItemResult(item({ position: 6 }), 0).questionNumber, 7);
  assert.equal(reviewItemResult(item({ position: null }), 2).questionNumber, 3);
});

test('the correct answer and the worked solution come from the released solution', () => {
  const review = { headline: 'Undo the operations in reverse order.', reasoning: ['Add 7 to both sides.', 'Divide by 4.'], answerSummary: 'x = 7', commonError: null, connection: null };
  const result = reviewItemResult(item({ solution: { answers: [{ fieldId: 'answer', label: 'Answer', display: '7' }], review } }));
  assert.deepEqual(result.correctAnswers, [{ label: 'Answer', display: '7' }]);
  assert.equal(result.workedSolution, review, 'a typed item keeps its own answer summary inside the solution');
  assert.equal(result.solutionNote, null);
});

test('a Rich Tool item shows its answer summary as the correct answer, once', () => {
  const review = { headline: 'The line rises 2 for every 1 across.', reasoning: ['Plot (0, 1).'], answerSummary: 'A line through (0, 1) with slope 2.', commonError: null, connection: null };
  const result = reviewItemResult(item({ pathToolId: 'graphing2', solution: { answers: [], review } }));
  assert.deepEqual(result.correctAnswers, [{ label: null, display: 'A line through (0, 1) with slope 2.' }]);
  assert.equal(result.workedSolution.answerSummary, null, 'not repeated inside the worked solution');
  assert.equal(result.workedSolution.headline, review.headline);
});

test('an older session with no stored solution says so instead of inventing one', () => {
  const result = reviewItemResult(item({ solution: null }));
  assert.deepEqual(result.correctAnswers, []);
  assert.equal(result.workedSolution, null);
  assert.equal(result.solutionNote, NO_WORKED_SOLUTION);
  assert.equal(NO_WORKED_SOLUTION, 'A worked solution isn\'t available for this question.');
  // An answer with no worked review: the answer shows, the note explains the rest.
  const answerOnly = reviewItemResult(item({ solution: { answers: [{ fieldId: 'answer', label: 'Answer', display: '$3x+6$' }], review: null } }));
  assert.deepEqual(answerOnly.correctAnswers, [{ label: 'Answer', display: '$3x+6$' }]);
  assert.equal(answerOnly.solutionNote, NO_WORKED_SOLUTION);
});

/* --- by skill ------------------------------------------------------------ */

test('a course Test groups by standard, weakest first, with a My Math Path practice target', () => {
  const review = {
    session: released('courseTest'), scoreBasis: 'plannedWeighted',
    items: [
      // Two blueprint targets on the same standard are one skill to a student.
      item({ targetId: 't1', alignmentKeys: ['texas:A.5A'], grading: { score: 1, isCorrect: true } }),
      item({ targetId: 't2', alignmentKeys: ['texas:A.5A'], grading: { score: 0, isCorrect: false } }),
      item({ targetId: 't3', alignmentKeys: ['texas:A.3B'], grading: { score: 0, isCorrect: false }, unanswered: true }),
      item({ targetId: 't3', alignmentKeys: ['texas:A.3B'], grading: { score: 0, isCorrect: false } }),
      item({ targetId: 't4', alignmentKeys: ['texas:A.2A'], grading: { score: 1, isCorrect: true } }),
    ],
  };
  const groups = groupReviewBySkill(review);
  assert.deepEqual(groups.map((group) => [group.key, group.correct, group.total]), [
    ['skill:texas:A.3B', 0, 2],
    ['skill:texas:A.5A', 1, 2],
    ['skill:texas:A.2A', 1, 1],
  ]);
  assert.equal(groups[0].label, studentLabelForTeks('A.3B'));
  assert.doesNotMatch(groups[0].label, /A\.3B/, 'a student reads the skill, not the code');
  assert.equal(groups[0].summary, '0 of 2 correct · 1 left blank');
  assert.deepEqual(groups[0].practice, { alignmentKey: 'texas:A.3B', framework: null, domainId: null });
});

test('a course Test\'s skills carry the teacher\'s names, and unnamed standards stay apart', () => {
  const review = {
    session: released('courseTest'), scoreBasis: 'plannedWeighted',
    items: [
      item({ alignmentKeys: ['texas:A.3B'], grading: { score: 0, isCorrect: false } }),
      item({ alignmentKeys: ['texas:G.9A'], grading: { score: 0, isCorrect: false } }),
      item({ alignmentKeys: ['texas:G.5A'], grading: { score: 1, isCorrect: true } }),
      item({ alignmentKeys: ['texas:G.12B'], grading: { score: 1, isCorrect: true } }),
    ],
  };
  const skillLabels = [
    // The card's testSkills: a teacher's name, and the code-only labels a blueprint carries when none was written.
    { alignmentKey: 'texas:A.3B', label: 'Rate of change from tables and graphs' },
    { alignmentKey: 'texas:G.9A', label: 'texas:G.9A' },
    { alignmentKey: 'G.5A', label: 'Target 2' },
  ];
  const labels = Object.fromEntries(groupReviewBySkill(review, { skillLabels }).map((group) => [group.key, group.label]));
  assert.equal(labels['skill:texas:A.3B'], 'Rate of change from tables and graphs', 'the same name as on the card');
  assert.equal(labels['skill:texas:G.9A'], 'Standard G.9A');
  assert.equal(labels['skill:texas:G.5A'], 'Standard G.5A');
  assert.equal(labels['skill:texas:G.12B'], 'Standard G.12B');
  assert.equal(new Set(Object.values(labels)).size, 4, 'four standards, four different names');
  // Without the card's names, the student-facing name of the standard.
  assert.equal(groupReviewBySkill(review).find((group) => group.key === 'skill:texas:A.3B').label, studentLabelForTeks('A.3B'));
});

test('a practice test groups by the exam\'s own domains, with a College & Career practice target', () => {
  const review = {
    session: released('digitalSAT'), scoreBasis: 'planned',
    items: [
      item({ assessmentDomainId: 'algebra', alignmentKeys: ['texas:A.5A'], grading: { score: 1, isCorrect: true } }),
      item({ assessmentDomainId: 'algebra', alignmentKeys: ['texas:A.2C'], grading: { score: 0, isCorrect: false } }),
      item({ assessmentDomainId: 'advancedMath', alignmentKeys: ['texas:A.10E'], grading: { score: 0, isCorrect: false } }),
      // No domain: falls back to its standard, still practised in SAT format.
      item({ assessmentDomainId: null, alignmentKeys: ['texas:A.6A'], grading: { score: 1, isCorrect: true } }),
      // Nothing to name it by.
      item({ assessmentDomainId: null, alignmentKeys: [], questionSnapshot: { prompt: 'x' }, grading: { score: 0, isCorrect: false } }),
    ],
  };
  const groups = groupReviewBySkill(review);
  const byKey = Object.fromEntries(groups.map((group) => [group.key, group]));
  assert.equal(byKey['domain:algebra'].label, 'Algebra');
  assert.equal(byKey['domain:advancedMath'].label, 'Advanced Math');
  // The practice standard is one the student MISSED in that domain.
  assert.deepEqual(byKey['domain:algebra'].practice, { alignmentKey: 'texas:A.2C', framework: 'digitalSAT', domainId: 'algebra' });
  assert.deepEqual(byKey['skill:texas:A.6A'].practice, { alignmentKey: 'texas:A.6A', framework: 'digitalSAT', domainId: null });
  assert.equal(byKey.other.label, 'Other questions');
  assert.equal(byKey.other.practice, null, 'no destination, no button');
  // Weakest first: 0-of-1 groups before 1-of-2 before 1-of-1.
  assert.deepEqual(groups.map((group) => `${group.correct}/${group.total}`), ['0/1', '0/1', '1/2', '1/1']);
});

test('"Practise this skill" from a practice test opens that exam\'s practice, never course practice', () => {
  // The model's destinations, through the launch App performs (practiceSkillLaunch).
  const sat = {
    session: released('digitalSAT'), scoreBasis: 'planned',
    items: [
      item({ assessmentDomainId: 'geometryTrigonometry', alignmentKeys: ['texas:G.9A'], grading: { score: 0, isCorrect: false } }),
      item({ assessmentDomainId: 'algebra', alignmentKeys: ['texas:A.2C'], grading: { score: 0, isCorrect: false } }),
      item({ assessmentDomainId: null, alignmentKeys: ['texas:A.6A'], grading: { score: 1, isCorrect: true } }),
    ],
  };
  const destinations = groupReviewBySkill(sat).map((group) => group.practice).filter(Boolean);
  assert.equal(destinations.length, 3);
  for (const destination of destinations) {
    assert.equal(destination.framework, 'digitalSAT', JSON.stringify(destination));
    assert.deepEqual(practiceSkillLaunch(destination), { teksCode: null, tab: 'ccmr' }, JSON.stringify(destination));
  }
  // A course Test's skill is course practice on its standard.
  const course = { session: released('courseTest'), scoreBasis: 'plannedWeighted', items: [item({ alignmentKeys: ['texas:A.5A'] })] };
  assert.deepEqual(practiceSkillLaunch(groupReviewBySkill(course)[0].practice), { teksCode: 'A.5A', tab: null });
});

test('the standard an item is filed under is a Texas standard, canonical', () => {
  assert.equal(teksKeyOf(item({ alignmentKeys: ['sat:algebra', 'texas:a.5a'] })), 'texas:A.5A');
  assert.equal(teksKeyOf(item({ alignmentKeys: ['A5A'] })), 'texas:A.5A');
  assert.equal(teksKeyOf(item({ alignmentKeys: ['sat:algebra'], questionSnapshot: {} })), null);
  assert.equal(teksKeyOf(item({ alignmentKeys: [], questionSnapshot: { alignmentKey: 'texas:A2.4F' } })), 'texas:A2.4F');
});

/* --- the practice test estimate ----------------------------------------- */

const satReview = (earned, planned, extra = {}) => ({
  session: released('digitalSAT', { requiredQuestions: planned }),
  scorePercent: Math.round((earned / planned) * 100), correctQuestions: Math.floor(earned), answeredQuestions: planned,
  plannedQuestions: planned, earnedPoints: earned, possiblePoints: planned, weighted: false, scoreBasis: 'planned', items: [],
  ...extra,
});

test('a short SAT practice test gives a range, its size, and the real benchmark', () => {
  const report = practiceTestScoreReport(satReview(5, 10));
  assert.equal(report.title, 'Your estimated SAT Math score');
  assert.equal(report.rangeText, '410–590');
  assert.equal(report.scaleText, 'on the 200–800 scale');
  assert.equal(report.basis, 'Based on 10 questions — the real test has 44. A short practice test is only a rough estimate; a longer one gives a better one.');
  assert.equal(report.benchmarkTarget, EXAM_BENCHMARKS[EXAM_TYPES.DIGITAL_SAT].readinessThreshold);
  assert.equal(report.benchmarkTarget, 530);
  assert.equal(report.benchmark, 'The SAT Math college-readiness benchmark (530) is inside that range, so this test can\'t tell yet which side of it you\'re on.');
  assert.match(report.disclaimer, /not an official SAT score/);
});

test('the benchmark sentence follows where the whole range sits', () => {
  assert.equal(practiceTestScoreReport(satReview(10, 10)).benchmark, 'That whole range is at or above the SAT Math college-readiness benchmark of 530.');
  assert.equal(practiceTestScoreReport(satReview(1, 10)).benchmark, 'That whole range is below the SAT Math college-readiness benchmark of 530.');
  const full = practiceTestScoreReport(satReview(30, 44));
  assert.equal(full.basis, 'Based on all 44 questions of a full-length practice test. It is still an estimate.');
});

test('every exam uses the benchmark the registry already holds — none invented here', () => {
  const report = (examType, earned, planned) => practiceTestScoreReport({
    session: released(examType, { requiredQuestions: planned }), correctQuestions: earned, answeredQuestions: planned,
    plannedQuestions: planned, earnedPoints: earned, possiblePoints: planned, scorePercent: Math.round((earned / planned) * 100), items: [],
  });
  assert.equal(report(EXAM_TYPES.ACT, 6, 10).benchmarkTarget, 22);
  assert.equal(report(EXAM_TYPES.ACT, 6, 10).benchmarkTarget, EXAM_BENCHMARKS[EXAM_TYPES.ACT].readinessThreshold);
  const tsia = report(EXAM_TYPES.TSIA2, 12, 20);
  assert.equal(tsia.benchmarkTarget, EXAM_BENCHMARKS[EXAM_TYPES.TSIA2].readinessThreshold);
  assert.equal(tsia.alternative, 'On the real TSIA2, a score below 950 can still count as college-ready with a diagnostic level of 6.');
  const asvab = report(EXAM_TYPES.ASVAB, 7, 10);
  assert.equal(asvab.benchmarkTarget, null, 'the ASVAB has no universal cut; a 0 would read as "above it"');
  assert.equal(asvab.benchmarkPosition, null);
  assert.equal(asvab.title, 'Your ASVAB math practice index');
  assert.match(asvab.disclaimer, /not an AFQT score/);
});

test('no estimate for a course Test, an unreleased review, or a test with nothing answered', () => {
  assert.equal(practiceTestScoreReport({ ...satReview(3, 5), session: released('courseTest'), scoreBasis: 'plannedWeighted' }), null);
  assert.equal(practiceTestScoreReport({ ...satReview(3, 5), session: { ...released('digitalSAT'), feedbackReleased: false } }), null);
  assert.equal(practiceTestScoreReport({ ...satReview(0, 5), answeredQuestions: 0 }), null);
});

/* --- the practice test clock, as the server will set it ------------------ */

test('the create screen shows exactly the time the server will set', () => {
  for (const examType of Object.values(EXAM_TYPES)) {
    const client = getExamPolicy(examType);
    const server = secureExam.policyFor(examType);
    // Same published specification on both sides.
    assert.equal(client.totalQuestions, server.totalQuestions, `${examType} length`);
    assert.equal(client.timeLimitSeconds, server.timeLimitSeconds, `${examType} time`);
    for (let count = 0; count <= server.totalQuestions + 3; count += 1) {
      assert.equal(
        practiceTestTimeLimitSeconds(client, count),
        navigation.proportionalTimeLimitSeconds(server, count),
        `${examType} with ${count} questions`,
      );
    }
  }
});

test('the time line reads the way a teacher plans a class period, count first', () => {
  assert.equal(describePracticeTestTime('digitalSAT', 10).text, '10 questions · 16 minutes — the real test\'s pace (70 minutes for 44).');
  assert.equal(describePracticeTestTime('digitalSAT', 44).text, 'All 44 questions · 70 minutes — the full Digital SAT Math time.');
  assert.equal(describePracticeTestTime('digitalSAT', 1).text, '1 question · 2 minutes — the real test\'s pace (70 minutes for 44).');
  assert.equal(describePracticeTestTime('tsia2', 10).seconds, null);
  assert.equal(describePracticeTestTime('tsia2', 10).text, '10 questions · untimed, like the real TSIA2 Mathematics.');
  // What the server will actually create for what was typed.
  assert.equal(practiceTestQuestionCount(getExamPolicy('digitalSAT'), '2.5'), 2);
  assert.equal(practiceTestQuestionCount(getExamPolicy('digitalSAT'), 999), 44);
  assert.equal(practiceTestQuestionCount(getExamPolicy('digitalSAT'), 0), 1);
});

test('an empty count is no count — never a silent full-length test', () => {
  // The server reads a missing count as "the whole test"; the form must not send one.
  for (const typed of ['', '   ', null, undefined, 'ten']) {
    assert.equal(practiceTestQuestionCount(getExamPolicy('digitalSAT'), typed), null, JSON.stringify(typed));
    const timing = describePracticeTestTime('digitalSAT', typed);
    assert.equal(timing.questionCount, null);
    assert.equal(timing.seconds, null);
    assert.equal(timing.text, 'Enter how many questions — 1 to 44.');
  }
});

/* --- what a skill is called ---------------------------------------------- */

test('a code is not a skill name: the key, a TEKS code, or the blueprint\'s "Target N"', () => {
  for (const [label, key] of [
    ['texas:A.5A', 'texas:A.5A'], ['A.5A', 'texas:A.5A'], ['a5a', 'texas:A.5A'], ['TEKS A.5A', null],
    ['Target 3', 'texas:A.5A'], ['target3', null], ['A2.4F', null], ['7.2', null], ['sat:algebra', null],
  ]) {
    assert.equal(isCodeLikeSkillLabel(label, key), true, `${label} is a code`);
  }
  for (const [label, key] of [
    ['Solving linear equations', 'texas:A.5A'], ['Slope: rate of change', 'texas:A.3B'], ['Unit 3.2 review', 'texas:A.3B'], ['', 'texas:A.5A'],
  ]) {
    assert.equal(isCodeLikeSkillLabel(label, key), false, `${label} is a name`);
  }
});

test('a skill is named by the teacher, then in a student\'s words, then by its standard', () => {
  assert.equal(studentSkillName({ label: 'Rate of change from tables', alignmentKey: 'texas:A.3B' }), 'Rate of change from tables');
  // What normalizeTestBlueprint puts in a label the teacher left empty.
  assert.equal(studentSkillName({ label: 'texas:A.5A', alignmentKey: 'texas:A.5A' }), studentLabelForTeks('A.5A'));
  assert.equal(studentSkillName({ label: 'Target 2', alignmentKey: 'texas:A.5A' }), 'Solving linear equations');
  assert.equal(studentSkillName({ label: 'texas:A.5A', alignmentKey: null }), 'Solving linear equations', 'a code-only label still names its standard');
  // No curated or described name: three standards must not be three "This skill" rows.
  assert.equal(studentLabelForTeks('G.9A'), 'This skill', 'precondition: the registry has no name for G.9A');
  assert.equal(studentSkillName({ label: 'texas:G.9A', alignmentKey: 'texas:G.9A' }), 'Standard G.9A');
  assert.equal(studentSkillName({ alignmentKey: 'texas:G.12B' }), 'Standard G.12B');
  // Nothing to go on: the caller's words.
  assert.equal(studentSkillName({ label: 'Target 5', alignmentKey: null }, 'Other questions'), 'Other questions');
  assert.equal(studentSkillName({ label: null, alignmentKey: 'sat:algebra' }, 'Other questions'), 'Other questions');
});

/* --- an answer typed in the math editor ---------------------------------- */

test('an answer the math editor wrote as LaTeX is drawn as mathematics; typed text is not', () => {
  // The strings the real editor produced (tests/browser/secureAccessParity.mjs).
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/secureAnswerRoundTrip.json', import.meta.url), 'utf8'));
  const editorLatex = fixture.trials.filter((trial) => trial.editor === 'math' && /\\/.test(trial.serialized));
  assert.ok(editorLatex.length >= 5, 'the fixture still holds editor LaTeX');
  for (const trial of editorLatex) assert.equal(answerIsLatex(trial.serialized), true, trial.serialized);
  // A typed answer (text profiles, and every answer from before the editor) keeps its spaces and words.
  for (const trial of fixture.trials.filter((entry) => entry.editor === 'text')) assert.equal(answerIsLatex(trial.serialized), false, trial.serialized);
  for (const typed of ['7', '0.75', 'all real numbers', '0 ≤ t ≤ 8', '3/4', 'x^2', '$3x + 6$', '\\$25', '']) {
    assert.equal(answerIsLatex(typed), false, typed);
  }
  assert.equal(answerIsLatex('2^{10}'), true);
});
