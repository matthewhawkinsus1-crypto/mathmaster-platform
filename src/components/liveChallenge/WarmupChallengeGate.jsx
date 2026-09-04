import LiveChallengeStudent from './LiveChallengeStudent.jsx';
import { WARMUP_CHALLENGE_ROUTE } from '../../platform/liveChallenge/warmupChallengeLink.js';

/*
 * WHAT THE WARM-UP SHOWS WHEN IT IS A CHALLENGE.
 *
 * This renders one of three things and decides none of them — the decision
 * arrives already made, from resolveWarmupChallenge. Keeping the choice out of
 * the component is what lets the rules that protect a student mid-lesson be
 * tested without a browser.
 *
 * Returning null is the important case: it means "the Warm-Up behaves exactly
 * as it always has", and it is what every unconfigured assignment, every closed
 * window, and every unrecognised state resolves to.
 */
export default function WarmupChallengeGate({
  decision = null,
  invite = null,
  studentProfile = {},
  onExitToAssignment,
}) {
  const route = decision?.route;

  if (route === WARMUP_CHALLENGE_ROUTE.PLAY && decision?.roomId) {
    return (
      <section aria-label="Warm-Up Live Challenge" style={{ marginBottom: 16 }}>
        <LiveChallengeStudent
          // The invite is re-pointed at the room the decision approved rather
          // than passed through, so a stale or unrelated invite cannot reach
          // the game runtime even if one is handed in.
          invite={{ ...(invite || {}), roomId: decision.roomId }}
          studentProfile={studentProfile}
          onExit={onExitToAssignment}
          exitLabel="Back to Warm-Up"
        />
      </section>
    );
  }

  if (route === WARMUP_CHALLENGE_ROUTE.WAITING_FOR_TEACHER) {
    return (
      <section
        aria-label="Warm-Up Live Challenge"
        aria-live="polite"
        style={{
          marginBottom: 16,
          padding: '20px 22px',
          borderRadius: 13,
          background: '#e8f0fe',
          border: '3px solid #1a73e8',
          color: '#174ea6',
          textAlign: 'left',
        }}
      >
        <strong style={{ display: 'block', fontSize: 20 }}>⚡ Today&rsquo;s Warm-Up is a Live Challenge</strong>
        <span>
          Stay on this screen. It starts as soon as your teacher opens it — you do not need to join
          anything or type a code.
        </span>
      </section>
    );
  }

  return null;
}
