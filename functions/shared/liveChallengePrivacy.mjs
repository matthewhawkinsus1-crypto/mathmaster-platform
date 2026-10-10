/*
 * NOBODY IS EVER PUBLICLY LAST.
 *
 * Aliases protect identity; they do not protect a student from watching their
 * game name sit at the bottom of a projected board, round after round. That is
 * where perseverance is won or lost. So, by default:
 *
 *   - the PROJECTOR (and anything else the whole class sees) shows the top few
 *     only — PUBLIC_TOP_COUNT rows — and how many more are playing;
 *   - a student sees THEIR OWN place on their own screen, and only after a
 *     round has closed: nothing under the question while they think;
 *   - a final card leads with the place only for a podium finish; any other
 *     finish leads with what the student did, and the place is a quiet line
 *     only they can see.
 *
 * A teacher may opt the projector into FULL standings for a class that wants
 * them (`standingsDisplay: 'full'`, chosen at create, stored on the room). The
 * student-side rules do not change with it.
 */

export const STANDINGS_DISPLAY = Object.freeze({
  TOP_FEW: 'topFew',
  FULL: 'full',
});

// "The top few": a podium and two more.
export const PUBLIC_TOP_COUNT = 5;

// A place a final card may lead with.
export const PODIUM_PLACES = 3;

/** A teacher's choice, read defensively: anything but 'full' is the default. */
export const normalizeStandingsDisplay = (value) => (
  String(value ?? '').trim() === STANDINGS_DISPLAY.FULL ? STANDINGS_DISPLAY.FULL : STANDINGS_DISPLAY.TOP_FEW
);

/** Whether the room's teacher opted the projector into full standings. */
export const roomShowsFullStandings = (room = {}) => normalizeStandingsDisplay(room?.standingsDisplay) === STANDINGS_DISPLAY.FULL;

/**
 * How many standings rows a class-wide screen may show: the room's choice,
 * bounded by the rows the screen has space for.
 */
export const publicStandingsLimit = (room = {}, spaceForRows = PUBLIC_TOP_COUNT) => {
  const space = Math.max(1, Math.floor(Number(spaceForRows) || PUBLIC_TOP_COUNT));
  return roomShowsFullStandings(room) ? space : Math.min(space, PUBLIC_TOP_COUNT);
};

/** Whether a final place is one a card may lead with (a podium finish). */
export const finalPlaceIsHeadline = (rank) => {
  const place = Number(rank);
  return Number.isInteger(place) && place >= 1 && place <= PODIUM_PLACES;
};

/*
 * THE ONE PUBLIC RULE.
 *
 * Every list the whole class sees — the live board during a round, a round's
 * results table, the standings after it, the final podium and the rows under
 * it — and the classmates' rows on a student's own result and final cards go
 * through ONE rule, publicStandingsRows:
 *
 *   1. never a row whose rank ties the LAST rank of the whole class (not just
 *      the rows in hand: a student's snapshot carries only the top, so the
 *      caller passes the class's last rank). A round where 2 of 24 were right
 *      ranks 22 players tied for last: none of them is listed. A player with no
 *      rank (no answer this round) is never listed either;
 *   2. never exactly ONE player unshown when anyone is shown: the lobby listed
 *      every alias, so the one missing name would be the last one. The last
 *      shown group of tied players steps off with them (hide two or more, or
 *      show nobody);
 *   3. at most the top few (PUBLIC_TOP_COUNT), within the space the screen has.
 *
 * So two players project no ranking, three project 1st only, and a class all
 * tied projects none. A student still always sees their OWN row on their own
 * device (`selfKey`); it never counts as unshown. A teacher who opted the room
 * into full standings (`standingsDisplay: 'full'`) is exempt: as many rows as
 * the screen has room for.
 */
export const PROJECTOR_MORE_NOTE = 'everyone sees their own place on their device';

const rankOf = (row) => {
  const rank = Number(row?.rank);
  return Number.isInteger(rank) && rank >= 1 ? rank : Infinity;
};

/** The class's last rank: the worst rank any of `rows` holds; null when none is ranked. */
export const lastRankOf = (rows = []) => {
  const ranks = (Array.isArray(rows) ? rows : []).map(rankOf).filter(Number.isFinite);
  return ranks.length ? Math.max(...ranks) : null;
};

