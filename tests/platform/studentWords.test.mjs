/*
 * ONE STUDENT WORD LIST (student pass 3, D9 / NAV-17, NAV-18, NAV-26, HELP-17,
 * HELP-24). src/platform/student/studentWords.js holds the words; these tests
 * run the models that use them and pin the screens to them by behaviour:
 * the old words are gone from student screens, the exit ticket is spelled out
 * once per screen, closed work has one name, a lesson waiting only on its exit
 * ticket says so, and every hint offer says what a hint costs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CLOSED_WORK, EXIT_TICKET, EXIT_TICKET_SPELLED_OUT, EXIT_TICKET_WAITS, HINT_COST, SEE_RESULTS, DUE_WORDS,
  firstExitTicketMention, studentSectionLabel, triesCount,
} from '../../src/platform/student/studentWords.js';
import { HINT_COST_SENTENCE } from '../../src/platform/supports/hints/hintCopy.js';
import { SECTION_STATE, describeLessonSections, onlyExitTicketWaits } from '../../src/platform/student/lessonSections.js';
import { studentDueDateLines, studentDueText } from '../../src/assignmentLifecycle.js';
import { BUCKET, BUCKET_LABEL, resolveNextAction } from '../../src/studentDashboardModel.js';
import { ASSIGNMENT_CATEGORY, ASSIGNMENT_CATEGORY_LABEL } from '../../src/platform/student/studentAssignmentsCenterModel.js';
import { GRADE_STATUS, GRADE_STATUS_LABEL } from '../../src/platform/student/studentGradeCenterModel.js';
import { TRY_AGAIN_LABEL } from '../../src/platform/student/studentResultNextStep.js';
import { closedAttemptText } from '../../src/platform/supports/feedback/attemptFeedbackPlan.js';
import { buildClosedQuestionReview } from '../../src/platform/supports/review/closedQuestionReview.js';
import { partialCreditBreakdown } from '../../src/platform/supports/feedback/partialCreditBreakdown.js';
import { SAME_ANSWER_AGAIN } from '../../src/platform/student/submitCost.js';
import { questionAddressLabel } from '../../src/app/routes/questionAddress.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

/* ---- the words ------------------------------------------------------------- */

test('D9: the exit ticket is "Exit ticket (DOL)" spelled out, "Exit ticket" after; tries, never attempts', () => {
  assert.equal(EXIT_TICKET_SPELLED_OUT, 'Exit ticket (DOL)');
  assert.equal(studentSectionLabel('dol'), EXIT_TICKET);
  assert.equal(studentSectionLabel('dol', { spelledOut: true }), EXIT_TICKET_SPELLED_OUT);
  assert.equal(studentSectionLabel('classwork', { spelledOut: true }), 'Classwork');
  assert.equal(triesCount(1), '1 try');
  assert.equal(triesCount(3), '3 tries');
  // One hint sentence: the word list names the one hintCopy.js holds.
  assert.equal(HINT_COST, HINT_COST_SENTENCE);
  assert.equal(HINT_COST, 'Hints never lower your grade. Your teacher can see you used one.');
});

test('D9: the exit ticket is spelled out at the first item that names one — none when the screen already did', () => {
  const items = [{ dol: false }, { dol: true }, { dol: true }];
  assert.equal(firstExitTicketMention(items, (item) => item.dol), 1);
  assert.equal(firstExitTicketMention(items, (item) => item.dol, { alreadySpelledOut: true }), -1);
  assert.equal(firstExitTicketMention([{ dol: false }], (item) => item.dol), -1);
  assert.equal(firstExitTicketMention(null, (item) => item.dol), -1);
});

