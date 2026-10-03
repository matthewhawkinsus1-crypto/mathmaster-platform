// THE SUPPORT CATALOG — one classification for every support, everywhere.
//
// WHY ONE CATALOG. The platform must never silently combine an accommodation
// (changes HOW a student reaches grade-level work) with a modification
// (changes WHAT the student is expected to learn or demonstrate). Before this
// module the classification lived in a teacher-UI option list, a server
// adapter and a report template, and they did not agree on words. Every
// surface — the profile editor, the student runtime, the evidence writer, the
// report and the Firestore rules tests — now asks this table.
//
// It lives in functions/shared/ because the browser and the Cloud Functions
// both read it (see supportEntitlements.mjs for the same reasoning).
//
// Ids are kebab-case and the ids the teacher UI has always persisted in
// `grades/{id}.profile.accommodations/modifications` keep their exact spelling,
// so every stored profile keeps meaning what it meant.

import { ITEM_REDUCTION_MODE, normalizeItemReduction } from './reducedWorkload.mjs';

export const SUPPORT_CLASSIFICATION = Object.freeze({
  ACCOMMODATION: 'accommodation',
  MODIFICATION: 'modification',
  SERVICE: 'service',
});

/**
 * How the platform can take part in a support.
 *
 *   automatic           the platform applies it by itself (declutter, deadline)
 *   platform-available  the platform offers it; the student chooses to use it
 *   manual              an adult delivers it; only a staff record can prove it
 */
export const SUPPORT_AUTOMATION = Object.freeze({
  AUTOMATIC: 'automatic',
  PLATFORM_AVAILABLE: 'platform-available',
  MANUAL: 'manual',
});

export const SUPPORT_CATEGORY = Object.freeze({
  PRESENTATION: 'presentation',
  RESPONSE: 'response',
  TIMING: 'timing',
  SETTING: 'setting',
  ORGANIZATION: 'organization',
  INSTRUCTION: 'instruction',
  CONTENT: 'content',
  SERVICE: 'service',
});

export const SUPPORT_CATEGORY_LABEL = Object.freeze({
  presentation: 'Presentation',
  response: 'Response',
  timing: 'Timing',
  setting: 'Setting',
  organization: 'Organization',
  instruction: 'Instruction',
  content: 'Content (modification)',
  service: 'Service / support',
});

/** Activity roles a support can be limited to. Empty `appliesTo` = all. */
export const SUPPORT_ACTIVITY_ROLES = Object.freeze(['warmup', 'classwork', 'practice', 'dol', 'quiz', 'test']);

const A = SUPPORT_CLASSIFICATION.ACCOMMODATION;
const M = SUPPORT_CLASSIFICATION.MODIFICATION;
const S = SUPPORT_CLASSIFICATION.SERVICE;
const AUTO = SUPPORT_AUTOMATION.AUTOMATIC;
const OFFER = SUPPORT_AUTOMATION.PLATFORM_AVAILABLE;
const MANUAL = SUPPORT_AUTOMATION.MANUAL;
const C = SUPPORT_CATEGORY;

/*
 * `evidence` names the event types that can PROVE this support happened:
 *   available  the platform made it available to the student
 *   provided   the platform (or an adult) put it in front of the student
 *   used       the student actually used it
 *   documented a staff member recorded delivering it
 * A support whose evidence list lacks `used` has no student "use" to measure
 * (a decluttered screen is provided, not used), and a report must not show a
 * usage gap for it.
 *
 * `studentLabel` is the ONLY name a student ever sees, and it never says IEP,
 * 504, MOD, modification or inclusion. `null` means the support is not
 * presented to the student as a tool at all.
 */
