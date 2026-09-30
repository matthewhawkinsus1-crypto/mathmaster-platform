// THE VERSIONED STUDENT SUPPORT PROFILE.
//
// Two stored forms, one model:
//
//   REVISIONS  grades/{sid}/supportProfileRevisions/{id} — privileged and
//              immutable. Source label, note, service expectations, author and
//              server time. A change is a NEW revision; nothing is edited, so
//              the instructional condition of past work cannot be rewritten.
//
//   PROJECTION grades/{sid}.profile — what the student's own runtime (and the
//              Cloud Functions that already read this field) need: the legacy
//              flat keys, unchanged in meaning, plus `supportPlan.windows`, the
//              current and any future-dated revisions WITHOUT the privileged
//              fields. Rules pin it against student writes.
//
// EFFECTIVE DATING. A revision starts on `effectiveStart`; the revision in
// effect on a school date is the one with the latest start on or before it
// (re-entering a revision for the same start replaces it — higher revision
// number wins). `effectiveEnd` never switches a student's supports off by
// itself: an expired profile keeps applying and is flagged to the teacher,
// because silently removing a student's supports is the worse failure. A
// teacher ends supports explicitly with an `inactive` revision.
//
// TWO QUESTIONS ABOUT ANY PAST MOMENT, kept apart on purpose:
//   documented — which revision the paperwork says was in effect that day
//                (any revision, including one entered later and backdated);
//   in platform — which revision MathMaster actually had recorded at that
//                instant, i.e. what it could have applied.
// A backdated revision makes them differ, and a report must say so rather than
// claim the platform applied supports it did not yet know about.
import {
  SUPPORT_ACTIVITY_ROLES,
  SUPPORT_CLASSIFICATION,
  INCLUSION_IMPLIED_SUPPORT_IDS,
  supportById,
} from './supportCatalog.mjs';
import { DEADLINE_SUPPORT_IDS, normalizeDueDateExtension } from './supportDeadline.mjs';
import { zonedDateKey } from './instructionalCalendar.mjs';

export const SUPPORT_PROFILE_SCHEMA_VERSION = 1;
export const SUPPORT_PLAN_SCHEMA_VERSION = 1;
export const SUPPORT_REVISIONS_SUBCOLLECTION = 'supportProfileRevisions';
export const LEGACY_REVISION_ID = 'legacy-unversioned';
export const PROFILE_TIME_ZONE = 'America/Chicago';

export const REVISION_STATUS = Object.freeze({ ACTIVE: 'active', INACTIVE: 'inactive' });

export const PROFILE_LIMITS = Object.freeze({
  sourceLabel: 120,
  sourceNote: 600,
  serviceNote: 200,
  resourceLabel: 80,
  resourceUrl: 500,
  resources: 5,
  supportsPerGroup: 40,
  serviceExpectations: 6,
  maxMinutesPerWeek: 3000,
  futureWindows: 3,
  teksCode: 24,
});

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);
const isDateKey = (value) => DATE_KEY.test(clean(value));

// --- Parameters ----------------------------------------------------------------

const normalizeResources = (raw, errors, supportId) => list(raw)
  .slice(0, PROFILE_LIMITS.resources)
  .map((resource) => {
    const label = clean(resource?.label).slice(0, PROFILE_LIMITS.resourceLabel);
    const url = clean(resource?.url).slice(0, PROFILE_LIMITS.resourceUrl);
    if (!label && !url) return null;
    let safe = false;
    try {
      // Only https links reach a student's screen: no javascript:, data: or
      // plain-http targets from a teacher-typed field.
      safe = new URL(url).protocol === 'https:';
    } catch {
      safe = false;
    }
    if (!safe) {
      errors.push(`${supportId}: "${label || url}" needs a full https:// link.`);
      return null;
    }
    return { label: label || 'Resource', url };
  })
  .filter(Boolean);