test('NAV-17: closed work has one name on every screen, and the result button one word', () => {
  // The state's one name. It sits beside a real grade on Home, Grades and in
  // the workspace, so it never says "no credit" (that reads as "you earned
  // none"); "no credit" is said of trying it again, where it is true.
  assert.equal(CLOSED_WORK.label, 'Closed');
  // Grades' status for closed work with nothing recorded (left out of the
  // average): more exact than "Closed" there, and true.
  assert.equal(GRADE_STATUS_LABEL[GRADE_STATUS.PRACTICE_ONLY], 'Closed — not counted');
  for (const shownBesideAGrade of [CLOSED_WORK.label, CLOSED_WORK.gradeLabel, GRADE_STATUS_LABEL[GRADE_STATUS.PRACTICE_ONLY]]) {
    assert.doesNotMatch(shownBesideAGrade, /no credit/i, shownBesideAGrade);
  }
  for (const aboutTheRetry of [CLOSED_WORK.groupLabel, CLOSED_WORK.tryAgain, CLOSED_WORK.bannerTitle]) {
    assert.match(aboutTheRetry, /no credit/, aboutTheRetry);
  }
  assert.equal(CLOSED_WORK.groupLabel, 'Closed — try again (no credit)');
  assert.equal(CLOSED_WORK.tabLabel, 'Closed — try again');
  assert.equal(CLOSED_WORK.bannerTitle, 'Closed — practice here earns no credit');
  // Never "Practice …" as a name: that word is the lesson's Practice section.
  assert.doesNotMatch(`${CLOSED_WORK.label} ${CLOSED_WORK.groupLabel} ${CLOSED_WORK.tabLabel}`, /Practice/);
  assert.equal(ASSIGNMENT_CATEGORY_LABEL[ASSIGNMENT_CATEGORY.PRACTICE], CLOSED_WORK.tabLabel);
  assert.equal(BUCKET_LABEL[BUCKET.PRACTICE], CLOSED_WORK.groupLabel);
  assert.equal(TRY_AGAIN_LABEL, CLOSED_WORK.tryAgain);
  assert.equal(SEE_RESULTS, 'See results');
  // No teacher words in what closed work says to a student.
  assert.doesNotMatch(Object.values(CLOSED_WORK).join(' '), /gradebook|mastery evidence|analytics|grading window|frozen|Practice Mode/i);
});

test('NAV-17: Home, Grades, Assignments and the workspace take the closed-work and result words from the list', () => {
  const home = executableSource(read('src/components/student/StudentDashboardView.jsx'));
  assert.match(home, /label: CLOSED_WORK\.label \}/);
  assert.match(home, /primaryButton\(SEE_RESULTS, /);
  for (const path of ['src/components/student/StudentGradeCenter.jsx', 'src/components/student/StudentAssignmentsCenter.jsx']) {
    const source = executableSource(read(path));
    assert.match(source, /\{SEE_RESULTS\}/, path);
    assert.match(source, /^import \{[^}]*\bSEE_RESULTS\b[^}]*\} from '\.\.\/\.\.\/platform\/student\/studentWords\.js';$/m, `${path} imports what it prints`);
  }
  const app = executableSource(read('src/App.jsx'));
  assert.match(app, /^import \{ CLOSED_WORK, EXIT_TICKET, EXIT_TICKET_SPELLED_OUT, exitTicketInSentence \} from '\.\/platform\/student\/studentWords\.js';$/m);
  // The workspace badge and the phone's status chip name the state from the list.
  const badge = region(app, 'const lifecycleBadge = lifecycle.isPracticeOnly', ': lifecycle.isLate', 'workspace badge');
  assert.match(badge, /\{ label: CLOSED_WORK\.label, /);
  const phoneLine = region(app, "lifecycle.isPracticeOnly && {\n        key: 'practice',", '},', 'phone status line');
  assert.match(phoneLine, /chip: CLOSED_WORK\.label,/);
  assert.match(phoneLine, /title: CLOSED_WORK\.bannerTitle,/);
  const banner = region(app, '{lifecycle.isPracticeOnly && !preview && (', '</section>', 'closed-work banner');
  assert.match(banner, /\{CLOSED_WORK\.bannerTitle\}/);
  assert.match(banner, /\{CLOSED_WORK\.bannerText\}/);
  // The closed copy opens empty: the banner says the graded answers are kept,
  // so a blank page does not read as lost work (NV13).
  assert.match(CLOSED_WORK.bannerText, /your graded answers are kept: this is a fresh copy to practice on/);
});

