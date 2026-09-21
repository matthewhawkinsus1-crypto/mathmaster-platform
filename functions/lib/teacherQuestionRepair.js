"use strict";

/*
 * AUTHORITATIVE TEACHER QUESTION REPAIR ENGINE.
 *
 * Backs previewTeacherQuestionRepair / commitTeacherQuestionRepair. The
 * teacher-facing flow is "paste/upload repair -> preview -> Apply Corrected
 * Question"; this module is where MathMaster decides HOW that correction can
 * be persisted safely, reusing the same infrastructure the Content V2 live
 * upgrade path already proved out:
 *
 *  - classification reuses assignmentContentUpgradePolicy.classifyContentQuestionChange
 *    (and, through it, the Safe Live Repair analyzer in liveResponseRepairPolicy.mjs).
 *    There is no second, independent change classifier here.
 *  - question rows / plan hashing reuse assignmentContentVersion.questionRows
 *    and .planHashFor.
 *  - grade-tracker migration for a committed repair reuses
 *    assignmentContentTrackerMigration.migrateTrackerForContentUpgrade,
 *    unmodified, by building plan.changes in the exact row shape that
 *    function already expects.
 *  - the "retire the historical question in place, append a corrected
 *    replacement with a fresh questionId and supersedesQuestionId" strategy
 *    mirrors assignmentContentVersion.buildUpgradedAssignment's fundamental
 *    handling (append-only, protected-index-preserving), adapted so it never
 *    touches contentLineage: this is a live question repair, not a Content
 *    Version release advance.
 *
 * The one behavior NOT present in the Content V2 upgrade path: when the
 * assignment has no saved student history at all, every substantive repair
 * (including what would otherwise classify as fundamental) replaces in place
 * under the same questionId, because there is no historical student record to
 * protect.
 */

const crypto = require("crypto");
const assignmentContentVersion = require("./assignmentContentVersion");

const clean = (value) => String(value ?? "").trim();
const clone = (value) => JSON.parse(JSON.stringify(value));

let upgradePolicyModule = null;
async function upgradePolicy() {
  if (!upgradePolicyModule) {
    upgradePolicyModule = await import("../shared/assignmentContentUpgradePolicy.mjs");
  }
  return upgradePolicyModule;
}

let platformOwnedFieldsModule = null;
async function platformOwnedFields() {
  if (!platformOwnedFieldsModule) {
    platformOwnedFieldsModule = await import("../shared/platformOwnedFields.mjs");
  }
  return platformOwnedFieldsModule;
}

// functions/shared/questionTypeCatalog.mjs (+ its analysisRequestCatalog.mjs
// and questionRecipes.mjs dependencies) is a verbatim copy of the SAME
// authoring/Preflight type contract in src/platform/contract/ -- the catalog
// that tells an AI author what a question type needs is the catalog that
// decides whether a submitted repair has it. functions/ deploys as its own
// package and cannot import src/ (see platformOwnedFields.mjs), so this is a
// duplication, not a reference; tests/platform/questionTypeCatalogParity.test.mjs
// fails if the copies ever drift from their src/ originals.
let questionTypeCatalogModule = null;
async function questionTypeCatalog() {
  if (!questionTypeCatalogModule) {
    questionTypeCatalogModule = await import("../shared/questionTypeCatalog.mjs");
  }
  return questionTypeCatalogModule;
}

const hasValue = (value) => value !== undefined && value !== null && value !== "";
const pathValue = (question, path) => path.split(".").reduce((node, key) => (node == null ? undefined : node[key]), question);

// Commit behavior when student history exists: every classification keeps its
// established Content V2 meaning. "fundamental" is always retire + replace
// here -- the teacher already chose "Apply Corrected Question", so there is no
// separate "retire only" choice to collect.
const HISTORY_COMMIT_BEHAVIOR = Object.freeze({
  unchanged: "noMutation",
  safeResponseControl: "safeLiveResponseRepair",
  graphViewportRepair: "presentationOnlyViewportUpdate",
  gradingExpansion: "gradingSupersetExpansion",
  clarificationOnly: "inPlaceClarification",
  fundamental: "retireAndReplace",
});

const REASON_TEXT = Object.freeze({
  unchanged: "The corrected question is identical to what students currently have.",
  safeResponseControl: "This repair converts an existing scored response field to a controlled choice without changing the mathematical task.",
  graphViewportRepair: "This repair changes only the graph viewport bounds (xMin/xMax/yMin/yMax). Nothing scored changes.",
  gradingExpansion: "This repair only widens accepted answers or tolerances; every previously accepted answer is still accepted.",
  clarificationOnly: "This repair changes wording only (prompt or guided notes); the scored meaning is unchanged.",
});

