import { EXAM_BENCHMARKS, EXAM_DOMAIN_REGISTRY, EXAM_TYPES } from './examDomainRegistry.js';
import { predictExamScoreFromPracticeTest } from './examScorePredictor.js';
import { getExamPolicy } from '../policies/examPolicyResolver.js';
import { studentLabelForTeks } from '../path/skillLabels.js';
import { toCanonicalKey, toDisplayCode } from '../../utils/teksUtils.js';
import { finiteNumber } from '../utils/numeric.js';

/*
 * RESULTS THAT TEACH.
 *
 * What a student reads once a secure test's results are released: a score in
 * words that cannot contradict itself, every question with their answer, the
 * correct answer and the worked solution, how they did on each skill (weakest
 * first, each with a way to practise it), and — for a practice test — what the
 * score could mean on the real exam, as a range.
 *
 * WHERE THE DATA COMES FROM, AND WHEN. Everything here reads the review that
 * `getStudentSecureExamReview` returns, and the server builds that review only
 * for a FINISHED session whose results are RELEASED (secureExam.publicReview).
 * Before then there is no answer, no solution and no correctness in the
 * browser to show. `reviewIsReleased` checks the same two facts again on the
 * client, so a screen renders results from nothing else.
 *
 * Pure — no React, no Firebase — so every sentence a student reads here is
 * tested directly (tests/platform/secureExamResultsModel.test.mjs).
 */

export const COURSE_TEST_EXAM_TYPE = 'courseTest';
const TERMINAL_STATUSES = new Set(['submitted', 'time_expired', 'force_submitted']);

const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);
const plural = (count, word) => (count === 1 ? word : `${word}s`);

/**
 * True only for a review of a finished test whose results were released — the
 * one state in which the server hands a review out at all.
 */
export const reviewIsReleased = (review) => Boolean(
  review && typeof review === 'object'
  && review.session && typeof review.session === 'object'
  && review.session.feedbackReleased === true
  && TERMINAL_STATUSES.has(clean(review.session.status))
  && Array.isArray(review.items),
);

export const reviewIsCourseTest = (review) => (
  clean(review?.session?.examType) === COURSE_TEST_EXAM_TYPE || review?.scoreBasis === 'plannedWeighted'
);

/* ---------------------------------------------------------------------------
 * THE SCORE, IN WORDS THAT AGREE WITH THE NUMBER.
 *
 * The screen used to print a score over the PLANNED questions ("52%") next to
 * "3 of 3 correct" — counted over the ANSWERED ones — and a student reasonably
 * asked how three right out of three is 52%. Both numbers now count every
 * planned question, a blank one as zero, and when the percent is not simply
 * "correct out of planned" the sentence says why: some questions are worth more
 * than others (a course Test's blueprint weights), or some answers earned part
 * credit. The points behind it are shown so the student can check the sum.
 * ------------------------------------------------------------------------- */

/** Points as a person writes them: 6.5, 12, never 6.500000001. */
export const formatPoints = (value) => {
  const number = finiteNumber(value);
  return number === null ? '' : String(Math.round(number * 100) / 100);
};

export const reviewScoreFacts = (review) => {
  const items = list(review?.items);
  const correct = finiteNumber(review?.correctQuestions)
    ?? items.filter((item) => item?.grading?.isCorrect === true).length;
  const answered = finiteNumber(review?.answeredQuestions)
    ?? items.filter((item) => item?.unanswered !== true).length;
  // The server's plannedQuestions is the authority; a review from before it
  // existed falls back to the same rule the server uses.
  const planned = Math.max(
    finiteNumber(review?.plannedQuestions)
      ?? Math.max(finiteNumber(review?.session?.requiredQuestions) ?? 0, items.length),
    answered,
    correct,
  );
  const earned = finiteNumber(review?.earnedPoints);
  const possible = finiteNumber(review?.possiblePoints);
  const reportedPercent = finiteNumber(review?.scorePercent);
  const percent = Math.round(reportedPercent
    ?? (earned !== null && possible ? (earned / possible) * 100 : 0));
  const weighted = review?.weighted === true;
  const partialCredit = !weighted && earned !== null && Math.abs(earned - correct) > 0.005;
  return {
    percent,
    correct,
    answered,
    planned,
    // Blank AND never-reached questions: both count as zero in the score.
    notAnswered: Math.max(0, planned - answered),
    earned,
    possible,
    weighted,
    partialCredit,
  };
};

