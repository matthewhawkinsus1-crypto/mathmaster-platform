import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

const hydrateAssignment = httpsCallable(functions, 'hydrateAssignmentCcmr', {
  timeout: 120000,
});

/**
 * `includeCandidates` asks for the ranked audited alternatives behind every
 * choice (audit.plan), so Pre-Flight can validate them before anything is
 * created; `excludeDocumentIds` names audited items the teacher set aside.
 */
export async function hydrateAssignmentCcmr(assignment, {
  ensurePracticeTarget = false,
  includeCandidates = false,
  excludeDocumentIds = [],
} = {}) {
  if (!assignment || typeof assignment !== 'object' || Array.isArray(assignment)) {
    return { assignment, audit: null };
  }
  if (Number(assignment.schemaVersion) !== 5 || !Array.isArray(assignment.sections)) {
    return { assignment, audit: null };
  }

  const response = await hydrateAssignment({
    assignment,
    ensurePracticeTarget: ensurePracticeTarget === true,
    ...(includeCandidates === true ? { includeCandidates: true } : {}),
    ...(Array.isArray(excludeDocumentIds) && excludeDocumentIds.length ? { excludeDocumentIds } : {}),
  });
  const data = response?.data || {};
  return {
    assignment: data.assignment && typeof data.assignment === 'object' ? data.assignment : assignment,
    audit: data.audit && typeof data.audit === 'object' ? data.audit : null,
  };
}

export default hydrateAssignmentCcmr;