/**
 * The rank where a list's last group starts. A row with no rank (no answer
 * this round) is in it. When the rows say what each player earned this round
 * (`roundPoints`, a round's table), the ranked rows that earned nothing join
 * it, and a class that all earned something stays above it, so a round in
 * which every answer tied is still projected. Without points, the last
 * ranked group is assumed to have earned no more than a non-answer.
 */
const lastGroupRank = (rows) => {
  const worst = lastRankOf(rows);
  if (worst === null) return 0;
  const ranked = rows.filter((row) => Number.isFinite(rankOf(row)));
  if (ranked.length === rows.length) return worst;
  if (!ranked.every((row) => Number.isFinite(Number(row?.roundPoints)) && row.roundPoints !== null)) return worst;
  const earnedNothing = ranked.filter((row) => Number(row.roundPoints) <= 0).map(rankOf);
  return earnedNothing.length ? Math.min(...earnedNothing) : worst + 1;
};

/**
 * One public list. `rows` are in standing order (the engine's). Returns the
 * classmates' rows it may show (in order; a student's own row stays where it
 * falls), the viewer's own row when it falls outside them, how many players
 * are left unshown, and the line under the list.
 *
 *   lastRank      the class's last rank, when `rows` are not every player
 *   totalCount    how many are playing, when `rows` are not every player
 *   spaceForRows  how many rows the screen has room for
 *   selfKey       the viewer's own player key (a student's device)
 */
export const publicStandingsRows = (room = {}, rows = [], {
  lastRank = null,
  totalCount = null,
  spaceForRows = PUBLIC_TOP_COUNT,
  selfKey = null,
} = {}) => {
  const all = (Array.isArray(rows) ? rows : []).filter(Boolean);
  const isSelf = (row) => Boolean(selfKey) && row?.playerKey !== null && row?.playerKey !== undefined && String(row.playerKey) === String(selfKey);
  const total = Math.max(all.length, Number.isInteger(Number(totalCount)) && totalCount !== null ? Number(totalCount) : 0);
  const limit = publicStandingsLimit(room, spaceForRows);
  let shown;
  let lastGroup = null;
  if (roomShowsFullStandings(room)) {
    shown = all.slice(0, limit);
  } else {
    // The last rank is the class's, whichever is worse: the caller's (the
    // whole class) or the rows in hand. A row with no rank (no answer this
    // round) sits with the last group: it earned no more than they did.
    const given = Number(lastRank);
    const last = Math.max(lastGroupRank(all), Number.isInteger(given) && given >= 1 ? given : 0);
    lastGroup = last;
    // Rule 1, then rule 3: the standing order is by rank, so the rows above
    // the last rank are a prefix.
    shown = [];
    for (const row of all) {
      if (shown.length >= limit || rankOf(row) >= last) break;
      shown.push(row);
    }
    // Rule 2: one unshown player would be named by elimination.
    const visibleSelf = () => (all.some(isSelf) ? 1 : 0) - (shown.some(isSelf) ? 1 : 0);
    const unshown = () => total - shown.length - visibleSelf();
    while (unshown() === 1 && shown.some((row) => !isSelf(row))) {
      const lastShown = [...shown].reverse().find((row) => !isSelf(row));
      const rank = rankOf(lastShown);
      shown = shown.filter((row) => isSelf(row) || rankOf(row) !== rank);
    }
  }
  const self = all.find((row) => isSelf(row) && !shown.includes(row)) || null;
  const hiddenCount = Math.max(0, total - shown.length - (self ? 1 : 0));
  return Object.freeze({
    rows: Object.freeze(shown),
    self,
    hiddenCount,
    totalCount: total,
    // Where the class's last group starts (null with full standings): what a
    // screen holding only these rows passes back as `lastRank`.
    lastRank: lastGroup,
    moreText: projectorMoreText(room, hiddenCount, shown.length + (self ? 1 : 0)),
  });
};


/**
 * "and 3 more players · everyone sees their own place on their device" — or
 * '' when nobody is left off. A list that shows nobody says how many play.
 */
