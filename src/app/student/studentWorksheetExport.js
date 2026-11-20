/*
 * A STUDENT'S PRINTABLE WORKSHEET FOR AN ASSIGNMENT.
 *
 * Moved verbatim from App.jsx. These are plain functions: no state, no effects, no hooks. App builds them on every render, as it did when they were written inline, and passes what they read by position (tests/platform/appSplitAssignmentRuntime.test.mjs holds the two sides to the same names in the same order). App owns the state and the refs they read and fill.
 */
import { normalizeQuestionRecord } from '../../attemptPolicy';
import {
  assignmentIsForStudent, getAssignmentLifecycle, getDOLState, getWarmupState, getSectionVariantMode,
  prerequisiteAccess, questionIsIncluded,
} from '../../assignmentLifecycle';
import { getStoredAssignmentQuestions } from '../../platform/contract/storedAssignmentV5.js';
import { projectCurrentAssignmentContent } from '../../platform/assignments/currentContentProjection.js';
import { normalizeContextualQuestion } from '../../platform/context/wordProblemLayer';
import { activityTitleForRole } from './assignmentRuntimeHelpers.js';
import { formatStudentName } from '../../platform/studentName';
import { resolveDeliveredQuestionMetadata } from '../../platform/assignments/assignmentAdaptation.js';
import { buildAssignmentWorksheetModel, downloadAssignmentWorksheetPdf } from '../../platform/resources/pdfLoaders.js';

