/*
 * A SAVED RECOVERY ANSWER FOLLOWS THE STUDENT, NOT THE CHROMEBOOK.
 *
 * A Recovery's assessment saves each answer and grades them all on Submit.
 * Those answers used to live only in the browser that saved them, so a
 * student who moved to another Chromebook (or whose site data was cleared)
 * submitted nothing and was graded 0 for work the screen had called "saved".
 *
 * Here they are backed up to the student's own server draft,
 * `studentWorkspaceDrafts/{studentId}__{assignmentId}-recovery` — the same
 * collection and document shape as an assignment's working drafts, so the
 * existing Security Rules (owner only, no grade-bearing field) govern it. It
 * is not a grade, not evidence and not a submission: Submit still sends the
 * answers to the server, which grades them exactly as before.
 *
 * WHAT IS STORED: only the student's answer. A response is rebuilt from an
 * allowlist — the kind, the question type, the typed value, each field's id
 * and value, or a registry tool's bounded work — and then refused outright if
 * any key in it (or in the tool work it carries) names answer-key, solution or
 * grading material. Never the question, its key, its solution or a verdict.
 * "Tries used up" travels as a bare flag so another device cannot hand out
 * fresh tries the original section would not.
 *
 * ORDER: per question, the newest answer wins.
 *   - From the same page, a higher `revision` wins, always: an older save from
 *     this page can never land over a newer one, however the network reorders
 *     them. Saves also go one at a time.
 *   - From different pages (another Chromebook, a reload), the later edit
 *     wins by `savedAt`. An edit is always stamped after any server copy this
 *     page has seen of that question, so a Chromebook with a slow clock cannot
 *     lose an edit made after it read the other device's answer.
 *
 * The browser's own copy (localStorage) is the offline fallback only: it is
 * merged with the server copy by the same rule, and anything it holds that
 * the server lacks is sent when the connection is back.
 */
import {
  FORBIDDEN_DRAFT_KEYS,
  WORKSPACE_DRAFT_SCHEMA_VERSION,
  workspaceDraftDocumentId,
} from '../../../functions/shared/workspaceDraftSchema.mjs';
import { NON_WORK_KEYS, normalizeToolResponse, readToolWork } from '../../../functions/shared/serverGrading/toolResponseContract.mjs';

export const RECOVERY_ANSWER_DRAFT_VERSION = 1;
export const RECOVERY_ANSWER_DRAFT_PURPOSE = 'sectionRecoveryAnswers';
// A Recovery has a handful of questions per opportunity; this keeps the
// newest answers if a student somehow accumulates far more.
export const MAX_RECOVERY_ANSWER_ENTRIES = 120;
export const MAX_RECOVERY_ANSWER_BYTES = 30_000;
export const MAX_RECOVERY_DOCUMENT_BYTES = 400_000;

/** The draft document's own assignment id: never the assignment's, so no assignment-draft reader sees it. */
export const recoveryDraftAssignmentId = (assignmentId) => `${String(assignmentId ?? '')}-recovery`;

export const recoveryDraftDocumentId = ({ studentId, assignmentId } = {}) => workspaceDraftDocumentId({
  studentId,
  assignmentId: recoveryDraftAssignmentId(assignmentId),
});

/** One question of one Recovery opportunity. */
export const recoveryAnswerKey = ({ section, opportunity = 1, itemId } = {}) => (
  `recovery-answer:${encodeURIComponent(String(section || ''))}:o${Math.max(1, Number(opportunity) || 1)}:${encodeURIComponent(String(itemId || ''))}`
);

export const parseRecoveryAnswerKey = (key) => {
  const match = /^recovery-answer:([^:]*):o(\d+):([^:]+)$/.exec(String(key || ''));
  if (!match) return null;
  try {
    return { section: decodeURIComponent(match[1]), opportunity: Number(match[2]), itemId: decodeURIComponent(match[3]) };
  } catch {
    return null;
  }
};

/* ------------------------------------------------------------------ guard */

