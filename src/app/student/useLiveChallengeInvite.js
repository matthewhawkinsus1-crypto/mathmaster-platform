/*
 * A LIVE CHALLENGE THE STUDENT IS INVITED TO, WATCHED WHILE THEY ARE SIGNED IN.
 *
 * Moved verbatim from App.jsx, which calls this where the code was and passes
 * what it reads by name. Its effects keep their place among App's effects
 * (scripts/app-hook-ledger.mjs).
 */
import { useEffect, useState } from 'react';
import { watchLiveChallengeInvite } from '../../platform/liveChallenge/liveChallengeService.js';

export function useLiveChallengeInvite({ user }) {
  const [liveChallengeInvite, setLiveChallengeInvite] = useState(null);

  // A Live Challenge invitation is one tiny per-student pointer. Listening at
  // the App level means the student can be alerted while sitting on the
  // dashboard OR while working inside an assignment; the heavy game player is
  // still lazy-loaded only when they actually open it.
  useEffect(() => {
    if (user?.role !== 'student' || !user?.id) {
      setLiveChallengeInvite(null);
      return undefined;
    }
    return watchLiveChallengeInvite(
      user.id,
      (invite) => setLiveChallengeInvite(invite),
      (error) => console.error('Could not watch Live Challenge invitation:', error),
    );
  }, [user?.role, user?.id]);
  return { liveChallengeInvite };
}
