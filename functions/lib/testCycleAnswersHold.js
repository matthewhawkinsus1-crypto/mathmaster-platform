"use strict";

/*
 * WHO A COURSE TEST'S ANSWERS WAIT FOR, AND THE CHEAP RE-CHECK (PF03).
 *
 * A course Test's correct answers and worked solutions stay held while anyone
 * who can still sit the stage has not submitted and no teacher's release
 * covers their attempt (courseAnswersRelease, functions/index.js). The rule
 * itself is `answersReleaseVerdict` below, unchanged from index.js.
 *
 * A student in Corrections with "Review my Test" open asks again every 30
 * seconds (TestCycleCard.jsx TEST_REVIEW_RECHECK_MS), and each ask read EVERY
 * record of the cycle to answer one yes or no. But the answers are held
 * exactly when at least one student holds them. Once the full check has named
 * one, the next ask only needs to know whether THAT student still holds them:
 * their record, the release, and — with no record — whether they are on the
 * roster. Two or three document reads instead of the whole cycle.
 *
 * `holderStillHolds` is the full rule asked about one student, so while it
 * says yes the full check could only say "held" too: the verdict is the same,
 * only cheaper. The moment it says no (they submitted, a release covered them,
 * they left the roster) the full check runs exactly as before and either names
 * another student or opens the answers. "Released" is never answered from
 * memory, and a remembered student is only ever a place to start looking.
 *
 * Pure apart from the per-instance memory of who held them last; the reads are
 * the caller's.
 */

/*
 * A student at their current attempts: the unit an explicit release covers.
 * A reset gives the stage a new attempt, so the key changes and no release
 * that did not confirm the new attempt can cover it — however the release
 * and the reset interleave. A Test reset changes the key for both stages.
 */
function answerCoverageKey(record) {
  return `${record.studentId}#${record.test.attempt}.${record.retest.attempt}`;
}

/*
 * Who can still sit a stage. The Test: anyone whose Test is not submitted,
 * except where the stage machine says they never will (an external original
 * that passed, a retest a teacher closed). The Retest: anyone who has not
 * submitted one and is not done without one (passed, retest closed or
 * released): before or in the Test, awaiting its release, in Corrections,
 * waiting for or sitting the Retest.
 */
function stillToSitStage(shared, policy, stage, raw) {
  const record = shared.record.normalizeTestCycleRecord(raw);
  const finished = [shared.record.SESSION_STATE.SUBMITTED, shared.record.SESSION_STATE.RELEASED];
  const STAGE = shared.stages.TEST_CYCLE_STAGE;
  const state = shared.stages.resolveTestCycleStage({ policy, record });
  if (stage === "test") {
    if (finished.includes(record.test.state)) return false;
    return !(state?.stage === STAGE.RETEST_CLOSED && (state.grade.originalTestGrade !== null || state.teacherControls.retestDisabled));
  }
  // An external original's one secure session lives in the Test slot.
  if (policy?.externalAssessment) return false;
  if (finished.includes(record.retest.state)) return false;
  return ![STAGE.PASSED, STAGE.COMPLETE, STAGE.RETEST_CLOSED, STAGE.RETEST_SUBMITTED].includes(state?.stage);
}

// The keys an explicit release covers. An earlier release's student-only list
// covers nobody: it named no attempts.
const coveredKeysOf = (release) => new Set(
  release?.releasedAt && Array.isArray(release.coveredKeys) ? release.coveredKeys.map(String) : [],
);

/**
 * THE RULE: who the answers wait for.
 *
 * `records` maps each record holder's student id to their stored record (the
 * cycle's records, read by assignment); `rosterIds` is every active student in
 * the assignment's classes. Everyone in either can hold the answers.
 */