export const describeReviewScore = (review) => {
  const facts = reviewScoreFacts(review);
  const { percent, correct, planned, notAnswered, earned, possible, weighted, partialCredit } = facts;
  const headline = `Score ${percent}%`;
  const countText = planned > 0
    ? `${correct} of ${planned} ${plural(planned, 'question')} correct`
    : 'No questions were scored';
  const blankNote = notAnswered > 0
    ? `${notAnswered} left blank ${notAnswered === 1 ? 'counts' : 'count'} as 0`
    : null;
  const points = earned !== null && possible !== null && possible > 0
    ? ` (${formatPoints(earned)} of ${formatPoints(possible)})`
    : '';
  const pointsNote = weighted
    ? `Some questions are worth more than others, so your score is based on points${points}.`
    : partialCredit
      ? `Some answers earned part credit, so your score is based on points${points}.`
      : null;
  const detail = `${countText}${blankNote ? ` (${blankNote})` : ''}.${pointsNote ? ` ${pointsNote}` : ''}`;
  return {
    ...facts,
    percentLabel: `${percent}%`,
    headline,
    countText,
    blankNote,
    pointsNote,
    detail,
    sentence: `${headline} — ${detail}`,
  };
};

/**
 * Questions the student never opened are not in the review's list at all, so
 * the list says where they went rather than silently being shorter.
 */
export const notReachedNote = (review) => {
  const { planned } = reviewScoreFacts(review);
  const missing = Math.max(0, planned - list(review?.items).length);
  if (!missing) return null;
  return `${missing} ${plural(missing, 'question')} ${missing === 1 ? 'was' : 'were'} never opened. ${missing === 1 ? 'It counts' : 'They count'} as 0, like a question left blank.`;
};

/* ---------------------------------------------------------------------------
 * AN ANSWER THAT IS MATHEMATICS, SHOWN AS MATHEMATICS.
 *
 * The secure math editor (SecureMathAnswerField) saves what MathLive writes:
 * a typed 3/4 is stored as `\frac34`, a set as `\left\lbrace1,2\right\rbrace`,
 * an interval as `(-\infty,3]`. MathText only typesets `$…$`, so a student
 * read "\frac34" as their own answer, right above "Correct answer 7".
 *
 * Decided from the VALUE, not from the field's input profile: a session graded
 * before the editor existed holds the characters a student typed into a plain
 * box, and "about 7 hours" typeset as mathematics would lose its spaces. Plain
 * editor output ("0.75", "-8") reads the same either way. An answer that
 * already carries `$…$` delimiters is MathText's to split.
 * ------------------------------------------------------------------------- */

