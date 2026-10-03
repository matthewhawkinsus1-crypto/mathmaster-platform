/*
 * THE STUDENT SUPPORT EVIDENCE REPORT — the model.
 *
 * A teacher picks one student, their class and a grading period (or dates, or
 * particular assignments). The report says what the student's plan required,
 * what MathMaster made available and applied, what the student used, what
 * staff documented, what service time was recorded, and how the work went —
 * each fact with its provenance, summary first.
 *
 * It replaces src/studentSupport.js buildIEPReportHtml, which listed every
 * assignment in the teacher's library, showed "0 min" where time was simply
 * not recorded, and presented configured supports as used.
 *
 * Rules this model keeps:
 *   * one row per REAL assignment instance: assigned to the student's class
 *     (or holding their recorded work); library copies never appear;
 *   * "no record" is reported as Not recorded — never as "not provided";
 *   * Standard and Modified work are summarized separately, never averaged
 *     together;
 *   * grades are "MathMaster grade contributions" (what Grade Export sends),
 *     never an official report-card average;
 *   * the report is a factual summary, not a compliance verdict.
 *
 * Pure: every input is passed in, so node tests exercise it directly.
 */
import { supportAutomationFor, supportById, supportLabel, SUPPORT_AUTOMATION, SUPPORT_CLASSIFICATION } from '../../../functions/shared/supportCatalog.mjs';
import { describeItemReduction } from '../../../functions/shared/reducedWorkload.mjs';
import {
  LEGACY_REVISION_ID, REVISION_STATUS, legacyProfileToRevision, revisionEffectiveOn, sortRevisionTimeline, toMillis,
} from '../../../functions/shared/supportProfileModel.mjs';
import {
  EVIDENCE_LEGEND, PROVENANCE, PROVIDER_ROLE_LABEL, REPORT_LIMITATIONS, summarizeServiceMinutes,
} from '../../../functions/shared/supportEvidenceModel.mjs';
import { describeDueDateExtension } from '../../../functions/shared/supportDeadline.mjs';
import { parseInstant, zonedDateKey } from '../../../functions/shared/instructionalCalendar.mjs';
import { assignmentIsForStudent } from '../../assignmentLifecycle.js';
import { normalizeGradingPeriodSettings, resolveAssignmentGradingPeriod } from '../student/gradingPeriods.js';
import { lastExportedRowsByStudent, snapshotsForPart } from '../gradeTransfer/gradeTransferHistory.js';
import { canonicalPresentedAssignmentGrade } from '../grading/canonicalGradeProjection.js';
import {
  ASSIGNMENT_STATUS, SCHOOL_TIME_ZONE, activeEvidence, buildAssignmentEvidenceRow, configuredSupportIds, supportAutomationUnder,
  distinctUses, evidenceRecordingStartMs, isStaffEvent,
} from './evidenceAggregation.js';
import { acceptStudentName, formatStudentName } from '../studentName.js';

export const SUPPORT_REPORT_SCHEMA_VERSION = 1;
export const TIMELINE_LIMIT = 400;
// Supports MathMaster records on EVERY opened assignment where they are
// configured — provided/available, or an explicit not-applicable/unavailable —
// so "X of Y eligible" is a fact. Every other platform support applies only to
// some content (a countdown to hide, a Step Algebra item, a due date that
// moved, a question that allows a calculator) and is reported as a count.
export const RECORDED_ON_EVERY_OPENED_ASSIGNMENT = Object.freeze(new Set([
  'reduced-item-count-same-rigor', 'declutter-ui', 'visual-chunking', 'high-contrast', 'large-text',
  'disable-idle-timer', 'word-processor-response', 'graph-paper', 'reteach-resources', 'study-sheet',
]));
// Supports with no assignment-level record at all (My Math Path only).
export const NOT_RECORDED_IN_ASSIGNMENTS = Object.freeze(new Set(['extra-attempts']));

/**
 * The implementation headline for one support: made available (on-demand
 * tools) or provided (automatic supports) out of the eligible work. Use is
 * shown in its own column and never lowers this figure.
 */
export const supportHeadline = (support) => {
  if (support.automation === 'manual') return 'Delivered by staff';
  if (support.recordedInAssignments === false) return 'Not recorded in assignments (My Math Path)';
  const verb = support.automation === 'platform-available' || (support.measurable || []).includes('available') ? 'Available' : 'Provided';
  const delivered = Number(support.assignmentsDelivered) || 0;
  // A ratio only where MathMaster records the support on every opened
  // assignment; elsewhere it applies to some content only, so a count.
  if (support.denominatorKnown) return `${verb} in ${delivered} of ${Number(support.assignmentsEligible) || 0} eligible`;
  return `${verb} in ${delivered} assignment${delivered === 1 ? '' : 's'} where it applied`;
};

