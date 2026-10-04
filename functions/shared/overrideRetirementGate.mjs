/*
 * WHEN STUDENTS' CONTROLS MAY STOP BEING MIRRORED ON THE SHARED ASSIGNMENT —
 * THE GATE, ENFORCED BY THE SERVER.
 *
 * `platformFlags/assignmentOverrideStorage.sharedRetired` stops the mirror
 * (server writers delete a student's shared forms instead of copying them),
 * turns on the rules lock, and lets the strip run
 * (docs/architecture/student-assignment-overrides.md §5, §11). Previous-release
 * screens read ONLY the shared copy, so retiring it while one is still open
 * would hide a student's extension from that screen. PR #432 set the
 * condition; this module makes it a check the switch cannot skip:
 *
 *   1. the client release that reads private records is deployed
 *      (clientCutoverDeployed);
 *   2. it has been live for one full school day (liveOneFullSchoolDay);
 *   3. a full backfill pass has completed (fullBackfillCompleted);
 *   4. that pass had zero failures (backfillZeroFailures).
 *
 * WHAT THE SERVER CAN PROVE, AND WHAT IT CANNOT — SAID, NOT PRETENDED.
 *
 *   * Hosting: the server can read the live build manifest
 *     (mathmaster-build.json, no-cache) and see whether the served client
 *     declares CLIENT_CUTOVER_CAPABILITY. A manifest that DOESN'T is a
 *     definite "not deployed" and blocks. A manifest it cannot reach (the
 *     emulator, a network failure) proves nothing either way, so the operator
 *     must attest the deployment explicitly; that attestation is recorded.
 *   * Time: the clock starts when the cutover is CONFIRMED — stamped by the
 *     server, never a time a browser sends — so it cannot be back-dated. The
 *     server requires the first full weekday after that moment (school time
 *     zone, midnight to midnight) to be over.
 *   * Holidays: the district calendar lives with the client
 *     (src/curriculum/calendars), which the server cannot load. A weekday the
 *     server counts may have been a holiday or a staff day, so retiring also
 *     needs the operator's explicit attestation that students used the new
 *     release for a full school day. The admin screen computes the earliest
 *     such day from the district calendar to help; the attestation is
 *     recorded with the gate's evidence in the admin audit log.
 *   * Backfill: counted by the server itself, page by page, as one pass
 *     (studentAssignmentOverrideStore.mjs runOverrideMigration): a pass is
 *     complete only when every page from the first ran in order, and its
 *     failures are the sum over all of them.
 *
 * Turning the switch OFF again (the rollback) is never gated.
 *
 * Pure: no Firestore, no clock of its own. The callable and the admin screen
 * read the same definition.
 */
import { zonedDateKey, zonedInstant } from './instructionalCalendar.mjs';

/** The build manifest field a client release that reads private records declares. */
export const CLIENT_CUTOVER_CAPABILITY = 'privateAssignmentControlsClient';
export const CLIENT_CUTOVER_CAPABILITY_VERSION = 1;

/** Typed by the operator; refused without it. */
export const RETIRE_CONFIRMATION = 'RETIRE SHARED COPY';
export const STRIP_CONFIRMATION = 'STRIP SHARED COPIES';
export const RESTORE_CONFIRMATION = 'RESTORE SHARED COPIES';

/** §13: the shared side may be ignored only after this many days of a clean strip. */
export const LEGACY_IGNORE_DAYS = 30;
export const DAY_MS = 24 * 60 * 60 * 1000;

/** The school's wall clock (sectionDeadline.mjs SCHOOL_TIME_ZONE). */
export const RETIREMENT_TIME_ZONE = 'America/Chicago';

export const RETIREMENT_GATE = Object.freeze({
  CLIENT_CUTOVER_DEPLOYED: 'clientCutoverDeployed',
  LIVE_ONE_FULL_SCHOOL_DAY: 'liveOneFullSchoolDay',
  FULL_BACKFILL_COMPLETED: 'fullBackfillCompleted',
  BACKFILL_ZERO_FAILURES: 'backfillZeroFailures',
});

export const OVERRIDE_MIGRATION_STAGE = Object.freeze({
  BACKFILL_INCOMPLETE: 'backfillIncomplete',
  WAITING_SAFETY_PERIOD: 'waitingSafetyPeriod',
  READY_TO_RETIRE: 'readyToRetire',
  RETIRED: 'retired',
});

