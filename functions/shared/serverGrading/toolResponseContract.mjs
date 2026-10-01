/*
 * THE RAW RESPONSE OF A RICH MATH TOOL, AS IT CROSSES THE DURABLE BOUNDARY.
 *
 * A registry tool (Graphing, Systems Workspace, Representation Bridge, ...)
 * hands the platform its student's work as a plain object when the student
 * presses Check. Before this contract that object reached the server as
 * `JSON.stringify(work).slice(0, 2000)` inside an `opaque` response — truncated,
 * unversioned and unreadable — so the server could only keep the browser's
 * verdict.
 *
 * A TOOL RESPONSE IS STUDENT WORK, AND ONLY STUDENT WORK.
 *
 *   - never an answer key: the keys below that name answer material are
 *     removed at every depth, on the device AND again on the server;
 *   - never a verdict: `isCorrect`, `score`, `checks` and friends are removed
 *     the same way, so the only correctness that exists is the one the shared
 *     grader computes;
 *   - bounded: depth, array length, key count, string length and the total
 *     serialized size are all capped, so a tampered client cannot use a
 *     response to bloat a grade document;
 *   - deterministic: the work is serialized with sorted keys, so the same work
 *     always produces the same bytes (and the same `lastResponseKey`) no matter
 *     which path delivered it;
 *   - Firestore-safe: the work travels as ONE canonical JSON string. Firestore
 *     cannot hold an array directly inside an array, and tool work is full of
 *     coordinate pairs; a string sidesteps that without a second encoding.
 *   - versioned: `schemaVersion` is this envelope's shape, `contractVersion`
 *     is the tool's own work shape (owned by its grader module).
 *
 * Pure: no React, no DOM, no Firestore, no clock. The browser, the Cloud
 * Functions and the tests import this same file.
 */
import { stableStringify } from '../idUtils.mjs';

export const TOOL_RESPONSE_KIND = 'tool';
export const TOOL_RESPONSE_SCHEMA_VERSION = 1;

export const TOOL_RESPONSE_LIMITS = Object.freeze({
  // The whole serialized work. A Multiple Representations board with every
  // card, a 12-row table and three constructed graphs is ~4 KB.
  maxJsonLength: 24_000,
  maxDepth: 8,
  maxArrayLength: 300,
  maxObjectKeys: 120,
  maxStringLength: 1_000,
  maxKeyLength: 80,
});

/*
 * Keys that are never student work.
 *
 * Verdicts a browser could assert about itself, and answer-key material a
 * question carries. They are dropped wherever they appear — a grader reads
 * named fields of the work, so dropping one can only remove a claim, never
 * change a verdict.
 */
export const NON_WORK_KEYS = Object.freeze([
  // verdicts
  'isCorrect', 'correct', 'score', 'checks', 'grade', 'verdict', 'partialCredit',
  'partialCreditPercent', 'passed', 'feedback', 'graded',
  // answer-key and secure material
  'answerKey', 'acceptedAnswers', 'accepted', 'answerFields', 'expected',
  'expectedAnswer', 'solution', 'seed', 'secureQuestion', 'gradingContract',
  'testCycle', 'testCycleGrades', 'privateGrading',
]);

const NON_WORK_KEY_SET = new Set(NON_WORK_KEYS);
// Never a property a parsed object should be allowed to carry.
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const text = (value) => String(value ?? '');
const isPlainObject = (value) => Boolean(value)
  && typeof value === 'object'
  && !Array.isArray(value)
  && !(value instanceof Date);

/**
 * One student-work value, bounded and made JSON-exact.
 *
 * Non-finite numbers are kept as the strings "Infinity" / "-Infinity", which
 * `Number()` reads back exactly: an unbounded interval is real student work and
 * JSON would otherwise turn it into `null`.
 */
const boundValue = (value, depth, stats) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return Object.is(value, -0) ? 0 : value;
    if (Number.isNaN(value)) return null;
    return value > 0 ? 'Infinity' : '-Infinity';
  }
  if (typeof value === 'string') {
    if (value.length > TOOL_RESPONSE_LIMITS.maxStringLength) stats.truncated = true;
    return value.slice(0, TOOL_RESPONSE_LIMITS.maxStringLength);
  }
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  if (typeof value !== 'object') return null; // functions, symbols, bigint
  if (depth >= TOOL_RESPONSE_LIMITS.maxDepth) {
    stats.truncated = true;
    return null;
  }
  if (Array.isArray(value)) {
    if (value.length > TOOL_RESPONSE_LIMITS.maxArrayLength) stats.truncated = true;
    return value.slice(0, TOOL_RESPONSE_LIMITS.maxArrayLength).map((entry) => boundValue(entry, depth + 1, stats));
  }
  if (!isPlainObject(value)) return null;
  const entries = [];
  for (const key of Object.keys(value)) {
    if (UNSAFE_KEYS.has(key)) {
      stats.dropped.push(key);
      continue;
    }
    if (NON_WORK_KEY_SET.has(key)) {
      stats.dropped.push(key);
      continue;
    }
    if (key.length > TOOL_RESPONSE_LIMITS.maxKeyLength) {
      stats.truncated = true;
      continue;
    }
    if (entries.length >= TOOL_RESPONSE_LIMITS.maxObjectKeys) {
      stats.truncated = true;
      break;
    }
    if (value[key] === undefined || typeof value[key] === 'function') continue;
    entries.push([key, boundValue(value[key], depth + 1, stats)]);
  }
  return Object.fromEntries(entries);
};

