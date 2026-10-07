"use strict";

/*
 * The server half of the end-of-session recap (functions/shared/pathSessionRecap.mjs
 * holds the rules).
 *
 * WHERE THE ENTRIES LIVE. When a question closes, `submitPathResponse` clears
 * it off the session document — the session never holds a closed item, so
 * nothing about it survives there. The finalizing attempt's `pathSubmissions`
 * document is written in the same transaction, is server-only (rules deny all
 * client access) and is keyed to the session, so the recap entry rides on it
 * as one JSON string. Nothing new is readable by a browser until
 * `getMyPathSessionRecap` releases it.
 */

const mathPath = require("./mathPath");

let recapModule = null;
/** The shared rules, loaded once. Await this BEFORE a transaction opens. */
async function pathSessionRecapRules() {
  if (!recapModule) recapModule = await import("../shared/pathSessionRecap.mjs");
  return recapModule;
}

/**
 * The stored recap entry for an attempt that just closed its question, or null
 * for an attempt that leaves it open. Synchronous, so it can run inside the
 * submit transaction; NEVER throws, because a recap is not allowed to cost a
 * student their graded answer.
 */
function closedQuestionRecapJson(rules, {
  sessionId,
  currentQuestion,
  responsePayload,
  grading,
  solutionReview,
  questionNumber,
  skillCode,
  closedAt,
  onError = null,
} = {}) {
  if (!rules || !grading?.questionFinalized || !currentQuestion) return null;
  try {
    // Exactly what issueNextQuestion handed the browser for this item.
    const publicQuestion = mathPath.buildSanitizedQuestion(currentQuestion, {
      questionInstanceId: currentQuestion.questionInstanceId,
      attemptsAllowed: currentQuestion.attemptsAllowed,
      attemptsUsed: Number(grading.attemptNumber) || Number(currentQuestion.attemptsUsed) || 0,
      toolPayload: mathPath.storedToolPayload(currentQuestion),
    });
    const entry = rules.buildPathRecapEntry({
      sessionId,
      questionInstanceId: currentQuestion.questionInstanceId,
      questionNumber,
      skillCode,
      closedAt,
      publicQuestion,
      // The stored item names choices in the grading definition's id space.
      answerKeyQuestion: currentQuestion,
      privateGrading: currentQuestion.privateGrading || null,
      responsePayload,
      grading: { ...grading, attemptsAllowed: currentQuestion.attemptsAllowed },
      solutionReview,
    });
    return rules.serializePathRecapEntry(entry);
  } catch (error) {
    if (typeof onError === "function") onError(error);
    return null;
  }
}

/**
 * The caller's recap for one session: `{ recap }`, or `{ refused }` holding the
 * HttpsError code and message the callable throws. The session is read first
 * and the access rule applied before any submission is read.
 */
async function loadMyPathSessionRecap(db, { studentId, sessionId }) {
  const rules = await pathSessionRecapRules();
  const sessionSnapshot = await db.collection("pathSessions").doc(sessionId).get();
  const session = sessionSnapshot.exists ? (sessionSnapshot.data() || {}) : null;
  const access = rules.pathRecapAccess({ session, studentId });
  if (!access.allowed) return { refused: { code: access.code, message: access.message } };

  // Every attempt has a submission document carrying its whole result; only
  // the owner and the recap entry are needed here.
  const submissions = await db.collection("pathSubmissions")
    .where("sessionId", "==", sessionId)
    .select("studentId", "recapJson")
    .get();
  const entries = submissions.docs
    .map((doc) => doc.data() || {})
    .filter((data) => String(data.studentId || "") === String(studentId))
    .map((data) => rules.parsePathRecapEntry(data.recapJson))
    .filter(Boolean);
  return { recap: rules.buildPathSessionRecap({ session: { ...session, sessionId: session.sessionId || sessionId }, entries }) };
}

module.exports = {
  closedQuestionRecapJson,
  loadMyPathSessionRecap,
  pathSessionRecapRules,
};