const LATEX_MARKUP = /\\[A-Za-z]+|\\[{}]|[\^_]\{/;
const UNESCAPED_DOLLAR = /(^|[^\\])\$/;

export const answerIsLatex = (value) => {
  const text = clean(value);
  return Boolean(text) && LATEX_MARKUP.test(text) && !UNESCAPED_DOLLAR.test(text);
};

/* ---------------------------------------------------------------------------
 * ONE QUESTION, ONCE THE TEST IS OVER.
 *
 * The student's own answer (or "Left blank"), whether it was right, the
 * correct answer, and the item's worked solution — the same explanation My
 * Math Path shows when a question closes (PathSolutionReview). A choice field's
 * correct answer arrives as the choice's own words; a Rich Tool item has no
 * single typed key, so its worked solution's answer summary says what the
 * finished construction shows, and is not repeated inside the solution below.
 * A session graded before solutions were stored has none, and says so.
 * ------------------------------------------------------------------------- */

export const RESULT_STATUS = Object.freeze({
  CORRECT: 'correct',
  PARTIAL: 'partial',
  INCORRECT: 'incorrect',
  BLANK: 'blank',
});

export const RESULT_STATUS_LABEL = Object.freeze({
  [RESULT_STATUS.CORRECT]: 'Correct',
  [RESULT_STATUS.PARTIAL]: 'Part credit',
  [RESULT_STATUS.INCORRECT]: 'Incorrect',
  [RESULT_STATUS.BLANK]: 'Left blank',
});

export const NO_WORKED_SOLUTION = 'A worked solution isn\'t available for this question.';
// A course Test's answers wait until the class has finished (index.js courseAnswersRelease).
export const SOLUTIONS_HELD_NOTE = 'The correct answer and the worked solution appear once everyone has finished this test, or when your teacher releases them.';

const solutionHasBody = (review) => Boolean(review && (
  clean(review.headline) || list(review.reasoning).some((line) => clean(line))
  || clean(review.answerSummary) || clean(review.commonError) || clean(review.connection)
));

export const reviewItemResult = (item, index = 0, { solutionsHeld = false } = {}) => {
  const score = finiteNumber(item?.grading?.score) ?? 0;
  const status = item?.unanswered === true ? RESULT_STATUS.BLANK
    : item?.grading?.isCorrect === true ? RESULT_STATUS.CORRECT
      : score > 0 ? RESULT_STATUS.PARTIAL
        : RESULT_STATUS.INCORRECT;
  const position = finiteNumber(item?.position);
  const solution = item?.solution && typeof item.solution === 'object' ? item.solution : null;
  const toolItem = Boolean(item?.pathToolId || item?.questionSnapshot?.pathToolId);
  const answers = list(solution?.answers)
    .map((entry) => ({ label: clean(entry?.label) || null, display: clean(entry?.display) }))
    .filter((entry) => entry.display);
  const review = solutionHasBody(solution?.review) ? solution.review : null;
  const summary = clean(review?.answerSummary);
  const summaryIsTheAnswer = Boolean(summary) && (toolItem || !answers.length);
  const correctAnswers = toolItem || !answers.length
    ? (summary ? [{ label: null, display: summary }] : [])
    : answers;
  const workedSolution = review && summaryIsTheAnswer ? { ...review, answerSummary: null } : review;
  return {
    status,
    statusLabel: RESULT_STATUS_LABEL[status],
    questionNumber: position !== null && position >= 0 ? Math.floor(position) + 1 : index + 1,
    correctAnswers,
    workedSolution: solutionHasBody(workedSolution) ? workedSolution : null,
    solutionNote: solutionHasBody(workedSolution) ? null : (solutionsHeld ? SOLUTIONS_HELD_NOTE : NO_WORKED_SOLUTION),
  };
};

/* ---------------------------------------------------------------------------
 * HOW THEY DID ON EACH SKILL — WEAKEST FIRST, EACH WITH A WAY TO PRACTISE IT.
 *
 * A course Test groups by the standard each blueprint slot assessed (two
 * targets on the same standard are one skill to a student). A practice test
 * groups by the exam's own reporting domain ("Advanced Math"), named from the
 * domain registry; an item with no domain falls back to its standard.
 *
 * "Practise this skill" names a destination; the app decides how to get there
 * (src/platform/assessment/practiceSkillLaunch.js):
 *
 *   { alignmentKey: 'texas:A.5A', framework: null, domainId: null }
 *       course practice on that standard in My Math Path
 *   { alignmentKey, framework: 'digitalSAT', domainId: 'algebra' }
 *       that exam's own practice (the College & Career tab) — ANY destination
 *       from a practice test carries its framework, so it is never sent to
 *       ordinary course practice. alignmentKey only says which standard in the
 *       domain the student missed (else one it covered), or null when the
 *       items carried none; a launch that can open the exam on one standard
 *       may use it.
 * ------------------------------------------------------------------------- */

const NAMESPACED = /^[a-z][a-z0-9_-]*:/i;

/** The first Texas standard an item was aligned to, as `texas:CODE`, or null. */
export const teksKeyOf = (item) => {
  const keys = [...list(item?.alignmentKeys), item?.questionSnapshot?.alignmentKey]
    .map((key) => clean(key))
    .filter(Boolean);
  const raw = keys.find((key) => /^texas:/i.test(key)) || keys.find((key) => !NAMESPACED.test(key)) || '';
  const canonical = raw ? toCanonicalKey(raw) : '';
  return /^texas:./i.test(canonical) ? canonical : null;
};

/* ---------------------------------------------------------------------------
 * WHAT A SKILL IS CALLED ON A STUDENT'S SCREEN.
 *
 * One rule for the card ("What's on your Test", the Review by skill),
 * Corrections and this review, so a standard has one name everywhere:
 *
 *   1. the teacher's own name for a blueprint target — unless it is not a
 *      name at all. normalizeTestBlueprint fills a missing label with the
 *      standard's code ("texas:A.5A") or "Target 3", and a code is an index
 *      entry, not a skill;
 *   2. the student-facing name of the standard (skillLabels.js);
 *   3. for a standard nobody has named or described (much of Geometry and
 *      Precalculus today), "Standard G.9A". The generic "This skill" made
 *      three different standards three identical rows, each with its own
 *      practise button; the code at least tells them apart, and the review
 *      already shows each question's TEKS code on its badge;
 *   4. the caller's fallback, when there is no standard either.
 *
 * functions/lib/testCycle.js applies rule 1 before a label leaves the server
 * (`isCodeLikeTargetLabel`); tests/platform/testCycleSkillNames.test.mjs holds
 * the two predicates to the same answers.
 * ------------------------------------------------------------------------- */

const GENERIC_SKILL_LABEL = studentLabelForTeks('');
const STANDARD_CODE_LABEL = /^(?:teks\s+)?(?:texas:)?[A-Z0-9]+\.\d+[A-Z]?$/i;
const SYNTHESIZED_TARGET_LABEL = /^target\s*\d+$/i;
const NAMESPACED_KEY_LABEL = /^[a-z][a-z0-9_-]*:\S+$/i;
// Letters and digits only, so "A5A", "a.5a" and "A.5A" are the same code.
const squash = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]/g, '');

