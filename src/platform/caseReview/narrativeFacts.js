/*
 * FACTS AVAILABLE FOR TEACHER NARRATIVE.
 *
 * Sentences a teacher may lift into a parent, administrator or ARD narrative.
 * Each one:
 *
 *   * comes from a fixed template in TEMPLATES below, checked by the narrative
 *     guard before any value or teacher text is put into it — so no sentence
 *     here can state a compliance verdict, a cause, a motive, a disability
 *     attribution, a counterfactual, or an absence as a negative fact;
 *   * is produced only when the number behind it exists in the records;
 *   * carries a provenance category and the records it came from, which the
 *     teacher can open.
 *
 * Absences are stated the only safe way: "MathMaster does not contain a
 * record …". The case review never writes "did not", "never" or "not
 * provided".
 */
import { supportLabel } from '../../../functions/shared/supportCatalog.mjs';
import { CASE_PROVENANCE, caseFact, caseSource, fromSupportProvenance } from './caseProvenance.js';
import { renderNarrativeTemplate } from './narrativeGuard.js';

export const TEMPLATES = Object.freeze({
  assignedCompleted: 'The student was assigned {assigned} MathMaster {activityWord} during the selected period and completed {completed}.',
  noAnswersPastFinal: 'MathMaster records no answers on {count} assigned {activityWord} whose final cutoff has passed.',
  incompleteOpen: '{count} assigned {activityWord} {verb} partly answered.',
  completedAfterDue: '{count} of the completed {activityWord} {verb} completed after the student\'s due date.',
  sectionCorrect: '{section}: {correct} of {answered} answered items were correct by the final attempt ({percent}%).',
  modifiedSectionCorrect: '{section} (Modified work): {correct} of {answered} answered items were correct by the final attempt ({percent}%).',
  instructionVsDol: 'Classwork and Practice items were {instructional}% correct by the final attempt; DOL items were {dol}% correct.',
  firstAttempt: '{first} of {scored} scored grade-level questions were correct on the first attempt.',
  correctedLater: '{count} initially incorrect grade-level {questionWord} {verb} corrected on a later attempt.',
  exhausted: '{count} grade-level {questionWord} {verb} not correct after all available attempts were used.',
  leftWithAttempts: '{count} {questionWord} {verb} left with attempts remaining when the assignment closed.',
  modifiedAttempts: 'On Modified work, {first} of {scored} scored questions were correct on the first attempt and {corrected} more {correctedVerb} corrected on a later attempt.',
  modifiedFirstAttempt: 'On Modified work, {first} of {scored} scored questions were correct on the first attempt.',
  standardModified: '{standard} {assignmentWord} {verb} completed under Standard (grade-level) conditions and {modified} under Modified conditions.',
  individualizedDue: 'The student\'s individualized due date for {title} was {date}.',
  individualizedDueCount: 'Individualized due dates derived from the student\'s support profile applied to {count} {assignmentWord} in this period.',
  attendanceExtension: 'An attendance extension set the student\'s last day to turn in {title} to {date}.',
  calculatorRecorded: 'The platform records calculator use on {count} {assignmentWord}.',
  supportUsed: 'MathMaster records {support} as used {uses} {timesWord} during this period.',
  staffDocumented: 'Staff documented {support} {count} {timesWord} in MathMaster during this period.',
  noStaffRecord: 'MathMaster does not contain a record establishing whether {support} occurred during this period.',
  serviceMinutes: 'Staff recorded {minutes} minutes of support services in MathMaster during this period.',
  serverActiveTime: 'MathMaster recorded {minutes} minutes of active work time (server-timed) across {count} {assignmentWord}.',
  timeNotRecorded: 'Historical active time is not available for {count} {assignmentWord} because that telemetry was not recorded.',
  practiceMode: 'Practice Mode activity after the final cutoff is recorded on {count} {assignmentWord} ({questions} {questionWord} practiced).',
  skillResult: 'On {code}, {percent}% of {scored} scored grade-level questions were correct by the final attempt.',
  profileInEffect: 'The support profile in effect at the end of the period is revision {revision}, effective {date}.',
  openRecords: 'MathMaster has a record of the student opening or working on {opened} of {assigned} assigned {activityWord}; MathMaster does not record every open.',
  sisSnapshot: 'The imported gradebook snapshot ({fileName}) lists {items} {itemWord} for the student; {agree} match MathMaster\'s grades.',
  sisOfficialAverage: 'The official average shown in the imported gradebook snapshot is {average}.',
  errorPatternNotDeterminable: 'MathMaster does not contain structured error-pattern records for this student\'s answers, so no error pattern can be stated from stored evidence.',
});

