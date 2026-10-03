/*
 * THE SUPPORT PROFILE EDITOR'S DRAFT — pure, so it can be tested in node.
 *
 * A teacher never edits a revision. They start a draft from the revision in
 * effect today (or from the pre-versioning flat profile), change what the new
 * paperwork says, and save it as a NEW revision with its own effective date
 * and source. `inputFromDraft` produces exactly what
 * functions/shared/supportProfileModel.mjs `normalizeSupportRevisionInput`
 * validates, so the editor and the rules agree on one shape.
 */
import {
  SUPPORT_CATALOG,
  SUPPORT_CLASSIFICATION,
  SUPPORT_AUTOMATION,
  SUPPORT_CATEGORY_LABEL,
  supportById,
} from '../../../functions/shared/supportCatalog.mjs';
import {
  legacyProfileToRevision,
  resolveEffectiveSupportPlan,
  revisionEffectiveOn,
} from '../../../functions/shared/supportProfileModel.mjs';
import { normalizeDueDateExtension } from '../../../functions/shared/supportDeadline.mjs';
import {
  ITEM_REDUCTION_LIMITS,
  ITEM_REDUCTION_MODE,
  REDUCED_WORKLOAD_SUPPORT_ID,
  normalizeItemReduction,
} from '../../../functions/shared/reducedWorkload.mjs';

const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);

/** The extension choices offered for extra time, most common first. */
export const DUE_DATE_EXTENSION_PRESETS = Object.freeze([
  { key: 'none', label: 'No due-date change', extension: { mode: 'none', value: 0 } },
  { key: 'school-days-1', label: 'Up to the end of the next school day', extension: { mode: 'school-days', value: 1 } },
  { key: 'school-days-2', label: 'Up to 2 school days', extension: { mode: 'school-days', value: 2 } },
  { key: 'school-days-3', label: 'Up to 3 school days', extension: { mode: 'school-days', value: 3 } },
  { key: 'hours-24', label: '24 hours after the class due time', extension: { mode: 'hours', value: 24 } },
  { key: 'hours-48', label: '48 hours after the class due time', extension: { mode: 'hours', value: 48 } },
]);

export const presetKeyForExtension = (extension) => {
  const normalized = normalizeDueDateExtension(extension);
  const match = DUE_DATE_EXTENSION_PRESETS.find((preset) => (
    preset.extension.mode === normalized.mode && preset.extension.value === normalized.value
  ));
  return match ? match.key : 'none';
};

export const extensionForPresetKey = (key) => (
  DUE_DATE_EXTENSION_PRESETS.find((preset) => preset.key === key)?.extension || { mode: 'none', value: 0 }
);

/** Catalog entries the editor offers, grouped for display. */
export const editorGroups = () => {
  const accommodations = SUPPORT_CATALOG.filter((entry) => entry.classification === SUPPORT_CLASSIFICATION.ACCOMMODATION);
  // A support MathMaster can apply by itself under a parameter (a reduced
  // item count with a percentage) is listed with the platform supports.
  const platformCapable = (entry) => entry.automation !== SUPPORT_AUTOMATION.MANUAL || Boolean(entry.automaticWithParam);
  const platform = accommodations.filter(platformCapable);
  const staff = accommodations.filter((entry) => !platformCapable(entry));
  const byCategory = (entries) => {
    const groups = new Map();
    entries.forEach((entry) => {
      const label = SUPPORT_CATEGORY_LABEL[entry.category] || entry.category;
      groups.set(label, [...(groups.get(label) || []), entry]);
    });
    return [...groups.entries()].map(([label, items]) => ({ label, items }));
  };
  return {
    platformAccommodations: byCategory(platform),
    staffAccommodations: byCategory(staff),
    modifications: SUPPORT_CATALOG.filter((entry) => entry.classification === SUPPORT_CLASSIFICATION.MODIFICATION),
    services: SUPPORT_CATALOG.filter((entry) => entry.serviceLoggable),
  };
};

const entryMap = (entries) => Object.fromEntries(list(entries)
  .map((entry) => (typeof entry === 'string' ? { id: entry } : entry))
  .map((entry) => [supportById(entry?.id)?.id || clean(entry?.id), {
    selected: true,
    params: entry?.params && typeof entry.params === 'object' ? { ...entry.params } : {},
    appliesTo: list(entry?.appliesTo),
  }])
  .filter(([id]) => Boolean(id)));

/**
 * A draft for a new revision, starting from the revision in effect today.
 * `revisions` are the stored revision documents (privileged fields included),
 * `profile` the stored projection or flat profile.
 */
export const draftFromCurrent = ({ revisions = [], profile = null, todayKey } = {}) => {
  const stored = revisionEffectiveOn(revisions, todayKey);
  const plan = resolveEffectiveSupportPlan(profile || {}, { dateKey: todayKey });
  const legacy = !stored && plan.source === 'legacy' ? legacyProfileToRevision(profile) : null;
  const base = stored || legacy || null;
  return {
    status: 'active',
    effectiveStart: clean(todayKey),
    effectiveEnd: clean(base?.effectiveEnd) && !(base?.effectiveEnd < todayKey) ? base.effectiveEnd : '',
    sourceLabel: '',
    sourceNote: '',
    inclusionStatus: base ? base.inclusionStatus === true : plan.inclusionStatus === true,
    accommodations: entryMap(base ? base.accommodations : plan.accommodations),
    modifications: entryMap(base ? base.modifications : plan.modifications),
    serviceExpectations: list(base?.serviceExpectations).map((row) => ({
      serviceType: row.serviceType, minutesPerWeek: String(row.minutesPerWeek ?? ''), note: row.note || '',
    })),
    translationLanguage: clean(base?.translationLanguage || plan.translationLanguage),
    basedOnRevisionId: base?.revisionId || base?.id || null,
  };
};

