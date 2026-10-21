/*
 * THE TEACHER WORKSPACE (student push G2): the teacher's whole screen, moved
 * out of App.jsx verbatim (App's `if (user.role === 'teacher') { … }`
 * branch), so its code and the modules only it reaches load when a teacher
 * signs in and never on a student's Home.
 *
 * Every input is explicit: each prop is the App state, setter, handler or
 * helper of the same name that the branch read when it lived in App. App
 * passes them all (src/App.jsx, `<TeacherWorkspace`); no-undef (src/**) and
 * appShellSplit.test.mjs hold the seam. The JSX, the handlers inlined in it
 * and the order of every branch are unchanged.
 */
import { Suspense } from 'react';
// Shared with App so the sheets form their own chunk that links before App.css.
import '../shell/leadingStyles.js';
import { addDoc, collection, deleteField, doc, runTransaction, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase';
import { classDolFieldPatch } from '../../platform/assessment/dolAttemptGrantClient.js';
import { updateAssignmentClassroomPublications } from '../../classroomApi';
import { stripAssignmentInstanceState } from '../../../functions/shared/assignmentPrivacy.mjs';
import { emptyQuestionRecord, normalizeQuestionRecord, getQuestionCredit } from '../../attemptPolicy';
import { parseAssignmentBlueprintText, validateAssignmentQuestions, assertFirestoreSafeAssignmentPayload } from '../../assignmentBlueprint';
import { markIncompleteAssignmentDraftPublished } from '../../platform/preflight/incompleteAssignmentDraftStore.js';
import { hydrateAssignmentCcmr } from '../../services/assignmentCcmrService.js';
import { auditAlignmentSpecificity, validateAlignments } from '../../platform/contract/alignments';
import { validateQuestionsSemantics } from '../../platform/contract/semanticValidation';
import { CLASS_PERIODS, assignmentIsForStudent, getAssignmentLifecycle, localDateKey, resolveDOLQuestionIndex, getCurrentContentQuestionIndices, questionIsIncluded, studentRequiredQuestions } from '../../assignmentLifecycle';
import { resolveQuestionActivityRole } from '../../platform/policies/activityPolicies';
import { matchesSmartView, SMART_VIEWS } from '../../assignmentSmartViews';
import { assignmentFolderMatches, normalizeFolderPath, titleOrFolderMatches } from '../../assignmentFolders';
import { buildDestinationGroups, destinationAssignmentKey, isLibraryAssignment, resolveAssignmentDates, resolveCreationMode } from '../../assignmentDestinations';
import { flattenV5Sections, rebuildV5SectionsFromQuestions } from '../../platform/contract/assignmentSchemaV5.js';
import { canonicalV5PersistencePatch, getStoredAssignmentQuestions, getStoredAssignmentTypeProjection, getStoredAssignmentVariantMode, getStoredSectionVariantModes, storedAssignmentToV5, testCycleContractFields } from '../../platform/contract/storedAssignmentV5.js';
import { buildAssignmentV5PreflightModel } from '../../platform/preflight/assignmentV5PreflightModel.js';
import { canSalvageV5IntakeResult } from '../../platform/preflight/assignmentAuthoringState.js';
import { contentVersionOf, contentVersionLabel, latestCurrentLibraryRelease } from '../../platform/assignments/assignmentContentVersion.js';
import { questionFingerprint, repairAssignmentTrackerForGranularWorkflowCredit, repairAssignmentTrackerForLiveCorrections } from '../../platform/assignment/liveQuestionCorrection.js';
import { GRAPH_VIEWPORT_REPAIR_KIND } from '../../../functions/shared/liveResponseRepairPolicy.mjs';
import { normalizeQuestionWeight } from '../../platform/grading/questionWeights.js';
import { normalizeLessonPublishingIntentV5 } from '../../platform/authoring/lessonPublishingIntent.js';
import { normalizeLabDefinition } from '../../platform/labs/labDefinitionSchema.js';
import { splitGrade, splitGradesBySection, COMPARABILITY, describeDeliveredRigor, explainGrade, rigorComparability } from '../../platform/teacher/gradeEvidence.js';
import { assignmentGradeOverrideFor, canonicalPresentedAssignmentGrade, projectedAssignmentTrackerFor } from '../../platform/grading/canonicalGradeProjection.js';
import { assignmentFeedbackWasReleased, assignmentUsesTeacherReleasePolicy, createQuestionId, normalizeAssignmentQuestions, toDateTimeLocalInputValue, formatDueDate, formatLateDueDate, formatTimeStamp } from '../student/assignmentRuntimeHelpers.js';
import { CLASS_SCOPED_TABS } from '../screenScopes.js';
import { AssignmentAiHealth, AssignmentContentUpgradeModal, AssignmentGradeOverrideControls, AssignmentHub, AssignmentIntake, AssignmentLibrary, AssignmentQuestionEditor, AttendanceHistoryPanel, ClassContextBar, ClassCourseSettings, ClassesAdmin, ClassesWorkspace, ClassRewardCatalogEditor, ClassRewardRequestsPanel, ClassroomManagerV2, ClassroomSyncReview, ClassScheduleSettings, DemoExperience, GradebookAssignmentBar, GradebookClassChooser, GradeTransferCenter, LessonPreflightModal, LiveChallengeTeacher, MarkingPeriodSettings, MathToolsLab, PacingControls, ParentContactCenter, PathCoverageAudit, PathSimulator, PreproductionReset, SectionRecoveryAuditTrail, SignInAccess, StudentCaseReviewView, StudentDolRecoveryRow, StudentProfileDrawer, StudentResponseInspector, StudentsRoster, SupportEvidenceReportView, TeacherActionCenter, TeacherAnalyticsDashboard, TeacherAssignmentPdfDialog, TeacherHome, TeacherQuickSearch, TeacherSecureExamDashboard, TeacherSidebar, TestCyclePreview, TexasStandardsDashboard, WeeklyPathControls, WeeklyPathGradePanel } from '../lazyScreens.js';
import { compareStudentsByName, formatStudentName } from '../../platform/studentName';
import { isTestCycleAssignment } from '../../platform/assessment/testCycle.js';
import { attachTestCycleContract, preflightTestCycleCandidate, updateTestCyclePolicy } from '../../services/testCycleService.js';
import { TEST_CYCLE_CONTRACT_EDIT, planTestCycleContractEdit } from '../../platform/assessment/testCycleContractEdit.js';
import { currentGradingPeriodStamp } from '../../platform/student/gradingPeriods.js';
import { buildSafeLibraryContentRepair, inspectLibraryContentRepair, prepareStoredAssignmentForReuse } from '../../platform/assignments/libraryAssignmentReuse.js';
import { confirmHonorsCandidateForCreate, proveImportedCcmrClaims } from '../../platform/assignments/canonicalCcmrHydration.js';
import { shouldAutoPublishClassroomPackage } from '../../platform/classroom/automaticClassroomPublishing.js';
import { resolveStudentCourseContext, studentsInClass } from '../../../functions/shared/classModel.mjs';
import { SUPPORT_EVENT_KIND, SUPPORT_EVENT_STAGE } from '../../platform/teacher/studentSupportSignals.js';
import { buildReturnCheckInEvent } from '../../platform/attendance/returnCheckIn.js';
import { fetchAllParentContactsForExport, recordParentContact, recordParentContactResolution } from '../../platform/teacher/parentContactStore.js';
import { certifyHonorsExtensionQuestion } from '../../platform/rigor/honorsExtensionRecipes.js';
import { withAppendedQuestionSections } from '../../platform/rigor/honorsExtensionSwap.js';
import { isRootAdminEmail } from '../../../functions/shared/rolePolicy.mjs';
import { describeWorkloadSummary } from '../../../functions/shared/reducedWorkload.mjs';
import AssignmentCardMenu from '../../AssignmentCardMenu';
import { classGradeProgress } from '../../platform/teacher/assignmentProgress.js';
import { groupAssignmentList } from '../../platform/teacher/assignmentListGroups.js';
import StudentNameLink from '../../components/common/StudentNameLink.jsx';
import { EmptyState, SearchField } from '../../ui/primitives';
import { completedRecoverySections, heldRecoverySections, warmupChallengeCounts } from '../../platform/recovery/teacherRecoveryAudit.js';
import { creationRecoveryContent } from '../../platform/recovery/recoveryContentAuthoring.js';
import { recoveryPreparationAvailable } from '../../../functions/shared/recoveryContentPlan.mjs';
import StudentPerformanceBadge from '../../components/common/StudentPerformanceBadge.jsx';

export default function TeacherWorkspace({
  SCHOOL_NON_INSTRUCTIONAL_KEYS,
  V5_COMPILER_PLUMBING_ERROR,
  actionGradeScope,
  activeClass,
  adminTab,
  allStudents,
  assignmentFolderPaths,
  assignmentGroupOpen,
  assignmentHubTarget,
  assignmentPreflight,
  assignmentPreflightBusy,
  assignmentSearch,
  assignments,
  attendanceReviewBusyKey,
  auth,
  autoPublishAssignmentPackageToClassroom,
  beginEditAssignmentDates,
  beginTeacherWorksheetExport,
  bulkBusy,
  calculateGrade,
  caseReviewStudentId,
  ccmrAuditWarnings,
  classEvidenceByStudentId,
  classEvidenceLoading,
  classSchedule,
  classes,
  classesById,
  classroomManagerAssignmentId,
  classroomSyncProposal,
  clearAssignmentSelection,
  confirmAction,
  contentUpgradeRequest,
  courseLevelByStudentId,
  courseProfiles,
  courseProfilesSaving,
  dolAttemptGrantBusyKey,
  dolControlBusyKey,
  dolUnlockBusyKey,
  editingAssignmentDates,
  editingAssignmentId,
  endLiveTeaching,
  exportTeacherAssignmentWorksheetPdf,
  feedbackReleaseBusyId,
  fetchAssignments,
  fetchTeacherRosterSummaries,
  focusedTestCycleAssignmentId,
  formatTime,
  gradeExportScope,
  gradebookFilter,
  gradebookHasPracticePass,
  gradebookProgressFilter,
  gradingPeriodBusy,
  gradingPeriodSettings,
  handleApplyShorterAttendanceExtension,
  handleBulkArchive,
  handleBulkMoveToFolder,
  handleChangeClassPeriod,
  handleCreateFolder,
  handleCreateGradingPeriod,
  handleDeleteFolder,
  handleDolControlForClass,
  handleGoToClassFromHome,
  handleGrantDOLAttemptForClass,
  handleGrantDOLAttemptForStudents,
  handleKeepAttendanceExtension,
  handleLinkWarmupChallenge,
  handleLoadDeliveredRigor,
  handleLogout,
  handleMoveAssignmentToFolder,
  handleMoveSelectedAssignmentsToGradingPeriod,
  handlePersonalPathRecommendation,
  handleRecordStudentSupportEvent,
  handleReleaseAssignmentFeedback,
  handleRenameFolder,
  handleRepairClassroomAssignmentPost,
  handleSaveClassSchedule,
  handleSaveCourseProfiles,
  handleSaveOverrides,
  handleSavePacing,
  handleSaveWeeklyGoal,
  handleSetCurrentGradingPeriod,
  handleSetGradingPeriodArchived,
  handleSupportProfileSaved,
  handleToggleArchiveAssignment,
  handleTogglePauseAssignment,
  handleToggleSectionAccessForClass,
  handleToggleWarmupForClass,
  handleUnlockDOLForClass,
  handleUpdateCourseProfile,
  handleViewClassGradebook,
  homeNavigationPeriod,
  libraryNavigation,
  liveFocus,
  liveTeachingSession,
  loadClassGradeRecords,
  movingFolderAssignmentId,
  movingFolderValue,
  needsAttentionQueue,
  now,
  openAssignmentHub,
  openAssignmentPreflight,
  openDeleteDialog,
  openGradeExport,
  openGradebookFor,
  openIEPReport,
  openLiveFor,
  openTeacherScratchpad,
  pacingBusy,
  pacingByClass,
  parentContactSourceAction,
  parentContacts,
  pathInterventionBusyStudentId,
  preflightRosterSizesByClassId,
  presenceById,
  profileDrawerLearningProfile,
  profileDrawerPlan,
  profileDrawerSessionSummaries,
  profileDrawerStudent,
  profileDrawerSupportEvents,
  questionEditorAssignment,
  quickSearchOpen,
  refreshTeacherRosterAfterNameChange,
  renderDeleteAssignmentDialog,
  renderExportJsonDialog,
  renderTeacherScratchpadDialog,
  reportAttendanceClass,
  reportExportClasses,
  reportHubClass,
  reportLiveClass,
  responseInspectorTarget,
  resumeLiveTeaching,
  retestRecoveryActions,
  saveAssignmentFolderPaths,
  searchableStandards,
  sectionAccessBusyKey,
  selectedAssignmentIds,
  setActiveClass,
  setAdminTab,
  setAllStudents,
  setAssignmentActivity,
  setAssignmentGroupOpen,
  setAssignmentHubTarget,
  setAssignmentPreflight,
  setAssignmentPreflightBusy,
  setAssignmentSearch,
  setAssignments,
  setCaseReviewStudentId,
  setClassEvidenceByStudentId,
  setClassSchedule,
  setClassroomManagerAssignmentId,
  setClassroomSyncProposal,
  setClassworkGradesByAssignment,
  setContentUpgradeRequest,
  setDolGradesByAssignment,
  setEditingAssignmentDates,
  setEditingAssignmentId,
  setExportJsonAssignment,
  setExportJsonCopied,
  setFocusedTestCycleAssignmentId,
  setGradeExportScope,
  setGradebookFilter,
  setGradebookProgressFilter,
  setHomeNavigationPeriod,
  setLibraryNavigation,
  setLiveFocus,
  setMovingFolderAssignmentId,
  setMovingFolderValue,
  setParentContactSourceAction,
  setPathLaunchTeks,
  setPresenceById,
  setProfileDrawerStudentId,
  setQuestionEditorAssignment,
  setQuickSearchOpen,
  setResponseInspectorTarget,
  setSelectedAssignmentIds,
  setSidebarCollapsed,
  setStudentSessionSummaries,
  setStudentSupportEvents,
  setSupportReportStudentId,
  setSupportUsageByAssignment,
  setTeacherTab,
  setTeacherWorksheetDialog,
  setTeacherWorkspaceMode,
  setTestCyclePreviewAssignment,
  setWeeklyPathCompletionsByStudent,
  setWeeklyPathGoalSnapshotsByStudent,
  sidebarCollapsed,
  skillOverrides,
  startTeacherPreview,
  studentSessionSummaries,
  studentSupportEvents,
  studentsInActiveClass,
  supportReportStudentId,
  teachAssignmentLive,
  teacherActionItems,
  teacherActionOpenCount,
  teacherAnalyticsStudents,
  teacherLearningProfiles,
  teacherMasteryProfilesByStudentId,
  teacherStudentDataMode,
  teacherStudentIdentityIndex,
  teacherTab,
  teacherWeeklyGoalsByStudent,
  teacherWeeklyRoster,
  teacherWorksheetBusy,
  teacherWorksheetDialog,
  teacherWorksheetStudentsFor,
  teacherWorkspaceMode,
  testCyclePreviewAssignment,
  toastError,
  toastInfo,
  toastSuccess,
  toastWarning,
  toggleAssignmentSelected,
  user,
  warmupControlBusyKey,
  weeklyGoalBusy,
  weeklyGoalsByClass,
  weeklyPathCompletionsByStudent,
  weeklyPathProgressLoadedFor,
  weeklyPathProgressLoading,
  weeklyPathTruncated,
  weeklyPathWeekComplete,
  weeklyPathWeekKey,
}) {
  // The teacher-only handlers that only this screen calls, moved from App
  // with it, verbatim and in their original order (G2): Pre-Flight, the
  // assignment intake and setup editor, the question editor, duplicate,
  // Library repair and Dates & Classes. They read and write App's state
  // through the props of the same name.
  // Reads the one supported Assignment V5 object and reports what is wrong in
  // terms an AI can act on, rather than throwing a single opaque message.
  const readAssignmentJson = (rawText) => {
    const errors = [];
    const warnings = [];
    let parsed = null;
    try {
      parsed = parseAssignmentBlueprintText(rawText);
    } catch (error) {
      // A compile throw is not the same as unreadable input, and treating it as
      // one is what made salvage unreachable for the case it exists for. The
      // commonest V5 failure is a single question the compiler refuses — "V5
      // question 3 does not contain enough mathematical intent" — thrown from
      // the middle of the compile. The document itself is still a perfectly
      // legible V5 with nineteen good questions in it, but discarding it here
      // left the salvage check with no assignment to look at and no schema
      // version to recognise, so the teacher was told to take the whole
      // assignment back to the AI over one question.
      //
      // The raw text is re-read as plain JSON instead. This is deliberately not
      // a second compiler: it recovers the authored document so it can be saved
      // and repaired, and every question in it still has to pass Preflight
      // before anything can be published.
      let recoveredV5 = null;
      try {
        const document = JSON.parse(rawText);
        if (document && typeof document === 'object' && Number(document.schemaVersion) === 5) {
          recoveredV5 = document;
        }
      } catch {
        recoveredV5 = null;
      }

      if (!recoveredV5) {
        return { ok: false, errors: [error.message], warnings, sourceSchemaVersion: null, compilerDefect: false };
      }

      return {
        ok: false,
        errors: [error.message],
        warnings,
        parsed: { assignmentV5: recoveredV5, questions: [] },
        sourceSchemaVersion: 5,
        compilerDefect: V5_COMPILER_PLUMBING_ERROR.test(String(error.message)),
      };
    }

    try {
      validateAssignmentQuestions(parsed.questions, { variantMode: parsed.assignmentV5?.variantPolicy?.mode });
    } catch (error) {
      errors.push(error.message);
    }

    parsed.questions.forEach((question, index) => {
      const result = validateAlignments(question, { label: `Question ${index + 1}` });
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    });

    // One TEKS copied onto every question is the commonest authoring mistake an
    // AI makes, and it silently corrupts mastery evidence rather than failing.
    warnings.push(...auditAlignmentSpecificity(parsed.questions).warnings);

    // A recognized type is not enough: the renderer has to be able to show it.
    const semantic = validateQuestionsSemantics(parsed.questions);
    errors.push(...semantic.errors);
    warnings.push(...semantic.warnings);

    if (errors.length) {
      const sourceSchemaVersion = parsed.sourceSchemaVersion || null;
      const compilerDefect = Number(sourceSchemaVersion) === 5
        && errors.every((message) => V5_COMPILER_PLUMBING_ERROR.test(String(message)));
      return { ok: false, errors, warnings, parsed, sourceSchemaVersion, compilerDefect };
    }

    return {
      ok: true,
      errors,
      warnings,
      parsed,
      sourceSchemaVersion: parsed.sourceSchemaVersion || null,
      compilerDefect: false,
    };
  };

  // Single entry point for pasted, uploaded and dropped JSON.
  const handleAssignmentJsonReady = async ({ text, sourceName, incompleteDraftId = null }) => {
    let sourceText = text;
    let ccmrAudit = null;

    // Every authoring route gets the same CCMR treatment. Built-in AI is
    // already bank-backed, while ChatGPT/Claude/Gemini JSON is hydrated here
    // before local V5 compilation and Preflight. If the network is temporarily
    // unavailable, import still works; Preflight will visibly flag any direct
    // exam-style item that lacks audited-bank provenance.
    try {
      const raw = JSON.parse(String(text || ''));
      const isCanonicalSelfExport = raw?.portableContract?.kind === 'mathmasterCanonicalAssignmentV5'
        && Number(raw?.portableContract?.version) === 1;
      if (
        raw
        && !Array.isArray(raw)
        && Number(raw.schemaVersion) === 5
        && Array.isArray(raw.sections)
        && !isCanonicalSelfExport
      ) {
        const hydrated = await hydrateAssignmentCcmr(raw, { ensurePracticeTarget: false, includeCandidates: true });
        // A question written as exam practice becomes the audited item it
        // imitates only when MathMaster's checks pass with that item in its
        // place; one no offered item passes for stays as written
        // (canonicalCcmrHydration.js). Compiled as written only when there is
        // such a question to prove.
        let authoredAssignmentV5 = null;
        if ((hydrated.audit?.plan?.slots || []).some((slot) => slot?.kind === 'directClaim')) {
          try {
            authoredAssignmentV5 = parseAssignmentBlueprintText(String(text || '')).assignmentV5;
          } catch {
            // Not compilable as written: the server's own answer, as before.
          }
        }
        const proven = proveImportedCcmrClaims({ rawAssignment: raw, authoredAssignmentV5, hydration: hydrated });
        sourceText = JSON.stringify(proven.assignment);
        ccmrAudit = proven.audit;
      }
    } catch (error) {
      console.warn('CCMR assignment hydration was skipped', error);
    }

    const result = readAssignmentJson(sourceText);
    const bankWarnings = [...ccmrAuditWarnings(ccmrAudit)];
    const warnings = [...(result.warnings || []), ...bankWarnings];
    if (!result.ok) {
      if (!canSalvageV5IntakeResult(result)) return { ...result, warnings };

      // Publication validity and previewability are different boundaries.
      // A parseable V5 with question-level blockers still opens Preflight.
      const preflightModel = buildAssignmentV5PreflightModel(result.parsed.assignmentV5);
      const salvageResult = {
        ...result,
        ok: false,
        errors: [...new Set([...(result.errors || []), ...(preflightModel.errors || [])])],
        warnings: [...new Set([...warnings, ...(preflightModel.warnings || [])])],
        parsed: {
          ...result.parsed,
          assignmentV5: preflightModel.assignmentV5,
          questions: preflightModel.questions,
        },
      };
      const previewOpenResult = openAssignmentPreflight(
        { ...salvageResult.parsed, authoringWarnings: salvageResult.warnings },
        sourceName,
        {},
        { incompleteDraftId },
      );
      if (previewOpenResult !== true) {
        return {
          ...salvageResult,
          errors: [...salvageResult.errors, previewOpenResult?.error || 'Could not build Assignment Review from this assignment.'],
          previewOpened: false,
        };
      }
      return { ...salvageResult, previewOpened: true, ccmrAudit };
    }
    const opened = openAssignmentPreflight({ ...result.parsed, authoringWarnings: warnings }, sourceName, {}, { incompleteDraftId });
    if (opened !== true) {
      return { ok: false, errors: [opened?.error || 'Could not build Assignment Review from this assignment.'], warnings, sourceSchemaVersion: result.sourceSchemaVersion, compilerDefect: false };
    }
    return { ok: true, warnings, repairs: result.parsed.repairs || [], ccmrAudit };
  };

  const handleCreateAssignment = async (teacherReview, reviewedAssignmentV5, { honorsCandidate = null } = {}) => {
    const sourceIncompleteDraftId = assignmentPreflight?.incompleteDraftId || null;
    // Set once the assignment documents are written. A failure before that
    // created nothing and leaves the review open to try again; a failure after
    // it must never read as "not created", or a second press duplicates it.
    let committed = false;
    try {
      if (!teacherReview || typeof teacherReview !== 'object') {
        throw new Error('Publishing requires the completed Assignment Review settings.');
      }
      const reviewedCandidate = reviewedAssignmentV5 && Number(reviewedAssignmentV5.schemaVersion) === 5
        ? reviewedAssignmentV5
        : null;
      if (!reviewedCandidate) {
        throw new Error('Publishing requires the MathMaster assignment that was reviewed before creation.');
      }

      // Creation must never be the first place a teacher learns that the
      // reviewed assignment is invalid. Re-run the same native V5 Preflight
      // model used by Assignment Review and publish only its validated,
      // persistence-safe object. This is a final race/defense check, not a
      // separate validation system.
      const finalPreflight = buildAssignmentV5PreflightModel(reviewedCandidate);
      if (!finalPreflight.isValid) {
        throw new Error(`This assignment is no longer ready to create:\n${finalPreflight.errors.join('\n')}`);
      }
      const reviewedV5 = finalPreflight.assignmentV5;

      // Final publishing consumes the exact reviewed canonical object. The
      // original pasted/uploaded JSON is intentionally not reparsed here.
      const reviewedQuestions = flattenV5Sections(reviewedV5);
      const title = String(reviewedV5.assignment?.title || '').trim();
      const dueValue = teacherReview.dueAt || '';
      const lateDueValue = teacherReview.lateDueAt || '';
      const releaseValue = teacherReview.releaseAt || '';
      const variantMode = getStoredAssignmentVariantMode(reviewedV5);
      const assignedClassIds = [...new Set((teacherReview.assignedClassIds || []).filter(Boolean))];
      const selectedClassRecords = assignedClassIds.length
        ? classes.filter((entry) => assignedClassIds.includes(entry.classId) && entry?.status !== 'archived')
        : [];
      const assignedClassPeriods = [...new Set(selectedClassRecords.map((entry) => entry.period).filter(Boolean))];
      const creationMode = resolveCreationMode({ assignedClassIds });
      if (!title) {
        throw new Error('Assignment title is missing. Add a title in Assignment Review before publishing.');
      }

      const { dueAt, lateDueAt, dueDate, releaseAt } = resolveAssignmentDates({
        mode: creationMode,
        dueValue,
        lateDueValue,
        releaseValue,
      });

      const parsedQuestions = normalizeAssignmentQuestions(
        validateAssignmentQuestions(reviewedQuestions, { variantMode }),
      );
      const authoredRoles = parsedQuestions.map((question) => resolveQuestionActivityRole({
        question,
        assignment: reviewedV5,
      }));
      const hasWarmupSection = authoredRoles.includes('warmup');
      const hasDOLSection = authoredRoles.includes('dol');
      const assignmentType = getStoredAssignmentTypeProjection(reviewedV5);

      const warmupEnabled = hasWarmupSection && teacherReview.warmupEnabled !== false;
      const requestedWarmupLeadMinutes = Number(teacherReview.warmupMinutesBeforeStart);
      const warmupMinutesBeforeStart = Math.max(
        0,
        Number.isFinite(requestedWarmupLeadMinutes) ? requestedWarmupLeadMinutes : 7,
      );
      const warmupInstructionDate = String(
        teacherReview.warmupInstructionDate
        || (releaseAt ? localDateKey(new Date(releaseAt)) : '')
        || localDateKey(Date.now()),
      ).trim() || null;
      const warmupInstructionDatesByClassPeriod = teacherReview.warmupInstructionDatesByClassPeriod || {};

      let dolQuestionIndex = Number.isInteger(Number(teacherReview.dolQuestionIndex))
        ? Number(teacherReview.dolQuestionIndex)
        : null;
      if (Number.isInteger(dolQuestionIndex)) {
        dolQuestionIndex = Math.max(0, Math.min(parsedQuestions.length - 1, dolQuestionIndex));
      } else {
        const authoredDOLIndex = authoredRoles.findIndex((role) => role === 'dol');
        dolQuestionIndex = authoredDOLIndex >= 0 ? authoredDOLIndex : null;
      }
      const dolEnabled = Boolean(
        teacherReview.dolEnabled === true
        && hasDOLSection
        && Number.isInteger(dolQuestionIndex),
      );
      const dolMinutesBeforeEnd = Math.max(1, Number(teacherReview.dolMinutesBeforeEnd) || 10);
      const dolCloseMinutesBeforeEnd = Math.max(0, Number(teacherReview.dolCloseMinutesBeforeEnd ?? 5));
      const dolInstructionDate = String(
        teacherReview.dolInstructionDate
        || (releaseAt ? localDateKey(new Date(releaseAt)) : '')
        || localDateKey(Date.now()),
      ).trim() || null;

      const folder = normalizeFolderPath(reviewedV5.assignment?.folder) || null;
      const completionRule = assignmentType === 'notesClasswork'
        ? { minEngagementMinutes: 10, minimumQuestionCompletionPercent: 80 }
        : null;
      const sourceAssignmentKey = String(reviewedV5.assignment?.assignmentKey || '').trim() || null;

      if (sourceAssignmentKey && assignments.some((assignment) => (
        assignment.assignmentKey === sourceAssignmentKey
        || String(assignment.assignmentKey || '').startsWith(`${sourceAssignmentKey}:`)
      ))) {
        throw new Error(`An assignment with assignmentKey "${sourceAssignmentKey}" already exists. Clear or change assignment.assignmentKey if you intend to create a separate copy.`);
      }

      const publishingIntent = normalizeLessonPublishingIntentV5({
        classroom: reviewedV5.classroomIntegration,
        lessonResources: { notesPdf: reviewedV5.outputProfiles?.lessonNotesPdf },
      }, {
        ...(reviewedV5.assignment || {}),
        title,
        folder,
      }, []);

      const assignmentPayloadBase = {
        schemaVersion: 5,
        title,
        courseId: reviewedV5.assignment?.courseId || null,
        dueAt,
        lateDueAt,
        dueDate,
        sectionAccess: {
          classwork: { defaultState: teacherReview.sectionAccessDefaults?.classwork === 'closed' ? 'closed' : 'open', overridesByClassId: {}, overridesByClassPeriod: {} },
          practice: { defaultState: teacherReview.sectionAccessDefaults?.practice === 'closed' ? 'closed' : 'open', overridesByClassId: {}, overridesByClassPeriod: {} },
        },
        guidedNotesBySection: {
          classwork: teacherReview.guidedNotesBySection?.classwork || 'automatic',
          practice: teacherReview.guidedNotesBySection?.practice || 'off',
        },
        releaseAt,
        prerequisiteAssignmentId: null,
        completionRule,
        warmup: {
          enabled: warmupEnabled,
          minutesBeforeStart: warmupMinutesBeforeStart,
          closeMinutesAfterStart: 10,
          instructionDate: warmupInstructionDate,
          instructionDatesByClassPeriod: warmupInstructionDatesByClassPeriod,
          closedByClassId: {},
          closedByClassPeriod: {},
        },
        dol: {
          enabled: dolEnabled,
          minutesBeforeEnd: dolMinutesBeforeEnd,
          closeMinutesBeforeEnd: dolCloseMinutesBeforeEnd,
          instructionDate: dolInstructionDate,
          instructionDatesByClassPeriod: teacherReview.dolInstructionDatesByClassPeriod || {},
          questionIndex: dolQuestionIndex,
          earlyUnlocksByClassId: {},
          earlyUnlocks: {},
        },
        folder,
        publicationSettings: {
          strategy: teacherReview.publicationStrategy || 'hybrid',
          includeWarmupInClassroom: teacherReview.includeWarmupInClassroom === true,
          homeworkDueAt: teacherReview.homeworkDueAt ? new Date(teacherReview.homeworkDueAt).toISOString() : null,
        },
        classroomPackage: publishingIntent.classroomPackage,
        lessonResources: publishingIntent.lessonResources,
        instructionalPurpose: reviewedV5.assignment?.instructionalPurpose || 'lesson',
        gradingPurpose: reviewedV5.assignment?.gradingPurpose ?? null,
        variantPolicy: reviewedV5.variantPolicy || {},
        differentiationPolicy: reviewedV5.differentiationPolicy || null,
        supportPolicy: reviewedV5.supportPolicy || null,
        toolPolicy: reviewedV5.toolPolicy || null,
        deliveryPolicy: reviewedV5.deliveryPolicy || null,
        gradingPolicy: reviewedV5.gradingPolicy || null,
        evidencePolicy: reviewedV5.evidencePolicy || null,
        outputProfiles: reviewedV5.outputProfiles || null,
        classroomIntegration: reviewedV5.classroomIntegration || null,
        provenance: reviewedV5.provenance || null,
        preflight: reviewedV5.preflight || { required: true },
        // A Test Cycle's policy, secure blueprint and secure reference are not
        // sections, and this payload used to drop all three — so a Test Cycle
        // authored here was saved as a Review with no secure Test behind it.
        ...testCycleContractFields(reviewedV5),
        ...(assignmentPreflight?.sourceContentLineage ? {
          contentLineage: assignmentPreflight?.sourceContentLineage,
        } : {}),
        createdAt: new Date(),
      };

      if (folder && !assignmentFolderPaths.includes(folder)) {
        await saveAssignmentFolderPaths([...assignmentFolderPaths, folder]);
      }

      const bundleLabs = reviewedV5
        ? (reviewedV5.sections || []).flatMap((section) => (
            (section?.questions || [])
              .filter((question) => question?.type === 'modelingLab' && question?.labDefinition)
              .map((question) => ({
                activityId: section.id || null,
                role: section.role || 'classwork',
                labDefinition: question.labDefinition,
              }))
          ))
        : [];
      const privateLabsById = new Map(bundleLabs.map((activity) => {
        const definition = normalizeLabDefinition(activity.labDefinition, { includeEvaluation: true });
        return [definition.labId, { definition, activity }];
      }));

      // Extracted so assigning a library item later runs the same split rather
      // than a second copy of it. A library save returns [] here, which is the
      // correct answer: nobody has been given it, so there is nothing to split.
      const destinationGroups = buildDestinationGroups({ assignedClassIds, classes });
      const hasHonorsDestination = destinationGroups.some((entry) => entry.courseLevel === 'honors');

      // THE HONORS VERSION IS THE ONE PRE-FLIGHT PROVED.
      //
      // CCMR is destination-aware: Standard destinations keep the authored
      // Practice, and an Honors destination gets audited CCMR Fidelity V2.1
      // items on the same TEKS. Those used to be sourced HERE, after Pre-Flight
      // had said the lesson was ready — so an audited item that failed
      // MathMaster's checks ("Question 24 refers to a graph in its prompt…")
      // failed Create, where it could not be shown, replaced or repaired.
      // Pre-Flight now prepares the Honors version, proves every item in place
      // and previews it (canonicalCcmrHydration.js). Creation publishes that
      // exact object, checked once more by the same model, or nothing: it never
      // sources, swaps or repairs a question, so it cannot fail on one.
      const honorsVersion = hasHonorsDestination
        ? confirmHonorsCandidateForCreate({
          honorsCandidate,
          reviewedAssignmentV5: reviewedCandidate,
          honorsEnrichmentQuestion: teacherReview?.honorsEnrichmentQuestion || null,
        })
        : null;
      const honorsParsedQuestions = honorsVersion
        ? normalizeAssignmentQuestions(validateAssignmentQuestions(flattenV5Sections(honorsVersion.assignmentV5), { variantMode, allowFixed: variantMode === 'shared' }))
        : null;
      const sourceHonorsReport = honorsVersion?.honorsReport || null;
      const splitVariantGroupId = destinationGroups.length > 1 ? `rigor_${createQuestionId()}` : null;

      // Every document this publish writes, built before anything is written,
      // so a payload that cannot be saved stops the publish while nothing exists.
      const planAssignmentVariantWrite = ({ destination, questions, sectionsSource }) => {
        const assignmentRef = doc(collection(db, 'assignments'));
        const labSuffix = `${destination.course}-${destination.courseLevel}-${assignmentRef.id.slice(0, 8)}`;
        const privateLabWrites = [];
        const variantQuestions = questions.map((question) => {
          if (question?.type !== 'modelingLab' || !question.labDefinition?.labId) return question;
          const originalLabId = question.labDefinition.labId;
          const privateSource = privateLabsById.get(originalLabId);
          if (!privateSource) {
            if (bundleLabs.length) throw new Error(`Modeling lab ${originalLabId} could not be matched to its private assignment definition.`);
            return question;
          }
          const nextLabId = `${originalLabId}-${labSuffix}`;
          if (privateSource) privateLabWrites.push({ nextLabId, ...privateSource });
          return { ...question, labDefinition: { ...question.labDefinition, labId: nextLabId } };
        });
        const payload = {
          ...assignmentPayloadBase,
          // Filed in the marking period that is current when it is assigned,
          // so moving to the next period does not drag it into "current".
          ...((destination.classIds || []).length ? currentGradingPeriodStamp(gradingPeriodSettings) : {}),
          assignedClassPeriods: destination.periods,
          assignedClassIds: destination.classIds || [],
          sections: rebuildV5SectionsFromQuestions(sectionsSource, variantQuestions),
          courseProfile: { course: destination.course, courseLevel: destination.courseLevel },
          rigorVariant: destination.courseLevel,
          rigorVariantGroupId: splitVariantGroupId,
          assignmentKey: destinationAssignmentKey({
            assignmentKey: sourceAssignmentKey,
            destination,
            destinationCount: destinationGroups.length,
          }),
          honorsContractVersion: destination.courseLevel === 'honors' ? 1 : null,
          honorsContractScope: destination.courseLevel === 'honors' ? sourceHonorsReport.scope : null,
          // How this Honors version's CCMR was decided: the audited items it
          // carries, or the teacher's recorded choice when none passed.
          ...(destination.courseLevel === 'honors' ? { honorsCcmr: honorsVersion.record } : {}),
        };
        // Recovery V2: each copy's static Warm-Up and DOL questions, paired
        // with certified families, planned on this exact payload (the Honors
        // copy from its own questions). Never a question change.
        const recoveryContent = creationRecoveryContent(payload, { actorUid: user?.uid || null });
        if (recoveryContent) payload.recoveryContent = recoveryContent;
        else delete payload.recoveryContent;
        assertFirestoreSafeAssignmentPayload(payload);
        return { assignmentRef, payload, privateLabWrites };
      };

      const destinationVariants = destinationGroups.map((destination) => {
        if (destination.courseLevel !== 'honors') {
          return { destination, questions: parsedQuestions, sectionsSource: reviewedV5 };
        }
        // The extension the teacher reviewed in Pre-Flight extends THIS
        // assignment's mathematics, so every Honors destination gets that
        // same one, whatever course a destination class profile names. It
        // was rebuilt per destination course once, which is how an Algebra I
        // lesson was given an "Algebra II" extension. It is already in place in
        // the Honors version Pre-Flight proved; certified again here, so
        // publish never stores an extension Pre-Flight would refuse.
        const enrichmentQuestion = teacherReview?.honorsEnrichmentQuestion || null;
        if (enrichmentQuestion) {
          const certification = certifyHonorsExtensionQuestion(enrichmentQuestion);
          if (!certification.ok) {
            throw new Error(`The Honors extension cannot be published because it does not pass MathMaster's checks. Return to Pre-Flight and add it again:\n${certification.errors.join('\n')}`);
          }
        }
        return { destination, questions: honorsParsedQuestions, sectionsSource: honorsVersion.assignmentV5 };
      });

      const plannedWrites = creationMode === 'library'
        // ONE canonical document, deliberately without a course/rigor variant.
        // Choosing a destination now would be guessing: the teacher has not said
        // which classes get it, and materialising a Standard variant today would
        // be wrong the moment they assign it to an Honors class. The split runs
        // when the assignment is actually assigned, through the same helper.
        ? [planAssignmentVariantWrite({
          destination: { course: null, courseLevel: null, periods: [] },
          questions: parsedQuestions,
          sectionsSource: reviewedV5,
        })]
        : destinationVariants.map(planAssignmentVariantWrite);

      // ONE COMMIT FOR EVERY DESTINATION. The Standard and Honors versions and
      // their private lab definitions are written together or not at all, so a
      // failed publish leaves no half-created assignment behind, and pressing
      // Create again cannot duplicate a version that did save.
      const publishBatch = writeBatch(db);
      plannedWrites.forEach(({ assignmentRef, payload, privateLabWrites }) => {
        publishBatch.set(assignmentRef, payload);
        privateLabWrites.forEach(({ nextLabId, definition, activity }) => publishBatch.set(doc(db, 'modelingLabDefinitions', nextLabId), {
          ...definition,
          labId: nextLabId,
          assignmentId: assignmentRef.id,
          activityId: activity.activityId || null,
          activityRole: activity.role || 'classwork',
          updatedAt: new Date(),
        }));
      });
      await publishBatch.commit();
      committed = true;
      const createdAssignments = plannedWrites.map(({ assignmentRef, payload }) => ({ id: assignmentRef.id, ...payload }));

      // "Publish" in Preflight now means publish the whole authored package:
      // MathMaster assignment + mapped Google Classroom post + optional notes
      // material. Classroom is downstream, so a failure is surfaced but never
      // deletes the MathMaster assignment that was just created.
      if (creationMode !== 'library') {
        for (const createdAssignment of createdAssignments) {
          if (!shouldAutoPublishClassroomPackage(createdAssignment)) continue;
          try {
            // eslint-disable-next-line no-await-in-loop
            const classroomResult = await autoPublishAssignmentPackageToClassroom(createdAssignment);
            if (classroomResult.status === 'needs-mapping') {
              toastWarning(
                'MathMaster assignment published; Classroom needs a mapping',
                `${createdAssignment.title} was assigned in MathMaster, but no saved Google Classroom mapping matches ${createdAssignment.assignedClassPeriods.join(', ')}. Map that class once in Google Classroom Manager and publish/retry there.`,
              );
            } else if (classroomResult.status === 'failed' || classroomResult.status === 'partial') {
              toastWarning(
                'MathMaster assignment published; Classroom needs attention',
                `${createdAssignment.title} is live in MathMaster. Google Classroom published ${classroomResult.published || 0} destination(s) and failed ${classroomResult.failed || 0}. Open Google Classroom Manager for details/retry.`,
              );
            } else if (classroomResult.status === 'published') {
              toastSuccess(
                'Google Classroom published',
                `${createdAssignment.title} was posted automatically to ${classroomResult.published} mapped Classroom destination${classroomResult.published === 1 ? '' : 's'}.`,
              );
            }
          } catch (classroomError) {
            console.error('Automatic Google Classroom publication failed:', classroomError);
            toastWarning(
              'MathMaster assignment published; Classroom did not post',
              `${createdAssignment.title} is live in MathMaster, but Google Classroom returned: ${classroomError.message}`,
            );
          }
        }
      }

      // The intake is stateless now — closing preflight and clearing the held
      // JSON is the whole reset.
      setAssignmentPreflight(null);
      await fetchAssignments();
      // Creation consumes the already-reviewed canonical V5 object. There is
      // no local `parsed` result in this function; referencing one here used
      // to throw after Firestore had successfully saved the assignment, making
      // a successful library save look like a failure.
      // The draft existed to hold this assignment while it was unpublishable.
      // It is published now, so the draft's job is done. This runs after the
      // Firestore write and deliberately does not fail the publication: the
      // assignment is live either way, and a leftover draft is a tidiness
      // problem, not a reason to tell the teacher publishing failed.
      if (sourceIncompleteDraftId) {
        try {
          await markIncompleteAssignmentDraftPublished(sourceIncompleteDraftId);
        } catch (draftCleanupError) {
          console.error('Published the assignment but could not close its incomplete draft:', draftCleanupError);
          toastWarning(
            'Published, but the incomplete draft is still listed',
            `“${title}” is saved. Its Incomplete Assignments entry could not be removed automatically — delete it there so the repaired copy is the only one.`,
          );
        }
      }

      const repairMessage = '';
      const sourceMessage = 'Created with MathMaster Assignment Creator after teacher review.';
      toastSuccess(
        creationMode === 'library' ? `Saved “${title}” to the library` : `Published “${title}”`,
        creationMode === 'library'
          ? `${sourceMessage} Not assigned to any class yet, so it has no due date. Assign it when you are ready.${folder ? `\nFolder: ${folder}` : ''}${repairMessage}`
          : `${sourceMessage} Assigned to ${assignedClassPeriods.length} class period(s)${folder ? `\nFolder: ${folder}` : ''}.${repairMessage}`,
      );

    } catch (error) {
      if (committed) {
        // The assignment exists. Close the review so it cannot be created a
        // second time, and say exactly what did not finish.
        console.error('Created the assignment, but a step after saving it failed:', error);
        setAssignmentPreflight(null);
        toastWarning('Created, but MathMaster could not finish refreshing', `The assignment was saved. ${error.message} Refresh the page to see it.`);
      } else {
        toastError('Could not create assignment', `${error.message}\nNothing was created. Your review is still open with every choice kept, so you can fix this and create again.`);
      }
    }
  };

  const updateExistingAssignmentFromReview = async ({ draft, assignmentV5 }) => {
    const assignmentId = assignmentPreflight?.existingAssignmentId;
    const existing = assignments.find((item) => item.id === assignmentId);
    if (!assignmentId || !existing) throw new Error('The assignment being edited could not be found.');

    const model = buildAssignmentV5PreflightModel(assignmentV5);
    if (!model.isValid) {
      throw new Error(`This setup cannot be saved until MathMaster’s assignment checks are clean:\n${model.errors.join('\n')}`);
    }

    const assignedClassIds = [...new Set((draft.assignedClassIds || []).filter(Boolean))];
    const selectedClassRecords = assignedClassIds.length
      ? classes.filter((entry) => assignedClassIds.includes(entry.classId) && entry?.status !== 'archived')
      : [];
    const assignedClassPeriods = [...new Set(selectedClassRecords.map((entry) => entry.period).filter(Boolean))];

    if (isLibraryAssignment(existing) && assignedClassIds.length) {
      throw new Error(
        'This is a reusable library template. Use Dates & Classes to assign it; MathMaster will open Assignment Review and create the correct destination copy while keeping the template unchanged.',
      );
    }

    const targetGroups = buildDestinationGroups({ assignedClassIds, classes });
    const currentCourse = existing.courseId || existing.courseProfile?.course || null;
    const currentLevel = existing.rigorVariant || existing.courseProfile?.courseLevel || null;
    const changesDestination = targetGroups.length > 1
      || (targetGroups.length === 1 && currentCourse && targetGroups[0].course !== currentCourse)
      || (targetGroups.length === 1 && currentLevel && targetGroups[0].courseLevel !== currentLevel);
    if (changesDestination) {
      throw new Error(
        'This assignment is already a destination-specific Standard/Honors version. Duplicate it to the library, then assign the library copy through Assignment Review to create a different rigor destination.',
      );
    }

    const originalV5 = storedAssignmentToV5(existing);
    const hasStudentData = allStudents.some(
      (student) => student.gradesByAssignment?.[existing.id] !== undefined,
    );
    if (hasStudentData) {
      const originalQuestionState = flattenV5Sections(originalV5);
      const reviewedQuestionState = flattenV5Sections(model.assignmentV5);
      const questionContentChanged = JSON.stringify(originalQuestionState) !== JSON.stringify(reviewedQuestionState);
      const historicalFields = [
        'variantPolicy',
        'differentiationPolicy',
        'supportPolicy',
        'toolPolicy',
        'deliveryPolicy',
        'gradingPolicy',
        'evidencePolicy',
      ];
      const changed = historicalFields.filter((field) => (
        JSON.stringify(originalV5[field] || null) !== JSON.stringify(model.assignmentV5[field] || null)
      ));
      const audienceChanged = JSON.stringify([...(existing.assignedClassIds || [])].sort())
        !== JSON.stringify([...assignedClassIds].sort());
      if (changed.length || audienceChanged || questionContentChanged) {
        throw new Error(
          `Student records already exist. To preserve historical evidence, this setup editor cannot change ${[
            ...changed,
            ...(audienceChanged ? ['class audience'] : []),
            ...(questionContentChanged ? ['question content'] : []),
          ].join(', ')}. Duplicate the assignment for a new delivery policy or question rewrite instead.`,
        );
      }
    }

    const mode = resolveCreationMode({ assignedClassIds });
    const { dueAt, lateDueAt, dueDate, releaseAt } = resolveAssignmentDates({
      mode,
      dueValue: draft.dueAt || '',
      lateDueValue: draft.lateDueAt || '',
      releaseValue: draft.releaseAt || '',
    });

    // The Test Cycle contract is server-owned after creation (firestore.rules
    // pins it). Work out what this edit does to it BEFORE saving anything, so a
    // save that would strip it is refused rather than half-applied.
    const contractEdit = planTestCycleContractEdit({ stored: existing, reviewed: model.assignmentV5 });
    if (contractEdit.kind === TEST_CYCLE_CONTRACT_EDIT.REFUSE) throw new Error(contractEdit.message);

    const persistence = canonicalV5PersistencePatch(model.assignmentV5);
    // Firestore stores sections[] only. Derive the temporary flat runtime view
    // from the validated V5 object instead of reading a removed persistence field.
    const persistedQuestions = flattenV5Sections(model.assignmentV5);
    const authoredRoles = persistedQuestions.map((question) => resolveQuestionActivityRole({
      question,
      assignment: model.assignmentV5,
    }));
    const hasWarmup = authoredRoles.includes('warmup');
    const dolIndexFromRole = authoredRoles.findIndex((role) => role === 'dol');
    const hasDOL = dolIndexFromRole >= 0;
    const dolQuestionIndex = hasDOL
      ? Math.max(0, Math.min(
          persistedQuestions.length - 1,
          Number.isInteger(Number(draft.dolQuestionIndex))
            ? Number(draft.dolQuestionIndex)
            : dolIndexFromRole,
        ))
      : null;

    const publishingIntent = normalizeLessonPublishingIntentV5({
      classroom: model.assignmentV5.classroomIntegration,
      lessonResources: { notesPdf: model.assignmentV5.outputProfiles?.lessonNotesPdf },
    }, model.assignmentV5.assignment, []);

    const patch = {
      ...persistence,
      title: model.assignmentV5.assignment.title,
      folder: normalizeFolderPath(model.assignmentV5.assignment.folder) || null,
      dueAt,
      dueDate,
      lateDueAt,
      releaseAt,
      assignedClassIds,
      assignedClassPeriods,
      sectionAccess: {
        ...(existing.sectionAccess || {}),
        classwork: {
          ...(existing.sectionAccess?.classwork || {}),
          defaultState: draft.sectionAccessDefaults?.classwork === 'closed' ? 'closed' : 'open',
        },
        practice: {
          ...(existing.sectionAccess?.practice || {}),
          defaultState: draft.sectionAccessDefaults?.practice === 'closed' ? 'closed' : 'open',
        },
      },
      guidedNotesBySection: {
        classwork: draft.guidedNotesBySection?.classwork || 'automatic',
        practice: draft.guidedNotesBySection?.practice || 'off',
      },
      warmup: {
        ...(existing.warmup || {}),
        enabled: hasWarmup && draft.warmupEnabled !== false,
        minutesBeforeStart: Math.max(0, Number(draft.warmupMinutesBeforeStart) || 7),
        instructionDate: draft.warmupInstructionDate || existing.warmup?.instructionDate || null,
        instructionDatesByClassPeriod: draft.warmupInstructionDatesByClassPeriod || existing.warmup?.instructionDatesByClassPeriod || {},
      },
      dol: {
        ...(existing.dol || {}),
        enabled: hasDOL && draft.dolEnabled === true,
        minutesBeforeEnd: Math.max(1, Number(draft.dolMinutesBeforeEnd) || 10),
        closeMinutesBeforeEnd: Math.max(0, Number(draft.dolCloseMinutesBeforeEnd ?? existing.dol?.closeMinutesBeforeEnd ?? 5)),
        instructionDate: draft.dolInstructionDate || existing.dol?.instructionDate || null,
        instructionDatesByClassPeriod: draft.dolInstructionDatesByClassPeriod || existing.dol?.instructionDatesByClassPeriod || {},
        questionIndex: dolQuestionIndex,
      },
      publicationSettings: {
        ...(existing.publicationSettings || {}),
        strategy: draft.publicationStrategy || existing.publicationSettings?.strategy || 'hybrid',
        includeWarmupInClassroom: draft.includeWarmupInClassroom === true,
        homeworkDueAt: draft.homeworkDueAt ? new Date(draft.homeworkDueAt).toISOString() : null,
      },
      classroomPackage: publishingIntent.classroomPackage,
      lessonResources: publishingIntent.lessonResources,
      updatedAt: new Date().toISOString(),
    };

    assertFirestoreSafeAssignmentPayload({ ...existing, ...patch });
    // `dol` as the fields this edit changed, not the whole map from this tab's
    // copy (which would carry students' grants with it).
    const { dol: editedDol, ...patchWithoutDol } = patch;
    await updateDoc(doc(db, 'assignments', existing.id), {
      ...patchWithoutDol,
      ...classDolFieldPatch(existing.dol, editedDol, { deleteValue: deleteField() }),
    });
    // Then the contract, through the server, which checks the teacher of record
    // and refuses a change that would contradict released results or open
    // secure sessions. Its refusal is reported, not swallowed: the rest of the
    // setup is saved, and the teacher is told exactly what was not.
    if (contractEdit.kind === TEST_CYCLE_CONTRACT_EDIT.ATTACH) {
      await attachTestCycleContract({ assignmentId: existing.id, ...contractEdit.contract });
    } else if (contractEdit.kind === TEST_CYCLE_CONTRACT_EDIT.POLICY) {
      await updateTestCyclePolicy({ assignmentId: existing.id, policy: contractEdit.policyChanges });
    }

    if (!isLibraryAssignment(existing) && shouldAutoPublishClassroomPackage({ ...existing, ...patch })) {
      try {
        await updateAssignmentClassroomPublications({ assignmentId: existing.id });
      } catch (classroomError) {
        console.warn('Classroom sync after assignment setup edit failed:', classroomError);
        toastWarning(
          'Assignment setup saved; Classroom needs attention',
          'MathMaster saved the changes, but Google Classroom could not confirm the updated due date. Open Google Classroom Manager to review it.',
        );
      }
    }

    setAssignmentPreflight(null);
    await fetchAssignments();
    toastSuccess('Assignment setup updated', `“${patch.title}” passed MathMaster’s assignment checks and the reviewed settings were saved.`);
  };

  const confirmAssignmentPreflight = async ({ draft, assignmentV5, honorsCandidate = null }) => {
    setAssignmentPreflightBusy(true);
    try {
      // References to server-only secure manifests cannot be certified by the
      // browser's pure V5 validator. Only Test Cycle candidates pay for this
      // authoritative call, and no assignment is saved/assigned before it
      // passes.
      if (isTestCycleAssignment(assignmentV5)) {
        const authoritative = await preflightTestCycleCandidate({ assignment: assignmentV5 });
        if (authoritative.preflight?.blocked) {
          throw new Error(`This Test Cycle cannot be published:\n${(authoritative.preflight.errors || []).join('\n')}`);
        }
      }
      if (assignmentPreflight?.mode === 'update') {
        await updateExistingAssignmentFromReview({ draft, assignmentV5 });
      } else {
        await handleCreateAssignment(draft, assignmentV5, { honorsCandidate });
      }
    } finally {
      setAssignmentPreflightBusy(false);
    }
  };

  const openQuestionEditor = (assignment) => {
    setQuestionEditorAssignment(assignment);
  };

  const saveQuestionEditor = async ({ title, questions, liveRepairs = [], appendedSections = [] }) => {
    if (!questionEditorAssignment?.id) return;
    const normalizedQuestions = normalizeAssignmentQuestions(questions);
    const included = normalizedQuestions.filter(questionIsIncluded);
    if (!included.length) throw new Error('At least one included question is required.');

    // The FINAL candidate is what is judged: a swap's replacement goes in its
    // own appended section (so no stored index moves), and Pre-Flight judges
    // every question that stays active while setting aside the ones the
    // teacher excluded or retired (assignmentV5PreflightModel).
    const candidateV5 = storedAssignmentToV5(withAppendedQuestionSections(questionEditorAssignment, appendedSections), {
      titleOverride: title,
      questions: normalizedQuestions,
    });
    const model = buildAssignmentV5PreflightModel(candidateV5);
    if (!model.isValid) {
      throw new Error(`These question edits cannot be saved until MathMaster’s assignment checks are clean:\n${model.errors.join('\n')}`);
    }
    const persistence = canonicalV5PersistencePatch(model.assignmentV5);
    const persistedQuestions = flattenV5Sections(model.assignmentV5);
    const originalEditorQuestions = getStoredAssignmentQuestions(questionEditorAssignment);
    const weightChanges = persistedQuestions.flatMap((question, index) => {
      const before = originalEditorQuestions[index];
      if (!before || String(before.questionId || '') !== String(question.questionId || '')) return [];
      const beforeWeight = normalizeQuestionWeight(before);
      const afterWeight = normalizeQuestionWeight(question);
      return Math.abs(beforeWeight - afterWeight) > 1e-9
        ? [{ questionId: question.questionId, questionIndex: index, beforeWeight, afterWeight }]
        : [];
    });
    const dolIndex = resolveDOLQuestionIndex({
      ...questionEditorAssignment,
      questions: persistedQuestions,
    });
    const correctedAt = new Date().toISOString();
    const assignmentPatch = {
      ...persistence,
      'dol.questionIndex': dolIndex >= 0 ? dolIndex : null,
      updatedAt: correctedAt,
    };

    const needsLiveGradeTransaction = !isLibraryAssignment(questionEditorAssignment)
      && ((Array.isArray(liveRepairs) && liveRepairs.length > 0) || weightChanges.length > 0);
    // A viewport repair reframes the picture; it never rewrites a response
    // control, so it earns no correction credit and no returned attempt.
    const presentationOnlyLiveRepair = Array.isArray(liveRepairs)
      && liveRepairs.length > 0
      && liveRepairs.every((repair) => repair?.repairKind === GRAPH_VIEWPORT_REPAIR_KIND);
    // Nothing in a student's grade document can be affected by where a graph is
    // framed, so a presentation-only repair never opens one. It reads and
    // writes no student record at all: not to migrate a tracker, not to write
    // back an identical one, and not to log that it happened. The repair is
    // recorded once, on the assignment.
    const needsStudentGradeMigration = weightChanges.length > 0
      || (Array.isArray(liveRepairs) && liveRepairs.length > 0 && !presentationOnlyLiveRepair);

    if (needsLiveGradeTransaction) {
      const assignmentId = questionEditorAssignment.id;
      const assignmentRef = doc(db, 'assignments', assignmentId);
      const audienceStudents = allStudents.filter((student) => assignmentIsForStudent(
        questionEditorAssignment,
        {
          classId: student.classId || null,
          classPeriod: student.classPeriod,
        },
      ));

      if (needsStudentGradeMigration && audienceStudents.length > 450) {
        throw new Error(
          'This assignment has too many student records for a browser-side live correction. Use the server migration path so every student is updated atomically.',
        );
      }

      await runTransaction(db, async (transaction) => {
        const liveAssignmentSnapshot = await transaction.get(assignmentRef);
        if (!liveAssignmentSnapshot.exists()) {
          throw new Error('This assignment no longer exists. Nothing was changed.');
        }

        const liveAssignment = {
          id: liveAssignmentSnapshot.id,
          ...liveAssignmentSnapshot.data(),
        };
        if (
          questionEditorAssignment.updatedAt
          && liveAssignment.updatedAt
          && String(questionEditorAssignment.updatedAt) !== String(liveAssignment.updatedAt)
        ) {
          throw new Error(
            'This assignment changed after you opened the editor. Close and reopen it before applying the live repair so newer student-facing content is not overwritten.',
          );
        }

        const liveQuestions = getStoredAssignmentQuestions(liveAssignment);
        liveRepairs.forEach((repair) => {
          const index = Number(repair?.questionIndex);
          const liveQuestion = liveQuestions[index];
          const repairedQuestion = persistedQuestions[index];
          if (!Number.isInteger(index) || index < 0 || !liveQuestion || !repairedQuestion) {
            throw new Error('MathMaster could not match a live repair to its original question index.');
          }
          if (
            String(liveQuestion.questionId || '') !== String(repair.questionId || '')
            || String(repairedQuestion.questionId || '') !== String(repair.questionId || '')
          ) {
            throw new Error(
              'A question ID or position changed while the assignment was live. The repair was cancelled to protect student progress.',
            );
          }
          if (
            repair.beforeFingerprint
            && questionFingerprint(liveQuestion) !== repair.beforeFingerprint
          ) {
            throw new Error(
              'The live question changed after this repair was prepared. Reopen the editor and prepare the correction again.',
            );
          }
        });

        weightChanges.forEach((change) => {
          const liveQuestion = liveQuestions[change.questionIndex];
          const weightedQuestion = persistedQuestions[change.questionIndex];
          if (
            !liveQuestion
            || !weightedQuestion
            || String(liveQuestion.questionId || '') !== String(change.questionId || '')
            || String(weightedQuestion.questionId || '') !== String(change.questionId || '')
          ) {
            throw new Error('A weighted question moved or changed identity. Reopen the editor before changing live grade weights.');
          }
          if (Math.abs(normalizeQuestionWeight(liveQuestion) - change.beforeWeight) > 1e-9) {
            throw new Error('A question weight changed after you opened the editor. Reopen it before recalculating live grades.');
          }
        });

        const gradeEntries = needsStudentGradeMigration
          ? await Promise.all(audienceStudents.map(async (student) => {
            const studentRef = doc(db, 'grades', student.id);
            const snapshot = await transaction.get(studentRef);
            return { student, studentRef, snapshot };
          }))
          : [];

        gradeEntries.forEach(({ studentRef, snapshot }) => {
          if (!snapshot.exists()) return;
          const studentData = snapshot.data() || {};
          const gradesByAssignment = studentData.gradesByAssignment || {};
          const assignmentTracker = gradesByAssignment[assignmentId];
          if (assignmentTracker === undefined) return;

          const studentPatch = {};
          let nextTracker = assignmentTracker;
          if (Array.isArray(liveRepairs) && liveRepairs.length > 0) {
            nextTracker = repairAssignmentTrackerForLiveCorrections({
              assignmentTracker: nextTracker,
              questions: persistedQuestions,
              repairs: liveRepairs,
              correctedAt,
            });
          }
          if (weightChanges.length > 0) {
            nextTracker = repairAssignmentTrackerForGranularWorkflowCredit({
              assignmentTracker: nextTracker,
              questions: persistedQuestions,
              questionIndices: weightChanges.map((change) => change.questionIndex),
              correctedAt,
            });
          }
          if (nextTracker !== assignmentTracker || (Array.isArray(liveRepairs) && liveRepairs.length > 0)) {
            studentPatch.gradesByAssignment = {
              ...gradesByAssignment,
              [assignmentId]: nextTracker,
            };
          }
          if (weightChanges.length > 0) {
            studentPatch.classroomReleaseSignals = {
              ...(studentData.classroomReleaseSignals || {}),
              [assignmentId]: {
                reason: 'manual-retry',
                requestedAt: correctedAt,
                source: 'question-weight-change',
              },
            };
          }
          if (Object.keys(studentPatch).length > 0) transaction.update(studentRef, studentPatch);
        });

        // The live repair audit trail lives with the assignment, not with any
        // student record, so a display-only correction is recorded without
        // touching attempts, responses, grades or progress.
        const priorLiveRepairHistory = Array.isArray(liveAssignment.liveRepairHistory)
          ? liveAssignment.liveRepairHistory
          : [];
        const liveRepairAudit = (Array.isArray(liveRepairs) ? liveRepairs : []).map((repair) => ({
          kind: repair?.repairKind || 'response-entry-repair',
          questionId: repair?.questionId || null,
          questionIndex: Number(repair?.questionIndex),
          affectedFieldIds: Array.isArray(repair?.affectedFieldIds) ? repair.affectedFieldIds : [],
          changedViewportKeys: Array.isArray(repair?.changedViewportKeys) ? repair.changedViewportKeys : [],
          correctedAt,
        }));

        if (liveRepairAudit.length) {
          assignmentPatch.liveRepairHistory = [...priorLiveRepairHistory, ...liveRepairAudit].slice(-50);
        }

        transaction.update(assignmentRef, assignmentPatch);
      });

      if (weightChanges.length > 0 && Array.isArray(liveRepairs) && liveRepairs.length > 0) {
        toastSuccess(
          'Live repairs and grade weights saved',
          'Student responses and attempt history were preserved. MathMaster recalculated the assignment and section grades with the new weights and queued Google Classroom to reconcile them.',
        );
      } else if (weightChanges.length > 0) {
        toastSuccess(
          'Grade weights saved',
          'Existing responses and attempts were not changed. MathMaster recalculated the assignment and section grades using the new question weights and queued Google Classroom to reconcile them.',
        );
      } else if (presentationOnlyLiveRepair) {
        toastSuccess(
          'Graph viewport corrected',
          'The graph is now framed so students can see the whole picture. This is a display-only change: attempts, responses, grades and progress were left exactly as they were.',
        );
      } else {
        toastSuccess(
          'Safe live repair saved',
          'The corrected response controls are live. Existing student attempts were preserved, affected rejected responses were protected from score loss, and exhausted students received a repair retry only when they still had another incorrect part.',
        );
      }
    } else {
      await updateDoc(doc(db, 'assignments', questionEditorAssignment.id), assignmentPatch);
    }

    setQuestionEditorAssignment(null);
    await fetchAssignments();
  };

  const handleDuplicateAssignment = async (assignment) => {
    try {
      const duplicateQuestions = getStoredAssignmentQuestions(assignment).map((question) => ({
        ...question,
        questionId: createQuestionId(),
      }));
      const candidateV5 = storedAssignmentToV5(assignment, {
        titleOverride: `${assignment.title} (Copy)`,
        questions: duplicateQuestions,
        resetAssignmentKey: true,
      });
      const model = buildAssignmentV5PreflightModel(candidateV5);
      if (!model.isValid) {
        throw new Error(`The copy cannot be created until MathMaster’s assignment checks are clean:\n${model.errors.join('\n')}`);
      }
      const persistence = canonicalV5PersistencePatch(model.assignmentV5);
      // A copy carries the content, never the source's instance state:
      // students' overrides (which the create rule refuses anyway, so any
      // assignment with an extension could not be duplicated) and each
      // class's DOL/Warm-Up runtime state (shared/assignmentPrivacy.mjs).
      const {
        id: _id,
        archived: _archived,
        archivedAt: _archivedAt,
        archivedBy: _archivedBy,
        // A copy is a new assessment: it starts published (to whichever class
        // it is later assigned) and carries none of the source's audit history.
        unpublished: _unpublished,
        unpublishedAt: _unpublishedAt,
        unpublishedBy: _unpublishedBy,
        lifecycleHistory: _lifecycleHistory,
        assessmentPolicyHistory: _assessmentPolicyHistory,
        contentLineage: _contentLineage,
        contentUpgrade: _contentUpgrade,
        // The source's Recovery bindings name the SOURCE's question ids; the
        // copy's questions have new ones, so its Recovery is planned afresh.
        recoveryContent: _recoveryContent,
        ...rest
      } = stripAssignmentInstanceState(assignment);
      const copyRecoveryContent = creationRecoveryContent({ ...rest, ...persistence }, { actorUid: user?.uid || null });
      await addDoc(collection(db, 'assignments'), {
        ...rest,
        ...persistence,
        ...(copyRecoveryContent ? { recoveryContent: copyRecoveryContent } : {}),
        assignmentKey: null,
        assignedClassIds: [],
        assignedClassPeriods: [],
        dueAt: null,
        dueDate: null,
        lateDueAt: null,
        lateDueDate: null,
        releaseAt: null,
        courseProfile: { course: model.assignmentV5.assignment.courseId, courseLevel: null },
        rigorVariant: null,
        rigorVariantGroupId: null,
        honorsContractVersion: null,
        honorsContractScope: null,
        feedbackReleased: false,
        feedbackReleasedAt: null,
        createdAt: new Date(),
      });
      await fetchAssignments();
      toastSuccess(
        `Duplicated “${assignment.title}”`,
        'The copy passed MathMaster’s assignment checks and was saved as an unassigned library item with no student records.',
      );
    } catch (error) {
      toastError('Could not duplicate assignment', error.message);
    }
  };

  const openStoredAssignmentForPreflight = (assignment, draftOverrides = {}) => {
    // A stored assignment is ALREADY canonical V5. Sending it back through the
    // authoring compiler used to reinterpret internal renderer contracts as new
    // AI intent. A composed function workflow could therefore collapse into the
    // legacy y=x free-plot tool while being moved from the Library to a class.
    // Reuse validates the stored canonical object directly and never recompiles
    // its questions.
    const prepared = prepareStoredAssignmentForReuse(assignment, { resetAssignmentKey: true });
    const opened = openAssignmentPreflight(
      {
        assignmentV5: prepared.assignmentV5,
        questions: prepared.questions,
        authoringWarnings: prepared.warnings,
      },
      `Library · ${assignment.title}`,
      draftOverrides,
      { sourceContentLineage: assignment.contentLineage || null },
    );
    if (opened !== true) throw new Error(opened?.error || 'Could not open Assignment Review for this saved assignment.');
    return prepared.assignmentV5;
  };

  const beginEditAssignmentSetup = (assignment) => {
    try {
      const prepared = prepareStoredAssignmentForReuse(assignment, { resetAssignmentKey: false });
      const canonicalV5 = prepared.assignmentV5;
      const currentDraft = {
        title: assignment.title || canonicalV5.assignment.title || '',
        folder: assignment.folder || canonicalV5.assignment.folder || '',
        dueAt: toDateTimeLocalInputValue(assignment.dueAt || assignment.dueDate || ''),
        lateDueAt: toDateTimeLocalInputValue(assignment.lateDueAt || assignment.lateDueDate || ''),
        releaseAt: toDateTimeLocalInputValue(assignment.releaseAt || ''),
        sectionVariantModes: getStoredSectionVariantModes(canonicalV5),
        sectionAccessDefaults: {
          classwork: assignment.sectionAccess?.classwork?.defaultState === 'closed' ? 'closed' : 'open',
          practice: assignment.sectionAccess?.practice?.defaultState === 'closed' ? 'closed' : 'open',
        },
        guidedNotesBySection: {
          classwork: assignment.guidedNotesBySection?.classwork || 'automatic',
          practice: assignment.guidedNotesBySection?.practice || 'off',
        },
        assignedClassIds: [...(assignment.assignedClassIds || [])],
        assignedClassPeriods: [...(assignment.assignedClassPeriods || [])],
        warmupEnabled: assignment.warmup?.enabled !== false,
        warmupMinutesBeforeStart: assignment.warmup?.minutesBeforeStart ?? 7,
        warmupInstructionDate: assignment.warmup?.instructionDate || '',
        warmupInstructionDatesByClassPeriod: assignment.warmup?.instructionDatesByClassPeriod || {},
        dolEnabled: assignment.dol?.enabled === true,
        dolMinutesBeforeEnd: assignment.dol?.minutesBeforeEnd ?? 10,
        dolCloseMinutesBeforeEnd: assignment.dol?.closeMinutesBeforeEnd ?? 5,
        dolInstructionDate: assignment.dol?.instructionDate || '',
        dolInstructionDatesByClassPeriod: assignment.dol?.instructionDatesByClassPeriod || {},
        dolQuestionIndex: Number.isInteger(assignment.dol?.questionIndex) ? assignment.dol.questionIndex : null,
        publicationStrategy: assignment.publicationSettings?.strategy || 'hybrid',
        includeWarmupInClassroom: assignment.publicationSettings?.includeWarmupInClassroom === true,
        homeworkDueAt: toDateTimeLocalInputValue(assignment.publicationSettings?.homeworkDueAt || ''),
        instructionalPurpose: canonicalV5.assignment.instructionalPurpose || 'lesson',
        gradingPurpose: canonicalV5.assignment.gradingPurpose || null,
        variantPolicy: canonicalV5.variantPolicy,
        differentiationPolicy: canonicalV5.differentiationPolicy,
        supportPolicy: canonicalV5.supportPolicy,
        toolPolicy: canonicalV5.toolPolicy,
        deliveryPolicy: canonicalV5.deliveryPolicy,
        gradingPolicy: canonicalV5.gradingPolicy,
        evidencePolicy: canonicalV5.evidencePolicy,
        outputProfiles: canonicalV5.outputProfiles,
        classroomIntegration: canonicalV5.classroomIntegration,
        provenance: canonicalV5.provenance,
        preflight: canonicalV5.preflight,
      };
        const opened = openAssignmentPreflight(
        {
          assignmentV5: canonicalV5,
          questions: prepared.questions,
          authoringWarnings: prepared.warnings,
        },
        `Existing · ${assignment.title}`,
        currentDraft,
        {
          mode: 'update',
          existingAssignmentId: assignment.id,
          allowQuestionRepair: !allStudents.some(
            (student) => student.gradesByAssignment?.[assignment.id] !== undefined,
          ),
        },
      );
      if (opened !== true) throw new Error(opened?.error || 'Could not open Assignment Review.');
    } catch (error) {
      toastError('Could not review assignment setup', error.message);
    }
  };

  const beginAssignLibraryAssignment = (assignment) => {
    // Give Library rows a real Assign action. The existing Dates & Classes
    // editor owns destination/date selection; saving a library item from there
    // opens canonical Preflight and then uses the normal Classroom publisher.
    setLibraryNavigation(null);
    setAssignmentSearch('');
    beginEditAssignmentDates(assignment);
    setTeacherTab('assignments');
    toastInfo(
      'Choose the class and dates',
      'This Library lesson will stay reusable. After you choose a class, Assignment Review will preserve the exact questions and publish the saved Google Classroom post, notes, resources, and grade-passback settings.',
    );
  };

  const handleRepairAssignmentFromLibrary = async (assignment) => {
    const inspection = inspectLibraryContentRepair(assignment, assignments);
    if (!inspection.source || !inspection.questionIds.length) {
      toastError(
        'No safe repair source found',
        'MathMaster could not find one unambiguous saved assignment with the same question identity and the richer workflow. No student work was changed.',
      );
      return;
    }

    const proceed = await confirmAction({
      title: `Repair ${inspection.questionIds.length} corrupted question${inspection.questionIds.length === 1 ? '' : 's'}?`,
      message: 'MathMaster will restore only the collapsed workflow question content from the matching intact assignment source. The live assignment ID, question IDs/order, dates, classes, and every other question stay unchanged. Because the corrupted question was not valid work, students receive fresh attempts on that repaired question only; they do not restart the assignment.',
      confirmLabel: 'Repair assignment',
    });
    if (!proceed) return;

    try {
      const repair = buildSafeLibraryContentRepair(assignment, inspection.source);
      const currentQuestions = getStoredAssignmentQuestions(assignment);
      const repairedIndices = repair.repairedQuestionIds
        .map((questionId) => currentQuestions.findIndex((question) => question?.questionId === questionId))
        .filter((index) => index >= 0);
      const studentsWithThisAssignment = allStudents.filter((student) => (
        student?.id && student.gradesByAssignment?.[assignment.id]
      ));

      // The assignment itself and the repaired-question attempt reset are one
      // Firestore batch. Students keep every other answer/score. Only work on a
      // question that MathMaster rendered incorrectly is cleared, because
      // carrying an "expired" attempt record into the restored workflow would
      // leave the repaired question impossible to answer.
      if (studentsWithThisAssignment.length > 450) {
        throw new Error('This assignment has too many active student grade records for one safe atomic repair. Contact the platform administrator before repairing it.');
      }
      const repairedAt = new Date().toISOString();
      const batch = writeBatch(db);
      batch.update(doc(db, 'assignments', assignment.id), {
        sections: repair.sections,
        contentRepair: {
          kind: 'libraryCanonicalWorkflowRestore',
          sourceAssignmentId: inspection.source.id,
          repairedQuestionIds: repair.repairedQuestionIds,
          repairedQuestionIndices: repairedIndices,
          repairedAt,
          studentQuestionAttemptsReset: true,
        },
      });
      studentsWithThisAssignment.forEach((student) => {
        const gradePatch = {};
        repairedIndices.forEach((questionIndex) => {
          gradePatch[`gradesByAssignment.${assignment.id}.${questionIndex}`] = emptyQuestionRecord();
        });
        // Classwork completion is a derived summary. The student's other
        // question records remain untouched, and the summary will be earned
        // again from the repaired content rather than retaining a score based
        // on the broken renderer.
        gradePatch[`classworkGradesByAssignment.${assignment.id}`] = deleteField();
        batch.update(doc(db, 'grades', student.id), gradePatch);
      });
      await batch.commit();

      await fetchAssignments();
      toastSuccess(
        'Assignment repaired without restarting students',
        `Restored ${repair.repairedQuestionIds.length} corrupted question${repair.repairedQuestionIds.length === 1 ? '' : 's'} in place. Students keep all other work and receive fresh attempts only on the repaired question${repair.repairedQuestionIds.length === 1 ? '' : 's'}.`,
      );
    } catch (error) {
      console.error(error);
      toastError('Could not repair assignment', error.message);
    }
  };

  const handleSaveAssignmentDates = async (assignmentId) => {
    const dueAt = new Date(editingAssignmentDates.dueAt);
    const hasLateDue = Boolean(String(editingAssignmentDates.lateDueAt || '').trim());
    const lateDueAt = hasLateDue ? new Date(editingAssignmentDates.lateDueAt) : null;
    if (
      Number.isNaN(dueAt.getTime())
      || (lateDueAt && (Number.isNaN(lateDueAt.getTime()) || lateDueAt <= dueAt))
    ) {
      toastError('Check the dates', 'Set a valid due date. If you use a final late due date, it must be later than the regular due date.');
      return;
    }

    const assignment = assignments.find((item) => item.id === assignmentId);
    if (!assignment) {
      toastError('Assignment not found', 'Refresh the assignment list and try again.');
      return;
    }

    const editedClassIds = Array.isArray(editingAssignmentDates.assignedClassIds)
      ? editingAssignmentDates.assignedClassIds
      : [];
    const editedClassRecords = editedClassIds.length
      ? classes.filter((entry) => editedClassIds.includes(entry.classId) && entry?.status !== 'archived')
      : [];
    const editedPeriods = [...new Set(editedClassRecords.map((entry) => entry.period).filter(Boolean))];

    // A library item is a reusable source, not a half-published assignment.
    // Selecting classes launches the same Preflight/new-destination path used by
    // fresh V5 authoring. The library template remains untouched and reusable.
    if (isLibraryAssignment(assignment) && editedClassIds.length) {
      try {
        openStoredAssignmentForPreflight(assignment, {
          title: assignment.title,
          folder: assignment.folder || '',
          dueAt: editingAssignmentDates.dueAt,
          lateDueAt: editingAssignmentDates.lateDueAt || '',
          assignedClassIds: editedClassIds,
          assignedClassPeriods: editedPeriods,
          dolInstructionDate: editingAssignmentDates.dolInstructionDate || '',
        });
        setEditingAssignmentId(null);
        toastInfo(
          'Review before assigning',
          'The library template is staying unchanged. Preflight will create the correct destination version(s) for the classes you selected.',
        );
      } catch (error) {
        toastError('Could not open assignment Preflight', error.message);
      }
      return;
    }

    // Adding another class is a NEW delivery of the same authored assignment.
    // Keep the existing class record (and therefore its due date, student
    // evidence, and Classroom post) unchanged. The edited dates belong to the
    // newly-added class(es), which are prepared from this assignment's reviewed
    // V5 source. This is what makes "Period 3 due Tuesday, Period 5 due
    // Wednesday" possible without one save silently moving both deadlines.
    const originalClassIds = Array.isArray(assignment.assignedClassIds)
      ? assignment.assignedClassIds.filter(Boolean)
      : [];
    const addedClassIds = editedClassIds.filter((classId) => !originalClassIds.includes(classId));
    const keptEveryOriginalClass = originalClassIds.every((classId) => editedClassIds.includes(classId));
    if (addedClassIds.length && keptEveryOriginalClass) {
      try {
        const addedRecords = classes.filter((entry) => addedClassIds.includes(entry.classId) && entry?.status !== 'archived');
        const addedPeriods = [...new Set(addedRecords.map((entry) => entry.period).filter(Boolean))];
        openStoredAssignmentForPreflight(assignment, {
          title: assignment.title,
          folder: assignment.folder || '',
          dueAt: editingAssignmentDates.dueAt,
          lateDueAt: editingAssignmentDates.lateDueAt || '',
          assignedClassIds: addedClassIds,
          assignedClassPeriods: addedPeriods,
          dolInstructionDate: editingAssignmentDates.dolInstructionDate || '',
        });
        setEditingAssignmentId(null);
        toastInfo(
          'Review the added class delivery',
          'The current class assignment and its dates stay unchanged. MathMaster reused the assignment for only the new class(es), so their due date and Standard/Honors depth can be managed independently.',
        );
      } catch (error) {
        toastError('Could not prepare the added class', error.message);
      }
      return;
    }

    // Existing assigned variants may move among classes with the same
    // course/rigor destination, but cannot silently change Standard/Honors
    // identity or fan out into mixed rigor without going through a fresh split.
    const targetGroups = buildDestinationGroups({ assignedClassIds: editedClassIds, classes });
    const currentCourse = assignment.courseId || assignment.courseProfile?.course || null;
    const currentLevel = assignment.rigorVariant || assignment.courseProfile?.courseLevel || null;
    const changesDestination = targetGroups.length > 1
      || (targetGroups.length === 1 && currentCourse && targetGroups[0].course !== currentCourse)
      || (targetGroups.length === 1 && currentLevel && targetGroups[0].courseLevel !== currentLevel);
    if (changesDestination) {
      toastError(
        'Use a destination copy',
        'This edit would move or mix a destination-specific Standard/Honors delivery. Add another class without removing the current class, or use the reusable Library source so MathMaster can preserve the correct rigor version.',
      );
      return;
    }

    const hasDOL = Boolean(assignment?.dol?.enabled || getStoredAssignmentQuestions(assignment).some((question) => (
      resolveQuestionActivityRole({ question, assignment }) === 'dol'
    )));
    const patch = {
      dueAt: dueAt.toISOString(),
      dueDate: dueAt.toISOString(),
      lateDueAt: lateDueAt ? lateDueAt.toISOString() : null,
      assignedClassIds: editedClassIds,
      assignedClassPeriods: editedPeriods,
    };
    if (hasDOL) {
      patch.dol = {
        ...(assignment?.dol || {}),
        enabled: assignment?.dol?.enabled ?? true,
        instructionDate: editingAssignmentDates.dolInstructionDate || localDateKey(Date.now()),
      };
    }
    // `dol` as the fields this edit changed (enabled, its day), never the
    // whole map from this tab's copy, which would carry students' grants.
    const { dol: editedDol, ...patchWithoutDol } = patch;
    await updateDoc(doc(db, 'assignments', assignmentId), {
      ...patchWithoutDol,
      ...(editedDol ? classDolFieldPatch(assignment?.dol, editedDol, { deleteValue: deleteField() }) : {}),
    });

    const nextAssignment = {
      ...assignment,
      ...patch,
      dol: patch.dol || assignment?.dol,
    };

    if (shouldAutoPublishClassroomPackage(nextAssignment)) {
      try {
        // Publishing is idempotent for courses that already have a MathMaster
        // post and creates the missing post for any class just added in Dates &
        // Classes. Only after that do we patch every existing post's due date.
        // Previously we only ran the update call, which cannot create a
        // Classroom post and made "add another class" appear not to work.
        await autoPublishAssignmentPackageToClassroom(nextAssignment);
        await updateAssignmentClassroomPublications({ assignmentId });
      } catch (classroomError) {
        console.warn('Classroom publish/sync after assignment edit failed:', classroomError);
      }
    }

    setEditingAssignmentId(null);
  };

  // This only controls discoverability. Privileged operations remain
  // callable-only and re-check the immutable root identity + claims on the
  // server. The email fallback prevents a stale token from hiding Admin Mode
  // from the one account that needs to fix/deploy it.
  const rootAdminUiEligible = user.isRootAdmin === true
    || isRootAdminEmail(user.email);
  const selectedAssignment = assignments.find((assignment) => assignment.id === gradebookFilter.assignmentId) || null;
  const gradebookRigor = rigorComparability({
    evidenceByStudentId: classEvidenceByStudentId,
    assignmentId: selectedAssignment?.id || null,
  });
  const selectedGradebookClass = classes.find((entry) => entry.classId === gradebookFilter.classId) || null;
  const selectedGradebookPeriod = selectedGradebookClass?.period || gradebookFilter.classPeriod || '';
  const selectedClassStudents = allStudents.filter((student) => (
    gradebookFilter.classId
      ? student.classId === gradebookFilter.classId || (!student.classId && selectedGradebookPeriod && student.classPeriod === selectedGradebookPeriod)
      : (student.classPeriod || 'Unassigned') === selectedGradebookPeriod
  )).sort(compareStudentsByName);
  const assignmentsForSelectedClass = assignments.filter((assignment) => !selectedGradebookPeriod || assignmentIsForStudent(assignment, { classId: gradebookFilter.classId || null, classPeriod: selectedGradebookPeriod }));
  // The class summary above the gradebook table, from the same canonical
  // grade projection the table rows use. It is also the table filter.
  const gradebookProgress = teacherTab === 'grades' && selectedAssignment
    ? classGradeProgress({ assignment: selectedAssignment, roster: selectedClassStudents, hasGradeRecords: teacherStudentDataMode === 'full', nameOf: (student) => formatStudentName(student), hasPracticePass: gradebookHasPracticePass })
    : null;
  const gradebookFilterIds = gradebookProgress && gradebookProgressFilter !== 'all'
    ? new Set(({ complete: gradebookProgress.complete, inProgress: gradebookProgress.inProgress, notStarted: gradebookProgress.notStarted, below: gradebookProgress.belowThreshold }[gradebookProgressFilter] || []).map((row) => row.id))
    : null;
  const gradebookVisibleStudents = gradebookFilterIds ? selectedClassStudents.filter((student) => gradebookFilterIds.has(student.id)) : selectedClassStudents;

  // The Assignments tab list, after the Library folder/smart-view filter and
  // the free-text search. Computed once so the header count, the
  // select-all-visible checkbox and the rendered cards can never disagree.
  const visibleAssignments = assignments.filter((assignment) => (
    // The Assignments tab is class-scoped whenever the class bar names a
    // specific class. Library-only/unassigned work must not leak into a class
    // view simply because its title or folder matches the search.
    (!activeClass.classId || assignmentIsForStudent(assignment, {
      classId: activeClass.classId,
      classPeriod: activeClass.classPeriod,
    }))
    && assignmentFolderMatches(assignment, libraryNavigation?.folder)
    && matchesSmartView(assignment, libraryNavigation?.smartView, { nowValue: now, classSchedule, classes })
    && titleOrFolderMatches(assignment, assignmentSearch)
  ));
  // A search or a Library filter narrows the list: it is shown flat, so a
  // match is never folded inside a closed marking-period group.
  const assignmentListIsFiltered = Boolean(assignmentSearch.trim() || libraryNavigation?.folder || libraryNavigation?.smartView);
  const visibleAssignmentIds = visibleAssignments.map((assignment) => assignment.id);
  const allVisibleSelected = visibleAssignmentIds.length > 0
    && visibleAssignmentIds.every((id) => selectedAssignmentIds.has(id));


  if (teacherWorkspaceMode === 'administration' && rootAdminUiEligible) {
    return (
      <div style={{ fontFamily: '"Segoe UI", sans-serif', backgroundColor: 'var(--mm-surface-control)', minHeight: '100vh', padding: '20px' }}>
        <div style={{ maxWidth: 1260, margin: '0 auto', background: 'var(--mm-surface)', borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,.06)', overflow: 'hidden' }}>
          <header style={{ padding: '22px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap', borderBottom: '1px solid var(--mm-border-soft)', background: '#202124', color: '#fff' }}>
            <div><div style={{ fontSize: 'calc(11 * var(--mm-px))', fontWeight: 900, letterSpacing: '.08em', color: '#c6dafc' }}>ROOT ADMINISTRATOR</div><h1 style={{ margin: '4px 0 0', fontSize: 'calc(25 * var(--mm-px))', color: 'inherit' }}>MathMaster Administration</h1><p style={{ margin: '4px 0 0', color: '#dadce0', fontSize: 'calc(13 * var(--mm-px))' }}>{user.email}</p></div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><div role="group" aria-label="Root administrator workspace" style={{ display: 'inline-flex', padding: 3, borderRadius: 9, background: '#3c4043', border: '1px solid #5f6368' }}><button type="button" aria-pressed="false" onClick={() => setTeacherWorkspaceMode('teacher')} style={{ padding: '6px 10px', border: 0, borderRadius: 6, background: 'transparent', color: '#e8eaed', fontWeight: 900 }}>Teacher View</button><button type="button" aria-pressed="true" style={{ padding: '6px 10px', border: 0, borderRadius: 6, background: 'var(--mm-surface)', color: 'var(--mm-text-strong)', fontWeight: 900 }}>Administration</button></div><button type="button" onClick={() => { setTeacherWorkspaceMode('teacher'); setTeacherTab('demo'); }} style={{ padding: '9px 13px', border: '1px solid var(--mm-accent-border)', borderRadius: 8, background: 'var(--mm-accent-subtle)', color: 'var(--mm-accent-text)', fontWeight: 900 }}>Open Demo Experience</button><button onClick={handleLogout} style={{ padding: '9px 13px', background: 'transparent', color: '#f28b82', border: '1px solid var(--mm-error-border-soft)', borderRadius: 8, fontWeight: 900 }}>Log Out</button></div>
          </header>
          <div role="tablist" aria-label="Administration sections" style={{ display: 'flex', gap: 8, padding: '14px 28px 0', flexWrap: 'wrap' }}>
            {[['classes', 'Classes & rosters'], ['accounts', 'Accounts & sign-in'], ['coverage', 'Path content coverage'], ['ai', 'Assignment AI health'], ['reset', 'Pre-production reset']].map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={adminTab === id}
                onClick={() => setAdminTab(id)}
                style={{ minHeight: 40, padding: '8px 16px', borderRadius: '9px 9px 0 0', cursor: 'pointer', border: '1px solid var(--mm-border)', borderBottom: 0, background: adminTab === id ? 'var(--mm-surface)' : 'var(--mm-surface-control)', color: adminTab === id ? 'var(--mm-primary-text)' : 'var(--mm-text)', fontWeight: 900, fontSize: 'calc(14 * var(--mm-px))' }}
              >
                {label}
              </button>
            ))}
          </div>
          <main style={{ padding: 28 }}>
            {adminTab === 'classes' && <ClassesAdmin />}
            {adminTab === 'accounts' && <SignInAccess signedInEmail={user.email} mode="admin" onStudentIdentityChanged={refreshTeacherRosterAfterNameChange} />}
            {adminTab === 'coverage' && <PathCoverageAudit />}
            {adminTab === 'ai' && <AssignmentAiHealth />}
            {adminTab === 'reset' && (
              <PreproductionReset
                onResetComplete={async () => {
                  setAssignments([]);
                  setAllStudents([]);
                  setPresenceById({});
                  setStudentSupportEvents([]);
                  setStudentSessionSummaries([]);
                  setAssignmentActivity({});
                  setDolGradesByAssignment({});
                  setClassworkGradesByAssignment({});
                  setSupportUsageByAssignment({});
                  setWeeklyPathCompletionsByStudent({});
                  setWeeklyPathGoalSnapshotsByStudent({});
                  setClassEvidenceByStudentId({});
                  await Promise.all([
                    fetchAssignments(),
                    fetchTeacherRosterSummaries(),
                  ]);
                }}
              />
            )}
          </main>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: '"Segoe UI", sans-serif', backgroundColor: 'var(--mm-surface-sunken)', minHeight: '100vh', padding: '20px' }}>
      {renderDeleteAssignmentDialog()}
      {testCyclePreviewAssignment && (
        <Suspense fallback={<p role="status" style={{ position: 'fixed', top: 12, left: 12, zIndex: 11000 }}>Opening the student preview…</p>}>
          <TestCyclePreview
            assignment={testCyclePreviewAssignment}
            onClose={() => setTestCyclePreviewAssignment(null)}
            // Review is ordinary content: play it in the existing in-memory
            // teacher preview, which writes nothing either.
            onPreviewReview={(assignment) => {
              setTestCyclePreviewAssignment(null);
              startTeacherPreview(assignment.id, { lessonRuntime: true });
            }}
          />
        </Suspense>
      )}
      {renderExportJsonDialog()}
      {renderTeacherScratchpadDialog()}
      {teacherWorksheetDialog && (() => {
        const assignment = assignments.find((item) => item.id === teacherWorksheetDialog.assignmentId) || null;
        if (!assignment) return null;
        const students = teacherWorksheetStudentsFor(assignment);
        return (
          <TeacherAssignmentPdfDialog
            key={assignment.id}
            assignment={assignment}
            students={students}
            requiresStudent={teacherWorksheetDialog.requiresStudent === true}
            busy={teacherWorksheetBusy}
            onCancel={() => { if (!teacherWorksheetBusy) setTeacherWorksheetDialog(null); }}
            onExport={(student, outputMode) => exportTeacherAssignmentWorksheetPdf(assignment, student, outputMode)}
          />
        );
      })()}
      {assignmentPreflight && (
        <LessonPreflightModal
          key={`${assignmentPreflight.assignmentV5.assignment?.title || 'assignment-v5'}-${assignmentPreflight.sourceLabel}`}
          assignmentV5={assignmentPreflight.assignmentV5}
          initialDraft={assignmentPreflight.initialDraft}
          classPeriods={CLASS_PERIODS}
          classes={classes}
          courseProfiles={courseProfiles}
          sourceLabel={assignmentPreflight.sourceLabel}
          sourceQuestions={assignmentPreflight.questions}
          authoringWarnings={assignmentPreflight.authoringWarnings}
          onClose={() => setAssignmentPreflight(null)}
          onConfirmPublish={confirmAssignmentPreflight}
          busy={assignmentPreflightBusy}
          reviewMode={assignmentPreflight.mode || 'create'}
          allowQuestionRepair={assignmentPreflight.allowQuestionRepair !== false}
          rosterSizesByClassId={preflightRosterSizesByClassId}
          // Offers the in-place import of a Test Cycle's missing secure
          // families; seedPathQuestionBank re-checks the root identity.
          canManageSecureBank={rootAdminUiEligible}
        />
      )}
      {contentUpgradeRequest && (
        <AssignmentContentUpgradeModal
          assignment={contentUpgradeRequest.assignment}
          targetAssignment={contentUpgradeRequest.targetAssignment}
          onClose={() => setContentUpgradeRequest(null)}
          onUpgraded={async (result) => {
            const refreshResults = await Promise.allSettled([fetchAssignments(), fetchTeacherRosterSummaries()]);
            const refreshFailed = refreshResults.some((entry) => entry.status === 'rejected');
            toastSuccess(
              result?.alreadyUpgraded
                ? `Content V${result.contentVersion} already saved`
                : `Upgraded to Content V${result.contentVersion}`,
              refreshFailed
                ? 'The assignment save succeeded. One dashboard panel did not refresh yet; press Done, then refresh the page.'
                : 'Student work and Google Classroom links were preserved.',
            );
          }}
        />
      )}
      {questionEditorAssignment && (
        <AssignmentQuestionEditor
          assignment={questionEditorAssignment}
          hasLiveProtection={
            !isLibraryAssignment(questionEditorAssignment)
            || allStudents.some((student) => student.gradesByAssignment?.[questionEditorAssignment.id] !== undefined)
          }
          fullAuditAuthorized={rootAdminUiEligible || user.assignmentRepairer === true}
          studentActivityStatus={allStudents.some((student) => student.gradesByAssignment?.[questionEditorAssignment.id] !== undefined) ? 'present' : 'unavailable'}
          onSave={saveQuestionEditor}
          onClose={() => setQuestionEditorAssignment(null)}
        />
      )}
      {/*
        ONE drawer for the whole teacher workspace. Every student name on
        every screen opens this same component with the same profile, so the
        answer a teacher gets never depends on which name they clicked.
      */}
      <TeacherQuickSearch
        open={quickSearchOpen}
        // Raw roster records: teacherSearch formats names itself (structured,
        // Google and legacy names) and searches ids. Copying a formatted name
        // into displayName here rebuilt every record on every render and made
        // a nameless student match a search for "unavailable".
        students={allStudents}
        classes={classes}
        assignments={assignments}
        standards={searchableStandards}
        onClose={() => setQuickSearchOpen(false)}
        onSelect={(result) => {
          if (result.kind === 'student') { setProfileDrawerStudentId(result.payload.studentId); return; }
          if (result.kind === 'class') {
            setActiveClass({ classId: result.payload.classId, classPeriod: result.payload.classPeriod });
            setTeacherTab('classesWorkspace');
            return;
          }
          if (result.kind === 'assignment') {
            // An assignment result opens the assignment itself — its grades,
            // live room, controls and export are all one click from there.
            // (It used to jump to Grades without switching class, landing on
            // an empty "Select assignment" whenever the class differed.)
            openAssignmentHub(result.payload.assignmentId, result.payload.classId || null);
            return;
          }
          if (result.kind === 'standard') setTeacherTab('standards');
        }}
      />

      <ClassroomSyncReview
        proposal={classroomSyncProposal}
        students={allStudents}
        onClose={() => setClassroomSyncProposal(null)}
      />

      <AssignmentHub
        open={Boolean(assignmentHubTarget)}
        onClassChange={reportHubClass}
        assignment={assignmentHubTarget ? assignments.find((entry) => entry.id === assignmentHubTarget.assignmentId) || null : null}
        initialClassId={assignmentHubTarget?.classId || null}
        classes={classes}
        students={allStudents}
        presenceById={presenceById}
        classSchedule={classSchedule}
        nowValue={now}
        gradingPeriodSettings={gradingPeriodSettings}
        hasGradeRecords={teacherStudentDataMode === 'full'}
        onLoadClassGrades={loadClassGradeRecords}
        handlers={{
          onToggleWarmup: handleToggleWarmupForClass,
          onToggleSectionAccess: handleToggleSectionAccessForClass,
          onUnlockDOL: handleUnlockDOLForClass,
          onGrantDOLAttempt: handleGrantDOLAttemptForClass,
          onDolControl: handleDolControlForClass,
        }}
        busy={{ warmup: warmupControlBusyKey, section: sectionAccessBusyKey, dolUnlock: dolUnlockBusyKey, dolGrant: dolAttemptGrantBusyKey, dolControl: dolControlBusyKey }}
        onClose={() => setAssignmentHubTarget(null)}
        onOpenGrades={(classId, assignmentId) => openGradebookFor(classId, assignmentId)}
        onOpenStudentWork={(classId, assignmentId, studentId) => openGradebookFor(classId, assignmentId, studentId)}
        onOpenLive={(classContext, assignmentId) => openLiveFor(classContext, assignmentId)}
        onOpenExport={(scope) => openGradeExport(scope)}
        onOpenStudent={(studentId) => { setProfileDrawerStudentId(studentId); }}
        onOpenClass={(classContext) => { setAssignmentHubTarget(null); handleGoToClassFromHome(classContext); }}
        onPreview={(assignment) => { setAssignmentHubTarget(null); startTeacherPreview(assignment.id); }}
        onOpenTestCycleResults={(assignment) => { setAssignmentHubTarget(null); setFocusedTestCycleAssignmentId(assignment.id); setTeacherTab('exams'); }}
        onPrint={(assignment) => { setAssignmentHubTarget(null); beginTeacherWorksheetExport(assignment); }}
        onEditDates={(assignment) => { setAssignmentHubTarget(null); setTeacherTab('assignments'); beginEditAssignmentDates(assignment); }}
        onEditSetup={(assignment) => { setAssignmentHubTarget(null); beginEditAssignmentSetup(assignment); }}
        onEditQuestions={(assignment) => { setAssignmentHubTarget(null); openQuestionEditor(assignment); }}
        teacherEmail={user?.email || ''}
        onRecoveryUpgraded={async (result) => {
          await fetchAssignments();
          if (!result?.alreadyCurrent) toastSuccess('Recovery added', 'No question, student record, grade or Classroom post changed.');
        }}
      />

      {/* After the hub, so a student opened from an assignment's hub stacks
          ON TOP of it (closing the student returns to the assignment). */}
      <StudentProfileDrawer
        open={Boolean(profileDrawerStudent)}
        studentId={profileDrawerStudent?.id || null}
        studentName={profileDrawerStudent ? formatStudentName(profileDrawerStudent) : ''}
        profile={profileDrawerLearningProfile}
        plan={profileDrawerPlan}
        classRecord={profileDrawerStudent ? classesById[profileDrawerStudent.classId] || null : null}
        courseContext={profileDrawerStudent
          ? resolveStudentCourseContext({ student: profileDrawerStudent, classesById, courseProfiles })
          : null}
        supportEvents={profileDrawerStudent ? profileDrawerSupportEvents : []}
        sessionSummaries={profileDrawerStudent ? profileDrawerSessionSummaries : []}
        onClose={() => setProfileDrawerStudentId(null)}
        onOpenFullRecord={(studentId) => {
          setProfileDrawerStudentId(null);
          setTeacherTab('students');
          setPathLaunchTeks(null);
          setGradebookFilter((current) => ({ ...current, student: studentId }));
        }}
        onOpenGradebook={(studentId) => {
          const student = allStudents.find((entry) => entry.id === studentId) || null;
          setProfileDrawerStudentId(null);
          if (student) handleViewClassGradebook(student.classId || student.classPeriod || '', student);
        }}
        studentRecord={profileDrawerStudent}
        assignments={profileDrawerStudent
          ? assignments.filter((assignment) => assignmentIsForStudent(assignment, { classId: profileDrawerStudent.classId || null, classPeriod: profileDrawerStudent.classPeriod || null }))
          : []}
        gradingPeriodSettings={gradingPeriodSettings}
        onOpenAssignment={(assignmentId, classId) => { setProfileDrawerStudentId(null); openAssignmentHub(assignmentId, classId); }}
        onOpenStudentWork={(classId, assignmentId, studentId) => { setProfileDrawerStudentId(null); openGradebookFor(classId, assignmentId, studentId); }}
        teacherEmail={user?.role === 'teacher' ? user.email || '' : ''}
        studentSupportProfile={profileDrawerStudent?.profile || null}
        onSupportProfileSaved={handleSupportProfileSaved}
        onOpenSupportReport={(studentId) => setSupportReportStudentId(studentId)}
        onOpenCaseReview={user?.role === 'teacher' ? (studentId) => setCaseReviewStudentId(studentId) : null}
      />

      {/* Above the drawer it was opened from (closing it returns to the
          student) and below the Support Evidence Report, which it can open. */}
      {(() => {
        const caseStudent = caseReviewStudentId
          ? allStudents.find((entry) => entry.id === caseReviewStudentId) || null
          : null;
        if (!caseStudent) return null;
        return (
          <Suspense fallback={null}>
            <StudentCaseReviewView
              open
              student={caseStudent}
              studentName={formatStudentName(caseStudent)}
              classRecord={classesById[caseStudent.classId] || null}
              assignments={assignments}
              gradingPeriodSettings={gradingPeriodSettings}
              teacherEmail={user?.email || ''}
              teacherUid={user?.uid || ''}
              onClose={() => setCaseReviewStudentId(null)}
              onInspectResponse={(target) => setResponseInspectorTarget(target)}
              onOpenSupportReport={(studentId) => setSupportReportStudentId(studentId)}
            />
          </Suspense>
        );
      })()}

      {(() => {
        const reportStudent = supportReportStudentId
          ? allStudents.find((entry) => entry.id === supportReportStudentId) || null
          : null;
        return (
          <SupportEvidenceReportView
            open={Boolean(reportStudent)}
            student={reportStudent}
            studentName={reportStudent ? formatStudentName(reportStudent) : ''}
            classRecord={reportStudent ? classesById[reportStudent.classId] || null : null}
            assignments={assignments}
            gradingPeriodSettings={gradingPeriodSettings}
            teacherEmail={user?.email || ''}
            onClose={() => setSupportReportStudentId(null)}
          />
        );
      })()}

      <div className="mm-dashboard-shell" style={{ maxWidth: '1360px', margin: '0 auto', background: 'var(--mm-surface)', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'stretch' }}>
        <TeacherSidebar
          activeTab={teacherTab}
          actionCount={teacherActionOpenCount}
          onSelectTab={(tab) => {
            setTeacherTab(tab);
            // The Gradebook inherits the workspace class rather than starting
            // blank. Clearing it here was the last place a tab change threw
            // away the teacher's context and made them choose again.
            setGradebookFilter({
              classId: activeClass.classId || '',
              classPeriod: activeClass.classPeriod || '',
              assignmentId: null,
              student: null,
            });
            // `homeNavigationPeriod` is a one-shot hand-off from Teacher Home
            // and is right to clear. `activeClass` is deliberately NOT cleared:
            // it is the class the teacher is working in, and it has to survive
            // the walk to another tab and back.
            setHomeNavigationPeriod(null);
            setLiveFocus(null);
            setGradebookProgressFilter('all');
            // Grade Export follows the class the teacher is working in, like
            // every other class-first screen; "All classes" is one click away.
            if (tab === 'gradeTransfer') {
              setGradeExportScope(activeClass.classId ? { classIds: [activeClass.classId], assignmentId: null, nonce: Date.now() } : null);
            }
            // Full academic records are loaded by the tab-scoped subscription
            // only on screens that actually need them.
          }}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed((current) => !current)}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
        {/* Wraps on a phone: the title and the Find / workspace / Log Out actions
            used to share one row and the actions ran past the card's edge. */}
        <header style={{ padding: 'clamp(18px, 4vw, 28px) clamp(16px, 4vw, 30px)', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--mm-border-soft)', gap: '14px 20px' }}>
          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            <h1 style={{ margin: 0, color: 'var(--mm-text-strong)', fontSize: 'calc(25 * var(--mm-px))' }}>Instructor Dashboard</h1>
            <p style={{ margin: '5px 0 0', color: 'var(--mm-text-muted)' }}>Assignments, eight class periods, DOL schedules, inclusion supports, and evidence reports</p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {/*
              The shortcut is the point, but a shortcut nobody knows about is
              a feature that does not exist. The button carries its own key
              hint so the palette is discoverable without a tour.
            */}
            <button
              type="button"
              onClick={() => setQuickSearchOpen(true)}
              title="Find a student, class, assignment or TEKS code"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 13px', background: 'var(--mm-surface)', color: 'var(--mm-text)', border: '1px solid var(--mm-border)', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}
            >
              <span aria-hidden="true">🔍</span>
              <span>Find…</span>
              <kbd style={{ padding: '1px 5px', border: '1px solid var(--mm-border)', borderRadius: 4, background: 'var(--mm-surface-sunken)', color: 'var(--mm-text-muted)', fontSize: 'calc(11 * var(--mm-px))', fontFamily: 'inherit' }}>⌘K</kbd>
            </button>
            {rootAdminUiEligible && <div role="group" aria-label="Root administrator workspace" style={{ display: 'inline-flex', padding: 3, borderRadius: 9, background: 'var(--mm-surface-control)', border: '1px solid var(--mm-border)' }}><button type="button" aria-pressed="true" style={{ padding: '6px 10px', border: 0, borderRadius: 6, background: 'var(--mm-primary-soft)', color: 'var(--mm-primary-text)', fontWeight: 900 }}>Teacher View</button><button type="button" aria-pressed="false" onClick={() => setTeacherWorkspaceMode('administration')} style={{ padding: '6px 10px', border: 0, borderRadius: 6, background: 'transparent', color: 'var(--mm-text)', cursor: 'pointer', fontWeight: 900 }}>Administration</button></div>}
            <button onClick={handleLogout} style={{ padding: '8px 16px', background: 'var(--mm-surface)', color: 'var(--mm-danger)', border: '1px solid #d93025', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>Log Out</button>
          </div>
        </header>

        <div className="mm-dashboard-content" style={{ padding: '30px' }}>
          {/*
            CLASS FIRST, THEN FEATURE.
            The bar states one piece of application state that every
            class-scoped view below reads. It is shown only on the tabs where
            a class actually scopes what is on screen — putting it above the
            Math Tools Lab or Student Access would imply a scoping that does
            not exist there, which is worse than not showing it at all.
          */}
          {CLASS_SCOPED_TABS[teacherTab] && (
            <div style={{ marginBottom: 20 }}>
              <ClassContextBar
                classes={classes}
                students={allStudents}
                activeClassId={activeClass.classId}
                onSelectClass={setActiveClass}
                scopeLabel={CLASS_SCOPED_TABS[teacherTab].scopeLabel}
                allowAllClasses={CLASS_SCOPED_TABS[teacherTab].allowAllClasses !== false}
              />
            </div>
          )}

          {teacherTab === 'demo' && <DemoExperience />}

          {teacherTab === 'liveChallenge' && (
            <Suspense fallback={<div style={{ padding: 28 }}>Loading Live Challenge…</div>}>
              <LiveChallengeTeacher
                allStudents={allStudents}
                classes={classes}
                courseProfiles={courseProfiles}
                signedInEmail={user.email}
                assignments={assignments}
                onLinkWarmupChallenge={handleLinkWarmupChallenge}
              />
            </Suspense>
          )}

          {teacherTab === 'weeklyPath' && (
            <WeeklyPathControls
              classes={classes}
              selectedClassId={activeClass.classId || classes[0]?.classId || null}
              goalsByClass={weeklyGoalsByClass}
              // The roster's own profiles, reused rather than rebuilt: the
              // badge in this table and the badge on the Students screen have
              // to be the same badge from the same evidence, or a teacher is
              // being shown two opinions about one child.
              studentsInClass={teacherWeeklyRoster}
              goalsByStudentId={teacherWeeklyGoalsByStudent}
              completionsByStudentId={weeklyPathCompletionsByStudent}
              learningProfilesByStudentId={teacherLearningProfiles}
              progressLoading={weeklyPathProgressLoading}
              progressTruncated={weeklyPathTruncated}
              onChange={handleSaveWeeklyGoal}
              onOpenStudent={setProfileDrawerStudentId}
              saving={weeklyGoalBusy}
              now={now}
            />
          )}

          {teacherTab === 'pacing' && (
            <PacingControls
              classes={classes}
              assignments={assignments}
              courseProfiles={courseProfiles}
              pacingByClass={pacingByClass}
              overrides={skillOverrides}
              onSavePacing={handleSavePacing}
              onSaveOverrides={handleSaveOverrides}
              busy={pacingBusy}
              activeClassId={activeClass.classId}
            />
          )}

          {teacherTab === 'simulator' && (
            <PathSimulator
              assignments={assignments}
              teacherId={user?.id || 'teacher'}
              onCopyText={(text) => {
                // Clipboard access can be blocked; a window the teacher can
                // select from beats silently losing the package.
                const preview = window.open('', '_blank');
                if (preview) { preview.document.write(`<pre>${text.replace(/</g, '&lt;')}</pre>`); preview.document.close(); }
              }}
            />
          )}

          {teacherTab === 'library' && (
            <AssignmentLibrary
              assignments={assignments}
              folderPaths={assignmentFolderPaths}
              onCreateFolder={handleCreateFolder}
              onRenameFolder={handleRenameFolder}
              onDeleteFolder={handleDeleteFolder}
              onMoveAssignment={handleMoveAssignmentToFolder}
              onAssignAssignment={beginAssignLibraryAssignment}
              onNavigateToAssignments={(navigation) => { setLibraryNavigation(navigation); setTeacherTab('assignments'); }}
              nowValue={now}
              classSchedule={classSchedule}
              classes={classes}
            />
          )}
          {teacherTab === 'assignments' && (
            <div>
              {/*
                The builder is a destination, not a header. It used to fill
                the first ~1,700px of this screen, pushing the teacher's own
                assignments out of sight. It stays mounted while folded, so a
                half-written plan survives opening and closing it.
              */}
              <details className="tw-disclosure" open={assignments.length === 0} style={{ marginBottom: 8 }}>
                <summary><span style={{ fontSize: 'calc(18 * var(--mm-px))' }}>Create and Assign</span> <span className="tw-small tw-muted" style={{ fontWeight: 600 }}>build a new lesson with MathMaster, or paste/upload one</span></summary>
                <div className="tw-disclosure__body">
                  <AssignmentIntake
                    onJsonReady={handleAssignmentJsonReady}
                    toastSuccess={toastSuccess}
                    toastError={toastError}
                    toastInfo={toastInfo}
                  />
                </div>
              </details>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px', flexWrap: 'wrap', marginTop: '30px', marginBottom: '14px' }}>
                <h2 style={{ margin: 0 }}>
                  Assignments
                  <span style={{ marginLeft: '10px', fontSize: 'calc(14 * var(--mm-px))', fontWeight: 600, color: 'var(--mm-ink-muted)' }}>
                    {visibleAssignments.length} {assignmentListIsFiltered ? 'shown' : 'total'}
                  </span>
                </h2>
                <SearchField
                  value={assignmentSearch}
                  onChange={setAssignmentSearch}
                  placeholder="Search assignments by title or folder…"
                  label="Search assignments"
                  style={{ flex: '1 1 280px', maxWidth: '420px' }}
                />
              </div>

              {selectedAssignmentIds.size > 0 && (
                <div className="mm-bulkbar">
                  <span className="mm-bulkbar__count">{selectedAssignmentIds.size} selected</span>
                  <span className="mm-bulkbar__spacer" />
                  <button type="button" className="mm-btn mm-btn--sm" disabled={bulkBusy} onClick={() => handleBulkArchive(true)}>Archive</button>
                  <button type="button" className="mm-btn mm-btn--sm" disabled={bulkBusy} onClick={() => handleBulkArchive(false)}>Unarchive</button>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: 'calc(13 * var(--mm-px))', fontWeight: 700 }}>
                    <span className="mm-sr-only">Move selected assignments to folder</span>
                    <select
                      value=""
                      disabled={bulkBusy}
                      onChange={(event) => { handleBulkMoveToFolder(event.target.value); event.target.value = ''; }}
                      style={{ minHeight: '34px', padding: '0 8px', borderRadius: '7px', border: '1px solid rgba(255,255,255,0.45)', background: 'rgba(255,255,255,0.14)', color: '#fff', fontWeight: 700 }}
                    >
                      <option value="" disabled style={{ color: 'var(--mm-text-strong)' }}>Move to folder…</option>
                      <option value="" style={{ color: 'var(--mm-text-strong)' }}>Uncategorized</option>
                      {assignmentFolderPaths.map((path) => <option key={path} value={path} style={{ color: 'var(--mm-text-strong)' }}>{path}</option>)}
                    </select>
                  </label>
                  <button type="button" className="mm-btn mm-btn--sm" disabled={bulkBusy} onClick={clearAssignmentSelection}>Clear</button>
                </div>
              )}

              {visibleAssignments.length > 0 && (
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontSize: 'calc(13 * var(--mm-px))', fontWeight: 700, color: 'var(--mm-ink-muted)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={() => setSelectedAssignmentIds((current) => {
                      const next = new Set(current);
                      if (allVisibleSelected) visibleAssignmentIds.forEach((id) => next.delete(id));
                      else visibleAssignmentIds.forEach((id) => next.add(id));
                      return next;
                    })}
                  />
                  Select all {visibleAssignmentIds.length}{assignmentListIsFiltered ? ' shown' : ' (including folded groups)'}
                </label>
              )}

              {libraryNavigation && (libraryNavigation.folder || libraryNavigation.smartView) && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '10px 14px', marginBottom: '14px', background: 'var(--mm-primary-soft)', border: '1px solid var(--mm-primary-border)', borderRadius: '8px', color: 'var(--mm-primary-text)', fontWeight: 'bold', fontSize: 'calc(13 * var(--mm-px))' }}>
                  <span>Filtered from Library{libraryNavigation.folder ? ` · ${libraryNavigation.folder}` : ''}{libraryNavigation.smartView ? ` · ${SMART_VIEWS.find((view) => view.id === libraryNavigation.smartView)?.label || libraryNavigation.smartView}` : ''}</span>
                  <button type="button" onClick={() => setLibraryNavigation(null)} style={{ padding: '6px 10px', border: '1px solid #1a73e8', borderRadius: '6px', background: 'var(--mm-surface)', color: 'var(--mm-primary)', fontWeight: 'bold', cursor: 'pointer' }}>Clear filter</button>
                </div>
              )}
              {visibleAssignments.length === 0 && (
                <EmptyState
                  icon={assignmentSearch ? '🔍' : '📄'}
                  title={assignmentSearch ? `No assignments match “${assignmentSearch}”` : 'No assignments here yet'}
                  message={assignmentSearch
                    ? 'Try a shorter search, or clear the search to see everything in this view.'
                    : 'Publish one with the form above, or pick a different folder or Smart View in the Library.'}
                  action={assignmentSearch
                    ? <button type="button" className="mm-btn mm-btn--secondary" onClick={() => setAssignmentSearch('')}>Clear search</button>
                    : null}
                />
              )}
              {(() => {
              const renderAssignmentCard = (assignment) => {
                const lifecycle = getAssignmentLifecycle(assignment, now);
                const affectedStudents = teacherStudentDataMode === 'full'
                  ? allStudents.filter((student) => student.gradesByAssignment?.[assignment.id] !== undefined).length
                  : null;
                const isSelected = selectedAssignmentIds.has(assignment.id);
                const canonicalQuestions = getStoredAssignmentQuestions(assignment);
                const includedQuestionIndices = getCurrentContentQuestionIndices(assignment);
                const hasDOL = Boolean(assignment?.dol?.enabled || canonicalQuestions.some((question) => resolveQuestionActivityRole({ question, assignment }) === 'dol'));
                const assignmentType = getStoredAssignmentTypeProjection(assignment);
                const assignmentVariantMode = getStoredAssignmentVariantMode(assignment);
                const hasSectionVersions = Object.keys(getStoredSectionVariantModes(assignment)).length > 0;
                const libraryRepair = inspectLibraryContentRepair(assignment, assignments);
                const contentUpgradeTarget = isLibraryAssignment(assignment)
                  ? null
                  : latestCurrentLibraryRelease(assignments, assignment);
                const hasContentUpgrade = Boolean(
                  contentUpgradeTarget
                  && contentVersionOf(contentUpgradeTarget) > contentVersionOf(assignment)
                );
                // Recovery V2: a static Warm-Up or DOL question that could gain
                // Recovery versions without changing (recognition only; the
                // assignment details run the full check before anything is saved).
                const recoveryCanBeAdded = recoveryPreparationAvailable(assignment);
                return (
                  <article key={assignment.id} data-assignment-card={assignment.id} style={{ scrollMarginTop: '16px', background: 'var(--mm-surface-sunken)', padding: '18px', marginBottom: '12px', borderRadius: '10px', border: `1px solid ${isSelected ? 'var(--mm-primary)' : lifecycle.isLate ? '#f9ab00' : lifecycle.isPracticeOnly ? '#5f6368' : 'var(--mm-border)'}`, boxShadow: isSelected ? '0 0 0 2px var(--mm-primary-soft)' : 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '18px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleAssignmentSelected(assignment.id)}
                        aria-label={`Select ${assignment.title}`}
                        style={{ flex: '0 0 auto', width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                      <div style={{ flex: '1 1 440px', textAlign: 'left' }}>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                          {/* The title opens the assignment's world: its classes,
                              live room, controls, grades and export. */}
                          <button type="button" className="tw-link" style={{ fontSize: 'calc(18 * var(--mm-px))' }} onClick={() => openAssignmentHub(assignment.id)}>{assignment.title}</button>
                          <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: 'calc(11 * var(--mm-px))', fontWeight: 900, background: 'var(--mm-primary-soft)', color: 'var(--mm-primary-text)' }}>{contentVersionLabel(assignment)}</span>
                          {hasContentUpgrade && <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: 'calc(11 * var(--mm-px))', fontWeight: 900, background: 'var(--mm-warning-bg)', color: 'var(--mm-warning-text)' }}>V{contentVersionOf(contentUpgradeTarget)} AVAILABLE</span>}
                          {recoveryCanBeAdded && <button type="button" data-recovery-can-be-added={assignment.id} onClick={() => openAssignmentHub(assignment.id)} title="Open the assignment details to review and approve Recovery versions for its Warm-Up and DOL." style={{ padding: '4px 8px', borderRadius: '999px', fontSize: 'calc(11 * var(--mm-px))', fontWeight: 900, background: 'var(--mm-info-bg)', color: 'var(--mm-info-text)', border: '1px solid var(--mm-info-border)', cursor: 'pointer' }}>RECOVERY CAN BE ADDED</button>}
                          <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: 'calc(11 * var(--mm-px))', fontWeight: 900, background: lifecycle.isPracticeOnly ? 'var(--mm-surface-control)' : lifecycle.isLate ? 'var(--mm-warning-soft)' : 'var(--mm-success-bg)', color: lifecycle.isPracticeOnly ? 'var(--mm-text)' : lifecycle.isLate ? 'var(--mm-warning-text)' : 'var(--mm-success-text)' }}>{lifecycle.isPracticeOnly ? 'PRACTICE ONLY' : lifecycle.status.toUpperCase()}</span>
                          <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: 'calc(11 * var(--mm-px))', fontWeight: 900, background: 'var(--mm-primary-soft)', color: 'var(--mm-primary-text)' }}>{assignmentType === 'notesClasswork' ? 'NOTES / CLASSWORK' : assignmentType.toUpperCase()}</span>
                          {hasSectionVersions ? <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: 'calc(11 * var(--mm-px))', fontWeight: 900, background: 'var(--mm-accent-soft)', color: 'var(--mm-accent-text)' }}>SECTION VERSIONS</span> : assignmentVariantMode === 'shared' && <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: 'calc(11 * var(--mm-px))', fontWeight: 900, background: 'var(--mm-success-bg)', color: 'var(--mm-success-text)' }}>SHARED VERSION</span>}
                          {assignment.archived && <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: 'calc(11 * var(--mm-px))', fontWeight: 900, background: 'var(--mm-surface-control)', color: 'var(--mm-text-muted)' }}>ARCHIVED</span>}
                          {assignment.unpublished && !assignment.archived && <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: 'calc(11 * var(--mm-px))', fontWeight: 900, background: 'var(--mm-warning-bg)', color: 'var(--mm-warning-text)' }}>PAUSED · HIDDEN FROM STUDENTS</span>}
                          {isTestCycleAssignment(assignment) && <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: 'calc(11 * var(--mm-px))', fontWeight: 900, background: 'var(--mm-accent-soft)', color: 'var(--mm-accent-text)' }}>TEST CYCLE</span>}
                          {/* A library item has no audience and no due date. Saying so
                              plainly is the whole point of allowing it to exist. */}
                          {isLibraryAssignment(assignment) && <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: 'calc(11 * var(--mm-px))', fontWeight: 900, background: 'var(--mm-warning-bg)', color: 'var(--mm-warning-text)' }}>NOT ASSIGNED</span>}
                        </div>
                        <div style={{ marginTop: '7px', color: 'var(--mm-text-muted)', fontSize: 'calc(13 * var(--mm-px))', lineHeight: 1.55 }}>{includedQuestionIndices.length} included question{includedQuestionIndices.length === 1 ? '' : 's'}{canonicalQuestions.length !== includedQuestionIndices.length ? ` · ${canonicalQuestions.length - includedQuestionIndices.length} excluded` : ''} · {isLibraryAssignment(assignment) ? 'Not assigned to a class' : `Classes: ${(assignment.assignedClassIds || []).map((classId) => classesById[classId]?.name || classesById[classId]?.period).filter(Boolean).join(', ') || (assignment.assignedClassPeriods || []).join(', ')}`}<br />{isLibraryAssignment(assignment) ? 'No due date yet' : `Due ${formatDueDate(assignment)} · Late close ${formatLateDueDate(assignment)}`} · {affectedStudents === null
                          ? 'progress, grades and live activity in its details'
                          : `${affectedStudents} student record${affectedStudents === 1 ? '' : 's'}`}</div>
                      </div>
                      <AssignmentCardMenu
                        ariaLabel={`More actions for ${assignment.title}`}
                        items={[
                          { key: 'details', label: 'Open assignment details', onClick: () => openAssignmentHub(assignment.id) },
                          ...(!isLibraryAssignment(assignment) && (assignment.assignedClassIds || []).length ? [
                            { key: 'grades', label: 'Grades', onClick: () => openGradebookFor((assignment.assignedClassIds || []).includes(activeClass.classId) ? activeClass.classId : assignment.assignedClassIds[0], assignment.id) },
                            { key: 'export-grades', label: 'Export grades', onClick: () => openGradeExport({ classIds: (assignment.assignedClassIds || []).includes(activeClass.classId) ? [activeClass.classId] : [], assignmentId: assignment.id }) },
                          ] : []),
                          ...(isTestCycleAssignment(assignment) ? [{
                            key: 'test-cycle-results',
                            label: 'Test results, release & retests',
                            onClick: () => { setFocusedTestCycleAssignmentId(assignment.id); setTeacherTab('exams'); },
                          }] : []),
                          { key: 'preview', label: 'View as Student', onClick: () => startTeacherPreview(assignment.id) },
                          { key: 'edit-questions', label: 'Edit Questions', onClick: () => openQuestionEditor(assignment) },
                          { key: 'edit-setup', label: 'Review / Edit Setup', onClick: () => beginEditAssignmentSetup(assignment) },
                          { key: 'export-pdf', label: 'Print / Answer Key', onClick: () => beginTeacherWorksheetExport(assignment) },
                          { key: 'export-json', label: 'Export Assignment', onClick: () => { setExportJsonAssignment(assignment); setExportJsonCopied(false); } },
                          { key: 'dates-classes', label: isLibraryAssignment(assignment) ? 'Assign to Class / Dates' : 'Dates & Classes', onClick: () => beginEditAssignmentDates(assignment) },
                          ...(recoveryCanBeAdded ? [{
                            key: 'prepare-recovery',
                            label: 'Prepare Recovery…',
                            onClick: () => openAssignmentHub(assignment.id),
                          }] : []),
                          ...(hasContentUpgrade ? [{
                            key: 'upgrade-content-version',
                            label: `Upgrade to Content V${contentVersionOf(contentUpgradeTarget)}`,
                            onClick: () => setContentUpgradeRequest({ assignment, targetAssignment: contentUpgradeTarget }),
                          }] : []),
                          ...(!isLibraryAssignment(assignment) ? [{
                            key: 'repair-classroom-post',
                            label: 'Repair / Repost Classroom',
                            onClick: () => handleRepairClassroomAssignmentPost(assignment),
                          }, {
                            key: 'force-classroom-post',
                            label: 'Force New Classroom Post…',
                            onClick: () => {
                              setClassroomManagerAssignmentId(assignment.id);
                              setTeacherTab('classroom');
                            },
                          }] : []),
                          ...(libraryRepair.source && libraryRepair.questionIds.length ? [{
                            key: 'repair-library-content',
                            label: `Repair Corrupted Question${libraryRepair.questionIds.length === 1 ? '' : 's'} from Original`,
                            onClick: () => handleRepairAssignmentFromLibrary(assignment),
                          }] : []),
                          { key: 'move-folder', label: 'Move to Folder', onClick: () => { setMovingFolderAssignmentId(assignment.id); setMovingFolderValue(assignment.folder || ''); } },
                          { key: 'duplicate', label: 'Duplicate', onClick: () => handleDuplicateAssignment(assignment) },
                          ...(!isLibraryAssignment(assignment) && !assignment.archived ? [{
                            key: 'pause',
                            label: assignment.unpublished ? 'Resume for students' : 'Pause (hide from students)',
                            onClick: () => handleTogglePauseAssignment(assignment),
                          }] : []),
                          { key: 'archive', label: assignment.archived ? 'Unarchive' : 'Archive', onClick: () => handleToggleArchiveAssignment(assignment) },
                          { key: 'delete', label: 'Delete', tone: 'danger', onClick: () => openDeleteDialog(assignment) },
                        ]}
                      />
                    </div>
                    {movingFolderAssignmentId === assignment.id && (
                      <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid var(--mm-border)', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'end' }}>
                        <label style={{ fontWeight: 'bold', fontSize: 'calc(13 * var(--mm-px))' }}>Folder
                          <select value={movingFolderValue} onChange={(event) => setMovingFolderValue(event.target.value)} style={{ display: 'block', marginTop: '5px', padding: '9px', border: '1px solid var(--mm-border)', borderRadius: '7px', minWidth: '220px' }}>
                            <option value="">Uncategorized</option>
                            {assignmentFolderPaths.map((path) => <option key={path} value={path}>{path}</option>)}
                          </select>
                        </label>
                        <button onClick={async () => { await handleMoveAssignmentToFolder(assignment.id, movingFolderValue); setMovingFolderAssignmentId(null); }} style={{ padding: '10px 15px', background: '#188038', color: '#fff', border: 0, borderRadius: '7px', fontWeight: 'bold' }}>Save Folder</button>
                        <button onClick={() => setMovingFolderAssignmentId(null)} style={{ padding: '10px 15px', background: 'var(--mm-surface)', border: '1px solid var(--mm-border)', borderRadius: '7px', fontWeight: 'bold' }}>Cancel</button>
                      </div>
                    )}
                    {editingAssignmentId === assignment.id && (
                      <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid var(--mm-border)', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'end' }}>
                        <label style={{ fontWeight: 'bold' }}>Regular due <input type="datetime-local" value={editingAssignmentDates.dueAt} onChange={(event) => setEditingAssignmentDates((current) => ({ ...current, dueAt: event.target.value }))} style={{ display: 'block', padding: '8px', marginTop: '5px' }} /></label>
                        <label style={{ fontWeight: 'bold' }}>Final late due <input type="datetime-local" value={editingAssignmentDates.lateDueAt} onChange={(event) => setEditingAssignmentDates((current) => ({ ...current, lateDueAt: event.target.value }))} style={{ display: 'block', padding: '8px', marginTop: '5px' }} /></label>
                        {hasDOL && <label style={{ fontWeight: 'bold' }}>DOL instructional date <input type="date" value={editingAssignmentDates.dolInstructionDate || ''} onChange={(event) => setEditingAssignmentDates((current) => ({ ...current, dolInstructionDate: event.target.value }))} style={{ display: 'block', padding: '8px', marginTop: '5px' }} /></label>}
                        <div style={{ flex: '1 1 100%', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {classes.filter((entry) => entry?.status !== 'archived' && entry?.classId).map((classRecord) => {
                            const selected = editingAssignmentDates.assignedClassIds?.includes(classRecord.classId);
                            return (
                              <label key={classRecord.classId || classRecord.period} style={{ padding: '5px 8px', borderRadius: '999px', background: selected ? 'var(--mm-primary-soft)' : 'var(--mm-surface)', border: '1px solid var(--mm-tint-border)', fontWeight: 'bold', fontSize: 'calc(12 * var(--mm-px))' }}>
                                <input type="checkbox" checked={Boolean(selected)} onChange={() => setEditingAssignmentDates((current) => {
                                  const ids = current.assignedClassIds?.includes(classRecord.classId)
                                    ? current.assignedClassIds.filter((item) => item !== classRecord.classId)
                                    : [...(current.assignedClassIds || []), classRecord.classId];
                                  const periods = [...new Set(classes.filter((entry) => ids.includes(entry.classId)).map((entry) => entry.period).filter(Boolean))];
                                  return { ...current, assignedClassIds: ids, assignedClassPeriods: periods };
                                })} /> {classRecord.name || classRecord.period}{classRecord.name && classRecord.name !== classRecord.period ? ` · ${classRecord.period}` : ''}
                              </label>
                            );
                          })}
                        </div>
                        <button onClick={() => handleSaveAssignmentDates(assignment.id)} style={{ padding: '10px 15px', background: '#188038', color: '#fff', border: 0, borderRadius: '7px', fontWeight: 'bold' }}>Save Dates</button>
                        <button onClick={() => setEditingAssignmentId(null)} style={{ padding: '10px 15px', background: 'var(--mm-surface)', border: '1px solid var(--mm-border)', borderRadius: '7px', fontWeight: 'bold' }}>Cancel</button>
                      </div>
                    )}
                  </article>
                );
              };
              /*
                CURRENT WORK FIRST (platform/teacher/assignmentListGroups.js).
                This list used to be every assignment ever made, oldest due
                date first. Now: what is open, then what is scheduled; closed
                work folds by marking period and library copies fold last.
                Nothing is hidden — a search or Library filter shows one flat,
                current-first list so a match is never folded away.
              */
              const listGroups = groupAssignmentList({
                assignments: visibleAssignments,
                nowValue: now,
                gradingPeriodSettings,
                flat: assignmentListIsFiltered,
              });
              return listGroups.map((group) => {
                const holdsOpenEditor = group.assignments.some((assignment) => assignment.id === editingAssignmentId || assignment.id === movingFolderAssignmentId);
                if (!group.folded) {
                  return (
                    <section key={group.id} aria-label={group.label} data-assignment-group={group.id} style={{ marginBottom: '8px' }}>
                      {listGroups.length > 1 && (
                        <h3 style={{ margin: '4px 0 10px', fontSize: 'calc(15 * var(--mm-px))', textAlign: 'left' }}>
                          {group.label} <span className="tw-pill">{group.assignments.length}</span>
                          {group.hint && <span className="tw-small tw-muted" style={{ fontWeight: 600, marginLeft: 8 }}>{group.hint}</span>}
                        </h3>
                      )}
                      {group.assignments.map(renderAssignmentCard)}
                    </section>
                  );
                }
                const open = holdsOpenEditor || (assignmentGroupOpen[group.id] ?? false);
                return (
                  <details
                    key={group.id}
                    className="tw-disclosure"
                    data-assignment-group={group.id}
                    open={open}
                    onToggle={(event) => {
                      const next = event.currentTarget.open;
                      if (next !== open) setAssignmentGroupOpen((current) => ({ ...current, [group.id]: next }));
                    }}
                    style={{ marginBottom: '10px' }}
                  >
                    <summary>{group.label} <span className="tw-pill">{group.assignments.length}</span>{group.hint && <span className="tw-small tw-muted" style={{ fontWeight: 600 }}>{group.hint}</span>}</summary>
                    <div className="tw-disclosure__body">{open && group.assignments.map(renderAssignmentCard)}</div>
                  </details>
                );
              });
              })()}
            </div>
          )}

          {teacherTab === 'students' && (
            <StudentsRoster
              // The roster inherits the workspace class instead of carrying
              // its own filter. "All classes" is still available from the bar
              // above, so nothing a teacher could see before is unreachable.
              students={activeClass.classId ? studentsInActiveClass : allStudents}
              classes={classes}
              classPeriods={CLASS_PERIODS}
              courseProfiles={courseProfiles}
              masteryProfilesByStudentId={teacherMasteryProfilesByStudentId}
              assignments={assignments}
              pacingByClass={pacingByClass}
              skillOverrides={skillOverrides}
              onChangeClassPeriod={handleChangeClassPeriod}
              teacherEmail={user?.email || ''}
              onSupportProfileSaved={handleSupportProfileSaved}
              onGenerateIEPReport={openIEPReport}
              isRootAdmin={rootAdminUiEligible}
              onOpenAdministration={() => setTeacherWorkspaceMode('administration')}
              onOpenProfileDrawer={setProfileDrawerStudentId}
              onOpenAssignment={openAssignmentHub}
              onOpenStudentWork={(classId, assignmentId, studentId) => openGradebookFor(classId, assignmentId, studentId)}
              gradingPeriodSettings={gradingPeriodSettings}
            />
          )}

          {teacherTab === 'home' && (
            <TeacherHome
              onLiveClassChange={reportLiveClass}
              allStudents={allStudents}
              studentIdentityIndex={teacherStudentIdentityIndex}
              assignments={assignments}
              classSchedule={classSchedule}
              nowValue={now}
              presenceById={presenceById}
              onSelectPeriod={handleGoToClassFromHome}
              needsAttention={needsAttentionQueue}
              needsAttentionCompletionCoverage={Boolean(activeClass.classId) && weeklyPathProgressLoadedFor === activeClass.classId}
              needsAttentionAcademicCoverage={teacherStudentDataMode === 'full'}
              learningProfilesByStudentId={teacherLearningProfiles}
              activeClassId={activeClass.classId}
              classes={classes}
              teacherUid={auth.session?.uid || user.uid || ''}
              teacherEmail={user.email || ''}
              teacherLabel={user.displayName || user.name || user.email || 'Your teacher'}
              isRootAdmin={user.isRootAdmin === true}
              studentSupportEvents={studentSupportEvents}
              studentSessionSummaries={studentSessionSummaries}
              onRecordStudentSupportEvent={handleRecordStudentSupportEvent}
              onRecommendPersonalPath={handlePersonalPathRecommendation}
              pathInterventionBusyStudentId={pathInterventionBusyStudentId}
              onOpenWeeklyPath={() => setTeacherTab('weeklyPath')}
              onOpenAdministration={() => setTeacherWorkspaceMode('administration')}
              onUnlockDOL={handleUnlockDOLForClass}
              dolUnlockBusyKey={dolUnlockBusyKey}
              onGrantDOLAttempt={handleGrantDOLAttemptForClass}
              dolAttemptGrantBusyKey={dolAttemptGrantBusyKey}
              onToggleWarmup={handleToggleWarmupForClass}
              warmupControlBusyKey={warmupControlBusyKey}
              onToggleSectionAccess={handleToggleSectionAccessForClass}
              sectionAccessBusyKey={sectionAccessBusyKey}
              // Opening a name is a question, not a navigation. It used to
              // throw the teacher into the Gradebook, losing whatever they
              // were doing on Home.
              onOpenStudent={setProfileDrawerStudentId}
              gradingPeriodSettings={gradingPeriodSettings}
              liveTeachingSession={liveTeachingSession}
              onTeachAssignment={teachAssignmentLive}
              onResumeTeaching={resumeLiveTeaching}
              onEndLiveTeaching={endLiveTeaching}
              onDolControl={handleDolControlForClass}
              dolControlBusyKey={dolControlBusyKey}
              onOpenAssignment={openAssignmentHub}
              onSelectClass={(classContext) => { setLiveFocus(null); setActiveClass(classContext); }}
              liveFocus={liveFocus}
            />
          )}

          {teacherTab === 'attendanceHistory' && (
            <AttendanceHistoryPanel
              onClassChange={reportAttendanceClass}
              db={db}
              classes={classes}
              allStudents={allStudents}
              assignments={assignments}
              classSchedule={classSchedule}
              nonInstructionalKeys={SCHOOL_NON_INSTRUCTIONAL_KEYS}
              teacherEmail={user.email || ''}
              nowValue={now}
              onRecordCorrection={handleRecordStudentSupportEvent}
              recentSupportEvents={studentSupportEvents}
              reviewBusyKey={attendanceReviewBusyKey}
              onKeepExtension={handleKeepAttendanceExtension}
              onApplyShorterExtension={handleApplyShorterAttendanceExtension}
              initialClassId={activeClass.classId}
            />
          )}

          {teacherTab === 'actionCenter' && (
            <TeacherActionCenter
              projectedItems={teacherActionItems}
              students={allStudents}
              classes={classes}
              assignments={assignments}
              supportEvents={studentSupportEvents}
              parentContacts={parentContacts}
              gradeTransferUnits={actionGradeScope.units}
              retestRecoveryActions={retestRecoveryActions}
              classSchedule={classSchedule}
              nonInstructionalKeys={SCHOOL_NON_INSTRUCTIONAL_KEYS}
              nowValue={now}
              onResolveReturnCheckIn={(candidate) => candidate && handleRecordStudentSupportEvent(buildReturnCheckInEvent({ candidate, actorEmail: user.email }))}
              onOpenWorkflow={(item) => {
                if (item.sourceType === 'studentSupportEvent') setParentContactSourceAction(item);
                // A grade-export row opens Grade Export on exactly that class
                // and assignment rather than the full list of every export.
                if (item.sourceType === 'gradeTransfer') {
                  openGradeExport({ classIds: item.classId ? [item.classId] : [], assignmentId: item.assignmentId || null });
                  return;
                }
                setTeacherTab(item.sourceType === 'returnCheckIn' ? 'attendanceHistory' : item.sourceType === 'testCycle' ? 'exams' : 'parentContacts');
              }}
            />
          )}

          {teacherTab === 'parentContacts' && (
            <ParentContactCenter
              students={allStudents}
              classes={classes}
              assignments={assignments}
              contacts={parentContacts}
              supportEvents={studentSupportEvents}
              sessionSummaries={studentSessionSummaries}
              masteryProfilesByStudentId={teacherMasteryProfilesByStudentId}
              classSchedule={classSchedule}
              nonInstructionalKeys={SCHOOL_NON_INSTRUCTIONAL_KEYS}
              nowValue={now}
              sourceAction={parentContactSourceAction}
              onRecordContact={async (contact) => {
                const recorded = await recordParentContact({ db, teacherEmail: user.email, contact });
                if (contact.sourceEventId) {
                  await handleRecordStudentSupportEvent({
                    kind: SUPPORT_EVENT_KIND.RESOLVED, stage: SUPPORT_EVENT_STAGE.RESOLVED,
                    studentId: contact.studentId, studentName: contact.studentName,
                    classId: contact.classId, classPeriod: contact.classPeriod,
                    sourceEventId: contact.sourceEventId, resolvesEventId: contact.sourceEventId,
                    summary: 'Parent follow-up completed by recorded parent contact.',
                  });
                  setParentContactSourceAction(null);
                }
                return recorded;
              }}
              onCompleteFollowUp={(contact) => recordParentContactResolution({ db, teacherEmail: user.email, contact })}
              onExportContacts={() => fetchAllParentContactsForExport({ db, teacherEmail: user.email })}
            />
          )}

          {teacherTab === 'classesWorkspace' && (
            <ClassesWorkspace
              classes={classes}
              allStudents={allStudents}
              assignments={assignments}
              classSchedule={classSchedule}
              nowValue={now}
              presenceById={presenceById}
              onViewGradebook={handleViewClassGradebook}
              onUnlockDOL={handleUnlockDOLForClass}
              dolUnlockBusyKey={dolUnlockBusyKey}
              onGrantDOLAttempt={handleGrantDOLAttemptForClass}
              dolAttemptGrantBusyKey={dolAttemptGrantBusyKey}
              onToggleWarmup={handleToggleWarmupForClass}
              warmupControlBusyKey={warmupControlBusyKey}
              onToggleSectionAccess={handleToggleSectionAccessForClass}
              sectionAccessBusyKey={sectionAccessBusyKey}
              onDolControl={handleDolControlForClass}
              dolControlBusyKey={dolControlBusyKey}
              onOpenAssignment={openAssignmentHub}
              onOpenLive={(classContext) => openLiveFor(classContext, null)}
              onOpenExport={(classId) => openGradeExport({ classIds: [classId] })}
              gradingPeriodSettings={gradingPeriodSettings}
              initialPeriod={homeNavigationPeriod}
              initialClassId={activeClass.classId}
              onSelectClass={setActiveClass}
              learningProfilesByStudentId={teacherLearningProfiles}
              masteryProfilesByStudentId={teacherMasteryProfilesByStudentId}
              needsAttentionCount={needsAttentionQueue.length}
              onOpenStudent={setProfileDrawerStudentId}
              evidenceByStudentId={classEvidenceByStudentId}
              onLoadDeliveredRigor={handleLoadDeliveredRigor}
              rigorLoading={classEvidenceLoading}
              academicDataLoaded={teacherStudentDataMode === 'full'}
            />
          )}

          {/* CLASS REWARDS: what students can spend Class Points on besides a
              Practice Pass — the teacher's own non-academic list — and the
              requests waiting to be handed out. */}
          {teacherTab === 'classesWorkspace' && activeClass.classId && (
            <section aria-label="Class rewards" style={{ marginTop: 24, display: 'grid', gap: 16 }}>
              <ClassRewardRequestsPanel
                classId={activeClass.classId}
                teacherEmail={user.email}
                studentNames={Object.fromEntries(
                  studentsInClass({ students: allStudents, classes, classId: activeClass.classId })
                    .map((student) => [student.id, formatStudentName(student)]),
                )}
                nowMs={now}
              />
              <ClassRewardCatalogEditor
                classId={activeClass.classId}
                ownerUid={user.uid}
                className={classes.find((entry) => entry.classId === activeClass.classId)?.name}
              />
            </section>
          )}

          {teacherTab === 'classes' && (
            <div>
              <h2 style={{ marginTop: 0 }}>Class & Bell Schedule Settings</h2>
              <ClassCourseSettings classPeriods={CLASS_PERIODS} courseProfiles={courseProfiles} assignments={assignments} onChange={handleUpdateCourseProfile} onSave={handleSaveCourseProfiles} saving={courseProfilesSaving} />
              <ClassScheduleSettings
                classPeriods={CLASS_PERIODS}
                schedule={classSchedule}
                onChange={setClassSchedule}
                onSave={handleSaveClassSchedule}
                nowValue={now}
              />
            </div>
          )}

          {teacherTab === 'grades' && (
            <div>
              <h2 style={{ marginTop: 0 }}>Gradebook and Evidence</h2>

              {classes.length > 0 && !gradebookFilter.classId && !gradebookFilter.student && (
                <GradebookClassChooser classes={classes} schedule={classSchedule} nowValue={now} onChoose={setActiveClass} />
              )}

              {/*
                THE ASSIGNMENT FIRST. The grades used to sit behind a "Select
                assignment" dropdown below the marking-period settings and the
                weekly Path panel. The bar picks the most relevant current
                assignment, and its summary is also the table's filter.
              */}
              <GradebookAssignmentBar
                assignments={assignmentsForSelectedClass}
                selectedAssignmentId={gradebookFilter.assignmentId}
                onSelectAssignment={(assignmentId) => {
                  setGradebookProgressFilter('all');
                  setGradebookFilter((current) => ({ ...current, assignmentId: assignmentId || null, student: null }));
                }}
                gradingPeriodSettings={gradingPeriodSettings}
                nowValue={now}
                disabled={!selectedGradebookPeriod}
                autoSelect={!gradebookFilter.student}
                progress={gradebookProgress}
                progressFilter={gradebookProgressFilter}
                onProgressFilter={setGradebookProgressFilter}
                classLabel={selectedGradebookClass?.name || selectedGradebookPeriod}
                onOpenAssignment={(assignmentId) => openAssignmentHub(assignmentId, gradebookFilter.classId || null)}
                onOpenLive={(assignmentId) => openLiveFor({ classId: gradebookFilter.classId || null, classPeriod: selectedGradebookPeriod || null }, assignmentId)}
                onOpenExport={(assignmentId) => openGradeExport({ classIds: gradebookFilter.classId ? [gradebookFilter.classId] : [], assignmentId })}
              />
              {(!classes.length || gradebookFilter.student) && (
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
                {/*
                  The class dropdown that stood here is gone; the class bar
                  above the page owns that choice now. The legacy period
                  picker survives only for a school with no class records at
                  all, which has no classes for the bar to offer.
                */}
                {!classes.length && (
                  <select
                    value={gradebookFilter.classPeriod}
                    onChange={(event) => setGradebookFilter({
                      classId: '', classPeriod: event.target.value, assignmentId: null, student: null,
                    })}
                    style={{ padding: '9px', minWidth: '220px' }}
                  >
                    <option value="">Select class period</option>
                    {CLASS_PERIODS.map((period) => <option key={period} value={period}>{period}</option>)}
                  </select>
                )}
                {gradebookFilter.student && <button onClick={() => setGradebookFilter((current) => ({ ...current, student: null }))} style={{ padding: '9px 14px' }}>Back to class list</button>}
              </div>
              )}

              {selectedAssignment && assignmentUsesTeacherReleasePolicy(selectedAssignment) && (
                <section style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginBottom: '20px', padding: '15px 17px', borderRadius: '9px', background: assignmentFeedbackWasReleased(selectedAssignment) ? 'var(--mm-success-bg)' : 'var(--mm-primary-subtle)', border: `1px solid ${assignmentFeedbackWasReleased(selectedAssignment) ? 'var(--mm-success-border)' : 'var(--mm-primary-border)'}`, textAlign: 'left' }}>
                  <div>
                    <strong style={{ color: assignmentFeedbackWasReleased(selectedAssignment) ? 'var(--mm-success-text)' : 'var(--mm-primary-text)' }}>{assignmentFeedbackWasReleased(selectedAssignment) ? 'Assessment feedback released' : 'Assessment feedback is held'}</strong>
                    <div style={{ marginTop: '4px', color: 'var(--mm-text-muted)', fontSize: 'calc(13 * var(--mm-px))' }}>{assignmentFeedbackWasReleased(selectedAssignment) ? `Students can now see correctness and grades.${selectedAssignment.feedbackReleasedAt ? ` Released ${formatTimeStamp(selectedAssignment.feedbackReleasedAt)}.` : ''}` : 'You can review scores here; students see only a neutral submitted state until you release feedback.'}</div>
                  </div>
                  {!assignmentFeedbackWasReleased(selectedAssignment) && (
                    <button type="button" disabled={feedbackReleaseBusyId === selectedAssignment.id} onClick={() => handleReleaseAssignmentFeedback(selectedAssignment)} style={{ padding: '9px 14px', border: 0, borderRadius: '7px', background: feedbackReleaseBusyId === selectedAssignment.id ? '#dadce0' : '#174ea6', color: '#fff', fontWeight: 900, cursor: feedbackReleaseBusyId === selectedAssignment.id ? 'wait' : 'pointer' }}>
                      {feedbackReleaseBusyId === selectedAssignment.id ? 'Releasing…' : 'Release Feedback to Students'}
                    </button>
                  )}
                </section>
              )}

              {/*
                "The teacher should never have to guess whether two students'
                scores came from identical rigor." On an adaptive assignment
                two students can both score 80% having answered genuinely
                different questions. That is the point of adaptation, and it
                makes the two scores incomparable in a way nothing on this
                screen previously admitted. Read from delivered evidence, not
                from the assignment's declared mode.
              */}
              {selectedAssignment && !gradebookFilter.student && (
                <div style={{ marginBottom: 16, padding: '11px 14px', borderRadius: 9, border: '1px solid var(--mm-border)', background: gradebookRigor.state === COMPARABILITY.VARIED ? 'var(--mm-accent-subtle)' : 'var(--mm-surface-sunken)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ padding: '3px 8px', borderRadius: 999, fontSize: 'calc(11 * var(--mm-px))', fontWeight: 900, background: gradebookRigor.state === COMPARABILITY.VARIED ? 'var(--mm-accent-soft)' : gradebookRigor.state === COMPARABILITY.IDENTICAL ? 'var(--mm-success-bg)' : 'var(--mm-surface-control)', color: gradebookRigor.state === COMPARABILITY.VARIED ? 'var(--mm-accent-text)' : gradebookRigor.state === COMPARABILITY.IDENTICAL ? 'var(--mm-success-text)' : 'var(--mm-text-muted)' }}>
                    {gradebookRigor.state === COMPARABILITY.VARIED ? 'RIGOR VARIED' : gradebookRigor.state === COMPARABILITY.IDENTICAL ? 'SAME RIGOR' : 'RIGOR UNKNOWN'}
                  </span>
                  <span style={{ flex: 1, minWidth: 220, color: 'var(--mm-text)', fontSize: 'calc(12.5 * var(--mm-px))', lineHeight: 1.45 }}>{gradebookRigor.note}</span>
                  {gradebookRigor.state === COMPARABILITY.UNKNOWN && (
                    <button
                      type="button"
                      onClick={() => handleLoadDeliveredRigor(selectedClassStudents.map((student) => student.id))}
                      disabled={classEvidenceLoading}
                      style={{ padding: '7px 12px', border: '1px solid var(--mm-border)', borderRadius: 8, background: 'var(--mm-surface)', color: 'var(--mm-primary-text)', fontWeight: 800, fontSize: 'calc(12.5 * var(--mm-px))', cursor: classEvidenceLoading ? 'wait' : 'pointer' }}
                    >
                      {classEvidenceLoading ? 'Reading delivery history…' : 'Check delivered rigor'}
                    </button>
                  )}
                </div>
              )}

              {selectedGradebookPeriod && selectedAssignment && !gradebookFilter.student && (
                <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}><thead><tr style={{ background: 'var(--mm-surface-sunken)' }}><th style={{ padding: '12px' }}>Student</th><th>Overall</th><th>Warm-Up</th><th>Classwork</th><th>Practice</th><th>DOL</th><th>Instructional condition</th><th>Activity</th><th></th></tr></thead><tbody>{gradebookVisibleStudents.map((student) => { const grades = projectedAssignmentTrackerFor({ student, assignment: selectedAssignment }) || undefined; const assignmentOverride = assignmentGradeOverrideFor(student, selectedAssignment.id); const practicePassRedeemed = gradebookHasPracticePass(student, selectedAssignment); const supportProfile = student.profile || null; const testCycleRow = isTestCycleAssignment(selectedAssignment); /* A Test Cycle's grade is its RECORDED grade (released Test, capped retest), not its Review tracker. */ const score = testCycleRow ? canonicalPresentedAssignmentGrade({ student, assignment: selectedAssignment }) : assignmentOverride ? assignmentOverride.score : grades ? calculateGrade(grades, selectedAssignment, { practicePassRedeemed, supportProfile }) : null; const sectionGrades = splitGradesBySection({ tracker: grades, assignment: selectedAssignment, practicePassRedeemed, supportProfile }); const recoveredSections = completedRecoverySections(student, selectedAssignment.id); const heldSections = heldRecoverySections(student, selectedAssignment.id); const challengeWarmup = warmupChallengeCounts(student, selectedAssignment.id); const recoveredMark = (section) => (<>{section === 'warmup' && challengeWarmup ? <span data-warmup-challenge-mark="true" title="The Warm-Up grade is this student's Live Challenge result. Open Details for the rounds." style={{ marginLeft: 4, padding: '1px 5px', borderRadius: 999, background: 'var(--mm-info-bg)', color: 'var(--mm-info-text)', fontSize: 'calc(10 * var(--mm-px))', fontWeight: 900 }}>LC</span> : null}{recoveredSections.has(section) ? <span data-recovered-section={section} title="Includes a completed Practice-based Recovery. Open Details for Original, Recovery and Final." style={{ marginLeft: 4, padding: '1px 5px', borderRadius: 999, background: 'var(--mm-info-bg)', color: 'var(--mm-info-text)', fontSize: 'calc(10 * var(--mm-px))', fontWeight: 900 }}>R</span> : null}{heldSections.has(section) ? <span data-held-recovery-section={section} title="A Practice-based Recovery is held for you: MathMaster could not grade one or more of its questions. The original shows until you resolve it in Details; Classroom and Grade Transfer wait." style={{ marginLeft: 4, padding: '1px 5px', borderRadius: 999, background: 'var(--mm-warning-soft)', color: 'var(--mm-warning-text)', fontSize: 'calc(10 * var(--mm-px))', fontWeight: 900 }}>Held</span> : null}</>); const gradeSplit = splitGrade({ tracker: grades, assignment: selectedAssignment, practicePassRedeemed, supportProfile }); const gradeExplanation = grades ? explainGrade(gradeSplit) : null; const usage = student.supportUsageByAssignment?.[selectedAssignment.id] || {}; const modified = Boolean(usage.modified || usage.modifications?.length); const activity = student.assignmentActivity?.[selectedAssignment.id] || {}; return <tr key={student.id} style={{ borderBottom: '1px solid var(--mm-border-soft)' }}><td style={{ padding: '12px' }}><StudentNameLink studentId={student.id} studentName={formatStudentName(student)} showMissingId={false} profile={teacherLearningProfiles[student.id]} onOpen={setProfileDrawerStudentId} showBadge /><div style={{ marginTop: 3, color: 'var(--mm-text-muted)', fontSize: 'calc(11 * var(--mm-px))' }}>ID {student.id}</div></td><td><strong style={{ color: modified ? 'var(--mm-accent-text)' : score >= 70 ? 'var(--mm-success)' : 'var(--mm-text-strong)' }}>{score === null ? '—' : `${score}%`}</strong>{modified && <span title={`Accommodations: ${(usage.accommodations || []).join(', ') || 'none'}; Modifications: ${(usage.modifications || []).join(', ') || 'none'}`} style={{ marginLeft: '7px', padding: '3px 6px', borderRadius: '999px', background: 'var(--mm-accent-soft)', color: 'var(--mm-accent-text)', fontWeight: 900, fontSize: 'calc(11 * var(--mm-px))' }}>MOD</span>}
                  {/*
                    COMPLETION AND PERFORMANCE, VISUALLY APART.
                    The grade above is unchanged. These two lines are what a
                    teacher previously reconstructed by clicking into each
                    student one at a time: how much was attempted, and how they
                    did on what they attempted. A grey completion chip is
                    deliberately NOT red — a student who missed a week has not
                    failed mathematics.
                  */}
                  {gradeSplit.shape !== 'complete' && (
                    <div style={{ marginTop: 5, display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ padding: '2px 7px', borderRadius: 999, background: 'var(--mm-surface-control)', color: 'var(--mm-text)', fontSize: 'calc(10.5 * var(--mm-px))', fontWeight: 900 }}>
                        {gradeSplit.attempted}/{gradeSplit.total} ANSWERED
                      </span>
                      {gradeSplit.creditOnAttempted !== null && (
                        <span style={{ padding: '2px 7px', borderRadius: 999, background: 'var(--mm-primary-soft)', color: 'var(--mm-primary-text)', fontSize: 'calc(10.5 * var(--mm-px))', fontWeight: 900 }}>
                          {gradeSplit.creditOnAttempted}% ON THOSE
                        </span>
                      )}
                    </div>
                  )}
                  {gradeExplanation && <div style={{ marginTop: 4, fontSize: 'calc(11 * var(--mm-px))', color: 'var(--mm-text-muted)', lineHeight: 1.4, maxWidth: 280 }}>{gradeExplanation}</div>}</td><td style={{ fontSize: 'calc(12 * var(--mm-px))', fontWeight: 800 }}>{sectionGrades.warmup.attempted ? `${sectionGrades.warmup.score}%` : '—'}{recoveredMark('warmup')}</td><td style={{ fontSize: 'calc(12 * var(--mm-px))', fontWeight: 800 }}>{sectionGrades.classwork.attempted ? `${sectionGrades.classwork.score}%` : '—'}</td><td style={{ fontSize: 'calc(12 * var(--mm-px))', fontWeight: 800 }}>{sectionGrades.practice?.excused ? <span title="The student used a Practice Pass: Practice is excused — not scored and not required." style={{ color: 'var(--mm-accent-text)' }}>Excused (Pass)</span> : sectionGrades.practice.attempted ? `${sectionGrades.practice.score}%` : '—'}</td><td style={{ fontSize: 'calc(12 * var(--mm-px))', fontWeight: 800 }}>{sectionGrades.dol.attempted ? `${sectionGrades.dol.score}%` : '—'}{recoveredMark('dol')}</td><td style={{ fontSize: 'calc(12 * var(--mm-px))' }}>{modified ? `Modified: ${(usage.modifications || []).join(', ')}` : (usage.accommodations || []).length ? `Accommodated: ${usage.accommodations.join(', ')}` : 'Standard'}</td><td style={{ fontSize: 'calc(12 * var(--mm-px))', lineHeight: 1.45 }}>{activity.totalTimeSeconds ? <>Total {formatTime(activity.totalTimeSeconds)}<br />On time {formatTime(activity.onTimeSeconds || 0)} · Late {formatTime(activity.lateSeconds || 0)}</> : 'Time not recorded'}<br />Last on-time: {formatTimeStamp(activity.lastActiveBeforeDue)}<br />Last late: {formatTimeStamp(activity.lastActiveLate)}</td><td><button onClick={() => setGradebookFilter((current) => ({ ...current, student }))} style={{ padding: '8px 12px', border: 0, borderRadius: '6px', background: '#1a73e8', color: '#fff', fontWeight: 'bold' }}>Details</button></td></tr>; })}</tbody></table></div>
              )}

              {gradebookFilter.student && selectedAssignment && (() => { const student = allStudents.find((entry) => entry.id === gradebookFilter.student.id) || gradebookFilter.student; const studentGrades = projectedAssignmentTrackerFor({ student, assignment: selectedAssignment }) || {}; const assignmentOverride = assignmentGradeOverrideFor(student, selectedAssignment.id); const drillRequired = studentRequiredQuestions({ assignment: selectedAssignment, profile: student.profile || null, tracker: student.gradesByAssignment?.[selectedAssignment.id] || null }); const drillOmitted = new Set(drillRequired.omitted); const displayedAssignmentScore = assignmentOverride ? assignmentOverride.score : Object.keys(studentGrades).length ? calculateGrade(studentGrades, selectedAssignment, { supportProfile: student.profile || null }) : null; const usage = student.supportUsageByAssignment?.[selectedAssignment.id] || {}; const activity = student.assignmentActivity?.[selectedAssignment.id] || {}; return <div><div style={{ display: 'flex', justifyContent: 'space-between', gap: '15px', flexWrap: 'wrap', alignItems: 'center', padding: '16px', marginBottom: '18px', background: usage.modified ? 'var(--mm-accent-soft)' : 'var(--mm-primary-soft)', borderRadius: '10px' }}><div><h3 style={{ margin: 0 }}>{formatStudentName(student)} · {selectedAssignment.title}</h3><div style={{ marginTop: 6 }}><StudentPerformanceBadge profile={teacherLearningProfiles[student.id]} size="small" studentName={formatStudentName(student)} /></div><div style={{ marginTop: 3, color: 'var(--mm-text-muted)', fontSize: 'calc(12 * var(--mm-px))' }}>Student ID {student.id}</div><div style={{ marginTop: '5px' }}>Score: <strong>{displayedAssignmentScore === null ? '—' : `${displayedAssignmentScore}%`}</strong> {usage.modified && <span style={{ marginLeft: '7px', padding: '3px 7px', borderRadius: '999px', background: '#6f2da8', color: '#fff', fontWeight: 900 }}>MOD</span>}</div><div style={{ marginTop: '5px', fontSize: 'calc(13 * var(--mm-px))' }}>{activity.totalTimeSeconds ? `Total engagement ${formatTime(activity.totalTimeSeconds)} · Late engagement ${formatTime(activity.lateSeconds || 0)}` : 'Engagement time not recorded (see the support evidence report for server-timed minutes)'}</div><AssignmentGradeOverrideControls student={student} assignment={selectedAssignment} onChanged={() => setGradebookFilter((current) => ({ ...current, student: null }))} /><SectionRecoveryAuditTrail student={student} assignment={selectedAssignment} />{selectedAssignment?.dol?.enabled && <StudentDolRecoveryRow db={db} assignment={selectedAssignment} student={student} classId={student.classId || activeClass?.classId || null} viewer={{ email: user.email, isRootAdmin: user.isRootAdmin === true }} busy={dolAttemptGrantBusyKey === `${selectedAssignment.id}:students:${student.id}`} onGrant={() => handleGrantDOLAttemptForStudents(selectedAssignment, [student])} />}{(() => { const delivered = describeDeliveredRigor(classEvidenceByStudentId[student.id] || [], selectedAssignment.id); if (!delivered) return null; return <div style={{ marginTop: 8, padding: '9px 11px', borderRadius: 8, background: 'var(--mm-surface)', border: '1px solid var(--mm-border)' }}><div style={{ fontSize: 'calc(11 * var(--mm-px))', fontWeight: 900, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--mm-text-muted)' }}>What this student was given</div><div style={{ marginTop: 3, fontSize: 'calc(12.5 * var(--mm-px))', color: 'var(--mm-text-strong)' }}>{delivered.summary}</div>{delivered.reasons.map((reason) => <div key={reason} style={{ marginTop: 4, fontSize: 'calc(12 * var(--mm-px))', color: 'var(--mm-text-muted)', lineHeight: 1.45 }}>{reason}</div>)}</div>; })()}</div><button onClick={() => openIEPReport(student)} style={{ padding: '10px 15px', border: '1px solid #6f2da8', borderRadius: '7px', background: 'var(--mm-surface)', color: 'var(--mm-accent-text)', fontWeight: 900 }}>Support evidence report</button></div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))', gap: '14px' }}>{drillRequired.workload?.status === 'applied' && <div data-reduced-workload-summary style={{ gridColumn: '1 / -1', padding: '9px 11px', borderRadius: 8, background: 'var(--mm-info-bg)', color: 'var(--mm-info-text)', fontSize: 'calc(12.5 * var(--mm-px))', fontWeight: 700 }}>Fewer items, same rigor: {describeWorkloadSummary(drillRequired.workload)}</div>}{getStoredAssignmentQuestions(selectedAssignment).map((question, index) => { if (!questionIsIncluded(question)) return null; if (drillOmitted.has(index)) return <article key={index} data-not-required-question={index} style={{ padding: '16px', borderRadius: '9px', background: 'var(--mm-surface)', border: '1px dashed var(--mm-border)', textAlign: 'left', color: 'var(--mm-text-muted)' }}><strong>Question {index + 1} · {question.type}</strong><div style={{ margin: '8px 0', fontSize: 'calc(15 * var(--mm-px))', fontWeight: 800 }}>Not required for this student</div><div style={{ fontSize: 'calc(12 * var(--mm-px))' }}>Fewer items, same rigor — not counted in the score.</div></article>; const record = normalizeQuestionRecord(studentGrades[index]); const credit = Math.round(getQuestionCredit(record) * 100); return <article key={index} style={{ padding: '16px', borderRadius: '9px', background: record.status === 'correct' ? 'var(--mm-success-bg)' : record.status === 'expired' && credit < 50 ? 'var(--mm-error-bg)' : credit >= 50 ? 'var(--mm-warning-soft)' : 'var(--mm-surface-control)', border: '1px solid rgba(0,0,0,.12)', textAlign: 'left' }}><strong>Question {index + 1} · {question.type} · Grade ×{normalizeQuestionWeight(question)}</strong><div style={{ margin: '8px 0', fontSize: 'calc(20 * var(--mm-px))', fontWeight: 900 }}>{record.teacherGradeOverrideDisplay?.active ? (credit >= 100 ? 'Teacher assigned · Correct ✓' : `Teacher assigned · ${credit}%`) : record.status === 'correct' ? 'Correct ✓' : record.status === 'expired' ? credit >= 50 ? `Almost · ${credit}%` : `Incorrect · ${credit}%` : `${credit}% credit`}</div><div style={{ fontSize: 'calc(12 * var(--mm-px))' }}>Attempts: {record.totalAttempts} · Time: {formatTime(record.timeSpent || 0)}</div>{record.partGrades?.length > 0 && <div style={{ marginTop: '10px' }}>{record.partGrades.map((part) => <div key={part.id} style={{ fontSize: 'calc(12 * var(--mm-px))', color: part.isCorrect ? 'var(--mm-success-text)' : 'var(--mm-error-text)' }}>{part.isCorrect ? '✓' : '●'} {part.label}</div>)}</div>}<button type="button" onClick={() => openTeacherScratchpad(student.id, selectedAssignment.id, index)} style={{ marginTop: '12px', padding: '8px 11px', border: '1px solid var(--mm-border-strong)', borderRadius: '6px', background: 'var(--mm-surface)', color: 'var(--mm-primary-text)', fontWeight: 'bold' }}>View Student Work</button>{studentGrades[index] && <button type="button" onClick={() => setResponseInspectorTarget({ studentId: student.id, assignmentId: selectedAssignment.id, questionIndex: index })} style={{ marginTop: '8px', marginLeft: '8px', padding: '8px 11px', border: '1px solid #1a73e8', borderRadius: '6px', background: 'var(--mm-primary-soft)', color: 'var(--mm-primary-text)', fontWeight: 'bold' }}>Inspect Response / Override Grade</button>}</article>; })}</div></div>; })()}

              {/*
                Settings and the separate weekly Path grade stay one click
                away instead of standing between the teacher and the grades.
              */}
              {activeClass.classId && (
                <details className="tw-disclosure" style={{ marginTop: 22 }}>
                  <summary>Weekly learning path grade <span className="tw-small tw-muted" style={{ fontWeight: 600 }}>a separate grade for this week&apos;s Path practice</span></summary>
                  <div className="tw-disclosure__body">
                    <WeeklyPathGradePanel
                      students={teacherWeeklyRoster}
                      goalsByStudentId={teacherWeeklyGoalsByStudent}
                      completionsByStudentId={weeklyPathCompletionsByStudent}
                      learningProfilesByStudentId={teacherLearningProfiles}
                      weekKey={weeklyPathWeekKey}
                      classId={activeClass.classId}
                      classroomLinked={Boolean(classesById[activeClass.classId]?.classroomCourseId)}
                      progressTruncated={weeklyPathTruncated}
                      weekComplete={weeklyPathWeekComplete}
                      onOpenStudent={setProfileDrawerStudentId}
                      onReviewClassroomSync={(proposal) => setClassroomSyncProposal(proposal)}
                      now={now}
                      progressState={weeklyPathProgressLoadedFor === activeClass.classId ? 'loaded' : weeklyPathProgressLoading ? 'loading' : 'unavailable'}
                    />
                  </div>
                </details>
              )}
              <details className="tw-disclosure" style={{ marginTop: 12 }}>
                <summary>Marking periods <span className="tw-small tw-muted" style={{ fontWeight: 600 }}>add, close, and file assignments into marking periods</span></summary>
                <div className="tw-disclosure__body">
                  <MarkingPeriodSettings
                    settings={gradingPeriodSettings}
                    assignments={assignmentsForSelectedClass}
                    classLabel={selectedGradebookClass?.name || selectedGradebookPeriod}
                    busy={gradingPeriodBusy || bulkBusy}
                    onCreatePeriod={handleCreateGradingPeriod}
                    onSetCurrentPeriod={handleSetCurrentGradingPeriod}
                    onSetPeriodArchived={handleSetGradingPeriodArchived}
                    onMoveSelectedAssignments={handleMoveSelectedAssignmentsToGradingPeriod}
                  />
                </div>
              </details>
            </div>
          )}

          {teacherTab === 'gradeTransfer' && (
            <GradeTransferCenter
              onClassScopeChange={reportExportClasses}
              classes={classes}
              assignments={assignments}
              students={allStudents}
              teacherUid={auth.session?.uid || user.uid || ''}
              teacherEmail={user.email || ''}
              isRootAdmin={user.isRootAdmin === true}
              gradingPeriodSettings={gradingPeriodSettings}
              initialScope={gradeExportScope}
              onOpenGrades={(classId, assignmentId) => openGradebookFor(classId, assignmentId)}
              onOpenAssignment={(assignmentId, classId) => openAssignmentHub(assignmentId, classId)}
            />
          )}


          {responseInspectorTarget && (
            <StudentResponseInspector
              {...responseInspectorTarget}
              studentIdentityIndex={teacherStudentIdentityIndex}
              onClose={() => setResponseInspectorTarget(null)}
              onChanged={undefined}
            />
          )}
          {teacherTab === 'standards' && (
            <TexasStandardsDashboard
              // Scoped by the class bar. A mastery picture averaged across
              // five different classes is not a picture of anything a teacher
              // can act on.
              allStudents={activeClass.classId ? studentsInActiveClass : allStudents}
              assignments={assignments}
              classes={classes}
              learningProfilesByStudentId={teacherLearningProfiles}
              courseLevelByStudentId={courseLevelByStudentId}
              onOpenStudent={setProfileDrawerStudentId}
              className={classesById[activeClass.classId]?.name || 'this class'}
            />
          )}

          {teacherTab === 'analytics' && (
            <TeacherAnalyticsDashboard
              students={teacherAnalyticsStudents}
              masteryProfilesByStudentId={teacherMasteryProfilesByStudentId}
              learningProfilesByStudentId={teacherLearningProfiles}
              onOpenStudent={setProfileDrawerStudentId}
            />
          )}

          {teacherTab === 'exams' && (
            <TeacherSecureExamDashboard
              students={allStudents}
              // The teacher's classes and address: what the Secure Test screen
              // offers when adding a class or a student to a Test.
              classes={classes}
              teacherEmail={user.email || ''}
              classId={activeClass.classId || null}
              // The teacher's own Test Cycles, administered beside the
              // simulations they already run on this same secure runtime.
              testCycleAssignments={assignments.filter(isTestCycleAssignment)}
              focusedTestCycleAssignmentId={focusedTestCycleAssignmentId}
              onPreviewTestCycle={(assignment) => setTestCyclePreviewAssignment(assignment)}
            />
          )}

          {teacherTab === 'mathTools' && (
            <div>
              <h2 style={{ marginTop: 0 }}>Math Tools Lab</h2>
              <p style={{ color: 'var(--mm-ink-muted)', marginTop: '-4px' }}>
                A preview bench for the interactive tools. These run standalone — nothing here is graded,
                saved to a student record, or published to Google Classroom, so it is safe to experiment.
              </p>
              <MathToolsLab />
            </div>
          )}

          {teacherTab === 'classroom' && (
            <ClassroomManagerV2
              assignments={assignments}
              classes={classes}
              students={allStudents}
              teacherEmail={user.email}
              initialAssignmentId={classroomManagerAssignmentId}
            />
          )}

          {teacherTab === 'access' && <SignInAccess signedInEmail={user.email} mode="teacher" onStudentIdentityChanged={refreshTeacherRosterAfterNameChange} />}
        </div>
        </div>
      </div>
    </div>
  );
}
