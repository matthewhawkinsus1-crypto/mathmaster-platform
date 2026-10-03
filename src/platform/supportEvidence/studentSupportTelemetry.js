/*
 * WHAT THE STUDENT'S OWN CLIENT RECORDS ABOUT SUPPORTS — and what it must not.
 *
 * Configured is not available is not provided is not used. This module decides,
 * from the student's effective plan and the assignment actually opened, which
 * platform facts are TRUE and therefore recordable:
 *
 *   provided   an automatic support the platform applied when the assignment
 *              opened (decluttered screen, hidden countdown on a timed section,
 *              an individualized due date that actually moved) — and a
 *              modification only when it really changed an item;
 *   available  a tool the student could use, recorded when it was actually on
 *              screen (Support tools resources at launch; Read aloud and the
 *              calculator when a question offers them);
 *   used       the student pressed or opened it.
 *
 * Adult-delivered supports are never recorded here — only staff can document
 * them. The Firestore rules independently refuse any support the student is not
 * entitled to (firestore.rules studentSupportEvidenceValid).
 */
import {
  INCLUSION_IMPLIED_SUPPORT_IDS,
  SUPPORT_AUTOMATION,
  SUPPORT_CLASSIFICATION,
  supportAutomationFor,
  supportById,
} from '../../../functions/shared/supportCatalog.mjs';
import { REDUCED_WORKLOAD_SUPPORT_ID, WORKLOAD_STATUS, WORKLOAD_VARIANCE } from '../../../functions/shared/reducedWorkload.mjs';
import {
  planHasSupport,
  resolveEffectiveSupportPlan,
  supportAppliesToRole,
} from '../../../functions/shared/supportProfileModel.mjs';
import { resolveStudentSupportDeadline } from '../../../functions/shared/supportDeadline.mjs';
import { EVIDENCE_EVENT_TYPE } from '../../../functions/shared/supportEvidenceModel.mjs';

const list = (value) => (Array.isArray(value) ? value : []);
const TIMED_ROLES = new Set(['warmup', 'dol', 'quiz', 'test']);

// Recorded per question when the tool is on screen, not at launch. The
// language tools are recorded only where the item or tool actually has the
// resource behind them (src/platform/language/supportToolsModel.js) — a
// language on the profile is not translated content on the screen.
const RECORDED_IN_QUESTION = new Set([
  'text-to-speech', 'calculator', 'calculator-override-computation',
  'translation', 'glossary-lookup', 'chunked-directions', 'sentence-frames',
]);
// Not a platform fact in an assignment.
const NOT_RECORDED_AT_LAUNCH = new Set(['extra-attempts']);

/**
 * The compact, checkable facts a reduced-item record carries (the summary
 * functions/shared/reducedWorkload.mjs resolveStudentWorkload returns).
 */
export const workloadEvidenceDetails = (summary = {}) => ({
  targetPercent: summary.targetPercent,
  originalCount: summary.originalCount,
  assignedCount: summary.assignedCount,
  actualPercentTenths: summary.actualPercentTenths,
  variance: summary.variance,
  contentFingerprint: summary.contentFingerprint,
  algorithmVersion: summary.algorithmVersion,
  omittedIndices: summary.omittedIndices,
});

// Why nothing was reduced, most decisive cause first. Rounding or a limit to
// some activities never by itself leaves nothing to reduce.
const NOT_APPLICABLE_REASON_ORDER = [
  WORKLOAD_VARIANCE.SECURE_ASSESSMENT,
  WORKLOAD_VARIANCE.PRACTICE_PASS,
  WORKLOAD_VARIANCE.ANSWERED_BEFORE_REDUCTION,
  WORKLOAD_VARIANCE.TOO_FEW_ITEMS,
  WORKLOAD_VARIANCE.COVERAGE,
  WORKLOAD_VARIANCE.INDIVISIBLE_GROUP,
  WORKLOAD_VARIANCE.LIMITED_TO_ACTIVITIES,
  WORKLOAD_VARIANCE.ROUNDING,
];
export const notApplicableReason = (variance = []) => (
  NOT_APPLICABLE_REASON_ORDER.find((code) => list(variance).includes(code)) || 'nothing-to-reduce'
);

/**
 * The reduced-item record for one opened assignment, from the student's
 * resolved projection (`studentRequiredQuestions` → `{ status, workload }`,
 * or `{ failed: true }`). Only a projection that actually omitted items is
 * "provided"; one that could not be resolved is "unavailable" when today's
 * plan makes the reduction automatic (the governing revision is unknown then).
 */
const reducedWorkloadRecord = ({ workload, plan }) => {
  if (!workload || workload.failed) {
    const entry = list(plan?.accommodations).find((item) => item?.id === REDUCED_WORKLOAD_SUPPORT_ID) || null;
    return plan?.active && entry && supportAutomationFor(REDUCED_WORKLOAD_SUPPORT_ID, entry.params) === SUPPORT_AUTOMATION.AUTOMATIC
      ? { supportId: REDUCED_WORKLOAD_SUPPORT_ID, eventType: EVIDENCE_EVENT_TYPE.UNAVAILABLE, details: { reason: 'projection-not-resolved' } }
      : null;
  }
  const summary = workload.workload;
  if (!summary) return null;
  if (workload.status === WORKLOAD_STATUS.APPLIED) {
    return {
      supportId: REDUCED_WORKLOAD_SUPPORT_ID,
      eventType: EVIDENCE_EVENT_TYPE.PROVIDED,
      details: workloadEvidenceDetails(summary),
      variant: summary.contentFingerprint || null,
      profileRevisionId: summary.revisionId || null,
    };
  }
  if (workload.status === WORKLOAD_STATUS.NOT_APPLICABLE) {
    return {
      supportId: REDUCED_WORKLOAD_SUPPORT_ID,
      eventType: EVIDENCE_EVENT_TYPE.NOT_APPLICABLE,
      details: { ...workloadEvidenceDetails(summary), reason: notApplicableReason(summary.variance) },
      variant: summary.contentFingerprint || null,
      profileRevisionId: summary.revisionId || null,
    };
  }
  // 'none' / 'manual': automatic reduction does not govern THIS assignment's
  // dates — no claim either way.
  return null;
};