const normalizeParams = (entry, rawParams, errors) => {
  const params = {};
  const raw = rawParams && typeof rawParams === 'object' && !Array.isArray(rawParams) ? rawParams : {};
  entry.params.forEach((name) => {
    if (name === 'dueDateExtension') params.dueDateExtension = normalizeDueDateExtension(raw.dueDateExtension);
    if (name === 'resources') params.resources = normalizeResources(raw.resources, errors, entry.id);
    if (name === 'teksCode') params.teksCode = clean(raw.teksCode).slice(0, PROFILE_LIMITS.teksCode) || null;
    if (name === 'maxDok') {
      const dok = Math.trunc(Number(raw.maxDok));
      params.maxDok = Number.isFinite(dok) && dok >= 1 && dok <= 3 ? dok : null;
    }
  });
  return params;
};

const normalizeAppliesTo = (raw) => [...new Set(list(raw).map((role) => clean(role).toLowerCase()))]
  .filter((role) => SUPPORT_ACTIVITY_ROLES.includes(role));

/**
 * Normalize one group of supports. An id filed under the wrong group is an
 * ERROR, never silently moved: accommodation and modification are not
 * interchangeable, and the teacher must see the conflict.
 */
const normalizeSupportGroup = (raw, classification, errors) => {
  const seen = new Set();
  const result = [];
  list(raw).slice(0, PROFILE_LIMITS.supportsPerGroup).forEach((item) => {
    const rawId = typeof item === 'string' ? item : item?.id;
    const entry = supportById(rawId);
    if (!entry) {
      if (clean(rawId)) errors.push(`Unknown support "${clean(rawId)}".`);
      return;
    }
    const allowed = classification === SUPPORT_CLASSIFICATION.ACCOMMODATION
      ? [SUPPORT_CLASSIFICATION.ACCOMMODATION, SUPPORT_CLASSIFICATION.SERVICE]
      : [SUPPORT_CLASSIFICATION.MODIFICATION];
    if (!allowed.includes(entry.classification)) {
      errors.push(`"${entry.label}" is ${entry.classification === SUPPORT_CLASSIFICATION.MODIFICATION ? 'a modification' : 'an accommodation'}, not ${classification === SUPPORT_CLASSIFICATION.MODIFICATION ? 'a modification' : 'an accommodation'}.`);
      return;
    }
    if (seen.has(entry.id)) return;
    seen.add(entry.id);
    result.push({
      id: entry.id,
      params: normalizeParams(entry, typeof item === 'object' ? item?.params : null, errors),
      appliesTo: normalizeAppliesTo(typeof item === 'object' ? item?.appliesTo : null),
    });
  });
  return result;
};

const normalizeServiceExpectations = (raw, errors) => list(raw)
  .slice(0, PROFILE_LIMITS.serviceExpectations)
  .map((item) => {
    const entry = supportById(item?.serviceType);
    if (!entry || !entry.serviceLoggable) {
      if (clean(item?.serviceType)) errors.push(`Unknown service type "${clean(item?.serviceType)}".`);
      return null;
    }
    const minutes = Math.trunc(Number(item?.minutesPerWeek));
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > PROFILE_LIMITS.maxMinutesPerWeek) {
      errors.push(`${entry.label}: minutes per week must be between 1 and ${PROFILE_LIMITS.maxMinutesPerWeek}.`);
      return null;
    }
    return { serviceType: entry.id, minutesPerWeek: minutes, note: clean(item?.note).slice(0, PROFILE_LIMITS.serviceNote) };
  })
  .filter(Boolean);

/**
 * Validate what a teacher entered for a new revision. Returns the normalized
 * revision body (no ids, author or time — the store adds those) and every
 * problem found. A revision with errors must not be saved.
 */
