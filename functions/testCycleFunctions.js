// TEST CYCLES AND SECURE EXAMS: secure sessions, proctoring, corrections, release, the teacher's Test Cycle panel.
//
// One of the domain modules functions/index.js loads (see its header). The
// code here was moved from index.js as it stood; helpers that another domain
// also uses are in functionsCommon.js.

const crypto = require("crypto");
const { isDeepStrictEqual } = require("util");
const { getFirestore, FieldPath, FieldValue } = require("firebase-admin/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const authLib = require("./lib/auth");
const mathPath = require("./lib/mathPath");
const secureExam = require("./lib/secureExam");
// Rich Tool items on every secure surface: the mode-aware public payload and
// the one grading authority (see the file header).
const secureItems = require("./lib/secureItems");
const secureExamNavigation = require("./lib/secureExamNavigation");
const secureExamItems = require("./lib/secureExamItems");
const secureExamAutoFinalize = require("./lib/secureExamAutoFinalize");
// The Test Cycle rules are shared ESM; this is the CommonJS bridge to them.
const testCycleLib = require("./lib/testCycle");
// Who can still sit a stage, what an explicit release covers (a student at
// their current attempts), and the rule over both: lib/testCycleAnswersHold.js,
// where the 30-second re-check (courseAnswersHeld, below) asks it about one
// student at a time.
const testCycleAnswersHold = require("./lib/testCycleAnswersHold");
const {
  CLASS_COLLECTION,
  TEST_CYCLE_ANSWER_RELEASES,
  TEST_CYCLE_CORRECTION_PLANS,
  TEST_CYCLE_OPERATIONS,
  TEST_CYCLE_PANEL_OPTIONS,
  TEST_CYCLE_RECORDS,
  TEST_CYCLE_RETEST_PLANS,
  assertTeacherMayManageAssignment,
  assertTeacherMayManageAssignmentLifecycle,
  assignmentAudience,
  assignmentForTeacherCall,
  authoritativeStudentClassId,
  blueprintFamilyIds,
  callerEmail,
  loadBuiltInStarterPathSeed,
  loadTestCycleAssignment,
  privateOverrideFrom,
  requireStudent,
  requireTeacher,
  resolveBlueprintFamilies,
  resolveCheckpointClassPeriod,
  resolveSecureTestBlueprint,
  runTestCyclePreflight,
  studentIdentity,
  studentIdentityRecord,
  studentIndividuallyAssigned,
  studentMatchesAssignmentAudience,
  studentOverrideRef,
  studentOverrides,
  validDocumentId,
} = require("./functionsCommon");

// --- Phase 6C secure assessment runtime ------------------------------------
// Exam answer keys, response grading, integrity state, and release controls
// remain on the server. A normal browser can monitor and restrict common
// actions, but it is intentionally not represented as an OS-level lockdown
// browser.

const SECURE_EXAM_INTEGRITY_TYPES = new Set([
  "tab_switch", "window_blur", "fullscreen_exit", "copy_paste_attempt", "context_menu", "shortcut_attempt",
]);

function secureExamSessionId(request) {
  const value = String(request.data?.examSessionId || "").trim();
  if (!value || value.length > 180) throw new HttpsError("invalid-argument", "A valid examSessionId is required.");
  return value;
}

function secureExamAlignmentKeys(question = {}) {
  const source = Array.isArray(question.alignmentKeys)
    ? question.alignmentKeys
    : Array.isArray(question.teksAlignments)
      ? question.teksAlignments
      : question.teks ? [question.teks] : [];
  return [...new Set(source.map(mathPath.canonicalAlignmentKey).filter(Boolean))];
}

/*
 * ONE SECURE ITEM AS A STUDENT'S BROWSER RECEIVES IT.
 *
 * Built by `secureItems.publicItem`, which carries a Rich Tool item's
 * allowlisted tool payload (it used to be dropped here, so a graphing item
 * arrived as a bare "Answer" box) with every assistance key stripped for the
 * secure mode, then by `publicQuestion`, which removes the metadata that cues
 * a student about what is being assessed.
 */
async function secureExamPublicQuestion(question = {}, { mode = null } = {}) {
  return secureExam.publicQuestion(
    await secureItems.publicItem(question, { mode: mode || "secureTest" }),
    { examCalculatorMode: question.examCalculatorMode || question.calculatorMode || null },
  );
}

function assertStudentExamSession(snapshot, studentId) {
  if (!snapshot.exists || String(snapshot.data()?.studentId || "") !== studentId) {
    throw new HttpsError("not-found", "That secure exam session is not available.");
  }
  return snapshot.data();
}

function assertExamInProgress(session) {
  if (secureExam.TERMINAL_STATES.has(session.status)) throw new HttpsError("failed-precondition", "This exam has already been submitted.");
  if (secureExam.LOCKED_STATES.has(session.status)) throw new HttpsError("failed-precondition", "This exam is locked. Ask the proctor to review the session.", { status: session.status });
  if (session.status !== "in_progress") throw new HttpsError("failed-precondition", "This exam is not currently in progress.");
  if (secureExam.isExpired(session)) throw new HttpsError("deadline-exceeded", "The exam time has expired.");
}

/*
 * THE STUDENT'S EXTENDED-TIME ACCOMMODATION, FROM THEIR SUPPORT PROFILE.
 *
 * Read from `grades/{studentId}.profile` through the one entitlement resolver
 * (functions/shared/supportEntitlements.mjs), so a district SIS multiplier and
 * the teacher UI's "extra time" box mean the same thing here as everywhere
 * else. Applied once, when the student starts the session (below), so it
 * covers every kind of secure session — a practice test, a course Test, a
 * Retest — through one path. A profile that cannot be read grants nothing
 * extra rather than blocking the start.
 */
async function secureExamTimeMultiplierFromProfile(profile, studentId = null) {
  try {
    const entitlements = await mathPath.resolveEntitlements(profile || null);
    const multiplier = Number(entitlements?.extendedTimeMultiplier);
    return Number.isFinite(multiplier) && multiplier > 1 ? multiplier : 1;
  } catch (error) {
    console.error("secure_exam_time_accommodation_unreadable", { studentId, message: error?.message || String(error) });
    return 1;
  }
}

async function secureExamTimeMultiplier(db, studentId) {
  const snapshot = await db.collection("grades").doc(studentId).get();
  return secureExamTimeMultiplierFromProfile(snapshot.exists ? snapshot.data()?.profile || null : null, studentId);
}

/*
 * The time a not-yet-started session WILL have, so the start screen and the
 * Test Cycle card can say "includes your extended time" before the student
 * presses Start. The server applies the same multiplier at start; this only
 * describes it.
 */
function projectedSecureExamTime(session, multiplier) {
  if (session?.status !== "not_started" || !(multiplier > 1)) return {};
  const base = secureExam.timeLimitSecondsOf(session);
  if (base === null) return {};
  return {
    baseTimeLimitSeconds: base,
    timeLimitSeconds: secureExamNavigation.accommodatedTimeLimitSeconds(base, multiplier),
    extendedTimeMultiplier: multiplier,
  };
}

/** Teacher action: create a server-owned session for a rostered student. */
exports.createSecureExamSession = onCall(async (request) => {
  const teacherUid = await requireTeacher(request);
  const studentId = String(request.data?.studentId || "").trim();
  const examType = String(request.data?.examType || "").trim();
  const policy = secureExam.policyFor(examType);
  if (!studentId || studentId.length > 180) throw new HttpsError("invalid-argument", "studentId is required.");
  if (!policy) throw new HttpsError("invalid-argument", "Choose a supported exam type.");
  const db = getFirestore();
  const student = await db.collection("grades").doc(studentId).get();
  if (!student.exists || studentId === "test_connection") throw new HttpsError("not-found", "That student is not on the roster.");
  const requestedCount = Number(request.data?.questionCount);
  const requiredQuestions = Number.isInteger(requestedCount) && requestedCount > 0
    ? Math.min(policy.totalQuestions, requestedCount)
    : policy.totalQuestions;
  const ref = db.collection("examSessions").doc();
  const now = Date.now();
  const session = {
    examSessionId: ref.id,
    studentId,
    classPeriod: String(student.data()?.classPeriod || "Unassigned"),
    examType,
    title: String(request.data?.title || policy.title).trim().slice(0, 160) || policy.title,
    status: "not_started",
    requiredQuestions,
    // A shortened practice test keeps the real test's pace, not its whole
    // clock (secureExamNavigation.proportionalTimeLimitSeconds).
    timeLimitSeconds: secureExamNavigation.proportionalTimeLimitSeconds(policy, requiredQuestions),
    addedTimeSeconds: 0,
    calculatorMode: policy.calculatorMode,
    accommodationsConfirmed: request.data?.accommodationsConfirmed === true,
    feedbackReleased: false,
    // A practice test's results (score, answers, worked solutions) are the
    // student's as soon as they submit. A teacher who wants to hold them asks
    // for teacher release explicitly.
    releasePolicy: request.data?.releasePolicy === "teacher" ? "teacher" : "automatic",
    violationCount: 0,
    summary: { completedQuestions: 0, correctQuestions: 0 },
    responses: {},
    usedQuestionIds: [],
    currentQuestion: null,
    navigation: secureExamNavigation.initialNavigation({ examType, requiredQuestions }),
    createdBy: teacherUid,
    createdAt: now,
    updatedAt: now,
  };
  await ref.set(session);
  return { success: true, session: secureExam.publicSession(session, { teacher: true }) };
});

/** Student action: start or resume only their teacher-created session. */
exports.startSecureExamSession = onCall(async (request) => {
  const { studentId } = requireStudent(request);
  const examSessionId = secureExamSessionId(request);
  const db = getFirestore();
  const ref = db.collection("examSessions").doc(examSessionId);
  // Before anything is started or resumed: a course test is only enterable at
  // the stage the Test Cycle says the student is on. A simulation has no
  // `courseTest` block and this is a no-op for it.
  const entrySnapshot = await ref.get();
  const entrySession = assertStudentExamSession(entrySnapshot, studentId);
  let entry = null;
  try {
    entry = await assertCourseTestEntryAllowed(db, entrySession, studentId);
  } catch (error) {
    // A Test under way that the teacher has paused or archived: the screen
    // gets where it stands (states only, the clock stopped) and shows the
    // pause, rather than an error. Nothing is issued, saved or submitted.
    if (secureExam.pauseHoldsOf(entrySession).includes("assignment")
      && (entrySession.status === "in_progress" || secureExam.LOCKED_STATES.has(entrySession.status))) {
      return { success: true, session: secureExam.publicSession(entrySession) };
    }
    throw error;
  }
  const timeMultiplier = entrySession.status === "not_started" ? await secureExamTimeMultiplier(db, studentId) : 1;
  const session = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = assertStudentExamSession(snapshot, studentId);
    if (secureExam.TERMINAL_STATES.has(current.status)) return current;
    if (secureExam.LOCKED_STATES.has(current.status)) return current;
    if (current.status !== "not_started" && current.status !== "in_progress") throw new HttpsError("failed-precondition", "This exam cannot be started.");
    if (current.status === "in_progress") {
      // A resume of a session started before the finalizer's hint existed
      // stores it now, derived the way every call derives the deadline.
      if (current.autoFinalizeAt !== undefined) return current;
      const resumed = { ...current, autoFinalizeAt: secureExam.autoFinalizeAtFor(current, Date.now()) };
      transaction.set(ref, { autoFinalizeAt: resumed.autoFinalizeAt }, { merge: true });
      return resumed;
    }
    // The course gate again, through this transaction: a pause or archive that
    // lands while the start is in flight is seen here (or retries it), so a
    // Test never starts on a closed assessment, where no clock hold would
    // cover it (holdCourseTestClocks holds only Tests already under way).
    await assertCourseTestEntryAllowed(db, current, studentId, { transaction });
    const now = Date.now();
    // The accommodation multiplies the test's own limit once, at start; an
    // untimed test stays untimed.
    const baseLimit = secureExam.timeLimitSecondsOf(current);
    const accommodated = baseLimit !== null && timeMultiplier > 1 && current.extendedTimeMultiplier === undefined
      ? {
        baseTimeLimitSeconds: baseLimit,
        timeLimitSeconds: secureExamNavigation.accommodatedTimeLimitSeconds(baseLimit, timeMultiplier),
        extendedTimeMultiplier: timeMultiplier,
      }
      : {};
    const started = {
      ...current,
      ...accommodated,
      navigation: secureExamNavigation.navigationOf(current),
      status: "in_progress",
      startedAt: now,
      updatedAt: now,
    };
    // Where the abandoned-test finalizer will look (secureExam.autoFinalizeAtFor).
    const next = { ...started, autoFinalizeAt: secureExam.autoFinalizeAtFor(started, now) };
    transaction.set(ref, next);
    return next;
  });
  // The first Test start inside a class-period window records that window's
  // times (record-only: nothing reads them yet; see recordClassTestSitting).
  // After the start is committed, and it never fails the start.
  if (entry?.schedule && entry.isRetest === false && entrySession.status === "not_started" && session.status === "in_progress") {
    await recordClassTestSitting(db, entry.shared, { assignmentId: entry.assignmentId, schedule: entry.schedule });
  }
  await syncTestCycleSessionState(db, session);
  return { success: true, session: secureExam.publicSession(session) };
});

/** Student dashboard: discover only the caller's assigned secure sessions. */
exports.listStudentSecureExamSessions = onCall(async (request) => {
  const { studentId } = requireStudent(request);
  const db = getFirestore();
  const [snapshot, timeMultiplier] = await Promise.all([
    db.collection("examSessions").where("studentId", "==", studentId).limit(50).get(),
    secureExamTimeMultiplier(db, studentId),
  ]);
  const stale = await staleCourseTestSessionIds(db, studentId, snapshot.docs.map((docSnapshot) => docSnapshot.data()));
  const sessions = snapshot.docs
    .filter((docSnapshot) => !stale.has(docSnapshot.id))
    .map((docSnapshot) => {
      const session = docSnapshot.data();
      return secureExam.publicSession({ ...session, ...projectedSecureExamTime(session, timeMultiplier) });
    })
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  return { sessions };
});

/*
 * COURSE-TEST SESSIONS A STUDENT SHOULD NO LONGER BE SHOWN.
 *
 * Starting any of these is already refused (assertCourseTestEntryAllowed), but
 * the list still handed the student a card for it — a Start button that could
 * only ever answer "no longer available". A session is left off the list when:
 *
 *   - its assessment was deleted;
 *   - it was replaced (a teacher reset, or the original Test started after a
 *     stand-in Retest was opened): the record's stage points elsewhere;
 *   - its assessment is archived and the session was never finished. A
 *     finished one stays, because a student may still read results that were
 *     released before the archive.
 *
 * Practice tests (no `courseTest`) are never touched.
 */
async function staleCourseTestSessionIds(db, studentId, sessions) {
  const stale = new Set();
  const course = sessions.filter((session) => validDocumentId(session?.courseTest?.assignmentId));
  if (!course.length) return stale;
  const shared = await testCycleLib.shared();
  const assignmentIds = [...new Set(course.map((session) => String(session.courseTest.assignmentId)))];
  const [assignmentSnapshots, recordSnapshots] = await Promise.all([
    db.getAll(...assignmentIds.map((id) => db.collection("assignments").doc(id)), { fieldMask: ["archived"] }),
    db.getAll(...assignmentIds.map((id) => db.collection(TEST_CYCLE_RECORDS).doc(testCycleRecordKey(id, studentId)))),
  ]);
  const assignments = new Map(assignmentSnapshots.map((entry) => [entry.id, entry.exists ? entry.data() || {} : null]));
  const records = new Map(recordSnapshots.map((entry, index) => [assignmentIds[index], entry.exists ? entry.data() : null]));
  course.forEach((session) => {
    const assignmentId = String(session.courseTest.assignmentId);
    const assignment = assignments.get(assignmentId);
    const record = shared.record.normalizeTestCycleRecord(records.get(assignmentId) || { assignmentId, studentId });
    const finished = secureExam.TERMINAL_STATES.has(session.status);
    if (!assignment
      || !recordStageSessionIsCurrent(shared, record, session)
      || (assignment.archived === true && !finished)) {
      stale.add(String(session.examSessionId || ""));
    }
  });
  return stale;
}

/** Student review: released correctness, answers and worked solutions. */
exports.getStudentSecureExamReview = onCall(async (request) => {
  const { studentId } = requireStudent(request);
  const examSessionId = secureExamSessionId(request);
  const snapshot = await getFirestore().collection("examSessions").doc(examSessionId).get();
  const session = assertStudentExamSession(snapshot, studentId);
  if (!secureExam.TERMINAL_STATES.has(session.status)) {
    throw new HttpsError("failed-precondition", "Finish the exam before opening review.");
  }
  if (session.feedbackReleased !== true) {
    throw new HttpsError("failed-precondition", "Your teacher has not released feedback for this exam yet.");
  }
  /*
   * NOT AN OPEN BOOK FOR ANOTHER ATTEMPT (secureExam.courseReviewBlockedBy).
   *
   * A released course Test's or Retest's review stays closed while the student
   * has another attempt of the cycle open: the Retest, or the new Test or
   * Retest a teacher's reset assigned (the old session keeps its release). The
   * Test Cycle card hides "Review my Test" at the same stages; this is the
   * server holding the line for any screen that asks.
   */
  let withSolutions = true;
  if (secureExam.isCourseTestSession(session) && session.courseTest?.assignmentId) {
    const shared = await testCycleLib.shared();
    const record = await readTestCycleRecord(getFirestore(), session.courseTest.assignmentId, studentId, shared);
    const blocked = secureExam.courseReviewBlockedBy(record, { examSessionId, cycleStage: session.courseTest.cycleStage });
    if (blocked) throw new HttpsError("failed-precondition", blocked.message, { reason: blocked.reason });
    const stage = String(session.courseTest.cycleStage || "") === "retest" ? "retest" : "test";
    try {
      withSolutions = !(await courseAnswersHeld(getFirestore(), shared, session.courseTest.assignmentId, stage));
    } catch (error) {
      // Fail closed: the review shows, and the answers wait.
      console.error("course_answers_release_failed", { examSessionId, message: error?.message || String(error) });
      withSolutions = false;
    }
  }
  /*
   * The same line for practice tests. Two practice tests of one exam draw from
   * the same exam-style item families, so a released practice test's answers
   * and solutions stay closed while the student has another practice test of
   * that exam under way (started, or paused), and open again once it is
   * submitted. A practice test that has not been started does not close it.
   */
  if (!secureExam.isCourseTestSession(session)) {
    // Every session of this exam, with no cap: a capped, unordered read of the
    // student's whole history could miss the one under way.
    const examType = String(session.examType || "");
    const sessions = getFirestore().collection("examSessions").where("studentId", "==", studentId);
    const others = await (examType ? sessions.where("examType", "==", examType) : sessions).get();
    const openSameExam = others.docs.some((docSnapshot) => {
      const other = docSnapshot.data() || {};
      return docSnapshot.id !== examSessionId
        && String(other.examType || "") === String(session.examType || "")
        && (other.status === "in_progress" || secureExam.LOCKED_STATES.has(other.status));
    });
    if (openSameExam) {
      throw new HttpsError("failed-precondition", "These results open again when you finish the practice test you have started.", { reason: "practice_test_open" });
    }
  }
  const review = secureExam.publicReview(session, { withSolutions });
  /*
   * Worked steps for a released item with none of its own (CT02: the District
   * DOL #2 retest), built here from the student's own issued items and stored
   * nowhere — so only this released review, past every gate above, carries
   * them (secureExamItems.withReleasedWorkedSteps).
   */
  const reviewWithSteps = await secureExamItems.withReleasedWorkedSteps(review, {
    session,
    readItems: (ids) => secureExamItems.readIssuedItems(snapshot.ref, ids),
  });
  return { success: true, review: reviewWithSteps };
});
const TEST_CYCLE_ACTION_OPTIONS = Object.freeze({ memory: "512MiB", timeoutSeconds: 120 });
const TEST_CYCLE_SWEEP_OPTIONS = Object.freeze({ memory: "512MiB", timeoutSeconds: 300 });

/** Every active student in the assignment's classes, by id. */
async function testCycleRosterIds(db, assignment) {
  const ids = new Set();
  for (const classId of assignmentAudience(assignment).classIds) {
    // eslint-disable-next-line no-await-in-loop
    const snapshot = await db.collection("grades").where("classId", "==", classId).select("status").get();
    snapshot.docs.forEach((doc) => {
      if (doc.id !== "test_connection" && doc.data()?.status !== "inactive") ids.add(doc.id);
    });
  }
  return ids;
}

/*
 * THE ROSTER, CACHED FOR A REVIEW'S RE-CHECKS — AND ONLY EVER TO HOLD.
 *
 * A student with a review open asks again every 30 seconds, and each ask
 * read every class's roster. On that path the roster is cached per assignment
 * (per server instance, for a minute, keyed by its class list). A cached
 * roster can only miss a student, and a missing student can only make the
 * answers look released, so a released verdict is always recomputed from a
 * fresh read: while classmates still test (the common case) the re-check
 * reads no roster, and nothing opens early.
 */
const ROSTER_CACHE_TTL_MS = 60 * 1000;
const ROSTER_CACHE_LIMIT = 500;
const testCycleRosterCache = new Map();
async function cachedTestCycleRosterIds(db, assignment, assignmentId, { fresh = false } = {}) {
  const classKey = assignmentAudience(assignment).classIds.join("|");
  const cached = testCycleRosterCache.get(assignmentId);
  if (!fresh && cached && cached.classKey === classKey && Date.now() - cached.at < ROSTER_CACHE_TTL_MS) {
    return { ids: cached.ids, cached: true };
  }
  const ids = await testCycleRosterIds(db, assignment);
  testCycleRosterCache.delete(assignmentId);
  testCycleRosterCache.set(assignmentId, { at: Date.now(), classKey, ids });
  if (testCycleRosterCache.size > ROSTER_CACHE_LIMIT) testCycleRosterCache.delete(testCycleRosterCache.keys().next().value);
  return { ids, cached: false };
}

async function courseAnswersRelease(db, shared, assignmentId, stage, known = {}) {
  const id = String(assignmentId);
  const release = (await db.collection(TEST_CYCLE_ANSWER_RELEASES).doc(id).get()).data()?.[stage] || null;
  const assignment = known.assignment || (await db.collection("assignments").doc(id).get()).data() || {};
  const policy = shared.policy.normalizeTestCyclePolicy(assignment.assessmentPolicy) || shared.policy.defaultTestCyclePolicy();
  const records = known.records || new Map((await db.collection(TEST_CYCLE_RECORDS).where("assignmentId", "==", id).get())
    .docs.map((doc) => [String(doc.data()?.studentId || ""), doc.data()]));
  let rosterIds = known.rosterIds;
  let rosterFromCache = false;
  if (!rosterIds && known.cacheRoster) {
    const roster = await cachedTestCycleRosterIds(db, assignment, id);
    rosterIds = roster.ids;
    rosterFromCache = roster.cached;
  }
  if (!rosterIds) rosterIds = await testCycleRosterIds(db, assignment);
  // Everyone on the roster and every record holder (answersReleaseVerdict).
  const verdict = testCycleAnswersHold.answersReleaseVerdict({ shared, policy, stage, assignmentId: id, release, records, rosterIds });
  if (rosterFromCache && verdict.released) {
    // A cached roster only holds: a released verdict is checked against a fresh one.
    const fresh = await cachedTestCycleRosterIds(db, assignment, id, { fresh: true });
    return courseAnswersRelease(db, shared, assignmentId, stage, { assignment, records, rosterIds: fresh.ids });
  }
  return verdict;
}

/*
 * ARE THE ANSWERS STILL HELD? — the question a review and Corrections ask
 * (PF03).
 *
 * The full check above reads every record of the cycle. A student in
 * Corrections with "Review my Test" open asks every 30 seconds, so the student
 * the last full check found holding the answers is asked about first: their
 * record, the release, and their grades document when they have no record —
 * the same rule, about one student (testCycleAnswersHold.holderStillHolds).
 * While they hold them, the full check could only say "held" too. When they do
 * not, the full check runs exactly as before. Released is never remembered.
 */
const courseAnswersHold = testCycleAnswersHold.createCourseAnswersHold();
async function courseAnswersHeld(db, shared, assignmentId, stage, known = {}) {
  const id = String(assignmentId);
  const assignment = known.assignment || (await db.collection("assignments").doc(id).get()).data() || {};
  const policy = shared.policy.normalizeTestCyclePolicy(assignment.assessmentPolicy) || shared.policy.defaultTestCyclePolicy();
  return courseAnswersHold.held({
    assignmentId: id,
    stage,
    shared,
    policy,
    readHolder: async (studentId) => {
      const [releaseSnapshot, recordSnapshot] = await Promise.all([
        db.collection(TEST_CYCLE_ANSWER_RELEASES).doc(id).get(),
        db.collection(TEST_CYCLE_RECORDS).doc(testCycleRecordKey(id, studentId)).get(),
      ]);
      const recordData = recordSnapshot.exists ? recordSnapshot.data() : null;
      return {
        release: releaseSnapshot.data()?.[stage] || null,
        recordData,
        // A record holder counts whether or not they are on the roster.
        onRoster: recordData ? false : testCycleAnswersHold.onTestCycleRoster(
          await db.collection("grades").doc(studentId).get(),
          assignmentAudience(assignment).classIds,
        ),
      };
    },
    fullCheck: () => courseAnswersRelease(db, shared, id, stage, { assignment, cacheRoster: true }),
  });
}

/*
 * "RELEASE ANSWERS AND WORKED SOLUTIONS": the teacher opens them before every
 * student who can still sit the stage has submitted. The screen's confirm
 * names those students and sends back their coverage keys (student and
 * attempts, answerCoverageKey); the release covers exactly those. If anyone
 * still testing is not on that list (someone joined, or an attempt was reset,
 * since the page loaded), nothing is released: the teacher refreshes and
 * confirms the new list, rather than opening the answers to a student nobody
 * was told about.
 */
exports.releaseTestCycleAnswers = onCall(TEST_CYCLE_ACTION_OPTIONS, async (request) => {
  const db = getFirestore();
  const assignmentSnapshot = await assignmentForTeacherCall(request, db);
  const { teacherUid } = await assertTeacherMayManageAssignment(request, assignmentSnapshot);
  const { assignmentId, assignment, shared } = await loadTestCycleAssignment(db, assignmentSnapshot.id, { allowInvalid: true });
  const stage = String(request.data?.stage || "test").trim() === "retest" ? "retest" : "test";
  const confirmed = new Set((Array.isArray(request.data?.confirmed) ? request.data.confirmed : []).slice(0, 5000).map(String));
  const { stillTestingKeys } = await courseAnswersRelease(db, shared, assignmentId, stage, { assignment });
  const unnamed = stillTestingKeys.filter((key) => !confirmed.has(key));
  if (unnamed.length) {
    throw new HttpsError(
      "failed-precondition",
      `${unnamed.length === 1 ? "1 student who is" : `${unnamed.length} students who are`} still testing ${unnamed.length === 1 ? "was" : "were"} not on the list you confirmed. Refresh, check the list and release again.`,
      { reason: "still_testing_changed", unnamed: unnamed.length },
    );
  }
  await db.collection(TEST_CYCLE_ANSWER_RELEASES).doc(assignmentId).set({
    assignmentId,
    [stage]: { releasedAt: Date.now(), releasedBy: teacherUid, coveredKeys: stillTestingKeys },
  }, { merge: true });
  return { success: true, stage, covered: stillTestingKeys.length };
});

/** Where a navigation request may go, or the student-facing refusal. */
function secureExamTarget(session, position, closeModule) {
  const target = secureExamNavigation.resolveTarget(session, { position, closeModule });
  if (target.error === "complete") throw new HttpsError("failed-precondition", target.reason);
  if (target.error === "invalid") throw new HttpsError("invalid-argument", target.reason);
  if (target.error) throw new HttpsError("failed-precondition", target.reason, { navigation: target.error });
  return target;
}

/*
 * The next simulation item, drawn at random from the trusted exam-style bank.
 *
 * Secure simulations use the same verified, generator-backed assessment
 * families as CCMR My Path. Selecting from the trusted built-in Path package
 * keeps exam format, answer generation and grading on the same server-side
 * contract students already use for assessment-specific Path practice. The
 * draw is seeded by the session and the question number
 * (secureExamNavigation.seededOrder): random across sessions, reproducible on
 * a retry, never chosen by the browser.
 */
async function buildSimulationExamItem({ examSessionId, session, position, runtimeMode }) {
  const navigationState = secureExamNavigation.navigationOf(session);
  const used = new Set([
    ...(Array.isArray(session.usedQuestionIds) ? session.usedQuestionIds.map(String) : []),
    ...navigationState.itemOrder.map((id) => String(navigationState.items[id]?.bankQuestionId || "")).filter(Boolean),
  ]);
  const targetDomainId = secureExam.nextDomainId(session);
  const assessmentItems = loadBuiltInStarterPathSeed().filter((question) => {
    const context = question?.assessmentContext || {};
    return question?.active !== false
      && context.examStyle === true
      && String(context.framework || "") === session.examType
      && !used.has(String(question.id || ""));
  });
  const domainFor = (question) => (Array.isArray(question?.alignments) ? question.alignments : [])
    .find((entry) => String(entry?.framework || "") === session.examType && String(entry?.evidenceMode || entry?.alignmentType || "") === "direct")?.domainId || null;
  const domainCandidates = targetDomainId ? assessmentItems.filter((question) => domainFor(question) === targetDomainId) : assessmentItems;
  const candidates = domainCandidates.length ? domainCandidates : assessmentItems;
  if (!candidates.length) throw new HttpsError("failed-precondition", `No unused secure ${session.examType} exam items are available.`);
  const authored = secureExamNavigation.seededOrder(`${examSessionId}|${position}`, candidates, (question) => question?.id)[0];
  const questionInstanceId = mathPath.runtimeId("examq");
  const instantiated = await mathPath.instantiateQuestion(authored, `${examSessionId}|${questionInstanceId}`);
  if (!instantiated.question) throw new HttpsError("failed-precondition", "This secure exam item could not be generated.");
  const issuedQuestion = instantiated.question;
  const issuePlan = await mathPath.buildIssuePlan(issuedQuestion);
  if (!issuePlan.issuable) throw new HttpsError("failed-precondition", "This secure exam item could not be graded securely.");
  // A simulation item that names a tool must be a tool certified for secure
  // delivery, exactly as a course Test item must. No simulation bank item uses
  // one today; this is what keeps it that way unless one is certified.
  const simulationCertification = await secureItems.certifyItem(issuedQuestion, { mode: runtimeMode });
  if (!simulationCertification.compatible) throw new HttpsError("failed-precondition", simulationCertification.reason || "This secure exam item cannot be delivered securely.");
  return {
    storedItem: secureItems.storableItem({
      ...issuedQuestion,
      bankQuestionId: authored.id,
      alignmentKeys: secureExamAlignmentKeys(issuedQuestion),
      questionInstanceId,
      attemptsAllowed: 1,
      attemptsUsed: 0,
      assessmentDomainId: domainFor(authored),
      generatorParameters: instantiated.parameters,
      privateGrading: issuePlan.privateGrading,
      ...(issuePlan.toolPayload || {}),
    }),
    planEntry: null,
  };
}

/*
 * ISSUE OR REOPEN ONE QUESTION BY NUMBER.
 *
 * `position` (zero-based) names the question the student is moving to: any
 * question already opened, or the next unopened one — which is how a student
 * skips. An item is still issued only when the student first reaches it, from
 * the plan stored before they could start. Without `position` this is the
 * older linear call: the first open question, else the next new one.
 *
 * Expected answers never leave Functions, and nothing here says whether any
 * saved answer is right.
 */
exports.issueSecureExamQuestion = onCall(async (request) => {
  const { studentId } = requireStudent(request);
  const examSessionId = secureExamSessionId(request);
  const requestedPosition = request.data?.position;
  const closeModule = request.data?.closeModule === true;
  const db = getFirestore();
  const sessionRef = db.collection("examSessions").doc(examSessionId);
  const snapshot = await sessionRef.get();
  const session = assertStudentExamSession(snapshot, studentId);
  assertExamInProgress(session);
  /*
   * THE GATE IS RE-CHECKED ON EVERY ISSUE, NOT ONLY AT START.
   *
   * Start is the only call a screen makes once, so it used to be the only call
   * that asked the Test Cycle whether this student may be here. Everything that
   * changes after that — a teacher closing the retest, resetting the session,
   * archiving or pausing the assessment — went unnoticed by a tab that was
   * already open: it kept issuing secure questions.
   */
  if (secureExam.isCourseTestSession(session)) await assertCourseTestEntryAllowed(db, session, studentId);
  // The mode every item of this session renders under: Secure Test, or Secure
  // Retest for a Test Cycle's retest. Never a practice mode.
  const runtimeMode = await secureItems.runtimeModeForSession(session);
  const target = secureExamTarget(session, requestedPosition, closeModule);

  // A new item is generated before the transaction (generation reads the bank)
  // and appended inside it only if that position is still unissued.
  const generated = target.issuing
    ? (secureExam.isCourseTestSession(session)
      ? await buildCourseTestExamItem(db, { session, runtimeMode })
      : await buildSimulationExamItem({ examSessionId, session, position: target.position, runtimeMode }))
    : null;

  const outcome = await db.runTransaction(async (transaction) => {
    const freshSnapshot = await transaction.get(sessionRef);
    const fresh = assertStudentExamSession(freshSnapshot, studentId);
    assertExamInProgress(fresh);
    const upgrade = await secureExamItems.upgradeSession(sessionRef, fresh);
    const current = upgrade.session;
    const navigationState = secureExamNavigation.navigationOf(current);
    const position = target.position;
    let next = current;
    let itemData = null;
    let questionInstanceId = navigationState.itemOrder[position] || null;
    if (questionInstanceId) {
      // Reopening (or a concurrent issue already filled this position).
      const pending = upgrade.writes.find((write) => write.ref.id === questionInstanceId);
      if (pending) itemData = pending.data;
      else if (navigationState.items[questionInstanceId]?.state === secureExamNavigation.ITEM_STATE.OPEN) {
        const itemSnapshot = await transaction.get(secureExamItems.itemRef(sessionRef, questionInstanceId));
        itemData = itemSnapshot.exists ? itemSnapshot.data() : null;
      }
      next = { ...current, navigation: { ...navigationState, cursor: position } };
    } else {
      if (!generated || position !== navigationState.itemOrder.length) {
        throw new HttpsError("aborted", "The test changed while this question was opening. Try again.");
      }
      const stored = generated.storedItem;
      questionInstanceId = String(stored.questionInstanceId);
      itemData = { item: stored, draftResponse: null, issuedAt: Date.now() };
      const items = { ...navigationState.items, [questionInstanceId]: secureExamItems.navigationEntryFor(stored, position) };
      next = {
        ...current,
        navigation: {
          ...navigationState,
          itemOrder: [...navigationState.itemOrder, questionInstanceId],
          items,
          cursor: position,
          closedThrough: target.closesThrough !== null && target.closesThrough !== undefined
            ? Math.max(navigationState.closedThrough, target.closesThrough)
            : navigationState.closedThrough,
        },
        usedQuestionIds: [...new Set([...(current.usedQuestionIds || []), stored.bankQuestionId].filter(Boolean))],
        // The issued instance id is written back onto the plan entry, which is
        // what later lets the corrections algorithm join evidence to blueprint
        // slots and lets the retest audit prove it reused nothing.
        ...(generated.planEntry ? {
          issuancePlan: {
            ...current.issuancePlan,
            entries: (current.issuancePlan?.entries || []).map((planEntry) => (
              planEntry.slotId === generated.planEntry.slotId ? { ...planEntry, questionInstanceId } : planEntry
            )),
          },
        } : {}),
      };
      transaction.set(secureExamItems.itemRef(sessionRef, questionInstanceId), itemData);
    }
    upgrade.writes.forEach((write) => transaction.set(write.ref, write.data));
    next = { ...next, updatedAt: Date.now() };
    transaction.set(sessionRef, next);
    return { next, itemData, position, questionInstanceId };
  });
  const recorded = !outcome.itemData;
  return {
    position: outcome.position,
    recorded,
    questionInstance: recorded ? null : await secureExamPublicQuestion(outcome.itemData.item, { mode: runtimeMode }),
    draftResponse: recorded ? null : secureItems.publicDraft(outcome.itemData.draftResponse),
    session: secureExam.publicSession(outcome.next),
  };
});