/**
 * Records to make when a student opens an assignment.
 *
 * `roles` — the activity roles present in the assignment's current content.
 * `questions` — the runtime questions (for applicability of item-level tools).
 */
export const launchSupportRecords = ({
  profile,
  assignment,
  roles = [],
  questions = [],
  // This student's resolved reduced-item projection for the assignment
  // (assignmentLifecycle.js studentRequiredQuestions → `{ status, workload }`),
  // or `{ failed: true }` when resolving it threw. Only a projection that
  // actually omitted items is "provided".
  workload = null,
  nowValue = Date.now(),
} = {}) => {
  const plan = resolveEffectiveSupportPlan(profile, { nowValue });
  // The reduced-item record follows the revision that GOVERNS this assignment
  // (its due date — reducedWorkload.mjs resolveItemReductionPolicy), which is
  // not always today's: a late assignment from September is reduced under
  // September's revision even if October's dropped the percentage.
  const reduced = reducedWorkloadRecord({ workload, plan });
  if (!plan.active) return { revisionId: plan.revisionId, records: reduced ? [reduced] : [] };
  const presentRoles = [...new Set(list(roles).map((role) => String(role || '').toLowerCase()).filter(Boolean))];
  const ids = [
    ...list(plan.accommodations).map((entry) => entry.id),
    ...(plan.inclusionStatus ? INCLUSION_IMPLIED_SUPPORT_IDS : []),
  ];
  const records = new Map();
  const add = (supportId, eventType, extra = {}) => { if (!records.has(supportId)) records.set(supportId, { supportId, eventType, ...extra }); };
  if (reduced) records.set(REDUCED_WORKLOAD_SUPPORT_ID, reduced);

  [...new Set(ids)].forEach((supportId) => {
    const entry = supportById(supportId);
    if (!entry || entry.classification !== SUPPORT_CLASSIFICATION.ACCOMMODATION) return;
    // Under THIS revision's parameters: a recorded-only reduced item count is
    // adult-delivered, an automatic one is the platform's to prove.
    const planEntry = list(plan.accommodations).find((item) => item.id === supportId) || null;
    const automation = supportAutomationFor(supportId, planEntry?.params);
    if (automation === SUPPORT_AUTOMATION.MANUAL) return;
    if (RECORDED_IN_QUESTION.has(supportId) || NOT_RECORDED_AT_LAUNCH.has(supportId)) return;

    // Decided above from the governing revision (reducedWorkloadRecord).
    if (supportId === REDUCED_WORKLOAD_SUPPORT_ID) return;
    if (presentRoles.length && !presentRoles.some((role) => supportAppliesToRole(plan, supportId, role))) return;

    if (entry.params.includes('dueDateExtension')) {
      // Only when THIS assignment's due date actually moved for the student.
      const deadline = resolveStudentSupportDeadline({ assignment, profile });
      if (deadline && deadline.supportId === supportId) add(supportId, EVIDENCE_EVENT_TYPE.PROVIDED);
      return;
    }
    if (supportId === 'no-countdown') {
      // Hiding a countdown is only a fact where there is a countdown to hide.
      if (presentRoles.some((role) => TIMED_ROLES.has(role))) add(supportId, EVIDENCE_EVENT_TYPE.PROVIDED);
      return;
    }
    if (supportId === 'algebra-auto-apply') {
      if (list(questions).some((question) => question?.type === 'stepAlgebra')) add(supportId, EVIDENCE_EVENT_TYPE.PROVIDED);
      return;
    }
    if (entry.automation === SUPPORT_AUTOMATION.PLATFORM_AVAILABLE) {
      // Resources and graph paper are offered in Support tools as soon as the
      // assignment opens — but only when there is something to offer.
      if (entry.params.includes('resources') && !list(plan.accommodations.find((item) => item.id === supportId)?.params?.resources).length) return;
      add(supportId, EVIDENCE_EVENT_TYPE.AVAILABLE);
      return;
    }
    add(supportId, EVIDENCE_EVENT_TYPE.PROVIDED);
  });
  return { revisionId: plan.revisionId, records: [...records.values()] };
};

/**
 * Is the student entitled to record this support at all? Mirrors the rules
 * (firestore.rules studentSupportEvidenceValid): today's plan, or the
 * projection's `entitledIds` — which also carries a reduced-item support any
 * recorded revision made automatic, so an assignment governed by an earlier
 * revision can still be recorded.
 */
export const studentMayRecordSupport = (profile, supportId, { nowValue = Date.now() } = {}) => {
  const plan = resolveEffectiveSupportPlan(profile, { nowValue });
  if (plan.active && planHasSupport(plan, supportId)) return true;
  const entitled = profile?.supportPlan?.entitledIds;
  return Array.isArray(entitled) && entitled.includes(String(supportId ?? '').trim());
};

// Kept beside the transformation it mirrors (src/studentSupport.js).
export { modificationsAppliedToQuestion } from '../../studentSupport.js';

/** Session de-duplication key for a "used" record: once per question per minute. */
export const usedRecordKey = ({ assignmentId, questionIndex, supportId, nowMs = Date.now() }) => (
  `${assignmentId}|${questionIndex ?? '-'}|${supportId}|${Math.floor(Number(nowMs) / 60000)}`
);