export function createStudentWorksheetExport(
  toastError, toastInfo, toastSuccess, toastWarning, user, studentRequiredFor, assignments, tracker,
  serverDeliveryPins, classSchedule, classworkGradesByAssignment, getSectionAccessState, studentLearningProfile,
  adaptiveStudentProfile, loadFamilyDelivery,
) {
  const exportAssignmentWorksheetPdf = async (assignmentId) => {
    const assignmentData = assignments.find((assignment) => assignment.id === assignmentId);
    const assignmentQuestions = getStoredAssignmentQuestions(assignmentData);
    if (user?.role !== 'student' || !assignmentQuestions.length) return;
    if (!assignmentIsForStudent(assignmentData, { classId: user.classId || null, classPeriod: user.classPeriod })) {
      toastWarning('PDF not available', 'This assignment is not assigned to your class.');
      return;
    }

    const now = Date.now();
    const lifecycle = getAssignmentLifecycle(assignmentData, now, { studentId: user.id });
    const access = prerequisiteAccess({ assignment: assignmentData, classworkGradesByAssignment, nowValue: now });
    const assignmentLocked = (lifecycle.isScheduled && access.reason !== 'prerequisiteMet') || !access.open;
    if (assignmentLocked) {
      toastInfo('PDF not available yet', 'The printable worksheet unlocks with the assignment.');
      return;
    }

    let generateQuestion;
    let buildStudentFamilyContext;
    try {
      // The generator loads with the worksheet (see the import note at the top),
      // and the family engine with it (loadFamilyDelivery).
      ({ generateQuestion } = await import('../../problemGenerator'));
      ({ buildStudentFamilyContext } = await loadFamilyDelivery());
    } catch (error) {
      console.error(error);
      toastError('Could not export PDF', error?.message || 'MathMaster could not build the printable assignment.');
      return;
    }

    const classId = user.classId || null;
    const classPeriod = user.classPeriod;
    const dolState = getDOLState({ assignment: assignmentData, schedule: classSchedule, classId, classPeriod, nowValue: now });
    const warmupState = getWarmupState({ assignment: assignmentData, schedule: classSchedule, classId, classPeriod, nowValue: now });
    const warmupCanBeViewed = ['active', 'closed', 'ended'].includes(warmupState.status);
    const honors = String(user?.profile?.courseLevel || '').toLowerCase() === 'honors';
    const printableEntries = [];
    // The printed copy is the student's own required items (a reduced-item-count
    // accommodation omits some), exactly what the screen shows.
    const printOmitted = lifecycle.isPracticeOnly ? new Set() : new Set(studentRequiredFor(assignmentData).omitted);

    for (const entry of projectCurrentAssignmentContent(assignmentData).entries) {
      const index = entry.storageIndex;
      const question = assignmentQuestions[index];
      if (!question || !questionIsIncluded(question) || printOmitted.has(index)) continue;
      const sectionRole = entry.logicalRole;
      const timedDol = sectionRole === 'dol'
        && dolState.enabled
        && (dolState.questionIndices || [dolState.questionIndex]).includes(index);
      let available = true;
      if (!lifecycle.isPracticeOnly) {
        if (sectionRole === 'warmup' && warmupState.enabled && !warmupCanBeViewed) available = false;
        if (timedDol && !lifecycle.isClosed && !['active', 'ended'].includes(dolState.status)) available = false;
        const manualState = getSectionAccessState({ assignment: assignmentData, activityRole: sectionRole, classId, classPeriod, nowValue: now, studentId: user.id });
        if (manualState.enabled && !manualState.isOpen) available = false;
      }
      if (!available) continue;

      const sectionVariantMode = getSectionVariantMode(assignmentData, sectionRole);
      const generationStudentKey = sectionVariantMode === 'shared'
        ? `shared-version:${assignmentData.id}:${sectionRole}`
        : user.id || 'anonymous';
      const record = normalizeQuestionRecord(tracker?.[assignmentData.id]?.[index]);
      const runtimeActivityRole = lifecycle.isPracticeOnly ? 'practice' : sectionRole;
      const adaptation = resolveDeliveredQuestionMetadata({
        question,
        learningProfile: studentLearningProfile,
        activityRole: runtimeActivityRole,
        variationMode: sectionVariantMode,
        honors,
      });
      const generationKey = `${assignmentData.id}|${generationStudentKey}|${index}|variant:${record.variantIndex}`;
      const resolvedQuestion = normalizeContextualQuestion(generateQuestion(
        question,
        generationKey,
        adaptiveStudentProfile || user?.profile,
        adaptation,
        // The printed copy of a family-backed question is the student's own
        // pinned instance — the same numbers as on screen (with another
        // Chromebook's pin, where the assignment's server copy has been read).
        buildStudentFamilyContext({
          assignment: assignmentData,
          question,
          storageIndex: index,
          studentId: user.id,
          classId: user.classId || null,
          sectionMode: sectionVariantMode,
          record: tracker?.[assignmentData.id]?.[index],
          serverPins: serverDeliveryPins.assignmentId === assignmentData.id && serverDeliveryPins.known ? serverDeliveryPins.pins : null,
        }),
      ));
      printableEntries.push({
        sourceIndex: index,
        available: true,
        sectionRole,
        sectionLabel: activityTitleForRole(sectionRole),
        question: resolvedQuestion,
      });
    }

    try {
      // The worksheet builder loads with the PDF (pdfLoaders.js), so a load
      // failure lands in this catch like a failed render.
      const model = await buildAssignmentWorksheetModel({
        assignment: assignmentData,
        // A blank name line on the printout rather than a placeholder for a
        // student with no name on file.
        student: { displayName: formatStudentName(user, { lastFirst: false, fallbackToNeutral: false }), classPeriod: user.classPeriod },
        entries: printableEntries,
      });
      if (!model.sections.some((section) => section.questions.length)) {
        toastInfo('Nothing to export yet', 'No currently unlocked questions are available for the printable worksheet.');
        return;
      }
      const result = await downloadAssignmentWorksheetPdf({ model });
      toastSuccess('PDF ready', `${result.pageCount} printable page${result.pageCount === 1 ? '' : 's'} exported. Locked sections and answer data were not included.`);
    } catch (error) {
      console.error('Could not export assignment PDF:', error);
      toastError('Could not export PDF', error?.message || 'MathMaster could not build the printable assignment.');
    }
  };
  return [exportAssignmentWorksheetPdf];
}
