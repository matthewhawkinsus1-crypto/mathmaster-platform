import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targetPath = path.join(repoRoot, 'functions', 'index.js');
let source = fs.readFileSync(targetPath, 'utf8');
let changed = false;

function replaceOnce(before, after, label) {
  if (source.includes(after)) return;
  const first = source.indexOf(before);
  if (first === -1) throw new Error(`Could not find ${label} insertion point in functions/index.js.`);
  if (source.indexOf(before, first + before.length) !== -1) {
    throw new Error(`Refusing ambiguous ${label} patch in functions/index.js.`);
  }
  source = `${source.slice(0, first)}${after}${source.slice(first + before.length)}`;
  changed = true;
}

replaceOnce(
  'const pathRouting = require("./lib/pathRouting");',
  'const pathRouting = require("./lib/pathRouting");\nconst pathContentRelease = require("./lib/pathContentRelease");',
  'pathContentRelease import',
);

replaceOnce(
  '  // A CCMR launch is allowed to call itself SAT/ACT/TSIA2/ASVAB practice only',
  `  let assessmentReleaseState = {\n    framework: assessmentFramework || null,\n    tracked: false,\n    release: null,\n    matchingFamilies: 0,\n  };\n\n  // A CCMR launch is allowed to call itself SAT/ACT/TSIA2/ASVAB practice only`,
  'start-session release state',
);

replaceOnce(
  `    const frameworkRecords = frameworkSnapshot.docs\n      .map((questionDoc) => ({ id: questionDoc.id, ...questionDoc.data() }))\n      .filter((question) => question.active !== false)\n      .filter((question) => pathQuestionMatchesFramework(question, assessmentFramework));\n    const frameworkPlans = await Promise.all(frameworkRecords.map(async (question) => ({`,
  `    const frameworkRecords = frameworkSnapshot.docs\n      .map((questionDoc) => ({ id: questionDoc.id, ...questionDoc.data() }))\n      .filter((question) => question.active !== false)\n      .filter((question) => pathQuestionMatchesFramework(question, assessmentFramework));\n    assessmentReleaseState = pathContentRelease.resolveAssessmentContentRelease(frameworkRecords, assessmentFramework);\n    const frameworkPlans = await Promise.all(frameworkRecords.map(async (question) => ({`,
  'start-session release resolution',
);

replaceOnce(
  `  const session = await db.runTransaction(async (transaction) => {\n    const lock = await transaction.get(lockRef);`,
  `  const session = await db.runTransaction(async (transaction) => {\n    const now = Date.now();\n    const lock = await transaction.get(lockRef);`,
  'transaction timestamp',
);

replaceOnce(
  `        if ((existing.data()?.assessmentFramework || null) !== assessmentFramework) {\n          throw new HttpsError("failed-precondition", "Finish the active session before changing assessment format.");\n        }\n        return existing.data();`,
  `        if ((existing.data()?.assessmentFramework || null) !== assessmentFramework) {\n          throw new HttpsError("failed-precondition", "Finish the active session before changing assessment format.");\n        }\n        const releaseAction = pathContentRelease.planSessionContentReleaseAction(existing.data(), assessmentReleaseState);\n        if (releaseAction.action !== "supersede") return existing.data();\n        transaction.set(\n          existingRef,\n          pathContentRelease.supersedeSessionForContentRelease(existing.data(), assessmentReleaseState.release, now),\n        );`,
  'active-session rollover',
);

replaceOnce(
  `\n    const now = Date.now();\n    const targetDisplay = mathPath.displayAlignmentKey(targetAlignmentKey);`,
  `\n    const targetDisplay = mathPath.displayAlignmentKey(targetAlignmentKey);`,
  'duplicate transaction timestamp removal',
);

replaceOnce(
  `      sessionKind,\n      assessmentFramework,\n      ccmrChallengeTier: assessmentFramework ? ccmrChallengeTier : null,`,
  `      sessionKind,\n      assessmentFramework,\n      assessmentContentRelease: assessmentReleaseState.tracked ? assessmentReleaseState.release : null,\n      ccmrChallengeTier: assessmentFramework ? ccmrChallengeTier : null,`,
  'new-session release marker',
);

