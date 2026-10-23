"use strict";

const crypto = require("crypto");

const clone = (value) => JSON.parse(JSON.stringify(value));

/*
 * A content release is a new, unassigned library document built from the
 * stored one. It must carry the content and none of the source's instance
 * state — students' overrides and every class's DOL/Warm-Up runtime state
 * (functions/shared/assignmentPrivacy.mjs). That module is ESM and shared with
 * the browser, so the caller hands its filter in; a release is refused without
 * it rather than built with students' records in it.
 */
function prepareContentRelease({
  sourceAssignment,
  reviewedAssignment,
  familyId,
  nextVersion,
  actorUid,
  auditId = null,
  stripInstanceState = null,
} = {}) {
  if (typeof stripInstanceState !== "function") {
    throw new Error("A content release needs the instance-state filter (assignmentPrivacy.stripAssignmentInstanceState).");
  }
  if (!sourceAssignment?.id) throw new Error("A stored source assignment is required.");
  if (!reviewedAssignment || Number(reviewedAssignment.schemaVersion) !== 5) {
    throw new Error("A reviewed Assignment V5 is required.");
  }
  const family = String(familyId || "").trim();
  const version = Number(nextVersion);
  if (!family) throw new Error("A content family ID is required.");
  if (!Number.isInteger(version) || version < 2) {
    throw new Error("The successor content version must be at least 2.");
  }

  const release = stripInstanceState({ ...reviewedAssignment });
  delete release.id;
  delete release.archived;
  delete release.createdAt;
  delete release.updatedAt;

  release.schemaVersion = 5;
  release.assignmentRevision = 1;
  release.assignmentKey = null;
  release.assignedClassIds = [];
  release.assignedClassPeriods = [];
  release.dueAt = null;
  release.dueDate = null;
  release.lateDueAt = null;
  release.lateDueDate = null;
  release.releaseAt = null;
  release.feedbackReleased = false;
  release.feedbackReleasedAt = null;
  release.rigorVariant = null;
  release.rigorVariantGroupId = null;
  release.honorsContractVersion = null;
  release.honorsContractScope = null;
  if (release.courseProfile && typeof release.courseProfile === "object") {
    release.courseProfile = { ...release.courseProfile, courseLevel: null };
  }
  release.contentLineage = {
    familyId: family,
    version,
    label: `V${version}`,
    releaseStatus: "current",
    supersedesVersion: version - 1,
    sourceAssignmentId: String(sourceAssignment.id),
    createdFromAuditId: auditId ? String(auditId) : null,
    createdBy: actorUid ? String(actorUid) : null,
  };

  return { release };
}

module.exports = { prepareContentRelease, buildContentUpgradePlan, buildUpgradedAssignment, questionRows, planHashFor };


let upgradePolicyModule = null;
async function upgradePolicy() {
  if (!upgradePolicyModule) {
    upgradePolicyModule = await import("../shared/assignmentContentUpgradePolicy.mjs");
  }
  return upgradePolicyModule;
}

let recoveryContentModule = null;
async function recoveryContent() {
  if (!recoveryContentModule) {
    recoveryContentModule = await import("../shared/recoveryContent.mjs");
  }
  return recoveryContentModule;
}

