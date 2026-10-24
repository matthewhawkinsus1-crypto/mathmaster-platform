/*
 * THE DECISIONS OF THE TEST CYCLE EVIDENCE BACKFILL — PURE (TC13; C2-110).
 *
 * From the W7-6 deploy on, a secure Test or Retest response that is a graded
 * miss records the mistake its work proves (`grading.misconceptionEvidence`).
 * A Test graded before that has none, so a student in Corrections on such a Test
 * reads the generic line ("You missed N Test questions on this skill") and a
 * teacher reads no pattern. This plans the repair without touching Firestore;
 * scripts/backfill-test-cycle-evidence.mjs reads, re-plans inside a transaction,
 * and writes. Unit-tested in tests/platform/testCycleEvidenceBackfill.test.mjs.
 *
 *   planSessionEvidence  which stored responses would gain evidence. It asks the
 *                        SAME diagnosis the server asks today (secureExamItems
 *                        missEvidenceOf) of the issued item, which the session
 *                        still holds, and of the work the student submitted,
 *                        which the response still holds.
 *   planPlanRefresh      which targets of the student's stored Corrections plan
 *                        would then name that mistake, exactly as
 *                        buildCorrectionPlan would have when it was built.
 *   sittingsSeen         the days a class sat the Test, as the sessions say, for
 *                        the report only (see "Sittings" below).
 *
 * NEVER A GRADE. A response's score and isCorrect are never read to change
 * anything and never written; a response is a candidate only if the grader as
 * it is today ALSO marks it a miss (a response today's grader would accept is
 * left alone and counted). What is added is one provenance block on a miss, and
 * the diagnosis fields of a plan target. Progress, evidence references, tries
 * and the forbidden instances of a plan are never touched.
 *
 * SITTINGS ARE REPORTED, NOT WRITTEN. A class sitting records what the bell
 * schedule resolved a Test day to, and the teacher's panel reads it only when
 * that day no longer resolves. For a past day the schedule may be exactly what
 * changed, so any value written now would be today's reading dressed as then's.
 * The report counts the days instead.
 */

import { getMisconceptionCode } from '../../functions/shared/misconceptionCodes.mjs';
import { TEST_CYCLE_MISCONCEPTION_SOURCE, testCycleResponseMisconceptionCodes } from '../../functions/shared/testCycleCorrections.mjs';
import { classSittingId } from '../../functions/shared/testCycleAvailability.mjs';
import { zonedDateKey } from '../../functions/shared/instructionalCalendar.mjs';

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const clean = (value) => String(value ?? '').trim();

const FINISHED = new Set(['submitted', 'force_submitted', 'time_expired']);
export const BACKFILL_STAGES = Object.freeze(['test', 'retest']);

/** Why a stored response gains nothing. */
export const BACKFILL_SKIP = Object.freeze({
  ALREADY_NAMED: 'alreadyNamed',
  CORRECT: 'correct',
  UNANSWERED: 'unanswered',
  ITEM_MISSING: 'itemMissing',
  GRADER_DISAGREES: 'graderDisagrees',
  NOTHING_PROVED: 'nothingProved',
  FAILED: 'failed',
});

/** A finished course-test session of a stage asked for. */
export const sessionIsCandidate = (session, { stages = BACKFILL_STAGES } = {}) => (
  isObject(session)
  && clean(session.examType) === 'courseTest'
  && FINISHED.has(clean(session.status))
  && stages.includes(clean(session.courseTest?.cycleStage))
);

const emptyCounts = () => ({
  responses: 0,
  [BACKFILL_SKIP.ALREADY_NAMED]: 0,
  [BACKFILL_SKIP.CORRECT]: 0,
  [BACKFILL_SKIP.UNANSWERED]: 0,
  [BACKFILL_SKIP.ITEM_MISSING]: 0,
  [BACKFILL_SKIP.GRADER_DISAGREES]: 0,
  [BACKFILL_SKIP.NOTHING_PROVED]: 0,
  [BACKFILL_SKIP.FAILED]: 0,
  wouldName: 0,
});

