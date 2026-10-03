/*
 * SERVER INGESTION OF AN ORDINARY STUDENT SUBMISSION.
 *
 * Before PR #226 a Submit wrote canonical grade state straight from the
 * browser. After it, the browser queued the submission locally and a background
 * client Firestore transaction carried it to `grades/{studentId}`. That moved
 * the one write that a teacher's gradebook depends on onto the least reliable
 * component in the system: a Chromebook's network, holding a transaction that
 * does not queue offline the way an ordinary write does.
 *
 * This module is the contract for doing that write on the SERVER instead. The
 * browser still acknowledges locally and instantly; a durable envelope is sent
 * in the background and answered with a receipt.
 *
 * THE TRUST MODEL DOES NOT MOVE.
 *
 * `grades/{studentId}` is student-writable today — that is how ordinary
 * assignment work has always been saved, and the Firestore rules pin the parts
 * that are not (roster authorization, the Test Cycle projection). So accepting
 * an attempt envelope here is exactly the authority the client already had, and
 * NOT a new one. Where the server can do better it does:
 *
 *   - for a question the shared grading registry can mark — an ordinary type,
 *     a registry tool mode with a shared grader (serverGrading/), or a
 *     Question Family instance rebuilt from its delivery pin — the student's
 *     RAW RESPONSE is re-graded here and the browser's verdict is discarded.
 *     That is strictly more secure than the path it replaces.
 *   - a Step Algebra step that carries its raw work (`stepWork`) earns the
 *     step credit the server derives from that work, applied to the
 *     server's own record; the browser's step record is not read.
 *   - for everything else the envelope's record is accepted, but sanitized
 *     through the shared attempt policy and bounded by the attempt count the
 *     server itself read. A browser cannot mint attempts, jump attempt counts,
 *     or hand itself a terminal `correct` on a question it has already failed.
 *   - Secure Test Cycle, My Math Path and server-graded tools never enter here
 *     at all; they keep their own server-authoritative state machines.
 */
import {
  normalizeOrdinaryResponse,
  responseIsBlank,
} from './ordinaryResponseGrading.mjs';
import {
  gradeServerResponse,
  serverResponseGradingSupport,
  questionGraderAccepts,
  sharedGraderDrift,
  usesToolResponse,
} from './serverGrading/serverResponseGrading.mjs';
import { isToolResponse } from './serverGrading/toolResponseContract.mjs';
import { attemptInputsFromGrading } from './serverGrading/gradingResult.mjs';
import { gradeModelingLabEvaluation } from './serverGrading/modelingLabGrading.mjs';
import {
  getAttemptsRemaining,
  getQuestionCredit,
  normalizeQuestionRecord,
  recordQuestionAttempt,
  recordQuestionStep,
  resolveQuestionMaximumAttempts,
  resolveTeacherGrantedExtraAttempts,
} from './attemptPolicy.mjs';
import { stepCreditContext, unverifiedStep, verifyStepAlgebraStep } from './serverGrading/stepAlgebraStepVerification.mjs';
import { getEffectiveActivityPolicy } from './activityPolicies.mjs';
import { buildAttemptEvidenceEvent } from './attemptEvidenceEvent.mjs';
import {
  classworkGradeProjection,
  dolSectionProjection,
  evaluateClassworkCompletionRule,
  mergeSupportUsage,
} from './assignmentProjections.mjs';
import { parseInstant, zonedDateKey } from './instructionalCalendar.mjs';
import { dolTeacherRecoveryActiveAt, SCHOOL_TIME_ZONE } from './sectionDeadline.mjs';
import {
  SUBMISSION_DISPOSITION,
  classifyCapturedSubmission,
  sectionWasOpenAtCapture,
} from './studentSubmissionDisposition.mjs';
import {
  captureAutomaticGradingEvidence,
  responseInspectionEvidenceDocumentId,
} from './responseInspector.mjs';
import { resolveServerGradingQuestion } from './questionFamilyGrading.mjs';
import { deliveredQuestionForGrading } from './serverGrading/deliveredQuestion.mjs';
import { normalizeDeliveryPin } from './questionGenerationIdentity.mjs';

export {
  FORBIDDEN_ENVELOPE_FIELDS,
  INGESTIBLE_KINDS,
  MAX_ENVELOPES_PER_CALL,
  SUBMISSION_ENVELOPE_SCHEMA_VERSION,
  assertEnvelopeCarriesNoSecureData,
  buildSubmissionEnvelope,
  captureSectionAccessProof,
  normalizeSubmissionEnvelope,
  resolveLiveSectionAccess,
} from './submissionEnvelope.mjs';

