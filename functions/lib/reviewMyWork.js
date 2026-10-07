"use strict";

/*
 * REVIEW MY WORK — a student reads their OWN answers beside the worked
 * solutions, once an assignment is over for them.
 *
 * Product decision 3: every completed assignment includes worked solutions,
 * shown once the student's work on that item is closed. The student's exact
 * submitted answer lives in grades/{sid}/responseInspectionEvidence (rules:
 * read false), and the reason for a teacher's grade change lives in
 * grades/{sid}/gradeOverrideAudits (server-only). Until now only the teacher
 * could read either (inspectStudentResponse). This module is the student's
 * read-only door to the SAME records, and it opens only when ALL of these hold:
 *
 *   - the caller is a signed-in student, and the id read is the one in their
 *     token (index.js passes requireStudent(request)); anything named in the
 *     request data is ignored, so no student can read another's work;
 *   - the assignment is assigned to the student's current class;
 *   - it is not a secure Test Cycle test (those release through their own
 *     assessment path, functions/lib/testCycle.js — never through here);
 *   - the teacher has not hidden it from students (archived, paused, or an
 *     unfinished authoring draft);
 *   - the student's own final cutoff has passed (the one resolver ingestion
 *     uses: sectionDeadline.mjs assignmentFinalCloseAt, with their private
 *     override and support profile) — so nothing here can reveal an answer
 *     while the work can still be submitted;
 *   - feedback is not held by the teacher (Quiz/Test release policy).
 *
 * What leaves: the question (the exact delivered instance when one was kept,
 * so the solution matches the version the student saw), the submitted answer
 * reduced to kind/type/value/fields, the outcome, the credit, and — when a
 * teacher changed the grade — one of the fixed reason labels. Never the
 * teacher's private note, identity or email, never the grading trace or the
 * automatic grader internals.
 *
 * projectReviewMyWork is pure (tested in tests/platform/reviewMyWorkServer.test.mjs);
 * loadMyReviewWorkHandler does the reads and the gates.
 */

const { HttpsError } = require("firebase-functions/v2/https");
const { runtimeQuestionsFromAssignment } = require("./assignmentRuntime");
const { assignmentFeedbackIsHeld, assignmentFeedbackWasReleased } = require("./activityFeedback");
const studentWorkloadIndices = require("./studentWorkloadIndices");

const RESPONSE_INSPECTION_EVIDENCE_COLLECTION = "responseInspectionEvidence";
const GRADE_OVERRIDE_AUDITS_COLLECTION = "gradeOverrideAudits";
const CLASS_POINT_REWARD_REDEMPTIONS_COLLECTION = "classPointRewardRedemptions";
const ASSIGNMENT_GRADE_OVERRIDE_KEY = "__assignment";
const SECTION_ZERO_SOURCE = "teacher-section-zero";

// The student-readable labels of an integrity consequence. Mirrors
// ASSIGNMENT_ZERO_REASONS in functions/index.js (asserted equal by the test):
// only one of these strings is ever shown, never the note beside it.
const INTEGRITY_REASON_LABELS = Object.freeze([
  "Prohibited cellphone use",
  "Unauthorized assistance / cheating",
  "Account or laptop switching",
]);

const OUTCOME = Object.freeze({
  CORRECT: "correct",
  PARTIAL: "partial",
  INCORRECT: "incorrect",
  NOT_ANSWERED: "notAnswered",
  EXCUSED: "excused",
});

const SOLUTION_SOURCE = Object.freeze({
  DELIVERED: "delivered",
  FAMILY: "family",
  ASSIGNMENT: "assignment",
  UNAVAILABLE: "unavailable",
});

const MAX_TEXT = 2000;
const MAX_STRUCTURED_JSON = 12000;
const MAX_PROMPT = 400;

let depsPromise = null;
/** The ESM helpers this projection reads, loaded once. */
function reviewMyWorkDeps() {
  if (!depsPromise) {
    depsPromise = Promise.all([
      import("../shared/responseInspector.mjs"),
      import("../shared/sectionDeadline.mjs"),
      import("../shared/studentAssignmentOverrides.mjs"),
      import("../shared/activityPolicies.mjs"),
      import("../shared/classPointRewards.mjs"),
      import("../shared/questionFamilyGrading.mjs"),
      import("../shared/questionFamilyInstance.mjs"),
      import("../shared/serverGrading/deliveredQuestion.mjs"),
      import("../shared/assessmentAvailability.mjs"),
      import("../shared/testCyclePolicy.mjs"),
    ]).then(([inspector, deadlines, overrides, policies, rewards, familyGrading, familyInstance, delivered, availability, testCyclePolicy]) => ({
      inspector, deadlines, overrides, policies, rewards, familyGrading, familyInstance, delivered, availability, testCyclePolicy,
    }));
  }
  return depsPromise;
}