function questionRows(assignment = {}) {
  const rows = [];
  (Array.isArray(assignment.sections) ? assignment.sections : []).forEach((section, sectionIndex) => {
    (Array.isArray(section?.questions) ? section.questions : []).forEach((question, questionIndex) => {
      rows.push({
        question,
        questionId: String(question?.questionId || "").trim(),
        sectionId: String(section?.id || "").trim() || null,
        sectionRole: String(section?.role || question?.activityRole || "practice").trim() || "practice",
        sectionTitle: String(section?.title || "").trim() || null,
        sectionIndex,
        questionIndex,
        flatIndex: rows.length,
      });
    });
  });
  return rows;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function planHashFor(value) {
  return crypto.createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

async function buildContentUpgradePlan({ liveAssignment, targetAssignment } = {}) {
  if (!liveAssignment?.id || !targetAssignment?.id) {
    throw new Error("Both the live assignment and target content release are required.");
  }
  const liveFamily = String(liveAssignment?.contentLineage?.familyId || "").trim();
  const targetFamily = String(targetAssignment?.contentLineage?.familyId || "").trim();
  if (!liveFamily || liveFamily !== targetFamily) {
    throw new Error("The live assignment and target release are not in the same content family.");
  }
  const fromVersion = Number(liveAssignment?.contentLineage?.version || 1);
  const toVersion = Number(targetAssignment?.contentLineage?.version || 1);
  if (!Number.isInteger(fromVersion) || !Number.isInteger(toVersion) || toVersion <= fromVersion) {
    throw new Error("The target must be a newer content release.");
  }

  const liveRows = questionRows(liveAssignment);
  const targetRows = questionRows(targetAssignment);
  const targetById = new Map(targetRows.map((row) => [row.questionId, row]));
  if (liveRows.some((row) => !row.questionId) || targetRows.some((row) => !row.questionId)) {
    throw new Error("Content upgrades require stable question IDs.");
  }
  if (new Set(liveRows.map((row) => row.questionId)).size !== liveRows.length
    || new Set(targetRows.map((row) => row.questionId)).size !== targetRows.length) {
    throw new Error("Content upgrades refuse duplicate question IDs.");
  }

  const policy = await upgradePolicy();
  const changes = [];
  for (const row of liveRows) {
    const target = targetById.get(row.questionId);
    if (!target) {
      changes.push({
        questionId: row.questionId,
        flatIndex: row.flatIndex,
        sectionRole: row.sectionRole,
        sectionId: row.sectionId,
        classification: "fundamental",
        safe: false,
        reason: "The newer release removed this historical question.",
        beforeQuestion: row.question,
        afterQuestion: null,
      });
      continue;
    }
    // Recovery-capability upgrades are recognized here (and only here): a
    // target that makes a static Warm-Up/DOL question a family slot keeps the
    // live question and adds its Recovery (assignmentContentUpgradePolicy.mjs).
    const result = policy.classifyContentQuestionChange(row.question, target.question, { recoveryCapability: true });
    changes.push({
      questionId: row.questionId,
      flatIndex: row.flatIndex,
      sectionRole: row.sectionRole,
      sectionId: row.sectionId,
      targetSectionRole: target.sectionRole,
      classification: result.classification,
      safe: result.safe,
      reason: result.reason || null,
      affectedFieldIds: result.affectedFieldIds || [],
      gradingKeys: result.gradingKeys || [],
      ...(result.recoveryFamily ? { recoveryFamily: result.recoveryFamily } : {}),
      beforeQuestion: row.question,
      afterQuestion: target.question,
    });
    targetById.delete(row.questionId);
  }

  if (targetById.size) {
    throw new Error(
      "This target release adds question IDs that do not exist in the live assignment. Additions need a separate reviewed delivery change, not an automatic content swap."
    );
  }

  const counts = {
    unchanged: 0,
    safeResponseControl: 0,
    graphViewportRepair: 0,
    systemsWorkspaceUpgrade: 0,
    gradingExpansion: 0,
    clarificationOnly: 0,
    recoveryCapability: 0,
    fundamental: 0,
  };
  changes.forEach((change) => { counts[change.classification] += 1; });

  // The Recovery bindings this upgrade proposes, certified at commit against
  // the questions as the upgrade leaves them (recoveryContentPlan.mjs): each
  // recovery-capability change's family, the target release's own
  // recoveryContent for a question it leaves as it is, and a fresh
  // certification of every live binding whose question the upgrade edits.
  const KEEPS_LIVE_RECOVERY = new Set(["unchanged", "clarificationOnly", "graphViewportRepair", "recoveryCapability"]);
  const targetBindings = targetAssignment?.recoveryContent?.bindings && typeof targetAssignment.recoveryContent.bindings === "object"
    ? targetAssignment.recoveryContent.bindings
    : {};
  const liveBindings = liveAssignment?.recoveryContent?.bindings && typeof liveAssignment.recoveryContent.bindings === "object"
    ? liveAssignment.recoveryContent.bindings
    : {};
  const { recoverySourceSignature } = await recoveryContent();
  const recoveryProposals = {};
  changes.forEach((change) => {
    const live = liveBindings[change.questionId];
    const targetFamily = targetBindings[change.questionId]?.questionFamily;
    if (change.classification === "recoveryCapability" && change.recoveryFamily) {
      recoveryProposals[change.questionId] = { questionFamily: change.recoveryFamily };
    } else if (!live) {
      if (KEEPS_LIVE_RECOVERY.has(change.classification) && targetFamily) {
        recoveryProposals[change.questionId] = { questionFamily: targetFamily };
      }
    } else if (change.classification !== "fundamental" && live.questionFamily) {
      // A binding is for one version of its question (recoveryContent.mjs,
      // sourceSignature). An upgrade that edits a bound question in place
      // would leave it stale, and students without its Recovery with no
      // warning (Codex P1 on #510): certify it again against the question as
      // the upgrade leaves it (buildUpgradedAssignment), in the target
      // release's family when it names one. A retired question needs none.
      const leaves = ["unchanged", "recoveryCapability"].includes(change.classification)
        ? change.beforeQuestion
        : change.afterQuestion || change.beforeQuestion;
      if (recoverySourceSignature(leaves) !== live.sourceSignature) {
        recoveryProposals[change.questionId] = { questionFamily: targetFamily || live.questionFamily };
      }
    }
  });

  const hashInput = {
    liveAssignmentId: liveAssignment.id,
    targetAssignmentId: targetAssignment.id,
    liveAssignmentRevision: Number(liveAssignment.assignmentRevision || 1),
    targetAssignmentRevision: Number(targetAssignment.assignmentRevision || 1),
    fromVersion,
    toVersion,
    assignedClassIds: Array.isArray(liveAssignment.assignedClassIds) ? liveAssignment.assignedClassIds : [],
    assignedClassPeriods: Array.isArray(liveAssignment.assignedClassPeriods) ? liveAssignment.assignedClassPeriods : [],
    changes: changes.map((change) => ({
      questionId: change.questionId,
      flatIndex: change.flatIndex,
      classification: change.classification,
      affectedFieldIds: change.affectedFieldIds,
      gradingKeys: change.gradingKeys,
      beforeQuestion: change.beforeQuestion,
      afterQuestion: change.afterQuestion,
    })),
    // Present only when the upgrade proposes Recovery, so every plan without
    // it hashes exactly as it always did.
    ...(Object.keys(recoveryProposals).length ? { recoveryProposals } : {}),
  };

  return {
    fromVersion,
    toVersion,
    liveAssignmentRevision: Number(liveAssignment.assignmentRevision || 1),
    targetAssignmentRevision: Number(targetAssignment.assignmentRevision || 1),
    changes,
    counts,
    recoveryProposals,
    requiresFundamentalChoice: counts.fundamental > 0,
    planHash: planHashFor(hashInput),
  };
}

function buildUpgradedAssignment({
  liveAssignment,
  targetAssignment,
  plan,
  fundamentalChoices = {},
  replacementId = () => crypto.randomUUID(),
} = {}) {
  if (!liveAssignment || !targetAssignment || !plan) throw new Error("A reviewed content upgrade plan is required.");
  const targetRows = new Map(questionRows(targetAssignment).map((row) => [row.questionId, row]));
  const changeById = new Map(plan.changes.map((change) => [change.questionId, change]));
  const replacementGroups = new Map();
  const replacementQuestionIds = {};

  const sections = (Array.isArray(liveAssignment.sections) ? liveAssignment.sections : []).map((section) => ({
    ...section,
    questions: (Array.isArray(section?.questions) ? section.questions : []).map((question) => {
      const questionId = String(question?.questionId || "").trim();
      const change = changeById.get(questionId);
      const target = targetRows.get(questionId)?.question || null;
      if (!change || change.classification === "unchanged") return question;
      // The live question stays exactly as students saw it; its Recovery is
      // stored beside it (plan.recoveryProposals), never in it.
      if (change.classification === "recoveryCapability") return question;
      if (change.classification !== "fundamental") return target || question;

      const choice = fundamentalChoices[questionId];
      if (!["retire-only", "retire-and-replace"].includes(choice)) {
        throw new Error(`Choose how to handle fundamental correction "${questionId}" before upgrading.`);
      }
      if (choice === "retire-and-replace" && !target) {
        throw new Error(`Question "${questionId}" has no corrected target to append.`);
      }
      if (choice === "retire-and-replace") {
        const role = change.sectionRole || "practice";
        if (!replacementGroups.has(role)) replacementGroups.set(role, []);
        const newQuestionId = String(replacementId(questionId));
        replacementQuestionIds[questionId] = newQuestionId;
        replacementGroups.get(role).push({
          ...target,
          questionId: newQuestionId,
          supersedesQuestionId: questionId,
          introducedInContentVersion: plan.toVersion,
          activityRole: target.activityRole || role,
        });
      }
      return { ...question, teacherExcluded: true };
    }),
  }));

  for (const [role, questions] of replacementGroups) {
    sections.push({
      id: `content-v${plan.toVersion}-corrections-${role}`,
      role,
      title: `${role === "dol" ? "DOL" : role.charAt(0).toUpperCase() + role.slice(1)} Corrections · Content V${plan.toVersion}`,
      questions,
    });
  }

  return {
    replacementQuestionIds,
    recoveryProposals: plan.recoveryProposals || {},
    assignment: {
      ...liveAssignment,
      sections,
      assignmentRevision: Number(liveAssignment.assignmentRevision || 1) + 1,
      contentLineage: {
        ...(liveAssignment.contentLineage || {}),
        familyId: targetAssignment.contentLineage.familyId,
        version: plan.toVersion,
        label: `V${plan.toVersion}`,
        releaseStatus: "current",
        supersedesVersion: plan.fromVersion,
        sourceAssignmentId: targetAssignment.id,
      },
    },
  };
}
