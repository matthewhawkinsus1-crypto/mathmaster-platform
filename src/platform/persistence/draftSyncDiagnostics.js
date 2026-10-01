/*
 * WHEN THE SERVER BACKUP REFUSES A DRAFT, SOMEONE HAS TO HEAR ABOUT IT.
 *
 * `sanitizeWorkspaceDraftValue` is a security guard and it is right to fail
 * closed: one `isCorrect` anywhere in a workspace record, or a record over the
 * size cap, and the whole record stays on the device. What was wrong was that
 * it failed SILENTLY. PR #397's board persisted `cardChecks: { isCorrect }`,
 * the first Check ended server backup of every card on the board, and nothing
 * anywhere said so — the student's work looked saved, the tests were green, and
 * the only symptom was a Chromebook swap that came back empty.
 *
 * This module is the signal. It never relaxes the guard and it never tells a
 * student anything: the local draft is still durable, and a student who cannot
 * act on "forbidden-key at cardChecks.a.isCorrect" should not be shown it.
 *
 *   DEVELOPMENT / TEST   `console.error` once per key + reason + path, naming
 *                        the path, the reason and the tool draft key, the
 *                        moment the draft is WRITTEN — so a browser journey or
 *                        a developer clicking through a new tool sees it at
 *                        the keystroke that caused it, whether or not a
 *                        signed-in sync is running.
 *   PRODUCTION           `console.warn` once per key + reason from the sync
 *                        itself, and a bounded in-memory list a support
 *                        session can read. No UI.
 */
import {
  explainWorkspaceDraftRejection,
  isSyncableDraftKey,
} from '../../../functions/shared/workspaceDraftSchema.mjs';
import { projectDraftForServer } from './serverDraftProjection.js';

const MAX_REMEMBERED = 40;
const remembered = new Map();

const developmentBuild = () => {
  try {
    // Vite replaces import.meta.env at build time; node tests have no env and
    // count as development so the contract tests exercise the same path.
    const env = import.meta.env;
    if (!env) return true;
    return Boolean(env.DEV) || env.MODE === 'test';
  } catch {
    return true;
  }
};

const describe = (entry) => {
  const where = entry.path ? ` at \`${entry.path}\`` : '';
  const size = entry.reason === 'too-large' && entry.bytes
    ? ` (${entry.bytes} bytes; the cap is ${entry.limit}; largest fields: ${(entry.largest || []).map((field) => `${field.path}=${field.bytes}`).join(', ')})`
    : '';
  return `[MathMaster draft sync] The server backup will NOT store "${entry.key}": ${entry.reason}${where}${size}. `
    + 'The student\'s work is still saved on this device, but it will not reach another device. '
    + 'Never store verdicts, grades, answer keys, histories or caches in tool state — see workspaceDraftSchema.mjs.';
};

/**
 * Record one refused draft. Returns the entry, or null when it was already
 * reported (the same field refused on every keystroke is one problem, not
 * three hundred console lines).
 */
export const reportDraftSyncRejection = ({ key, explanation, source = 'sync' } = {}) => {
  if (!key || !explanation || explanation.ok) return null;
  const id = `${key}|${explanation.reason}|${explanation.path || ''}`;
  if (remembered.has(id)) {
    remembered.get(id).count += 1;
    return null;
  }
  const entry = {
    key: String(key),
    reason: explanation.reason,
    path: explanation.path || null,
    bytes: explanation.bytes ?? null,
    limit: explanation.limit ?? null,
    largest: explanation.largest || [],
    source,
    count: 1,
    at: Date.now(),
  };
  remembered.set(id, entry);
  while (remembered.size > MAX_REMEMBERED) remembered.delete(remembered.keys().next().value);
  if (typeof console !== 'undefined') {
    if (developmentBuild()) console.error(describe(entry));
    else console.warn(describe(entry));
  }
  return entry;
};

/**
 * The write-time check, development only.
 *
 * Called from `writeQuestionDraft` for every syncable key. In production it
 * returns immediately — the sync reports what it refuses — so a student's
 * keystroke pays nothing for it.
 *
 * It judges what the server would be SENT, which is the draft or its server
 * projection (serverDraftProjection.js) — the same value the sync checks.
 */
export const auditDraftWrite = (key, value) => {
  if (!developmentBuild()) return null;
  if (!key || !isSyncableDraftKey(key)) return null;
  const explanation = explainWorkspaceDraftRejection(projectDraftForServer(key, value));
  if (explanation.ok) return null;
  return reportDraftSyncRejection({ key, explanation, source: 'write' });
};

/** Everything refused this session, oldest first. Read-only copies. */
export const listDraftSyncRejections = () => [...remembered.values()].map((entry) => ({ ...entry, largest: [...entry.largest] }));

export const clearDraftSyncRejections = () => remembered.clear();

export default reportDraftSyncRejection;
