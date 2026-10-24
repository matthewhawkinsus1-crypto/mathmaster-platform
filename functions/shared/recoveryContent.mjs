/*
 * RECOVERY CONTENT — A SEPARATELY VERSIONED RECOVERY FOR STATIC QUESTIONS.
 *
 * Recovery promises a fresh, equivalent, server-graded question for every
 * Warm-Up and DOL question (sectionRecoveryReadiness.mjs). A Question Family
 * slot keeps that promise itself. A STATIC question — one fixed problem, the
 * way most lessons are written, and the way every question students have
 * already answered was delivered — could not, and turning it into a family
 * slot would change the question students answer (and the one they have
 * already answered). That is a supersession, which retires work.
 *
 * So the recovery of a static question is stored BESIDE it, never in it:
 *
 *   assignment.recoveryContent = {
 *     schemaVersion: 1,
 *     version: 3,                         // +1 on every change, never reused
 *     bindings: {
 *       'l2-dol-1': {                     // the ORIGINAL question's id
 *         questionId: 'l2-dol-1',
 *         section: 'dol',
 *         questionFamily: { id, version, constraints, tool },
 *         sourceSignature: '…',           // the original, as certified
 *         originalFingerprints: ['…'],    // the original in the family's terms
 *         certification: { … },           // what was checked, and its numbers
 *         origin: 'upgrade' | 'preflight' | 'migration',
 *         migrationId: '…' | null,
 *         certifiedAt: ISO,
 *       },
 *     },
 *     history: [ { version, at, by, source, migrationId, planHash, added, replaced, removed } ],
 *   }
 *
 * NOTHING ABOUT THE ORIGINAL CHANGES. Its id, position, content, delivery,
 * grading and every student record stay byte for byte as they were: the
 * player, the deadline finalizer, ingestion, the gradebook and Classroom
 * never read `recoveryContent`. Only Recovery does, and only for a question
 * with no family of its own.
 *
 * A BINDING IS FOR ONE VERSION OF ONE QUESTION. `sourceSignature` is the
 * original as it was certified (wording, numbers, key — not its grade value or
 * section title). If the question is edited afterwards, the binding is stale:
 * Recovery for it is unavailable, and Pre-Flight and the teacher's assignment
 * details say so and offer to prepare it again. A stale binding is never used
 * to deal or to grade — a pin dealt from it would no longer match its
 * question.
 *
 * WHAT RECOVERY SEES. For a bound question, Recovery works on a synthesized
 * family slot (`recoverySourceQuestion`): the original's identity (question
 * id, section, standards, rigor, grade value) and the binding's family —
 * none of the original's own wording, key, hints or notes, which describe the
 * original's numbers. The family writes the mathematics of every version.
 *
 * FRESH MEANS NOT ANY PROBLEM IN THIS ASSIGNMENT. `originalFingerprints` is
 * the original in the family's terms (from the family's `recognize`), and
 * `recoveryExclusionFingerprints` adds every other static question in the
 * assignment the same family recognizes (the Practice item "graph f(x − 7)"),
 * so Recovery never deals a problem the student has already met here.
 *
 * Pure: no Firestore, no clock (`at` is a parameter).
 */

import { hashString32 } from './questionFamilyEngine.mjs';
import { stableStringify } from './idUtils.mjs';
import { isFamilyBackedQuestion } from './questionFamilyInstance.mjs';
import { getPlatformQuestionFamily } from './questionFamilyRegistry.mjs';
import { resolveFamilyConstraints } from './questionFamilyContract.mjs';

export const RECOVERY_CONTENT_FIELD = 'recoveryContent';
export const RECOVERY_CONTENT_SCHEMA_VERSION = 1;
export const RECOVERY_CERTIFICATION_VERSION = 1;
export const RECOVERY_CONTENT_HISTORY_LIMIT = 25;
export const RECOVERY_SECTIONS_WITH_CONTENT = Object.freeze(['warmup', 'dol']);

export const RECOVERY_BINDING_ORIGIN = Object.freeze({
  // Pre-Flight paired the question with a certified family when the
  // assignment was created.
  PREFLIGHT: 'preflight',
  // A teacher previewed and approved a recovery upgrade of a live assignment.
  UPGRADE: 'upgrade',
  // A prepared, named migration (recoveryMigrations.mjs) was applied.
  MIGRATION: 'migration',
});

