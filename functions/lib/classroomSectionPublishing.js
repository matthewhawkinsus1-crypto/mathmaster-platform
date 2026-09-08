"use strict";

const {
  PUBLICATION_SECTION_KEYS,
  publicationDocumentId,
  publicationSectionLabel,
} = require("./publication");
const {
  runtimeIncludedQuestionIndicesForSection,
} = require("./assignmentRuntime");

const PUBLICATION_SECTION_SET = new Set(PUBLICATION_SECTION_KEYS);
const SECTION_GRADING = Object.freeze({
  warmup: Object.freeze({ maxPoints: 5, gradingMode: "engagement" }),
  classwork: Object.freeze({ maxPoints: 100, gradingMode: "accuracy" }),
  practice: Object.freeze({ maxPoints: 100, gradingMode: "accuracyWithRecovery" }),
  dol: Object.freeze({ maxPoints: 100, gradingMode: "accuracy" }),
});

function requestedSectionKeys(requestData = {}) {
  const raw = Array.isArray(requestData?.sectionKeys) && requestData.sectionKeys.length
    ? requestData.sectionKeys
    : requestData?.sectionKey != null
      ? [requestData.sectionKey]
      : ["whole"];

  const result = [];
  for (const value of raw) {
    const sectionKey = String(value ?? "").trim().toLowerCase();
    if (!PUBLICATION_SECTION_SET.has(sectionKey)) {
      throw new TypeError(`Unsupported Classroom section: ${String(value ?? "")}`);
    }
    if (!result.includes(sectionKey)) result.push(sectionKey);
  }
  return result.length ? result : ["whole"];
}

function sectionTitle(baseTitle, sectionKey) {
  const cleanTitle = String(baseTitle || "MathMaster Assignment").trim() || "MathMaster Assignment";
  return sectionKey === "whole"
    ? cleanTitle
    : `${publicationSectionLabel(sectionKey)} — ${cleanTitle}`;
}

function sectionInstructions(baseInstructions, title, sectionKey) {
  const clean = String(baseInstructions || "").trim();
  if (sectionKey === "whole") {
    return clean || `Complete "${title}" in MathMaster.`;
  }
  return `Complete the ${publicationSectionLabel(sectionKey)} in MathMaster.`;
}

function classroomPublicationSpecs({ assignment = {}, requestData = {} } = {}) {
  const keys = requestedSectionKeys(requestData);
  const baseTitle = String(requestData.classroomTitle || assignment.title || "MathMaster Assignment").trim();
  const publishAt = assignment.releaseAt || null;
  const wholePoints = Number(requestData.maxPoints);

  return keys.map((sectionKey) => {
    const questionIndices = runtimeIncludedQuestionIndicesForSection(assignment, sectionKey);
    if (sectionKey !== "whole" && questionIndices.length === 0) {
      throw new TypeError(
        `${publicationSectionLabel(sectionKey)} has no included questions and cannot be published separately.`
      );
    }
    const title = sectionTitle(baseTitle, sectionKey);
    const sectionGrading = SECTION_GRADING[sectionKey] || null;
    return {
      sectionKey,
      sectionLabel: publicationSectionLabel(sectionKey),
      questionIndices,
      title,
      instructions: sectionInstructions(requestData.instructions, title, sectionKey),
      publishAt,
      maxPoints: sectionGrading?.maxPoints
        ?? (Number.isFinite(wholePoints) && wholePoints > 0 ? wholePoints : 100),
      gradingMode: sectionGrading?.gradingMode || "composite",
    };
  });
}

function classroomPublicationTargets({
  assignmentId,
  assignment = {},
  courseIds = [],
  requestData = {},
} = {}) {
  const cleanAssignmentId = String(assignmentId || "").trim();
  if (!cleanAssignmentId) throw new TypeError("assignmentId is required.");

  const specs = classroomPublicationSpecs({ assignment, requestData });
  const cleanCourseIds = [...new Set(
    courseIds.map((value) => String(value).trim()).filter(Boolean)
  )];

  return cleanCourseIds.flatMap((courseId) => specs.map((spec) => ({
    ...spec,
    courseId,
    publicationId: publicationDocumentId(
      cleanAssignmentId,
      courseId,
      spec.sectionKey
    ),
  })));
}

module.exports = {
  SECTION_GRADING,
  requestedSectionKeys,
  sectionTitle,
  sectionInstructions,
  classroomPublicationSpecs,
  classroomPublicationTargets,
};