const text = (value) => String(value ?? '');
const trimmed = (value) => text(value).trim();
const list = (value) => (Array.isArray(value) ? value : []);
const finite = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
// A grader's refusal that means "this surface is graded on the device", not
// "this work could not be graded".
const DEVICE_GRADED_REASON = /^mode-not-server-gradable(?::|$)/;

/** The Warm-Up window the browser recorded, judged against the capture time. */
export const warmupWasActiveAtCapture = (timedSectionAccess, capturedAt) => {
  if (timedSectionAccess?.role !== 'warmup') return null;
  if (trimmed(timedSectionAccess.status) !== 'active') return false;
  const endsAt = timedSectionAccess.endsAt ? new Date(timedSectionAccess.endsAt).getTime() : Number.NaN;
  return !Number.isFinite(endsAt) || finite(capturedAt, Date.now()) <= endsAt;
};

/*
 * THE ACTIVITY A SUBMISSION IS JUDGED UNDER IS ITS QUESTION'S.
 *
 * The role decides the attempt limit, the section window, the DOL bucket and
 * the evidence event. The device names it, and can leave it out (a row queued
 * by an older build, or a forged envelope); an envelope with no role used to
 * be judged as Classwork: three attempts at a DOL, quiz or test question, and
 * no section window. The stored question is authoritative wherever it carries
 * a role, so that role fills a missing one. An envelope that names a DIFFERENT
 * role is not corrected here: envelopeMatchesQuestion holds it for a teacher.
 * Only a question with no role, from an assignment that predates roles, is
 * judged by what the device said.
 */
export const withAuthoritativeActivityRole = ({ envelope, question = null } = {}) => {
  const authoritative = trimmed(question?.activityRole).toLowerCase();
  if (!envelope || envelope.activityRole || !authoritative) return envelope;
  return { ...envelope, activityRole: authoritative };
};

/**
 * Does this envelope describe the question the server is holding?
 *
 * A queued submission that names a different question than the assignment now
 * has at that index cannot be written into it. That is not a retry problem, so
 * it is kept for review rather than graded or destroyed.
 */
export const envelopeMatchesQuestion = ({ envelope, question, canonicalRecord }) => {
  if (!question || typeof question !== 'object') return { ok: false, reason: 'question-index-not-found' };
  const authoritativeId = trimmed(question.questionId || question.id) || null;
  const claimedId = trimmed(envelope.questionId) || null;
  // Older queued rows predate carrying a question id; identity then rests on
  // the index and the variant, exactly as it did when they were written.
  if (claimedId && authoritativeId && claimedId !== authoritativeId) {
    return { ok: false, reason: 'question-identity-mismatch' };
  }
  const canonicalVariant = Math.max(0, finite(canonicalRecord?.variantIndex, 0));
  if (envelope.kind !== 'questionReplacement' && Math.max(0, finite(envelope.variantIndex, 0)) !== canonicalVariant) {
    return { ok: false, reason: 'variant-superseded' };
  }
  const authoritativeRole = trimmed(question.activityRole).toLowerCase();
  if (envelope.activityRole && authoritativeRole && envelope.activityRole !== authoritativeRole) {
    return { ok: false, reason: 'activity-role-mismatch' };
  }
  return { ok: true, reason: null };
};

/*
 * THE ACADEMIC TIME OF A SUBMISSION IS WHEN THE STUDENT PRESSED SUBMIT.
 *
 * Not when the queue drained, and not when this function ran. A response
 * captured on September 14 and ingested on September 15 is September 14 work:
 * it belongs to that instructional day, to that DOL date bucket, and to that
 * position in the student's attempt history. Recording the ingestion time
 * instead silently moves a grade between school days, which is worse than the
 * delay it came from.
 *
 * `capturedAt` is a client clock, so it is BOUNDED by the server's own reading:
 * a device with a wrong clock cannot backdate work before the assignment was
 * released, and cannot postdate it into the future. Eligibility has already
 * been decided by `decideSubmissionIngestion` before this is used — this is
 * only about which moment an ACCEPTED submission is recorded at.
 */
export const resolveAcademicOccurrenceAt = ({ envelope, assignment = null, ingestedAt = Date.now() } = {}) => {
  const captured = finite(envelope?.capturedAt, 0);
  if (!captured) return ingestedAt;
  // Never later than the moment the server is handling it.
  const upperBound = Math.min(captured, finite(ingestedAt, Date.now()));
  const releasedAt = assignment ? parseInstant(assignment.releaseAt || assignment.releaseDate, { endOfDay: false }) : null;
  // Never earlier than the assignment could be worked on.
  return releasedAt !== null && upperBound < releasedAt ? releasedAt : upperBound;
};