const entries = [
  // --- Platform accommodations the student sees as tools -------------------
  {
    id: 'text-to-speech', classification: A, category: C.PRESENTATION, automation: OFFER,
    label: 'Text-to-speech / read aloud', studentLabel: 'Read aloud', evidence: ['available', 'used'], legacy: true,
  },
  {
    id: 'calculator', classification: A, category: C.RESPONSE, automation: OFFER,
    label: 'Calculator (where the question policy allows an accommodation)', studentLabel: 'Calculator',
    evidence: ['available', 'used'], legacy: true,
  },
  {
    id: 'calculator-override-computation', classification: A, category: C.RESPONSE, automation: OFFER,
    label: 'Calculator may override the computation-skill lock', studentLabel: null, parentId: 'calculator',
    evidence: ['available', 'used'], legacy: true,
  },
  {
    id: 'reteach-resources', classification: A, category: C.INSTRUCTION, automation: OFFER,
    label: 'Reteach / resource materials', studentLabel: 'Review materials', evidence: ['available', 'used'],
    params: ['resources'],
  },
  {
    id: 'study-sheet', classification: A, category: C.INSTRUCTION, automation: OFFER,
    label: 'Study sheet / preview / summary', studentLabel: 'Study sheet', evidence: ['available', 'used'],
    params: ['resources'],
  },
  {
    id: 'graph-paper', classification: A, category: C.RESPONSE, automation: OFFER,
    label: 'Supplemental aid — graph paper / scratch work for multi-step math', studentLabel: 'Graph paper',
    evidence: ['available', 'used'],
  },

  // --- Language access (src/platform/language/) -----------------------------
  // Language access is never easier mathematics: each of these changes the
  // words around a task, never its numbers, expressions or expectations.
  {
    // DERIVED, NEVER TICKED. A revision's language (`translationLanguage`)
    // authorizes translated content by itself; a second "Translation" checkbox
    // could only disagree with it. supportProfileModel.mjs derivedSupportIds
    // adds this id wherever a revision's supports are listed (entitlements,
    // evidence, the report), and the editor never offers it. It is `available`
    // only where translated content actually exists for the item in that
    // language — never merely because a language is set.
    id: 'translation', classification: A, category: C.PRESENTATION, automation: OFFER,
    label: 'Translated content (the profile language)', studentLabel: 'Translate',
    evidence: ['available', 'used'], derivedFrom: 'translationLanguage',
  },
  {
    // Was adult-delivered only (manual, `documented`). It is now a platform
    // tool — the student's bilingual math vocabulary — so it is `available`
    // where the item or tool has vocabulary to show and `used` when opened.
    // `formerlyManual`: work from before the student's first platform record
    // of it is "predates recording", never a platform gap, and a staff record
    // still proves it (`documented` stays in its evidence list).
    id: 'glossary-lookup', classification: A, category: C.PRESENTATION, automation: OFFER,
    label: 'Glossary / vocabulary support', studentLabel: 'Vocabulary',
    evidence: ['available', 'used', 'documented'], legacy: true, formerlyManual: true,
  },
  {
    // Not `visual-chunking` (one step of a multi-step task at a time — layout)
    // and not `directions-multiple-ways` (an adult re-presenting directions).
    // This is the platform restating the item's DIRECTIONS as short numbered
    // steps from curated rules; the mathematics and what is asked are
    // unchanged. Shown by itself under the directions, so it is `provided`.
    id: 'chunked-directions', classification: A, category: C.PRESENTATION, automation: AUTO,
    label: 'Directions broken into short steps (same mathematics)', studentLabel: 'Break it down', evidence: ['provided'],
  },
  {
    // Sentence starters for explaining reasoning. A frame never contains an
    // answer, a value, or which method to choose; it is offered only where the
    // item asks the student to explain, justify or describe.
    id: 'sentence-frames', classification: A, category: C.RESPONSE, automation: OFFER,
    label: 'Sentence frames for explaining (no answers)', studentLabel: 'Help me say it', evidence: ['available', 'used'],
  },

  // --- Accommodations the platform applies by itself ------------------------
  {
    id: 'extra-time', classification: A, category: C.TIMING, automation: AUTO,
    label: 'Extra time (individualized due date)', studentLabel: null, evidence: ['provided'],
    params: ['dueDateExtension'], legacy: true,
  },
  {
    id: 'extra-time-written-response', classification: A, category: C.TIMING, automation: AUTO,
    label: 'Extra time for written response', studentLabel: null, evidence: ['provided'],
    params: ['dueDateExtension'],
  },
  {
    id: 'visual-chunking', classification: A, category: C.ORGANIZATION, automation: AUTO,
    label: 'Chunked presentation (one step at a time)', studentLabel: null, evidence: ['provided'], legacy: true,
  },
  {
    id: 'declutter-ui', classification: A, category: C.PRESENTATION, automation: AUTO,
    label: 'Decluttered interface', studentLabel: null, evidence: ['provided'], legacy: true,
  },
  {
    id: 'no-countdown', classification: A, category: C.TIMING, automation: AUTO,
    label: 'Countdown clocks hidden (server timing unchanged)', studentLabel: null, evidence: ['provided'], legacy: true,
  },
  {
    id: 'disable-idle-timer', classification: A, category: C.TIMING, automation: AUTO,
    label: 'No idle-timeout prompt', studentLabel: null, evidence: ['provided'], legacy: true,
  },
  {
    id: 'high-contrast', classification: A, category: C.PRESENTATION, automation: AUTO,
    label: 'High contrast', studentLabel: null, evidence: ['provided'], legacy: true,
  },
  {
    id: 'large-text', classification: A, category: C.PRESENTATION, automation: AUTO,
    label: 'Larger text', studentLabel: null, evidence: ['provided'], legacy: true,
  },
  {
    id: 'word-processor-response', classification: A, category: C.RESPONSE, automation: AUTO,
    label: 'Chromebook / word-processor response', studentLabel: null, evidence: ['provided'],
  },
  {
    // Kept an ACCOMMODATION because that is how the teacher UI has always
    // classified it; reclassifying would retroactively turn students' past
    // work into Modified. It performs an algebra step the student chose but
    // did not carry out, so reports flag it as affecting independence evidence
    // (functions/shared/supportEntitlements.mjs CONSTRUCT_AFFECTING_SUPPORTS).
    id: 'algebra-auto-apply', classification: A, category: C.RESPONSE, automation: AUTO,
    label: 'Algebra operation Apply shortcut', studentLabel: null, evidence: ['provided'],
    affectsIndependence: true, legacy: true,
  },
  {
    // MANUAL by default — a bare entry (every profile saved before automatic
    // reduction existed) keeps meaning "a teacher handed over a shorter
    // assignment and records it". It becomes AUTOMATIC only when its revision
    // carries an explicit percentage (`params.itemReduction`, validated in
    // functions/shared/reducedWorkload.mjs); see supportAutomationFor below.
    // `provided` is then recorded only after MathMaster actually omitted items.
    id: 'reduced-item-count-same-rigor', classification: A, category: C.ORGANIZATION, automation: MANUAL,
    automaticWithParam: 'itemReduction',
    label: 'Reduced number of items — same TEKS and rigor', studentLabel: null, evidence: ['provided', 'documented'],
    params: ['itemReduction'],
  },
  // Legacy structured-shape accommodations: persisted by some profiles, kept
  // so they keep meaning something and appear in reports.
  {
    id: 'graphic-organizer', classification: A, category: C.ORGANIZATION, automation: MANUAL,
    label: 'Graphic organizer', studentLabel: null, evidence: ['documented'], legacy: true,
  },
  {
    id: 'reduced-choices', classification: A, category: C.PRESENTATION, automation: MANUAL,
    label: 'Reduced answer choices', studentLabel: null, evidence: ['documented'], legacy: true,
  },
  {
    id: 'extra-attempts', classification: A, category: C.TIMING, automation: AUTO,
    label: 'Extra attempts (My Math Path)', studentLabel: null, evidence: ['provided'], legacy: true,
  },

  // --- Accommodations only an adult can deliver ------------------------------
  {
    id: 'repeat-instructions', classification: A, category: C.INSTRUCTION, automation: MANUAL,
    label: 'Repeat / explain instructions', quickAction: 'Re-explained directions', evidence: ['documented'],
  },
  {
    id: 'directions-multiple-ways', classification: A, category: C.INSTRUCTION, automation: MANUAL,
    label: 'Directions presented in multiple ways / simplified vocabulary', evidence: ['documented'],
  },
  {
    id: 'check-for-understanding', classification: A, category: C.INSTRUCTION, automation: MANUAL,
    label: 'Teacher check for understanding', quickAction: 'Checked understanding', evidence: ['documented'],
  },
  {
    id: 'frequent-feedback', classification: A, category: C.INSTRUCTION, automation: MANUAL,
    label: 'Frequent feedback', quickAction: 'Gave feedback', evidence: ['documented'],
  },
  {
    id: 'on-task-prompt', classification: A, category: C.SETTING, automation: MANUAL,
    label: 'On-task focusing prompt / reminder', quickAction: 'On-task prompt', evidence: ['documented'],
  },
  {
    id: 'reminder-of-expectations', classification: A, category: C.SETTING, automation: MANUAL,
    label: 'Reminder of rules / expectations', evidence: ['documented'],
  },
  {
    id: 'verbalize-steps', classification: A, category: C.RESPONSE, automation: MANUAL,
    label: 'Student verbalizes steps / self-talk opportunity', evidence: ['documented'],
  },
  {
    id: 'whisper-read-aloud', classification: A, category: C.PRESENTATION, automation: MANUAL,
    label: 'Independent read-aloud / whisper opportunity', evidence: ['documented'],
  },
  {
    id: 'planner-communication', classification: A, category: C.ORGANIZATION, automation: MANUAL,
    label: 'Planner / folder / teacher-signature communication', evidence: ['documented'],
  },
  {
    id: 'highlighted-materials', classification: A, category: C.PRESENTATION, automation: MANUAL,
    label: 'Highlighted / emphasized materials', evidence: ['documented'],
  },
  {
    id: 'study-aids-manipulatives', classification: A, category: C.RESPONSE, automation: MANUAL,
    label: 'Study aids / manipulatives', quickAction: 'Provided supplemental aid', evidence: ['documented'],
  },
  {
    id: 'adult-reteach', classification: A, category: C.INSTRUCTION, automation: MANUAL,
    label: 'Reteaching delivered by an adult', quickAction: 'Provided reteach', evidence: ['documented'],
  },

  // --- Services (a support log, not student screen time) --------------------
  {
    id: 'inclusion-support', classification: S, category: C.SERVICE, automation: MANUAL,
    label: 'Inclusion / provider support present', quickAction: 'Inclusion support present',
    evidence: ['documented'], serviceLoggable: true,
  },
  {
    id: 'co-teaching', classification: S, category: C.SERVICE, automation: MANUAL,
    label: 'Co-teaching', evidence: ['documented'], serviceLoggable: true,
  },
  {
    id: 'paraprofessional-support', classification: S, category: C.SERVICE, automation: MANUAL,
    label: 'Paraprofessional support', evidence: ['documented'], serviceLoggable: true,
  },
  {
    id: 'small-group-instruction', classification: S, category: C.SERVICE, automation: MANUAL,
    label: 'Small-group instruction', evidence: ['documented'], serviceLoggable: true,
  },
  {
    id: 'other-service', classification: S, category: C.SERVICE, automation: MANUAL,
    label: 'Other service / support', evidence: ['documented'], serviceLoggable: true,
  },

  // --- Modifications ----------------------------------------------------------
  {
    id: 'reduce-complexity', classification: M, category: C.CONTENT, automation: AUTO,
    label: 'Reduced mathematical complexity', evidence: ['provided'], legacy: true,
  },
  {
    id: 'prefill-first-step', classification: M, category: C.CONTENT, automation: AUTO,
    label: 'First step prefilled', evidence: ['provided'], legacy: true,
  },
  {
    id: 'reduced-coverage', classification: M, category: C.CONTENT, automation: MANUAL,
    label: 'Reduced items that change content coverage or rigor', evidence: ['provided', 'documented'],
  },
  {
    id: 'modified-assignment', classification: M, category: C.CONTENT, automation: MANUAL,
    label: 'Modified assignment / version', evidence: ['provided', 'documented'],
  },
  {
    id: 'modified-standard', classification: M, category: C.CONTENT, automation: MANUAL,
    label: 'Modified / off-grade-level standard', evidence: ['documented'], params: ['teksCode'],
  },
  {
    id: 'reduced-dok', classification: M, category: C.CONTENT, automation: MANUAL,
    label: 'Reduced depth of knowledge', evidence: ['documented'], params: ['maxDok'],
  },
];

