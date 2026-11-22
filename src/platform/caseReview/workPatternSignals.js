/*
 * WORK-PATTERN SIGNALS IN THE CASE REVIEW
 * (docs/platform/SHOWING_THE_PROCESS.md, section 7, "Signals as evidence").
 *
 * One signal says little. Over a marking period the same facts show patterns
 * one signal cannot: how often each occurs among the questions the student
 * answered ("pasted into a math box on 6 of 40 answers"), how the questions
 * with a signal were marked beside those without, and where the signals
 * occur, by section (beside the DOL-vs-instruction comparison) and in or
 * outside the class's scheduled time.
 *
 * WHAT THIS IS NOT. Not a finding, and not conclusive: every line is a count
 * of records. Nothing here says why, and nothing here is handed to the
 * narrative facts (narrativeFacts.js never reads this section, and
 * narrativeGuard.js refuses a template that states a conclusion about
 * integrity). No grade, attempt or mastery path reads a signal; this module
 * reads question rows that were already graded, and changes none.
 *
 * Inputs are the stored signal records (grades/{student}/attemptSignals) and
 * the case's own question rows (attemptAnalysis.js). Pure: no Firestore.
 */
import {
  ATTEMPT_SIGNAL_PHRASE, ATTEMPT_SIGNAL_TITLE, CLASS_TIME_NOT_KNOWN, NOT_CONCLUSIVE, TEACHER_NOTE_HEADING, TEACHER_NOTE_LABEL, describeAttemptSignal,
} from '../teacher/attemptSignalsView.js';
import { ATTEMPT_SIGNAL_KINDS, ATTEMPT_SIGNAL_ROLES } from '../signals/attemptSignalFacts.js';
import { CASE_PROVENANCE } from './caseProvenance.js';
import { QUESTION_OUTCOME, SECTION_ROLE_LABEL } from './attemptAnalysis.js';

export const WORK_PATTERN_TITLE = 'Work-pattern signals';
export const WORK_PATTERN_NOTE = 'Facts recorded about attempts: not findings, and not conclusive on their own. They never change a score, an attempt or mastery, and no narrative fact is written from them.';
export const WORK_PATTERN_LIMITATIONS = Object.freeze([
  'Signals are recorded on the Warm-Up, Classwork, Practice and DOL questions of the student\'s classroom assignments (credit work) from the date the feature was released. Earlier work, post-deadline practice, Quizzes, Review, Corrections, Recovery, My Math Path and secure Tests have none, so a question with no signal is not a question where nothing happened.',
  'A signal records a position and counts. What was typed or pasted, and what the student did while the page was hidden, are not recorded and cannot be known from it.',
  '"During the class\'s scheduled time" is the bell schedule, not attendance or a location. Where the schedule could not say (no schedule saved yet, a Friday whose A/B day was not chosen, a period not on that day\'s schedule) the record reads "Class time not known", never "outside".',
  'Counts are out of the answered questions where a signal could have been recorded: the Warm-Up, Classwork, Practice and DOL questions of classroom assignments, last answered on or after the first signal on record for this student. Answers before that date, and answers with no recorded time, are left out of the count rather than read as "no signal".',
  'A reviewing teacher\'s note is the teacher\'s own words. It is labelled as such, and no count or narrative fact is written from it.',
  'A support that explains a pattern raises no signal of that kind (read aloud, translation, the glossary or See every part at once for leaving the page; a word-processed response for pasting).',
]);

const list = (value) => (Array.isArray(value) ? value : []);
const clean = (value) => String(value ?? '').trim();
const key = (assignmentId, questionIndex) => `${clean(assignmentId)}|${Number(questionIndex)}`;
const share = (count, of) => (of > 0 ? Math.round((count / of) * 100) : null);

