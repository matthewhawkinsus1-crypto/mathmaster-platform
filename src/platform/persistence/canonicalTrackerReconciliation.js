/*
 * WHAT THE SERVER RECORDED, REACHING THE QUESTION THE STUDENT HAS OPEN.
 *
 * A student's question records come from the server once, at sign-in; after
 * that the open session moves them forward itself as the student submits, and
 * the live grade-document listener deliberately left them alone, so a slow
 * ingestion could never roll back an answer the student had just given.
 *
 * But the server also records attempts the device never made. At a Warm-Up
 * or DOL deadline the finalizer auto-submits the student's checkpointed work.
 * The open session never heard of that attempt: it still showed "2 of 3 tries
 * left" on a question the server had just closed, so after the teacher
 * reopened the Warm-Up it offered a Check the server would refuse, and its
 * next checkpoint carried an attempt count the server no longer had — so a
 * second close skipped the student's newer work as "superseded". Only a reload
 * brought the record back into line.
 *
 * So a server record is adopted when it is AHEAD of the open session's:
 *
 *   - a later variant (the question was replaced on another device), or
 *   - the same variant with more attempts recorded.
 *
 * Never otherwise. A record the session moved ahead itself (a submission
 * still queued, or ingested but not yet echoed) is never rolled back, and an
 * equal record is left as it is. Grades are never decided here: the server's
 * record is the grade, and adopting it only stops the screen contradicting it.
 *
 * Pure. Returns the same object when nothing is adopted.
 */
import { normalizeQuestionRecord } from '../../attemptPolicy.js';

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** Is the server's record ahead of the session's for the same question? */
export const canonicalRecordIsAhead = (sessionRecord, serverRecord) => {
  if (!serverRecord) return false;
  const server = normalizeQuestionRecord(serverRecord);
  const session = normalizeQuestionRecord(sessionRecord);
  if (server.variantIndex !== session.variantIndex) return server.variantIndex > session.variantIndex;
  return server.totalAttempts > session.totalAttempts;
};

/**
 * The session's grades with every record the server is ahead on adopted.
 * `adopted` lists what moved (assignment, question index, attempts, variant).
 */
export const adoptCanonicalAdvances = (sessionGrades = {}, serverGrades = {}) => {
  const session = isPlainObject(sessionGrades) ? sessionGrades : {};
  let next = session;
  const adopted = [];
  Object.entries(isPlainObject(serverGrades) ? serverGrades : {}).forEach(([assignmentId, serverTracker]) => {
    if (!isPlainObject(serverTracker)) return;
    const sessionTracker = isPlainObject(session[assignmentId]) ? session[assignmentId] : {};
    Object.entries(serverTracker).forEach(([questionIndex, serverRecord]) => {
      if (!canonicalRecordIsAhead(sessionTracker[questionIndex], serverRecord)) return;
      if (next === session) next = { ...session };
      if (next[assignmentId] === session[assignmentId]) next[assignmentId] = { ...sessionTracker };
      next[assignmentId][questionIndex] = serverRecord;
      const normalized = normalizeQuestionRecord(serverRecord);
      adopted.push({
        assignmentId,
        questionIndex: Number(questionIndex),
        totalAttempts: normalized.totalAttempts,
        variantIndex: normalized.variantIndex,
      });
    });
  });
  return { grades: next, adopted };
};