const DAY_MS = 86400000;

const list = (value) => (Array.isArray(value) ? value : []);
const clean = (value) => String(value ?? '').trim();
const dateKeyOf = (ms) => (Number.isFinite(ms) ? zonedDateKey(ms, SCHOOL_TIME_ZONE) : null);
const average = (values) => {
  const numbers = values.filter((value) => Number.isFinite(value));
  return numbers.length ? Math.round(numbers.reduce((sum, value) => sum + value, 0) / numbers.length) : null;
};
const hasWork = (student, assignmentId) => Object.keys(student?.gradesByAssignment?.[assignmentId] || {}).length > 0;
const anchorMs = (row) => row.classDueAtMs ?? row.releaseAtMs ?? null;

// --- Which assignments belong in the report ---------------------------------------------

/**
 * The real assignment instances for this student in the selection.
 *
 * An instance belongs when it is assigned to the student's class, or when the
 * student has recorded work on it (they changed class during the period).
 * Unassigned library copies never belong, whatever their title; the count of
 * same-titled copies that were left out is returned so the report can say so.
 */
export const selectReportAssignments = ({
  assignments = [], student, gradingPeriodSettings = null, selection = {},
} = {}) => {
  const classId = clean(student?.classId);
  const periodId = clean(selection.gradingPeriodId) || 'all';
  const wanted = new Set(list(selection.assignmentIds).map(clean).filter(Boolean));
  const inRange = (assignment) => {
    const due = clean(assignment?.dueAt || assignment?.dueDate || assignment?.releaseAt || assignment?.releaseDate).slice(0, 10);
    if (!due) return !selection.fromDateKey && !selection.toDateKey;
    if (selection.fromDateKey && due < selection.fromDateKey) return false;
    if (selection.toDateKey && due > selection.toDateKey) return false;
    return true;
  };
  const included = [];
  const titles = new Set();
  list(assignments).forEach((assignment) => {
    if (!assignment?.id) return;
    const assignedToClass = Boolean(classId) && assignmentIsForStudent(assignment, { classId });
    const worked = hasWork(student, assignment.id);
    if (!assignedToClass && !worked) return;
    if (wanted.size && !wanted.has(assignment.id)) return;
    if (periodId !== 'all' && resolveAssignmentGradingPeriod(assignment, gradingPeriodSettings || {}).id !== periodId) return;
    if (!inRange(assignment)) return;
    included.push({ assignment, assignedToClass });
    titles.add(clean(assignment.title).toLowerCase());
  });
  const libraryCopiesExcluded = list(assignments).filter((assignment) => (
    !list(assignment?.assignedClassIds).length
    && !hasWork(student, assignment?.id)
    && titles.has(clean(assignment?.title).toLowerCase())
  )).length;
  included.sort((a, b) => clean(a.assignment.dueAt || a.assignment.dueDate).localeCompare(clean(b.assignment.dueAt || b.assignment.dueDate)));
  return { included, libraryCopiesExcluded };
};

// --- Grade impact: what Grade Export sent, and whether it has changed ----------------------

const exportGrade = (value) => (Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : null);

/** Export status for one gradebook item (a lesson section, or a whole assignment). */
export const exportStatusFor = ({ classId, assignmentId, sectionKey = '', studentId, currentGrade, snapshots = null } = {}) => {
  if (!Array.isArray(snapshots)) return { state: 'unavailable', label: 'Export history not loaded' };
  const history = snapshotsForPart({ classId, assignmentId, sectionKey: sectionKey || '' }, snapshots);
  if (!history.length) return { state: 'not-exported', label: 'Not exported' };
  const withStudent = history.find((snapshot) => list(snapshot.rows).some((row) => clean(row.studentId) === studentId));
  if (!withStudent) {
    const heldBack = history.some((snapshot) => list(snapshot.withheld).some((row) => clean(row.studentId) === studentId));
    return heldBack
      ? { state: 'held-back', label: 'Held back from the last file (individual deadline)' }
      : { state: 'not-in-file', label: 'Class exported; no grade for this student in the file' };
  }
  const exported = lastExportedRowsByStudent(history).get(studentId);
  const current = exportGrade(currentGrade);
  const exportedAtMs = toMillis(withStudent.createdAt);
  const uploadedAtMs = toMillis(withStudent.uploadConfirmedAt);
  const changed = current !== null && Number(exported?.grade) !== current;
  return {
    state: changed ? 'changed-since-export' : 'exported',
    label: changed
      ? `Changed since export (sent ${exported?.grade}, now ${current})`
      : `${uploadedAtMs ? 'Uploaded' : 'Exported'} ${dateKeyOf(uploadedAtMs || exportedAtMs) || ''} (sent ${exported?.grade})`,
    exportedGrade: Number.isFinite(Number(exported?.grade)) ? Number(exported.grade) : null,
    exportedAtMs,
    uploadedAtMs,
  };
};

