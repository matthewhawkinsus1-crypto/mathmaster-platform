import { normalizeTestBlueprint } from '../assessment/testCycle.js';

/*
 * A TEST CYCLE BLOCKED ONLY BECAUSE ITS FAMILIES WERE NEVER IMPORTED.
 *
 * A Test Cycle arrives as two files: the assignment, and the secure families
 * its blueprint names (they hold the private grading, so they live in the
 * server-only bank, never in the assignment). Importing the first without the
 * second leaves preflight blocked on a family the bank does not hold — the
 * Algebra II Systems Test was stuck exactly there, nine of its ten families
 * registered and Question 8's new one not — and the fix lived on a different
 * screen the error never mentioned.
 *
 * These two functions let the review screen offer that fix in place: which
 * families are unavailable, and which documents of a families file would
 * register them. The server still validates every document before anything is
 * written, and only the root administrator may write; nothing here decides
 * whether a family is good enough.
 */

const clean = (value) => String(value ?? '').trim();

/**
 * Every family the blueprint names that the bank cannot issue, with why.
 *
 * The current server says (`unavailableFamilies`, status 'unregistered' or
 * 'retired'). A server deployed before it said only which families each
 * target could draw on, so the rest are derived from `coverage`, status
 * 'unknown' — the review screen must work against whichever is live.
 */
export const unavailableTestCycleFamilies = ({ preflight = null, blueprint = null } = {}) => {
  if (Array.isArray(preflight?.unavailableFamilies)) return preflight.unavailableFamilies;
  const coverage = new Map((Array.isArray(preflight?.coverage) ? preflight.coverage : []).map((entry) => [entry?.targetId, entry]));
  return normalizeTestBlueprint(blueprint).targets.flatMap((target) => {
    const entry = coverage.get(target.targetId);
    if (!entry) return [];
    const available = new Set((Array.isArray(entry.availableFamilyIds) ? entry.availableFamilyIds : []).map(clean));
    return target.familyIds
      .filter((familyId) => !available.has(familyId))
      .map((familyId) => ({
        familyId,
        targetId: target.targetId,
        alignmentKey: target.alignmentKey || null,
        label: target.label,
        status: 'unknown',
      }));
  });
};

/**
 * The unavailable families an import can fix.
 *
 * A RETIRED family is left out on purpose: someone took it out of service,
 * and re-importing an old file would quietly put it back. Reactivating one is
 * a decision for Administration, not a side effect of reviewing a Test.
 */
export const registrableTestCycleFamilies = (unavailable = []) => {
  const seen = new Set();
  return (Array.isArray(unavailable) ? unavailable : []).filter((row) => {
    if (!row?.familyId || row.status === 'retired' || seen.has(row.familyId)) return false;
    seen.add(row.familyId);
    return true;
  });
};

/**
 * The documents of a families file that register exactly the missing families.
 *
 * Accepts the shapes the Path importer accepts (an array, or `documents`,
 * `items` or `questions`). Only documents whose id is one of `familyIds` are
 * returned: reviewing one Test never rewrites a family some other Test, or a
 * student mid-session, is using.
 */
export const familyDocumentsToRegister = ({ parsed = null, familyIds = [] } = {}) => {
  const documents = Array.isArray(parsed)
    ? parsed
    : (parsed?.documents || parsed?.items || parsed?.questions || []);
  const wanted = new Set((Array.isArray(familyIds) ? familyIds : []).map(clean).filter(Boolean));
  const chosen = [];
  const found = new Set();
  (Array.isArray(documents) ? documents : []).forEach((document) => {
    const id = clean(document?.id);
    if (!wanted.has(id) || found.has(id)) return;
    found.add(id);
    chosen.push(document);
  });
  return {
    documents: chosen,
    missingFromFile: [...wanted].filter((id) => !found.has(id)),
    otherDocuments: (Array.isArray(documents) ? documents.length : 0) - chosen.length,
  };
};
