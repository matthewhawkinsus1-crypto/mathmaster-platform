/*
 * A STUDENT'S 400s THAT THE END OF THE GAME EXPLAINS (lineGraphGame.mjs).
 *
 * The drivers fail a page on any console error. When the teacher ends a game,
 * a student's request still in flight (the round's coalesced batch of
 * attempts, its prefetch of the next items) is refused because the game is
 * over: the callable throws failed-precondition or not-found, the bridge
 * answers 400 and the browser logs "Failed to load resource: … 400". The page
 * handles it (the round stops taking answers); that is the rule working.
 *
 * So a 400 is explained only by a refusal the bridge gave this student for
 * the game's lifecycle that came back at or after the moment the teacher
 * pressed End Game, one refusal for one 400. Anything else stays: a 400 with
 * no such refusal, a refusal before the end, a refusal of another kind
 * (internal, aborted, invalid-argument), another student's refusal, and every
 * error that is not a 400. The refusals are returned as text, so a finding
 * can say which call was refused and when.
 */
export const LIFECYCLE_REFUSAL = /^(failed-precondition|not-found)$/;
const REFUSED_LOAD = /status of 400/;

export const explainRefusedLoads = ({ errors = [], calls = [], studentId, since = 0, endedAt = [] } = {}) => {
  const mine = calls.filter((call) => !call.ok && studentId && call.identity?.studentId === studentId && call.at >= since);
  const firstEnd = endedAt.find((at) => at >= since);
  const backAt = (call) => call.at + (Number(call.ms) || 0);
  let explainable = firstEnd === undefined
    ? 0
    : mine.filter((call) => backAt(call) >= firstEnd && LIFECYCLE_REFUSAL.test(String(call.code || ''))).length;
  const kept = errors.filter((text) => {
    if (explainable > 0 && REFUSED_LOAD.test(String(text))) {
      explainable -= 1;
      return false;
    }
    return true;
  });
  const refusals = mine.map((call) => `${call.name}: ${call.code}${firstEnd !== undefined ? ` (back ${backAt(call) - firstEnd} ms after End Game)` : ''}${call.message ? ` "${call.message}"` : ''}`);
  return { kept, explained: errors.length - kept.length, refusals };
};