export const SUPPORT_CATALOG = Object.freeze(entries.map((entry) => Object.freeze({
  studentLabel: null,
  quickAction: null,
  affectsIndependence: false,
  legacy: false,
  serviceLoggable: false,
  parentId: null,
  automaticWithParam: null,
  derivedFrom: null,
  formerlyManual: false,
  ...entry,
  evidence: Object.freeze([...(entry.evidence || [])]),
  params: Object.freeze([...(entry.params || [])]),
})));

const BY_ID = new Map(SUPPORT_CATALOG.map((entry) => [entry.id, entry]));

/*
 * Ids that older code or older profiles wrote under a different spelling.
 * `reduced-item-count` alone is ambiguous by design: the brief is explicit that
 * fewer items is an accommodation only when TEKS and rigor are preserved, so an
 * unqualified entry is NOT silently promoted to the accommodation — it resolves
 * to nothing and the editor asks the teacher which one they meant.
 */
const ALIASES = Object.freeze({
  'extended-time': 'extra-time',
  'extra_time': 'extra-time',
  tts: 'text-to-speech',
  'read-aloud': 'text-to-speech',
  'declutter': 'declutter-ui',
  'chunking': 'visual-chunking',
  'hide-countdown': 'no-countdown',
});

/** The catalog entry for an id (or a known alias), or null. */
export const supportById = (id) => {
  const key = String(id ?? '').trim().toLowerCase();
  if (!key) return null;
  return BY_ID.get(key) || BY_ID.get(ALIASES[key] || '') || null;
};