const gradeImpactFor = ({ row, assignment, student, classId, snapshots }) => {
  const items = row.sections.length
    ? row.sections.map((section) => ({
      key: section.key,
      label: section.label,
      grade: section.excused ? null : exportGrade(section.score),
      excused: section.excused,
      exportStatus: exportStatusFor({ classId, assignmentId: row.assignmentId, sectionKey: section.key, studentId: student.id, currentGrade: section.excused ? null : section.score, snapshots }),
    }))
    : [{
      key: 'assignment',
      label: 'Whole assignment',
      grade: exportGrade(canonicalPresentedAssignmentGrade({ student, assignment })),
      excused: false,
      exportStatus: exportStatusFor({ classId, assignmentId: row.assignmentId, sectionKey: '', studentId: student.id, currentGrade: canonicalPresentedAssignmentGrade({ student, assignment }), snapshots }),
    }];
  return {
    items,
    type: clean(assignment?.assignmentType) || (row.sections.length ? 'lesson' : 'assignment'),
    weightNote: 'Each item is a separate gradebook entry in TEAMS; its category and weight are set in TEAMS, not in MathMaster. Item scores use MathMaster question weights.',
  };
};

// --- Profile section ------------------------------------------------------------------------

const describeEntries = (entries) => list(entries).map((entry) => {
  const catalog = supportById(entry?.id);
  let detail = '';
  if (entry?.params?.dueDateExtension) detail = describeDueDateExtension(entry.params.dueDateExtension);
  else if (catalog?.params?.includes('itemReduction')) detail = describeItemReduction(entry?.params?.itemReduction);
  return {
    id: entry.id,
    label: catalog?.label || entry.id,
    classification: catalog?.classification || 'unknown',
    // Under THIS revision's parameters (an automatic reduced item count is
    // the platform's to prove; a recorded-only one is staff-delivered).
    automation: supportAutomationFor(entry?.id, entry?.params || null) || catalog?.automation || null,
    detail,
    // Kept so every later reader can resolve the same parameters.
    params: entry?.params && typeof entry.params === 'object' ? entry.params : {},
    appliesTo: list(entry?.appliesTo),
    affectsIndependence: catalog?.affectsIndependence === true,
  };
});

