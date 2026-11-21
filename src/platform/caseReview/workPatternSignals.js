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
  ATTEMPT_SIGNAL_PHRASE, ATTEMPT_SIGNAL_TITLE, NOT_CONCLUSIVE, describeAttemptSignal,
} from '../teacher/attemptSignalsView.js';
import { ATTEMPT_SIGNAL_KINDS } from '../signals/attemptSignalFacts.js';
import { CASE_PROVENANCE } from './caseProvenance.js';
import { QUESTION_OUTCOME, SECTION_ROLE_LABEL } from './attemptAnalysis.js';

export const WORK_PATTERN_TITLE = 'Work-pattern signals';
export const WORK_PATTERN_NOTE = 'Facts recorded about attempts: not findings, and not conclusive on their own. They never change a score, an attempt or mastery, and no narrative fact is written from them.';
export const WORK_PATTERN_LIMITATIONS = Object.freeze([
  'Signals are recorded on the student\'s classroom assignments (credit work) from the date the feature was released. Earlier work, post-deadline practice, Recovery, My Math Path and secure Tests have none, so a question with no signal is not a question where nothing happened.',
  'A signal records a position and counts. What was typed or pasted, and what the student did while the page was hidden, are not recorded and cannot be known from it.',
  '"During the class\'s scheduled time" is the bell schedule, not attendance or a location.',
  'A support that explains a pattern raises no signal of that kind (read aloud, translation, the glossary or See every part at once for leaving the page; a word-processed response for pasting).',
]);

const list = (value) => (Array.isArray(value) ? value : []);
const clean = (value) => String(value ?? '').trim();
const key = (assignmentId, questionIndex) => `${clean(assignmentId)}|${Number(questionIndex)}`;
const share = (count, of) => (of > 0 ? Math.round((count / of) * 100) : null);

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
    .sort((a, b) => a.recordedAtMs - b.recordedAtMs || a.assignmentId.localeCompare(b.assignmentId) || a.questionIndex - b.questionIndex || a.kind.localeCompare(b.kind));

  const answeredRows = list(questions).filter(ANSWERED);
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

  // In or outside the class's scheduled time, as each record says.
  const classTime = {
    during: entries.filter((entry) => entry.duringClass === true).length,
    outside: entries.filter((entry) => entry.duringClass === false).length,
    notRecorded: entries.filter((entry) => entry.duringClass === null).length,
  };

  const comparison = { withSignal: marking(flaggedRows), withoutSignal: marking(unflaggedRows) };
  const lines = [];
  if (loaded && entries.length) {
    frequency.filter((row) => row.signals > 0).forEach((row) => lines.push(row.line));
    const pct = (value) => (value === null ? 'not recorded' : `${value}%`);
    if (comparison.withSignal.answered && comparison.withoutSignal.answered) {
      lines.push(`First-attempt correct: ${pct(comparison.withSignal.firstAttemptAccuracy)} on the ${comparison.withSignal.answered} answered question${comparison.withSignal.answered === 1 ? '' : 's'} with a signal, ${pct(comparison.withoutSignal.firstAttemptAccuracy)} on the ${comparison.withoutSignal.answered} without one.`);
    }
    if (classTime.during || classTime.outside) {
      lines.push(`${classTime.during} recorded during the class's scheduled time, ${classTime.outside} outside it${classTime.notRecorded ? `, ${classTime.notRecorded} with no class time recorded` : ''}.`);
    }
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
      { label: 'Review', value: entry.reviewed ? `Reviewed${entry.reviewedBy ? ` by ${entry.reviewedBy}` : ''}${entry.reviewNote ? `: ${entry.reviewNote}` : ''}` : 'Not yet reviewed' },
    ],
  }));

export default buildWorkPatternSignals;