export const RECOVERY_SOURCE_KIND = Object.freeze({
  FAMILY: 'family',
  BINDING: 'binding',
  STALE: 'stale',
  NONE: 'none',
});

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);

/* ---------------------------------------------------------------------------
 * The original, as certified.
 * ------------------------------------------------------------------------- */

/*
 * Fields that never change what a question asks or how it is marked: its
 * grade value and who set it, where it sits, whether a teacher excluded it,
 * and the help text around it. A teacher may change any of them without
 * making a prepared Recovery stale. Everything else — the prompt, the numbers,
 * the key, the tool and its settings — is the question.
 */
export const SIGNATURE_IGNORED_FIELDS = Object.freeze([
  'questionWeight', 'questionWeightBasis',
  'activityRole', 'sectionId', 'sectionTitle',
  'teacherExcluded', 'hints', 'guidedNotes',
]);

const hashHex = (text) => [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35]
  .map((seed) => hashString32(text, seed).toString(16).padStart(8, '0'))
  .join('');

/** A stable 128-bit signature of the question a binding was certified for. */
export const recoverySourceSignature = (question = {}) => {
  if (!isObject(question)) return null;
  const content = { ...question };
  SIGNATURE_IGNORED_FIELDS.forEach((field) => { delete content[field]; });
  return `rs1:${hashHex(stableStringify(content))}`;
};

/** The question's primary TEKS codes, read without the standards catalog. */
export const primaryStandardCodes = (question = {}) => {
  const codes = [];
  const add = (code) => {
    const value = clean(code).replace(/^texas:/i, '').toUpperCase();
    if (value && !codes.includes(value)) codes.push(value);
  };
  if (Array.isArray(question?.alignments)) {
    question.alignments
      .filter((entry) => isObject(entry) && clean(entry.framework || 'teks') === 'teks' && clean(entry.role || 'primary') === 'primary')
      .forEach((entry) => add(entry.code));
  }
  if (!codes.length) {
    const standard = question?.standard ?? question?.teks;
    (Array.isArray(standard) ? standard : [standard]).forEach(add);
  }
  return codes;
};

/* ---------------------------------------------------------------------------
 * The stored record.
 * ------------------------------------------------------------------------- */

const normalizeFamilyReference = (raw) => {
  if (!isObject(raw)) return null;
  const id = clean(raw.id || raw.familyId);
  const version = Number(raw.version);
  if (!id || !Number.isInteger(version) || version < 1) return null;
  return {
    id,
    version,
    constraints: isObject(raw.constraints) ? JSON.parse(JSON.stringify(raw.constraints)) : {},
    ...(clean(raw.tool) ? { tool: clean(raw.tool) } : {}),
  };
};

const normalizeBinding = (questionId, raw) => {
  if (!isObject(raw)) return null;
  const id = clean(raw.questionId || questionId);
  const section = clean(raw.section).toLowerCase();
  const questionFamily = normalizeFamilyReference(raw.questionFamily);
  const sourceSignature = clean(raw.sourceSignature);
  if (!id || id !== clean(questionId) || !RECOVERY_SECTIONS_WITH_CONTENT.includes(section) || !questionFamily || !sourceSignature) return null;
  return {
    questionId: id,
    section,
    questionFamily,
    sourceSignature,
    originalFingerprints: [...new Set(list(raw.originalFingerprints).map(clean).filter(Boolean))].slice(0, 8),
    certification: isObject(raw.certification) ? raw.certification : null,
    origin: Object.values(RECOVERY_BINDING_ORIGIN).includes(raw.origin) ? raw.origin : RECOVERY_BINDING_ORIGIN.UPGRADE,
    migrationId: clean(raw.migrationId) || null,
    certifiedAt: clean(raw.certifiedAt) || null,
  };
};

/** The stored record, validated; null when there is none. */
export const normalizeRecoveryContent = (raw) => {
  if (!isObject(raw)) return null;
  const bindings = {};
  if (isObject(raw.bindings)) {
    Object.entries(raw.bindings).forEach(([questionId, binding]) => {
      const normalized = normalizeBinding(questionId, binding);
      if (normalized) bindings[normalized.questionId] = normalized;
    });
  }
  return {
    schemaVersion: RECOVERY_CONTENT_SCHEMA_VERSION,
    version: Math.max(0, Math.round(Number(raw.version) || 0)),
    bindings,
    updatedAt: clean(raw.updatedAt) || null,
    history: list(raw.history).filter(isObject).slice(-RECOVERY_CONTENT_HISTORY_LIMIT),
  };
};

