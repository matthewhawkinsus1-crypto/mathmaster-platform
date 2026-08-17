import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

function readableFunctionError(error, functionName) {
  const code = String(error?.code || "").replace("functions/", "");
  const message = String(error?.message || "").replace(/^Firebase:\s*/i, "").trim();
  if (code === "internal" || message.toLowerCase() === "internal") {
    return new Error(
      `${functionName} reached Firebase, but the server failed internally. ` +
      "Inspect the deployed Function log for that action."
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
export const linkClassroomRosterBatch = call("linkClassroomRosterBatch");
export const listClassroomCourseMappings = call("listClassroomCourseMappings");
export const saveClassroomCourseMapping = call("saveClassroomCourseMapping");
export const ensureClassroomTopics = call("ensureClassroomTopics");
export const publishClassroomMaterial = call("publishClassroomMaterial");
export const storeLessonNotesPdf = call("storeLessonNotesPdf");
export const publishAssignmentToClassrooms = call("publishAssignmentToClassrooms");
export const updateAssignmentClassroomPublications = call("updateAssignmentClassroomPublications");
export const publishAssignmentToClassroom = call("publishAssignmentToClassroom");
export const inspectClassroomPublication = call("inspectClassroomPublication");
export const removeAssignmentClassroomPackage = call("removeAssignmentClassroomPackage");
export const listPublishedAssignments = call("listPublishedAssignments");
export const listClassroomGradeSyncs = call("listClassroomGradeSyncs");
export const retryClassroomGradeSync = call("retryClassroomGradeSync");
export const getAssignmentByLaunchId = call("getAssignmentByLaunchId");