const clean = (value) => String(value ?? '').trim();
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const finite = (value) => (Number.isFinite(Number(value)) && value !== null && value !== '' ? Number(value) : null);

const millisOf = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  const parsed = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/* ------------------------------------------------------------- school days */

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

const nextDateKey = (dateKey) => {
  const match = String(dateKey || '').match(DATE_KEY);
  if (!match) return null;
  const next = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
};

const midnightOf = (dateKey, timeZone) => {
  const match = String(dateKey || '').match(DATE_KEY);
  if (!match) return null;
  return zonedInstant({ year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }, timeZone);
};

const isWeekday = (dateKey) => {
  const weekday = new Date(`${dateKey}T12:00:00Z`).getUTCDay();
  return weekday >= 1 && weekday <= 5;
};

/**
 * The first full school day after `fromMs`: the first weekday (and, when a
 * calendar is given, instructional day) whose whole local day — midnight to
 * midnight in the school's time zone — begins at or after `fromMs`. The day
 * the release went live is never counted: it was not live for all of it.
 */
export const firstFullSchoolDayAfter = (fromMs, { timeZone = RETIREMENT_TIME_ZONE, nonInstructionalDateKeys = [] } = {}) => {
  const from = finite(fromMs);
  if (from === null) return null;
  const closed = new Set((Array.isArray(nonInstructionalDateKeys) ? nonInstructionalDateKeys : [...(nonInstructionalDateKeys || [])]).map(clean));
  let key = zonedDateKey(from, timeZone);
  if ((midnightOf(key, timeZone) ?? Number.NEGATIVE_INFINITY) < from) key = nextDateKey(key);
  for (let guard = 0; guard < 60 && key; guard += 1) {
    if (isWeekday(key) && !closed.has(key)) {
      const startMs = midnightOf(key, timeZone);
      const endMs = midnightOf(nextDateKey(key), timeZone);
      if (startMs !== null && endMs !== null) return { dateKey: key, startMs, endMs };
    }
    key = nextDateKey(key);
  }
  return null;
};

/* ------------------------------------------------------------ the evidence */

/**
 * What the live build manifest says, as evidence for gate 1:
 *   checked + capability ≥ 1 → the served client reads private records;
 *   checked + no capability  → it does NOT (blocks);
 *   not checked              → unknown (the operator must attest).
 */
export const hostingCutoverEvidence = (hosting = null) => {
  if (!isObject(hosting) || hosting.checked !== true) {
    return { state: 'unverified', reason: clean(hosting?.reason) || 'not-checked', gitSha: null };
  }
  const capability = finite(hosting.capability) ?? 0;
  return {
    state: capability >= CLIENT_CUTOVER_CAPABILITY_VERSION ? 'deployed' : 'notDeployed',
    reason: capability >= CLIENT_CUTOVER_CAPABILITY_VERSION ? 'manifest-declares-capability' : 'manifest-lacks-capability',
    gitSha: clean(hosting.gitSha) || null,
    capability,
  };
};

/** The manifest fields a client build publishes for the gate (scripts/build-firebase-hosting.mjs). */
export const cutoverManifestFields = () => ({ [CLIENT_CUTOVER_CAPABILITY]: CLIENT_CUTOVER_CAPABILITY_VERSION });

const passOf = (modeState, key) => (isObject(modeState?.[key]) ? modeState[key] : null);

/** The backfill's latest completed full pass, and whether a newer one is unfinished. */
export const backfillPassState = (migration = {}) => {
  const backfill = isObject(migration?.backfill) ? migration.backfill : {};
  const completed = passOf(backfill, 'lastCompletedPass');
  const current = passOf(backfill, 'pass');
  const currentUnfinished = Boolean(current && finite(current.completedAtMs) === null);
  const newerUnfinished = currentUnfinished
    && (!completed || (finite(current.startedAtMs) ?? 0) >= (finite(completed.completedAtMs) ?? 0));
  return {
    completed,
    current,
    newerUnfinished,
    failureCount: completed ? Math.max(0, finite(completed.failureCount) ?? 0) : null,
  };
};

