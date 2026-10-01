/*
 * THE STUDENT CASE REVIEW — ONE STUDENT, ONE SELECTION, ONE CASE FILE.
 *
 * Builds on PR #401 instead of beside it. `buildSupportEvidenceReport` is
 * called once and supplies, unchanged: which assignment instances belong
 * (real instances for the student's class, never library copies), each
 * instance's status, dates, individualized deadline, Standard/Modified
 * condition, engagement with PR #401's precedence, support counts, export
 * status, service minutes, profile and the support timeline. This module adds
 * the academic layer: what happened on every question and attempt, the exact
 * MathMaster grade contribution, skills, DOL vs instruction, completion and work
 * pattern, the academic timeline, an optional official-gradebook
 * reconciliation, facts for a teacher narrative, and what needs attention.
 *
 * Pure: every input is passed in (see caseReviewStore.js for the loading), so
 * node tests exercise it end to end with synthetic records.
 *
 * Inputs that were not loaded are `undefined`/`null` and are reported as "not
 * loaded" — never as zero, never as "none".
 */
import { buildSupportEvidenceReport, exportStatusFor } from '../supportEvidence/supportEvidenceReport.js';
import { EVIDENCE_LEGEND, REPORT_LIMITATIONS } from '../../../functions/shared/supportEvidenceModel.mjs';
import { zonedDateKey } from '../../../functions/shared/instructionalCalendar.mjs';
import {
  canonicalPresentedAssignmentGrade, canonicalPresentedSectionGrade, projectedAssignmentTrackerFor, assignmentGradeOverrideFor,
} from '../grading/canonicalGradeProjection.js';
import { gradeWeightTotals } from '../teacher/gradeEvidence.js';
import { isTestCycleAssignment } from '../assessment/testCycle.js';
import { getStoredAssignmentTypeProjection } from '../contract/storedAssignmentV5.js';
import { CASE_PROVENANCE, CASE_PROVENANCE_LEGEND, fromSupportProvenance } from './caseProvenance.js';
import {
  analyzeAssignmentQuestions, attemptEventsForAssignment, describeAttemptSummary, summarizeQuestionOutcomes,
} from './attemptAnalysis.js';
import { analyzeSkills } from './skillAnalysis.js';
import { compareSections, describeSectionComparison } from './sectionComparison.js';
import { analyzeErrorPatterns } from './errorPatterns.js';
import { analyzeAssignmentCompletion, summarizeCompletion } from './completionAnalysis.js';
import { buildCaseTimeline } from './caseTimeline.js';
import { analyzeOfficialContribution, reconcileGradebook } from './sisReconciliation.js';
import { buildNarrativeFacts } from './narrativeFacts.js';
import { buildAttentionSummary } from './attentionSummary.js';

export const CASE_REVIEW_SCHEMA_VERSION = 1;
const SCHOOL_TIME_ZONE = 'America/Chicago';
const WEEK_MS = 7 * 86400000;
const TREND_MIN_POINTS = 4;

const list = (value) => (Array.isArray(value) ? value : []);
const clean = (value) => String(value ?? '').trim();
const average = (values) => {
  const numbers = values.filter(Number.isFinite);
  return numbers.length ? Math.round(numbers.reduce((sum, value) => sum + value, 0) / numbers.length) : null;
};

export const TYPE_LABEL = Object.freeze({
  notesClasswork: 'Lesson (notes / classwork)',
  practice: 'Practice',
  quiz: 'Quiz',
  test: 'Test',
  warmup: 'Warm-Up',
  testCycle: 'Test Cycle (secure test)',
});

export const WEIGHT_POLICY_NOTE = 'Within an assignment MathMaster weights questions by their question weight. Each lesson section is a separate gradebook item; its category and weight are set in the gradebook (TEAMS), not in MathMaster.';