/* ---- old words are gone from student screens ------------------------------ */

const STUDENT_FILES = [
  'src/components/student/StudentDashboardView.jsx',
  'src/components/student/StudentAssignmentsCenter.jsx',
  'src/components/student/StudentGradeCenter.jsx',
  'src/components/student/StudentAssignmentResult.jsx',
  'src/components/student/RetentionQuickCheckBanner.jsx',
  'src/components/student/CCMRHub.jsx',
  'src/components/student/TestCycleCard.jsx',
  'src/studentDashboardModel.js',
  'src/assignmentLifecycle.js',
  'src/platform/student/whatChangedModel.js',
  'src/platform/student/studentAssignmentsCenterModel.js',
  'src/platform/student/studentGradeCenterModel.js',
  'src/platform/supports/feedback/attemptFeedbackPlan.js',
  'src/platform/supports/review/closedQuestionReview.js',
  'src/platform/supports/hints/HintPanel.jsx',
  'src/QuestionEngine.jsx',
  'src/LoginScreen.jsx',
];
// Each was printed to a student before this pass (NAV-17, NAV-18, HELP-24).
const OLD_WORDS = [
  /Regular due/, /Final late due/, /final late due/, /'Not set'/,
  /Practice Mode — grading window ended/, /teacher gradebook, mastery evidence/, /'Practice only/, /'Closed — no credit/,
  /View Results/, /Back to Dashboard/, /Return to Dashboard/,
  /Retention concern/, /CCMR standard or skill/, /assessment identifier/,
  /100 — prerequisite met/, /Frozen recorded grade/, /DOL \/ Exit Ticket/, /DOL is available now/, /Start DOL Section/,
  /submit the same response again/, /No answer change is required/, /activity feedback window/, /Formula anchor/,
  /Your answer is locked\./, /This question is closed\. Compare/, /Ask your teacher to go over it/,
  /use another attempt/, /recorded attempts and grade history/, /answers, attempts and grade/, /next attempt\./,
  /daily DOL checks/, /practice, DOL and/, /another try on the DOL/,
];

test('NAV-17/NAV-18/HELP-24: none of the old words is left in what these student screens print', () => {
  for (const path of STUDENT_FILES) {
    const source = executableSource(read(path));
    for (const word of OLD_WORDS) {
      // 'Not set' stays as formatDateTime's own fallback, which teachers see;
      // students are given studentDueText / studentDueDateLines instead.
      if (path === 'src/assignmentLifecycle.js' && String(word) === "/'Not set'/") continue;
      assert.doesNotMatch(source, word, `${path} still prints ${word}`);
    }
  }
});

/* ---- NAV-18: dates in the student's words -------------------------------- */

test('NAV-18: a card says "Due" and "Late work accepted until", and never "Due Not set"', () => {
  const assignment = { id: 'a1', dueAt: '2026-10-20T15:00:00', lateDueAt: '2026-10-22T15:00:00' };
  const lines = studentDueDateLines(assignment, {});
  assert.match(lines.dueLine, /^Due: Oct 20, 2026/);
  assert.match(lines.finalLine, /^Late work accepted until: Oct 22, 2026/);
  // The student's own (later) date is named as theirs.
  const own = studentDueDateLines(assignment, { dueAt: new Date('2026-10-21T15:00:00'), lateDueAt: new Date('2026-10-24T15:00:00') });
  assert.match(own.dueLine, /^Your due date: Oct 21/);
  assert.match(own.finalLine, /^Your last day to turn in: Oct 24/);
  // No date: no line pretending to have one.
  const none = studentDueDateLines({ id: 'a2' }, {});
  assert.equal(none.dueLine, DUE_WORDS.noDue);
  assert.equal(none.finalLine, '');
  assert.equal(studentDueText(null), 'No due date');
  // One form wherever a due date is printed: "Due: <date>".
  assert.match(studentDueText('2026-10-20T15:00:00'), /^Due: Oct 20, 2026/);
  // Only a last day: that is when it is due (S1), one line.
  const lastOnly = studentDueDateLines({ lateDueAt: '2026-10-22T10:00:00' }, {});
  assert.match(lastOnly.dueLine, /^Due: Oct 22, 2026/);
  assert.equal(lastOnly.finalLine, '');
  // The last day equal to the due date is not a second line.
  assert.equal(studentDueDateLines({ dueAt: '2026-10-20T15:00:00', lateDueAt: '2026-10-20T15:00:00' }, {}).finalLine, '');
});

