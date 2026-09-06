const crypto = require("crypto");

const PUBLICATION_SECTION_KEYS = Object.freeze([
  "whole",
  "warmup",
  "classwork",
  "practice",
  "dol",
]);

const PUBLICATION_SECTION_LABELS = Object.freeze({
  whole: "Whole assignment",
  warmup: "Warm-Up",
  classwork: "Classwork",
  practice: "Practice",
  dol: "DOL",
});

function stableDocumentId(prefix, values) {
  const hash = crypto
    .createHash("sha256")
    .update(values.map((value) => String(value ?? "")).join("\u0000"))
    .digest("hex")
    .slice(0, 40);
  return `${prefix}_${hash}`;
}

function normalizePublicationSectionKey(value) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return PUBLICATION_SECTION_KEYS.includes(normalized) ? normalized : "whole";
}

function publicationSectionLabel(value) {
  return PUBLICATION_SECTION_LABELS[normalizePublicationSectionKey(value)];
}

function publicationDocumentId(assignmentId, courseId, sectionKey = "whole") {
  const normalizedSectionKey = normalizePublicationSectionKey(sectionKey);

  // Preserve the original whole-assignment identifier byte-for-byte. Existing
  // publication records and grade sync records already depend on this value.
  if (normalizedSectionKey === "whole") {
    return stableDocumentId("pub", [assignmentId, courseId]);
  }

  return stableDocumentId("pub", [assignmentId, courseId, normalizedSectionKey]);
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
  PUBLICATION_SECTION_KEYS,
  stableDocumentId,
  normalizePublicationSectionKey,
  publicationSectionLabel,
  publicationDocumentId,
  rosterLinkDocumentId,
  gradeSyncDocumentId,
  publicationMarker,
};
