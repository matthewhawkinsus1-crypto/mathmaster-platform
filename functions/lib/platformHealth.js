"use strict";

/*
 * CRASH COUNTS THE OWNER CAN SEE (functions/shared/crashReport.mjs says what a
 * report may carry; this file is who may send one, how often, and where it is
 * kept).
 *
 *   platformFlags/crashReporting          { mode: off | family | question }.
 *                                         Missing means off. Only the root
 *                                         administrator's callable writes it.
 *   platformHealthDaily/{YYYY-MM-DD}      one document per UTC day: a map of
 *                                         buckets, each a count and how many
 *                                         accounts reported it. Read by the
 *                                         root administrator only (rules).
 *   platformHealthReporters/{day}_{hash}  the day's rate limit for one
 *                                         account: how many requests, which
 *                                         bucket names. Named by a hash of the
 *                                         day and the account, read by nobody
 *                                         (rules), deleted after two days. It
 *                                         is what lets "reporters" count
 *                                         accounts instead of crashes, and
 *                                         what stops one account from writing
 *                                         without bound.
 *
 * COST. With reporting off, a request reads nothing and writes nothing (the
 * flag is cached per instance). With it on, one report request is one
 * transaction: 2 document reads and 2 writes, at most
 * CRASH_REPORT_LIMITS.callsPerReporterPerDay times per account per day, and
 * only from a device that crashed.
 */

const crypto = require("node:crypto");

const FLAG_CACHE_MS = 2 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

let sharedPromise = null;
const shared = () => {
  if (!sharedPromise) sharedPromise = import("../shared/crashReport.mjs");
  return sharedPromise;
};

