#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const file = path.join(root, 'functions', 'index.js');
let source = fs.readFileSync(file, 'utf8');

function replaceOnce(before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${label}: anchor not found`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`${label}: anchor is not unique`);
  source = `${source.slice(0, first)}${after}${source.slice(first + before.length)}`;
}

replaceOnce(
  'const PATH_RUNTIME_RELEASE = "path-bank-2026-08-23-r11-ccmr-fidelity-v2";\nconst PATH_COURSE_IDS = Object.freeze(["grade6", "grade7", "grade8", "algebra1", "algebra2"]);',
  `const PATH_RUNTIME_RELEASE = "path-bank-2026-08-23-r11-ccmr-fidelity-v2";\nconst PATH_COURSE_IDS = Object.freeze(["grade6", "grade7", "grade8", "algebra1", "algebra2"]);\nconst CONTENT_RELEASE_MANIFEST_COLLECTION = "pathContentReleases";\nconst CONTENT_RELEASE_MANIFEST_DOC = "current";\nconst COORDINATED_CCMR_RELEASE_SEED_FILES = Object.freeze([\n  "digitalSAT_pathQuestionBank_seed.json",\n  "act_pathQuestionBank_seed.json",\n  "tsia2_pathQuestionBank_seed.json",\n]);\n\nasync function loadAssessmentContentReleaseState(db, framework, records = []) {\n  const manifestSnapshot = await db.collection(CONTENT_RELEASE_MANIFEST_COLLECTION).doc(CONTENT_RELEASE_MANIFEST_DOC).get();\n  const manifest = manifestSnapshot.exists ? manifestSnapshot.data() : null;\n  return pathContentRelease.resolveAssessmentContentReleaseAuthority(records, framework, manifest);\n}\n\nfunction pathQuestionMatchesSessionContentRelease(question, session = {}) {\n  const sessionFramework = String(session?.assessmentFramework || "").trim();\n  const sessionRelease = String(session?.assessmentContentRelease || "").trim();\n  const questionFramework = String(question?.assessmentContext?.framework || "").trim();\n  if (!sessionFramework || !sessionRelease || questionFramework !== sessionFramework) return true;\n  return String(question?.ccmrContentRelease || "").trim() === sessionRelease;\n}\n\nfunction assessmentReleaseUpdateError(framework) {\n  return new HttpsError(\n    "unavailable",\n    \\`${framework} practice is being updated. Reopen this practice after the release switch completes.\\`,\n    { reason: pathContentRelease.RELEASE_UPDATE_REASON, assessmentFramework: framework },\n  );\n}`,
  'release manifest runtime constants',
);

replaceOnce(
  'async function removeSupersededBuiltInPathSeedRecords(db, currentItems) {',
  `function loadCoordinatedCcmrReleaseSeed() {\n  const seedDirectory = path.join(__dirname, "seeds", "pathQuestionBank");\n  const items = COORDINATED_CCMR_RELEASE_SEED_FILES.flatMap((fileName) => {\n    const parsed = JSON.parse(fs.readFileSync(path.join(seedDirectory, fileName), "utf8"));\n    return Array.isArray(parsed) ? parsed : (parsed.documents || parsed.items || parsed.questions || []);\n  });\n  if (!items.length) throw new Error("The coordinated CCMR release package is empty.");\n  const ids = new Set(items.map((item) => String(item?.id || "").trim()));\n  if (ids.size !== items.length || ids.has("")) throw new Error("The coordinated CCMR release package contains missing or duplicate IDs.");\n  return items;\n}\n\nasync function removeSupersededBuiltInPathSeedRecords(db, currentItems) {`,
  'coordinated release seed loader',
);

replaceOnce(
  '/**\n * Rebuild stored coverage from the actual secure bank.\n */',
  `async function removeSupersededBuiltInAssessmentSeedRecords(db, currentItems, frameworks) {\n  const currentIds = new Set(currentItems.map((item) => String(item?.id || "").trim()).filter(Boolean));\n  const frameworkSet = new Set((Array.isArray(frameworks) ? frameworks : []).map(String));\n  const snapshot = await db.collection("pathQuestionBank").get();\n  const obsolete = snapshot.docs.filter((doc) => {\n    if (currentIds.has(doc.id)) return false;\n    const data = doc.data() || {};\n    const framework = String(data?.assessmentContext?.framework || "");\n    if (!frameworkSet.has(framework)) return false;\n    return data.builtInPathSeed === BUILT_IN_PATH_SEED_MARKER\n      || data?.seedMetadata?.source === LEGACY_BUILT_IN_PATH_SEED_SOURCE;\n  });\n\n  for (let index = 0; index < obsolete.length; index += 400) {\n    const batch = db.batch();\n    obsolete.slice(index, index + 400).forEach((doc) => batch.delete(doc.ref));\n    // eslint-disable-next-line no-await-in-loop\n    await batch.commit();\n  }\n  return obsolete.length;\n}\n\n/**\n * Rebuild stored coverage from the actual secure bank.\n */`,
  'selective assessment seed cleanup',
);

replaceOnce(
  '    assessmentReleaseState = pathContentRelease.resolveAssessmentContentRelease(frameworkRecords, assessmentFramework);\n    const frameworkPlans = await Promise.all(frameworkRecords.map(async (question) => ({\n      question, plan: await safeBuildTemplateIssuePlan(question, { operation: "path-runtime-framework-check" }),\n    })));\n    const issuableFamilies = new Set(frameworkPlans\n      .filter((entry) => entry.plan?.issuable)\n      .map((entry) => String(entry.question?.familyId || entry.question?.id || ""))\n      .filter(Boolean));\n    if (issuableFamilies.size < 5) {',
  `    assessmentReleaseState = await loadAssessmentContentReleaseState(db, assessmentFramework, frameworkRecords);\n    const activeFrameworkRecords = assessmentReleaseState.tracked\n      ? frameworkRecords.filter((question) => String(question?.ccmrContentRelease || "").trim() === String(assessmentReleaseState.release || "").trim())\n      : frameworkRecords;\n    const frameworkPlans = assessmentReleaseState.available === false ? [] : await Promise.all(activeFrameworkRecords.map(async (question) => ({\n      question, plan: await safeBuildTemplateIssuePlan(question, { operation: "path-runtime-framework-check" }),\n    })));\n    const issuableFamilies = new Set(frameworkPlans\n      .filter((entry) => entry.plan?.issuable)\n      .map((entry) => String(entry.question?.familyId || entry.question?.id || ""))\n      .filter(Boolean));\n    if (assessmentReleaseState.available !== false && issuableFamilies.size < 5) {`,
  'session-start release authority',
);

replaceOnce(
  '        const releaseAction = pathContentRelease.planSessionContentReleaseAction(existing.data(), assessmentReleaseState);\n        if (releaseAction.action !== "supersede") return existing.data();\n        transaction.set(\n          existingRef,\n          pathContentRelease.supersedeSessionForContentRelease(existing.data(), assessmentReleaseState.release, now),\n        );',
  `        const releaseAction = pathContentRelease.planSessionContentReleaseAction(existing.data(), assessmentReleaseState);\n        if (releaseAction.action === "continue" || releaseAction.action === "finish-open-question") return existing.data();\n        if (releaseAction.action === "hold-release-update") throw assessmentReleaseUpdateError(assessmentFramework);\n        if (releaseAction.action !== "supersede") {\n          throw new HttpsError("aborted", "The assessment content release changed while this session was being resumed.");\n        }\n        transaction.set(\n          existingRef,\n          pathContentRelease.supersedeSessionForContentRelease(existing.data(), assessmentReleaseState.release, now),\n        );`,
  'session-start existing-lock release action',
);

replaceOnce(
  '    const now = Date.now();\n    const targetDisplay = mathPath.displayAlignmentKey(targetAlignmentKey);',
  `    if (assessmentReleaseState.tracked && assessmentReleaseState.available === false) {\n      throw assessmentReleaseUpdateError(assessmentFramework);\n    }\n\n    const now = Date.now();\n    const targetDisplay = mathPath.displayAlignmentKey(targetAlignmentKey);`,
  'session-start new-session update hold',
);

replaceOnce(
  '    const issueReleaseState = pathContentRelease.resolveAssessmentContentRelease(targetFrameworkRecords, session.assessmentFramework);\n    const releaseAction = pathContentRelease.planSessionContentReleaseAction(session, issueReleaseState);\n\n    if (releaseAction.action === "supersede") {',
  `    const issueReleaseState = await loadAssessmentContentReleaseState(db, session.assessmentFramework, targetFrameworkRecords);\n    const releaseAction = pathContentRelease.planSessionContentReleaseAction(session, issueReleaseState);\n    if (releaseAction.action === "hold-release-update") {\n      throw assessmentReleaseUpdateError(session.assessmentFramework);\n    }\n\n    if (releaseAction.action === "supersede") {`,
  'question-issue release authority',
);

replaceOnce(
  '  const buildFrameworkPlans = async (framework) => Promise.all(bankRecords\n    .filter((question) => pathQuestionMatchesFramework(question, framework))\n    .map(async (question) => ({ question, plan: await safeBuildTemplateIssuePlan(question, { operation: "path-question-selection" }) })));',
  `  const buildFrameworkPlans = async (framework) => Promise.all(bankRecords\n    .filter((question) => pathQuestionMatchesFramework(question, framework))\n    .filter((question) => pathQuestionMatchesSessionContentRelease(question, session))\n    .map(async (question) => ({ question, plan: await safeBuildTemplateIssuePlan(question, { operation: "path-question-selection" }) })));`,
  'assessment candidate release filter',
);

replaceOnce(
  '/** Remove a promoted question from the Path bank without touching the assignment. */',
  `/**\n * Root-admin coordinated assessment-bank refresh.\n *\n * This deliberately loads only Digital SAT, ACT, and TSIA2. ASVAB remains on\n * its existing release until it is separately authored and promoted. The\n * manifest enters "updating" before the first Firestore bank mutation and is\n * activated only after all writes and selective cleanup finish. A failure in\n * between therefore leaves assessment issuance held rather than mixed.\n */\nexports.refreshReleasedCcmrPathBanks = onCall({ timeoutSeconds: 540, memory: "1GiB" }, async (request) => {\n  const actor = await requireRootAdmin(request);\n  const db = getFirestore();\n  let items;\n  try {\n    items = loadCoordinatedCcmrReleaseSeed();\n  } catch (error) {\n    logger.error("Could not load coordinated CCMR release package", error);\n    throw new HttpsError("failed-precondition", "The coordinated CCMR release package is unavailable in this deployment.");\n  }\n\n  const taggedItems = items.map((item) => ({\n    ...item,\n    builtInPathSeed: BUILT_IN_PATH_SEED_MARKER,\n    builtInPathSeedRelease: PATH_RUNTIME_RELEASE,\n  }));\n  const pendingReleases = pathContentRelease.collectAssessmentContentReleases(taggedItems);\n  const expectedFrameworks = ["act", "digitalSAT", "tsia2"];\n  const actualFrameworks = Object.keys(pendingReleases).sort();\n  if (JSON.stringify(actualFrameworks) !== JSON.stringify(expectedFrameworks)) {\n    throw new HttpsError(\n      "failed-precondition",\n      \\`The coordinated CCMR package must contain exactly ${expectedFrameworks.join(", ")}; found ${actualFrameworks.join(", ") || "none"}.\\`,\n    );\n  }\n\n  // First pass is intentionally read-only. The manifest does not close student\n  // issuance unless all 1,000 assessment documents pass the production issuer.\n  const validation = await processPathSeedImport({ db, actor, items: taggedItems, dryRun: true });\n  if (validation.rejected?.length || validation.wouldAccept !== taggedItems.length) {\n    return { ...validation, phase: "validation", pendingReleases };\n  }\n\n  const manifestRef = db.collection(CONTENT_RELEASE_MANIFEST_COLLECTION).doc(CONTENT_RELEASE_MANIFEST_DOC);\n  const manifestSnapshot = await manifestRef.get();\n  const currentManifest = manifestSnapshot.exists ? manifestSnapshot.data() : {};\n  const updatingManifest = pathContentRelease.beginAssessmentContentReleaseUpdate(\n    currentManifest,\n    pendingReleases,\n    Date.now(),\n  );\n  await manifestRef.set({ ...updatingManifest, updatedBy: actor.uid });\n\n  // A second validation inside processPathSeedImport protects the write itself.\n  // If anything fails from this point onward, the manifest intentionally stays\n  // in "updating" so no new assessment question is issued from a partial bank.\n  const seed = await processPathSeedImport({ db, actor, items: taggedItems, dryRun: false });\n  if (!seed.imported) {\n    throw new HttpsError("failed-precondition", "The coordinated CCMR bank failed its write-time validation; assessment issuance remains held.");\n  }\n\n  const removedSuperseded = await removeSupersededBuiltInAssessmentSeedRecords(\n    db,\n    taggedItems,\n    expectedFrameworks,\n  );\n  const { retireStaleTsia2PathStateForRelease } = await import("./shared/pathBankRelease.mjs");\n  const tsia2PathBankRelease = await retireStaleTsia2PathStateForRelease(db);\n\n  const activatedReleases = {\n    ...(currentManifest?.activeReleases || {}),\n    ...pendingReleases,\n  };\n  const activeManifest = pathContentRelease.completeAssessmentContentReleaseUpdate(\n    updatingManifest,\n    activatedReleases,\n    Date.now(),\n  );\n  await manifestRef.set({ ...activeManifest, updatedBy: actor.uid });\n  await writeAdminAudit(db, actor, "ccmr_path_banks_refreshed", CONTENT_RELEASE_MANIFEST_COLLECTION, {\n    frameworks: expectedFrameworks,\n    releases: pendingReleases,\n    accepted: seed.accepted,\n    removedSuperseded,\n  });\n\n  return {\n    ...seed,\n    phase: "complete",\n    releases: pendingReleases,\n    manifestStatus: activeManifest.status,\n    removedSuperseded,\n    tsia2PathBankRelease,\n  };\n});\n\n/** Remove a promoted question from the Path bank without touching the assignment. */`,
  'coordinated release refresh callable',
);

fs.writeFileSync(file, source);
console.log('Patched functions/index.js with atomic CCMR release manifest wiring.');
