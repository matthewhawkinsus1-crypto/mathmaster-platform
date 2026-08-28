import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

const hydrateAssignment = httpsCallable(functions, 'hydrateAssignmentCcmr', {
  timeout: 120000,
});

export async function hydrateAssignmentCcmr(assignment, { ensurePracticeTarget = false } = {}) {
  if (!assignment || typeof assignment !== 'object' || Array.isArray(assignment)) {
    return { assignment, audit: null };
  }
  if (Number(assignment.schemaVersion) !== 5 || !Array.isArray(assignment.sections)) {
    return { assignment, audit: null };
  }

  const response = await hydrateAssignment({ assignment, ensurePracticeTarget: ensurePracticeTarget === true });
  const data = response?.data || {};
  return {
    assignment: data.assignment && typeof data.assignment === 'object' ? data.assignment : assignment,
    audit: data.audit && typeof data.audit === 'object' ? data.audit : null,
  };
}

export default hydrateAssignmentCcmr;