test('NAV-18: Home and the workspace print the whole lines, not the old label and value pairs', () => {
  const home = executableSource(read('src/components/student/StudentDashboardView.jsx'));
  assert.match(home, /\{dates\.dueLine\}\{dates\.finalLine \? ` · \$\{dates\.finalLine\}` : ''\}/);
  assert.doesNotMatch(home, /dates\.dueLabel|dates\.finalLabel/);
  const app = executableSource(read('src/App.jsx'));
  assert.match(app, /const dates = studentDueDateLines\(assignment, lifecycle\); return <>\{dates\.dueLine\}\{dates\.finalLine \? <><br \/>\{dates\.finalLine\}<\/> : null\}<\/>;/);
});

test('NAV-18: a skill to refresh is a nudge, not an error', () => {
  const banner = executableSource(read('src/components/student/RetentionQuickCheckBanner.jsx'));
  assert.match(banner, /'Time to refresh a skill'/);
  assert.doesNotMatch(banner, /--mm-error|#d93025/);
});

/* ---- NAV-26: what is waiting --------------------------------------------- */

const lessonSections = ({ statusOf, dolState }) => describeLessonSections({
  entries: [
    { storageIndex: 0, role: 'classwork' },
    { storageIndex: 1, role: 'practice' },
    { storageIndex: 2, role: 'dol' },
  ],
  requiredIndices: [0, 1, 2],
  statusOf,
  lifecycle: { isOpen: true },
  dolState,
  todayKey: '2026-10-18',
});

test('NAV-26: a lesson done except its exit ticket says what waits; anything else stays "Not open yet"', () => {
  const later = { enabled: true, status: 'waiting', opensAt: new Date('2026-10-18T14:15:00') };
  const done = (index) => (index < 2 ? 'correct' : 'unattempted');
  const mostlyDone = lessonSections({ statusOf: done, dolState: later });
  assert.equal(mostlyDone.workableNow, false);
  assert.equal(onlyExitTicketWaits(mostlyDone.sections), true);
  assert.equal(EXIT_TICKET_WAITS, 'Exit ticket opens in class');
  // On its class day, or when the teacher starts it: still the exit ticket.
  assert.equal(onlyExitTicketWaits(lessonSections({ statusOf: done, dolState: { enabled: true, status: 'notToday', instructionDateKey: '2026-10-21' } }).sections), true);
  assert.equal(onlyExitTicketWaits(lessonSections({ statusOf: done, dolState: { enabled: true, status: 'unscheduled' } }).sections), true);
  // Practice still to do: more than the exit ticket waits.
  assert.equal(onlyExitTicketWaits(lessonSections({ statusOf: (index) => (index === 0 ? 'correct' : 'unattempted'), dolState: later }).sections), false);
  // Nothing done yet: not "mostly done".
  assert.equal(onlyExitTicketWaits(lessonSections({ statusOf: () => 'unattempted', dolState: later }).sections), false);
  // A closed exit ticket is not waiting.
  const closed = lessonSections({ statusOf: done, dolState: { enabled: true, status: 'notToday', instructionDateKey: '2026-10-01' } });
  assert.equal(closed.sections.find((section) => section.role === 'dol').state, SECTION_STATE.CLOSED);
  assert.equal(onlyExitTicketWaits(closed.sections), false);
  // A lesson that is only an exit ticket has nothing "mostly done" about it.
  const dolOnly = describeLessonSections({
    entries: [{ storageIndex: 0, role: 'dol' }], requiredIndices: [0], statusOf: () => 'unattempted',
    lifecycle: { isOpen: true }, dolState: later, todayKey: '2026-10-18',
  });
  assert.equal(dolOnly.sections[0].state, SECTION_STATE.OPENS_LATER);
  assert.equal(onlyExitTicketWaits(dolOnly.sections), false);
  // Locked behind earlier classwork is not "opens in class" (the wait line
  // says what to finish first); locked until the teacher starts it is.
  const lockedDol = (reason) => [
    { role: 'classwork', finished: true, state: SECTION_STATE.DONE },
    { role: 'dol', finished: false, state: SECTION_STATE.LOCKED, reason },
  ];
  assert.equal(onlyExitTicketWaits(lockedDol('prerequisite')), false);
  assert.equal(onlyExitTicketWaits(lockedDol(undefined)), true);
  // An excused section is not "done": excused work plus a waiting exit ticket
  // is not a mostly-finished lesson.
  const excusedOnly = [
    { role: 'practice', finished: true, state: SECTION_STATE.EXCUSED },
    { role: 'dol', finished: false, state: SECTION_STATE.OPENS_LATER },
  ];
  assert.equal(onlyExitTicketWaits(excusedOnly), false);
  // An exit ticket in Recovery is something to do, not something waiting.
  const recovery = [
    { role: 'classwork', finished: true, state: SECTION_STATE.DONE },
    { role: 'dol', finished: false, state: SECTION_STATE.RECOVERY },
  ];
  assert.equal(onlyExitTicketWaits(recovery), false);
  // The wait line uses the same word.
  assert.match(mostlyDone.sections[2].label, /^Exit ticket$/);
});

test('NAV-26: Home\'s waiting chip asks onlyExitTicketWaits, and says so', () => {
  const home = executableSource(read('src/components/student/StudentDashboardView.jsx'));
  assert.match(home, /^import \{ SECTION_STATE, describeSectionWait, onlyExitTicketWaits \} from '\.\.\/\.\.\/platform\/student\/lessonSections\.js';$/m);
  const ladder = region(home, 'const status = excused', "label: 'Open now' };", 'status ladder');
  assert.match(ladder, /waiting\s*\n?[^]*label: onlyExitTicketWaits\(lesson\?\.sections\) \? EXIT_TICKET_WAITS : 'Not open yet'/);
});

test('S3: the exit ticket\'s "not open" toast says what is true for its state, from the navigator', () => {
  const app = executableSource(read('src/App.jsx'));
  const toast = region(app, 'const dolLifecycle = getAssignmentLifecycle(', 'return;\n    }', 'the exit-ticket toast');
  assert.match(toast, /const dolAccess = describeSectionAccess\(\{ role: 'dol', label: `the \$\{exitTicketInSentence\}`, timedDol: true, lifecycle: dolLifecycle, dolState, nowValue: Date\.now\(\) \}\);/);
  assert.match(toast, /dolAccess\.reason \|\|/);
  assert.doesNotMatch(app, /last minutes of class/);
});

test('S5: a past-date Test Cycle is never in the closed tab, whose name says "try again"', async () => {
  const { buildAssignmentRow, ASSIGNMENT_CATEGORY: CATEGORY } = await import('../../src/platform/student/studentAssignmentsCenterModel.js');
  const lifecycle = { isPracticeOnly: true, isClosed: true };
  const testCycle = buildAssignmentRow({ entry: {
    assignment: { id: 't1', title: 'Unit 4 Test', assessmentPolicy: { mode: 'testCycle' } },
    bucket: 'comingUp', lifecycle,
    testCycle: { key: 'test', label: 'Test ready', actionLabel: 'Open assessment', tone: 'notStarted' },
  } });
  assert.equal(testCycle.isTestCycle, true);
  assert.equal(testCycle.practiceAvailable, false);
  assert.equal(testCycle.canPractice, false);
  assert.ok(!testCycle.categories.includes(CATEGORY.PRACTICE), JSON.stringify(testCycle.categories));
  // An ordinary closed lesson still is.
  const lesson = buildAssignmentRow({ entry: { assignment: { id: 'l1', title: 'Lesson 1' }, bucket: 'completed', lifecycle, finished: true } });
  assert.ok(lesson.categories.includes(CATEGORY.PRACTICE), JSON.stringify(lesson.categories));
});

test('D9: Grades spells the exit ticket out on one row\'s breakdown, the first in screen order', () => {
  const breakdown = executableSource(read('src/components/student/GradeSectionBreakdown.jsx'));
  assert.match(breakdown, /dol: EXIT_TICKET,/);
  assert.match(breakdown, /\{key === 'dol' && spellExitTicket \? EXIT_TICKET_SPELLED_OUT : SECTION_LABEL\[key\]\}/);
  const grades = executableSource(read('src/components/student/StudentGradeCenter.jsx'));
  const pick = region(grades, 'const exitTicketSpelledOutOn = (() => {', '})();', 'Grades first mention');
  assert.match(pick, /\[\.\.\.\(currentGroup\?\.entries \|\| \[\]\), \.\.\.pastPeriodGroups\.flatMap\(\(group\) => group\.entries \|\| \[\]\)\]/);
  assert.match(pick, /firstExitTicketMention\(ordered, \(entry\) => Number\(entry\?\.sections\?\.dol\?\.total\) > 0\)/);
  assert.match(grades, /spellExitTicket=\{entry\.assignmentId === exitTicketSpelledOutOn\}/);
  assert.match(grades, /<GradeSectionBreakdown [^>]*spellExitTicket=\{spellExitTicket\} \/>/);
  // Rows default to the short word; only the chosen one spells it out.
  assert.match(grades, /function GradeRow\(\{[^)]*spellExitTicket = false \}\)/);
});

