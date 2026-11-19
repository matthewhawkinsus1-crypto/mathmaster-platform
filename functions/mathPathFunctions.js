// MY MATH PATH: the Path question bank, sessions, mastery, weekly Path goals and their Classroom sync, CCMR plans, the modeling lab.
//
// One of the domain modules functions/index.js loads (see its header). The
// code here was moved from index.js as it stood; helpers that another domain
// also uses are in functionsCommon.js.

const fs = require("fs");
const path = require("path");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const { GOOGLE_API_SECRETS, readStudentAppBaseUrl } = require("./lib/config");
const authLib = require("./lib/auth");
const mathPath = require("./lib/mathPath");
const { compilePathRecordForStorage } = require("./lib/pathFirestoreShape");
const labEvaluation = require("./lib/labEvaluation");
// Rich Tool items on every secure surface: the mode-aware public payload and
// the one grading authority (see the file header).
const secureItems = require("./lib/secureItems");
const rigorPolicy = require("./lib/rigorPolicy");
// Adaptive routing for live sessions. The DECISIONS come from the one shared
// engine in functions/shared/pathSessionRouting.mjs; this seam supplies the
// server-side facts (mastery documents, coverage indexes) it reasons over.
const pathRouting = require("./lib/pathRouting");
const pathContentRelease = require("./lib/pathContentRelease");
// The end-of-session recap: recorded per closed question by submitPathResponse,
// released by getMyPathSessionRecap only for a completed session.
const pathSessionRecap = require("./lib/pathSessionRecap");
// Which lock a Path session holds (an open retention check has its own, MP21),
// and the one mastery rule for the server's retention and Challenge decisions
// (the more favourable of the server profile and the assignment record, MP22).
const pathSessionLock = require("./lib/pathSessionLock");
const favourableMastery = require("./lib/favourableMastery");
const weeklyPathSync = require("./lib/weeklyPathSync");
const ccmrAssignmentBank = require("./lib/ccmrAssignmentBank");
const {
  ASVAB_PATH_SEED_FILE,
  CLASS_COLLECTION,
  authorizationContext,
  callerEmail,
  classroomLib,
  loadBuiltInCoursePathSeed,
  loadBuiltInStarterPathSeed,
  pathDiagnosticId,
  requireClassTeacher,
  requireRootAdmin,
  requireStudent,
  requireTeacher,
  safeBuildTemplateIssuePlan,
  serializableDate,
  studentMatchesAssignmentAudience,
  writeAdminAudit,
} = require("./functionsCommon");

/** The class a student is in right now, or null. */
async function loadStudentClass(db, studentData) {
  if (!studentData?.classId) return null;
  const snapshot = await db.collection(CLASS_COLLECTION).doc(studentData.classId).get();
  return snapshot.exists ? { classId: snapshot.id, ...snapshot.data() } : null;
}

// --- My Math Path content coverage ---------------------------------------------
//
// A student may only be routed to a standard the secure bank can actually issue
// and grade. This is what makes that knowable before they click, rather than
// discovered as a server error afterwards.

let coverageModule = null;
async function pathCoverage() {
  if (!coverageModule) coverageModule = await import("./shared/pathCoverage.mjs");
  return coverageModule;
}

const COVERAGE_COLLECTION = "pathCoverage";

const PATH_RUNTIME_RELEASE = "path-bank-2026-08-30-r13-asvab-challenge";
const PATH_COURSE_IDS = Object.freeze(["grade6", "grade7", "grade8", "algebra1", "algebra2"]);
const CONTENT_RELEASE_MANIFEST_COLLECTION = "pathContentReleases";
const CONTENT_RELEASE_MANIFEST_DOC = "current";
const COORDINATED_CCMR_RELEASE_SEED_FILES = Object.freeze([
  "digitalSAT_pathQuestionBank_seed.json",
  "act_pathQuestionBank_seed.json",
  "tsia2_pathQuestionBank_seed.json",
]);
const COORDINATED_CCMR_RELEASE_FRAMEWORKS = Object.freeze(["act", "digitalSAT", "tsia2"]);
const RELEASE_MANAGED_ASSESSMENT_FRAMEWORKS = Object.freeze([...COORDINATED_CCMR_RELEASE_FRAMEWORKS, "asvab"]);
const ASVAB_CONTENT_RELEASE = PATH_RUNTIME_RELEASE;

async function loadAssessmentContentReleaseState(db, framework, records = []) {
  const manifestSnapshot = await db.collection(CONTENT_RELEASE_MANIFEST_COLLECTION).doc(CONTENT_RELEASE_MANIFEST_DOC).get();
  const manifest = manifestSnapshot.exists ? manifestSnapshot.data() : null;
  return pathContentRelease.resolveAssessmentContentReleaseAuthority(records, framework, manifest);
}

function pathQuestionMatchesSessionContentRelease(question, session = {}) {
  const sessionFramework = String(session?.assessmentFramework || "").trim();
  const sessionRelease = String(session?.assessmentContentRelease || "").trim();
  const questionFramework = String(question?.assessmentContext?.framework || "").trim();
  if (!sessionFramework || !sessionRelease || questionFramework !== sessionFramework) return true;
  return String(question?.ccmrContentRelease || "").trim() === sessionRelease;
}

function assessmentReleaseUpdateError(framework) {
  return new HttpsError(
    "unavailable",
    String(framework) + " practice is being updated. Reopen this practice after the release switch completes.",
    { reason: pathContentRelease.RELEASE_UPDATE_REASON, assessmentFramework: framework },
  );
}

let texasStandardsModule = null;
async function texasStandardsRegistry() {
  if (!texasStandardsModule) texasStandardsModule = await import("./shared/texasStandards.mjs");
  return texasStandardsModule;
}

/** Which canonical course owns a Texas standard. */
function coverageCourseIdFor(alignmentKey) {
  const code = String(alignmentKey || "").trim().replace(/^texas:/i, "").toUpperCase();
  if (/^6\./.test(code)) return "grade6";
  if (/^7\./.test(code)) return "grade7";
  if (/^8\./.test(code)) return "grade8";
  if (/^A2\./.test(code)) return "algebra2";
  return "algebra1";
}

