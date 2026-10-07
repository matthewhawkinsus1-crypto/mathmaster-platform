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

const NO_TOOLS = Object.freeze({ tools: Object.freeze([]), language: null, universal: Object.freeze([]) });

/*
 * UNIVERSAL DESIGN — Vocabulary and Read aloud for every student, outside
 * assessments.
 *
 * A word's meaning and hearing a prompt read are not accommodations a student
 * should need a plan to reach while learning; under WCAG and UDL they are part
 * of an accessible lesson. So in warm-ups, classwork and practice every
 * student is offered them. Quizzes, tests and DOLs are unchanged: there they
 * remain what the student's plan says (a read-aloud accommodation on a test is
 * a decision about what the test measures, and not ours to widen).
 * Translation stays profile-based.
 *
 * `universal` lists the tools a student has ONLY because of this rule. They
 * are never reported as support evidence (supportToolsModel.js): a student
 * without a plan opening Vocabulary is not an IEP support delivered, and
 * counting it would make the plan reports say something false.
 */
export const UNIVERSAL_TOOLS = Object.freeze([SUPPORT_TOOL.VOCABULARY, SUPPORT_TOOL.READ_ALOUD]);
export const UNIVERSAL_ACTIVITY_ROLES = Object.freeze(['warmup', 'classwork', 'practice']);

export const universalDesignApplies = (activityRole) => UNIVERSAL_ACTIVITY_ROLES.includes(String(activityRole || ''));

const withUniversalTools = (entitled, language, activityRole) => {
  const universal = universalDesignApplies(activityRole) ? UNIVERSAL_TOOLS.filter((tool) => !entitled.includes(tool)) : [];
  const tools = TOOL_ORDER.filter((tool) => entitled.includes(tool) || universal.includes(tool));
  return tools.length ? { tools, language, universal } : NO_TOOLS;
};

/**
 * Which tools the student is entitled to, from their own profile (assignment,
 * rich tool, Work View). Inclusion status implies none of them. A support the
 * profile limits to some activities ("quizzes and tests only") is offered only
 * in those (`activityRole`, as studentSupportTelemetry.js decides its launch
 * records with supportAppliesToRole). Outside assessments the universal tools
 * are added (above) — only for an explicit `universalDesignRole`.
 */
export const toolsEntitlementFromProfile = (profile, { nowValue = Date.now(), activityRole = null, universalDesignRole = null } = {}) => {
  // Universal tools FAIL CLOSED: only for the role the host explicitly
  // declared (`universalDesignRole`), never for a defaulted `activityRole`.
  // QuestionEngine defaults a missing role to 'practice' for plan scoping; a
  // host that forgot to say what the item is must not open tools on a test.
  if (!profile || typeof profile !== 'object') return withUniversalTools([], null, universalDesignRole);
  const flat = effectiveFlatSupportProfile(profile, { nowValue });
  const plan = activityRole ? resolveEffectiveSupportPlan(profile, { nowValue }) : null;
  const ids = new Set(flat.accommodations.filter((id) => !plan || supportAppliesToRole(plan, id, activityRole)));
  const language = translationLanguageOf(flat.translationLanguage);
  const entitled = TOOL_ORDER.filter((tool) => (tool === SUPPORT_TOOL.TRANSLATE ? Boolean(language) : ids.has(TOOL_SUPPORT_ID[tool])));
  return withUniversalTools(entitled, language, universalDesignRole);
};

/**
 * Which tools the student is entitled to on My Math Path, from the server's
 * applicable list (canonical support ids) — the Path client never reads a
 * profile itself. `activityRole` (the Path item's) adds the universal tools
 * outside assessments, exactly as on assignments.
 */
export const toolsEntitlementFromPath = ({ applicableSupports = [], translationLanguage = null, activityRole = null } = {}) => {
  const catalogIds = new Set((Array.isArray(applicableSupports) ? applicableSupports : []).map((id) => CATALOG_ID_FOR_SUPPORT[id]).filter(Boolean));
  const language = translationLanguageOf(translationLanguage);
  const entitled = TOOL_ORDER.filter((tool) => (tool === SUPPORT_TOOL.TRANSLATE
    ? Boolean(language) && catalogIds.has('translation')
    : catalogIds.has(TOOL_SUPPORT_ID[tool])));
  return withUniversalTools(entitled, language, activityRole);
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