const profileSection = ({ revisions, profile, fromDateKey, toDateKey }) => {
  const legacy = !list(revisions).length ? legacyProfileToRevision(profile) : null;
  const timeline = list(revisions).length ? sortRevisionTimeline(revisions) : (legacy ? [legacy] : []);
  const atEnd = list(revisions).length ? revisionEffectiveOn(revisions, toDateKey) : legacy;
  const atStart = list(revisions).length ? revisionEffectiveOn(revisions, fromDateKey) : legacy;
  const inRange = timeline.filter((revision) => {
    const start = revision.effectiveStart || '0000-00-00';
    return start <= toDateKey && (!revision.effectiveEnd || revision.effectiveEnd >= fromDateKey);
  });
  const warnings = [];
  if (!atEnd) warnings.push({ code: 'none', message: 'No support profile is recorded in MathMaster for this period.' });
  if (legacy) warnings.push({ code: 'unversioned', message: 'The profile was recorded before versioning: its effective dates, source and history are not recorded.' });
  if (list(revisions).length && !atStart) warnings.push({ code: 'starts-late', message: `No profile revision covers the start of the period (${fromDateKey}).` });
  if (atEnd?.effectiveEnd && atEnd.effectiveEnd < toDateKey && atEnd.status !== REVISION_STATUS.INACTIVE) {
    warnings.push({ code: 'expired', message: `The profile's end date (${atEnd.effectiveEnd}) passed during the period. MathMaster kept applying it until it was renewed or ended.` });
  }
  list(revisions).forEach((revision) => {
    const recordedKey = dateKeyOf(revision.createdAtMs ?? toMillis(revision.createdAt));
    if (revision.effectiveStart && recordedKey && recordedKey > revision.effectiveStart && !revision.legacySnapshot) {
      warnings.push({
        code: 'backdated',
        message: `Revision ${revision.revision} was entered on ${recordedKey} but is effective from ${revision.effectiveStart}; MathMaster could not apply it before ${recordedKey}.`,
      });
    }
  });
  return {
    status: atEnd ? (atEnd.legacy ? 'unversioned' : 'versioned') : 'none',
    current: atEnd ? {
      revisionId: atEnd.revisionId || atEnd.id || LEGACY_REVISION_ID,
      revision: atEnd.revision ?? 0,
      status: atEnd.status || REVISION_STATUS.ACTIVE,
      effectiveStart: atEnd.effectiveStart || null,
      effectiveEnd: atEnd.effectiveEnd || null,
      sourceLabel: atEnd.sourceLabel || null,
      sourceNote: atEnd.sourceNote || '',
      inclusionStatus: atEnd.inclusionStatus === true,
      accommodations: describeEntries(atEnd.accommodations),
      modifications: describeEntries(atEnd.modifications),
      serviceExpectations: list(atEnd.serviceExpectations).map((row) => ({ ...row, label: supportLabel(row.serviceType) })),
      recordedAtMs: atEnd.createdAtMs ?? toMillis(atEnd.createdAt),
      recordedBy: atEnd.createdByEmail || null,
      provenance: atEnd.legacy ? PROVENANCE.CONFIGURED : PROVENANCE.DOCUMENTED,
    } : null,
    revisionsInPeriod: inRange.map((revision) => ({
      revisionId: revision.revisionId || revision.id,
      revision: revision.revision ?? 0,
      effectiveStart: revision.effectiveStart || null,
      effectiveEnd: revision.effectiveEnd || null,
      status: revision.status,
      sourceLabel: revision.sourceLabel,
      recordedAtMs: revision.createdAtMs ?? toMillis(revision.createdAt),
      legacySnapshot: revision.legacySnapshot === true || revision.legacy === true,
    })),
    warnings,
  };
};

// --- Timeline -------------------------------------------------------------------------------

const EVENT_VERB = {
  available: 'made available',
  provided: 'provided',
  activated: 'activated',
  used: 'used',
  'teacher-documented': 'documented by teacher',
  'provider-documented': 'documented (provider)',
  declined: 'declined',
  'not-applicable': 'marked not applicable',
};

