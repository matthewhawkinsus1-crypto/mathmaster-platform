"use strict";

/**
 * THE TEAMS SYNC'S GRADES, PUBLISHED WITHOUT THE TEACHER (#612).
 *
 * A class linked to TEAMS used to receive grades only when its teacher pressed
 * "Send current grades to the sync" on Grade Export. The scheduled publish
 * (gradingFunctions.js publishTeamsSyncTargetsOnSchedule) does the same thing
 * on its own for every linked class, so the extension in the teacher's TEAMS
 * tab always has current grades to apply.
 *
 * It builds the targets with THE SAME code Grade Export runs
 * (src/platform/gradeTransfer/teamsSync.js buildTeamsSyncTargetsFromRecords,
 * on Grade Transfer's projection), from the records Grade Export reads:
 *
 *   classes/{classId}                         the class and its teacher of record
 *   assignments where assignedClassIds        this class's lessons
 *     contains the class, and every
 *     assignedToStudentIndividually one       (assignmentIsForStudent's two rules)
 *   studentAssignmentOverrides by class       each student's private controls
 *   grades where classId                      the class's students (summaries:
 *                                             grading reads only those)
 *   grades where assignedTeacherEmail         every student the teacher holds,
 *                                             as Grade Export's roster reads
 *                                             them: a district ID two of them
 *                                             carry holds both back
 *   gradeTransferSnapshots by class           export history
 *   classPointRewardRedemptions by class      Practice Passes
 *   settings/gradingPeriods                   the current marking period
 *
 * The builder lives in src/, and Firebase uploads only functions/, so
 * scripts/sync-functions-teams-sync.mjs copies its module closure into
 * functions/vendor/teamsSyncTargets/ at predeploy. As for the weekly planner,
 * the repository copy wins whenever it is present, so tests read the one real
 * source. If neither is present the job publishes nothing: it fails closed,
 * and a teacher's "Send current grades" still works.
 */

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

// What the server imports, relative to the repository root. The sync script
// copies these and everything they import.
const TARGET_BUILDER_ENTRIES = Object.freeze({
  teamsSync: "src/platform/gradeTransfer/teamsSync.js",
});

const REPO_ROOT = path.join(__dirname, "..", "..");
const VENDOR_ROOT = path.join(__dirname, "..", "vendor", "teamsSyncTargets");

/** Where the builder resolves: the repository first, then the vendored copy. */
function targetBuilderRoot({ repoRoot = REPO_ROOT, vendorRoot = VENDOR_ROOT } = {}) {
  const present = (root) => Object.values(TARGET_BUILDER_ENTRIES).every((entry) => fs.existsSync(path.join(root, entry)));
  if (present(repoRoot)) return repoRoot;
  if (present(vendorRoot)) return vendorRoot;
  return null;
}

const builderCache = new Map();
/** The builder module, loaded once per root. Null when it is not deployed. */
async function loadTeamsSyncTargetBuilder(options = {}) {
  const root = targetBuilderRoot(options);
  if (!root) return null;
  if (!builderCache.has(root)) {
    builderCache.set(root, import(pathToFileURL(path.join(root, TARGET_BUILDER_ENTRIES.teamsSync)).href));
  }
  return builderCache.get(root);
}

const plainDate = (value) => {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};
const docsOf = (snapshot) => snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));

const teacherEmailOf = (classRecord) => String(classRecord?.teacherOfRecord || "").trim().toLowerCase();

/**
 * Every student the teacher holds (the roster Grade Export reads: grades
 * where assignedTeacherEmail), with only what the shared-district-ID check
 * and the class filter read.
 */
async function readTeacherRoster(db, email) {
  return docsOf(await db.collection("grades").where("assignedTeacherEmail", "==", email).select("sisStudentId", "classId").get());
}

/**
 * Read everything one class's targets are built from. `rosterFor(email)`
 * reads the teacher's roster; a run passes one that reads each teacher once.
 */
