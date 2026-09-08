"use strict";

// Platform-level Cloud Functions entry point.
//
// The mature backend remains authoritative and is loaded first. Section-aware
// Google Classroom behavior is additive: ordinary/legacy whole-assignment
// publishing still runs the exact existing callable, while an explicit section
// request is routed into the guarded section publisher. Forced reposting follows
// the same rule: whole-assignment recovery remains untouched, while selected
// sections use their independent publication identities and grade destinations.
const base = require("./entry.js");
Object.assign(exports, base);

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { GOOGLE_AND_LINK_SECRETS } = require("./lib/config");
const { requestedSectionKeys } = require("./lib/classroomSectionPublishing");
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
    const { splitKeys } = requestedSplitSections(request);
    if (!splitKeys.length) {
      // No section request means no behavior change at all. This is the mature
      // whole-assignment callable, including its existing publication identity,
      // retry behavior, resource handling, and grade passback contract.
      return legacyPublishAssignmentToClassrooms.run(request);
    }

    try {
      return await publishAssignmentSectionsHandler(request);
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