/* ---- D9 on Home: spelled out once ----------------------------------------- */

test('D9: Home spells the exit ticket out on its first mention — the primary card when it names one, else one lesson card', () => {
  const live = resolveNextAction({ dashboard: { activeDols: [{ assignment: { id: 'a1', title: 'L1' }, state: { endsAt: Date.now() + 60e3 }, openQuestionIndices: [0] }] } });
  assert.equal(live.headline, 'Your exit ticket (DOL) is open');
  assert.equal(live.spellsOutExitTicket, true);

  const waitingOnDol = {
    assignment: { id: 'w1', title: 'Domain and Range' },
    actionable: false,
    lesson: { nextOpening: { role: 'dol' } },
    waitText: 'Exit ticket opens at 10:38 AM',
  };
  const soon = resolveNextAction({ dashboard: { groups: { [BUCKET.DO_NOW]: [waitingOnDol] } } });
  assert.equal(soon.kind, 'assignedSoon');
  assert.equal(soon.spellsOutExitTicket, true);
  assert.equal(soon.detail, 'Domain and Range — Exit ticket (DOL) opens at 10:38 AM. My Math Path is open until then.');
  // Waiting on something else: nothing to spell out there.
  const other = resolveNextAction({ dashboard: { groups: { [BUCKET.DO_NOW]: [{ ...waitingOnDol, lesson: { nextOpening: { role: 'practice' } }, waitText: 'Practice opens when your teacher starts it in class' }] } } });
  assert.equal(other.spellsOutExitTicket, false);

  const home = executableSource(read('src/components/student/StudentDashboardView.jsx'));
  const pick = region(home, 'const exitTicketSpelledOutOn = (() => {', '})();', 'first mention');
  assert.match(pick, /alreadySpelledOut: Boolean\(nextAction\?\.spellsOutExitTicket\) \|\| secondaryDols\.length > 0/);
  assert.match(home, /studentSectionLabel\('dol', \{ spelledOut: spellsOutExitTicket \}\)/);
  // Every other section name on a card is the plain word.
  assert.equal(questionAddressLabel({ section: 'dol', number: 2 }), 'Exit ticket Question 2');
});