function createPlatformHealthService({ db, HttpsError, now = () => Date.now() }) {
  let cachedFlag = null; // { mode, readAt }

  const flagRef = async () => db.collection("platformFlags").doc((await shared()).CRASH_REPORTING_FLAG);

  const currentMode = async ({ fresh = false } = {}) => {
    const nowMs = now();
    if (!fresh && cachedFlag && nowMs - cachedFlag.readAt < FLAG_CACHE_MS) return cachedFlag.mode;
    const rules = await shared();
    const snapshot = await (await flagRef()).get();
    cachedFlag = { mode: rules.resolveCrashReportingMode(snapshot.exists ? snapshot.data() : null), readAt: nowMs };
    return cachedFlag.mode;
  };

  const reporterDocId = (day, uid) => `${day}_${crypto.createHash("sha256").update(`${day}:${uid}`).digest("hex").slice(0, 32)}`;

  /**
   * Any signed-in account. `{ probe: true }` asks only whether reporting is
   * on, so a device never sends a report into a platform that has it off.
   * Always answers `{ mode }`; a refused or rate-limited report is not an
   * error the student's device should retry or show.
   */
  const report = async (request) => {
    if (!request?.auth?.uid) throw new HttpsError("unauthenticated", "Sign in before reporting.");
    const rules = await shared();
    const limits = rules.CRASH_REPORT_LIMITS;
    const mode = await currentMode();
    const data = request.data && typeof request.data === "object" ? request.data : {};
    if (mode === "off" || data.probe === true) return { mode, accepted: 0 };

    const role = request.auth.token?.role === "teacher" ? "teacher" : "student";
    const incoming = Array.isArray(data.buckets) ? data.buckets.slice(0, limits.bucketsPerCall) : [];
    // Rebuilt here from the closed shapes: nothing a request says is stored as sent.
    const merged = new Map();
    for (const raw of incoming) {
      const bucket = rules.normalizeCrashBucket(raw, { mode, role });
      const id = rules.crashBucketId(bucket);
      const count = rules.clampCrashCount(raw?.count);
      const existing = merged.get(id);
      if (existing) existing.count = Math.min(existing.count + count, limits.countPerBucketPerCall);
      else merged.set(id, { bucket, count });
    }
    if (!merged.size) return { mode, accepted: 0 };

    const nowMs = now();
    const day = rules.utcDayKey(nowMs);
    const hour = new Date(nowMs).getUTCHours();
    const dailyRef = db.collection(rules.PLATFORM_HEALTH_DAILY_COLLECTION).doc(day);
    const reporterRef = db.collection(rules.PLATFORM_HEALTH_REPORTERS_COLLECTION).doc(reporterDocId(day, request.auth.uid));

    const accepted = await db.runTransaction(async (transaction) => {
      const [dailySnap, reporterSnap] = await Promise.all([transaction.get(dailyRef), transaction.get(reporterRef)]);
      const reporter = reporterSnap.exists ? reporterSnap.data() || {} : {};
      const calls = Number(reporter.calls) || 0;
      if (calls >= limits.callsPerReporterPerDay) return 0;
      const seen = Array.isArray(reporter.seen) ? [...reporter.seen] : [];
      const daily = dailySnap.exists ? dailySnap.data() || {} : {};
      const buckets = { ...daily.buckets };
      let total = Number(daily.total) || 0;
      let overflow = Number(daily.overflow) || 0;
      let taken = 0;
      for (const [id, { bucket, count }] of merged) {
        const firstForReporter = !seen.includes(id);
        if (firstForReporter && seen.length >= limits.bucketsPerReporterPerDay) continue;
        if (!buckets[id] && Object.keys(buckets).length >= limits.bucketsPerDay) {
          overflow += count;
          continue;
        }
        const previous = buckets[id];
        buckets[id] = {
          ...bucket,
          count: (Number(previous?.count) || 0) + count,
          reporters: (Number(previous?.reporters) || 0) + (firstForReporter ? 1 : 0),
          firstHour: Number.isInteger(previous?.firstHour) ? previous.firstHour : hour,
          lastHour: hour,
        };
        if (firstForReporter) seen.push(id);
        total += count;
        taken += 1;
      }
      transaction.set(reporterRef, {
        day,
        calls: calls + 1,
        seen,
        expireAt: new Date(nowMs + limits.reporterRetentionDays * DAY_MS),
      });
      transaction.set(dailyRef, {
        schema: rules.CRASH_REPORT_SCHEMA,
        day,
        total,
        overflow,
        buckets,
        updatedAt: new Date(nowMs),
        expireAt: new Date(nowMs + limits.dailyRetentionDays * DAY_MS),
      });
      return taken;
    });
    return { mode, accepted };
  };

  const deleteWhere = async (collectionName, beforeDay) => {
    let removed = 0;
    for (let round = 0; round < 20; round += 1) {
      let query = db.collection(collectionName);
      if (beforeDay) query = query.where("day", "<", beforeDay);
      // eslint-disable-next-line no-await-in-loop
      const snapshot = await query.limit(300).get();
      if (snapshot.empty) break;
      const batch = db.batch();
      snapshot.docs.forEach((doc) => batch.delete(doc.ref));
      // eslint-disable-next-line no-await-in-loop
      await batch.commit();
      removed += snapshot.size;
      if (snapshot.size < 300) break;
    }
    return removed;
  };

  /** The daily retention sweep. Reads nothing while there is nothing to delete beyond one empty query each. */
  const prune = async () => {
    const rules = await shared();
    const limits = rules.CRASH_REPORT_LIMITS;
    const nowMs = now();
    return {
      daily: await deleteWhere(rules.PLATFORM_HEALTH_DAILY_COLLECTION, rules.utcDayKey(nowMs - limits.dailyRetentionDays * DAY_MS)),
      reporters: await deleteWhere(rules.PLATFORM_HEALTH_REPORTERS_COLLECTION, rules.utcDayKey(nowMs - limits.reporterRetentionDays * DAY_MS)),
    };
  };

  /** Everything collected, now: what "turn off and delete" means. */
  const purge = async () => {
    const rules = await shared();
    return {
      daily: await deleteWhere(rules.PLATFORM_HEALTH_DAILY_COLLECTION, null),
      reporters: await deleteWhere(rules.PLATFORM_HEALTH_REPORTERS_COLLECTION, null),
    };
  };

  /**
   * Root administrator: `{ action: "status" }`, `{ action: "set", mode }`, or
   * `{ action: "purge" }` (turns reporting off and deletes what was
   * collected). The caller has already been authorised (`actor`); `audit`
   * records who changed what.
   */
  const manage = async ({ data, actor, audit }) => {
    const rules = await shared();
    const input = data && typeof data === "object" ? data : {};
    const action = typeof input.action === "string" ? input.action : "status";
    if (action === "status") return { mode: await currentMode({ fresh: true }), changed: false };
    if (action !== "set" && action !== "purge") throw new HttpsError("invalid-argument", "Unknown Platform health action.");
    const mode = action === "purge" ? "off" : input.mode;
    if (!rules.CRASH_REPORTING_MODES.includes(mode)) throw new HttpsError("invalid-argument", "Choose off, family or question.");
    const previous = await currentMode({ fresh: true });
    // The flag is read by every signed-in client: it says the mode and when, never who.
    await (await flagRef()).set({ mode, updatedAt: new Date(now()) });
    cachedFlag = { mode, readAt: now() };
    const removed = action === "purge" ? await purge() : null;
    await audit(actor, action === "purge" ? "crash_reporting_purged" : "crash_reporting_mode_set", rules.CRASH_REPORTING_FLAG, {
      from: previous, to: mode, ...(removed ? { removed } : {}),
    });
    return { mode, changed: previous !== mode, ...(removed ? { removed } : {}) };
  };

  return { report, prune, purge, manage, currentMode };
}

module.exports = { createPlatformHealthService };