export const canonicalSupportId = (id) => supportById(id)?.id || null;

/*
 * How a support is delivered UNDER ONE REVISION'S PARAMETERS. Most supports
 * have one automation level; a support with `automaticWithParam` is automatic
 * only when that parameter is explicitly set to an automatic mode (today:
 * `reduced-item-count-same-rigor` with `itemReduction: { mode: 'percent' }`).
 * Reports and gap detection ask this, never the static catalog field, so a
 * recorded-only support is never shown as a platform gap and an automatic one
 * is never shown as "no staff record".
 */
export const supportAutomationFor = (id, params = null) => {
  const entry = supportById(id);
  if (!entry) return null;
  if (entry.automaticWithParam === 'itemReduction'
    && normalizeItemReduction(params?.itemReduction).mode === ITEM_REDUCTION_MODE.PERCENT) {
    return SUPPORT_AUTOMATION.AUTOMATIC;
  }
  return entry.automation;
};

/** A support no teacher ticks: it follows from another profile field (`derivedFrom`). */
export const isDerivedSupport = (id) => Boolean(supportById(id)?.derivedFrom);

export const isAccommodation = (id) => supportById(id)?.classification === SUPPORT_CLASSIFICATION.ACCOMMODATION;
export const isModification = (id) => supportById(id)?.classification === SUPPORT_CLASSIFICATION.MODIFICATION;
export const isService = (id) => supportById(id)?.classification === SUPPORT_CLASSIFICATION.SERVICE;

