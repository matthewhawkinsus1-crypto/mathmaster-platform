/*
 * THE PLATFORM QUESTION FAMILY LIBRARY.
 *
 * One registry, keyed by id AND version. A question that references a family
 * either pins a version or, if it does not, means version 1 — deliberately NOT
 * "the latest". Shipping linear.twoStepEquation v2 must never change a question
 * that is already in front of a student; an assignment moves to v2 only when
 * its JSON says so.
 *
 * This is a representative library that proves the architecture across the
 * strands the brief names (linear equations, slope, intercepts, systems by two
 * methods, absolute value, vertex, zeros). Adding a family is: write it with
 * defineQuestionFamily, add it to a list below, add it to the property test.
 */

import { LINEAR_FAMILIES } from './questionFamiliesLinear.mjs';
import { SYSTEMS_FAMILIES } from './questionFamiliesSystems.mjs';
import { NONLINEAR_FAMILIES } from './questionFamiliesNonlinear.mjs';

const REGISTERED = Object.freeze([
  ...LINEAR_FAMILIES,
  ...SYSTEMS_FAMILIES,
  ...NONLINEAR_FAMILIES,
]);

const byKey = new Map();
const versionsById = new Map();

REGISTERED.forEach((family) => {
  const key = `${family.id}@${family.version}`;
  if (byKey.has(key)) throw new Error(`Question family ${key} is registered twice.`);
  byKey.set(key, family);
  versionsById.set(family.id, [...(versionsById.get(family.id) || []), family.version].sort((a, b) => a - b));
});

export const PLATFORM_FAMILY_IDS = Object.freeze([...versionsById.keys()].sort());

/** The version an unpinned reference means: the first one ever shipped. */
export const defaultFamilyVersion = (familyId) => (versionsById.get(String(familyId || '').trim()) || [])[0] ?? null;

export const getPlatformQuestionFamily = (familyId, version = null) => {
  const id = String(familyId || '').trim();
  const resolvedVersion = Number.isInteger(Number(version)) && Number(version) >= 1
    ? Number(version)
    : defaultFamilyVersion(id);
  if (resolvedVersion === null) return null;
  return byKey.get(`${id}@${resolvedVersion}`) || null;
};

export const hasPlatformQuestionFamily = (familyId) => versionsById.has(String(familyId || '').trim());

/** The newest version of every family, for authoring guides and Pre-Flight. */
export const listPlatformQuestionFamilies = () => PLATFORM_FAMILY_IDS.map((id) => {
  const versions = versionsById.get(id);
  return byKey.get(`${id}@${versions[versions.length - 1]}`);
});

/** Every registered family version (tests walk all of them). */
export const allRegisteredQuestionFamilies = () => [...REGISTERED];

/**
 * Families a Recovery question may draw on in place of `familyId`: the family
 * itself plus any other family that declares the same equivalence group.
 */
export const recoveryEquivalentFamilies = (familyId, version = null) => {
  const family = getPlatformQuestionFamily(familyId, version);
  if (!family) return [];
  const group = family.recovery.equivalenceGroup;
  return listPlatformQuestionFamilies().filter((candidate) => (
    candidate.recovery.eligible && candidate.recovery.equivalenceGroup === group
  ));
};