/*
 * A secure response or draft, as the server will store it.
 *
 * `responses` are typed field answers; `toolState` is the regression panel's
 * calculator work; `rawJson` is a Rich Tool's serialized construction — the
 * student's graph, intervals, final relation, placement state — bounded and
 * stripped of any verdict the browser attached. `workspaceDraftsJson` is the
 * tool's own internal draft, kept ONLY on an open item's draft so a reload on
 * another device reopens the same construction; it is never part of a
 * recorded response. Both JSON fields are strings because Firestore cannot
 * hold an array inside an array, and tool work is full of coordinate pairs.
 */
async function sanitizeSecureExamDraft(responsePayload, supportUsage, { draftKey = null, includeWorkspaceDrafts = false } = {}) {
  const { sanitizeSecureExamToolDraft } = require("./lib/secureExamToolDraft");
  const toolState = sanitizeSecureExamToolDraft(responsePayload?.toolState);
  const source = responsePayload?.responses && typeof responsePayload.responses === "object" && !Array.isArray(responsePayload.responses) ? responsePayload.responses : {};
  const responses = {};
  Object.entries(source).slice(0, 20).forEach(([key, value]) => {
    const id = String(key).trim().slice(0, 120);
    if (id) responses[id] = String(value ?? "").slice(0, 2000);
  });
  if (JSON.stringify(responses).length > 10000) throw new HttpsError("invalid-argument", "Secure exam draft is too large.");
  let toolFields = {};
  try {
    toolFields = await secureItems.storedToolFields(responsePayload, { draftKey, includeWorkspaceDrafts });
  } catch (error) {
    if (error?.code === "raw_too_large") throw new HttpsError("invalid-argument", "This answer is too large to record. Remove some work and try again.");
    throw error;
  }
  const sourceSupport = supportUsage && typeof supportUsage === "object" ? supportUsage : {};
  return {
    responsePayload: { responses, ...(toolState ? { toolState } : {}), ...toolFields },
    supportUsage: {
      accommodations: Array.isArray(sourceSupport.accommodations) ? sourceSupport.accommodations.map(String).slice(0, 20) : [],
      modifications: Array.isArray(sourceSupport.modifications) ? sourceSupport.modifications.map(String).slice(0, 20) : [],
      calculatorUsed: Boolean(sourceSupport.calculatorUsed),
      teacherAssisted: Boolean(sourceSupport.teacherAssisted),
    },
  };
}

/** An open, writable item of this session, or the refusal a stale screen gets. */
async function readWritableExamItem(transaction, sessionRef, upgrade, questionInstanceId) {
  const navigationState = secureExamNavigation.navigationOf(upgrade.session);
  const entry = navigationState.items[questionInstanceId];
  const position = navigationState.itemOrder.indexOf(questionInstanceId);
  if (!entry || entry.state !== secureExamNavigation.ITEM_STATE.OPEN || position < 0 || secureExamNavigation.positionClosed(navigationState, position)) {
    throw new HttpsError("failed-precondition", "That question is no longer active.");
  }
  const pending = upgrade.writes.find((write) => write.ref.id === questionInstanceId);
  if (pending) return { navigationState, entry, itemData: pending.data };
  const itemSnapshot = await transaction.get(secureExamItems.itemRef(sessionRef, questionInstanceId));
  if (!itemSnapshot.exists) throw new HttpsError("failed-precondition", "That question is no longer active.");
  return { navigationState, entry, itemData: itemSnapshot.data() || {} };
}

/*
 * Transactional draft autosave, for ANY open question of the session. Draft
 * values are student-authored and private. `flagged` marks the question for
 * review; it may be sent alone (no `responsePayload`) without touching the
 * saved answer. Nothing is graded here.
 */
exports.saveSecureExamDraft = onCall(async (request) => {
  const { studentId } = requireStudent(request);
  const examSessionId = secureExamSessionId(request);
  const questionInstanceId = String(request.data?.questionInstanceId || "").trim();
  if (!questionInstanceId || questionInstanceId.length > 180) throw new HttpsError("invalid-argument", "questionInstanceId is required.");
  const hasPayload = request.data?.responsePayload !== undefined && request.data?.responsePayload !== null;
  const flagged = typeof request.data?.flagged === "boolean" ? request.data.flagged : undefined;
  if (!hasPayload && flagged === undefined) throw new HttpsError("invalid-argument", "Send an answer draft or a review flag.");
  // Only the open item's own workspace drafts are accepted (secureItemDraftKey).
  const draft = hasPayload
    ? await sanitizeSecureExamDraft(request.data?.responsePayload, request.data?.supportUsage, {
      draftKey: await secureItems.examItemDraftKey(examSessionId, questionInstanceId),
      includeWorkspaceDrafts: true,
    })
    : null;
  const hasWork = draft ? await secureItems.payloadHasWork(secureExamItems.recordedPayloadOf(draft)) : undefined;
  // Which page sent this save and how new it is (secureExamItems.staleDraftWrite).
  const stamp = draft ? secureExamItems.draftStampOf(request.data) : null;
  const db = getFirestore();
  const ref = db.collection("examSessions").doc(examSessionId);
  const outcome = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const session = assertStudentExamSession(snapshot, studentId);
    // A course Test the teacher has paused, archived or closed takes no edits,
    // just as it issues no questions: what finalize grades is what was saved
    // while it was open. Not a lock — the work resumes when it reopens.
    if (secureExam.isCourseTestSession(session)) await assertCourseTestEntryAllowed(db, session, studentId, { transaction });
    assertExamInProgress(session);
    const upgrade = await secureExamItems.upgradeSession(ref, session);
    const { navigationState, entry, itemData } = await readWritableExamItem(transaction, ref, upgrade, questionInstanceId);
    // An older save from this page, arriving after a newer one: write nothing.
    if (draft && secureExamItems.staleDraftWrite(itemData?.draftResponse, stamp)) {
      return { next: upgrade.session, stale: true, answeredChanged: false };
    }
    const now = Date.now();
    const nextEntry = {
      ...entry,
      ...(hasWork !== undefined ? { hasWork } : {}),
      ...(flagged !== undefined ? { flagged } : {}),
    };
    const navigationNext = { ...navigationState, items: { ...navigationState.items, [questionInstanceId]: nextEntry } };
    const base = { ...upgrade.session, navigation: navigationNext, updatedAt: now };
    const next = { ...base, summary: { ...(base.summary || {}), completedQuestions: secureExamNavigation.answeredCount(base) } };
    upgrade.writes.forEach((write) => {
      if (write.ref.id !== questionInstanceId || !draft) transaction.set(write.ref, write.data);
    });
    if (draft) transaction.set(secureExamItems.itemRef(ref, questionInstanceId), { ...itemData, draftResponse: { ...draft, ...(stamp || {}) }, updatedAt: now });
    transaction.set(ref, next);
    return { next, answeredChanged: hasWork !== undefined && hasWork !== (entry.hasWork === true) };
  });
  // The teacher's table reads "in progress, 12 of 25" — kept current only
  // when the answered count actually moved, not on every keystroke.
  if (outcome.answeredChanged && secureExam.isCourseTestSession(outcome.next)) await syncTestCycleSessionState(db, outcome.next);
  return { success: true, recorded: outcome.stale !== true, ...(outcome.stale ? { stale: true } : {}), navigation: secureExam.publicSession(outcome.next).navigation, answeredQuestions: secureExamNavigation.answeredCount(outcome.next) };
});

/*
 * RELEASE A PRACTICE TEST'S RESULTS THE MOMENT IT IS FINISHED.
 *
 * Only a session created with `releasePolicy: "automatic"` (a practice test;
 * never a course Test, whose release writes a recorded grade and is the
 * teacher's call). It runs the same release a teacher's button runs, so the
 * released evidence and the review are identical.
 */
async function autoReleaseSecureSession(db, session) {
  if (!session || session.releasePolicy !== "automatic" || secureExam.isCourseTestSession(session)) return session;
  if (!secureExam.TERMINAL_STATES.has(session.status) || session.feedbackReleased === true) return session;
  const ref = db.collection("examSessions").doc(String(session.examSessionId));
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return session;
    const fresh = snapshot.data() || {};
    if (fresh.feedbackReleased === true || !secureExam.TERMINAL_STATES.has(fresh.status)) return fresh;
    return releaseSessionFeedbackInTransaction(transaction, db, {
      ref, session: fresh, examSessionId: fresh.examSessionId, teacherUid: "system:automaticRelease", now: Date.now(),
    });
  });
}

/*
 * RECORD ONE ANSWER AND LOCK IT — the older, linear call.
 *
 * The navigation runtime saves drafts and grades them all at finalize; this
 * call remains so a browser still running the previous build during a deploy
 * can finish its test. The item is graded now, its result held, and it can no
 * longer be edited. Correctness stays server-only.
 */
exports.submitSecureExamResponse = onCall(async (request) => {
  // Started now, awaited just before the grading transaction: its cold import
  // overlaps the reads before it and never holds the session (secureExamItems.loadMissEvidence; it never rejects).
  const missEvidenceReady = secureExamItems.loadMissEvidence();
  const { studentId } = requireStudent(request);
  const examSessionId = secureExamSessionId(request);
  const questionInstanceId = String(request.data?.questionInstanceId || "").trim();
  const submissionId = String(request.data?.submissionId || "").trim();
  if (!questionInstanceId || !submissionId || submissionId.length > 180) throw new HttpsError("invalid-argument", "questionInstanceId and a valid submissionId are required.");
  const db = getFirestore();
  const sessionRef = db.collection("examSessions").doc(examSessionId);
  const markerRef = db.collection("examSubmissions").doc(mathPath.opaqueId("examsub", examSessionId, submissionId));
  await missEvidenceReady;
  const result = await db.runTransaction(async (transaction) => {
    const [sessionSnapshot, marker] = await Promise.all([transaction.get(sessionRef), transaction.get(markerRef)]);
    // The idempotency marker answers a retry from the SAME student. Anyone else
    // presenting the same submission id is refused exactly as if the session
    // were not theirs — which it is not — rather than handed its summary.
    const session = assertStudentExamSession(sessionSnapshot, studentId);
    if (marker.exists) {
      if (String(marker.data()?.studentId || "") !== studentId) throw new HttpsError("not-found", "That secure exam session is not available.");
      return marker.data()?.result;
    }
    // Recording an answer is an edit: a course Test the teacher has paused,
    // archived or closed takes none, by this older call either.
    if (secureExam.isCourseTestSession(session)) await assertCourseTestEntryAllowed(db, session, studentId, { transaction });
    assertExamInProgress(session);
    const upgrade = await secureExamItems.upgradeSession(sessionRef, session);
    const { navigationState, entry, itemData } = await readWritableExamItem(transaction, sessionRef, upgrade, questionInstanceId);
    // ONE GRADING AUTHORITY for field and Rich Tool items alike: a tool item is
    // graded by its Path Tool Contract grader on the student's bounded raw work.
    // Nothing the browser claims about correctness is read.
    const grading = await secureItems.gradeIssuedItem(itemData.item, request.data?.responsePayload || {});
    // Work that is not shaped like an answer to this item is an interface
    // problem ("complete the construction"), not a wrong answer: it is refused
    // before anything is recorded, so the student's one attempt is not spent
    // on a half-built graph. It says nothing about correctness.
    if (grading.rejected) {
      throw new HttpsError("invalid-argument", grading.detail || "This answer is not complete yet. Finish your work in the tool, then record it.");
    }
    const now = Date.now();
    const safeSupport = secureExamItems.safeSupportUsage(request.data?.supportUsage);
    const safeResponsePayload = (await sanitizeSecureExamDraft(request.data?.responsePayload, safeSupport)).responsePayload;
    const responseRecord = await secureExamItems.buildResponseRecord(itemData.item, {
      session: upgrade.session, responsePayload: safeResponsePayload, supportUsage: safeSupport, now,
    });
    const items = { ...navigationState.items, [questionInstanceId]: { ...entry, state: secureExamNavigation.ITEM_STATE.RECORDED, hasWork: true } };
    const navigationNext = { ...navigationState, items };
    const responses = { ...(upgrade.session.responses || {}), [questionInstanceId]: responseRecord };
    const finished = navigationNext.itemOrder.length >= Number(upgrade.session.requiredQuestions || 1)
      && secureExamNavigation.openItemIds(navigationNext).length === 0;
    const base = { ...upgrade.session, navigation: navigationNext, responses };
    const next = {
      ...base,
      status: finished ? "submitted" : "in_progress",
      submittedAt: finished ? now : upgrade.session.submittedAt || null,
      summary: {
        completedQuestions: secureExamNavigation.answeredCount(base),
        correctQuestions: Object.values(responses).filter((response) => response?.grading?.isCorrect === true).length,
      },
      usedQuestionIds: [...new Set([...(upgrade.session.usedQuestionIds || []), responseRecord.bankQuestionId].filter(Boolean))],
      currentQuestion: null,
      updatedAt: now,
    };
    const publicResult = { success: true, submissionId, recorded: true, correctnessReleased: false, needsNextQuestion: !finished, session: secureExam.publicSession(next) };
    upgrade.writes.forEach((write) => transaction.set(write.ref, write.data));
    transaction.set(sessionRef, next);
    transaction.set(markerRef, { examSessionId, studentId, submittedSlotId: entry.slotId || null, submissionId, createdAt: now, result: publicResult });
    return publicResult;
  });
  // A finished course Test moves the student's card from "Test" to "submitted"
  // without exposing a score, which is the whole point of teacher release. An
  // unfinished one still updates the answered count, so the teacher's results
  // table can say "in progress, 12 of 25" rather than only "in progress".
  const afterSnapshot = await sessionRef.get();
  if (afterSnapshot.exists && secureExam.isCourseTestSession(afterSnapshot.data())) {
    await syncTestCycleSessionState(db, afterSnapshot.data());
  }
  if (afterSnapshot.exists && result?.needsNextQuestion === false) await autoReleaseSecureSession(db, afterSnapshot.data());
  return result;
});

/*
 * Student-observed browser integrity events are idempotent and can only lock.
 * The response says how many events the session has and where the lock is, so
 * the screen can warn BEFORE the event that pauses the test.
 */
exports.recordSecureExamIntegrityEvent = onCall(async (request) => {
  const { studentId } = requireStudent(request);
  const examSessionId = secureExamSessionId(request);
  const eventId = String(request.data?.eventId || "").trim();
  const type = String(request.data?.type || "").trim();
  if (!eventId || eventId.length > 180 || !SECURE_EXAM_INTEGRITY_TYPES.has(type)) throw new HttpsError("invalid-argument", "A valid integrity event is required.");
  const details = request.data?.details && typeof request.data.details === "object" ? request.data.details : {};
  if (JSON.stringify(details).length > 2000) throw new HttpsError("invalid-argument", "Integrity event details are too large.");
  const db = getFirestore();
  const sessionRef = db.collection("examSessions").doc(examSessionId);
  const eventRef = db.collection("examIntegrityEvents").doc(mathPath.opaqueId("integrity", examSessionId, eventId));
  const threshold = secureExam.INTEGRITY_LOCK_THRESHOLD;
  return db.runTransaction(async (transaction) => {
    const [sessionSnapshot, existingEvent] = await Promise.all([transaction.get(sessionRef), transaction.get(eventRef)]);
    const session = assertStudentExamSession(sessionSnapshot, studentId);
    if (existingEvent.exists) return { success: true, duplicate: true, status: session.status, violationCount: Number(session.violationCount || 0), lockThreshold: threshold };
    if (secureExam.TERMINAL_STATES.has(session.status)) throw new HttpsError("failed-precondition", "This exam is already submitted.");
    const count = Number(session.violationCount || 0) + 1;
    const status = count >= threshold && session.status === "in_progress" ? "locked_integrity" : session.status;
    const now = Date.now();
    transaction.set(eventRef, { eventId, examSessionId, studentId, type, details, receivedAt: now });
    transaction.set(sessionRef, { ...session, violationCount: count, status, lockReason: status === "locked_integrity" ? "Integrity event threshold reached; proctor review required." : session.lockReason || null, lockedAt: status === "locked_integrity" ? now : session.lockedAt || null, updatedAt: now });
    return {
      success: true,
      status,
      violationCount: count,
      lockThreshold: threshold,
      // One more event will pause the test: the screen warns now.
      warning: status === "in_progress" && count === threshold - 1,
    };
  });
});

/*
 * FINALIZE A SESSION INSIDE THE CALLER'S TRANSACTION: grade every open item.
 *
 * Shared by the student's submit, the verified timer and the proctor's
 * force-submit, so there is one definition of how a test ends. Reads first
 * (Firestore requires every transaction read before any write); the caller
 * writes the returned session.
 */
async function finalizeSecureSessionInTransaction(transaction, ref, session, { status, now }) {
  const upgrade = await secureExamItems.upgradeSession(ref, session);
  const openItems = await secureExamItems.readOpenItems(transaction, ref, upgrade.session);
  upgrade.writes.forEach((write) => { if (!openItems.has(write.ref.id)) openItems.set(write.ref.id, write.data); });
  const graded = await secureExamItems.finalizeOpenItems(upgrade.session, openItems, now);
  // A finished test leaves the abandoned-test finalizer's sight.
  return { ...graded, status, submittedAt: now, updatedAt: now, autoFinalizeAt: null };
}

/** Student submit / verified timer autosubmit. */
exports.finalizeSecureExam = onCall(async (request) => {
  // Started now, awaited just before the grading transaction: its cold import
  // overlaps the reads before it and never holds the session (secureExamItems.loadMissEvidence; it never rejects).
  const missEvidenceReady = secureExamItems.loadMissEvidence();
  const { studentId } = requireStudent(request);
  const examSessionId = secureExamSessionId(request);
  const reason = request.data?.reason === "timeExpired" ? "timeExpired" : "studentSubmit";
  const db = getFirestore();
  const ref = db.collection("examSessions").doc(examSessionId);
  // A course-test session a teacher reset is not the student's to finish: its
  // replacement is. Finishing it anyway would mark the stage submitted with no
  // current session behind it.
  const finalizeSnapshot = await ref.get();
  const finalizeSession = assertStudentExamSession(finalizeSnapshot, studentId);
  if (secureExam.isCourseTestSession(finalizeSession)
    && !secureExam.TERMINAL_STATES.has(finalizeSession.status)
    && !(await courseTestSessionIsCurrent(db, finalizeSession))) {
    throw new HttpsError("failed-precondition", "This secure session was replaced by your teacher. Reopen the assessment from Assignments.");
  }
  await missEvidenceReady;
  const next = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const session = assertStudentExamSession(snapshot, studentId);
    if (secureExam.TERMINAL_STATES.has(session.status)) return session;
    // A student's own Submit waits while the teacher has the course Test
    // paused, archived or closed, as saves and questions do. Time running out
    // still finishes it (the deadline is checked below), grading the drafts
    // saved while it was open.
    if (reason !== "timeExpired" && secureExam.isCourseTestSession(session)) {
      await assertCourseTestEntryAllowed(db, session, studentId, { transaction });
    }
    /*
     * AN EXAM THAT WAS NEVER STARTED HAS NOTHING TO SUBMIT.
     *
     * Start is where the Test Cycle gate is enforced (Review complete, stage
     * open, session current, assessment available). Finalize used to accept a
     * `not_started` session outright, so a student could skip Review by
     * "submitting" their unopened Test from the console: the empty Test landed
     * as submitted, the record was stamped past Review, and once released the
     * student was in Corrections and on to a Retest without ever doing the
     * Review the Test was gated on.
     */
    if (session.status === "not_started") throw new HttpsError("failed-precondition", "Start the exam before submitting it.");
    if (reason === "timeExpired" && !secureExam.isExpired(session)) throw new HttpsError("failed-precondition", "The server-side exam deadline has not been reached.");
    if (reason !== "timeExpired" && secureExam.LOCKED_STATES.has(session.status)) throw new HttpsError("failed-precondition", "A locked exam must be resolved by the proctor.");
    const updated = await finalizeSecureSessionInTransaction(transaction, ref, session, {
      status: reason === "timeExpired" ? "time_expired" : "submitted",
      now: Date.now(),
    });
    transaction.set(ref, updated);
    return updated;
  });
  await syncTestCycleSessionState(db, next);
  const released = await autoReleaseSecureSession(db, next);
  return { success: true, session: secureExam.publicSession(released || next) };
});

/*
 * AN EXPIRED, ABANDONED TIMED TEST IS FINISHED BY THE SERVER.
 *
 * A student who walks away from a secure Test, Retest or practice test after
 * its time ran out used to leave it "in progress" until they came back or a
 * teacher force-submitted it, holding their own results and, for a course
 * Test, the class's released answers and worked solutions. This finishes it
 * exactly as the student's own time-up would (`finalizeSecureExam` with
 * `timeExpired`): every saved draft is graded on the server as it was saved,
 * status `time_expired`, then the Test Cycle record is synced (the card, the
 * teacher's table and the answer hold read it) and a practice test with
 * automatic release is released.
 *
 * Never early: the session is read in a transaction and finished only when
 * `secureExam.autoFinalizeDue` says its time is up by the rule every call uses
 * and the grace has passed. A student still working, one with extended time
 * left, a test a teacher's pause stopped, and one a proctor paused are not
 * finished; a stale hint is written back true instead.
 *
 * Exactly once: the transaction sees a session submitted meanwhile (by the
 * student, a proctor or a reset) and writes nothing to it, and Firestore re-runs
 * it if anyone writes the session first. Our own finalize keeps its hint until
 * the record sync and release after it have run, so a failure there is finished
 * by the next run; then the hint is cleared and a second run finds nothing.
 */
async function settleAutoFinalizedSecureSession(db, ref, session) {
  await syncTestCycleSessionState(db, session);
  await autoReleaseSecureSession(db, session);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.data() || {};
    if (!secureExam.TERMINAL_STATES.has(current.status)) return;
    if (current.autoFinalizeAt !== null && current.autoFinalizeAt !== undefined) transaction.set(ref, { autoFinalizeAt: null }, { merge: true });
  });
}

async function autoFinalizeSecureSession(db, ref, { now = Date.now(), legacyOnly = false } = {}) {
  // Started now, awaited just before the grading transaction: its cold import
  // overlaps the reads before it and never holds the session (secureExamItems.loadMissEvidence; it never rejects).
  const missEvidenceReady = secureExamItems.loadMissEvidence();
  const snapshot = await ref.get();
  if (!snapshot.exists) return "missing";
  const before = snapshot.data() || {};
  if (legacyOnly && before.autoFinalizeAt !== undefined) return "hinted";
  // A course-test session a reset replaced is the teacher's, as it is for the
  // student's own Submit (finalizeSecureExam). It leaves the finalizer's sight.
  const replaced = secureExam.isCourseTestSession(before)
    && !secureExam.TERMINAL_STATES.has(before.status)
    && !(await courseTestSessionIsCurrent(db, before));
  await missEvidenceReady;
  const result = await db.runTransaction(async (transaction) => {
    const fresh = await transaction.get(ref);
    if (!fresh.exists) return { outcome: "missing" };
    const session = fresh.data() || {};
    if (secureExam.TERMINAL_STATES.has(session.status)) {
      // Finished by us on an earlier run whose follow-ups did not complete.
      if (Number(session.autoFinalizedAt) > 0 && session.autoFinalizeAt !== null && session.autoFinalizeAt !== undefined) {
        return { outcome: "settled", session };
      }
      // Finished some other way: nothing of the student's is touched. A hint
      // left by a path that did not clear it (a previous build) is dropped.
      if (session.autoFinalizeAt !== null && session.autoFinalizeAt !== undefined) {
        transaction.set(ref, { autoFinalizeAt: null }, { merge: true });
      }
      return { outcome: "alreadyFinished" };
    }
    if (legacyOnly && session.autoFinalizeAt !== undefined) return { outcome: "hinted" };
    if (!replaced && secureExam.autoFinalizeDue(session, now)) {
      const finalized = await finalizeSecureSessionInTransaction(transaction, ref, session, { status: "time_expired", now });
      // The hint stays (cleared once the follow-ups below have run).
      const updated = { ...finalized, autoFinalizedAt: now, autoFinalizeAt: now };
      transaction.set(ref, updated);
      return { outcome: "finalized", session: updated };
    }
    const hint = replaced ? null : secureExam.autoFinalizeAtFor(session, now);
    if (session.autoFinalizeAt === hint) return { outcome: "notDue" };
    transaction.set(ref, { autoFinalizeAt: hint }, { merge: true });
    return { outcome: hint === null ? "leftForTeacher" : "rehinted" };
  });
  if (result.session) await settleAutoFinalizedSecureSession(db, ref, result.session);
  return result.outcome;
}

async function autoFinalizeSecureSessionSafely(db, ref, options, outcomes) {
  try {
    const outcome = await autoFinalizeSecureSession(db, ref, options);
    outcomes[outcome] = (outcomes[outcome] || 0) + 1;
    return outcome;
  } catch (error) {
    // One session that cannot be finished must not stop the batch. It is
    // looked at again after the backoff, so it cannot hold the batch's places.
    outcomes.failed = (outcomes.failed || 0) + 1;
    logger.error("Could not finalize an abandoned secure exam", { examSessionId: ref.id, message: error?.message || String(error) });
    const retryAt = Date.now() + secureExamAutoFinalize.RETRY_BACKOFF_MS;
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const current = snapshot.data() || {};
      if (!snapshot.exists || !(Number(current.autoFinalizeAt) > 0 || current.autoFinalizeAt === undefined)) return;
      transaction.set(ref, { autoFinalizeAt: retryAt }, { merge: true });
    }).catch((backoffError) => logger.error("Could not defer an abandoned secure exam", { examSessionId: ref.id, message: backoffError?.message || String(backoffError) }));
    return "failed";
  }
}

async function finalizeAbandonedSecureExamBatch(db, now = Date.now()) {
  const outcomes = {};
  const due = await db.collection("examSessions")
    .where("autoFinalizeAt", "<=", now)
    .orderBy("autoFinalizeAt")
    .limit(secureExamAutoFinalize.MAIN_BATCH_LIMIT)
    .get();
  for (const doc of due.docs) {
    // eslint-disable-next-line no-await-in-loop
    await autoFinalizeSecureSessionSafely(db, doc.ref, { now }, outcomes);
  }

  // Sessions started before the hint existed: one page per run, derived.
  const sweepRef = db.collection("platformMigrations").doc(secureExamAutoFinalize.SWEEP_DOC_ID);
  const sweepSnapshot = await sweepRef.get();
  const state = secureExamAutoFinalize.sweepStateOf(sweepSnapshot.exists ? sweepSnapshot.data() : null, now);
  let legacy = 0;
  if (state) {
    let page = db.collection("examSessions")
      .where("status", "in", secureExamAutoFinalize.SWEEP_STATES)
      .orderBy(FieldPath.documentId())
      .limit(secureExamAutoFinalize.SWEEP_PAGE_LIMIT);
    if (state.cursor) page = page.startAfter(state.cursor);
    const sessions = await page.get();
    for (const doc of sessions.docs) {
      if (doc.data()?.autoFinalizeAt !== undefined) continue;
      legacy += 1;
      // eslint-disable-next-line no-await-in-loop
      await autoFinalizeSecureSessionSafely(db, doc.ref, { now, legacyOnly: true }, outcomes);
    }
    const next = secureExamAutoFinalize.nextSweepState(state, {
      now, returned: sessions.size, lastId: sessions.docs[sessions.size - 1]?.id || null, foundLegacy: legacy,
    });
    const stored = sweepSnapshot.exists ? secureExamAutoFinalize.sweepStateOf(sweepSnapshot.data(), now) : null;
    if (!stored || !secureExamAutoFinalize.sameSweepState(stored, next)) {
      await sweepRef.set({ ...next, updatedAt: now }, { merge: true });
    }
  }
  if (due.size || legacy) logger.info("Abandoned secure exam batch complete", { examined: due.size, legacy, ...outcomes });
  return { examined: due.size, legacy, outcomes };
}

exports.finalizeAbandonedSecureExams = onSchedule({
  schedule: "every 5 minutes",
  timeoutSeconds: 300,
  // Server infrastructure, private like the other schedulers: the global
  // public invoker exists for client callables only.
  invoker: "private",
}, async () => {
  await finalizeAbandonedSecureExamBatch(getFirestore(), Date.now());
});

/** Teacher-only live monitor summaries. No answer payloads are returned. */
exports.listProctorExamSessions = onCall(async (request) => {
  const teacherUid = await requireTeacher(request);
  const examType = String(request.data?.examType || "").trim();
  const db = getFirestore();
  let query = db.collection("examSessions");
  if (examType && secureExam.supportsExamType(examType)) query = query.where("examType", "==", examType);
  const snapshot = await query.limit(200).get();
  // Course-test sessions are scoped to the teacher of record for the student's
  // class; practice tests to the student's own teachers (below).
  const ownedClassIds = await teacherOwnedClassIds(db, request);
  const byId = new Map();
  snapshot.docs
    .map((docSnapshot) => docSnapshot.data())
    .filter((session) => !secureExam.isCourseTestSession(session)
      || ownedClassIds === null
      || ownedClassIds.has(String(session.classId || "")))
    .forEach((session) => byId.set(String(session.examSessionId || ""), session));
  /*
   * A TEACHER'S OWN COURSE TESTS ARE FETCHED BY THEIR OWN CLASSES.
   *
   * The 200-document limit above is applied to the WHOLE collection before the
   * class filter, so in a school with more than 200 sessions a teacher could
   * open the monitor and find their own students' Tests simply absent. Their
   * classes' course-test sessions are therefore queried directly.
   */
  if (ownedClassIds !== null && (!examType || examType === secureExam.COURSE_TEST_EXAM_TYPE)) {
    const owned = [...ownedClassIds];
    for (let index = 0; index < owned.length; index += 30) {
      // eslint-disable-next-line no-await-in-loop
      const classSnapshot = await db.collection("examSessions")
        .where("classId", "in", owned.slice(index, index + 30))
        .where("examType", "==", secureExam.COURSE_TEST_EXAM_TYPE)
        .limit(300)
        .get();
      classSnapshot.docs.forEach((docSnapshot) => byId.set(docSnapshot.id, docSnapshot.data()));
    }
  }
  const sessions = [...byId.values()];
  /*
   * A PRACTICE TEST GOES TO THE STUDENT'S OWN TEACHERS, AND SO DOES THEIR
   * EXTENDED TIME.
   *
   * A practice-test session names a student, not a class, so its class is the
   * student's: a teacher sees those for students in their own classes, and the
   * ones they created. Extended time (the multiplier and the base limit it
   * multiplied) is accommodation data and goes only to a teacher of the
   * student's class. The root administrator (ownedClassIds null) sees all.
   */
  const practiceStudentIds = [...new Set(sessions
    .filter((session) => !secureExam.isCourseTestSession(session))
    .map((session) => String(session.studentId || ""))
    .filter(Boolean))];
  const studentClassIds = new Map();
  if (ownedClassIds !== null && practiceStudentIds.length) {
    const snapshots = await db.getAll(...practiceStudentIds.map((id) => db.collection("grades").doc(id)));
    snapshots.forEach((snapshot) => studentClassIds.set(snapshot.id, String(snapshot.data()?.classId || "")));
  }
  const teachesStudent = (session) => ownedClassIds === null || ownedClassIds.has(secureExam.isCourseTestSession(session)
    ? String(session.classId || "")
    : (studentClassIds.get(String(session.studentId || "")) || ""));
  return {
    sessions: sessions
      .filter((session) => teachesStudent(session) || String(session.createdBy || "") === String(teacherUid))
      .map((session) => {
        const row = secureExam.publicSession(session, { teacher: true });
        return teachesStudent(session) ? row : withoutExtendedTime(row);
      }),
  };
});

function releasedExamEvidence(session, response) {
  const alignmentKeys = (response.alignmentKeys || []).map(mathPath.canonicalAlignmentKey).filter(Boolean);
  const supportUsage = response.supportUsage || {};
  return {
    schemaVersion: 1,
    studentId: session.studentId,
    occurredAt: Number(response.submittedAt) || Date.now(),
    alignmentKeys,
    masteryEvidenceKeys: alignmentKeys,
    questionSnapshot: { questionInstanceId: response.questionInstanceId, questionId: response.bankQuestionId, familyId: response.familyId, questionType: response.questionType, dok: response.dok },
    source: { kind: "secureExam", examSessionId: session.examSessionId, examType: session.examType, activityRole: "test" },
    performance: { score: Number(response.grading?.score) || 0, isCorrect: Boolean(response.grading?.isCorrect), attemptNumber: 1, status: "finalized", isMathematicallyIndependent: mathPath.mathematicalIndependence(supportUsage) },
    supportUsage,
    supportTelemetry: mathPath.supportTelemetry(supportUsage),
  };
}

/*
 * RELEASING ONE SESSION'S FEEDBACK, INSIDE THE CALLER'S TRANSACTION.
 *
 * Shared by the proctor monitor's per-session button and the Test Cycle's
 * class-wide "release results", so there is one definition of what a release
 * does: the session becomes reviewable, and (the first time only) its released
 * evidence feeds mastery. Releasing twice keeps the first release time and adds
 * no second set of evidence events.
 */
function releaseSessionFeedbackInTransaction(transaction, db, { ref, session, examSessionId, teacherUid, now }) {
  if (!secureExam.TERMINAL_STATES.has(session.status)) throw new HttpsError("failed-precondition", "Submit the exam before releasing feedback.");
  if (!session.feedbackReleased) {
    Object.values(session.responses || {}).forEach((response) => {
      // A question the student left blank says nothing about the skill; it
      // counts zero in the score but is not mastery evidence.
      if (response?.unanswered === true) return;
      const eventKey = mathPath.opaqueId("evexam", examSessionId, response.questionInstanceId);
      const eventRef = db.collection("grades").doc(session.studentId).collection("evidenceEvents").doc(eventKey);
      transaction.set(eventRef, { ...releasedExamEvidence(session, response), eventKey });
    });
  }
  const updated = {
    ...session,
    feedbackReleased: true,
    feedbackReleasedAt: session.feedbackReleased ? (session.feedbackReleasedAt || now) : now,
    feedbackReleasedBy: session.feedbackReleased ? (session.feedbackReleasedBy || teacherUid) : teacherUid,
    updatedAt: now,
  };
  transaction.set(ref, updated);
  return updated;
}

