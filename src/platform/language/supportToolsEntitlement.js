/*
 * WHICH LANGUAGE TOOLS A STUDENT IS ENTITLED TO — the light half of the
 * support tools (./supportToolsModel.js is the per-item half).
 *
 * Kept apart so every screen can ask "does this student have any?" without
 * loading the vocabulary index, the chunker or the sentence frames: a student
 * with no language support never downloads them (StudentSupportTools.jsx
 * loads the tray lazily, only when this says there is something to show).
 */
import { CATALOG_ID_FOR_SUPPORT } from '../../../functions/shared/supportEntitlements.mjs';
import { effectiveFlatSupportProfile, translationLanguageOf } from '../../../functions/shared/supportProfileModel.mjs';

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
 * rich tool, Work View). Inclusion status implies none of them.
 */
export const toolsEntitlementFromProfile = (profile, { nowValue = Date.now() } = {}) => {
  if (!profile || typeof profile !== 'object') return NO_TOOLS;
  const flat = effectiveFlatSupportProfile(profile, { nowValue });
  const ids = new Set(flat.accommodations);
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

