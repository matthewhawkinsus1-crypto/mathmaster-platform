/*
 * SUPPORT TOOLS FOR ONE ITEM — entitled AND backed, or not shown.
 *
 * The student's neutral "Support tools" (src/components/student/
 * StudentSupportTools.jsx) offer at most five language tools. Each appears only
 * when BOTH are true:
 *
 *   entitled  the student's effective support profile includes it — the same
 *             resolution everywhere (functions/shared/supportProfileModel.mjs
 *             effectiveFlatSupportProfile; on My Math Path the server's
 *             applicable list from supportEntitlements.mjs);
 *   backed    this item or tool has the resource behind it: translated
 *             content, vocabulary to define, words to read, directions worth
 *             breaking down, an explanation to frame.
 *
 *   tool            support id            delivery     evidence
 *   Translate       translation           on demand    available / used / unavailable
 *   Vocabulary      glossary-lookup       on demand    available / used
 *   Read aloud      text-to-speech        on demand    available / used / unavailable
 *   Break it down   chunked-directions    automatic    provided
 *   Help me say it  sentence-frames       on demand    available / used
 *
 * The model is pure and synchronous except translation, whose content may need
 * a language pack (translationProviders.js resolveTranslation); until it
 * resolves, Translate is `pending` and records nothing.
 */
import { SUPPORT_FOR_CATALOG_ID } from '../../../functions/shared/supportEntitlements.mjs';
import { studentFacingLabel } from '../../../functions/shared/supportCatalog.mjs';
import { SUPPORT_TOOL, TOOL_STATE, TOOL_SUPPORT_ID } from './supportToolsEntitlement.js';
import { chunkDirections } from './directionChunks.js';
import { sentenceFramesFor } from './sentenceFrames.js';
import { TRANSLATION_COVERAGE } from './translationProviders.js';
import { vocabularyForContext } from './mathVocabulary.js';

export {
  LANGUAGE_SUPPORT_IDS, SUPPORT_TOOL, TOOL_ORDER, TOOL_STATE, TOOL_SUPPORT_ID, toolsEntitlementFromPath, toolsEntitlementFromProfile,
} from './supportToolsEntitlement.js';

/**
 * The tools for one item, synchronously. `speech` says whether this browser
 * can speak (speechText.js speechAvailable). Translation starts `pending`.
 */
export const supportToolsForItem = ({ entitlement, prompt = '', question = null, toolType = '', speech = true } = {}) => {
  if (!entitlement?.tools?.length) return { any: false, tools: [] };
  const text = String(prompt ?? '');
  const tools = entitlement.tools.map((tool) => {
    const supportId = TOOL_SUPPORT_ID[tool];
    // Offered by universal design, not by the student's plan: shown, never
    // reported as support evidence (supportToolsEntitlement.js).
    const universal = Array.isArray(entitlement.universal) && entitlement.universal.includes(tool);
    const base = { tool, supportId, label: studentFacingLabel(supportId) || supportId, ...(universal ? { universal: true } : {}) };
    if (tool === SUPPORT_TOOL.TRANSLATE) return { ...base, state: TOOL_STATE.PENDING, language: entitlement.language };
    if (tool === SUPPORT_TOOL.VOCABULARY) {
      const termIds = vocabularyForContext({ text, toolType });
      return { ...base, state: termIds.length ? TOOL_STATE.AVAILABLE : TOOL_STATE.NOT_APPLICABLE, termIds, reason: termIds.length ? null : 'no-vocabulary' };
    }
    if (tool === SUPPORT_TOOL.READ_ALOUD) {
      if (!text.trim()) return { ...base, state: TOOL_STATE.NOT_APPLICABLE, reason: 'nothing-to-read' };
      return speech
        ? { ...base, state: TOOL_STATE.AVAILABLE }
        : { ...base, state: TOOL_STATE.UNAVAILABLE, reason: 'speech-engine-missing' };
    }
    if (tool === SUPPORT_TOOL.BREAK_IT_DOWN) {
      const chunks = chunkDirections(text, { authoredSteps: question?.directionSteps });
      return chunks
        ? { ...base, state: TOOL_STATE.PROVIDED, chunks }
        : { ...base, state: TOOL_STATE.NOT_APPLICABLE, reason: 'single-step' };
    }
    const frames = sentenceFramesFor({ text, question, toolType });
    return frames.applicable
      ? { ...base, state: TOOL_STATE.AVAILABLE, frames: frames.frames, frameSets: frames.sets }
      : { ...base, state: TOOL_STATE.NOT_APPLICABLE, reason: 'no-explanation-asked' };
  });
  return { any: true, tools };
};

