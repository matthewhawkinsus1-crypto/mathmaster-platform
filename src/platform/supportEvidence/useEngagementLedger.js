import { useEffect, useRef } from 'react';
import { epochMinuteOf, isEngagedNow } from '../../../functions/shared/supportEvidenceModel.mjs';
import { recordEngagementMinute } from './supportEvidenceStore.js';

/*
 * THE ACTIVE-ENGAGEMENT LEDGER, FROM THE STUDENT'S BROWSER.
 *
 * Every few seconds: if the student is engaged right now (page visible,
 * assignment open for credit, a real interaction within the idle cutoff —
 * `isEngagedNow`, the same definition for every student whatever their
 * accommodations), add the current minute to the server ledger, at most once
 * per minute. The rules only accept the minute the SERVER clock is in, so the
 * ledger is a server-timed record: a refresh, a second tab, a reconnect or a
 * replayed write adds nothing, and a tab left open without interaction stops
 * adding minutes after the idle cutoff.
 *
 * It deliberately knows nothing about the idle PROMPT. The "no idle timer"
 * accommodation hides the prompt; it must not stop the evidence clock (that
 * coupling is what produced "0 min" on scored work in the old report).
 *
 * `lastInteractionRef` is App.jsx's `lastActivityRef`, updated by the real
 * input listeners. A failed write is dropped silently: this is evidence
 * telemetry, never something that may interrupt a student's work.
 */
export const ENGAGEMENT_LEDGER_TICK_MS = 5000;

export default function useEngagementLedger({
  db,
  enabled = false,
  studentId = null,
  assignmentId = null,
  creditEligible = false,
  lastInteractionRef,
} = {}) {
  const lastMinuteRef = useRef({ assignmentId: null, minute: null });
  const creditEligibleRef = useRef(creditEligible);
  useEffect(() => { creditEligibleRef.current = creditEligible; }, [creditEligible]);

  useEffect(() => {
    if (!enabled || !db || !studentId || !assignmentId || typeof window === 'undefined') return undefined;
    const tick = () => {
      const nowMs = Date.now();
      const engaged = isEngagedNow({
        nowMs,
        lastInteractionMs: lastInteractionRef?.current,
        pageVisible: typeof document === 'undefined' ? true : document.visibilityState === 'visible',
        creditEligible: creditEligibleRef.current,
      });
      if (!engaged) return;
      const minute = epochMinuteOf(nowMs);
      const last = lastMinuteRef.current;
      if (last.assignmentId === assignmentId && last.minute === minute) return;
      lastMinuteRef.current = { assignmentId, minute };
      recordEngagementMinute({ db, studentId, assignmentId, nowMs }).catch(() => {
        // Let the next engaged tick in this minute try again.
        if (lastMinuteRef.current.minute === minute) lastMinuteRef.current = { assignmentId: null, minute: null };
      });
    };
    tick();
    const interval = window.setInterval(tick, ENGAGEMENT_LEDGER_TICK_MS);
    return () => window.clearInterval(interval);
  }, [enabled, db, studentId, assignmentId, lastInteractionRef]);
}
