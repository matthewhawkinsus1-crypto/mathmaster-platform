// WORK-PATTERN SIGNALS IN THE STUDENT CASE REVIEW
// (docs/platform/SHOWING_THE_PROCESS.md, section 7, "Signals as evidence").
//
// The case review shows what one signal cannot: how often each occurs among
// the questions answered, how the questions with one were marked beside those
// without, and where they occur. It is on the timeline and in the export, a
// reviewed signal stays in it, every showing says "not conclusive", and no
// narrative fact is written from a signal.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildStudentCaseReview } from '../../src/platform/caseReview/studentCaseReview.js';
import { SIGNAL_RECORDED_SECTIONS, buildWorkPatternSignals, workPatternTimelineEntries } from '../../src/platform/caseReview/workPatternSignals.js';
import { PRINT_SECTIONS, caseReviewJson, caseSignalsCsv } from '../../src/platform/caseReview/caseReviewExport.js';
import { FORBIDDEN_CONCLUSIONS, narrativeViolations, renderNarrativeTemplate } from '../../src/platform/caseReview/narrativeGuard.js';
import { fetchAttemptSignals } from '../../src/platform/caseReview/caseReviewStore.js';
import { TEACHER_NOTE_LABEL } from '../../src/platform/teacher/attemptSignalsView.js';
import { caseInputs } from './helpers/caseReviewFixture.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');

// The fixture's window is 2026-09-01 to 2026-10-12, with 33 answered questions
// across six assignments (4 Warm-Up, 13 Classwork, 8 Practice, 8 DOL).
const AT = Date.UTC(2026, 8, 22, 15, 5);
const signal = (assignmentId, questionIndex, kind, extra = {}) => ({
  id: `${assignmentId}__${questionIndex}__${kind}${kind === 'pasted' ? `__${extra.partIndex ?? 0}` : ''}`,
  schemaVersion: 1, studentId: 'S1', assignmentId, questionIndex, kind, attemptNumber: 1, recordedAt: AT + questionIndex * 60000, ...extra,
});
const SIGNALS = [
  signal('L3', 1, 'pasted', { partIndex: 1, activityRole: 'classwork', duringClass: true, supports: ['extra-time'] }),
  signal('L3', 2, 'pasted', { partIndex: 0, activityRole: 'classwork', duringClass: true, supports: ['extra-time'] }),
  signal('L3', 2, 'leftThenRight', { partCount: 3, awaySeconds: 40, activityRole: 'classwork', duringClass: true, supports: ['extra-time'] }),
  signal('L4', 6, 'pasted', { partIndex: 0, activityRole: 'dol', duringClass: false, supports: [] }),
  signal('L4', 4, 'hardFirstTry', { partCount: 2, difficultyBand: 4, activityRole: 'practice', recordedAt: Date.UTC(2026, 8, 29, 23, 30), dismissedAt: Date.UTC(2026, 8, 30, 14), dismissedByEmail: 'teacher.a@example.test', reviewNote: 'Asked her to show the steps; she did.' }),
  signal('L5', 1, 'pasted', { partIndex: 0, activityRole: 'classwork' }),
  // Outside the case: another assignment, and a kind this build does not know.
  signal('OTHER', 0, 'pasted', { partIndex: 0 }),
  signal('L3', 3, 'keystrokes', {}),
];

// Signals have been recorded for this student since before the window (an
// earlier signal is on record), so every dated answer in it is counted.
const RECORDED_SINCE = Date.UTC(2026, 8, 1, 14);
const model = buildStudentCaseReview({ ...caseInputs(), attemptSignals: SIGNALS, attemptSignalsMeta: { firstRecordedAtMs: RECORDED_SINCE, capped: false, max: 500 } });
const section = model.workPatterns;

test('the section counts recorded signals over the questions answered in the window', () => {
  assert.equal(section.title, 'Work-pattern signals');
  assert.equal(section.loaded, true);
  assert.equal(section.total, 6, 'six signals on the case\'s assignments; the unknown kind and the other assignment are left out');
  assert.equal(section.answeredQuestions, 33);
  const pasted = section.frequency.find((row) => row.kind === 'pasted');
  assert.deepEqual([pasted.signals, pasted.questions, pasted.answered, pasted.share], [4, 4, 33, 12]);
  assert.equal(pasted.line, 'Pasted into a math box on 4 of 33 answered questions.');
  const left = section.frequency.find((row) => row.kind === 'leftThenRight');
  assert.equal(left.line, 'Left the page, then a burst of right parts on 1 of 33 answered questions.');
  assert.deepEqual(section.frequency.map((row) => row.kind), ['leftThenRight', 'pasted', 'hardFirstTry']);
});