// Keys that would make a draft a cheat sheet or a forged result: the server
// draft guard's list, the tool contract's non-work keys, and the grade-bearing
// fields the Security Rules refuse on a draft. A tool's own work keeps its
// student-written fields (an `explanation` the student typed is theirs).
export const RECOVERY_DRAFT_FORBIDDEN_KEYS = Object.freeze([...new Set([
  ...FORBIDDEN_DRAFT_KEYS,
  ...NON_WORK_KEYS,
  'correctAnswers', 'workedSolution', 'gradesByAssignment', 'evidence', 'evidenceEvent', 'mastery',
  'partialCredit', 'totalAttempts', 'attemptCount',
])]);
const FORBIDDEN = new Set(RECOVERY_DRAFT_FORBIDDEN_KEYS);

/** The path of the first forbidden key anywhere in `value`, or null. */
export const forbiddenRecoveryDraftPath = (value, path = '', depth = 0) => {
  if (depth > 12 || !value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = forbiddenRecoveryDraftPath(value[index], `${path}[${index}]`, depth + 1);
      if (found) return found;
    }
    return null;
  }
  for (const [key, nested] of Object.entries(value)) {
    const here = path ? `${path}.${key}` : key;
    if (FORBIDDEN.has(key)) return here;
    const found = forbiddenRecoveryDraftPath(nested, here, depth + 1);
    if (found) return found;
  }
  return null;
};

const text = (value, max) => String(value ?? '').slice(0, max);

/**
 * The student's answer, and nothing else, or null when it cannot be stored.
 *
 * Rebuilt field by field from the normalized response the runner submits
 * (normalizeCheckpointResponse), so anything a future caller adds to that
 * object is left behind rather than backed up.
 */
export const projectRecoveryAnswer = (response) => {
  if (!response || typeof response !== 'object' || Array.isArray(response)) return null;
  let projected;
  if (response.kind === 'tool') {
    const tool = normalizeToolResponse(response);
    if (!tool) return null;
    // The work is serialized inside `value`: check what it parses to as well.
    const work = readToolWork(tool);
    if (work.ok && forbiddenRecoveryDraftPath(work.work)) return null;
    projected = {
      kind: 'tool',
      schemaVersion: tool.schemaVersion,
      type: tool.type,
      toolId: tool.toolId,
      mode: tool.mode,
      contractVersion: tool.contractVersion,
      value: tool.value,
      fields: [],
      ...(tool.oversize ? { oversize: true } : {}),
    };
  } else if (response.kind === 'fields') {
    projected = {
      kind: 'fields',
      type: text(response.type, 80),
      value: '',
      fields: (Array.isArray(response.fields) ? response.fields : []).slice(0, 60).map((field, index) => ({
        id: text(field?.id ?? `part-${index + 1}`, 120),
        value: text(field?.value, 240),
        isComplete: field?.isComplete === true,
      })),
    };
  } else if (response.kind === 'scalar' || response.kind === 'opaque') {
    projected = { kind: response.kind, type: text(response.type, 80), value: text(response.value, 2000), fields: [] };
  } else {
    return null;
  }
  if (forbiddenRecoveryDraftPath(projected)) return null;
  return projected;
};

/**
 * What one stored entry says about one question: the answer (or null when
 * there is none), whether its tries are used up, and which pinned instance it
 * answers — an answer is only ever restored onto that same instance.
 */
export const buildRecoveryAnswerValue = ({ itemId, fingerprint = '', response = null, closed = false } = {}) => {
  const answer = closed ? null : projectRecoveryAnswer(response);
  if (!closed && response && !answer) return null;
  return {
    v: RECOVERY_ANSWER_DRAFT_VERSION,
    itemId: text(itemId, 200),
    fingerprint: text(fingerprint, 200),
    response: answer,
    closed: closed === true,
  };
};

/** A stored value read back, re-projected on the way in (a stored copy is never trusted). */
export const readRecoveryAnswerValue = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (value.closed === true) return buildRecoveryAnswerValue({ itemId: value.itemId, fingerprint: value.fingerprint, closed: true });
  if (value.response == null) return buildRecoveryAnswerValue({ itemId: value.itemId, fingerprint: value.fingerprint });
  return buildRecoveryAnswerValue({ itemId: value.itemId, fingerprint: value.fingerprint, response: value.response });
};

/* ------------------------------------------------------------------ order */

/**
 * Which of two copies of one question's answer is the newer.
 * Same page: the higher revision, always. Different pages: the later edit;
 * a tie goes to `incoming` (the same page re-sending).
 */