/**
 * The questions of a finished session that could still gain evidence, by the
 * fields on the stored response alone (so the caller reads only those items).
 */
export const evidenceCandidateIds = (session) => Object.entries(isObject(session?.responses) ? session.responses : {})
  .filter(([, response]) => isObject(response)
    && !response.grading?.misconceptionEvidence
    && response.unanswered !== true
    && response.grading?.isCorrect !== true)
  .map(([questionInstanceId]) => questionInstanceId);

/**
 * Which responses of one finished session would gain evidence.
 *
 *   session     the stored session (its `responses` map)
 *   itemsById   Map(questionInstanceId -> the item document { item, draftResponse })
 *   deps        { gradeIssuedItem, readStoredItem, rawWorkOf, pathMisconceptionEvidence }
 *               - the server's own functions, so the plan is the server's answer
 *
 * Returns { counts, updates: [{ questionInstanceId, evidence, codes }] }.
 */
export const planSessionEvidence = async ({ session, itemsById, deps }) => {
  const counts = emptyCounts();
  const updates = [];
  for (const [questionInstanceId, response] of Object.entries(isObject(session?.responses) ? session.responses : {})) {
    counts.responses += 1;
    if (!isObject(response)) { counts[BACKFILL_SKIP.NOTHING_PROVED] += 1; continue; }
    if (response.grading?.misconceptionEvidence) { counts[BACKFILL_SKIP.ALREADY_NAMED] += 1; continue; }
    if (response.unanswered === true) { counts[BACKFILL_SKIP.UNANSWERED] += 1; continue; }
    if (response.grading?.isCorrect === true) { counts[BACKFILL_SKIP.CORRECT] += 1; continue; }
    const stored = itemsById?.get(questionInstanceId)?.item;
    if (!isObject(stored)) { counts[BACKFILL_SKIP.ITEM_MISSING] += 1; continue; }
    try {
      const payload = isObject(response.responsePayload) ? response.responsePayload : { responses: {} };
      // The verdict recorded at the time stands. The grader as it is today must
      // also call it a miss, or this response is left exactly as it is.
      // eslint-disable-next-line no-await-in-loop
      const regraded = await deps.gradeIssuedItem(stored, payload);
      if (!regraded || regraded.isCorrect === true || regraded.rejected === true) { counts[BACKFILL_SKIP.GRADER_DISAGREES] += 1; continue; }
      const item = deps.readStoredItem(stored);
      if (!isObject(item?.privateGrading)) { counts[BACKFILL_SKIP.NOTHING_PROVED] += 1; continue; }
      // eslint-disable-next-line no-await-in-loop
      const raw = item.privateGrading.pathToolId ? await deps.rawWorkOf(payload) : null;
      const evidence = deps.pathMisconceptionEvidence({
        privateGrading: item.privateGrading,
        grading: regraded,
        raw,
        responses: isObject(payload.responses) ? payload.responses : null,
        question: item,
      });
      if (!evidence) { counts[BACKFILL_SKIP.NOTHING_PROVED] += 1; continue; }
      counts.wouldName += 1;
      updates.push({ questionInstanceId, evidence, codes: evidence.findings.map((finding) => finding.code) });
    } catch {
      counts[BACKFILL_SKIP.FAILED] += 1;
    }
  }
  return { counts, updates };
};

/** The session as it would be with `updates` applied (a copy; the input is untouched). */
export const withPlannedEvidence = (session, updates = []) => {
  const responses = { ...(isObject(session?.responses) ? session.responses : {}) };
  updates.forEach(({ questionInstanceId, evidence }) => {
    if (!isObject(responses[questionInstanceId])) return;
    responses[questionInstanceId] = {
      ...responses[questionInstanceId],
      grading: { ...responses[questionInstanceId].grading, misconceptionEvidence: evidence },
    };
  });
  return { ...session, responses };
};