/** Authenticated proctor controls replace the insecure client-side PIN draft. */
exports.proctorExamAction = onCall(async (request) => {
  // A force-submit grades inside its transaction: the diagnosis it may record
  // starts loading now and is awaited just before (secureExamItems.loadMissEvidence;
  // it never rejects). No other action grades, so no other action loads it.
  const missEvidenceReady = String(request.data?.action || "").trim() === "forceSubmit" ? secureExamItems.loadMissEvidence() : null;
  const teacherUid = await requireTeacher(request);
  const examSessionId = secureExamSessionId(request);
  const action = String(request.data?.action || "").trim();
  if (!["unlock", "lock", "extendTime", "forceSubmit", "releaseFeedback"].includes(action)) throw new HttpsError("invalid-argument", "Choose a supported proctor action.");
  const db = getFirestore();
  const ref = db.collection("examSessions").doc(examSessionId);
  // Releasing a COURSE test writes a recorded assessment grade and pushes it
  // to Google Classroom, so it needs more than "some teacher is signed in".
  const proctorSnapshot = await ref.get();
  if (!proctorSnapshot.exists) throw new HttpsError("not-found", "Exam session not found.");
  const proctorSession = proctorSnapshot.data() || {};
  const scope = await secureExamProctorScope(db, request, proctorSession, teacherUid);
  if (
    action === "releaseFeedback"
    && secureExam.isCourseTestSession(proctorSession)
    && !(await courseTestSessionIsCurrent(db, proctorSession))
  ) {
    // A session a teacher reset is still sitting in the proctor monitor with a
    // Release button. Releasing it would write its old score over the
    // replacement attempt and rebuild corrections from stale evidence.
    throw new HttpsError(
      "failed-precondition",
      "This secure session was replaced by a reset. Release the student's current session instead.",
    );
  }
  if (missEvidenceReady) await missEvidenceReady;
  const next = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new HttpsError("not-found", "Exam session not found.");
    const session = snapshot.data();
    const now = Date.now();
    if (action === "releaseFeedback") return releaseSessionFeedbackInTransaction(transaction, db, { ref, session, examSessionId, teacherUid, now });
    if (secureExam.TERMINAL_STATES.has(session.status)) throw new HttpsError("failed-precondition", "This submitted exam cannot be changed except to release feedback.");
    /*
     * UNLOCK RESUMES A LOCKED EXAM. IT IS NOT A START BUTTON.
     *
     * Unlock used to set `in_progress` from ANY non-terminal status, including
     * `not_started`. That started a student's exam without `startedAt` (so a
     * timed exam had no deadline) and without passing through
     * `startSecureExamSession` — the one place the Test Cycle's Review gate is
     * enforced. Lock is likewise only meaningful for an exam in progress; a
     * not-started session that was "locked" and then unlocked was the same hole
     * by two clicks.
     */
    if (action === "unlock" && !secureExam.LOCKED_STATES.has(session.status)) {
      throw new HttpsError("failed-precondition", "Only a locked exam can be unlocked. A student starts their own exam.");
    }
    if (action === "lock" && session.status !== "in_progress") {
      throw new HttpsError("failed-precondition", "Only an exam in progress can be paused.");
    }
    if (action === "extendTime" && secureExam.timeLimitSecondsOf(session) === null) {
      throw new HttpsError("failed-precondition", "This exam is untimed; there is no time limit to extend.");
    }
    let updated = { ...session, updatedAt: now, lastProctorActionBy: teacherUid };
    // A proctor's pause stops the clock until the unlock (secureExam.withPauseHold).
    if (action === "unlock") updated = { ...updated, status: "in_progress", lockReason: null, unlockedAt: now, ...secureExam.withoutPauseHold(session, "proctor", now) };
    if (action === "lock") updated = { ...updated, status: "locked_proctor", lockReason: "Locked by proctor.", lockedAt: now, ...secureExam.withPauseHold(session, "proctor", now) };
    if (action === "extendTime") {
      const minutes = Math.max(1, Math.min(120, Math.round(Number(request.data?.minutes) || 5)));
      updated = { ...updated, addedTimeSeconds: Number(session.addedTimeSeconds || 0) + minutes * 60 };
    }
    // A pause, a resume and added time all move the deadline the finalizer reads.
    if (action !== "forceSubmit") updated = { ...updated, autoFinalizeAt: secureExam.autoFinalizeAtFor(updated, now) };
    // Every open draft is graded exactly as a student's own submit grades it.
    if (action === "forceSubmit") updated = { ...(await finalizeSecureSessionInTransaction(transaction, ref, updated, { status: "force_submitted", now })), lastProctorActionBy: teacherUid };
    transaction.set(ref, updated);
    return updated;
  });
  // A course Test releases exactly like a simulation and then, additionally,
  // records the assessment grade and builds this student's corrections. A
  // simulation session has no `courseTest` block and both helpers no-op.
  if (action === "releaseFeedback") await applyTestCycleFeedbackRelease(db, next);
  else await syncTestCycleSessionState(db, next);
  // A practice test a proctor submitted is released like one the student did.
  const settled = action === "forceSubmit" ? (await autoReleaseSecureSession(db, next)) || next : next;
  const row = secureExam.publicSession(settled, { teacher: true });
  return { success: true, session: scope.teachesStudent ? row : withoutExtendedTime(row) };
});
const TEST_CYCLE_MAX_BATCH_STUDENTS = 200;

function testCycleRecordKey(assignmentId, studentId) {
  return `${String(assignmentId || "").trim()}__${String(studentId || "").trim()}`;
}

/** The bell schedule the platform already stores. Read, never re-entered. */
async function readBellSchedule(db) {
  const snapshot = await db.collection("settings").doc("classSchedule").get();
  return snapshot.exists ? snapshot.data() || null : null;
}

/**
 * When each secure part of this cycle is open for ONE student, right now.
 *
 * The class whose windows a student follows is their own class — or, for a
 * student added individually, the assigned class the teacher said they sit the
 * Test with. Their own reopened window (on their record) is honoured on top.
 *
 * Returns null for an external-original cycle, whose one secure session keeps
 * the rules it always had. Reads nothing when nothing has been set: a cycle
 * with no windows costs no bell-schedule read on any student's entry.
 *
 * Their home window closes no earlier than their own final close (TC07,
 * testCycleStudentFinalCloseAt); `privateOverride` is their private record
 * when the caller already read it.
 */
async function studentTestCycleSchedule(db, shared, {
  assignment, policy, gradeData = null, record = null, bell = undefined, periodCache = new Map(), now = Date.now(), privateOverride = undefined,
}) {
  if (policy?.externalAssessment) return null;
  const availability = shared.schedule.normalizeTestAvailability(assignment?.testAvailability);
  const studentAvailability = record?.availability || null;
  const timeZone = shared.timeZone;
  if (!availability.configured && !studentAvailability) {
    return shared.schedule.resolveStudentTestCycleSchedule({ assignment, now, timeZone });
  }
  const ownClassId = authoritativeStudentClassId(gradeData) || record?.classId || null;
  const sitsWith = String(record?.audience?.withClassId || "").trim();
  const classId = sitsWith && availability.classWindows[sitsWith] ? sitsWith : ownClassId;
  const followsBell = Boolean(classId) && (availability.classWindows[classId] || [])
    .some((window) => window.mode === shared.schedule.TEST_WINDOW_MODE.CLASS_PERIOD);
  const schedule = followsBell ? (bell !== undefined ? bell : await readBellSchedule(db)) : null;
  const classPeriod = followsBell
    ? await resolveCheckpointClassPeriod(db, classId, classId === ownClassId ? gradeData : {}, periodCache)
    : null;
  const studentFinalCloseAt = await testCycleStudentFinalCloseAt(db, { assignment, record, gradeData, privateOverride, timeZone });
  return {
    ...shared.schedule.resolveStudentTestCycleSchedule({
      assignment, classId, classPeriod, schedule, studentAvailability, studentFinalCloseAt, now, timeZone,
    }),
    // The class whose windows this student follows: a Test start records its sitting.
    classId: classId || null,
  };
}

/*
 * ONE STUDENT'S OWN FINAL CLOSE, FOR THEIR HOME WINDOW (the owner, 2026-10-23,
 * TC07). Corrections and the Retest close at the latest of the class's close, a
 * teacher's close for this student, and this: the assignment's final cutoff
 * for them, moved later by their attendance extension or extra-time date —
 * read exactly as ingestion reads it (assignmentFinalCloseAt with their private
 * record and their pinned `profile`), in the school's zone like the class's
 * own close (resolveFollowUpWindow).
 *
 * `privateOverride`: their studentAssignmentOverrides record when the caller
 * already read it (null = read, none); undefined, it is read here. A caller
 * without their grade document (the Corrections gate) reads only its profile.
 */
async function testCycleStudentFinalCloseAt(db, { assignment, record, gradeData = null, privateOverride = undefined, timeZone = null }) {
  const studentId = String(record?.studentId || "").trim();
  const assignmentId = String(record?.assignmentId || "").trim();
  if (!assignment || !studentId || !assignmentId) return null;
  const readOverride = async () => {
    const ref = await studentOverrideRef(db, studentId, assignmentId);
    return privateOverrideFrom(ref ? await ref.get() : null);
  };
  const readProfile = async () => {
    const [snapshot] = await db.getAll(db.collection("grades").doc(studentId), { fieldMask: ["profile"] });
    return snapshot?.exists ? snapshot.data()?.profile || null : null;
  };
  const [own, profile, { assignmentFinalCloseAt }] = await Promise.all([
    privateOverride !== undefined ? privateOverride : readOverride(),
    gradeData ? gradeData.profile || null : readProfile(),
    import("./shared/sectionDeadline.mjs"),
  ]);
  return assignmentFinalCloseAt(assignment, timeZone, studentId, profile, { privateOverride: own });
}

/** Each student's private override record on one assignment (null: none), read in batches. */
async function privateOverridesFor(db, assignmentId, studentIds) {
  const overrides = await studentOverrides();
  const byStudent = new Map(studentIds.map((studentId) => [studentId, null]));
  const refs = studentIds
    .map((studentId) => [studentId, overrides.studentAssignmentOverrideId(studentId, assignmentId)])
    .filter(([, id]) => Boolean(id))
    .map(([studentId, id]) => [studentId, db.collection(overrides.STUDENT_ASSIGNMENT_OVERRIDES_COLLECTION).doc(id)]);
  for (let index = 0; index < refs.length; index += 100) {
    const slice = refs.slice(index, index + 100);
    // eslint-disable-next-line no-await-in-loop
    const snapshots = await db.getAll(...slice.map(([, ref]) => ref));
    snapshots.forEach((snapshot, position) => byStudent.set(slice[position][0], privateOverrideFrom(snapshot)));
  }
  return byStudent;
}

/*
 * RECORD THE CLASS SITTING A TEST START HAPPENED IN — RECORD-ONLY.
 *
 * The first fresh Test start inside a class-period window writes the times
 * that day resolved to (create-if-absent, one server-only document per
 * assignment, class and day; testCycleAvailability.mjs `classSittingToRecord`).
 * NOTHING READS IT YET. One student starting the Test — from home on a snow
 * day, say — looks exactly like a class sitting it, so whether a recorded
 * sitting may ever mark absent students missed is an owner decision
 * (docs/handoffs/STUDENT_PASS3_SERVER_FOLLOWUPS.md). A day that stops
 * resolving behaves exactly as before: absent students wait, the panel flags
 * the class. What is recorded from this deploy on is what that decision uses.
 *
 * Never fails the start: a write that loses the race finds the document
 * already there, and any other failure is logged — the next start records it.
 */
async function recordClassTestSitting(db, shared, { assignmentId, schedule, now = Date.now() }) {
  try {
    const sitting = shared.schedule.classSittingToRecord({
      assignmentId, classId: schedule?.classId, classWindows: schedule?.test?.windows, now,
    });
    if (!sitting) return null;
    await db.collection(shared.schedule.TEST_CYCLE_CLASS_SITTINGS).doc(sitting.id).create(sitting.data);
    return sitting.id;
  } catch (error) {
    if (error?.code === 6 || /already exists/i.test(String(error?.message || ""))) return null;
    console.error("test_cycle_class_sitting_not_recorded", { assignmentId, message: error?.message || String(error) });
    return null;
  }
}

/** A schedule as a student's or teacher's screen receives it: instants and the sentences. */
function publicTestCycleSchedule(shared, schedule, { audience = "student", missedTest = false } = {}) {
  if (!schedule) return null;
  const timeZone = shared.timeZone;
  const part = (status, describe) => ({
    state: status.state,
    enforced: status.enforced === true,
    opensAt: status.opensAt ?? null,
    closesAt: status.closesAt ?? null,
    workFromHome: status.workFromHome === true,
    // The Test day never got class time and waits for a new one.
    ...(status.stranded === true ? { stranded: true } : {}),
    // A student who missed the Test has a Retest and no Corrections.
    ...describe(status, { timeZone, audience, retestOnly: missedTest === true }),
  });
  return {
    timeZone,
    missedTest: missedTest === true,
    test: part(schedule.test, shared.schedule.describeTestWindow),
    followUp: part(schedule.followUp, shared.schedule.describeFollowUpWindow),
  };
}

/** The canonical recorded grade, projected onto the student's grade document. */
function testCycleGradeProjection(record, gradeState, stage, previous = null) {
  const now = Date.now();
  const resolvedStage = stage || null;
  const previousStage = previous && typeof previous === "object" ? previous.stage || null : null;
  return {
    recordedGrade: gradeState.recordedGrade,
    originalTestGrade: gradeState.originalTestGrade,
    rawRetestGrade: gradeState.rawRetestGrade,
    retestCappedContribution: gradeState.retestCappedContribution,
    maxRecordedGrade: gradeState.maxRecordedGrade,
    passingScore: gradeState.passingScore,
    gradeReplacement: gradeState.gradeReplacement || null,
    recordedGradeSource: gradeState.recordedGradeSource,
    retestCapApplied: gradeState.retestCapApplied,
    reason: gradeState.reason,
    stage: resolvedStage,
    // When the stage last CHANGED, not when the record was last written. A
    // student's assignment list reads this to say "new" once — Test unlocked,
    // results released, retest open — without a notification system.
    stageChangedAt: previousStage === resolvedStage ? (Number(previous?.stageChangedAt) || now) : now,
    // Question-free progress the student's own assignment list shows without a
    // callable: whether Review has been passed, and how many corrections are
    // done. Neither is a score, and neither exists before release reveals it.
    reviewComplete: record.review?.complete === true,
    // Session states, not scores: "has my Test been opened / am I mid-Test /
    // is it submitted" is what lets a list say "Test ready" or "Resume Test".
    testState: record.test?.state || "none",
    retestState: record.retest?.state || "none",
    correctionsTotal: Number(record.corrections?.total || 0),
    correctionsCompleted: Number(record.corrections?.completedTargets || 0),
    blueprintId: record.blueprintId || null,
    // Present only for a student added on their own: this is what lets their
    // device find the assessment and the server accept their Review answers
    // (studentIndividuallyAssigned). Never set from a client.
    ...(record.audience?.individual === true ? { individuallyAssigned: true } : {}),
    // A Retest taken without an original Test, so a list can say so.
    ...(record.retest?.withoutOriginal === true ? { retestWithoutOriginal: true } : {}),
    updatedAt: now,
  };
}

/**
 * Write the record and its grade projection inside one transaction.
 *
 * The projection on `grades/{studentId}.testCycleGrades[assignmentId]` is what
 * the Classroom passback trigger watches. It is a PROJECTION: every reader
 * recomputes the grade from the record before showing it, so a stale projection
 * can move a Classroom grade late but can never invent a different number.
 */
function writeTestCycleRecord(transaction, db, { record, gradeSnapshot, shared, policy, stage = null }) {
  const normalized = shared.record.normalizeTestCycleRecord(record);
  const gradeState = shared.record.recordGradeState(normalized, policy);
  const resolvedStage = stage || shared.stages.resolveTestCycleStage({ policy, record: normalized })?.stage || null;
  const document = {
    ...normalized,
    recordedGrade: gradeState.recordedGrade,
    stage: resolvedStage,
    updatedAt: Date.now(),
  };
  transaction.set(db.collection(TEST_CYCLE_RECORDS).doc(normalized.recordId), document);
  if (gradeSnapshot?.exists) {
    const previous = gradeSnapshot.data()?.testCycleGrades?.[normalized.assignmentId] || null;
    const projection = testCycleGradeProjection(document, gradeState, resolvedStage, previous);
    if (!testCycleProjectionUnchanged(projection, previous)) {
      transaction.update(gradeSnapshot.ref, new FieldPath("testCycleGrades", normalized.assignmentId), projection);
    }
  }
  return { record: document, gradeState, stage: resolvedStage };
}

/*
 * A PROJECTION THAT WOULD CHANGE ONLY ITS `updatedAt` IS NOT WRITTEN AGAIN.
 *
 * Every write to grades/{studentId} runs both Classroom triggers and is sent
 * to every teacher listening to the gradebook. Each secure Test item a student
 * answers moves the record's answered count, which the teacher's table reads
 * from the record (written above, every time), and nothing in this projection
 * but `updatedAt`, which nothing reads (the student's card refreshes on the
 * other fields: testCycleDiscovery.js buildTestCycleCardRefreshKey). So that
 * write bought one Functions run per trigger and a document sent to every
 * listening teacher, for a timestamp. The comparison is against the projection
 * read in this transaction; any other change, a state, a grade, a stage, a
 * correction, a field an older projection lacks, is written as before.
 */
function testCycleProjectionUnchanged(next, previous) {
  if (!previous || typeof previous !== "object") return false;
  const { updatedAt: _nextUpdatedAt, ...nextFields } = next;
  const { updatedAt: _previousUpdatedAt, ...previousFields } = previous;
  return isDeepStrictEqual(nextFields, previousFields);
}

/*
 * EVERY CHANGE TO A TEST CYCLE RECORD IS READ-MODIFY-WRITE IN ONE TRANSACTION.
 *
 * The record is touched by four independent actors: the student's own session
 * (start, submit, finalize), the teacher (release, waive, unlock, reset), the
 * corrections callable, and the retest opener. Each used to read the record,
 * change its part, and write the WHOLE record back — so two of them landing in
 * the same second silently undid one another: a teacher's "waive corrections"
 * could be overwritten by the student's correction answer that arrived a moment
 * later, or a release could resurrect a session state the student had just
 * left. `mutate` receives the current record and the open transaction; it must
 * finish every `transaction.get` before its first write, and it returns the
 * next record (or nothing, to write nothing).
 */
async function mutateTestCycleRecord(db, { assignmentId, studentId, shared, policy, mutate }) {
  const recordRef = db.collection(TEST_CYCLE_RECORDS).doc(testCycleRecordKey(assignmentId, studentId));
  const gradeRef = db.collection("grades").doc(String(studentId || ""));
  return db.runTransaction(async (transaction) => {
    const [recordSnapshot, gradeSnapshot] = await Promise.all([transaction.get(recordRef), transaction.get(gradeRef)]);
    const current = shared.record.normalizeTestCycleRecord(
      recordSnapshot.exists ? recordSnapshot.data() : { assignmentId, studentId },
    );
    const outcome = await mutate(current, { transaction, exists: recordSnapshot.exists, gradeSnapshot });
    if (!outcome?.record) return { changed: false, record: current, value: outcome?.value ?? null };
    const written = writeTestCycleRecord(transaction, db, {
      record: { ...outcome.record, assignmentId, studentId },
      gradeSnapshot,
      shared,
      policy,
      stage: outcome.stage || null,
    });
    return { changed: true, ...written, value: outcome.value ?? null };
  });
}

async function readTestCycleRecord(db, assignmentId, studentId, shared) {
  const snapshot = await db.collection(TEST_CYCLE_RECORDS).doc(testCycleRecordKey(assignmentId, studentId)).get();
  return shared.record.normalizeTestCycleRecord(
    snapshot.exists ? snapshot.data() : { assignmentId, studentId },
  );
}

/**
 * Build one student's secure course-test session from a stored issuance plan.
 *
 * The plan is computed and written with the session, before the student can
 * start it. That ordering is the whole no-live-AI guarantee: by the time the
 * exam is enterable, every question it will ask is already decided.
 *
 * Built, not written: the caller writes it inside the same transaction that
 * points the student's record at it, so two concurrent "open sessions" clicks
 * cannot leave a student with two Tests.
 */
function buildCourseTestSession(db, {
  assignmentId,
  assignment,
  studentId,
  studentData,
  blueprint,
  plan,
  cycleStage,
  teacherUid,
  title,
}) {
  const ref = db.collection("examSessions").doc();
  const now = Date.now();
  const session = {
    examSessionId: ref.id,
    studentId,
    classId: String(studentData?.classId || "") || null,
    classPeriod: String(studentData?.classPeriod || "Unassigned"),
    examType: secureExam.COURSE_TEST_EXAM_TYPE,
    title: String(title || blueprint.title || assignment?.title || "Course Test").slice(0, 160),
    status: "not_started",
    requiredQuestions: plan.totalQuestions,
    // Only an explicit, positive blueprint time limit times a Test. `null` is
    // untimed; see `deadlineFor`.
    timeLimitSeconds: secureExam.timeLimitSecondsOf({ timeLimitSeconds: blueprint.timeLimitSeconds }),
    addedTimeSeconds: 0,
    calculatorMode: blueprint.calculatorMode,
    accommodationsConfirmed: false,
    feedbackReleased: false,
    violationCount: 0,
    summary: { completedQuestions: 0, correctQuestions: 0 },
    responses: {},
    usedQuestionIds: [],
    currentQuestion: null,
    watermarkEnabled: !assignment?.assessmentPolicy?.externalAssessment,
    courseTest: {
      assignmentId,
      cycleStage,
      blueprintId: plan.blueprintId,
      blueprintVersion: plan.blueprintVersion,
      planId: plan.planId,
      attempt: plan.attempt,
      recordId: testCycleRecordKey(assignmentId, studentId),
    },
    // Stored, never returned to a client: `publicSession` strips it.
    issuancePlan: plan,
    createdBy: teacherUid || null,
    createdAt: now,
    updatedAt: now,
  };
  return { ref, session };
}

/**
 * The assignment-level gate: archived, paused or not yet open.
 *
 * Applied wherever a student would START something — the secure Test or
 * Retest, the next secure question, a correction question — and laid over the
 * card so the student is told the same thing the server enforces.
 */
async function assertTestCycleAssessmentOpen(shared, assignment) {
  const availability = shared.availability.resolveAssessmentAvailability({ assignment, now: Date.now() });
  if (!availability.open) {
    throw new HttpsError("failed-precondition", availability.message, { availability: availability.reason });
  }
  return availability;
}

/**
 * Is this student allowed into THIS secure course-test session right now?
 *
 * THE HOLE THIS CLOSES. Course-test sessions are created for a whole class at
 * once, well before any student finishes Review — so a session exists, and
 * `startSecureExamSession` on its own only asks "is it yours, and is it
 * startable?". Any surface that lists exam sessions could therefore hand a
 * student a Start button for a Test they have not unlocked, or let them resume
 * a Retest a teacher has closed. The Tests & Exams dashboard is exactly such a
 * surface.
 *
 * The stage machine is the authority, so the gate is enforced HERE, on the
 * server, in the calls every entry path must make: start, and every issue. A
 * screen that forgets to check now fails closed instead of leaking an exam.
 *
 * It also pins the session to the record's CURRENT session for that stage: a
 * session superseded by a teacher reset is not enterable, whatever its status.
 * And it refuses an assessment the teacher has archived or paused, or that has
 * not reached its release time — the assignment-level gate the stage machine
 * deliberately does not know about.
 */
async function assertCourseTestEntryAllowed(db, session, studentId, { transaction = null } = {}) {
  const courseTest = session?.courseTest;
  if (!courseTest?.assignmentId) return;
  // Inside a caller's transaction every read is the transaction's, so a pause,
  // archive or reset written while the call is in flight either lands first
  // and is seen here, or retries the call: nothing is written after it.
  const read = (ref) => (transaction ? transaction.get(ref) : ref.get());
  const shared = await testCycleLib.shared();
  const assignmentSnapshot = await read(db.collection("assignments").doc(String(courseTest.assignmentId)));
  if (!assignmentSnapshot.exists) throw new HttpsError("failed-precondition", "This assessment is no longer available.");
  const assignment = assignmentSnapshot.data() || {};
  const policy = shared.policy.normalizeTestCyclePolicy(assignment.assessmentPolicy);
  if (!policy) throw new HttpsError("failed-precondition", "This assessment is no longer a Test Cycle.");

  const isRetest = String(courseTest.cycleStage) === shared.issuance.CYCLE_STAGE.RETEST;
  const [gradeSnapshot, recordSnapshot] = await Promise.all([
    read(db.collection("grades").doc(studentId)),
    read(db.collection(TEST_CYCLE_RECORDS).doc(testCycleRecordKey(courseTest.assignmentId, studentId))),
  ]);
  const record = shared.record.normalizeTestCycleRecord(
    recordSnapshot.exists ? recordSnapshot.data() : { assignmentId: courseTest.assignmentId, studentId },
  );

  /*
   * SUPERSESSION IS CHECKED BEFORE ANYTHING ELSE, TERMINAL STATE INCLUDED.
   *
   * A reset force-submits the session it replaces, so a superseded session is
   * always terminal. Checking "is it finished?" first therefore let the
   * discarded session through and showed the student "Exam recorded" — which
   * is a lie about work the reset threw away.
   *
   * Exact match, for the same reason the release guard demands one: a reset
   * empties the stage, and an empty stage must not readmit what it discarded.
   */
  const currentSessionId = isRetest ? record.retest.examSessionId : record.test.examSessionId;
  if (String(currentSessionId || "") !== String(session.examSessionId || "")) {
    throw new HttpsError("failed-precondition", "This secure session was replaced by your teacher. Reopen the assessment from Assignments.");
  }

  // A session that is still the current one and has simply been finished keeps
  // the existing behaviour: `startSecureExamSession` hands it back and the
  // container shows "Exam recorded", rather than an error the student cannot
  // act on.
  if (secureExam.TERMINAL_STATES.has(session.status)) return;

  await assertTestCycleAssessmentOpen(shared, assignment);

  const tracker = gradeSnapshot.data()?.gradesByAssignment?.[courseTest.assignmentId] || {};
  /*
   * WHEN, AS WELL AS WHETHER. The original Test starts only inside the
   * student's class-time window, and the Retest only inside the home window;
   * an attempt already under way is let through to finish (the stage machine
   * decides both, from the same schedule the card shows). This is the check
   * every route into a secure session passes — the card's button, the Tests &
   * Exams list, a saved link — because they all call start and issue.
   */
  const schedule = await studentTestCycleSchedule(db, shared, {
    assignment, policy, gradeData: gradeSnapshot.data() || {}, record,
  });
  const state = shared.stages.resolveTestCycleStage({
    policy,
    record,
    reviewProgress: testCycleLib.reviewProgress(assignment, tracker),
    schedule,
  });
  const expectedStage = isRetest
    ? shared.stages.TEST_CYCLE_STAGE.RETEST
    : shared.stages.TEST_CYCLE_STAGE.TEST;
  if (state?.stage !== expectedStage || state.canEnter !== true) {
    throw new HttpsError(
      "failed-precondition",
      state?.detail || "This part of the assessment is not open to you yet.",
      state?.windowClosed ? { window: state.windowClosed } : undefined,
    );
  }
  // What the start needs to record the class sitting (recordClassTestSitting).
  return { shared, assignmentId: String(courseTest.assignmentId), isRetest, schedule };
}

/**
 * The classes this caller is teacher of record for, or null for "all of them".
 *
 * Null means the root administrator, who is deliberately not filtered. Every
 * other teacher gets a set, and a course-test session outside it is not theirs
 * to see or to act on.
 */
async function teacherOwnedClassIds(db, request) {
  const email = callerEmail(request);
  if (!email) throw new HttpsError("permission-denied", "A verified teacher email is required.");
  if (authLib.isRootAdminEmail(email)) return null;
  const snapshot = await db.collection("classes").where("teacherOfRecord", "==", email).get();
  return new Set(snapshot.docs.map((docSnapshot) => docSnapshot.id));
}

/**
 * May this teacher proctor this session, and do they teach its student?
 *
 * `proctorExamAction` used to accept any authenticated teacher. Releasing a
 * COURSE test writes a student's recorded assessment grade and pushes it to
 * Google Classroom, so it needs the teacher of record for that student's
 * class. A practice test is the student's own teachers' and its creator's.
 */
async function secureExamProctorScope(db, request, session, teacherUid) {
  const ownedClassIds = await teacherOwnedClassIds(db, request);
  if (ownedClassIds === null) return { teachesStudent: true };
  if (secureExam.isCourseTestSession(session)) {
    const classId = String(session.classId || "");
    if (!classId || !ownedClassIds.has(classId)) {
      throw new HttpsError("permission-denied", "Only the teacher of record for this student's class can proctor their course test.");
    }
    return { teachesStudent: true };
  }
  /*
   * A PRACTICE TEST: the teacher who set it, or a teacher of the student's
   * class — the same teachers the live monitor lists it for. Another teacher
   * holding its id could otherwise unlock, extend or submit it. A creator who
   * does not teach the student proctors it without their extended time.
   */
  const studentId = String(session.studentId || "");
  const studentClassId = studentId ? String((await db.collection("grades").doc(studentId).get()).data()?.classId || "") : "";
  const teachesStudent = Boolean(studentClassId) && ownedClassIds.has(studentClassId);
  if (!teachesStudent && String(session.createdBy || "") !== String(teacherUid)) {
    throw new HttpsError("permission-denied", "Only the teacher who set this practice test, or a teacher of this student's class, can proctor it.");
  }
  return { teachesStudent };
}

/** Extended time is accommodation data: a session row without it, for a teacher who does not teach the student. */
function withoutExtendedTime(row) {
  const { extendedTimeMultiplier: _multiplier, baseTimeLimitSeconds: _baseLimit, ...rest } = row;
  return rest;
}

/**
 * Is this course-test session still the record's current session for its stage?
 *
 * AN EMPTY STAGE IS NOT A WILDCARD. This used to read "no current session id"
 * as "anything is current", which is exactly backwards after a teacher reset:
 * resetting a stage CLEARS its session id, so the one session that would then
 * pass the check was the superseded one the reset had just thrown away. It
 * stayed releasable, and its stale score could land on the replacement attempt.
 *
 * So the match is exact. A session whose stage points somewhere else — or
 * nowhere — is not the session to act on.
 */
async function courseTestSessionIsCurrent(db, session) {
  const courseTest = session?.courseTest;
  if (!courseTest?.assignmentId) return true;
  const shared = await testCycleLib.shared();
  const record = await readTestCycleRecord(db, courseTest.assignmentId, String(session.studentId || ""), shared);
  return recordStageSessionIsCurrent(shared, record, session);
}

/** The same exact-match rule, against a record the caller already holds. */
function recordStageSessionIsCurrent(shared, record, session) {
  const isRetest = String(session?.courseTest?.cycleStage) === shared.issuance.CYCLE_STAGE.RETEST;
  const currentSessionId = isRetest ? record.retest.examSessionId : record.test.examSessionId;
  return Boolean(currentSessionId) && String(currentSessionId) === String(session?.examSessionId || "");
}

/**
 * Is `studentId` someone this assignment is actually for?
 *
 * A record already existing is proof enough (named-student assignment); so is
 * the student's rostered class being in the assignment's audience. A bare id a
 * teacher typed is neither, and a teacher action must not mint a record — which
 * is itself what grants access — for a student the assignment was never given.
 */
async function assertStudentInTestCycleAudience(db, { assignment, assignmentId, studentId }) {
  const id = String(studentId || "").trim();
  if (!id || id.length > 180) throw new HttpsError("invalid-argument", "A valid studentId is required.");
  const [recordSnapshot, gradeSnapshot] = await Promise.all([
    db.collection(TEST_CYCLE_RECORDS).doc(testCycleRecordKey(assignmentId, id)).get(),
    db.collection("grades").doc(id).get(),
  ]);
  if (recordSnapshot.exists) return { studentId: id, gradeData: gradeSnapshot.data() || {} };
  if (gradeSnapshot.exists && studentMatchesAssignmentAudience({
    assignment, classId: gradeSnapshot.data()?.classId || null, gradeData: gradeSnapshot.data(), assignmentId,
  })) {
    return { studentId: id, gradeData: gradeSnapshot.data() || {} };
  }
  throw new HttpsError("permission-denied", "That student is not assigned this Test Cycle.");
}

/**
 * Open ONE student's secure Test session.
 *
 * The record is re-read INSIDE the transaction that creates the session, so a
 * second click, a second teacher tab, or a bulk operation resumed after a
 * dropped connection reuses the session the first one created instead of
 * minting a parallel Test for the same student. That is what makes opening
 * sessions safe to repeat. Returns `{ reused: true }` or the new session's id.
 */
async function openTestSessionForStudent(db, {
  assignmentId, assignment, policy, blueprint, families, shared, teacherUid,
}, studentId, studentData, { originalScore = undefined } = {}) {
  const plan = shared.issuance.buildSecureIssuancePlan({
    blueprint,
    families,
    studentId,
    assignmentId,
    stage: shared.issuance.CYCLE_STAGE.TEST,
    attempt: 1,
  });
  if (shared.issuance.planRequiresLiveGeneration(plan)) {
    throw new HttpsError("failed-precondition", `The secure Test plan for ${studentId} could not be completed from approved families.`);
  }
  const outcome = await mutateTestCycleRecord(db, {
    assignmentId,
    studentId,
    shared,
    policy,
    mutate: (record, { transaction }) => {
      if (record.test.examSessionId) return { value: { reused: true } };
      /*
       * A STUDENT ON THE RETEST THAT REPLACED A MISSED TEST IS NOT GIVEN A TEST.
       * They are sitting it, have submitted it, or have it released: a Test
       * session opened now could never be entered, and would count them as
       * "still to sit the Test" for every classmate waiting on the answers.
       */
      if (record.retest.withoutOriginal === true && [
        shared.record.SESSION_STATE.IN_PROGRESS, shared.record.SESSION_STATE.SUBMITTED, shared.record.SESSION_STATE.RELEASED,
      ].includes(record.retest.state)) {
        return { value: { reused: false, notEligible: true, examSessionId: null } };
      }
      // TC15: the questions this student's teacher excused for a fewer-items
      // plan are left out of THEIR plan, read from their record in this same
      // transaction. Everyone else's plan is the full one, as before.
      const studentPlan = shared.reducedItems.applyExcusedQuestionsToPlan(plan, shared.reducedItems.applicableExcusedSlotIds(record, blueprint));
      if (shared.issuance.planRequiresLiveGeneration(studentPlan)) {
        throw new HttpsError("failed-precondition", `The secure Test plan for ${studentId} could not be completed from approved families.`);
      }
      const { ref, session } = buildCourseTestSession(db, {
        assignmentId,
        assignment,
        studentId,
        studentData,
        blueprint,
        plan: studentPlan,
        cycleStage: shared.issuance.CYCLE_STAGE.TEST,
        teacherUid,
        title: assignment?.title,
      });
      transaction.set(ref, session);
      return {
        value: { reused: false, examSessionId: session.examSessionId },
        record: {
          ...record,
          classId: session.classId,
          ...(policy.externalAssessment ? { externalAssessment: {
            originalScore,
            source: policy.externalAssessment.source,
            recordedBy: teacherUid,
            recordedAt: Date.now(),
          } } : {}),
          blueprintId: blueprint.blueprintId,
          blueprintVersion: blueprint.version,
          review: { ...record.review, required: policy.review.required },
          test: {
            examSessionId: session.examSessionId,
            planId: studentPlan.planId,
            blueprintId: studentPlan.blueprintId,
            blueprintVersion: studentPlan.blueprintVersion,
            attempt: studentPlan.attempt,
            state: shared.record.SESSION_STATE.ASSIGNED,
            totalQuestions: studentPlan.totalQuestions,
          },
        },
      };
    },
  });
  return outcome.value || { reused: false, examSessionId: null };
}