/** The latest completed strip pass (real or dry) that found nothing left to strip. */
export const cleanStripState = (migration = {}) => {
  const strip = isObject(migration?.strip) ? migration.strip : {};
  const candidates = [passOf(strip, 'lastCompletedPass'), passOf(strip, 'lastCompletedDryRunPass')]
    .filter(Boolean)
    .filter((pass) => (finite(pass.assignmentsWithSharedStudentData) ?? 1) === 0
      && (finite(pass.assignmentsAwaitingAbsorption) ?? 1) === 0
      && (finite(pass.studentsAwaitingAbsorption) ?? 0) === 0
      && (finite(pass.failureCount) ?? 1) === 0);
  return candidates.sort((a, b) => (finite(a.completedAtMs) ?? 0) - (finite(b.completedAtMs) ?? 0))[0] || null;
};

/* ---------------------------------------------------------------- the gate */

/**
 * Every gate, the stage, and whether the switch may be retired now.
 *
 *   storage    the flag document ({ sharedRetired })
 *   migration  platformMigrations/studentAssignmentOverrides
 *              (cutover, retirement, backfill/strip/restore passes)
 *   hosting    the server's read of the live build manifest (or null)
 *   nowMs      the server's clock
 */
export const evaluateRetirementReadiness = ({
  storage = null,
  migration = null,
  hosting = null,
  nowMs = Date.now(),
  timeZone = RETIREMENT_TIME_ZONE,
} = {}) => {
  const sharedRetired = Boolean(isObject(storage) && storage.sharedRetired === true);
  const state = isObject(migration) ? migration : {};
  const cutover = isObject(state.cutover) ? state.cutover : null;
  const confirmedAtMs = finite(cutover?.confirmedAtMs) ?? millisOf(cutover?.confirmedAt);
  const evidence = hostingCutoverEvidence(hosting);

  const gates = [];
  // 1. The client release that reads private records is what Hosting serves.
  let cutoverDetail;
  let cutoverOk = false;
  if (evidence.state === 'notDeployed') {
    cutoverDetail = `Hosting serves a build that does not read students' private records (${evidence.gitSha || 'unknown build'}). Deploy this release's Hosting first.`;
  } else if (confirmedAtMs === null) {
    cutoverDetail = 'Record the client release as live (after Hosting is deployed) to start the school-day clock.';
  } else if (evidence.state === 'deployed') {
    cutoverOk = true;
    cutoverDetail = `Hosting serves build ${evidence.gitSha || '(unnamed)'}, which reads students' private records; confirmed live ${new Date(confirmedAtMs).toISOString()}.`;
  } else {
    cutoverOk = cutover?.hostingAttested === true;
    cutoverDetail = cutoverOk
      ? `The server could not read the live build (${evidence.reason}); an administrator attested the deployment on ${new Date(confirmedAtMs).toISOString()}.`
      : `The server could not read the live build (${evidence.reason}); record the release again and attest the deployment.`;
  }
  gates.push({ id: RETIREMENT_GATE.CLIENT_CUTOVER_DEPLOYED, ok: cutoverOk, detail: cutoverDetail, evidence: evidence.state });

  // 2. Live for one full school day — counted from the server-stamped confirmation.
  const schoolDay = confirmedAtMs === null ? null : firstFullSchoolDayAfter(confirmedAtMs, { timeZone });
  const dayOk = Boolean(schoolDay && finite(nowMs) !== null && nowMs >= schoolDay.endMs);
  gates.push({
    id: RETIREMENT_GATE.LIVE_ONE_FULL_SCHOOL_DAY,
    ok: dayOk,
    earliestMs: schoolDay?.endMs ?? null,
    schoolDay: schoolDay?.dateKey ?? null,
    detail: !schoolDay
      ? 'Starts when the client release is recorded as live.'
      : dayOk
        ? `The first full weekday after the release went live (${schoolDay.dateKey}) is over. Confirm students used the new release that day — the server cannot see holidays.`
        : `Waiting for ${schoolDay.dateKey} to end (${new Date(schoolDay.endMs).toISOString()}): the release must be live for one full school day before the shared copy can be retired.`,
  });

  // 3 / 4. A full backfill pass, completed, with zero failures.
  const backfill = backfillPassState(state);
  const completedOk = Boolean(backfill.completed && !backfill.newerUnfinished);
  gates.push({
    id: RETIREMENT_GATE.FULL_BACKFILL_COMPLETED,
    ok: completedOk,
    detail: !backfill.completed
      ? 'Run "Copy into private records" to the end: no full pass has completed yet.'
      : backfill.newerUnfinished
        ? 'A newer backfill pass was started and has not finished: run it to the end.'
        : `A full pass finished ${new Date(finite(backfill.completed.completedAtMs) ?? 0).toISOString()} (${finite(backfill.completed.assignmentsScanned) ?? 0} assignments).`,
  });
  const zeroFailures = completedOk && backfill.failureCount === 0;
  gates.push({
    id: RETIREMENT_GATE.BACKFILL_ZERO_FAILURES,
    ok: zeroFailures,
    failureCount: backfill.failureCount,
    detail: !completedOk
      ? 'Needs a completed full pass.'
      : zeroFailures
        ? 'That pass had no failures.'
        : `That pass had ${backfill.failureCount} failure(s): fix them and run a full pass again.`,
  });

  const allGatesOk = gates.every((gate) => gate.ok);
  let stage;
  if (sharedRetired) stage = OVERRIDE_MIGRATION_STAGE.RETIRED;
  else if (!completedOk || !zeroFailures) stage = OVERRIDE_MIGRATION_STAGE.BACKFILL_INCOMPLETE;
  else if (!allGatesOk) stage = OVERRIDE_MIGRATION_STAGE.WAITING_SAFETY_PERIOD;
  else stage = OVERRIDE_MIGRATION_STAGE.READY_TO_RETIRE;

  // §13 — when the shared side may be ignored (informational; nothing here deletes).
  const retirement = isObject(state.retirement) ? state.retirement : {};
  const retiredAtMs = finite(retirement.retiredAtMs);
  const restoreAtMs = finite(state?.restore?.lastRealRunAtMs);
  const cleanStrip = cleanStripState(state);
  const cleanSinceMs = cleanStrip && sharedRetired && (retiredAtMs === null || (finite(cleanStrip.completedAtMs) ?? 0) >= retiredAtMs)
    && (restoreAtMs === null || (finite(cleanStrip.completedAtMs) ?? 0) > restoreAtMs)
    ? finite(cleanStrip.completedAtMs)
    : null;
  const legacyIgnore = {
    cleanSinceMs,
    earliestMs: cleanSinceMs === null ? null : cleanSinceMs + LEGACY_IGNORE_DAYS * DAY_MS,
    eligibleByTime: cleanSinceMs !== null && nowMs >= cleanSinceMs + LEGACY_IGNORE_DAYS * DAY_MS,
    detail: !sharedRetired
      ? 'Only after the shared copy is retired and stripped.'
      : cleanSinceMs === null
        ? 'Run the strip (or its dry run) until a full pass finds nothing left: the 30-day clock starts then.'
        : `Clean since ${new Date(cleanSinceMs).toISOString()}; the legacy shared side may be ignored from ${new Date(cleanSinceMs + LEGACY_IGNORE_DAYS * DAY_MS).toISOString()} if no restore happens and no previous-release client is still served.`,
  };

  return {
    sharedRetired,
    stage,
    gates,
    canRetire: !sharedRetired && allGatesOk,
    confirmedAtMs,
    hosting: evidence,
    legacyIgnore,
  };
};

/** Why a retire request is refused, or null when the gate and the request both pass. */
export const retirementRefusal = ({ readiness, confirmation = '', attestFullSchoolDay = false } = {}) => {
  if (!readiness) return { code: 'failed-precondition', message: 'The retirement gate could not be evaluated.' };
  if (readiness.sharedRetired) return null;
  const failing = readiness.gates.filter((gate) => !gate.ok);
  if (failing.length) {
    return {
      code: 'failed-precondition',
      message: `The shared copy cannot be retired yet: ${failing.map((gate) => gate.detail).join(' ')}`,
      gates: failing.map((gate) => gate.id),
    };
  }
  if (clean(confirmation) !== RETIRE_CONFIRMATION) {
    return { code: 'invalid-argument', message: `Type "${RETIRE_CONFIRMATION}" to retire the shared copy.` };
  }
  if (attestFullSchoolDay !== true) {
    return { code: 'invalid-argument', message: 'Confirm that students used this release for a full school day (the server cannot see holidays).' };
  }
  return null;
};

export default evaluateRetirementReadiness;
