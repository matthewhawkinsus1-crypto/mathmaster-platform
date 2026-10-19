/*
 * The two words every surface that shows a student's own, later close adds
 * to it: the exit ticket's open notice (dolCloseCopy.js), the timer pill
 * (SectionTimeLeft) and Home's "Closes at …" line (WhatShouldIDoNow).
 * Without them a pill counting past the class's end looked like a mistake
 * (D7 "Not done"). They name no accommodation and no multiplier. A module
 * of its own so Home does not load the DOL close copy for them.
 */
export const EXTRA_TIME_WORDS = 'extra time';

/*
 * WHEN THE WORDS ARE SAID (review N7: the privacy of an accommodation).
 *
 * `extendedTime` comes only from this student's own accommodation, and the
 * pill sits in the navigation for the whole exit ticket, where a neighbour can
 * read it. So "extra time" is said only once the class's own window has ended
 * (`classEndsAt`), when it is the reason the student's timer is still running.
 * Before that the pill and Home read as they do for everyone, with the
 * student's own countdown and close. `extraTimeFrom` is that moment, or null.
 */
export const extraTimeFrom = ({ extendedTime = false, classEndsAt = null } = {}) => {
  if (extendedTime !== true || !classEndsAt) return null;
  const ms = classEndsAt instanceof Date ? classEndsAt.getTime() : new Date(classEndsAt).getTime();
  return Number.isFinite(ms) ? ms : null;
};

export const saysExtraTime = (from, nowValue = Date.now()) => from !== null && from !== undefined && Number(nowValue) >= Number(from);