/* ---- HELP-24: copy that misleads ------------------------------------------ */

test('HELP-24: the closed card says closed once; the review neither repeats it nor points at an Ask that is gone', () => {
  assert.equal(closedAttemptText({ maximumAttempts: 3, reviewAvailable: true }), 'That was your last try (3 in all). The worked solution is below.');
  assert.equal(closedAttemptText({ maximumAttempts: 1 }), 'That was your only try.');
  const none = buildClosedQuestionReview({ question: { type: 'algebra', prompt: 'Solve.' }, wasCorrect: false });
  assert.equal(none.hasContent, false);
  assert.equal(none.intro, 'There is no worked solution for this question yet. Your teacher can go over it with you.');
  assert.doesNotMatch(none.intro, /\bAsk\b/);
});

test('HELP-24: the same answer again says what Submit costs; a partial result says "try"', () => {
  assert.equal(SAME_ANSWER_AGAIN, 'This is the same answer as your last try. Submitting it again uses another try.');
  const engine = executableSource(read('src/QuestionEngine.jsx'));
  const results = region(engine, '{sameIncorrectResponse && !isMultipart && !locked && (', ')}', 'same-answer line');
  assert.match(results, /\{SAME_ANSWER_AGAIN\}/);
  const record = { partGrades: [{ label: 'Slope', isCorrect: true }, { label: 'Intercept', isCorrect: false }] };
  assert.equal(partialCreditBreakdown(record), 'last try: 1 of 2 parts right — still to fix: Intercept');
});