const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value : []);
const clean = (value, max = 200) => String(value ?? "").trim().slice(0, max);

/* ------------------------------------------------------------------ gates */

// index.js secureAssignmentMode / `secure`, plus the older Test Cycle
// declaration (gradingPurpose 'test' + rolePolicy gating + a Review section)
// every other surface also treats as a cycle — whichever is stricter.
const isTestCycleAssignment = (assignment = {}, deps = null) => (
  String(assignment?.assessmentPolicy?.mode || "") === "testCycle"
  || assignment?.secure === true
  || deps?.testCyclePolicy?.declaresTestCycle?.(assignment) === true
);

// Authoring states that mean "not finished, not for students"
// (src/platform/assignments/assignmentAvailability.js isUnpublishedDraft).
const DRAFT_AUTHORING_STATES = new Set(["incomplete", "needsReview"]);

/**
 * Hidden from students: archived, paused (`unpublished`) or still a draft.
 * Home never lists such work, so its answers and solutions are not offered
 * here either, whatever its dates say.
 */
const hiddenFromStudents = (assignment = {}, deps = null) => {
  const availability = deps?.availability;
  if (availability?.assignmentIsArchived?.(assignment) || assignment?.archived === true) return true;
  if (availability?.assignmentIsUnpublished?.(assignment) || assignment?.unpublished === true) return true;
  const state = clean(assignment?.authoringState || assignment?.authoringReview?.state, 40);
  return Boolean(state) && DRAFT_AUTHORING_STATES.has(state);
};

const assignedToClass = (assignment = {}, classId = null) => {
  const ids = list(assignment.assignedClassIds).map((value) => String(value).trim()).filter(Boolean);
  return Boolean(classId) && ids.includes(String(classId));
};

/**
 * Held feedback, the server's way (activityFeedback.js) AND the browser's way
 * (any question whose role policy says teacherRelease) — whichever is stricter.
 */
const feedbackHeld = (assignment, questions, policies) => {
  if (assignmentFeedbackIsHeld(assignment)) return true;
  if (assignmentFeedbackWasReleased(assignment)) return false;
  return questions.some((question) => (
    policies.getEffectiveActivityPolicy(question?.activityRole || question?.role)?.feedback === "teacherRelease"
  ));
};

/* ------------------------------------------------------------- per question */

/** Same test as functions/index.js questionWasAttempted. */
const questionWasAttempted = (record) => {
  if (!isObject(record)) return false;
  if (Number(record.totalAttempts || record.attemptCount || 0) > 0) return true;
  if (record.status === "correct" || record.status === "expired") return true;
  const partial = Number(record.bestPartialCredit ?? record.partialCredit ?? 0);
  return Number.isFinite(partial) && partial > 0;
};

/**
 * The evidence document applies only to the attempt the tracker holds now —
 * the same identity checks as functions/index.js trustedResponseInspectionEvidence.
 */
const trustedEvidence = (data, { assignmentId, questionIndex, record }) => {
  if (!isObject(data) || !isObject(record)) return null;
  if (String(data.assignmentId || "") !== String(assignmentId || "")) return null;
  if (Number(data.questionIndex) !== Number(questionIndex)) return null;
  const submissionId = String(record.lastSubmissionId || "");
  if (!submissionId || String(data.submissionId || "") !== submissionId) return null;
  if (Number(data.variantIndex ?? 0) !== Number(record.variantIndex ?? 0)) return null;
  if (Number(data.totalAttempts ?? 0) !== Number(record.totalAttempts ?? record.attemptCount ?? 0)) return null;
  return isObject(data.evidence) ? data.evidence : null;
};

const plainValue = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.slice(0, MAX_TEXT);
  if (typeof value === "number" || typeof value === "boolean") return value;
  try {
    const text = JSON.stringify(value);
    if (!text || text.length > MAX_STRUCTURED_JSON) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
};

