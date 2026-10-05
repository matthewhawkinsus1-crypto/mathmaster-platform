import { normalizeTestBlueprint } from '../../../functions/shared/testCycleBlueprint.mjs';
import { normalizeTestCyclePolicy } from '../../../functions/shared/testCyclePolicy.mjs';
import { testCycleContractFields } from '../contract/storedAssignmentV5.js';

/*
 * WHAT AN EDIT DOES TO A TEST CYCLE'S CONTRACT.
 *
 * The Review / Edit Setup screen saves an assignment's sections and settings
 * with an ordinary client write. A Test Cycle's contract — its policy, its
 * secure blueprint, its secure reference — is deliberately NOT writable that
 * way (firestore.rules pins it): it decides grades and what the secure Test
 * asks, so it changes only through the server, which checks the teacher of
 * record and refuses changes that would contradict work already done.
 *
 * So an edit has to work out, before saving, which of four things it is:
 *
 *   none     the contract is unchanged (the overwhelmingly common case)
 *   policy   only teacher-editable policy numbers changed — passing score,
 *            retest cap, replacement rule, Review required, corrections
 *            required — which `updateTestCyclePolicy` applies with its locks
 *   attach   the blueprint/reference changed, or the stored assignment never
 *            had a contract (saved by the older build that dropped it) —
 *            `attachTestCycleContract` validates and applies it, and refuses
 *            once secure sessions exist
 *   refuse   the edit would turn a Test Cycle into an ordinary assignment,
 *            which would silently orphan every secure session and record
 *
 * Pure: no Firestore, no React.
 */

export const TEST_CYCLE_CONTRACT_EDIT = Object.freeze({
  NONE: 'none',
  POLICY: 'policy',
  ATTACH: 'attach',
  REFUSE: 'refuse',
});

const stable = (value) => JSON.stringify(value ?? null);

const EDITABLE_POLICY_FIELDS = Object.freeze([
  ['passingScore', (policy) => policy.passingScore],
  ['maxRecordedGrade', (policy) => policy.retest.maxRecordedGrade],
  ['gradeReplacement', (policy) => policy.retest.gradeReplacement],
  ['reviewRequired', (policy) => policy.review.required],
  ['correctionsRequiredForRetest', (policy) => policy.corrections.requiredForRetest],
]);

/** The normalized policy with the teacher-editable numbers taken out. */
const structuralPolicy = (policy) => ({
  ...policy,
  passingScore: null,
  review: { ...policy.review, required: null },
  corrections: { ...policy.corrections, requiredForRetest: null },
  retest: { ...policy.retest, maxRecordedGrade: null, gradeReplacement: null },
});

export const planTestCycleContractEdit = ({ stored = {}, reviewed = {} } = {}) => {
  const before = testCycleContractFields(stored);
  const after = testCycleContractFields(reviewed);
  const beforePolicy = normalizeTestCyclePolicy(before.assessmentPolicy);
  const afterPolicy = normalizeTestCyclePolicy(after.assessmentPolicy);

  if (!beforePolicy && !afterPolicy) return { kind: TEST_CYCLE_CONTRACT_EDIT.NONE };
  if (beforePolicy && !afterPolicy) {
    return {
      kind: TEST_CYCLE_CONTRACT_EDIT.REFUSE,
      message: 'This is a Test Cycle. Saving it without its assessment policy would turn it into an ordinary assignment and strand every secure Test. Duplicate it if you want an ordinary assignment.',
    };
  }
  const contract = {
    assessmentPolicy: after.assessmentPolicy,
    testBlueprint: after.testBlueprint || null,
    secureTestReference: after.secureTestReference || null,
  };
  if (!beforePolicy) return { kind: TEST_CYCLE_CONTRACT_EDIT.ATTACH, contract };

  const blueprintChanged = stable(normalizeTestBlueprint(before.testBlueprint)) !== stable(normalizeTestBlueprint(after.testBlueprint));
  const referenceChanged = stable(before.secureTestReference || null) !== stable(after.secureTestReference || null);
  const structureChanged = stable(structuralPolicy(beforePolicy)) !== stable(structuralPolicy(afterPolicy));
  if (blueprintChanged || referenceChanged || structureChanged) return { kind: TEST_CYCLE_CONTRACT_EDIT.ATTACH, contract };

  const policyChanges = Object.fromEntries(EDITABLE_POLICY_FIELDS
    .filter(([, read]) => stable(read(beforePolicy)) !== stable(read(afterPolicy)))
    .map(([field, read]) => [field, read(afterPolicy)]));
  if (Object.keys(policyChanges).length) return { kind: TEST_CYCLE_CONTRACT_EDIT.POLICY, policyChanges };
  return { kind: TEST_CYCLE_CONTRACT_EDIT.NONE };
};

export default planTestCycleContractEdit;
