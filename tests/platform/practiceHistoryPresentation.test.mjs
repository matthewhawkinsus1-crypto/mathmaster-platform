/*
 * PRACTICE HISTORY IN A STUDENT'S WORDS (student push D, item 6).
 *
 * The log showed raw support ids — "textToSpeech", "mathScaffold", even
 * "modification:reduce-complexity", which a student surface must never say —
 * and stopped silently at the 300 most recent answers. These tests pin the
 * names (from the support catalog's student labels), the hidden ones, the
 * honest cap notice and the summary by week, and the wiring that shows them.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PRACTICE_HISTORY_EVENT_LIMIT,
  practiceHistoryCapNotice,
  studentAttemptLabel,
  studentSupportName,
  studentSupportNames,
  summarizePracticeByWeek,
} from '../../src/platform/mastery/practiceHistoryPresentation.js';
import { buildStudentEvidenceTimeline } from '../../src/platform/history/evidenceTimelineService.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('supports are named the way the student saw them, whichever id the record used', () => {
  // The Path records canonical ids; assignments record catalog ids.
  assert.equal(studentSupportName('textToSpeech'), 'Read aloud');
  assert.equal(studentSupportName('text-to-speech'), 'Read aloud');
  assert.equal(studentSupportName('glossary'), 'Vocabulary');
  assert.equal(studentSupportName('translation'), 'Translate');
  assert.equal(studentSupportName('chunkedDirections'), 'Break it down');
  // Help with the mathematics, recorded per attempt.
  assert.equal(studentSupportName('hint'), 'Hint');
  assert.equal(studentSupportName('workedExample'), 'Worked steps');
  assert.equal(studentSupportName('mathScaffold'), 'Step-by-step help');
  assert.equal(studentSupportName('contextScaffold'), 'Help understanding the problem');
  assert.equal(studentSupportName('teacherAssistance'), 'Help from your teacher');
  assert.deepEqual(studentSupportNames(['textToSpeech', 'text-to-speech', 'hint']), ['Read aloud', 'Hint']);
});

test('a modification, a support with no student name, or an unknown id is never shown', () => {
  assert.equal(studentSupportName('modification:reduce-complexity'), null);
  assert.equal(studentSupportName('extra-time'), null, 'applied by the platform, never a tool the student sees');
  assert.equal(studentSupportName('algebraAutoApply'), null);
  assert.equal(studentSupportName('declutter'), null);
  assert.equal(studentSupportName('somethingThisBuildDoesNotKnow'), null);
  assert.equal(studentSupportName(''), null);
  assert.equal(studentSupportName(null), null);
  assert.equal(studentSupportName('toString'), null, 'object prototype names are not support names');
});

test('a real evidence event, through the real timeline, reads in student words only', () => {
  const report = buildStudentEvidenceTimeline([{
    eventKey: 'e1', occurredAt: Date.parse('2026-10-06T15:00:00Z'), alignmentKeys: ['texas:A.5A'],
    source: { activityRole: 'practice' }, performance: { score: 1, isCorrect: true, attemptNumber: 1 },
    supportUsage: { modified: true, modifications: ['reduce-complexity'], hintUsed: true },
    supportTelemetry: [
      { stage: 'presented', supportType: 'textToSpeech' },
      { stage: 'presented', supportType: 'modification:reduce-complexity' },
      { stage: 'presented', supportType: 'largeText' },
      { stage: 'used', supportType: 'hint' },
      { stage: 'used', supportType: 'textToSpeech' },
    ],
  }]);
  const [item] = report.timeline;
  const shown = [...studentSupportNames(item.supportsPresented), ...studentSupportNames(item.supportsUsed), studentAttemptLabel(item.classification)];
  assert.deepEqual(studentSupportNames(item.supportsPresented), ['Read aloud']);
  assert.deepEqual(studentSupportNames(item.supportsUsed), ['Hint', 'Read aloud']);
  assert.equal(studentAttemptLabel(item.classification), 'Adjusted version');
  for (const text of shown) {
    assert.doesNotMatch(text, /modif|IEP|504|inclusion|textToSpeech|:/i, text);
  }
  assert.equal(studentAttemptLabel({ key: 'supported', label: 'Supported attempt' }), 'Supported attempt');
});

test('the cap is stated, not silent — and only when the list really is capped', () => {
  assert.equal(PRACTICE_HISTORY_EVENT_LIMIT, 300);
  assert.equal(practiceHistoryCapNotice({ loaded: 299 }), null);
  assert.equal(practiceHistoryCapNotice({ loaded: 300 }), 'Showing your 300 most recent answers. Older answers still count toward your mastery.');
  assert.equal(practiceHistoryCapNotice({ loaded: 40, limit: 40 }), 'Showing your 40 most recent answers. Older answers still count toward your mastery.');
});

const item = (iso, { correct = true, independent = true } = {}) => ({
  timestamp: Date.parse(iso), isCorrect: correct, classification: { isIndependent: independent },
});
const loadedAt = (...isos) => isos.map((iso) => ({ occurredAt: Date.parse(iso) }));

test('a summary by week: answers, correct and on-your-own per Monday-start week, newest first', () => {
  const timeline = [
    item('2026-10-07T15:00:00Z'),
    item('2026-10-05T15:00:00Z', { correct: false, independent: false }),
    item('2026-10-04T20:00:00Z', { independent: false }),
    { timestamp: 0, isCorrect: true, classification: {} },
  ];
  const weeks = summarizePracticeByWeek(timeline, { loadedEvents: loadedAt('2026-10-07T15:00:00Z'), limit: 300 });
  assert.deepEqual(weeks.map((week) => [week.label, week.answers, week.correct, week.onYourOwn, week.accuracy, week.partial]), [
    ['Week of Oct 5', 2, 1, 1, 50, false],
    ['Week of Sep 28', 1, 1, 0, 100, false],
  ]);
});

test('when capped, the week the oldest LOADED answer falls in is marked partial, whatever the filter shows', () => {
  const loaded = loadedAt('2026-10-07T15:00:00Z', '2026-09-30T15:00:00Z', '2026-09-22T15:00:00Z');
  // Filtered to one skill: the oldest item on screen is in the week of Sep 28,
  // but the list was cut inside the week of Sep 21.
  const filtered = [item('2026-10-07T15:00:00Z'), item('2026-09-30T15:00:00Z')];
  const uncut = summarizePracticeByWeek(filtered, { loadedEvents: loaded, limit: 4 });
  assert.deepEqual(uncut.map((week) => week.partial), [false, false]);
  // Capped, but the cut is older than anything this filter shows: every week
  // on screen is complete for this skill.
  const cappedFiltered = summarizePracticeByWeek(filtered, { loadedEvents: loaded, limit: 3 });
  assert.deepEqual(cappedFiltered.map((week) => week.partial), [false, false]);
  const cut = summarizePracticeByWeek([...filtered, item('2026-09-22T15:00:00Z')], { loadedEvents: loaded, limit: 3 });
  assert.deepEqual(cut.map((week) => [week.label, week.partial]), [['Week of Oct 5', false], ['Week of Sep 28', false], ['Week of Sep 21', true]]);
});

// ------------------------------------------------------------------ wiring

test('Practice History renders names, the attempt label, the cap notice and the weeks', () => {
  const screen = executableSource(read('src/components/student/StudentPracticeHistory.jsx'));
  assert.match(screen, /import \{[^}]*studentSupportNames[^}]*\} from '\.\.\/\.\.\/platform\/mastery\/practiceHistoryPresentation\.js';/s);
  assert.match(screen, /studentSupportNames\(item\.supportsPresented\)\.join\(', '\)/);
  assert.match(screen, /studentSupportNames\(item\.supportsUsed\)\.join\(', '\)/);
  assert.doesNotMatch(screen, /item\.supportsPresented\.join|item\.supportsUsed\.join/, 'raw ids must not reach the screen');
  assert.match(screen, /\{studentAttemptLabel\(item\.classification\)\}/);
  assert.doesNotMatch(screen, /\{item\.classification\.label\}/);
  assert.match(screen, /const capNotice = practiceHistoryCapNotice\(\{ loaded: evidenceEvents\.length, limit: eventLimit \}\);/);
  assert.match(screen, /\{capNotice && \(/);
  assert.match(screen, /summarizePracticeByWeek\(report\.timeline, \{ loadedEvents: evidenceEvents, limit: eventLimit \}\)/);
  assert.match(region(screen, '{weeks.length > 0 && (', '</section>', 'weeks'), /weeks\.map\(\(week\) =>/);
  assert.doesNotMatch(screen, /Evidence events/);
});

test('the fetch and the notice share one limit', () => {
  const app = executableSource(read('src/components/student/MyMathPathApp.jsx'));
  assert.match(app, /import \{ PRACTICE_HISTORY_EVENT_LIMIT \} from '\.\.\/\.\.\/platform\/mastery\/practiceHistoryPresentation\.js';/);
  assert.match(app, /fetchStudentEvidenceEvents\(studentId, \{ maxEvents: PRACTICE_HISTORY_EVENT_LIMIT \}\)/);
  assert.match(app, /<StudentPracticeHistory [^>]*eventLimit=\{PRACTICE_HISTORY_EVENT_LIMIT\}/);
});
