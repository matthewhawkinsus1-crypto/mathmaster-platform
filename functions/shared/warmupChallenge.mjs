/*
 * THE WARM-UP MAKES THE CONNECTION.
 *
 * A Live Challenge currently needs its own way in. The teacher creates a room,
 * invites land in liveChallengeInvites, and every student has to notice one and
 * join before the game can begin. Twenty-four of those, in the first two
 * minutes of a period, is what stops a five-minute activity being worth
 * running at all.
 *
 * Students opening an assignment are already signed in and already present. If
 * the Warm-Up section is the challenge, that step simply does not exist: the
 * assignment they were going to open anyway is the connection.
 *
 * WHY THE WARM-UP AND NOT ANY SECTION. It already has the one thing a
 * synchronised activity needs and the rest of the assignment does not — a
 * per-class-period window. getWarmupState opens it a set number of minutes
 * before the bell and closes it about ten minutes after, per class, and a
 * teacher can already move that. The challenge adopts that window rather than
 * inventing a second timetable that could disagree with it.
 *
 * THE THREE PROBLEMS, AND WHERE EACH IS SOLVED.
 *
 *   Self-paced against lockstep. The assignment advances a student when THEY
 *   submit; a challenge advances everyone when the TEACHER says so. This module
 *   decides only when a student should be handed to the challenge runtime and
 *   when they should be handed back — it does not try to make one runtime
 *   behave like the other.
 *
 *   Which score becomes the grade. Answered here, and firmly: the assignment
 *   records participation and accuracy, never challenge points. See
 *   warmupChallengeCredit.
 *
 *   Late arrivals. A student who walks in at minute eight joins at whatever
 *   round is live. They are scored on what they played and their participation
 *   is measured over the rounds they were present for — never over rounds that
 *   were finished before they arrived.
 */

export const WARMUP_CHALLENGE_ROUTE = Object.freeze({
  // Nothing configured, or the window is not open. The Warm-Up behaves exactly
  // as it always has.
  NONE: 'none',
  // Configured and due, but the teacher has not opened the room yet.
  WAITING_FOR_TEACHER: 'waitingForTeacher',
  // Hand the student to the challenge runtime.
  PLAY: 'play',
  // The game is over, or this student already played it. Continue into the rest
  // of the assignment.
  CONTINUE: 'continue',
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const int = (value) => Math.max(0, Math.round(Number(value) || 0));

/**
 * The challenge a teacher attached to an assignment's Warm-Up.
 *
 * Off unless explicitly switched on. A Warm-Up that quietly became a timed
 * competition because a default flipped would be a bad surprise in front of a
 * class.
 */
export const normalizeWarmupChallengeConfig = (assignment = null) => {
  const raw = assignment?.warmup?.liveChallenge || null;
  const enabled = raw?.enabled === true;
  return Object.freeze({
    enabled,
    standardCode: String(raw?.standardCode || 'mixed').trim() || 'mixed',
    roundCount: clamp(int(raw?.roundCount) || 5, 3, 20),
    // Shorter than a standalone challenge by default: this is a bell-ringer
    // inside a lesson, not the lesson.
    roundSeconds: clamp(int(raw?.roundSeconds) || 30, 15, 120),
  });
};

/**
 * Whether this student should be playing right now, and if not, why not.
 *
 * `roomStatus` is the live room's status when one exists. `alreadyPlayed` is
 * this student's own history, which is what stops a student who finished the
 * game being pulled back into it when they revisit the assignment.
 */
export const warmupChallengeRoute = ({
  assignment = null,
  warmupState = null,
  roomStatus = null,
  alreadyPlayed = false,
} = {}) => {
  const config = normalizeWarmupChallengeConfig(assignment);
  if (!config.enabled) return { route: WARMUP_CHALLENGE_ROUTE.NONE, config, reason: 'not_configured' };
  if (alreadyPlayed) return { route: WARMUP_CHALLENGE_ROUTE.CONTINUE, config, reason: 'already_played' };

  // The Warm-Up's own window is the authority. If the Warm-Up is not live for
  // this class right now, neither is the challenge — including when a teacher
  // has closed it early, which is a decision the challenge must not override.
  if (warmupState?.status !== 'active') {
    return { route: WARMUP_CHALLENGE_ROUTE.NONE, config, reason: `warmup_${warmupState?.status || 'unavailable'}` };
  }

  if (roomStatus === 'lobby' || roomStatus === 'running') {
    return { route: WARMUP_CHALLENGE_ROUTE.PLAY, config, reason: `room_${roomStatus}` };
  }
  if (roomStatus === 'finished' || roomStatus === 'cancelled') {
    return { route: WARMUP_CHALLENGE_ROUTE.CONTINUE, config, reason: `room_${roomStatus}` };
  }
  return { route: WARMUP_CHALLENGE_ROUTE.WAITING_FOR_TEACHER, config, reason: 'no_room_yet' };
};

/**
 * What the assignment records for a student who played.
 *
 * THE POINTS DO NOT COME WITH THEM. A challenge round is scored out of roughly
 * 1150, with speed and streak inside that number. Letting it reach an
 * assignment grade would put the clock in the gradebook and would mean the
 * student who thinks longest is marked down for it — the exact thing the
 * comeback and second-chance work was written against.
 *
 * What travels instead is what the student did: how many rounds they answered
 * out of the ones they could have, and how many of those were right. Both are
 * facts about the mathematics. Neither is a fact about their reaction time.
 *
 * `roundsAvailable` is the rounds THIS student could have played — a student
 * who arrived at round six is measured against five, not against ten.
 */
export const warmupChallengeCredit = ({
  roundsAnswered = 0,
  correctCount = 0,
  roundsAvailable = 0,
} = {}) => {
  const available = int(roundsAvailable);
  const answered = clamp(int(roundsAnswered), 0, available || int(roundsAnswered));
  const correct = clamp(int(correctCount), 0, answered);

  return {
    answered,
    correct,
    roundsAvailable: available,
    // Null rather than zero when there was nothing to answer: a student present
    // for a game that never ran has not scored 0%.
    participationPercent: available > 0 ? Math.round((answered / available) * 100) : null,
    accuracyPercent: answered > 0 ? Math.round((correct / answered) * 100) : null,
    // Stated explicitly so a reader of a stored record can see the rule rather
    // than having to know it.
    scoringNote: 'Warm-Up challenge credit is participation and accuracy. Challenge points are not part of the assignment grade.',
  };
};

/**
 * How many rounds a student could have played, given when they arrived.
 *
 * A late arrival is not a partial participant in a game they were absent for;
 * they are a full participant in the part they were present for.
 */
export const roundsAvailableToStudent = ({ totalRounds = 0, joinedAtRound = 0 } = {}) => {
  const total = int(totalRounds);
  const joined = clamp(int(joinedAtRound), 0, total);
  return Math.max(0, total - joined);
};

export default warmupChallengeRoute;