/** Earlier half vs later half of a dated series; needs ≥ 4 points over ≥ 2 weeks. */
export const trendOf = (points = [], { threshold = 10 } = {}) => {
  const sorted = list(points).filter((point) => Number.isFinite(point.atMs) && Number.isFinite(point.value)).sort((a, b) => a.atMs - b.atMs);
  const weeks = new Set(sorted.map((point) => Math.floor(point.atMs / WEEK_MS)));
  if (sorted.length < TREND_MIN_POINTS || weeks.size < 2) {
    return { determinable: false, points: sorted.length, note: `A trend needs at least ${TREND_MIN_POINTS} dated values across two or more weeks.` };
  }
  const half = Math.ceil(sorted.length / 2);
  const earlier = average(sorted.slice(0, half).map((point) => point.value));
  const later = average(sorted.slice(half).map((point) => point.value));
  const change = later - earlier;
  return {
    determinable: true,
    points: sorted.length,
    earlier,
    later,
    change,
    direction: change >= threshold ? 'higher' : change <= -threshold ? 'lower' : 'similar',
    series: sorted,
  };
};

const practicePassKeySet = (keys) => (keys instanceof Set ? keys : new Set(list(keys)));

const gradeItemsFor = ({ row, assignment, student, classId, snapshots, practicePassRedeemed }) => {
  const sections = list(row.sections);
  if (!sections.length) {
    const grade = canonicalPresentedAssignmentGrade({ student, assignment, practicePassRedeemed });
    const rounded = Number.isFinite(grade) ? Math.max(0, Math.min(100, Math.round(grade))) : null;
    return [{
      key: 'assignment', label: 'Whole assignment', grade: rounded, excused: false,
      exportStatus: exportStatusFor({ classId, assignmentId: row.assignmentId, sectionKey: '', studentId: student.id, currentGrade: grade, snapshots }),
    }];
  }
  return sections.map((section) => {
    const excused = section.excused === true || (practicePassRedeemed && section.key === 'practice');
    const grade = excused ? null : canonicalPresentedSectionGrade({ student, assignment, sectionKey: section.key, practicePassRedeemed });
    return {
      key: section.key,
      label: section.label,
      grade: Number.isFinite(grade) ? Math.max(0, Math.min(100, Math.round(grade))) : null,
      excused,
      exportStatus: exportStatusFor({ classId, assignmentId: row.assignmentId, sectionKey: section.key, studentId: student.id, currentGrade: excused ? null : grade, snapshots }),
    };
  });
};

const describeExport = (items) => {
  const states = list(items).map((item) => item.exportStatus?.state);
  if (states.includes('changed-since-export')) return 'Changed since export';
  if (states.length && states.every((state) => state === 'exported')) return 'Exported';
  if (states.some((state) => state === 'exported')) return 'Partly exported';
  if (states.includes('held-back')) return 'Held back (individual deadline)';
  if (states.length && states.every((state) => state === 'unavailable')) return 'Export history not loaded';
  return 'Not exported';
};

const sourceStatus = ({ label, path, loaded, count = null, provenance, note = '', error = '' }) => ({
  label, path, loaded: Boolean(loaded), count, provenance, note, error,
});

/**
 * The case file. See the header for what comes from PR #401; `caseEvidence`
 * is the `loadStudentCaseEvidence` callable's response (null when it could not
 * be loaded), `sisSnapshot` an imported or saved gradebook snapshot.
 */