const issueAnchor = '  const targetDisplayCode = mathPath.displayAlignmentKey(session.target.alignmentKey);';
if (!source.includes('pathContentRelease.resolveAssessmentContentRelease(targetFrameworkRecords, session.assessmentFramework)')) {
  const issueBlock = `  if (session.assessmentFramework) {\n    // Release compatibility is resolved from the TARGET assessment families,\n    // not from a remediation excursion. A course bridge inside SAT/ACT/TSIA2\n    // must not make the session look untracked. Read a broad bounded slice so\n    // legacy and replacement families are both visible during a bank refresh.\n    const targetReleaseSnapshot = await db.collection("pathQuestionBank")\n      .where("alignmentKeys", "array-contains", session.target.alignmentKey)\n      .limit(200)\n      .get();\n    const targetFrameworkRecords = targetReleaseSnapshot.docs\n      .map((questionDoc) => ({ id: questionDoc.id, ...questionDoc.data() }))\n      .filter((question) => question.active !== false)\n      .filter((question) => pathQuestionMatchesFramework(question, session.assessmentFramework));\n    const issueReleaseState = pathContentRelease.resolveAssessmentContentRelease(targetFrameworkRecords, session.assessmentFramework);\n    const releaseAction = pathContentRelease.planSessionContentReleaseAction(session, issueReleaseState);\n\n    if (releaseAction.action === "supersede") {\n      const rollover = await db.runTransaction(async (transaction) => {\n        const fresh = await transaction.get(sessionRef);\n        if (!fresh.exists || fresh.data()?.studentId !== studentId) {\n          throw new HttpsError("not-found", "That My Math Path session is not available.");\n        }\n        const freshData = fresh.data();\n        if (freshData.currentQuestion) {\n          return {\n            questionInstance: mathPath.buildSanitizedQuestion(freshData.currentQuestion, {\n              questionInstanceId: freshData.currentQuestion.questionInstanceId,\n              attemptsAllowed: freshData.currentQuestion.attemptsAllowed,\n              attemptsUsed: freshData.currentQuestion.attemptsUsed,\n              toolPayload: mathPath.storedToolPayload(freshData.currentQuestion),\n            }),\n          };\n        }\n\n        const rolloverPayload = {\n          reason: pathContentRelease.RELEASE_CHANGE_REASON,\n          assessmentFramework: session.assessmentFramework,\n          targetAlignmentKey: session.target.alignmentKey,\n          currentRelease: issueReleaseState.release,\n        };\n        if (freshData.status === "superseded" && freshData.supersededReason === pathContentRelease.RELEASE_CHANGE_REASON) {\n          return { rollover: rolloverPayload };\n        }\n        if (freshData.status !== "active") {\n          throw new HttpsError("failed-precondition", "This My Math Path session is already complete.");\n        }\n\n        const freshAction = pathContentRelease.planSessionContentReleaseAction(freshData, issueReleaseState);\n        if (freshAction.action !== "supersede") {\n          // The only supported race from a stale/no-question state is another\n          // issuer creating the current question (handled above) or another\n          // issuer superseding it (handled above). Refuse any unexpected state\n          // instead of issuing across releases.\n          throw new HttpsError(\n            "aborted",\n            "This assessment session changed while its content release was being checked. Start it again to continue.",\n            { reason: pathContentRelease.RELEASE_CHANGE_REASON },\n          );\n        }\n        const now = Date.now();\n        transaction.set(\n          sessionRef,\n          pathContentRelease.supersedeSessionForContentRelease(freshData, issueReleaseState.release, now),\n        );\n        return { rollover: rolloverPayload };\n      });\n      return rollover;\n    }\n  }\n\n`;
  replaceOnce(issueAnchor, `${issueBlock}${issueAnchor}`, 'issue-next-question rollover');
}

if (!changed) {
  console.log('CCMR session runtime wiring already applied.');
  process.exit(0);
}

fs.writeFileSync(targetPath, source);
console.log('Applied CCMR session runtime release wiring to functions/index.js.');
