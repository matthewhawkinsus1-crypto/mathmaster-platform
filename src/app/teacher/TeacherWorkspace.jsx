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
 *
 * Its own state is the authoring code it loads on demand (teacher's first
 * load): Pre-Flight's model, the compiler and the rest, which its handlers and
 * the Assignments list take from ./teacherAuthoringKit.js (./authoringKitLoader
 * .js) instead of importing them, so they are not downloaded before Home.
 */
import { Suspense, use, useEffect, useState } from 'react';
// Shared with App so the sheets form their own chunk that links before App.css.
import '../shell/leadingStyles.js';
// The teacher's own sheets, here and not on a student's first load (PF01). The
// workspace loads before any screen inside it, so they link before every
// teacher screen's own CSS, as they did when App carried them. App.css's touch
// rules beat theirs by weight (app/shell/leadingStyles.js says how).
import '../../components/teacher/supportEvidence.css';
import '../../components/teacher/teacherWorkspace.css';
import { db } from '../../firebase';
import { CLASS_PERIODS, assignmentIsForStudent } from '../../assignmentLifecycle';
import { matchesSmartView } from '../../assignmentSmartViews';
import { assignmentFolderMatches, titleOrFolderMatches } from '../../assignmentFolders';
import { isLibraryAssignment } from '../../assignmentDestinations';
import { getStoredSectionVariantModes, storedAssignmentToV5 } from '../../platform/contract/storedAssignmentV5.js';
import { rigorComparability } from '../../platform/teacher/gradeEvidence.js';
import { toDateTimeLocalInputValue } from '../student/assignmentRuntimeHelpers.js';
import { CLASS_SCOPED_TABS } from '../screenScopes.js';
import { AssignmentAiHealth, AssignmentContentUpgradeModal, AssignmentGradeOverrideControls, AssignmentIntake, AssignmentLibrary, AssignmentQuestionEditor, AttendanceHistoryPanel, ClassContextBar, ClassCourseSettings, ClassesAdmin, ClassesWorkspace, ClassRewardCatalogEditor, ClassRewardRequestsPanel, ClassroomManagerV2, ClassScheduleSettings, DemoExperience, DisciplineTracker, GradebookAssignmentBar, GradebookClassChooser, GradeTransferCenter, LessonPreflightModal, LiveChallengeTeacher, MarkingPeriodSettings, MathToolsLab, PacingControls, ParentContactCenter, PathCoverageAudit, PathSimulator, PlatformHealth, PreproductionReset, SectionRecoveryAuditTrail, SignInAccess, StudentCaseReviewView, StudentDolRecoveryRow, StudentResponseInspector, StudentsRoster, TeacherActionCenter, TeacherAnalyticsDashboard, TeacherAssignmentPdfDialog, TeacherHome, TeacherSecureExamDashboard, TeacherSidebar, TestCyclePreview, TexasStandardsDashboard, WeeklyPathControls, WeeklyPathGradePanel } from '../lazyScreens.js';
// The five panels drawn closed on every screen, each mounted when it first
// opens (./teacherPanels.js), and their code fetched while the browser is idle.
import { AssignmentHub, ClassroomSyncReview, StudentProfileDrawer, SupportEvidenceReportView, TeacherQuickSearch, administrationView, assignmentsView, gradebookView } from './teacherPanels.js';
import { useOnDemandCode } from './onDemandCode.js';
import { prefetchTeacherPanels } from './teacherPanelPrefetch.js';
import { compareStudentsByName, formatStudentName } from '../../platform/studentName';
import { isTestCycleAssignment } from '../../platform/assessment/testCycle.js';
import { practicePassesAllowed } from '../../platform/rewards/practicePassPolicy.js';
import { resolveStudentCourseContext, studentsInClass } from '../../../functions/shared/classModel.mjs';
import { SUPPORT_EVENT_KIND, SUPPORT_EVENT_STAGE } from '../../platform/teacher/studentSupportSignals.js';
import { buildReturnCheckInEvent } from '../../platform/attendance/returnCheckIn.js';
import { isRootAdminEmail } from '../../../functions/shared/rolePolicy.mjs';
import { classGradeProgress } from '../../platform/teacher/assignmentProgress.js';
// The gradebook's R, Held and LC marks, without the Recovery audit they come from.
import { MAIN_CONTENT_ID, SkipToContent } from '../../components/common/pageChrome.jsx';
// Pre-Flight's model, the compiler and the rest of the authoring code, on demand.
import { loadAssignmentActions, loadAuthoringKit, loadedAssignmentActions, loadedAuthoringKit, prefetchAuthoringKit } from './authoringKitLoader.js';