async function readTeamsSyncRecords(db, classId, { rosterFor = (email) => readTeacherRoster(db, email) } = {}) {
  const [classSnapshot, byClass, individually, controls, students, snapshots, redemptions, periods] = await Promise.all([
    db.collection("classes").doc(classId).get(),
    db.collection("assignments").where("assignedClassIds", "array-contains", classId).get(),
    db.collection("assignments").where("assignedToStudentIndividually", "==", true).get(),
    db.collection("studentAssignmentOverrides").where("classId", "==", classId).get(),
    db.collection("grades").where("classId", "==", classId).get(),
    db.collection("gradeTransferSnapshots").where("classId", "==", classId).get(),
    db.collection("classPointRewardRedemptions").where("classId", "==", classId).get(),
    db.collection("settings").doc("gradingPeriods").get(),
  ]);
  const assignments = new Map();
  [...docsOf(byClass), ...docsOf(individually)].forEach((entry) => assignments.set(entry.id, entry));
  const classRecord = classSnapshot.exists ? classSnapshot.data() || {} : null;
  const email = teacherEmailOf(classRecord);
  return {
    classId,
    classRecord,
    assignmentDocs: [...assignments.values()],
    controlDocs: controls.docs.map((entry) => entry.data()),
    studentDocs: docsOf(students),
    rosterStudentDocs: email ? await rosterFor(email) : [],
    // As listGradeTransferState hands them to the browser.
    snapshotDocs: docsOf(snapshots).map((entry) => ({
      ...entry, createdAt: plainDate(entry.createdAt), uploadConfirmedAt: plainDate(entry.uploadConfirmedAt),
    })),
    redemptionDocs: redemptions.docs.map((entry) => entry.data()),
    gradingPeriodSettings: periods.exists ? periods.data() || {} : {},
  };
}

/**
 * One scheduled run: every class with a linked TEAMS section gets its targets
 * rebuilt and published through `publish` (the same write the callable
 * makes). A class is skipped, and keeps what it had, when its record or
 * roster cannot be read; one class failing never stops the others.
 */
async function publishScheduledTeamsSyncTargets({ db, publish, now = Date.now(), builderOptions = {}, logger = console }) {
  const builder = await loadTeamsSyncTargetBuilder(builderOptions);
  if (!builder) {
    logger.warn("TEAMS sync: the target builder is not deployed; nothing was published.");
    return { published: [], skipped: [], failed: [], builder: false };
  }
  const linked = (await db.collection("teamsSyncClasses").get()).docs
    .map((entry) => ({ classId: entry.id, ...entry.data() }))
    .filter((entry) => Array.isArray(entry.sections) && entry.sections.length > 0);
  const published = [];
  const skipped = [];
  const failed = [];
  // A teacher with several linked classes has their roster read once a run.
  const rosters = new Map();
  const rosterFor = (email) => {
    if (!rosters.has(email)) rosters.set(email, readTeacherRoster(db, email));
    return rosters.get(email);
  };
  for (const entry of linked) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const records = await readTeamsSyncRecords(db, entry.classId, { rosterFor });
      const email = teacherEmailOf(records.classRecord);
      if (!records.classRecord || records.classRecord.status === "archived" || !email) {
        skipped.push({ classId: entry.classId, reason: "class missing, archived or without a teacher of record" });
        continue;
      }
      if (!records.studentDocs.length) {
        skipped.push({ classId: entry.classId, reason: "no students read" });
        continue;
      }
      const targets = builder.buildTeamsSyncTargetsFromRecords({ ...records, now });
      // eslint-disable-next-line no-await-in-loop
      const result = await publish({ classId: entry.classId, email, targetsInput: targets, publishedBy: "schedule" });
      published.push({ classId: entry.classId, ...result });
    } catch (error) {
      failed.push({ classId: entry.classId, message: String(error?.message || error).slice(0, 200) });
    }
  }
  return { published, skipped, failed, builder: true };
}

module.exports = {
  TARGET_BUILDER_ENTRIES,
  VENDOR_ROOT,
  REPO_ROOT,
  targetBuilderRoot,
  loadTeamsSyncTargetBuilder,
  readTeacherRoster,
  readTeamsSyncRecords,
  publishScheduledTeamsSyncTargets,
};
