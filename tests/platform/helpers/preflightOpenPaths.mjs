/*
 * THE TWO WAYS A TEACHER OPENS PRE-FLIGHT IN CREATE MODE, FOR SP-5's TESTS.
 *
 *   intake        pasted, uploaded or dropped JSON (TeacherWorkspace
 *                 handleAssignmentJsonReady): parse the blueprint, then open
 *                 Review with { incompleteDraftId, authoredNow: true };
 *   Library reuse a stored Library assignment given to a class
 *                 (TeacherWorkspace openStoredAssignmentForPreflight):
 *                 prepareStoredAssignmentForReuse, then open Review with
 *                 { sourceContentLineage } and no authoredNow.
 *
 * Each opens Review through the real assignmentPreflightControls.js (loaded by
 * vite: it uses extensionless imports node cannot resolve), and
 * `rulesReviewShows` builds the model as LessonPreflightModal does from what
 * TeacherWorkspace mounts it with (reviewMode, authoredNow). The call sites'
 * arguments are held as source by tests/platform/newAssignmentRulesPreflight.test.mjs.
 */
import { parseAssignmentBlueprintText } from '../../../src/assignmentBlueprint.js';
import { compileAuthoringIntentV5 } from '../../../src/platform/contract/authoringIntentV5.js';
import { prepareStoredAssignmentForReuse } from '../../../src/platform/assignments/libraryAssignmentReuse.js';
import { buildPreflightReviewedAssignmentV5 } from '../../../src/components/teacher/preflightV5Review.js';
import { buildAssignmentV5PreflightModel } from '../../../src/platform/preflight/assignmentV5PreflightModel.js';
import { normalizeLessonPublishingIntentV5 } from '../../../src/platform/authoring/lessonPublishingIntent.js';
import { newAssignmentRulesApply } from '../../../src/platform/preflight/newAssignmentRulesPreflight.js';

/** Review's opener, as App builds it, and the state it would mount Review with. */
export const reviewOpener = async (vite) => {
  const { createAssignmentPreflightControls } = await vite.ssrLoadModule('/src/app/teacher/controls/assignmentPreflightControls.js');
  let opened = null;
  const [, openAssignmentPreflight] = createAssignmentPreflightControls(() => ({ normalizeLessonPublishingIntentV5 }), (state) => { opened = state; });
  return (...args) => {
    opened = null;
    const result = openAssignmentPreflight(...args);
    if (result !== true) throw new Error(result?.error || 'Review did not open');
    return opened;
  };
};

/** The intake: a lesson file's text, as handleAssignmentJsonReady opens it. */
export const openedByIntake = (open, text, sourceName = 'lesson.json') => {
  const parsed = parseAssignmentBlueprintText(text);
  return open({ ...parsed, authoringWarnings: [] }, sourceName, {}, { incompleteDraftId: null, authoredNow: true });
};

/** A lesson as the Library stores it: its compiled package, given to no class. */
export const storedLibraryRecord = (raw, id = 'library-source') => {
  const canonical = compileAuthoringIntentV5(raw).package;
  return {
    id,
    ...canonical,
    title: canonical.assignment.title,
    courseId: canonical.assignment.courseId,
    folder: canonical.assignment.folder || '',
    assignedClassIds: [],
    assignedClassPeriods: [],
  };
};

/** Library reuse: a stored assignment given to a class, as openStoredAssignmentForPreflight opens it. */
export const openedByLibraryReuse = (open, assignment, draftOverrides = { assignedClassIds: ['class-1'] }) => {
  const prepared = prepareStoredAssignmentForReuse(assignment, { resetAssignmentKey: true });
  return open(
    { assignmentV5: prepared.assignmentV5, questions: prepared.questions, authoringWarnings: prepared.warnings },
    `Library · ${assignment.title}`,
    draftOverrides,
    { sourceContentLineage: assignment.contentLineage || null },
  );
};

/** SP-5's findings as Review shows them for that opened state (LessonPreflightModal's model). */
export const rulesReviewShows = (state) => {
  const isNewAssignment = newAssignmentRulesApply({ reviewMode: state.mode || 'create', authoredNow: state.authoredNow === true });
  return buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(state.assignmentV5, state.initialDraft), { isNewAssignment }).newAssignmentRules;
};