/** True when a "label" is really a code: the key itself, a TEKS code, or "Target N". */
export const isCodeLikeSkillLabel = (label, alignmentKey = null) => {
  const text = clean(label);
  if (!text) return false;
  const key = clean(alignmentKey);
  if (key && (squash(text) === squash(key) || squash(text) === squash(toDisplayCode(key)))) return true;
  return STANDARD_CODE_LABEL.test(text) || SYNTHESIZED_TARGET_LABEL.test(text) || NAMESPACED_KEY_LABEL.test(text);
};

export const studentSkillName = ({ label = null, alignmentKey = null } = {}, fallback = 'Other questions') => {
  const teacherLabel = clean(label);
  if (teacherLabel && !isCodeLikeSkillLabel(teacherLabel, alignmentKey)) return teacherLabel;
  // A code standing in for a label still names the standard when no key came with it.
  const source = clean(alignmentKey) || (STANDARD_CODE_LABEL.test(teacherLabel) ? teacherLabel.replace(/^teks\s+/i, '') : '');
  const code = source ? clean(toDisplayCode(source)) : '';
  if (!code || NAMESPACED.test(code)) return fallback;
  const named = studentLabelForTeks(code);
  return named && named !== GENERIC_SKILL_LABEL ? named : `Standard ${code}`;
};

export const studentSkillLabel = (alignmentKey) => studentSkillName({ alignmentKey });

/** A teacher's names for standards, from blueprint targets ({ alignmentKey, label }), keyed canonically. */
const skillLabelMap = (skillLabels) => {
  const names = new Map();
  list(skillLabels).forEach((entry) => {
    const key = clean(entry?.alignmentKey) ? toCanonicalKey(entry.alignmentKey) : '';
    const label = clean(entry?.label);
    if (key && label && !isCodeLikeSkillLabel(label, entry.alignmentKey) && !names.has(key)) names.set(key, label);
  });
  return names;
};