/** Fold a resolved translation (translationProviders.js) into the model. */
export const withTranslation = (model, translation) => ({
  ...model,
  tools: (model?.tools || []).map((tool) => {
    if (tool.tool !== SUPPORT_TOOL.TRANSLATE || !translation) return tool;
    if (translation.coverage === TRANSLATION_COVERAGE.FULL || translation.coverage === TRANSLATION_COVERAGE.PARTIAL) {
      return { ...tool, state: TOOL_STATE.AVAILABLE, translation, coverage: translation.coverage, provider: translation.provider };
    }
    if (translation.coverage === TRANSLATION_COVERAGE.NOT_APPLICABLE) {
      return { ...tool, state: TOOL_STATE.NOT_APPLICABLE, reason: 'no-words-to-translate' };
    }
    return { ...tool, state: TOOL_STATE.UNAVAILABLE, reason: translation.reason || 'no-translation-resource' };
  }),
});

/** Tools to show as buttons: entitled AND backed (never a dead button). */
export const visibleTools = (model) => (model?.tools || []).filter((tool) => (
  tool.state === TOOL_STATE.AVAILABLE || tool.state === TOOL_STATE.PROVIDED
));

/**
 * The evidence one tool state implies — compact facts, no item text. `surface`
 * is where it was shown ('assignment' | 'path' | 'rich-tool' | 'enlarged').
 * Pending (unresolved translation) records nothing.
 */
export const toolEvidence = (tool, { surface = 'assignment', toolType = null } = {}) => {
  // A universal-design tool is not the student's plan support: no evidence.
  if (!tool || tool.state === TOOL_STATE.PENDING || tool.universal) return null;
  const common = { surface, ...(toolType ? { toolType: String(toolType).slice(0, 40) } : {}) };
  const language = tool.tool === SUPPORT_TOOL.TRANSLATE ? { language: tool.language || null } : {};
  if (tool.state === TOOL_STATE.AVAILABLE) {
    const details = { ...common, ...language, deliveryMode: 'on-demand' };
    if (tool.tool === SUPPORT_TOOL.TRANSLATE) Object.assign(details, { provider: tool.provider || null, coverage: tool.coverage || null });
    if (tool.tool === SUPPORT_TOOL.VOCABULARY) details.itemCount = (tool.termIds || []).length;
    if (tool.tool === SUPPORT_TOOL.SAY_IT) details.itemCount = (tool.frames || []).length;
    // Full and partial translation are different facts about an assignment.
    return { supportId: tool.supportId, eventType: 'available', details, variant: tool.tool === SUPPORT_TOOL.TRANSLATE ? tool.coverage || null : null };
  }
  if (tool.state === TOOL_STATE.PROVIDED) {
    return { supportId: tool.supportId, eventType: 'provided', details: { ...common, deliveryMode: 'automatic', itemCount: (tool.chunks?.steps || []).length } };
  }
  if (tool.state === TOOL_STATE.UNAVAILABLE) {
    return { supportId: tool.supportId, eventType: 'unavailable', details: { ...common, ...language, reason: tool.reason || 'unavailable' } };
  }
  if (tool.state === TOOL_STATE.NOT_APPLICABLE) {
    return { supportId: tool.supportId, eventType: 'not-applicable', details: { ...common, reason: tool.reason || 'not-applicable' } };
  }
  return null;
};

export const toolEvidenceRecords = (model, options = {}) => (model?.tools || []).map((tool) => toolEvidence(tool, options)).filter(Boolean);

/**
 * The same facts in My Math Path's delivery vocabulary (canonical ids),
 * which the Path server intersects with what it authorized.
 */
export const pathDeliveryOf = (model, used = []) => ({
  presented: visibleTools(model).filter((tool) => !tool.universal).map((tool) => SUPPORT_FOR_CATALOG_ID[tool.supportId]).filter(Boolean),
  used: (Array.isArray(used) ? used : []).map((supportId) => SUPPORT_FOR_CATALOG_ID[supportId]).filter(Boolean),
});