/** Catalog entries for one classification, in catalog order. */
export const supportsByClassification = (classification) => (
  SUPPORT_CATALOG.filter((entry) => entry.classification === classification)
);

/** The one-click classroom actions, in the order the brief lists them. */
export const QUICK_ACTION_SUPPORT_IDS = Object.freeze([
  'check-for-understanding',
  'repeat-instructions',
  'adult-reteach',
  'frequent-feedback',
  'on-task-prompt',
  'study-aids-manipulatives',
  'inclusion-support',
]);

export const quickActions = () => QUICK_ACTION_SUPPORT_IDS.map((id) => BY_ID.get(id)).filter(Boolean);

/** Services a staff member can log minutes for. */
export const serviceTypes = () => SUPPORT_CATALOG.filter((entry) => entry.serviceLoggable);

/**
 * The name a student sees for a support, or null when it is not a student tool.
 * Deliberately never falls back to the teacher label: a teacher label can say
 * "IEP" or "modified", and the student surface must not.
 */
export const studentFacingLabel = (id) => supportById(id)?.studentLabel || null;

/** Human label for teachers/reports; unknown ids are shown verbatim, never hidden. */
export const supportLabel = (id) => supportById(id)?.label || String(id ?? '').trim() || 'Unknown support';

// Compact teacher wording for chips on busy screens (hub, drawer). The full
// label stays in the profile editor and the report.
const SHORT_LABELS = Object.freeze({
  'text-to-speech': 'Read aloud',
  calculator: 'Calculator',
  'calculator-override-computation': 'Calculator (computation override)',
  'reteach-resources': 'Reteach materials',
  'study-sheet': 'Study sheet',
  'graph-paper': 'Graph paper',
  translation: 'Translation',
  'glossary-lookup': 'Vocabulary',
  'chunked-directions': 'Break it down',
  'sentence-frames': 'Sentence frames',
  'extra-time': 'Extra time',
  'extra-time-written-response': 'Extra time (written)',
  'visual-chunking': 'Chunked presentation',
  'declutter-ui': 'Decluttered screen',
  'no-countdown': 'Countdown hidden',
  'disable-idle-timer': 'No idle prompt',
  'word-processor-response': 'Word-processor response',
  'algebra-auto-apply': 'Algebra Apply shortcut',
  'reduced-item-count-same-rigor': 'Fewer items, same rigor',
  'check-for-understanding': 'Check for understanding',
  'repeat-instructions': 'Repeat directions',
  'directions-multiple-ways': 'Directions, multiple ways',
  'frequent-feedback': 'Frequent feedback',
  'on-task-prompt': 'On-task prompt',
  'reminder-of-expectations': 'Expectations reminder',
  'verbalize-steps': 'Verbalize steps',
  'whisper-read-aloud': 'Whisper read-aloud',
  'planner-communication': 'Planner communication',
  'highlighted-materials': 'Highlighted materials',
  'study-aids-manipulatives': 'Study aids / manipulatives',
  'adult-reteach': 'Adult reteach',
  'inclusion-support': 'Inclusion support',
  'reduce-complexity': 'Reduced complexity',
  'prefill-first-step': 'First step prefilled',
  'reduced-coverage': 'Reduced coverage',
  'modified-assignment': 'Modified assignment',
  'modified-standard': 'Modified standard',
  'reduced-dok': 'Reduced DOK',
});

