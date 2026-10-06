"use strict";

/*
 * THE COMMONJS BRIDGE TO THE SHARED TEST CYCLE RULES.
 *
 * Every rule — the capped grade, the corrections algorithm, the retest
 * targeting, the deterministic issuance plan, preflight — lives in
 * functions/shared/testCycle*.mjs, which the browser imports directly. Cloud
 * Functions are CommonJS, so they reach the same modules through one lazy
 * dynamic import here.
 *
 * This file adds no rules of its own. What it does add is the small amount of
 * composition that needs both the rules and the server's own bank/grading gate:
 * turning a blueprint into a plan a session can carry, and turning released
 * secure responses back into the evidence shape the corrections algorithm eats.
 */

const { runtimeQuestionsFromAssignment } = require("./assignmentRuntime");
const { assignmentGradeProgress } = require("./classroomGradeRuntime");

let sharedModules = null;
async function shared() {
  if (!sharedModules) {
    const [policy, grade, record, stages, blueprint, issuance, corrections, retest, preflight, availability, external] = await Promise.all([
      import("../shared/testCyclePolicy.mjs"),
      import("../shared/testCycleGrade.mjs"),
      import("../shared/testCycleRecord.mjs"),
      import("../shared/testCycleStages.mjs"),
      import("../shared/testCycleBlueprint.mjs"),
      import("../shared/testCycleIssuance.mjs"),
      import("../shared/testCycleCorrections.mjs"),
      import("../shared/testCycleRetest.mjs"),
      import("../shared/testCyclePreflight.mjs"),
      import("../shared/assessmentAvailability.mjs"),
      import("../shared/externalAssessment.mjs"),
    ]);
    sharedModules = { policy, grade, record, stages, blueprint, issuance, corrections, retest, preflight, availability, external };
  }
  return sharedModules;
}

const clean = (value) => String(value ?? "").trim();
const list = (value) => (Array.isArray(value) ? value : []);

/**
 * Released secure responses, joined back to the plan that issued them.
 *
 * The exam session stores responses keyed by questionInstanceId and the plan
 * stores what each slot was FOR. Neither alone can say "this student missed two
 * DOK 3 questions on A.5A" — the join is what makes a correction plan possible,
 * and doing it in one place keeps the corrections and retest algorithms working
 * on identical evidence.
 */
function responsesForProfile(session = {}) {
  const plan = session.issuancePlan || {};
  const bySlot = new Map(list(plan.entries).map((entry) => [clean(entry.slotId), entry]));
  const byInstance = new Map();
  Object.values(session.responses && typeof session.responses === "object" ? session.responses : {})
    .forEach((response) => byInstance.set(clean(response?.questionInstanceId), response));

  return list(plan.entries).map((entry) => {
    const response = byInstance.get(clean(entry.questionInstanceId))
      || [...byInstance.values()].find((value) => clean(value?.slotId) === clean(entry.slotId))
      || null;
    const slot = bySlot.get(clean(entry.slotId)) || entry;
    return {
      slotId: slot.slotId,
      targetId: slot.targetId,
      alignmentKey: slot.alignmentKey,
      dok: slot.dok,
      difficultyBand: slot.difficultyBand,
      representation: slot.representation,
      familyId: slot.familyId,
      // The tool the student answered with ("fields" for response fields), so
      // a Retest and Corrections keep it. Unknown for a slot never reached.
      toolId: response ? (clean(response.pathToolId) || "fields") : null,
      questionInstanceId: clean(response?.questionInstanceId) || clean(entry.questionInstanceId) || null,
      // A slot the student never reached is not a slot they answered wrongly,
      // but it IS missing evidence, so it counts as unmastered with score 0.
      score: Number(response?.grading?.score) || 0,
      isCorrect: Boolean(response?.grading?.isCorrect),
      // The canonical provenance block, if a server classifier wrote one; the
      // corrections planner reads it only through the registry's trust gate
      // (testCycleCorrections.mjs). The legacy free-text fields are kept for
      // the record but are never a diagnosis.
      misconceptionEvidence: response?.grading?.misconceptionEvidence || null,
      misconceptionCode: clean(response?.grading?.misconceptionCode || response?.misconceptionCode) || null,
      errorPattern: clean(response?.grading?.errorPattern || response?.errorPattern) || null,
      submittedAt: Number(response?.submittedAt) || null,
      answered: Boolean(response),
    };
  });
}

/*
 * The score a secure course-test session earned lives in secureExam.js, beside
 * `publicReview`, so the student's released review, the proctor monitor and the
 * recorded Test Cycle grade cannot compute three different numbers for one
 * session. Re-exported here because the Test Cycle release path reads it from
 * this module.
 */
const { secureSessionScorePercent, weightedSessionScorePercent } = require("./secureExam");

