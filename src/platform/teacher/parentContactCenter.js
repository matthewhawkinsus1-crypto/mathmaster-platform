import { canonicalPresentedAssignmentGrade, projectTeacherOverridesForDisplay } from '../grading/canonicalGradeProjection.js';
import { splitGrade, splitGradesBySection } from './gradeEvidence.js';

export const CONTACT_METHODS = Object.freeze(['phone', 'email', 'text', 'conference', 'voicemail', 'other']);
export const CONTACT_CATEGORIES = Object.freeze([
  'academics', 'missingWork', 'attendance', 'behavior', 'academicIntegrity', 'cellphone', 'positiveContact', 'other',
]);

const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);
const csv = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
const time = (value) => Date.parse(value || '') || 0;

/** Build the same override-aware assignment rows the production Grade Center displays. */
export const projectProgressBriefGrades = ({ student = {}, assignments = [] } = {}) => {
  const projected = projectTeacherOverridesForDisplay(student.gradesByAssignment || {}, student.teacherGradeOverridesByAssignment || {});
  return list(assignments).map((assignment) => {
    const tracker = projected[assignment.id];
    const grade = canonicalPresentedAssignmentGrade({ student, assignment });
    if (!tracker && grade == null) return null;
    const split = tracker ? splitGrade({ tracker, assignment }) : null;
    const records = tracker ? Object.values(tracker).filter((entry) => entry && typeof entry === 'object') : [];
    const attempts = records.reduce((sum, entry) => sum + (Number(entry.totalAttempts ?? entry.attemptCount) || 0), 0);
    const updated = records.map((entry) => entry.completedAt || entry.lastAttemptAt || entry.academicOccurredAt).filter(Boolean).sort().at(-1) || null;
    return {
      assignmentId: assignment.id, title: assignment.title, grade,
      status: grade != null && (split?.shape === 'complete' || !tracker) ? 'complete' : (split?.shape || 'incomplete'),
      attempts, completedAt: updated, updatedAt: updated,
      late: records.some((entry) => entry.late === true),
      sectionGrades: tracker ? splitGradesBySection({ tracker, assignment }) : null,
    };
  }).filter(Boolean);
};

export const validateContactDraft = (draft = {}) => {
  const errors = [];
  if (!clean(draft.studentId)) errors.push('Choose a student.');
  if (!clean(draft.occurredAt) || !time(draft.occurredAt)) errors.push('Enter a valid contact date and time.');
  if (!CONTACT_METHODS.includes(draft.method)) errors.push('Choose a contact method.');
  if (!CONTACT_CATEGORIES.includes(draft.category)) errors.push('Choose a reason.');
  if (!clean(draft.outcome)) errors.push('Record the outcome.');
  if (draft.followUpDate && !/^\d{4}-\d{2}-\d{2}$/.test(draft.followUpDate)) errors.push('Enter a valid follow-up date.');
  return errors;
};

/** Canonical studentId is the relationship; names are resolved from the current roster. */
export const groupContactsByStudent = ({ contacts = [], students = [] } = {}) => {
  const roster = new Map(list(students).map((student) => [clean(student.id || student.studentId), student]));
  const groups = new Map();
  list(contacts).forEach((contact) => {
    const studentId = clean(contact.studentId);
    if (!studentId) return;
    const student = roster.get(studentId);
    const studentName = clean(student?.displayName || student?.name || student?.studentName || contact.studentName) || 'Student name unavailable';
    if (!groups.has(studentId)) groups.set(studentId, { studentId, studentName, contacts: [] });
    groups.get(studentId).contacts.push({ ...contact, studentName });
  });
  return [...groups.values()]
    .map((group) => ({ ...group, contacts: group.contacts.sort((a, b) => time(b.occurredAt) - time(a.occurredAt)) }))
    .sort((a, b) => a.studentName.localeCompare(b.studentName));
};

export const contactsCsv = ({ contacts = [], students = [], classes = [] } = {}) => {
  const classNames = new Map(list(classes).map((entry) => [clean(entry.classId || entry.id), clean(entry.name || entry.className || entry.period)]));
  const header = ['Student name', 'Student ID', 'Class', 'Contact date/time', 'Method', 'Category', 'Notes', 'Outcome', 'Follow-up date'];
  const rows = groupContactsByStudent({ contacts, students }).flatMap((group) => group.contacts.map((entry) => [
    group.studentName, group.studentId, classNames.get(clean(entry.classId)) || clean(entry.classPeriod), entry.occurredAt,
    entry.method, entry.category, entry.notes, entry.outcome, entry.followUpDate,
  ]));
  return [header, ...rows].map((row) => row.map(csv).join(',')).join('\r\n');
};

const median = (values) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length < 5) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/**
 * Presentation-only brief. `gradeEntries` are canonical Grade Center projections;
 * this function deliberately performs no grade calculation or answer inspection.
 */