/**
 * The Retest for a student who never took the original Test.
 *
 * WHO. A student whose class-time Test window has closed without their ever
 * starting the Test (`studentMissedOriginalTest`), and whose Review gate is
 * open. They are not sent to Corrections — there are no answers of theirs to
 * correct — and they are not left waiting on an original score that will never
 * exist.
 *
 * WHAT. A full Retest form: the whole Test blueprint, issued for the retest
 * stage (a different plan seed than the Test, so not the form their classmates
 * sat). The targeted 70/30 retest needs a student's own missed skills, and
 * this student has none on record.
 *
 * The record marks it `withoutOriginal`, which is what keeps its score a
 * Retest score everywhere it is shown. Re-checked inside the transaction, so
 * it is safe to call from the student's card, a teacher action and a bulk
 * operation at once: one of them opens it and the rest find it open.
 */
async function ensureMissedTestRetestSession(db, {
  assignmentId, assignment, policy, blueprint, shared, studentId, schedule, teacherUid = null,
}) {
  if (policy.externalAssessment || !schedule) return null;
  const preview = await readTestCycleRecord(db, assignmentId, studentId, shared);
  if (preview.retest.examSessionId || preview.teacherControls.retestDisabled) return null;
  if (!shared.stages.studentMissedOriginalTest({ record: preview, schedule })) return null;

  const families = await resolveBlueprintFamilies(db, blueprintFamilyIds(blueprint));
  const studentSnapshot = await db.collection("grades").doc(studentId).get();
  const outcome = await mutateTestCycleRecord(db, {
    assignmentId,
    studentId,
    shared,
    policy,
    mutate: (current, { transaction }) => {
      if (current.retest.examSessionId
        || current.teacherControls.retestDisabled
        || !shared.stages.studentMissedOriginalTest({ record: current, schedule })) {
        return { value: null };
      }
      // The whole Test at the retest stage — less any questions this student's
      // teacher excused for a fewer-items plan (TC15): the same subset rule.
      const plan = shared.reducedItems.applyExcusedQuestionsToPlan(shared.issuance.buildSecureIssuancePlan({
        blueprint,
        families,
        studentId,
        assignmentId,
        stage: shared.issuance.CYCLE_STAGE.RETEST,
        attempt: Number(current.retest.attempt || 1),
      }), shared.reducedItems.applicableExcusedSlotIds(current, blueprint));
      if (shared.issuance.planRequiresLiveGeneration(plan)) return { value: null };
      const { ref, session } = buildCourseTestSession(db, {
        assignmentId,
        assignment,
        studentId,
        studentData: studentSnapshot.data() || {},
        blueprint,
        plan,
        cycleStage: shared.issuance.CYCLE_STAGE.RETEST,
        teacherUid,
        title: `${assignment?.title || blueprint.title} — Retest`,
      });
      transaction.set(ref, { ...session, courseTest: { ...session.courseTest, withoutOriginal: true } });
      transaction.set(db.collection(TEST_CYCLE_RETEST_PLANS).doc(current.recordId), {
        recordId: current.recordId,
        assignmentId,
        studentId,
        blueprint,
        // The same audit shape a targeted retest stores, saying plainly that
        // nothing was targeted: there was no Test to target from.
        audit: {
          withoutOriginal: true,
          questionCount: plan.totalQuestions,
          targetedQuestionCount: 0,
          anchorQuestionCount: plan.totalQuestions,
          actualWeakShare: 0,
          actualAnchorShare: 1,
          originalQuestionCount: plan.totalQuestions,
        },
        plan,
        createdAt: Date.now(),
      });
      return {
        value: { examSessionId: session.examSessionId },
        record: {
          ...current,
          classId: current.classId || session.classId,
          blueprintId: current.blueprintId || blueprint.blueprintId,
          blueprintVersion: current.blueprintId ? current.blueprintVersion : blueprint.version,
          retest: {
            ...current.retest,
            examSessionId: session.examSessionId,
            planId: plan.planId,
            blueprintId: plan.blueprintId,
            blueprintVersion: plan.blueprintVersion,
            state: shared.record.SESSION_STATE.ASSIGNED,
            totalQuestions: plan.totalQuestions,
            withoutOriginal: true,
          },
        },
      };
    },
  });
  return outcome.value || null;
}

/** The same, for a caller that holds the student's roster row but no schedule yet. */
async function ensureMissedTestRetestIfDue(db, {
  assignmentId, assignment, policy, blueprint, shared, studentId, gradeData, teacherUid = null,
}) {
  if (policy.externalAssessment) return null;
  const record = await readTestCycleRecord(db, assignmentId, studentId, shared);
  const schedule = await studentTestCycleSchedule(db, shared, { assignment, policy, gradeData, record });
  const reviewProgress = testCycleLib.reviewProgress(assignment, gradeData?.gradesByAssignment?.[assignmentId] || {});
  const state = shared.stages.resolveTestCycleStage({ policy, record, reviewProgress, schedule });
  // Only once the Review gate is open: a Retest is not opened behind it.
  if (!state?.missedTest || state.stage !== shared.stages.TEST_CYCLE_STAGE.RETEST_READY) return null;
  return ensureMissedTestRetestSession(db, { assignmentId, assignment, policy, blueprint, shared, studentId, schedule, teacherUid });
}

/** Teacher action: open secure Test sessions for a whole class at once. */
exports.assignTestCycleSessions = onCall(TEST_CYCLE_SWEEP_OPTIONS, async (request) => {
  const db = getFirestore();
  const assignmentSnapshot = await assignmentForTeacherCall(request, db);
  const { teacherUid } = await assertTeacherMayManageAssignment(request, assignmentSnapshot);
  const { assignmentId, assignment, policy, blueprint, secureReferenceResolved, shared } = await loadTestCycleAssignment(db, assignmentSnapshot.id, { allowInvalid: true });

  // Sessions can be opened ahead of a scheduled release (the release time still
  // gates entry), but not for an assessment the teacher has archived or paused:
  // that is a contradiction a teacher should be told about, not one to act on.
  const availability = shared.availability.resolveAssessmentAvailability({ assignment, now: Date.now() });
  if (!availability.open && availability.reason !== shared.availability.ASSESSMENT_AVAILABILITY.SCHEDULED) {
    throw new HttpsError("failed-precondition", "This assessment is archived or paused. Restore it before opening secure sessions.");
  }

  /*
   * THE AUDIENCE IS THE ASSIGNMENT'S, NOT THE CALLER'S.
   *
   * The teacher screen passes whichever class is active in the class bar to
   * every Test Cycle it lists, so opening a cycle assigned to first period
   * while third period is selected would otherwise create secure sessions and
   * canonical records for third period — and the record is itself what grants a
   * student access. A requested classId therefore has to BE one of the
   * assignment's assigned classes, and named students have to be in one.
   */
  const audienceClassIds = assignmentAudience(assignment).classIds;
  const requestedClassId = String(request.data?.classId || "").trim();
  if (requestedClassId && !audienceClassIds.includes(requestedClassId)) {
    throw new HttpsError("invalid-argument", "That class is not assigned this Test Cycle.");
  }
  const requestedStudentIds = [...new Set((Array.isArray(request.data?.studentIds) ? request.data.studentIds : [])
    .map((value) => String(value || "").trim()).filter(Boolean))];
  const classIds = requestedStudentIds.length
    ? []
    : (requestedClassId ? [requestedClassId] : audienceClassIds);

  // Only once the caller is pointing at the right class is it worth generating
  // and grading sample instances for every declared family.
  const { families, result: preflight } = await runTestCyclePreflight(db, { assignment, policy, blueprint, shared, secureReferenceResolved });
  if (preflight.blocked) {
    // Refused before a single session exists. A Test Cycle that cannot issue
    // equivalent secure coverage for every student must not reach a classroom.
    throw new HttpsError("failed-precondition", `This Test Cycle cannot be assigned securely: ${preflight.errors[0]}`, { preflight });
  }

  const studentDocs = new Map();
  if (requestedStudentIds.length) {
    for (let index = 0; index < requestedStudentIds.length; index += 100) {
      const refs = requestedStudentIds.slice(index, index + 100).map((id) => db.collection("grades").doc(id));
      // eslint-disable-next-line no-await-in-loop
      const snapshots = await db.getAll(...refs);
      snapshots.forEach((snapshot) => {
        if (snapshot.exists) studentDocs.set(snapshot.id, snapshot.data() || {});
      });
    }
  } else {
    for (const classId of classIds) {
      // eslint-disable-next-line no-await-in-loop
      const snapshot = await db.collection("grades").where("classId", "==", classId).get();
      snapshot.docs.forEach((doc) => studentDocs.set(doc.id, doc.data() || {}));
    }
  }
  const eligible = [...studentDocs.entries()]
    .filter(([studentId, data]) => studentId !== "test_connection"
      && data?.status !== "inactive"
      // Named students are checked here rather than trusted: a grade document
      // id is not proof that this assignment was ever assigned to them. Their
      // class being assigned is proof, and so is having been added on their own.
      && studentMatchesAssignmentAudience({ assignment, classId: data?.classId || null, gradeData: data, assignmentId }))
    .slice(0, TEST_CYCLE_MAX_BATCH_STUDENTS);
  if (!eligible.length) {
    throw new HttpsError("failed-precondition", "No eligible students were found for this Test Cycle.");
  }

  const created = [];
  const reused = [];
  const skipped = [];
  const originalScores = new Map();
  if (policy.externalAssessment) {
    // Validate the whole requested score batch before creating any sessions.
    const supplied = request.data?.originalScores;
    if (!supplied || typeof supplied !== "object" || Array.isArray(supplied)) {
      throw new HttpsError("invalid-argument", "Enter the original district scores before opening retest sessions.");
    }
    for (const [studentId] of eligible) {
      if (!Object.prototype.hasOwnProperty.call(supplied, studentId)) continue;
      try {
        originalScores.set(studentId, shared.external.validateExternalOriginalScore(supplied[studentId]));
      } catch (error) {
        throw new HttpsError("invalid-argument", `${studentId}: ${error.message}`);
      }
    }
  }
  for (const [studentId, studentData] of eligible) {
    // An external-original retest opens only for a student whose original
    // district score was entered and is below passing. A student who already
    // has a session keeps it (reused) whatever this batch supplied; the
    // transaction below re-checks that, so this read is only for the skip.
    if (policy.externalAssessment) {
      // eslint-disable-next-line no-await-in-loop
      const existing = await readTestCycleRecord(db, assignmentId, studentId, shared);
      if (existing.test.examSessionId) {
        reused.push(studentId);
        continue;
      }
      const originalScore = originalScores.get(studentId);
      if (originalScore === undefined || originalScore >= policy.passingScore) {
        skipped.push({ studentId, reason: originalScore === undefined ? "missingOriginalScore" : "originalAlreadyPassing" });
        continue;
      }
    }
    // eslint-disable-next-line no-await-in-loop
    const opened = await openTestSessionForStudent(
      db,
      { assignmentId, assignment, policy, blueprint, families, shared, teacherUid },
      studentId,
      studentData,
      { originalScore: originalScores.get(studentId) },
    );
    if (opened.notEligible) skipped.push({ studentId, reason: "retestInPlaceOfTest" });
    else if (opened.reused) reused.push(studentId);
    else created.push({ studentId, examSessionId: opened.examSessionId || null });
  }

  return {
    success: true,
    assignmentId,
    createdSessions: created.length,
    reusedSessions: reused.length,
    skippedStudents: skipped,
    students: created,
    preflight: { errors: preflight.errors, warnings: preflight.warnings, checks: preflight.checks },
  };
});

/**
 * Teacher preflight, callable on its own so authoring can block publication.
 *
 * Scoped to the teacher of record: preflight reports the blueprint's families,
 * standards and coverage, which is exactly what a secure Test keeps out of
 * students' hands and is not another teacher's business either.
 */
exports.preflightTestCycleAssignment = onCall(TEST_CYCLE_ACTION_OPTIONS, async (request) => {
  const db = getFirestore();
  const assignmentSnapshot = await assignmentForTeacherCall(request, db);
  await assertTeacherMayManageAssignment(request, assignmentSnapshot);
  const { assignment, policy, blueprint, secureReferenceResolved, shared } = await loadTestCycleAssignment(db, assignmentSnapshot.id, { allowInvalid: true });
  const { result } = await runTestCyclePreflight(db, { assignment, policy, blueprint, shared, secureReferenceResolved });
  return { success: true, preflight: result };
});

/** Authoritative pre-save gate used only for Test Cycle candidates. */
exports.preflightTestCycleCandidate = onCall(async (request) => {
  await requireTeacher(request);
  const assignment = request.data?.assignment;
  if (!assignment || typeof assignment !== "object" || Array.isArray(assignment)) {
    throw new HttpsError("invalid-argument", "A Test Cycle assignment candidate is required.");
  }
  const db = getFirestore();
  const shared = await testCycleLib.shared();
  if (!shared.policy.declaresTestCycle(assignment)) {
    return { success: true, testCycle: false, preflight: null };
  }
  const policy = shared.policy.normalizeTestCyclePolicy(assignment.assessmentPolicy)
    || shared.policy.defaultTestCyclePolicy();
  const resolution = await resolveSecureTestBlueprint(db, assignment, shared);
  const { result } = await runTestCyclePreflight(db, {
    assignment,
    policy,
    blueprint: resolution.blueprint,
    shared,
    secureReferenceResolved: resolution.secureReferenceResolved,
  });
  return { success: true, testCycle: true, preflight: result };
});

/**
 * What the student is told about timing and tools before they start.
 *
 * Read from the blueprint, never assumed: a Test with no explicit time limit is
 * UNTIMED, and the card says so in as many words, so a student is never left
 * guessing whether a clock is running.
 */
function testCycleDeliveryFacts(blueprint, { timeMultiplier = 1 } = {}) {
  const baseSeconds = secureExam.timeLimitSecondsOf({ timeLimitSeconds: blueprint?.timeLimitSeconds });
  // The student's own extended time, as the server will apply it at start.
  const extended = baseSeconds !== null && timeMultiplier > 1;
  const seconds = extended ? secureExamNavigation.accommodatedTimeLimitSeconds(baseSeconds, timeMultiplier) : baseSeconds;
  const calculatorMode = String(blueprint?.calculatorMode || "questionSpecific");
  return {
    timed: seconds !== null,
    timeLimitMinutes: seconds === null ? null : Math.round(seconds / 60),
    ...(extended ? { baseTimeLimitMinutes: Math.round(baseSeconds / 60), extendedTimeMultiplier: timeMultiplier } : {}),
    calculatorMode,
    questionCount: Array.isArray(blueprint?.targets)
      ? blueprint.targets.reduce((sum, target) => sum + Math.max(0, Number(target?.questionCount) || 0), 0)
      : null,
  };
}

/**
 * The student's single card.
 *
 * Returns ONE stage. Corrections detail is included only when the student is
 * actually in the Corrections stage, so a student who has submitted a test and
 * is waiting for release cannot infer their result from the payload.
 */
exports.getStudentTestCycle = onCall(TEST_CYCLE_ACTION_OPTIONS, async (request) => {
  const { studentId } = requireStudent(request);
  const db = getFirestore();
  // A READ-ONLY LOOK, for Tests & Exams listing a Test whose session is not
  // open yet: the same question-free card, but opening nothing (no stand-in
  // Retest for a missed Test) and reading no Corrections. Only the card itself,
  // opened by the student, does those.
  const preview = request.data?.preview === true;
  const { assignmentId, assignment, policy, blueprint, shared } = await loadTestCycleAssignment(db, request.data?.assignmentId);

  const [gradeSnapshot, recordSnapshot] = await Promise.all([
    db.collection("grades").doc(studentId).get(),
    db.collection(TEST_CYCLE_RECORDS).doc(testCycleRecordKey(assignmentId, studentId)).get(),
  ]);
  // Audience OR an existing record: a teacher may assign a Test Cycle to named
  // students rather than a whole class, and that student's own secure session
  // is as good an answer to "is this yours?" as a class id is.
  if (!recordSnapshot.exists
    && !studentMatchesAssignmentAudience({
      assignment, classId: gradeSnapshot.data()?.classId || null, gradeData: gradeSnapshot.data(), assignmentId,
    })) {
    throw new HttpsError("permission-denied", "That assessment is not assigned to you.");
  }
  let record = shared.record.normalizeTestCycleRecord(
    recordSnapshot.exists ? recordSnapshot.data() : { assignmentId, studentId },
  );
  const tracker = gradeSnapshot.data()?.gradesByAssignment?.[assignmentId] || {};
  const reviewProgress = testCycleLib.reviewProgress(assignment, tracker);
  // The stage, then the assignment-level gate laid over it: an archived or
  // not-yet-open assessment keeps its stage but cannot be entered, and the card
  // says why in the words the server would refuse with.
  const availability = shared.availability.resolveAssessmentAvailability({ assignment, now: Date.now() });
  // When each secure part is open for this student: the class-time Test
  // window and the home window. The same schedule the entry gate reads.
  const schedule = await studentTestCycleSchedule(db, shared, {
    assignment, policy, gradeData: gradeSnapshot.data() || {}, record,
  });
  const resolveCard = () => shared.stages.applyAssessmentAvailability(
    shared.stages.resolveTestCycleStage({ policy, record, reviewProgress, schedule }),
    availability,
  );
  let state = resolveCard();
  /*
   * A STUDENT WHO MISSED THE TEST IS GIVEN THEIR RETEST HERE.
   *
   * Nothing else would ever open it: there is no released Test to trigger
   * one, and waiting for a teacher to notice is exactly how an absent student
   * was stranded. Past the Review gate, with the home window not yet over and
   * the assessment open, opening their card opens their Retest.
   */
  if (!preview
    && state.missedTest
    && state.stage === shared.stages.TEST_CYCLE_STAGE.RETEST_READY
    && availability.open
    && schedule?.followUp?.state !== shared.schedule.WINDOW_STATE.CLOSED) {
    const opened = await ensureMissedTestRetestSession(db, {
      assignmentId, assignment, policy, blueprint, shared, studentId, schedule,
    });
    if (opened) {
      record = await readTestCycleRecord(db, assignmentId, studentId, shared);
      state = resolveCard();
    }
  }

  let corrections = null;
  const inCorrections = !preview && state.stage === shared.stages.TEST_CYCLE_STAGE.CORRECTIONS && availability.open;
  if (inCorrections) {
    const planSnapshot = await db.collection(TEST_CYCLE_CORRECTION_PLANS).doc(record.recordId).get();
    const plan = planSnapshot.exists ? planSnapshot.data()?.plan : null;
    corrections = plan ? studentVisibleCorrectionPlan(plan) : null;
  }
  // Whether the Test review offered beside Corrections would hold its answers
  // and worked solutions (courseAnswersHeld), so Corrections says what it
  // opens. Asked only there, where it is shown: a full check reads the
  // cycle's records; the open review's 30-second re-check reads only the
  // student the last one found holding them, while they still do (PF03).
  const testReviewOffered = record.test.state === shared.record.SESSION_STATE.RELEASED
    && !secureExam.courseReviewBlockedBy(record, { examSessionId: record.test.examSessionId, cycleStage: "test" });
  let testAnswersHeld = null;
  if (testReviewOffered && inCorrections) {
    try {
      testAnswersHeld = await courseAnswersHeld(db, shared, assignmentId, "test", { assignment });
    } catch {
      testAnswersHeld = true;
    }
  }
  // The Test as this student sits it. A student whose teacher excused
  // questions for a fewer-items plan (TC15) is told how many questions THEIR
  // Test has, skill by skill — and nothing else: no note, no name for it.
  const excusedSlotIds = shared.reducedItems.applicableExcusedSlotIds(record, blueprint);
  const ownBlueprint = excusedSlotIds.length ? shared.reducedItems.studentTestBlueprint(blueprint, excusedSlotIds) : blueprint;

  return {
    success: true,
    assignmentId,
    // A look also says whether this student has ANY secure session for the
    // cycle, from their record — the complete answer, where the session list
    // (capped, unordered) may not be.
    ...(preview ? { preview: true, hasSecureSession: Boolean(record.test.examSessionId || record.retest.examSessionId) } : {}),
    title: blueprint.title || assignment?.title || "Test Cycle",
    stage: state.stage,
    secure: state.secure,
    hintsAllowed: state.hintsAllowed,
    canEnter: state.canEnter,
    actionLabel: state.actionLabel,
    statusLabel: state.statusLabel,
    detail: state.detail,
    phases: shared.stages.buildTestCyclePhaseStatus({ state, record }),
    examSessionId: shared.stages.stageIsSecure(state.stage)
      ? (state.stage === shared.stages.TEST_CYCLE_STAGE.RETEST ? record.retest.examSessionId : record.test.examSessionId)
      : null,
    // Which released secure session a "Review Test" / "Review Retest" action
    // opens. The retest when there is one, otherwise the original Test.
    reviewExamSessionId: record.retest.state === shared.record.SESSION_STATE.RELEASED
      ? record.retest.examSessionId
      : record.test.state === shared.record.SESSION_STATE.RELEASED
        ? record.test.examSessionId
        : null,
    // The original Test's released session on its own, so "Review my Test"
    // still reaches it once a released Retest has taken over the field above.
    // The card offers it only at stages where no secure item can be answered,
    // and it is not sent at all while a Retest session is assigned or under
    // way — the line getStudentSecureExamReview holds (`retest_open`). A
    // teacher closing retesting does not end a Retest already issued, so the
    // stage alone ("retestClosed") cannot say the review would open.
    // Offered exactly when getStudentSecureExamReview would open it: the same
    // rule (secureExam.courseReviewBlockedBy) decides both.
    testReviewExamSessionId: testReviewOffered ? record.test.examSessionId : null,
    testAnswersHeld,
    grade: shared.record.testCycleGradeBreakdown(record, policy),
    corrections,
    // Everything below is question-free and score-free: what a student needs
    // to understand the card without asking anyone.
    availability: { open: availability.open, reason: availability.reason, opensAt: availability.opensAt },
    // The exact opening and closing times, in the school's zone, for the Test
    // and for Corrections and the Retest, and whether each may be done from
    // home. Null for an external-original cycle, which has no such windows.
    schedule: publicTestCycleSchedule(shared, schedule, { audience: "student", missedTest: state.missedTest === true }),
    dueAt: assignment?.dueAt || assignment?.dueDate || null,
    reviewProgress: {
      attempted: reviewProgress.attempted,
      total: reviewProgress.total,
      complete: reviewProgress.complete,
      // A mastery-gated Review (review.minimumMastery) says how far along the
      // student is against the bar, not just how many items they answered.
      ...(reviewProgress.minimumMastery !== undefined ? { mastery: reviewProgress.mastery, minimumMastery: reviewProgress.minimumMastery } : {}),
    },
    policy: {
      passingScore: policy.passingScore,
      maxRecordedGrade: policy.retest.maxRecordedGrade,
      gradeReplacement: policy.retest.gradeReplacement,
      summary: state.policySummary,
      external: Boolean(policy.externalAssessment),
    },
    delivery: testCycleDeliveryFacts(ownBlueprint, {
      timeMultiplier: await secureExamTimeMultiplierFromProfile(gradeSnapshot.data()?.profile || null, studentId),
    }),
    // "What's on this test": the skills the blueprint covers and how many
    // questions each gets — what a real test's study guide says. Never which
    // question is which (not even by the list's order), and nothing about
    // families, seeds or answers.
    testSkills: await testCycleSkillList(ownBlueprint),
    // The Review, skill by skill: answered and correct so far, from the same
    // tracker the gate reads. Instruction only — nothing from the secure Test,
    // and it does not change what unlocks it (reviewProgress does that).
    reviewBySkill: await testCycleLib.reviewProgressBySkill(assignment, tracker, { targets: blueprint?.targets }),
  };
});

/*
 * The blueprint's skills for the student card. The rules live in
 * functions/lib/testCycle.js `testSkillList`, where node tests run them on a
 * real normalized blueprint: a label is sent only when it is a name (never the
 * code normalizeTestBlueprint puts in an empty label), and the list's order
 * says nothing about the order questions are issued in.
 */
function testCycleSkillList(blueprint) {
  return testCycleLib.testSkillList(blueprint);
}

/**
 * Corrections, as a student may see them.
 *
 * Families and the instances that produced them are stripped: a student asks
 * for a correction question by correctionId and the server decides what to
 * instantiate. What IS kept is the standard and the reason, because a student
 * doing corrections is entitled to know what they are working on.
 *
 * THE NAMED MISTAKE IS SHOWN WHILE THE CLASS STILL TESTS (TC12; kept as built).
 * Corrections open when this student's own Test is released, whether or not the
 * class has finished (`testAnswersHeld`). Beside their own released answer, "the
 * mistake to watch for" lets that student undo it and read their own correct
 * answer. What the hold keeps back is the class's correct answers and worked
 * solutions, and those stay held; this names one error on one student's own,
 * already-submitted work, and Test instances are seeded per student, so it never
 * hands a classmate theirs. To withhold it until the class has finished
 * instead, drop `diagnosis`, `misconception` and `diagnosisDetail` here while
 * getStudentTestCycle's `testAnswersHeld` is true, and say on the screen that
 * the named mistakes open with the answers. That costs an early finisher the
 * most useful line Corrections has.
 */
function studentVisibleCorrectionPlan(plan) {
  return {
    planId: plan.planId,
    secure: false,
    hintsAllowed: true,
    gradeImpact: "none",
    complete: plan.complete === true,
    targets: (plan.targets || []).map((target) => ({
      correctionId: target.correctionId,
      order: target.order,
      label: target.label,
      alignmentKey: target.alignmentKey,
      diagnosis: target.diagnosis,
      // The canonical code behind a `misconception` diagnosis, so the screen
      // can show its student message (misconceptionStudentMessages.mjs). A
      // registry code names an error, never an answer.
      misconception: target.diagnosis === "misconception" ? (target.misconception || null) : null,
      diagnosisDetail: target.diagnosisDetail,
      missed: target.missed,
      requiredCorrectResponses: target.requiredCorrectResponses,
      correctResponses: target.correctResponses,
      complete: target.complete === true,
    })),
  };
}

const CORRECTION_ATTEMPTS_PER_QUESTION = 3;

/** The display-only diagnosis of a corrections miss, or null. Never throws. */
async function correctionMissDiagnosisFor(storedItem, grading, responsePayload) {
  try {
    const item = secureItems.readStoredItem(storedItem) || {};
    const privateGrading = item.privateGrading || null;
    if (!privateGrading) return null;
    // A tool item's bounded work; a field item's typed responses.
    const raw = privateGrading.pathToolId ? await secureItems.rawWorkOf(responsePayload || {}) : null;
    const responses = responsePayload?.responses && typeof responsePayload.responses === "object" ? responsePayload.responses : null;
    const { diagnoseCorrectionMiss } = await import("./shared/correctionMissDiagnosis.mjs");
    return diagnoseCorrectionMiss({ privateGrading, grading, raw, responses, question: item });
  } catch {
    return null;
  }
}

/*
 * CORRECTIONS CLOSE WHILE THE STUDENT'S OWN TEST OR RETEST IS OPEN.
 *
 * Corrections hand out hints and, after a third miss, a worked solution, on
 * parallel items from the same families the Test and the Retest draw on. Once
 * either is assigned or under way, that is an open book for it: a Retest a
 * teacher opened with the plan unfinished (waived corrections, an unlocked
 * retest), or the new Test a teacher's reset assigned while the old plan is
 * still there. No correction question is issued and no response is taken
 * until that attempt is submitted.
 */
function assertCorrectionsOpenFor(shared, record) {
  const { ASSIGNED, IN_PROGRESS } = shared.record.SESSION_STATE;
  const open = (state) => state === ASSIGNED || state === IN_PROGRESS;
  const sitting = open(record.retest.state) ? "Retest" : open(record.test.state) ? "Test" : null;
  if (sitting) {
    throw new HttpsError("failed-precondition", `Corrections are closed while your ${sitting} is open. They open again once you submit it.`, {
      reason: sitting === "Retest" ? "retest_open" : "test_open",
    });
  }
}

/**
 * Is the home window (Corrections and the Retest) open for this student?
 *
 * Read from their record's class, so it needs no full read of their grade
 * document: only its `profile`, for their own final close (TC07). Nothing is
 * enforced until a teacher has set a Test day or a close.
 */
async function assertFollowUpWindowOpen(db, shared, { assignment, policy, record, what, plural = false }) {
  const schedule = await studentTestCycleSchedule(db, shared, { assignment, policy, record });
  const refusal = schedule ? shared.schedule.followUpRefusal(schedule.followUp, { timeZone: shared.timeZone, what, plural }) : null;
  if (refusal) throw new HttpsError("failed-precondition", refusal, { window: "followUp" });
}

/**
 * Issue one CORRECTION question.
 *
 * Instructional delivery, deliberately unlike the secure path: three attempts,
 * hints and solution support allowed, immediate feedback. The one thing it
 * shares with the secure path is that the answer key stays on the server.
 *
 * The instance the student missed on the Test is explicitly forbidden, and a
 * parallel family is preferred, so a correction cannot become "here is the
 * question you got wrong, with the answer".
 */
exports.issueTestCycleCorrectionQuestion = onCall(async (request) => {
  const { studentId } = requireStudent(request);
  const correctionId = String(request.data?.correctionId || "").trim();
  if (!correctionId) throw new HttpsError("invalid-argument", "A correctionId is required.");
  const db = getFirestore();
  const { assignmentId, assignment, policy, shared } = await loadTestCycleAssignment(db, request.data?.assignmentId);
  await assertTestCycleAssessmentOpen(shared, assignment);
  const correctionsRecord = await readTestCycleRecord(db, assignmentId, studentId, shared);
  assertCorrectionsOpenFor(shared, correctionsRecord);
  // A NEW correction question is issued only inside the home window. An answer
  // to a question already issued is still taken after it closes
  // (submitTestCycleCorrectionResponse): work begun in time is not thrown away.
  await assertFollowUpWindowOpen(db, shared, { assignment, policy, record: correctionsRecord, what: "Corrections", plural: true });
  const recordId = testCycleRecordKey(assignmentId, studentId);
  const planRef = db.collection(TEST_CYCLE_CORRECTION_PLANS).doc(recordId);
  const planSnapshot = await planRef.get();
  if (!planSnapshot.exists) throw new HttpsError("not-found", "You have no corrections for this assessment.");
  const stored = planSnapshot.data() || {};
  if (String(stored.studentId || "") !== studentId) throw new HttpsError("not-found", "You have no corrections for this assessment.");
  const target = (stored.plan?.targets || []).find((entry) => entry.correctionId === correctionId);
  if (!target) throw new HttpsError("not-found", "That correction is not part of your plan.");
  if (target.complete === true) throw new HttpsError("failed-precondition", "That correction is already complete.");

  const open = stored.activeQuestions?.[correctionId];
  if (open) {
    return {
      success: true,
      // The same Rich Tool the Test used, under the Corrections policy: hints
      // and immediate feedback on, the answer still on the server.
      questionInstance: await secureItems.publicItem(open, { mode: "corrections" }),
      attemptsAllowed: open.attemptsAllowed,
      attemptsUsed: Number(open.attemptsUsed || 0),
      hintsAllowed: true,
      secure: false,
    };
  }

  /*
   * A CORRECTION IS A PARALLEL ITEM, NOT THE SECURE ITEM WITH ITS ANSWER SHOWN.
   *
   * Two things keep it that way, and neither is a comparison of instance ids:
   * `practiceFamilyIds` already excludes the families this student met on the
   * Test wherever another family exists, and the SEED below is derived from the
   * correction and the attempt rather than from the exam slot — so even a
   * family that had to repeat generates different numbers. Instance ids are
   * minted fresh here and could never collide with the exam's, which is why
   * checking them would be a test that can only pass.
   */
  const declaredFamilies = await resolveBlueprintFamilies(db, target.practiceFamilyIds || []);
  const { secureTools: correctionTools } = await secureItems.sharedModules();
  const attemptIndex = Number(target.correctResponses || 0) + Number(stored.issuedCounts?.[correctionId] || 0);
  // Approved families only, the student's Test tool first, rotating per item
  // (orderCorrectionFamilies says why).
  const families = shared.corrections.orderCorrectionFamilies({
    families: declaredFamilies,
    testToolIds: target.testToolIds || [],
    toolOf: (family) => correctionTools.resolveSecureToolId(family) || "fields",
    attemptIndex,
  });
  let issued = null;
  for (let offset = 0; offset < Math.max(1, families.length); offset += 1) {
    const family = families[offset];
    if (!family) break;
    const questionInstanceId = mathPath.runtimeId("correction");
    // eslint-disable-next-line no-await-in-loop
    const instantiated = await mathPath.instantiateQuestion(
      family,
      `${stored.plan.planId}|${correctionId}|${attemptIndex + offset}`,
      { preferredDok: target.dok, preferredDifficultyBand: target.difficultyBand },
    );
    if (!instantiated.question) continue;
    // eslint-disable-next-line no-await-in-loop
    const issuePlan = await mathPath.buildIssuePlan(instantiated.question);
    if (!issuePlan.issuable) continue;
    // A family whose tool is not certified for Corrections is skipped for the
    // next parallel family, never delivered as a downgraded text box.
    // eslint-disable-next-line no-await-in-loop
    const certification = await secureItems.certifyItem(instantiated.question, { mode: "corrections" });
    if (!certification.compatible) continue;
    // Stored on the correction plan with its tool fields encoded (see
    // secureItemStorage): arrays of arrays cannot be stored.
    issued = secureItems.storableItem({
      ...instantiated.question,
      bankQuestionId: family.id,
      familyId: family.id,
      questionInstanceId,
      correctionId,
      // Instruction, not assessment. Three attempts and full support.
      attemptsAllowed: CORRECTION_ATTEMPTS_PER_QUESTION,
      attemptsUsed: 0,
      privateGrading: issuePlan.privateGrading,
      ...issuePlan.toolPayload,
    });
    break;
  }
  if (!issued) throw new HttpsError("failed-precondition", "No parallel practice item could be generated for this correction.");

  // Two tabs asking at once converge on ONE open question per correction.
  const active = await db.runTransaction(async (transaction) => {
    const fresh = (await transaction.get(planRef)).data() || {};
    const existing = fresh.activeQuestions?.[correctionId];
    if (existing) return existing;
    transaction.set(planRef, {
      ...fresh,
      activeQuestions: { ...(fresh.activeQuestions || {}), [correctionId]: issued },
      issuedCounts: { ...(fresh.issuedCounts || {}), [correctionId]: Number(fresh.issuedCounts?.[correctionId] || 0) + 1 },
      updatedAt: Date.now(),
    });
    return issued;
  });

  return {
    success: true,
    questionInstance: await secureItems.publicItem(active, { mode: "corrections" }),
    attemptsAllowed: CORRECTION_ATTEMPTS_PER_QUESTION,
    attemptsUsed: Number(active.attemptsUsed || 0),
    hintsAllowed: true,
    secure: false,
    passingScore: policy.passingScore,
  };
});

/**
 * Grade one correction response and, when the plan finishes, open the Retest.
 *
 * A correction NEVER touches the recorded grade. It advances a correction
 * target only on a correct response, and the only grade-adjacent thing it can
 * do at the end of the plan is unlock a secure retest the student then has to
 * actually take.
 *
 * THREE ATTEMPTS MEANS THREE ATTEMPTS. The open question used to be discarded
 * after the first response, right or wrong, while the screen promised three
 * tries — so "Try again" met "That correction question is no longer active."
 * A wrong answer now keeps the question open until it is answered correctly or
 * its attempts are used, and only then is a fresh parallel item issued.
 */