// Where the recorder runs: the sections of a classroom assignment worked for
// credit. One list, the recorder's own (attemptSignalFacts.js, and the create
// rule): Quizzes, Tests, Review, Corrections, Recovery and My Math Path record none.
export const SIGNAL_RECORDED_SECTIONS = ATTEMPT_SIGNAL_ROLES;
export const SIGNAL_LIST_CAP_NOTE = (max) => `Only the newest ${max} signals in this window were loaded; older ones in the window are not counted here.`;

const ANSWERED = (row) => Number(row?.totalAttempts) > 0
  && ![QUESTION_OUTCOME.NOT_ATTEMPTED, QUESTION_OUTCOME.SKIPPED, QUESTION_OUTCOME.NOT_REQUIRED].includes(row?.outcome);

// How a set of answered questions was marked: counts only.
const marking = (rows) => {
  const answered = rows.length;
  const firstKnown = rows.filter((row) => row.firstAttemptCorrect !== null && row.firstAttemptCorrect !== undefined);
  const firstCorrect = firstKnown.filter((row) => row.firstAttemptCorrect === true).length;
  const credited = rows.filter((row) => Number.isFinite(Number(row.finalCredit)));
  const finalCredit = credited.length
    ? Math.round(credited.reduce((sum, row) => sum + Number(row.finalCredit), 0) / credited.length)
    : null;
  return {
    answered,
    firstAttemptKnown: firstKnown.length,
    firstAttemptCorrect: firstCorrect,
    firstAttemptAccuracy: share(firstCorrect, firstKnown.length),
    finalCreditAverage: finalCredit,
  };
};

/**
 * @param signals     stored signal records, each `{ id, ...fields }`; null or
 *                    undefined when they were not loaded.
 * @param questions   the case's question rows (model.questions).
 * @param assignments the case's assignment entries, for titles.
 * @param fromMs/toMs the case's window: signals outside it are left out.
 */
