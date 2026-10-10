import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase.js';

/*
 * Review My Work: the signed-in student's OWN answers, outcomes and worked
 * solutions for one closed assignment (functions/lib/reviewMyWork.js). The
 * server reads the student from the sign-in token and decides whether the
 * assignment is closed and released; nothing sent here can widen that.
 */
export const loadMyReviewWork = async (assignmentId) => {
  const result = await httpsCallable(functions, 'loadMyReviewWork')({ assignmentId });
  return result.data;
};