export const assignmentRecoveryContent = (assignment) => normalizeRecoveryContent(assignment?.[RECOVERY_CONTENT_FIELD]);

/*
 * The identity of a set of bindings: what they deal and grade. Timestamps,
 * certification numbers and history are not in it, so re-certifying the same
 * bindings (a retried upgrade, a re-run migration) changes nothing.
 */
export const recoveryBindingsHash = (bindings = {}) => `rb1:${hashHex(stableStringify(
  Object.keys(isObject(bindings) ? bindings : {}).sort().map((questionId) => {
    const binding = bindings[questionId];
    return {
      questionId,
      section: binding?.section || null,
      questionFamily: binding?.questionFamily || null,
      sourceSignature: binding?.sourceSignature || null,
      originalFingerprints: [...list(binding?.originalFingerprints)].sort(),
    };
  }),
))}`;

/* ---------------------------------------------------------------------------
 * The question Recovery works on.
 * ------------------------------------------------------------------------- */

// The original's identity — never its mathematics. With its grade value goes
// how its credit splits: a Matrix Lab decision weight (DOL 3's, the owner
// 2026-10-23), so a Recovery version scores the decision as the original did.
const IDENTITY_FIELDS = Object.freeze([
  'questionId', 'id', 'activityRole', 'sectionId', 'sectionTitle',
  'alignments', 'standard', 'teks', 'dok', 'difficultyBand',
  'questionWeight', 'questionWeightBasis', 'studentActions', 'decisionWeight',
]);

/**
 * The family slot Recovery generates from for a bound static question.
 * Carries the original's id (so slot keys and seats are the original's), its
 * section, standards, rigor, grade value and decision weight — and the
 * binding's family.
 */
export const recoverySourceQuestion = (question = {}, binding = {}, { contentVersion = null } = {}) => {
  const source = {};
  IDENTITY_FIELDS.forEach((field) => {
    if (question?.[field] !== undefined) source[field] = question[field];
  });
  const family = normalizeFamilyReference(binding?.questionFamily);
  return {
    ...source,
    type: family?.tool || clean(question?.type) || undefined,
    questionFamily: family ? { ...family } : null,
    recoverySource: {
      kind: 'recoveryContent',
      originalQuestionId: clean(question?.questionId || question?.id) || null,
      contentVersion: Number.isInteger(contentVersion) ? contentVersion : null,
    },
  };
};

/**
 * Where Recovery comes from for one question:
 *
 *   family   the question is a family slot: it recovers itself
 *   binding  a current binding in recoveryContent: `question` is the
 *            synthesized family slot
 *   stale    a binding exists but the question changed after it was certified
 *   none     a static question with no binding
 */
export const resolveRecoverySource = ({ assignment = null, question = null, content = undefined } = {}) => {
  if (isFamilyBackedQuestion(question)) {
    return { kind: RECOVERY_SOURCE_KIND.FAMILY, question, binding: null, originalFingerprints: [] };
  }
  const questionId = clean(question?.questionId || question?.id);
  const normalized = content === undefined ? assignmentRecoveryContent(assignment) : content;
  const binding = questionId ? normalized?.bindings?.[questionId] || null : null;
  if (!binding) return { kind: RECOVERY_SOURCE_KIND.NONE, question: null, binding: null, originalFingerprints: [] };
  if (binding.sourceSignature !== recoverySourceSignature(question)) {
    return { kind: RECOVERY_SOURCE_KIND.STALE, question: null, binding, originalFingerprints: [] };
  }
  return {
    kind: RECOVERY_SOURCE_KIND.BINDING,
    question: recoverySourceQuestion(question, binding, { contentVersion: normalized.version }),
    binding,
    originalFingerprints: binding.originalFingerprints,
  };
};

/* ---------------------------------------------------------------------------
 * Fresh: never a problem from this assignment.
 * ------------------------------------------------------------------------- */

/**
 * The fingerprint a family gives a static question it recognizes, or null.
 * Computed from the family's own derive and fingerprint, so it is exactly the
 * fingerprint an instance of the same mathematics would carry.
 */
