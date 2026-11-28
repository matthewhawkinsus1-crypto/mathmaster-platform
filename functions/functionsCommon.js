// HELPERS AND CONSTANTS THAT MORE THAN ONE DOMAIN MODULE USES.
//
// Moved from functions/index.js as they stood. A helper only one domain uses
// belongs in that domain's file, not here: the release planner reads this
// file statement by statement (scripts/lib/functionsImportGraph.mjs,
// STATEMENT_LEVEL_MODULES), so a change here redeploys the functions that use
// the changed helper, and no others. This file loads no domain module.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldPath, FieldValue } = require("firebase-admin/firestore");
const { HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { runtimeQuestionsFromAssignment } = require("./lib/assignmentRuntime");
const { weightedQuestionTotals } = require("./lib/questionWeights");
// The reduced-item-count accommodation, loaded once (lazily) by this lib.
const studentWorkloadIndices = require("./lib/studentWorkloadIndices");
const authLib = require("./lib/auth");
const mathPath = require("./lib/mathPath");
// Rich Tool items on every secure surface: the mode-aware public payload and
// the one grading authority (see the file header).
const secureItems = require("./lib/secureItems");
// The Test Cycle rules are shared ESM; this is the CommonJS bridge to them.
const testCycleLib = require("./lib/testCycle");

let liveChallengeClassPointsModule = null;
async function liveChallengeClassPoints() {
  if (!liveChallengeClassPointsModule) {
    liveChallengeClassPointsModule = await import("./shared/liveChallengeClassPoints.mjs");
  }
  return liveChallengeClassPointsModule;
}

let classroomLibModule = null;
function classroomLib() {
  if (!classroomLibModule) classroomLibModule = require("./lib/classroom");
  return classroomLibModule;
}
const { studentRequiredIndices } = studentWorkloadIndices;

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function serializableDate(value) {
  const date = toDate(value);
  return date ? date.toISOString() : value || null;
}

const assignmentAudience = (assignment = {}) => ({
  classIds: [...new Set((Array.isArray(assignment.assignedClassIds) ? assignment.assignedClassIds : [])
    .map(String).map((value) => value.trim()).filter(Boolean))],
});

const CHECKPOINT_COLLECTION = "studentResponseCheckpoints";
// The one status in the finalizer's working set. Named here so the recovery
// sweep and the scheduler cannot drift apart on what "outstanding" means.
const CHECKPOINT_STATUS_ACTIVE = "active";

const secureAssignmentMode = (assignment = {}) => (
  String(assignment?.assessmentPolicy?.mode || "") === "testCycle"
);

/*
 * ONE STUDENT'S PRIVATE CONTROLS ON ONE ASSIGNMENT.
 *
 * Their individual final cutoff, excusal, reopen and DOL attempt grant live in
 * `studentAssignmentOverrides/{len:sid:aid}` (shared/studentAssignmentOverrides.mjs),
 * not on the shared assignment every classmate receives. Every server path
 * that decides a student's deadline or attempt budget reads it HERE, by the
 * id derived from the authenticated student and the assignment it already
 * holds — inside the same transaction as the assignment where there is one —
 * and passes it to the shared resolvers. Nothing a browser sends can stand in
 * for it.
 */
let studentOverridesModule = null;
async function studentOverrides() {
  if (!studentOverridesModule) studentOverridesModule = await import("./shared/studentAssignmentOverrides.mjs");
  return studentOverridesModule;
}

/** The record's reference, or null when either id is missing (nothing to read). */
async function studentOverrideRef(db, studentId, assignmentId) {
  const overrides = await studentOverrides();
  const id = overrides.studentAssignmentOverrideId(studentId, assignmentId);
  return id ? db.collection(overrides.STUDENT_ASSIGNMENT_OVERRIDES_COLLECTION).doc(id) : null;
}

/** The stored record, or null: `null` tells the resolvers private storage WAS read. */
const privateOverrideFrom = (snapshot) => (snapshot?.exists ? snapshot.data() || null : null);

/**
 * The class period is schedule metadata, and the Warm-Up/DOL windows are
 * defined against it. Read it from the authoritative class record, falling
 * back to the roster row.
 */
async function resolveCheckpointClassPeriod(db, classId, gradeData, cache) {
  const key = String(classId || "");
  if (!key) return String(gradeData?.classPeriod || "") || null;
  if (cache.has(key)) return cache.get(key) || String(gradeData?.classPeriod || "") || null;
  let period = null;
  try {
    const classSnapshot = await db.collection("classes").doc(key).get();
    period = classSnapshot.exists ? String(classSnapshot.data()?.period || "") || null : null;
  } catch (error) {
    logger.warn("Could not read class record for checkpoint finalization", { classId: key, message: error.message });
  }
  cache.set(key, period);
  return period || String(gradeData?.classPeriod || "") || null;
}

/*
 * THE ITEMS A REDUCED-ITEM-COUNT ACCOMMODATION OMITS FOR THIS STUDENT.
 *
 * `reduced-item-count-same-rigor` with a percentage makes a student
 * responsible for fewer items (functions/shared/reducedWorkload.mjs). Every
 * server path here that turns a tracker into a denominator — the Classroom
 * passback, the classwork completion rule, the DOL projection, Recovery —
 * filters its indices with this Set (`studentRequiredIndices`), so the server
 * counts exactly the items the browser shows the student. Empty for everyone
 * without the accommodation; empty, and logged, if anything goes wrong, so a
 * malformed profile can only ever mean "grade every included item".
 *
 * `gradeData` is the student's `grades/{id}` document (profile + tracker).
 * `answeredIndex` is the question an attempt being recorded right now
 * answers: answered work is always required, so an attempt on an omitted item
 * is accepted and counted like any other.
 */
async function studentOmittedFor({ assignment, gradeData, assignmentId, answeredIndex = null, resetIndex = null, nowValue = Date.now() }) {
  return studentWorkloadIndices.studentOmittedFor({
    assignment,
    gradeData,
    assignmentId,
    answeredIndex,
    resetIndex,
    nowValue,
    onError: (error) => logger.warn("Reduced-workload projection failed; counting every included item", {
      assignmentId: String(assignmentId || ""),
      message: String(error?.message || error),
    }),
  });
}

/** The student's class, read from the authoritative roster row, never claimed. */
function authoritativeStudentClassId(gradeData) {
  return String(gradeData?.classId || "").trim() || null;
}

/*
 * A STUDENT ADDED TO A TEST CYCLE ON THEIR OWN, NOT THROUGH A CLASS.
 *
 * The proof is on the student's own grade document: the server-written
 * `testCycleGrades[assignmentId].individuallyAssigned` (a projection of their
 * Test Cycle record; firestore.rules refuses every client write to that map).
 * It is deliberately NOT a list of student ids on the assignment, which every
 * signed-in student can read.
 */
function studentIndividuallyAssigned(gradeData, assignmentId) {
  const id = String(assignmentId || "").trim();
  return Boolean(id && gradeData?.testCycleGrades?.[id]?.individuallyAssigned === true);
}

/*
 * Class membership is the rule. `gradeData` (with the assignment's id) lets
 * the paths a student's own Test Cycle work travels — the cycle's callables
 * and the ingestion of its Review answers — also accept a student who was
 * added individually. A caller that passes only a class is asking only about
 * the class, exactly as before.
 */
const studentMatchesAssignmentAudience = ({ assignment = {}, classId = null, gradeData = null, assignmentId = null } = {}) => {
  const audience = assignmentAudience(assignment);
  if (classId && audience.classIds.includes(String(classId))) return true;
  return studentIndividuallyAssigned(gradeData, assignmentId || assignment?.id);
};

async function assertTeacherMayManageAssignment(request, assignmentSnap) {
  const teacherUid = await requireTeacher(request);
  const teacherEmail = callerEmail(request);
  if (!teacherEmail) {
    throw new HttpsError("permission-denied", "A verified teacher email is required.");
  }
  if (authLib.isRootAdminEmail(teacherEmail)) return { teacherUid, teacherEmail };

  const assignment = assignmentSnap.data() || {};
  const audience = assignmentAudience(assignment);
  if (!audience.classIds.length) {
    throw new HttpsError(
      "failed-precondition",
      "Assign this lesson to a MathMaster class before publishing its Classroom resource package."
    );
  }

  const db = getFirestore();
  const snapshots = await Promise.all(audience.classIds.map((classId) => db.collection("classes").doc(classId).get()));
  const ownsEveryClass = snapshots.every((snapshot) => snapshot.exists
    && String(snapshot.data()?.teacherOfRecord || "").trim().toLowerCase() === teacherEmail);
  if (!ownsEveryClass) {
    throw new HttpsError(
      "permission-denied",
      "Only the teacher of record for every assigned class may publish this lesson's generated resources."
    );
  }
  return { teacherUid, teacherEmail };
}

const clampPercent = (value) =>
  Math.max(0, Math.min(100, Number.isFinite(Number(value)) ? Number(value) : 0));

function storedAlgebraStepPartialCredit(record) {
  const steps = Array.isArray(record?.stepGrades) ? record.stepGrades : [];
  const variantIndex = Number(record?.variantIndex || 0);
  const currentSteps = steps.filter((step) => Number(step?.variantIndex) === variantIndex);
  if (!currentSteps.length) return 0;

  // The same key as attemptPolicy's compactStepStateKey, rule for rule
  // (getQuestionCredit is synchronous, so the ESM module cannot be awaited
  // here; stepAlgebraStepCredit compares the two over every rule): spaces and
  // the TeX tie of 2~ x (before pass 3 Q-31) are spacing, any dash is a minus,
  // a unit coefficient before a group (push Q's 1\left() is dropped, and a
  // number bracketed after a letter (GR27's x(1), drawn x1 before) is x1.
  const stateKey = (value) => String(value || "")
    .replace(/[\s~]+/g, "")
    .replace(/[−–—]/g, "-")
    .replace(/(^|[=+\-(,{])1\\left\(/g, "$1\\left(")
    .replace(/(?<=[A-Za-z])\\left\((\d+(?:\.\d+)?)\\right\)/g, "$1");
  const expectedTotal = currentSteps.reduce(
    (maximum, step) => Math.max(maximum, Math.max(0, Number(step?.expectedTotalPoints) || 0)),
    0
  );
  const visitedStates = new Set();
  const firstBefore = stateKey(currentSteps[0]?.equationBefore);
  if (firstBefore) visitedStates.add(firstBefore);

  let earned = 0;
  let fallbackPossible = 0;
  currentSteps.forEach((step) => {
    const afterKey = stateKey(step?.equationAfter);
    const acceptedProductive = step?.accepted !== false && step?.productive !== false;
    const newState = !afterKey || !visitedStates.has(afterKey);
    if (acceptedProductive && newState) {
      earned += Math.max(0, Number(step?.earned) || 0);
      fallbackPossible += Math.max(0, Number(step?.possible) || 0);
    }
    if (afterKey) visitedStates.add(afterKey);
  });

  const possible = expectedTotal > 0 ? expectedTotal : fallbackPossible;
  return possible > 0 ? Math.min(90, clampPercent(Math.round((earned / possible) * 100))) : 0;
}

function teacherOverrideAppliesToRecord(record, authoritativeOverride = null) {
  if (
    !record
    || authoritativeOverride?.active !== true
    || !Number.isFinite(Number(authoritativeOverride.score))
  ) return false;

  if (
    authoritativeOverride.persistent === true
    && authoritativeOverride.source === "teacher-section-zero"
  ) return true;

  const recordAttempts = Number(record.totalAttempts ?? record.attemptCount ?? 0);
  const overrideAttempts = Number(authoritativeOverride.totalAttempts);
  if (!Number.isFinite(overrideAttempts) || overrideAttempts !== recordAttempts) return false;

  const recordVariant = Number(record.variantIndex ?? 0);
  const overrideVariant = Number(authoritativeOverride.variantIndex);
  if (!Number.isFinite(overrideVariant) || overrideVariant !== recordVariant) return false;

  const overrideSubmissionId = String(authoritativeOverride.submissionId || "");
  if (overrideSubmissionId) {
    return overrideSubmissionId === String(record.lastSubmissionId || "");
  }
  const overrideLastAttemptAt = String(authoritativeOverride.lastAttemptAt || "");
  return Boolean(overrideLastAttemptAt)
    && overrideLastAttemptAt === String(record.lastAttemptAt || record.academicOccurredAt || "");
}

const ASSIGNMENT_GRADE_OVERRIDE_KEY = "__assignment";

function activeAssignmentGradeOverride(authoritativeOverrides = {}) {
  const override = authoritativeOverrides?.[ASSIGNMENT_GRADE_OVERRIDE_KEY] || null;
  if (override?.active !== true || !Number.isFinite(Number(override.score))) return null;
  return {
    ...override,
    score: Math.max(0, Math.min(100, Number(override.score))),
  };
}

function getQuestionCredit(record, authoritativeOverride = null) {
  if (!record) return 0;
  // IMPORTANT: never trust record.gradeOverride here. gradesByAssignment is
  // client-writable for legacy workflows. Only the separately rule-protected
  // teacherGradeOverridesByAssignment projection may affect an authoritative
  // server grade, and that override is valid only for the exact attempt it was
  // issued against.
  if (teacherOverrideAppliesToRecord(record, authoritativeOverride)) {
    return clampPercent(authoritativeOverride.score) / 100;
  }
  if (record.status === "correct") return 1;
  const stored = clampPercent(record.bestPartialCredit ?? record.partialCredit ?? 0);
  // `stepCredit` is what the steps earned, stored on a record's summary when
  // its detail (stepGrades among it) was split off (gradeEntryStorage.mjs):
  // a summary read on its own grades exactly as the full record.
  const derived = Math.max(storedAlgebraStepPartialCredit(record), clampPercent(record.stepCredit ?? 0));
  return Math.max(stored, derived) / 100;
}

function isQuestionTerminal(record) {
  const status = record?.status;
  return status === "correct" || status === "expired";
}

function questionWasAttempted(record) {
  if (!record || typeof record !== "object") return false;
  if (Number(record.totalAttempts || record.attemptCount || 0) > 0) return true;
  if (isQuestionTerminal(record)) return true;
  return clampPercent(record.bestPartialCredit ?? record.partialCredit ?? 0) > 0;
}

function assignmentGradeProgress(
  assignmentTracker,
  questionIndices,
  questions = [],
  authoritativeOverrides = {},
) {
  const indices = Array.isArray(questionIndices) ? questionIndices : [];
  const attempted = indices.filter((index) => questionWasAttempted(assignmentTracker?.[index])).length;
  const terminal = indices.filter((index) => isQuestionTerminal(assignmentTracker?.[index])).length;
  const weighted = weightedQuestionTotals({
    tracker: assignmentTracker,
    questions,
    indices,
    creditForRecord: (record, index) => getQuestionCredit(
      record,
      authoritativeOverrides?.[String(index)] ?? authoritativeOverrides?.[index] ?? null,
    ),
    attemptedForRecord: questionWasAttempted,
  });
  const minimumProgressQuestions = indices.length
    ? Math.max(1, Math.ceil(indices.length * 0.25))
    : 0;
  return {
    total: indices.length,
    attempted,
    terminal,
    grade: weighted.score ?? 0,
    creditOnAttempted: weighted.creditOnAttempted,
    complete: indices.length > 0 && terminal === indices.length,
    meaningfulProgress: attempted >= minimumProgressQuestions,
    minimumProgressQuestions,
  };
}

// ---------------------------------------------------------------------------
// Class Points: a classroom participation reward currency, scoped to
// studentId + classId. See functions/shared/classPoints.mjs for the domain
// model. Both callables below are the ONLY writers of the ledger, the account
// projection, and the public class announcement -- a client Firestore write
// can never touch any of the three (see firestore.rules).
//
// AUTHORIZATION ALWAYS RUNS BEFORE ANY DATA-RETURNING BRANCH, including an
// idempotent replay. Both callables use the Admin SDK, so firestore.rules
// does not protect their response -- the only thing standing between "a
// caller who is not this student's teacher" and a transaction/account payload
// is `authorizeClassPointsActor`, checked here before every `return`.
// ---------------------------------------------------------------------------

let classPointsModule = null;
async function classPoints() {
  if (!classPointsModule) classPointsModule = await import("./shared/classPoints.mjs");
  return classPointsModule;
}

const CLASS_POINT_ACCOUNTS_COLLECTION = "classPointAccounts";
const CLASS_POINT_TRANSACTIONS_COLLECTION = "classPointTransactions";
const CLASS_POINT_IDEMPOTENCY_COLLECTION = "classPointIdempotencyKeys";
const CLASS_POINT_ANNOUNCEMENTS_COLLECTION = "classPointAnnouncements";
const CLASS_POINT_REWARD_REDEMPTIONS_COLLECTION = "classPointRewardRedemptions";

let classPointRewardsModule = null;
async function classPointRewards() {
  if (!classPointRewardsModule) classPointRewardsModule = await import("./shared/classPointRewards.mjs");
  return classPointRewardsModule;
}

// --- Authentication ---------------------------------------------------------
//
// Two populations sign in to MathMaster and they need different doors.
//
//   Teachers  authenticate with Google (the same account the Classroom
//             integration already uses) or with an email/password account
//             created in the Firebase console. Either way, authorization comes
//             from `teacherDirectory`, never from the client.
//   Students  authenticate with a school Google account when they have one, or
//             with their student ID plus a PIN exchanged here for a Firebase
//             custom token. A student with neither claims their account once
//             using the join code for their class period.
//
// Every function below is the only writer of the `role` and `studentId` custom
// claims that `firestore.rules` reads. Clients can ask for a role; they can
// never assert one.

function translateAuthError(error) {
  if (error instanceof authLib.AuthInputError) {
    return new HttpsError(error.code, error.message, error.details);
  }
  return error;
}

function callerEmail(request) {
  const token = request.auth?.token || {};
  // An unverified email is an identity anyone can claim by signing up with it,
  // so it is never enough to match a teacher or student directory entry.
  if (!token.email || token.email_verified === false) return null;
  try {
    return authLib.normalizeEmail(token.email);
  } catch {
    return null;
  }
}

async function requireTeacher(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in before making this change.");
  }
  if (request.auth.token?.role !== "teacher") {
    throw new HttpsError("permission-denied", "Only a teacher can make this change.");
  }
  return request.auth.uid;
}

// The role predicates are pure and shared so the negative cases — a teacher
// carrying forged admin claims, a student asserting a role — are tested
// directly rather than inferred. See tests/platform/rolePolicy.test.mjs.
let rolePolicyModule = null;
async function rolePolicy() {
  if (!rolePolicyModule) rolePolicyModule = await import("./shared/rolePolicy.mjs");
  return rolePolicyModule;
}

async function requireRootAdmin(request) {
  const email = callerEmail(request);
  // `callerEmail` reads the verified token; the predicate re-reads it from the
  // same place rather than trusting a value threaded through, so there is one
  // decision point and one definition of who the administrator is.
  const auth = request.auth ? { ...request.auth, token: { ...(request.auth.token || {}), email } } : null;
  const decision = (await rolePolicy()).authorizeRootAdmin(auth, {
    rootAdminEmail: authLib.ROOT_ADMIN_EMAIL,
  });
  if (!decision.allowed) {
    if (decision.reason === "unauthenticated") {
      throw new HttpsError("unauthenticated", "Sign in before making this administrative change.");
    }
    // Name both addresses. The gate itself is unchanged — this is refused for
    // exactly the same reasons it always was — but "restricted to the root
    // administrator" gave someone on a second account no way to tell whether
    // they were on the wrong account or holding a stale token, so the honest
    // remedy (sign in as the administrator) was indistinguishable from the
    // useless one (sign out and back in on the same account, forever).
    const signedInAs = email ? `You are signed in as ${email}.` : "You are signed in without a verified email address.";
    throw new HttpsError(
      "permission-denied",
      `This action is restricted to the MathMaster root administrator (${authLib.ROOT_ADMIN_EMAIL}). ${signedInAs}`,
    );
  }
  return { uid: request.auth.uid, email };
}

function requireStudent(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in before starting My Math Path.");
  }
  const token = request.auth.token || {};
  if (token.role !== "student" || !token.studentId) {
    throw new HttpsError("permission-denied", "My Math Path practice is available to signed-in students.");
  }
  return { uid: request.auth.uid, studentId: String(token.studentId) };
}

async function assignClaims(uid, claims) {
  await getAuth().setCustomUserClaims(uid, claims);
}

// The class model is ESM and shared with the browser, so there is exactly one
// definition of what a class is. Loaded lazily, like the path tool contracts.
let classModelModule = null;
async function classModel() {
  if (!classModelModule) classModelModule = await import("./shared/classModel.mjs");
  return classModelModule;
}

// What a student's NAME is — and that an id never is one. Shared with the
// browser (src/platform/studentName.js) so the roster projection, every server
// name copy and every screen resolve a name the same way.
let studentIdentityModule = null;
async function studentIdentity() {
  if (!studentIdentityModule) studentIdentityModule = await import("./shared/studentIdentity.mjs");
  return studentIdentityModule;
}

/**
 * The identity-bearing fields of one grades document, plus its id — what the
 * shared resolver needs and nothing from the attempt history. The identifiers
 * travel with it so a name that merely repeats one of them is refused.
 */
function studentIdentityRecord(identity, studentId, data = {}) {
  const record = { studentId: String(studentId || "") };
  [...identity.STUDENT_IDENTITY_FIELDS, "profile", "sisStudentId", "googleUserId"].forEach((field) => {
    if (data?.[field] !== undefined) record[field] = data[field];
  });
  return record;
}

let authorizationModule = null;
async function authorizationContext() {
  if (!authorizationModule) authorizationModule = await import("./shared/authorizationContext.mjs");
  return authorizationModule;
}

const CLASS_COLLECTION = "classes";

/** Every class, as plain objects. Small collection, read whole. */
async function loadClasses(db) {
  const snapshot = await db.collection(CLASS_COLLECTION).get();
  return snapshot.docs.map((classDoc) => ({ classId: classDoc.id, ...classDoc.data() }));
}

async function writeAdminAudit(db, actor, action, target, details = {}) {
  await db.collection(authLib.ADMIN_AUDIT_COLLECTION).add({
    actorUid: actor.uid,
    actorEmail: actor.email,
    action,
    target,
    details,
    createdAt: FieldValue.serverTimestamp(),
  });
}

async function resolveJoinCodeMembership(db, joinCode = {}) {
  const classId = String(joinCode.classId || "").trim();
  const legacyPeriod = String(joinCode.classPeriod || "").trim() || "Unassigned";
  if (!classId) return { classId: null, classPeriod: legacyPeriod, assignedTeacherEmail: null, legacy: true };

  const classSnapshot = await db.collection("classes").doc(classId).get();
  if (!classSnapshot.exists || classSnapshot.data()?.status === "archived") {
    throw new HttpsError("permission-denied", "That class code is no longer active. Ask your teacher for the current one.");
  }
  const classRecord = { classId, ...classSnapshot.data() };
  const model = await classModel();
  return { ...model.membershipFieldsFor(classRecord), legacy: false };
}

function joinCodeMatchesRoster(existing = {}, membership = {}) {
  const existingClassId = String(existing.classId || "").trim();
  if (existingClassId) {
    // A period-only code cannot safely claim a modern class because another
    // class may share the same bell period. Rotate to a class-ID code instead.
    return Boolean(membership.classId && existingClassId === String(membership.classId));
  }
  const period = String(existing.classPeriod || "").trim();
  if (!period || period === "Unassigned") return true;
  return period === String(membership.classPeriod || "");
}

async function lookupJoinCode(db, code) {
  const snapshot = await db.collection(authLib.JOIN_CODE_COLLECTION).doc(code).get();
  if (!snapshot.exists) return null;
  const data = snapshot.data() || {};
  if (data.active === false) return null;
  if (data.expiresAt && Number(data.expiresAt) < Date.now()) return null;
  return data;
}

function pathDiagnosticId(operation = "path") {
  const safe = String(operation || "path").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "path";
  return `${safe}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
}

async function safeBuildTemplateIssuePlan(question, { operation = "path-validation" } = {}) {
  try {
    return await mathPath.buildTemplateIssuePlan(question);
  } catch (error) {
    const diagnosticId = pathDiagnosticId(operation);
    logger.error("Path-bank template validator threw instead of returning a plan", {
      operation, diagnosticId,
      questionId: question?.id || null,
      familyId: question?.familyId || null,
      questionType: question?.questionType || null,
      pathToolId: question?.pathToolId || question?.toolId || question?.tool?.id || null,
      message: error?.message || String(error),
      stack: error?.stack || null,
    });
    return {
      issuable: false,
      reason: "validator_exception",
      detail: error?.message || "The production issuer threw while validating this document.",
      diagnosticId,
      samples: 0,
    };
  }
}

const BUILT_IN_COURSE_PATH_SEED_FILES = Object.freeze([
  "algebra1_pathQuestionBank_seed.json",
  "algebra2_pathQuestionBank_seed.json",
  // Reachable middle-school prerequisite packages.
  "grade6_pathQuestionBank_seed.json",
  "grade7_pathQuestionBank_seed.json",
  "grade8_pathQuestionBank_seed.json",
]);
const ASVAB_PATH_SEED_FILE = "asvab_pathQuestionBank_seed.json";
const BUILT_IN_PATH_SEED_FILES = Object.freeze([
  ...BUILT_IN_COURSE_PATH_SEED_FILES,
  "digitalSAT_pathQuestionBank_seed.json",
  "act_pathQuestionBank_seed.json",
  "tsia2_pathQuestionBank_seed.json",
  ASVAB_PATH_SEED_FILE,
]);

let builtInStarterPathSeedCache = null;
function loadBuiltInStarterPathSeed() {
  if (builtInStarterPathSeedCache) return builtInStarterPathSeedCache;
  const seedDirectory = path.join(__dirname, "seeds", "pathQuestionBank");
  const items = BUILT_IN_PATH_SEED_FILES.flatMap((fileName) => {
    const filePath = path.join(seedDirectory, fileName);
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return Array.isArray(parsed) ? parsed : (parsed.documents || parsed.items || parsed.questions || []);
  });
  if (!items.length) throw new Error("The built-in Path starter bank is empty.");
  const ids = new Set(items.map((item) => String(item?.id || "").trim()));
  if (ids.size !== items.length || ids.has("")) throw new Error("The built-in Path starter bank contains missing or duplicate IDs.");
  builtInStarterPathSeedCache = items;
  return builtInStarterPathSeedCache;
}

let builtInCoursePathSeedCache = null;
function loadBuiltInCoursePathSeed() {
  if (builtInCoursePathSeedCache) return builtInCoursePathSeedCache;
  const seedDirectory = path.join(__dirname, "seeds", "pathQuestionBank");
  const items = BUILT_IN_COURSE_PATH_SEED_FILES.flatMap((fileName) => {
    const parsed = JSON.parse(fs.readFileSync(path.join(seedDirectory, fileName), "utf8"));
    return Array.isArray(parsed) ? parsed : (parsed.documents || parsed.items || parsed.questions || []);
  });
  if (!items.length) throw new Error("The built-in course Path bank is empty.");
  const ids = new Set(items.map((item) => String(item?.id || "").trim()));
  if (ids.size !== items.length || ids.has("")) throw new Error("The built-in course Path bank contains missing or duplicate IDs.");
  builtInCoursePathSeedCache = items;
  return builtInCoursePathSeedCache;
}

// ---------------------------------------------------------------------------
// --- Live Challenge ----------------------------------------------------------
//
// Live Challenge is a competitive presentation layer over the secure Path
// bank, not a second question/answer system. The browser receives the same
// sanitized question payload My Math Path uses and every verdict comes from the
// same server grader. A student cannot submit a client-computed score, cannot
// read the private round list, and cannot write the room document directly.

let liveChallengeModule = null;
async function liveChallengeRules() {
  if (!liveChallengeModule) liveChallengeModule = await import("./shared/liveChallenge.mjs");
  return liveChallengeModule;
}

let liveChallengeReportModule = null;
async function liveChallengeReportRules() {
  if (!liveChallengeReportModule) liveChallengeReportModule = await import("./shared/liveChallengeReport.mjs");
  return liveChallengeReportModule;
}

// The roster-row mark permanent deletion writes first (SI07).
let studentDeletionMarkModule = null;
async function studentDeletionMark() {
  if (!studentDeletionMarkModule) studentDeletionMarkModule = await import("./shared/studentDeletionMark.mjs");
  return studentDeletionMarkModule;
}

// THE ENGINE CONTRACTS every Live Challenge callable runs through. They are
// pure modules shared with the browser; see docs/architecture/
// live-challenge-engine.md for what each owns.
let liveChallengeEngineModules = null;
async function liveChallengeEngine() {
  if (!liveChallengeEngineModules) {
    const [lifecycle, timer, modes, scoring, responses, results, rewardRules, experience, standings, solutionReveal, accommodations, difficulty, privacy, recognitions, playerSummary, lineReveal, serverSweep, lineEvidence] = await Promise.all([
      import("./shared/liveChallengeLifecycle.mjs"),
      import("./shared/liveChallengeTimer.mjs"),
      import("./shared/liveChallengeModes.mjs"),
      import("./shared/liveChallengeScoring.mjs"),
      import("./shared/liveChallengeResponses.mjs"),
      import("./shared/liveChallengeResults.mjs"),
      import("./shared/liveChallengeRewardRules.mjs"),
      import("./shared/liveChallengeExperience.mjs"),
      import("./shared/liveChallengeStandingsProjection.mjs"),
      import("./shared/liveChallengeSolutionReveal.mjs"),
      import("./shared/liveChallengeAccommodations.mjs"),
      import("./shared/liveChallengeDifficulty.mjs"),
      import("./shared/liveChallengePrivacy.mjs"),
      import("./shared/liveChallengeRecognitions.mjs"),
      import("./shared/liveChallengePlayerSummary.mjs"),
      // A Graph the Line round the class graphed together is published by the
      // same reveal as a shared question, with the class's own mistake added.
      import("./shared/lineGraphReveal.mjs"),
      import("./shared/liveChallengeServerSweep.mjs"),
      // A Graph the Line game's first tries, counted onto each standing at the
      // finish, and its own mastery evidence (behind the owner's switch).
      import("./shared/lineGraphEvidence.mjs"),
    ]);
    liveChallengeEngineModules = {
      lifecycle, timer, modes, scoring, responses, results, rewardRules, experience, standings, solutionReveal, accommodations, difficulty, privacy, recognitions, playerSummary, lineReveal, serverSweep, lineEvidence,
    };
  }
  return liveChallengeEngineModules;
}
const LIVE_CHALLENGE_ROOMS = "liveChallengeRooms";
const LIVE_CHALLENGE_REPORTS = "liveChallengeReports";
const LIVE_CHALLENGE_PRIVATE = "liveChallengePrivate";
const LIVE_CHALLENGE_INVITES = "liveChallengeInvites";
const LIVE_CHALLENGE_TEACHER_ACTIVE = "liveChallengeTeacherActive";
// The durable final result of a finished or cancelled match. Server-only: it
// names students. Reports, Warm-Up credit, evidence and rewards are all
// derived from it, so each can be re-run safely after a crash.
const LIVE_CHALLENGE_MATCH_RESULTS = "liveChallengeMatchResults";

async function requireClassTeacher(request, classId) {
  await requireTeacher(request);
  const db = getFirestore();
  const snapshot = await db.collection(CLASS_COLLECTION).doc(String(classId)).get();
  if (!snapshot.exists) throw new HttpsError("not-found", "That class no longer exists.");
  const record = { classId: String(classId), ...(snapshot.data() || {}) };
  const email = callerEmail(request);
  const teacherOfRecord = String(record.teacherOfRecord || "").trim().toLowerCase();
  if (!authLib.isRootAdminEmail(email) && (!email || teacherOfRecord !== String(email).toLowerCase())) {
    throw new HttpsError("permission-denied", "Only the teacher of record for this class can change this.");
  }
  return record;
}

/*
 * A COURSE TEST'S ANSWERS AND WORKED SOLUTIONS WAIT FOR THE CLASS.
 *
 * Scores and the question review (each question with the student's own
 * answer, right or wrong) release as they always have. The correct answers
 * and worked solutions the review now adds are held while anyone who can
 * still sit that stage could be handed them: every active student in every
 * class the assignment is assigned to (one with no record yet, in a period
 * whose sessions are not open, included) and anyone holding a record. They
 * open once none of them is left, or when the teacher releases them
 * (releaseTestCycleAnswers) — and that release covers only the students, at
 * the attempts, its confirm named. One it did not name (a student who joined
 * later, or one whose attempt a teacher reset since) holds them again until
 * they finish.
 */
/*
 * THE TEACHER'S TEST CYCLE CALLABLES NEED MORE THAN THE DEFAULT INSTANCE.
 *
 * On the default 256 MiB and 60 seconds, this codebase alone takes about 156
 * MiB once loaded. In production on 7 and 8 October 2026 the panel's loader
 * (listTeacherTestCycleRecords) was killed for exceeding its memory on 29 of
 * 36 teacher calls, and teacherTestCycleAction and assignTestCycleSessions ran
 * into the 60-second limit — which a browser reports as the server not
 * answering. Three settings, by what each callable does:
 *
 *   panel    reads a whole class: the most headroom.
 *   action   one student, or one bounded batch of a bulk operation.
 *   sweep    walks a class inside one request (opening sessions the old way,
 *            releasing results): the longest limit, so a large class finishes
 *            rather than being cut off half-way.
 */
const TEST_CYCLE_PANEL_OPTIONS = Object.freeze({ memory: "1GiB", timeoutSeconds: 120 });

const TEST_CYCLE_ANSWER_RELEASES = "testCycleAnswerReleases";

// --- Test Cycle: one assignment, four stages, one recorded grade ------------
//
// A Test Cycle is ONE teacher-authored package that a student meets as ONE
// card: Review -> secure Test -> Corrections (if needed) -> secure Retest.
//
// WHAT IS DELIBERATELY NOT HERE.
//
// There is no second testing engine. The Test and the Retest are ordinary
// `examSessions` documents with `examType: "courseTest"`, and they run through
// the same `startSecureExamSession`, `issueSecureExamQuestion`,
// `saveSecureExamDraft`, `submitSecureExamResponse`,
// `recordSecureExamIntegrityEvent`, `finalizeSecureExam` and
// `proctorExamAction` as the SAT, ACT, TSIA2 and ASVAB simulations. The only
// course-test-specific thing in the secure path is WHICH item comes next, and
// that was decided before the student sat down.
//
// There is also no grade math here. `recordedGrade = max(originalTestGrade,
// min(rawRetestGrade, cap))` lives in functions/shared/testCycleGrade.mjs and
// is the same function the browser reads.

const TEST_CYCLE_RECORDS = "testCycleRecords";
const TEST_CYCLE_CORRECTION_PLANS = "testCycleCorrectionPlans";
const TEST_CYCLE_RETEST_PLANS = "testCycleRetestPlans";
const TEST_CYCLE_OPERATIONS = "testCycleOperations";

/** An id Firestore will accept as one document id: not empty, not a path, not reserved. */
function validDocumentId(value) {
  const id = String(value || "").trim();
  return Boolean(id) && id.length <= 180 && !id.includes("/") && id !== "." && id !== ".." && !/^__.*__$/.test(id);
}

/**
 * The assignment a TEACHER callable is about — asked for in the right order.
 *
 * These callables used to read the assignment first and ask who was calling
 * second. A request with no assignmentId then crashed on the read (the browser
 * was shown a bare server error), and an unauthenticated caller could learn
 * which assignment ids exist from "not found" versus "not allowed". Now: the
 * caller must be a signed-in teacher before anything is read, and an id that
 * cannot be a document id is refused in words.
 */
async function assignmentForTeacherCall(request, db) {
  await requireTeacher(request);
  const id = String(request.data?.assignmentId || "").trim();
  if (!validDocumentId(id)) throw new HttpsError("invalid-argument", "A valid assignmentId is required.");
  const snapshot = await db.collection("assignments").doc(id).get();
  if (!snapshot.exists) throw new HttpsError("not-found", "That assignment was not found.");
  return snapshot;
}

async function resolveSecureTestBlueprint(db, assignment, shared) {
  const embedded = shared.blueprint.normalizeTestBlueprint(assignment?.testBlueprint);
  if (embedded.targets.length) {
    return { blueprint: embedded, blueprintSource: assignment.testBlueprint, secureReferencePresent: false, secureReferenceResolved: false, secureManifestId: null };
  }
  const secureManifestId = String(
    assignment?.secureTestReference?.manifestId
      || assignment?.secureTestReference?.blueprintId
      || assignment?.secureTestReference?.id
      || "",
  ).trim();
  if (!secureManifestId) {
    return { blueprint: embedded, blueprintSource: null, secureReferencePresent: false, secureReferenceResolved: false, secureManifestId: null };
  }
  // A manifest id is one document id, or it resolves to nothing.
  if (!validDocumentId(secureManifestId)) {
    return { blueprint: embedded, blueprintSource: null, secureReferencePresent: true, secureReferenceResolved: false, secureManifestId: null };
  }
  const manifestSnapshot = await db.collection("secureTestManifests").doc(secureManifestId).get();
  const blueprintSource = manifestSnapshot.exists
    ? manifestSnapshot.data()?.testBlueprint || manifestSnapshot.data()?.blueprint
    : null;
  const blueprint = shared.blueprint.normalizeTestBlueprint(blueprintSource);
  return {
    blueprint,
    blueprintSource,
    secureReferencePresent: true,
    secureReferenceResolved: blueprint.targets.length > 0,
    secureManifestId,
  };
}

async function loadTestCycleAssignment(db, assignmentId, { allowInvalid = false } = {}) {
  const id = String(assignmentId || "").trim();
  if (!validDocumentId(id)) throw new HttpsError("invalid-argument", "A valid assignmentId is required.");
  const snapshot = await db.collection("assignments").doc(id).get();
  if (!snapshot.exists) throw new HttpsError("not-found", "That assignment was not found.");
  const assignment = snapshot.data() || {};
  const shared = await testCycleLib.shared();
  if (!shared.policy.declaresTestCycle(assignment)) {
    throw new HttpsError("failed-precondition", "That assignment is not a MathMaster Test Cycle.");
  }
  const policy = shared.policy.normalizeTestCyclePolicy(assignment.assessmentPolicy);
  if (!policy) {
    console.error("test_cycle_contract_invalid", { assignmentId: id, reason: "TEST_CYCLE_POLICY_MISSING" });
    if (!allowInvalid) throw new HttpsError("failed-precondition", "This assessment is not available yet. Your teacher has been notified.", {
      diagnosticCode: "TEST_CYCLE_POLICY_MISSING",
    });
  }

  // A secure reference contains only an opaque manifest id in the assignment
  // students can read. The actual blueprint remains in a server-only
  // collection and is resolved here, never serialized by this callable.
  const resolution = await resolveSecureTestBlueprint(db, assignment, shared);
  const { blueprint, blueprintSource, secureManifestId } = resolution;
  if (!blueprint.targets.length) {
    console.error("test_cycle_contract_invalid", {
      assignmentId: id,
      reason: "TEST_CYCLE_TEST_PHASE_MISSING",
      secureManifestId: secureManifestId || null,
    });
    if (!allowInvalid) throw new HttpsError("failed-precondition", "This assessment is not available yet. Your teacher has been notified.", {
      diagnosticCode: "TEST_CYCLE_TEST_PHASE_MISSING",
    });
  }
  const resolvedAssignment = blueprintSource === assignment.testBlueprint
    ? assignment
    : { ...assignment, testBlueprint: blueprintSource };
  return {
    assignmentId: id,
    snapshot,
    assignment: resolvedAssignment,
    policy: policy || shared.policy.defaultTestCyclePolicy(),
    blueprint,
    secureReferenceResolved: resolution.secureReferenceResolved,
    shared,
  };
}

/**
 * The approved, validated families a blueprint is allowed to draw on.
 *
 * The Firestore Path bank is authoritative; the bundled starter/course seeds
 * fill in anything a fresh install has not imported yet, which is the same
 * fallback the secure simulations already use. A family that is in neither is
 * simply absent, and preflight is what refuses to publish a blueprint whose
 * families are absent — issuance must never silently substitute something else.
 */
async function resolveBlueprintFamilies(db, familyIds) {
  const ids = [...new Set((Array.isArray(familyIds) ? familyIds : []).map((value) => String(value || "").trim()).filter(Boolean))];
  if (!ids.length) return [];
  const found = new Map();
  for (let index = 0; index < ids.length; index += 100) {
    const refs = ids.slice(index, index + 100).map((id) => db.collection("pathQuestionBank").doc(id));
    // eslint-disable-next-line no-await-in-loop
    const snapshots = await db.getAll(...refs);
    snapshots.forEach((snapshot) => {
      if (snapshot.exists) found.set(snapshot.id, { id: snapshot.id, ...snapshot.data() });
    });
  }
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length) {
    const bundled = new Map();
    [...loadBuiltInStarterPathSeed(), ...loadBuiltInCoursePathSeed(),
      ...require("./seeds/secureAssessments/algebra1_district_dol2.json").documents,
    ].forEach((item) => {
      const id = String(item?.id || "").trim();
      if (id && !bundled.has(id)) bundled.set(id, item);
    });
    missing.forEach((id) => {
      if (bundled.has(id)) found.set(id, bundled.get(id));
    });
  }
  return ids.map((id) => found.get(id)).filter(Boolean);
}

/** Every family any target of this blueprint names. */
function blueprintFamilyIds(blueprint) {
  return [...new Set((blueprint?.targets || []).flatMap((target) => target.familyIds || []))];
}

/**
 * Can every declared family actually be issued and privately graded?
 *
 * Answered by generating from the template and running the real issue gate, not
 * by inspecting the record — the thing that reaches a student is an instance.
 */
async function testCycleFamilyIssuability(families) {
  const verdicts = {};
  const generation = await mathPath.pathGeneration();
  const { secureTools } = await secureItems.sharedModules();
  for (const family of families) {
    const id = String(family?.id || family?.familyId || "").trim();
    if (!id) continue;
    // eslint-disable-next-line no-await-in-loop
    const plan = await mathPath.buildTemplateIssuePlan(family, { samples: 4 });
    // "Can it be graded?" and "can it be TAKEN securely?" are two questions.
    // The second is answered from generated instances, because a generator
    // can change the tool between variants and the student gets an instance.
    const generative = generation.hasPathGenerator(family) || generation.hasPathVariants(family);
    // Every variant, not only the ones four random draws reach: issue time
    // picks the variant ranked best for the target's DOK and band, which the
    // random samples can miss (35 of 213 Algebra I variant cells did).
    const perVariant = generation.hasPathVariants(family)
      ? generation.effectivePathVariants(family).map((variant, index) => generation.generatePathInstance(variant.template, `certify-variant-${index}`).question)
      : [];
    const instances = generative
      ? [...generation.samplePathInstances(family, 4).map((entry) => entry.question), ...perVariant].filter(Boolean)
      : [family];
    verdicts[id] = {
      issuable: plan.issuable === true,
      reason: plan.reason || null,
      secure: secureTools.certifySecureFamily(family, { instances }),
    };
  }
  return verdicts;
}

async function runTestCyclePreflight(db, { assignment, policy, blueprint, shared, secureReferenceResolved = false }) {
  const families = await resolveBlueprintFamilies(db, blueprintFamilyIds(blueprint));
  const familyIssuability = await testCycleFamilyIssuability(families);
  return {
    families,
    result: shared.preflight.preflightTestCycle({ assignment, policy, blueprint, families, familyIssuability, secureReferenceResolved }),
  };
}

// Archive the LAST known state of a live presence session. Presence itself is
// ephemeral; this durable record keeps only compact objective counts and the
// teacher authorization context.
const STUDENT_SESSION_SUMMARY_COLLECTION = "studentSessionSummaries";

/* =========================================================================
 * INCIDENT RECOVERY AND THE TEACHER'S VIEW OF IT.
 *
 * On September 14 students worked through Warm-Up and Classwork, saw local
 * feedback, moved between questions — and their teacher's gradebook showed the
 * questions unattempted. The delivery defects that caused it are fixed
 * elsewhere in this change. What is left is the work already captured before
 * the fix shipped, sitting in four places that no single query can see:
 *
 *   A. the durable outbox in each Chromebook's IndexedDB — recoverable only by
 *      that device, which now drains grade-bearing work first and reports what
 *      it is still holding;
 *   B. `studentResponseCheckpoints` — server-held drafts the deadline finalizer
 *      can still turn into canonical attempts under the SAME authority it
 *      always used;
 *   C. `studentWorkspaceDrafts` — workspaces, not grades, recoverable only
 *      where five separate proofs hold, and reviewable by a teacher otherwise;
 *   D. presence session summaries — never evidence of correctness, but real
 *      evidence that a student was working, which is what makes a missing
 *      canonical record visible as a discrepancy rather than as an absence.
 *
 * Nothing here deletes, clears or invalidates any of it.
 * ========================================================================= */

const DEVICE_QUEUE_REPORT_COLLECTION = "studentDevicePersistenceReports";
const WORKSPACE_DRAFT_COLLECTION = "studentWorkspaceDrafts";

/*
 * A TECHNICAL INCIDENT A TEACHER OF RECORD HAS CLOSED.
 *
 * SERVER-ONLY, and deliberately not a field on `grades/{studentId}`: a student
 * can write parts of their own grade document, and a flag that releases a final
 * passback must never sit anywhere a student can reach. Firestore rules refuse
 * every client write to this collection; the audited callable below, on the
 * Admin SDK, is the only way one is created.
 *
 * It records an ACKNOWLEDGEMENT, never a result. No grade, no attempt, no
 * correctness, no zero.
 */
const PERSISTENCE_RESOLUTION_COLLECTION = "studentPersistenceResolutions";
const persistenceResolutionDocumentId = ({ studentId, assignmentId } = {}) => (
  [studentId, assignmentId].map((part) => encodeURIComponent(String(part ?? ""))).join("__").slice(0, 1400)
);

/*
 * A STUDENT'S DEVICE REPORTS: BOUNDED WHEN WRITTEN, BOUNDED WHEN READ.
 *
 * `reportStudentDeviceQueue` keeps a student's rows near
 * MAX_DEVICE_REPORTS_PER_STUDENT: past it, each report evicts the oldest rows
 * that are stale or drained. A fresh row still holding work is never evicted.
 *
 * The reader reads one bounded page, DEVICE_REPORT_READ_LIMIT rows, and never
 * throws on volume. A read that did not reach the end says so (`complete:
 * false`), and `readPersistencePending` then holds the final passback rather
 * than reading a partial set as the whole.
 *
 * A row last reported more than DEVICE_REPORT_STALE_MS ago is not evidence of
 * work still on a device: `readPersistencePending` ignores it when deciding
 * whether a final passback is held. The teacher's recovery report still
 * lists it.
 */
const MAX_DEVICE_REPORTS_PER_STUDENT = 20;
const DEVICE_REPORT_READ_LIMIT = 100;
const DEVICE_REPORT_STALE_MS = 14 * 24 * 60 * 60 * 1000;

/** Up to DEVICE_REPORT_READ_LIMIT of the student's rows, and whether that is all of them. */
async function readDeviceReportsForStudent({ db, studentId }) {
  const snapshot = await db.collection(DEVICE_QUEUE_REPORT_COLLECTION)
    .where("studentId", "==", studentId)
    .orderBy(FieldPath.documentId())
    .limit(DEVICE_REPORT_READ_LIMIT + 1)
    .get();
  return {
    documents: snapshot.docs.slice(0, DEVICE_REPORT_READ_LIMIT),
    complete: snapshot.size <= DEVICE_REPORT_READ_LIMIT,
  };
}

async function readAllDeviceReportsForStudent({ db, studentId }) {
  return (await readDeviceReportsForStudent({ db, studentId })).documents;
}

/** When a device report was last written, in ms (0 when unknown). */
function deviceReportReportedAtMs(data = {}) {
  const value = data?.reportedAt;
  if (typeof value?.toMillis === "function") return value.toMillis();
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

/**
 * Reports written inside the stale window: the ones that may hold a passback.
 * A row with no readable time is kept, so an unreadable row still holds.
 */
function freshDeviceReports(documents = [], nowMs = Date.now()) {
  return documents.filter((snapshot) => {
    const reportedAtMs = deviceReportReportedAtMs(snapshot.data());
    return !reportedAtMs || nowMs - reportedAtMs <= DEVICE_REPORT_STALE_MS;
  });
}

let persistencePendingModule = null;
async function persistencePendingLib() {
  if (!persistencePendingModule) persistencePendingModule = await import("./shared/persistencePending.mjs");
  return persistencePendingModule;
}

/*
 * EVERY SIGNAL THE POLICY ACCEPTS, READ FROM THE PLACE THAT OWNS IT.
 *
 * `assessPersistencePending` advertises four sources. This function is the
 * only production reader of it, so any source it does not actually inspect is
 * an advertised safety net with nothing behind it. It inspects all four:
 *
 *   device-queue         what a Chromebook says it is still holding.
 *   response-checkpoint  server-held drafts of a response, not yet finalized.
 *   workspace-draft      a server-held draft our own recovery rules say a
 *                        teacher can still commit into a canonical attempt.
 *   session-summary-gap  the student's own session says they worked more
 *                        questions than the gradebook can account for.
 *
 * The workspace draft read is a single document get on a deterministic id, and
 * the schedule/class reads it needs happen only when a draft actually exists,
 * so the ordinary green path costs nothing extra.
 */
async function readPersistencePending({
  db,
  studentId,
  assignmentId,
  canonicalAttempted,
  secureTestCycle = false,
  assignment = null,
  gradeData = null,
}) {
  const { workspaceDraftDocumentId } = await import("./shared/workspaceDraftSchema.mjs");
  const [deviceDocuments, checkpointSnapshot, sessionSnapshot, draftSnapshot, resolutionSnapshot] = await Promise.all([
    readDeviceReportsForStudent({ db, studentId }),
    db.collection(CHECKPOINT_COLLECTION).where("studentId", "==", studentId)
      .where("assignmentId", "==", assignmentId).where("status", "==", CHECKPOINT_STATUS_ACTIVE).limit(200).get(),
    db.collection(STUDENT_SESSION_SUMMARY_COLLECTION).where("studentId", "==", studentId)
      .where("assignmentId", "==", assignmentId).limit(50).get(),
    db.collection(WORKSPACE_DRAFT_COLLECTION)
      .doc(workspaceDraftDocumentId({ studentId, assignmentId })).get(),
    db.collection(PERSISTENCE_RESOLUTION_COLLECTION)
      .doc(persistenceResolutionDocumentId({ studentId, assignmentId })).get(),
  ]);
  const assignmentKey = encodeURIComponent(assignmentId);
  const queuedFromReports = freshDeviceReports(deviceDocuments.documents).reduce(
    (total, snapshot) => total + (Number(snapshot.data()?.queuedGradeBearingByAssignment?.[assignmentKey]) || 0), 0,
  );
  // A read that did not reach the end of the student's rows holds the passback.
  const queuedGradeBearing = deviceDocuments.complete ? queuedFromReports : Math.max(1, queuedFromReports);
  const worked = sessionSnapshot.docs.reduce(
    (maximum, snapshot) => Math.max(maximum, Number(snapshot.data()?.answered) || 0), 0,
  );
  const recoverableDrafts = draftSnapshot.exists
    ? await countRecoverableWorkspaceDrafts({
      db,
      studentId,
      draft: draftSnapshot.data() || {},
      draftSavedAtMs: millisOf(draftSnapshot.data()?.updatedAt),
      assignment,
      assignmentId,
      gradeData,
    })
    : 0;
  const { assessPersistencePending } = await persistencePendingLib();
  return assessPersistencePending({
    queuedGradeBearing,
    activeCheckpoints: checkpointSnapshot.size,
    recoverableDrafts,
    worked,
    canonicalAttempted,
    secureTestCycle,
    sessionGapResolution: resolutionSnapshot.exists ? resolutionSnapshot.data() : null,
  });
}

/**
 * How many entries of this student's server-held workspace draft our recovery
 * rules would still accept as a canonical attempt.
 *
 * This is the SAME assessment the teacher recovery report and the recovery
 * dry run make — deliberately, so "the recovery panel says one response is
 * recoverable" and "final passback is held" can never disagree. Anything the
 * rules refuse (saved after the cutoff, no provable cutoff, superseded by a
 * newer canonical attempt, not a response at all) counts zero here: it is not
 * recoverable, so it is not a reason to withhold a grade forever.
 */
async function countRecoverableWorkspaceDrafts({
  db, studentId = null, draft, draftSavedAtMs, assignment, assignmentId, gradeData,
}) {
  if (!assignment) return 0;
  const recovery = await workspaceDraftRecovery();
  const { resolveAuthoritativeClose } = await import("./shared/sectionDeadline.mjs");
  const classId = String(gradeData?.classId || "").trim() || null;
  const overrideRef = await studentOverrideRef(db, studentId, assignmentId);
  const [scheduleSnapshot, classSnapshot, overrideSnapshot] = await Promise.all([
    db.collection("settings").doc("classSchedule").get(),
    classId ? db.collection(CLASS_COLLECTION).doc(classId).get() : Promise.resolve(null),
    overrideRef ? overrideRef.get() : Promise.resolve(null),
  ]);
  const schedule = scheduleSnapshot.exists ? scheduleSnapshot.data() : null;
  const classPeriod = String(classSnapshot?.data()?.period || "") || null;
  // The student's own extension still counts toward when their draft was due.
  const privateOverride = privateOverrideFrom(overrideSnapshot);
  const questions = runtimeQuestionsFromAssignment(assignment) || [];
  const tracker = gradeData?.gradesByAssignment?.[assignmentId] || {};
  const assessment = recovery.assessWorkspaceDraftDocument({
    document: draft,
    documentSavedAtMs: draftSavedAtMs,
    resolveQuestion: (entry) => questions[Number(entry.questionIndex)] || null,
    resolveCanonicalRecord: (entry) => tracker?.[String(entry.questionIndex)] ?? tracker?.[entry.questionIndex] ?? null,
    resolveCloseAt: (entry) => resolveAuthoritativeClose({
      assignment,
      activityRole: questions[Number(entry.questionIndex)]?.activityRole || "classwork",
      schedule,
      classId,
      classPeriod,
      // Measured against the day the draft was SAVED, never today.
      nowValue: draftSavedAtMs || Date.now(),
      studentId,
      studentProfile: gradeData?.profile || null,
      privateOverride,
    }).closesAtMs,
  });
  return Number(assessment?.recoverable?.length) || 0;
}

let workspaceDraftRecoveryModule = null;
async function workspaceDraftRecovery() {
  if (!workspaceDraftRecoveryModule) {
    workspaceDraftRecoveryModule = await import("./shared/workspaceDraftRecovery.mjs");
  }
  return workspaceDraftRecoveryModule;
}

/** The teacher of record for a class, or the root administrator. Nobody else. */
async function requireClassTeacher(request, classId) {
  await requireTeacher(request);
  const db = getFirestore();
  const classSnapshot = await db.collection(CLASS_COLLECTION).doc(classId).get();
  if (!classSnapshot.exists) throw new HttpsError("not-found", "That class no longer exists.");
  const email = callerEmail(request);
  const teacherOfRecord = String(classSnapshot.data()?.teacherOfRecord || "").trim().toLowerCase();
  if (email !== authLib.ROOT_ADMIN_EMAIL && (!email || teacherOfRecord !== email)) {
    throw new HttpsError("permission-denied", "Only the teacher of record for this class can review its persistence records.");
  }
  return { classSnapshot, email };
}

const millisOf = (value) => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  const parsed = typeof value === "number" ? value : Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
};

async function assertTeacherMayManageAssignmentLifecycle(request, assignmentSnapshot) {
  const assignment = assignmentSnapshot.data() || {};
  // A library item has no class, so there is no teacher of record to ask. It is
  // a shared template with no students; any teacher could already edit it, and
  // the evidence check below still applies.
  if (!assignmentAudience(assignment).classIds.length) {
    const teacherUid = await requireTeacher(request);
    return { teacherUid, teacherEmail: callerEmail(request) };
  }
  return assertTeacherMayManageAssignment(request, assignmentSnapshot);
}

module.exports = {
  ASSIGNMENT_GRADE_OVERRIDE_KEY,
  ASVAB_PATH_SEED_FILE,
  CHECKPOINT_COLLECTION,
  CHECKPOINT_STATUS_ACTIVE,
  CLASS_COLLECTION,
  CLASS_POINT_ACCOUNTS_COLLECTION,
  CLASS_POINT_ANNOUNCEMENTS_COLLECTION,
  CLASS_POINT_IDEMPOTENCY_COLLECTION,
  CLASS_POINT_REWARD_REDEMPTIONS_COLLECTION,
  CLASS_POINT_TRANSACTIONS_COLLECTION,
  DEVICE_QUEUE_REPORT_COLLECTION,
  LIVE_CHALLENGE_INVITES,
  LIVE_CHALLENGE_MATCH_RESULTS,
  LIVE_CHALLENGE_PRIVATE,
  LIVE_CHALLENGE_REPORTS,
  LIVE_CHALLENGE_ROOMS,
  LIVE_CHALLENGE_TEACHER_ACTIVE,
  PERSISTENCE_RESOLUTION_COLLECTION,
  STUDENT_SESSION_SUMMARY_COLLECTION,
  TEST_CYCLE_ANSWER_RELEASES,
  TEST_CYCLE_CORRECTION_PLANS,
  TEST_CYCLE_OPERATIONS,
  TEST_CYCLE_PANEL_OPTIONS,
  TEST_CYCLE_RECORDS,
  TEST_CYCLE_RETEST_PLANS,
  WORKSPACE_DRAFT_COLLECTION,
  activeAssignmentGradeOverride,
  assertTeacherMayManageAssignment,
  assertTeacherMayManageAssignmentLifecycle,
  assignClaims,
  assignmentAudience,
  assignmentForTeacherCall,
  assignmentGradeProgress,
  authoritativeStudentClassId,
  authorizationContext,
  blueprintFamilyIds,
  callerEmail,
  classModel,
  classPointRewards,
  classPoints,
  classroomLib,
  getQuestionCredit,
  joinCodeMatchesRoster,
  liveChallengeClassPoints,
  liveChallengeEngine,
  liveChallengeReportRules,
  liveChallengeRules,
  loadBuiltInCoursePathSeed,
  loadBuiltInStarterPathSeed,
  loadClasses,
  loadTestCycleAssignment,
  lookupJoinCode,
  millisOf,
  pathDiagnosticId,
  persistencePendingLib,
  persistenceResolutionDocumentId,
  privateOverrideFrom,
  questionWasAttempted,
  readAllDeviceReportsForStudent,
  deviceReportReportedAtMs,
  MAX_DEVICE_REPORTS_PER_STUDENT,
  DEVICE_REPORT_STALE_MS,
  readPersistencePending,
  requireClassTeacher,
  requireRootAdmin,
  requireStudent,
  requireTeacher,
  resolveBlueprintFamilies,
  resolveCheckpointClassPeriod,
  resolveJoinCodeMembership,
  resolveSecureTestBlueprint,
  runTestCyclePreflight,
  safeBuildTemplateIssuePlan,
  secureAssignmentMode,
  serializableDate,
  studentDeletionMark,
  studentIdentity,
  studentIdentityRecord,
  studentIndividuallyAssigned,
  studentMatchesAssignmentAudience,
  studentOmittedFor,
  studentOverrideRef,
  studentOverrides,
  studentRequiredIndices,
  toDate,
  translateAuthError,
  validDocumentId,
  workspaceDraftRecovery,
  writeAdminAudit,
};