exports.submitTestCycleCorrectionResponse = onCall(async (request) => {
  const { studentId } = requireStudent(request);
  const correctionId = String(request.data?.correctionId || "").trim();
  const questionInstanceId = String(request.data?.questionInstanceId || "").trim();
  if (!correctionId || !questionInstanceId) throw new HttpsError("invalid-argument", "correctionId and questionInstanceId are required.");
  const db = getFirestore();
  const { assignmentId, assignment, policy, blueprint, shared } = await loadTestCycleAssignment(db, request.data?.assignmentId);
  // Paused or archived: no responses, as no questions are issued.
  await assertTestCycleAssessmentOpen(shared, assignment);
  const recordId = testCycleRecordKey(assignmentId, studentId);
  const planRef = db.collection(TEST_CYCLE_CORRECTION_PLANS).doc(recordId);
  const recordRef = db.collection(TEST_CYCLE_RECORDS).doc(recordId);
  const preview = (await planRef.get()).data() || null;
  if (!preview) throw new HttpsError("not-found", "You have no corrections for this assessment.");
  if (String(preview.studentId || "") !== studentId) throw new HttpsError("not-found", "You have no corrections for this assessment.");
  const openForGrading = preview.activeQuestions?.[correctionId];
  if (!openForGrading || openForGrading.questionInstanceId !== questionInstanceId) {
    throw new HttpsError("failed-precondition", "That correction question is no longer active.");
  }
  // Graded once, outside the transaction; the transaction below re-checks that
  // this exact question is still open before it records anything, so a double
  // click or a second tab cannot credit the same answer twice.
  const grading = await secureItems.gradeIssuedItem(openForGrading, request.data?.responsePayload || {});
  // An unfinished construction is told so, and does not spend one of the
  // three tries — exactly as a secure item refuses it.
  if (grading.rejected) {
    throw new HttpsError("invalid-argument", grading.detail || "Finish your work in the tool, then check it.");
  }
  const now = Date.now();
  // The student's reflection on this skill rides along (TC11), loaded here and
  // never inside the transaction. It is kept only if it passes the normalizer.
  const { withCorrectionReflection } = await import("./shared/testCycleReflection.mjs");

  const applied = await db.runTransaction(async (transaction) => {
    const [planSnapshot, recordSnapshot] = await Promise.all([transaction.get(planRef), transaction.get(recordRef)]);
    // Checked with the write, so a Retest opened meanwhile gets no worked solution.
    assertCorrectionsOpenFor(shared, shared.record.normalizeTestCycleRecord(recordSnapshot.exists ? recordSnapshot.data() : { assignmentId, studentId }));
    const stored = planSnapshot.data() || {};
    const open = stored.activeQuestions?.[correctionId];
    if (!open || open.questionInstanceId !== questionInstanceId) {
      throw new HttpsError("failed-precondition", "That correction question is no longer active.");
    }
    const attemptsUsed = Number(open.attemptsUsed || 0) + 1;
    const attemptsAllowed = Number(open.attemptsAllowed || CORRECTION_ATTEMPTS_PER_QUESTION);
    const nextPlan = grading.isCorrect
      ? shared.corrections.applyCorrectionEvidence(stored.plan, { correctionId, isCorrect: true, at: now })
      : stored.plan;
    const questionClosed = grading.isCorrect === true || attemptsUsed >= attemptsAllowed;
    const activeQuestions = { ...(stored.activeQuestions || {}) };
    if (questionClosed) delete activeQuestions[correctionId];
    else activeQuestions[correctionId] = { ...open, attemptsUsed };
    // TC11: what the student said went wrong and how they will fix it, kept
    // beside the plan, server-only, for the teacher's view. Not part of the plan
    // the algorithm builds, and it moves no grade.
    const reflections = withCorrectionReflection(stored.reflections, correctionId, request.data?.reflection, now);
    transaction.set(planRef, {
      ...stored, plan: nextPlan, activeQuestions, ...(Object.keys(reflections).length ? { reflections } : {}), updatedAt: now,
    });
    return {
      nextPlan,
      questionClosed,
      attemptsUsed,
      attemptsRemaining: questionClosed ? 0 : Math.max(0, attemptsAllowed - attemptsUsed),
    };
  });
  const progress = shared.corrections.correctionPlanProgress(applied.nextPlan);

  const persisted = await mutateTestCycleRecord(db, {
    assignmentId,
    studentId,
    shared,
    policy,
    mutate: async (record, { transaction }) => {
      // Re-read the plan inside the record's transaction: two correction
      // answers landing together must leave the record counting both.
      const latest = (await transaction.get(planRef)).data()?.plan || applied.nextPlan;
      const latestProgress = shared.corrections.correctionPlanProgress(latest);
      return {
        record: {
          ...record,
          corrections: {
            ...record.corrections,
            planId: latest.planId,
            total: latestProgress.total,
            completedTargets: latestProgress.complete,
            complete: latestProgress.allComplete,
            completedAt: latestProgress.allComplete ? (record.corrections.completedAt || now) : record.corrections.completedAt,
          },
        },
      };
    },
  });

  // Corrections complete is the ordinary gate. Opening the retest here is what
  // makes it automatic — no teacher has to notice and no student has to ask.
  let retest = null;
  if (progress.allComplete && !persisted.record.teacherControls.retestDisabled) {
    retest = await ensureRetestSession(db, {
      assignmentId, assignment, policy, blueprint, shared, studentId, teacherUid: null,
    });
  }

  /*
   * THE INSTRUCTION, RELEASED THE WAY MY MATH PATH RELEASES IT.
   *
   * Corrections is where help is the point, so a miss gets the item's own
   * authored feedback (a specific misconception message where the answer
   * matches one), a hint from the SECOND miss on, and — only once this
   * parallel item is closed and a fresh one will replace it — its worked
   * review. Never the secure Test item: this is a parallel instance.
   */
  // A miss the item's own work explains gets the student message for it, not
  // the generic line (correctionMissDiagnosis.mjs). Display only: it is read
  // from the same server-held definition the grader used, after grading.
  const diagnosis = grading.isCorrect === true ? null : await correctionMissDiagnosisFor(openForGrading, grading, request.data?.responsePayload);
  const support = await mathPath.attemptSupport({
    support: await mathPath.buildPrivateSupport(openForGrading),
    attemptNumber: applied.attemptsUsed,
    attemptsAllowed: Number(openForGrading.attemptsAllowed || CORRECTION_ATTEMPTS_PER_QUESTION),
    isCorrect: grading.isCorrect === true,
    questionFinalized: applied.questionClosed,
    responsePayload: request.data?.responsePayload || null,
    diagnosis,
  });
  /*
   * Worked steps for a closed item with none of its own (CT02): a District
   * DOL #2 family, which Corrections draws on when a Test Cycle's blueprint is
   * the DOL #2 one, carries no worked solution, so its closed item showed
   * nothing. The released Test review's own per-item builder works THIS issued
   * item, with every stated answer held to its key by the grader that just
   * scored it (secureExamItems.reviewWithWorkedSteps). Only once the item is
   * closed, exactly where its own review would be released; stored nowhere.
   */
  const solutionReview = applied.questionClosed
    ? await secureExamItems.reviewWithWorkedSteps(support?.solutionReview || null, openForGrading)
    : null;

  return {
    success: true,
    isCorrect: grading.isCorrect === true,
    score: grading.score,
    // Per-part verdicts: Corrections is instructional, so a multi-part tool
    // item may colour the parts the student still has to fix.
    parts: grading.parts,
    feedbackMessage: support?.feedback?.message || null,
    hint: support?.support?.hint || null,
    solutionReview,
    attemptsUsed: applied.attemptsUsed,
    attemptsRemaining: applied.attemptsRemaining,
    questionClosed: applied.questionClosed,
    correctionsComplete: progress.allComplete,
    progress,
    retestOpened: Boolean(retest),
  };
});

/**
 * Build and open this student's secure Retest.
 *
 * Everything that decides WHAT the retest asks happens here and is stored
 * before the session becomes enterable: the performance profile from the
 * released Test, the ~70/30 retest blueprint, and the deterministic issuance
 * plan with the original families and instances passed in as things to avoid.
 *
 * The session, the stored retest plan and the record's pointer to them are
 * written in ONE transaction that re-checks the record first, so the three
 * paths that can open a retest (corrections finished, release with no gate, a
 * teacher waiver) racing each other still leave exactly one Retest.
 */
async function ensureRetestSession(db, { assignmentId, assignment, policy, blueprint, shared, studentId, teacherUid }) {
  if (policy.externalAssessment) return null;
  const record = await readTestCycleRecord(db, assignmentId, studentId, shared);
  if (record.retest.examSessionId) return null;
  if (record.test.state !== shared.record.SESSION_STATE.RELEASED) return null;
  if (record.teacherControls.retestDisabled) return null;

  const testSessionSnapshot = record.test.examSessionId
    ? await db.collection("examSessions").doc(record.test.examSessionId).get()
    : null;
  if (!testSessionSnapshot?.exists) return null;
  const testSession = testSessionSnapshot.data() || {};

  /*
   * TC15: A STUDENT WHOSE TEACHER EXCUSED QUESTIONS (a fewer-items plan) has
   * a Retest built from the Test they actually sat — its skills, read from
   * their answers — and shorter by the same share. The choice is locked once
   * the Test started, so the record read above is the one that applied.
   * Anyone else: exactly the call it always was.
   */
  const excused = shared.reducedItems.applicableExcusedSlotIds(record, blueprint);
  const ownBlueprint = excused.length ? shared.reducedItems.studentTestBlueprint(blueprint, excused) : blueprint;
  const profile = shared.corrections.buildPerformanceProfile({
    blueprint: ownBlueprint,
    responses: testCycleLib.responsesForProfile(testSession),
  });
  const generated = excused.length
    ? shared.retest.buildRetestBlueprint({
      blueprint: ownBlueprint,
      profile,
      policy,
      questionCount: shared.reducedItems.studentRetestQuestionCount({ blueprint, excusedSlotIds: excused, policy }),
    })
    : shared.retest.buildRetestBlueprint({ blueprint, profile, policy });
  if (!generated) return null;

  const families = await resolveBlueprintFamilies(db, blueprintFamilyIds(generated.blueprint));
  const plan = shared.issuance.buildSecureIssuancePlan({
    blueprint: generated.blueprint,
    families,
    studentId,
    assignmentId,
    stage: shared.issuance.CYCLE_STAGE.RETEST,
    attempt: Number(record.retest.attempt || 1),
    avoidFamilyIds: generated.audit.avoidFamilyIds,
    avoidInstanceIds: generated.audit.avoidInstanceIds,
    // A missed graphing skill is retested on the graphing tool.
    preferredToolsByTarget: shared.retest.retestToolPreferences({ profile, retestBlueprint: generated.blueprint }),
  });
  if (shared.issuance.planRequiresLiveGeneration(plan)) return null;

  const studentSnapshot = await db.collection("grades").doc(studentId).get();
  const outcome = await mutateTestCycleRecord(db, {
    assignmentId,
    studentId,
    shared,
    policy,
    mutate: (current, { transaction }) => {
      // Another path opened it, or the teacher closed it, while this one was
      // building the plan. Either way there is nothing to open.
      if (current.retest.examSessionId
        || current.test.state !== shared.record.SESSION_STATE.RELEASED
        || current.teacherControls.retestDisabled
        || Number(current.retest.attempt || 1) !== Number(plan.attempt || 1)) {
        return { value: null };
      }
      const { ref, session } = buildCourseTestSession(db, {
        assignmentId,
        assignment,
        studentId,
        studentData: studentSnapshot.data() || {},
        blueprint: generated.blueprint,
        plan,
        cycleStage: shared.issuance.CYCLE_STAGE.RETEST,
        teacherUid,
        title: `${assignment?.title || blueprint.title} — Retest`,
      });
      transaction.set(ref, session);
      transaction.set(db.collection(TEST_CYCLE_RETEST_PLANS).doc(current.recordId), {
        recordId: current.recordId,
        assignmentId,
        studentId,
        blueprint: generated.blueprint,
        audit: generated.audit,
        plan,
        createdAt: Date.now(),
      });
      return {
        value: { examSessionId: session.examSessionId, audit: generated.audit },
        record: {
          ...current,
          retest: {
            ...current.retest,
            examSessionId: session.examSessionId,
            planId: plan.planId,
            blueprintId: plan.blueprintId,
            blueprintVersion: plan.blueprintVersion,
            state: shared.record.SESSION_STATE.ASSIGNED,
            totalQuestions: plan.totalQuestions,
          },
        },
      };
    },
  });
  return outcome.value || null;
}

/** Teacher overrides. Each one is an explicit decision, recorded as such. */
exports.teacherTestCycleAction = onCall(TEST_CYCLE_ACTION_OPTIONS, async (request) => {
  const db = getFirestore();
  const assignmentSnapshot = await assignmentForTeacherCall(request, db);
  const { teacherUid } = await assertTeacherMayManageAssignment(request, assignmentSnapshot);
  const { assignmentId, assignment, policy, blueprint, shared } = await loadTestCycleAssignment(db, assignmentSnapshot.id);
  const action = String(request.data?.action || "").trim();
  if (policy.externalAssessment && (["requireCorrections", "waiveCorrections"].includes(action)
    || (action === "resetSecureSession" && request.data?.stage === "retest"))) {
    throw new HttpsError("invalid-argument", "This external-original assessment uses Review and one secure Retest session.");
  }
  if (!shared.policy.TEACHER_CONTROL_ACTIONS.includes(action)) {
    throw new HttpsError("invalid-argument", "Choose a supported Test Cycle teacher action.");
  }
  // The student has to be one this assignment is FOR. A record is what grants
  // access, so an action must not create one for a typed-in id.
  const { studentId, gradeData } = await assertStudentInTestCycleAudience(db, {
    assignment, assignmentId, studentId: request.data?.studentId,
  });
  const resetStage = String(request.data?.stage || "test").trim() === "retest" ? "retest" : "test";
  const families = action === "resetSecureSession" && resetStage === "test"
    ? await resolveBlueprintFamilies(db, blueprintFamilyIds(blueprint))
    : [];

  const persisted = await mutateTestCycleRecord(db, {
    assignmentId,
    studentId,
    shared,
    policy,
    mutate: async (record, { transaction }) => {
      const controls = shared.policy.applyTeacherControlAction(record.teacherControls, action);
      let next = { ...record, teacherControls: controls };

      if (action === "resetSecureSession") {
        const stage = resetStage;
        const current = stage === "retest" ? record.retest : record.test;

        /*
         * A reset must not un-prove the Review the student already passed.
         *
         * The replacement Test goes back to `assigned`, which is the same shape a
         * student who has never passed Review is in. Records written since the
         * entry path started stamping `review.complete` carry the answer already;
         * one written before it does not, and would silently revert to "Review" in
         * the gradebook. The outgoing session's own state is the proof, so it is
         * carried across here rather than lost with the session it belonged to.
         */
        if (record.review.complete !== true
          && current.state !== shared.record.SESSION_STATE.NONE
          && current.state !== shared.record.SESSION_STATE.ASSIGNED) {
          next = { ...next, review: { ...next.review, complete: true, completedAt: next.review.completedAt || Date.now() } };
        }

        // The new attempt is a new coverage key (answerCoverageKey): no
        // explicit answer release covers it until a teacher confirms it.

        if (current.examSessionId) {
          // The old session is closed, not deleted: the evidence a student produced
          // stays readable, and the new attempt draws a genuinely different plan
          // because `attempt` is part of the plan seed.
          transaction.set(
            db.collection("examSessions").doc(current.examSessionId),
            { status: "force_submitted", resetByTeacher: teacherUid, resetAt: Date.now(), updatedAt: Date.now(), autoFinalizeAt: null },
            { merge: true },
          );
        }
        const attempt = Number(current.attempt || 1) + 1;
        if (stage === "test") {
          // A new attempt keeps the questions this student's teacher excused
          // for a fewer-items plan (TC15); it draws new items for the rest.
          const plan = shared.reducedItems.applyExcusedQuestionsToPlan(shared.issuance.buildSecureIssuancePlan({
            blueprint, families, studentId, assignmentId, stage: shared.issuance.CYCLE_STAGE.TEST, attempt,
          }), shared.reducedItems.applicableExcusedSlotIds(record, blueprint));
          const { ref, session } = buildCourseTestSession(db, {
            assignmentId, assignment, studentId, studentData: gradeData,
            blueprint, plan, cycleStage: shared.issuance.CYCLE_STAGE.TEST, teacherUid, title: assignment?.title,
          });
          transaction.set(ref, session);
          next = {
            ...next,
            test: {
              ...next.test,
              examSessionId: session.examSessionId,
              planId: plan.planId,
              attempt,
              state: shared.record.SESSION_STATE.ASSIGNED,
              rawScore: null,
              releasedAt: null,
              submittedAt: null,
              answeredQuestions: 0,
              totalQuestions: plan.totalQuestions,
            },
          };
        } else {
          next = { ...next, retest: { ...next.retest, examSessionId: null, planId: null, attempt, state: shared.record.SESSION_STATE.NONE, rawScore: null, releasedAt: null, submittedAt: null, answeredQuestions: 0 } };
        }
        // A reset can clear an already-released score, so it belongs in the audit
        // trail beside the releases. Classroom is unaffected: a null recorded grade
        // is skipped by the passback trigger, so the posted grade simply stands.
        next = {
          ...next,
          history: shared.grade.appendTestCycleGradeHistory(next.history, {
            at: Date.now(),
            reason: shared.grade.GRADE_HISTORY_REASON.TEACHER_OVERRIDE,
            recordedGrade: shared.record.recordGradeState(next, policy).recordedGrade,
            detail: `Teacher reset the secure ${stage} session (attempt ${attempt}).`,
          }),
        };
      }
      return { record: next };
    },
  });

  /*
   * These controls all have to leave the student somewhere they can go.
   *
   * Waiving corrections or unlocking a retest opens one because that is what
   * those controls are FOR. Resetting the RETEST has to open one too: the reset
   * clears the stage's session, and without a replacement the student sat at
   * "retest pending" with nothing behind it — the same trap waiving used to be.
   * Resetting the TEST already mints its replacement inline above.
   */
  const resetRetest = action === "resetSecureSession" && resetStage === "retest";
  let retest = null;
  if (["waiveCorrections", "unlockRetest"].includes(action) || resetRetest) {
    retest = await ensureRetestSession(db, { assignmentId, assignment, policy, blueprint, shared, studentId, teacherUid });
  }
  // A student who missed the Test has no released Test for that to build
  // from: their Retest is the full form. Waiving their Review, reopening
  // their retest or resetting it leaves them somewhere to go as well.
  if (!retest && (["waiveReview", "waiveCorrections", "unlockRetest"].includes(action) || resetRetest)) {
    retest = await ensureMissedTestRetestIfDue(db, {
      assignmentId, assignment, policy, blueprint, shared, studentId, gradeData, teacherUid,
    });
  }

  return {
    success: true,
    action,
    studentId,
    teacherControls: persisted.record.teacherControls,
    stage: persisted.stage,
    retestOpened: Boolean(retest),
  };
});

/*
 * ONE ROW PER STUDENT, AND A STUDENT WHO HAS NOT STARTED IS STILL A ROW.
 *
 * The teacher's results view used to list only students who already had a
 * record — i.e. only after "open sessions" — so "who hasn't started Review?"
 * had no answer, and a student who joined the class later was simply absent.
 * Rows now come from the assignment's audience AND from existing records, and
 * each carries the student's Review progress read from the same tracker the
 * server gates the Test on, so the stage a teacher sees is the stage the
 * student is actually in (not "Review" for everyone who has not started).
 */
const TEACHER_ROW_BUCKET = Object.freeze({
  NOT_STARTED: "notStarted",
  IN_REVIEW: "inReview",
  READY_FOR_TEST: "readyForTest",
  TESTING: "testing",
  AWAITING_RELEASE: "awaitingRelease",
  PASSED: "passed",
  IN_CORRECTIONS: "inCorrections",
  RETEST_OPEN: "retestOpen",
  RETEST_AWAITING_RELEASE: "retestAwaitingRelease",
  COMPLETE: "complete",
  RETEST_CLOSED: "retestClosed",
  NEEDS_ATTENTION: "needsAttention",
  // Never started the Test before its class-time window closed, and has not
  // yet submitted the Retest that replaces it.
  MISSED_TEST: "missedTest",
});

/*
 * A TEST LOCKED FOR REVIEW IS A STUDENT WAITING ON THEIR TEACHER.
 *
 * A lock pauses a Test; it does not end it, so the record keeps saying "in
 * progress" (see `syncTestCycleSessionState`). On the results table that read
 * as "Testing now", and the only place a teacher could learn the student was
 * stuck was the separate proctor monitor. The live session decides.
 */
function testCycleRowAttention(record, lockedSessions) {
  for (const stage of ["retest", "test"]) {
    const examSessionId = String(record[stage]?.examSessionId || "");
    const session = examSessionId ? lockedSessions.get(examSessionId) : null;
    if (session) {
      return {
        kind: "locked",
        stage,
        examSessionId,
        lockedBy: session.status === "locked_proctor" ? "teacher" : "integrity",
        violationCount: Number(session.violationCount || 0),
      };
    }
  }
  return null;
}

function teacherRowBucket(stages, state, record, reviewProgress) {
  const stage = state?.stage;
  if (state?.missedTest && [stages.REVIEW, stages.RETEST, stages.RETEST_READY].includes(stage)) {
    return TEACHER_ROW_BUCKET.MISSED_TEST;
  }
  if (stage === stages.REVIEW) {
    return Number(reviewProgress?.attempted || 0) > 0 ? TEACHER_ROW_BUCKET.IN_REVIEW : TEACHER_ROW_BUCKET.NOT_STARTED;
  }
  if (stage === stages.TEST) {
    return record.test.state === "inProgress" ? TEACHER_ROW_BUCKET.TESTING : TEACHER_ROW_BUCKET.READY_FOR_TEST;
  }
  if (stage === stages.AWAITING_RELEASE) return TEACHER_ROW_BUCKET.AWAITING_RELEASE;
  if (stage === stages.PASSED) return TEACHER_ROW_BUCKET.PASSED;
  if (stage === stages.CORRECTIONS) return TEACHER_ROW_BUCKET.IN_CORRECTIONS;
  if (stage === stages.RETEST || stage === stages.RETEST_READY) return TEACHER_ROW_BUCKET.RETEST_OPEN;
  if (stage === stages.RETEST_SUBMITTED) return TEACHER_ROW_BUCKET.RETEST_AWAITING_RELEASE;
  if (stage === stages.COMPLETE) return TEACHER_ROW_BUCKET.COMPLETE;
  if (stage === stages.RETEST_CLOSED) return TEACHER_ROW_BUCKET.RETEST_CLOSED;
  return TEACHER_ROW_BUCKET.NOT_STARTED;
}

/*
 * WHAT THE PANEL READS OF EACH STUDENT — AND NOTHING ELSE.
 *
 * A grade document holds a student's whole history: every assignment's
 * tracker, every attempt. The panel used to read all of it for every student
 * in every assigned class, which is what pushed this callable past its memory
 * limit for a real class. It needs the roster facts, the name, and this ONE
 * assignment's Review tracker, so that is all Firestore is asked to send.
 */
function testCycleRosterFieldMask(identity, assignmentId) {
  return [
    "classId", "classPeriod", "status", "sisStudentId", "googleUserId", "profile",
    ...identity.STUDENT_IDENTITY_FIELDS,
    new FieldPath("gradesByAssignment", assignmentId),
  ];
}

/** Every active student this Test Cycle is for: its classes, and anyone added on their own. */
async function loadTestCycleRoster(db, { assignment, assignmentId, recordsByStudent, identity }) {
  const fieldMask = testCycleRosterFieldMask(identity, assignmentId);
  const gradeDataByStudent = new Map();
  const classSizes = new Map();
  for (const classId of assignmentAudience(assignment).classIds) {
    // eslint-disable-next-line no-await-in-loop
    const classSnapshot = await db.collection("grades").where("classId", "==", classId).select(...fieldMask).get();
    let size = 0;
    classSnapshot.docs.forEach((doc) => {
      if (doc.id !== "test_connection" && doc.data()?.status !== "inactive") {
        gradeDataByStudent.set(doc.id, doc.data() || {});
        size += 1;
      }
    });
    classSizes.set(classId, size);
  }
  // Record holders outside the current classes (moved class, or added on
  // their own) keep their row: their evidence still exists.
  const missing = [...recordsByStudent.keys()].filter((studentId) => studentId && !gradeDataByStudent.has(studentId));
  for (let index = 0; index < missing.length; index += 100) {
    // eslint-disable-next-line no-await-in-loop
    const snapshots = await db.getAll(
      ...missing.slice(index, index + 100).map((id) => db.collection("grades").doc(id)),
      { fieldMask },
    );
    snapshots.forEach((gradeSnapshot) => gradeDataByStudent.set(gradeSnapshot.id, gradeSnapshot.exists ? gradeSnapshot.data() || {} : {}));
  }
  return { gradeDataByStudent, classSizes };
}

/**
 * Each assigned class's Test window as the teacher's panel shows it: the exact
 * times read from the bell schedule, whether students may work from home, and
 * the next days the class sits — so a Test day is picked, never typed.
 */
/**
 * Per class (the one whose windows each student follows): how many have
 * started the Test, and how many are still waiting to start it — Test ahead,
 * not missed. What the windows panel needs to say a stranded day honestly.
 */
function classSittingsOf(shared, rows) {
  const stages = shared.stages.TEST_CYCLE_STAGE;
  const notStarted = [shared.record.SESSION_STATE.NONE, shared.record.SESSION_STATE.ASSIGNED];
  const byClass = new Map();
  rows.forEach((row) => {
    const classId = row.sitsWithClassId || row.classId;
    if (!classId) return;
    const entry = byClass.get(classId) || { started: 0, waiting: 0 };
    if (!notStarted.includes(row.test?.state || shared.record.SESSION_STATE.NONE)) entry.started += 1;
    else if (!row.missedTest && [stages.REVIEW, stages.TEST].includes(row.stage)) entry.waiting += 1;
    byClass.set(classId, entry);
  });
  return byClass;
}

async function teacherTestCycleSchedule(db, shared, { assignmentId = null, assignment, policy, classSizes, bell, now = Date.now(), classSittings = new Map() }) {
  if (policy.externalAssessment) return null;
  const timeZone = shared.timeZone;
  const availability = shared.schedule.normalizeTestAvailability(assignment?.testAvailability);
  const classIds = assignmentAudience(assignment).classIds;
  const classSnapshots = classIds.length
    ? await db.getAll(...classIds.map((classId) => db.collection(CLASS_COLLECTION).doc(classId)))
    : [];
  const todayKey = schoolTodayKey(shared, now);
  const resolvedClasses = classSnapshots.map((classSnapshot) => {
    const classRecord = classSnapshot.exists ? classSnapshot.data() || {} : {};
    const classId = classSnapshot.id;
    const classPeriod = String(classRecord.period || "") || null;
    const windows = shared.schedule.resolveClassWindows({ availability: assignment?.testAvailability, classId, classPeriod, schedule: bell, timeZone });
    const test = shared.schedule.resolveTestWindowStatus({ availability: assignment?.testAvailability, classWindows: windows, now });
    return { classRecord, classId, classPeriod, windows, test };
  });
  // A stranded day on which a sitting was recorded: the teacher decides
  // whether it was the class's Test day (W7-6 decision 1, option b; the
  // owner, 2026-10-20). Read by id, one document per stranded class.
  const sittingIdOf = ({ classId, test }) => (test.stranded
    ? shared.schedule.classSittingId({ assignmentId, classId, dateKey: test.dateKey })
    : null);
  const sittingIds = resolvedClasses.map(sittingIdOf).filter(Boolean);
  const sittingSnapshots = sittingIds.length
    ? await db.getAll(...sittingIds.map((id) => db.collection(shared.schedule.TEST_CYCLE_CLASS_SITTINGS).doc(id)))
    : [];
  const recordedSittings = new Map(sittingSnapshots.filter((snapshot) => snapshot.exists).map((snapshot) => [snapshot.id, snapshot.data() || {}]));
  const classes = resolvedClasses.map(({ classRecord, classId, classPeriod, windows, test }) => {
    const recorded = recordedSittings.get(sittingIdOf({ classId, test })) || null;
    const strandedWindow = recorded ? windows.find((window) => !window.resolved && window.dateKey === test.dateKey) : null;
    const sitting = recorded && strandedWindow && Number.isFinite(recorded.opensAt) && Number.isFinite(recorded.closesAt)
      ? { windowId: strandedWindow.id, dateKey: test.dateKey, opensAt: recorded.opensAt, closesAt: recorded.closesAt }
      : null;
    const followUp = shared.schedule.resolveFollowUpWindow({ assignment, availability: assignment?.testAvailability, testStatus: test, now, timeZone });
    const upcoming = shared.schedule.upcomingClassPeriodDays({ schedule: bell, classPeriod, fromDateKey: todayKey, count: 4, timeZone, now });
    return {
      classId,
      name: String(classRecord.name || classRecord.period || classId).slice(0, 160),
      period: classPeriod,
      studentCount: classSizes.get(classId) || 0,
      test: {
        state: test.state,
        enforced: test.enforced === true,
        opensAt: test.opensAt ?? null,
        closesAt: test.closesAt ?? null,
        workFromHome: test.workFromHome === true,
        // The Test day passed without class time (or was set after the class
        // met, or no longer resolves): somebody is still waiting to start it,
        // and cannot until the teacher sets a new day. A finished class is not
        // flagged, and one where anybody started is not told the day never
        // happened (classSittingsOf).
        needsNewDay: shared.schedule.classNeedsNewTestDay(test, classSittings.get(classId)),
        // The recorded sitting the teacher may count as the Test day
        // (action countClassSitting), while somebody still waits on it.
        sitting: sitting && Number(classSittings.get(classId)?.waiting) > 0
          ? {
            ...sitting,
            label: shared.schedule.formatSchoolDate(sitting.dateKey, timeZone),
            range: shared.schedule.formatSchoolRange(sitting.opensAt, sitting.closesAt, timeZone),
            started: Number(classSittings.get(classId)?.started) || 0,
            waiting: Number(classSittings.get(classId)?.waiting) || 0,
          }
          : null,
        ...shared.schedule.describeTestWindow(test, { timeZone, audience: "teacher", classSittings: classSittings.get(classId) || null, sitting }),
      },
      followUp: {
        state: followUp.state,
        enforced: followUp.enforced === true,
        closesAt: followUp.closesAt ?? null,
        closeSource: followUp.closeSource || null,
        ...shared.schedule.describeFollowUpWindow(followUp, { timeZone, audience: "teacher" }),
      },
      windows: windows.map((window) => ({
        id: window.id,
        source: window.source,
        dateKey: window.dateKey || null,
        resolved: window.resolved === true,
        pending: window.pending === true,
        reason: window.reason || null,
        opensAt: window.opensAt ?? null,
        closesAt: window.closesAt ?? null,
        extended: window.extended === true,
        label: window.resolved
          ? shared.schedule.formatSchoolRange(window.opensAt, window.closesAt, timeZone)
          : window.reason === "endedBeforeSet"
            ? `${shared.schedule.formatSchoolDate(window.dateKey, timeZone)} (that day's class had ended when it was set: choose a new day)`
            : window.reason === "dayTypeSetAfterEnd"
              // TC01: the day's A/B day was set only after this class had met.
              ? `${shared.schedule.formatSchoolDate(window.dateKey, timeZone)} (its A/B day was set after this class had met: choose a new day)`
              : `${shared.schedule.formatSchoolDate(window.dateKey, timeZone)} (times not on the bell schedule yet)`,
      })),
      // The next days this class sits, straight from the bell schedule.
      upcomingDays: upcoming.days.map((day) => ({
        dateKey: day.dateKey,
        opensAt: day.opensAt,
        closesAt: day.closesAt,
        label: shared.schedule.formatSchoolRange(day.opensAt, day.closesAt, timeZone),
      })),
      undesignatedDays: upcoming.pending.slice(0, 4).map((dateKey) => ({
        dateKey, label: shared.schedule.formatSchoolDate(dateKey, timeZone),
      })),
      hasPeriodOnSchedule: Boolean(classPeriod),
    };
  });
  const lateDue = shared.schedule.defaultFollowUpClose(assignment, timeZone);
  return {
    timeZone,
    configured: availability.configured,
    policy: availability.policy,
    followUpClose: {
      mode: availability.followUp.mode,
      closesAt: availability.followUp.mode === shared.schedule.FOLLOW_UP_CLOSE.CUSTOM ? availability.followUp.closesAt : lateDue,
      label: availability.followUp.mode === shared.schedule.FOLLOW_UP_CLOSE.NONE
        ? "No closing time"
        : shared.schedule.formatSchoolDateTime(
          availability.followUp.mode === shared.schedule.FOLLOW_UP_CLOSE.CUSTOM ? availability.followUp.closesAt : lateDue,
          timeZone,
        ) || "No due date is set, so there is no closing time",
      lateDueAt: lateDue,
      lateDueLabel: shared.schedule.formatSchoolDateTime(lateDue, timeZone),
    },
    classes,
    history: (Array.isArray(assignment?.testAvailabilityHistory) ? assignment.testAvailabilityHistory : []).slice(-12),
  };
}