export const buildWorkPatternSignals = ({
  signals = undefined, questions = [], assignments = [], fromMs = null, toMs = null, timeZone = 'America/Chicago',
  // What the load knows beyond the list: `firstRecordedAtMs`, the student's
  // earliest signal on record (any date), and `capped`/`max` when the window
  // held more signals than were loaded (caseReviewStore.js).
  signalsMeta = null,
} = {}) => {
  const loaded = Array.isArray(signals);
  const titles = new Map(list(assignments).map((entry) => [clean(entry.assignmentId), { title: clean(entry.title) }]));
  const included = new Set(titles.keys());
  const formatWhen = (ms) => new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone });
  const within = (ms) => !ms || ((fromMs === null || ms >= fromMs) && (toMs === null || ms <= toMs));

  const rowByKey = new Map(list(questions).map((row) => [key(row.assignmentId, row.storageIndex), row]));
  const entries = (loaded ? signals : [])
    .map((signal) => describeAttemptSignal(signal, { assignmentsById: titles, formatWhen }))
    .filter((entry) => entry && included.has(entry.assignmentId) && within(entry.recordedAtMs))
    .map((entry) => {
      const row = rowByKey.get(key(entry.assignmentId, entry.questionIndex)) || null;
      return {
        ...entry,
        // The question as the case review names it, where it is one of the case's.
        questionLabel: row ? `${row.sectionLabel} Q${row.sectionNumber}` : `Question ${entry.questionIndex + 1}`,
        section: row?.section || entry.activityRole || '',
        sectionLabel: row?.sectionLabel || SECTION_ROLE_LABEL[entry.activityRole] || entry.activityRole || '',
        outcomeLabel: row?.outcomeLabel || '',
        provenance: CASE_PROVENANCE.DIRECT,
      };
    })
    // Only a signal its counts can hold: one on a section signals are recorded
    // on. The recorder and the create rule write no other (attemptSignalFacts.js).
    .filter((entry) => SIGNAL_RECORDED_SECTIONS.includes(entry.section))
    .sort((a, b) => a.recordedAtMs - b.recordedAtMs || a.assignmentId.localeCompare(b.assignmentId) || a.questionIndex - b.questionIndex || a.kind.localeCompare(b.kind));

  // THE DENOMINATOR. Only an answer where a signal could have been recorded
  // counts: a section the recorder runs on, not Recovery, last answered on or
  // after the first signal on record for this student. Everything else is
  // left out and counted as left out, so "no signal" never includes work that
  // was never watched.
  const earliestLoaded = (loaded ? signals : []).map((signal) => describeAttemptSignal(signal)?.recordedAtMs || 0).filter((ms) => ms > 0);
  const firstKnown = [Number(signalsMeta?.firstRecordedAtMs) || 0, ...earliestLoaded].filter((ms) => ms > 0);
  const recordedSinceMs = firstKnown.length ? Math.min(...firstKnown) : null;
  const allAnswered = list(questions).filter(ANSWERED);
  const left = { otherSections: 0, beforeRecording: 0, noTime: 0, outsideWindow: 0 };
  const answeredRows = allAnswered.filter((row) => {
    if (!SIGNAL_RECORDED_SECTIONS.includes(row.section) || row.recoveredLate === true) { left.otherSections += 1; return false; }
    if (recordedSinceMs === null) { left.beforeRecording += 1; return false; }
    if (!Number.isFinite(row.lastAttemptAtMs) || row.lastAttemptAtMs === null) { left.noTime += 1; return false; }
    if (row.lastAttemptAtMs < recordedSinceMs) { left.beforeRecording += 1; return false; }
    // The signals are the window's; so are the answers they are counted out of.
    if ((fromMs !== null && row.lastAttemptAtMs < fromMs) || (toMs !== null && row.lastAttemptAtMs > toMs)) { left.outsideWindow += 1; return false; }
    return true;
  });
  const formatDay = (ms) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone });
  const leftOutWords = [
    left.beforeRecording ? `${left.beforeRecording} answered before then` : '',
    left.outsideWindow ? `${left.outsideWindow} answered outside this window` : '',
    left.otherSections ? `${left.otherSections} in Quizzes, Tests, Review, Corrections or Recovery` : '',
    left.noTime ? `${left.noTime} with no recorded time` : '',
  ].filter(Boolean);
  const denominator = {
    answered: answeredRows.length,
    allAnswered: allAnswered.length,
    sections: [...SIGNAL_RECORDED_SECTIONS],
    recordedSinceMs,
    leftOut: left,
    words: recordedSinceMs === null
      ? 'No signal is on record for this student, so there is no date from which answers can be counted.'
      : `Counted out of ${answeredRows.length} answered Warm-Up, Classwork, Practice and DOL question${answeredRows.length === 1 ? '' : 's'}, last answered on or after ${formatDay(recordedSinceMs)} (the first signal on record for this student)${leftOutWords.length ? `. Left out: ${leftOutWords.join('; ')}` : ''}.`,
  };
  const flaggedKeys = new Set(entries.map((entry) => key(entry.assignmentId, entry.questionIndex)));
  const flaggedRows = answeredRows.filter((row) => flaggedKeys.has(key(row.assignmentId, row.storageIndex)));
  const unflaggedRows = answeredRows.filter((row) => !flaggedKeys.has(key(row.assignmentId, row.storageIndex)));

  // How often each kind occurs among the questions answered in the window.
  const frequency = ATTEMPT_SIGNAL_KINDS.map((kind) => {
    const ofKind = entries.filter((entry) => entry.kind === kind);
    const questionsWith = new Set(ofKind.map((entry) => key(entry.assignmentId, entry.questionIndex)));
    const answeredWith = answeredRows.filter((row) => questionsWith.has(key(row.assignmentId, row.storageIndex))).length;
    return {
      kind,
      title: ATTEMPT_SIGNAL_TITLE[kind],
      phrase: ATTEMPT_SIGNAL_PHRASE[kind],
      signals: ofKind.length,
      questions: answeredWith,
      answered: answeredRows.length,
      share: share(answeredWith, answeredRows.length),
      reviewed: ofKind.filter((entry) => entry.reviewed).length,
      // "Pasted into a math box on 6 of 40 answered questions."
      line: `${ATTEMPT_SIGNAL_PHRASE[kind].replace(/^./, (letter) => letter.toUpperCase())} on ${answeredWith} of ${answeredRows.length} answered question${answeredRows.length === 1 ? '' : 's'}.`,
    };
  });

  // Where the signals occur: by section, beside how that section's questions were marked.
  const sectionKeys = [...new Set([...answeredRows.map((row) => row.section), ...entries.map((entry) => entry.section)].filter(Boolean))];
  const ORDER = ['warmup', 'classwork', 'practice', 'dol', 'quiz', 'test', 'assessment'];
  const bySection = sectionKeys
    .sort((a, b) => (ORDER.indexOf(a) === -1 ? 99 : ORDER.indexOf(a)) - (ORDER.indexOf(b) === -1 ? 99 : ORDER.indexOf(b)) || a.localeCompare(b))
    .map((section) => {
      const rows = answeredRows.filter((row) => row.section === section);
      const withSignal = rows.filter((row) => flaggedKeys.has(key(row.assignmentId, row.storageIndex)));
      const sectionEntries = entries.filter((entry) => entry.section === section);
      return {
        key: section,
        label: SECTION_ROLE_LABEL[section] || section,
        answered: rows.length,
        questionsWithSignal: withSignal.length,
        share: share(withSignal.length, rows.length),
        signals: sectionEntries.length,
        byKind: Object.fromEntries(ATTEMPT_SIGNAL_KINDS.map((kind) => [kind, sectionEntries.filter((entry) => entry.kind === kind).length])),
      };
    });

  // Month by month (the school's calendar): the answers counted, and how many
  // of them carry a signal. "6 of 40 answers in November."
  const monthOf = (ms) => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit' }).formatToParts(new Date(ms));
    return `${parts.find((part) => part.type === 'year').value}-${parts.find((part) => part.type === 'month').value}`;
  };
  const monthLabel = (monthKey) => new Date(`${monthKey}-15T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const monthKeys = [...new Set(answeredRows.map((row) => monthOf(row.lastAttemptAtMs)))].sort();
  const byMonth = monthKeys.map((monthKey) => {
    const rows = answeredRows.filter((row) => monthOf(row.lastAttemptAtMs) === monthKey);
    const rowKeys = new Set(rows.map((row) => key(row.assignmentId, row.storageIndex)));
    const monthEntries = entries.filter((entry) => rowKeys.has(key(entry.assignmentId, entry.questionIndex)));
    const withSignal = new Set(monthEntries.map((entry) => key(entry.assignmentId, entry.questionIndex))).size;
    const kinds = ATTEMPT_SIGNAL_KINDS.map((kind) => {
      const count = new Set(monthEntries.filter((entry) => entry.kind === kind).map((entry) => key(entry.assignmentId, entry.questionIndex))).size;
      return { kind, phrase: ATTEMPT_SIGNAL_PHRASE[kind], questions: count };
    });
    return {
      key: monthKey,
      label: monthLabel(monthKey),
      answered: rows.length,
      questionsWithSignal: withSignal,
      share: share(withSignal, rows.length),
      signals: monthEntries.length,
      byKind: Object.fromEntries(kinds.map((row) => [row.kind, row.questions])),
      line: `${monthLabel(monthKey)}: a signal on ${withSignal} of ${rows.length} answer${rows.length === 1 ? '' : 's'}${withSignal ? ` (${kinds.filter((row) => row.questions).map((row) => `${row.phrase} on ${row.questions}`).join('; ')})` : ''}.`,
    };
  });

  // In or outside the class's scheduled time, as each record says. A record
  // the bell schedule could not answer for is its own count, never "outside".
  const classTime = {
    during: entries.filter((entry) => entry.duringClass === true).length,
    outside: entries.filter((entry) => entry.duringClass === false).length,
    notKnown: entries.filter((entry) => entry.duringClass === null).length,
  };
  const capped = loaded && signalsMeta?.capped === true;

  const comparison = { withSignal: marking(flaggedRows), withoutSignal: marking(unflaggedRows) };
  const lines = [];
  if (loaded && entries.length) {
    if (capped) lines.push(SIGNAL_LIST_CAP_NOTE(signalsMeta.max));
    lines.push(denominator.words);
    frequency.filter((row) => row.signals > 0).forEach((row) => lines.push(row.line));
    const pct = (value) => (value === null ? 'not recorded' : `${value}%`);
    if (comparison.withSignal.answered && comparison.withoutSignal.answered) {
      lines.push(`First-attempt correct: ${pct(comparison.withSignal.firstAttemptAccuracy)} on the ${comparison.withSignal.answered} answered question${comparison.withSignal.answered === 1 ? '' : 's'} with a signal, ${pct(comparison.withoutSignal.firstAttemptAccuracy)} on the ${comparison.withoutSignal.answered} without one.`);
    }
    if (byMonth.length > 1) byMonth.forEach((row) => lines.push(row.line));
    lines.push(`Class time: ${classTime.during} during the class's scheduled time, ${classTime.outside} outside it, ${classTime.notKnown} ${CLASS_TIME_NOT_KNOWN.toLowerCase().replace('class time ', '')}.`);
    const reviewedCount = entries.filter((entry) => entry.reviewed).length;
    lines.push(`${reviewedCount} of ${entries.length} reviewed by a teacher; ${entries.length - reviewedCount} not yet reviewed.`);
  }

  return {
    title: WORK_PATTERN_TITLE,
    notConclusive: NOT_CONCLUSIVE,
    note: WORK_PATTERN_NOTE,
    loaded,
    total: entries.length,
    needsReview: entries.filter((entry) => !entry.reviewed).length,
    reviewed: entries.filter((entry) => entry.reviewed).length,
    answeredQuestions: answeredRows.length,
    denominator,
    byMonth,
    capped,
    cappedNote: capped ? SIGNAL_LIST_CAP_NOTE(signalsMeta.max) : '',
    frequency,
    comparison,
    bySection,
    classTime,
    lines,
    entries,
    limitations: [...WORK_PATTERN_LIMITATIONS],
  };
};

