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
import { REDUCED_WORKLOAD_SUPPORT_ID, WORKLOAD_STATUS } from '../../../functions/shared/reducedWorkload.mjs';
import {
  planHasSupport,
  resolveEffectiveSupportPlan,
  supportAppliesToRole,
} from '../../../functions/shared/supportProfileModel.mjs';
import { resolveStudentSupportDeadline } from '../../../functions/shared/supportDeadline.mjs';
import { EVIDENCE_EVENT_TYPE } from '../../../functions/shared/supportEvidenceModel.mjs';

const list = (value) => (Array.isArray(value) ? value : []);
const TIMED_ROLES = new Set(['warmup', 'dol', 'quiz', 'test']);

// Recorded per question when the tool is on screen, not at launch.
const RECORDED_IN_QUESTION = new Set(['text-to-speech', 'calculator', 'calculator-override-computation']);
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
  if (!plan.active) return { revisionId: plan.revisionId, records: [] };
  const presentRoles = [...new Set(list(roles).map((role) => String(role || '').toLowerCase()).filter(Boolean))];
  const ids = [
    ...list(plan.accommodations).map((entry) => entry.id),
    ...(plan.inclusionStatus ? INCLUSION_IMPLIED_SUPPORT_IDS : []),
  ];
  const records = new Map();
  const add = (supportId, eventType, extra = {}) => { if (!records.has(supportId)) records.set(supportId, { supportId, eventType, ...extra }); };

  [...new Set(ids)].forEach((supportId) => {
    const entry = supportById(supportId);
    if (!entry || entry.classification !== SUPPORT_CLASSIFICATION.ACCOMMODATION) return;
    // Under THIS revision's parameters: a recorded-only reduced item count is
    // adult-delivered, an automatic one is the platform's to prove.
    const planEntry = list(plan.accommodations).find((item) => item.id === supportId) || null;
    const automation = supportAutomationFor(supportId, planEntry?.params);
    if (automation === SUPPORT_AUTOMATION.MANUAL) return;
    if (RECORDED_IN_QUESTION.has(supportId) || NOT_RECORDED_AT_LAUNCH.has(supportId)) return;

    if (supportId === REDUCED_WORKLOAD_SUPPORT_ID) {
      // The projection decides its own scope (appliesTo, the revision that
      // governs this assignment's dates), so no role filter here.
      if (!workload || workload.failed) {
        add(supportId, EVIDENCE_EVENT_TYPE.UNAVAILABLE, { details: { reason: 'projection-not-resolved' } });
        return;
      }
      const summary = workload.workload;
      if (workload.status === WORKLOAD_STATUS.APPLIED && summary) {
        add(supportId, EVIDENCE_EVENT_TYPE.PROVIDED, {
          details: workloadEvidenceDetails(summary),
          variant: summary.contentFingerprint || null,
          profileRevisionId: summary.revisionId || null,
        });
      } else if (workload.status === WORKLOAD_STATUS.NOT_APPLICABLE && summary) {
        add(supportId, EVIDENCE_EVENT_TYPE.NOT_APPLICABLE, {
          details: { ...workloadEvidenceDetails(summary), reason: summary.variance?.[0] || 'nothing-to-reduce' },
          variant: summary.contentFingerprint || null,
          profileRevisionId: summary.revisionId || null,
        });
      }
      // 'none' / 'manual': automatic reduction does not govern THIS
      // assignment's dates (an older or later revision does) — no claim.
      return;
    }
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

/** Is the student entitled to record this support at all (mirrors the rules)? */
export const studentMayRecordSupport = (profile, supportId, { nowValue = Date.now() } = {}) => {
  const plan = resolveEffectiveSupportPlan(profile, { nowValue });
  return plan.active && planHasSupport(plan, supportId);
};

// Kept beside the transformation it mirrors (src/studentSupport.js).
export { modificationsAppliedToQuestion } from '../../studentSupport.js';

/** Session de-duplication key for a "used" record: once per question per minute. */
export const usedRecordKey = ({ assignmentId, questionIndex, supportId, nowMs = Date.now() }) => (
  `${assignmentId}|${questionIndex ?? '-'}|${supportId}|${Math.floor(Number(nowMs) / 60000)}`
);