export const newerRecoveryEntry = (current, incoming) => {
  if (!current) return incoming;
  if (!incoming) return current;
  if (current.writer && current.writer === incoming.writer) {
    return (Number(incoming.revision) || 0) >= (Number(current.revision) || 0) ? incoming : current;
  }
  return (Number(incoming.savedAt) || 0) >= (Number(current.savedAt) || 0) ? incoming : current;
};

/** One entry as stored, or null when it may not be. */
export const storableRecoveryEntry = (entry) => {
  const key = String(entry?.key || '');
  if (!parseRecoveryAnswerKey(key)) return null;
  let value = entry?.value;
  if (value === undefined && typeof entry?.valueJson === 'string') {
    try { value = JSON.parse(entry.valueJson); } catch { return null; }
  }
  const clean = readRecoveryAnswerValue(value);
  if (!clean) return null;
  const valueJson = JSON.stringify(clean);
  if (valueJson.length > MAX_RECOVERY_ANSWER_BYTES) return null;
  return {
    key,
    valueJson,
    savedAt: Math.max(0, Number(entry?.savedAt) || 0),
    // The workspace-draft entry shape (workspaceDraftSchema.mjs); a Recovery
    // answer has no assignment question/variant index of its own.
    questionIndex: null,
    variantIndex: null,
    writer: text(entry?.writer, 80),
    revision: Math.max(0, Math.floor(Number(entry?.revision) || 0)),
  };
};

/** Decode a stored document's entries. */
export const readRecoveryDraftEntries = (document) => (Array.isArray(document?.entries) ? document.entries : [])
  .map(storableRecoveryEntry)
  .filter(Boolean)
  .map((entry) => ({ ...entry, value: JSON.parse(entry.valueJson) }));

export const buildRecoveryDraftPatch = ({ studentId, assignmentId, entries = [] } = {}) => ({
  schemaVersion: WORKSPACE_DRAFT_SCHEMA_VERSION,
  documentId: recoveryDraftDocumentId({ studentId, assignmentId }),
  studentId: String(studentId ?? ''),
  assignmentId: recoveryDraftAssignmentId(assignmentId),
  entries: (Array.isArray(entries) ? entries : []).map(storableRecoveryEntry).filter(Boolean),
});

/**
 * MERGE, NEVER REPLACE: what the document becomes when `patch` lands on
 * `existing`. Run inside a transaction, so two Chromebooks saving different
 * questions both survive. `updatedAt` is left to the caller (server time).
 */
export const mergeRecoveryDraftDocument = ({ existing = null, patch } = {}) => {
  const byKey = new Map();
  (Array.isArray(existing?.entries) ? existing.entries : []).forEach((entry) => {
    const stored = storableRecoveryEntry(entry);
    if (stored) byKey.set(stored.key, stored);
  });
  (patch?.entries || []).forEach((entry) => {
    const stored = storableRecoveryEntry(entry);
    if (stored) byKey.set(stored.key, newerRecoveryEntry(byKey.get(stored.key), stored));
  });
  const accepted = [];
  let total = 0;
  for (const entry of [...byKey.values()].sort((left, right) => right.savedAt - left.savedAt)) {
    if (accepted.length >= MAX_RECOVERY_ANSWER_ENTRIES || total + entry.valueJson.length > MAX_RECOVERY_DOCUMENT_BYTES) break;
    total += entry.valueJson.length;
    accepted.push(entry);
  }
  return {
    schemaVersion: WORKSPACE_DRAFT_SCHEMA_VERSION,
    documentId: patch.documentId,
    studentId: patch.studentId,
    assignmentId: patch.assignmentId,
    classId: existing?.classId ?? null,
    secure: false,
    purpose: RECOVERY_ANSWER_DRAFT_PURPOSE,
    entries: accepted.sort((left, right) => left.key.localeCompare(right.key)),
    resume: null,
    practice: null,
    practiceUpdatedAt: 0,
  };
};

/**
 * Merge a patch into what the server holds, in one transaction, and return
 * the stored copies of the keys it sent — which may be another device's newer
 * answer rather than this one. `read`/`write` are the transaction's, so the
 * client (recoveryAnswerDraftStore.js) and the emulator tests share this.
 */
