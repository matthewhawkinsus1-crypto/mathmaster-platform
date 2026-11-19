/*
 * WHAT PRE-FLIGHT SAYS ABOUT EACH QUESTION, WHERE THE TEACHER EDITS IT.
 *
 * Pre-Flight finds two kinds of thing. Readiness warnings (a given written
 * x(x - 5) = 0, a Step Algebra equation whose variable cancels: semantic
 * warnings and the rest of the model's `warnings`) make an assignment Needs
 * Review. Advisory notes (ADVISORY_FINDING_GROUPS: a prompt that needs
 * another question's answer, an answer key to check, ...) are advice, each in
 * its own panel of Assignment Review's Check step. The Question Editor ran the
 * same model only to refuse an error, so a teacher fixing a question there
 * could not see what Pre-Flight said about it.
 *
 * This hands each question its own findings, in full text, from the SAME
 * model: buildAssignmentV5PreflightModel, which Review and the editor's own
 * Save both run. Nothing here judges anything.
 *   - A readiness warning goes to the question its diagnostic names
 *     (preflightDiagnostics.js, the attribution the Repair Center uses).
 *   - An advisory note goes to the question it opens with ("Question 3,
 *     hint 2 ..."). A note that covers many questions at once ("35 questions
 *     — 1, 2, 3 ... have hints with no Spanish version") goes to each of them
 *     in the words its own audit writes for one question, after the
 *     question's own notes.
 *   - Whatever names no question (an alignment spread across the assignment,
 *     a section whose questions do not vary) is the whole assignment's.
 * Every message the model holds is shown exactly once, and none is added.
 * Neither kind ever blocks a save: only the model's errors do.
 */
import { ADVISORY_FINDING_GROUPS, buildAssignmentV5PreflightModel } from './assignmentV5PreflightModel.js';
import { answerOnlyNote, noCommonErrorNote } from './solutionReviewPreflight.js';
import { hintsWithoutSpanishNote, solutionWithoutSpanishNote } from './spanishVersionPreflight.js';
import { storedAssignmentToV5 } from '../contract/storedAssignmentV5.js';

const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);

// The notes an audit writes once for many questions, by the list of question
// numbers it keeps for each: the field, and the sentence for any such list.
const SPREAD_NOTES = Object.freeze({
  solutionReviews: Object.freeze([['answerOnly', answerOnlyNote], ['noCommonError', noCommonErrorNote]]),
  spanishVersions: Object.freeze([['hintsMissing', hintsWithoutSpanishNote], ['reviewMissing', solutionWithoutSpanishNote]]),
});

const LEADING_QUESTION = /^Question (\d+)\b/;

// `shared` holds, until the end, the notes a question shares with others (its
// line of a many-question note): its own notes come first.
const emptyFindings = () => ({ warnings: [], notes: [], shared: [] });

/**
 * { byQuestionId: Map<questionId, { warnings: string[], notes: string[] }>,
 *   assignment: { warnings, notes }, warningCount, noteCount }
 * from a Pre-Flight model. A question with nothing to say has no entry.
 */
export const preflightFindingsByQuestion = (model = {}) => {
  const ids = list(model?.questions).map((question) => clean(question?.questionId) || null);
  const byQuestionId = new Map();
  const assignment = emptyFindings();
  const findingsAt = (index) => {
    const id = Number.isInteger(index) && index >= 0 ? ids[index] : null;
    if (!id) return assignment;
    if (!byQuestionId.has(id)) byQuestionId.set(id, emptyFindings());
    return byQuestionId.get(id);
  };
  const add = (bucket, text) => {
    if (text && !bucket.includes(text)) bucket.push(text);
  };

  // Readiness warnings: the diagnostics the model built from its `warnings`.
  list(model?.diagnostics)
    .filter((diagnostic) => diagnostic?.severity === 'warning')
    .forEach((diagnostic) => {
      const byId = clean(diagnostic.questionId) ? ids.indexOf(clean(diagnostic.questionId)) : -1;
      const index = byId >= 0 ? byId : diagnostic.questionIndex;
      add(findingsAt(index).warnings, clean(diagnostic.message));
    });

  // Advisory notes: every group Review's suggestions line counts.
  ADVISORY_FINDING_GROUPS.forEach(({ id }) => {
    const audit = model?.[id] || {};
    const spread = SPREAD_NOTES[id] || [];
    const covered = new Set();
    spread.forEach(([field, sentence]) => {
      const numbers = list(audit[field]);
      if (!numbers.length) return;
      covered.add(sentence(numbers));
      numbers.forEach((number) => add(findingsAt(Number(number) - 1).shared, sentence([number])));
    });
    list(audit.warnings).forEach((warning) => {
      const text = clean(warning);
      if (!text || covered.has(text)) return;
      const named = text.match(LEADING_QUESTION);
      add(findingsAt(named ? Number(named[1]) - 1 : -1).notes, text);
    });
  });

  const counted = [...byQuestionId.values(), assignment];
  counted.forEach((entry) => {
    entry.shared.forEach((text) => add(entry.notes, text));
    delete entry.shared;
  });
  return {
    byQuestionId,
    assignment,
    warningCount: counted.reduce((sum, entry) => sum + entry.warnings.length, 0),
    noteCount: counted.reduce((sum, entry) => sum + entry.notes.length, 0),
  };
};

/**
 * The Question Editor's findings for the questions it holds: the candidate its
 * Save would judge (storedAssignmentToV5 with the edited questions, after any
 * sections an Honors swap appended), checked against the class Review checks
 * against.
 */
export const editorPreflightFindings = ({ source, questions, classSize = null } = {}) => preflightFindingsByQuestion(
  buildAssignmentV5PreflightModel(storedAssignmentToV5(source, { questions }), { classSize }),
);

/**
 * One of the editor's runs, as its worker answers it (editorPreflightWorker.js,
 * and the page itself where no worker can start): the request's id and the
 * findings for its { source, questions, classSize }, or null for a candidate
 * the model cannot read at all (Save says why).
 */
export const answerEditorPreflightRequest = ({ id = null, source, questions, classSize = null } = {}) => {
  let findings = null;
  try {
    findings = editorPreflightFindings({ source, questions, classSize });
  } catch {
    findings = null;
  }
  return { id, findings };
};

/**
 * The class a question's versions are counted against: the largest of the
 * classes chosen, or of all the teacher's classes when none is (Review's
 * rule, for uniqueness is per class). null when no roster size is known.
 */
export const preflightClassSizeFor = (classIds = [], rosterSizesByClassId = {}) => {
  const chosen = Array.isArray(classIds) && classIds.length ? classIds : Object.keys(rosterSizesByClassId || {});
  const sizes = chosen.map((classId) => Number(rosterSizesByClassId?.[classId]) || 0).filter((size) => size > 0);
  return sizes.length ? Math.max(...sizes) : null;
};

/** "1 warning, 2 notes", "3 notes", "1 warning": the count a region's heading gives. */
export const preflightFindingsCountText = ({ warnings = [], notes = [] } = {}) => [
  warnings.length ? `${warnings.length} warning${warnings.length === 1 ? '' : 's'}` : '',
  notes.length ? `${notes.length} note${notes.length === 1 ? '' : 's'}` : '',
].filter(Boolean).join(', ');
