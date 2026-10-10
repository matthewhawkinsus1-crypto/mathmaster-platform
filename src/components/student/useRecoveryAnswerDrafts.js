/*
 * THE RECOVERY RUNNER'S SAVED ANSWERS, ON THE SERVER AND ON THIS DEVICE.
 *
 * The rules are recoveryAnswerDrafts.js's; this hook is the page's side:
 * this device's fallback copy in localStorage, the server copy read when the
 * Recovery opens, when the connection comes back, when the student returns to
 * the tab, and once more just before Submit — so Submit sends every answer
 * the student saved on any Chromebook.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  RECOVERY_ANSWER_SAVED_WHERE,
  buildRecoveryAnswerValue,
  createRecoveryAnswerSync,
  projectRecoveryAnswer,
  recoveryAnswerKey,
} from '../../platform/recovery/recoveryAnswerDrafts.js';
import { readRecoveryAnswerDraft, writeRecoveryAnswerDraft } from '../../platform/recovery/recoveryAnswerDraftStore.js';

// How long Submit waits for a save already on its way before it goes anyway
// with what this device has (the server grades whatever arrives).
const SUBMIT_WAIT_MS = 8000;

const readLocal = (key) => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || 'null');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};
const writeLocal = (key, value) => {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* the server copy is the one that travels */ }
};
const removeLocal = (key) => {
  try { window.localStorage.removeItem(key); } catch { /* see writeLocal */ }
};