/** kind / type / value / fields[{id, value, isComplete}] — nothing else. */
const sanitizeSubmittedResponse = (response) => {
  if (!isObject(response)) return null;
  const fields = list(response.fields)
    .filter((field) => isObject(field) && clean(field.id, 120))
    .slice(0, 40)
    .map((field) => ({
      id: clean(field.id, 120),
      value: plainValue(field.value),
      isComplete: field.isComplete === true,
    }));
  return {
    kind: clean(response.kind, 40) || null,
    type: clean(response.type, 80) || null,
    value: plainValue(response.value),
    fields,
  };
};

const jsonSafe = (value) => {
  try {
    return JSON.parse(JSON.stringify(value ?? null));
  } catch {
    return null;
  }
};

/** The question to show the solution of, and where it came from. */
const solutionQuestion = ({ question, record, evidence, assignment, questionIndex, studentId, classId, deps }) => {
  const authority = deps.inspector.authoritativeQuestionForInspection({ question, evidence });
  if (authority.authoritative && authority.source === "stored-delivered-instance") {
    return { deliveredQuestion: jsonSafe(authority.question), solutionSource: SOLUTION_SOURCE.DELIVERED };
  }
  if (authority.authoritative) {
    return {
      deliveredQuestion: jsonSafe(deps.delivered.deliveredQuestionForGrading(authority.question)),
      solutionSource: SOLUTION_SOURCE.ASSIGNMENT,
    };
  }
  if (deps.familyInstance.isFamilyBackedQuestion(question) && record?.familyDelivery) {
    try {
      const family = deps.familyGrading.resolveServerGradingQuestion({
        assignment,
        question,
        questionIndex: Number(questionIndex) || 0,
        variantIndex: Number(record?.variantIndex) || 0,
        canonicalRecord: record,
        studentId,
        classId,
      });
      if (family?.question) return { deliveredQuestion: jsonSafe(family.question), solutionSource: SOLUTION_SOURCE.FAMILY };
    } catch {
      // Fall through: a template solution could show a different version.
    }
  }
  // The stored template would show the answer to a DIFFERENT version than the
  // student saw, so no solution is better than a wrong one.
  return { deliveredQuestion: null, solutionSource: SOLUTION_SOURCE.UNAVAILABLE };
};

const integrityReason = (value) => (INTEGRITY_REASON_LABELS.includes(String(value || "")) ? String(value) : null);

/** The fixed reason label for an active per-question correction, from its audit. */
const correctionReason = ({ audits, questionIndex, override, deps }) => {
  const candidates = list(audits)
    .filter((entry) => Number(entry?.questionIndex) === Number(questionIndex)
      && entry?.overrideActiveAfter !== false
      && deps.inspector.OVERRIDE_REASONS.includes(String(entry?.reason || "")))
    .sort((left, right) => String(left?.at || "").localeCompare(String(right?.at || "")));
  const exact = candidates.filter((entry) => override?.updatedAt && String(entry.at || "") === String(override.updatedAt));
  const chosen = (exact.length ? exact : candidates).at(-1);
  return chosen ? String(chosen.reason) : null;
};

const outcomeFromScore = (score) => (score >= 100 ? OUTCOME.CORRECT : score > 0 ? OUTCOME.PARTIAL : OUTCOME.INCORRECT);

const promptSummary = (question = {}) => {
  const text = typeof question?.prompt === "string" ? question.prompt
    : typeof question?.question === "string" ? question.question
      : typeof question?.title === "string" ? question.title : "";
  return text.replace(/\s+/g, " ").trim().slice(0, MAX_PROMPT);
};

/**
 * THE PROJECTION. Pure: every input was read (or derived) by the caller.
 *
 * `evidenceByIndex` holds the raw responseInspectionEvidence documents, keyed
 * by storage index; `audits` the gradeOverrideAudits documents for this
 * assignment; `omitted` the indices a reduced-workload accommodation or a
 * Practice Pass took off this student's list.
 */
