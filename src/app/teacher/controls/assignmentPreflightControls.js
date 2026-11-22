/*
 * THE CHECK AN ASSIGNMENT GOES THROUGH BEFORE A TEACHER PUBLISHES IT.
 *
 * Moved verbatim from App.jsx, which calls this where the code was and passes what it reads by name. It holds no state and runs no effects: App keeps the busy flags and hands their setters in. It reaches App through the teacher kit (teacherKit.js), so it loads for a teacher and never with a student's Home.
 */
import { resolveQuestionActivityRole } from '../../../platform/policies/activityPolicies';
import { getStoredSectionVariantModes } from '../../../platform/contract/storedAssignmentV5.js';
import { defaultAssignmentDateInputs } from '../../../platform/assignments/assignmentDateDefaults.js';

export function createAssignmentPreflightControls(requireTeacherKit, setAssignmentPreflight) {
  const V5_COMPILER_PLUMBING_ERROR = /missing a type\/toolId|refers to a table in its prompt, but the question contains none|refers to a graph in its prompt, but the question contains none|needs `functionSpec\.type`|needs `analysisRequests`|needs a `graph` object with functions, points or segments|cannot yet build that interactive graph from an upstream response/i;

  // The teacher sets classes, dates, folder and publishing here — the JSON never
  // carries them, so there are no manual fallbacks to merge any more.
  const openAssignmentPreflight = (inspected, sourceName, draftOverrides = {}, reviewOptions = {}) => {
    try {
      const assignmentV5 = inspected.assignmentV5;
      if (!assignmentV5 || Number(assignmentV5.schemaVersion) !== 5) {
        throw new Error('Assignment Review requires a current MathMaster assignment.');
      }
      const sections = Array.isArray(assignmentV5.sections) ? assignmentV5.sections : [];
      const dolQuestionFromRole = inspected.questions.findIndex((question) => (
        resolveQuestionActivityRole({ question, assignment: assignmentV5 }) === 'dol'
      ));
      const publishingIntent = requireTeacherKit().normalizeLessonPublishingIntentV5({
        classroom: assignmentV5.classroomIntegration,
        lessonResources: { notesPdf: assignmentV5.outputProfiles?.lessonNotesPdf },
      }, assignmentV5.assignment, []);
      const defaultDates = defaultAssignmentDateInputs();
      const initialDraft = {
        title: assignmentV5.assignment?.title || '',
        folder: assignmentV5.assignment?.folder || '',
        dueAt: defaultDates.dueAt,
        lateDueAt: defaultDates.lateDueAt,
        releaseAt: '',
        sectionVariantModes: getStoredSectionVariantModes(assignmentV5),
        sectionAccessDefaults: { classwork: 'open', practice: 'open' },
        // Practice keeps Guided Notes off by default: the owner's decision (FB20, 2026-10-23).
        guidedNotesBySection: { classwork: 'automatic', practice: 'off' },
        assignedClassPeriods: [],
        assignedClassIds: [],
        warmupEnabled: sections.some((section) => section.role === 'warmup'),
        warmupMinutesBeforeStart: 7,
        warmupInstructionDate: '',
        warmupInstructionDatesByClassPeriod: {},
        dolEnabled: sections.some((section) => section.role === 'dol'),
        dolMinutesBeforeEnd: 10,
        dolCloseMinutesBeforeEnd: 5,
        dolInstructionDate: '',
        dolInstructionDatesByClassPeriod: {},
        dolQuestionIndex: dolQuestionFromRole >= 0 ? dolQuestionFromRole : null,
        publicationStrategy: 'hybrid',
        includeWarmupInClassroom: false,
        homeworkDueAt: '',
        instructionalPurpose: assignmentV5.assignment?.instructionalPurpose || 'lesson',
        gradingPurpose: assignmentV5.assignment?.gradingPurpose || null,
        variantPolicy: assignmentV5.variantPolicy,
        differentiationPolicy: assignmentV5.differentiationPolicy,
        supportPolicy: assignmentV5.supportPolicy,
        toolPolicy: assignmentV5.toolPolicy,
        deliveryPolicy: assignmentV5.deliveryPolicy,
        gradingPolicy: assignmentV5.gradingPolicy,
        evidencePolicy: assignmentV5.evidencePolicy,
        outputProfiles: assignmentV5.outputProfiles,
        classroomIntegration: assignmentV5.classroomIntegration,
        provenance: assignmentV5.provenance,
        preflight: assignmentV5.preflight,
        ...draftOverrides,
      };
      setAssignmentPreflight({
        assignmentV5,
        initialDraft,
        questions: inspected.questions,
        authoringWarnings: inspected.authoringWarnings || [],
        sourceLabel: `${sourceName || 'Imported assignment'}`,
        mode: reviewOptions.mode === 'update' ? 'update' : 'create',
        existingAssignmentId: reviewOptions.existingAssignmentId || null,
        allowQuestionRepair: reviewOptions.allowQuestionRepair !== false,
        sourceContentLineage: reviewOptions.sourceContentLineage || null,
        // The intake says the assignment is being imported or authored now; a
        // stored Library assignment opened for reuse does not. Only then does
        // Review give SP-5's two authoring warnings (newAssignmentRulesApply).
        authoredNow: reviewOptions.authoredNow === true,
        // When this review started from an Incomplete draft, remember which one.
        // Publishing has to close that draft, or the same assignment sits in the
        // Library and in Incomplete Assignments at once, and the stale copy is
        // the one still holding the pre-repair question JSON.
        incompleteDraftId: reviewOptions.incompleteDraftId || null,
      });
      return true;
    } catch (error) {
      return { error: error.message };
    }
  };
  return [V5_COMPILER_PLUMBING_ERROR, openAssignmentPreflight];
}
