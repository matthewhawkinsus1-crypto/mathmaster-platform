"use strict";

// Platform-level Cloud Functions entry point.
//
// The mature backend remains authoritative and is loaded first. Section-aware
// Google Classroom behavior is additive: ordinary/legacy whole-assignment
// publishing still runs the exact existing callable, while an explicit section
// request is routed into the new guarded section publisher.
const base = require("./entry.js");
Object.assign(exports, base);

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { GOOGLE_AND_LINK_SECRETS } = require("./lib/config");
const { requestedSectionKeys } = require("./lib/classroomSectionPublishing");
const {
  publishAssignmentSectionsHandler,
  cloudFunctions: classroomSectionFunctions,
} = require("./classroomSectionEntry");

Object.assign(exports, classroomSectionFunctions);

const legacyPublishAssignmentToClassrooms = base.publishAssignmentToClassrooms;

exports.publishAssignmentToClassrooms = onCall(
  { secrets: GOOGLE_AND_LINK_SECRETS },
  async (request) => {
    let sectionKeys;
    try {
      sectionKeys = requestedSectionKeys(request.data || {});
    } catch (error) {
      throw new HttpsError("invalid-argument", String(error?.message || error));
    }

    const splitKeys = sectionKeys.filter((sectionKey) => sectionKey !== "whole");
    if (!splitKeys.length) {
      // No section request means no behavior change at all. This is the mature
      // whole-assignment callable, including its existing publication identity,
      // retry behavior, resource handling, and grade passback contract.
      return legacyPublishAssignmentToClassrooms.run(request);
    }

    if (sectionKeys.includes("whole")) {
      throw new HttpsError(
        "invalid-argument",
        "Publish either the whole assignment or one or more individual sections in a single Classroom action, not both."
      );
    }

    try {
      return await publishAssignmentSectionsHandler(request);
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      if (error instanceof TypeError) {
        throw new HttpsError("invalid-argument", String(error.message || error));
      }
      throw error;
    }
  }
);
