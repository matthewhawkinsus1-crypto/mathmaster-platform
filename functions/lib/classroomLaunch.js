"use strict";

const {
  publicationSectionKey,
} = require("./publication");

function launchPayloadForPublication({
  assignmentId,
  courseId = null,
  publicationId = null,
  sectionKey = "whole",
} = {}) {
  const cleanAssignmentId = String(assignmentId || "").trim();
  if (!cleanAssignmentId) throw new TypeError("assignmentId is required.");

  const normalizedSectionKey = publicationSectionKey(sectionKey);
  return {
    assignmentId: cleanAssignmentId,
    ...(courseId ? { courseId: String(courseId) } : {}),
    ...(publicationId ? { publicationId: String(publicationId) } : {}),
    ...(normalizedSectionKey !== "whole" ? { sectionKey: normalizedSectionKey } : {}),
  };
}

function launchRedirectParams(payload = {}) {
  const cleanAssignmentId = String(payload.assignmentId || "").trim();
  if (!cleanAssignmentId) throw new TypeError("assignmentId is required.");

  const normalizedSectionKey = publicationSectionKey(payload.sectionKey);
  const params = new URLSearchParams({ launch: cleanAssignmentId });
  if (payload.courseId) params.set("classroomCourse", String(payload.courseId));
  if (payload.publicationId) params.set("classroomPublication", String(payload.publicationId));
  if (normalizedSectionKey !== "whole") params.set("classroomSection", normalizedSectionKey);
  return params;
}

module.exports = {
  launchPayloadForPublication,
  launchRedirectParams,
};
