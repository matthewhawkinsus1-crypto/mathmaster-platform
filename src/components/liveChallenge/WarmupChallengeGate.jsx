import LiveChallengeStudent from './LiveChallengeStudent.jsx';
import { WARMUP_CHALLENGE_ROUTE } from '../../platform/liveChallenge/warmupChallengeLink.js';

/*
 * WHAT THE WARM-UP SHOWS WHEN IT IS A CHALLENGE.
 *
 * The routing decision arrives from resolveWarmupChallenge. WAITING is a focus
 * overlay on purpose: Teacher Choice cannot tell a student to wait while the
 * standard Warm-Up remains clickable underneath, then pull them out halfway
 * through when the teacher selects the game.
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
          invite={{ ...(invite || {}), roomId: decision.roomId }}
          studentProfile={studentProfile}
          onExit={onExitToAssignment}
          exitLabel="Back to Warm-Up"
        />
      </section>
    );
  }

  if (route === WARMUP_CHALLENGE_ROUTE.WAITING_FOR_TEACHER) {
    const teacherChoicePending = decision?.reason === 'teacher_choice_pending';
    return (
      <section
        aria-label="Warm-Up Live Challenge"
        aria-live="polite"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10000,
          display: 'grid',
          placeItems: 'center',
          padding: 20,
          background: 'rgba(10, 18, 34, .86)',
          backdropFilter: 'blur(5px)',
        }}
      >
        <div style={{
          width: 'min(620px, 100%)',
          padding: '28px 30px',
          borderRadius: 18,
          background: '#e8f0fe',
          border: '3px solid #1a73e8',
          color: '#174ea6',
          textAlign: 'left',
          boxShadow: '0 24px 80px rgba(0,0,0,.35)',
        }}>
          <strong style={{ display: 'block', fontSize: 24, marginBottom: 10 }}>
            {teacherChoicePending ? '⚡ Your teacher is choosing today’s Warm-Up' : '⚡ Today’s Warm-Up is a Live Challenge'}
          </strong>
          {teacherChoicePending ? (
            <span style={{ fontSize: 17, lineHeight: 1.55 }}>
              Stay here for a moment. Your teacher will choose either the Live Challenge or the standard Warm-Up for the class. You do not need to start either one yet.
            </span>
          ) : (
            <span style={{ fontSize: 17, lineHeight: 1.55 }}>
              Stay on this screen. The game starts as soon as your teacher opens it. You do not need to join anything or type a code. If your teacher switches back to the standard Warm-Up, this screen will release automatically.
            </span>
          )}
        </div>
      </section>
    );
  }

  return null;
}