function projectReviewMyWork({
  assignment,
  assignmentId,
  studentId,
  classId = null,
  gradeData = {},
  evidenceByIndex = {},
  audits = [],
  omitted = new Set(),
  excused = false,
  deps,
} = {}) {
  const questions = runtimeQuestionsFromAssignment(assignment);
  const tracker = isObject(gradeData?.gradesByAssignment?.[assignmentId]) ? gradeData.gradesByAssignment[assignmentId] : {};
  const overrides = isObject(gradeData?.teacherGradeOverridesByAssignment?.[assignmentId])
    ? gradeData.teacherGradeOverridesByAssignment[assignmentId]
    : {};
  const assignmentZero = overrides[ASSIGNMENT_GRADE_OVERRIDE_KEY]?.active === true
    ? { reason: integrityReason(overrides[ASSIGNMENT_GRADE_OVERRIDE_KEY].reason) }
    : null;

  const rows = [];
  questions.forEach((question, index) => {
    if (question?.teacherExcluded === true) return;
    const record = tracker[String(index)] ?? tracker[index] ?? null;
    const override = overrides[String(index)] ?? overrides[index] ?? null;
    const attempted = questionWasAttempted(record);
    const evidence = attempted
      ? trustedEvidence(evidenceByIndex[index] ?? evidenceByIndex[String(index)], { assignmentId, questionIndex: index, record })
      : null;
    const submitted = evidence?.submittedResponse
      ? { response: sanitizeSubmittedResponse(evidence.submittedResponse), source: "submitted" }
      : attempted && deps.inspector.legacyRecordedResponse(record)
        ? { response: sanitizeSubmittedResponse(deps.inspector.legacyRecordedResponse(record)), source: "recorded" }
        : { response: null, source: null };

    const sectionZero = override?.active === true
      && override?.persistent === true
      && override?.source === SECTION_ZERO_SOURCE
      && Number.isFinite(Number(override?.score));
    const effective = record ? deps.inspector.effectiveGradeStatus(record, override) : null;
    const teacherChanged = Boolean(sectionZero || effective?.overridden);

    let outcome;
    let credit;
    if (excused) {
      outcome = OUTCOME.EXCUSED;
      credit = null;
    } else if (sectionZero) {
      credit = Math.max(0, Math.min(100, Number(override.score)));
      outcome = outcomeFromScore(credit);
    } else if (!attempted && !effective?.overridden) {
      outcome = omitted.has(index) ? OUTCOME.EXCUSED : OUTCOME.NOT_ANSWERED;
      credit = omitted.has(index) ? null : 0;
    } else {
      credit = effective.score;
      outcome = outcomeFromScore(credit);
    }

    const teacherReason = !teacherChanged
      ? null
      : sectionZero
        ? integrityReason(override.reason)
        : correctionReason({ audits, questionIndex: index, override, deps });

    const { deliveredQuestion, solutionSource } = solutionQuestion({
      question, record, evidence, assignment, questionIndex: index, studentId, classId, deps,
    });

    rows.push({
      index,
      questionId: clean(question?.questionId || question?.id, 200) || null,
      sectionTitle: clean(question?.sectionTitle, 120) || null,
      sectionRole: clean(question?.activityRole, 40).toLowerCase() || null,
      prompt: promptSummary(question),
      deliveredQuestion,
      solutionSource,
      submittedResponse: submitted.response,
      responseSource: submitted.source,
      outcome,
      credit,
      teacherChanged,
      teacherReason,
    });
  });

  return {
    assignmentId: String(assignmentId),
    title: clean(assignment?.title, 200) || null,
    excused: excused === true,
    assignmentChange: assignmentZero,
    questions: rows,
  };
}

/* ------------------------------------------------------------------ handler */

/**
 * `auth` is the result of index.js requireStudent(request): { uid, studentId }
 * from the caller's verified token. `data.studentId`, if sent, is ignored.
 */