const timelineEntries = ({ revisions, evidence, serviceLog, supportSignals, titleOf, fromMs, toMs }) => {
  const entries = [];
  const within = (ms) => Number.isFinite(ms) && (fromMs === null || ms >= fromMs) && (toMs === null || ms <= toMs);
  list(revisions).forEach((revision) => {
    const at = revision.createdAtMs ?? toMillis(revision.createdAt);
    if (!within(at)) return;
    entries.push({
      atMs: at,
      kind: 'profile',
      provenance: PROVENANCE.DOCUMENTED,
      label: revision.legacySnapshot ? 'Pre-versioning profile snapshot recorded' : `Profile revision ${revision.revision} recorded (effective ${revision.effectiveStart})`,
      detail: [revision.sourceLabel, revision.createdByEmail ? `by ${revision.createdByEmail}` : ''].filter(Boolean).join(' · '),
    });
  });
  const voided = new Set(list(evidence).map((event) => clean(event.voidsEventId)).filter(Boolean));
  list(evidence).forEach((event) => {
    const at = event.occurredAtMs ?? toMillis(event.occurredAt);
    if (!within(at)) return;
    const isCorrection = Boolean(clean(event.voidsEventId));
    entries.push({
      atMs: at,
      kind: 'support',
      provenance: isStaffEvent(event) ? PROVENANCE.DOCUMENTED : PROVENANCE.RECORDED,
      classification: event.classification,
      label: isCorrection
        ? `Correction: an earlier ${supportLabel(event.supportId).toLowerCase()} record was withdrawn`
        : `${supportLabel(event.supportId)} — ${EVENT_VERB[event.eventType] || event.eventType}${voided.has(clean(event.id)) ? ' (withdrawn)' : ''}`,
      detail: [
        event.assignmentId ? titleOf(event.assignmentId) : '',
        Number.isInteger(event.questionIndex) ? `Q${event.questionIndex + 1}` : '',
        isStaffEvent(event) && event.actorEmail ? `by ${event.actorEmail}` : '',
        event.providerRole ? PROVIDER_ROLE_LABEL[event.providerRole] || event.providerRole : '',
        event.note || '',
      ].filter(Boolean).join(' · '),
      withdrawn: voided.has(clean(event.id)) || isCorrection,
    });
  });
  list(serviceLog).forEach((entry) => {
    const at = toMillis(entry.createdAt) ?? Date.parse(`${entry.dateKey}T12:00:00Z`);
    const onDay = Date.parse(`${entry.dateKey}T12:00:00Z`);
    if (!within(onDay)) return;
    entries.push({
      atMs: (parseInstant(entry.dateKey, { timeZone: SCHOOL_TIME_ZONE }) ?? onDay) + (Number.isFinite(entry.startMinute) ? entry.startMinute * 60000 : 12 * 3600000),
      kind: 'service',
      provenance: PROVENANCE.DOCUMENTED,
      label: entry.voidsEntryId ? 'Service entry correction (earlier entry withdrawn)' : `${supportLabel(entry.serviceType)} — ${entry.minutes} min recorded`,
      detail: [PROVIDER_ROLE_LABEL[entry.providerRole] || entry.providerRole, entry.providerLabel, entry.topic, entry.assignmentId ? titleOf(entry.assignmentId) : '', entry.note, entry.createdByEmail ? `recorded by ${entry.createdByEmail}` : '', Number.isFinite(at) ? `entered ${dateKeyOf(at)}` : ''].filter(Boolean).join(' · '),
      withdrawn: Boolean(entry.voidsEntryId),
    });
  });
  list(supportSignals).forEach((signal) => {
    const at = toMillis(signal.createdAtServer) ?? toMillis(signal.createdAt);
    if (!within(at)) return;
    entries.push({
      atMs: at,
      kind: 'classroom-record',
      provenance: signal.stage === 'systemSignal' ? PROVENANCE.DERIVED : PROVENANCE.DOCUMENTED,
      label: clean(signal.summary) || clean(signal.kind),
      detail: [signal.assignmentTitle, signal.note].filter(Boolean).join(' · '),
    });
  });
  return entries.sort((a, b) => a.atMs - b.atMs);
};

// --- The report -----------------------------------------------------------------------------

