import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

const call = (name) => {
  const callable = httpsCallable(functions, name);
  return async (data) => (await callable(data)).data;
};

export const getGoogleAuthUrl = call("getGoogleAuthUrl");
export const getClassroomConnectionStatus = call("getClassroomConnectionStatus");
export const listGoogleCourses = call("listGoogleCourses");
export const listClassroomStudents = call("listClassroomStudents");
export const linkStudentToClassroom = call("linkStudentToClassroom");
export const publishAssignmentToClassrooms = call("publishAssignmentToClassrooms");
export const publishAssignmentToClassroom = call("publishAssignmentToClassroom");
export const listPublishedAssignments = call("listPublishedAssignments");
export const getAssignmentByLaunchId = call("getAssignmentByLaunchId");