// The actions ./workspaceAssignmentActions.js builds, by the names it returns
// them under, in the order the workspace takes them.
const ASSIGNMENT_ACTIONS = Object.freeze([
  'handleAssignmentJsonReady', 'confirmAssignmentPreflight', 'saveQuestionEditor',
  'handleDuplicateAssignment', 'handleRepairAssignmentFromLibrary', 'handleSaveAssignmentDates',
]);

// The parent-contact store, on demand (teacher's first load, third pass): the
// two screens that write through it, Discipline and Parent Contacts, read
// through it as they open (./useTeacherActionCenterData.js), so it is here by
// the time a contact is recorded. Every write still returns its promise.
const parentContactStore = () => import('../../platform/teacher/parentContactStore.js');

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
  // THE AUTHORING CODE, ON DEMAND (./authoringKitLoader.js). The handlers
  // below that run Pre-Flight's model, the compiler or its checks take them
  // from the kit, which arrives while the workspace is idle; an action that
  // comes first asks for it at once and waits. A failed request reaches
  // AppErrorBoundary ("MathMaster was just updated"), as a teacher screen's
  // chunk that cannot load does.
  const [authoringKitError, setAuthoringKitError] = useState(null);
  // The closed panels' code and Home's math (./teacherPanelPrefetch.js), then
  // the authoring code, while the browser is idle once the workspace has drawn.
  useEffect(() => prefetchTeacherPanels(), []);
  useEffect(() => prefetchAuthoringKit(), []);
  // The gradebook's JSX (./gradebookTabView.jsx), asked for as Grades opens
  // when the idle prefetch has not brought it yet. Code that cannot load
  // reaches AppErrorBoundary, as a teacher screen's chunk does.
  const gradebook = useOnDemandCode(gradebookView, teacherTab === 'grades');
  // This only controls discoverability. Privileged operations remain
  // callable-only and re-check the immutable root identity + claims on the
  // server. The email fallback prevents a stale token from hiding Admin Mode
  // from the one account that needs to fix/deploy it.
  const rootAdminUiEligible = user.isRootAdmin === true
    || isRootAdminEmail(user.email);
  // The administrator's screen (./administrationView.jsx), asked for as soon
  // as the workspace draws for the one account that can open it.
  const administration = useOnDemandCode(administrationView, rootAdminUiEligible);
  if (authoringKitError) throw authoringKitError;
  if (teacherTab === 'grades' && gradebook.failure) throw gradebook.failure;
  const authoringKit = () => loadAuthoringKit().catch((error) => {
    setAuthoringKitError(error);
    throw error;
  });
  // For code that runs once the kit is here: a helper an action calls after
  // awaiting authoringKit(), or an action that has checked loadedAuthoringKit().
  const requireAuthoringKit = () => {
    const kit = loadedAuthoringKit();
    if (!kit) throw new Error('The assignment tools have not finished loading. Try again in a moment.');
    return kit;
  };

  // The teacher-only handlers that only this screen calls, moved from App
  // with it, verbatim and in their original order (G2): Pre-Flight, the
  // assignment intake and setup editor, the question editor, duplicate,
  // Library repair and Dates & Classes. They read and write App's state
  // through the props of the same name. The async ones are in
  // ./workspaceAssignmentActions.js (below); the ones a click runs at once
  // (opening the question editor, Edit Setup, Assign) stay here.
  // The handlers behind Pre-Flight, the assignment intake and setup editor,
  // the question editor's Save, Duplicate, Library repair and Dates & Classes,
  // on demand (./workspaceAssignmentActions.js, teacher's first load): built
  // on each render from what they read here, as when they were inline. Here
  // already (the idle prefetch), an action runs at once; else it waits for its
  // code. A failed request reaches AppErrorBoundary, as the authoring code's.
  const assignmentActionScope = {
    allStudents,
    assignmentFolderPaths,
    assignmentPreflight,
    assignments,
    authoringKit,
    autoPublishAssignmentPackageToClassroom,
    classes,
    confirmAction,
    editingAssignmentDates,
    fetchAssignments,
    gradingPeriodSettings,
    openAssignmentPreflight,
    questionEditorAssignment,
    requireAuthoringKit,
    saveAssignmentFolderPaths,
    setAssignmentPreflight,
    setAssignmentPreflightBusy,
    setEditingAssignmentId,
    setQuestionEditorAssignment,
    toastError,
    toastInfo,
    toastSuccess,
    toastWarning,
    user,
    V5_COMPILER_PLUMBING_ERROR,
  };
  const assignmentAction = (name) => (...args) => {
    const actions = loadedAssignmentActions();
    if (actions) return actions.createAssignmentActions(assignmentActionScope)[name](...args);
    return loadAssignmentActions().then(
      (module) => module.createAssignmentActions(assignmentActionScope)[name](...args),
      (error) => {
        setAuthoringKitError(error);
        throw error;
      },
    );
  };
  const [
    handleAssignmentJsonReady, confirmAssignmentPreflight, saveQuestionEditor,
    handleDuplicateAssignment, handleRepairAssignmentFromLibrary, handleSaveAssignmentDates,
  ] = ASSIGNMENT_ACTIONS.map(assignmentAction);

  // TT24: the editor rebuilds the stored assignment as Assignment V5 while it
  // renders. A legacy assignment with no course or TEKS on it cannot be
  // rebuilt, and that throw used to reach the app's error screen and take the
  // whole workspace with it. Try the same rebuild here first: if it cannot be
  // done, say why in a toast and leave the teacher where they are. Returns
  // whether the editor opened (the hub stays open when it did not).
  const openQuestionEditor = (assignment) => {
    try {
      storedAssignmentToV5(assignment);
    } catch (error) {
      toastError('Could not open the question editor', error.message);
      return false;
    }
    setQuestionEditorAssignment(assignment);
    // Its Save runs the authoring code: asked for now, it is here by then, and
    // code that cannot load says so before any edit is made, not at Save.
    authoringKit().catch(() => { /* AppErrorBoundary has it */ });
    return true;
  };

  const beginEditAssignmentSetup = (assignment) => {
    // At once when the authoring code is here, as before it loaded on demand
    // (the hub that asks closes as the review opens); else once it arrives.
    if (!loadedAuthoringKit()) {
      authoringKit().then(() => beginEditAssignmentSetup(assignment), () => { /* AppErrorBoundary has it */ });
      return;
    }
    try {
      const { prepareStoredAssignmentForReuse } = requireAuthoringKit();
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
        allowPracticePasses: practicePassesAllowed(assignment),
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
    if (administration.failure) throw administration.failure;
    if (administration.module) {
      return administration.module.renderAdministration({
      AssignmentAiHealth,
      ClassesAdmin,
      PathCoverageAudit,
      PlatformHealth,
      PreproductionReset,
      SignInAccess,
      adminTab,
      fetchAssignments,
      fetchTeacherRosterSummaries,
      handleLogout,
      refreshTeacherRosterAfterNameChange,
      setAdminTab,
      setAllStudents,
      setAssignmentActivity,
      setAssignments,
      setClassEvidenceByStudentId,
      setClassworkGradesByAssignment,
      setDolGradesByAssignment,
      setPresenceById,
      setStudentSessionSummaries,
      setStudentSupportEvents,
      setSupportUsageByAssignment,
      setTeacherTab,
      setTeacherWorkspaceMode,
      setWeeklyPathCompletionsByStudent,
      setWeeklyPathGoalSnapshotsByStudent,
      user,
      });
    }
    return (
      <div style={{ fontFamily: '"Segoe UI", sans-serif', backgroundColor: 'var(--mm-surface-control)', minHeight: '100vh', padding: '20px' }}>
        <main id={MAIN_CONTENT_ID} tabIndex={-1} aria-busy="true" style={{ maxWidth: 1260, margin: '0 auto', padding: 'clamp(14px, 4vw, 28px)' }}>
          <p role="status" style={{ margin: 0, color: 'var(--mm-text-muted)' }}>
            {typeof window !== 'undefined' && window.navigator?.onLine === false
              ? 'This device is offline. Administration opens when it is back online.'
              : 'Opening Administration…'}
          </p>
        </main>
      </div>
    );
  }

  // The Assignments list reads two checks on each card from the authoring
  // code: whether Recovery can be added, and a Library copy to repair from.
  // Opened before the code has arrived, the screen waits for it as for its own
  // code (AppShell's loading screen), and a failure to load it reaches
  // AppErrorBoundary. Reopened on Assignments, the page asks for it at once.
  // Its JSX loads on demand as well (./assignmentsTabView.jsx), asked for
  // here, before the wait for the authoring code, so the two arrive together.
  if (teacherTab === 'assignments') assignmentsView.prefetch();
  const assignmentListKit = teacherTab === 'assignments' ? (loadedAuthoringKit() || use(loadAuthoringKit())) : null;
  const assignmentsTab = teacherTab === 'assignments' ? (assignmentsView.loaded() || use(assignmentsView.load())) : null;

  return (
    <div style={{ fontFamily: '"Segoe UI", sans-serif', backgroundColor: 'var(--mm-surface-sunken)', minHeight: '100vh', padding: '20px' }}>
      {/* The first Tab stop: past the navigation (the collapse button and 22 destinations) and the
          header's Find and Log Out, to the screen. The dialogs below are siblings of the shell. */}
      <SkipToContent />
      {renderDeleteAssignmentDialog()}
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
          // Pre-Flight's findings in the editor count question versions
          // against the same class Assignment Review does.
          rosterSizesByClassId={preflightRosterSizesByClassId}
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
        onEditQuestions={(assignment) => { if (openQuestionEditor(assignment)) setAssignmentHubTarget(null); }}
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

        {/* The screen is the page's main landmark, which the skip link goes to. The navigation and
            the header are outside it. It is a wrapper of the content area, not the area itself, so
            that the Pre-Flight review can sit in it: the student preview inside the review draws its
            work area as the page's main wherever no main is around it, and the review, a dialog
            drawn over the screen, was not inside this one. (The area's class carries the rules for
            tables and headings, which the review does not take.) */}
        <main id={MAIN_CONTENT_ID} tabIndex={-1}>
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
            // Imported or authored now, not a stored Library assignment reused (SP-5).
            authoredNow={assignmentPreflight.authoredNow === true}
            allowQuestionRepair={assignmentPreflight.allowQuestionRepair !== false}
            rosterSizesByClassId={preflightRosterSizesByClassId}
            // So Review can say a reused assignmentKey is taken before Create does (TT10).
            existingAssignments={assignments}
            // Offers the in-place import of a Test Cycle's missing secure
            // families; seedPathQuestionBank re-checks the root identity.
            canManageSecureBank={rootAdminUiEligible}
            // The saved assignment this review was opened from (an update, or a
            // reuse for more classes): the one a Test Cycle's secure test
            // reference is checked against.
            sourceAssignmentId={assignmentPreflight.sourceAssignmentId || null}
          />
        )}
        {/* The student preview of a Test Cycle is a dialog over the screen, drawn inside the main for
            the Pre-Flight review's reason: the work area of a tool item in it draws itself as the
            page's main wherever no main is around it, and a second main is what the preview was
            drawing (its items are plain elements here, TestCyclePreview). */}
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
          {/* The Assignments screen's JSX (./assignmentsTabView.jsx), which
              the screen waits for with the authoring code it reads on each
              card (teacher's first load, third pass). */}
          {teacherTab === 'assignments' && assignmentsTab.renderAssignmentsTab({
            AssignmentIntake,
            activeClass,
            allStudents,
            allVisibleSelected,
            assignmentFolderPaths,
            assignmentGroupOpen,
            assignmentListIsFiltered,
            assignmentListKit,
            assignments,
            assignmentSearch,
            beginEditAssignmentDates,
            beginEditAssignmentSetup,
            beginTeacherWorksheetExport,
            bulkBusy,
            classes,
            classesById,
            clearAssignmentSelection,
            editingAssignmentDates,
            editingAssignmentId,
            gradingPeriodSettings,
            handleAssignmentJsonReady,
            handleBulkArchive,
            handleBulkMoveToFolder,
            handleDuplicateAssignment,
            handleMoveAssignmentToFolder,
            handleRepairAssignmentFromLibrary,
            handleRepairClassroomAssignmentPost,
            handleSaveAssignmentDates,
            handleToggleArchiveAssignment,
            handleTogglePauseAssignment,
            libraryNavigation,
            movingFolderAssignmentId,
            movingFolderValue,
            now,
            openAssignmentHub,
            openDeleteDialog,
            openGradebookFor,
            openGradeExport,
            openQuestionEditor,
            selectedAssignmentIds,
            setAssignmentGroupOpen,
            setAssignmentSearch,
            setClassroomManagerAssignmentId,
            setContentUpgradeRequest,
            setEditingAssignmentDates,
            setEditingAssignmentId,
            setExportJsonAssignment,
            setExportJsonCopied,
            setFocusedTestCycleAssignmentId,
            setLibraryNavigation,
            setMovingFolderAssignmentId,
            setMovingFolderValue,
            setSelectedAssignmentIds,
            setTeacherTab,
            startTeacherPreview,
            teacherStudentDataMode,
            toastError,
            toastInfo,
            toastSuccess,
            toggleAssignmentSelected,
            visibleAssignmentIds,
            visibleAssignments,
          })}

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
              // Live View opens the same Response Inspector, through the same
              // callable and its authorization, as the gradebook below.
              onInspectResponse={(target) => setResponseInspectorTarget(target)}
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

          {teacherTab === 'discipline' && (
            <DisciplineTracker
              classes={classes}
              students={allStudents}
              contacts={parentContacts}
              teacherEmail={user.email || ''}
              teacherName={user.displayName || user.name || ''}
              isRootAdmin={user.isRootAdmin === true}
              initialClassId={activeClass.classId || null}
              onRecordContact={(contact) => parentContactStore().then((store) => store.recordParentContact({ db, teacherEmail: user.email, contact }))}
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
                const recorded = await parentContactStore().then((store) => store.recordParentContact({ db, teacherEmail: user.email, contact }));
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
              onCompleteFollowUp={(contact) => parentContactStore().then((store) => store.recordParentContactResolution({ db, teacherEmail: user.email, contact }))}
              onExportContacts={() => parentContactStore().then((store) => store.fetchAllParentContactsForExport({ db, teacherEmail: user.email }))}
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

              {gradebook.module ? gradebook.module.renderGradebookTab({
                AssignmentGradeOverrideControls,
                GradebookAssignmentBar,
                GradebookClassChooser,
                MarkingPeriodSettings,
                SectionRecoveryAuditTrail,
                StudentDolRecoveryRow,
                WeeklyPathGradePanel,
                activeClass,
                allStudents,
                assignmentsForSelectedClass,
                bulkBusy,
                calculateGrade,
                classes,
                classesById,
                classEvidenceByStudentId,
                classEvidenceLoading,
                classSchedule,
                dolAttemptGrantBusyKey,
                feedbackReleaseBusyId,
                formatTime,
                gradebookFilter,
                gradebookHasPracticePass,
                gradebookProgress,
                gradebookProgressFilter,
                gradebookRigor,
                gradebookVisibleStudents,
                gradingPeriodBusy,
                gradingPeriodSettings,
                handleCreateGradingPeriod,
                handleGrantDOLAttemptForStudents,
                handleLoadDeliveredRigor,
                handleMoveSelectedAssignmentsToGradingPeriod,
                handleReleaseAssignmentFeedback,
                handleSetCurrentGradingPeriod,
                handleSetGradingPeriodArchived,
                now,
                openAssignmentHub,
                openGradeExport,
                openIEPReport,
                openLiveFor,
                openTeacherScratchpad,
                selectedAssignment,
                selectedClassStudents,
                selectedGradebookClass,
                selectedGradebookPeriod,
                setActiveClass,
                setClassroomSyncProposal,
                setGradebookFilter,
                setGradebookProgressFilter,
                setProfileDrawerStudentId,
                setResponseInspectorTarget,
                teacherLearningProfiles,
                teacherWeeklyGoalsByStudent,
                teacherWeeklyRoster,
                user,
                weeklyPathCompletionsByStudent,
                weeklyPathProgressLoadedFor,
                weeklyPathProgressLoading,
                weeklyPathTruncated,
                weeklyPathWeekComplete,
                weeklyPathWeekKey,
              }) : (
                <div aria-busy="true">
                  <p role="status" style={{ margin: '8px 0 0', color: 'var(--mm-text-muted)' }}>
                    {typeof window !== 'undefined' && window.navigator?.onLine === false
                      ? 'This device is offline. The gradebook opens when it is back online.'
                      : 'Opening the gradebook…'}
                  </p>
                </div>
              )}
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
              teacherUid={user.uid}
              initialAssignmentId={classroomManagerAssignmentId}
            />
          )}

          {teacherTab === 'access' && <SignInAccess signedInEmail={user.email} mode="teacher" onStudentIdentityChanged={refreshTeacherRosterAfterNameChange} />}
        </div>
        </main>
        </div>
      </div>
    </div>
  );
}