export const applyRecoveryAnswerPatch = async ({ read, write }, patch) => {
  const existing = await read();
  const merged = mergeRecoveryDraftDocument({ existing, patch });
  write(merged);
  const sent = new Set(patch.entries.map((entry) => entry.key));
  return readRecoveryDraftEntries(merged).filter((entry) => sent.has(entry.key));
};

/* ------------------------------------------------------------------ sync */

export const RECOVERY_ANSWER_SAVED_WHERE = Object.freeze({
  ACCOUNT: 'account',
  SAVING: 'saving',
  DEVICE: 'device',
});

const RETRY_DELAYS_MS = [2000, 5000, 15000, 30000, 60000];

/**
 * The page's copy of its Recovery answers, saved one at a time.
 *
 * @param flush  async (patch) => stored entries for the keys it sent (the
 *               server's merged copy). The only network call; injected.
 * @param persist (snapshot) => void — writes this device's fallback copy.
 */
export const createRecoveryAnswerSync = ({
  studentId,
  assignmentId,
  writer,
  flush,
  persist = () => {},
  now = () => Date.now(),
  scheduler = null,
  onChange = () => {},
} = {}) => {
  const timers = scheduler || { set: (callback, delay) => setTimeout(callback, delay), clear: (handle) => clearTimeout(handle) };
  // key -> { key, value, savedAt, writer, revision, synced, origin }
  const entries = new Map();
  const serverSavedAt = new Map();
  let revision = 0;
  let lastStamp = 0;
  let inFlight = null;
  let failing = false;
  let failures = 0;
  let retryHandle = null;
  let stopped = false;
  const idleWaiters = new Set();

  const pendingKeys = () => [...entries.values()].filter((entry) => !entry.synced).map((entry) => entry.key);
  const changed = () => {
    persist(snapshot());
    onChange();
  };
  const settleWaiters = () => {
    if (inFlight || (pendingKeys().length && !failing)) return;
    idleWaiters.forEach((resolve) => resolve(pendingKeys().length === 0));
    idleWaiters.clear();
  };

  /** Lay a copy over this page's: the newer by the same rule the server uses. */
  const adopt = (incoming, { origin }) => {
    const stored = storableRecoveryEntry(incoming);
    if (!stored) return false;
    if (stored.savedAt > (serverSavedAt.get(stored.key) || 0) && origin === 'server') serverSavedAt.set(stored.key, stored.savedAt);
    const current = entries.get(stored.key);
    const winner = newerRecoveryEntry(current, stored);
    if (winner === current) {
      // The server already holds exactly what this page saved.
      if (origin === 'server' && current && !current.synced && current.writer === stored.writer && current.revision === stored.revision) {
        entries.set(stored.key, { ...current, synced: true });
        return true;
      }
      return false;
    }
    // `origin: 'server'` marks an answer this device did not have — typed on
    // another Chromebook — so the screen can show it (the question's own
    // inputs only know this device's drafts).
    const sameAnswer = Boolean(current) && JSON.stringify(current.value) === stored.valueJson;
    entries.set(stored.key, {
      key: stored.key,
      value: JSON.parse(stored.valueJson),
      savedAt: stored.savedAt,
      writer: stored.writer,
      revision: stored.revision,
      synced: origin === 'server' ? true : incoming.synced === true,
      origin: origin === 'server' && stored.writer !== writer && !sameAnswer ? 'server' : (current?.origin || 'device'),
    });
    return true;
  };

  function scheduleRetry() {
    if (stopped || retryHandle !== null) return;
    const delay = RETRY_DELAYS_MS[Math.min(failures - 1, RETRY_DELAYS_MS.length - 1)] || RETRY_DELAYS_MS[0];
    retryHandle = timers.set(() => { retryHandle = null; kick(); }, delay);
  }

  function kick() {
    if (stopped || inFlight || typeof flush !== 'function') return inFlight;
    const sending = [...entries.values()].filter((entry) => !entry.synced);
    if (!sending.length) { failing = false; settleWaiters(); return null; }
    if (retryHandle !== null) { timers.clear(retryHandle); retryHandle = null; }
    const patch = buildRecoveryDraftPatch({ studentId, assignmentId, entries: sending });
    let started;
    try {
      started = flush(patch);
    } catch (error) {
      started = Promise.reject(error);
    }
    inFlight = Promise.resolve(started)
      .then((stored) => {
        failing = false;
        failures = 0;
        const echoed = new Set();
        (Array.isArray(stored) ? stored : []).forEach((entry) => {
          echoed.add(entry?.key);
          adopt(entry, { origin: 'server' });
        });
        // A key the server did not echo is still acknowledged if this page's
        // copy is exactly the one that was sent.
        sending.forEach((sent) => {
          const current = entries.get(sent.key);
          if (echoed.has(sent.key) || !current) return;
          if (current.writer === sent.writer && current.revision === sent.revision) entries.set(sent.key, { ...current, synced: true });
        });
        changed();
      })
      .catch((error) => {
        failing = true;
        failures += 1;
        onChange();
        console.warn('MathMaster could not back up a Recovery answer yet; it is kept on this device:', error?.message || error);
        scheduleRetry();
      })
      .finally(() => {
        inFlight = null;
        // Anything saved while that one was on its way goes next — one at a time.
        if (!failing && pendingKeys().length) kick();
        else settleWaiters();
      });
    return inFlight;
  }

  function snapshot() {
    return Object.fromEntries([...entries.values()].map((entry) => [entry.key, { ...entry }]));
  }

  return {
    /** This device's fallback copy, from before this page. Not yet on the server unless it says so. */
    hydrate(local = {}) {
      Object.values(local || {}).forEach((entry) => {
        adopt({ ...entry, synced: entry?.synced === true }, { origin: 'device' });
        const savedAt = Number(entry?.savedAt) || 0;
        lastStamp = Math.max(lastStamp, savedAt);
        // A copy this device already had acknowledged was on the server then.
        if (entry?.synced === true && savedAt > (serverSavedAt.get(entry.key) || 0)) serverSavedAt.set(entry.key, savedAt);
      });
      onChange();
      if (pendingKeys().length) kick();
    },
    /** The server's copy has been read: take what is newer, send what it lacks. */
    noteServerCopy(stored = []) {
      let any = false;
      (Array.isArray(stored) ? stored : []).forEach((entry) => { any = adopt(entry, { origin: 'server' }) || any; });
      if (any) changed();
      else onChange();
      if (pendingKeys().length) kick();
    },
    /** The student saved (or cleared) one question's answer. */
    save(key, value) {
      if (stopped) return false;
      const clean = readRecoveryAnswerValue(value);
      if (!clean) return false;
      revision += 1;
      // After this page's last save and after any server copy it has seen.
      lastStamp = Math.max(now(), lastStamp + 1, (serverSavedAt.get(key) || 0) + 1);
      entries.set(key, { key, value: clean, savedAt: lastStamp, writer, revision, synced: false, origin: 'here' });
      changed();
      kick();
      return true;
    },
    /** Back online, or asked to try now. */
    retry() {
      if (retryHandle !== null) { timers.clear(retryHandle); retryHandle = null; }
      failing = false;
      return kick();
    },
    /** Resolves true once everything is on the server, false if a save is failing. */
    whenIdle() {
      if (!inFlight && (!pendingKeys().length || failing)) return Promise.resolve(pendingKeys().length === 0);
      return new Promise((resolve) => idleWaiters.add(resolve));
    },
    entry: (key) => (entries.has(key) ? { ...entries.get(key) } : null),
    savedWhere(key) {
      const entry = entries.get(key);
      if (!entry) return null;
      if (entry.synced) return RECOVERY_ANSWER_SAVED_WHERE.ACCOUNT;
      return failing ? RECOVERY_ANSWER_SAVED_WHERE.DEVICE : RECOVERY_ANSWER_SAVED_WHERE.SAVING;
    },
    snapshot,
    pendingKeys,
    stop() {
      stopped = true;
      if (retryHandle !== null) { timers.clear(retryHandle); retryHandle = null; }
      idleWaiters.forEach((resolve) => resolve(pendingKeys().length === 0));
      idleWaiters.clear();
    },
  };
};

/** A plain-language summary of the student's own saved answer, for the device that did not type it. */
export const describeSavedRecoveryAnswer = (response) => {
  if (!response) return '';
  if (response.kind === 'fields') {
    return (response.fields || []).map((field) => String(field?.value || '').trim()).filter(Boolean).join('; ').slice(0, 240);
  }
  if (response.kind === 'tool') return '';
  return String(response.value || '').trim().slice(0, 240);
};