/** Today's date in the school's zone, as a YYYY-MM-DD key. */
function schoolTodayKey(shared, now) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: shared.timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date(now));
  const part = (type) => parts.find((entry) => entry.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Teacher gradebook: the canonical record for every student on this cycle. */
exports.listTeacherTestCycleRecords = onCall(TEST_CYCLE_PANEL_OPTIONS, async (request) => {
  const db = getFirestore();
  const assignmentSnapshot = await assignmentForTeacherCall(request, db);
  await assertTeacherMayManageAssignment(request, assignmentSnapshot);
  const { assignmentId, assignment, policy, blueprint, shared } = await loadTestCycleAssignment(db, assignmentSnapshot.id, { allowInvalid: true });
  const identity = await studentIdentity();

  const snapshot = await db.collection(TEST_CYCLE_RECORDS).where("assignmentId", "==", assignmentId).limit(400).get();
  const recordsByStudent = new Map(snapshot.docs.map((doc) => [String(doc.data()?.studentId || ""), doc.data()]));

  // The audience: every active student in the assignment's classes, plus
  // anyone added on their own (a record holder outside those classes).
  const { gradeDataByStudent, classSizes } = await loadTestCycleRoster(db, { assignment, assignmentId, recordsByStudent, identity });
  // One bell-schedule read for the whole table, and each class's period once.
  const now = Date.now();
  const hasWindows = !policy.externalAssessment;
  const bell = hasWindows ? await readBellSchedule(db) : null;
  const periodCache = new Map();
  // Each student's own final close (TC07) reads their private record: one
  // batched read for the table, not one per row. Nothing is needed while no
  // window or close is set (a student's own window reads theirs on its own).
  const privateOverrides = hasWindows && shared.schedule.normalizeTestAvailability(assignment?.testAvailability).configured
    ? await privateOverridesFor(db, assignmentId, [...gradeDataByStudent.keys()])
    : new Map();

  // Only the sessions of students mid-Test can be locked; read exactly those.
  const liveSessionIds = [];
  recordsByStudent.forEach((raw) => {
    const live = shared.record.normalizeTestCycleRecord(raw);
    ["test", "retest"].forEach((stage) => {
      if (live[stage].state === shared.record.SESSION_STATE.IN_PROGRESS && live[stage].examSessionId) {
        liveSessionIds.push(String(live[stage].examSessionId));
      }
    });
  });
  const lockedSessions = new Map();
  for (let index = 0; index < liveSessionIds.length; index += 100) {
    const refs = liveSessionIds.slice(index, index + 100).map((id) => db.collection("examSessions").doc(id));
    // eslint-disable-next-line no-await-in-loop
    const docs = await db.getAll(...refs);
    docs.forEach((doc) => {
      const session = doc.exists ? doc.data() || {} : {};
      if (secureExam.LOCKED_STATES.has(session.status)) lockedSessions.set(doc.id, session);
    });
  }

  const stages = shared.stages.TEST_CYCLE_STAGE;
  const testQuestionCount = shared.blueprint.normalizeTestBlueprint(blueprint).totalQuestions;
  const rows = [];
  for (const [studentId, gradeData] of gradeDataByStudent.entries()) {
    const record = shared.record.normalizeTestCycleRecord(recordsByStudent.get(studentId) || { assignmentId, studentId });
    const grade = shared.record.recordGradeState(record, policy);
    const tracker = gradeData?.gradesByAssignment?.[assignmentId] || {};
    const reviewProgress = testCycleLib.reviewProgress(assignment, tracker);
    // The Review as a grade a teacher can read and use: from the same tracker
    // the gate reads, so the two cannot disagree (testCycleLib.reviewSummary).
    const reviewSummary = testCycleLib.reviewSummary(assignment, tracker);
    // The windows as they stand for THIS student (their class's, plus any
    // reopened for them), so the stage here is the stage their card shows.
    // eslint-disable-next-line no-await-in-loop
    const schedule = hasWindows
      ? await studentTestCycleSchedule(db, shared, {
        assignment, policy, gradeData, record, bell, periodCache, now, privateOverride: privateOverrides.get(studentId),
      })
      : null;
    const state = shared.stages.resolveTestCycleStage({ policy, record, reviewProgress, schedule });
    const attention = testCycleRowAttention(record, lockedSessions);
    rows.push({
      studentId,
      studentName: identity.studentNameForStorage(studentIdentityRecord(identity, studentId, gradeData)) || null,
      classId: record.classId || gradeData?.classId || null,
      hasRecord: recordsByStudent.has(studentId),
      stage: state?.stage || null,
      statusLabel: state?.statusLabel || null,
      bucket: attention ? TEACHER_ROW_BUCKET.NEEDS_ATTENTION : teacherRowBucket(stages, state, record, reviewProgress),
      attention,
      // Added on their own rather than through an assigned class.
      individuallyAssigned: record.audience?.individual === true,
      sitsWithClassId: record.audience?.withClassId || null,
      missedTest: state?.missedTest === true,
      // Whether what they have earned can be entered now, and why not.
      canEnterNow: state?.canEnter === true,
      windowClosed: state?.windowClosed || null,
      schedule: schedule ? {
        test: { state: schedule.test.state, opensAt: schedule.test.opensAt ?? null, closesAt: schedule.test.closesAt ?? null },
        followUp: { state: schedule.followUp.state, closesAt: schedule.followUp.closesAt ?? null, closeSource: schedule.followUp.closeSource || null },
        ownTestWindow: Boolean(record.availability?.testWindows?.length),
        ownFollowUpClose: record.availability?.followUpClosesAt ?? null,
      } : null,
      review: {
        attempted: reviewProgress.attempted,
        total: reviewProgress.total,
        complete: reviewProgress.complete || record.review.complete === true,
        ...(reviewProgress.minimumMastery !== undefined ? { mastery: reviewProgress.mastery, minimumMastery: reviewProgress.minimumMastery } : {}),
        // Kept apart from the secure scores: instruction, done with hints.
        earnedPoints: reviewSummary.earnedPoints,
        possiblePoints: reviewSummary.possiblePoints,
        percent: reviewSummary.percent,
        correct: reviewSummary.correct,
        status: record.teacherControls.reviewWaived && !reviewSummary.complete ? "waived" : reviewSummary.status,
        lastSavedAt: reviewSummary.lastSavedAt,
        lastSavedLabel: reviewSummary.lastSavedAt ? shared.schedule.formatSchoolDateTime(reviewSummary.lastSavedAt, shared.timeZone) : null,
      },
      test: {
        state: record.test.state,
        examSessionId: record.test.examSessionId,
        answeredQuestions: record.test.answeredQuestions,
        totalQuestions: record.test.totalQuestions,
        submittedAt: record.test.submittedAt,
        releasedAt: record.test.releasedAt,
        attempt: record.test.attempt,
      },
      retest: {
        state: record.retest.state,
        examSessionId: record.retest.examSessionId,
        answeredQuestions: record.retest.answeredQuestions,
        totalQuestions: record.retest.totalQuestions,
        submittedAt: record.retest.submittedAt,
        releasedAt: record.retest.releasedAt,
        attempt: record.retest.attempt,
      },
      originalTestGrade: grade.originalTestGrade,
      rawRetestGrade: grade.rawRetestGrade,
      retestCappedContribution: grade.retestCappedContribution,
      maxRecordedGrade: grade.maxRecordedGrade,
      recordedGrade: grade.recordedGrade,
      recordedGradeSource: grade.recordedGradeSource,
      gradeReason: grade.reason,
      // A Retest with no original Test, and a grade a teacher set by hand:
      // each is said, with the number the rule alone would have recorded.
      retestWithoutOriginal: grade.retestWithoutOriginal === true || record.retest.withoutOriginal === true,
      gradeAdjustment: grade.gradeAdjustment || null,
      ruleRecordedGrade: grade.gradeAdjustment ? grade.ruleRecordedGrade : grade.recordedGrade,
      // TC15: fewer Test questions, for a student whose plan lists them (null
      // for everyone else): what their teacher chose and whether it can change.
      reducedItems: teacherReducedItemsRow(shared, { record, gradeData, assignment, policy, blueprint, testQuestionCount, now }),
      corrections: record.corrections,
      teacherControls: record.teacherControls,
      history: record.history,
    });
  }

  const summary = Object.fromEntries(Object.values(TEACHER_ROW_BUCKET).map((bucket) => [bucket, 0]));
  rows.forEach((row) => { summary[row.bucket] = (summary[row.bucket] || 0) + 1; });
  const describedPolicy = shared.grade.describeTestCycleGradePolicy(policy);
  return {
    success: true,
    assignmentId,
    rows,
    summary,
    // What a teacher needs to read the table: the rule, in words and numbers,
    // and whether the Test is timed. Both come from the same normalized policy
    // and blueprint the server enforces.
    policy: {
      passingScore: policy.passingScore,
      maxRecordedGrade: policy.retest.maxRecordedGrade,
      gradeReplacement: policy.retest.gradeReplacement,
      reviewRequired: policy.review.required,
      correctionsRequiredForRetest: policy.corrections.requiredForRetest,
      external: Boolean(policy.externalAssessment),
      externalSource: policy.externalAssessment?.source || null,
      reviewMinimumMastery: policy.review.minimumMastery ?? null,
      ruleLabel: describedPolicy.ruleLabel,
      summary: describedPolicy.teacherSummary,
      example: describedPolicy.example,
      locks: testCyclePolicyLocks(shared, [...recordsByStudent.values()], { external: Boolean(policy.externalAssessment) }),
    },
    delivery: testCycleDeliveryFacts(blueprint),
    // The Test's questions by number and skill, for choosing fewer for one
    // student (TC15). Sent only when a row can use it; no families, no seeds.
    testQuestions: rows.some((row) => row.reducedItems) ? shared.reducedItems.testCycleQuestionList(blueprint) : [],
    availability: shared.availability.resolveAssessmentAvailability({ assignment, now: Date.now() }),
    // When the Test and the home window are open for each class, in exact
    // school-zone times. Null for an external-original cycle.
    testSchedule: await teacherTestCycleSchedule(db, shared, { assignmentId, assignment, policy, classSizes, bell, now, classSittings: classSittingsOf(shared, rows) }),
    // Who this Test is for: its classes, anyone added on their own, and the
    // record of every addition.
    audience: {
      classIds: assignmentAudience(assignment).classIds,
      individualStudentIds: rows.filter((row) => row.individuallyAssigned).map((row) => row.studentId),
      studentCount: rows.length,
      history: (Array.isArray(assignment?.audienceHistory) ? assignment.audienceHistory : []).slice(-12),
    },
    // Class-wide operations on this cycle, newest first: an interrupted one
    // is here to be finished, and a finished one keeps its per-student account.
    operations: await recentTestCycleOperations(db, shared, assignmentId),
    readyToRelease: {
      test: rows.filter((row) => row.test.state === "submitted").length,
      retest: rows.filter((row) => row.retest.state === "submitted").length,
    },
    // Whether the answers and worked solutions are open to students yet, and
    // who can still sit each stage (courseAnswersRelease): the list a release
    // confirm names and sends back.
    answersRelease: Object.fromEntries(await Promise.all(["test", "retest"].map(async (stage) => {
      // The table reads at most 400 records; past that, the release reads
      // them all, so a record holder beyond the first 400 is on the list the
      // confirm names (or the release would refuse it as unnamed, forever).
      const release = await courseAnswersRelease(db, shared, assignmentId, stage, {
        assignment, records: snapshot.size < 400 ? recordsByStudent : null, rosterIds: [...gradeDataByStudent.keys()],
      });
      return [stage, {
        released: release.released,
        explicit: release.explicit,
        stillTesting: release.stillTesting.length,
        stillTestingIds: release.stillTesting,
        confirmKeys: release.stillTestingKeys,
        heldFor: release.heldFor.length,
      }];
    }))),
  };
});

/*
 * ONE ROW'S FEWER-QUESTIONS FACTS (TC15), for the teacher of record only.
 *
 * Null for a student whose plan does not list fewer items and who has no
 * choice on record — every other row is exactly what it was. Otherwise:
 * whether the plan lists it (and its percentage, as a guide), the questions
 * the teacher excused, how many the student answers, who chose and when, and
 * whether it is locked because the student has started. The lock here is read
 * from the record; the callable re-reads the sessions themselves.
 */
function teacherReducedItemsRow(shared, { record, gradeData, assignment, policy, blueprint, testQuestionCount, now = Date.now() }) {
  const rules = shared.reducedItems;
  const chosen = record.reducedItems || null;
  const plan = rules.planFewerItems({ profile: gradeData?.profile || null, assignment, nowValue: now });
  if (!chosen && !plan.listed) return null;
  const lock = rules.reducedItemsLock({ record, noun: policy?.externalAssessment ? "Retest" : "Test" });
  // A choice made for a Test since replaced does not apply (the whole Test
  // does) and says so, so the teacher can choose again.
  const state = rules.reducedItemsState(record, blueprint);
  const applies = Boolean(chosen) && !state.stale;
  return {
    planListsFewerItems: plan.listed,
    planPercent: plan.percent,
    excusedSlotIds: state.excusedSlotIds,
    stale: state.stale,
    questions: applies ? chosen.questions : testQuestionCount,
    testQuestions: testQuestionCount,
    setBy: chosen?.setBy || null,
    setAt: chosen?.setAt ?? null,
    locked: lock.locked,
    lockReason: lock.reason,
  };
}

/*
 * WHICH POLICY FIELDS CAN STILL CHANGE.
 *
 * The passing score decides who owes corrections; once any Test result is
 * released, changing it would silently re-sort students who have already been
 * told where they stand. The cap and the replacement rule decide recorded
 * grades; once any retest is released, changing them would move grades already
 * posted to Google Classroom (which never lowers one). Both lock at exactly
 * those moments and say why, rather than accepting a change that the records
 * and Classroom would then disagree about.
 */
function testCyclePolicyLocks(shared, records, { external = false } = {}) {
  const normalized = (Array.isArray(records) ? records : []).map((record) => shared.record.normalizeTestCycleRecord(record));
  const testReleased = normalized.some((record) => record.test.state === shared.record.SESSION_STATE.RELEASED);
  // In an external-original cycle the one secure session IS the retest, and
  // who may retest was decided against the passing score when it opened.
  const retestReleased = external
    ? testReleased
    : normalized.some((record) => record.retest.state === shared.record.SESSION_STATE.RELEASED);
  const sessionsOpened = normalized.some((record) => Boolean(record.test.examSessionId));
  if (external && sessionsOpened) {
    return {
      passingScore: "Retest sessions are open; eligibility was decided against this passing score.",
      correctionsRequiredForRetest: "This external-original assessment has no corrections stage.",
      maxRecordedGrade: retestReleased ? "A retest result has been released; changing the cap would move recorded grades." : null,
      gradeReplacement: retestReleased ? "A retest result has been released; changing the rule would move recorded grades." : null,
      reviewRequired: "Retest sessions are open; use Waive Review for individual students instead.",
      testBlueprint: "Retest sessions are open; their questions were planned from this blueprint.",
    };
  }
  return {
    passingScore: testReleased ? "A Test result has been released; students have already been told whether they passed." : null,
    correctionsRequiredForRetest: testReleased ? "A Test result has been released; corrections plans already exist." : null,
    maxRecordedGrade: retestReleased ? "A retest result has been released; changing the cap would move recorded grades." : null,
    gradeReplacement: retestReleased ? "A retest result has been released; changing the rule would move recorded grades." : null,
    reviewRequired: sessionsOpened ? "Secure Test sessions are open; use Waive Review for individual students instead." : null,
    testBlueprint: sessionsOpened ? "Secure Test sessions are open; their questions were planned from this blueprint." : null,
  };
}

/*
 * THE MISTAKES RECORDED ON A STUDENT'S RETEST, FOR THEIR TEACHER (TC02).
 *
 * A Retest records a mistake where it grades a miss, as a Test does, and the
 * cycle has no Corrections after it, so nothing read it. The teacher's
 * per-student view reads it here, once the student has turned the Retest in:
 * the skills it missed, and the mistake each one's work proved
 * (shared/testCycleRetestMistakes.mjs, through the registry's trust gate). It
 * goes to the teacher of record only, never to a student, and moves no grade.
 *
 * Null when there is nothing to read: no Retest yet, one still under way, or a
 * session that is not this student's for this assignment. Never fails the panel:
 * the plans beside it are worth showing without it.
 */
async function retestMistakesFor(db, { studentId, assignmentId, policy, blueprint, record, retestPlan }) {
  try {
    // An external-original cycle's one secure session IS the retest.
    const sitting = policy.externalAssessment ? record?.test : record?.retest;
    const examSessionId = String(sitting?.examSessionId || "");
    const retestBlueprint = policy.externalAssessment ? blueprint : retestPlan?.blueprint;
    if (!examSessionId || !retestBlueprint) return null;
    const sessionSnapshot = await db.collection("examSessions").doc(examSessionId).get();
    const session = sessionSnapshot.exists ? sessionSnapshot.data() || {} : null;
    if (!session
      || String(session.studentId || "") !== studentId
      || String(session.courseTest?.assignmentId || "") !== assignmentId
      || !secureExam.TERMINAL_STATES.has(session.status)) return null;
    const { retestMistakesForTeacher } = await import("./shared/testCycleRetestMistakes.mjs");
    return {
      examSessionId,
      skills: retestMistakesForTeacher({ blueprint: retestBlueprint, responses: testCycleLib.responsesForProfile(session) }),
    };
  } catch (error) {
    console.error("test_cycle_retest_mistakes_not_read", { assignmentId, message: error?.message || String(error) });
    return null;
  }
}

/** Teacher inspection of a generated correction or retest plan. */
exports.getTeacherTestCyclePlans = onCall(TEST_CYCLE_ACTION_OPTIONS, async (request) => {
  const db = getFirestore();
  const assignmentSnapshot = await assignmentForTeacherCall(request, db);
  await assertTeacherMayManageAssignment(request, assignmentSnapshot);
  const { assignmentId, policy, blueprint, shared } = await loadTestCycleAssignment(db, assignmentSnapshot.id);
  const studentId = String(request.data?.studentId || "").trim();
  if (!studentId) throw new HttpsError("invalid-argument", "A studentId is required.");
  const recordId = testCycleRecordKey(assignmentId, studentId);

  const [correctionSnapshot, retestSnapshot, recordSnapshot] = await Promise.all([
    db.collection(TEST_CYCLE_CORRECTION_PLANS).doc(recordId).get(),
    db.collection(TEST_CYCLE_RETEST_PLANS).doc(recordId).get(),
    db.collection(TEST_CYCLE_RECORDS).doc(recordId).get(),
  ]);
  const correctionPlan = correctionSnapshot.exists ? correctionSnapshot.data()?.plan || null : null;
  const retestPlan = retestSnapshot.exists ? retestSnapshot.data() : null;
  const record = recordSnapshot.exists ? shared.record.normalizeTestCycleRecord(recordSnapshot.data()) : null;

  return {
    success: true,
    studentId,
    record,
    // The correction plan keeps its evidence mapping: a teacher opening this
    // sees exactly which failed Test items sent the student where. Each skill
    // also carries what the student said went wrong and how they will fix it
    // (TC11), null when they have not said.
    corrections: correctionPlan
      ? {
        ...correctionPlan,
        targets: (correctionPlan.targets || []).map(({ practiceFamilyIds: _practiceFamilyIds, ...target }) => ({
          ...target,
          reflection: correctionSnapshot.data()?.reflections?.[target.correctionId] || null,
        })),
      }
      : null,
    retest: retestPlan
      ? { audit: retestPlan.audit, blueprint: retestPlan.blueprint, plan: testCycleLib.teacherVisiblePlan(retestPlan.plan) }
      : null,
    // What the Retest showed, once it is turned in (TC02).
    retestMistakes: await retestMistakesFor(db, { studentId, assignmentId, policy, blueprint, record, retestPlan }),
  };
});

/**
 * The Test Cycle side of releasing secure feedback.
 *
 * Called from `proctorExamAction` after the shared release path has done its
 * ordinary work, so a course test releases exactly like a simulation does and
 * then, additionally, records the assessment grade and builds the corrections.
 *
 * IDEMPOTENT. A second release of the same session — a double click, two tabs,
 * the class-wide "release all" meeting a session already released one by one —
 * used to rebuild the correction plan from scratch and reset the record's
 * corrections progress to zero, sending a student who had finished half their
 * corrections back to the start (and one who had finished them back from the
 * Retest). The score is recorded once per session, and an existing correction
 * plan for this session is never overwritten.
 *
 * ONE WRITE. The score and the Corrections it opens are recorded in one
 * transaction, so the record and its projection on grades/{studentId} are
 * written once. They were two transactions, each writing both: every write to
 * that document runs both Classroom triggers and is sent to every teacher
 * listening to the gradebook, and the first projection (a released Test with
 * no Corrections yet) was a state nothing reads before the second replaced it.
 * A Test released before this whose plan was never written still gets it from
 * the next release.
 */
async function applyTestCycleFeedbackRelease(db, session) {
  const courseTest = session?.courseTest;
  if (!courseTest?.assignmentId) return null;
  const shared = await testCycleLib.shared();
  const assignmentSnapshot = await db.collection("assignments").doc(String(courseTest.assignmentId)).get();
  if (!assignmentSnapshot.exists) return null;
  const assignment = assignmentSnapshot.data() || {};
  const policy = shared.policy.normalizeTestCyclePolicy(assignment.assessmentPolicy);
  if (!policy) return null;
  // The blueprint wherever it lives. A secure-reference cycle keeps it in the
  // server-only manifest and has NO `testBlueprint` on the assignment; reading
  // the assignment field alone built an empty profile, a zero-target correction
  // plan marked "required", and a student stuck in Corrections with nothing to
  // do and no Retest ever opening.
  const { blueprint } = await resolveSecureTestBlueprint(db, assignment, shared);

  const studentId = String(session.studentId || "");
  // An external-original retest is compared with a district cut score, where
  // 69.99 is not 70: keep its precision.
  const rawScore = testCycleLib.weightedSessionScorePercent(session, { preservePrecision: Boolean(policy.externalAssessment) });
  const isRetest = String(courseTest.cycleStage) === shared.issuance.CYCLE_STAGE.RETEST;
  const answeredQuestions = secureExamNavigation.answeredCount(session);
  const totalQuestions = Number(session.requiredQuestions || 0);
  // A retest has no corrections after it; neither does an external-original
  // cycle, whose one secure session IS the retest.
  const opensCorrections = !isRetest && !policy.externalAssessment;
  const planRef = db.collection(TEST_CYCLE_CORRECTION_PLANS).doc(testCycleRecordKey(courseTest.assignmentId, studentId));

  const withCorrections = await mutateTestCycleRecord(db, {
    assignmentId: courseTest.assignmentId,
    studentId,
    shared,
    policy,
    mutate: async (record, { transaction }) => {
      // Superseded by a teacher reset. The caller already refuses this, and so
      // does this helper: a stale score reaching the record is not recoverable
      // by the student, so it is worth refusing twice. The match is exact — an
      // emptied stage is not a wildcard (see `courseTestSessionIsCurrent`).
      const current = isRetest ? record.retest : record.test;
      const currentSessionId = current.examSessionId;
      if (String(currentSessionId || "") !== String(session.examSessionId || "")) return { value: { superseded: true } };
      // Released already: the score stays as it was recorded, and the record
      // is written only for a Corrections plan this session never got.
      const alreadyReleased = current.state === shared.record.SESSION_STATE.RELEASED;
      const released = alreadyReleased
        ? record
        : isRetest
          ? shared.record.applyRetestReleased(record, { rawScore, answeredQuestions, totalQuestions, policy })
          : shared.record.applyTestReleased(record, { rawScore, answeredQuestions, totalQuestions, policy });
      const releaseOnly = (value) => (alreadyReleased ? { value } : { record: released, value });
      if (!opensCorrections) return releaseOnly(alreadyReleased ? { alreadyReleased: true } : { released: true });

      const existingPlan = await transaction.get(planRef);
      // A failed Test builds this student's corrections automatically, from
      // their own evidence, at the moment the score becomes real to them —
      // read against the Test they sat: a question their teacher excused
      // (TC15) was never asked, so it is never "missed" and never corrected.
      const excused = shared.reducedItems.applicableExcusedSlotIds(released, blueprint);
      const ownBlueprint = excused.length ? shared.reducedItems.studentTestBlueprint(blueprint, excused) : blueprint;
      const profile = shared.corrections.buildPerformanceProfile({
        blueprint: ownBlueprint,
        responses: testCycleLib.responsesForProfile(session),
      });
      const plan = shared.corrections.buildCorrectionPlan({
        blueprint: ownBlueprint,
        profile,
        policy,
        releasedTestGrade: rawScore,
        assignmentId: courseTest.assignmentId,
        studentId,
        examSessionId: session.examSessionId,
      });
      if (!plan) return releaseOnly({ plan: null });
      // This session's plan already exists: the release is a repeat. Keep the
      // student's progress exactly where it is.
      if (existingPlan.exists && String(existingPlan.data()?.plan?.sourceExamSessionId || "") === String(session.examSessionId || "")) {
        return releaseOnly({ plan: existingPlan.data().plan, repeat: true });
      }
      /*
       * IS THE CORRECTIONS GATE ACTUALLY CLOSED FOR THIS STUDENT?
       *
       * The plan is built for anyone who failed, because a teacher should be able
       * to see what this student needs even when they have waived the
       * requirement. Whether it GATES the retest is a separate question, and it
       * is the one that decides whether a retest has to be opened right now.
       *
       * Getting this wrong in the permissive direction is the expensive one: a
       * student whose corrections were waived would sit at "retest pending"
       * forever, because nothing else in the system would ever open the session.
       *
       * A plan with NO targets (the evidence named no specific weak target) has
       * nothing to correct, so it is complete the moment it exists and gates
       * nothing: the student goes straight on to the Retest.
       */
      const controls = released.teacherControls;
      const hasTargets = Array.isArray(plan.targets) && plan.targets.length > 0;
      const correctionsGate = Boolean(plan)
        && hasTargets
        && policy.corrections.requiredForRetest
        && controls.requireCorrections
        && !controls.correctionsWaived
        && !controls.retestUnlocked;
      transaction.set(planRef, {
        recordId: released.recordId,
        assignmentId: courseTest.assignmentId,
        studentId,
        plan,
        activeQuestions: {},
        issuedCounts: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      return {
        value: { plan, correctionsGate },
        record: {
          ...released,
          corrections: {
            ...released.corrections,
            planId: plan.planId,
            required: correctionsGate,
            total: plan.targets.length,
            completedTargets: 0,
            complete: !hasTargets,
            completedAt: !hasTargets ? Date.now() : null,
          },
        },
      };
    },
  });
  if (withCorrections.value?.superseded) return null;

  const latest = withCorrections.record;
  if (!opensCorrections) return { recordId: latest.recordId, recordedGrade: latest.recordedGrade ?? null };
  const gateOpen = Boolean(withCorrections.value?.plan)
    && !(latest.corrections.required && !latest.corrections.complete
      && !latest.teacherControls.correctionsWaived && !latest.teacherControls.retestUnlocked);
  if (withCorrections.value?.plan && gateOpen && !latest.teacherControls.retestDisabled) {
    await ensureRetestSession(db, {
      assignmentId: courseTest.assignmentId, assignment, policy, blueprint, shared, studentId, teacherUid: null,
    });
  }

  return { recordId: latest.recordId, recordedGrade: latest.recordedGrade ?? null };
}

/**
 * Mirror a secure course-test session's status onto the Test Cycle record.
 *
 * The session remains the authority on what the student is doing; the record is
 * what every OTHER surface reads, and a card that still says "Start Test" after
 * a student submitted would be a lie told by the wrong document.
 *
 * Deliberately never sets RELEASED: releasing is a teacher action and arrives
 * through `applyTestCycleFeedbackRelease` with a score attached.
 */
async function syncTestCycleSessionState(db, session) {
  const courseTest = session?.courseTest;
  if (!courseTest?.assignmentId) return;
  const shared = await testCycleLib.shared();
  const assignmentSnapshot = await db.collection("assignments").doc(String(courseTest.assignmentId)).get();
  if (!assignmentSnapshot.exists) return;
  const policy = shared.policy.normalizeTestCyclePolicy(assignmentSnapshot.data()?.assessmentPolicy);
  if (!policy) return;

  const studentId = String(session.studentId || "");
  const isRetest = String(courseTest.cycleStage) === shared.issuance.CYCLE_STAGE.RETEST;
  /*
   * A LOCKED EXAM IS AN EXAM IN PROGRESS.
   *
   * A proctor lock (or an integrity lock) pauses a session the student is in
   * the middle of. It used to map back to ASSIGNED, so the card and the
   * teacher's table said "Start Test" for a student mid-exam, and — because
   * ASSIGNED is also the "never passed Review" shape — read like they had not
   * passed the gate at all.
   */
  const state = secureExam.TERMINAL_STATES.has(session.status)
    ? shared.record.SESSION_STATE.SUBMITTED
    : session.status === "in_progress" || secureExam.LOCKED_STATES.has(session.status)
      ? shared.record.SESSION_STATE.IN_PROGRESS
      : shared.record.SESSION_STATE.ASSIGNED;

  await mutateTestCycleRecord(db, {
    assignmentId: courseTest.assignmentId,
    studentId,
    shared,
    policy,
    mutate: (record, { transaction }) => {
      const current = isRetest ? record.retest : record.test;
      // Exact match: an emptied stage (a reset) is not a wildcard, and a
      // superseded session cannot move the card.
      if (String(current.examSessionId || "") !== String(session.examSessionId || "")) return null;
      if (current.state === shared.record.SESSION_STATE.RELEASED) return null;
      const answeredQuestions = secureExamNavigation.answeredCount(session);
      if (state === current.state && answeredQuestions === current.answeredQuestions) return null;

      const stageRecord = {
        ...current,
        state,
        answeredQuestions,
        submittedAt: secureExam.TERMINAL_STATES.has(session.status) ? Number(session.submittedAt) || Date.now() : current.submittedAt,
      };

      /*
       * PASSING THE REVIEW GATE IS RECORDED WHEN IT HAPPENS, NOT INFERRED FOREVER.
       *
       * Review completion lives in the assignment tracker, which only the student's
       * own card carries. The stage resolver can infer "past Review" from a Test
       * that has moved off `assigned` — but a teacher reset puts the Test BACK to
       * `assigned`, and then the inference goes false and the gradebook says
       * "Review" again for a student who has finished the cycle.
       *
       * So the fact is persisted at the only moment it is proven: the student has
       * come through `assertCourseTestEntryAllowed`, which enforces the gate, and
       * STARTED the session (`startedAt` is set only by that path). A session
       * that never started — force-submitted by a teacher for an absent student,
       * say — proves nothing about Review and stamps nothing.
       */
      const passedReviewGate = state !== shared.record.SESSION_STATE.ASSIGNED
        && Number(session.startedAt) > 0;
      const review = passedReviewGate && record.review.complete !== true
        ? { ...record.review, complete: true, completedAt: record.review.completedAt || Date.now() }
        : record.review;

      /*
       * THE ORIGINAL TEST, STARTED AFTER ALL, RETIRES THE RETEST THAT STOOD IN
       * FOR IT. A student who missed the window was given a Retest to take
       * from home; if their teacher then reopened the window and they started
       * the Test, that unstarted Retest must go. Left assigned, it would be a
       * second secure attempt the student could open, and it would hold their
       * Corrections closed ("your Retest is open") after a failed Test. It is
       * closed, not deleted, and the record's Retest slot is emptied so the
       * ordinary path builds a targeted one if they come to need it.
       */
      const standIn = !isRetest
        && state === shared.record.SESSION_STATE.IN_PROGRESS
        && record.retest.withoutOriginal === true
        && record.retest.state === shared.record.SESSION_STATE.ASSIGNED
        && record.retest.examSessionId;
      if (standIn) {
        const now = Date.now();
        transaction.set(
          db.collection("examSessions").doc(String(record.retest.examSessionId)),
          { status: "force_submitted", supersededByOriginalTest: true, supersededAt: now, updatedAt: now, autoFinalizeAt: null },
          { merge: true },
        );
      }
      const { withoutOriginal: _standInMarker, ...retestSlot } = record.retest;

      return {
        record: {
          ...record,
          review,
          ...(isRetest ? { retest: stageRecord } : { test: stageRecord }),
          ...(standIn ? {
            retest: {
              ...retestSlot,
              examSessionId: null,
              planId: null,
              state: shared.record.SESSION_STATE.NONE,
              attempt: Number(record.retest.attempt || 1) + 1,
              answeredQuestions: 0,
            },
          } : {}),
        },
      };
    },
  });
}

/**
 * The next secure course-test item, from the plan stored on the session.
 *
 * No selection happens here and no model is consulted: the plan already named
 * the approved family and the generator seed. This instantiates that family
 * with that seed and checks it can still be privately graded. The caller
 * (issueSecureExamQuestion) appends it in its transaction and writes the
 * issued instance id back onto the plan entry, which is what later lets the
 * corrections algorithm join evidence to blueprint slots and lets the retest
 * audit prove it reused nothing.
 */
async function buildCourseTestExamItem(db, { session, runtimeMode = "secureTest" }) {
  const shared = await testCycleLib.shared();
  const plan = session.issuancePlan || {};
  // Every slot already issued — answered, skipped or still open.
  const entry = shared.issuance.nextPlanEntry(plan, secureExamNavigation.issuedSlotIds(session));
  if (!entry) throw new HttpsError("failed-precondition", "All required exam questions have been completed.");

  const families = await resolveBlueprintFamilies(db, [entry.familyId]);
  const family = families[0];
  if (!family) throw new HttpsError("failed-precondition", "The approved family for this secure item is no longer available.");

  const questionInstanceId = mathPath.runtimeId("examq");
  const instantiated = await mathPath.instantiateQuestion(family, entry.seedKey, {
    preferredDok: entry.dok,
    preferredDifficultyBand: entry.difficultyBand,
  });
  if (!instantiated.question) throw new HttpsError("failed-precondition", "This secure exam item could not be generated.");
  const issuePlan = await mathPath.buildIssuePlan(instantiated.question);
  if (!issuePlan.issuable) throw new HttpsError("failed-precondition", "This secure exam item could not be graded securely.");
  // Fail closed on an uncertified tool. Preflight refuses to publish one, so
  // reaching here means the bank changed under a published Test — the student
  // is told the item cannot be delivered, never handed a degraded text box.
  const certification = await secureItems.certifyItem(instantiated.question, { mode: runtimeMode });
  if (!certification.compatible) {
    console.error("secure_item_not_certified", { familyId: entry.familyId, toolId: certification.toolId, mode: runtimeMode });
    throw new HttpsError("failed-precondition", "This secure item uses a tool that is not certified for secure delivery. Ask your teacher.");
  }

  // Stored with its tool fields encoded: arrays of arrays cannot be stored.
  const storedItem = secureItems.storableItem({
    ...instantiated.question,
    bankQuestionId: family.id,
    familyId: entry.familyId,
    alignmentKeys: secureExamAlignmentKeys(instantiated.question),
    questionInstanceId,
    attemptsAllowed: 1,
    attemptsUsed: 0,
    assessmentDomainId: null,
    // Blueprint provenance, carried onto the stored response so released
    // evidence can be read back as "this student, this target, this slot".
    slotId: entry.slotId,
    targetId: entry.targetId,
    planWeight: entry.weight,
    planAnchor: entry.anchor === true,
    generatorParameters: instantiated.parameters,
    privateGrading: issuePlan.privateGrading,
    ...issuePlan.toolPayload,
  });
  return { storedItem, planEntry: entry };
}

// --- Assessment lifecycle management -----------------------------------------
//
// What a teacher does with an assessment AFTER it exists: release its results,
// change its retest policy, see it exactly as a student will, pause it, archive
// it, or delete it. Every one of these changes what students can do or what
// grades say, so each is a server decision with the teacher of record's
// authority — not a client write any signed-in teacher could make.

/** Release every submitted, current secure session of one stage in one action. */
exports.releaseTestCycleResults = onCall(TEST_CYCLE_SWEEP_OPTIONS, async (request) => {
  const db = getFirestore();
  const assignmentSnapshot = await assignmentForTeacherCall(request, db);
  const { teacherUid } = await assertTeacherMayManageAssignment(request, assignmentSnapshot);
  const { assignmentId, shared } = await loadTestCycleAssignment(db, assignmentSnapshot.id, { allowInvalid: true });
  const stage = String(request.data?.stage || "test").trim() === "retest" ? "retest" : "test";
  const onlyStudentIds = new Set((Array.isArray(request.data?.studentIds) ? request.data.studentIds : [])
    .map((value) => String(value || "").trim()).filter(Boolean));

  const records = await db.collection(TEST_CYCLE_RECORDS).where("assignmentId", "==", assignmentId).limit(400).get();
  const candidates = records.docs
    .map((doc) => shared.record.normalizeTestCycleRecord(doc.data()))
    .filter((record) => !onlyStudentIds.size || onlyStudentIds.has(record.studentId))
    .filter((record) => record[stage].state === shared.record.SESSION_STATE.SUBMITTED && record[stage].examSessionId);

  const released = [];
  const skipped = [];
  for (const record of candidates) {
    const examSessionId = record[stage].examSessionId;
    const ref = db.collection("examSessions").doc(examSessionId);
    try {
      // eslint-disable-next-line no-await-in-loop
      const next = await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists) throw new HttpsError("not-found", "Exam session not found.");
        return releaseSessionFeedbackInTransaction(transaction, db, {
          ref, session: snapshot.data(), examSessionId, teacherUid, now: Date.now(),
        });
      });
      // eslint-disable-next-line no-await-in-loop
      await applyTestCycleFeedbackRelease(db, next);
      released.push(record.studentId);
    } catch (error) {
      skipped.push({ studentId: record.studentId, reason: error?.message || String(error) });
    }
  }
  return { success: true, assignmentId, stage, released: released.length, releasedStudentIds: released, skipped };
});

