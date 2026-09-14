"use strict";

// Rebuild coverage for the courses a release actually changed.
//
// Coverage keeps its existing meaning and its existing source of truth:
//
//   canonical Texas standards + the ACTIVE secure Path bank + the production issuer
//
// What changes is how much work that costs. A release that changed one Algebra I
// family rebuilds Algebra I, not five courses, and it does not run the issuer
// over families whose exact bytes were already certified at build time — the
// certified verdict is pinned to the document's content hash, so reusing it is
// reusing the production issuer's own answer about those exact bytes.
//
// Digital SAT, ACT, TSIA2 and ASVAB documents are filtered out before any plan
// is built. A course release never validates assessment content.

const { requireRuntime, importRuntime } = require("./runtime");

const BANK_COLLECTION = "pathQuestionBank";
const COVERAGE_COLLECTION = "pathCoverage";

const compiler = () => requireRuntime("lib/pathContentCompiler.js");

function isCourseDocument(data = {}) {
  return String(data?.assessmentContext?.framework || "course") === "course";
}

/**
 * Rebuild the stored coverage index for each named course.
 *
 * `certifiedPlans` maps a document content hash to the build-time issuer verdict
 * for those exact bytes. Anything not covered by it — a teacher-imported course
 * document, content from an older release line — is validated here by the
 * production issuer, so coverage never silently assumes an unproven family works.
 */
async function rebuildAffectedCoverage(db, {
  courses = [],
  certifiedPlans = new Map(),
  now = Date.now(),
} = {}) {
  if (!courses.length) {
    return { courses: [], indexes: {}, issuerRuns: 0, documentsRead: 0, reusedCertifiedPlans: 0 };
  }

  const [coverage, texasStandards, mathPath] = await Promise.all([
    importRuntime("shared/pathCoverage.mjs"),
    importRuntime("shared/texasStandards.mjs"),
    Promise.resolve(requireRuntime("lib/mathPath.js")),
  ]);
  const { pathDocumentContentHash } = compiler();

  const snapshot = await db.collection(BANK_COLLECTION).get();
  const bankItems = [];
  snapshot.docs.forEach((doc) => {
    const data = doc.data() || {};
    if (!isCourseDocument(data)) return;
    bankItems.push({ id: doc.id, ...data });
  });

  const plans = {};
  let issuerRuns = 0;
  let reusedCertifiedPlans = 0;
  for (const item of bankItems) {
    const hash = item.pathContentHash || pathDocumentContentHash(item);
    const certified = certifiedPlans.get(hash);
    if (certified) {
      plans[item.id] = { issuable: true, reason: null, samples: certified.samples || 0, certified: true };
      reusedCertifiedPlans += 1;
      continue;
    }
    issuerRuns += 1;
    // eslint-disable-next-line no-await-in-loop
    plans[item.id] = await safeIssuePlan(mathPath, item);
  }

  const indexes = {};
  for (const courseId of courses) {
    // THE COURSE MAP STAYS SERVER-AUTHORITATIVE. Standards come from the
    // canonical registry, never from a browser, a wheel, or a teacher assignment.
    const wheelTeks = texasStandards.getTexasStandardsForCourse(courseId)
      .filter((standard) => standard.classification !== "process")
      .map((standard) => standard.code);
    if (!wheelTeks.length) {
      throw new Error(`No canonical Texas standards are registered for ${courseId}.`);
    }
    const index = coverage.buildCoverageIndex({
      courseId,
      wheelTeks,
      bankItems,
      plans,
      generatedAt: now,
    });
    // eslint-disable-next-line no-await-in-loop
    await db.collection(COVERAGE_COLLECTION).doc(courseId).set(index);
    indexes[courseId] = { summary: index.summary || null, generatedAt: index.generatedAt || now };
  }

  return {
    courses: [...courses],
    indexes,
    issuerRuns,
    reusedCertifiedPlans,
    documentsRead: snapshot.size,
    sourceOfTruth: "canonical-texas-standards + secure-path-bank + production-issuer",
  };
}

async function safeIssuePlan(mathPath, item) {
  try {
    return await mathPath.buildTemplateIssuePlan(item);
  } catch (error) {
    return {
      issuable: false,
      reason: "validator_exception",
      detail: error?.message || String(error),
      samples: 0,
    };
  }
}

/** Which course coverage documents already exist, so a missing one is rebuilt. */
async function existingCoverageCourses(db, courses = []) {
  const snapshots = await Promise.all(courses.map((courseId) => db.collection(COVERAGE_COLLECTION).doc(courseId).get()));
  return courses.filter((courseId, index) => snapshots[index].exists);
}

module.exports = { rebuildAffectedCoverage, existingCoverageCourses, COVERAGE_COLLECTION };
