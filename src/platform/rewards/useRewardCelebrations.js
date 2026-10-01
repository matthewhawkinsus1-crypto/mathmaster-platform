import { useEffect, useRef, useState } from 'react';
import { celebrationMessage, newlyEarnedGrants } from './rewardWallet.js';

/*
 * A NEW REWARD IS ANNOUNCED ONCE.
 *
 * `grants` is the live inventory (null until its first snapshot). The first
 * snapshot is what the student already had; anything appearing after it — a
 * Live Challenge award landing seconds after the match, a pass from the
 * teacher — is announced once through `onCelebrate(message, grant)`. A reward
 * that arrived while the student was away is announced the first time they
 * come back, if it is recent. Announced ids are remembered per student in
 * this browser, so a refresh never repeats one; losing that memory (another
 * device) costs at most one extra, still-true toast.
 *
 * The previous snapshot lives in a ref, not state: two snapshots can land
 * between renders (a pass and a badge from one match are separate writes),
 * and a state copy would still hold the older ids and announce twice.
 *
 * Returns the ids announced this session, for "New" marks, and a way to
 * clear them once the student has looked.
 */
export function useRewardCelebrations({ studentId, grants, onCelebrate }) {
  const previousIds = useRef(null);
  const [newIds, setNewIds] = useState(() => new Set());
  const celebrate = useRef(onCelebrate);
  celebrate.current = onCelebrate;

  useEffect(() => {
    previousIds.current = null;
    setNewIds(new Set());
  }, [studentId]);

  useEffect(() => {
    if (!studentId || !Array.isArray(grants)) return;
    const storageKey = `mathmaster.rewards.announced.${studentId}`;
    let seen = new Set();
    try { seen = new Set(JSON.parse(window.localStorage.getItem(storageKey) || '[]')); } catch { seen = new Set(); }
    const fresh = newlyEarnedGrants({ previousIds: previousIds.current, grants, seenIds: seen, nowMs: Date.now() });
    previousIds.current = new Set(grants.map((grant) => grant.grantId));
    if (!fresh.length) return;
    fresh.forEach((grant) => { seen.add(grant.grantId); celebrate.current?.(celebrationMessage(grant), grant); });
    try { window.localStorage.setItem(storageKey, JSON.stringify([...seen].slice(-200))); } catch { /* private mode: may repeat once */ }
    setNewIds((current) => new Set([...current, ...fresh.map((grant) => grant.grantId)]));
  }, [grants, studentId]);

  return { newIds, clearNew: () => setNewIds(new Set()) };
}
