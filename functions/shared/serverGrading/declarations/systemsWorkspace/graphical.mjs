/*
 * systemsWorkspace — graphical / matrix / spatial mode group
 * (see ../systemsWorkspace.mjs). Light: declarations only. The graders are in
 * ../../tools/systemsWorkspace/graphical.mjs.
 *
 * Every mode is a set of student entries checked against values the grader
 * recomputes from the question's own system / inequalities / parabola /
 * matrix / answer fields — nothing the browser holds that the server does not.
 *
 * Work shape (contractVersion 1 of the tool), per mode:
 *   linear           { classification, x, y }                      (x, y as typed)
 *   matrix           { classification, x, y }                      2×2
 *   matrix3          { classification, x, y, z, technologyUsed }   3×3 / 3×4 rows
 *   linearQuadratic  { count, points: [{ x, y }] }                 (parsed numbers)
 *   inequalities     legacy:  { construction, testChoice?, candidate? }
 *                    student-build: { build, rewrite?, modelingEntries?,
 *                      modelingSent?, regionClassification, teacherPointResponse?,
 *                      studentTestPoint?, studentPointResponse?, vertices,
 *                      outcomesWithheld? }  (true on a DOL, quiz or test: no
 *                      step Check there was a verdict, so each constraint is
 *                      graded from its work as it stands)
 *   spatial          { responses: [{ id, value }] }
 *
 * linear / matrix3 / legacy-inequality work is the same shape My Math Path's
 * contract reads (functions/shared/pathToolContracts.mjs), so a Path question
 * keeps receiving exactly the response it validates.
 *
 * Mode: the workspace renders resolveSystemsWorkspaceMode(question), and any
 * mode it does not know renders the linear workspace — the declaration's
 * defaultMode, so the manifest's own fallback matches the screen.
 *
 * Rewrite step (studentBuild.rewrite): the student's relation is turned into a
 * graphing form ({A, B: 1, C, relation}) on the device by
 * EmbeddedInequalityRewrite (graphableConstraintFromRelation, which evaluates
 * the relation text with mathjs). The work carries that form beside the
 * relation text, and the grader re-checks the mathematics that decides the
 * verdict: finite numbers, y alone on the left (B = 1), an inequality
 * relation, and the same half-plane as the key. The grader deliberately reads
 * the numeric form rather than re-evaluating the student's text: the relation
 * parser is importable server-side now (toolMath/algebra-relations), but
 * evaluating untrusted expression text with mathjs on the server is exactly
 * the surface this grader avoids. The form is the student's answer, not a
 * verdict: a client that forged it could equally have typed the relation.
 */
import { SHARED } from '../../toolGraderDefinition.mjs';

/**
 * Per-question support for this group, for a declaration `supports` hook.
 * A spatial model with no answer fields is an exploration: it has no Check and
 * produces no academic result, so the server has nothing to grade there.
 */
export const graphicalModeSupport = (question = {}, mode = null) => {
  if (mode === 'spatial' && !(Array.isArray(question?.answerFields) && question.answerFields.length > 0)) {
    return { supported: false, reason: 'non-graded:spatial-exploration' };
  }
  return { supported: true, reason: null };
};

export default {
  linear: SHARED,
  inequalities: SHARED,
  linearQuadratic: SHARED,
  matrix: SHARED,
  matrix3: SHARED,
  spatial: SHARED,
};