export const normalizeSupportRevisionInput = (raw = {}) => {
  const errors = [];
  const status = clean(raw.status).toLowerCase() === REVISION_STATUS.INACTIVE ? REVISION_STATUS.INACTIVE : REVISION_STATUS.ACTIVE;
  const effectiveStart = clean(raw.effectiveStart);
  const effectiveEnd = clean(raw.effectiveEnd) || null;
  if (!isDateKey(effectiveStart)) errors.push('Choose the date this profile takes effect.');
  if (effectiveEnd && !isDateKey(effectiveEnd)) errors.push('The end date is not a valid date.');
  if (isDateKey(effectiveStart) && effectiveEnd && isDateKey(effectiveEnd) && effectiveEnd < effectiveStart) {
    errors.push('The end date is before the start date.');
  }
  const sourceLabel = clean(raw.sourceLabel).slice(0, PROFILE_LIMITS.sourceLabel);
  if (!sourceLabel) errors.push('Name the source document (for example "IEP — annual review").');
  const translationLanguage = clean(raw.translationLanguage).toLowerCase();

  const revision = {
    status,
    effectiveStart,
    effectiveEnd,
    sourceLabel,
    sourceNote: clean(raw.sourceNote).slice(0, PROFILE_LIMITS.sourceNote),
    inclusionStatus: raw.inclusionStatus === true,
    accommodations: normalizeSupportGroup(raw.accommodations, SUPPORT_CLASSIFICATION.ACCOMMODATION, errors),
    modifications: normalizeSupportGroup(raw.modifications, SUPPORT_CLASSIFICATION.MODIFICATION, errors),
    serviceExpectations: normalizeServiceExpectations(raw.serviceExpectations, errors),
    translationLanguage: /^[a-z]{2,3}(-[a-z]{2,4})?$/.test(translationLanguage) && translationLanguage !== 'en'
      ? translationLanguage
      : null,
  };
  return { revision, errors };
};

/**
 * The Firestore body for a new revision. `createdAt` is added by the store as
 * serverTimestamp() and the rules require it to equal request.time.
 */
export const buildRevisionDocument = ({
  revision,
  studentId,
  classId = null,
  revisionNumber,
  supersedesRevisionId = null,
  createdByEmail,
  legacySnapshot = false,
} = {}) => ({
  schemaVersion: SUPPORT_PROFILE_SCHEMA_VERSION,
  studentId: clean(studentId),
  classId: clean(classId) || null,
  revision: Math.max(0, Math.trunc(Number(revisionNumber) || 0)),
  supersedesRevisionId: clean(supersedesRevisionId) || null,
  legacySnapshot: legacySnapshot === true,
  status: revision.status,
  effectiveStart: revision.effectiveStart || null,
  effectiveEnd: revision.effectiveEnd || null,
  sourceLabel: revision.sourceLabel,
  sourceNote: revision.sourceNote || '',
  inclusionStatus: revision.inclusionStatus === true,
  accommodations: revision.accommodations,
  modifications: revision.modifications,
  serviceExpectations: revision.serviceExpectations,
  translationLanguage: revision.translationLanguage || null,
  createdByEmail: clean(createdByEmail).toLowerCase(),
  authorizedTeacherEmails: [clean(createdByEmail).toLowerCase()],
});

// --- Legacy (pre-versioning) profiles ----------------------------------------------

const hasLegacyContent = (profile) => Boolean(
  profile?.inclusionStatus === true
  || list(profile?.accommodations).length
  || list(profile?.modifications).length
  || clean(profile?.translationLanguage),
);

/**
 * A pre-versioning flat profile as a synthetic revision, so every reader deals
 * with one shape. Its dates and author are unknown and stay null — the report
 * says "recorded before versioning" rather than inventing a history.
 */
export const legacyProfileToRevision = (profile = {}) => {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return null;
  // A structured (SIS-shaped) accommodations object is not the flat shape.
  const accommodationIds = Array.isArray(profile.accommodations) ? profile.accommodations : [];
  const modificationIds = Array.isArray(profile.modifications) ? profile.modifications : [];
  if (!hasLegacyContent({ ...profile, accommodations: accommodationIds, modifications: modificationIds })) return null;
  const toEntries = (ids) => [...new Set(ids.map((id) => clean(id)).filter(Boolean))]
    .map((id) => ({ id: supportById(id)?.id || id, params: {}, appliesTo: [] }));
  return {
    id: LEGACY_REVISION_ID,
    revisionId: LEGACY_REVISION_ID,
    legacy: true,
    revision: 0,
    status: REVISION_STATUS.ACTIVE,
    effectiveStart: null,
    effectiveEnd: null,
    sourceLabel: 'Recorded before versioning',
    sourceNote: '',
    inclusionStatus: profile.inclusionStatus === true,
    accommodations: toEntries(accommodationIds),
    modifications: toEntries(modificationIds),
    serviceExpectations: [],
    translationLanguage: clean(profile.translationLanguage).toLowerCase() || null,
    createdByEmail: null,
    createdAtMs: null,
  };
};

