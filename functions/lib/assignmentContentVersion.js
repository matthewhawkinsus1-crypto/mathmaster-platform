"use strict";

const clone = (value) => JSON.parse(JSON.stringify(value));

function prepareContentRelease({
  sourceAssignment,
  reviewedAssignment,
  familyId,
  nextVersion,
  actorUid,
  auditId = null,
} = {}) {
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

  const release = clone(reviewedAssignment);
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

module.exports = { prepareContentRelease };