/**
 * Decide what to do with one envelope, from authoritative context the caller
 * has already read. Reads nothing, writes nothing, trusts no verdict.
 */
export const decideSubmissionIngestion = ({
  envelope: claimedEnvelope,
  assignmentExists,
  gradeRecordExists,
  authorizedForClass,
  assignmentClosedAtCapture,
  liveSectionAccess = null,
  question = null,
  canonicalRecord = null,
  deliveryAttempts = 0,
  now = Date.now(),
} = {}) => {
  const envelope = withAuthoritativeActivityRole({ envelope: claimedEnvelope, question });
  if (!envelope) return { disposition: SUBMISSION_DISPOSITION.PERMANENTLY_INVALID, reason: 'unreadable-envelope' };

  const canonical = normalizeQuestionRecord(canonicalRecord);
  const warmupActive = warmupWasActiveAtCapture(envelope.timedSectionAccess, envelope.capturedAt);
  const classification = classifyCapturedSubmission({
    actionId: envelope.actionId,
    kind: envelope.kind,
    activityRole: envelope.activityRole,
    capturedAt: envelope.capturedAt,
    previousTotalAttempts: envelope.previousTotalAttempts,
    canonicalRecord: canonical,
    assignmentExists,
    gradeRecordExists,
    authorizedForClass,
    assignmentClosedAtCapture,
    teacherReopenedWarmupAtCapture: warmupActive === true && envelope.timedSectionAccess?.teacherTimerScheduled === true,
    warmupActiveAtCapture: envelope.activityRole === 'warmup' ? warmupActive : null,
    sectionOpenAtCapture: sectionWasOpenAtCapture({
      capturedSectionAccess: envelope.capturedSectionAccess,
      liveSectionAccess,
      capturedAt: envelope.capturedAt,
    }),
    deliveryAttempts,
    now,
  });
  if (classification.disposition !== SUBMISSION_DISPOSITION.ACCEPTED) return classification;

  const identity = envelopeMatchesQuestion({ envelope, question, canonicalRecord: canonical });
  if (!identity.ok) {
    // The work exists and the student did it; MathMaster just cannot prove which
    // question it belongs to any more. Keep it for a teacher, never guess.
    return { disposition: SUBMISSION_DISPOSITION.NEEDS_REVIEW, reason: identity.reason };
  }
  return { disposition: SUBMISSION_DISPOSITION.ACCEPTED, reason: null };
};

/*
 * SANITIZING A BROWSER-SUPPLIED ATTEMPT RECORD.
 *
 * Only for question types the server cannot mark. The record is rebuilt from
 * the server's own canonical read so the fields that decide credit are bounded:
 *
 *   - the attempt count is the SERVER's: the count it read plus at most the
 *     one attempt this envelope made — never a claimed value, so it cannot go
 *     backwards (only an authorized replacement resets it) or jump;
 *   - a question already terminal cannot be un-terminalled: `correct`, or
 *     `expired` with no attempt left under the server's own attempt limit
 *     (a teacher-granted extra attempt reopens it, exactly as it does for
 *     recordQuestionAttempt);
 *   - partial credit is clamped to the attempt policy's 90% ceiling unless
 *     the record is `correct`, and may never fall below what is already
 *     recorded, so a retry cannot erase earned credit and a claimed 100%
 *     cannot impersonate a correct answer;
 *   - `lastSubmissionId` is stamped here, never accepted from the envelope.
 *
 *   - a claimed `correct` is refused outright where it cannot be legitimate:
 *     on a step submission, and on a submission that withheld the raw
 *     response for a question the server could have marked.
 *
 * Before this branch the code did not hold the first three lines its own
 * comment promised (docs/architecture/SERVER_GRADING_COVERAGE.md, "Sanitizer
 * gaps"): a claimed `correct` overwrote an exhausted `expired` record, a
 * claimed attemptCount of 0 reset the count, and a claimed 100% partial
 * credit counted as full credit without a correct answer.
 */
const ATTEMPT_STATUSES = new Set(['unattempted', 'attempted', 'correct', 'expired']);

const stripNonCanonicalInspectionFields = (record = {}) => {
  const {
    gradeOverride: _gradeOverride,
    gradeAuditHistory: _gradeAuditHistory,
    teacherGradeOverrideDisplay: _teacherGradeOverrideDisplay,
    gradingEvidence: _gradingEvidence,
    ...clean
  } = record;
  return clean;
};

