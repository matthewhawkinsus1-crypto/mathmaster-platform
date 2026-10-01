import { useCallback, useEffect, useState } from 'react';
import { generateRuntimeUUID } from '../../utils/idUtils.js';

/*
 * ONE TAB WORKS ON A QUESTION AT A TIME.
 *
 * Drafts are local-first: every keystroke is written to this browser's storage
 * under the question's key, and the last write wins. With the same question
 * open in two tabs — a second Classroom link click, a duplicated tab, a tab
 * left open from earlier — the older tab still holds the work as it was when
 * it loaded. Measured: the student types "12345" in the newer tab, presses ONE
 * key in the forgotten one, and the saved answer is "19". Closing that stale
 * tab also flushed its answer as a deadline checkpoint.
 *
 * So the tab that opened a question most recently owns it, and every other tab
 * with the same question open pauses it: no typing, no draft, no checkpoint.
 * A paused tab offers "Continue here", which takes the question back and
 * reloads the latest saved work before the student touches it.
 *
 * Tabs talk over a BroadcastChannel; where there is none, over `storage`
 * events, which every browser that runs MathMaster fires across tabs.
 */

const CHANNEL_NAME = 'mathmaster-active-work';
const STORAGE_KEY = 'mm:active-work-claim';

export const ACTIVE_WORK_TAB_ID = (() => {
  try {
    return generateRuntimeUUID();
  } catch {
    return `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
})();

const listeners = new Set();
let channel = null;
let storageListening = false;

const deliver = (message) => {
  if (!message || message.tabId === ACTIVE_WORK_TAB_ID || typeof message.scope !== 'string') return;
  listeners.forEach((listener) => listener(message));
};

const ensureTransport = () => {
  if (typeof window === 'undefined') return;
  if (!channel && typeof window.BroadcastChannel === 'function') {
    try {
      channel = new window.BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (event) => deliver(event?.data);
    } catch {
      channel = null;
    }
  }
  if (!channel && !storageListening) {
    storageListening = true;
    window.addEventListener('storage', (event) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try { deliver(JSON.parse(event.newValue)); } catch { /* not ours */ }
    });
  }
};

/** Tell every other tab that this one now works on `scope`. */
export const claimActiveWork = (scope) => {
  if (!scope || typeof window === 'undefined') return;
  ensureTransport();
  const message = { type: 'claim', scope, tabId: ACTIVE_WORK_TAB_ID, at: Date.now() };
  if (channel) {
    try { channel.postMessage(message); return; } catch { /* fall through */ }
  }
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(message)); } catch { /* storage blocked */ }
};

export const subscribeToActiveWork = (listener) => {
  ensureTransport();
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/**
 * Whether another tab has since opened this question (`paused`), and the
 * action that takes it back. `scope` null turns the guard off (previews, a
 * teacher, a host with no draft key).
 */
export const useActiveWorkTab = (scope) => {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    setPaused(false);
    if (!scope) return undefined;
    // Opening the question claims it: the newest tab loaded the newest work.
    // (A tab never hears its own claim, so the order does not matter.)
    claimActiveWork(scope);
    return subscribeToActiveWork((message) => {
      if (message.type === 'claim' && message.scope === scope) setPaused(true);
    });
  }, [scope]);

  const continueHere = useCallback(() => {
    if (!scope) return;
    claimActiveWork(scope);
    setPaused(false);
  }, [scope]);

  return { paused: Boolean(scope) && paused, continueHere };
};
