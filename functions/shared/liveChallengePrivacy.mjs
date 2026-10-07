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