function isHttpsCallableError(error) {
  return error instanceof HttpsError || [
    "cancelled", "unknown", "invalid-argument", "deadline-exceeded", "not-found",
    "already-exists", "permission-denied", "resource-exhausted", "failed-precondition",
    "aborted", "out-of-range", "unimplemented", "internal", "unavailable",
    "data-loss", "unauthenticated",
  ].includes(String(error?.code || "").replace(/^functions\//, ""));
}

async function withPathCallableDiagnostics(operation, handler) {
  try {
    return await handler();
  } catch (error) {
    if (isHttpsCallableError(error)) throw error;
    const diagnosticId = pathDiagnosticId(operation);
    logger.error("Unexpected My Math Path callable failure", {
      operation, diagnosticId,
      message: error?.message || String(error),
      stack: error?.stack || null,
    });
    throw new HttpsError(
      "internal",
      "My Math Path could not complete this server operation.",
      { reason: "path-runtime-internal", operation, diagnosticId },
    );
  }
}

function summarizePathRejections(entries = []) {
  const group = (field, fallback = "unknown") => entries.reduce((acc, entry) => {
    const key = String(entry?.[field] || fallback);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return {
    total: entries.length,
    byReason: group("reason"),
    byQuestionType: group("questionType"),
    byTool: group("pathToolId", "field-graded / none"),
    byCourse: group("courseId"),
    byFramework: group("assessmentFramework", "course"),
  };
}

let selectionModule = null;
async function pathSelection() {
  if (!selectionModule) selectionModule = await import("./shared/pathQuestionSelection.mjs");
  return selectionModule;
}

/**
 * Root-admin deployment diagnostic for My Math Path.
 *
 * Firebase Hosting and Cloud Functions are one production release. This
 * handshake reports the server release, secure-bank count, and canonical
 * coverage documents only; no question or answer payload is returned.
 */
exports.getPathRuntimeStatus = onCall(async (request) => {
  await requireRootAdmin(request);
  const db = getFirestore();

  const [bankCountSnapshot, ...coverageSnapshots] = await Promise.all([
    db.collection("pathQuestionBank").count().get(),
    ...PATH_COURSE_IDS.map((courseId) => db.collection(COVERAGE_COLLECTION).doc(courseId).get()),
  ]);

  let starterAvailable = false;
  let starterCount = 0;
  let starterError = null;
  try {
    const items = loadBuiltInStarterPathSeed();
    starterAvailable = items.length > 0;
    starterCount = items.length;
  } catch (error) {
    starterError = error?.message || String(error);
    logger.error("Path runtime status could not read the built-in starter bank", error);
  }

  const coverage = {};
  PATH_COURSE_IDS.forEach((courseId, index) => {
    const snapshot = coverageSnapshots[index];
    coverage[courseId] = snapshot.exists ? {
      summary: snapshot.data()?.summary || null,
      generatedAt: snapshot.data()?.generatedAt || null,
      schemaVersion: snapshot.data()?.schemaVersion || null,
    } : null;
  });

  return {
    release: PATH_RUNTIME_RELEASE,
    sourceOfTruth: "secure-path-bank + canonical-texas-standards + production-issuer",
    teacherAssignmentsAffectCoverage: false,
    bankCount: bankCountSnapshot.data().count || 0,
    starterAvailable,
    starterCount,
    starterError,
    courseIds: PATH_COURSE_IDS,
    coverage,
  };
});

/**
 * Legacy compatibility endpoint.
 *
 * Teacher assignments are no longer a Path coverage source. Keeping the
 * endpoint as an explicit retirement message is safer than deleting it while
 * an older browser may still have the action cached.
 */
exports.promoteQuestionToPathBank = onCall(async (request) => {
  await requireTeacher(request);
  throw new HttpsError(
    "failed-precondition",
    "Assignment-to-Path promotion has been retired. My Math Path coverage is built only from the secure Path bank and canonical standards. Use Administration → My Math Path content coverage to manage bank content.",
    { reason: "assignment-path-promotion-retired" },
  );
});

/**
 * Validate and optionally write one complete Path-bank seed package.
 *
 * Kept as an internal helper so both the manual root-admin importer and the
 * built-in starter-bank initializer pass through the exact same production
 * issuability gate. The caller must already be authorized.
 */
async function processPathSeedImport({ db, actor, items, dryRun = false }) {
  const accepted = [];
  const rejected = [];
  for (const item of items) {
    const id = String(item?.id || "").trim();
    const standards = (Array.isArray(item?.alignmentKeys) ? item.alignmentKeys : [])
      .map((key) => String(key).replace(/^texas:/i, "").toUpperCase());
    const describe = (reason, plan = {}) => ({
      id: id || null,
      familyId: item?.familyId || null,
      standards,
      courseId: item?.courseId || coverageCourseIdFor(standards[0] || ""),
      assessmentFramework: item?.assessmentContext?.framework || item?.assessmentFramework || null,
      questionType: item?.questionType || "response",
      pathToolId: item?.pathToolId || item?.toolId || item?.tool?.id || null,
      reason: reason || "not_issuable",
      detail: plan?.detail || null,
      diagnosticId: plan?.diagnosticId || null,
    });
    if (!id) { rejected.push(describe("missing_id")); continue; }
    if (!standards.length) { rejected.push(describe("no_alignment_keys")); continue; }

    // Compile the record into the EXACT object that will be stored, and refuse
    // it here if that object is not legal Firestore data. This used to be a
    // best-effort sanitizer whose output nothing checked, so a document that
    // still nested an array reached the write pass and failed the whole batch
    // with "Property array contains an invalid nested entity" — naming no
    // document, no property and no course. The compiler names all three.
    const compiled = compilePathRecordForStorage({ ...item, id, active: item.active !== false });
    if (!compiled.ok) {
      const first = compiled.errors[0];
      rejected.push({
        ...describe("firestore_shape", { detail: first?.message || null }),
        propertyPath: first?.path || null,
        compilerCode: first?.code || null,
      });
      continue;
    }

    // Validate the thing a student will actually receive — and validate the
    // COMPILED document, because that is what production stores and reads back.
    // A bad template is a rejected document, not an exception that aborts
    // diagnosis of the other 5,000 documents.
    // eslint-disable-next-line no-await-in-loop
    const plan = await safeBuildTemplateIssuePlan(compiled.document, { operation: "seed-import-validation" });
    if (!plan.issuable) { rejected.push(describe(plan.reason, plan)); continue; }
    accepted.push(compiled.document);
  }

  const rejectionSummary = summarizePathRejections(rejected);

  // ALL OR NOTHING. The validation pass returns every actionable rejection and
  // writes nothing until the complete package is clean.
  if (rejected.length) {
    return {
      dryRun,
      imported: false,
      phase: "validation",
      received: items.length,
      accepted: 0,
      wouldAccept: accepted.length,
      rejected,
      rejectionSummary,
      standards: [],
    };
  }

  if (!dryRun && accepted.length) {
    for (let index = 0; index < accepted.length; index += 400) {
      const chunk = accepted.slice(index, index + 400);
      const batch = db.batch();
      chunk.forEach((record) => {
        const { id: recordId, ...fields } = record;
        // The bank package is authoritative. `merge:true` used to leave fields
        // from an older question shape behind when a question changed type, so
        // a refresh could report success while Firestore still contained stale
        // tool/grading metadata. Replace the document instead.
        batch.set(db.collection("pathQuestionBank").doc(recordId), {
          ...fields,
          seededAt: FieldValue.serverTimestamp(),
          seededBy: actor.uid,
        });
      });
      // eslint-disable-next-line no-await-in-loop
      await batch.commit();
    }
    await writeAdminAudit(db, actor, "path_bank_seeded", "pathQuestionBank", {
      accepted: accepted.length,
      rejected: 0,
      replacementWrites: true,
    });
  }

  return {
    dryRun,
    imported: !dryRun,
    phase: dryRun ? "validation" : "write",
    received: items.length,
    accepted: accepted.length,
    wouldAccept: accepted.length,
    rejected,
    rejectionSummary,
    standards: [...new Set(accepted.flatMap((record) => record.alignmentKeys.map((key) => String(key).replace(/^texas:/i, "").toUpperCase())))].sort(),
  };
}

/**
 * Root-admin action: bootstrap the secure Path bank from a seed package chosen
 * by the administrator.
 *
 * The browser may send a custom package here, but every document is validated
 * before any write. `dryRun` supports the client's package-wide two-pass check
 * when a custom package is larger than one callable chunk.
 */
exports.seedPathQuestionBank = onCall(async (request) => {
  const actor = await requireRootAdmin(request);
  const db = getFirestore();
  const dryRun = request.data?.dryRun === true;
  const items = Array.isArray(request.data?.items) ? request.data.items : [];
  if (!items.length) throw new HttpsError("invalid-argument", "Supply the seed items to import.");
  if (items.length > 600) throw new HttpsError("invalid-argument", "Import at most 600 items per call.");

  // Dry-run stays available for package authoring, but released SAT/ACT/TSIA2
  // content may only be written by the atomic coordinated refresh. Allowing a
  // generic write here could change the bank without moving the release
  // manifest and would make active sessions observe an impossible mixed state.
  if (!dryRun) {
    const attemptedProtectedFrameworks = [...new Set(items
      .map((item) => String(item?.assessmentContext?.framework || "").trim())
      .filter((framework) => RELEASE_MANAGED_ASSESSMENT_FRAMEWORKS.includes(framework)))].sort();
    if (attemptedProtectedFrameworks.length) {
      throw new HttpsError(
        "failed-precondition",
        "Release-managed assessment content (" + attemptedProtectedFrameworks.join(", ") + ") cannot be written by the generic Path seed importer. Use the dedicated course/ASVAB/CCMR release refresh controls.",
      );
    }
  }
  return processPathSeedImport({ db, actor, items, dryRun });
});

const BUILT_IN_PATH_SEED_MARKER = "mathmaster-built-in-path-bank";
const LEGACY_BUILT_IN_PATH_SEED_SOURCE = "MathMaster curated starter coverage";

let builtInAsvabPathSeedCache = null;
function loadBuiltInAsvabPathSeed() {
  if (builtInAsvabPathSeedCache) return builtInAsvabPathSeedCache;
  const filePath = path.join(__dirname, "seeds", "pathQuestionBank", ASVAB_PATH_SEED_FILE);
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const items = Array.isArray(parsed) ? parsed : (parsed.documents || parsed.items || parsed.questions || []);
  if (!items.length) throw new Error("The built-in ASVAB Path bank is empty.");
  const ids = new Set(items.map((item) => String(item?.id || "").trim()));
  if (ids.size !== items.length || ids.has("")) throw new Error("The built-in ASVAB Path bank contains missing or duplicate IDs.");
  builtInAsvabPathSeedCache = items;
  return builtInAsvabPathSeedCache;
}

function loadCoordinatedCcmrReleaseSeed() {
  const seedDirectory = path.join(__dirname, "seeds", "pathQuestionBank");
  const items = COORDINATED_CCMR_RELEASE_SEED_FILES.flatMap((fileName) => {
    const parsed = JSON.parse(fs.readFileSync(path.join(seedDirectory, fileName), "utf8"));
    return Array.isArray(parsed) ? parsed : (parsed.documents || parsed.items || parsed.questions || []);
  });
  if (!items.length) throw new Error("The coordinated CCMR release package is empty.");
  const ids = new Set(items.map((item) => String(item?.id || "").trim()));
  if (ids.size !== items.length || ids.has("")) throw new Error("The coordinated CCMR release package contains missing or duplicate IDs.");
  return items;
}

async function removeSupersededBuiltInPathSeedRecords(db, currentItems) {
  const currentIds = new Set(currentItems.map((item) => String(item?.id || "").trim()).filter(Boolean));
  const snapshot = await db.collection("pathQuestionBank").get();
  const obsolete = snapshot.docs.filter((doc) => {
    if (currentIds.has(doc.id)) return false;
    const data = doc.data() || {};
    return data.builtInPathSeed === BUILT_IN_PATH_SEED_MARKER
      || data?.seedMetadata?.source === LEGACY_BUILT_IN_PATH_SEED_SOURCE;
  });

  for (let index = 0; index < obsolete.length; index += 400) {
    const batch = db.batch();
    obsolete.slice(index, index + 400).forEach((doc) => batch.delete(doc.ref));
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
  }
  return obsolete.length;
}

async function removeSupersededBuiltInCourseSeedRecords(db, currentItems) {
  const currentIds = new Set(currentItems.map((item) => String(item?.id || "").trim()).filter(Boolean));
  const snapshot = await db.collection("pathQuestionBank").get();
  const obsolete = snapshot.docs.filter((doc) => {
    if (currentIds.has(doc.id)) return false;
    const data = doc.data() || {};
    const framework = String(data?.assessmentContext?.framework || "course");
    if (framework !== "course") return false;
    return data.builtInPathSeed === BUILT_IN_PATH_SEED_MARKER
      || data?.seedMetadata?.source === LEGACY_BUILT_IN_PATH_SEED_SOURCE;
  });

  for (let index = 0; index < obsolete.length; index += 400) {
    const batch = db.batch();
    obsolete.slice(index, index + 400).forEach((doc) => batch.delete(doc.ref));
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
  }
  return obsolete.length;
}

async function removeSupersededBuiltInAssessmentSeedRecords(db, currentItems, frameworks) {
  const currentIds = new Set(currentItems.map((item) => String(item?.id || "").trim()).filter(Boolean));
  const frameworkSet = new Set((Array.isArray(frameworks) ? frameworks : []).map(String));
  const snapshot = await db.collection("pathQuestionBank").get();
  const obsolete = snapshot.docs.filter((doc) => {
    if (currentIds.has(doc.id)) return false;
    const data = doc.data() || {};
    const framework = String(data?.assessmentContext?.framework || "");
    if (!frameworkSet.has(framework)) return false;
    return data.builtInPathSeed === BUILT_IN_PATH_SEED_MARKER
      || data?.seedMetadata?.source === LEGACY_BUILT_IN_PATH_SEED_SOURCE;
  });

  for (let index = 0; index < obsolete.length; index += 400) {
    const batch = db.batch();
    obsolete.slice(index, index + 400).forEach((doc) => batch.delete(doc.ref));
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
  }
  return obsolete.length;
}

/**
 * Rebuild stored coverage from the actual secure bank.
 */
async function canonicalPathStandardsForCourse(courseId) {
  const registry = await texasStandardsRegistry();
  return registry.getTexasStandardsForCourse(courseId)
    .filter((standard) => standard.classification !== "process")
    .map((standard) => standard.code);
}

/** Rebuild stored coverage from the secure bank and the canonical Texas registry. */
async function rebuildStoredPathCoverage(db, { courses = PATH_COURSE_IDS } = {}) {
  const coverage = await pathCoverage();
  const validCourses = [...new Set(courses.map(String))].filter((courseId) => PATH_COURSE_IDS.includes(courseId));
  if (!validCourses.length) throw new HttpsError("invalid-argument", "Choose at least one supported Math Path course.");

  const snapshot = await db.collection("pathQuestionBank").get();
  const bankItems = snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((item) => pathQuestionMatchesFramework(item, null));
  const plans = {};
  for (const item of bankItems) {
    // eslint-disable-next-line no-await-in-loop
    plans[item.id] = await safeBuildTemplateIssuePlan(item, { operation: "coverage-rebuild" });
  }

  const indexes = {};
  for (const courseId of validCourses) {
    // THE COURSE MAP IS SERVER-AUTHORITATIVE. Teacher assignments and browser
    // wheel configuration do not choose which standards count as coverage.
    // eslint-disable-next-line no-await-in-loop
    const wheelTeks = await canonicalPathStandardsForCourse(courseId);
    if (!wheelTeks.length) throw new HttpsError("failed-precondition", `No canonical Texas standards are registered for ${courseId}.`);
    const index = coverage.buildCoverageIndex({
      courseId,
      wheelTeks,
      bankItems,
      plans,
      generatedAt: Date.now(),
    });
    // eslint-disable-next-line no-await-in-loop
    await db.collection(COVERAGE_COLLECTION).doc(courseId).set(index);
    indexes[courseId] = index;
  }
  return {
    courses: validCourses,
    sourceOfTruth: "canonical-texas-standards + secure-path-bank + production-issuer",
    indexes,
  };
}

async function livePathSkillIsLaunchable(db, targetAlignmentKey) {
  const coverage = await pathCoverage();
  const snapshot = await db.collection("pathQuestionBank")
    .where("alignmentKeys", "array-contains", targetAlignmentKey)
    .get();
  const bankItems = snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((item) => pathQuestionMatchesFramework(item, null));
  const plans = {};
  for (const item of bankItems) {
    // eslint-disable-next-line no-await-in-loop
    plans[item.id] = await safeBuildTemplateIssuePlan(item, { operation: "live-coverage-check" });
  }
  const index = coverage.buildCoverageIndex({
    courseId: coverageCourseIdFor(targetAlignmentKey),
    wheelTeks: [coverage.coverageKey(targetAlignmentKey)],
    bankItems,
    plans,
    generatedAt: Date.now(),
  });
  return coverage.isSkillLaunchable(index, targetAlignmentKey);
}

/**
 * Root-admin one-click initializer for a fresh MathMaster installation.
 *
 * SECURITY: the answer-bearing starter JSON files live inside the Cloud
 * Functions bundle, never `public/` and never the browser JavaScript bundle.
 * A student therefore cannot download the seed answer key from Hosting. Only
 * the root-admin callable can ask the server to install it, and the client gets
 * counts/status back rather than the seed contents.
 */
exports.initializeStarterPathQuestionBank = onCall({ timeoutSeconds: 540, memory: "1GiB" }, async (request) => {
  const actor = await requireRootAdmin(request);
  const db = getFirestore();

  // This callable installs the complete built-in starter package, including
  // legacy ASVAB content. It must never double as a live-bank refresh because
  // SAT, ACT, and TSIA2 now have their own atomic release protocol. The only
  // non-empty-bank exception is a retry of this exact initializer after a
  // failed fresh installation left the release manifest intentionally held.
  const manifestRef = db.collection(CONTENT_RELEASE_MANIFEST_COLLECTION).doc(CONTENT_RELEASE_MANIFEST_DOC);
  const [existingBank, existingManifestSnapshot] = await Promise.all([
    db.collection("pathQuestionBank").limit(1).get(),
    manifestRef.get(),
  ]);
  const existingManifest = existingManifestSnapshot.exists ? existingManifestSnapshot.data() : {};
  const retryingFailedStarterInitialization = !existingBank.empty
    && existingManifest?.status === "updating"
    && existingManifest?.updateOperation === "starter-initialization";
  if (!existingBank.empty && !retryingFailedStarterInitialization) {
    throw new HttpsError(
      "failed-precondition",
      "Starter Path-bank initialization is fresh-install-only. Use the dedicated bank refresh controls on an existing installation.",
    );
  }

  let items;
  try {
    items = loadBuiltInStarterPathSeed();
  } catch (error) {
    logger.error("Could not load built-in My Math Path starter bank", error);
    throw new HttpsError("failed-precondition", "The built-in My Math Path starter bank is unavailable in this deployment.");
  }
  // The built-in package is loaded on the server, so it is not constrained by
  // the browser callable payload limit used by custom imports. Firestore writes
  // are already chunked inside processPathSeedImport. Tag the current built-in
  // package so a later refresh can retire superseded bundled questions without
  // touching teacher-promoted or custom Path-bank content.
  const taggedItems = items.map((item) => ({
    ...item,
    builtInPathSeed: BUILT_IN_PATH_SEED_MARKER,
    builtInPathSeedRelease: PATH_RUNTIME_RELEASE,
  }));

  // Validate the whole starter package before closing tracked assessment
  // issuance. ASVAB intentionally remains outside this release manifest.
  const validation = await processPathSeedImport({ db, actor, items: taggedItems, dryRun: true });
  if (validation.rejected?.length || validation.wouldAccept !== taggedItems.length) {
    return { ...validation, phase: "validation" };
  }
  const discoveredReleases = pathContentRelease.collectAssessmentContentReleases(taggedItems);
  const expectedFrameworks = [...COORDINATED_CCMR_RELEASE_FRAMEWORKS].sort();
  const pendingReleases = Object.fromEntries(expectedFrameworks
    .map((framework) => [framework, discoveredReleases[framework]])
    .filter(([, release]) => Boolean(release)));
  if (Object.keys(pendingReleases).length !== expectedFrameworks.length) {
    throw new HttpsError(
      "failed-precondition",
      "The starter package must contain release metadata for ACT, Digital SAT, and TSIA2 before installation.",
    );
  }

  const updatingManifest = pathContentRelease.beginAssessmentContentReleaseUpdate(
    retryingFailedStarterInitialization ? existingManifest : {},
    pendingReleases,
    Date.now(),
  );
  await manifestRef.set({
    ...updatingManifest,
    updateOperation: "starter-initialization",
    updatedBy: actor.uid,
  });

  // If any write or cleanup fails after this point, the manifest stays in
  // updating state and this same callable may safely resume the failed starter
  // installation. New SAT/ACT/TSIA2 issuance remains held in the meantime.
  const seed = await processPathSeedImport({ db, actor, items: taggedItems, dryRun: false });
  if (!seed.imported) {
    throw new HttpsError("failed-precondition", "The starter Path bank failed its write-time validation; tracked assessment issuance remains held.");
  }
  const removedSuperseded = await removeSupersededBuiltInPathSeedRecords(db, taggedItems);
  const coverage = await rebuildStoredPathCoverage(db);
  const { retireStaleTsia2PathStateForRelease } = await import("./shared/pathBankRelease.mjs");
  const tsia2PathBankRelease = await retireStaleTsia2PathStateForRelease(db);

  const activeManifest = pathContentRelease.completeAssessmentContentReleaseUpdate(
    updatingManifest,
    pendingReleases,
    Date.now(),
  );
  await manifestRef.set({
    ...activeManifest,
    updateOperation: "starter-initialization",
    updatedBy: actor.uid,
  });
  return { ...seed, phase: "complete", removedSuperseded, coverage, tsia2PathBankRelease, assessmentContentReleases: pendingReleases };
});

/**
 * Root-admin refresh for built-in COURSE Path content on an existing installation.
 *
 * Only Grade 6/7/8 + Algebra I/II bundled records are replaced. Assessment
 * frameworks are deliberately excluded so this operation cannot disturb
 * Digital SAT, ACT, TSIA2, or ASVAB releases.
 */
exports.refreshBuiltInCoursePathBank = onCall({ timeoutSeconds: 540, memory: "1GiB" }, async (request) => {
  const actor = await requireRootAdmin(request);
  const db = getFirestore();
  let items;
  try {
    items = loadBuiltInCoursePathSeed();
  } catch (error) {
    logger.error("Could not load built-in course Path bank", error);
    throw new HttpsError("failed-precondition", "The built-in course Path bank is unavailable in this deployment.");
  }

  const taggedItems = items.map((item) => ({
    ...item,
    builtInPathSeed: BUILT_IN_PATH_SEED_MARKER,
    builtInPathSeedRelease: PATH_RUNTIME_RELEASE,
  }));
  const validation = await processPathSeedImport({ db, actor, items: taggedItems, dryRun: true });
  if (validation.rejected?.length || validation.wouldAccept !== taggedItems.length) {
    return { ...validation, phase: "validation" };
  }
  const seed = await processPathSeedImport({ db, actor, items: taggedItems, dryRun: false });
  if (!seed.imported) {
    throw new HttpsError("failed-precondition", "The built-in course Path bank failed its write-time validation.");
  }
  const removedSuperseded = await removeSupersededBuiltInCourseSeedRecords(db, taggedItems);
  const coverage = await rebuildStoredPathCoverage(db);
  await writeAdminAudit(db, actor, "course_path_bank_refreshed", "pathQuestionBank", {
    accepted: seed.accepted,
    removedSuperseded,
    release: PATH_RUNTIME_RELEASE,
  });
  return { ...seed, phase: "complete", removedSuperseded, coverage, release: PATH_RUNTIME_RELEASE };
});

/**
 * Root-admin ASVAB release refresh.
 *
 * ASVAB stays independent from the coordinated SAT/ACT/TSIA2 package, but is
 * tracked in the same release manifest so stale sessions cannot mix releases.
 */
exports.refreshReleasedAsvabPathBank = onCall({ timeoutSeconds: 540, memory: "1GiB" }, async (request) => {
  const actor = await requireRootAdmin(request);
  const db = getFirestore();
  let items;
  try {
    items = loadBuiltInAsvabPathSeed();
  } catch (error) {
    logger.error("Could not load built-in ASVAB Path bank", error);
    throw new HttpsError("failed-precondition", "The built-in ASVAB Path bank is unavailable in this deployment.");
  }

  const taggedItems = items.map((item) => ({
    ...item,
    builtInPathSeed: BUILT_IN_PATH_SEED_MARKER,
    builtInPathSeedRelease: PATH_RUNTIME_RELEASE,
    ccmrContentRelease: ASVAB_CONTENT_RELEASE,
  }));
  const validation = await processPathSeedImport({ db, actor, items: taggedItems, dryRun: true });
  if (validation.rejected?.length || validation.wouldAccept !== taggedItems.length) {
    return { ...validation, phase: "validation", release: ASVAB_CONTENT_RELEASE };
  }

  const manifestRef = db.collection(CONTENT_RELEASE_MANIFEST_COLLECTION).doc(CONTENT_RELEASE_MANIFEST_DOC);
  const manifestSnapshot = await manifestRef.get();
  const currentManifest = manifestSnapshot.exists ? manifestSnapshot.data() : {};
  const retryingAsvabRefresh = currentManifest?.status === "updating"
    && currentManifest?.updateOperation === "asvab-refresh";
  if (currentManifest?.status === "updating" && !retryingAsvabRefresh) {
    throw new HttpsError(
      "failed-precondition",
      "Another assessment-bank update is already in progress. Finish or recover that operation before refreshing ASVAB.",
    );
  }
  if (retryingAsvabRefresh
      && String(currentManifest?.pendingReleases?.asvab || "") !== ASVAB_CONTENT_RELEASE) {
    throw new HttpsError(
      "failed-precondition",
      "The held ASVAB refresh targets a different release. Redeploy the matching release before retrying.",
    );
  }

  const pendingReleases = { asvab: ASVAB_CONTENT_RELEASE };
  const updatingManifest = pathContentRelease.beginAssessmentContentReleaseUpdate(
    currentManifest,
    pendingReleases,
    Date.now(),
  );
  await manifestRef.set({
    ...updatingManifest,
    updateOperation: "asvab-refresh",
    updatedBy: actor.uid,
  });

  const seed = await processPathSeedImport({ db, actor, items: taggedItems, dryRun: false });
  if (!seed.imported) {
    throw new HttpsError("failed-precondition", "The ASVAB Path bank failed its write-time validation; assessment issuance remains held.");
  }
  const removedSuperseded = await removeSupersededBuiltInAssessmentSeedRecords(db, taggedItems, ["asvab"]);
  const activatedReleases = {
    ...(currentManifest?.activeReleases || {}),
    asvab: ASVAB_CONTENT_RELEASE,
  };
  const activeManifest = pathContentRelease.completeAssessmentContentReleaseUpdate(
    updatingManifest,
    activatedReleases,
    Date.now(),
  );
  await manifestRef.set({
    ...activeManifest,
    updateOperation: "asvab-refresh",
    updatedBy: actor.uid,
  });
  await writeAdminAudit(db, actor, "asvab_path_bank_refreshed", CONTENT_RELEASE_MANIFEST_COLLECTION, {
    release: ASVAB_CONTENT_RELEASE,
    accepted: seed.accepted,
    removedSuperseded,
  });
  return {
    ...seed,
    phase: "complete",
    release: ASVAB_CONTENT_RELEASE,
    manifestStatus: activeManifest.status,
    removedSuperseded,
  };
});

/**
 * Root-admin coordinated assessment-bank refresh.
 *
 * This deliberately loads only Digital SAT, ACT, and TSIA2. ASVAB remains on
 * its existing release until it is separately authored and promoted. The
 * manifest enters "updating" before the first Firestore bank mutation and is
 * activated only after all writes and selective cleanup finish. A failure in
 * between therefore leaves assessment issuance held rather than mixed.
 */
exports.refreshReleasedCcmrPathBanks = onCall({ timeoutSeconds: 540, memory: "1GiB" }, async (request) => {
  const actor = await requireRootAdmin(request);
  const db = getFirestore();
  let items;
  try {
    items = loadCoordinatedCcmrReleaseSeed();
  } catch (error) {
    logger.error("Could not load coordinated CCMR release package", error);
    throw new HttpsError("failed-precondition", "The coordinated CCMR release package is unavailable in this deployment.");
  }

  const taggedItems = items.map((item) => ({
    ...item,
    builtInPathSeed: BUILT_IN_PATH_SEED_MARKER,
    builtInPathSeedRelease: PATH_RUNTIME_RELEASE,
  }));
  const pendingReleases = pathContentRelease.collectAssessmentContentReleases(taggedItems);
  const expectedFrameworks = [...COORDINATED_CCMR_RELEASE_FRAMEWORKS].sort();
  const actualFrameworks = Object.keys(pendingReleases).sort();
  if (JSON.stringify(actualFrameworks) !== JSON.stringify(expectedFrameworks)) {
    throw new HttpsError(
      "failed-precondition",
      "The coordinated CCMR package must contain exactly " + expectedFrameworks.join(", ") + "; found " + (actualFrameworks.join(", ") || "none") + ".",
    );
  }

  // First pass is intentionally read-only. The manifest does not close student
  // issuance unless all 1,000 assessment documents pass the production issuer.
  const validation = await processPathSeedImport({ db, actor, items: taggedItems, dryRun: true });
  if (validation.rejected?.length || validation.wouldAccept !== taggedItems.length) {
    return { ...validation, phase: "validation", pendingReleases };
  }

  const manifestRef = db.collection(CONTENT_RELEASE_MANIFEST_COLLECTION).doc(CONTENT_RELEASE_MANIFEST_DOC);
  const manifestSnapshot = await manifestRef.get();
  const currentManifest = manifestSnapshot.exists ? manifestSnapshot.data() : {};
  const retryingCoordinatedRefresh = currentManifest?.status === "updating"
    && currentManifest?.updateOperation === "coordinated-refresh";
  if (currentManifest?.status === "updating" && !retryingCoordinatedRefresh) {
    throw new HttpsError(
      "failed-precondition",
      "Another assessment-bank update is already in progress. Finish or recover that operation before starting the coordinated CCMR refresh.",
    );
  }

  const normalizeReleaseEntries = (value) => Object.entries(value || {})
    .map(([framework, release]) => [String(framework).trim(), String(release || "").trim()])
    .filter(([framework, release]) => framework && release)
    .sort(([left], [right]) => left.localeCompare(right));
  const samePendingRelease = JSON.stringify(normalizeReleaseEntries(currentManifest?.pendingReleases))
    === JSON.stringify(normalizeReleaseEntries(pendingReleases));
  if (retryingCoordinatedRefresh && !samePendingRelease) {
    throw new HttpsError(
      "failed-precondition",
      "The held CCMR refresh targets a different pending content release. Redeploy the matching release package or recover the held update before retrying.",
    );
  }

  const updatingManifest = pathContentRelease.beginAssessmentContentReleaseUpdate(
    currentManifest,
    pendingReleases,
    Date.now(),
  );
  await manifestRef.set({
    ...updatingManifest,
    updateOperation: "coordinated-refresh",
    updatedBy: actor.uid,
  });

  // A second validation inside processPathSeedImport protects the write itself.
  // If anything fails from this point onward, the manifest intentionally stays
  // in "updating" so no new assessment question is issued from a partial bank.
  const seed = await processPathSeedImport({ db, actor, items: taggedItems, dryRun: false });
  if (!seed.imported) {
    throw new HttpsError("failed-precondition", "The coordinated CCMR bank failed its write-time validation; assessment issuance remains held.");
  }

  const removedSuperseded = await removeSupersededBuiltInAssessmentSeedRecords(
    db,
    taggedItems,
    expectedFrameworks,
  );
  const { retireStaleTsia2PathStateForRelease } = await import("./shared/pathBankRelease.mjs");
  const tsia2PathBankRelease = await retireStaleTsia2PathStateForRelease(db);

  const activatedReleases = {
    ...(currentManifest?.activeReleases || {}),
    ...pendingReleases,
  };
  const activeManifest = pathContentRelease.completeAssessmentContentReleaseUpdate(
    updatingManifest,
    activatedReleases,
    Date.now(),
  );
  await manifestRef.set({
    ...activeManifest,
    updateOperation: "coordinated-refresh",
    updatedBy: actor.uid,
  });
  await writeAdminAudit(db, actor, "ccmr_path_banks_refreshed", CONTENT_RELEASE_MANIFEST_COLLECTION, {
    frameworks: expectedFrameworks,
    releases: pendingReleases,
    accepted: seed.accepted,
    removedSuperseded,
  });

  return {
    ...seed,
    phase: "complete",
    releases: pendingReleases,
    manifestStatus: activeManifest.status,
    removedSuperseded,
    tsia2PathBankRelease,
  };
});

/** Remove a promoted question from the Path bank without touching the assignment. */
exports.withdrawQuestionFromPathBank = onCall(async (request) => {
  await requireTeacher(request);
  const db = getFirestore();
  const bankId = String(request.data?.bankId || "").trim();
  if (!bankId) throw new HttpsError("invalid-argument", "bankId is required.");

  const existingQuestion = await db.collection("pathQuestionBank").doc(bankId).get();
  if (!existingQuestion.exists) {
    throw new HttpsError("not-found", "The Path-bank question no longer exists.");
  }
  const framework = String(existingQuestion.data()?.assessmentContext?.framework || "").trim();
  if (RELEASE_MANAGED_ASSESSMENT_FRAMEWORKS.includes(framework)) {
    throw new HttpsError(
      "failed-precondition",
      "Released assessment questions cannot be withdrawn one at a time. Use the dedicated ASVAB or coordinated SAT/ACT/TSIA2 refresh so the audited release and manifest change together.",
    );
  }

  // Deactivated rather than deleted: an evidence event already recorded against
  // it should still be able to name the question a student answered.
  await db.collection("pathQuestionBank").doc(bankId).set({ active: false, withdrawnAt: Date.now() }, { merge: true });
  await rebuildStoredPathCoverage(db);
  return { bankId, active: false };
});

/**
 * Recompute the coverage index from the secure Path bank.
 *
 * This is a global administrative operation, not a teacher-assignment mapping.
 * The server owns the course-standard list through the canonical Texas registry.
 */
exports.rebuildPathCoverage = onCall({ timeoutSeconds: 540, memory: "1GiB", invoker: "public" }, async (request) => {
  await requireRootAdmin(request);
  const db = getFirestore();
  const requestedCourses = Array.isArray(request.data?.courses) ? request.data.courses : [];
  const courses = requestedCourses.length ? requestedCourses : PATH_COURSE_IDS;
  return rebuildStoredPathCoverage(db, { courses });
});

/**
 * Root-admin targeted diagnostic for a standard that will not launch.
 * Returns counts and validation reasons only — never prompts, expected answers,
 * generator parameters, or private grading definitions.
 */
exports.diagnosePathSkill = onCall({ timeoutSeconds: 120, memory: "512MiB" }, async (request) => {
  await requireRootAdmin(request);
  const db = getFirestore();
  const targetAlignmentKey = mathPath.canonicalAlignmentKey(request.data?.targetAlignmentKey);
  if (!targetAlignmentKey) throw new HttpsError("invalid-argument", "targetAlignmentKey is required.");
  const assessmentFramework = normalizePathAssessmentFramework(request.data?.assessmentFramework);
  const courseId = coverageCourseIdFor(targetAlignmentKey);

  const [snapshot, storedCoverage] = await Promise.all([
    db.collection("pathQuestionBank").where("alignmentKeys", "array-contains", targetAlignmentKey).limit(200).get(),
    db.collection(COVERAGE_COLLECTION).doc(courseId).get(),
  ]);
  const allRecords = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const activeRecords = allRecords.filter((question) => question.active !== false);
  const records = activeRecords.filter((question) => pathQuestionMatchesFramework(question, assessmentFramework));
  const evaluations = [];
  for (const question of records) {
    // eslint-disable-next-line no-await-in-loop
    const plan = await safeBuildTemplateIssuePlan(question, { operation: "skill-diagnostic" });
    evaluations.push({ question, plan });
  }

  const rejected = evaluations.filter((entry) => !entry.plan?.issuable).map(({ question, plan }) => ({
    id: question.id,
    familyId: question.familyId || null,
    questionType: question.questionType || "response",
    pathToolId: question.pathToolId || question.toolId || question.tool?.id || null,
    courseId: question.courseId || courseId,
    assessmentFramework: question.assessmentContext?.framework || null,
    reason: plan?.reason || "not_issuable",
    detail: plan?.detail || null,
    diagnosticId: plan?.diagnosticId || null,
  }));
  const issuableFamilies = new Set(evaluations
    .filter((entry) => entry.plan?.issuable)
    .map((entry) => String(entry.question?.familyId || entry.question?.id || ""))
    .filter(Boolean));

  const coverage = await pathCoverage();
  const diagnosticIndex = coverage.buildCoverageIndex({
    courseId,
    wheelTeks: [coverage.coverageKey(targetAlignmentKey)],
    bankItems: records,
    plans: Object.fromEntries(evaluations.map((entry) => [entry.question.id, entry.plan])),
    generatedAt: Date.now(),
  });
  const key = coverage.coverageKey(targetAlignmentKey);
  const storedEntry = storedCoverage.exists
    ? (storedCoverage.data()?.skills?.[key] || storedCoverage.data()?.offWheel?.[key] || null)
    : null;

  return {
    targetAlignmentKey,
    displayCode: mathPath.displayAlignmentKey(targetAlignmentKey),
    courseId,
    assessmentFramework,
    totalBankMatches: allRecords.length,
    activeMatches: activeRecords.length,
    frameworkMatches: records.length,
    issuableDocuments: evaluations.filter((entry) => entry.plan?.issuable).length,
    issuableFamilies: issuableFamilies.size,
    launchable: assessmentFramework ? issuableFamilies.size >= 5 : coverage.isSkillLaunchable(diagnosticIndex, targetAlignmentKey),
    liveCoverage: diagnosticIndex.skills?.[key] || diagnosticIndex.offWheel?.[key] || null,
    storedCoverage: storedEntry,
    rejectionSummary: summarizePathRejections(rejected),
    rejected: rejected.slice(0, 80),
  };
});

// Phase 5D: secure My Math Path production seam
// ---------------------------------------------------------------------------

function publicPathSession(session = {}) {
  const { currentQuestion, ...safe } = session;
  return {
    ...safe,
    hasOpenQuestion: Boolean(currentQuestion),
  };
}

function pathSessionRequiredQuestions(sessionKind, requested) {
  if (sessionKind === "retentionProbe") return 2;
  return Math.max(2, Math.min(10, Number(requested) || 5));
}

// Pinned equal to WEEKLY_PATH_FRAMEWORKS (shared/weeklyPathSlotAuthority.mjs),
// which the simulator and the browser use, by weeklyPathSlotAuthority.test.mjs.
const PATH_ASSESSMENT_FRAMEWORKS = new Set(["digitalSAT", "act", "tsia2", "asvab"]);

function normalizePathAssessmentFramework(value) {
  const framework = String(value || "").trim();
  return PATH_ASSESSMENT_FRAMEWORKS.has(framework) ? framework : null;
}

function pathQuestionMatchesFramework(question = {}, assessmentFramework = null) {
  const authoredFramework = String(question?.assessmentContext?.framework || "course");
  if (assessmentFramework) {
    return authoredFramework === assessmentFramework && question?.assessmentContext?.examStyle !== false;
  }
  return authoredFramework === "course";
}

const CCMR_PROGRESS_SUBCOLLECTION = "ccmrProgress";

function ccmrProgressRef(db, studentId, alignmentKey, framework) {
  return db.collection("grades").doc(studentId).collection(CCMR_PROGRESS_SUBCOLLECTION)
    .doc(mathPath.opaqueId("ccmr-progress", alignmentKey, framework));
}

function resolveServerCcmrChallengeTier(progress = {}) {
  if (Number(progress.tier3SessionsPassed || 0) > 0) return 3;
  if (Number(progress.tier2SessionsPassed || 0) > 0) return 3;
  if (Number(progress.tier1SessionsPassed || 0) > 0) return 2;
  const attempts = Number(progress.directItemsAttempted || 0);
  const correct = Number(progress.directItemsCorrect || 0);
  if (attempts >= 5 && attempts > 0 && correct / attempts >= 0.8) return 2;
  return 1;
}

async function loadCcmrProgress(db, studentId, alignmentKey, framework) {
  const ref = ccmrProgressRef(db, studentId, alignmentKey, framework);
  const snapshot = await ref.get();
  if (snapshot.exists) return snapshot.data() || {};

  // CCMR Fidelity V2 shipped after students already had direct assessment
  // evidence. Bootstrap the private progression record from immutable evidence
  // so a student who already earned 5/5 SAT items does not get sent back to
  // beginner SAT practice just because the new progress document is absent.
  const evidenceSnapshot = await db.collection("grades").doc(studentId).collection("evidenceEvents")
    .where("masteryEvidenceKeys", "array-contains", alignmentKey)
    .limit(150)
    .get();
  let directItemsAttempted = 0;
  let directItemsCorrect = 0;
  const tierSessionsPassed = { 1: 0, 2: 0, 3: 0 };
  const tierSessionsCompleted = { 1: 0, 2: 0, 3: 0 };
  evidenceSnapshot.docs.forEach((doc) => {
    const event = doc.data() || {};
    if (event?.source?.kind !== "myMathPath") return;
    if (normalizePathAssessmentFramework(event?.source?.assessmentFramework) !== framework) return;
    if (event?.performance?.status && event.performance.status !== "finalized") return;
    directItemsAttempted += 1;
    if (event?.performance?.isCorrect === true || Number(event?.performance?.score || 0) >= 1) directItemsCorrect += 1;
    const tier = Math.max(1, Math.min(3, Number(event?.source?.ccmrChallengeTier || event?.questionSnapshot?.ccmrChallengeTier || 1)));
    if (event?.source?.ccmrSessionCompleted === true) tierSessionsCompleted[tier] += 1;
    if (event?.source?.ccmrSessionPassed === true) tierSessionsPassed[tier] += 1;
  });
  const progress = {
    schemaVersion: 2,
    studentId,
    alignmentKey,
    framework,
    directItemsAttempted,
    directItemsCorrect,
    tier1SessionsCompleted: tierSessionsCompleted[1],
    tier1SessionsPassed: tierSessionsPassed[1],
    tier2SessionsCompleted: tierSessionsCompleted[2],
    tier2SessionsPassed: tierSessionsPassed[2],
    tier3SessionsCompleted: tierSessionsCompleted[3],
    tier3SessionsPassed: tierSessionsPassed[3],
    bootstrappedFromEvidence: true,
    updatedAt: Date.now(),
  };
  if (directItemsAttempted > 0) await ref.set(progress, { merge: true });
  return progress;
}

function ccmrSessionPasses(summary = {}, requiredQuestions = 5) {
  const total = Math.max(1, Number(summary.completedQuestions || requiredQuestions || 1));
  const accuracy = Number(summary.correctQuestions || 0) / total;
  const independentRate = Number(summary.independentSuccesses || 0) / total;
  return accuracy >= 0.8 && independentRate >= 0.6;
}

function courseChallengeEarned(profile = {}) {
  const status = String(
    profile?.mastery?.status
    || profile?.performance?.key
    || profile?.status
    || "",
  ).trim().toLowerCase();
  const estimate = Number(profile?.mastery?.estimate ?? profile?.score ?? 0);
  return ["mastered", "masters"].includes(status)
    || (Number.isFinite(estimate) && estimate >= 90);
}

// Course Path progress is separate from mastery.
//
// "I finished this Path" means a student completed a full server-owned practice
// session. "Mastered" is a stronger evidence claim that also requires breadth,
// independent success and DOK 3+ evidence. The UI needs BOTH facts or a student
// can finish five questions and return to a card that looks untouched.
//
// This helper reads only session summaries/targets and never question payloads.
const COURSE_PATH_MAX_LEVEL = 3;

async function loadCoursePathPassProgress(db, studentId, { limit = 400 } = {}) {
  const snapshot = await db.collection("pathSessions")
    .where("studentId", "==", studentId)
    .limit(Math.max(20, Math.min(800, Number(limit) || 400)))
    .get();

  const byTeksCode = {};
  snapshot.docs.forEach((sessionDoc) => {
    const session = sessionDoc.data() || {};
    if (session.status !== "completed") return;
    if (session.sessionKind === "retentionProbe") return;
    if (session.assessmentFramework) return;
    if (session.coursePracticeIntent === "challenge") return;
    // Weekly Path is a separate commitment. Its sessions still contribute
    // mastery evidence and weekly completion, but they may be frozen at
    // Current learning, Retention, Challenge, or CCMR-transfer rigor. Counting
    // them as numbered Foundation/Deeper/Mastery passes would let low-rigor
    // weekly work advance the open-practice level by session count alone.
    if (session.weeklySlotKey) return;

    const alignmentKey = mathPath.canonicalAlignmentKey(session.target?.alignmentKey);
    const code = mathPath.displayAlignmentKey(alignmentKey);
    if (!alignmentKey || !code) return;

    const current = byTeksCode[code] || {
      teksCode: code,
      passesCompleted: 0,
      lastCompletedAt: 0,
      lastSummary: null,
      highestRecordedLevel: 0,
    };
    current.passesCompleted += 1;
    const completedAt = Number(session.completedAt || session.updatedAt || 0);
    if (completedAt >= Number(current.lastCompletedAt || 0)) {
      current.lastCompletedAt = completedAt;
      current.lastSummary = {
        completedQuestions: Number(session.summary?.completedQuestions || 0),
        correctQuestions: Number(session.summary?.correctQuestions || 0),
        independentSuccesses: Number(session.summary?.independentSuccesses || 0),
      };
    }
    current.highestRecordedLevel = Math.max(
      Number(current.highestRecordedLevel || 0),
      Number(session.coursePassLevel || 1),
    );
    byTeksCode[code] = current;
  });

  Object.values(byTeksCode).forEach((entry) => {
    entry.nextLevel = Math.min(COURSE_PATH_MAX_LEVEL, Number(entry.passesCompleted || 0) + 1);
    entry.advancedLoop = Number(entry.passesCompleted || 0) >= COURSE_PATH_MAX_LEVEL;
  });

  return {
    byTeksCode,
    skillsWithCompletedPasses: Object.keys(byTeksCode).length,
    totalCompletedPasses: Object.values(byTeksCode).reduce((sum, entry) => sum + Number(entry.passesCompleted || 0), 0),
  };
}

/** Student-safe completion/pass summary for the Path cards. */
exports.getMyMathPathSkillProgress = onCall((request) => withPathCallableDiagnostics("getMyMathPathSkillProgress", async () => {
  const { studentId } = requireStudent(request);
  const db = getFirestore();
  const progress = await loadCoursePathPassProgress(db, studentId);
  return { success: true, ...progress };
}));

const WEEKLY_PATH_GOAL_SNAPSHOTS = "weeklyPathGoalSnapshots";

// The canonicalizers every weekly-slot decision uses on this side of the wire.
const WEEKLY_SLOT_TEKS_TOOLS = Object.freeze({
  canonicalTeks: mathPath.canonicalAlignmentKey,
  displayTeks: mathPath.displayAlignmentKey,
  normalizeFramework: normalizePathAssessmentFramework,
});

// The freeze — every slot field, and each slot's sanitized "Swap a skill"
// alternatives — lives in shared/weeklyPathSlotAuthority.mjs, so the Teacher
// Path Simulator freezes a week by the same rule. Its errors already carry the
// HttpsError code to answer with.
async function sanitizeWeeklyPathGoalProposal(goal = {}, { studentId, classRecord, freezeInputs = {} }) {
  const slotAuthority = await import("./shared/weeklyPathSlotAuthority.mjs");
  try {
    return slotAuthority.freezeWeeklyPathGoalProposal(goal, {
      studentId,
      classId: classRecord?.classId,
      courseId: classRecord?.course,
      now: Date.now(),
      // The graded count, the short-week reason and the retention checks
      // come from the server's records, never the proposal.
      ...freezeInputs,
      ...WEEKLY_SLOT_TEKS_TOOLS,
    });
  } catch (error) {
    if (error?.name === "WeeklyPathGoalError") throw new HttpsError(error.code, error.message);
    throw error;
  }
}

/** Freeze the student's proposed autonomous week exactly once. */
exports.resolveWeeklyPathGoalSnapshot = onCall(async (request) => {
  const { studentId } = requireStudent(request);
  const db = getFirestore();
  const studentSnapshot = await db.collection("grades").doc(studentId).get();
  if (!studentSnapshot.exists) throw new HttpsError("not-found", "Your MathMaster student record is unavailable.");
  const classRecord = await loadStudentClass(db, studentSnapshot.data());
  if (!classRecord) throw new HttpsError("failed-precondition", "Your MathMaster class has not been assigned yet.");
  // A week already frozen is returned as it is: the checks below decide only
  // what a NEW snapshot may hold.
  const requestedWeekKey = String(request.data?.goal?.weekKey || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(requestedWeekKey)) {
    const frozen = await db.collection(WEEKLY_PATH_GOAL_SNAPSHOTS).doc(`${studentId}__${requestedWeekKey}`).get();
    if (frozen.exists) return { success: true, goal: frozen.data() };
  }
  const { loadWeeklyFreezeInputs } = require("./lib/weeklyPathFreezeInputs");
  // The proposal is passed only so a short one can be checked against the
  // server's own plan for the week; nothing in it sets the count.
  const freezeInputs = await loadWeeklyFreezeInputs({ db, studentId, studentData: studentSnapshot.data(), classRecord, goal: request.data?.goal || {}, now: Date.now() });
  const proposed = await sanitizeWeeklyPathGoalProposal(request.data?.goal || {}, { studentId, classRecord, freezeInputs });
  const ref = db.collection(WEEKLY_PATH_GOAL_SNAPSHOTS).doc(`${studentId}__${proposed.weekKey}`);
  const assigned = await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    if (existing.exists) return existing.data();
    const createdAt = Date.now();
    const next = { ...proposed, createdAt, updatedAt: createdAt, assignmentState: "assigned" };
    transaction.set(ref, next);
    return next;
  });
  return { success: true, goal: assigned };
});

/**
 * Read this student's already-frozen weekly commitment without creating or
 * changing it. Home uses this to decide whether "caught up" is actually true.
 * Returning only the caller's own snapshot keeps the same student isolation as
 * the session runtime and exposes no answer payloads.
 */
exports.getStudentWeeklyPathGoalSnapshot = onCall(async (request) => {
  const { studentId } = requireStudent(request);
  const weekKey = String(request.data?.weekKey || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekKey) || !Number.isFinite(Date.parse(`${weekKey}T00:00:00Z`))) {
    throw new HttpsError("invalid-argument", "A valid weekly Path weekKey is required.");
  }
  const db = getFirestore();
  const snapshot = await db.collection(WEEKLY_PATH_GOAL_SNAPSHOTS).doc(`${studentId}__${weekKey}`).get();
  return { success: true, goal: snapshot.exists ? snapshot.data() : null };
});

/**
 * The student's own recent weeks of Path: each frozen weekly goal graded by the
 * functions the Classroom publisher uses (weeklyPathCompletion.mjs and
 * gradeWeeklyGoal), and the "weeks hit" streak (weeklyPathHistory.mjs). Every
 * read is addressed by the caller's own studentId — goal ids are computed, not
 * scanned — and nothing in request.data can widen it. Aggregate facts only.
 */
exports.getMyWeeklyPathHistory = onCall((request) => withPathCallableDiagnostics("getMyWeeklyPathHistory", async () => {
  const { studentId } = requireStudent(request);
  const { loadWeeklyPathHistory } = require("./lib/weeklyPathHistory");
  const history = await loadWeeklyPathHistory(getFirestore(), {
    studentId,
    now: Date.now(),
    displayTeks: mathPath.displayAlignmentKey,
    goalCollection: WEEKLY_PATH_GOAL_SNAPSHOTS,
  });
  return { success: true, ...history };
}));

/**
 * The student's own weekly Path completions, counted by the SAME rule the
 * teacher table and the Classroom publisher use (weeklyPathCompletion.mjs):
 * only a session the server marked "completed" counts. Also returns the
 * student's unfinished sessions for this week's slots so the panel can offer
 * Resume. Only the caller's own sessions; aggregate facts only, no payloads.
 */
exports.getMyWeeklyPathCompletions = onCall((request) => withPathCallableDiagnostics("getMyWeeklyPathCompletions", async () => {
  const { studentId } = requireStudent(request);
  const weekKey = String(request.data?.weekKey || "").trim();
  const weeklyCompletion = await import("./shared/weeklyPathCompletion.mjs");
  const completionWindow = weeklyCompletion.weeklyCompletionWindow(weekKey);
  if (!completionWindow) throw new HttpsError("invalid-argument", "A valid weekly Path weekKey is required.");
  const db = getFirestore();
  const sessions = [];
  const collect = (snapshot) => snapshot.docs.forEach((doc) => sessions.push({ id: doc.id, data: doc.data() || {} }));

  // Every session launched from this week's slots, in any status. Two
  // equality filters are served by Firestore's single-field index merge, so
  // this needs no composite index and has no cap that could drop a slot.
  collect(await db.collection("pathSessions")
    .where("studentId", "==", studentId)
    .where("weekKey", "==", weekKey)
    .get());

  // Open practice finished inside the week. The grader's legacy rule lets a
  // completed session on the slot's own TEKS fill it, so the student must see
  // the same sessions the teacher's table sees.
  let truncated = false;
  try {
    collect(await db.collection("pathSessions")
      .where("studentId", "==", studentId)
      .where("completedAt", ">=", completionWindow.start)
      .where("completedAt", "<", completionWindow.end)
      .get());
  } catch (error) {
    // Composite index (studentId, completedAt) not built yet: fall back to the
    // student's sessions without a range, filtered here.
    if (Number(error?.code) !== 9 && error?.code !== "failed-precondition") throw error;
    const LIMIT = 1000;
    const fallback = await db.collection("pathSessions").where("studentId", "==", studentId).limit(LIMIT).get();
    truncated = fallback.size >= LIMIT;
    collect(fallback);
  }

  const { completions, inProgress } = weeklyCompletion.collectWeeklyPathSessions({
    sessions,
    weekKey,
    displayTeks: mathPath.displayAlignmentKey,
  });
  return { success: true, weekKey, completions, inProgress, truncated };
}));

/**
 * Save the signed-in student's own CCMR plan: the tests they are preparing for
 * and an optional test date. The ONLY write path for studentCcmrPlans — the
 * rules refuse every client write. Validation, caps and the record shape live
 * in shared/ccmrPlan.mjs; this reads the roster row for the authorization
 * context and writes once, inside a transaction, only when something changed.
 */
exports.setMyCcmrPlan = onCall((request) => withPathCallableDiagnostics("setMyCcmrPlan", async () => {
  const { studentId } = requireStudent(request);
  const ccmrPlan = await import("./shared/ccmrPlan.mjs");
  const validated = ccmrPlan.validateCcmrPlanInput(request.data, { now: Date.now() });
  if (!validated.ok) throw new HttpsError("invalid-argument", validated.message);
  const db = getFirestore();
  const studentSnapshot = await db.collection("grades").doc(studentId).get();
  if (!studentSnapshot.exists) throw new HttpsError("not-found", "Your MathMaster student record is unavailable.");
  const student = studentSnapshot.data() || {};
  const classRecord = await loadStudentClass(db, student);
  const ref = db.collection(ccmrPlan.CCMR_PLAN_COLLECTION).doc(studentId);
  const saved = await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    const { record, unchanged } = ccmrPlan.buildCcmrPlanRecord({
      studentId, plan: validated.plan, existing: existing.exists ? existing.data() : null, student, classRecord, now: Date.now(),
    });
    if (unchanged) return existing.data();
    transaction.set(ref, record);
    return record;
  });
  return { success: true, plan: ccmrPlan.publicCcmrPlan(saved) };
}));

