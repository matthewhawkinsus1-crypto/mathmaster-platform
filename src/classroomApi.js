import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

function readableFunctionError(error, functionName) {
  const code = String(error?.code || "").replace("functions/", "");
  const message = String(error?.message || "").replace(/^Firebase:\s*/i, "").trim();

  if (code === "internal" || message.toLowerCase() === "internal") {
    return new Error(
      `${functionName} reached Firebase, but the server failed internally. ` +
      "Run Connection Check and inspect the deployed Function log."
    );
  }

  const details = error?.details;
  const stage = details && typeof details === "object" ? details.stage : null;
  return new Error(stage ? `${message} (Stage: ${stage})` : message || `${functionName} failed.`);
}

const call = (name) => {
  const callable = httpsCallable(functions, name);
  return async (data) => {
    try {
      return (await callable(data)).data;
    } catch (error) {
      throw readableFunctionError(error, name);
    }
  };
};

export const getGoogleAuthUrl = call("getGoogleAuthUrl");
export const getGoogleClassroomDiagnostics = call("getGoogleClassroomDiagnostics");
export const getClassroomConnectionStatus = call("getClassroomConnectionStatus");
export const listGoogleCourses = call("listGoogleCourses");
export const listClassroomStudents = call("listClassroomStudents");
export const linkStudentToClassroom = call("linkStudentToClassroom");
export const publishAssignmentToClassrooms = call("publishAssignmentToClassrooms");
// Deliberately a separate callable from publishing. Publishing creates a post;
// this changes the one students are already looking at.
export const updateAssignmentClassroomPublications = call("updateAssignmentClassroomPublications");
export const publishAssignmentToClassroom = call("publishAssignmentToClassroom");
export const listPublishedAssignments = call("listPublishedAssignments");
export const getAssignmentByLaunchId = call("getAssignmentByLaunchId");
