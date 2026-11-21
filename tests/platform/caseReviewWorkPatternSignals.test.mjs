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
import { buildWorkPatternSignals, workPatternTimelineEntries } from '../../src/platform/caseReview/workPatternSignals.js';
import { PRINT_SECTIONS, caseReviewJson, caseSignalsCsv } from '../../src/platform/caseReview/caseReviewExport.js';
import { FORBIDDEN_CONCLUSIONS, narrativeViolations, renderNarrativeTemplate } from '../../src/platform/caseReview/narrativeGuard.js';
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

const model = buildStudentCaseReview({ ...caseInputs(), attemptSignals: SIGNALS });
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
  // Class time is what each record says, and "not recorded" is its own count.
  assert.deepEqual(section.classTime, { during: 3, outside: 1, notRecorded: 2 });
  assert.ok(section.lines.includes("3 recorded during the class's scheduled time, 1 outside it, 2 with no class time recorded."));
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
  assert.deepEqual(reviewed.details.at(-1), { label: 'Review', value: 'Reviewed by teacher.a@example.test: Asked her to show the steps; she did.' });
  assert.equal(model.timeline.total, buildStudentCaseReview(caseInputs()).timeline.total + 6);
  // The timeline tab can show only these.
  assert.match(executableSource(read('src/components/teacher/caseReview/CaseTimelineTab.jsx')), /\{ key: 'signals', label: 'Work-pattern signals' \}/);
  assert.equal(workPatternTimelineEntries(null).length, 0);
});

test('in the export: a CSV row per signal, the print section, and the JSON, each saying not conclusive', () => {
  const lines = caseSignalsCsv(model).trim().split('\r\n');
  assert.equal(lines.length, 1 + 6);
  assert.match(lines[0], /^Not conclusive,Signal,Recorded at,Assignment,Assignment ID,Section,Question,Part,Attempt,What was recorded,During class time,Supports in effect,Question outcome,Reviewed,Reviewed by,Reviewed at,Teacher note$/);
  for (const line of lines.slice(1)) assert.match(line, /^Not conclusive,/);
  const reviewedRow = lines.find((line) => /Right first time/.test(line));
  assert.match(reviewedRow, /,yes,teacher\.a@example\.test,2026-09-30T14:00:00\.000Z,Asked her to show the steps; she did\.$/);
  const noContext = lines.find((line) => /,L5,/.test(line));
  assert.match(noContext, /,not recorded,not recorded,/);
  assert.equal(PRINT_SECTIONS.find((entry) => entry.key === 'signals').title, '13. Work-pattern signals (not conclusive)');
  const printed = executableSource(read('src/components/teacher/caseReview/CasePrintView.jsx'));
  assert.match(region(printed, '<section data-print-work-patterns>', '</section>', 'the printed section'), /model\.workPatterns\.note/);
  const json = JSON.parse(caseReviewJson(model));
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
  assert.deepEqual([none.loaded, none.total, none.answeredQuestions], [true, 0, 33]);
  assert.deepEqual(model.dataSources.attemptSignals.count, SIGNALS.length);
  assert.ok(none.limitations.some((line) => /a question with no signal is not a question where nothing happened/.test(line)));
  // Outside the case's window: left out.
  const windowed = buildWorkPatternSignals({ signals: SIGNALS, questions: model.questions, assignments: model.assignments, fromMs: AT + 90000, toMs: AT + 4 * 60000 });
  assert.deepEqual(windowed.entries.map((entry) => entry.id), ['L3__2__leftThenRight', 'L3__2__pasted__0']);
});

test("the case review reads the student's signals itself, reviewed ones included, and degrades to not loaded", () => {
  const store = executableSource(read('src/platform/caseReview/caseReviewStore.js'));
  const fetch = region(store, 'export const fetchAttemptSignals', '};', 'fetchAttemptSignals');
  assert.match(fetch, /query\(collection\(db, 'grades', id, 'attemptSignals'\), orderBy\('recordedAt', 'desc'\), limit\(max\)\)/);
  assert.doesNotMatch(fetch, /dismissedAt|where\(/, 'reviewed signals are read too');
  assert.match(store, /attemptSignals: signals\.status === 'fulfilled' \? signals\.value : undefined,/);
  assert.match(executableSource(read('src/components/teacher/caseReview/StudentCaseReviewView.jsx')), /attemptSignals: records\.attemptSignals,/);
});
