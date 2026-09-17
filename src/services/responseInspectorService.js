import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase.js';

export const inspectStudentResponse = async (identity) => {
  const result = await httpsCallable(functions, 'inspectStudentResponse')(identity);
  return result.data;
};

export const overrideStudentResponseGrade = async (request) => {
  const result = await httpsCallable(functions, 'overrideStudentResponseGrade')(request);
  return result.data;
};

export const applyAcademicIntegrityGradeOverride = async (request) => {
  const result = await httpsCallable(functions, 'applyAcademicIntegrityGradeOverride')(request);
  return result.data;
};
