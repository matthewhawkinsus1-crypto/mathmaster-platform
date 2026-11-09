/*
 * WHAT THE LIVE CHALLENGE CONSOLE SAYS TO A SCREEN READER, AND WHEN.
 *
 * Two things change the teacher's console without moving focus or putting a
 * message where a screen reader meets it (teacher features walk, items 6 and
 * 8): the class memory card's "Use last settings" and "Use suggestion", which
 * fill in the whole setup at once, and the game's report, which arrives under
 * "After the game" a moment after the game ends (the console follows it,
 * challengeReportWatch.js). The console says each once, politely, in its one
 * live region (LiveChallengeTeacher.jsx); the screen itself is unchanged.
 */
export const CONSOLE_ANNOUNCEMENT = Object.freeze({
  lastSettings: 'Last time’s settings are filled in.',
  suggestion: 'The suggested settings are filled in.',
  reportReady: 'The report is ready, under After the game.',
});

/**
 * What the console says when a report is on it: the report's arrival, the
 * first time a finished room's report is there, once for each room —
 * `announcedRoomId` is the room it was last said for. Nothing otherwise.
 */
export const reportArrivalAnnouncement = ({ roomId = null, report = null, announcedRoomId = null } = {}) => (
  roomId && report && roomId !== announcedRoomId ? CONSOLE_ANNOUNCEMENT.reportReady : null
);