// --- Timeline ----------------------------------------------------------------------

const revisionIdOf = (revision) => clean(revision?.revisionId || revision?.id) || null;

/** Milliseconds from a Firestore Timestamp, Date, ISO string or number. */
export const toMillis = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value?.seconds === 'number') return value.seconds * 1000 + Math.round((value.nanoseconds || 0) / 1e6);
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? null : parsed;
};

const recordedAtOf = (revision) => {
  if (Number.isFinite(revision?.createdAtMs)) return revision.createdAtMs;
  return toMillis(revision?.createdAt);
};

const compareForTimeline = (a, b) => {
  const startA = isDateKey(a?.effectiveStart) ? a.effectiveStart : '';
  const startB = isDateKey(b?.effectiveStart) ? b.effectiveStart : '';
  if (startA !== startB) return startA < startB ? -1 : 1;
  return (Number(a?.revision) || 0) - (Number(b?.revision) || 0);
};

/** Revisions oldest-effective first (legacy/undated first). */
export const sortRevisionTimeline = (revisions = []) => [...list(revisions)].filter(Boolean).sort(compareForTimeline);

/**
 * The revision in effect on `dateKey`: latest start on or before it; a null
 * start (legacy / legacy snapshot) counts as "before any dated revision".
 * `recordedBy` (ms) restricts the choice to revisions MathMaster already had.
 */
export const revisionEffectiveOn = (revisions = [], dateKey, { recordedBy = null } = {}) => {
  const day = clean(dateKey);
  let best = null;
  list(revisions).forEach((revision) => {
    if (!revision) return;
    const start = isDateKey(revision.effectiveStart) ? revision.effectiveStart : '';
    if (start && day && start > day) return;
    if (recordedBy !== null) {
      const recorded = recordedAtOf(revision);
      // A legacy revision with no timestamp was what the platform held before
      // any versioned save, so it is "already recorded" for any moment.
      if (recorded !== null && recorded > recordedBy) return;
    }
    if (!best || compareForTimeline(revision, best) > 0) best = revision;
  });
  return best;
};

/**
 * Both answers for one moment. `backdated` is true when the paperwork says a
 * different revision governed than the one MathMaster had at that instant.
 */
export const governingRevisionsAt = (revisions = [], atMs, { timeZone = PROFILE_TIME_ZONE } = {}) => {
  const at = Number(atMs);
  if (!Number.isFinite(at)) return { documented: null, inPlatform: null, backdated: false };
  const dateKey = zonedDateKey(at, timeZone);
  const documented = revisionEffectiveOn(revisions, dateKey);
  const inPlatform = revisionEffectiveOn(revisions, dateKey, { recordedBy: at });
  return {
    documented,
    inPlatform,
    backdated: revisionIdOf(documented) !== revisionIdOf(inPlatform),
  };
};

// --- Projection (what grades/{sid}.profile holds) ----------------------------------------

const windowOf = (revision) => ({
  revisionId: revisionIdOf(revision),
  revision: Number(revision?.revision) || 0,
  status: revision?.status === REVISION_STATUS.INACTIVE ? REVISION_STATUS.INACTIVE : REVISION_STATUS.ACTIVE,
  effectiveStart: isDateKey(revision?.effectiveStart) ? revision.effectiveStart : null,
  effectiveEnd: isDateKey(revision?.effectiveEnd) ? revision.effectiveEnd : null,
  inclusionStatus: revision?.inclusionStatus === true,
  accommodations: list(revision?.accommodations).map((entry) => ({
    id: entry.id, params: entry.params || {}, appliesTo: list(entry.appliesTo),
  })),
  modifications: list(revision?.modifications).map((entry) => ({
    id: entry.id, params: entry.params || {}, appliesTo: list(entry.appliesTo),
  })),
  translationLanguage: revision?.translationLanguage || null,
});

