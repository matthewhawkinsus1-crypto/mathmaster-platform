import { LIVE_FLAGS } from '../../livePresence.js';
import { INSTRUCTIONAL_BAND } from '../profile/studentLearningProfile.js';

/*
 * WHAT TO SAY WHEN YOU GET TO THE DESK.
 *
 * A teacher crossing a room has about four seconds between reading a tile and
 * arriving at a student. The tile already tells them WHO. This tells them what
 * kind of help is likely to be the right one, by combining two things no single
 * screen held together before: what is happening right now (three wrong
 * attempts on question four) and what has been true all term (procedures
 * secure, reasoning shaky).
 *
 * THE HARD RULE, AND IT IS THE ONE THIS FILE EXISTS TO HONOUR:
 *
 *   "Adapt instruction and improve access without doing the mathematics for
 *    the student."
 *
 * So nothing here ever contains mathematics. No hint, no next step, no
 * restatement of the problem, no arithmetic. Every suggestion is a move the
 * TEACHER makes — a question to ask, a representation to reach for, a decision
 * about whether to intervene at all. If a suggestion could be read aloud and
 * shorten the student's thinking, it does not belong here.
 *
 * The second rule is restraint, for the same reason it governs the alert queue:
 * a coaching line on every tile is a coaching line a teacher stops reading. A
 * student who is working steadily gets nothing, because "keep going" is not
 * advice.
 */

export const MOVE = Object.freeze({
  NONE: null,
  CHECK_IN: 'checkIn',
  ASK_TO_EXPLAIN: 'askToExplain',
  CHANGE_REPRESENTATION: 'changeRepresentation',
  NAME_THE_GOAL: 'nameTheGoal',
  RESTART_ACCESS: 'restartAccess',
  PROTECT_STRETCH: 'protectStretch',
});

const has = (row, flag) => Array.isArray(row?.flags) && row.flags.includes(flag);

/**
 * One suggested move for one student, or null.
 *
 * Returns `{ move, headline, why }`. `why` names the two signals it combined,
 * so a teacher can disagree with the suggestion on the evidence rather than on
 * faith — the same reason nothing in this platform says "AI recommended".
 */
export const suggestMove = ({ row = null, profile = null } = {}) => {
  if (!row) return null;

  // Not a teaching problem. A student who is not in the room does not need a
  // different question; they need to be here.
  if (has(row, LIVE_FLAGS.OFFLINE)) return null;

  if (has(row, LIVE_FLAGS.NOT_STARTED)) {
    return {
      move: MOVE.RESTART_ACCESS,
      headline: 'Has not started',
      why: 'No activity recorded for this assignment. Check the device and the sign-in before assuming this is about the mathematics.',
    };
  }

  const established = Boolean(profile?.baseline?.established);
  const dok1 = profile?.dokProfile?.['1'];
  const dok2 = profile?.dokProfile?.['2'];
  const dok3 = profile?.dokProfile?.['3'];
  const proceduresSecure = Boolean(dok1?.confident && dok1.accuracy >= 0.8);
  const reasoningWeak = [dok2, dok3].some((bucket) => bucket?.confident && bucket.accuracy < 0.5);

  if (has(row, LIVE_FLAGS.STUCK)) {
    // The distinction that matters most at the desk. A student who can compute
    // and is stuck is almost never stuck on the computation, and handing them
    // an easier version teaches them that being stuck means waiting.
    if (established && proceduresSecure && reasoningWeak) {
      return {
        move: MOVE.ASK_TO_EXPLAIN,
        headline: 'Ask what the question is asking, before any numbers',
        why: 'Repeated wrong attempts on this question, and this student is secure on procedure but not yet on reasoning. The blockage is probably interpretation, not arithmetic.',
      };
    }
    return {
      move: MOVE.CHANGE_REPRESENTATION,
      headline: 'Offer a different representation, not a smaller number',
      why: 'Repeated wrong attempts on the same question. A table, a sketch or a spoken restatement gives them somewhere new to start without shortening the thinking.',
    };
  }

  if (has(row, LIVE_FLAGS.STRUGGLING)) {
    if (established && profile.instructionalBand === INSTRUCTIONAL_BAND.ABOVE) {
      // A strong student having a bad ten minutes is not a strong student who
      // needs an easier assignment.
      return {
        move: MOVE.PROTECT_STRETCH,
        headline: 'Check in before adjusting anything',
        why: 'Accuracy is below the class today, but this student holds above the course band across the term. One rough session is not a reason to lower their work.',
      };
    }
    return {
      move: MOVE.NAME_THE_GOAL,
      headline: 'Name what a finished answer looks like',
      why: 'Accuracy well below the class on this assignment. Students in this state often know how to work but not what they are working towards.',
    };
  }

  if (has(row, LIVE_FLAGS.IDLE)) {
    return {
      move: MOVE.CHECK_IN,
      headline: 'Quiet for a while — a look, not an intervention',
      why: 'No recorded activity recently. That is as likely to be a device, a bathroom pass or thinking time as it is to be difficulty.',
    };
  }

  if (has(row, LIVE_FLAGS.BEHIND_PACE)) {
    return {
      move: MOVE.CHECK_IN,
      headline: 'Behind the class on questions, not necessarily on understanding',
      why: 'Fewer questions completed than the class. Worth one question to find out which it is before deciding anything.',
    };
  }

  // Working steadily. "Keep going" is not advice, and a coaching line on every
  // tile is a coaching line a teacher stops reading.
  return null;
};

/**
 * Suggestions for a whole grid, keyed by student id, with nulls dropped.
 *
 * Returning a sparse map rather than one entry per student is deliberate: a
 * caller cannot accidentally render an empty coaching line under a student who
 * is doing fine.
 */
export const suggestMovesForClass = ({ rows = [], profilesByStudentId = {} } = {}) => {
  const out = {};
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const move = suggestMove({ row, profile: profilesByStudentId[row?.id] || null });
    if (move) out[row.id] = move;
  });
  return out;
};

export default suggestMove;
