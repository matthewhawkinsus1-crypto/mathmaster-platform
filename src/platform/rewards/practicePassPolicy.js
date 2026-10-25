/*
 * "ALLOW PRACTICE PASSES" ON ONE ASSIGNMENT: THE TEACHER'S CHOICE (LC23).
 *
 * A student may use a Practice Pass on an assignment unless its teacher said
 * no, which is stored as `assignment.rewardPolicy.practicePassEligible: false`.
 * The server refuses a use on such an assignment and the wallet does not offer
 * it (functions/shared/classPointRewards.mjs, practicePassClientEligibility.js).
 * This is the authoring side of that same field: what the Assignment Review's
 * switch reads, and what a save writes.
 *
 * ONLY THE "NO" IS EVER WRITTEN. "Allowed" is the default, so a new assignment
 * carries no policy at all unless the teacher turned passes off, and turning
 * them back on removes the "no" rather than writing a "yes" (a stored `true`
 * decides nothing the default does not: assessment boundaries are absolute, and
 * a pass is still refused on a quiz, a test, a Test Cycle or once Practice is
 * started, whatever this says).
 *
 * A pass the student has ALREADY USED is not undone by turning the switch off:
 * the rule is read when a pass is used. Undoing a use is the teacher's action
 * on that student's rewards.
 *
 * Pure: no React, no Firebase. The field has three readers, each with its own
 * one-line reading: the server's practicePassPolicyOverride (classPointRewards.mjs,
 * server only because it carries node:crypto), the wallet's filter
 * (practicePassClientEligibility.js, which reads it inline so that this teacher
 * module stays off the student's first load), and practicePassesAllowed here.
 * A test holds all three to the same answers.
 */

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** Whether the teacher's choice lets students use a Practice Pass here: everything except an explicit `false`. */
export const practicePassesAllowed = (assignment = null) => assignment?.rewardPolicy?.practicePassEligible !== false;

/** The `rewardPolicy` a NEW assignment carries: the explicit "no" only, never a default written out. */
export const rewardPolicyForNewAssignment = (allow) => (allow === false ? { practicePassEligible: false } : undefined);

/**
 * The `rewardPolicy` a SAVED edit should carry, or `undefined` for "leave what
 * is stored as it is". Only a change is written: turning passes off writes the
 * explicit "no" beside anything else the policy holds, turning them back on
 * removes it, and saying what is already stored (or nothing) writes nothing.
 */
export const rewardPolicyAfterEdit = (stored, allow) => {
  if (typeof allow !== 'boolean') return undefined;
  const current = isObject(stored) ? stored : {};
  if ((current.practicePassEligible !== false) === allow) return undefined;
  if (!allow) return { ...current, practicePassEligible: false };
  const { practicePassEligible: _no, ...rest } = current;
  return rest;
};

/**
 * Whether the switch is worth showing for an assignment: it has a Practice
 * section, and it is not an assessment (a quiz, a test or a Test Cycle can
 * never take a pass, whatever is set, so a switch there would promise a choice
 * that does nothing).
 */
export const practicePassSwitchApplies = (roles = [], { testCycle = false } = {}) => {
  const list = (Array.isArray(roles) ? roles : []).map((role) => String(role ?? '').trim().toLowerCase());
  return list.includes('practice') && !list.includes('quiz') && !list.includes('test') && testCycle !== true;
};
