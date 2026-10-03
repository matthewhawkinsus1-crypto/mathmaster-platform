/*
 * ONE ASSIGNMENT, ONE STUDENT: WHAT THE RECORDS SHOW.
 *
 * The student drawer, the assignment hub's Supports layer and the support
 * evidence report all describe a student's work on an assignment. They build
 * that description here, once, so the three can never tell a teacher different
 * things — the same way the PR #400 hub reuses the gradebook's progress model.
 *
 * Every fact carries its provenance (functions/shared/supportEvidenceModel.mjs
 * PROVENANCE): recorded by MathMaster, documented by staff, derived from other
 * records, configured only, or not recorded. "Not recorded" is never turned
 * into "not provided".
 *
 * Scores, completion and sections come from the SAME functions the gradebook,
 * the hub and Grade Export use (studentAssignmentProgress,
 * canonicalPresentedSectionGrade), so a report cannot disagree with the grade a
 * teacher exported.
 */
import {
  INCLUSION_IMPLIED_SUPPORT_IDS,
  SUPPORT_AUTOMATION,
  SUPPORT_CLASSIFICATION,
  supportAutomationFor,
  supportById,
} from '../../../functions/shared/supportCatalog.mjs';
import {
  REDUCED_WORKLOAD_SUPPORT_ID,
  WORKLOAD_STATUS,
  WORKLOAD_VARIANCE_LABEL,
  resolveStudentWorkload,
} from '../../../functions/shared/reducedWorkload.mjs';
import {
  LEGACY_REVISION_ID,
  REVISION_STATUS,
  governingRevisionsAt,
  legacyProfileToRevision,
  revisionEffectiveOn,
  toMillis,
} from '../../../functions/shared/supportProfileModel.mjs';
import { planWindowOn, resolveStudentSupportDeadline } from '../../../functions/shared/supportDeadline.mjs';
import {
  ACTOR_TYPE,
  EVIDENCE_EVENT_TYPE,
  PROVENANCE,
  summarizeEngagementMinutes,
} from '../../../functions/shared/supportEvidenceModel.mjs';
import { parseInstant, zonedDateKey } from '../../../functions/shared/instructionalCalendar.mjs';
import { normalizeQuestionRecord } from '../../../functions/shared/attemptPolicy.mjs';
import { PROGRESS_STATE, studentAssignmentProgress } from '../teacher/assignmentProgress.js';
import { canonicalPresentedSectionGrade, projectTeacherOverridesForDisplay } from '../grading/canonicalGradeProjection.js';
import { splitGradesBySection } from '../teacher/gradeEvidence.js';

export const SCHOOL_TIME_ZONE = 'America/Chicago';
export const SECTION_KEYS = Object.freeze(['warmup', 'classwork', 'practice', 'dol']);
export const SECTION_LABEL = Object.freeze({ warmup: 'Warm-Up', classwork: 'Classwork', practice: 'Practice', dol: 'DOL' });

export const ASSIGNMENT_STATUS = Object.freeze({
  SCHEDULED: 'scheduled',
  NOT_STARTED: 'not-started',
  IN_PROGRESS: 'in-progress',
  COMPLETED: 'completed',
  MISSING: 'missing',
  CLOSED_INCOMPLETE: 'closed-incomplete',
  EXCUSED: 'excused',
});

export const ASSIGNMENT_STATUS_LABEL = Object.freeze({
  scheduled: 'Assigned · not open yet',
  'not-started': 'Assigned · not started',
  'in-progress': 'In progress',
  completed: 'Completed',
  missing: 'Missing',
  'closed-incomplete': 'Closed · incomplete',
  excused: 'Excused',
});

const list = (value) => (Array.isArray(value) ? value : []);
const clean = (value) => String(value ?? '').trim();
const unique = (values) => [...new Set(list(values).filter(Boolean))];

// --- Evidence events ----------------------------------------------------------------

export const isStaffEvent = (event) => [ACTOR_TYPE.TEACHER, ACTOR_TYPE.PROVIDER].includes(event?.actorType);