export const buildStudentCaseReview = ({
  student,
  studentName = '',
  classRecord = null,
  assignments = [],
  gradingPeriodSettings = null,
  selection = {},
  revisions = [],
  evidence = [],
  serviceLog = [],
  engagement = [],
  supportSignals = [],
  sessionSummaries = undefined,
  exportSnapshots = null,
  practicePassKeys = null,
  caseEvidence = null,
  caseEvidenceError = '',
  sisSnapshot = null,
  sisConfirmedMatches = {},
  nowValue = Date.now(),
  generatedByEmail = '',
} = {}) => {
  const now = Number(nowValue);
  const classId = clean(student?.classId) || null;
  const support = buildSupportEvidenceReport({
    student, studentName, classRecord, assignments, gradingPeriodSettings, selection, revisions, evidence, serviceLog, engagement, supportSignals, exportSnapshots, nowValue: now, generatedByEmail,
  });
  const assignmentById = new Map(list(assignments).map((assignment) => [assignment.id, assignment]));
  const passes = practicePassKeySet(practicePassKeys);
  const evidenceLoaded = Boolean(caseEvidence);

  // --- Per assignment ------------------------------------------------------------------------
  const entries = support.assignments.map((row) => {
    const assignment = assignmentById.get(row.assignmentId) || { id: row.assignmentId, title: row.title };
    const closedForStudent = Number.isFinite(row.effectiveFinalAtMs) && now > row.effectiveFinalAtMs;
    const events = evidenceLoaded ? attemptEventsForAssignment(caseEvidence.attemptEvents, row.assignmentId) : [];
    const isTestCycle = isTestCycleAssignment(assignment);
    const analysis = isTestCycle
      ? { questions: [] }
      : analyzeAssignmentQuestions({ assignment, student, attemptEvents: events, supportEvidence: evidence, closedForStudent });
    const questions = analysis.questions.map((question) => ({ ...question, condition: row.condition.value, title: row.title }));
    const practicePassRedeemed = passes.has(`${student?.id}__${classId}__${row.assignmentId}`);
    const gradeItems = gradeItemsFor({ row, assignment, student, classId, snapshots: exportSnapshots, practicePassRedeemed });
    const score = isTestCycle
      ? canonicalPresentedAssignmentGrade({ student, assignment })
      : canonicalPresentedAssignmentGrade({ student, assignment, practicePassRedeemed });
    const tracker = projectedAssignmentTrackerFor({ student, assignment });
    const weights = !isTestCycle && tracker ? gradeWeightTotals({ tracker, assignment, practicePassRedeemed }) : null;
    const completion = analyzeAssignmentCompletion({
      row,
      questions,
      attemptEvents: evidenceLoaded ? events : undefined,
      ledgerDocs: list(engagement).filter((doc) => clean(doc?.assignmentId) === row.assignmentId),
      sessionSummaries: sessionSummaries === undefined ? undefined : list(sessionSummaries).filter((summary) => clean(summary?.assignmentId) === row.assignmentId),
      supportEvidence: evidence,
      practice: evidenceLoaded ? (caseEvidence.practice?.[row.assignmentId] ?? null) : undefined,
      receipts: evidenceLoaded ? (caseEvidence.receipts?.[row.assignmentId] ?? null) : undefined,
      studentOverride: assignment?.studentOverrides?.[student?.id] || null,
      recovery: student?.sectionRecoveryByAssignment?.[row.assignmentId] || null,
      challenge: student?.warmupChallengeByAssignment?.[row.assignmentId] || null,
      nowValue: now,
    });
    const typeKey = isTestCycle ? 'testCycle' : getStoredAssignmentTypeProjection(assignment);
    const questionOverrides = Object.keys(student?.teacherGradeOverridesByAssignment?.[row.assignmentId] || {})
      .filter((key) => /^\d+$/.test(key) && student.teacherGradeOverridesByAssignment[row.assignmentId][key]?.active === true).length;
    return {
      assignmentId: row.assignmentId,
      instanceId: row.assignmentId,
      title: row.title,
      typeKey,
      type: TYPE_LABEL[typeKey] || typeKey,
      category: 'Set in the gradebook, not in MathMaster',
      isTestCycle,
      assignedToClass: row.assignedToClass,
      gradingPeriod: row.gradingPeriod,
      releaseAtMs: row.releaseAtMs,
      classDueAtMs: row.classDueAtMs,
      individualizedDueAtMs: row.individualizedDue?.dueAtMs ?? null,
      attendanceExtension: completion.reopened.attendanceExtension,
      finalAtMs: row.effectiveFinalAtMs,
      completedAtMs: completion.completedAt?.atMs ?? null,
      completedAtProvenance: completion.completedAt?.provenance ?? CASE_PROVENANCE.NOT_RECORDED,
      status: isTestCycle && Number.isFinite(score) ? 'completed' : row.status,
      statusLabel: isTestCycle && Number.isFinite(score) ? 'Completed (secure test)' : row.statusLabel,
      completedLate: row.completedLate,
      excused: row.status === 'excused',
      condition: { ...row.condition, caseProvenance: fromSupportProvenance(row.condition.provenance) },
      score: Number.isFinite(score) ? score : null,
      points: weights && Number.isFinite(weights.possibleWeight) && weights.possibleWeight > 0
        ? { earned: Math.round(weights.earnedWeight * 100) / 100, possible: Math.round(weights.possibleWeight * 100) / 100 }
        : null,
      sections: list(row.sections).map((section) => ({ ...section, excused: section.excused || (practicePassRedeemed && section.key === 'practice') })),
      gradeItems,
      exportSummary: describeExport(gradeItems),
      changedSinceExport: gradeItems.some((item) => item.exportStatus?.state === 'changed-since-export'),
      attempts: row.attempts.total,
      progress: row.progress,
      attemptSummary: summarizeQuestionOutcomes(questions),
      credits: {
        practicePass: practicePassRedeemed,
        assignmentOverride: Boolean(assignmentGradeOverrideFor(student, row.assignmentId)),
        questionOverrides,
        liveChallengeWarmup: Boolean(student?.warmupChallengeByAssignment?.[row.assignmentId]),
        recoveries: completion.reopened.recoveries.filter((recovery) => recovery.status === 'completed').map((recovery) => recovery.section),
      },
      weightPolicy: WEIGHT_POLICY_NOTE,
      recoveries: completion.reopened.recoveries,
      questions,
      completion,
      supportRow: row,
      gaps: row.gaps,
    };
  });

  const allQuestions = entries.flatMap((entry) => entry.questions);
  const attemptSummary = summarizeQuestionOutcomes(allQuestions);
  // Standard (grade-level) and Modified work are never combined unlabelled.
  const attemptSummaryByCondition = {
    standard: summarizeQuestionOutcomes(allQuestions.filter((question) => question.condition !== 'modified')),
    modified: summarizeQuestionOutcomes(allQuestions.filter((question) => question.condition === 'modified')),
  };
  const skills = analyzeSkills({ questions: allQuestions });
  const sectionComparison = compareSections({
    questions: allQuestions,
    assignmentRows: entries.map((entry) => ({ assignmentId: entry.assignmentId, title: entry.title, condition: entry.condition, isAssessment: entry.isTestCycle || ['quiz', 'test'].includes(entry.typeKey), score: entry.score, status: entry.status })),
  });
  const errorPatterns = analyzeErrorPatterns({ questions: allQuestions });
  const completionRows = entries.map((entry) => entry.completion);
  const completionSummary = summarizeCompletion(completionRows);

  // Tools recorded per assignment.
  const calculatorAssignments = entries.filter((entry) => entry.questions.some((question) => question.attempts.some((attempt) => attempt.calculatorUsed === true) || question.lastAttemptSupports.includes('Calculator'))
    || list(evidence).some((event) => event?.supportId === 'calculator' && event?.eventType === 'used' && clean(event?.assignmentId) === entry.assignmentId)).length;

  // --- Official gradebook ----------------------------------------------------------------------
  const parts = entries.flatMap((entry) => entry.gradeItems.map((item) => ({
    assignmentId: entry.assignmentId,
    title: entry.title,
    sectionKey: item.key === 'assignment' ? '' : item.key,
    sectionLabel: item.key === 'assignment' ? '' : item.label,
    label: item.key === 'assignment' ? entry.title : `${entry.title} — ${item.label}`,
    currentGrade: item.grade,
    excused: item.excused,
    exportStatus: item.exportStatus,
  })));
  const sis = sisSnapshot ? {
    meta: {
      fileName: clean(sisSnapshot.source?.fileName || sisSnapshot.fileName) || null,
      layout: clean(sisSnapshot.source?.layout || sisSnapshot.layout) || null,
      importedAtMs: Number.isFinite(sisSnapshot.importedAtMs) ? sisSnapshot.importedAtMs : null,
      importedByEmail: clean(sisSnapshot.importedByEmail) || null,
      saved: sisSnapshot.saved === true,
      matchedBy: sisSnapshot.matchedBy || null,
    },
    snapshot: sisSnapshot,
    reconciliation: reconcileGradebook({ snapshot: sisSnapshot, parts, confirmedMatches: sisConfirmedMatches }),
    contribution: analyzeOfficialContribution(sisSnapshot),
  } : null;

  // --- Summary ---------------------------------------------------------------------------------
  const count = (predicate) => entries.filter(predicate).length;
  const completedStandard = entries.filter((entry) => entry.status === 'completed' && entry.condition.value !== 'modified');
  const completedModified = entries.filter((entry) => entry.status === 'completed' && entry.condition.value === 'modified');
  const serverRows = completionRows.filter((row) => row.time.activeSource === 'ledger');
  const browserRows = completionRows.filter((row) => row.time.activeSource === 'legacy-browser');
  const datedBy = (entry) => entry.classDueAtMs ?? entry.releaseAtMs;
  const snapshot = {
    assigned: entries.length,
    started: count((entry) => entry.completion.started || entry.status === 'completed'),
    completed: count((entry) => entry.status === 'completed'),
    incomplete: count((entry) => ['in-progress', 'closed-incomplete'].includes(entry.status)),
    missing: count((entry) => entry.status === 'missing'),
    notStarted: count((entry) => ['not-started', 'scheduled'].includes(entry.status)),
    completedLate: count((entry) => entry.completedLate),
    excused: count((entry) => entry.status === 'excused'),
    standardCount: count((entry) => entry.condition.value !== 'modified'),
    modifiedCount: count((entry) => entry.condition.value === 'modified'),
    completedStandard: completedStandard.length,
    completedModified: completedModified.length,
    performance: {
      standard: { average: average(completedStandard.map((entry) => entry.score)), count: completedStandard.length },
      modified: { average: average(completedModified.map((entry) => entry.score)), count: completedModified.length },
      note: 'Average of MathMaster grade contributions on completed work. Standard (grade-level) and Modified work are never averaged together, and neither is the official average.',
    },
    officialSis: sis && Number.isFinite(sis.snapshot.officialAverage)
      ? { average: sis.snapshot.officialAverage, fileName: sis.meta.fileName, importedAtMs: sis.meta.importedAtMs, provenance: CASE_PROVENANCE.SIS }
      : null,
    activeTime: {
      serverMinutes: completionSummary.activeMinutesServer,
      serverAssignments: serverRows.length,
      browserMinutes: completionSummary.activeMinutesBrowser,
      browserAssignments: browserRows.length,
      notRecorded: completionSummary.timeNotRecorded,
    },
  };
  const trends = {
    score: trendOf(completedStandard.map((entry) => ({ atMs: datedBy(entry), value: entry.score }))),
    completion: trendOf(entries
      .filter((entry) => Number.isFinite(entry.finalAtMs) && entry.finalAtMs < now && !entry.excused)
      .map((entry) => ({ atMs: datedBy(entry), value: entry.status === 'completed' && !entry.completedLate ? 100 : 0 }))),
    // A DOL the student has not taken yet is not a zero in a trend.
    dol: trendOf(entries
      .filter((entry) => entry.condition.value !== 'modified' && (entry.sections.find((section) => section.key === 'dol')?.attempted || 0) > 0)
      .map((entry) => ({ atMs: datedBy(entry), value: entry.gradeItems.find((item) => item.key === 'dol')?.grade ?? null }))),
    firstAttempt: trendOf(entries
      .filter((entry) => entry.condition.value !== 'modified' && entry.attemptSummary.firstAttemptKnown >= 3)
      .map((entry) => ({ atMs: datedBy(entry), value: entry.attemptSummary.firstAttemptAccuracy }))),
    note: 'Grade-level (Standard) work only. Earlier half of the period compared with the later half, by due date; a difference of 10 points or more is "higher" or "lower". Trends describe the records; they do not explain them.',
  };

  // --- Evidence gaps and data sources -----------------------------------------------------------
  const gaps = [...support.summary.gaps];
  if (!evidenceLoaded) {
    gaps.push(`Per-attempt records, Practice Mode records and grade-change history could not be loaded${caseEvidenceError ? ` (${caseEvidenceError})` : ''}. Attempt sequences are derived from question records and earlier attempts are undated.`);
  } else if (attemptSummary.attemptsDerived + attemptSummary.attemptsMixed > 0) {
    gaps.push(`${attemptSummary.attemptsDerived + attemptSummary.attemptsMixed} answered question${attemptSummary.attemptsDerived + attemptSummary.attemptsMixed === 1 ? ' has' : 's have'} no per-attempt server record for some attempts (work recorded before the server kept one per attempt); those attempts are derived and undated.`);
  }
  if (completionSummary.noOpenRecord > 0) gaps.push(`${completionSummary.noOpenRecord} assignment${completionSummary.noOpenRecord === 1 ? ' has' : 's have'} no record of being opened. MathMaster does not record every open.`);
  if (sessionSummaries === undefined) gaps.push('Class-session summaries could not be loaded.');
  if (exportSnapshots === null) gaps.push('Grade export history could not be loaded, so export status reads "not loaded" rather than "not exported".');
  if (!errorPatterns.determinable && attemptSummary.scored > 0) gaps.push(errorPatterns.statement);
  if (skills.untagged.attempted > 0) gaps.push(skills.untagged.note);
  if (skills.platformInferred.attempted > 0) gaps.push(skills.platformInferred.note);
  if (!sis) gaps.push('No official gradebook snapshot is imported. MathMaster grade contributions are not the official average.');
  else if (!sis.contribution.sufficient) gaps.push(sis.contribution.explanation);

  const dataSources = {
    gradeRecord: sourceStatus({ label: 'Question records and grade projections', path: 'grades/{student}', loaded: true, provenance: CASE_PROVENANCE.DIRECT, note: 'Rolling question state; older records were written by the student\'s browser.' }),
    supportRecords: sourceStatus({ label: 'Support profile, evidence, service log, active-minute ledger (PR #401)', path: 'grades/{student}/support*, engagementMinutes', loaded: true, count: list(evidence).length, provenance: CASE_PROVENANCE.DIRECT }),
    attemptEvents: sourceStatus({ label: 'Per-attempt events', path: 'grades/{student}/evidenceEvents (via loadStudentCaseEvidence)', loaded: evidenceLoaded, count: evidenceLoaded ? list(caseEvidence.attemptEvents).length : null, provenance: CASE_PROVENANCE.DIRECT, error: caseEvidenceError, note: evidenceLoaded && caseEvidence.truncated?.events ? 'More events exist than were loaded.' : '' }),
    practice: sourceStatus({ label: 'Practice Mode records', path: 'studentWorkspaceDrafts (practice only, via loadStudentCaseEvidence)', loaded: evidenceLoaded, count: evidenceLoaded ? Object.keys(caseEvidence.practice || {}).length : null, provenance: CASE_PROVENANCE.LEGACY }),
    receipts: sourceStatus({ label: 'Submission receipts', path: 'studentSubmissionReceipts (via loadStudentCaseEvidence)', loaded: evidenceLoaded, provenance: CASE_PROVENANCE.DIRECT }),
    overrideAudits: sourceStatus({ label: 'Teacher grade-change audits', path: 'grades/{student}/gradeOverrideAudits (via loadStudentCaseEvidence)', loaded: evidenceLoaded, count: evidenceLoaded ? list(caseEvidence.overrideAudits).length : null, provenance: CASE_PROVENANCE.STAFF }),
    sessionSummaries: sourceStatus({ label: 'Class-session summaries', path: 'studentSessionSummaries', loaded: sessionSummaries !== undefined, count: sessionSummaries === undefined ? null : list(sessionSummaries).length, provenance: CASE_PROVENANCE.LEGACY, note: 'Client-clock times; Practice Mode sessions are not flagged.' }),
    exportHistory: sourceStatus({ label: 'Grade export history', path: 'gradeTransferSnapshots (via listGradeTransferState)', loaded: exportSnapshots !== null, count: Array.isArray(exportSnapshots) ? exportSnapshots.length : null, provenance: CASE_PROVENANCE.DIRECT }),
    sisSnapshot: sourceStatus({ label: 'Official gradebook snapshot', path: sis?.meta.saved ? 'grades/{student}/sisGradebookSnapshots' : 'imported in this session', loaded: Boolean(sis), provenance: CASE_PROVENANCE.SIS }),
  };

  const timeline = buildCaseTimeline({
    assignments: entries.map((entry) => ({
      row: entry.supportRow,
      questions: entry.questions,
      events: evidenceLoaded ? attemptEventsForAssignment(caseEvidence.attemptEvents, entry.assignmentId) : [],
      completion: entry.completion,
      gradeImpact: { items: entry.gradeItems },
    })),
    supportTimeline: support.timeline,
    overrideAudits: evidenceLoaded ? caseEvidence.overrideAudits : [],
  });

  const model = {
    schemaVersion: CASE_REVIEW_SCHEMA_VERSION,
    meta: {
      ...support.meta,
      sisStudentIdOnFile: Boolean(clean(student?.sisStudentId)),
      evidenceLoaded,
    },
    summary: {
      snapshot,
      sections: sectionComparison.byCondition,
      trends,
    },
    assignments: entries,
    questions: allQuestions,
    attemptSummary,
    attemptSummaryByCondition,
    attemptSummaryText: {
      standard: describeAttemptSummary(attemptSummaryByCondition.standard),
      modified: attemptSummaryByCondition.modified.scored ? describeAttemptSummary(attemptSummaryByCondition.modified) : '',
    },
    skills,
    sectionComparison,
    sectionComparisonLines: describeSectionComparison(sectionComparison),
    errorPatterns,
    completion: { assignments: completionRows, summary: completionSummary },
    supportEvidence: {
      profile: support.profile,
      summary: support.summary,
      service: support.service,
      legend: EVIDENCE_LEGEND,
    },
    timeline,
    sis,
    tools: { calculatorAssignments },
    evidenceGaps: gaps,
    dataSources,
    legend: { provenance: CASE_PROVENANCE_LEGEND, support: EVIDENCE_LEGEND },
    limitations: [
      ...REPORT_LIMITATIONS,
      'Question records keep each question\'s latest state, not a log. Where MathMaster has no per-attempt record, earlier attempts are derived from that state and read "not correct"; their partial credit and times are not stored.',
      'Responses to earlier attempts are not stored anywhere. The Response Inspector shows the latest attempt only.',
      'Skills come from each question\'s own standards metadata. Questions without it are not assigned a skill, and no skill is taken from an assignment title.',
      'No error pattern is inferred from a wrong answer; only structured codes stored by MathMaster tools are reported.',
      'MathMaster keeps no general record of opening an assignment and no separate turn-in record; "opened" and "completed on" are taken from the records that exist and are labelled so.',
      'Practice Mode time is not recorded. Practice Mode activity times come from the student\'s device clock.',
      ...support.limitations.filter((line) => !REPORT_LIMITATIONS.includes(line)),
    ],
    generatedAtMs: now,
    windowDateKeys: { from: support.meta.fromDateKey, to: support.meta.toDateKey, todayKey: zonedDateKey(now, SCHOOL_TIME_ZONE) },
  };
  model.narrativeFacts = buildNarrativeFacts(model);
  model.attention = buildAttentionSummary(model, { nowValue: now });
  return model;
};

export default buildStudentCaseReview;