/*
 * THE TEACHER'S RETEST POLICY, CHANGED THROUGH ONE DOOR.
 *
 * `assessmentPolicy` decides who must do corrections and what a retest can do
 * to a recorded grade. It is pinned against client writes in firestore.rules,
 * so this callable is the only way it changes after creation: teacher of record
 * only, validated, normalized, refused once the change would contradict
 * results already released (see `testCyclePolicyLocks`), and audited.
 */
exports.updateTestCyclePolicy = onCall(TEST_CYCLE_ACTION_OPTIONS, async (request) => {
  const db = getFirestore();
  const assignmentSnapshot = await assignmentForTeacherCall(request, db);
  const ref = assignmentSnapshot.ref;
  const { teacherUid, teacherEmail } = await assertTeacherMayManageAssignment(request, assignmentSnapshot);
  const { assignmentId, assignment, policy, shared } = await loadTestCycleAssignment(db, ref.id, { allowInvalid: true });
  const requested = request.data?.policy && typeof request.data.policy === "object" ? request.data.policy : {};

  const records = await db.collection(TEST_CYCLE_RECORDS).where("assignmentId", "==", assignmentId).limit(400).get();
  const locks = testCyclePolicyLocks(shared, records.docs.map((doc) => doc.data()), { external: Boolean(policy?.externalAssessment) });

  const number = (value) => (value === null || value === undefined || value === "" ? null : Number(value));
  const changes = {};
  const refuse = (field, reason) => { throw new HttpsError("failed-precondition", reason, { field }); };
  if (requested.passingScore !== undefined) {
    const value = number(requested.passingScore);
    if (!Number.isFinite(value) || value < 1 || value > 100) throw new HttpsError("invalid-argument", "Passing score must be between 1 and 100.");
    if (Math.round(value) !== policy.passingScore) {
      if (locks.passingScore) refuse("passingScore", locks.passingScore);
      changes.passingScore = Math.round(value);
    }
  }
  if (requested.maxRecordedGrade !== undefined) {
    const value = number(requested.maxRecordedGrade);
    if (!Number.isFinite(value) || value < 0 || value > 100) throw new HttpsError("invalid-argument", "The retest cap must be between 0 and 100.");
    if (Math.round(value) !== policy.retest.maxRecordedGrade) {
      if (locks.maxRecordedGrade) refuse("maxRecordedGrade", locks.maxRecordedGrade);
      changes.maxRecordedGrade = Math.round(value);
    }
  }
  if (requested.gradeReplacement !== undefined) {
    const value = String(requested.gradeReplacement || "").trim();
    if (!shared.policy.GRADE_REPLACEMENT_RULES.includes(value)) throw new HttpsError("invalid-argument", "Choose a supported retest grade rule.");
    if (value !== policy.retest.gradeReplacement) {
      if (locks.gradeReplacement) refuse("gradeReplacement", locks.gradeReplacement);
      changes.gradeReplacement = value;
    }
  }
  if (requested.reviewRequired !== undefined) {
    const value = requested.reviewRequired === true;
    if (value !== policy.review.required) {
      if (locks.reviewRequired) refuse("reviewRequired", locks.reviewRequired);
      changes.reviewRequired = value;
    }
  }
  if (requested.correctionsRequiredForRetest !== undefined) {
    const value = requested.correctionsRequiredForRetest === true;
    if (value !== policy.corrections.requiredForRetest) {
      if (locks.correctionsRequiredForRetest) refuse("correctionsRequiredForRetest", locks.correctionsRequiredForRetest);
      changes.correctionsRequiredForRetest = value;
    }
  }
  if (!Object.keys(changes).length) {
    return { success: true, assignmentId, changed: false, policy: shared.grade.describeTestCycleGradePolicy(policy) };
  }

  // Written from the STORED policy so fields this screen does not edit (retest
  // shares, strategies, question count) survive exactly as authored.
  const stored = assignment.assessmentPolicy && typeof assignment.assessmentPolicy === "object" ? assignment.assessmentPolicy : { mode: "testCycle" };
  const nextPolicy = {
    ...stored,
    mode: "testCycle",
    ...(changes.passingScore !== undefined ? { passingScore: changes.passingScore } : {}),
    review: { ...(stored.review || {}), ...(changes.reviewRequired !== undefined ? { required: changes.reviewRequired } : {}) },
    corrections: {
      ...(stored.corrections || {}),
      ...(changes.correctionsRequiredForRetest !== undefined ? { requiredForRetest: changes.correctionsRequiredForRetest } : {}),
    },
    retest: {
      ...(stored.retest || {}),
      ...(changes.maxRecordedGrade !== undefined ? { maxRecordedGrade: changes.maxRecordedGrade } : {}),
      ...(changes.gradeReplacement !== undefined ? { gradeReplacement: changes.gradeReplacement } : {}),
    },
  };
  const normalized = shared.policy.normalizeTestCyclePolicy(nextPolicy);
  const now = Date.now();
  await ref.update({
    assessmentPolicy: nextPolicy,
    assessmentPolicyHistory: FieldValue.arrayUnion({
      at: now,
      by: teacherEmail || teacherUid,
      changes,
    }),
    updatedAt: new Date(now).toISOString(),
  });
  return {
    success: true,
    assignmentId,
    changed: true,
    changes,
    policy: shared.grade.describeTestCycleGradePolicy(normalized),
  };
});

/*
 * SEE THE SECURE TEST EXACTLY AS A STUDENT WILL — WITHOUT A STUDENT.
 *
 * A teacher previews real items: a fresh issuance plan from the real blueprint
 * and approved families, for a synthetic preview student, instantiated and
 * sanitized by the same functions a student's Test goes through. Nothing is
 * written. There is no session, no record, no attempt, no grade, and nothing a
 * real student will ever be issued: the preview student's id is part of every
 * seed, so a preview draw cannot reproduce anybody's Test.
 *
 * Grading a preview answer is stateless: the opaque `previewItemId` names the
 * family and the preview seed, and the server regenerates the item to grade
 * it. Only families this assignment's blueprint names can be graded, so the
 * callable is not a general answer oracle for the question bank.
 */
const TEST_CYCLE_PREVIEW_MAX_ITEMS = 60;