/**
 * Teacher-only weekly Path progress for one real class.
 *
 * `pathSessions` is intentionally server-only. The teacher UI needs completion
 * facts for weekly goals, but it must never receive answer keys or the private
 * current-question payload. This callable therefore returns only completed
 * session IDs, timestamps, target TEKS and aggregate accuracy.
 */
exports.getTeacherWeeklyPathCompletions = onCall(async (request) => {
  await requireTeacher(request);
  const db = getFirestore();
  const classId = String(request.data?.classId || "").trim();
  if (!classId) throw new HttpsError("invalid-argument", "classId is required.");

  const classRef = db.collection(CLASS_COLLECTION).doc(classId);
  const classSnapshot = await classRef.get();
  if (!classSnapshot.exists) throw new HttpsError("not-found", "That class no longer exists.");
  const classRecord = { classId, ...classSnapshot.data() };
  const email = callerEmail(request);
  const teacherOfRecord = String(classRecord.teacherOfRecord || "").trim().toLowerCase();
  const isRoot = Boolean(email && email === authLib.ROOT_ADMIN_EMAIL);
  if (!isRoot && (!email || teacherOfRecord !== email)) {
    throw new HttpsError("permission-denied", "Only the teacher of record for this class can view its Weekly Path progress.");
  }

  const weekKey = String(request.data?.weekKey || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekKey)) {
    throw new HttpsError("invalid-argument", "weekKey must be YYYY-MM-DD.");
  }
  const weeklyCompletion = await import("./shared/weeklyPathCompletion.mjs");
  const completionWindow = weeklyCompletion.weeklyCompletionWindow(weekKey);
  if (!completionWindow) throw new HttpsError("invalid-argument", "weekKey is not a valid date.");
  // The Classroom publisher's window (the week plus the Sunday-evening day), so
  // the teacher's table counts exactly the sessions the grade will count.
  const { start: weekStart, end: weekEnd } = completionWindow;

  const roster = await db.collection("grades").where("classId", "==", classId).get();
  const studentIds = new Set(roster.docs
    .filter((studentDoc) => studentDoc.data()?.status !== "disabled")
    .map((studentDoc) => studentDoc.id));
  const byStudentId = Object.fromEntries([...studentIds].map((studentId) => [studentId, []]));
  const goalsByStudentId = {};
  if (!studentIds.size) return { classId, weekKey, byStudentId, goalsByStudentId };

  // Snapshot IDs are deterministic, so this needs no collection scan or new
  // composite index. The teacher sees the same frozen commitment the student
  // is graded against, not a plan recomputed from today's newer evidence.
  const goalSnapshots = await Promise.all([...studentIds].map(async (studentId) => {
    const snapshot = await db.collection(WEEKLY_PATH_GOAL_SNAPSHOTS).doc(`${studentId}__${weekKey}`).get();
    return [studentId, snapshot.exists ? snapshot.data() : null];
  }));
  goalSnapshots.forEach(([studentId, goal]) => { if (goal) goalsByStudentId[studentId] = goal; });

  // One indexed time-range query for the week, then a membership filter. This
  // avoids one Firestore query per student and scales with weekly Path activity
  // rather than roster size.
  //
  // It is READ IN PAGES, and that is the point. A single `.limit(5000)` over a
  // district-wide week silently discards everything past the cap — and it
  // discards it BEFORE the class filter runs, so the students who lose their
  // completions are chosen by document order rather than by anything a teacher
  // could see. The failure mode is a weekly Path grade that is quietly too low,
  // which is exactly the kind of wrong number nobody reports as a bug.
  //
  // Cursoring on `completedAt` needs no composite index beyond the single-field
  // index this range filter already uses, so this stays deployable as-is.
  const PAGE_SIZE = 1000;
  const MAX_PAGES = 40; // 40k completed sessions in one week; far past any real district.
  const sessionDocs = [];
  let cursor = null;
  let truncated = false;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    let query = db.collection("pathSessions")
      .where("completedAt", ">=", weekStart)
      .where("completedAt", "<", weekEnd)
      .orderBy("completedAt")
      .limit(PAGE_SIZE);
    if (cursor) query = query.startAfter(cursor);
    const page$ = await query.get();
    if (page$.empty) break;
    sessionDocs.push(...page$.docs);
    cursor = page$.docs[page$.docs.length - 1];
    if (page$.size < PAGE_SIZE) break;
    if (page === MAX_PAGES - 1) truncated = true;
  }

  // The same completion rule the student panel and the Classroom publisher use.
  sessionDocs.forEach((sessionDoc) => {
    const session = sessionDoc.data() || {};
    const studentId = String(session.studentId || "");
    if (!studentIds.has(studentId)) return;
    const completion = weeklyCompletion.completionFromPathSession(sessionDoc.id, session, { displayTeks: mathPath.displayAlignmentKey });
    if (completion) byStudentId[studentId].push(completion);
  });

  Object.values(byStudentId).forEach((rows) => rows.sort((a, b) => a.completedAt - b.completedAt));
  // `truncated` is returned rather than swallowed: if it is ever true the grades
  // on this screen are incomplete, and the screen has to be able to say so
  // instead of presenting a short count as fact.
  return { classId, weekKey, byStudentId, goalsByStudentId, truncated };
});

