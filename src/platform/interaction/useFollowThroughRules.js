/*
 * THE FOLLOW-THROUGH RULES FOR ONE QUESTION ON A SCREEN (SP-3).
 *
 * A question with a followThrough part loads functions/shared/followThrough.mjs
 * when it mounts and gets `{ rules, pending }`: the rules to hand to the
 * grader and the labels, and whether they are still on their way (a host
 * holds the question's submit until then, so the screen and the server always
 * mark alike). A question with none gets `{ rules: null, pending: false }` and
 * loads nothing.
 */
import { useEffect, useState } from 'react';
import { hasFollowThrough, loadFollowThrough, loadedFollowThrough } from '../../../functions/shared/followThroughNames.mjs';

export const useFollowThroughRules = (fields) => {
  const needed = hasFollowThrough(fields);
  const [rules, setRules] = useState(() => (needed ? loadedFollowThrough() : null));
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!needed || rules) return undefined;
    let live = true;
    loadFollowThrough(fields)?.then(
      (loaded) => { if (live) setRules(loaded); },
      // Not loaded (a dropped connection): tried again shortly; until then the
      // question stays held, never marked without the rules.
      () => { if (live) setTimeout(() => { if (live) setAttempt((count) => count + 1); }, 3000); },
    );
    return () => { live = false; };
  }, [needed, rules, attempt, fields]);
  return needed ? { rules, pending: !rules } : { rules: null, pending: false };
};