export const supportShortLabel = (id) => SHORT_LABELS[supportById(id)?.id] || supportLabel(id);

/*
 * What inclusion status has always implied at runtime
 * (src/studentSupport.js getStudentSupportPresentation). Surfaced so the
 * editor and the report can say it out loud instead of it being hidden
 * behaviour.
 */
export const INCLUSION_IMPLIED_SUPPORT_IDS = Object.freeze([
  'declutter-ui', 'visual-chunking', 'high-contrast', 'large-text', 'no-countdown', 'disable-idle-timer',
]);

/**
 * Classify a list of stored ids into the three groups, keeping unknown ids
 * visible (a report must show what was stored even when this build does not
 * recognise it).
 */
export const classifySupportIds = (ids = []) => {
  const result = { accommodations: [], modifications: [], services: [], unknown: [] };
  const seen = new Set();
  (Array.isArray(ids) ? ids : []).forEach((raw) => {
    const entry = supportById(raw);
    const key = entry ? entry.id : String(raw ?? '').trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    if (!entry) result.unknown.push(key);
    else if (entry.classification === SUPPORT_CLASSIFICATION.MODIFICATION) result.modifications.push(key);
    else if (entry.classification === SUPPORT_CLASSIFICATION.SERVICE) result.services.push(key);
    else result.accommodations.push(key);
  });
  return result;
};

export default SUPPORT_CATALOG;