export const projectorMoreText = (room = {}, hiddenCount = 0, shownCount = 1) => {
  const count = Math.max(0, Math.floor(Number(hiddenCount) || 0));
  if (!count) return '';
  const players = `${count} ${count === 1 ? 'player' : 'players'}`;
  const more = Number(shownCount) > 0 ? `and ${count} more ${count === 1 ? 'player' : 'players'}` : players;
  return roomShowsFullStandings(room) ? more : `${more} · ${PROJECTOR_MORE_NOTE}`;
};

/*
 * WHAT A CLASSMATE CAN READ (the server's side of the rule above).
 *
 * The screens draw every class-wide list through publicStandingsRows, but a
 * screen is not the only reader: any student in the room can read the room's
 * public documents straight from Firestore. So the server writes into those
 * documents (standings/current, rounds/{n}) only the rows the rule would show
 * the whole class — always under the default rule, whatever the teacher chose
 * for the projector — and how many are playing. Nobody's rank outside those
 * rows is in any document a classmate can read: each student's own place is
 * in their own summary (playerSummaries/{studentId}), and the teacher's full
 * lists stay where only the teacher reads them.
 *
 * `rows` are every player, in standing order. Returns the rows to publish,
 * how many play, and `lastRank` — where the class's last group starts — which
 * a screen passes back to publicStandingsRows with the viewer's own row.
 */
export const classStandingsRows = (rows = [], { totalCount = null } = {}) => {
  const board = publicStandingsRows({}, rows, { spaceForRows: PUBLIC_TOP_COUNT, totalCount });
  return Object.freeze({
    rows: board.rows,
    totalCount: board.totalCount,
    hiddenCount: board.hiddenCount,
    lastRank: board.lastRank,
  });
};

const integerOr = (value, fallback) => {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : fallback;
};
const nonNegativeInt = (value) => Math.max(0, Math.round(Number(value) || 0));

/*
 * A ROUND'S TABLE, IN THE ORDER A SCREEN SHOWS IT. A round's place means
 * something only where the scoring reads it (Grand Prix; a question-set
 * round). A per-response strategy banks points answer by answer, so its table
 * lists what each player EARNED, most first, equal points sharing a place
 * (`byPoints`); otherwise the engine's round placement stands. Players who did
 * not answer have no place and sort last. The server ranks the table this way
 * before it decides which rows the class may see, so the place on a student's
 * own card and the places on the table are one ranking.
 *
 * `standings` are a round result's anonymous rows (playerKey, alias, rank,
 * position, tied, participated, roundPoints, matchPointsAwarded, completed,
 * accuracyPercent).
 */
export const roundTableRows = (standings = [], { byPoints = false } = {}) => {
  const rows = (Array.isArray(standings) ? standings : []).filter(Boolean).map((row, index) => {
    const participated = row.participated === true;
    return {
      playerKey: row.playerKey ? String(row.playerKey) : null,
      alias: String(row.alias || 'Player'),
      participated,
      rank: participated ? integerOr(row.rank, null) : null,
      tied: participated && row.tied === true,
      position: integerOr(row.position, index),
      roundPoints: nonNegativeInt(row.roundPoints),
      matchPointsAwarded: nonNegativeInt(row.matchPointsAwarded),
      completed: row.completed === undefined || row.completed === null ? null : nonNegativeInt(row.completed),
      accuracyPercent: Number.isFinite(Number(row.accuracyPercent)) && row.accuracyPercent !== null ? Math.round(Number(row.accuracyPercent)) : null,
    };
  });
  if (byPoints) {
    // Most points first; equal points share a place (competition ranking);
    // the engine's own order breaks the display tie.
    const earners = rows.filter((row) => row.participated)
      .sort((left, right) => right.roundPoints - left.roundPoints || (left.rank ?? 0) - (right.rank ?? 0) || left.position - right.position);
    earners.forEach((row, index) => {
      const first = earners.findIndex((other) => other.roundPoints === row.roundPoints);
      row.rank = first + 1;
      row.tied = earners.filter((other) => other.roundPoints === row.roundPoints).length > 1;
      row.position = index;
    });
    rows.filter((row) => !row.participated).forEach((row, index) => { row.position = earners.length + index; });
  }
  return rows.sort((left, right) => (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER) || left.position - right.position);
};