// --- Weekly Path in Google Classroom ---------------------------------------
//
// One coursework item per class per week, and an end-of-week job that grades it
// automatically. Automatic publishing removes the human who used to look at each
// number before it reached a parent, so two things carry that weight instead:
// the decision function in weeklyPathClassroom.js, and the per-class switch
// below, which DEFAULTS OFF. Deploying this must never retroactively push grades
// for a class nobody has reviewed.
const WEEKLY_PATH_CLASSROOM_CONFIG = "weeklyPathClassroomConfig";
const WEEKLY_PATH_CLASSROOM_SYNCS = "weeklyPathClassroomSyncs";
const WEEKLY_PATH_DEFAULT_MAX_POINTS = 100;

exports.getWeeklyPathClassroomSync = onCall(async (request) => {
  const classId = String(request.data?.classId || "").trim();
  if (!classId) throw new HttpsError("invalid-argument", "classId is required.");
  await requireClassTeacher(request, classId);
  const snapshot = await getFirestore().collection(WEEKLY_PATH_CLASSROOM_CONFIG).doc(classId).get();
  const config = snapshot.exists ? snapshot.data() : null;
  return {
    classId,
    enabled: config?.enabled === true,
    maxPoints: Number(config?.maxPoints) || WEEKLY_PATH_DEFAULT_MAX_POINTS,
    updatedAt: serializableDate(config?.updatedAt),
    updatedByEmail: config?.updatedByEmail || null,
  };
});

exports.setWeeklyPathClassroomSync = onCall(async (request) => {
  const classId = String(request.data?.classId || "").trim();
  if (!classId) throw new HttpsError("invalid-argument", "classId is required.");
  await requireClassTeacher(request, classId);

  const enabled = request.data?.enabled === true;
  const requestedPoints = Number(request.data?.maxPoints);
  const maxPoints = Number.isFinite(requestedPoints)
    ? Math.max(1, Math.min(1000, Math.round(requestedPoints)))
    : WEEKLY_PATH_DEFAULT_MAX_POINTS;

  await getFirestore().collection(WEEKLY_PATH_CLASSROOM_CONFIG).doc(classId).set({
    classId,
    enabled,
    maxPoints,
    updatedByUid: request.auth?.uid || null,
    updatedByEmail: callerEmail(request) || null,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  logger.info("Weekly Path Classroom publishing setting changed", { classId, enabled, maxPoints });
  return { classId, enabled, maxPoints };
});

/**
 * Everything one class-week needs, read once.
 *
 * `truncated` is carried out rather than swallowed: a partial read produces
 * grades that are quietly too low, and the sync refuses to publish on it.
 */
async function loadWeeklyPathClassWeek(db, { classId, weekKey }) {
  // One extra day past the UTC week boundary (see weeklyPathCompletion.mjs):
  // the week closes at local midnight, which is early Monday in UTC. Matching
  // is by frozen slot key and weekKey, so the extra day cannot miscount.
  const weeklyCompletion = await import("./shared/weeklyPathCompletion.mjs");
  const completionWindow = weeklyCompletion.weeklyCompletionWindow(weekKey);
  if (!completionWindow) throw new HttpsError("invalid-argument", "weekKey must be YYYY-MM-DD.");
  const { start: weekStart, end: weekEnd } = completionWindow;

  const roster = await db.collection("grades").where("classId", "==", classId).get();
  const students = roster.docs
    .filter((doc) => doc.data()?.status !== "disabled")
    .map((doc) => ({ studentId: doc.id, googleUserId: String(doc.data()?.googleUserId || "").trim() || null }));
  if (!students.length) return { students: [], goalsByStudentId: {}, completionsByStudentId: {}, absentStudentIds: [], truncated: false };

  const goalsByStudentId = {};
  const goalDocs = await Promise.all(students.map(async ({ studentId }) => {
    const snapshot = await db.collection(WEEKLY_PATH_GOAL_SNAPSHOTS).doc(`${studentId}__${weekKey}`).get();
    return [studentId, snapshot.exists ? snapshot.data() : null];
  }));
  goalDocs.forEach(([studentId, goal]) => { if (goal) goalsByStudentId[studentId] = goal; });

  const ids = new Set(students.map((entry) => entry.studentId));
  const completionsByStudentId = Object.fromEntries([...ids].map((id) => [id, []]));
  const PAGE_SIZE = 1000;
  const MAX_PAGES = 40;
  let cursor = null;
  let truncated = false;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    let query = db.collection("pathSessions")
      .where("completedAt", ">=", weekStart)
      .where("completedAt", "<", weekEnd)
      .orderBy("completedAt")
      .limit(PAGE_SIZE);
    if (cursor) query = query.startAfter(cursor);
    // eslint-disable-next-line no-await-in-loop
    const pageDocs = await query.get();
    if (pageDocs.empty) break;
    pageDocs.docs.forEach((sessionDoc) => {
      const session = sessionDoc.data() || {};
      const studentId = String(session.studentId || "");
      if (!ids.has(studentId)) return;
      const completion = weeklyCompletion.completionFromPathSession(sessionDoc.id, session, { displayTeks: mathPath.displayAlignmentKey });
      if (completion) completionsByStudentId[studentId].push(completion);
    });
    cursor = pageDocs.docs[pageDocs.docs.length - 1];
    if (pageDocs.size < PAGE_SIZE) break;
    if (page === MAX_PAGES - 1) truncated = true;
  }

  // Who the teacher marked absent this week (TT03): one read per day, by class
  // and date (the shape Recovery reads attendance in), resolved by the one rule
  // the attendance screens use.
  const { studentsMarkedAbsent } = await import("./shared/attendanceDay.mjs");
  const weekDays = weeklyCompletion.weekDateKeys(weekKey);
  const attendanceDays = await Promise.all(weekDays.map((dateKey) => db.collection("studentSupportEvents")
    .where("classId", "==", classId)
    .where("dateKey", "==", dateKey)
    .get()));
  const absentStudentIds = [...studentsMarkedAbsent({
    supportEvents: attendanceDays.flatMap((snapshot) => snapshot.docs.map((doc) => doc.data() || {})),
    classId,
    dateKeys: weekDays,
  })];

  return { students, goalsByStudentId, completionsByStudentId, absentStudentIds, truncated };
}

/**
 * Run one class-week end to end.
 *
 * Shared by the scheduled job and the teacher's manual "run now", so the thing
 * a teacher previews is literally the thing the schedule will do.
 */
async function runWeeklyPathClassroomSync({ classId, weekKey, dryRun = false, now = Date.now() }) {
  const db = getFirestore();
  const configSnapshot = await db.collection(WEEKLY_PATH_CLASSROOM_CONFIG).doc(classId).get();
  const config = configSnapshot.exists ? configSnapshot.data() : null;
  const enabled = config?.enabled === true;
  const maxPoints = Number(config?.maxPoints) || WEEKLY_PATH_DEFAULT_MAX_POINTS;

  const mappings = await db.collection("classroomCourseMappings").where("classId", "==", classId).limit(1).get();
  const mapping = mappings.empty ? null : mappings.docs[0].data();
  const courseId = String(mapping?.courseId || "").trim();
  const teacherUid = String(mapping?.teacherUid || "").trim();
  if (!courseId || !teacherUid) {
    return { ok: false, classId, weekKey, reason: "class_is_not_linked_to_a_google_classroom_course", results: [] };
  }

  const syncId = `${classId}__${weekKey}`;
  const priorSnapshot = await db.collection(WEEKLY_PATH_CLASSROOM_SYNCS).doc(syncId).get();
  const publishedByStudentId = priorSnapshot.exists ? (priorSnapshot.data()?.publishedByStudentId || {}) : {};

  const data = await loadWeeklyPathClassWeek(db, { classId, weekKey });
  const classroom = await classroomLib.getClassroomClient(teacherUid);
  const { gradeWeeklyGoal } = await import("./shared/weeklyPathGrade.mjs");

  const report = await weeklyPathSync.syncWeeklyPathClassWeek({
    classId,
    weekKey,
    weekLabel: weekKey,
    courseId,
    enabled,
    maxPoints,
    launchUrl: readStudentAppBaseUrl(),
    students: data.students,
    goalsByStudentId: data.goalsByStudentId,
    completionsByStudentId: data.completionsByStudentId,
    publishedByStudentId,
    absentStudentIds: data.absentStudentIds,
    truncated: data.truncated,
    now,
    dryRun,
    gradeWeeklyGoal,
    logger,
    findCourseWork: (course, marker) => classroomLib.findCourseWorkByPublicationMarker(classroom, course, marker),
    createCourseWork: (course, work) => classroomLib.createCourseWork(classroom, {
      courseId: course,
      title: work.title,
      description: work.description,
      launchUrl: readStudentAppBaseUrl(),
      maxPoints: work.maxPoints,
      materials: [],
    }),
    findSubmission: (args) => classroomLib.findSubmissionForStudent(classroom, args),
    patchGrade: (args) => classroomLib.patchGrade(classroom, args),
    returnSubmission: (args) => classroomLib.returnSubmission(classroom, args),
  });

  if (!dryRun && report.ok) {
    const nextPublished = { ...publishedByStudentId };
    report.results.filter((entry) => entry.published).forEach((entry) => {
      nextPublished[entry.studentId] = { points: entry.points, score: entry.score, at: Date.now() };
    });
    await db.collection(WEEKLY_PATH_CLASSROOM_SYNCS).doc(syncId).set({
      classId,
      weekKey,
      courseId,
      courseWorkId: report.courseWorkId || null,
      publishedByStudentId: nextPublished,
      lastRunAt: FieldValue.serverTimestamp(),
      lastPublishedCount: report.published,
      lastSkippedCount: report.skipped,
    }, { merge: true });
  }

  return report;
}

exports.runWeeklyPathClassroomSyncNow = onCall({
  secrets: GOOGLE_API_SECRETS,
  timeoutSeconds: 300,
  memory: "512MiB",
}, async (request) => {
  const classId = String(request.data?.classId || "").trim();
  if (!classId) throw new HttpsError("invalid-argument", "classId is required.");
  await requireClassTeacher(request, classId);
  const weekKey = String(request.data?.weekKey || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekKey)) {
    throw new HttpsError("invalid-argument", "weekKey must be YYYY-MM-DD.");
  }
  return runWeeklyPathClassroomSync({
    classId,
    weekKey,
    dryRun: request.data?.dryRun === true,
  });
});

/**
 * Students' questions to their teachers, and the answers, are kept one school
 * year after their last change, then removed (TT26; the period lives in
 * functions/shared/askTeacherLifecycle.mjs). Nightly, bounded per run; a
 * backlog finishes over the following nights.
 */
exports.expireAskTeacherQuestions = onSchedule({
  schedule: "17 3 * * *",
  timeZone: "America/Chicago",
  timeoutSeconds: 300,
  memory: "512MiB",
  invoker: "private",
}, async () => {
  const db = getFirestore();
  const lifecycle = await import("./shared/askTeacherLifecycle.mjs");
  const cutoff = new Date(Date.now() - lifecycle.ASK_TEACHER_RETENTION_MS);
  let removed = 0;
  for (let round = 0; round < 10; round += 1) {
    // eslint-disable-next-line no-await-in-loop
    const expired = await db.collection(lifecycle.ASK_TEACHER_COLLECTION).where("updatedAt", "<", cutoff).limit(400).get();
    if (expired.empty) break;
    const batch = db.batch();
    expired.docs.forEach((entry) => batch.delete(entry.ref));
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
    removed += expired.size;
    if (expired.size < 400) break;
  }
  logger.info("Ask my teacher questions past their retention removed", { removed });
});

/**
 * Monday morning, after the week closes at midnight Sunday night.
 *
 * Deliberately not Sunday evening: a student finishing at 11pm on the due date
 * should have that count, and a job that runs before the week is really over
 * publishes a grade the student could still have changed. Monday morning also
 * means a teacher sees the week's grades before first period.
 */
exports.publishWeeklyPathGrades = onSchedule({
  schedule: "0 7 * * 1",
  timeZone: "America/Chicago",
  secrets: GOOGLE_API_SECRETS,
  timeoutSeconds: 540,
  memory: "512MiB",
  invoker: "private",
}, async () => {
  const db = getFirestore();
  const enabledClasses = await db.collection(WEEKLY_PATH_CLASSROOM_CONFIG).where("enabled", "==", true).get();
  if (enabledClasses.empty) {
    logger.info("Weekly Path grade publishing: no classes have it enabled");
    return;
  }

  // The week that just ended, not the one starting now. Derived with the same
  // weekKeyFor the student's week was built with — a second definition here
  // would let the job grade a week nobody was ever assigned.
  const now = Date.now();
  const { weekKeyFor } = await import("./shared/weeklyPathGrade.mjs");
  const weekKey = weekKeyFor(now - 3 * 24 * 60 * 60 * 1000);
  logger.info("Weekly Path grade publishing starting", { weekKey, classes: enabledClasses.size });

  for (const classDoc of enabledClasses.docs) {
    const classId = classDoc.id;
    try {
      // eslint-disable-next-line no-await-in-loop
      const report = await runWeeklyPathClassroomSync({ classId, weekKey, now });
      logger.info("Weekly Path grades published", {
        classId, weekKey, ok: report.ok, published: report.published || 0, skipped: report.skipped || 0,
        reason: report.reason || null,
      });
    } catch (error) {
      // One broken class must not stop the rest from being graded.
      logger.error("Weekly Path grade publishing failed for one class", {
        classId, weekKey, message: error?.message || String(error),
      });
    }
  }
});

/**
 * One teacher can temporarily lift ONE student's current TEKS into the front of
 * Recommended for You without changing the whole class.
 *
 * This is intentionally a recommendation, not a force-start and not a mastery
 * edit. The normal Path prerequisite/coverage gates still decide whether the
 * skill can actually be launched. Private concern notes stay in
 * studentSupportEvents; the student-readable intervention doc contains only the
 * instructional action.
 */