/**
 * The teacher-visible view of a stored plan.
 *
 * A teacher may inspect a generated correction or retest plan before unlocking
 * it. What they may NOT be handed is the generator seed, because a seed plus a
 * family reproduces the exact question and teacher devices are not a secure
 * boundary once a plan is on a screen in a classroom.
 */
function teacherVisiblePlan(plan = {}) {
  return {
    planId: plan.planId || null,
    stage: plan.stage || null,
    blueprintId: plan.blueprintId || null,
    blueprintVersion: plan.blueprintVersion || 1,
    totalQuestions: Number(plan.totalQuestions || 0),
    attempt: Number(plan.attempt || 1),
    entries: list(plan.entries).map((entry) => ({
      ordinal: entry.ordinal,
      slotId: entry.slotId,
      targetId: entry.targetId,
      alignmentKey: entry.alignmentKey,
      dok: entry.dok,
      difficultyBand: entry.difficultyBand,
      representation: entry.representation,
      weight: entry.weight,
      anchor: entry.anchor,
      familyId: entry.familyId,
      freshParallelVariant: entry.freshParallelVariant === true,
    })),
    unfilledSlots: list(plan.unfilledSlots),
  };
}

/*
 * The tracker indices belonging to one instructional stage.
 *
 * Salvaged from the closed #208 work, which had the right idea: Review is
 * ordinary V5 content and its completion is ordinary tracker state, so the
 * cycle must read the SAME progress the rest of the platform reads rather than
 * inventing a second notion of "finished the review".
 *
 * `runtimeIncludedQuestionIndicesForSection` is not reused here on purpose: its
 * allowlist is the Google Classroom section-publication vocabulary, and adding
 * cycle roles to it would offer Review as a separately publishable Classroom
 * grade column — which is exactly the second grade item this feature must not
 * create.
 */
function roleQuestionIndices(assignment = {}, role = "") {
  const wanted = clean(role).toLowerCase();
  return runtimeQuestionsFromAssignment(assignment).reduce((indices, question, index) => {
    if (question?.teacherExcluded !== true && clean(question?.activityRole).toLowerCase() === wanted) {
      indices.push(index);
    }
    return indices;
  }, []);
}

/**
 * Review progress, in the shape the stage machine expects.
 *
 * TEST READINESS IS PARTICIPATION, NOT A PERFECT SCORE.
 *
 * Ordinary assignment completion is intentionally stricter: every question
 * must reach a terminal state (correct or expired). That is appropriate for a
 * classwork/practice grade, but it is the wrong gate for a Test Cycle Review.
 * A student who answered every Review item and missed one should not be barred
 * from the secure Test merely because the Review was not 100%.
 *
 * There is also no assignment-level Submit button in MathMaster. The natural
 * completion event is therefore the student's first submitted response to the
 * last remaining Review question. They may keep retrying Review questions
 * before starting the Test, but score and correctness never decide whether the
 * Test is unlocked.
 */
function reviewProgress(assignment = {}, tracker = {}) {
  const indices = roleQuestionIndices(assignment, "review");
  const questions = runtimeQuestionsFromAssignment(assignment);
  const progress = assignmentGradeProgress(tracker, indices, questions);
  const threshold = assignment.assessmentPolicy?.review?.minimumMastery;
  if (threshold !== undefined && threshold !== null) {
    let possible = 0;
    let earned = 0;
    indices.forEach((index) => {
      const weight = Number(questions[index]?.questionWeight) > 0 ? Number(questions[index].questionWeight) : 1;
      possible += weight;
      const record = tracker[index];
      // Exact mastery is server-derived from the graded response. A rounded
      // display score cannot substitute for missing exact evidence.
      const credit = Math.max(0, Math.min(100, Number(record?.bestRawPartialCredit) || 0)) / 100;
      earned += weight * credit;
    });
    const mastery = possible > 0 ? earned / possible * 100 : 0;
    const minimumMastery = Number.isFinite(Number(threshold)) ? Math.max(0, Math.min(100, Number(threshold))) : 80;
    const attempted = indices.filter((index) => Number(tracker[index]?.totalAttempts || tracker[index]?.attemptCount || 0) > 0
      || ['correct', 'attempted', 'expired'].includes(tracker[index]?.status)).length;
    return { total: progress.total, attempted, mastery, minimumMastery,
      complete: progress.total > 0 && attempted === progress.total && mastery >= minimumMastery };
  }
  return {
    total: progress.total,
    attempted: progress.attempted,
    complete: progress.total > 0 && progress.attempted === progress.total,
  };
}

module.exports = {
  shared,
  roleQuestionIndices,
  reviewProgress,
  responsesForProfile,
  secureSessionScorePercent,
  weightedSessionScorePercent,
  teacherVisiblePlan,
};
