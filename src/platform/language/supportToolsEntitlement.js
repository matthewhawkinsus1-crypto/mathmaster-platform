/*
 * WHICH LANGUAGE TOOLS A STUDENT IS ENTITLED TO — the light half of the
 * support tools (./supportToolsModel.js is the per-item half).
 *
 * Kept apart so every screen can ask "does this student have any?" without
 * loading the vocabulary index, the chunker or the sentence frames: a student
 * with no language support never downloads them (StudentSupportTools.jsx
 * loads the tray lazily, only when this says there is something to show).
 */
import { CATALOG_ID_FOR_SUPPORT, SUPPORT_FOR_CATALOG_ID } from '../../../functions/shared/supportEntitlements.mjs';
import {
  effectiveFlatSupportProfile, resolveEffectiveSupportPlan, supportAppliesToRole, translationLanguageOf,
} from '../../../functions/shared/supportProfileModel.mjs';

export const SUPPORT_TOOL = Object.freeze({
  TRANSLATE: 'translate',
  VOCABULARY: 'vocabulary',
  READ_ALOUD: 'read-aloud',
  BREAK_IT_DOWN: 'break-it-down',
  SAY_IT: 'say-it',
});

export const TOOL_ORDER = Object.freeze([
  SUPPORT_TOOL.TRANSLATE, SUPPORT_TOOL.VOCABULARY, SUPPORT_TOOL.READ_ALOUD, SUPPORT_TOOL.BREAK_IT_DOWN, SUPPORT_TOOL.SAY_IT,
]);

export const TOOL_SUPPORT_ID = Object.freeze({
  [SUPPORT_TOOL.TRANSLATE]: 'translation',
  [SUPPORT_TOOL.VOCABULARY]: 'glossary-lookup',
  [SUPPORT_TOOL.READ_ALOUD]: 'text-to-speech',
  [SUPPORT_TOOL.BREAK_IT_DOWN]: 'chunked-directions',
  [SUPPORT_TOOL.SAY_IT]: 'sentence-frames',
});

/** The language supports whose applicability the platform evaluates per item. */
export const LANGUAGE_SUPPORT_IDS = Object.freeze(Object.values(TOOL_SUPPORT_ID));

export const TOOL_STATE = Object.freeze({
  AVAILABLE: 'available',
  PROVIDED: 'provided',
  NOT_APPLICABLE: 'not-applicable',
  UNAVAILABLE: 'unavailable',
  PENDING: 'pending',
});

const NO_TOOLS = Object.freeze({ tools: Object.freeze([]), language: null });

/**
 * Which tools the student is entitled to, from their own profile (assignment,
 * rich tool, Work View). Inclusion status implies none of them. A support the
 * profile limits to some activities ("quizzes and tests only") is offered only
 * in those (`activityRole`, as studentSupportTelemetry.js decides its launch
 * records with supportAppliesToRole).
 */
export const toolsEntitlementFromProfile = (profile, { nowValue = Date.now(), activityRole = null } = {}) => {
  if (!profile || typeof profile !== 'object') return NO_TOOLS;
  const flat = effectiveFlatSupportProfile(profile, { nowValue });
  const plan = activityRole ? resolveEffectiveSupportPlan(profile, { nowValue }) : null;
  const ids = new Set(flat.accommodations.filter((id) => !plan || supportAppliesToRole(plan, id, activityRole)));
  const language = translationLanguageOf(flat.translationLanguage);
  const tools = TOOL_ORDER.filter((tool) => (tool === SUPPORT_TOOL.TRANSLATE ? Boolean(language) : ids.has(TOOL_SUPPORT_ID[tool])));
  return tools.length ? { tools, language } : NO_TOOLS;
};

/**
 * Which tools the student is entitled to on My Math Path, from the server's
 * applicable list (canonical support ids) — the Path client never reads a
 * profile itself.
 */
export const toolsEntitlementFromPath = ({ applicableSupports = [], translationLanguage = null } = {}) => {
  const catalogIds = new Set((Array.isArray(applicableSupports) ? applicableSupports : []).map((id) => CATALOG_ID_FOR_SUPPORT[id]).filter(Boolean));
  const language = translationLanguageOf(translationLanguage);
  const tools = TOOL_ORDER.filter((tool) => (tool === SUPPORT_TOOL.TRANSLATE
    ? Boolean(language) && catalogIds.has('translation')
    : catalogIds.has(TOOL_SUPPORT_ID[tool])));
  return tools.length ? { tools, language } : NO_TOOLS;
};

/**
 * One support-evidence record as a My Math Path delivery fact: which canonical
 * support it is and whether it says the support was on screen (`presented`)
 * or opened (`used`). Null for anything else, and for a support the server did
 * not list as applicable — the attempt can only ever narrow what is recorded.
 */
export const pathDeliveryFact = (record, applicableSupports = []) => {
  const supportId = SUPPORT_FOR_CATALOG_ID[record?.supportId];
  if (!supportId || !(Array.isArray(applicableSupports) && applicableSupports.includes(supportId))) return null;
  if (record.eventType === 'used') return { supportId, field: 'used' };
  if (record.eventType === 'available' || record.eventType === 'provided') return { supportId, field: 'presented' };
  return null;
};

/**
 * Fold one record into a question instance's delivery `{ key, presented, used }`.
 * A record for a new `key` starts a fresh delivery, so one question's facts
 * never ride on the next question's attempt.
 */
export const foldPathDelivery = (delivery, record, { key = '', applicableSupports = [] } = {}) => {
  const base = delivery?.key === key ? delivery : { key, presented: [], used: [] };
  const fact = pathDeliveryFact(record, applicableSupports);
  if (!fact || base[fact.field].includes(fact.supportId)) return base;
  return { ...base, [fact.field]: [...base[fact.field], fact.supportId] };
};
