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

export const submitSectionRecovery = ({ assignmentId, section, responses }) => run({
  assignmentId,
  section,
  action: 'submit',
  payload: { responses },
});

/** A refusal's code (e.g. "practice-item-repeated"), when the server gave one. */
export const recoveryErrorCode = (error) => String(error?.details?.code || error?.code || '').replace(/^functions\//, '');