exports.setStudentPathIntervention = onCall(async (request) => {
  const teacherUid = await requireTeacher(request);
  const teacherEmail = callerEmail(request);
  const studentId = String(request.data?.studentId || "").trim();
  if (!studentId) throw new HttpsError("invalid-argument", "studentId is required.");

  const db = getFirestore();
  const studentRef = db.collection("grades").doc(studentId);
  const studentSnapshot = await studentRef.get();
  if (!studentSnapshot.exists) throw new HttpsError("not-found", "That student is not on the MathMaster roster.");
  const studentData = studentSnapshot.data() || {};
  const assignedTeacherEmail = String(studentData.assignedTeacherEmail || "").trim().toLowerCase();
  const isRoot = authLib.isRootAdminEmail(teacherEmail);
  if (!isRoot && (!teacherEmail || assignedTeacherEmail !== teacherEmail)) {
    throw new HttpsError("permission-denied", "Only the student's teacher of record can change this personal Path recommendation.");
  }

  const interventionRef = db.collection("studentPathInterventions").doc(studentId);
  const clear = request.data?.clear === true;
  if (clear) {
    await interventionRef.delete();
    await db.collection("studentPathInterventionAudit").add({
      teacherUid,
      teacherEmail,
      studentId,
      classId: studentData.classId || null,
      action: "clear",
      createdAt: FieldValue.serverTimestamp(),
    });
    return { success: true, cleared: true };
  }

  const displayCode = mathPath.displayAlignmentKey(request.data?.teksCode);
  const canonicalKey = mathPath.canonicalAlignmentKey(displayCode);
  if (!canonicalKey) throw new HttpsError("invalid-argument", "Choose a valid TEKS before recommending Path practice.");

  const graph = await pathRouting.skillGraph();
  const skillId = graph.teksSkillId(displayCode);
  const skill = graph.resolveSkillAnywhere(skillId);
  if (!skill) throw new HttpsError("invalid-argument", "That TEKS is not a loaded MathMaster Path skill.");

  const studentClass = await loadStudentClass(db, studentData);
  const studentCourseId = String(studentClass?.course || "").trim();
  if (studentCourseId && skill.courseId !== studentCourseId) {
    throw new HttpsError(
      "failed-precondition",
      "Live Path recommendations must stay on the student's current course TEKS. Use Weekly Path/Path controls for a broader prerequisite intervention.",
    );
  }

  const launchable = await livePathSkillIsLaunchable(db, canonicalKey);
  if (!launchable) {
    throw new HttpsError(
      "failed-precondition",
      `MathMaster does not have enough published secure Path content for ${displayCode} yet.`,
      { reason: "no-path-coverage" },
    );
  }

  const durationHours = Math.max(1, Math.min(168, Number(request.data?.durationHours) || 48));
  const now = Date.now();
  const intervention = {
    studentId,
    classId: studentClass?.classId || studentData.classId || null,
    classPeriod: studentClass?.period || studentData.classPeriod || null,
    skillId,
    teksCode: displayCode,
    action: "recommend",
    source: "teacher-live",
    createdAt: now,
    updatedAt: now,
    expiresAt: now + durationHours * 60 * 60 * 1000,
  };

  await interventionRef.set(intervention);
  await db.collection("studentPathInterventionAudit").add({
    teacherUid,
    teacherEmail,
    studentId,
    classId: intervention.classId,
    skillId,
    teksCode: displayCode,
    action: "recommend",
    expiresAt: intervention.expiresAt,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { success: true, intervention };
});

/** Start or resume one server-owned learning-path session for a TEKS target. */
exports.startMyMathPathSession = onCall((request) => withPathCallableDiagnostics("startMyMathPathSession", async () => {
  const { studentId } = requireStudent(request);
  let targetAlignmentKey = mathPath.canonicalAlignmentKey(request.data?.targetAlignmentKey);
  if (!targetAlignmentKey) throw new HttpsError("invalid-argument", "targetAlignmentKey is required.");
  // `let`: a weekly slot's frozen purpose can settle the kind below.
  let sessionKind = request.data?.sessionKind === "retentionProbe" ? "retentionProbe" : "practice";
  let requiredQuestions = pathSessionRequiredQuestions(sessionKind, request.data?.requiredQuestions);
  let assessmentFramework = normalizePathAssessmentFramework(request.data?.assessmentFramework);
  const requestedCoursePracticeIntent = String(request.data?.coursePracticeIntent || "").trim() === "challenge"
    ? "challenge"
    : null;
  const db = getFirestore();

  const studentSnapshot = await db.collection("grades").doc(studentId).get();
  if (!studentSnapshot.exists) throw new HttpsError("not-found", "Your MathMaster student record is unavailable.");
  const studentData = studentSnapshot.data() || {};
  const [studentClass, legacyCourseSettings] = await Promise.all([
    loadStudentClass(db, studentData),
    db.collection("settings").doc("courseProfiles").get(),
  ]);
  const legacyCourse = legacyCourseSettings.data()?.profiles?.[studentData.classPeriod] || {};
  const courseId = studentClass?.course || legacyCourse.course || coverageCourseIdFor(targetAlignmentKey);
  const courseLevel = studentClass?.courseLevel || legacyCourse.courseLevel || "standard";
  let ccmrChallengeTier = 1;
  let ccmrProgress = null;
  if (assessmentFramework) {
    ccmrProgress = await loadCcmrProgress(db, studentId, targetAlignmentKey, assessmentFramework);
    ccmrChallengeTier = resolveServerCcmrChallengeTier(ccmrProgress);
    // Once direct practice has been demonstrated, a repeat visit becomes a
    // short harder set instead of another five questions at the same level.
    if (ccmrChallengeTier >= 2 && sessionKind !== "retentionProbe") requiredQuestions = 3;
  }

  // Weekly launches are resolved against the frozen server commitment. The
  // browser may choose which assigned row the student clicks — and, on a row
  // frozen with "Swap a skill" alternatives, which of those standards to
  // practise — but it cannot turn that row into any other TEKS, framework, DOK
  // or difficulty. The rule is shared with the Teacher Path Simulator
  // (shared/weeklyPathSlotAuthority.mjs).
  const requestedWeekKey = String(request.data?.weekKey || "").trim() || null;
  const requestedWeeklySlotKey = String(request.data?.weeklySlotKey || "").trim() || null;
  let weeklySlot = null;
  let weeklySwap = null;
  let slotAuthority = null;
  if (requestedWeeklySlotKey || requestedWeekKey) {
    if (!requestedWeeklySlotKey || !requestedWeekKey || !/^\d{4}-\d{2}-\d{2}$/.test(requestedWeekKey)) {
      throw new HttpsError("invalid-argument", "weekKey and weeklySlotKey are both required for an assigned weekly session.");
    }
    const snapshot = await db.collection(WEEKLY_PATH_GOAL_SNAPSHOTS).doc(`${studentId}__${requestedWeekKey}`).get();
    slotAuthority = await import("./shared/weeklyPathSlotAuthority.mjs");
    const authorization = slotAuthority.authorizeWeeklySlotLaunch({
      goal: snapshot.exists ? (snapshot.data() || {}) : null,
      weeklySlotKey: requestedWeeklySlotKey,
      targetAlignmentKey,
      requestedFramework: assessmentFramework,
      // Which option the browser says it picked. A label, never a permission:
      // the target must still be one of the slot's frozen standards.
      chosenSkillId: String(request.data?.chosenSkillId || "").trim().slice(0, 180) || null,
      classId: studentClass?.classId || null,
      ...WEEKLY_SLOT_TEKS_TOOLS,
    });
    if (!authorization.ok) throw new HttpsError(authorization.code, authorization.message, { reason: authorization.reason });
    weeklySlot = authorization.slot;
    weeklySwap = authorization.swapped
      ? { swappedFromTeks: authorization.swappedFromTeks, chosenAlternative: authorization.chosenAlternative }
      : null;
    assessmentFramework = authorization.assessmentFramework;
  }

  // A RETENTION SLOT IS A RETENTION CHECK (functions/shared/pathRetentionCheck.mjs).
  // The slot's frozen purpose decides the session kind, not the browser: only
  // a retentionProbe moves the retention schedule, so practice launched on a
  // Retention slot filled it without ever clearing the check. A browser a
  // release behind still asks for practice and is given the check; a check
  // asked for on any other slot is refused.
  const retentionCheck = await import("./shared/pathRetentionCheck.mjs");
  if (weeklySlot) {
    const weeklyKind = retentionCheck.resolveWeeklySlotSessionKind({ slotPurpose: weeklySlot.purpose, requestedSessionKind: sessionKind });
    if (!weeklyKind.ok) throw new HttpsError("failed-precondition", weeklyKind.message, { reason: weeklyKind.reason });
    if (weeklyKind.sessionKind !== sessionKind) {
      sessionKind = weeklyKind.sessionKind;
      requiredQuestions = pathSessionRequiredQuestions(sessionKind, request.data?.requiredQuestions);
    }
  }

  // A weekly slot can supply the assessment framework after the initial request
  // was normalized, so resolve its progression after that authority check too.
  if (assessmentFramework && !ccmrProgress) {
    ccmrProgress = await loadCcmrProgress(db, studentId, targetAlignmentKey, assessmentFramework);
    ccmrChallengeTier = resolveServerCcmrChallengeTier(ccmrProgress);
    if (ccmrChallengeTier >= 2 && sessionKind !== "retentionProbe") requiredQuestions = 3;
  }

  // AN OPEN RETENTION CHECK MUST BE DUE (MP21). A weekly Retention slot was
  // checked when its week froze; a check started from the map, the banner or
  // the Overview is checked here, by the ONE rule the student's screen offered
  // it by (favourableMastery.js, MP22): Mastered by the server's record or the
  // assignment record, and due by the stored schedule or the time since it was
  // last shown. Decided before the transaction, and enforced there only for a
  // NEW check: an open one is always resumed.
  let openRetentionCheckDue = true;
  if (sessionKind === "retentionProbe" && !requestedWeeklySlotKey) {
    const [profilesSnapshot, schedulesSnapshot] = await Promise.all([
      db.collection("studentMasteryProfiles").doc(studentId).get(),
      db.collection("studentRetentionSchedules").doc(studentId).get(),
    ]);
    const checkCode = mathPath.displayAlignmentKey(targetAlignmentKey);
    const due = await favourableMastery.retentionDueByOneRule({
      db,
      studentId,
      studentData,
      classRecord: studentClass,
      serverProfiles: profilesSnapshot.data()?.profiles || {},
      schedules: schedulesSnapshot.data()?.schedules || {},
      displayCodes: [checkCode],
      now: Date.now(),
    });
    openRetentionCheckDue = due.get(checkCode) === true;
  }

  // A CHALLENGE IS EARNED BY THE ONE RULE (MP22). The student's screen offers
  // a Challenge card for a skill ahead of the class whose prerequisites are
  // strong, by the more favourable record. The server used to ask whether the
  // TARGET skill itself was Mastered on its own profile, which a Challenge
  // skill never is: every such launch was refused on its first question and
  // left an open session that blocked the skill. Now the server asks the
  // student's own Path; the old answer still counts. Not earned, the launch is
  // ordinary practice on the skill: harder questions are never granted without
  // the server's evidence.
  const challengeAsked = requestedCoursePracticeIntent === "challenge"
    && !assessmentFramework
    && sessionKind !== "retentionProbe"
    && !requestedWeeklySlotKey;
  let challengeEarned = false;
  if (challengeAsked) {
    const masterySnapshot = await db.collection("studentMasteryProfiles").doc(studentId).get();
    const serverProfiles = masterySnapshot.data()?.profiles || {};
    const challengeCode = mathPath.displayAlignmentKey(targetAlignmentKey);
    challengeEarned = await favourableMastery.courseChallengeEarnedByOneRule({
      db,
      studentId,
      studentData,
      classRecord: studentClass,
      courseId,
      targetDisplayCode: challengeCode,
      serverProfiles,
      ownProfileEarned: courseChallengeEarned(serverProfiles[challengeCode] || {}),
      now: Date.now(),
    });
  }

  const coursePracticeIntent = requestedCoursePracticeIntent
    && !assessmentFramework
    && sessionKind !== "retentionProbe"
    && !requestedWeeklySlotKey
    && challengeEarned
    ? requestedCoursePracticeIntent
    : null;

  // Ordinary course practice has visible passes too. Pass 1 is the foundation
  // session; later passes deliberately ask the selector for more demanding
  // work. This is NOT mastery — mastery remains evidence-driven.
  let priorCoursePasses = 0;
  let coursePassLevel = null;
  if (!assessmentFramework && sessionKind !== "retentionProbe" && !requestedWeeklySlotKey && coursePracticeIntent !== "challenge") {
    const passProgress = await loadCoursePathPassProgress(db, studentId);
    const targetCode = mathPath.displayAlignmentKey(targetAlignmentKey);
    priorCoursePasses = Number(passProgress.byTeksCode?.[targetCode]?.passesCompleted || 0);
    coursePassLevel = Math.min(COURSE_PATH_MAX_LEVEL, priorCoursePasses + 1);
  }

  // Refuse a standard the secure bank cannot issue a question for, and refuse
  // it HERE — at the start, with an explanation — rather than letting the
  // student open a session that dies on its first question. The wheel already
  // hides these, but a launch link, a stale tab or a direct call must meet the
  // same rule, so the check is not left to the browser.
  //
  // Coverage that has never been computed does not block: this is an integrity
  // guard over published content, and failing closed on a missing index would
  // take down every course the moment the index was absent. The gap it leaves
  // is exactly the pre-existing behaviour — issueNextQuestion still refuses,
  // with its own message.
  const coverageForCourse = await db.collection(COVERAGE_COLLECTION).doc(coverageCourseIdFor(targetAlignmentKey)).get();
  if (coverageForCourse.exists) {
    const coverage = await pathCoverage();
    if (!coverage.isSkillLaunchable(coverageForCourse.data(), targetAlignmentKey)) {
      const liveReady = await livePathSkillIsLaunchable(db, targetAlignmentKey);
      if (liveReady) {
        logger.warn("Repairing stale Path coverage from the current secure bank", {
          targetAlignmentKey,
          courseId: coverageCourseIdFor(targetAlignmentKey),
        });
        await rebuildStoredPathCoverage(db);
      } else {
        throw new HttpsError(
          "failed-precondition",
          coverage.explainCoverage(coverageForCourse.data(), targetAlignmentKey),
          { reason: "no-path-coverage" },
        );
      }
    }
  }
  let assessmentReleaseState = {
    framework: assessmentFramework || null,
    tracked: false,
    release: null,
    matchingFamilies: 0,
  };

  // A CCMR launch is allowed to call itself SAT/ACT/TSIA2/ASVAB practice only
  // when that exact framework has a full secure session of directly-authored
  // exam-style families. The ordinary TEKS coverage index is intentionally not
  // enough: crosswalk overlap is not direct assessment evidence.
  if (assessmentFramework) {
    const frameworkSnapshot = await db.collection("pathQuestionBank")
      .where("alignmentKeys", "array-contains", targetAlignmentKey)
      .limit(40)
      .get();
    const frameworkRecords = frameworkSnapshot.docs
      .map((questionDoc) => ({ id: questionDoc.id, ...questionDoc.data() }))
      .filter((question) => question.active !== false)
      .filter((question) => pathQuestionMatchesFramework(question, assessmentFramework));
    assessmentReleaseState = await loadAssessmentContentReleaseState(db, assessmentFramework, frameworkRecords);
    const activeFrameworkRecords = assessmentReleaseState.tracked
      ? frameworkRecords.filter((question) => String(question?.ccmrContentRelease || "").trim() === String(assessmentReleaseState.release || "").trim())
      : frameworkRecords;
    const frameworkPlans = assessmentReleaseState.available === false ? [] : await Promise.all(activeFrameworkRecords.map(async (question) => ({
      question, plan: await safeBuildTemplateIssuePlan(question, { operation: "path-runtime-framework-check" }),
    })));
    const issuableFamilies = new Set(frameworkPlans
      .filter((entry) => entry.plan?.issuable)
      .map((entry) => String(entry.question?.familyId || entry.question?.id || ""))
      .filter(Boolean));
    if (assessmentReleaseState.available !== false && issuableFamilies.size < 5) {
      throw new HttpsError(
        "failed-precondition",
        `${assessmentFramework} practice for ${mathPath.displayAlignmentKey(targetAlignmentKey)} is not published yet.`,
        { reason: "no-assessment-path-coverage", assessmentFramework },
      );
    }
  }

  // One open session per student, standard, exam and slot: a swapped slot is
  // another standard, so another lock. Kept as built (MP23): re-keying would
  // orphan the lock of every session in flight, which its completion deletes
  // by this same id (below, in the answer transaction). The one change (MP21):
  // an open retention check has a place of its own beside open practice, so
  // neither blocks the other. The session records the lock it took, and a
  // session in flight from before is released by the id it took then
  // (lib/pathSessionLock.js).
  const lockId = pathSessionLock.pathSessionLockId({
    studentId, targetAlignmentKey, assessmentFramework, weeklySlotKey: requestedWeeklySlotKey, sessionKind,
  });
  const lockRef = db.collection("activePathLocks").doc(lockId);
  // A check opened before MP21 holds the open-practice lock: found there, it
  // is resumed rather than doubled.
  const earlierCheckLockRef = sessionKind === "retentionProbe" && !requestedWeeklySlotKey
    ? db.collection("activePathLocks").doc(pathSessionLock.openPracticeLockId({ studentId, targetAlignmentKey, assessmentFramework }))
    : null;
  const proposedSessionRef = db.collection("pathSessions").doc();

  const session = await db.runTransaction(async (transaction) => {
    const now = Date.now();
    const lock = await transaction.get(lockRef);
    let existingSessionId = lock.exists ? (lock.data()?.sessionId || null) : null;
    if (!existingSessionId && earlierCheckLockRef) {
      const earlier = await transaction.get(earlierCheckLockRef);
      if (earlier.exists && earlier.data()?.sessionKind === "retentionProbe") existingSessionId = earlier.data()?.sessionId || null;
    }
    // One open session per weekly slot. The lock is keyed by target, and a slot
    // frozen with "Swap a skill" alternatives can be launched on more than one
    // standard, so a launch for a slot that already has an open session on
    // another of them resumes that session instead of opening a second
    // (shared/weeklyPathSlotAuthority.mjs, which the simulator also runs).
    if (requestedWeeklySlotKey && slotAuthority) {
      const weekSessions = await transaction.get(db.collection("pathSessions")
        .where("studentId", "==", studentId)
        .where("weekKey", "==", requestedWeekKey));
      const openSlotSession = slotAuthority.openWeeklySlotSession({
        sessions: weekSessions.docs.map((doc) => ({ id: doc.id, data: doc.data() || {} })),
        studentId,
        weekKey: requestedWeekKey,
        weeklySlotKey: requestedWeeklySlotKey,
        preferSessionId: existingSessionId,
      });
      if (openSlotSession) existingSessionId = openSlotSession.id;
    }
    // An open check a new content release supersedes is replaced below, due
    // or not: the student already had it open (the due rule is for NEW checks).
    let replacingOpenCheck = false;
    if (existingSessionId) {
      const existingRef = db.collection("pathSessions").doc(existingSessionId);
      const existing = await transaction.get(existingRef);
      if (existing.exists && existing.data()?.status === "active" && existing.data()?.studentId === studentId) {
        // A weekly slot's open session is resumed whatever kind it was opened
        // as (practice opened on a Retention slot before it became a check);
        // refusing it would leave a Resume button that can never work.
        if (!retentionCheck.canResumeOpenSession({ existingSessionKind: existing.data()?.sessionKind, sessionKind, weeklySlotKey: requestedWeeklySlotKey })) {
          throw new HttpsError("failed-precondition", "Finish the active session for this TEKS before starting a different check.");
        }
        if ((existing.data()?.assessmentFramework || null) !== assessmentFramework) {
          throw new HttpsError("failed-precondition", "Finish the active session before changing assessment format.");
        }
        if ((existing.data()?.coursePracticeIntent || null) !== coursePracticeIntent) {
          throw new HttpsError("failed-precondition", "Finish the active session before changing between regular practice and Challenge.");
        }
        const releaseAction = pathContentRelease.planSessionContentReleaseAction(existing.data(), assessmentReleaseState);
        if (releaseAction.action === "continue" || releaseAction.action === "finish-open-question") return existing.data();
        if (releaseAction.action === "hold-release-update") throw assessmentReleaseUpdateError(assessmentFramework);
        if (releaseAction.action !== "supersede") {
          throw new HttpsError("aborted", "The assessment content release changed while this session was being resumed.");
        }
        transaction.set(
          existingRef,
          pathContentRelease.supersedeSessionForContentRelease(existing.data(), assessmentReleaseState.release, now),
        );
        replacingOpenCheck = existing.data()?.sessionKind === "retentionProbe";
      }
    }

    if (assessmentReleaseState.tracked && assessmentReleaseState.available === false) {
      throw assessmentReleaseUpdateError(assessmentFramework);
    }

    // A NEW open retention check only when one is due (MP21, decided above).
    // Nothing is written: a stale tab still showing a check the student has
    // since passed is told, in these words, that it is not due.
    if (sessionKind === "retentionProbe" && !requestedWeeklySlotKey && !openRetentionCheckDue && !replacingOpenCheck) {
      throw new HttpsError(
        "failed-precondition",
        "This check is not due yet. It will be back on your Path when it is.",
        { reason: "retention-check-not-due" },
      );
    }

    const targetDisplay = mathPath.displayAlignmentKey(targetAlignmentKey);
    const next = {
      sessionId: proposedSessionRef.id,
      studentId,
      status: "active",
      sessionKind,
      assessmentFramework,
      coursePracticeIntent,
      // Challenge rigor was earned at the start by the student's own Path
      // (MP22); issueNextQuestion reads this instead of the target's profile.
      challengeEarned: coursePracticeIntent === "challenge" ? true : null,
      // The lock this session holds, so its completion releases exactly this
      // one (MP21: an open retention check has its own).
      lockId,
      assessmentContentRelease: assessmentReleaseState.tracked ? assessmentReleaseState.release : null,
      ccmrChallengeTier: assessmentFramework ? ccmrChallengeTier : null,
      coursePassLevel: assessmentFramework || sessionKind === "retentionProbe" ? null : coursePassLevel,
      priorCoursePasses: assessmentFramework || sessionKind === "retentionProbe" ? null : priorCoursePasses,
      ccmrProgressAtStart: assessmentFramework ? {
        directItemsAttempted: Number(ccmrProgress?.directItemsAttempted || 0),
        directItemsCorrect: Number(ccmrProgress?.directItemsCorrect || 0),
        tier1SessionsPassed: Number(ccmrProgress?.tier1SessionsPassed || 0),
        tier2SessionsPassed: Number(ccmrProgress?.tier2SessionsPassed || 0),
        tier3SessionsPassed: Number(ccmrProgress?.tier3SessionsPassed || 0),
      } : null,
      courseId,
      courseLevel,
      classId: studentClass?.classId || null,
      classPeriod: studentClass?.period || studentData.classPeriod || null,
      weekKey: requestedWeekKey,
      weeklySlotKey: requestedWeeklySlotKey,
      weeklySlot: weeklySlot?.slot || null,
      intendedDok: weeklySlot?.dok || null,
      intendedDifficultyBand: weeklySlot?.difficultyBand || null,
      weeklyPurpose: weeklySlot?.purpose || null,
      // A swap is recorded, not hidden: the frozen standard the slot named and
      // the alternative the student practised instead. The slot key above is
      // unchanged, so the completion still fills the slot it was launched for.
      swappedFromTeks: weeklySwap?.swappedFromTeks || null,
      chosenAlternative: weeklySwap?.chosenAlternative || null,
      requiredQuestions,
      target: { alignmentKey: targetAlignmentKey },
      summary: { completedQuestions: 0, correctQuestions: 0, independentSuccesses: 0 },
      pathState: { counters: { questionsThisSession: 0 } },
      // The routing state. `currentSkillCode` is where the NEXT question comes
      // from and may differ from the target once a repair excursion opens; the
      // target never moves, which is what makes coming back possible.
      currentSkillCode: targetDisplay,
      excursion: null,
      diagnosing: null,
      lastDecision: null,
      evidenceBySkill: {},
      route: [{
        at: "start",
        action: "start",
        skillCode: targetDisplay,
        reason: "session_target",
        explanation: `Session started on ${targetDisplay}.`,
        wasCorrect: null,
      }],
      currentQuestion: null,
      createdAt: now,
      updatedAt: now,
    };
    transaction.set(proposedSessionRef, next);
    transaction.set(lockRef, { sessionId: proposedSessionRef.id, studentId, targetAlignmentKey, sessionKind, assessmentFramework, weekKey: requestedWeekKey, weeklySlotKey: requestedWeeklySlotKey, updatedAt: now });
    return next;
  });

  return { success: true, session: publicPathSession(session) };
}));

/** Issue only a sanitized question payload. Expected answers remain server-side. */
exports.issueNextQuestion = onCall((request) => withPathCallableDiagnostics("issueNextQuestion", async () => {
  const { studentId } = requireStudent(request);
  const sessionId = String(request.data?.sessionId || "").trim();
  if (!sessionId) throw new HttpsError("invalid-argument", "sessionId is required.");
  const db = getFirestore();
  const sessionRef = db.collection("pathSessions").doc(sessionId);
  const sessionSnapshot = await sessionRef.get();
  if (!sessionSnapshot.exists || sessionSnapshot.data()?.studentId !== studentId) throw new HttpsError("not-found", "That My Math Path session is not available.");
  const session = sessionSnapshot.data();
  if (session.status !== "active") throw new HttpsError("failed-precondition", "This My Math Path session is already complete.");
  if (session.currentQuestion) {
    // Stored with its tool fields encoded when they nest arrays (secureItemStorage).
    const openQuestion = secureItems.readStoredItem(session.currentQuestion);
    // `issued: true` — the stored item is already sanitized; keep its ids.
    return { questionInstance: mathPath.buildSanitizedQuestion(openQuestion, { questionInstanceId: openQuestion.questionInstanceId, attemptsAllowed: openQuestion.attemptsAllowed, attemptsUsed: openQuestion.attemptsUsed, toolPayload: mathPath.storedToolPayload(openQuestion), issued: true }) };
  }

  if (session.assessmentFramework) {
    // Release compatibility is resolved from the TARGET assessment families,
    // not from a remediation excursion. A course bridge inside SAT/ACT/TSIA2
    // must not make the session look untracked. Read a broad bounded slice so
    // legacy and replacement families are both visible during a bank refresh.
    const targetReleaseSnapshot = await db.collection("pathQuestionBank")
      .where("alignmentKeys", "array-contains", session.target.alignmentKey)
      .limit(200)
      .get();
    const targetFrameworkRecords = targetReleaseSnapshot.docs
      .map((questionDoc) => ({ id: questionDoc.id, ...questionDoc.data() }))
      .filter((question) => question.active !== false)
      .filter((question) => pathQuestionMatchesFramework(question, session.assessmentFramework));
    const issueReleaseState = await loadAssessmentContentReleaseState(db, session.assessmentFramework, targetFrameworkRecords);
    const releaseAction = pathContentRelease.planSessionContentReleaseAction(session, issueReleaseState);
    if (releaseAction.action === "hold-release-update") {
      throw assessmentReleaseUpdateError(session.assessmentFramework);
    }

    if (releaseAction.action === "supersede") {
      const rollover = await db.runTransaction(async (transaction) => {
        const fresh = await transaction.get(sessionRef);
        if (!fresh.exists || fresh.data()?.studentId !== studentId) {
          throw new HttpsError("not-found", "That My Math Path session is not available.");
        }
        const freshData = fresh.data();
        if (freshData.currentQuestion) {
          const openQuestion = secureItems.readStoredItem(freshData.currentQuestion);
          return {
            questionInstance: mathPath.buildSanitizedQuestion(openQuestion, {
              questionInstanceId: openQuestion.questionInstanceId,
              attemptsAllowed: openQuestion.attemptsAllowed,
              attemptsUsed: openQuestion.attemptsUsed,
              toolPayload: mathPath.storedToolPayload(openQuestion),
              issued: true,
            }),
          };
        }

        const rolloverPayload = {
          reason: pathContentRelease.RELEASE_CHANGE_REASON,
          assessmentFramework: session.assessmentFramework,
          targetAlignmentKey: session.target.alignmentKey,
          currentRelease: issueReleaseState.release,
        };
        if (freshData.status === "superseded" && freshData.supersededReason === pathContentRelease.RELEASE_CHANGE_REASON) {
          return { rollover: rolloverPayload };
        }
        if (freshData.status !== "active") {
          throw new HttpsError("failed-precondition", "This My Math Path session is already complete.");
        }

        const freshAction = pathContentRelease.planSessionContentReleaseAction(freshData, issueReleaseState);
        if (freshAction.action !== "supersede") {
          // The only supported race from a stale/no-question state is another
          // issuer creating the current question (handled above) or another
          // issuer superseding it (handled above). Refuse any unexpected state
          // instead of issuing across releases.
          throw new HttpsError(
            "aborted",
            "This assessment session changed while its content release was being checked. Start it again to continue.",
            { reason: pathContentRelease.RELEASE_CHANGE_REASON },
          );
        }
        const now = Date.now();
        transaction.set(
          sessionRef,
          pathContentRelease.supersedeSessionForContentRelease(freshData, issueReleaseState.release, now),
        );
        return { rollover: rolloverPayload };
      });
      return rollover;
    }
  }

  const targetDisplayCode = mathPath.displayAlignmentKey(session.target.alignmentKey);
  // WHERE THE NEXT QUESTION COMES FROM. Not the target — the skill routing last
  // chose. On an ordinary session those are the same; on a repair excursion the
  // student is working on a prerequisite, and issuing from the target anyway is
  // exactly the bug that made live sessions non-adaptive.
  const activeDisplayCode = mathPath.displayAlignmentKey(session.currentSkillCode || targetDisplayCode);
  const activeAlignmentKey = mathPath.canonicalAlignmentKey(activeDisplayCode);
  const [bankSnapshot, masterySnapshot, rosterSnapshot, courseSettingsSnapshot] = await Promise.all([
    db.collection("pathQuestionBank").where("alignmentKeys", "array-contains", activeAlignmentKey).limit(40).get(),
    db.collection("studentMasteryProfiles").doc(studentId).get(),
    db.collection("grades").doc(studentId).get(),
    db.collection("settings").doc("courseProfiles").get(),
  ]);
  // Every candidate is screened by the Path Tool Contract before it can be
  // chosen. A question whose tool has no server grader is skipped here rather
  // than issued in a weaker form.
  const bankRecords = bankSnapshot.docs
    .map((questionDoc) => ({ id: questionDoc.id, ...questionDoc.data() }))
    .filter((question) => question.active !== false);
  const buildFrameworkPlans = async (framework) => Promise.all(bankRecords
    .filter((question) => pathQuestionMatchesFramework(question, framework))
    .filter((question) => pathQuestionMatchesSessionContentRelease(question, session))
    .map(async (question) => ({ question, plan: await safeBuildTemplateIssuePlan(question, { operation: "path-question-selection" }) })));

  let plans = await buildFrameworkPlans(session.assessmentFramework || null);
  let issuable = plans.filter((entry) => entry.plan.issuable);
  let candidates = issuable.map((entry) => entry.question);
  let usingCourseBridge = false;

  // Fidelity V2 progression: the first assessment session uses direct/foundation
  // families. A repeat after strong direct evidence uses authored challenge
  // families and never silently cycles the same five introductory tasks.
  if (session.assessmentFramework) {
    const tier = Math.max(1, Math.min(3, Number(session.ccmrChallengeTier || 1)));
    const foundation = candidates.filter((question) => Number(question.ccmrChallengeTier || 1) <= 1);
    const challenge = candidates.filter((question) => Number(question.ccmrChallengeTier || 1) >= 2);
    if (tier === 1 && foundation.length) candidates = foundation;
    if (tier >= 2) {
      if (challenge.length >= 2) candidates = challenge;
      else {
        const highFoundation = foundation.filter((question) => Number(question.difficultyBand || 3) >= 4);
        candidates = [...challenge, ...highFoundation];
      }
    }
  }

  // A CCMR session may route down to a mathematical prerequisite that the exam
  // itself does not test. Stranding the student there with "start again" is a
  // bad learning experience. Use the ordinary course family as a clearly
  // labelled foundation bridge, then let routing return to direct exam-format
  // work. The bridge never counts as direct assessment evidence.
  if (!candidates.length && session.assessmentFramework && activeDisplayCode !== targetDisplayCode) {
    const coursePlans = await buildFrameworkPlans(null);
    const courseIssuable = coursePlans.filter((entry) => entry.plan.issuable);
    if (courseIssuable.length) {
      plans = coursePlans;
      issuable = courseIssuable;
      candidates = courseIssuable.map((entry) => entry.question);
      usingCourseBridge = true;
      logger.info("Using course foundation bridge inside assessment Path session", {
        sessionId,
        assessmentFramework: session.assessmentFramework,
        activeDisplayCode,
        targetDisplayCode,
      });
    }
  }

  if (!candidates.length) {
    // NEVER STRAND. If an ordinary excursion skill truly has no issuable
    // content, return the routing state to the target. Assessment sessions have
    // already tried the course bridge above before reaching this branch.
    if (activeDisplayCode !== targetDisplayCode) {
      logger.warn("Path excursion skill has no issuable content; returning to target", {
        sessionId, activeDisplayCode, targetDisplayCode,
      });
      await sessionRef.update({
        currentSkillCode: targetDisplayCode,
        excursion: null,
        diagnosing: null,
        updatedAt: Date.now(),
      });
      throw new HttpsError(
        "failed-precondition",
        `Practice for ${activeDisplayCode} is not published yet, so this session has returned to ${targetDisplayCode}. Start it again to continue.`,
        { reason: "excursion-content-missing" },
      );
    }
    const skipped = plans.length ? ` ${plans.length} question(s) were skipped: ${[...new Set(plans.map((entry) => entry.plan.reason))].join(", ")}.` : "";
    throw new HttpsError("failed-precondition", `No active secure question family is published for ${session.target.alignmentKey}.${skipped}`);
  }

  const classPeriod = rosterSnapshot.data()?.classPeriod || session.classPeriod || "Unassigned";
  const studentClass = await loadStudentClass(db, rosterSnapshot.data());
  // THE STUDENT'S ACTUAL ENTITLEMENTS.
  //
  // The roster document was already being read here, and its `.profile` field
  // was already being ignored — the Path server used the doc for one string
  // (the class period) and nothing else. That is why extra attempts, the
  // calculator accommodation and reduced choices could not be authoritative on
  // the Path however carefully a district authorized them: nothing on the
  // server had ever looked. The adapter accepts either stored profile shape.
  const entitlements = await mathPath.resolveEntitlements(rosterSnapshot.data()?.profile || null);
  const courseLevel = session.courseLevel
    || studentClass?.courseLevel
    || courseSettingsSnapshot.data()?.profiles?.[classPeriod]?.courseLevel
    || "standard";
  const masteryProfile = masterySnapshot.data()?.profiles?.[activeDisplayCode] || {};
  const adaptiveRigor = rigorPolicy.resolveAdaptiveRigor({ courseLevel, profile: masteryProfile });
  const onAssignedWeeklyTarget = Boolean(session.weeklySlotKey && activeDisplayCode === targetDisplayCode && !session.diagnosing);
  let preferredDifficultyBand = onAssignedWeeklyTarget && Number.isFinite(Number(session.intendedDifficultyBand))
    ? Number(session.intendedDifficultyBand)
    : adaptiveRigor.preferredDifficultyBand;
  let preferredDok = onAssignedWeeklyTarget && Number.isFinite(Number(session.intendedDok))
    ? Number(session.intendedDok)
    : adaptiveRigor.preferredDok;
  if (session.assessmentFramework && Number(session.ccmrChallengeTier || 1) >= 2) {
    preferredDifficultyBand = Number(session.ccmrChallengeTier) >= 3 ? 5 : Math.max(4, Number(preferredDifficultyBand || 3));
    preferredDok = Number(session.ccmrChallengeTier) >= 3 ? Math.max(3, Number(preferredDok || 2)) : Math.max(2, Number(preferredDok || 2));
  }
  // A frozen weekly slot is authoritative while we are on its assigned TEKS.
  // Do not let an unrelated open-practice pass level rewrite the week's DOK or
  // difficulty commitment after the snapshot has already been assigned.
  if (!session.assessmentFramework && session.sessionKind !== "retentionProbe" && !onAssignedWeeklyTarget) {
    const coursePassLevel = Math.max(1, Math.min(COURSE_PATH_MAX_LEVEL, Number(session.coursePassLevel || 1)));
    if (coursePassLevel >= 2) {
      preferredDifficultyBand = Math.max(4, Number(preferredDifficultyBand || 3));
      preferredDok = Math.max(2, Number(preferredDok || 2));
    }
    if (coursePassLevel >= 3) {
      // Course TEKS content is authored through Band 4. Pass 3 stretches by
      // depth (DOK 3), not by requesting a nonexistent Band 5 and relying on a
      // fallback that teachers cannot see.
      preferredDifficultyBand = Math.max(4, Number(preferredDifficultyBand || 4));
      preferredDok = Math.max(3, Number(preferredDok || 2));
    }
  }
  // A student may opt into an EARNED Challenge card, but the browser never
  // names a DOK or difficulty. The only accepted course intent is a one-way
  // escalation to the certified authored ceiling. It applies only on the
  // session target, never to a remediation/diagnostic excursion.
  //
  // EARNED is decided once, when the session starts, by the student's own
  // Path (startMyMathPathSession records `challengeEarned`; MP22). A session
  // opened before that check falls back to the target's own server profile,
  // the old rule. NEVER STRANDED: without either, the question is served at
  // ordinary rigor instead of refusing it. Refusing left an open session that
  // could never issue a question and held the skill's lock for good.
  let challengeServed = false;
  if (
    session.coursePracticeIntent === "challenge"
    && !session.assessmentFramework
    && !session.weeklySlotKey
    && activeDisplayCode === targetDisplayCode
    && !session.diagnosing
  ) {
    if (session.challengeEarned === true || courseChallengeEarned(masteryProfile)) {
      challengeServed = true;
      preferredDifficultyBand = 4;
      preferredDok = 3;
    }
  }

  // Routing can recognize mastery from fresh in-session evidence before the
  // asynchronous mastery-profile trigger catches up. When it explicitly says
  // ENRICHMENT, honor that server-owned decision immediately so the student
  // actually receives Challenge work rather than a stale core-rigor question.
  if (
    !session.assessmentFramework
    && !onAssignedWeeklyTarget
    && session.lastDecision?.action === "enrichment"
    && activeDisplayCode === targetDisplayCode
    && !session.diagnosing
  ) {
    preferredDifficultyBand = 4;
    preferredDok = 3;
  }

  // Selection prefers an UNUSED family, widening to the closest adjacent band
  // before it repeats anything. Narrowing to the nearest band first and cycling
  // inside it — which is what this used to do — trapped a five-question session
  // in whichever one or two families happened to sit at the readiness band.
  const selection = await pathSelection();
  const familyUsage = session.familyUsage && typeof session.familyUsage === "object" ? session.familyUsage : {};
  // What this session has already asked, so the next question is not the same
  // idea in the same clothes. Five symbolic procedures in a row is five
  // questions about one thing.
  const usedRepresentations = Array.isArray(session.usedRepresentations) ? session.usedRepresentations : [];
  const usedTaskTypes = Array.isArray(session.usedTaskTypes) ? session.usedTaskTypes : [];
  const selectionOptions = {
    preferredBand: preferredDifficultyBand,
    // Cognitive demand, decided server-side from the same evidence the band is.
    preferredDok,
    usage: familyUsage,
    usedRepresentations,
    usedTaskTypes,
  };

  // Do not let one bad generated draw/family strand the whole skill. The bank
  // validator proves a TEMPLATE can issue, but a runtime draw or tool-support
  // builder can still encounter an edge case. Try the ranked alternatives
  // before showing the student an error.
  let remainingCandidates = [...candidates];
  let choice = null;
  let authored = null;
  let instantiated = null;
  let issued = null;
  let issuePlan = null;
  let preparedApplicableSupports = null;
  let preparedPrivateSupport = null;
  const preparationFailures = [];
  const questionInstanceId = mathPath.runtimeId("qi");

  while (remainingCandidates.length) {
    const tentative = selection.selectNextFamily(remainingCandidates, selectionOptions);
    if (!tentative?.question) break;
    const tentativeQuestion = tentative.question;

    try {
      const draw = await mathPath.instantiateQuestion(
        tentativeQuestion,
        `${sessionId}|${questionInstanceId}|${tentativeQuestion.id}`,
        {
          preferredDok,
          preferredDifficultyBand,
        },
      );
      if (!draw?.question) {
        preparationFailures.push({ questionId: tentativeQuestion.id, reason: draw?.reason || "generator_failed" });
        remainingCandidates = remainingCandidates.filter((candidate) => candidate.id !== tentativeQuestion.id);
        continue;
      }

      const planned = await mathPath.buildIssuePlan(draw.question);
      if (!planned?.issuable) {
        preparationFailures.push({ questionId: tentativeQuestion.id, reason: planned?.reason || "generated_not_issuable" });
        remainingCandidates = remainingCandidates.filter((candidate) => candidate.id !== tentativeQuestion.id);
        continue;
      }

      const [applicableSupports, privateSupport] = await Promise.all([
        mathPath.applicableSupportsFor(entitlements, draw.question, {}),
        mathPath.buildPrivateSupport(draw.question),
      ]);

      choice = tentative;
      authored = tentativeQuestion;
      instantiated = draw;
      issued = draw.question;
      issuePlan = planned;
      preparedApplicableSupports = applicableSupports;
      preparedPrivateSupport = privateSupport;
      break;
    } catch (error) {
      preparationFailures.push({
        questionId: tentativeQuestion.id,
        reason: "runtime_preparation_exception",
        detail: error?.message || String(error),
      });
      logger.warn("Skipping Path family after runtime preparation failure", {
        sessionId,
        activeDisplayCode,
        bankQuestionId: tentativeQuestion.id,
        message: error?.message || String(error),
      });
      remainingCandidates = remainingCandidates.filter((candidate) => candidate.id !== tentativeQuestion.id);
    }
  }

  if (!choice || !authored || !instantiated?.question || !issuePlan?.issuable) {
    logger.error("All Path candidates failed runtime preparation", {
      sessionId,
      activeDisplayCode,
      targetDisplayCode,
      failures: preparationFailures,
    });
    throw new HttpsError(
      "failed-precondition",
      `Published practice for ${activeDisplayCode} needs repair before another question can be prepared. Your completed work is safe; return to My Math Path and choose another open skill.`,
      {
        reason: "all-candidate-preparations-failed",
        failedFamilies: preparationFailures.slice(0, 12).map((entry) => ({ questionId: entry.questionId, reason: entry.reason })),
      },
    );
  }

  // A diagnostic is ONE question with ONE attempt: it is asked to find out
  // whether a prerequisite is the obstacle, and three tries at it would measure
  // persistence rather than answer the question.
  const pathRole = session.diagnosing ? "diagnose" : (session.lastDecision?.action || "continue");
  const baseAttempts = session.sessionKind === "retentionProbe" || pathRole === "diagnose" ? 1 : 3;
  // An authorized extra-attempts accommodation is normally ADDED to the
  // pedagogical figure. Two interactions deliberately stay one attempt:
  // diagnostics/retention probes, which measure what the student can do now,
  // and pure finite-choice items, where extra guesses would become elimination
  // rather than useful mathematical evidence. Resolved on the server so the
  // browser cannot grant itself another try.
  const attemptsAllowed = await mathPath.attemptsForQuestion(issued, baseAttempts, entitlements);
  const currentQuestion = {
    // The public half — the authentic tool, by allowlist — plus the private
    // grading definition, which lives only in this session document.
    ...mathPath.buildSanitizedQuestion(issued, { questionInstanceId, attemptsAllowed, attemptsUsed: 0, toolPayload: issuePlan.toolPayload }),
    bankQuestionId: authored.id,
    sourceBankQuestionId: authored.id,
    // The draw that produced this question. Teacher/QA metadata on the session
    // document only — `buildSanitizedQuestion` does not copy it, so a student
    // cannot read the parameters that generated their answer.
    generatorParameters: instantiated.parameters,
    skillCode: activeDisplayCode,
    pathRole,
    coursePassLevel: session.assessmentFramework || session.weeklySlotKey || session.coursePracticeIntent === "challenge"
      ? null
      : Math.max(1, Math.min(COURSE_PATH_MAX_LEVEL, Number(session.coursePassLevel || 1))),
    // Labelled Challenge only when it was served as one (MP22).
    coursePracticeIntent: challengeServed ? "challenge" : null,
    assessmentBridgeFramework: usingCourseBridge ? session.assessmentFramework : null,
    ccmrChallengeTier: session.assessmentFramework ? Math.max(1, Math.min(3, Number(session.ccmrChallengeTier || 1))) : null,
    ccmrFamilyRole: authored.ccmrFamilyRole || (Number(authored.ccmrChallengeTier || 1) >= 2 ? "challenge" : "direct"),
    // Teacher/QA metadata. `buildSanitizedQuestion` does not copy these onto the
    // student payload; the Path Simulator reads them from the session document.
    selectionReason: choice.reason,
    selectedCoverageKey: choice.effectiveCoverageKey || null,
    selectedVariantIndex: Number.isInteger(choice.effectiveVariantIndex) ? choice.effectiveVariantIndex : null,
    requestedDok: preferredDok,
    requestedDifficultyBand: preferredDifficultyBand,
    contentQuality: choice.quality,
    // Which authorized supports actually apply to THIS question. Authorized is
    // not the same as applicable: a calculator accommodation does not apply to
    // an item whose assessed construct is the computation, and reduced choices
    // do not apply where there is nothing to reduce.
    applicableSupports: preparedApplicableSupports,
    authorizedSupports: entitlements.authorized,
    supportEntitlements: {
      extraAttempts: entitlements.extraAttempts,
      extendedTimeMultiplier: entitlements.extendedTimeMultiplier,
      translationLanguage: entitlements.translationLanguage,
      isModifiedCurriculum: Boolean(entitlements.modification?.isModifiedCurriculum),
    },
    representation: choice.representation || null,
    taskType: choice.taskType || null,
    // Evidence is recorded against the skill the question actually came from.
    // Recording an excursion question against the target would credit a student
    // with mastery of a skill they were sent away from.
    alignmentKeys: [activeAlignmentKey],
    attemptsAllowed,
    attemptsUsed: 0,
    adaptiveRigor,
    privateGrading: issuePlan.privateGrading,
    // Feedback, hints and the solution review live HERE, on the session
    // document, and are released one piece at a time by submitPathResponse.
    // Nothing in this bundle is ever part of the sanitized question, so a
    // student cannot read the review out of the payload before answering.
    privateSupport: preparedPrivateSupport,
  };

  const issuedQuestion = await db.runTransaction(async (transaction) => {
    const fresh = await transaction.get(sessionRef);
    const freshData = fresh.data();
    if (!fresh.exists || freshData?.studentId !== studentId || freshData?.status !== "active") throw new HttpsError("failed-precondition", "This session changed before the question could be issued.");
    if (freshData.currentQuestion) return secureItems.readStoredItem(freshData.currentQuestion);
    // Remember which family was issued, so the next question in this session
    // reaches for one the student has not seen.
    transaction.update(sessionRef, {
      // A Data Modeling, Mapping Diagram, reflection or 3×3 RREF item nests
      // arrays in its tool fields, which Firestore refuses: those fields are
      // stored encoded (secureItemStorage), every other item exactly as before.
      // Without this the transaction failed and, selection being
      // deterministic, the session could never issue its next question.
      currentQuestion: secureItems.storableItem(currentQuestion),
      familyUsage: selection.recordFamilyUse(freshData.familyUsage || {}, authored.id),
      usedRepresentations: [...new Set([...(freshData.usedRepresentations || []), choice.representation].filter(Boolean))],
      usedTaskTypes: [...new Set([...(freshData.usedTaskTypes || []), choice.taskType].filter(Boolean))],
      updatedAt: Date.now(),
    });
    return currentQuestion;
  });

  // Either branch of the transaction yields the stored (already sanitized)
  // item, so the re-send keeps its ids: `issued: true`.
  return { questionInstance: mathPath.buildSanitizedQuestion(issuedQuestion, { questionInstanceId: issuedQuestion.questionInstanceId, attemptsAllowed: issuedQuestion.attemptsAllowed, attemptsUsed: issuedQuestion.attemptsUsed, toolPayload: mathPath.storedToolPayload(issuedQuestion), issued: true }) };
}));

/**
 * Grade a path response on the server and append immutable evidence in the same
 * transaction. submissionId is a real idempotency key, so a network retry can
 * safely repeat the request without creating a second attempt.
 */
exports.submitPathResponse = onCall((request) => withPathCallableDiagnostics("submitPathResponse", async () => {
  const { studentId } = requireStudent(request);
  const sessionId = String(request.data?.sessionId || "").trim();
  const questionInstanceId = String(request.data?.questionInstanceId || "").trim();
  const submissionId = String(request.data?.submissionId || "").trim();
  if (!sessionId || !questionInstanceId || !submissionId) throw new HttpsError("invalid-argument", "sessionId, questionInstanceId, and submissionId are required.");
  if (submissionId.length > 180) throw new HttpsError("invalid-argument", "submissionId is too long.");

  const db = getFirestore();
  const sessionRef = db.collection("pathSessions").doc(sessionId);
  const submissionRef = db.collection("pathSubmissions").doc(mathPath.opaqueId("submission", sessionId, submissionId));
  // Load the tool contract and the routing engine before the transaction opens,
  // so a cold dynamic import is never paid for inside it — and never repeated
  // if the transaction retries.
  await Promise.all([
    mathPath.pathToolContracts(),
    pathRouting.routing(),
    pathRouting.skillGraph(),
  ]);
  const recapRules = await pathSessionRecap.pathSessionRecapRules();
  // The retention verdict's module too: it was imported inside the
  // transaction, a cold-start cost paid on a finished check (MP17).
  const retentionCheck = await import("./shared/pathRetentionCheck.mjs");

  // The authorization context this evidence will carry, resolved from the
  // student's class before the transaction so the read is not inside it.
  const auth = await authorizationContext();
  const studentRecord = await db.collection("grades").doc(studentId).get();
  const authorizationFields = auth.buildAuthorizationContext({
    studentId,
    student: studentRecord.data() || null,
    classRecord: await loadStudentClass(db, studentRecord.data()),
  });

  // Everything routing needs to reason with, read BEFORE the transaction opens.
  // The mastery profile is what the student knew coming in; the coverage
  // indexes are what the bank can actually teach. Both are read-only inputs, so
  // reading them outside keeps the transaction short.
  const [masterySnapshot, retentionSnapshotForRouting, ...coverageSnapshots] = await Promise.all([
    db.collection("studentMasteryProfiles").doc(studentId).get(),
    db.collection("studentRetentionSchedules").doc(studentId).get(),
    ...PATH_COURSE_IDS.map((courseId) => db.collection(COVERAGE_COLLECTION).doc(courseId).get()),
  ]);
  const masteryProfiles = masterySnapshot.data()?.profiles || {};
  const coverageIndexes = Object.fromEntries(PATH_COURSE_IDS.map((courseId, index) => [
    courseId, coverageSnapshots[index]?.exists ? coverageSnapshots[index].data() : null,
  ]));
  const retentionSchedules = retentionSnapshotForRouting.data()?.schedules || {};

  const transactionResult = await db.runTransaction(async (transaction) => {
    const [sessionSnapshot, submissionSnapshot] = await Promise.all([
      transaction.get(sessionRef),
      transaction.get(submissionRef),
    ]);
    if (submissionSnapshot.exists) return { duplicate: true, result: submissionSnapshot.data()?.result };
    if (!sessionSnapshot.exists || sessionSnapshot.data()?.studentId !== studentId) throw new HttpsError("not-found", "That My Math Path session is not available.");
    const session = sessionSnapshot.data();
    if (session.status !== "active" || !session.currentQuestion) throw new HttpsError("failed-precondition", "There is no open question to submit.");
    const currentQuestion = secureItems.readStoredItem(session.currentQuestion);
    if (currentQuestion.questionInstanceId !== questionInstanceId) throw new HttpsError("failed-precondition", "That question is no longer the active question.");

    // The grader is chosen from the question the SERVER stored, never from a
    // tool id the browser supplies, and nothing the browser claims about
    // correctness is read.
    const gradingResult = await mathPath.gradePathToolResponse(currentQuestion.privateGrading, request.data?.responsePayload || {});
    if (gradingResult.rejected) {
      // Not "wrong" — unusable. It does not consume an attempt and it does not
      // become evidence.
      if (gradingResult.reason === "no_server_grader_for_this_tool") {
        throw new HttpsError("failed-precondition", "This question cannot be graded on the server, so it cannot be scored.");
      }
      throw new HttpsError("invalid-argument", gradingResult.detail || "That response was not in the shape this question expects.");
    }
    const gradingCore = { isCorrect: gradingResult.isCorrect, score: gradingResult.score, parts: gradingResult.parts || [] };
    const attemptNumber = Number(currentQuestion.attemptsUsed || 0) + 1;
    const attemptsRemaining = Math.max(0, Number(currentQuestion.attemptsAllowed || 1) - attemptNumber);
    const questionFinalized = gradingCore.isCorrect || attemptsRemaining === 0;
    // What the student is told. The solution review inside this is null unless
    // the question just closed — that rule lives in one shared module rather
    // than in an `if` here, so the simulator cannot disagree with production.
    const attemptSupport = await mathPath.attemptSupport({
      support: currentQuestion.privateSupport || null,
      attemptNumber,
      attemptsAllowed: Number(currentQuestion.attemptsAllowed || 1),
      isCorrect: gradingCore.isCorrect,
      questionFinalized,
      responsePayload: request.data?.responsePayload || {},
    });
    // WHAT THE BROWSER IS ALLOWED TO SAY ABOUT SUPPORT.
    //
    // Correctness has never been the browser's to declare, and neither is
    // independence: a client that simply omits the support flags used to be
    // taken at its word, because `mathematicalIndependence({})` is true. That
    // is the same trust bug as a browser-supplied `isCorrect`, one axis over,
    // and it inflates mastery instead of grades.
    //
    // The server ISSUED the hint and RELEASED the review, so it already knows
    // the two facts that matter. Those are recorded from server state and are
    // not readable from the request at all. The browser keeps only the flags
    // that describe things the server genuinely cannot observe — a human
    // helping, a calculator on the desk, an accommodation in force — and even
    // those are coerced rather than spread.
    const claimed = request.data?.supportUsage && typeof request.data.supportUsage === "object"
      ? request.data.supportUsage
      : {};
    // Only support shown BEFORE this answer marks it; what this response
    // releases (the review of a closed item, a hint after a second miss) is
    // carried to the next attempt (mathPath.pathAttemptSupport).
    const { used: supportBeforeAttempt, released: supportReleased } = mathPath.pathAttemptSupport({
      priorSupport: currentQuestion.supportReleased || {},
      attemptSupport,
    });
    // ACCOMMODATION DELIVERY, reconciled.
    //
    // Three different facts, from three different places, deliberately kept
    // apart:
    //   AUTHORIZED  — the student's profile. Server fact, resolved at issue.
    //   APPLICABLE  — does it even apply to this question. Server fact.
    //   PRESENTED/USED — did the button actually render, did the student press
    //                    it. Only the browser can observe these, so they are
    //                    accepted from the client but INTERSECTED with the
    //                    authorized set: a client cannot report a support the
    //                    student was never granted, so it cannot manufacture a
    //                    compliance record or an excuse.
    //
    // Before this, the Path recorded no accommodations at all — the server's
    // supportUsage had no `accommodations` key, so `supportTelemetry()`
    // iterated an empty array and EVERY My Math Path evidence event carried
    // zero "presented" events, forever.
    const delivery = await mathPath.reconcileSupports({
      entitlements: {
        authorized: Array.isArray(currentQuestion.authorizedSupports) ? currentQuestion.authorizedSupports : [],
      },
      applicable: Array.isArray(currentQuestion.applicableSupports) ? currentQuestion.applicableSupports : [],
      clientPresented: Array.isArray(request.data?.supportsPresented) ? request.data.supportsPresented : [],
      clientUsed: Array.isArray(request.data?.supportsUsed) ? request.data.supportsUsed : [],
    });

    const supportUsage = {
      // Server-observed. Not accepted from the request.
      hintUsed: supportBeforeAttempt.hintUsed,
      workedExampleUsed: supportBeforeAttempt.workedExampleUsed,
      scaffoldUsed: supportBeforeAttempt.scaffoldUsed,
      // Client-reported, but about the room rather than about the mathematics.
      teacherAssisted: Boolean(claimed.teacherAssisted),
      calculatorUsed: Boolean(claimed.calculatorUsed),
      modified: Boolean(claimed.modified),
      // ACCESS accommodations. These are recorded so a compliance report can
      // answer "was it offered, was it used" — and they must NOT reduce
      // mathematical independence. A student who had the prompt read aloud, or
      // read it in Spanish, did the same mathematics as everyone else.
      accommodations: delivery.used,
      accommodationsPresented: delivery.presented,
      accommodationsApplicable: delivery.applicable,
      // Authorized, applicable, and nothing rendered it. This is the signal an
      // administrator needs: a tool could not honour a support the student is
      // entitled to.
      accommodationsNotDelivered: delivery.authorizedButNotPresented,
      ...(delivery.rejectedClaims.length ? { rejectedSupportClaims: delivery.rejectedClaims } : {}),
      ...(Array.isArray(claimed.modifications) && claimed.modifications.length
        ? { modifications: claimed.modifications.slice(0, 12).map((entry) => String(entry).slice(0, 80)) }
        : {}),
    };
    const independent = mathPath.mathematicalIndependence(supportUsage);
    const now = Date.now();
    const nextSummary = { ...(session.summary || {}) };
    let nextStatus = session.status;
    // Support is sticky across attempts on the same question: a hint the
    // student saw on attempt two is still a hint they saw on attempt three,
    // and forgetting that between attempts would let the discount evaporate
    // on the attempt that actually counts.
    let nextCurrentQuestion = {
      ...currentQuestion,
      attemptsUsed: attemptNumber,
      supportReleased,
    };

    // The routing decision. Only a FINALIZED question is evidence — attempts
    // within a question are for assistance — so this runs once per question,
    // never once per attempt.
    let routed = null;
    // Declared before the routing block, not inside it: the CCMR
    // direct-evidence write below reads it too, and a block-scoped `const` there
    // was a ReferenceError that failed every finalized exam-style question.
    const activeSkillCode = currentQuestion.skillCode || mathPath.displayAlignmentKey(session.target?.alignmentKey);
    if (questionFinalized) {
      nextSummary.completedQuestions = Number(nextSummary.completedQuestions || 0) + 1;
      nextSummary.correctQuestions = Number(nextSummary.correctQuestions || 0) + (gradingCore.isCorrect ? 1 : 0);
      nextSummary.independentSuccesses = Number(nextSummary.independentSuccesses || 0) + (gradingCore.isCorrect && independent ? 1 : 0);
      nextCurrentQuestion = null;

      const schedule = retentionSchedules[activeSkillCode] || null;
      // A retention PROBE is two questions and a verdict. Routing it into a
      // repair excursion would turn "a quick check that this stayed with you"
      // into a surprise unit of remediation, which is exactly what the
      // retention design is meant to avoid — so a probe counts its questions
      // and finishes, and any concern it raises is acted on next session.
      if (session.sessionKind === "retentionProbe") {
        if (nextSummary.completedQuestions >= Number(session.requiredQuestions || 2)) nextStatus = "completed";
      } else {
        routed = await pathRouting.routeAfterFinalizedQuestion({
          session: { ...session, summary: nextSummary },
          skillCode: activeSkillCode,
          isCorrect: gradingCore.isCorrect,
          profiles: masteryProfiles,
          coverageIndexes,
          // Previously strong, and overdue for a check. The engine turns this
          // into a short verification rather than assuming the skill held.
          retentionConcern: Boolean(
            (schedule && ["concern", "due", "overdue"].includes(String(schedule.status || "")))
            || (Number(schedule?.nextCheckDueAt) > 0 && Number(schedule.nextCheckDueAt) <= now),
          ),
        });
        nextStatus = routed.status;
      }
      // Belt and braces: whatever the engine decided, a session that has met
      // its question count and is not on an excursion is finished.
      if (routed
        && nextStatus === "active"
        && !routed.excursion
        && !routed.diagnosing
        && nextSummary.completedQuestions >= Number(session.requiredQuestions || 5)) {
        nextStatus = "completed";
      }
    }

    let retentionSnapshot = null;
    const retentionRef = db.collection("studentRetentionSchedules").doc(studentId);
    if (nextStatus === "completed" && session.sessionKind === "retentionProbe") retentionSnapshot = await transaction.get(retentionRef);

    const nextSession = {
      ...session,
      status: nextStatus,
      summary: nextSummary,
      pathState: { ...(session.pathState || {}), counters: { ...(session.pathState?.counters || {}), questionsThisSession: nextSummary.completedQuestions || 0 } },
      currentQuestion: secureItems.storableItem(nextCurrentQuestion),
      ...(routed ? {
        currentSkillCode: routed.currentSkillCode,
        excursion: routed.excursion,
        diagnosing: routed.diagnosing,
        lastDecision: routed.lastDecision,
        evidenceBySkill: routed.evidenceBySkill,
        teacherMessage: routed.teacherMessage,
        // The whole route so far, so "why am I on this skill?" is answerable
        // rather than assertable. Capped so a long session cannot grow the
        // document without bound.
        route: [...(session.route || []), routed.routeEntry].slice(-40),
      } : {}),
      updatedAt: now,
      completedAt: nextStatus === "completed" ? now : session.completedAt || null,
    };
    const evidenceKey = mathPath.opaqueId("ev", sessionId, questionInstanceId, attemptNumber);
    const evidenceRef = db.collection("grades").doc(studentId).collection("evidenceEvents").doc(evidenceKey);
    const event = {
      schemaVersion: 1,
      eventKey: evidenceKey,
      // Who may read this, answerable from the record itself. `origin*` records
      // the class and teacher this work actually happened under and is never
      // rewritten; `authorizedTeacherEmails` follows the student if they move.
      ...authorizationFields,
      occurredAt: now,
      alignmentKeys: currentQuestion.alignmentKeys || [session.target.alignmentKey],
      masteryEvidenceKeys: currentQuestion.alignmentKeys || [session.target.alignmentKey],
      questionSnapshot: {
        questionInstanceId,
        questionId: currentQuestion.bankQuestionId,
        familyId: currentQuestion.familyId,
        familyVersion: currentQuestion.familyVersion,
        questionType: currentQuestion.questionType,
        difficultyBand: currentQuestion.difficultyBand,
        dok: currentQuestion.dok,
        ccmrChallengeTier: currentQuestion.ccmrChallengeTier || null,
        ccmrFamilyRole: currentQuestion.ccmrFamilyRole || null,
      },
      // A retention probe is not ordinary practice, and recording it as such
      // made "has this stayed with you?" evidence indistinguishable from
      // "are you learning this?" evidence in every downstream report.
      source: {
        kind: "myMathPath",
        activityRole: session.sessionKind === "retentionProbe" ? "retention" : "practice",
        activitySessionId: sessionId,
        sessionKind: session.sessionKind,
        weekKey: session.weekKey || null,
        weeklySlotKey: session.weeklySlotKey || null,
        weeklySlot: session.weeklySlot || null,
        weeklyPurpose: session.weeklyPurpose || null,
        // Direct assessment evidence comes from the question actually issued,
        // not merely from the session the student started. A course foundation
        // bridge inside SAT/ACT/etc. remains course evidence.
        assessmentFramework: currentQuestion.assessmentContext?.examStyle === true
          ? normalizePathAssessmentFramework(currentQuestion.assessmentContext.framework)
          : null,
        assessmentBridgeFramework: currentQuestion.assessmentBridgeFramework || null,
        ccmrChallengeTier: currentQuestion.assessmentContext?.examStyle === true
          ? Math.max(1, Math.min(3, Number(session.ccmrChallengeTier || currentQuestion.ccmrChallengeTier || 1)))
          : null,
        ccmrSessionCompleted: Boolean(currentQuestion.assessmentContext?.examStyle === true && nextStatus === "completed"),
        ccmrSessionPassed: Boolean(currentQuestion.assessmentContext?.examStyle === true && nextStatus === "completed" && ccmrSessionPasses(nextSummary, session.requiredQuestions)),
      },
      performance: { score: gradingCore.score, isCorrect: gradingCore.isCorrect, attemptNumber, status: questionFinalized ? "finalized" : "attempted", isMathematicallyIndependent: independent },
      supportUsage: { ...supportUsage, isMathematicallyIndependent: independent },
      supportTelemetry: mathPath.supportTelemetry(supportUsage),
    };

    if (retentionSnapshot) {
      const displayCode = mathPath.displayAlignmentKey(session.target.alignmentKey);
      const schedules = retentionSnapshot.exists ? retentionSnapshot.data()?.schedules || {} : {};
      // ONE verdict for a finished retention check, shared with the Teacher
      // Path Simulator (functions/shared/pathRetentionCheck.mjs): both answers
      // right on the student's own moves the next check out (14/30/60 days);
      // anything less marks a concern and keeps the check due.
      const verdict = retentionCheck.retentionCheckOutcome({
        teksCode: displayCode,
        summary: nextSummary,
        currentSchedule: schedules[displayCode] || {},
        now,
      });
      transaction.set(retentionRef, { schedules: { ...schedules, [displayCode]: verdict.schedule }, updatedAt: now }, { merge: true });
      nextSession.retentionOutcome = verdict.outcome;
    }

    if (questionFinalized && currentQuestion.assessmentContext?.examStyle === true) {
      const directFramework = normalizePathAssessmentFramework(currentQuestion.assessmentContext.framework);
      if (directFramework) {
        const tier = Math.max(1, Math.min(3, Number(session.ccmrChallengeTier || currentQuestion.ccmrChallengeTier || 1)));
        const progressRef = ccmrProgressRef(db, studentId, mathPath.canonicalAlignmentKey(activeSkillCode), directFramework);
        const progressUpdate = {
          schemaVersion: 2,
          studentId,
          alignmentKey: mathPath.canonicalAlignmentKey(activeSkillCode),
          teksCode: activeSkillCode,
          framework: directFramework,
          directItemsAttempted: FieldValue.increment(1),
          directItemsCorrect: FieldValue.increment(gradingCore.isCorrect ? 1 : 0),
          [`tier${tier}ItemsAttempted`]: FieldValue.increment(1),
          [`tier${tier}ItemsCorrect`]: FieldValue.increment(gradingCore.isCorrect ? 1 : 0),
          lastChallengeTierSeen: tier,
          lastPracticedAt: now,
          updatedAt: now,
        };
        if (nextStatus === "completed") {
          progressUpdate[`tier${tier}SessionsCompleted`] = FieldValue.increment(1);
          if (ccmrSessionPasses(nextSummary, session.requiredQuestions)) {
            progressUpdate[`tier${tier}SessionsPassed`] = FieldValue.increment(1);
            progressUpdate.lastPassedTier = tier;
            progressUpdate.lastPassedAt = now;
          }
        }
        transaction.set(progressRef, progressUpdate, { merge: true });
      }
    }

    transaction.set(evidenceRef, event);
    transaction.set(sessionRef, nextSession);
    if (nextStatus === "completed") {
      // The lock the session recorded, or (a session started before locks
      // were recorded) the one its launch took then (lib/pathSessionLock.js).
      const lockRef = db.collection("activePathLocks").doc(pathSessionLock.lockIdForSession(session, { studentId }));
      transaction.delete(lockRef);
    }

    const result = {
      success: true,
      submissionId,
      grading: { ...gradingCore, attemptNumber, attemptsRemaining, questionFinalized },
      feedback: attemptSupport.feedback,
      support: attemptSupport.support,
      // Present only on a finalized question, by construction.
      solutionReview: attemptSupport.solutionReview,
      decision: routed ? routed.lastDecision : null,
      session: publicPathSession(nextSession),
      needsNextQuestion: questionFinalized && nextStatus === "active",
    };
    // A CLOSED question leaves its recap entry (the question as issued, the
    // student's answer, the correct answer, the review) on this server-only
    // document. getMyPathSessionRecap releases it once the session is completed.
    const recapJson = pathSessionRecap.closedQuestionRecapJson(recapRules, {
      sessionId,
      currentQuestion,
      responsePayload: request.data?.responsePayload || {},
      grading: result.grading,
      solutionReview: attemptSupport.solutionReview,
      questionNumber: nextSummary.completedQuestions,
      skillCode: activeSkillCode,
      closedAt: now,
      onError: (error) => logger.warn("Path recap entry was not recorded", { sessionId, questionInstanceId, message: error?.message || String(error) }),
    });
    transaction.set(submissionRef, { studentId, sessionId, submissionId, createdAt: now, result, ...(recapJson ? { recapJson } : {}) });
    return { duplicate: false, result };
  });

  return transactionResult.result;
}));

/**
 * The end-of-session recap: the questions the student missed or got partly
 * right, each as they saw it, with their answer, the correct answer and the
 * worked solution. ONLY the caller's own session, and ONLY once the server has
 * marked it completed — an active or paused session is refused, so nothing
 * here can reveal anything while an item can still be answered. Rules:
 * functions/shared/pathSessionRecap.mjs.
 */
exports.getMyPathSessionRecap = onCall((request) => withPathCallableDiagnostics("getMyPathSessionRecap", async () => {
  const { studentId } = requireStudent(request);
  const sessionId = String(request.data?.sessionId || "").trim();
  if (!sessionId || sessionId.length > 180) throw new HttpsError("invalid-argument", "sessionId is required.");
  const loaded = await pathSessionRecap.loadMyPathSessionRecap(getFirestore(), { studentId, sessionId });
  if (loaded.refused) throw new HttpsError(loaded.refused.code, loaded.refused.message);
  return { success: true, sessionId, ...loaded.recap };
}));

// Phase 6A: DOK 3/4 modeling labs are graded from a teacher-authored private
// definition. The browser submits only student telemetry; it never supplies the
// target criteria used to award the score.
exports.submitModelingLab = onCall(async (request) => {
  const { studentId } = requireStudent(request);
  const assignmentId = String(request.data?.assignmentId || "").trim();
  const labId = String(request.data?.labId || "").trim();
  const submissionId = String(request.data?.submissionId || "").trim();
  const submission = request.data?.submission && typeof request.data.submission === "object" ? request.data.submission : {};
  if (!assignmentId || !labId || !submissionId) throw new HttpsError("invalid-argument", "assignmentId, labId, and submissionId are required.");
  if (submissionId.length > 180) throw new HttpsError("invalid-argument", "submissionId is too long.");
  if (String(submission.studentHypothesis || "").length > 2000 || String(submission.studentJustification || "").length > 8000) {
    throw new HttpsError("invalid-argument", "Modeling lab written responses exceed the supported length.");
  }
  if (!Array.isArray(submission.trialHistory) || submission.trialHistory.length > 50) throw new HttpsError("invalid-argument", "Modeling labs require at most 50 recorded trials.");
  const db = getFirestore();
  const assignmentRef = db.collection("assignments").doc(assignmentId);
  const labRef = db.collection("modelingLabDefinitions").doc(labId);
  const studentRef = db.collection("grades").doc(studentId);
  const markerRef = db.collection("modelingLabSubmissions").doc(mathPath.opaqueId("labsub", studentId, assignmentId, labId, submissionId));

  const result = await db.runTransaction(async (transaction) => {
    const [marker, assignmentSnapshot, labSnapshot, studentSnapshot] = await Promise.all([
      transaction.get(markerRef),
      transaction.get(assignmentRef),
      transaction.get(labRef),
      transaction.get(studentRef),
    ]);
    if (marker.exists) return marker.data()?.result;
    if (!assignmentSnapshot.exists || !labSnapshot.exists) throw new HttpsError("not-found", "That modeling lab is not available.");
    const assignment = assignmentSnapshot.data() || {};
    const labDefinition = labSnapshot.data() || {};
    if (String(labDefinition.assignmentId || "") !== assignmentId) throw new HttpsError("failed-precondition", "The modeling lab is not attached to this assignment.");
    const studentData = studentSnapshot.exists ? (studentSnapshot.data() || {}) : {};
    const classPeriod = String(studentData.classPeriod || "Unassigned");
    if (!studentMatchesAssignmentAudience({ assignment, classId: studentData.classId || null, classPeriod })) {
      throw new HttpsError("permission-denied", "This modeling lab is not assigned to your MathMaster class.");
    }

    let evaluation;
    try {
      evaluation = labEvaluation.evaluateLabSubmission({
        labDefinition,
        studentHypothesis: submission.studentHypothesis,
        trialHistory: submission.trialHistory,
        finalParameterValues: submission.finalParameterValues,
        studentJustification: submission.studentJustification,
      });
    } catch (error) {
      throw new HttpsError("invalid-argument", `Modeling lab submission could not be evaluated: ${error.message}`);
    }
    const supportSource = submission.supportUsage && typeof submission.supportUsage === "object" ? submission.supportUsage : {};
    const supportUsage = {
      modified: Boolean(supportSource.modified),
      accommodations: Array.isArray(supportSource.accommodations) ? supportSource.accommodations.map(String).slice(0, 20) : [],
      modifications: Array.isArray(supportSource.modifications) ? supportSource.modifications.map(String).slice(0, 20) : [],
      hintUsed: false,
      teacherAssisted: Boolean(supportSource.teacherAssisted),
      scaffoldUsed: false,
      contextScaffoldUsed: false,
      remediationUsed: false,
      workedExampleUsed: false,
      calculatorUsed: Boolean(supportSource.calculatorUsed),
    };
    supportUsage.isMathematicallyIndependent = mathPath.mathematicalIndependence(supportUsage);
    const now = Date.now();
    const eventKey = mathPath.opaqueId("evlab", studentId, assignmentId, labId, submissionId);
    const eventRef = db.collection("grades").doc(studentId).collection("evidenceEvents").doc(eventKey);
    const alignmentKeys = (labDefinition.teksAlignments || []).map(mathPath.canonicalAlignmentKey).filter(Boolean);
    const event = {
      schemaVersion: 1,
      eventKey,
      studentId,
      occurredAt: now,
      alignmentKeys,
      masteryEvidenceKeys: alignmentKeys,
      questionSnapshot: {
        questionInstanceId: `lab:${labId}`,
        questionId: labId,
        familyId: `modelingLab:${labDefinition.labType || "modeling"}`,
        familyVersion: 1,
        questionType: "modelingLab",
        difficultyBand: 5,
        dok: Number(labDefinition.dokLevel) || 3,
      },
      source: { kind: "modelingLab", assignmentId, activityRole: labDefinition.activityRole || "classwork", labId },
      performance: { score: evaluation.compositeScore, isCorrect: evaluation.isMastered, attemptNumber: 1, status: "finalized", isMathematicallyIndependent: supportUsage.isMathematicallyIndependent },
      supportUsage,
      supportTelemetry: mathPath.supportTelemetry(supportUsage),
      modeling: { rubricBreakdown: evaluation.rubricBreakdown, trialCount: evaluation.trialCount, uniqueTrialCount: evaluation.uniqueTrialCount, constraintViolationCount: evaluation.constraintViolations.length },
    };
    const response = { success: true, submissionId, evaluation, gradingAuthority: "server" };
    transaction.set(eventRef, event);
    transaction.set(markerRef, { studentId, assignmentId, labId, submissionId, createdAt: now, result: response });
    return response;
  });
  return result;
});

// Immutable evidence drives the Phase 5A mastery wheel. A separate idempotency
// marker prevents a retried Firestore trigger from counting the same event twice.
exports.updateMyMathPathMasteryFromEvidence = onDocumentCreated(
  { document: "grades/{studentId}/evidenceEvents/{eventId}" },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot?.exists) return;
    const evidence = snapshot.data() || {};
    const studentId = event.params.studentId;
    if (evidence.studentId && String(evidence.studentId) !== String(studentId)) return;
    const eventKey = String(evidence.eventKey || event.params.eventId);
    // Each QUESTION is one event, scored by its final attempt, as the
    // assignment record scores it (functions/shared/masteryScoring.mjs): a
    // question right on the second try reads 100%, not 50%, so the Path map,
    // the wheel, its card and the weekly planner read the same number.
    //
    // The support discount is NOT folded into the weight (that was a real bug:
    // the 0.85 divided straight back out and a hint on every question still
    // reached Mastered). WEIGHT is how much an event counts as evidence and
    // stays in the denominator; CREDIT is what the student demonstrated,
    // discounted for support. Both live in masteryEventFacts now.
    const masteryScoring = await import("./shared/masteryScoring.mjs");
    const facts = masteryScoring.masteryEventFacts(evidence, mathPath, { eventId: event.params.eventId });
    if (!facts.codes.length) return;

    const db = getFirestore();
    const profileRef = db.collection("studentMasteryProfiles").doc(studentId);
    const applicationRef = db.collection("masteryEvidenceApplications").doc(mathPath.opaqueId("mastery", studentId, eventKey));
    // Growth over time: one compact snapshot per week, written in this same
    // transaction from the same profiles (functions/shared/masteryHistory.mjs).
    const masteryHistory = await import("./shared/masteryHistory.mjs");
    const historyRef = db.collection(masteryHistory.MASTERY_HISTORY_COLLECTION).doc(studentId);

    await db.runTransaction(async (transaction) => {
      const [application, profileSnapshot, historySnapshot] = await Promise.all([
        transaction.get(applicationRef),
        transaction.get(profileRef),
        transaction.get(historyRef),
      ]);
      if (application.exists) return;
      const stored = profileSnapshot.exists ? (profileSnapshot.data() || {}) : {};
      const profiles = { ...(stored.profiles || {}) };

      // ONE definition of Mastered (functions/shared/masteryRule.mjs), read
      // by the wheel, the Path map, Recommended and the prerequisite locks.
      facts.codes.forEach((code) => {
        profiles[code] = masteryScoring.applyMasteryEvent(profiles[code], facts, code, { now: Date.now() }).entry;
      });
      // Held well under Firestore's 1 MiB document limit, however long the
      // history (masteryScoring.mjs compactQuestionRows).
      masteryScoring.compactQuestionRows(profiles);

      // The mastery profile inherits the evidence's authorization context, so
      // a derived record is never readable by anyone the source was not. The
      // history below inherits the very same context object.
      const authorization = masteryHistory.derivedMasteryAuthorization(evidence);
      // Whole, not merged: a merge would keep question rows dropped from the
      // bounded lists. `stored` was read in this transaction, so nothing else
      // on the document is lost.
      transaction.set(profileRef, {
        ...stored,
        profiles,
        studentId,
        ...authorization,
        updatedAt: Date.now(),
      });
      // An addition, never a gate: if a snapshot cannot be built, the profile
      // update above still lands and the history simply skips this answer.
      let historyDocument = null;
      try {
        historyDocument = masteryHistory.buildMasteryHistoryDocument({
          existing: historySnapshot.exists ? historySnapshot.data() : null,
          profiles,
          studentId,
          authorization,
          occurredAt: evidence.occurredAt,
          now: Date.now(),
        });
      } catch (error) {
        logger.warn("Mastery history snapshot skipped", { studentId, eventKey, message: error?.message || String(error) });
      }
      // Whole, not merged: the pruned weeks map replaces the old one.
      if (historyDocument) transaction.set(historyRef, historyDocument);
      transaction.set(applicationRef, { studentId, eventKey, appliedAt: Date.now() });
    });
  },
);