export const buildStudentProgressBrief = ({ student, gradeEntries = [], classGradeValues = [], masteryEvidence = [], attendance = [], extensions = [], overrideActions = [], supportHistory = [], contacts = [], returnCheckIns = [], sessionSummaries = [] } = {}) => {
  const studentId = clean(student?.id || student?.studentId);
  const entries = list(gradeEntries).filter((entry) => !entry.studentId || clean(entry.studentId) === studentId);
  const completed = entries.filter((entry) => entry.status === 'complete' || Number.isFinite(entry.grade));
  const missing = entries.filter((entry) => ['missing', 'incomplete', 'notStarted'].includes(entry.status));
  const late = completed.filter((entry) => entry.late === true);
  const scores = completed.map((entry) => Number(entry.grade)).filter(Number.isFinite);
  const recent = [...completed].sort((a, b) => time(b.completedAt || b.updatedAt) - time(a.completedAt || a.updatedAt)).slice(0, 5);
  const classMedian = median(classGradeValues.map(Number));
  const current = scores.length ? scores[scores.length - 1] : null;
  const neutralContext = classMedian == null || current == null ? null : current < classMedian - 5 ? 'below the class median' : current > classMedian + 5 ? 'above the class median' : 'near the class median';
  return {
    studentId,
    studentName: clean(student?.displayName || student?.name || student?.studentName) || 'Student name unavailable',
    assignmentGrades: entries,
    recentGradeTrend: recent.map((entry) => ({ assignment: entry.title || entry.assignmentTitle, grade: entry.grade })),
    completion: { completed: completed.length, assigned: entries.length, rate: entries.length ? completed.length / entries.length : null },
    missingAssignments: missing,
    timeliness: { onTime: completed.length - late.length, late: late.length },
    attempts: entries.reduce((sum, entry) => sum + (Number(entry.attempts) || 0), 0),
    engagementMinutes: Math.round(list(sessionSummaries).reduce((sum, entry) => sum + Math.max(0, Number(entry.activeSeconds) || 0), 0) / 60),
    sectionPerformance: entries.map((entry) => ({ assignment: entry.title || entry.assignmentTitle, sections: entry.sectionGrades || entry.sections || null })).filter((entry) => entry.sections),
    masteryEvidence: list(masteryEvidence), attendance: list(attendance), extensions: list(extensions), overrideActions: list(overrideActions),
    supportHistory: list(supportHistory), priorContacts: list(contacts), outstandingFollowUps: list(contacts).filter((entry) => entry.followUpDate && entry.followUpCompleted !== true),
    returnFromAbsenceFollowUps: list(returnCheckIns).filter((entry) => entry.studentId === studentId && entry.status === 'open'),
    neutralClassContext: classMedian == null ? null : { median: classMedian, comparison: neutralContext, sampleSize: classGradeValues.length },
  };
};

export const progressBriefText = (brief) => {
  const pct = (value) => value == null ? 'not available' : `${Math.round(value * 100)}%`;
  const summaries = (rows, fallback) => rows.map((entry) => clean(entry.summary || entry.title || entry.assignmentTitle || entry.teksCode || entry.skillId || entry.dateKey || entry.occurredAt)).filter(Boolean).join('; ') || fallback;
  return [
    `Student Progress Brief — ${brief.studentName}`,
    `Completion: ${brief.completion.completed}/${brief.completion.assigned} (${pct(brief.completion.rate)}); on time: ${brief.timeliness.onTime}; late: ${brief.timeliness.late}.`,
    `Missing/incomplete: ${brief.missingAssignments.map((entry) => entry.title || entry.assignmentTitle).join(', ') || 'none recorded'}.`,
    `Attempts: ${brief.attempts}; time on task: ${brief.engagementMinutes} minutes.`,
    `Recent grades: ${brief.recentGradeTrend.map((entry) => `${entry.assignment}: ${entry.grade}%`).join('; ') || 'not available'}.`,
    brief.neutralClassContext ? `Neutral class context: ${brief.neutralClassContext.comparison} (class median ${brief.neutralClassContext.median}%, n=${brief.neutralClassContext.sampleSize}).` : 'Neutral class context: not shown (fewer than 5 values or insufficient data).',
    `Attendance/absence: ${summaries(brief.attendance, 'none available')}.`,
    `Extensions or reopened work: ${summaries(brief.extensions, 'none available')}.`,
    `Teacher grade overrides / academic-integrity actions: ${summaries(brief.overrideActions, 'none available')}.`,
    `Recent mastery/skill evidence: ${summaries(brief.masteryEvidence, 'none available')}.`,
    `Intervention/support history: ${summaries(brief.supportHistory, 'none available')}.`,
    `Prior parent contacts: ${brief.priorContacts.length}; outstanding follow-ups: ${brief.outstandingFollowUps.map((entry) => entry.followUpDate).join(', ') || 'none'}; return-from-absence follow-ups: ${brief.returnFromAbsenceFollowUps.map((entry) => entry.returnDateKey || entry.lastMissedDateKey).filter(Boolean).join(', ') || 'none'}.`,
    'Privacy note: This brief contains summary facts only; student answer content is intentionally excluded.',
  ].join('\n');
};