/** The section's entries for the case timeline (caseTimeline.js `extraEntries`). */
export const workPatternTimelineEntries = (section) => list(section?.entries)
  .filter((entry) => entry.recordedAtMs > 0)
  .map((entry) => ({
    atMs: entry.recordedAtMs,
    kind: 'work-pattern-signal',
    group: 'signals',
    label: `${WORK_PATTERN_TITLE.replace(/s$/, '')}: ${entry.title} (${NOT_CONCLUSIVE.toLowerCase()})`,
    detail: [entry.assignmentTitle, entry.questionLabel, entry.partIndex === null ? '' : `part ${entry.partIndex + 1}`, entry.classTime].filter(Boolean).join(' · '),
    provenance: CASE_PROVENANCE.DIRECT,
    assignmentId: entry.assignmentId,
    details: [
      { label: 'What was recorded', value: entry.facts },
      ...(entry.supports ? [{ label: 'Supports', value: entry.supports.replace(/^Supports in effect: /, '') }] : []),
      { label: 'Review', value: entry.reviewed ? `Reviewed${entry.reviewedBy ? ` by ${entry.reviewedBy}` : ''}` : 'Not yet reviewed' },
      // The teacher's own words, under their own heading: never part of the fact.
      ...(entry.reviewNote ? [{ label: TEACHER_NOTE_HEADING, value: entry.reviewNote, note: TEACHER_NOTE_LABEL }] : []),
    ],
  }));

export default buildWorkPatternSignals;