const plural = (count, one, many) => (Number(count) === 1 ? one : many);
const list = (value) => (Array.isArray(value) ? value : []);
const fmtDate = (ms) => new Date(ms).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'America/Chicago' });

/**
 * Build the narrative facts from an assembled case review model
 * (studentCaseReview.js). Each fact: {key, category, text, provenance,
 * provenanceLabel, sources, limitation}.
 */
export const buildNarrativeFacts = (model) => {
  const facts = [];
  const add = (key, category, template, values, provenance, sources = [], limitation = '') => {
    const text = renderNarrativeTemplate(TEMPLATES[template], values);
    facts.push({ ...caseFact({ key, text, provenance, sources, limitation, section: category }), category, template });
  };
  const summary = model?.summary?.snapshot || {};
  const assignments = list(model?.assignments);
  const assignmentIds = assignments.map((entry) => entry.assignmentId);
  const recordSource = caseSource({ label: 'Question records', path: 'grades/{student}.gradesByAssignment', ids: assignmentIds, detail: 'Each question\'s status, attempts and credit.' });
  const instanceSource = caseSource({ label: 'Assignment instances', path: 'assignments/{id}', ids: assignmentIds, detail: 'Assignments given to the student\'s class (unassigned library copies excluded).' });

  // Completion.
  if (summary.assigned > 0) {
    add('completion.assigned-completed', 'completion', 'assignedCompleted', {
      assigned: summary.assigned, completed: summary.completed, activityWord: plural(summary.assigned, 'activity', 'activities'),
    }, CASE_PROVENANCE.DERIVED, [instanceSource, recordSource]);
  }
  if (summary.missing > 0) {
    add('completion.missing', 'completion', 'noAnswersPastFinal', { count: summary.missing, activityWord: plural(summary.missing, 'activity', 'activities') },
      CASE_PROVENANCE.DERIVED, [recordSource, caseSource({ label: 'Final cutoffs', detail: 'Class dates, attendance extensions and individualized deadlines.' })]);
  }
  if (summary.incomplete > 0) {
    add('completion.incomplete', 'completion', 'incompleteOpen', { count: summary.incomplete, activityWord: plural(summary.incomplete, 'activity', 'activities'), verb: plural(summary.incomplete, 'is', 'are') },
      CASE_PROVENANCE.DERIVED, [recordSource]);
  }
  if (summary.completedLate > 0) {
    add('completion.late', 'completion', 'completedAfterDue', { count: summary.completedLate, activityWord: plural(summary.completed, 'activity', 'activities'), verb: plural(summary.completedLate, 'was', 'were') },
      CASE_PROVENANCE.DERIVED, [recordSource, caseSource({ label: 'Due dates', detail: 'The student\'s own due date (class date or individualized).' })]);
  }
  const opened = model?.completion?.summary;
  if (opened && opened.assigned > 0 && opened.openedRecorded > 0) {
    add('completion.open-records', 'completion', 'openRecords', { opened: opened.openedRecorded, assigned: opened.assigned, activityWord: plural(opened.assigned, 'activity', 'activities') },
      CASE_PROVENANCE.DERIVED, [caseSource({ label: 'Attempts, active-minute ledger, session summaries, support availability', detail: 'MathMaster keeps no general "opened" record.' })]);
  }

  // Performance by section (pooled items, Standard and Modified apart).
  const sections = model?.sectionComparison?.byCondition || {};
  const sectionLabel = { warmup: 'Warm-Up', classwork: 'Classwork', practice: 'Practice', dol: 'DOL', assessment: 'Quiz / Test' };
  list(sections.standard).forEach((entry) => {
    if (!entry.attempted) return;
    add(`performance.section.${entry.key}`, 'performance', 'sectionCorrect', {
      section: sectionLabel[entry.key] || entry.label, correct: entry.finalCorrect, answered: entry.attempted, percent: entry.finalCorrectRate,
    }, CASE_PROVENANCE.DERIVED, [recordSource]);
  });
  list(sections.modified).forEach((entry) => {
    if (!entry.attempted) return;
    add(`performance.section.modified.${entry.key}`, 'performance', 'modifiedSectionCorrect', {
      section: sectionLabel[entry.key] || entry.label, correct: entry.finalCorrect, answered: entry.attempted, percent: entry.finalCorrectRate,
    }, CASE_PROVENANCE.DERIVED, [recordSource]);
  });
  const instructionDol = list(model?.sectionComparison?.comparisons).find((entry) => entry.from === 'instructional' && entry.to === 'dol' && entry.condition === 'standard' && entry.substantial);
  if (instructionDol) {
    add('performance.instruction-vs-dol', 'performance', 'instructionVsDol', { instructional: instructionDol.fromValue, dol: instructionDol.toValue }, CASE_PROVENANCE.DERIVED, [recordSource]);
  }
  const conditions = model?.summary?.snapshot;
  if (conditions && conditions.modifiedCount > 0) {
    add('performance.standard-modified', 'performance', 'standardModified', {
      standard: conditions.completedStandard, modified: conditions.completedModified,
      assignmentWord: plural(conditions.completedStandard, 'assignment', 'assignments'), verb: plural(conditions.completedStandard, 'was', 'were'),
    }, CASE_PROVENANCE.DERIVED, [caseSource({ label: 'Standard / Modified condition (PR #401)', detail: 'Modified only where a record shows a modification changed an item.' })]);
  }

  // Attempts — grade-level work; Modified work in its own sentence.
  const attempts = model?.attemptSummaryByCondition?.standard || model?.attemptSummary || {};
  const modifiedAttempts = model?.attemptSummaryByCondition?.modified || {};
  const attemptProvenance = attempts.attemptsFromEvents > 0 && !attempts.attemptsDerived && !attempts.attemptsMixed ? CASE_PROVENANCE.DIRECT : CASE_PROVENANCE.DERIVED;
  const attemptSources = [recordSource, ...(model?.dataSources?.attemptEvents?.loaded ? [caseSource({ label: 'Per-attempt events', path: 'grades/{student}/evidenceEvents', detail: 'One event per graded attempt, written by the server.' })] : [])];
  if (attempts.firstAttemptKnown > 0) {
    add('attempts.first', 'attempts', 'firstAttempt', { first: attempts.firstAttemptCorrect, scored: attempts.firstAttemptKnown }, attemptProvenance, attemptSources);
  }
  if (attempts.correctedAfterRetry > 0) {
    add('attempts.corrected', 'attempts', 'correctedLater', { count: attempts.correctedAfterRetry, questionWord: plural(attempts.correctedAfterRetry, 'question', 'questions'), verb: plural(attempts.correctedAfterRetry, 'was', 'were') }, attemptProvenance, attemptSources);
  }
  if (attempts.exhausted > 0) {
    add('attempts.exhausted', 'attempts', 'exhausted', { count: attempts.exhausted, questionWord: plural(attempts.exhausted, 'question', 'questions'), verb: plural(attempts.exhausted, 'was', 'were') }, attemptProvenance, attemptSources);
  }
  if (attempts.leftWithAttempts > 0) {
    add('attempts.left-open', 'attempts', 'leftWithAttempts', { count: attempts.leftWithAttempts, questionWord: plural(attempts.leftWithAttempts, 'question', 'questions'), verb: plural(attempts.leftWithAttempts, 'was', 'were') }, CASE_PROVENANCE.DERIVED, attemptSources);
  }
  if (modifiedAttempts.firstAttemptKnown > 0) {
    add('attempts.modified', 'attempts', modifiedAttempts.correctedAfterRetry ? 'modifiedAttempts' : 'modifiedFirstAttempt', {
      first: modifiedAttempts.firstAttemptCorrect, scored: modifiedAttempts.firstAttemptKnown, corrected: modifiedAttempts.correctedAfterRetry, correctedVerb: plural(modifiedAttempts.correctedAfterRetry, 'was', 'were'),
    }, CASE_PROVENANCE.DERIVED, attemptSources);
  }
  if (model?.errorPatterns && !model.errorPatterns.determinable && (attempts.scored > 0 || modifiedAttempts.scored > 0)) {
    add('attempts.error-pattern', 'attempts', 'errorPatternNotDeterminable', {}, CASE_PROVENANCE.NOT_RECORDED, []);
  }

  // Deadlines: a count for the period, and the date itself where the work was
  // late, incomplete or missing — where a narrative is likely to need it.
  const individualized = assignments.filter((entry) => entry.individualizedDueAtMs);
  if (individualized.length) {
    add('deadline.individualized.count', 'deadlines', 'individualizedDueCount', { count: individualized.length, assignmentWord: plural(individualized.length, 'assignment', 'assignments') }, CASE_PROVENANCE.DERIVED,
      [caseSource({ label: 'Support profile extra-time rule (PR #401)', path: 'grades/{student}/supportProfileRevisions', ids: individualized.map((entry) => entry.assignmentId) })]);
  }
  assignments.forEach((entry) => {
    const deadlineMatters = entry.completedLate || ['missing', 'closed-incomplete', 'in-progress'].includes(entry.status);
    if (entry.individualizedDueAtMs && deadlineMatters) {
      add(`deadline.individualized.${entry.assignmentId}`, 'deadlines', 'individualizedDue', { title: entry.title, date: fmtDate(entry.individualizedDueAtMs) }, CASE_PROVENANCE.DERIVED,
        [caseSource({ label: 'Support profile extra-time rule (PR #401)', path: 'grades/{student}/supportProfileRevisions', detail: 'Individualized dates are derived from the profile; they are not stored.' })]);
    }
    if (entry.attendanceExtension?.finalAtMs) {
      add(`deadline.attendance.${entry.assignmentId}`, 'deadlines', 'attendanceExtension', { title: entry.title, date: fmtDate(entry.attendanceExtension.finalAtMs) }, CASE_PROVENANCE.DIRECT,
        [caseSource({
          label: 'Attendance extension',
          path: entry.attendanceExtension.source === 'grant-history' ? 'grades/{student}/attendanceExtensionGrants' : 'assignments/{id}.studentOverrides',
          ids: [entry.assignmentId],
        })]);
    }
  });

  // Tools and supports.
  if (model?.tools?.calculatorAssignments > 0) {
    add('supports.calculator', 'supports', 'calculatorRecorded', { count: model.tools.calculatorAssignments, assignmentWord: plural(model.tools.calculatorAssignments, 'assignment', 'assignments') },
      CASE_PROVENANCE.DIRECT, [caseSource({ label: 'Calculator flags on attempts and support evidence', detail: 'Recorded when the calculator was opened during a question.' })]);
  }
  const support = model?.supportEvidence?.summary || {};
  list(support.supports).forEach((entry) => {
    if (entry.uses > 0) {
      add(`supports.used.${entry.supportId}`, 'supports', 'supportUsed', { support: supportLabel(entry.supportId), uses: entry.uses, timesWord: plural(entry.uses, 'time', 'times') }, CASE_PROVENANCE.DIRECT,
        [caseSource({ label: 'Support evidence (PR #401)', path: 'grades/{student}/supportEvidence', detail: 'Recorded at the moment of use.' })]);
    }
    if (entry.staffRecords > 0) {
      add(`supports.staff.${entry.supportId}`, 'supports', 'staffDocumented', { support: supportLabel(entry.supportId).toLowerCase(), count: entry.staffRecords, timesWord: plural(entry.staffRecords, 'time', 'times') }, CASE_PROVENANCE.STAFF,
        [caseSource({ label: 'Staff support records (PR #401)', path: 'grades/{student}/supportEvidence' })]);
    }
    if (entry.configured && entry.automation === 'manual' && entry.staffRecords === 0) {
      add(`supports.no-record.${entry.supportId}`, 'evidence-gaps', 'noStaffRecord', { support: supportLabel(entry.supportId).toLowerCase() }, CASE_PROVENANCE.NOT_RECORDED, []);
    }
  });
  if (support.serviceMinutesRecorded > 0) {
    add('supports.service', 'supports', 'serviceMinutes', { minutes: support.serviceMinutesRecorded }, CASE_PROVENANCE.STAFF,
      [caseSource({ label: 'Service log (PR #401)', path: 'grades/{student}/supportServiceLog' })]);
  }
  const profile = model?.supportEvidence?.profile?.current;
  if (profile && profile.provenance === 'documented' && profile.effectiveStart) {
    add('supports.profile', 'supports', 'profileInEffect', { revision: profile.revision, date: profile.effectiveStart }, fromSupportProvenance(profile.provenance),
      [caseSource({ label: 'Support profile revisions (PR #401)', path: 'grades/{student}/supportProfileRevisions', ids: [profile.revisionId] })]);
  }

  // Engagement.
  const completion = model?.completion?.summary || {};
  if (completion.activeMinutesServer > 0) {
    const counted = list(model?.completion?.assignments).filter((entry) => entry.time.activeSource === 'ledger').length;
    add('engagement.server-time', 'engagement', 'serverActiveTime', { minutes: completion.activeMinutesServer, count: counted, assignmentWord: plural(counted, 'assignment', 'assignments') }, CASE_PROVENANCE.DIRECT,
      [caseSource({ label: 'Active-minute ledger (PR #401)', path: 'grades/{student}/engagementMinutes', detail: 'Visible page, interaction within 2 minutes, credit-eligible work only.' })]);
  }
  if (completion.timeNotRecorded > 0) {
    add('engagement.not-recorded', 'evidence-gaps', 'timeNotRecorded', { count: completion.timeNotRecorded, assignmentWord: plural(completion.timeNotRecorded, 'assignment', 'assignments') }, CASE_PROVENANCE.NOT_RECORDED, [],
      'Before the PR #401 timer repair, students with the no-idle-timer support recorded no browser time.');
  }
  if (completion.practiceModeAssignments > 0) {
    const questions = list(model?.completion?.assignments).reduce((sum, entry) => sum + (entry.practiceMode?.questionsPracticed || 0), 0);
    add('engagement.practice-mode', 'engagement', 'practiceMode', { count: completion.practiceModeAssignments, questions, assignmentWord: plural(completion.practiceModeAssignments, 'assignment', 'assignments'), questionWord: plural(questions, 'question', 'questions') }, CASE_PROVENANCE.LEGACY,
      [caseSource({ label: 'Practice Mode records', path: 'studentWorkspaceDrafts/{student}__{assignment}.practice' })], 'Practice Mode times come from the student\'s device clock; Practice Mode time is not recorded.');
  }

  // Skills (grade-level findings only).
  const skills = model?.skills;
  [...list(skills?.findings?.needsInstruction), ...list(skills?.findings?.strongest)].slice(0, 6).forEach((finding) => {
    const skill = list(skills?.skills).find((entry) => entry.code === finding.code);
    const standard = skill?.byCondition?.standard;
    if (!standard?.attempted) return;
    add(`skills.${finding.code}`, 'skills', 'skillResult', { code: finding.code, percent: standard.finalCorrectRate, scored: standard.attempted }, CASE_PROVENANCE.DERIVED,
      [recordSource, caseSource({ label: 'Question standards metadata', detail: 'The question\'s own standards, never the assignment title.' })]);
  });

  // Official gradebook (imported).
  const sis = model?.sis;
  if (sis?.reconciliation) {
    add('gradebook.snapshot', 'gradebook', 'sisSnapshot', { fileName: sis.meta.fileName || 'gradebook file', items: sis.reconciliation.counts.items, itemWord: plural(sis.reconciliation.counts.items, 'item', 'items'), agree: sis.reconciliation.counts.agree },
      CASE_PROVENANCE.SIS, [caseSource({ label: 'Imported gradebook snapshot', detail: `Imported ${sis.meta.importedAtMs ? fmtDate(sis.meta.importedAtMs) : ''}`.trim() })]);
    if (Number.isFinite(sis.snapshot?.officialAverage)) {
      add('gradebook.average', 'gradebook', 'sisOfficialAverage', { average: sis.snapshot.officialAverage }, CASE_PROVENANCE.SIS, [caseSource({ label: 'Imported gradebook snapshot' })]);
    }
  }

  return facts;
};

export default buildNarrativeFacts;