test('how the questions with a signal were marked, beside those without: counts, never why', () => {
  const { withSignal, withoutSignal } = section.comparison;
  // Five questions carry a signal (L3 Q2 and Q3, L4 Q5 and Q7, L5 Q2).
  assert.deepEqual([withSignal.answered, withSignal.firstAttemptCorrect, withSignal.firstAttemptAccuracy, withSignal.finalCreditAverage], [5, 4, 80, 80]);
  assert.deepEqual([withoutSignal.answered, withoutSignal.firstAttemptCorrect, withoutSignal.firstAttemptAccuracy, withoutSignal.finalCreditAverage], [28, 19, 68, 87]);
  assert.ok(section.lines.includes('First-attempt correct: 80% on the 5 answered questions with a signal, 68% on the 28 without one.'));
  // No line explains, concludes or names a motive.
  for (const line of [...section.lines, section.note, ...section.limitations]) {
    assert.doesNotMatch(line, /cheat|dishonest|integrity|suspicious|copied|because|caused|proves?\b|\bAI\b/i, line);
  }
});

test('where they occur: by section, beside the DOL and instructional sections, and in or outside class time', () => {
  const by = Object.fromEntries(section.bySection.map((row) => [row.key, row]));
  assert.deepEqual([by.classwork.answered, by.classwork.questionsWithSignal, by.classwork.signals, by.classwork.byKind.pasted, by.classwork.byKind.leftThenRight], [13, 3, 4, 3, 1]);
  assert.deepEqual([by.dol.answered, by.dol.questionsWithSignal, by.dol.byKind.pasted], [8, 1, 1]);
  assert.deepEqual([by.practice.questionsWithSignal, by.practice.byKind.hardFirstTry], [1, 1]);
  assert.equal(by.warmup.questionsWithSignal, 0);
  assert.deepEqual(section.bySection.map((row) => row.key), ['warmup', 'classwork', 'practice', 'dol']);
  // Class time is what each record says. A record the bell schedule could
  // not answer for is its own count, "not known": never added to "outside".
  assert.deepEqual(section.classTime, { during: 3, outside: 1, notKnown: 2 });
  assert.ok(section.lines.includes("Class time: 3 during the class's scheduled time, 1 outside it, 2 not known."), section.lines.join('\n'));
  assert.equal(section.entries.find((entry) => entry.id === 'L5__1__pasted__0').classTime, 'Class time not known');
  assert.ok(section.limitations.some((line) => /reads "Class time not known", never "outside"/.test(line)));
  const tab = executableSource(read('src/components/teacher/caseReview/CaseSignalsTab.jsx'));
  assert.match(tab, /\{section\.classTime\.outside\} outside it, \{section\.classTime\.notKnown\} not known/);
  assert.doesNotMatch(tab, /notRecorded|Class time not recorded/);
});

test('a reviewed signal stays in the record, with who reviewed it and their note', () => {
  assert.deepEqual([section.reviewed, section.needsReview], [1, 5]);
  const reviewed = section.entries.find((entry) => entry.kind === 'hardFirstTry');
  assert.deepEqual([reviewed.reviewed, reviewed.reviewedBy, reviewed.reviewNote], [true, 'teacher.a@example.test', 'Asked her to show the steps; she did.']);
  assert.ok(section.lines.includes('1 of 6 reviewed by a teacher; 5 not yet reviewed.'));
  // "What needs attention?" counts only the ones nobody has reviewed.
  assert.deepEqual(model.attention.signalsToReview, { loaded: true, count: 5, total: 6 });
  assert.match(model.attention.rules.signalsToReview, /not conclusive/i);
});