/**
 * Authoritative server-side V5/tool validation. This is deliberately more
 * than an identity check: for a catalogued type it runs the exact
 * required-field and custom `validate()` rules the authoring contract and
 * client Preflight already enforce (functions/shared/questionTypeCatalog.mjs),
 * so a candidate missing e.g. a graphAnalysis functionSpec or a
 * relationshipModel's quantities is rejected here, not only in the browser.
 * The browser Preflight remains the deeper check (rendering-promise auditing,
 * workflow/interaction/grading-contract validation, instructional integrity)
 * for the composed/interactive types this catalog does not cover -- those get
 * a narrower baseline (a prompt/scenario, and well-formed answerFields when
 * present) rather than a second, partial reimplementation of that stack.
 */
async function validateCandidateQuestion(candidate, questionId) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error(`The corrected question for "${questionId}" is not a valid MathMaster question object.`);
  }
  const candidateId = clean(candidate.questionId);
  if (candidateId !== questionId) {
    throw new Error(`The corrected question for "${questionId}" does not carry a matching question ID.`);
  }
  const type = clean(candidate.type);
  if (!type) {
    throw new Error(`The corrected question for "${questionId}" is missing its Assignment V5 question type.`);
  }

  const catalog = await questionTypeCatalog();
  const entry = catalog.getTypeEntry(type);
  const problems = [];

  if (entry) {
    (entry.required || []).forEach((requirement) => {
      if (!hasValue(pathValue(candidate, requirement.path))) problems.push(requirement.message);
    });
    if (!problems.length && typeof entry.validate === "function") {
      try {
        problems.push(...(entry.validate(candidate) || []));
      } catch (error) {
        problems.push(`could not be checked (${error.message})`);
      }
    }
  } else {
    if (!hasValue(candidate.prompt) && !hasValue(candidate.scenario)) {
      problems.push("needs a prompt or scenario");
    }
    if (Array.isArray(candidate.answerFields)) {
      const seenFieldIds = new Set();
      candidate.answerFields.forEach((field, index) => {
        const fieldId = clean(field?.id);
        if (!fieldId) { problems.push(`answerFields[${index}] needs an id`); return; }
        if (seenFieldIds.has(fieldId)) { problems.push(`answerFields[${index}] repeats id "${fieldId}"`); return; }
        seenFieldIds.add(fieldId);
        const hasAnswerValue = hasValue(field.answer) || (Array.isArray(field.acceptedAnswers) && field.acceptedAnswers.length > 0);
        if (!hasAnswerValue) problems.push(`answerFields[${index}] ("${fieldId}") needs an answer or acceptedAnswers`);
      });
    }
  }

  if (problems.length) {
    throw new Error(`The corrected question for "${questionId}" (${type}) failed V5 authoring validation: ${problems.join("; ")}.`);
  }
  return true;
}

/**
 * Validate + classify a teacher-submitted repair packet against the CURRENT
 * server-fetched assignment. Never trusts a client-provided classification,
 * question index, or plan hash: everything here is recomputed from
 * liveAssignment and the raw replacements array.
 */
async function buildTeacherRepairPlan({ liveAssignment, replacements, hasStudentHistory } = {}) {
  if (!liveAssignment?.id) throw new Error("A stored live assignment is required.");
  if (Number(liveAssignment.schemaVersion) !== 5 || !Array.isArray(liveAssignment.sections)) {
    throw new Error("Teacher question repair requires an Assignment V5 with sections.");
  }
  if (!Array.isArray(replacements) || !replacements.length) {
    throw new Error("At least one corrected question is required to build a repair plan.");
  }

  const rows = assignmentContentVersion.questionRows(liveAssignment);
  if (rows.some((row) => !row.questionId)) {
    throw new Error("This assignment has a question with no stable question ID; it cannot be safely repaired.");
  }
  if (new Set(rows.map((row) => row.questionId)).size !== rows.length) {
    throw new Error("This assignment has duplicate question IDs; it cannot be safely repaired.");
  }
  const rowsById = new Map(rows.map((row) => [row.questionId, row]));

  const seenIds = new Set();
  const cleaned = [];
  for (let index = 0; index < replacements.length; index += 1) {
    const entry = replacements[index];
    const questionId = clean(entry?.questionId);
    if (!questionId) throw new Error(`Replacement ${index + 1} is missing a question ID.`);
    if (seenIds.has(questionId)) throw new Error(`Duplicate corrected question for "${questionId}".`);
    seenIds.add(questionId);
    const row = rowsById.get(questionId);
    if (!row) throw new Error(`Question "${questionId}" is not present in this assignment.`);
    // eslint-disable-next-line no-await-in-loop
    await validateCandidateQuestion(entry?.question, questionId);
    cleaned.push({ questionId, question: clone(entry.question), row });
  }

  const policy = await upgradePolicy();
  const changes = cleaned.map(({ questionId, question, row }) => {
    const result = policy.classifyContentQuestionChange(row.question, question);
    const classification = result.classification;
    const commitBehavior = hasStudentHistory
      ? HISTORY_COMMIT_BEHAVIOR[classification]
      : (classification === "unchanged" ? "noMutation" : "directReplaceSameId");
    return {
      questionId,
      flatIndex: row.flatIndex,
      sectionId: row.sectionId,
      sectionRole: row.sectionRole,
      classification,
      safe: result.safe,
      reason: result.reason || REASON_TEXT[classification] || null,
      affectedFieldIds: result.affectedFieldIds || [],
      gradingKeys: result.gradingKeys || [],
      commitBehavior,
      beforeQuestion: row.question,
      afterQuestion: question,
    };
  });

  const counts = {
    unchanged: 0,
    safeResponseControl: 0,
    graphViewportRepair: 0,
    gradingExpansion: 0,
    clarificationOnly: 0,
    fundamental: 0,
  };
  changes.forEach((change) => { counts[change.classification] += 1; });

  const hashInput = {
    assignmentId: liveAssignment.id,
    baseRevision: Number(liveAssignment.assignmentRevision || 1),
    hasStudentHistory: Boolean(hasStudentHistory),
    changes: changes.map((change) => ({
      questionId: change.questionId,
      flatIndex: change.flatIndex,
      classification: change.classification,
      commitBehavior: change.commitBehavior,
      affectedFieldIds: change.affectedFieldIds,
      gradingKeys: change.gradingKeys,
      beforeQuestion: change.beforeQuestion,
      afterQuestion: change.afterQuestion,
    })),
  };

  return {
    assignmentId: liveAssignment.id,
    baseRevision: Number(liveAssignment.assignmentRevision || 1),
    hasStudentHistory: Boolean(hasStudentHistory),
    changes,
    counts,
    canApply: changes.some((change) => change.classification !== "unchanged"),
    planHash: assignmentContentVersion.planHashFor(hashInput),
  };
}

