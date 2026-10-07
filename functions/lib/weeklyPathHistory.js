// The reads behind getMyWeeklyPathHistory, kept out of index.js.
//
// Everything is addressed by the caller's own studentId: the frozen goals by
// their deterministic ids ({studentId}__{weekKey}, computed — never scanned),
// the sessions by an equality filter on studentId. The grading itself is the
// shared builder (functions/shared/weeklyPathHistory.mjs), which uses the same
// completion rule and grade function as the Classroom publisher.

"use strict";

const DEFAULT_GOAL_COLLECTION = "weeklyPathGoalSnapshots";
// The Classroom publisher's record of what it sent (runWeeklyPathClassroomSync).
const DEFAULT_SYNC_COLLECTION = "weeklyPathClassroomSyncs";
const PATH_SESSIONS = "pathSessions";
// Same fallback ceiling as getMyWeeklyPathCompletions: used only while the
// (studentId, completedAt) composite index is still building.
const FALLBACK_SESSION_LIMIT = 1000;

let historyModule = null;
async function sharedHistory() {
  if (!historyModule) historyModule = await import("../shared/weeklyPathHistory.mjs");
  return historyModule;
}

const missingIndex = (error) => Number(error?.code) === 9 || error?.code === "failed-precondition";

/**
 * The student's last weeks of Path, graded. Returns the builder's result:
 * { currentWeekKey, weeks, streak, weeksHit, weeksWithGoal, truncated }.
 */
async function loadWeeklyPathHistory(db, {
  studentId,
  now = Date.now(),
  displayTeks = null,
  goalCollection = DEFAULT_GOAL_COLLECTION,
  syncCollection = DEFAULT_SYNC_COLLECTION,
} = {}) {
  const id = String(studentId || "").trim();
  if (!id) throw new Error("loadWeeklyPathHistory needs the signed-in student's id.");
  const history = await sharedHistory();
  const weekKeys = history.recentWeeklyPathWeekKeys(now);

  const goalSnapshots = await Promise.all(weekKeys.map((weekKey) => (
    db.collection(goalCollection).doc(`${id}__${weekKey}`).get()
  )));
  const goalsByWeekKey = {};
  goalSnapshots.forEach((snapshot, index) => {
    if (snapshot.exists) goalsByWeekKey[weekKeys[index]] = snapshot.data() || {};
  });

  // Sessions are read only for the weeks that had a goal: a week with nothing
  // assigned has nothing to grade.
  const sessions = [];
  let truncated = false;
  const window = history.weeklyPathHistoryWindow(Object.keys(goalsByWeekKey));
  if (window) {
    const collect = (snapshot) => snapshot.docs.forEach((doc) => sessions.push({ id: doc.id, data: doc.data() || {} }));
    try {
      collect(await db.collection(PATH_SESSIONS)
        .where("studentId", "==", id)
        .where("completedAt", ">=", window.start)
        .where("completedAt", "<", window.end)
        .get());
    } catch (error) {
      if (!missingIndex(error)) throw error;
      const fallback = await db.collection(PATH_SESSIONS).where("studentId", "==", id).limit(FALLBACK_SESSION_LIMIT).get();
      truncated = fallback.size >= FALLBACK_SESSION_LIMIT;
      collect(fallback);
    }
  }

  // What Classroom was actually sent for each of those weeks. The sync record
  // is keyed {classId}__{weekKey} by the frozen goal's own class (computed, not
  // scanned), and holds every student's entry: only the caller's is read out.
  const publishedByWeekKey = {};
  const syncTargets = Object.entries(goalsByWeekKey)
    .map(([weekKey, goal]) => ({ weekKey, classId: String(goal?.classId || "").trim() }))
    .filter((target) => target.classId);
  const syncSnapshots = await Promise.all(syncTargets.map(({ weekKey, classId }) => (
    db.collection(syncCollection).doc(`${classId}__${weekKey}`).get()
  )));
  syncSnapshots.forEach((snapshot, index) => {
    const entry = snapshot.exists ? snapshot.data()?.publishedByStudentId?.[id] : null;
    if (!entry || !Number.isFinite(Number(entry.score))) return;
    publishedByWeekKey[syncTargets[index].weekKey] = {
      score: Number(entry.score),
      points: Number.isFinite(Number(entry.points)) ? Number(entry.points) : null,
      at: Number(entry.at) || null,
    };
  });

  return history.buildWeeklyPathHistory({ weekKeys, goalsByWeekKey, sessions, now, displayTeks, truncated, publishedByWeekKey });
}

module.exports = { loadWeeklyPathHistory, DEFAULT_GOAL_COLLECTION, DEFAULT_SYNC_COLLECTION, FALLBACK_SESSION_LIMIT };