/*
 * A REPLACEMENT QUESTION IS ALLOWED TO RESET THE ATTEMPT HISTORY.
 *
 * `requestReplacementQuestion` clears `totalAttempts` and `bestPartialCredit`
 * for a DOL replacement, deliberately: the student is answering a NEW question
 * and starts again on it. Clamping those fields up to the canonical values the
 * way every other field is clamped breaks the next submission — it would arrive
 * with `previousTotalAttempts: 0`, be compared against the restored count, be
 * classified `superseded`, and be retired WITHOUT EVER BEING GRADED. That is
 * the exact silent-loss shape this whole change exists to remove.
 *
 * The reset is still not the browser's to assert. It is honoured only when the
 * SERVER's own record agrees a replacement was legitimately issued: the
 * question had to be expired, and the variant has to move forward. A student
 * cannot wipe the attempt count on a question they simply do not like.
 */
const replacementResetIsAuthorized = ({ envelope, canonical, claimed }) => (
  envelope.kind === 'questionReplacement'
  && canonical.status === 'expired'
  && finite(claimed.variantIndex, 0) > finite(canonical.variantIndex, 0)
);

/**
 * Will this envelope reset its question to "unattempted" (an authorized
 * replacement)? Readers that must see the tracker as it will read once the
 * envelope lands — the reduced-item projection — ask this rather than guess.
 */
export const envelopeResetsRecord = ({ envelope, canonicalRecord }) => replacementResetIsAuthorized({
  envelope: envelope || {},
  canonical: stripNonCanonicalInspectionFields(normalizeQuestionRecord(canonicalRecord)),
  claimed: stripNonCanonicalInspectionFields(normalizeQuestionRecord(envelope?.record)),
});

export const sanitizeClientAttemptRecord = ({
  envelope,
  canonicalRecord,
  maximumAttempts,
  // False when a claimed `correct` cannot be legitimate: a step submission
  // (recordQuestionStep never completes a question), or a submission that
  // withheld the raw response for a question the server could have marked.
  allowClaimedCorrect = true,
}) => {
  const canonical = stripNonCanonicalInspectionFields(normalizeQuestionRecord(canonicalRecord));
  const claimed = stripNonCanonicalInspectionFields(normalizeQuestionRecord(envelope.record));
  const resetting = replacementResetIsAuthorized({ envelope, canonical, claimed });

  if (resetting) {
    // The record the replacement policy itself produces, rebuilt on the server
    // from the server's own canonical row rather than trusted from the wire.
    return normalizeQuestionRecord({
      ...canonical,
      status: 'unattempted',
      attemptCount: 0,
      questionDetails: '',
      lastResponseKey: '',
      partialCredit: 0,
      // `clearHistory`/`clearBest` ride together on a DOL replacement; anything
      // the client did not clear stays at the canonical value.
      totalAttempts: Math.min(finite(claimed.totalAttempts, 0), finite(canonical.totalAttempts, 0)),
      bestPartialCredit: Math.min(finite(claimed.bestPartialCredit, 0), finite(canonical.bestPartialCredit, 0)),
      stepGrades: Array.isArray(claimed.stepGrades) && claimed.stepGrades.length === 0 ? [] : canonical.stepGrades,
      variantIndex: finite(claimed.variantIndex, 0),
      algebraState: null,
      partGrades: [],
    });
  }

  const attemptLimit = Math.max(1, finite(maximumAttempts, 3));
  // TERMINAL STAYS TERMINAL — the same rule recordQuestionAttempt and
  // recordQuestionStep apply to a server-graded attempt. Nothing the browser
  // claims about a finished question is recorded.
  if (canonical.status === 'correct' || (canonical.status === 'expired' && getAttemptsRemaining(canonical, attemptLimit) <= 0)) {
    return canonical;
  }

  const advanced = finite(claimed.totalAttempts, 0) > finite(canonical.totalAttempts, 0);
  const totalAttempts = Math.min(finite(canonical.totalAttempts, 0) + (advanced ? 1 : 0), finite(claimed.totalAttempts, 0) || finite(canonical.totalAttempts, 0));
  // The attempt count is the server's own: what it read, plus the one attempt
  // this envelope made. A claimed count is never consulted — a client that
  // could hold it down would have unlimited attempts on a one-try question.
  const attemptCount = Math.min(attemptLimit, Math.max(finite(canonical.attemptCount, 0), 0) + (advanced ? 1 : 0));
  const claimedStatus = ATTEMPT_STATUSES.has(claimed.status) && (allowClaimedCorrect || claimed.status !== 'correct')
    ? claimed.status
    : 'attempted';
  // Out of attempts and not correct is expired, whatever the claim says — the
  // state recordQuestionAttempt would have written.
  const status = claimedStatus !== 'correct' && attemptCount >= attemptLimit && advanced ? 'expired' : claimedStatus;
  // The attempt policy's ceiling: partial work never impersonates a correct
  // answer (attemptPolicy.mjs recordQuestionAttempt, calculateStepPartialCredit).
  const creditCeiling = status === 'correct' ? 100 : 90;
  const boundedCredit = (value) => Math.max(0, Math.min(creditCeiling, finite(value, 0)));
  return normalizeQuestionRecord({
    ...canonical,
    ...claimed,
    status,
    attemptCount,
    totalAttempts: Math.max(totalAttempts, finite(canonical.totalAttempts, 0)),
    variantIndex: envelope.kind === 'questionReplacement'
      ? Math.max(finite(canonical.variantIndex, 0), finite(claimed.variantIndex, 0))
      : finite(canonical.variantIndex, 0),
    partialCredit: Math.max(finite(canonical.partialCredit, 0), boundedCredit(claimed.partialCredit)),
    bestPartialCredit: Math.max(
      finite(canonical.bestPartialCredit, 0),
      boundedCredit(claimed.bestPartialCredit ?? claimed.partialCredit),
    ),
    timeSpent: Math.max(finite(canonical.timeSpent, 0), Math.max(0, Math.min(86_400, finite(claimed.timeSpent, 0)))),
  });
};

