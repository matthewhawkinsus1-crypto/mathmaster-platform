/*
 * THE STUDENT'S LINE TO PRACTICE-BASED RECOVERY.
 *
 * Every change to a Recovery — a graded Practice item, starting, submitting —
 * goes to the `advanceSectionRecovery` callable, which re-reads the
 * authoritative assignment and roster, regenerates each question from its
 * delivery pin and marks the raw response itself. Nothing the browser computes
 * about correctness is sent or trusted.
 */
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase.js';

const callable = () => httpsCallable(functions, 'advanceSectionRecovery');

const run = async ({ assignmentId, section, action, payload = null }) => {
  const response = await callable()({ assignmentId, section, action, ...(payload ? { payload } : {}) });
  return response?.data || null;
};

export const fetchSectionRecoveryStatus = ({ assignmentId, section }) => run({ assignmentId, section, action: 'status' });

export const submitRecoveryPracticeItem = ({ assignmentId, section, pin, practiceIndex, response, supportUsage, solutionViewed = false, attempts = 1, forfeit = false }) => run({
  assignmentId,
  section,
  action: 'practice',
  payload: { pin, practiceIndex, response, supportUsage, solutionViewed, attempts, ...(forfeit ? { forfeit: true } : {}) },
});

export const startSectionRecovery = ({ assignmentId, section }) => run({ assignmentId, section, action: 'start' });

// `unavailableItems`: { [itemId]: { classification } } for each question this
// device could not show. The server re-checks every one; a question it can
// rebuild is held for the teacher, never excused or marked on this claim.
export const submitSectionRecovery = ({ assignmentId, section, responses, unavailableItems = null }) => run({
  assignmentId,
  section,
  action: 'submit',
  payload: {
    responses,
    ...(unavailableItems && Object.keys(unavailableItems).length ? { unavailableItems } : {}),
  },
});

/*
 * THE TEACHER'S LINE: RESOLVE A HELD RECOVERY.
 *
 * `action`: 'finalizeGraded' | 'keepOriginal' | 'issueReplacement'
 * (functions/shared/sectionRecoveryResolution.mjs). The callable checks the
 * caller is this student's teacher of record, builds any replacement question
 * itself, and audits the decision.
 */
export const resolveHeldSectionRecovery = async ({ studentId, assignmentId, section, action, note = '' }) => {
  const response = await httpsCallable(functions, 'resolveHeldSectionRecovery')({ studentId, assignmentId, section, action, note });
  return response?.data || null;
};

/** A refusal's code (e.g. "practice-item-repeated"), when the server gave one. */
export const recoveryErrorCode = (error) => String(error?.details?.code || error?.code || '').replace(/^functions\//, '');
