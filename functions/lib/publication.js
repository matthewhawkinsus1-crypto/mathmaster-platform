const crypto = require("crypto");

function stableDocumentId(prefix, values) {
  const hash = crypto
    .createHash("sha256")
    .update(values.map((value) => String(value ?? "")).join("\u0000"))
    .digest("hex")
    .slice(0, 40);
  return `${prefix}_${hash}`;
}

function publicationDocumentId(assignmentId, courseId) {
  return stableDocumentId("pub", [assignmentId, courseId]);
}

function rosterLinkDocumentId(courseId, studentId) {
  return stableDocumentId("roster", [courseId, studentId]);
}

function gradeSyncDocumentId(publicationId, studentId) {
  return stableDocumentId("sync", [publicationId, studentId]);
}

function publicationMarker(publicationId) {
  return `[MathMaster publication:${publicationId}]`;
}

module.exports = {
  stableDocumentId,
  publicationDocumentId,
  rosterLinkDocumentId,
  gradeSyncDocumentId,
  publicationMarker,
};