export const recognizedFingerprint = (family, question, constraintOverrides = {}) => {
  if (!family || typeof family.recognize !== 'function' || isFamilyBackedQuestion(question)) return null;
  let recognized = null;
  try {
    recognized = family.recognize(question);
  } catch {
    recognized = null;
  }
  if (!recognized || !isObject(recognized.params)) return null;
  try {
    const { values } = resolveFamilyConstraints(family, { ...constraintOverrides, ...(recognized.constraints || {}) });
    const derived = { ...recognized.params, ...(family.derive(recognized.params, values) || {}) };
    const fingerprint = clean(family.fingerprint(derived, values));
    return fingerprint || null;
  } catch {
    return null;
  }
};

/**
 * Every fingerprint Recovery must not deal for these families: each static
 * question in the assignment a family recognizes. `families` are the
 * platform families the section's recovery draws on.
 */
export const recoveryExclusionFingerprints = ({ questions = [], families = [] } = {}) => {
  const seen = new Set();
  const unique = [];
  list(families).forEach((family) => {
    const key = `${family?.id}@${family?.version}`;
    if (!family || seen.has(key)) return;
    seen.add(key);
    unique.push(family);
  });
  const fingerprints = new Set();
  list(questions).forEach((question) => {
    if (!isObject(question) || isFamilyBackedQuestion(question)) return;
    unique.forEach((family) => {
      const fingerprint = recognizedFingerprint(family, question);
      if (fingerprint) fingerprints.add(fingerprint);
    });
  });
  return [...fingerprints];
};

/** The platform family a binding names, or null. */
export const bindingFamily = (binding) => getPlatformQuestionFamily(binding?.questionFamily?.id, binding?.questionFamily?.version);

/* ---------------------------------------------------------------------------
 * Changing the record — one pure transition, idempotent.
 * ------------------------------------------------------------------------- */

const bindingChanged = (left, right) => recoveryBindingsHash({ x: left }) !== recoveryBindingsHash({ x: right });

/**
 * The record with `bindings` applied (each entry a binding to add or replace,
 * or null to remove). Returns { content, changed, added, replaced, removed }.
 * Applying the same bindings twice changes nothing the second time: no new
 * version, no history row.
 */
export const applyRecoveryBindings = ({
  content: rawContent = null,
  bindings = {},
  at = null,
  actorUid = null,
  source = RECOVERY_BINDING_ORIGIN.UPGRADE,
  migrationId = null,
  planHash = null,
} = {}) => {
  const current = normalizeRecoveryContent(rawContent) || normalizeRecoveryContent({ version: 0, bindings: {} });
  const nextBindings = { ...current.bindings };
  const added = [];
  const replaced = [];
  const removed = [];
  Object.entries(isObject(bindings) ? bindings : {}).forEach(([questionId, binding]) => {
    const id = clean(questionId);
    if (!id) return;
    if (binding === null) {
      if (nextBindings[id]) {
        delete nextBindings[id];
        removed.push(id);
      }
      return;
    }
    const normalized = normalizeBinding(id, binding);
    if (!normalized) throw new Error(`Recovery binding for "${id}" is not a valid binding.`);
    if (!nextBindings[id]) added.push(id);
    else if (bindingChanged(nextBindings[id], normalized)) replaced.push(id);
    else return;
    nextBindings[id] = normalized;
  });
  const changed = added.length + replaced.length + removed.length > 0;
  if (!changed) return { content: current, changed: false, added, replaced, removed };
  const version = current.version + 1;
  const when = clean(at) || null;
  return {
    changed: true,
    added,
    replaced,
    removed,
    content: {
      schemaVersion: RECOVERY_CONTENT_SCHEMA_VERSION,
      version,
      bindings: nextBindings,
      updatedAt: when,
      history: [...current.history, {
        version,
        at: when,
        // A uid only: this document is readable by every student, so a
        // teacher's email belongs in the server-only audit event.
        by: clean(actorUid) || null,
        source,
        migrationId: clean(migrationId) || null,
        planHash: clean(planHash) || null,
        bindingsHash: recoveryBindingsHash(nextBindings),
        added,
        replaced,
        removed,
      }].slice(-RECOVERY_CONTENT_HISTORY_LIMIT),
    },
  };
};
