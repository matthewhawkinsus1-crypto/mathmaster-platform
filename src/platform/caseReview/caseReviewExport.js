/*
 * CASE REVIEW EXPORTS — THE UNDERLYING FACTUAL DATA, AND THE PRINT OUTLINE.
 *
 *   assignments CSV   one row per assignment instance: dates, condition, status,
 *                     every grade contribution and its export state
 *   questions CSV     one row per question: section, standards, attempts,
 *                     outcome, provenance of the attempt sequence (no response
 *                     text and no answer key — the model never holds them)
 *   facts CSV         the narrative facts with provenance and sources
 *   JSON              the whole model, plus the teacher-entered next steps
 *                     labelled as teacher-authored
 *
 * Every CSV cell goes through PR #401's formula-neutralising `csvCell`.
 */
import { csvCell } from '../supportEvidence/supportEvidenceReport.js';
import { CASE_PROVENANCE_LABEL } from './caseProvenance.js';

const list = (value) => (Array.isArray(value) ? value : []);
const clean = (value) => String(value ?? '').trim();
const iso = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString() : '');
const csv = (header, rows) => `${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;

export const PRINT_SECTIONS = Object.freeze([
  { key: 'overview', title: '1. Student, course and date range' },
  { key: 'academic', title: '2. Academic overview' },
  { key: 'grades', title: '3. Assignment and grade evidence' },
  { key: 'sections', title: '4. Section performance' },
  { key: 'dol', title: '5. DOL compared with instructional work' },
  { key: 'skills', title: '6. Skill evidence' },
  { key: 'attempts', title: '7. Attempts and retries' },
  { key: 'completion', title: '8. Completion and engagement' },
  { key: 'supports', title: '9. Relevant support evidence (Student Support Evidence)' },
  { key: 'gaps', title: '10. Evidence gaps' },
  { key: 'facts', title: '11. Facts available for teacher narrative' },
  { key: 'nextSteps', title: '12. Teacher-entered next steps' },
]);

export const TEACHER_AUTHORED_LABEL = 'Teacher-authored — written by the teacher, not generated evidence.';

/**
 * A grade contribution as text. An unanswered section reads as what it is —
 * "Not started" while it is open, "0 (no answers)" once it has closed — and
 * never as a bare 0 that looks like wrong answers.
 */
export const gradeItemLabel = (item) => {
  if (!item) return '';
  if (item.excused || item.state === 'excused') return 'Excused';
  if (item.state === 'not-started') return 'Not started';
  if (item.state === 'no-answers-closed') return item.grade === null ? 'No answers' : `${item.grade} (no answers)`;
  if (item.grade === null) return '';
  if (item.state === 'partial-open') return `${item.grade} so far`;
  return String(item.grade);
};

export const caseAssignmentsCsv = (model) => {
  const header = [
    'Assignment', 'Assignment ID', 'Type', 'Category / weight', 'Assigned', 'Class due', 'Individualized due', 'Final cutoff for this student',
    'Completed on (last answer)', 'Status', 'Completed after due', 'Condition', 'MathMaster grade contribution', 'Warm-Up', 'Classwork', 'Practice', 'DOL',
    'Points (question weight)', 'Attempts', 'Export status', 'Changed since export', 'Practice Pass', 'Teacher overrides',
    // "15 of 20" when a reduced-item-count accommodation removed items (fewer
    // items, same rigor); empty otherwise.
    'Required items',
  ];
  const sectionGrade = (row, key) => gradeItemLabel(list(row.gradeItems).find((entry) => entry.key === key));
  return csv(header, list(model?.assignments).map((row) => [
    row.title, row.instanceId, row.type, row.category, iso(row.releaseAtMs), iso(row.classDueAtMs), iso(row.individualizedDueAtMs), iso(row.finalAtMs),
    iso(row.completedAtMs), row.statusLabel, row.completedLate ? 'yes' : '', row.condition?.value === 'modified' ? 'Modified' : 'Standard',
    row.score ?? '', sectionGrade(row, 'warmup'), sectionGrade(row, 'classwork'), sectionGrade(row, 'practice'), sectionGrade(row, 'dol'),
    row.points ? `${row.points.earned} / ${row.points.possible}` : '', row.attempts, row.exportSummary, row.changedSinceExport ? 'yes' : '',
    row.credits?.practicePass ? 'yes' : '', (row.credits?.assignmentOverride ? 1 : 0) + (row.credits?.questionOverrides || 0),
    row.requiredItems ? `${row.requiredItems.required} of ${row.requiredItems.of}` : '',
  ]));
};

export const caseQuestionsCsv = (model) => {
  const header = [
    'Assignment', 'Assignment ID', 'Section', 'Section question', 'Question ID', 'Type', 'Standards', 'Standards source', 'Condition',
    'Max attempts', 'Attempts used', 'Attempt 1', 'Attempt 2', 'Attempt 3', 'Later attempts', 'Attempt record', 'Outcome', 'Final credit',
    'Graded credit (after overrides / Recovery)', 'First attempt correct', 'Returned on a later visit', 'Last answer', 'Last answer time source', 'Tools on last attempt',
  ];
  return csv(header, list(model?.questions).map((row) => {
    const attempt = (index) => row.attempts[index]?.result || '';
    return [
      row.title, row.assignmentId, row.sectionLabel, row.sectionNumber, row.questionId || '', row.questionType, list(row.standards?.primary).join('; '),
      row.standardsSource || '', row.condition === 'modified' ? 'Modified' : 'Standard', row.maxAttempts, row.totalAttempts, attempt(0), attempt(1), attempt(2),
      row.attempts.slice(3).map((entry) => entry.result).join('; '), row.attemptsSource, row.outcomeLabel, row.finalCredit ?? '', row.gradedCredit ?? '',
      row.firstAttemptCorrect === null ? '' : (row.firstAttemptCorrect ? 'yes' : 'no'),
      row.repeatedReturn === null ? 'not determinable' : (row.repeatedReturn ? 'yes' : 'no'),
      iso(row.lastAttemptAtMs), CASE_PROVENANCE_LABEL[row.lastAttemptTimeProvenance] || '', list(row.lastAttemptSupports).join('; '),
    ];
  }));
};

export const caseFactsCsv = (model) => csv(
  ['Fact', 'Category', 'How known', 'Sources', 'Limitation'],
  list(model?.narrativeFacts).map((fact) => [
    fact.text, fact.category, fact.provenanceLabel, list(fact.sources).map((source) => [source.label, source.path].filter(Boolean).join(' — ')).join('; '), fact.limitation,
  ]),
);

/** The whole model, with the teacher's own next steps kept apart and labelled. */
export const caseReviewJson = (model, { nextSteps = '' } = {}) => JSON.stringify({
  ...model,
  teacherEnteredNextSteps: clean(nextSteps) ? { text: clean(nextSteps), label: TEACHER_AUTHORED_LABEL } : null,
}, null, 2);

export const caseReviewFileName = (model, kind, extension) => {
  const safe = (value) => clean(value).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'case';
  return `MathMaster-case-review_${safe(model?.meta?.studentId)}_${safe(model?.meta?.fromDateKey)}_to_${safe(model?.meta?.toDateKey)}${kind ? `_${safe(kind)}` : ''}.${extension}`;
};

export default caseReviewJson;