export const buildSupportEvidenceReport = ({
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
  exportSnapshots = null,
  nowValue = Date.now(),
  generatedByEmail = '',
} = {}) => {
  const now = Number(nowValue);
  const { included, libraryCopiesExcluded } = selectReportAssignments({ assignments, student, gradingPeriodSettings, selection });
  const recordingStartMs = evidenceRecordingStartMs({ revisions, evidence, engagement });
  const rows = included.map(({ assignment, assignedToClass }) => ({
    ...buildAssignmentEvidenceRow({ assignment, student, revisions, evidence, engagement, recordingStartMs, nowValue: now }),
    assignedToClass,
    assignmentType: clean(assignment.assignmentType) || null,
    gradingPeriod: resolveAssignmentGradingPeriod(assignment, gradingPeriodSettings || {}),
  }));
  rows.forEach((row) => {
    const assignment = included.find((entry) => entry.assignment.id === row.assignmentId)?.assignment;
    row.gradeImpact = gradeImpactFor({ row, assignment, student, classId: clean(student?.classId), snapshots: exportSnapshots });
  });

  // The period: what the teacher chose, else the span of the assignments. A
  // CURRENT marking period runs to today, so service time and classroom
  // records made after the last due date are not silently left out; a past
  // period ends with its last final cutoff.
  const anchors = rows.map(anchorMs).filter(Number.isFinite);
  const finals = rows.map((row) => row.effectiveFinalAtMs).filter(Number.isFinite);
  const periodId = clean(selection.gradingPeriodId) || 'all';
  const periodIsCurrent = periodId === 'all' || normalizeGradingPeriodSettings(gradingPeriodSettings || {}).currentPeriodId === periodId;
  const fromDateKey = clean(selection.fromDateKey)
    || (anchors.length ? dateKeyOf(Math.min(...anchors) - 14 * DAY_MS) : dateKeyOf(now - 30 * DAY_MS));
  const toDateKey = clean(selection.toDateKey)
    || dateKeyOf(periodIsCurrent ? now : Math.min(now, finals.length ? Math.max(...finals) : now));
  // School-day boundaries in the school's zone (DST-correct).
  const fromMs = parseInstant(fromDateKey, { timeZone: SCHOOL_TIME_ZONE });
  const toMs = parseInstant(toDateKey, { endOfDay: true, timeZone: SCHOOL_TIME_ZONE });

  const profile = profileSection({ revisions, profile: student?.profile, fromDateKey, toDateKey });
  const periodEvidence = activeEvidence(evidence).filter((event) => {
    const at = event.occurredAtMs ?? toMillis(event.occurredAt);
    return Number.isFinite(at) && at >= fromMs && at <= toMs;
  });
  const configured = profile.current ? configuredSupportIds({ ...profile.current, accommodations: profile.current.accommodations, modifications: profile.current.modifications }) : { accommodations: [], modifications: [] };

  // Support counts over the period: configured / assignments where available or
  // provided / uses / staff records — kept apart.
  const supportIds = [...new Set([...configured.accommodations, ...periodEvidence.map((event) => event.supportId)])]
    .filter((id) => supportById(id)?.classification !== SUPPORT_CLASSIFICATION.MODIFICATION);
  // ELIGIBLE: opened assignments in the period whose GOVERNING revision
  // configured the support as something MathMaster delivers (automatic or
  // platform-available under that revision) and where it was not recorded as
  // not applicable. "Made available / provided" is counted over those same
  // rows, so X never exceeds Y; use is supplemental and never lowers it (a
  // student choosing not to use an on-demand support is not a gap). Where
  // MathMaster does not record a support on every opened assignment (it
  // applies only to some content), the report gives a count, not a ratio.
  const openedByStudent = new Set(activeEvidence(evidence).filter((event) => !isStaffEvent(event)).map((event) => event.assignmentId).filter(Boolean));
  const opened = (row) => row.progress.attempted > 0 || row.status === ASSIGNMENT_STATUS.COMPLETED || openedByStudent.has(row.assignmentId);
  const openedRows = rows.filter(opened);
  const supports = supportIds.map((supportId) => {
    const catalog = supportById(supportId);
    const events = periodEvidence.filter((event) => event.supportId === supportId);
    const assignmentsWith = (types) => new Set(events.filter((event) => types.includes(event.eventType) && event.assignmentId).map((event) => event.assignmentId)).size;
    const configuredHere = openedRows
      .map((row) => ({ row, support: row.supports.find((entry) => entry.supportId === supportId && entry.configured) }))
      .filter(({ support }) => support && support.automation !== SUPPORT_AUTOMATION.MANUAL);
    const delivered = ({ support }) => support.available + support.provided > 0;
    const notApplicableRows = configuredHere.filter((entry) => entry.support.notApplicable > 0 && !delivered(entry));
    const eligibleRows = configuredHere.filter((entry) => !notApplicableRows.includes(entry));
    const automation = supportAutomationUnder(profile.current, supportId) || catalog?.automation || null;
    const currentEntry = list(profile.current?.accommodations).find((entry) => entry?.id === supportId) || null;
    return {
      supportId,
      label: catalog?.label || supportId,
      classification: catalog?.classification || 'unknown',
      automation,
      configured: configured.accommodations.includes(supportId),
      // A ratio only where every opened assignment gets a record either way.
      denominatorKnown: RECORDED_ON_EVERY_OPENED_ASSIGNMENT.has(supportId) && !list(currentEntry?.appliesTo).length,
      recordedInAssignments: !NOT_RECORDED_IN_ASSIGNMENTS.has(supportId),
      assignmentsEligible: eligibleRows.length,
      // The headline's numerator: eligible rows where it was made available
      // or provided (never more than the denominator).
      assignmentsDelivered: eligibleRows.filter(delivered).length,
      // Raw counts over the period's records, as before (case review tables).
      assignmentsAvailable: assignmentsWith(['available']),
      assignmentsProvided: assignmentsWith(['provided']),
      assignmentsNotApplicable: notApplicableRows.length,
      assignmentsUnavailable: eligibleRows.filter(({ support }) => support.unavailable > 0).length,
      assignmentsUsed: new Set(distinctUses(events).map((event) => event.assignmentId).filter(Boolean)).size,
      uses: distinctUses(events).length,
      staffRecords: events.filter(isStaffEvent).length,
      measurable: catalog?.evidence || [],
      // "Used" is reported only where the catalog says use is observable.
      tracksUse: (catalog?.evidence || []).includes('used'),
    };
  });

  const serviceEntries = list(serviceLog).filter((entry) => entry.dateKey >= fromDateKey && entry.dateKey <= toDateKey);
  const service = summarizeServiceMinutes(serviceEntries, { fromDateKey, toDateKey, expectations: profile.current?.serviceExpectations || [] });

  const count = (status) => rows.filter((row) => row.status === status).length;
  const worked = rows.filter((row) => row.progress.attempted > 0 || row.status === ASSIGNMENT_STATUS.COMPLETED);
  const completedStandard = rows.filter((row) => row.status === ASSIGNMENT_STATUS.COMPLETED && row.condition.value === 'standard');
  const completedModified = rows.filter((row) => row.status === ASSIGNMENT_STATUS.COMPLETED && row.condition.value === 'modified');
  const noTime = worked.filter((row) => row.engagement.provenance === PROVENANCE.NOT_RECORDED);
  const manualWithoutRecord = supports
    .filter((support) => support.configured && support.automation === SUPPORT_AUTOMATION.MANUAL && support.staffRecords === 0)
    .map((support) => support.label);
  const expectationGaps = service.expectations.map((row) => ({
    serviceType: row.serviceType,
    minutesPerWeek: row.minutesPerWeek,
    weeksWithRecords: row.weeks.filter((week) => week.recordedMinutes > 0).length,
  }));

  const gaps = [
    ...profile.warnings.map((warning) => warning.message),
    ...(noTime.length ? [`${noTime.length} assignment${noTime.length === 1 ? '' : 's'} with recorded work have no active time recorded.`] : []),
    ...(manualWithoutRecord.length ? [`No MathMaster staff record in this period of: ${manualWithoutRecord.join(', ')}. Support given outside MathMaster is not recorded here.`] : []),
    ...(rows.filter((row) => row.condition.note && row.condition.value === 'modified').length ? ['Some work is marked Modified by the earlier rule, which marked every item for a student with a modification configured.'] : []),
  ];

  const titleOf = (assignmentId) => clean(assignments.find((assignment) => assignment.id === assignmentId)?.title) || 'an assignment';
  const allTimeline = timelineEntries({ revisions, evidence, serviceLog: serviceEntries, supportSignals, titleOf, fromMs, toMs });

  const limitations = [...REPORT_LIMITATIONS];
  if (recordingStartMs) limitations.push(`Support recording for this student begins ${dateKeyOf(recordingStartMs)}. Earlier work can show scores, attempts and dates, but not support availability or use.`);
  else limitations.push('No support evidence has been recorded in MathMaster for this student yet; supports, use and active time are shown as Not recorded.');
  if (libraryCopiesExcluded) limitations.push(`${libraryCopiesExcluded} unassigned library cop${libraryCopiesExcluded === 1 ? 'y' : 'ies'} with the same title${libraryCopiesExcluded === 1 ? '' : 's'} as reported assignments ${libraryCopiesExcluded === 1 ? 'was' : 'were'} left out: only assignments given to this student are reported.`);

  return {
    schemaVersion: SUPPORT_REPORT_SCHEMA_VERSION,
    meta: {
      generatedAtMs: now,
      generatedByEmail: clean(generatedByEmail) || null,
      studentId: clean(student?.id),
      // The caller's name when it is really a name, else the record's resolved
      // name, else "Name unavailable". studentId is its own field; the report
      // never prints the id where the name belongs.
      studentName: acceptStudentName(studentName, student || {}) || formatStudentName(student || {}, { lastFirst: false }),
      classId: clean(student?.classId) || null,
      className: clean(classRecord?.name) || clean(classRecord?.period) || clean(student?.classPeriod) || null,
      gradingPeriodId: clean(selection.gradingPeriodId) || 'all',
      gradingPeriodLabel: clean(selection.gradingPeriodLabel) || (clean(selection.gradingPeriodId) && selection.gradingPeriodId !== 'all' ? selection.gradingPeriodId : 'All marking periods'),
      fromDateKey,
      toDateKey,
      assignmentFilter: list(selection.assignmentIds).length ? list(selection.assignmentIds) : null,
    },
    profile,
    summary: {
      assignmentsAssigned: rows.length,
      completed: count(ASSIGNMENT_STATUS.COMPLETED),
      completedAfterDue: rows.filter((row) => row.completedLate).length,
      inProgress: count(ASSIGNMENT_STATUS.IN_PROGRESS),
      notStarted: count(ASSIGNMENT_STATUS.NOT_STARTED) + count(ASSIGNMENT_STATUS.SCHEDULED),
      missing: count(ASSIGNMENT_STATUS.MISSING),
      closedIncomplete: count(ASSIGNMENT_STATUS.CLOSED_INCOMPLETE),
      excused: count(ASSIGNMENT_STATUS.EXCUSED),
      standardCount: rows.filter((row) => row.condition.value === 'standard').length,
      modifiedCount: rows.filter((row) => row.condition.value === 'modified').length,
      performance: {
        standard: { average: average(completedStandard.map((row) => row.score)), count: completedStandard.length },
        modified: { average: average(completedModified.map((row) => row.score)), count: completedModified.length },
        note: 'MathMaster grade contributions for completed work. Standard (grade-level) and Modified work are never averaged together.',
      },
      supports,
      staffRecords: periodEvidence.filter(isStaffEvent).length,
      activeMinutesRecorded: rows.reduce((sum, row) => sum + (row.engagement.source === 'ledger' ? row.engagement.activeMinutes || 0 : 0), 0),
      serviceMinutesRecorded: service.totalMinutes,
      expectationGaps,
      gaps,
    },
    assignments: rows,
    timeline: allTimeline.slice(-TIMELINE_LIMIT),
    timelineTruncated: allTimeline.length > TIMELINE_LIMIT,
    service: {
      ...service,
      fromDateKey,
      toDateKey,
      disclaimer: 'Minutes recorded by staff in MathMaster. MathMaster reports only what was recorded here and does not determine whether services met an IEP or 504 requirement.',
    },
    legend: EVIDENCE_LEGEND,
    limitations,
  };
};