function roleLabel(role) {
  const value = clean(role) || "practice";
  if (value === "dol") return "DOL";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Apply a reviewed plan to liveAssignment. Never inserts a replacement
 * anywhere that would shift a historical tracker index: an in-place repair
 * keeps the same array position, and a fundamental retire+replace only ever
 * APPENDS a new trailing section, exactly like buildUpgradedAssignment's
 * fundamental handling. assignmentRevision is bumped once; contentLineage is
 * left untouched because this is not a Content Version release advance.
 */
async function buildRepairedAssignment({
  liveAssignment,
  plan,
  correctionEventId = crypto.randomUUID(),
  mintQuestionId = () => crypto.randomUUID(),
} = {}) {
  if (!liveAssignment || !plan) throw new Error("A reviewed teacher repair plan is required.");
  const changeById = new Map(plan.changes.map((change) => [change.questionId, change]));
  const replacementQuestionIds = {};
  const appendedByRole = new Map();
  const fields = await platformOwnedFields();

  const sections = (Array.isArray(liveAssignment.sections) ? liveAssignment.sections : []).map((section) => ({
    ...section,
    questions: (Array.isArray(section?.questions) ? section.questions : []).map((question) => {
      const questionId = clean(question?.questionId);
      const change = changeById.get(questionId);
      if (!change || change.classification === "unchanged") return question;

      if (change.commitBehavior !== "retireAndReplace") {
        // In-place repair: same questionId, same index. Covers every safe
        // classification, plus fundamental when there is no student history
        // to protect. questionId is itself platform-owned (never invented by
        // a replacement), so it is restored explicitly after stripping.
        return {
          ...fields.preservePlatformOwnedFields(question, clone(change.afterQuestion)),
          questionId,
        };
      }

      // Fundamental with student history: the historical question stays at
      // its protected index, marked teacherExcluded. The correction is a
      // brand-new question with a fresh id, appended (never inserted) so no
      // historical tracker index shifts.
      const role = change.sectionRole || section.role || question.activityRole || "practice";
      const newQuestionId = String(mintQuestionId(questionId));
      replacementQuestionIds[questionId] = newQuestionId;
      if (!appendedByRole.has(role)) appendedByRole.set(role, []);
      appendedByRole.get(role).push({
        // A brand-new question owns none of the historical question's
        // platform state (fresh attempts, never teacher-excluded).
        ...fields.preservePlatformOwnedFields({}, clone(change.afterQuestion)),
        questionId: newQuestionId,
        supersedesQuestionId: questionId,
        activityRole: change.afterQuestion?.activityRole || role,
      });
      return { ...question, teacherExcluded: true };
    }),
  }));

  for (const [role, questions] of appendedByRole) {
    sections.push({
      id: `teacher-repair-${correctionEventId}-${role}`,
      role,
      title: `${roleLabel(role)} Corrections · Teacher Repair`,
      questions,
    });
  }

  return {
    replacementQuestionIds,
    assignment: {
      ...liveAssignment,
      sections,
      assignmentRevision: Number(liveAssignment.assignmentRevision || 1) + 1,
    },
  };
}

module.exports = {
  HISTORY_COMMIT_BEHAVIOR,
  validateCandidateQuestion,
  buildTeacherRepairPlan,
  buildRepairedAssignment,
};
