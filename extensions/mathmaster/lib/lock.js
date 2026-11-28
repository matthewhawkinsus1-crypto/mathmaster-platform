// One TEAMS sync at a time across the extension: the timer (background.js)
// and the page's buttons (panel.js) take this lock in chrome.storage.session,
// which every part of the extension shares. The server's lease
// (teamsSyncStep) is the real guard against two runners; this keeps the
// extension from racing itself in the one TEAMS tab.

import { lockHeld } from './teams/schedule.js';

const KEY = 'teamsSyncLock';

export const readTeamsLock = async () => (await chrome.storage.session.get(KEY))[KEY] || null;

/** Run `work` holding the lock, or return { locked: lock } without running it. */
export const withTeamsLock = async (by, work) => {
  const held = await readTeamsLock();
  if (lockHeld(held, Date.now())) return { locked: held };
  const mine = { by, startedAt: Date.now(), id: crypto.randomUUID() };
  await chrome.storage.session.set({ [KEY]: mine });
  try {
    return { value: await work() };
  } finally {
    const now = await readTeamsLock();
    if (now?.id === mine.id) await chrome.storage.session.remove(KEY);
  }
};