const newWriterId = () => {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* fall through */ }
  return `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
};

/**
 * @param localKey   this device's fallback copy (localStorage)
 * @param legacyKey  where builds before this one kept the answers on this
 *                   device only; read once and backed up, then retired
 */
export default function useRecoveryAnswerDrafts({ studentId, assignmentId, section, opportunity, items, localKey, legacyKey }) {
  const [version, setVersion] = useState(0);
  const [serverRead, setServerRead] = useState(false);
  const syncRef = useRef(null);
  const writer = useMemo(() => newWriterId(), []);
  const itemsById = useMemo(() => new Map((items || []).map((item) => [item.itemId, item])), [items]);
  const keyFor = useCallback((itemId) => recoveryAnswerKey({ section, opportunity, itemId }), [section, opportunity]);

  useEffect(() => {
    if (!studentId || !assignmentId) return undefined;
    let cancelled = false;
    const sync = createRecoveryAnswerSync({
      studentId,
      assignmentId,
      writer,
      flush: (patch) => writeRecoveryAnswerDraft(patch),
      persist: (snapshot) => writeLocal(localKey, snapshot),
      onChange: () => { if (!cancelled) setVersion((value) => value + 1); },
    });
    syncRef.current = sync;

    // This device's copy first, so the screen never waits on the network.
    const local = readLocal(localKey);
    // A build before this one saved answers here only. They are this
    // device's, never yet on the server: dated as old as possible, so any
    // answer the server holds for the same question wins over them.
    const legacy = legacyKey ? readLocal(legacyKey) : {};
    Object.entries(legacy).forEach(([itemId, response]) => {
      const key = recoveryAnswerKey({ section, opportunity, itemId });
      if (local[key]) return;
      const item = (items || []).find((candidate) => candidate.itemId === itemId);
      const value = buildRecoveryAnswerValue({ itemId, fingerprint: item?.pin?.fingerprint || '', response });
      if (value) local[key] = { key, value, savedAt: 1, writer: 'legacy-device', revision: 1, synced: false };
    });
    sync.hydrate(local);
    if (legacyKey) removeLocal(legacyKey);

    // This sync's own read in flight. Never shared with a previous run of
    // this effect (React StrictMode's remount, a changed key): that run's
    // read resolves into its cancelled sync, so sharing it would leave this
    // one without the server copy until the next online/visibility event.
    let reading = null;
    const read = () => {
      if (cancelled) return Promise.resolve(false);
      if (reading) return reading;
      reading = readRecoveryAnswerDraft({ studentId, assignmentId })
        .then((stored) => {
          if (cancelled) return false;
          sync.noteServerCopy(stored);
          setServerRead(true);
          return true;
        })
        .catch((error) => {
          console.warn('MathMaster could not read saved Recovery answers from the server yet:', error?.message || error);
          return false;
        })
        .finally(() => { reading = null; });
      return reading;
    };
    sync.read = read;
    read();

    const online = () => { sync.retry(); read(); };
    const visible = () => { if (!document.hidden) { sync.retry(); read(); } };
    window.addEventListener('online', online);
    document.addEventListener('visibilitychange', visible);
    return () => {
      cancelled = true;
      window.removeEventListener('online', online);
      document.removeEventListener('visibilitychange', visible);
      sync.stop();
      if (syncRef.current === sync) syncRef.current = null;
    };
  // `items` is read only to date legacy answers when the Recovery opens.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, assignmentId, section, opportunity, localKey, legacyKey, writer]);

  // What this page shows and submits, per plan item. An answer saved for a
  // different instance of the question (a replaced or re-pinned item) is
  // never laid onto this one.
  const computeView = useCallback(() => {
    const sync = syncRef.current;
    const responses = {};
    const closed = {};
    const savedWhere = {};
    const fromAccount = {};
    if (!sync) return { responses, closed, savedWhere, fromAccount };
    itemsById.forEach((item, itemId) => {
      const entry = sync.entry(keyFor(itemId));
      if (!entry?.value) return;
      const fingerprint = item?.pin?.fingerprint || '';
      if (entry.value.fingerprint && fingerprint && entry.value.fingerprint !== fingerprint) return;
      if (entry.value.closed) closed[itemId] = true;
      if (entry.value.response) {
        responses[itemId] = entry.value.response;
        savedWhere[itemId] = sync.savedWhere(entry.key);
        if (entry.origin === 'server') fromAccount[itemId] = entry.value.response;
      }
    });
    return { responses, closed, savedWhere, fromAccount };
  }, [itemsById, keyFor]);
  // `version` is what changes when the sync does.
  const view = useMemo(() => computeView(), [computeView, version]);

  const saveAnswer = useCallback((item, response) => {
    const value = buildRecoveryAnswerValue({ itemId: item.itemId, fingerprint: item?.pin?.fingerprint || '', response });
    if (!value || !projectRecoveryAnswer(response)) return false;
    return syncRef.current?.save(keyFor(item.itemId), value) || false;
  }, [keyFor]);

  // Every try is used: the question is over on every device, with no answer.
  const closeItem = useCallback((item) => {
    const value = buildRecoveryAnswerValue({ itemId: item.itemId, fingerprint: item?.pin?.fingerprint || '', closed: true });
    return syncRef.current?.save(keyFor(item.itemId), value) || false;
  }, [keyFor]);

  /**
   * Before Submit: finish the save on its way, then take the server's newest.
   * Returns what to submit — read from the sync itself, not from this
   * render's state, which predates the read — and whether the server copy
   * was actually read. When it was not (filtered network, still offline,
   * too slow), answers saved on another device may be missing, and the
   * caller must say so before submitting.
   */
  const prepareSubmit = useCallback(async () => {
    const sync = syncRef.current;
    if (!sync) return { ...computeView(), checkedAccount: false };
    sync.retry();
    const timeout = () => new Promise((resolve) => { setTimeout(() => resolve(false), SUBMIT_WAIT_MS); });
    await Promise.race([sync.whenIdle(), timeout()]);
    const checkedAccount = await Promise.race([sync.read?.() || Promise.resolve(false), timeout()]);
    return { ...computeView(), checkedAccount: checkedAccount === true };
  }, [computeView]);

  /** Submitted: this device's fallback copy is history. */
  const clearLocal = useCallback(() => { removeLocal(localKey); }, [localKey]);

  return { ...view, serverRead, saveAnswer, closeItem, prepareSubmit, clearLocal, SAVED_WHERE: RECOVERY_ANSWER_SAVED_WHERE };
}