export const groupReviewBySkill = (review, { skillLabels = [] } = {}) => {
  const examType = clean(review?.session?.examType);
  const courseTest = reviewIsCourseTest(review);
  const examFramework = !courseTest && EXAM_DOMAIN_REGISTRY[examType] ? examType : null;
  const domains = examFramework ? EXAM_DOMAIN_REGISTRY[examFramework] : [];
  const teacherNames = skillLabelMap(skillLabels);
  const groups = new Map();

  list(review?.items).forEach((item, index) => {
    const teksKey = teksKeyOf(item);
    const domain = examFramework && item?.assessmentDomainId
      ? domains.find((entry) => entry.id === item.assessmentDomainId) || null
      : null;
    let identity;
    if (domain) {
      identity = { key: `domain:${domain.id}`, kind: 'domain', label: domain.title, practice: { alignmentKey: null, framework: examFramework, domainId: domain.id } };
    } else if (teksKey) {
      const label = studentSkillName({ label: teacherNames.get(teksKey) || null, alignmentKey: teksKey });
      identity = { key: `skill:${teksKey}`, kind: 'skill', label, practice: { alignmentKey: teksKey, framework: examFramework, domainId: null } };
    } else {
      identity = { key: 'other', kind: 'other', label: 'Other questions', practice: null };
    }
    const group = groups.get(identity.key) || { ...identity, order: index, correct: 0, total: 0, blank: 0, missedKeys: [], seenKeys: [] };
    group.total += 1;
    if (item?.grading?.isCorrect === true) group.correct += 1;
    if (item?.unanswered === true) group.blank += 1;
    if (teksKey) {
      group.seenKeys.push(teksKey);
      if (item?.grading?.isCorrect !== true) group.missedKeys.push(teksKey);
    }
    groups.set(identity.key, group);
  });

  return [...groups.values()]
    .map(({ missedKeys, seenKeys, ...group }) => ({
      ...group,
      missed: group.total - group.correct,
      summary: `${group.correct} of ${group.total} correct${group.blank ? ` · ${group.blank} left blank` : ''}`,
      practice: group.practice && group.kind === 'domain'
        ? { ...group.practice, alignmentKey: missedKeys[0] || seenKeys[0] || null }
        : group.practice,
    }))
    .sort((left, right) => (left.correct / left.total) - (right.correct / right.total)
      || right.missed - left.missed
      || left.order - right.order);
};

/* ---------------------------------------------------------------------------
 * WHAT A PRACTICE TEST COULD MEAN ON THE REAL EXAM.
 *
 * Simulations only, and only once released (a course Test is the teacher's own
 * test and has no outside scale). The estimate is a RANGE from
 * examScorePredictor.predictExamScoreFromPracticeTest, read against the
 * benchmark the predictor already uses, and it always says how many questions
 * it rests on and that it is not an official score. A student who answered
 * nothing gets no estimate: there is nothing to estimate from.
 * ------------------------------------------------------------------------- */

const EXAM_STUDENT_NAMES = Object.freeze({
  [EXAM_TYPES.DIGITAL_SAT]: 'SAT Math',
  [EXAM_TYPES.ACT]: 'ACT Math',
  [EXAM_TYPES.TSIA2]: 'TSIA2 Math',
  [EXAM_TYPES.ASVAB]: 'ASVAB math',
});

const BENCHMARK_NAMES = Object.freeze({
  [EXAM_TYPES.DIGITAL_SAT]: 'SAT Math college-readiness benchmark',
  [EXAM_TYPES.ACT]: 'ACT Math college-readiness benchmark',
  [EXAM_TYPES.TSIA2]: 'TSIA2 college-ready score',
});

export const practiceTestScoreReport = (review) => {
  const examType = clean(review?.session?.examType);
  // EXAM_BENCHMARKS names the four exams with an outside scale; a course Test
  // (examType `courseTest`) is not one of them, so it never gets an estimate.
  if (!reviewIsReleased(review) || !EXAM_BENCHMARKS[examType]) return null;
  const facts = reviewScoreFacts(review);
  if (facts.answered < 1 || facts.planned < 1) return null;
  const earned = facts.earned ?? (facts.percent / 100) * facts.planned;
  const possible = facts.possible && facts.possible > 0 ? facts.possible : facts.planned;
  const prediction = predictExamScoreFromPracticeTest({
    examType, earnedPoints: earned, possiblePoints: possible, questionCount: facts.planned,
  });
  if (!prediction) return null;

  const name = EXAM_STUDENT_NAMES[examType];
  const fullLength = finiteNumber(getExamPolicy(examType)?.totalQuestions);
  const shortTest = fullLength !== null && facts.planned < fullLength;
  const basis = shortTest
    ? `Based on ${facts.planned} ${plural(facts.planned, 'question')} — the real test has ${fullLength}. A short practice test is only a rough estimate; a longer one gives a better one.`
    : `Based on all ${facts.planned} questions of a full-length practice test. It is still an estimate.`;
  const benchmarkName = BENCHMARK_NAMES[examType] || null;
  const threshold = prediction.benchmarkTarget;
  const benchmark = threshold === null || !benchmarkName
    ? 'The ASVAB has no single math passing score, so there is no benchmark to compare with.'
    : prediction.benchmarkPosition === 'above'
      ? `That whole range is at or above the ${benchmarkName} of ${threshold}.`
      : prediction.benchmarkPosition === 'below'
        ? `That whole range is below the ${benchmarkName} of ${threshold}.`
        : `The ${benchmarkName} (${threshold}) is inside that range, so this test can't tell yet which side of it you're on.`;
  const alternative = examType === EXAM_TYPES.TSIA2 && prediction.alternativeDiagnosticLevel
    ? `On the real TSIA2, a score below ${threshold} can still count as college-ready with a diagnostic level of ${prediction.alternativeDiagnosticLevel}.`
    : null;
  return {
    examType,
    title: examType === EXAM_TYPES.ASVAB ? 'Your ASVAB math practice index' : `Your estimated ${name} score`,
    low: prediction.low,
    high: prediction.high,
    rangeText: `${prediction.low}–${prediction.high}`,
    scaleText: `on the ${prediction.scoreMin}–${prediction.scoreMax} scale`,
    questionCount: facts.planned,
    basis,
    benchmarkTarget: threshold,
    benchmarkPosition: prediction.benchmarkPosition,
    benchmark,
    alternative,
    disclaimer: prediction.disclaimer,
  };
};