// --- Exports ----------------------------------------------------------------------------------

// Exported so every MathMaster evidence export neutralises formulas the same way
// (the Student Case Review's CSVs use it too).
export const csvCell = (value) => {
  const text = value === null || value === undefined ? '' : String(value);
  // Neutralise spreadsheet formulas in teacher-entered text.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export const supportReportCsv = (report) => {
  const header = [
    'Assignment', 'Assignment ID', 'Class due', 'Individualized due', 'Final cutoff', 'Status', 'Completed after due',
    'MathMaster grade', 'Condition', 'Modifications applied', 'Warm-Up', 'Classwork', 'Practice', 'DOL', 'Attempts',
    'Active minutes', 'Active time source', 'Supports used', 'Staff records', 'Export status', 'Evidence gaps',
    // Appended (not inserted) so existing column positions are unchanged.
    'Required items (fewer items, same rigor)',
  ];
  const workloadCell = (row) => {
    const fact = row.workload?.recorded || row.workload?.current;
    if (!row.workload || !fact) return '';
    if (row.workload.recorded?.eventType === 'unavailable') return 'Could not be applied';
    return `${fact.assignedCount} of ${fact.originalCount} (${Number(fact.actualPercentTenths || 0) / 10}% fewer; target ${fact.targetPercent}%)${row.workload.recorded ? '' : ' [derived]'}`;
  };
  const sectionScore = (row, key) => row.sections.find((section) => section.key === key)?.score ?? '';
  const iso = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString() : '');
  const lines = [header.map(csvCell).join(',')];
  list(report?.assignments).forEach((row) => {
    lines.push([
      row.title, row.assignmentId, iso(row.classDueAtMs), iso(row.individualizedDue?.dueAtMs), iso(row.effectiveFinalAtMs),
      row.statusLabel, row.completedLate ? 'yes' : '', row.score ?? '', row.condition.value === 'modified' ? 'Modified' : 'Standard',
      row.condition.modifications.map(supportLabel).join('; '),
      sectionScore(row, 'warmup'), sectionScore(row, 'classwork'), sectionScore(row, 'practice'), sectionScore(row, 'dol'),
      row.attempts.total,
      row.engagement.activeMinutes ?? 'Not recorded',
      row.engagement.source,
      row.supports.filter((support) => support.used).map((support) => `${support.label} ${support.used}`).join('; '),
      row.staffEvents.length,
      list(row.gradeImpact?.items).map((item) => `${item.label}: ${item.exportStatus?.label || ''}`).join('; '),
      row.gaps.map((gap) => gap.message).join(' '),
      workloadCell(row),
    ].map(csvCell).join(','));
  });
  return `${lines.join('\r\n')}\r\n`;
};

export const supportReportJson = (report) => JSON.stringify(report, null, 2);

export const supportReportFileName = (report, extension) => {
  const safe = (value) => clean(value).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'report';
  return `MathMaster-support-evidence_${safe(report?.meta?.studentId)}_${safe(report?.meta?.fromDateKey)}_to_${safe(report?.meta?.toDateKey)}.${extension}`;
};

export default buildSupportEvidenceReport;
