"use strict";

// Platform-level Cloud Functions entry point.
//
// The mature backend remains authoritative and is loaded first. Section-aware
// Google Classroom behavior is additive: explicit whole-assignment publishing
// still runs the existing callable, explicit section requests use the guarded
// section publisher, and Assignment V5 automatic publishing resolves omitted
// section keys from the stored authored sections so review cannot promise four
// posts and silently collapse them into one. Forced reposting remains explicit:
// whole-assignment recovery is untouched while selected sections use their
// independent publication identities and grade destinations.
const base = require("./entry.js");
Object.assign(exports, base);

const { getFirestore } = require("firebase-admin/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { GOOGLE_AND_LINK_SECRETS } = require("./lib/config");
const {
  requestedSectionKeys,
  automaticClassroomSectionKeys,
} = require("./lib/classroomSectionPublishing");
const {
  publishAssignmentSectionsHandler,
  cloudFunctions: classroomSectionFunctions,
} = require("./classroomSectionEntry");
const {
  forceRepublishAssignmentSectionsHandler,
} = require("./classroomSectionForceEntry");

Object.assign(exports, classroomSectionFunctions);

const legacyPublishAssignmentToClassrooms = base.publishAssignmentToClassrooms;
const legacyForceRepublishAssignmentToClassrooms = base.forceRepublishAssignmentToClassrooms;

function requestedSplitSections(request) {
  let sectionKeys;
  try {
    sectionKeys = requestedSectionKeys(request.data || {});
  } catch (error) {
    throw new HttpsError("invalid-argument", String(error?.message || error));
  }

  const splitKeys = sectionKeys.filter((sectionKey) => sectionKey !== "whole");
  if (splitKeys.length && sectionKeys.includes("whole")) {
    throw new HttpsError(
      "invalid-argument",
      "Publish either the whole assignment or one or more individual sections in a single Classroom action, not both."
    );
  }
  return { sectionKeys, splitKeys };
}

function hasExplicitSectionSelection(data = {}) {
  return (
    (Array.isArray(data.sectionKeys) && data.sectionKeys.length > 0)
    || data.sectionKey != null
  );
}

async function withAutomaticV5SectionKeys(request) {
  const data = request.data || {};
  if (hasExplicitSectionSelection(data)) return request;

  const assignmentId = String(data.assignmentId || "").trim();
  if (!assignmentId) return request;

  const assignmentSnapshot = await getFirestore().doc(`assignments/${assignmentId}`).get();
  if (!assignmentSnapshot.exists) return request;

  const sectionKeys = automaticClassroomSectionKeys(assignmentSnapshot.data() || {});
  if (sectionKeys.length === 1 && sectionKeys[0] === "whole") return request;

  return {
    ...request,
    data: {
      ...data,
      sectionKeys,
    },
  };
}

function translateSectionHandlerError(error) {
  if (error instanceof HttpsError) throw error;
  if (error instanceof TypeError) {
    throw new HttpsError("invalid-argument", String(error.message || error));
  }
  throw error;
}

exports.publishAssignmentToClassrooms = onCall(
  { secrets: GOOGLE_AND_LINK_SECRETS },
  async (request) => {
    let routedRequest;
    try {
      routedRequest = await withAutomaticV5SectionKeys(request);
    } catch (error) {
      return translateSectionHandlerError(error);
    }

    const { splitKeys } = requestedSplitSections(routedRequest);
    if (!splitKeys.length) {
      // Explicit whole requests and legacy/non-V5 callers retain the mature
      // whole-assignment publication identity, retries, resources, and grades.
      return legacyPublishAssignmentToClassrooms.run(request);
    }

    try {
      return await publishAssignmentSectionsHandler(routedRequest);
    } catch (error) {
      return translateSectionHandlerError(error);
    }
  }
);

exports.forceRepublishAssignmentToClassrooms = onCall(
  { secrets: GOOGLE_AND_LINK_SECRETS },
  async (request) => {
    const { splitKeys } = requestedSplitSections(request);
    if (!splitKeys.length) {
      // Preserve the mature explicit duplicate-bypass behavior byte-for-byte for
      // the legacy whole-assignment target.
      return legacyForceRepublishAssignmentToClassrooms.run(request);
    }

    try {
      return await forceRepublishAssignmentSectionsHandler(request);
    } catch (error) {
      return translateSectionHandlerError(error);
    }
  }
);