/**
 * Can the server mark this submission itself?
 *
 * When it can, the browser's verdict is not consulted at all. A step submission
 * is not a final answer and is never re-graded here: a Step Algebra step that
 * carries its raw work is credited by verifyStepAlgebraStep in
 * buildIngestedAttempt, and any other step record is sanitized.
 */
export const serverCanRegradeEnvelope = ({ envelope, question }) => {
  if (envelope?.kind !== 'ordinarySubmission') return { regrade: false, reason: `kind:${envelope?.kind || 'unknown'}` };
  const support = serverResponseGradingSupport(question);
  if (!support.supported) return { regrade: false, reason: support.reason };
  if (!envelope.response || responseIsBlank(envelope.response)) return { regrade: false, reason: 'no-raw-response' };
  // A structured-response surface (a registry tool, or a question type graded
  // by a shared structured grader) can only be marked from its structured
  // work. A response captured by a client built BEFORE that contract existed
  // — still sitting in a Chromebook's offline queue — carries only an opaque
  // string. It is not lost and not blocked: it takes the same sanitized,
  // attempt-bounded path every such submission took before, and the record
  // says why (`serverGradingReason`). See docs/architecture/
  // SERVER_GRADING_COVERAGE.md "Legacy-shaped responses".
  if (usesToolResponse(question) && !isToolResponse(envelope.response)) {
    return { regrade: false, reason: 'legacy-unstructured-response' };
  }
  if (!questionGraderAccepts(question, envelope.response)) {
    return { regrade: false, reason: 'legacy-unstructured-response' };
  }
  // Never reachable once the coverage gate passes; fail-closed if it were.
  if (sharedGraderDrift(question).length) return { regrade: false, reason: 'grader-declaration-drift' };
  return { regrade: true, reason: null };
};

/**
 * Turn an accepted envelope into the canonical attempt and every projection it
 * owns — through the same attempt policy, evidence builder and completion rule
 * a manual Submit and the deadline finalizer already use.
 */