test('each entry carries what happened, when, which part, class time and the supports in effect', () => {
  const entry = section.entries.find((item) => item.id === 'L3__1__pasted__1');
  assert.equal(entry.questionLabel, 'Classwork Q1');
  assert.equal(entry.partIndex, 1);
  assert.match(entry.facts, /part 2/);
  assert.equal(entry.recordedAtMs, AT + 60000);
  assert.equal(entry.classTime, "During the class's scheduled time");
  assert.deepEqual(entry.supportIds, ['extra-time']);
  assert.equal(entry.outcomeLabel, model.questions.find((row) => row.assignmentId === 'L3' && row.storageIndex === 1).outcomeLabel);
  // Oldest first: the order things happened.
  const times = section.entries.map((item) => item.recordedAtMs);
  assert.deepEqual(times, [...times].sort((a, b) => a - b));
});

test('on the case timeline, as its own kind and group, labelled not conclusive', () => {
  const onTimeline = model.timeline.entries.filter((entry) => entry.kind === 'work-pattern-signal');
  assert.equal(onTimeline.length, 6);
  for (const entry of onTimeline) {
    assert.equal(entry.group, 'signals');
    assert.match(entry.label, /^Work-pattern signal: .+ \(not conclusive\)$/);
    assert.ok(entry.dateKey, 'placed on a school day');
  }
  const reviewed = onTimeline.find((entry) => /Right first time/.test(entry.label));
  // Who reviewed it is a recorded fact; the note is the teacher's own words,
  // under its own heading and labelled.
  assert.deepEqual(reviewed.details.at(-2), { label: 'Review', value: 'Reviewed by teacher.a@example.test' });
  assert.deepEqual(reviewed.details.at(-1), { label: "Teacher's note (the teacher's own words)", value: 'Asked her to show the steps; she did.', note: TEACHER_NOTE_LABEL });
  assert.doesNotMatch(`${reviewed.label} ${reviewed.detail}`, /Asked her/);
  assert.equal(model.timeline.total, buildStudentCaseReview(caseInputs()).timeline.total + 6);
  // The timeline tab can show only these.
  assert.match(executableSource(read('src/components/teacher/caseReview/CaseTimelineTab.jsx')), /\{ key: 'signals', label: 'Work-pattern signals' \}/);
  assert.equal(workPatternTimelineEntries(null).length, 0);
});

