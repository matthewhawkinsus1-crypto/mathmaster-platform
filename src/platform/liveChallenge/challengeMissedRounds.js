/*
 * ROUNDS THAT CLOSED WHILE THIS DEVICE WAS AWAY.
 *
 * A phone that sleeps, a tab that reloads, a Wi-Fi drop: the game goes on, and
 * when the device comes back it lands on a later round. Without a word the
 * student sees "Round 5" and never learns that rounds 3 and 4 came and went —
 * or thinks their answer to round 3 is still waiting somewhere. So the screen
 * remembers, per room and per tab (sessionStorage, which a reload keeps), the
 * last round it saw and whether it saw that round close. When it next sees the
 * room at a later round, every round in between that closed WITHOUT this
 * student's answer — read once from each round's public result — gets one
 * plain notice.
 *
 * What is never "missed":
 *   - a round the device watched close (its results card already said
 *     "No answer this round");
 *   - a round before the student joined (a late joiner's earlier rounds were
 *     never theirs to play; they are not on the round's result at all, and
 *     `joinedAtRound` is a floor besides);
 *   - anything on a device that has no memory of the room yet (its first
 *     look is not a return).
 *
 * Pure except for the storage helpers, which take the storage as an argument
 * and swallow every failure (a private window can throw on access).
 */

// The most rounds one notice ever looks back over: a device asleep through a
// whole game reads at most this many round results to say so.
export const MISSED_ROUNDS_LOOKBACK = 20;

export const missedRoundsStorageKey = (roomId) => `mm-live-challenge-seen-${roomId}`;

const roundIndexOf = (value) => {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 0 ? numeric : null;
};

/** What this tab remembers about a room: { roundIndex, closed } or null. */
export const readLastSeenRound = (storage, roomId) => {
  if (!roomId || !storage) return null;
  try {
    const parsed = JSON.parse(storage.getItem(missedRoundsStorageKey(roomId)) || 'null');
    const roundIndex = roundIndexOf(parsed?.roundIndex);
    return roundIndex === null ? null : Object.freeze({ roundIndex, closed: parsed.closed === true });
  } catch {
    return null;
  }
};

export const writeLastSeenRound = (storage, roomId, seen) => {
  if (!roomId || !storage || !seen) return;
  try {
    storage.setItem(missedRoundsStorageKey(roomId), JSON.stringify({ roundIndex: seen.roundIndex, closed: seen.closed === true }));
  } catch { /* nothing to remember with; the game itself is unaffected */ }
};

/**
 * What a room snapshot shows of the game's rounds right now, or null when it
 * shows no round (a lobby, a cancelled game).
 */
export const seenRoundOf = (room = {}) => {
  if (!room || !['running', 'finished'].includes(room.status)) return null;
  const current = roundIndexOf(room.currentRound);
  if (current === null) return null;
  // A finished game has closed every round it played.
  return Object.freeze({ roundIndex: current, closed: room.status === 'finished' || room.roundState === 'closed' });
};

/**
 * The rounds that may have closed while this device was away: after what it
 * last saw (including that round, if it saw it open but not close) and up to
 * the round on screen now — that one only when it is already closed but the
 * student is not looking at its results (a finished game). A round open now is
 * still playable; a round closed now shows its own results card.
 *
 * @returns {number[]} round indices, ascending, at most MISSED_ROUNDS_LOOKBACK
 */
export const roundsClosedWhileAway = ({ lastSeen = null, now = null, joinedAtRound = null, finished = false } = {}) => {
  const seenIndex = roundIndexOf(lastSeen?.roundIndex);
  const nowIndex = roundIndexOf(now?.roundIndex);
  if (seenIndex === null || nowIndex === null) return [];
  const first = Math.max(lastSeen.closed ? seenIndex + 1 : seenIndex, roundIndexOf(joinedAtRound) ?? 0);
  // The round on screen counts only when the student will not see its own
  // results card: a game that finished while the device was away.
  const last = finished && now.closed ? nowIndex : nowIndex - 1;
  if (last < first) return [];
  const rounds = [];
  for (let round = Math.max(first, last - MISSED_ROUNDS_LOOKBACK + 1); round <= last; round += 1) rounds.push(round);
  return rounds;
};

/**
 * Of those rounds, the ones this student did not answer, from each round's
 * public result: their row says `participated: false`. A round with no row
 * for them (they had not joined yet) or no result at all is not missed.
 *
 * @param {Array<{ roundIndex:number, summary:object|null }>} results
 */
export const unansweredRounds = (results = [], playerKey = null) => {
  if (!playerKey) return [];
  return (Array.isArray(results) ? results : [])
    .filter(({ summary }) => {
      const row = Array.isArray(summary?.standings)
        ? summary.standings.find((standing) => String(standing?.playerKey) === String(playerKey))
        : null;
      return Boolean(row) && row.participated !== true;
    })
    .map(({ roundIndex }) => roundIndex)
    .sort((left, right) => left - right);
};

/** "Round 3" or, past the schedule, "Second Chance round 1". */
export const roundName = (roundIndex, scheduledRoundCount = 0) => {
  const scheduled = Math.max(0, Number(scheduledRoundCount) || 0);
  return scheduled > 0 && roundIndex >= scheduled
    ? `Second Chance round ${roundIndex - scheduled + 1}`
    : `Round ${roundIndex + 1}`;
};

const listNames = (names) => (names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

/**
 * The one sentence a student reads, or '' when nothing was missed. It says
 * what happened and what it means, and never blames: a dropped connection is
 * not the student's fault.
 */
export const missedRoundsNotice = (rounds = [], { scheduledRoundCount = 0 } = {}) => {
  const list = (Array.isArray(rounds) ? rounds : []).filter((round) => roundIndexOf(round) !== null);
  if (!list.length) return '';
  const names = list.map((round) => roundName(round, scheduledRoundCount));
  // Only the first plain round keeps its capital ("Round 3 and round 4…");
  // "Second Chance" is a name and keeps both.
  const spoken = listNames(names.map((name, index) => (index === 0 ? name : name.replace(/^Round /, 'round '))));
  return list.length === 1
    ? `${spoken} closed while you were away, so no answer was recorded for it.`
    : `${spoken} closed while you were away, so no answers were recorded for them.`;
};
