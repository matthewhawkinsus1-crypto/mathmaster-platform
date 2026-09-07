/*
 * HISTORY IS QUESTION-SCOPED, AND RESTORING IS AN EDIT.
 *
 * Storing a full copy of the assignment per revision would make the draft grow
 * without limit and bury the one thing a teacher wants to see: what changed
 * about THIS question. So an entry records only the questions a commit actually
 * changed, each with its before and after.
 *
 * RESTORING GOES FORWARD. Putting an old question back is a decision made now,
 * so it produces a NEW revision rather than moving the number backward. That is
 * not bookkeeping: the revision is the staleness mechanism. Roll it back to 4
 * and every repair packet a teacher generated at revision 4 — including ones
 * built against content that has since changed — starts passing the staleness
 * check again, and applying one would overwrite the restore that just happened.
 * A restore is also itself repairable and reversible, because it lands in
 * history like any other edit.
 */

const text = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);
const jsonSafe = (value) => JSON.parse(JSON.stringify(value));

const revisionNumber = (value, fallback = null) => (
  Number.isFinite(Number(value)) ? Number(value) : fallback
);

/**
 * The questions one commit changed, each with its before and after.
 *
 * Compared by serialized value rather than identity so a repair that rewrites a
 * question into an equal object is correctly recorded as no change.
 */
export const changedQuestionsBetween = (beforeAssignmentV5, afterAssignmentV5) => {
  const before = new Map();
  list(beforeAssignmentV5?.sections).forEach((section) => {
    list(section?.questions).forEach((question) => {
      const id = text(question?.questionId);
      if (id) before.set(id, { question, sectionId: text(section?.id) || null });
    });
  });

  const changed = [];
  list(afterAssignmentV5?.sections).forEach((section) => {
    list(section?.questions).forEach((question) => {
      const id = text(question?.questionId);
      if (!id) return;
      const previous = before.get(id);
      if (!previous) return;
      if (JSON.stringify(previous.question) === JSON.stringify(question)) return;
      changed.push({
        questionId: id,
        sectionId: text(section?.id) || previous.sectionId || null,
        beforeQuestion: jsonSafe(previous.question),
        afterQuestion: jsonSafe(question),
      });
    });
  });

  return changed;
};

/** One history entry for a committed repair, or null when nothing changed. */
export const buildRepairHistoryEntry = ({
  beforeAssignmentV5 = null,
  afterAssignmentV5 = null,
  fromRevision = null,
  toRevision = null,
  committedAt = null,
} = {}) => {
  const questions = changedQuestionsBetween(beforeAssignmentV5, afterAssignmentV5);
  if (!questions.length) return null;

  return {
    fromRevision: revisionNumber(fromRevision, null),
    toRevision: revisionNumber(toRevision, null),
    committedAt: text(committedAt) || new Date().toISOString(),
    questions,
  };
};

/**
 * Stage putting one question back to how a history entry recorded it.
 *
 * Returns the candidate assignment and the revision numbers; committing is the
 * caller's job, through the same path as any other repair, so a restore is
 * revalidated exactly like an edit — because that is what it is.
 */
export const prepareQuestionRevisionRestore = ({
  assignmentV5 = null,
  historyEntry = null,
  questionId = null,
  currentRevision = null,
} = {}) => {
  const wanted = text(questionId);
  const recorded = list(historyEntry?.questions).find((entry) => text(entry?.questionId) === wanted);
  if (!recorded) {
    throw new Error(`This history entry does not contain question "${questionId || 'unknown'}", so there is no recorded version of it to restore.`);
  }

  const base = revisionNumber(currentRevision, revisionNumber(historyEntry?.toRevision, 1));
  let found = false;
  const sections = list(assignmentV5?.sections).map((section) => {
    let sectionChanged = false;
    const questions = list(section?.questions).map((question) => {
      if (text(question?.questionId) !== wanted) return question;
      found = true;
      sectionChanged = true;
      return jsonSafe(recorded.beforeQuestion);
    });
    return sectionChanged ? { ...section, questions } : section;
  });

  if (!found) {
    throw new Error(`Question "${questionId}" is no longer in this assignment, so its recorded version cannot be restored.`);
  }

  return {
    questionId: wanted,
    baseRevision: base,
    nextRevision: base + 1,
    restoredFromRevision: revisionNumber(historyEntry?.fromRevision, null),
    previousQuestion: jsonSafe(recorded.afterQuestion),
    restoredQuestion: jsonSafe(recorded.beforeQuestion),
    candidateAssignmentV5: { ...assignmentV5, sections },
  };
};

export default {
  buildRepairHistoryEntry,
  changedQuestionsBetween,
  prepareQuestionRevisionRestore,
};
