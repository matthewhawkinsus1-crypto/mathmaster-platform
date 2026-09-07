"use strict";

const {
  PUBLICATION_SECTION_KEYS,
  publicationSectionLabel,
} = require("./publication");
const {
  runtimeIncludedQuestionIndicesForSection,
} = require("./assignmentRuntime");

const PUBLICATION_SECTION_SET = new Set(PUBLICATION_SECTION_KEYS);

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
    : `${cleanTitle} — ${publicationSectionLabel(sectionKey)}`;
}

function sectionInstructions(baseInstructions, title, sectionKey) {
  const clean = String(baseInstructions || "").trim();
  const primary = clean || `Complete "${title}" in MathMaster.`;
  if (sectionKey === "whole") return primary;
  return `${primary}\n\nThis Google Classroom grade represents the ${publicationSectionLabel(sectionKey)} section only.`;
}

function classroomPublicationSpecs({ assignment = {}, requestData = {} } = {}) {
  const keys = requestedSectionKeys(requestData);
  const baseTitle = String(requestData.classroomTitle || assignment.title || "MathMaster Assignment").trim();
  const publishAt = assignment.releaseAt || null;

  return keys.map((sectionKey) => {
    const questionIndices = runtimeIncludedQuestionIndicesForSection(assignment, sectionKey);
    if (sectionKey !== "whole" && questionIndices.length === 0) {
      throw new TypeError(
        `${publicationSectionLabel(sectionKey)} has no included questions and cannot be published separately.`
      );
    }
    const title = sectionTitle(baseTitle, sectionKey);
    return {
      sectionKey,
      sectionLabel: publicationSectionLabel(sectionKey),
      questionIndices,
      title,
      instructions: sectionInstructions(requestData.instructions, title, sectionKey),
      publishAt,
    };
  });
}

module.exports = {
  requestedSectionKeys,
  sectionTitle,
  sectionInstructions,
  classroomPublicationSpecs,
};