/*
 * What a support starts with when a teacher NEWLY ticks it in the editor.
 * Reduced number of items starts automatic at 25% — the choice is visible
 * (and changeable) before saving. A support that is already on the profile
 * keeps exactly what it has, so a bare entry saved before automatic
 * reduction existed stays "recorded by staff" until a teacher changes it.
 */
export const DEFAULT_PARAMS_WHEN_SELECTED = Object.freeze({
  [REDUCED_WORKLOAD_SUPPORT_ID]: Object.freeze({
    itemReduction: Object.freeze({ mode: ITEM_REDUCTION_MODE.PERCENT, value: ITEM_REDUCTION_LIMITS.defaultPercent }),
  }),
});

export const toggleDraftSupport = (draft, group, supportId) => {
  const current = draft[group] || {};
  const entry = current[supportId];
  const next = { ...current };
  if (entry?.selected) next[supportId] = { ...entry, selected: false };
  else {
    const params = entry?.params && Object.keys(entry.params).length
      ? entry.params
      : { ...DEFAULT_PARAMS_WHEN_SELECTED[supportId] };
    next[supportId] = { params, appliesTo: entry?.appliesTo || [], selected: true };
  }
  return { ...draft, [group]: next };
};

/** The editor's two delivery choices for a reduced item count. */
export const ITEM_REDUCTION_CHOICES = Object.freeze([
  { key: ITEM_REDUCTION_MODE.PERCENT, label: 'MathMaster assigns fewer items automatically' },
  { key: ITEM_REDUCTION_MODE.NONE, label: 'Recorded by staff (MathMaster does not choose the items)' },
]);

/** Percent presets offered beside the number box. */
export const ITEM_REDUCTION_PRESETS = Object.freeze([25, 30, 40, 50]);

/** The draft's reduction as the editor shows it (mode + raw value). */
export const draftItemReduction = (params) => {
  const raw = params?.itemReduction;
  if (raw && typeof raw === 'object' && String(raw.mode || '').toLowerCase() === ITEM_REDUCTION_MODE.PERCENT) {
    return { mode: ITEM_REDUCTION_MODE.PERCENT, value: raw.value ?? ITEM_REDUCTION_LIMITS.defaultPercent, valid: normalizeItemReduction(raw).mode === ITEM_REDUCTION_MODE.PERCENT };
  }
  return { mode: ITEM_REDUCTION_MODE.NONE, value: null, valid: true };
};

export const setDraftSupportParam = (draft, group, supportId, name, value) => {
  const current = draft[group] || {};
  const entry = current[supportId] || { selected: true, params: {}, appliesTo: [] };
  return {
    ...draft,
    [group]: { ...current, [supportId]: { ...entry, params: { ...entry.params, [name]: value } } },
  };
};

export const setDraftSupportRoles = (draft, group, supportId, roles) => {
  const current = draft[group] || {};
  const entry = current[supportId] || { selected: true, params: {}, appliesTo: [] };
  return { ...draft, [group]: { ...current, [supportId]: { ...entry, appliesTo: list(roles) } } };
};

/** What normalizeSupportRevisionInput validates. */
export const inputFromDraft = (draft = {}) => {
  const selected = (group) => Object.entries(draft[group] || {})
    .filter(([, entry]) => entry?.selected)
    .map(([id, entry]) => ({ id, params: entry.params || {}, appliesTo: list(entry.appliesTo) }));
  return {
    status: draft.status === 'inactive' ? 'inactive' : 'active',
    effectiveStart: clean(draft.effectiveStart),
    effectiveEnd: clean(draft.effectiveEnd) || null,
    sourceLabel: clean(draft.sourceLabel),
    sourceNote: clean(draft.sourceNote),
    inclusionStatus: draft.inclusionStatus === true,
    accommodations: selected('accommodations'),
    modifications: selected('modifications'),
    serviceExpectations: list(draft.serviceExpectations)
      .filter((row) => clean(row?.serviceType) || clean(row?.minutesPerWeek))
      .map((row) => ({ serviceType: clean(row.serviceType), minutesPerWeek: Number(row.minutesPerWeek), note: clean(row.note) })),
    translationLanguage: clean(draft.translationLanguage).toLowerCase() || null,
  };
};

/** A one-line human summary of a stored revision, for the history list. */
export const describeRevision = (revision = {}) => {
  const accommodations = list(revision.accommodations).length;
  const modifications = list(revision.modifications).length;
  const services = list(revision.serviceExpectations).length;
  const parts = [
    revision.status === 'inactive' ? 'Supports ended' : `${accommodations} accommodation${accommodations === 1 ? '' : 's'}`,
    revision.status === 'inactive' ? null : `${modifications} modification${modifications === 1 ? '' : 's'}`,
    services ? `${services} service expectation${services === 1 ? '' : 's'}` : null,
    revision.inclusionStatus ? 'inclusion' : null,
  ].filter(Boolean);
  return parts.join(' · ');
};
