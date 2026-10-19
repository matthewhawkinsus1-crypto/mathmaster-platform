/*
 * THE ACCESS SUPPORTS A SECURE ITEM KEEPS — AND WHAT THEY MAY READ.
 *
 * A student whose plan gives them Read aloud, Translate or Vocabulary uses
 * them on every assignment and on My Math Path. On a secure Test or practice
 * exam they reach the mathematics the same way, so they keep them — but only
 * these three, and only over the PROMPT:
 *
 *   Read aloud   speaks the prompt the student can already see.
 *   Translate    the prompt's sentences, from an authored translation of the
 *                prompt or a bundled language pack; the mathematics is carried
 *                through untouched (translationProviders.js preservesMath).
 *   Vocabulary   definitions of the math words the prompt uses, from a fixed
 *                glossary that explains a word, never an item.
 *
 * Not offered on a secure item, though a plan may grant them elsewhere:
 *
 *   Break it down   can carry an item's authored direction steps — a scaffold.
 *   Help me say it  sentence frames that shape an explanation — a construct
 *                   change, like a modification.
 *
 * Who is entitled is decided the way every other screen decides it
 * (supportToolsEntitlement.js toolsEntitlementFromProfile), for the `test`
 * activity role. That needs the student's OWN profile: a support a teacher
 * limited to practice is scoped by the plan, and the flattened assessment
 * profile (studentSupport.js assessmentSupportProfile) no longer carries the
 * plan, so it would offer that support on the test.
 *
 * Pure: no DOM, no clock beyond the optional `nowValue`.
 */
import { SUPPORT_TOOL, toolsEntitlementFromProfile } from '../language/supportToolsEntitlement.js';

export const SECURE_ACCESS_TOOLS = Object.freeze([
  SUPPORT_TOOL.TRANSLATE,
  SUPPORT_TOOL.VOCABULARY,
  SUPPORT_TOOL.READ_ALOUD,
]);

/** The activity role a secure Test, Retest or practice exam is. */
export const SECURE_ACTIVITY_ROLE = 'test';

const NONE = Object.freeze({ tools: Object.freeze([]), language: null });

/**
 * The secure-item language tools this student is entitled to, in the shape
 * the support tray takes: `{ tools, language }`. Nothing for no profile.
 */
export const secureAccessEntitlement = (studentSupportProfile, { nowValue = Date.now() } = {}) => {
  if (!studentSupportProfile || typeof studentSupportProfile !== 'object') return NONE;
  const entitled = toolsEntitlementFromProfile(studentSupportProfile, { nowValue, activityRole: SECURE_ACTIVITY_ROLE });
  const tools = (entitled.tools || []).filter((tool) => SECURE_ACCESS_TOOLS.includes(tool));
  if (!tools.length) return NONE;
  return { tools, language: tools.includes(SUPPORT_TOOL.TRANSLATE) ? entitled.language : null };
};

const isObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

/**
 * The only part of a secure item the supports are given: its prompt, and an
 * authored translation's PROMPT if the item carries one. Choices, response
 * fields, stimulus, context and every other key stay behind, so no support can
 * read, speak or translate anything but the question being asked.
 */
export const securePromptOnly = (question) => {
  const prompt = typeof question?.prompt === 'string' ? question.prompt : '';
  const translations = isObject(question?.translations)
    ? Object.fromEntries(Object.entries(question.translations)
      .filter(([, entry]) => isObject(entry) && typeof entry.prompt === 'string' && entry.prompt.trim())
      .map(([language, entry]) => [language, { prompt: entry.prompt }]))
    : {};
  return Object.keys(translations).length ? { prompt, translations } : { prompt };
};