test('in the export: a CSV row per signal, the print section, and the JSON, each saying not conclusive', () => {
  const lines = caseSignalsCsv(model).trim().split('\r\n');
  assert.equal(lines.length, 1 + 6);
  assert.match(lines[0], /^Not conclusive,Signal,Recorded at,Assignment,Assignment ID,Section,Question,Part,Attempt,What was recorded,During class time,Supports in effect,Question outcome,Reviewed,Reviewed by,Reviewed at,"Teacher note \(teacher-authored: the teacher's own words, not a recorded fact\)"$/);
  for (const line of lines.slice(1)) assert.match(line, /^Not conclusive,/);
  const reviewedRow = lines.find((line) => /Right first time/.test(line));
  assert.match(reviewedRow, /,yes,teacher\.a@example\.test,2026-09-30T14:00:00\.000Z,Asked her to show the steps; she did\.$/);
  const noContext = lines.find((line) => /,L5,/.test(line));
  assert.match(noContext, /,not known,not recorded,/, 'class time the schedule could not answer for is "not known"; supports not handed over are "not recorded"');
  assert.equal(PRINT_SECTIONS.find((entry) => entry.key === 'signals').title, '13. Work-pattern signals (not conclusive)');
  const printed = executableSource(read('src/components/teacher/caseReview/CasePrintView.jsx'));
  assert.match(region(printed, '<section data-print-work-patterns>', '</section>', 'the printed section'), /model\.workPatterns\.note/);
  // The print keeps the teacher's note apart from the facts, under the label.
  const printedSection = region(printed, '<section data-print-work-patterns>', '</section>', 'the printed section');
  assert.match(printedSection, /\{entry\.reviewNote \? <><br \/><em>\{entry\.reviewNoteLabel\}<\/em><br \/>\{entry\.reviewNote\}<\/> : null\}/);
  assert.doesNotMatch(printedSection, /\$\{entry\.reviewNote/, 'never run into the generated sentence');
  const json = JSON.parse(caseReviewJson(model));
  const jsonReviewed = json.workPatterns.entries.find((entry) => entry.kind === 'hardFirstTry');
  assert.deepEqual([jsonReviewed.reviewNote, jsonReviewed.reviewNoteLabel], ['Asked her to show the steps; she did.', TEACHER_NOTE_LABEL]);
  assert.ok(json.workPatterns.entries.filter((entry) => !entry.reviewNote).every((entry) => entry.reviewNoteLabel === ''));
  // No count or line the section builds is written from the note.
  assert.doesNotMatch(JSON.stringify({ ...json.workPatterns, entries: [] }), /Asked her/);
  assert.equal(json.workPatterns.total, 6);
  assert.equal(json.workPatterns.notConclusive, 'Not conclusive');
  // The view offers the tab and the download.
  const view = executableSource(read('src/components/teacher/caseReview/StudentCaseReviewView.jsx'));
  assert.match(view, /\{ key: 'signals', label: 'Work-pattern signals' \}/);
  assert.match(view, /case 'signals': return <CaseSignalsTab model=\{model\} onOpenQuestion=\{openQuestion\} \/>;/);
  assert.match(view, /if \(kind === 'signals'\) download\(caseSignalsCsv\(model\)/);
});

test('no narrative fact is written from a signal, and no template may state a conclusion about integrity', () => {
  const without = buildStudentCaseReview(caseInputs());
  assert.deepEqual(model.narrativeFacts, without.narrativeFacts, 'the facts for a teacher\'s narrative are the same with and without signals');
  const facts = executableSource(read('src/platform/caseReview/narrativeFacts.js'));
  assert.doesNotMatch(facts, /workPatterns|attemptSignals|work-pattern|worth a conversation/i, 'narrativeFacts.js never reads the signals');
  // The model builds its narrative facts from the model, so the section being on it is safe only because of the line above.
  assert.ok(FORBIDDEN_CONCLUSIONS.some((rule) => rule.id === 'integrity-conclusion'));
  for (const sentence of [
    'The student cheated on {count} questions.',
    'These answers were copied.',
    '{count} answers were written using AI.',
    'This work is AI-generated.',
    'The pattern raises an academic integrity concern.',
    'This is not the student\'s own work.',
    'She had unauthorized help on the DOL.',
    'The record shows plagiarism.',
  ]) {
    assert.ok(narrativeViolations(sentence).some((violation) => violation.id === 'integrity-conclusion'), sentence);
    assert.throws(() => renderNarrativeTemplate(sentence, { count: 3 }), /forbidden conclusion/);
  }
  // A plain count of records is still sayable.
  assert.deepEqual(narrativeViolations('A paste into a math box was recorded on {count} of {answered} answered questions.'), []);
  // Nothing the section itself says trips the guard's integrity rule.
  for (const line of [...section.lines, section.note, ...section.entries.map((entry) => `${entry.title}. ${entry.facts}`)]) {
    assert.ok(!narrativeViolations(line).some((violation) => violation.id === 'integrity-conclusion'), line);
  }
});

test('not loaded is said as not loaded, and no signals as none: neither is a finding', () => {
  const notLoaded = buildStudentCaseReview(caseInputs()).workPatterns;
  assert.deepEqual([notLoaded.loaded, notLoaded.total, notLoaded.lines.length], [false, 0, 0]);
  assert.equal(buildStudentCaseReview(caseInputs()).dataSources.attemptSignals.loaded, false);
  assert.equal(buildStudentCaseReview(caseInputs()).attention.signalsToReview.loaded, false);
  const none = buildStudentCaseReview({ ...caseInputs(), attemptSignals: [] }).workPatterns;
  // With no signal on record at all there is no date to count answers from:
  // nothing is counted, and the section says why.
  assert.deepEqual([none.loaded, none.total, none.answeredQuestions, none.denominator.allAnswered], [true, 0, 0, 33]);
  assert.match(none.denominator.words, /^No signal is on record for this student/);
  assert.deepEqual(model.dataSources.attemptSignals.count, SIGNALS.length);
  assert.ok(none.limitations.some((line) => /a question with no signal is not a question where nothing happened/.test(line)));
  // Outside the case's window: left out.
  const windowed = buildWorkPatternSignals({ signals: SIGNALS, questions: model.questions, assignments: model.assignments, fromMs: AT + 90000, toMs: AT + 4 * 60000 });
  assert.deepEqual(windowed.entries.map((entry) => entry.id), ['L3__2__leftThenRight', 'L3__2__pasted__0']);
});

test('the denominator is only the answers where a signal could have been recorded, and it says so', () => {
  // With an earlier signal on record, all 33 dated classroom answers count.
  assert.deepEqual([section.denominator.answered, section.denominator.allAnswered, section.denominator.recordedSinceMs], [33, 33, RECORDED_SINCE]);
  assert.deepEqual(section.denominator.leftOut, { otherSections: 0, beforeRecording: 0, noTime: 0, outsideWindow: 0 });
  assert.equal(section.denominator.words, 'Counted out of 33 answered Warm-Up, Classwork, Practice and DOL questions, last answered on or after Sep 1, 2026 (the first signal on record for this student).');
  assert.ok(section.lines.includes(section.denominator.words), 'the lines say what the counts are out of');

  // Without one, the first signal on record is the earliest loaded: 22 Sep,
  // 15:05 UTC (it is on another assignment, outside the case, and still shows
  // signals were being recorded by then). The fixture's answers before it (all of L1, and L2 but for the
  // Practice question answered on the 23rd) are left out, not read as "no signal".
  const fromFirst = buildStudentCaseReview({ ...caseInputs(), attemptSignals: SIGNALS }).workPatterns;
  const firstSignal = AT;
  const expected = model.questions.filter((row) => row.totalAttempts > 0 && row.lastAttemptAtMs >= firstSignal);
  assert.equal(expected.length, 18);
  assert.deepEqual([fromFirst.denominator.answered, fromFirst.denominator.recordedSinceMs, fromFirst.denominator.leftOut.beforeRecording], [18, firstSignal, 15]);
  assert.match(fromFirst.denominator.words, /^Counted out of 18 answered .+ on or after Sep 22, 2026 \(the first signal on record for this student\)\. Left out: 15 answered before then\.$/);
  assert.equal(fromFirst.frequency.find((row) => row.kind === 'pasted').line, 'Pasted into a math box on 4 of 18 answered questions.');
  assert.deepEqual([fromFirst.comparison.withSignal.answered, fromFirst.comparison.withoutSignal.answered], [5, 13]);

  // A Test, a Review, Recovery, and an answer with no recorded time are never in it.
  const rows = [
    ...model.questions,
    { ...expected[0], assignmentId: 'L4', storageIndex: 90, section: 'test' },
    { ...expected[0], assignmentId: 'L4', storageIndex: 91, section: 'corrections' },
    { ...expected[0], assignmentId: 'L4', storageIndex: 92, recoveredLate: true },
    { ...expected[0], assignmentId: 'L4', storageIndex: 93, lastAttemptAtMs: null },
  ];
  const mixed = buildWorkPatternSignals({ signals: SIGNALS, questions: rows, assignments: model.assignments, signalsMeta: { firstRecordedAtMs: RECORDED_SINCE } });
  assert.deepEqual([mixed.denominator.answered, mixed.denominator.allAnswered], [33, 37]);
  assert.deepEqual(mixed.denominator.leftOut, { otherSections: 3, beforeRecording: 0, noTime: 1, outsideWindow: 0 });
  assert.match(mixed.denominator.words, /Left out: 3 in Quizzes, Tests, Review, Corrections or Recovery; 1 with no recorded time\.$/);
  assert.ok(section.limitations.some((line) => /Counts are out of the answered questions where a signal could have been recorded/.test(line)));
});

test('month by month: the answers counted, and how many carry a signal', () => {
  // September: L1, L2 and L3 (24 answers); October: L4 and L5 (9).
  assert.deepEqual(section.byMonth.map((row) => [row.key, row.label, row.answered, row.questionsWithSignal, row.signals]), [
    ['2026-09', 'September 2026', 24, 2, 3],
    ['2026-10', 'October 2026', 9, 3, 3],
  ]);
  assert.deepEqual(section.byMonth[0].byKind, { leftThenRight: 1, pasted: 2, hardFirstTry: 0 });
  assert.deepEqual(section.byMonth[1].byKind, { leftThenRight: 0, pasted: 2, hardFirstTry: 1 });
  assert.equal(section.byMonth[0].line, 'September 2026: a signal on 2 of 24 answers (left the page, then a burst of right parts on 1; pasted into a math box on 2).');
  assert.ok(section.lines.includes(section.byMonth[1].line));
  // The months add up to the denominator.
  assert.equal(section.byMonth.reduce((sum, row) => sum + row.answered, 0), section.denominator.answered);
  // The school's calendar decides the month: 04:30 UTC on 1 Oct is still 30 Sep at school.
  const lateEvening = buildWorkPatternSignals({
    signals: [signal('L3', 1, 'pasted', { partIndex: 0, recordedAt: Date.UTC(2026, 8, 30, 20) })],
    questions: [{ ...model.questions.find((row) => row.assignmentId === 'L3' && row.storageIndex === 1), lastAttemptAtMs: Date.UTC(2026, 9, 1, 4, 30) }],
    assignments: model.assignments,
  });
  assert.deepEqual(lateEvening.byMonth.map((row) => [row.key, row.answered, row.questionsWithSignal]), [['2026-09', 1, 1]]);
  const tab = executableSource(read('src/components/teacher/caseReview/CaseSignalsTab.jsx'));
  assert.match(tab, /<table className="cr-table" aria-label="Signals by month" data-case-signal-months>/);
  assert.match(tab, /<p className="cr-note" data-case-signal-denominator>\{section\.denominator\.words\}<\/p>/);
});

test('when the window held more signals than were loaded, the section says so', () => {
  const capped = buildStudentCaseReview({ ...caseInputs(), attemptSignals: SIGNALS, attemptSignalsMeta: { firstRecordedAtMs: RECORDED_SINCE, capped: true, max: 500 } }).workPatterns;
  assert.equal(capped.capped, true);
  assert.equal(capped.cappedNote, 'Only the newest 500 signals in this window were loaded; older ones in the window are not counted here.');
  assert.equal(capped.lines[0], capped.cappedNote);
  assert.deepEqual([section.capped, section.cappedNote], [false, '']);
  // Said once: it is the first of the section's lines, which the tab and the
  // print both draw, and the tab does not draw it a second time.
  assert.equal(capped.lines.filter((line) => line === capped.cappedNote).length, 1);
  const tab = executableSource(read('src/components/teacher/caseReview/CaseSignalsTab.jsx'));
  assert.doesNotMatch(tab, /cappedNote/);
  assert.match(tab, /\{section\.lines\.map\(\(line\) => <li key=\{line\}>\{line\}<\/li>\)\}/);
});

test('every signal the section shows is one its counts can hold: the recorder and the denominator share their sections', () => {
  // A paste on a Corrections question and a hard first try on Classwork. The
  // recorder writes only the second (attemptSignalFacts.test.mjs); a record
  // from another section, however it got there, is not shown beside counts
  // that cannot hold it ("2 signals", "pasted on 0 of 1 answers").
  const classwork = model.questions.find((row) => row.assignmentId === 'L3' && row.storageIndex === 1);
  const corrections = { ...classwork, storageIndex: 80, section: 'corrections', sectionLabel: 'Corrections' };
  const two = buildWorkPatternSignals({
    signals: [
      signal('L3', 80, 'pasted', { partIndex: 0, activityRole: 'corrections' }),
      signal('L3', 1, 'hardFirstTry', { partCount: 1, difficultyBand: 3, activityRole: 'classwork' }),
    ],
    questions: [classwork, corrections],
    assignments: model.assignments,
    signalsMeta: { firstRecordedAtMs: RECORDED_SINCE },
  });
  assert.equal(two.total, 1);
  assert.deepEqual(two.entries.map((entry) => entry.kind), ['hardFirstTry']);
  assert.deepEqual([two.denominator.answered, two.denominator.leftOut.otherSections], [1, 1]);
  assert.equal(two.frequency.find((row) => row.kind === 'pasted').signals, 0);
  assert.ok(two.lines.includes('Right first time on a hard question with no tool work on 1 of 1 answered question.'));
  assert.ok(!two.lines.some((line) => /on 0 of 1/.test(line)), two.lines.join('\n'));
  // Every entry of the fixture's section is on a counted section.
  assert.ok(section.entries.every((entry) => SIGNAL_RECORDED_SECTIONS.includes(entry.section)));
});

test('the answers counted are the window\'s, as the signals are', () => {
  // Pasted into and answered on 2 Nov; the window starts on 15 Nov. Neither
  // the signal nor the answer is in the window, so the answer is not counted
  // as "an answer without a signal".
  const base = model.questions.find((row) => row.assignmentId === 'L3' && row.storageIndex === 1);
  const before = { ...base, storageIndex: 1, lastAttemptAtMs: Date.UTC(2026, 10, 2, 15) };
  const inside = { ...base, storageIndex: 2, lastAttemptAtMs: Date.UTC(2026, 10, 17, 15) };
  const after = { ...base, storageIndex: 3, lastAttemptAtMs: Date.UTC(2026, 11, 3, 15) };
  const windowed = buildWorkPatternSignals({
    signals: [
      signal('L3', 1, 'pasted', { partIndex: 0, activityRole: 'classwork', recordedAt: Date.UTC(2026, 10, 2, 14, 55) }),
      signal('L3', 2, 'pasted', { partIndex: 0, activityRole: 'classwork', recordedAt: Date.UTC(2026, 10, 17, 14, 55) }),
    ],
    questions: [before, inside, after],
    assignments: model.assignments,
    fromMs: Date.UTC(2026, 10, 15),
    toMs: Date.UTC(2026, 10, 30),
    signalsMeta: { firstRecordedAtMs: Date.UTC(2026, 10, 2, 14, 55) },
  });
  assert.deepEqual([windowed.total, windowed.denominator.answered, windowed.denominator.leftOut.outsideWindow], [1, 1, 2]);
  assert.deepEqual([windowed.comparison.withSignal.answered, windowed.comparison.withoutSignal.answered], [1, 0]);
  assert.equal(windowed.frequency.find((row) => row.kind === 'pasted').line, 'Pasted into a math box on 1 of 1 answered question.');
  assert.match(windowed.denominator.words, /Left out: 2 answered outside this window\.$/);
  assert.deepEqual(windowed.byMonth.map((row) => [row.key, row.answered]), [['2026-11', 1]]);
});

test('the loader asks for the case\'s own window, one past the cap, and the earliest signal on record', async () => {
  const calls = [];
  const stamp = (ms) => ({ toMillis: () => ms });
  const docs = (rows) => ({ docs: rows.map((row) => ({ id: row.id, data: () => row })) });
  const store = {
    collection: (...segments) => segments.slice(1).join('/'),
    where: (field, op, value) => ['where', field, op, value.getTime()],
    orderBy: (field, direction) => ['orderBy', field, direction],
    limit: (count) => ['limit', count],
    query: (path, ...parts) => ({ path, parts }),
    getDocs: async (asked) => {
      calls.push(asked);
      const ascending = asked.parts.some((part) => part[0] === 'orderBy' && part[2] === 'asc');
      if (ascending) return docs([{ id: 'first', recordedAt: stamp(1000) }]);
      const max = asked.parts.find((part) => part[0] === 'limit')[1];
      return docs(Array.from({ length: Math.min(max, 4) }, (unused, index) => ({ id: `s${index}`, recordedAt: stamp(9000 - index) })));
    },
  };
  const within = await fetchAttemptSignals({ db: {}, studentId: 'S1', fromMs: 5000, toMs: 9000, max: 10, store });
  assert.deepEqual([within.signals.length, within.capped, within.firstRecordedAtMs, within.max], [4, false, 1000, 10]);
  assert.deepEqual(calls[0], { path: 'grades/S1/attemptSignals', parts: [['where', 'recordedAt', '>=', 5000], ['where', 'recordedAt', '<=', 9000], ['orderBy', 'recordedAt', 'desc'], ['limit', 11]] });
  assert.deepEqual(calls[1], { path: 'grades/S1/attemptSignals', parts: [['orderBy', 'recordedAt', 'asc'], ['limit', 1]] });
  // Four in the window with room for three: three are kept, and the page is told there were more.
  const over = await fetchAttemptSignals({ db: {}, studentId: 'S1', fromMs: 5000, toMs: 9000, max: 3, store });
  assert.deepEqual([over.signals.map((row) => row.id), over.capped], [['s0', 's1', 's2'], true]);
  assert.deepEqual(await fetchAttemptSignals({ db: null, studentId: 'S1', store }), { signals: [], firstRecordedAtMs: null, capped: false, max: 500 });
});

test("the case review reads the student's signals itself, reviewed ones included, and degrades to not loaded", () => {
  const store = executableSource(read('src/platform/caseReview/caseReviewStore.js'));
  const fetch = region(store, 'export const fetchAttemptSignals', '};', 'fetchAttemptSignals');
  assert.doesNotMatch(fetch, /dismissedAt/, 'reviewed signals are read too');
  assert.match(store, /fetchAttemptSignals\(\{ db, studentId, fromMs: window\.fromMs, toMs: window\.toMs \}\),/);
  assert.match(store, /attemptSignals: signals\.status === 'fulfilled' \? signals\.value\.signals : undefined,/);
  assert.match(store, /attemptSignalsMeta: signals\.status === 'fulfilled' \? \{ firstRecordedAtMs: signals\.value\.firstRecordedAtMs, capped: signals\.value\.capped, max: signals\.value\.max \} : null,/);
  assert.match(executableSource(read('src/components/teacher/caseReview/StudentCaseReviewView.jsx')), /attemptSignalsMeta: records\.attemptSignalsMeta,/);
  assert.match(executableSource(read('src/components/teacher/caseReview/StudentCaseReviewView.jsx')), /attemptSignals: records\.attemptSignals,/);
});

test('through the case review itself: the window the teacher chose bounds the answers counted and the signals shown', () => {
  // The teacher ends the case on 22 Sep. L1 and L2 are in it, and one L2
  // Practice question was last answered on the 23rd, after the window. The
  // signals are handed over unbounded, as a read that ignored the window would.
  const selection = { gradingPeriodId: 'mp2', gradingPeriodLabel: '2nd Marking Period', fromDateKey: '2026-09-01', toDateKey: '2026-09-22' };
  const at = (text) => Date.parse(text);
  const lateAnswer = buildStudentCaseReview({ ...caseInputs(), selection }).questions.find((row) => row.assignmentId === 'L2' && row.lastAttemptAtMs > at('2026-09-23T00:00:00-05:00'));
  assert.ok(lateAnswer, 'the fixture has an L2 answer after the window');
  const inside = signal('L2', 1, 'pasted', { partIndex: 0, activityRole: 'classwork', recordedAt: at('2026-09-22T09:14:00-05:00') });
  // The last day runs to its end in the school's zone; the next morning is outside.
  const lastEvening = signal('L2', 2, 'pasted', { partIndex: 0, activityRole: 'classwork', recordedAt: at('2026-09-22T21:30:00-05:00') });
  const nextMorning = signal('L2', lateAnswer.storageIndex, 'pasted', { partIndex: 0, activityRole: 'practice', recordedAt: at('2026-09-23T00:30:00-05:00') });
  const narrowed = buildStudentCaseReview({ ...caseInputs(), selection, attemptSignals: [inside, lastEvening, nextMorning], attemptSignalsMeta: { firstRecordedAtMs: RECORDED_SINCE, capped: false, max: 500 } });
  assert.deepEqual([narrowed.meta.fromDateKey, narrowed.meta.toDateKey], ['2026-09-01', '2026-09-22']);
  const patterns = narrowed.workPatterns;
  const answered = narrowed.questions.filter((row) => row.totalAttempts > 0);
  assert.equal(answered.length, 16);
  // A signal outside the window is not counted or shown.
  assert.deepEqual(patterns.entries.map((entry) => entry.id), [inside.id, lastEvening.id]);
  assert.equal(patterns.total, 2);
  // An answer outside the window is counted as left out, not as an answer with no signal.
  assert.deepEqual([patterns.denominator.answered, patterns.denominator.leftOut.outsideWindow], [15, 1]);
  assert.match(patterns.denominator.words, /Left out: 1 answered outside this window\.$/);
  assert.equal(patterns.frequency.find((row) => row.kind === 'pasted').line, 'Pasted into a math box on 2 of 15 answered questions.');
  assert.deepEqual([patterns.comparison.withSignal.answered, patterns.comparison.withoutSignal.answered], [2, 13]);
});