export const buildIngestedAttempt = ({
  envelope: claimedEnvelope,
  assignment,
  question,
  canonicalRecord,
  gradeDocument = {},
  classworkIndices = [],
  dolIndices = [],
  dolSectionScore = null,
  // WHEN THE STUDENT DID IT, and separately WHEN THE SERVER HEARD ABOUT IT.
  // Everything academic below is stamped with the first. The second reaches
  // only the receipt, which is a delivery fact rather than an academic one.
  occurredAt = null,
  ingestedAt = Date.now(),
  timeZone = SCHOOL_TIME_ZONE,
  // For a Modeling Lab question: the server-written evaluation this attempt
  // names (modelingLabGrading.mjs selectModelingLabMarker), read by the
  // caller inside the same transaction. Never anything the browser sent.
  modelingLabMarker = null,
  // settings/serverGrading.requireStepWork (functions/index.js): once queues
  // from clients built before step work existed have drained, the platform
  // retires the legacy step path below. Off unless the setting says so.
  requireStepWork = false,
} = {}) => {
  const envelope = withAuthoritativeActivityRole({ envelope: claimedEnvelope, question });
  const canonical = stripNonCanonicalInspectionFields(normalizeQuestionRecord(canonicalRecord));
  const academicAt = occurredAt === null || occurredAt === undefined
    ? resolveAcademicOccurrenceAt({ envelope, assignment, ingestedAt })
    : finite(occurredAt, ingestedAt);
  const activityPolicy = getEffectiveActivityPolicy(envelope.activityRole);
  const teacherGrantedExtraAttempts = resolveTeacherGrantedExtraAttempts({
    assignment,
    activityRole: envelope.activityRole,
    classId: gradeDocument?.classId || null,
    studentId: envelope?.studentId || null,
  });
  // The question the student was shown: the stored question with the same
  // runtime repair QuestionEngine applies, and — for a question-family slot —
  // the instance rebuilt from its delivery pin.
  const family = envelope.kind === 'questionReplacement'
    ? { familyBacked: false, question: deliveredQuestionForGrading(question), pin: null, reason: null }
    : resolveServerGradingQuestion({
      assignment,
      question,
      questionIndex: envelope.questionIndex,
      variantIndex: canonical.variantIndex,
      canonicalRecord: canonical,
      claimedDelivery: envelope.familyDelivery,
      studentId: envelope?.studentId || null,
      classId: gradeDocument?.classId || null,
    });
  // A delivery pin was offered but cannot be trusted — it does not reproduce,
  // or it names an instance this student was never allocated (a classmate's
  // pin). The server cannot verify what was shown, so the work is held for a
  // teacher (needs-review: kept, never retired) rather than credited on the
  // browser's word or graded against someone else's question.
  if (family.refused) return { blocked: true, reason: family.reason };
  const gradingQuestion = family.question || question;
  const maximumAttempts = resolveQuestionMaximumAttempts({
    question: gradingQuestion,
    maximumAttempts: activityPolicy.attempts,
    activityPolicy,
    teacherGrantedExtraAttempts,
  });
  let regrade = family.familyBacked && !family.question
    ? { regrade: false, reason: family.reason }
    : serverCanRegradeEnvelope({ envelope, question: gradingQuestion });

  let record;
  let result;
  let gradedBy;
  let serverGrading = null;
  /*
   * A MODELING LAB IS GRADED BY ITS OWN SERVER SUBSYSTEM.
   *
   * The attempt is recorded from the evaluation the `submitModelingLab`
   * callable wrote, never from the record or verdict the browser relayed. No
   * evaluation means no verified result to record, so the work is kept for a
   * teacher rather than credited on the browser's word.
   */
  const modelingLab = text(gradingQuestion?.type) === 'modelingLab' && envelope.kind === 'ordinarySubmission';
  if (modelingLab && !modelingLabMarker?.result?.evaluation) {
    return { blocked: true, reason: 'modeling-lab-evaluation-missing' };
  }
  /*
   * A grader can learn only while grading that the student was shown a
   * surface the server does not mark — a balance literal whose workspace
   * could not be built falls back to a typed answer box, and that box has no
   * key. That is a device-graded question, not ungradable work: it takes the
   * sanitized path, exactly as if support had said so up front. Any other
   * refusal still holds the work for review.
   */
  let regradeGrading = null;
  if (!modelingLab && regrade.regrade) {
    regradeGrading = gradeServerResponse({ question: gradingQuestion, response: envelope.response });
    if (!regradeGrading.graded && DEVICE_GRADED_REASON.test(text(regradeGrading.reason))) {
      regrade = { regrade: false, reason: regradeGrading.reason };
    }
  }
  /*
   * A STEP ALGEBRA STEP THAT CARRIES ITS RAW WORK IS CREDITED BY THE SERVER.
   *
   * The step's credit is derived here from `stepWork`, against the question
   * the student was shown (a family instance rebuilt from its pin), by the
   * same functions the workspace used (serverGrading/
   * stepAlgebraStepVerification.mjs), and applied to the CANONICAL record
   * through the same recordQuestionStep the browser applied — the client's
   * record, its stepGrades and its partial credit are not read at all. A
   * step that does not follow from a state this variant has been in, or is
   * not what its operation produces, is recorded as an `unverified-step`
   * that earns nothing; an attempt it spends (a rejected or inefficient
   * move) is still spent. recordQuestionStep never completes a question.
   *
   * A step without stepWork — queued by a client built before step work
   * existed — keeps the sanitized path below, unchanged. So does a step whose
   * states are plain algebra but beyond the server's complexity budget
   * (STEP_BEYOND_SERVER_BUDGET): an honest student can outgrow it, and
   * recording that step as unverified would strand every later step. That is
   * no more open than leaving stepWork out; the two retire together.
   *
   * RETIRING THE LEGACY PATH. Leaving stepWork out is how a forged step
   * envelope still reaches the sanitized path (up to 90%). With
   * `requireStepWork` on, a step without stepWork, on a question whose steps
   * the server can verify, is recorded as an unverified step that earns
   * nothing and spends no attempt.
   */
  const stepQuestionVerifiable = envelope.kind === 'stepSubmission' && !(family.familyBacked && !family.question);
  const legacyStepRefused = requireStepWork === true
    && stepQuestionVerifiable
    && !envelope.stepWork
    && stepCreditContext(gradingQuestion).supported;
  const stepVerification = stepQuestionVerifiable && envelope.stepWork
    ? verifyStepAlgebraStep({ question: gradingQuestion, record: canonical, stepWork: envelope.stepWork })
    : legacyStepRefused
      ? unverifiedStep(null, 'step-work-required')
      : null;
  const serverStep = stepVerification?.eligible === true ? stepVerification : null;
  if (serverStep) {
    const outcome = recordQuestionStep({
      record: canonical,
      stepGrade: serverStep.stepGrade,
      countsAttempt: serverStep.countsAttempt,
      statePatch: serverStep.statePatch,
      supportUsage: envelope.supportUsage,
      maximumAttempts,
      occurredAt: academicAt,
    });
    record = outcome.record;
    result = {
      isCorrect: record.status === 'correct',
      status: record.status,
      attemptCount: record.attemptCount,
      remainingAttempts: outcome.result.remainingAttempts,
      expired: outcome.result.expired === true,
      partialCredit: record.partialCredit,
    };
    gradedBy = 'server';
  } else if (modelingLab) {
    const grading = gradeModelingLabEvaluation(modelingLabMarker.result.evaluation);
    serverGrading = { ...grading, graderVersion: 'modeling-lab-server-evaluation-v1' };
    const attemptInputs = attemptInputsFromGrading(grading);
    const outcome = recordQuestionAttempt({
      record: canonical,
      isCorrect: attemptInputs.isCorrect,
      questionDetails: `Server-graded modeling lab · ${Math.round(grading.score * 100)}% composite.`,
      timeSpent: envelope.timeSpentSeconds,
      parts: attemptInputs.parts,
      supportUsage: envelope.supportUsage,
      responseKey: text(envelope.response?.value),
      partialCreditPercent: attemptInputs.partialCreditPercent,
      maximumAttempts,
      occurredAt: academicAt,
    });
    record = outcome.record;
    result = outcome.result;
    gradedBy = 'server';
  } else if (regrade.regrade) {
    const grading = regradeGrading;
    if (!grading.graded) {
      return { blocked: true, reason: grading.reason || 'server-grading-failed' };
    }
    serverGrading = grading;
    // The same mapping the browser used when the student pressed Check, so
    // one raw response produces one record whichever path delivered it.
    const attemptInputs = attemptInputsFromGrading(grading);
    const outcome = recordQuestionAttempt({
      record: canonical,
      isCorrect: attemptInputs.isCorrect,
      questionDetails: text(gradingQuestion?.prompt).slice(0, 400),
      timeSpent: envelope.timeSpentSeconds,
      parts: attemptInputs.parts,
      supportUsage: envelope.supportUsage,
      responseKey: text(envelope.response?.value) || JSON.stringify(list(envelope.response?.fields)),
      // Derived from the server's own grading result, never from a number a
      // browser sent.
      partialCreditPercent: attemptInputs.partialCreditPercent,
      maximumAttempts,
      // `lastAttemptAt` is academic history, not a delivery timestamp.
      occurredAt: academicAt,
    });
    record = outcome.record;
    result = outcome.result;
    gradedBy = 'server';
  } else {
    record = sanitizeClientAttemptRecord({
      envelope,
      canonicalRecord: canonical,
      maximumAttempts,
      // The browser always sends the raw response with an ordinary submission
      // (App.jsx), and a step never completes a question. Either way round, a
      // claimed `correct` here would be a verdict the server was denied the
      // chance to check.
      allowClaimedCorrect: envelope.kind !== 'stepSubmission' && regrade.reason !== 'no-raw-response',
    });
    result = {
      isCorrect: record.status === 'correct',
      status: record.status,
      attemptCount: record.attemptCount,
      remainingAttempts: Math.max(0, maximumAttempts - record.attemptCount),
      expired: record.status === 'expired',
      partialCredit: record.partialCredit,
    };
    gradedBy = 'client';
  }

  const cleanRecord = stripNonCanonicalInspectionFields(record);
  const gradingEvidence = envelope.response
    ? captureAutomaticGradingEvidence({
      response: envelope.response,
      grading: { ...result, isCorrect: cleanRecord.status === 'correct', parts: cleanRecord.partGrades },
      question: gradingQuestion,
      submittedAt: new Date(academicAt).toISOString(),
      source: envelope.kind,
      gradingAuthority: gradedBy === 'server' ? 'server' : 'client-record-sanitized',
      graderVersion: gradedBy === 'server' ? (serverGrading?.graderVersion || 'ordinary-response-v3') : 'client-attempt-record-v1',
      automaticScore: Math.round(getQuestionCredit(cleanRecord) * 100),
    })
    : null;

  const stamped = {
    ...cleanRecord,
    lastSubmissionId: envelope.actionId,
    submissionOrigin: 'server-ingestion',
    gradedBy,
    // A server-credited step names why it earned nothing, when it did not; a
    // step whose work the server could not credit (a question it does not
    // hold as delivered) names why it was sanitized instead.
    serverGradingReason: serverStep
      ? (serverStep.verified ? null : serverStep.reason)
      : stepVerification
        ? stepVerification.reason
        : regrade.regrade || modelingLab ? null : regrade.reason,
    ...(modelingLab ? { modelingLabSubmissionId: text(modelingLabMarker.submissionId) || null } : {}),
    // The audit trail for a delayed recovery: the record reads as the day the
    // student worked, and says separately when it actually arrived.
    academicOccurredAt: new Date(academicAt).toISOString(),
    ingestedAt: new Date(finite(ingestedAt, Date.now())).toISOString(),
    recoveredLate: finite(ingestedAt, Date.now()) - academicAt > 60_000 ? true : null,
    // THE CANONICAL DELIVERY PIN. Once written, every device renders this
    // instance for this variant and the server re-grades against it. A
    // replacement starts a new variant, so it clears the old pin. Records of
    // questions that are not family-backed keep their exact shape.
    ...(family.familyBacked || canonical.familyDelivery ? {
      familyDelivery: envelope.kind === 'questionReplacement'
        ? null
        : family.pin || normalizeDeliveryPin(canonical.familyDelivery),
      familyDeliveryVerification: family.familyBacked && family.pin ? (family.verification || null) : null,
    } : {}),
  };

  const assignmentId = trimmed(envelope.assignmentId);
  const recordedAt = new Date(academicAt).toISOString();
  const assignmentTracker = {
    ...(gradeDocument?.gradesByAssignment?.[assignmentId] || {}),
    [String(envelope.questionIndex)]: stamped,
    [Number(envelope.questionIndex)]: stamped,
  };

  const completion = evaluateClassworkCompletionRule({
    classworkIndices,
    assignmentTracker,
    totalTimeSeconds: finite(gradeDocument?.assignmentActivity?.[assignmentId]?.totalTimeSeconds, 0),
    completionRule: assignment?.completionRule || {},
  });
  const classworkGrade = classworkGradeProjection({
    completion,
    existingGrade: gradeDocument?.classworkGradesByAssignment?.[assignmentId] || null,
    recordedAt,
  });

  const supportUsage = mergeSupportUsage(
    gradeDocument?.supportUsageByAssignment?.[assignmentId] || {},
    envelope.assignmentSupportUsage || envelope.supportUsage || {},
  );

  // THE DOL BUCKET IS THE DAY THE STUDENT ANSWERED.
  // Deriving it from the ingestion time files a September 14 DOL under
  // September 15, where the class it belongs to cannot see it.
  const dolDateKey = zonedDateKey(academicAt, timeZone);
  const dolGrade = envelope.activityRole === 'dol' && dolSectionScore !== null
    ? dolSectionProjection({
      existing: gradeDocument?.dolGradesByAssignment?.[assignmentId] || null,
      dateKey: dolDateKey,
      score: dolSectionScore,
      questionIndices: dolIndices,
      recordedAt,
      finalize: false,
      correctionReason: 'teacher-dol-recovery',
      allowReopen: dolTeacherRecoveryActiveAt({
        assignment,
        classId: gradeDocument?.classId || null,
        at: academicAt,
        timeZone,
      }),
    })
    : null;

  const evidenceEvent = question?.type === 'modelingLab' ? null : buildAttemptEvidenceEvent({
    studentId: trimmed(envelope.studentId),
    assignment,
    // The delivered instance, so the event names the family and the exact
    // question (its fingerprint) the student answered.
    question: gradingQuestion,
    questionIndex: Number(envelope.questionIndex),
    activityRole: envelope.activityRole,
    attemptRecord: stamped,
    attemptResult: result,
    supportUsage: stamped.supportUsage || {},
    occurredAt: academicAt,
  });

  return {
    blocked: false,
    reason: null,
    record: stamped,
    result,
    gradedBy,
    gradingEvidence,
    gradingEvidenceDocumentId: responseInspectionEvidenceDocumentId({
      assignmentId,
      questionIndex: envelope.questionIndex,
    }),
    evidenceEvent,
    assignmentTracker,
    classworkGrade,
    supportUsage,
    dolGrade,
    dolDateKey,
    academicAt,
  };
};

export { SUBMISSION_DISPOSITION, dolSectionProjection, getQuestionCredit, normalizeOrdinaryResponse };