const idsOf = (entries) => list(entries).map((entry) => entry?.id).filter(Boolean);

/**
 * The `profile` field to write alongside a new revision (one batch).
 *
 * Legacy flat keys = the revision in effect TODAY, exactly as the old
 * checkboxes wrote them, so every reader that predates this build keeps its
 * meaning. `supportPlan.windows` = today's revision plus up to three
 * future-dated ones, so a future revision switches on by itself.
 * `entitledIds` = every support id in any window: the rules use it to decide
 * which supports a student may record using.
 */
export const buildSupportProjection = ({ revisions = [], todayKey, updatedAt = null } = {}) => {
  const current = revisionEffectiveOn(revisions, todayKey);
  const future = sortRevisionTimeline(list(revisions).filter((revision) => (
    isDateKey(revision?.effectiveStart) && revision.effectiveStart > clean(todayKey)
  )));
  // One window per start date (a re-entry for the same start replaces it).
  const futureByStart = new Map();
  future.forEach((revision) => futureByStart.set(revision.effectiveStart, revision));
  const futureWindows = [...futureByStart.values()].slice(-PROFILE_LIMITS.futureWindows);
  const windows = [current, ...futureWindows].filter(Boolean).map(windowOf);
  const active = current && current.status !== REVISION_STATUS.INACTIVE ? current : null;
  const entitled = new Set();
  windows.forEach((window) => {
    if (window.status === REVISION_STATUS.INACTIVE) return;
    [...idsOf(window.accommodations), ...idsOf(window.modifications)].forEach((id) => entitled.add(id));
    if (window.inclusionStatus) INCLUSION_IMPLIED_SUPPORT_IDS.forEach((id) => entitled.add(id));
  });
  return {
    inclusionStatus: active?.inclusionStatus === true,
    accommodations: idsOf(active?.accommodations),
    modifications: idsOf(active?.modifications),
    translationLanguage: active?.translationLanguage || null,
    supportPlan: {
      schemaVersion: SUPPORT_PLAN_SCHEMA_VERSION,
      windows,
      entitledIds: [...entitled].sort(),
      updatedAt: updatedAt || new Date().toISOString(),
    },
  };
};

// --- Runtime resolution (student client, Cloud Functions, teacher views) --------------------

const planWindows = (profile) => list(profile?.supportPlan?.windows).filter((window) => window && typeof window === 'object');

/**
 * What applies right now (or on `dateKey`) from a stored `profile`.
 *
 *   source 'plan'   — a versioned projection;
 *   source 'legacy' — only the pre-versioning flat keys;
 *   source 'none'   — no profile.
 * `expired` means the governing revision's end date has passed; supports keep
 * applying (see header) and the teacher is warned.
 */
export const resolveEffectiveSupportPlan = (profile, {
  nowValue = Date.now(),
  dateKey = null,
  timeZone = PROFILE_TIME_ZONE,
} = {}) => {
  const day = clean(dateKey) || zonedDateKey(nowValue, timeZone);
  const windows = planWindows(profile);
  if (windows.length) {
    const window = revisionEffectiveOn(windows, day);
    const nextWindow = sortRevisionTimeline(windows.filter((entry) => isDateKey(entry.effectiveStart) && entry.effectiveStart > day))[0] || null;
    if (!window) {
      return {
        source: 'plan', revisionId: null, revision: null, status: 'none', active: false, expired: false,
        inclusionStatus: false, accommodations: [], modifications: [], translationLanguage: null,
        effectiveStart: null, effectiveEnd: null, nextWindow,
      };
    }
    const active = window.status !== REVISION_STATUS.INACTIVE;
    return {
      source: 'plan',
      revisionId: window.revisionId || null,
      revision: Number(window.revision) || 0,
      status: window.status || REVISION_STATUS.ACTIVE,
      active,
      expired: Boolean(active && isDateKey(window.effectiveEnd) && window.effectiveEnd < day),
      inclusionStatus: active && window.inclusionStatus === true,
      accommodations: active ? list(window.accommodations) : [],
      modifications: active ? list(window.modifications) : [],
      translationLanguage: active ? window.translationLanguage || null : null,
      effectiveStart: window.effectiveStart || null,
      effectiveEnd: window.effectiveEnd || null,
      nextWindow,
    };
  }
  const legacy = legacyProfileToRevision(profile);
  if (!legacy) {
    return {
      source: 'none', revisionId: null, revision: null, status: 'none', active: false, expired: false,
      inclusionStatus: false, accommodations: [], modifications: [], translationLanguage: null,
      effectiveStart: null, effectiveEnd: null, nextWindow: null,
    };
  }
  return {
    source: 'legacy',
    revisionId: LEGACY_REVISION_ID,
    revision: 0,
    status: REVISION_STATUS.ACTIVE,
    active: true,
    expired: false,
    inclusionStatus: legacy.inclusionStatus,
    accommodations: legacy.accommodations,
    modifications: legacy.modifications,
    translationLanguage: legacy.translationLanguage,
    effectiveStart: null,
    effectiveEnd: null,
    nextWindow: null,
  };
};

