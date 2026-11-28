// The TEAMS sync on a timer (owner, 2026-11-28): every 30 minutes from 6 am
// to 10 pm Central, in the background, whenever Chrome is open with TEAMS
// signed in and MathMaster open. Pure: background.js gives it the clock, the
// MathMaster bridge and the TEAMS adapter.
//
// The server publishes every linked class's grades every 30 minutes over the
// same hours (functions/lib/teamsSyncScheduledTargets.js), so a timed run
// never publishes: it applies what MathMaster last published. It runs five
// minutes after each publish (:05 and :35).
//
// A run is skipped, and says why, when the timer is off, outside the hours,
// another run holds the lock, MathMaster or TEAMS is not open, or the teacher
// is looking at the TEAMS tab (a run would navigate it under them; the next
// one tries again).

import { runTeamsSync } from './runner.js';

export const TEAMS_TIMER = Object.freeze({
  timeZone: 'America/Chicago',
  startHour: 6,
  endHour: 22,
  periodMinutes: 30,
  offsetMinutes: 5,
  // A run that has not finished in this long is taken to have died.
  lockStaleMs: 25 * 60 * 1000,
});

const partsAt = (nowMs, timeZone) => Object.fromEntries(new Intl.DateTimeFormat('en-US', {
  timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}).formatToParts(new Date(nowMs)).filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));

/** Whether a timed run may start at `nowMs`: inside 6 am–10 pm in the school's zone. */
export const withinSyncHours = (nowMs, timer = TEAMS_TIMER) => {
  const { hour } = partsAt(nowMs, timer.timeZone);
  return hour >= timer.startHour && hour < timer.endHour;
};

/** The next :05 or :35 after `nowMs` (the alarm's first run; it then repeats every 30 minutes). */
export const nextSyncAt = (nowMs, timer = TEAMS_TIMER) => {
  const minute = 60 * 1000;
  const period = timer.periodMinutes * minute;
  const start = Math.floor(nowMs / period) * period + timer.offsetMinutes * minute;
  return start > nowMs ? start : start + period;
};

/** Whether a lock taken at `lock.startedAt` still holds at `nowMs`. */
export const lockHeld = (lock, nowMs, timer = TEAMS_TIMER) => Boolean(lock?.startedAt) && nowMs - Number(lock.startedAt) < timer.lockStaleMs;

/** Why a timed run should not start now, or null. */
export const skipReason = ({ enabled, nowMs, lock, timer = TEAMS_TIMER }) => {
  if (!enabled) return 'Automatic sync is off.';
  if (!withinSyncHours(nowMs, timer)) return 'Outside 6 am–10 pm.';
  if (lockHeld(lock, nowMs, timer)) return 'Another sync is still running.';
  return null;
};

// TEAMS cannot be used until the teacher acts: stop the whole run.
const TEAMS_UNUSABLE = /signed out|Open TEAMS on|did not finish loading/i;

/**
 * One timed run over every linked class. `bridge` is MathMaster's
 * window.mathmasterTeamsSync (listClasses, step); `teams` the TEAMS adapter.
 * Returns { status: 'ran' | 'nothingLinked', results: [{ classId, label,
 * status, applied, failed, reason }] }.
 */
export const runTimedTeamsSync = async ({ bridge, teams, runnerId, log = () => {}, wait }) => {
  const linked = (await bridge.listClasses()).filter((entry) => entry.sections?.length);
  if (!linked.length) {
    log('No class is linked to a TEAMS section yet.');
    return { status: 'nothingLinked', results: [] };
  }
  const results = [];
  for (const entry of linked) {
    const base = { classId: entry.classId, label: entry.label };
    if (!Number(entry.targetCount)) {
      results.push({ ...base, status: 'noGrades', applied: 0, failed: 0, reason: 'MathMaster has published no grades for this class yet.' });
      continue;
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      const result = await runTeamsSync({
        mathmaster: { step: (payload) => bridge.step({ classId: entry.classId, runnerId, ...payload }) },
        teams,
        sections: entry.sections.map((section) => section.sectionRef),
        log: (line) => log(`${entry.label}: ${line}`),
        ...(wait ? { wait } : {}),
      });
      results.push({ ...base, status: result.status, applied: result.applied, failed: result.failed, reason: '' });
    } catch (error) {
      const reason = String(error?.message || error).slice(0, 240);
      results.push({ ...base, status: 'stopped', applied: 0, failed: 0, reason });
      log(`${entry.label}: stopped. ${reason}`);
      if (TEAMS_UNUSABLE.test(reason)) break;
    }
  }
  return { status: 'ran', results };
};

/** One line for the extension page: what the last run did. */
export const describeRun = (run) => {
  if (!run) return 'No automatic sync has run yet.';
  const at = new Date(run.at).toLocaleString();
  if (run.skipped) return `${at}: skipped. ${run.skipped}`;
  if (run.error) return `${at}: stopped. ${run.error}`;
  if (run.status === 'nothingLinked') return `${at}: no class is linked to TEAMS yet.`;
  const results = run.results || [];
  const done = results.filter((result) => result.status === 'done').length;
  const changes = results.reduce((sum, result) => sum + (Number(result.applied) || 0), 0);
  const trouble = results.filter((result) => !['done', 'noGrades'].includes(result.status));
  return `${at}: ${done} of ${results.length} class${results.length === 1 ? '' : 'es'} in step with TEAMS, ${changes} change${changes === 1 ? '' : 's'} made${trouble.length ? `; ${trouble.length} need${trouble.length === 1 ? 's' : ''} a look` : ''}.`;
};