/** The text buildCorrectionPlan gives a target that names a mistake (a test holds the two together). */
export const namedDiagnosisDetail = (entry) => (
  `MathMaster identified "${entry.label}" on this standard in server-graded Test work. ${entry.teacherMeaning}`
);

const planIsComplete = (plan) => plan?.complete === true
  || (Array.isArray(plan?.targets) && plan.targets.length > 0 && plan.targets.every((target) => target?.complete === true));

/**
 * The first registry code a target's own missed work proves, in the order the
 * plan cites that work: what buildPerformanceProfile + buildCorrectionPlan pick.
 */
const firstKnownCode = (target, responsesByInstance) => {
  for (const cited of Array.isArray(target?.evidence) ? target.evidence : []) {
    const response = responsesByInstance.get(clean(cited?.questionInstanceId));
    if (!response) continue;
    const entry = testCycleResponseMisconceptionCodes(response).map((code) => getMisconceptionCode(code)).find(Boolean);
    if (entry) return entry;
  }
  return null;
};

/**
 * Which targets of a stored Corrections plan would now name a mistake.
 *
 *   planDocument  the stored testCycleCorrectionPlans document ({ plan, ... })
 *   session       the Test session the plan was built from, WITH the planned
 *                 evidence applied (withPlannedEvidence)
 *
 * Returns { plan, changes, skipped }. `plan` is the stored plan with only the
 * diagnosis fields of the changed targets rewritten (null when nothing changes);
 * a complete plan is left alone unless asked for.
 */
export const planPlanRefresh = ({ planDocument, session, includeComplete = false }) => {
  const plan = isObject(planDocument?.plan) ? planDocument.plan : null;
  if (!plan || !Array.isArray(plan.targets)) return { plan: null, changes: [], skipped: 'noPlan' };
  // A plan is built from one Test session; another's responses are not its evidence.
  if (clean(plan.sourceExamSessionId) !== clean(session?.examSessionId)) return { plan: null, changes: [], skipped: 'otherSession' };
  if (plan.strategy !== 'performanceTargeted') return { plan: null, changes: [], skipped: 'notTargeted' };
  if (!includeComplete && planIsComplete(plan)) return { plan: null, changes: [], skipped: 'complete' };
  const responsesByInstance = new Map(Object.values(isObject(session?.responses) ? session.responses : {})
    .filter(isObject)
    .map((response) => [clean(response.questionInstanceId), response]));
  const changes = [];
  const targets = plan.targets.map((target) => {
    if (!isObject(target) || target.diagnosis === 'misconception') return target;
    const entry = firstKnownCode(target, responsesByInstance);
    if (!entry) return target;
    changes.push({ correctionId: target.correctionId, targetId: target.targetId, code: entry.id });
    return {
      ...target,
      diagnosis: 'misconception',
      misconception: entry.id,
      misconceptionLabel: entry.label,
      misconceptionCodeVersion: entry.version,
      misconceptionSource: TEST_CYCLE_MISCONCEPTION_SOURCE,
      diagnosisDetail: namedDiagnosisDetail(entry),
    };
  });
  return changes.length ? { plan: { ...plan, targets }, changes, skipped: null } : { plan: null, changes: [], skipped: 'nothingNew' };
};

/**
 * The document id a recorded class sitting would have for the day this Test was
 * started on, in school time; null when the session has no class or start.
 */
export const sittingIdSeen = (session, { timeZone }) => {
  const startedAt = Number(session?.startedAt);
  const classId = clean(session?.classId);
  const assignmentId = clean(session?.courseTest?.assignmentId);
  if (!Number.isFinite(startedAt) || startedAt <= 0 || !classId || !assignmentId) return null;
  return classSittingId({ assignmentId, classId, dateKey: zonedDateKey(startedAt, timeZone) });
};