/* ---------------------------------------------------------------------------
 * A PRACTICE TEST'S CLOCK, BEFORE IT IS CREATED.
 *
 * The teacher choosing "10 questions of the SAT" should see the time the
 * student will get, and it must be the time the SERVER will set. So this
 * mirrors functions/lib/secureExamNavigation.js proportionalTimeLimitSeconds
 * exactly — the real test's pace, rounded up to a whole minute, never under
 * one minute; a full-length test keeps the full clock; an untimed test stays
 * untimed — and a parity test runs both over every exam and length.
 *
 * AN EMPTY BOX IS NOT A FULL-LENGTH TEST. The server reads a missing count as
 * "the whole test", so a teacher who cleared the box and pressed Create got 44
 * SAT questions without being told. A blank count is now no count: the time
 * line asks for one and the form will not create the session. Every line also
 * leads with the number of questions it describes.
 * ------------------------------------------------------------------------- */

/**
 * The question count the server will create for what the teacher typed, or
 * null when nothing was typed (blank, or not a number) — never a silent
 * full-length test.
 */
export const practiceTestQuestionCount = (policy, requested) => {
  const total = Math.max(1, Math.floor(finiteNumber(policy?.totalQuestions) ?? 1));
  const typed = finiteNumber(requested);
  if (typed === null) return null;
  return Math.min(total, Math.max(1, Math.floor(typed)));
};

export const practiceTestTimeLimitSeconds = (policy, requiredQuestions) => {
  const full = finiteNumber(policy?.timeLimitSeconds);
  const total = finiteNumber(policy?.totalQuestions);
  if (full === null || full <= 0) return null;
  const required = Math.floor(finiteNumber(requiredQuestions) ?? 0);
  if (total === null || total <= 0 || required <= 0 || required >= total) return full;
  return Math.max(60, Math.ceil((full * required) / total / 60) * 60);
};

export const describePracticeTestTime = (examType, requestedQuestions) => {
  const policy = getExamPolicy(examType);
  const count = practiceTestQuestionCount(policy, requestedQuestions);
  if (count === null) {
    return { questionCount: null, seconds: null, text: `Enter how many questions — 1 to ${policy.totalQuestions}.` };
  }
  const full = count >= policy.totalQuestions;
  const countText = full ? `All ${count} ${plural(count, 'question')}` : `${count} ${plural(count, 'question')}`;
  const seconds = practiceTestTimeLimitSeconds(policy, count);
  if (seconds === null) return { questionCount: count, seconds: null, text: `${countText} · untimed, like the real ${policy.title}.` };
  const minutes = Math.round(seconds / 60);
  const fullMinutes = Math.round(policy.timeLimitSeconds / 60);
  return {
    questionCount: count,
    seconds,
    text: full
      ? `${countText} · ${minutes} minutes — the full ${policy.title} time.`
      : `${countText} · ${minutes} ${plural(minutes, 'minute')} — the real test's pace (${fullMinutes} minutes for ${policy.totalQuestions}).`,
  };
};