exports.hydrateAssignmentCcmr = onCall({
  timeoutSeconds: 60,
  memory: "1GiB",
}, async (request) => {
  const teacherUid = await requireTeacher(request);
  const assignment = request.data?.assignment;
  if (!assignment || typeof assignment !== "object" || Array.isArray(assignment)) {
    throw new HttpsError("invalid-argument", "Provide one Assignment V5 object to prepare CCMR Practice.");
  }
  if (Number(assignment.schemaVersion) !== 5 || !Array.isArray(assignment.sections)) {
    throw new HttpsError("failed-precondition", "CCMR bank hydration requires Assignment V5 sections.");
  }

  // Pre-Flight asks for the ranked alternatives behind each choice so it can
  // validate them before the teacher creates anything; a teacher who set an
  // audited item aside sends its document id so it is not offered again.
  const excludeDocumentIds = (Array.isArray(request.data?.excludeDocumentIds) ? request.data.excludeDocumentIds : [])
    .filter((value) => typeof value === "string" && value.trim())
    .slice(0, 100);
  try {
    const result = ccmrAssignmentBank.replaceDirectCcmrQuestionsWithAuditedBank(assignment, {
      ensurePracticeTarget: request.data?.ensurePracticeTarget === true,
      includeCandidates: request.data?.includeCandidates === true,
      excludeDocumentIds,
    });
    await getFirestore().collection("assignmentCcmrHydrationAudit").add({
      teacherUid,
      teacherEmail: callerEmail(request),
      releaseTarget: result.audit?.releaseTarget || null,
      replaced: Number(result.audit?.replaced || 0),
      autoSourced: Number(result.audit?.autoSourced || 0),
      targetCount: Number(result.audit?.targetCount || 0),
      missCount: Array.isArray(result.audit?.misses) ? result.audit.misses.length : 0,
      // Pre-Flight's Honors version asks again whenever its questions change;
      // those planning calls are told apart from an import's hydration.
      preflightPlan: request.data?.includeCandidates === true,
      createdAt: FieldValue.serverTimestamp(),
    });
    return result;
  } catch (error) {
    logger.error("Assignment CCMR bank hydration failed", {
      teacherUid,
      message: error?.message || String(error),
    });
    throw new HttpsError("internal", "MathMaster could not prepare audited CCMR Practice for this assignment.");
  }
});