function answersReleaseVerdict({ shared, policy, stage, assignmentId, release = null, records = new Map(), rosterIds = [] }) {
  const id = String(assignmentId);
  const everyone = [...new Set([...rosterIds, ...records.keys()])].filter(Boolean);
  const stillTestingRecords = everyone
    .map((studentId) => shared.record.normalizeTestCycleRecord(records.get(studentId) || { assignmentId: id, studentId }))
    .filter((record) => stillToSitStage(shared, policy, stage, record));
  const stillTesting = stillTestingRecords.map((record) => record.studentId);
  const stillTestingKeys = stillTestingRecords.map(answerCoverageKey);
  const explicit = Boolean(release?.releasedAt);
  const covered = coveredKeysOf(release);
  const heldFor = stillTestingRecords.filter((record) => !covered.has(answerCoverageKey(record))).map((record) => record.studentId);
  return { released: heldFor.length === 0, explicit, releasedAt: release?.releasedAt || null, stillTesting, stillTestingKeys, heldFor };
}

/**
 * The same rule, asked about ONE student: is `studentId` among those the
 * answers wait for (answersReleaseVerdict's `heldFor`)?
 *
 *   recordData  their record as stored at its own id (testCycleRecordKey), or
 *               null when there is none;
 *   onRoster    whether they are an active student of one of the
 *               assignment's classes (onTestCycleRoster) — read only when
 *               there is no record, since a record holder counts either way.
 *
 * A record that does not name this student and assignment is not one the full
 * check would file under them, so it answers no and the full check decides.
 */
function holderStillHolds({ shared, policy, stage, assignmentId, studentId, release = null, recordData = null, onRoster = false }) {
  const id = String(studentId || "");
  if (!id) return false;
  if (recordData) {
    if (String(recordData.studentId || "") !== id || String(recordData.assignmentId || "") !== String(assignmentId)) return false;
  } else if (!onRoster) {
    return false;
  }
  const record = shared.record.normalizeTestCycleRecord(recordData || { assignmentId: String(assignmentId), studentId: id });
  if (record.studentId !== id) return false;
  if (!stillToSitStage(shared, policy, stage, record)) return false;
  return !coveredKeysOf(release).has(answerCoverageKey(record));
}

/**
 * Is this grades document an active student of one of `classIds`? The same
 * test the roster read applies (testCycleRosterIds: classId equal to an
 * assigned class, not "inactive", not the connection probe), for one student.
 */
function onTestCycleRoster(gradeSnapshot, classIds = []) {
  if (!gradeSnapshot?.exists || gradeSnapshot.id === "test_connection") return false;
  const data = (typeof gradeSnapshot.data === "function" ? gradeSnapshot.data() : null) || {};
  return classIds.includes(data.classId) && data.status !== "inactive";
}

// One remembered student per assignment and stage, per server instance.
const HOLDER_MEMORY_LIMIT = 500;

/**
 * The re-check: the remembered student first, then — only when they no longer
 * hold the answers — the full check, which names the next one to remember.
 *
 * Per call:
 *   readHolder(studentId) -> { release, recordData, onRoster }
 *   fullCheck()           -> courseAnswersRelease's result
 * Returns whether the answers are held. A failed holder read falls back to
 * the full check; a failed full check throws, and the caller holds the
 * answers, as before.
 */
function createCourseAnswersHold({ limit = HOLDER_MEMORY_LIMIT } = {}) {
  const holders = new Map();
  const remember = (key, studentId) => {
    holders.delete(key);
    if (!studentId) return;
    holders.set(key, studentId);
    if (holders.size > limit) holders.delete(holders.keys().next().value);
  };
  const held = async ({ assignmentId, stage, shared, policy, readHolder, fullCheck }) => {
    const key = `${assignmentId}|${stage}`;
    const holder = holders.get(key);
    if (holder) {
      let still = false;
      try {
        const facts = await readHolder(holder);
        still = holderStillHolds({ shared, policy, stage, assignmentId, studentId: holder, ...facts });
      } catch {
        still = false;
      }
      if (still) return true;
    }
    const verdict = await fullCheck();
    remember(key, verdict.released ? null : verdict.heldFor?.[0] || null);
    return !verdict.released;
  };
  return { held, remembered: (assignmentId, stage) => holders.get(`${assignmentId}|${stage}`) || null };
}

module.exports = {
  HOLDER_MEMORY_LIMIT,
  answerCoverageKey,
  answersReleaseVerdict,
  createCourseAnswersHold,
  holderStillHolds,
  onTestCycleRoster,
  stillToSitStage,
};