/**
 * Events minus corrections. A correction never counts; the record it
 * withdraws drops out only when it is a staff record by the SAME author (the
 * rules enforce this on write; honoured here too for anything stored before).
 * A later teacher cannot erase an earlier teacher's documentation.
 */
export const activeEvidence = (events = []) => {
  const all = list(events);
  const byId = new Map(all.map((event) => [clean(event?.id), event]));
  const voided = new Set();
  all.forEach((event) => {
    const targetId = clean(event?.voidsEventId);
    if (!targetId) return;
    const target = byId.get(targetId);
    if (target && isStaffEvent(target) && clean(target.actorEmail) && clean(target.actorEmail) === clean(event.actorEmail)) voided.add(targetId);
  });
  return all.filter((event) => !clean(event?.voidsEventId) && !voided.has(clean(event?.id)));
};

const minuteOf = (event) => {
  const at = Number.isFinite(event?.occurredAtMs) ? event.occurredAtMs : toMillis(event?.occurredAt);
  return Number.isFinite(at) ? Math.floor(at / 60000) : null;
};

/**
 * "Used" records counted once per support, assignment, question and minute —
 * the same de-duplication the student's client applies, so a scripted client
 * cannot inflate a student's recorded use.
 */
export const distinctUses = (events = []) => {
  const seen = new Set();
  return list(events).filter((event) => {
    if (event?.eventType !== EVIDENCE_EVENT_TYPE.USED) return false;
    const key = [clean(event.supportId), clean(event.assignmentId), event.questionIndex ?? '-', minuteOf(event) ?? clean(event.id)].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/** Counts per support. `documented` = staff records of delivery. */
export const countEvidenceBySupport = (events = []) => {
  const counts = new Map();
  const active = activeEvidence(events);
  const countedUses = new Set(distinctUses(active));
  active.forEach((event) => {
    if (event?.eventType === EVIDENCE_EVENT_TYPE.USED && !countedUses.has(event)) return;
    const supportId = clean(event?.supportId);
    if (!supportId) return;
    const bucket = counts.get(supportId) || {
      supportId, available: 0, provided: 0, activated: 0, used: 0, documented: 0, declined: 0, notApplicable: 0, unavailable: 0, lastAtMs: null,
    };
    const type = event.eventType;
    if (type === EVIDENCE_EVENT_TYPE.AVAILABLE) bucket.available += 1;
    else if (type === EVIDENCE_EVENT_TYPE.UNAVAILABLE) bucket.unavailable += 1;
    else if (type === EVIDENCE_EVENT_TYPE.PROVIDED && !isStaffEvent(event)) bucket.provided += 1;
    else if (type === EVIDENCE_EVENT_TYPE.ACTIVATED) bucket.activated += 1;
    else if (type === EVIDENCE_EVENT_TYPE.USED) bucket.used += 1;
    else if (type === EVIDENCE_EVENT_TYPE.DECLINED) bucket.declined += 1;
    else if (type === EVIDENCE_EVENT_TYPE.NOT_APPLICABLE) bucket.notApplicable += 1;
    else if (isStaffEvent(event)) bucket.documented += 1;
    const at = Number.isFinite(event.occurredAtMs) ? event.occurredAtMs : toMillis(event.occurredAt);
    if (Number.isFinite(at) && (!bucket.lastAtMs || at > bucket.lastAtMs)) bucket.lastAtMs = at;
    counts.set(supportId, bucket);
  });
  return counts;
};

/** The earliest moment anything in the evidence system was recorded for this student. */
export const evidenceRecordingStartMs = ({ revisions = [], evidence = [], engagement = [] } = {}) => {
  const candidates = [
    ...list(revisions).filter((revision) => !revision?.legacy).map((revision) => revision.createdAtMs ?? toMillis(revision.createdAt)),
    ...list(evidence).map((event) => event.occurredAtMs ?? toMillis(event.occurredAt)),
    ...list(engagement).flatMap((doc) => list(doc?.minutes).map((minute) => Number(minute) * 60000)),
  ].filter((value) => Number.isFinite(value) && value > 0);
  return candidates.length ? Math.min(...candidates) : null;
};

// --- The profile that governed an assignment ------------------------------------------

const windowAsRevision = (window) => (window ? { ...window, id: window.revisionId, revisionId: window.revisionId } : null);

/**
 * The support profile that governed one assignment, as documented: the
 * revision in effect on the class due date (or the release date, or today).
 * With the privileged `revisions` it is exact; without them (a live screen)
 * it falls back to the student's projection windows, then the legacy profile.
 */
export const governingProfileForAssignment = ({ assignment, revisions = [], profile = null, nowValue = Date.now() } = {}) => {
  const anchor = parseInstant(assignment?.dueAt || assignment?.dueDate, { endOfDay: true, timeZone: SCHOOL_TIME_ZONE })
    ?? parseInstant(assignment?.releaseAt || assignment?.releaseDate, { timeZone: SCHOOL_TIME_ZONE })
    ?? Number(nowValue);
  const dateKey = zonedDateKey(anchor, SCHOOL_TIME_ZONE);
  if (list(revisions).length) {
    const revision = revisionEffectiveOn(revisions, dateKey);
    const history = governingRevisionsAt(revisions, anchor, { timeZone: SCHOOL_TIME_ZONE });
    return {
      revision,
      dateKey,
      provenance: revision ? (revision.legacySnapshot ? PROVENANCE.CONFIGURED : PROVENANCE.DOCUMENTED) : PROVENANCE.NOT_RECORDED,
      backdated: Boolean(revision && history.backdated),
      source: 'revisions',
    };
  }
  const window = planWindowOn(profile, dateKey);
  if (window) return { revision: windowAsRevision(window), dateKey, provenance: PROVENANCE.CONFIGURED, backdated: false, source: 'projection' };
  const legacy = legacyProfileToRevision(profile);
  if (legacy) return { revision: legacy, dateKey, provenance: PROVENANCE.CONFIGURED, backdated: false, source: 'legacy' };
  return { revision: null, dateKey, provenance: PROVENANCE.NOT_RECORDED, backdated: false, source: 'none' };
};

const activeRevision = (revision) => (revision && revision.status !== REVISION_STATUS.INACTIVE ? revision : null);

/**
 * How a support is delivered under ONE revision (its own parameters): a
 * reduced item count is automatic only where that revision set a percentage.
 * Gap rules ask this, so a recorded-only support is never a platform gap and
 * an automatic one never needs a staff record.
 */
export const supportAutomationUnder = (revision, supportId) => {
  const entry = list(activeRevision(revision)?.accommodations).find((item) => item?.id === supportId) || null;
  return supportAutomationFor(supportId, entry?.params || null) || supportById(supportId)?.automation || null;
};

/**
 * What the reduced-item accommodation did on one assignment: the record the
 * student's own client wrote when the work opened (target, original,
 * assigned, actual, why they differ), checked against the projection
 * MathMaster computes from the same inputs now. "Verified" means the two
 * agree; a later content revision or a pinned answer can make them differ,
 * and that is shown, not hidden.
 */
export const workloadFactFor = ({ assignment, student, events = [], nowValue = Date.now() } = {}) => {
  const tracker = projectTeacherOverridesForDisplay(student?.gradesByAssignment || {}, student?.teacherGradeOverridesByAssignment || {})?.[assignment?.id] || null;
  let current = null;
  try {
    current = resolveStudentWorkload({ assignment, profile: student?.profile || null, tracker, nowValue });
  } catch {
    current = null;
  }
  const records = list(events)
    .filter((event) => event?.supportId === REDUCED_WORKLOAD_SUPPORT_ID && !isStaffEvent(event))
    .filter((event) => [EVIDENCE_EVENT_TYPE.PROVIDED, EVIDENCE_EVENT_TYPE.NOT_APPLICABLE, EVIDENCE_EVENT_TYPE.UNAVAILABLE].includes(event.eventType))
    .map((event) => ({ ...event, occurredAtMs: event.occurredAtMs ?? toMillis(event.occurredAt) }))
    .sort((a, b) => (b.occurredAtMs || 0) - (a.occurredAtMs || 0));
  const recorded = records[0] || null;
  const status = current?.status || WORKLOAD_STATUS.NONE;
  if (!recorded && (status === WORKLOAD_STATUS.NONE || status === WORKLOAD_STATUS.MANUAL)) return null;
  const details = recorded?.details || null;
  const verified = Boolean(recorded && details && current?.summary
    && details.contentFingerprint === current.summary.contentFingerprint
    && Number(details.assignedCount) === Number(current.summary.assignedCount));
  return {
    recorded: recorded ? {
      eventType: recorded.eventType,
      occurredAtMs: recorded.occurredAtMs || null,
      targetPercent: details?.targetPercent ?? null,
      originalCount: details?.originalCount ?? null,
      assignedCount: details?.assignedCount ?? null,
      actualPercentTenths: details?.actualPercentTenths ?? null,
      variance: list(details?.variance),
      reason: details?.reason || null,
      contentFingerprint: details?.contentFingerprint || null,
    } : null,
    current: current?.summary || null,
    status,
    verified,
    provenance: recorded ? PROVENANCE.RECORDED : PROVENANCE.DERIVED,
    varianceText: list(details?.variance || current?.summary?.variance).map((code) => WORKLOAD_VARIANCE_LABEL[code]).filter(Boolean),
  };
};

export const configuredSupportIds = (revision) => {
  const active = activeRevision(revision);
  if (!active) return { accommodations: [], modifications: [] };
  return {
    accommodations: unique([
      ...list(active.accommodations).map((entry) => entry?.id),
      ...(active.inclusionStatus ? INCLUSION_IMPLIED_SUPPORT_IDS : []),
    ]),
    modifications: unique(list(active.modifications).map((entry) => entry?.id)),
  };
};

/** The individualized deadline a revision gives an assignment (derived, never stored). */
export const deadlineUnderRevision = (assignment, revision) => {
  const active = activeRevision(revision);
  if (!active) return null;
  return resolveStudentSupportDeadline({
    assignment,
    profile: {
      supportPlan: {
        windows: [{
          revisionId: active.revisionId || active.id || LEGACY_REVISION_ID,
          revision: active.revision,
          status: active.status || 'active',
          effectiveStart: null,
          accommodations: list(active.accommodations),
        }],
      },
    },
  });
};

// --- Work -----------------------------------------------------------------------------

const workTimestamps = (student, assignmentId) => {
  const projected = projectTeacherOverridesForDisplay(student?.gradesByAssignment || {}, student?.teacherGradeOverridesByAssignment || {});
  const tracker = projected?.[assignmentId] || {};
  let firstAtMs = null;
  let lastAtMs = null;
  let totalAttempts = 0;
  Object.values(tracker).forEach((raw) => {
    const record = normalizeQuestionRecord(raw);
    totalAttempts += Number(record.totalAttempts) || 0;
    const at = toMillis(record.lastAttemptAt);
    if (Number.isFinite(at)) {
      firstAtMs = firstAtMs === null ? at : Math.min(firstAtMs, at);
      lastAtMs = lastAtMs === null ? at : Math.max(lastAtMs, at);
    }
  });
  return { firstAtMs, lastAtMs, totalAttempts, hasTracker: Object.keys(tracker).length > 0 };
};

const sectionScores = (student, assignment) => {
  const projected = projectTeacherOverridesForDisplay(student?.gradesByAssignment || {}, student?.teacherGradeOverridesByAssignment || {});
  // The student's own items: a reduced-item accommodation shrinks the totals.
  const split = splitGradesBySection({ tracker: projected?.[assignment?.id] || null, assignment, supportProfile: student?.profile || null }) || {};
  return SECTION_KEYS
    .filter((key) => Number(split?.[key]?.total) > 0)
    .map((key) => ({
      key,
      label: SECTION_LABEL[key],
      score: canonicalPresentedSectionGrade({ student, assignment, sectionKey: key }),
      attempted: Number(split?.[key]?.attempted) || 0,
      total: Number(split?.[key]?.total) || 0,
      reducedFrom: Number(split?.[key]?.reducedFrom) || null,
      excused: split?.[key]?.excused === true,
    }));
};

// --- The row ---------------------------------------------------------------------------

/**
 * Everything the records show about one student's support and work on one
 * assignment. `student` is the full grade record (gradesByAssignment,
 * teacherGradeOverridesByAssignment, testCycleGrades, assignmentActivity,
 * supportUsageByAssignment) plus `id` and `profile`.
 */
export const buildAssignmentEvidenceRow = ({
  assignment,
  student,
  revisions = [],
  evidence = [],
  engagement = [],
  recordingStartMs = null,
  nowValue = Date.now(),
} = {}) => {
  const assignmentId = clean(assignment?.id);
  const studentId = clean(student?.id);
  const now = Number(nowValue);
  const governing = governingProfileForAssignment({ assignment, revisions, profile: student?.profile, nowValue: now });
  const configured = configuredSupportIds(governing.revision);

  // Dates: class, attendance extension (recorded), individualized (derived).
  const classDueAtMs = parseInstant(assignment?.dueAt || assignment?.dueDate, { endOfDay: true, timeZone: SCHOOL_TIME_ZONE });
  const classFinalAtMs = parseInstant(
    assignment?.lateDueAt || assignment?.lateDueDate || assignment?.dueAt || assignment?.dueDate,
    { endOfDay: true, timeZone: SCHOOL_TIME_ZONE },
  );
  const releaseAtMs = parseInstant(assignment?.releaseAt || assignment?.releaseDate, { timeZone: SCHOOL_TIME_ZONE });
  const override = assignment?.studentOverrides?.[studentId] || null;
  const attendanceFinalAtMs = parseInstant(override?.lateDueAt || override?.dueAt, { endOfDay: true, timeZone: SCHOOL_TIME_ZONE });
  const supportDeadline = deadlineUnderRevision(assignment, governing.revision);
  const effectiveDueAtMs = Math.max(...[classDueAtMs, supportDeadline?.supportDueAtMs].filter(Number.isFinite), -Infinity);
  const effectiveFinalAtMs = Math.max(...[classFinalAtMs, attendanceFinalAtMs, supportDeadline?.supportFinalAtMs].filter(Number.isFinite), -Infinity);
  const dueAt = Number.isFinite(effectiveDueAtMs) ? effectiveDueAtMs : null;
  const finalAt = Number.isFinite(effectiveFinalAtMs) ? effectiveFinalAtMs : null;

  // Work and standing, from the gradebook's own model.
  const progress = studentAssignmentProgress({ student, assignment });
  const work = workTimestamps(student, assignmentId);
  const excused = override?.excused === true;
  let status;
  if (excused) status = ASSIGNMENT_STATUS.EXCUSED;
  else if (releaseAtMs !== null && now < releaseAtMs && progress.state === PROGRESS_STATE.NOT_STARTED) status = ASSIGNMENT_STATUS.SCHEDULED;
  else if (progress.state === PROGRESS_STATE.COMPLETE) status = ASSIGNMENT_STATUS.COMPLETED;
  else if (finalAt !== null && now > finalAt) status = progress.state === PROGRESS_STATE.NOT_STARTED ? ASSIGNMENT_STATUS.MISSING : ASSIGNMENT_STATUS.CLOSED_INCOMPLETE;
  else status = progress.state === PROGRESS_STATE.NOT_STARTED ? ASSIGNMENT_STATUS.NOT_STARTED : ASSIGNMENT_STATUS.IN_PROGRESS;
  const completedLate = status === ASSIGNMENT_STATUS.COMPLETED && dueAt !== null && work.lastAtMs !== null && work.lastAtMs > dueAt;

  // Evidence for this assignment.
  const events = activeEvidence(evidence).filter((event) => clean(event?.assignmentId) === assignmentId);
  const counts = countEvidenceBySupport(events);
  const staffEvents = events.filter(isStaffEvent)
    .map((event) => ({ ...event, occurredAtMs: event.occurredAtMs ?? toMillis(event.occurredAt) }))
    .sort((a, b) => (a.occurredAtMs || 0) - (b.occurredAtMs || 0));

  // Standard vs Modified.
  const modificationEvents = events.filter((event) => event.classification === SUPPORT_CLASSIFICATION.MODIFICATION
    && [EVIDENCE_EVENT_TYPE.PROVIDED, EVIDENCE_EVENT_TYPE.TEACHER_DOCUMENTED, EVIDENCE_EVENT_TYPE.PROVIDER_DOCUMENTED].includes(event.eventType));
  const legacyUsage = student?.supportUsageByAssignment?.[assignmentId] || null;
  const legacyModifications = unique(list(legacyUsage?.modifications));
  let condition;
  if (modificationEvents.length) {
    condition = {
      value: 'modified',
      modifications: unique(modificationEvents.map((event) => event.supportId)),
      provenance: modificationEvents.some(isStaffEvent) ? PROVENANCE.DOCUMENTED : PROVENANCE.RECORDED,
      note: '',
    };
  } else if (legacyUsage?.modified || legacyModifications.length) {
    condition = {
      value: 'modified',
      modifications: legacyModifications,
      provenance: PROVENANCE.RECORDED,
      note: 'Marked Modified at submission by the earlier rule, which marked every item for a student with a modification configured — whether or not it changed the item.',
    };
  } else {
    condition = {
      value: 'standard',
      modifications: [],
      provenance: PROVENANCE.DERIVED,
      note: configured.modifications.length && (work.hasTracker || events.length)
        ? `A modification is configured (${configured.modifications.map((id) => supportById(id)?.label || id).join(', ')}) but no record shows it changed an item in this assignment.`
        : '',
    };
  }

  // Engagement: server-timed ledger → legacy browser seconds → not recorded.
  const ledger = list(engagement).filter((doc) => clean(doc?.assignmentId) === assignmentId);
  const ledgerSummary = summarizeEngagementMinutes(ledger, { dueAtMs: dueAt, finalAtMs: finalAt });
  const legacySeconds = Number(student?.assignmentActivity?.[assignmentId]?.totalTimeSeconds) || 0;
  let engagementFact;
  if (ledgerSummary.activeMinutes > 0) {
    engagementFact = { ...ledgerSummary, provenance: PROVENANCE.RECORDED, source: 'ledger', note: 'Server-timed active minutes (visible page, interaction within 2 minutes).' };
  } else if (legacySeconds > 0) {
    engagementFact = {
      activeMinutes: Math.round(legacySeconds / 60),
      onTimeMinutes: null,
      lateMinutes: null,
      provenance: PROVENANCE.RECORDED,
      source: 'legacy-browser',
      note: 'Counted by the student\'s browser (earlier method; no server timestamps).',
    };
  } else if (work.hasTracker || progress.attempted > 0) {
    engagementFact = {
      activeMinutes: null,
      provenance: PROVENANCE.NOT_RECORDED,
      source: 'none',
      note: 'Work is recorded but active time is not. Before this evidence system, the timer did not run for students with the no-idle-timer support.',
    };
  } else {
    engagementFact = { activeMinutes: null, provenance: PROVENANCE.NOT_RECORDED, source: 'none', note: '' };
  }

  // Supports: configured ∪ anything with a record for this assignment.
  const supportIds = unique([...configured.accommodations, ...[...counts.keys()].filter((id) => supportById(id)?.classification !== SUPPORT_CLASSIFICATION.MODIFICATION)]);
  const beforeRecording = recordingStartMs !== null && finalAt !== null && finalAt < recordingStartMs;
  const supports = supportIds.map((supportId) => {
    const entry = supportById(supportId);
    const count = counts.get(supportId) || { available: 0, provided: 0, activated: 0, used: 0, documented: 0, declined: 0, notApplicable: 0, unavailable: 0, lastAtMs: null };
    return {
      supportId,
      label: entry?.label || supportId,
      classification: entry?.classification || 'unknown',
      automation: supportAutomationUnder(governing.revision, supportId),
      configured: configured.accommodations.includes(supportId),
      measurable: entry?.evidence || [],
      affectsIndependence: entry?.affectsIndependence === true,
      ...count,
    };
  });

  // Gaps — facts about the record, never a verdict.
  const gaps = [];
  const worked = work.hasTracker || progress.attempted > 0;
  const workload = workloadFactFor({ assignment, student, events, nowValue: now });
  supports.forEach((support) => {
    if (support.configured && support.unavailable > 0) {
      const reason = activeEvidence(events).find((event) => event.supportId === support.supportId && event.eventType === EVIDENCE_EVENT_TYPE.UNAVAILABLE)?.details?.reason;
      gaps.push({
        code: 'support-unavailable',
        supportId: support.supportId,
        message: `${support.label}: MathMaster could not provide it in this work${reason ? ` (${reason})` : ''}.`,
      });
    }
    if (!support.configured || support.notApplicable > 0 || support.unavailable > 0) return;
    if (support.supportId === REDUCED_WORKLOAD_SUPPORT_ID && support.automation === SUPPORT_AUTOMATION.AUTOMATIC) {
      // Automatic: the student's client records the projection when the work
      // opens. No record on worked assignments means it was not recorded —
      // never that it was not applied.
      if (worked && support.provided === 0) {
        gaps.push({
          code: 'automatic-not-recorded',
          supportId: support.supportId,
          message: beforeRecording
            ? `${support.label}: this work predates support recording.`
            : `${support.label}: no record of the reduction for this work (MathMaster computes ${workload?.current ? `${workload.current.assignedCount} of ${workload.current.originalCount} items` : 'it'} now).`,
        });
      }
      return;
    }
    if (support.automation === SUPPORT_AUTOMATION.MANUAL && support.documented === 0 && worked) {
      gaps.push({ code: 'no-staff-record', supportId: support.supportId, message: `No staff record of: ${support.label}.` });
    }
    if (support.automation === SUPPORT_AUTOMATION.PLATFORM_AVAILABLE && worked && support.available + support.used === 0) {
      gaps.push({
        code: 'availability-not-recorded',
        supportId: support.supportId,
        message: beforeRecording
          ? `${support.label}: this work predates support recording.`
          : `${support.label}: no record that it was on screen for this assignment.`,
      });
    }
  });
  if (engagementFact.provenance === PROVENANCE.NOT_RECORDED && worked) {
    gaps.push({ code: 'engagement-not-recorded', message: 'Active time was not recorded for this work.' });
  }
  if (governing.backdated) {
    gaps.push({ code: 'backdated-profile', message: 'The profile revision covering this date was entered afterwards; MathMaster applied the earlier revision to this work.' });
  }

  return {
    assignmentId,
    title: clean(assignment?.title) || 'Untitled assignment',
    releaseAtMs,
    classDueAtMs,
    classFinalAtMs,
    attendanceFinalAtMs,
    individualizedDue: supportDeadline
      ? {
        dueAtMs: supportDeadline.supportDueAtMs,
        finalAtMs: supportDeadline.supportFinalAtMs,
        supportId: supportDeadline.supportId,
        extension: supportDeadline.extension,
        revisionId: supportDeadline.revisionId,
        provenance: PROVENANCE.DERIVED,
      }
      : null,
    effectiveDueAtMs: dueAt,
    effectiveFinalAtMs: finalAt,
    status,
    statusLabel: ASSIGNMENT_STATUS_LABEL[status],
    completedLate,
    progress: {
      state: progress.state,
      attempted: progress.attempted,
      total: progress.total,
      creditOnAttempted: progress.creditOnAttempted,
      teacherOverride: progress.teacherOverride,
    },
    attempts: { total: work.totalAttempts, firstAtMs: work.firstAtMs, lastAtMs: work.lastAtMs },
    score: progress.score,
    sections: sectionScores(student, assignment),
    condition,
    governing: {
      revisionId: governing.revision?.revisionId || governing.revision?.id || null,
      revision: governing.revision?.revision ?? null,
      sourceLabel: governing.revision?.sourceLabel || null,
      provenance: governing.provenance,
      source: governing.source,
      backdated: governing.backdated,
    },
    configured,
    supports,
    workload,
    staffEvents,
    engagement: engagementFact,
    gaps,
    beforeRecording,
  };
};

export default buildAssignmentEvidenceRow;