/** Flat ids for the legacy readers (presentation, question support, entitlements). */
export const flatSupportIds = (plan) => ({
  accommodations: idsOf(plan?.accommodations),
  modifications: idsOf(plan?.modifications),
});

export const planHasSupport = (plan, supportId) => (
  [...idsOf(plan?.accommodations), ...idsOf(plan?.modifications)].includes(clean(supportId))
  || (plan?.inclusionStatus === true && INCLUSION_IMPLIED_SUPPORT_IDS.includes(clean(supportId)))
);

export const planSupportEntry = (plan, supportId) => (
  [...list(plan?.accommodations), ...list(plan?.modifications)].find((entry) => entry?.id === clean(supportId)) || null
);

/** Does a support apply to an activity role under this plan? */
export const supportAppliesToRole = (plan, supportId, activityRole) => {
  const entry = planSupportEntry(plan, supportId);
  if (!entry) return plan?.inclusionStatus === true && INCLUSION_IMPLIED_SUPPORT_IDS.includes(clean(supportId));
  const roles = list(entry.appliesTo);
  return !roles.length || !activityRole || roles.includes(clean(activityRole).toLowerCase());
};

/** Teacher-facing warnings about the profile itself (not about any student's work). */
export const supportProfileWarnings = (profile, { nowValue = Date.now(), timeZone = PROFILE_TIME_ZONE } = {}) => {
  const plan = resolveEffectiveSupportPlan(profile, { nowValue, timeZone });
  const today = zonedDateKey(nowValue, timeZone);
  const warnings = [];
  if (plan.source === 'legacy') {
    warnings.push({ code: 'unversioned', message: 'This profile was saved before versioning: it has no effective dates, source or history. Save it once to start a dated record.' });
  }
  if (plan.expired) {
    warnings.push({ code: 'expired', message: `The profile's end date (${plan.effectiveEnd}) has passed. Supports are still applied until you renew or end the profile.` });
  } else if (plan.active && isDateKey(plan.effectiveEnd)) {
    const daysLeft = Math.round((Date.parse(`${plan.effectiveEnd}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
    if (daysLeft >= 0 && daysLeft <= 14) warnings.push({ code: 'ends-soon', message: `The profile ends on ${plan.effectiveEnd}.` });
  }
  if (plan.status === REVISION_STATUS.INACTIVE) {
    warnings.push({ code: 'inactive', message: 'Supports are turned off for this student (inactive profile).' });
  }
  if (plan.nextWindow) {
    warnings.push({ code: 'future-revision', message: `A new profile revision takes effect on ${plan.nextWindow.effectiveStart}.` });
  }
  const extraTime = list(plan.accommodations).filter((entry) => DEADLINE_SUPPORT_IDS.includes(entry?.id));
  if (extraTime.some((entry) => normalizeDueDateExtension(entry?.params?.dueDateExtension).mode === 'none')) {
    warnings.push({ code: 'extra-time-unset', message: 'Extra time is on, but no due-date extension is set, so MathMaster does not change this student\'s due dates.' });
  }
  return warnings;
};

export default resolveEffectiveSupportPlan;