function encodePreviewItem(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}
function decodePreviewItem(text) {
  try {
    const value = JSON.parse(Buffer.from(String(text || ""), "base64url").toString("utf8"));
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

/*
 * PREVIEW A TEST CYCLE BEFORE IT IS SAVED.
 *
 * A teacher reviewing an import has no assignment id yet, and while preflight
 * blocks the save never gets one, so the one screen that shows how the Test,
 * its Corrections and its Retest look to a student was unreachable exactly
 * when the teacher needed it. A candidate is previewed by the same plan,
 * instantiation, certification and sanitizer as a saved Test Cycle, and
 * nothing is written.
 *
 * Its grading boundary is the saved preview's: the family must be one the
 * candidate's own blueprint names, and the seed must name this teacher's
 * preview student. Any teacher can make a blueprint real by saving it, so this
 * is no wider an answer oracle than a saved Test Cycle already is.
 */
async function loadTestCycleCandidate(db, candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new HttpsError("invalid-argument", "A Test Cycle assignment candidate is required.");
  }
  const shared = await testCycleLib.shared();
  if (!shared.policy.declaresTestCycle(candidate)) {
    throw new HttpsError("failed-precondition", "That assignment is not a MathMaster Test Cycle.");
  }
  const policy = shared.policy.normalizeTestCyclePolicy(candidate.assessmentPolicy)
    || shared.policy.defaultTestCyclePolicy();
  const { blueprint } = await resolveSecureTestBlueprint(db, candidate, shared);
  // Issuance seeds need an assignment id. A candidate's is its blueprint's
  // digest: the same review shows the same draw, and an edited blueprint a
  // new one. It is never a real assignment's id, so no student's seed matches.
  const digest = crypto.createHash("sha256").update(JSON.stringify(blueprint)).digest("hex").slice(0, 24);
  return { assignmentId: `candidate-${digest}`, assignment: candidate, policy, blueprint, shared };
}

exports.previewTestCycleSecureItems = onCall(async (request) => {
  const db = getFirestore();
  let teacherUid;
  let loaded;
  if (request.data?.assignmentId) {
    const assignmentSnapshot = await db.collection("assignments").doc(String(request.data.assignmentId).trim()).get();
    if (!assignmentSnapshot.exists) throw new HttpsError("not-found", "That assignment was not found.");
    ({ teacherUid } = await assertTeacherMayManageAssignment(request, assignmentSnapshot));
    loaded = await loadTestCycleAssignment(db, request.data.assignmentId, { allowInvalid: true });
  } else {
    // The unsaved Test Cycle on the teacher's review screen.
    teacherUid = await requireTeacher(request);
    loaded = { ...(await loadTestCycleCandidate(db, request.data?.assignment)), candidate: true };
  }
  const { assignmentId, assignment, policy, blueprint, shared } = loaded;
  if (!blueprint.targets.length) throw new HttpsError("failed-precondition", "This Test Cycle has no secure Test blueprint to preview.");

  const families = await resolveBlueprintFamilies(db, blueprintFamilyIds(blueprint));
  // A new draw each time the teacher asks, so "show me another version" works.
  const draw = Math.max(1, Math.round(Number(request.data?.draw) || 1));
  const plan = shared.issuance.buildSecureIssuancePlan({
    blueprint,
    families,
    studentId: `preview:${teacherUid}`,
    assignmentId,
    stage: shared.issuance.CYCLE_STAGE.TEST,
    attempt: draw,
  });
  const familiesById = new Map(families.map((family) => [String(family.id), family]));
  // Preview runs under the SAME capability policy a student's Test (or Retest)
  // does — the point is to see what they will see, Rich Tools included.
  // ...or, for the Corrections preview, the Corrections policy a correcting
  // student works under (hints and an immediate verdict on).
  const requestedStage = String(request.data?.stage || "");
  const runtimeMode = requestedStage === "retest" ? "secureRetest" : requestedStage === "corrections" ? "corrections" : "secureTest";
  const items = [];
  for (const entry of plan.entries.slice(0, TEST_CYCLE_PREVIEW_MAX_ITEMS)) {
    const family = familiesById.get(String(entry.familyId));
    if (!family) {
      items.push({ ordinal: entry.ordinal, error: "This slot's approved family is not available." });
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const instantiated = await mathPath.instantiateQuestion(family, entry.seedKey, {
      preferredDok: entry.dok,
      preferredDifficultyBand: entry.difficultyBand,
    });
    if (!instantiated.question) {
      items.push({ ordinal: entry.ordinal, error: "This item could not be generated." });
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const issuePlan = await mathPath.buildIssuePlan(instantiated.question);
    // eslint-disable-next-line no-await-in-loop
    const certification = await secureItems.certifyItem(instantiated.question, { mode: runtimeMode });
    const questionInstanceId = `preview-${entry.ordinal}`;
    const issued = {
      ...instantiated.question,
      questionInstanceId,
      attemptsAllowed: 1,
      attemptsUsed: 0,
      ...(issuePlan.toolPayload || {}),
    };
    items.push({
      ordinal: entry.ordinal,
      // What a STUDENT receives: the same sanitizer as `issueSecureExamQuestion`.
      // An item the secure runtime could not deliver is shown to the teacher
      // as the error a student would meet, not rendered some other way.
      // eslint-disable-next-line no-await-in-loop
      questionInstance: certification.compatible ? await secureExamPublicQuestion(issued, { mode: runtimeMode }) : null,
      ...(certification.compatible ? {} : { error: certification.reason }),
      gradable: issuePlan.issuable === true && certification.compatible,
      // What only the TEACHER sees: which blueprint slot this fills, and the
      // secure rendering contract of the item that filled it.
      slot: {
        targetId: entry.targetId,
        alignmentKey: entry.alignmentKey,
        dok: entry.dok,
        difficultyBand: entry.difficultyBand,
        representation: entry.representation,
        anchor: entry.anchor === true,
        weight: entry.weight,
        familyId: entry.familyId,
        toolId: certification.toolId || null,
        toolLabel: certification.label,
        secureCompatible: certification.compatible,
        devices: certification.devices || null,
      },
      // A candidate's item is regraded against the candidate the teacher
      // sends back (`c`), a saved one against the stored assignment (`a`).
      previewItemId: encodePreviewItem({
        ...(loaded.candidate ? { c: 1 } : { a: assignmentId }),
        f: entry.familyId, s: entry.seedKey, d: entry.dok, b: entry.difficultyBand,
      }),
    });
  }
  return {
    success: true,
    assignmentId: loaded.candidate ? null : assignmentId,
    candidate: loaded.candidate === true,
    title: blueprint.title || assignment?.title || "Test",
    draw,
    totalQuestions: plan.totalQuestions,
    shown: items.length,
    unfilledSlots: plan.unfilledSlots.length,
    // Which blueprint targets have no family to preview (teacher only), so the
    // screen can say "Question 8 is missing" rather than show nine of ten.
    unfilledTargetIds: [...new Set(plan.unfilledSlots.map((slot) => slot.targetId))],
    delivery: testCycleDeliveryFacts(blueprint),
    policy: {
      passingScore: policy.passingScore,
      maxRecordedGrade: policy.retest.maxRecordedGrade,
      summary: shared.grade.describeTestCycleGradePolicy(policy).studentSummary,
    },
    items,
    // Stated, so a screen cannot imply otherwise.
    writes: "none",
  };
});

exports.gradeTestCyclePreviewItem = onCall(async (request) => {
  const db = getFirestore();
  const decoded = decodePreviewItem(request.data?.previewItemId);
  if (!(decoded?.a || decoded?.c === 1) || !decoded?.f || !decoded?.s) throw new HttpsError("invalid-argument", "That preview item is not valid.");
  let teacherUid;
  let blueprint;
  if (decoded.c === 1) {
    // An unsaved candidate's item: judged against the candidate the teacher
    // is reviewing, under the same family and preview-seed checks below.
    teacherUid = await requireTeacher(request);
    ({ blueprint } = await loadTestCycleCandidate(db, request.data?.assignment));
  } else {
    const assignmentSnapshot = await db.collection("assignments").doc(String(decoded.a)).get();
    if (!assignmentSnapshot.exists) throw new HttpsError("not-found", "That assignment was not found.");
    ({ teacherUid } = await assertTeacherMayManageAssignment(request, assignmentSnapshot));
    ({ blueprint } = await loadTestCycleAssignment(db, assignmentSnapshot.id, { allowInvalid: true }));
  }
  if (!blueprintFamilyIds(blueprint).includes(String(decoded.f))) {
    throw new HttpsError("permission-denied", "That family is not part of this Test's blueprint.");
  }
  // Only a preview seed can be regraded: it names the preview student.
  if (!String(decoded.s).includes(`preview:${teacherUid}`)) {
    throw new HttpsError("permission-denied", "Only your own preview items can be checked.");
  }
  const [family] = await resolveBlueprintFamilies(db, [decoded.f]);
  if (!family) throw new HttpsError("failed-precondition", "That family is no longer available.");
  const instantiated = await mathPath.instantiateQuestion(family, decoded.s, {
    preferredDok: decoded.d,
    preferredDifficultyBand: decoded.b,
  });
  if (!instantiated.question) throw new HttpsError("failed-precondition", "That preview item could not be regenerated.");
  const issuePlan = await mathPath.buildIssuePlan(instantiated.question);
  if (!issuePlan.issuable) throw new HttpsError("failed-precondition", "That item cannot be graded securely.");
  // The same authority a student's secure answer meets, Rich Tools included.
  const grading = await secureItems.gradeItem(issuePlan.privateGrading, request.data?.responsePayload || {});
  return {
    success: true,
    isCorrect: grading.isCorrect === true,
    score: Number(grading.score) || 0,
    // An unfinished construction would be refused for a student before it was
    // recorded; the teacher is told the same thing.
    incomplete: grading.rejected === true,
    detail: grading.rejected ? grading.detail : null,
    writes: "none",
  };
});

/*
 * ATTACH (OR REPLACE) A TEST CYCLE'S CONTRACT — BEFORE ANY STUDENT HAS A TEST.
 *
 * Until this change the browser's create and edit paths saved a Test Cycle's
 * sections but silently dropped `assessmentPolicy`, `testBlueprint` and
 * `secureTestReference`, so an assessment authored in the app arrived as a
 * Review with nothing behind it ("This assessment is not available yet"). The
 * create path now carries them; this is how an assignment saved by the older
 * build gets them back, and how a teacher replaces a blueprint while that is
 * still safe.
 *
 * Teacher of record only. Validated by the same Test Cycle preflight that
 * gates session creation (a blocked preflight is refused), and refused once
 * any secure Test session exists: those sessions' questions were planned from
 * the blueprint in force, and swapping it underneath them would make two
 * students' "equivalent" Tests different tests. Policy-only changes after that
 * point go through `updateTestCyclePolicy`, which has its own locks.
 */
exports.attachTestCycleContract = onCall(TEST_CYCLE_ACTION_OPTIONS, async (request) => {
  const db = getFirestore();
  const snapshot = await assignmentForTeacherCall(request, db);
  const ref = snapshot.ref;
  const { teacherUid, teacherEmail } = await assertTeacherMayManageAssignmentLifecycle(request, snapshot);
  const shared = await testCycleLib.shared();
  const assignment = snapshot.data() || {};
  const isObjectValue = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

  const requestedPolicy = request.data?.assessmentPolicy;
  const policy = shared.policy.normalizeTestCyclePolicy(requestedPolicy);
  if (!policy) throw new HttpsError("invalid-argument", 'A Test Cycle contract needs assessmentPolicy.mode "testCycle".');
  const requestedBlueprint = isObjectValue(request.data?.testBlueprint) ? request.data.testBlueprint : null;
  const requestedReference = isObjectValue(request.data?.secureTestReference) ? request.data.secureTestReference : null;
  const blueprint = shared.blueprint.normalizeTestBlueprint(requestedBlueprint);
  if (!blueprint.targets.length && !requestedReference) {
    throw new HttpsError("invalid-argument", "A Test Cycle contract needs a secure Test blueprint or a secure test reference.");
  }

  const sessions = await db.collection("examSessions").where("courseTest.assignmentId", "==", ref.id).limit(1).get();
  if (!sessions.empty) {
    throw new HttpsError(
      "failed-precondition",
      "Secure Test sessions already exist for this assessment. Change its retest policy from Test Cycle results, or duplicate it to use a different blueprint.",
    );
  }

  const candidate = {
    ...assignment,
    assessmentPolicy: requestedPolicy,
    ...(blueprint.targets.length ? { testBlueprint: requestedBlueprint } : {}),
    ...(requestedReference ? { secureTestReference: requestedReference } : {}),
  };
  if (!blueprint.targets.length) delete candidate.testBlueprint;
  const resolution = await resolveSecureTestBlueprint(db, candidate, shared);
  const { result } = await runTestCyclePreflight(db, {
    assignment: candidate,
    policy,
    blueprint: resolution.blueprint,
    shared,
    secureReferenceResolved: resolution.secureReferenceResolved,
  });
  if (result.blocked) {
    throw new HttpsError("failed-precondition", `This Test Cycle cannot be saved: ${result.errors[0]}`, { preflight: result });
  }

  const now = Date.now();
  await ref.update({
    assessmentPolicy: requestedPolicy,
    testBlueprint: blueprint.targets.length ? requestedBlueprint : FieldValue.delete(),
    secureTestReference: requestedReference || FieldValue.delete(),
    assessmentPolicyHistory: FieldValue.arrayUnion({ at: now, by: teacherEmail || teacherUid, changes: { contract: "attached" } }),
    updatedAt: new Date(now).toISOString(),
  });
  return { success: true, assignmentId: ref.id, attached: true, preflight: { warnings: result.warnings, checks: result.checks } };
});


// --- Secure Test Cycle: audience, class-time windows, class-wide operations --
//
// What a teacher does to a Test Cycle from the Secure Test screen once it is
// running: add a class or a student to it, set when the Test is open, act on
// many students at once, and set a grade by hand. Each is a server decision
// made for the teacher of record, and each leaves a record of who did it.

/** The newest class-wide operations on a cycle; an unfinished one is always among them. */
async function recentTestCycleOperations(db, shared, assignmentId) {
  const snapshot = await db.collection(TEST_CYCLE_OPERATIONS).where("assignmentId", "==", assignmentId).limit(60).get();
  const operations = snapshot.docs.map((doc) => doc.data() || {})
    .sort((left, right) => Number(right.createdAt || 0) - Number(left.createdAt || 0));
  const running = operations.filter((operation) => shared.bulk.bulkStatus(operation) === shared.bulk.BULK_STATUS.RUNNING);
  const chosen = [...new Set([...running, ...operations.slice(0, 3)])].slice(0, 5);
  return chosen.map((operation) => shared.bulk.bulkOperationView(operation));
}

const cleanIdList = (value, limit) => [...new Set((Array.isArray(value) ? value : [])
  .map((entry) => String(entry || "").trim()).filter(Boolean))].slice(0, limit);

/*
 * ADD CLASSES AND STUDENTS TO A TEST THAT ALREADY EXISTS.
 *
 * Until now the only way to give a second class a Test was the assignment
 * editor, which makes a separate copy: a second Test, with its own records and
 * its own Google Classroom item. This adds to the SAME Test.
 *
 * WHO MAY ADD WHOM. The caller is the teacher of record for the Test's classes
 * already (assertTeacherMayManageAssignment). They must also be teacher of
 * record for every class they add, and for the class of every student they add.
 *
 * NOTHING THAT EXISTS IS TOUCHED. A class is appended to `assignedClassIds`; a
 * student gets a Test Cycle record marked as individually assigned (and the
 * proof on their own grade document). No session, score, Review answer or
 * correction is read into a new shape, reset or replaced, and no session is
 * created here — opening sessions is its own step and reuses any that exist.
 * Adding something already there is reported as already assigned, not done
 * twice.
 *
 * A STUDENT ADDED ON THEIR OWN is not listed on the shared assignment document
 * (every signed-in student can read it). They sit the Test in the window of an
 * assigned class the teacher names (`sitsWithClassId`), or in a window opened
 * for them.
 */
exports.updateTestCycleAudience = onCall(TEST_CYCLE_ACTION_OPTIONS, async (request) => {
  const db = getFirestore();
  const assignmentSnapshot = await assignmentForTeacherCall(request, db);
  const { teacherUid, teacherEmail } = await assertTeacherMayManageAssignment(request, assignmentSnapshot);
  const { assignmentId, assignment, policy, shared } = await loadTestCycleAssignment(db, assignmentSnapshot.id, { allowInvalid: true });
  if (assignment.archived === true) {
    throw new HttpsError("failed-precondition", "This assessment is archived. Restore it before adding classes or students.");
  }
  const addClassIds = cleanIdList(request.data?.addClassIds, 20).filter(validDocumentId);
  const addStudentIds = cleanIdList(request.data?.addStudentIds, 100).filter(validDocumentId);
  if (!addClassIds.length && !addStudentIds.length) {
    throw new HttpsError("invalid-argument", "Choose at least one class or student to add.");
  }
  const actor = teacherEmail || teacherUid;
  const now = Date.now();
  const ownedClassIds = await teacherOwnedClassIds(db, request);
  const audienceClassIds = assignmentAudience(assignment).classIds;
  const assignmentCourse = String(assignment.courseId || assignment.courseProfile?.course || "").trim();

  // --- classes -------------------------------------------------------------
  const classResults = [];
  const classesToAdd = [];
  const classSnapshots = addClassIds.length
    ? await db.getAll(...addClassIds.map((classId) => db.collection(CLASS_COLLECTION).doc(classId)))
    : [];
  classSnapshots.forEach((classSnapshot) => {
    const classId = classSnapshot.id;
    const classRecord = classSnapshot.exists ? classSnapshot.data() || {} : null;
    const name = classRecord ? String(classRecord.name || classRecord.period || classId).slice(0, 160) : classId;
    if (audienceClassIds.includes(classId)) {
      classResults.push({ classId, name, outcome: "alreadyAssigned", detail: "This class already has this Test." });
    } else if (!classRecord) {
      classResults.push({ classId, name, outcome: "failed", detail: "That class was not found." });
    } else if (classRecord.status === "archived") {
      classResults.push({ classId, name, outcome: "failed", detail: "That class is archived." });
    } else if (ownedClassIds !== null && !ownedClassIds.has(classId)) {
      classResults.push({ classId, name, outcome: "failed", detail: "You are not the teacher of record for that class." });
    } else {
      const course = String(classRecord.course || "").trim();
      classesToAdd.push({ classId, period: String(classRecord.period || "").trim() || null });
      classResults.push({
        classId,
        name,
        outcome: "added",
        detail: assignmentCourse && course && course !== assignmentCourse
          ? `Added. Note: this class's course (${course}) is not the Test's course (${assignmentCourse}).`
          : null,
      });
    }
  });
  const classIdsAfter = [...audienceClassIds, ...classesToAdd.map((entry) => entry.classId)];

  // --- students ------------------------------------------------------------
  // The assigned class whose Test window an added student follows. Named by
  // the teacher, or the Test's first class: a student following no class would
  // have no class-time window at all, however the Test's classes are limited.
  const requestedSitsWith = String(request.data?.sitsWithClassId || "").trim() || null;
  if (requestedSitsWith && !classIdsAfter.includes(requestedSitsWith)) {
    throw new HttpsError("invalid-argument", "Students can only sit the Test with a class that is assigned it.");
  }
  const sitsWithClassId = requestedSitsWith || classIdsAfter[0] || null;
  const identity = await studentIdentity();
  const studentResults = [];
  const studentsToAdd = [];
  const studentSnapshots = addStudentIds.length
    ? await db.getAll(
      ...addStudentIds.map((studentId) => db.collection("grades").doc(studentId)),
      { fieldMask: ["classId", "classPeriod", "status", "profile", ...identity.STUDENT_IDENTITY_FIELDS, new FieldPath("testCycleGrades", assignmentId)] },
    )
    : [];
  studentSnapshots.forEach((gradeSnapshot) => {
    const studentId = gradeSnapshot.id;
    const gradeData = gradeSnapshot.exists ? gradeSnapshot.data() || {} : null;
    const studentName = gradeData ? identity.studentNameForStorage(studentIdentityRecord(identity, studentId, gradeData)) || null : null;
    const result = (outcome, detail = null) => studentResults.push({ studentId, studentName, outcome, detail });
    const classId = authoritativeStudentClassId(gradeData);
    if (!gradeData || studentId === "test_connection") result("failed", "No student with that ID is on the roster.");
    else if (gradeData.status === "inactive") result("failed", "That student is inactive.");
    else if (classId && classIdsAfter.includes(classId)) result("alreadyAssigned", "Already assigned through their class.");
    else if (studentIndividuallyAssigned(gradeData, assignmentId)) result("alreadyAssigned", "Already added to this Test.");
    else if (!classId) result("failed", "That student is not in a class yet. Place them in a class first.");
    else if (ownedClassIds !== null && !ownedClassIds.has(classId)) result("failed", "You are not the teacher of record for that student's class.");
    else {
      studentsToAdd.push({ studentId, classId });
      result("added");
    }
  });

  // --- write: the classes in one update, then each student's own record ----
  if (classesToAdd.length) {
    const periods = [...new Set(classesToAdd.map((entry) => entry.period).filter(Boolean))];
    await assignmentSnapshot.ref.update({
      assignedClassIds: FieldValue.arrayUnion(...classesToAdd.map((entry) => entry.classId)),
      // Kept in step for the surfaces that still address a class by period.
      ...(periods.length ? { assignedClassPeriods: FieldValue.arrayUnion(...periods) } : {}),
      audienceHistory: FieldValue.arrayUnion({ at: now, by: actor, addedClassIds: classesToAdd.map((entry) => entry.classId) }),
      updatedAt: new Date(now).toISOString(),
    });
  }
  for (const { studentId, classId } of studentsToAdd) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await mutateTestCycleRecord(db, {
        assignmentId,
        studentId,
        shared,
        policy,
        mutate: (record) => {
          if (record.audience?.individual === true) return { value: { already: true } };
          return {
            value: { already: false },
            record: {
              ...record,
              classId: record.classId || classId,
              audience: { individual: true, withClassId: sitsWithClassId, addedBy: actor, addedAt: now },
            },
          };
        },
      });
    } catch (error) {
      logger.error("testCycle.audience.addStudentFailed", { assignmentId, studentId, message: error?.message || String(error) });
      const entry = studentResults.find((result) => result.studentId === studentId);
      entry.outcome = "failed";
      entry.detail = "A server error stopped this student being added. Nothing was changed for them; try again.";
    }
  }
  const addedStudents = studentResults.filter((result) => result.outcome === "added").length;
  if (addedStudents) {
    // A count, never the ids: this document is readable by every student.
    await assignmentSnapshot.ref.update({
      audienceHistory: FieldValue.arrayUnion({ at: now + 1, by: actor, addedStudentCount: addedStudents }),
      updatedAt: new Date(now).toISOString(),
    });
  }
  const count = (results, outcome) => results.filter((result) => result.outcome === outcome).length;
  return {
    success: true,
    assignmentId,
    classes: classResults,
    students: studentResults,
    counts: {
      classesAdded: count(classResults, "added"),
      studentsAdded: count(studentResults, "added"),
      alreadyAssigned: count(classResults, "alreadyAssigned") + count(studentResults, "alreadyAssigned"),
      failed: count(classResults, "failed") + count(studentResults, "failed"),
    },
    audienceClassIds: classIdsAfter,
  };
});

/*
 * WHEN THE TEST IS OPEN — SET, EXTENDED OR REOPENED BY THE TEACHER OF RECORD.
 *
 * The window itself is read from the bell schedule (testCycleAvailability.mjs);
 * what a teacher decides here is the DAY, and any exception to it:
 *
 *   setClassTestDay       this class sits the Test in its period on this day.
 *   setTestDayForClasses  every assigned class, each on its first meeting on or
 *                         after a date (an A/B rotation puts them on different
 *                         days, and each gets its own).
 *   extendClassWindow     keep a class's window open past the bell.
 *   reopenClassWindow     open it again for a class, between two times.
 *   clearClassWindows     back to "no class-time window" for a class.
 *   setTestPolicy         class time, or open at any time (an explicit choice).
 *   setFollowUpClose      when Corrections and the Retest close from home:
 *                         the late due date, a time, or never.
 *   reopenStudentTest     open the Test for one student between two times.
 *   setStudentFollowUpClose  give one student longer for Corrections/Retest.
 *
 * A class change is one transaction on the assignment with an audit entry. A
 * student's change is written to that student's own record, never to the
 * shared assignment document, and names who made it and when.
 */
const TEST_WINDOW_MAX_SPAN_MS = 21 * 24 * 60 * 60 * 1000;

exports.updateTestCycleAvailability = onCall(TEST_CYCLE_ACTION_OPTIONS, async (request) => {
  const db = getFirestore();
  const assignmentSnapshot = await assignmentForTeacherCall(request, db);
  const { teacherUid, teacherEmail } = await assertTeacherMayManageAssignment(request, assignmentSnapshot);
  const { assignmentId, assignment, policy, shared } = await loadTestCycleAssignment(db, assignmentSnapshot.id, { allowInvalid: true });
  if (policy.externalAssessment) {
    throw new HttpsError("failed-precondition", "An external-original assessment has no class-time Test window: its one secure session is the retest.");
  }
  const action = String(request.data?.action || "").trim();
  const actor = teacherEmail || teacherUid;
  const now = Date.now();
  const timeZone = shared.timeZone;
  const sched = shared.schedule;
  const audienceClassIds = assignmentAudience(assignment).classIds;
  const instantOf = (value, label) => {
    const at = Number(value);
    if (!Number.isFinite(at) || at <= 0) throw new HttpsError("invalid-argument", `${label} is required.`);
    return at;
  };
  const assignedClass = () => {
    const classId = String(request.data?.classId || "").trim();
    if (!audienceClassIds.includes(classId)) throw new HttpsError("invalid-argument", "That class is not assigned this Test Cycle.");
    return classId;
  };
  const windowOf = () => {
    const opensAt = instantOf(request.data?.opensAt, "An opening time");
    const closesAt = instantOf(request.data?.closesAt, "A closing time");
    if (closesAt <= opensAt) throw new HttpsError("invalid-argument", "The closing time must be after the opening time.");
    if (closesAt <= now) throw new HttpsError("invalid-argument", "The closing time has already passed.");
    if (closesAt - opensAt > TEST_WINDOW_MAX_SPAN_MS) throw new HttpsError("invalid-argument", "A Test window can be at most 21 days long.");
    return { opensAt, closesAt };
  };
  const asRefusal = (work) => {
    try { return work(); } catch (error) {
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("invalid-argument", error.message || "That change is not valid.");
    }
  };

  // --- one student ---------------------------------------------------------
  if (action === "reopenStudentTest" || action === "setStudentFollowUpClose") {
    const { studentId } = await assertStudentInTestCycleAudience(db, { assignment, assignmentId, studentId: request.data?.studentId });
    const reason = String(request.data?.reason || "").trim().slice(0, 200);
    const window = action === "reopenStudentTest" ? windowOf() : null;
    const closesAt = action === "setStudentFollowUpClose" && request.data?.closesAt !== null && request.data?.closesAt !== undefined
      ? instantOf(request.data.closesAt, "A closing time")
      : null;
    if (closesAt !== null && closesAt <= now) throw new HttpsError("invalid-argument", "The closing time has already passed.");
    const written = await mutateTestCycleRecord(db, {
      assignmentId,
      studentId,
      shared,
      policy,
      mutate: (record) => ({
        record: {
          ...record,
          availability: asRefusal(() => (window
            ? sched.withStudentTestWindow(record.availability, { ...window, reason, by: actor, at: now })
            : sched.withStudentFollowUpClose(record.availability, { closesAt }))),
        },
      }),
    });
    return {
      success: true,
      assignmentId,
      action,
      studentId,
      availability: written.record.availability || null,
      label: window
        ? `Test open for this student ${sched.formatSchoolRange(window.opensAt, window.closesAt, timeZone)}.`
        : closesAt === null
          ? "This student follows the class's closing time again."
          : `Corrections and the Retest stay open for this student until ${sched.formatSchoolDateTime(closesAt, timeZone)}.`,
    };
  }

  // --- a class, or the whole Test ------------------------------------------
  const bell = ["setClassTestDay", "setTestDayForClasses", "countClassSitting"].includes(action) ? await readBellSchedule(db) : null;
  const todayKey = schoolTodayKey(shared, now);
  const classPeriodOf = async (classId) => {
    const classSnapshot = await db.collection(CLASS_COLLECTION).doc(classId).get();
    return classSnapshot.exists ? String(classSnapshot.data()?.period || "").trim() || null : null;
  };
  const notes = [];
  let audit = { action };
  let edit;

  if (action === "setClassTestDay") {
    const classId = assignedClass();
    const dateKey = String(request.data?.dateKey || "").trim();
    if (!sched.isDateKey(dateKey)) throw new HttpsError("invalid-argument", "Choose the Test day.");
    if (dateKey < todayKey) throw new HttpsError("invalid-argument", "That day has already passed.");
    const classPeriod = await classPeriodOf(classId);
    if (!classPeriod) {
      throw new HttpsError("failed-precondition", "This class has no period, so the bell schedule cannot say when it meets. Set the class's period, or reopen the window between two times instead.");
    }
    const day = sched.resolveClassPeriodDay({ schedule: bell, classPeriod, dateKey, timeZone });
    const nextMeetings = () => sched.upcomingClassPeriodDays({ schedule: bell, classPeriod, fromDateKey: todayKey, count: 3, timeZone, now }).days
      .map((entry) => sched.formatSchoolRange(entry.opensAt, entry.closesAt, timeZone));
    if (!day.resolved && !day.pending) {
      const next = nextMeetings();
      throw new HttpsError(
        "failed-precondition",
        `${classPeriod} does not meet on ${sched.formatSchoolDate(dateKey, timeZone)} according to the bell schedule.${next.length ? ` It next meets: ${next.join("; ")}.` : ""}`,
        { reason: day.reason },
      );
    }
    // Today's period after its bell: a window that is already closed would mark
    // every student in the class as having missed the Test and move them to a
    // Retest. Refuse it, and say when the class meets next.
    if (day.resolved && day.closesAt <= now) {
      const next = nextMeetings();
      throw new HttpsError(
        "failed-precondition",
        `${classPeriod} already met today (${sched.formatSchoolRange(day.opensAt, day.closesAt, timeZone)}), so that class time has ended.${next.length ? ` It next meets: ${next.join("; ")}.` : ""} To give the Test today anyway, reopen the window between two times.`,
        { reason: "meetingEnded" },
      );
    }
    notes.push(day.resolved
      ? `Test window: ${sched.formatSchoolRange(day.opensAt, day.closesAt, timeZone)}.`
      : `Test day set for ${sched.formatSchoolDate(dateKey, timeZone)}. The times will follow the bell schedule once that day's A/B day is set.`);
    audit = { action, classId, dateKey, addDay: request.data?.addDay === true };
    edit = (current) => sched.withClassTestDay(current, { classId, dateKey, by: actor, at: now, replace: request.data?.addDay !== true });
  } else if (action === "setTestDayForClasses") {
    const fromDateKey = String(request.data?.fromDateKey || "").trim();
    if (!sched.isDateKey(fromDateKey)) throw new HttpsError("invalid-argument", "Choose the first Test day.");
    if (fromDateKey < todayKey) throw new HttpsError("invalid-argument", "That day has already passed.");
    const chosen = [];
    // Who has started the Test, or a Retest in its place, by the class whose
    // windows they follow (as the teacher's table counts it, classSittingsOf).
    // Read once, when a class's window has opened; a started record naming
    // no class counts for every class.
    let started = null;
    const startedIn = async (classId) => {
      if (!started) {
        const notStarted = [shared.record.SESSION_STATE.NONE, shared.record.SESSION_STATE.ASSIGNED];
        const begun = (stage) => !notStarted.includes(stage?.state || shared.record.SESSION_STATE.NONE);
        const records = await db.collection(TEST_CYCLE_RECORDS).where("assignmentId", "==", assignmentId).get();
        started = { byClass: new Map(), unplaced: 0 };
        records.docs.forEach((recordDoc) => {
          const record = shared.record.normalizeTestCycleRecord(recordDoc.data() || {});
          if (!begun(record.test) && !begun(record.retest)) return;
          const sitsWith = record.audience?.withClassId || record.classId;
          if (!sitsWith) started.unplaced += 1;
          else started.byClass.set(sitsWith, (started.byClass.get(sitsWith) || 0) + 1);
        });
      }
      return (started.byClass.get(classId) || 0) + started.unplaced;
    };
    for (const classId of audienceClassIds) {
      // eslint-disable-next-line no-await-in-loop
      const classPeriod = await classPeriodOf(classId);
      // A class whose window has already opened and where someone started
      // the Test (it sat it, or is sitting it) is kept: moving it would put
      // its Corrections back behind a new window and un-miss its absent
      // students. Its own row moves it. A day that passed with nobody
      // starting (a snow day the bell schedule never heard of) moves with
      // the rest (TC03).
      const ran = sched.resolveClassWindows({ availability: assignment?.testAvailability, classId, classPeriod, schedule: bell, timeZone })
        .filter((window) => window.resolved && window.opensAt <= now)
        .sort((left, right) => right.opensAt - left.opensAt)[0];
      // eslint-disable-next-line no-await-in-loop
      if (ran && await startedIn(classId) > 0) {
        notes.push(`${classPeriod || classId}: kept — its Test window already opened (${sched.formatSchoolRange(ran.opensAt, ran.closesAt, timeZone)}). Change its day on its own row if it should move.`);
        continue;
      }
      if (ran) notes.push(`${classPeriod || classId}: its Test day (${sched.formatSchoolRange(ran.opensAt, ran.closesAt, timeZone)}) passed with nobody starting, so it moves too.`);
      const first = classPeriod
        ? sched.upcomingClassPeriodDays({ schedule: bell, classPeriod, fromDateKey, count: 1, timeZone, now }).days[0]
        : null;
      if (first) {
        chosen.push({ classId, dateKey: first.dateKey });
        notes.push(`${classPeriod}: ${sched.formatSchoolRange(first.opensAt, first.closesAt, timeZone)}.`);
      } else {
        notes.push(`${classPeriod || classId}: no meeting found on the bell schedule from that day, so no window was set.`);
      }
    }
    if (!chosen.length) {
      throw new HttpsError("failed-precondition", notes.some((note) => note.includes(": kept — "))
        ? `No class was moved. ${notes.join(" ")}`
        : "None of this Test's classes meets on the bell schedule from that day.");
    }
    audit = { action, fromDateKey, classDays: chosen };
    edit = (current) => chosen.reduce(
      (next, entry) => sched.withClassTestDay(next, { ...entry, by: actor, at: now, replace: true }),
      current,
    );
  } else if (action === "countClassSitting") {
    // THE TEACHER COUNTS A RECORDED SITTING AS THE TEST DAY (the owner,
    // 2026-10-20; W7-6 decision 1, option b). Only for a class-period day the
    // bell schedule no longer gives times for, and only with a sitting the
    // server recorded on it: the day then ran at the sitting's times, and
    // whoever did not start it has missed it.
    const classId = assignedClass();
    const windowId = String(request.data?.windowId || "").trim();
    const classPeriod = await classPeriodOf(classId);
    const window = sched.resolveClassWindows({ availability: assignment?.testAvailability, classId, classPeriod, schedule: bell, timeZone })
      .find((entry) => entry.id === windowId);
    if (!window || window.source !== "bellSchedule" || window.resolved || !sched.isDateKey(window.dateKey)) {
      throw new HttpsError("failed-precondition", "Only a Test day the bell schedule no longer gives times for can be counted from its sitting.");
    }
    const sittingId = sched.classSittingId({ assignmentId, classId, dateKey: window.dateKey });
    const sittingSnapshot = sittingId ? await db.collection(sched.TEST_CYCLE_CLASS_SITTINGS).doc(sittingId).get() : null;
    const sitting = sittingSnapshot?.exists ? sittingSnapshot.data() || {} : null;
    if (!sitting || !Number.isFinite(sitting.opensAt) || !Number.isFinite(sitting.closesAt)) {
      throw new HttpsError("failed-precondition", `Nobody started the Test in this class period on ${sched.formatSchoolDate(window.dateKey, timeZone)}, so there is no sitting to count. Set a new Test day instead.`);
    }
    if (sitting.closesAt > now) {
      throw new HttpsError("failed-precondition", "That class period has not ended yet.");
    }
    notes.push(`${sched.formatSchoolDate(window.dateKey, timeZone)} counts as this class's Test day (${sched.formatSchoolRange(sitting.opensAt, sitting.closesAt, timeZone)}). Students who did not start it have missed it and move to the Retest.`);
    audit = { action, classId, windowId, dateKey: window.dateKey, opensAt: sitting.opensAt, closesAt: sitting.closesAt };
    edit = (current) => sched.withClassSittingHeld(current, { classId, windowId, opensAt: sitting.opensAt, closesAt: sitting.closesAt, by: actor, at: now });
  } else if (action === "extendClassWindow") {
    const classId = assignedClass();
    const windowId = String(request.data?.windowId || "").trim();
    const closesAt = instantOf(request.data?.closesAt, "A new closing time");
    if (closesAt <= now) throw new HttpsError("invalid-argument", "The new closing time has already passed.");
    notes.push(`Window open until ${sched.formatSchoolDateTime(closesAt, timeZone)}.`);
    audit = { action, classId, windowId, closesAt };
    edit = (current) => sched.withClassWindowExtended(current, { classId, windowId, closesAt, by: actor, at: now });
  } else if (action === "reopenClassWindow") {
    const classId = assignedClass();
    const window = windowOf();
    notes.push(`Test open ${sched.formatSchoolRange(window.opensAt, window.closesAt, timeZone)}.`);
    audit = { action, classId, ...window };
    edit = (current) => sched.withClassCustomWindow(current, {
      classId, ...window, reason: String(request.data?.reason || "").trim(), by: actor, at: now,
    });
  } else if (action === "clearClassWindows") {
    const classId = assignedClass();
    notes.push("This class has no class-time window again: its Test can be started whenever its session is open.");
    audit = { action, classId };
    edit = (current) => sched.withoutClassWindows(current, { classId });
  } else if (action === "setTestPolicy") {
    const wanted = String(request.data?.policy || "").trim();
    notes.push(wanted === sched.TEST_AVAILABILITY_POLICY.ALWAYS_OPEN
      ? "The Test is open at any time, including from home."
      : "The Test is open in class time, on the days set for each class.");
    audit = { action, policy: wanted };
    edit = (current) => sched.withTestPolicy(current, { policy: wanted });
  } else if (action === "setFollowUpClose") {
    const mode = String(request.data?.mode || "").trim();
    const closesAt = mode === sched.FOLLOW_UP_CLOSE.CUSTOM ? instantOf(request.data?.closesAt, "A closing time") : null;
    if (closesAt !== null && closesAt <= now) throw new HttpsError("invalid-argument", "The closing time has already passed.");
    notes.push(mode === sched.FOLLOW_UP_CLOSE.CUSTOM
      ? `Corrections and the Retest close ${sched.formatSchoolDateTime(closesAt, timeZone)}.`
      : mode === sched.FOLLOW_UP_CLOSE.NONE
        ? "Corrections and the Retest have no closing time."
        : "Corrections and the Retest close at the assignment's final due date.");
    audit = { action, mode, closesAt };
    edit = (current) => sched.withFollowUpClose(current, { mode, closesAt });
  } else {
    throw new HttpsError("invalid-argument", "Choose a supported Test window change.");
  }

  // Read-modify-write on the assignment, so two tabs cannot undo each other.
  const stored = await db.runTransaction(async (transaction) => {
    const fresh = await transaction.get(assignmentSnapshot.ref);
    if (!fresh.exists) throw new HttpsError("not-found", "That assignment was not found.");
    const next = asRefusal(() => edit(fresh.data()?.testAvailability || null));
    transaction.update(assignmentSnapshot.ref, {
      testAvailability: next,
      testAvailabilityHistory: FieldValue.arrayUnion({ at: now, by: actor, ...audit }),
      updatedAt: new Date(now).toISOString(),
    });
    return next;
  });
  return { success: true, assignmentId, action, testAvailability: stored, notes };
});

/*
 * A TEACHER SETS A STUDENT'S RECORDED GRADE BY HAND — AND SAYS FROM WHAT.
 *
 * The grade rule records what the secure Test and Retest earned. A teacher may
 * decide otherwise: use the student's Review score, use the Retest's actual
 * score instead of its capped one, or enter a grade. The number for the first
 * two is read HERE, from the saved Review work and the released Retest, never
 * taken from the browser. A typed grade needs a note. Every adjustment, and
 * its removal, is an audit row on the record: who, when, from what, and the
 * grade it replaced. The secure scores themselves are never changed.
 *
 * Google Classroom follows the recorded grade on the same grade item, and — as
 * for every Test Cycle grade — is never lowered automatically.
 */
exports.adjustTestCycleGrade = onCall(TEST_CYCLE_ACTION_OPTIONS, async (request) => {
  const db = getFirestore();
  const assignmentSnapshot = await assignmentForTeacherCall(request, db);
  const { teacherUid, teacherEmail } = await assertTeacherMayManageAssignment(request, assignmentSnapshot);
  const { assignmentId, assignment, policy, shared } = await loadTestCycleAssignment(db, assignmentSnapshot.id);
  const { studentId, gradeData } = await assertStudentInTestCycleAudience(db, {
    assignment, assignmentId, studentId: request.data?.studentId,
  });
  const actor = teacherEmail || teacherUid;
  const now = Date.now();
  const SOURCE = shared.record.GRADE_ADJUSTMENT_SOURCE;

  if (request.data?.clear === true) {
    const cleared = await mutateTestCycleRecord(db, {
      assignmentId,
      studentId,
      shared,
      policy,
      mutate: (record) => (record.gradeAdjustment
        ? { record: shared.record.clearTeacherGradeAdjustment(record, { by: actor, at: now, policy }), value: { cleared: true } }
        : { value: { cleared: false } }),
    });
    const grade = shared.record.recordGradeState(cleared.record, policy);
    return { success: true, assignmentId, studentId, cleared: cleared.value?.cleared === true, recordedGrade: grade.recordedGrade, reason: grade.reason };
  }

  const source = String(request.data?.source || "").trim();
  if (!shared.record.GRADE_ADJUSTMENT_SOURCES.includes(source)) {
    throw new HttpsError("invalid-argument", "Choose where the grade comes from: the Review score, the actual Retest score, or a grade you enter.");
  }
  const note = String(request.data?.note || "").trim().slice(0, 300);
  let grade;
  if (source === SOURCE.REVIEW) {
    const summary = testCycleLib.reviewSummary(assignment, gradeData?.gradesByAssignment?.[assignmentId] || {});
    if (summary.percent === null) throw new HttpsError("failed-precondition", "This assessment has no Review questions to take a score from.");
    grade = summary.percent;
  } else if (source === SOURCE.RETEST_ACTUAL) {
    const record = await readTestCycleRecord(db, assignmentId, studentId, shared);
    const actual = shared.record.recordGradeState({ ...record, gradeAdjustment: null }, policy).rawRetestGrade;
    if (actual === null) throw new HttpsError("failed-precondition", "This student has no released Retest score yet. Release the Retest first.");
    grade = actual;
  } else {
    const typed = Number(request.data?.grade);
    if (request.data?.grade === null || request.data?.grade === undefined || request.data?.grade === ""
      || !Number.isFinite(typed) || typed < 0 || typed > 100) {
      throw new HttpsError("invalid-argument", "Enter a grade from 0 to 100.");
    }
    if (!note) throw new HttpsError("invalid-argument", "Add a short note saying why you are setting this grade.");
    grade = typed;
  }

  const written = await mutateTestCycleRecord(db, {
    assignmentId,
    studentId,
    shared,
    policy,
    mutate: (record) => ({
      record: shared.record.applyTeacherGradeAdjustment(record, { grade, source, note, by: actor, at: now, policy }),
    }),
  });
  const state = shared.record.recordGradeState(written.record, policy);
  return {
    success: true,
    assignmentId,
    studentId,
    recordedGrade: state.recordedGrade,
    ruleRecordedGrade: state.ruleRecordedGrade ?? null,
    source,
    reason: state.reason,
  };
});

/*
 * FEWER TEST QUESTIONS FOR ONE STUDENT — THE TEACHER CHOOSES (TC15).
 *
 * For a student whose support plan lists "Reduced number of items — same TEKS
 * and rigor", the teacher of record chooses which of the secure Test's
 * questions that student does not answer. MathMaster never picks them, and a
 * student whose plan does not list it cannot be given a shorter Test. The
 * rules are in functions/shared/testCycleReducedItems.mjs: every skill keeps a
 * question, at most half the Test, the grade is over the questions asked.
 *
 * Kept on the student's own server-only record, with who chose and when, plus
 * an audit row; never on the shared assignment. Only before the student
 * starts: the lock is read from the record AND from the sessions themselves
 * inside this transaction, so a start racing this call either lands first
 * (and this is refused) or starts the re-planned Test. A session that exists
 * and has not been started is re-planned here, in the same transaction: the
 * plan it would have had, minus the excused questions — every other question
 * exactly as it was.
 */
exports.setTestCycleReducedItems = onCall(TEST_CYCLE_ACTION_OPTIONS, async (request) => {
  const db = getFirestore();
  const assignmentSnapshot = await assignmentForTeacherCall(request, db);
  const { teacherUid, teacherEmail } = await assertTeacherMayManageAssignment(request, assignmentSnapshot);
  const { assignmentId, assignment, policy, blueprint, shared } = await loadTestCycleAssignment(db, assignmentSnapshot.id);
  const { studentId, gradeData } = await assertStudentInTestCycleAudience(db, {
    assignment, assignmentId, studentId: request.data?.studentId,
  });
  const rules = shared.reducedItems;
  if (!Array.isArray(request.data?.excusedSlotIds)) {
    throw new HttpsError("invalid-argument", "Choose the questions this student does not answer, or none to give back the whole Test.");
  }
  const choice = rules.validateExcusedQuestions({
    questions: rules.testCycleQuestionList(blueprint),
    excusedSlotIds: request.data.excusedSlotIds,
  });
  if (!choice.ok) throw new HttpsError("invalid-argument", choice.errors.join(" "));
  const now = Date.now();
  // Giving back the whole Test is always allowed, whatever the plan says now.
  if (choice.excusedSlotIds.length && !rules.planFewerItems({ profile: gradeData?.profile || null, assignment, nowValue: now }).listed) {
    throw new HttpsError("failed-precondition", "This student's support plan does not list fewer items, so their Test stays whole.");
  }
  const actor = teacherEmail || teacherUid;
  const families = await resolveBlueprintFamilies(db, blueprintFamilyIds(blueprint));

  const written = await mutateTestCycleRecord(db, {
    assignmentId,
    studentId,
    shared,
    policy,
    mutate: async (record, { transaction }) => {
      const sessionRef = (id) => (id ? db.collection("examSessions").doc(String(id)) : null);
      const testRef = sessionRef(record.test.examSessionId);
      const retestRef = sessionRef(record.retest.examSessionId);
      // A Retest opened in place of a missed Test IS the Test's whole form, so
      // the same questions are left out of it. A targeted Retest only exists
      // after a released Test, which the lock below has already refused.
      const standIn = record.retest.withoutOriginal === true && Boolean(retestRef);
      const retestPlanRef = standIn ? db.collection(TEST_CYCLE_RETEST_PLANS).doc(record.recordId) : null;
      const [testSnapshot, retestSnapshot, retestPlanSnapshot] = await Promise.all([
        testRef ? transaction.get(testRef) : null,
        retestRef ? transaction.get(retestRef) : null,
        retestPlanRef ? transaction.get(retestPlanRef) : null,
      ]);
      const testSession = testSnapshot?.exists ? testSnapshot.data() || {} : null;
      const retestSession = retestSnapshot?.exists ? retestSnapshot.data() || {} : null;
      const lock = rules.reducedItemsLock({
        record,
        testSessionStatus: testSession?.status ?? null,
        retestSessionStatus: retestSession?.status ?? null,
        noun: policy.externalAssessment ? "Retest" : "Test",
      });
      if (lock.locked) throw new HttpsError("failed-precondition", lock.reason, { reason: "started" });
      // Unchanged only when the choice on record applies to this Test: one made
      // for a Test since replaced is saved again, for this one.
      const current = rules.reducedItemsState(record, blueprint);
      const before = new Set(current.excusedSlotIds);
      if (!current.stale && before.size === choice.excusedSlotIds.length && choice.excusedSlotIds.every((slotId) => before.has(slotId))) {
        return { value: { changed: false } };
      }

      // The plan the session would have had (same stage, same attempt, so the
      // same seeds), minus the excused questions.
      const replan = (session, stage) => {
        const plan = rules.applyExcusedQuestionsToPlan(shared.issuance.buildSecureIssuancePlan({
          blueprint,
          families,
          studentId,
          assignmentId,
          stage,
          attempt: Number(session?.issuancePlan?.attempt || session?.courseTest?.attempt || 1),
        }), choice.excusedSlotIds);
        if (shared.issuance.planRequiresLiveGeneration(plan)) {
          throw new HttpsError("failed-precondition", "This student's Test could not be planned from the approved question families. Check the secure preflight, then try again.");
        }
        return plan;
      };
      let next = record;
      if (testSession?.status === "not_started") {
        const plan = replan(testSession, shared.issuance.CYCLE_STAGE.TEST);
        // update(), not a merge: the whole stored plan is replaced, so nothing
        // of an earlier choice survives inside it.
        transaction.update(testRef, { issuancePlan: plan, requiredQuestions: plan.totalQuestions, updatedAt: now });
        next = { ...next, test: { ...next.test, totalQuestions: plan.totalQuestions } };
      }
      if (standIn && retestSession?.status === "not_started") {
        const plan = replan(retestSession, shared.issuance.CYCLE_STAGE.RETEST);
        transaction.update(retestRef, { issuancePlan: plan, requiredQuestions: plan.totalQuestions, updatedAt: now });
        if (retestPlanSnapshot?.exists) {
          transaction.update(retestPlanRef, {
            plan,
            "audit.questionCount": plan.totalQuestions,
            "audit.anchorQuestionCount": plan.totalQuestions,
            "audit.originalQuestionCount": plan.totalQuestions,
          });
        }
        next = { ...next, retest: { ...next.retest, totalQuestions: plan.totalQuestions } };
      }
      const grade = shared.record.recordGradeState(next, policy);
      return {
        value: { changed: true },
        record: {
          ...next,
          // Null removes it: the whole Test again.
          reducedItems: rules.reducedItemsForRecord({ choice, blueprint, by: actor, at: now }),
          history: shared.grade.appendTestCycleGradeHistory(next.history, {
            at: now,
            reason: shared.grade.GRADE_HISTORY_REASON.REDUCED_ITEMS,
            recordedGrade: grade.recordedGrade,
            originalTestGrade: grade.originalTestGrade,
            rawRetestGrade: grade.rawRetestGrade,
            retestCappedContribution: grade.retestCappedContribution,
            detail: rules.describeReducedItemsChoice(choice),
            by: actor,
          }),
        },
      };
    },
  });
  return {
    success: true,
    assignmentId,
    studentId,
    changed: written.value?.changed === true,
    reducedItems: written.record.reducedItems || null,
    questions: choice.questions,
    testQuestions: choice.testQuestions,
    label: rules.describeReducedItemsChoice(choice),
  };
});

/*
 * ONE STUDENT'S STEP OF A CLASS-WIDE OPERATION.
 *
 * Each step is safe to run twice: waiving a Review that is waived, or opening
 * a session that is open, reports "already complete" and changes nothing. That
 * is what lets an interrupted operation be resumed without doing any student
 * twice. A failure is caught HERE and becomes that student's outcome, with the
 * reason — one student's error never stops, or hides, the rest.
 */
async function runTestCycleBulkStep(db, context, action, studentId) {
  const { assignmentId, assignment, policy, blueprint, shared, teacherUid } = context;
  const { BULK_ACTION, BULK_OUTCOME } = shared.bulk;
  try {
    if (!validDocumentId(studentId)) return { outcome: BULK_OUTCOME.FAILED, detail: "That is not a valid student ID." };
    const [recordSnapshot, [gradeSnapshot]] = await Promise.all([
      db.collection(TEST_CYCLE_RECORDS).doc(testCycleRecordKey(assignmentId, studentId)).get(),
      db.getAll(db.collection("grades").doc(studentId), {
        fieldMask: ["classId", "classPeriod", "status", new FieldPath("gradesByAssignment", assignmentId), new FieldPath("testCycleGrades", assignmentId)],
      }),
    ]);
    if (!gradeSnapshot.exists || studentId === "test_connection") {
      return { outcome: BULK_OUTCOME.NOT_ELIGIBLE, detail: "No student with that ID is on the roster." };
    }
    const gradeData = gradeSnapshot.data() || {};
    // The same audience rule every teacher action uses: a record, an assigned
    // class, or having been added on their own.
    if (!recordSnapshot.exists && !studentMatchesAssignmentAudience({ assignment, classId: gradeData.classId || null, gradeData, assignmentId })) {
      return { outcome: BULK_OUTCOME.NOT_ELIGIBLE, detail: "This student is not assigned this Test Cycle." };
    }
    if (gradeData.status === "inactive") return { outcome: BULK_OUTCOME.NOT_ELIGIBLE, detail: "This student is inactive." };
    const record = shared.record.normalizeTestCycleRecord(recordSnapshot.exists ? recordSnapshot.data() : { assignmentId, studentId });

    if (action === BULK_ACTION.WAIVE_REVIEW) {
      if (record.teacherControls.reviewWaived) return { outcome: BULK_OUTCOME.ALREADY_COMPLETE, detail: "Review was already waived." };
      const reviewProgress = testCycleLib.reviewProgress(assignment, gradeData.gradesByAssignment?.[assignmentId] || {});
      const state = shared.stages.resolveTestCycleStage({ policy, record, reviewProgress });
      if (state?.stage !== shared.stages.TEST_CYCLE_STAGE.REVIEW) {
        return { outcome: BULK_OUTCOME.ALREADY_COMPLETE, detail: "Review is already finished or not required." };
      }
      const written = await mutateTestCycleRecord(db, {
        assignmentId,
        studentId,
        shared,
        policy,
        mutate: (current) => (current.teacherControls.reviewWaived
          ? { value: { already: true } }
          : { value: { already: false }, record: { ...current, teacherControls: shared.policy.applyTeacherControlAction(current.teacherControls, "waiveReview") } }),
      });
      if (written.value?.already) return { outcome: BULK_OUTCOME.ALREADY_COMPLETE, detail: "Review was already waived." };
      // A student who missed the Test is past the gate now: open their Retest.
      await ensureMissedTestRetestIfDue(db, { assignmentId, assignment, policy, blueprint, shared, studentId, gradeData, teacherUid })
        .catch((error) => logger.warn("testCycle.bulk.missedRetestNotOpened", { assignmentId, studentId, message: error?.message || String(error) }));
      return {
        outcome: BULK_OUTCOME.SUCCEEDED,
        detail: written.record.test.examSessionId ? null : "Their Test session is not open yet.",
      };
    }

    if (record.test.examSessionId) return { outcome: BULK_OUTCOME.ALREADY_COMPLETE, detail: "Their Test session is already open." };
    const opened = await openTestSessionForStudent(db, context, studentId, gradeData);
    if (opened.notEligible) {
      return { outcome: BULK_OUTCOME.NOT_ELIGIBLE, detail: "They missed the Test and are on the Retest that replaced it." };
    }
    return opened.reused
      ? { outcome: BULK_OUTCOME.ALREADY_COMPLETE, detail: "Their Test session is already open." }
      : { outcome: BULK_OUTCOME.SUCCEEDED, detail: null };
  } catch (error) {
    logger.error("testCycle.bulk.stepFailed", { assignmentId, studentId, action, message: error?.message || String(error) });
    return {
      outcome: BULK_OUTCOME.FAILED,
      detail: error instanceof HttpsError
        ? error.message
        : "A server error stopped this student's change. Nothing was changed for them; run it again.",
    };
  }
}

/** Who a class-wide operation applies to, resolved once, on the server. */
async function resolveTestCycleBulkTargets(db, shared, { assignment, assignmentId, scope }) {
  const kind = String(scope?.kind || "").trim();
  const audienceClassIds = assignmentAudience(assignment).classIds;
  let ids;
  let stored;
  if (kind === "students") {
    ids = cleanIdList(scope?.studentIds, shared.bulk.BULK_MAX_TARGETS + 1);
    if (!ids.length) throw new HttpsError("invalid-argument", "Select at least one student.");
    stored = { kind };
  } else if (kind === "class") {
    const classId = String(scope?.classId || "").trim();
    if (!audienceClassIds.includes(classId)) throw new HttpsError("invalid-argument", "That class is not assigned this Test Cycle.");
    ids = [...await testCycleRosterIds(db, { assignedClassIds: [classId] })];
    stored = { kind, classId };
  } else if (kind === "all") {
    const roster = await testCycleRosterIds(db, assignment);
    // Anyone added on their own is part of "everyone" too.
    const individual = await db.collection(TEST_CYCLE_RECORDS).where("assignmentId", "==", assignmentId).select("studentId", "audience").get();
    individual.docs.forEach((doc) => {
      if (doc.data()?.audience?.individual === true && doc.data()?.studentId) roster.add(String(doc.data().studentId));
    });
    ids = [...roster];
    stored = { kind };
  } else {
    throw new HttpsError("invalid-argument", "Choose everyone, a class, or selected students.");
  }
  if (ids.length > shared.bulk.BULK_MAX_TARGETS) {
    throw new HttpsError("failed-precondition", `That is ${ids.length} students. Run it for one class at a time (at most ${shared.bulk.BULK_MAX_TARGETS} per operation).`);
  }
  return { ids: ids.sort(), scope: stored };
}

const BULK_LEASE_MS = 60 * 1000;

/*
 * A CLASS-WIDE ACTION, AS ONE SERVER OPERATION.
 *
 * `operationId` is chosen by the browser and is the idempotency key: sending it
 * again continues the same operation rather than starting another. The server
 * resolves who it applies to once (when the operation is created), works
 * through them a few at a time inside a time budget, and stores each student's
 * outcome as it goes. If students remain when the budget is spent it returns
 * `running` with the tally so far, and the browser calls again to continue.
 * Only one call works an operation at a time (a short lease); a second caller
 * is shown the progress instead of repeating the work.
 *
 * The operation document is also the audit record: who asked, when, for which
 * action, and what happened for every student.
 */
exports.runTestCycleBulkAction = onCall(TEST_CYCLE_ACTION_OPTIONS, async (request) => {
  const db = getFirestore();
  const assignmentSnapshot = await assignmentForTeacherCall(request, db);
  const { teacherUid, teacherEmail } = await assertTeacherMayManageAssignment(request, assignmentSnapshot);
  const loaded = await loadTestCycleAssignment(db, assignmentSnapshot.id);
  const { assignmentId, assignment, policy, blueprint, secureReferenceResolved, shared } = loaded;
  const { bulk } = shared;
  const action = String(request.data?.action || "").trim();
  if (!bulk.BULK_ACTIONS.includes(action)) throw new HttpsError("invalid-argument", "Choose a supported class-wide action.");
  const operationId = bulk.normalizeBulkOperationId(request.data?.operationId);
  if (!operationId) throw new HttpsError("invalid-argument", "A class-wide action needs an operation id.");

  const availability = shared.availability.resolveAssessmentAvailability({ assignment, now: Date.now() });
  if (!availability.open && availability.reason !== shared.availability.ASSESSMENT_AVAILABILITY.SCHEDULED) {
    throw new HttpsError("failed-precondition", "This assessment is archived or paused. Restore it before changing it for a class.");
  }
  if (action === bulk.BULK_ACTION.OPEN_TEST_SESSIONS && policy.externalAssessment) {
    throw new HttpsError("failed-precondition", "An external-original assessment opens retest sessions from the original scores you enter. Use \"Open secure Retest sessions\".");
  }

  const operationRef = db.collection(TEST_CYCLE_OPERATIONS).doc(`${assignmentId}__${operationId}`);
  const leaseId = crypto.randomUUID();
  const existing = await operationRef.get();
  const targets = existing.exists
    ? null
    : await resolveTestCycleBulkTargets(db, shared, { assignment, assignmentId, scope: request.data?.scope });

  // Create the operation, or take over an unfinished one, under a lease.
  const claim = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(operationRef);
    const now = Date.now();
    if (!snapshot.exists) {
      if (!targets) throw new HttpsError("aborted", "That operation changed while it was starting. Try again.");
      const created = {
        ...bulk.newBulkOperation({
          operationId, assignmentId, action, targetStudentIds: targets.ids, scope: targets.scope, requestedBy: teacherEmail || teacherUid, now,
        }),
        requestedByUid: teacherUid,
        lease: { id: leaseId, until: now + BULK_LEASE_MS },
      };
      // No students at all is a finished operation, not a running one.
      created.status = bulk.bulkStatus(created);
      created.completedAt = created.status === bulk.BULK_STATUS.RUNNING ? null : now;
      transaction.set(operationRef, created);
      return { operation: created, mine: created.status === bulk.BULK_STATUS.RUNNING };
    }
    const stored = snapshot.data() || {};
    if (String(stored.assignmentId) !== assignmentId || String(stored.action) !== action) {
      throw new HttpsError("failed-precondition", "That operation id was already used for a different action. Start a new one.");
    }
    if (bulk.bulkStatus(stored) !== bulk.BULK_STATUS.RUNNING) return { operation: stored, mine: false };
    if (Number(stored.lease?.until) > now) return { operation: stored, mine: false, busy: true };
    transaction.update(operationRef, { lease: { id: leaseId, until: now + BULK_LEASE_MS }, updatedAt: now });
    return { operation: { ...stored, lease: { id: leaseId, until: now + BULK_LEASE_MS } }, mine: true };
  });
  if (!claim.mine) return { success: true, busy: claim.busy === true, ...bulk.bulkOperationView(claim.operation) };

  let operation = claim.operation;
  const release = () => operationRef.update({ lease: FieldValue.delete() }).catch(() => null);
  try {
    const context = { assignmentId, assignment, policy, blueprint, shared, teacherUid, families: [] };
    if (action === bulk.BULK_ACTION.OPEN_TEST_SESSIONS) {
      // Once per call, never once per student: a Test Cycle that cannot issue
      // equivalent secure coverage is refused before any session exists.
      const { families, result: preflight } = await runTestCyclePreflight(db, { assignment, policy, blueprint, shared, secureReferenceResolved });
      if (preflight.blocked) {
        throw new HttpsError("failed-precondition", `This Test Cycle cannot be assigned securely: ${preflight.errors[0]}`, { preflight });
      }
      context.families = families;
    }

    const stopAt = Date.now() + bulk.BULK_TIME_BUDGET_MS;
    let pending = bulk.pendingBulkTargets(operation);
    while (pending.length && Date.now() < stopAt) {
      const batch = pending.slice(0, bulk.BULK_CONCURRENCY);
      // eslint-disable-next-line no-await-in-loop
      const outcomes = await Promise.all(batch.map((studentId) => runTestCycleBulkStep(db, context, action, studentId)));
      const at = Date.now();
      const writes = [];
      batch.forEach((studentId, index) => {
        operation = bulk.withBulkResult(operation, studentId, outcomes[index], at);
        writes.push(new FieldPath("results", studentId), operation.results[studentId]);
      });
      // Progress is stored after every batch, so a dropped connection or a
      // closed tab loses nothing that was done.
      // eslint-disable-next-line no-await-in-loop
      await operationRef.update(
        "status", operation.status,
        "updatedAt", at,
        "completedAt", operation.completedAt,
        "lease", { id: leaseId, until: at + BULK_LEASE_MS },
        ...writes,
      );
      pending = bulk.pendingBulkTargets(operation);
    }
  } finally {
    await release();
  }
  return { success: true, busy: false, ...bulk.bulkOperationView(operation) };
});

/** A class-wide operation's progress and per-student account, for its teacher. */
exports.getTestCycleOperation = onCall(TEST_CYCLE_ACTION_OPTIONS, async (request) => {
  const db = getFirestore();
  const assignmentSnapshot = await assignmentForTeacherCall(request, db);
  await assertTeacherMayManageAssignment(request, assignmentSnapshot);
  const shared = await testCycleLib.shared();
  const operationId = shared.bulk.normalizeBulkOperationId(request.data?.operationId);
  if (!operationId) throw new HttpsError("invalid-argument", "An operation id is required.");
  const snapshot = await db.collection(TEST_CYCLE_OPERATIONS).doc(`${assignmentSnapshot.id}__${operationId}`).get();
  if (!snapshot.exists) throw new HttpsError("not-found", "That operation was not found.");
  const operation = snapshot.data() || {};
  return {
    success: true,
    busy: Number(operation.lease?.until) > Date.now(),
    ...shared.bulk.bulkOperationView(operation),
  };
});