async function loadMyReviewWorkHandler({ db, auth, data, now = Date.now() } = {}) {
  const studentId = clean(auth?.studentId, 200);
  if (!studentId) throw new HttpsError("permission-denied", "Review My Work is available to signed-in students.");
  const assignmentId = clean(data?.assignmentId, 400);
  // One document id, never a path: "asg/sub/doc" would otherwise address a
  // document in a subcollection of assignments.
  if (!assignmentId || assignmentId.includes("/")) throw new HttpsError("invalid-argument", "Choose an assignment to review.");

  const deps = await reviewMyWorkDeps();
  const gradeRef = db.collection("grades").doc(studentId);
  const overrideId = deps.overrides.studentAssignmentOverrideId(studentId, assignmentId);
  const [gradeSnap, assignmentSnap, privateSnap] = await Promise.all([
    gradeRef.get(),
    db.collection("assignments").doc(assignmentId).get(),
    overrideId
      ? db.collection(deps.overrides.STUDENT_ASSIGNMENT_OVERRIDES_COLLECTION).doc(overrideId).get()
      : Promise.resolve(null),
  ]);
  if (!assignmentSnap?.exists) throw new HttpsError("not-found", "That assignment is no longer available.");
  if (!gradeSnap?.exists) throw new HttpsError("failed-precondition", "Your class record is not ready yet.");

  const assignment = { id: assignmentSnap.id, ...assignmentSnap.data() };
  const gradeData = gradeSnap.data() || {};
  const classId = clean(gradeData.classId, 200) || null;
  if (isTestCycleAssignment(assignment, deps)) {
    throw new HttpsError("failed-precondition", "Test results are reviewed in the test's own results page.");
  }
  if (hiddenFromStudents(assignment, deps)) {
    throw new HttpsError("failed-precondition", "Your teacher has put this assignment away, so it cannot be reviewed right now.");
  }
  if (!assignedToClass(assignment, classId)) {
    throw new HttpsError("permission-denied", "This assignment is not assigned to your class.");
  }

  const privateOverride = privateSnap?.exists ? privateSnap.data() || null : (privateSnap ? null : undefined);
  const finalCloseAtMs = deps.deadlines.assignmentFinalCloseAt(
    assignment, null, studentId, gradeData.profile || null, { privateOverride },
  );
  if (finalCloseAtMs === null || !(Number(now) > Number(finalCloseAtMs))) {
    throw new HttpsError("failed-precondition", "Your answers and solutions appear here after this assignment closes.");
  }
  const questions = runtimeQuestionsFromAssignment(assignment);
  if (feedbackHeld(assignment, questions, deps.policies)) {
    throw new HttpsError("failed-precondition", "Your teacher has not released feedback for this assignment yet.");
  }

  const resolvedOverride = deps.overrides.resolveStudentOverride({ assignment, studentId, privateOverride });
  const excused = deps.overrides.resolveStudentDeadlines({ assignment, override: resolvedOverride }).excused === true;

  // Items this student was not responsible for: a reduced-workload
  // accommodation, and Practice under an active Practice Pass.
  const omitted = await studentWorkloadIndices.studentOmittedFor({ assignment, gradeData, assignmentId, nowValue: Number(now) });
  const practiceIndices = questions
    .map((question, index) => (question?.teacherExcluded !== true && String(question?.activityRole || "").toLowerCase() === "practice" ? index : null))
    .filter((index) => index !== null);
  if (practiceIndices.length && classId) {
    const redemptionSnap = await db.collection(CLASS_POINT_REWARD_REDEMPTIONS_COLLECTION)
      .doc(deps.rewards.practicePassRedemptionId({ studentId, classId, assignmentId, rewardCode: deps.rewards.PRACTICE_PASS_REWARD_CODE }))
      .get();
    if (deps.rewards.isActivePracticePassRedemption(redemptionSnap?.exists ? redemptionSnap.data() : null)) {
      practiceIndices.forEach((index) => omitted.add(index));
    }
  }

  const tracker = isObject(gradeData.gradesByAssignment?.[assignmentId]) ? gradeData.gradesByAssignment[assignmentId] : {};
  const attemptedIndices = questions
    .map((question, index) => index)
    .filter((index) => questions[index]?.teacherExcluded !== true
      && questionWasAttempted(tracker[String(index)] ?? tracker[index]));
  const evidenceSnaps = await Promise.all(attemptedIndices.map((index) => gradeRef
    .collection(RESPONSE_INSPECTION_EVIDENCE_COLLECTION)
    .doc(deps.inspector.responseInspectionEvidenceDocumentId({ assignmentId, questionIndex: index }))
    .get()));
  const evidenceByIndex = Object.fromEntries(attemptedIndices.map((index, position) => [
    index,
    evidenceSnaps[position]?.exists ? evidenceSnaps[position].data() || null : null,
  ]));

  const overrides = gradeData.teacherGradeOverridesByAssignment?.[assignmentId] || {};
  const anyCorrection = Object.entries(overrides).some(([key, value]) => !key.startsWith("__") && value?.active === true);
  const audits = anyCorrection
    ? (await gradeRef.collection(GRADE_OVERRIDE_AUDITS_COLLECTION)
      .where("assignmentId", "==", assignmentId)
      .limit(100)
      .get()).docs.map((snapshot) => snapshot.data() || {})
    : [];

  return projectReviewMyWork({
    assignment, assignmentId, studentId, classId, gradeData, evidenceByIndex, audits, omitted, excused, deps,
  });
}

module.exports = {
  INTEGRITY_REASON_LABELS,
  OUTCOME,
  SOLUTION_SOURCE,
  reviewMyWorkDeps,
  sanitizeSubmittedResponse,
  projectReviewMyWork,
  loadMyReviewWorkHandler,
};