/**
 * Bound arbitrary tool work into the response contract's value space.
 *
 * Returns the bounded work plus what was removed, so a test (or a developer
 * diagnostic) can prove a tool never relied on a dropped key.
 */
export const boundToolWork = (work) => {
  const stats = { dropped: [], truncated: false };
  const bounded = boundValue(work, 0, stats);
  return { work: bounded, dropped: [...new Set(stats.dropped)], truncated: stats.truncated };
};

/** The canonical serialized form of some work — what crosses the boundary. */
export const canonicalToolWorkJson = (work) => stableStringify(boundToolWork(work).work);

const modeOf = (question, mode) => text(mode || question?.mode).trim().slice(0, 80) || null;

/**
 * Build the normalized response a device sends for a registry-tool question.
 *
 * `value` holds the canonical work JSON so every existing consumer of a
 * normalized response (`responseIsBlank`, the receipt's `lastResponseKey`,
 * the Response Inspector) keeps working unchanged. An oversize response is
 * marked rather than truncated: half a board is not the student's work, and
 * grading it would be grading something they did not submit.
 */
export const buildToolResponse = ({ question = null, toolId, mode = null, contractVersion = 1, work } = {}) => {
  const json = canonicalToolWorkJson(work ?? null);
  const oversize = json.length > TOOL_RESPONSE_LIMITS.maxJsonLength;
  return {
    kind: TOOL_RESPONSE_KIND,
    schemaVersion: TOOL_RESPONSE_SCHEMA_VERSION,
    type: text(question?.type).slice(0, 80),
    toolId: text(toolId).slice(0, 80),
    mode: modeOf(question, mode),
    contractVersion: Math.max(1, Math.floor(Number(contractVersion) || 1)),
    value: oversize ? '' : json,
    fields: [],
    ...(oversize ? { oversize: true } : {}),
  };
};

/** True for a normalized response produced by `buildToolResponse`. */
export const isToolResponse = (response) => Boolean(response)
  && typeof response === 'object'
  && response.kind === TOOL_RESPONSE_KIND;

/**
 * Normalize a tool response that arrived from anywhere — an envelope, a
 * checkpoint document, an old IndexedDB row — into the stored shape.
 *
 * Re-bounds the work: a server never trusts that the device ran the builder.
 * Returns null for anything that is not a well-formed tool response.
 */
export const normalizeToolResponse = (raw) => {
  if (!isToolResponse(raw)) return null;
  const work = readToolWork(raw);
  const json = work.ok ? stableStringify(work.work) : '';
  return {
    kind: TOOL_RESPONSE_KIND,
    schemaVersion: TOOL_RESPONSE_SCHEMA_VERSION,
    type: text(raw.type).slice(0, 80),
    toolId: text(raw.toolId).slice(0, 80),
    mode: text(raw.mode).trim().slice(0, 80) || null,
    contractVersion: Math.max(1, Math.floor(Number(raw.contractVersion) || 1)),
    value: json.length <= TOOL_RESPONSE_LIMITS.maxJsonLength ? json : '',
    fields: [],
    ...(raw.oversize === true || json.length > TOOL_RESPONSE_LIMITS.maxJsonLength ? { oversize: true } : {}),
  };
};

/**
 * Read the student's work out of a tool response.
 *
 *   { ok: true, work }
 *   { ok: false, reason }   not-a-tool-response | oversize-response |
 *                           empty-response | unreadable-response
 */
export const readToolWork = (response) => {
  if (!isToolResponse(response)) return { ok: false, reason: 'not-a-tool-response', work: null };
  if (response.oversize === true) return { ok: false, reason: 'oversize-response', work: null };
  const value = text(response.value);
  if (!value.trim()) return { ok: false, reason: 'empty-response', work: null };
  if (value.length > TOOL_RESPONSE_LIMITS.maxJsonLength) return { ok: false, reason: 'oversize-response', work: null };
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    return { ok: false, reason: 'unreadable-response', work: null };
  }
  const { work } = boundToolWork(parsed);
  if (work === null || work === undefined) return { ok: false, reason: 'empty-response', work: null };
  return { ok: true, reason: null, work };
};
