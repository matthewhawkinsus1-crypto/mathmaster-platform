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
  const platform = accommodations.filter((entry) => entry.automation !== SUPPORT_AUTOMATION.MANUAL);
  const staff = accommodations.filter((entry) => entry.automation === SUPPORT_AUTOMATION.MANUAL);
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

export const toggleDraftSupport = (draft, group, supportId) => {
  const current = draft[group] || {};
  const entry = current[supportId];
  const next = { ...current };
  if (entry?.selected) next[supportId] = { ...entry, selected: false };
  else next[supportId] = { params: entry?.params || {}, appliesTo: entry?.appliesTo || [], selected: true };
  return { ...draft, [group]: next };
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