/* ---- HELP-17: every hint offer says what it costs ------------------------- */

test('HELP-17: every "A hint is ready" offer is followed by the one cost sentence', () => {
  const engine = executableSource(read('src/QuestionEngine.jsx'));
  const offers = engine.split('A hint is ready if you want one.').slice(1);
  assert.ok(offers.length >= 3, `found ${offers.length} offers in QuestionEngine`);
  offers.forEach((after, index) => assert.match(after.slice(0, 60), /^ \{hintCostSentence\(hintCostNote\)\}/, `QuestionEngine offer ${index + 1}`));
  // The one-try line's hint button carries it too.
  const oneTry = region(engine, '{oneTryLine}', '</p>', 'one-try line');
  assert.match(oneTry, /hintState\.canRevealNext && <span data-hint-cost-note=""> \{hintCostSentence\(hintCostNote\)\}<\/span>/);
  const shell = executableSource(read('src/tools/shared/ToolShell.jsx'));
  const toolOffers = shell.split('A hint is ready if you want one.').slice(1);
  assert.equal(toolOffers.length, 1);
  // The host's sentence (Recovery's in a Recovery runner), else the platform's.
  assert.match(toolOffers[0].slice(0, 20), /^ \{cost\}/);
  const offer = region(shell, 'const OutcomeHintOffer = ', '\n};', 'the tool outcome offer');
  assert.match(offer, /const cost = typeof hintCost === 'string' && hintCost\.trim\(\) \? hintCost\.trim\(\) : HINT_COST_SENTENCE;/);
  assert.match(offer, /\{hint && similar \? <><span data-hint-cost-note="" style=\{\{ fontSize: 'calc\(12 \* var\(--mm-px\)\)' \}\}>\{cost\}<\/span>\{' '\}<\/> : null\}/, 'with both offers the cost is still said');
  assert.match(shell, /const hintCost = useToolRuntimeContext\(\)\.hintCost \|\| HINT_COST_SENTENCE;/);
  // No other wording of the cost is left.
  for (const path of ['src/QuestionEngine.jsx', 'src/tools/shared/ToolShell.jsx', 'src/platform/supports/hints/HintPanel.jsx', 'src/InteractiveGraphWorkspace.jsx']) {
    assert.doesNotMatch(executableSource(read(path)), /noted with your attempt|Recorded for your teacher/, path);
  }
});

/* ---- HELP-25: one glossary ------------------------------------------------ */

test('HELP-25: the dead multilingual overlay (its own 10-term glossary) is gone', () => {
  assert.throws(() => read('src/components/supports/MultilingualSupportOverlay.jsx'), /ENOENT/);
});
