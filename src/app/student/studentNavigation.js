/*
 * WHERE A STUDENT GOES: OPENING AN ASSIGNMENT (startAssignment), THE DASHBOARD'S SCREENS, A RESULT, A LIVE CHALLENGE, AND A RECOVERY.
 *
 * Moved verbatim from App.jsx. These are plain functions: no state, no effects, no hooks. App builds them on every render, as it did when they were written inline, and passes what they read by position (tests/platform/appSplitRouting.test.mjs holds the two sides to the same names in the same order). App calls it below the last thing it reads (the workspace-arrival notices), which is further down than the functions used to sit; nothing reads them during render before that point.
 */
import { practiceSkillLaunch } from '../../platform/assessment/practiceSkillLaunch.js';
import { resolveStudentOverride } from '../../../functions/shared/studentAssignmentOverrides.mjs';
import { normalizeQuestionRecord } from '../../attemptPolicy';
import { assignmentIsForStudent, formatDateTime, getAssignmentLifecycle, getDOLState, getWarmupState, prerequisiteAccess } from '../../assignmentLifecycle';
import { describeSectionAccess } from '../../platform/student/assignmentNavigator.js';
import { startPerformanceSpan } from '../../platform/performance/performanceTelemetry.js';
import { resolveStudentAssignmentEntry } from '../../platform/student/assignmentEntry.js';
import { getStoredAssignmentQuestions } from '../../platform/contract/storedAssignmentV5.js';
import { projectCurrentAssignmentContent, resolveCurrentContentStorageIndex } from '../../platform/assignments/currentContentProjection.js';
import { LEVEL as NAV_LEVEL, normalizeOrigin } from '../../platform/student/navigationModel.js';
import { OPEN_NOTICE, describeOpenNotice, teacherClosedState } from '../../platform/student/studentOpenGate.js';
import { questionIsTerminal, timedSectionWorkableNow } from '../../platform/student/studentWorkState.js';
import { whenDateTimeText } from '../../platform/student/studentWhen.js';
import { DETOUR_SECTION_LABEL, describeSectionDetour } from '../../platform/student/sectionDetour.js';
import { liveChallengeReturnPlace } from '../../platform/liveChallenge/liveChallengeReturn.js';
import { createEmptyAssignmentTracker, createPracticeAssignmentTracker } from './assignmentRuntimeHelpers.js';
import { isTestCycleAssignment } from '../../platform/assessment/testCycle.js';
import { STUDENT_DESTINATION } from '../../components/student/StudentGlobalNav.jsx';
import { recoveryErrorCode, startSectionRecovery } from '../../services/sectionRecoveryService.js';

export function createStudentNavigation(
  toastInfo, toastWarning, user, hasPracticePassFor, studentRequiredFor, assignmentResultRoute,
  setAssignmentResultRoute, setActiveClassroomSectionKey, activeView, setActiveView, assignments, setPathLaunchTeks,
  setPathLaunchTab, setPathLaunchFramework, activeAssignmentId, setActiveAssignmentId, setTracker, tracker,
  setPracticeTracker, currentQuestionIndex, setCurrentQuestionIndex, setAssignmentNavigationCollapsed,
  setAssignmentOverviewExpanded, classSchedule, classworkGradesByAssignment, getSectionAccessState,
  setRecoverySession, recoveryBusySection, setRecoveryBusySection, setStudentDashboardMode, studentDashboardMode,
  liveChallengeReturn, setLiveChallengeReturn, setActiveTestCycleAssignmentId, setActiveTestCycleOrigin,
  mergeSectionRecoveryRecord, lastActivityRef, liveFocusLossRef, liveSessionActiveSecondsRef,
  liveSessionAttemptBaselineRef, pendingAssignmentSecondsRef, flushAssignmentActivity, assignmentOpenSpanRef,
  setIsIdle, terminalCountingFor, showWhenWorkspaceOpens,
) {
  const startAssignment = (assignmentId, requestedQuestionIndex = 0, options = {}) => {
    assignmentOpenSpanRef.current?.finish({ status: 'superseded' });
    assignmentOpenSpanRef.current = startPerformanceSpan('assignment_open_ms', { flow: 'student_assignment' });
    const assignmentData = assignments.find(
      (assignment) => assignment.id === assignmentId,
    );
    /*
     * A TEST CYCLE IS NEVER ENTERED DIRECTLY.
     *
     * Every path into an assignment comes through here — Home, the Assignments
     * Center, the Grade Center's practice button, a Classroom launch. If any
     * one of them could open the raw runtime on a Test Cycle, a student could
     * reach Corrections content for a test they passed, or Review content
     * during the secure Test. So the card is the only door, and the card asks
     * the SERVER which stage is open.
     *
     * `cycleStage` is the card calling back in to open the instructional stage
     * it was told to open, which is the one case that is not a redirect.
     */
    const cycleStage = String(options.cycleStage || '').trim();
    if (isTestCycleAssignment(assignmentData) && !cycleStage) {
      setActiveTestCycleAssignmentId(assignmentId);
      // Where its Back goes (NAV-9): the screen that opened it.
      setActiveTestCycleOrigin(normalizeOrigin(NAV_LEVEL.TEST_CYCLE, options.origin));
      return openStudentDashboardMode('testCycle');
    }
    const assignmentQuestions = getStoredAssignmentQuestions(assignmentData);
    if (!assignmentQuestions.length) return;
    if (user?.role === 'student' && !assignmentIsForStudent(assignmentData, { classId: user.classId || null, classPeriod: user.classPeriod })) {
      toastWarning('Not assigned to your class', 'This assignment is not assigned to your class period.');
      return;
    }
    /*
     * A START THAT CANNOT HAPPEN LANDS ON THE RESULT PAGE (NAV-4, NAV-10).
     *
     * Paused or archived by the teacher, an earlier lesson to finish first,
     * not open yet, excused: the assignment's result page says so in its
     * "what opens when" panel, where the student can read it for as long as
     * they need — not in a toast that is gone in five seconds. Every path in
     * comes through here: Home, Assignments, Grades, Ways to raise, a
     * Classroom link, an address.
     */
    const resultOrigin = normalizeOrigin(NAV_LEVEL.ASSIGNMENT_RESULT, options.origin);
    const landOnResult = (notice) => openStudentAssignmentResult(assignmentId, { origin: resultOrigin, notice });
    const closedByTeacher = user?.role === 'student' ? teacherClosedState(assignmentData) : null;
    if (closedByTeacher) {
      landOnResult(describeOpenNotice({ kind: closedByTeacher }));
      return;
    }
    const access = prerequisiteAccess({ assignment: assignmentData, classworkGradesByAssignment, nowValue: Date.now() });
    // Waiting on the prerequisite says so; a quiz waiting only for its date
    // (RT17) is told when it opens, below, like any scheduled work.
    if (user?.role === 'student' && !access.open && access.reason === 'prerequisiteRequired') {
      landOnResult(describeOpenNotice({
        kind: OPEN_NOTICE.PREREQUISITE,
        prerequisiteTitle: assignments.find((assignment) => assignment.id === access.prerequisiteId)?.title || '',
        opensAtText: whenDateTimeText(assignmentData.releaseAt),
      }));
      return;
    }
    const lifecycle = getAssignmentLifecycle(assignmentData, Date.now(), {
      studentId: user?.role === 'student' ? user.id : undefined,
    });
    if (lifecycle.isScheduled && access.reason !== 'prerequisiteMet') {
      if (user?.role === 'student') {
        landOnResult(describeOpenNotice({ kind: OPEN_NOTICE.NOT_OPEN_YET, opensAtText: whenDateTimeText(assignmentData.releaseAt) }));
      } else {
        toastInfo('Not open yet', `This assignment opens ${formatDateTime(assignmentData.releaseAt)}.`);
      }
      return;
    }
    // EXCUSED WORK IS NOT OPENED AS GRADED WORK. Home and Assignments leave
    // it out; a typed address, a bookmark or a Classroom link lands on its
    // result page instead. Voluntary practice and the result page's own
    // Review/Practice buttons (returnToResult) are unchanged.
    if (user?.role === 'student' && !cycleStage && !lifecycle.isPracticeOnly && !options?.returnToResult
      && resolveStudentOverride({ assignment: assignmentData, studentId: user.id })?.excused === true) {
      landOnResult(describeOpenNotice({ kind: OPEN_NOTICE.EXCUSED }));
      return;
    }

    const currentContent = projectCurrentAssignmentContent(assignmentData);
    const requestedSectionKey = String(options?.sectionKey || '').trim().toLowerCase();
    const scopedSectionKey = ['warmup', 'classwork', 'practice', 'dol'].includes(requestedSectionKey)
      ? requestedSectionKey
      : null;

    /*
     * A GRANTED PRACTICE PASS EXCUSES PRACTICE FROM REQUIRED NAVIGATION.
     *
     * A Test Cycle assignment can never carry a Practice Pass (it is not
     * eligible for one -- see classPointRewards.mjs), so `cycleStage` and
     * `hasPracticePass` are mutually exclusive in practice; the `!cycleStage`
     * guard just keeps that explicit. Explicitly asking to open Practice as
     * required graded work is refused outright, never reopened as graded
     * Practice -- voluntary post-deadline practice is a completely separate
     * tracker this never touches.
     */
    const hasPracticePass = !cycleStage
      && !lifecycle.isPracticeOnly
      && hasPracticePassFor(assignmentId);
    if (scopedSectionKey === 'practice' && hasPracticePass) {
      toastInfo('Practice excused', 'Practice is already excused with your Practice Pass.');
      return;
    }

    // A Test Cycle stage sees only its own questions. A granted Practice Pass
    // removes Practice's own current-content questions the same way. Neither
    // filter applies to Teacher Preview or an ordinary un-redeemed assignment,
    // which keeps every existing assignment identical.
    const stageEntries = cycleStage
      ? currentContent.entries.filter((entry) => entry.logicalRole === cycleStage)
      : hasPracticePass
        ? currentContent.entries.filter((entry) => entry.logicalRole !== 'practice')
        : currentContent.entries;
    // A reduced-item-count accommodation leaves this student fewer required
    // items (never in a Test Cycle stage, a preview or voluntary practice).
    const studentRequired = !cycleStage && user?.role === 'student' && !lifecycle.isPracticeOnly
      ? new Set(studentRequiredFor(assignmentData, { hasPracticePass }).indices)
      : null;
    const includedQuestionIndices = stageEntries
      .map((entry) => entry.storageIndex)
      .filter((index) => !studentRequired || studentRequired.has(index));
    if (!includedQuestionIndices.length) {
      toastWarning('Nothing to show yet', 'This assignment has no questions for you right now.');
      return;
    }
    const requested = Number(requestedQuestionIndex) || 0;
    let safeQuestionIndex = resolveCurrentContentStorageIndex(assignmentData, requested)
      ?? includedQuestionIndices[0];
    // A requested index resolved against the FULL projection could still land
    // on a waived Practice question (e.g. resuming exactly where a Classroom
    // link or the Grade Center last left off) even when no section was
    // explicitly requested. Never open one for a real student who holds the pass.
    if ((hasPracticePass || studentRequired) && !includedQuestionIndices.includes(safeQuestionIndex)) {
      safeQuestionIndex = includedQuestionIndices[0];
    }

    // Enter usable work, not merely the first stored question. Warm-Up and DOL
    // have time windows of their own; Classwork and Practice use their section
    // access policy. This changes navigation only — it never opens a locked
    // section or rewrites its schedule. An explicit Classroom section launch is
    // constrained to that section rather than silently jumping elsewhere.
    if (user?.role === 'student' && !lifecycle.isPracticeOnly) {
      const entryNow = Date.now();
      const studentContext = { classId: user.classId || null, classPeriod: user.classPeriod };
      const roleIsActionable = (role) => {
        // The same predicate as Home's Today rule (studentWorkState.js): a
        // Warm-Up/DOL with its class window switched off is open like
        // Classwork; otherwise only an active window is.
        if (role === 'warmup') {
          return timedSectionWorkableNow(getWarmupState({ assignment: assignmentData, schedule: classSchedule, ...studentContext, nowValue: entryNow }));
        }
        if (role === 'dol') {
          return timedSectionWorkableNow(getDOLState({ assignment: assignmentData, schedule: classSchedule, ...studentContext, nowValue: entryNow }));
        }
        if (role === 'classwork' || role === 'practice') {
          return getSectionAccessState({
            assignment: assignmentData,
            activityRole: role,
            ...studentContext,
            studentId: user.id,
            nowValue: entryNow,
          }).isOpen;
        }
        return true;
      };
      // A question's own address keeps that question only while its section
      // is open now; otherwise it resolves exactly as Continue does (the first
      // unfinished question open now), never onto finished work elsewhere.
      const requestedRole = stageEntries.find((entry) => entry.storageIndex === safeQuestionIndex)?.logicalRole || null;
      const keepRequested = Boolean(options?.returnToResult)
        || Boolean(options?.keepRequestedQuestion && roleIsActionable(requestedRole));
      const actionableIndex = resolveStudentAssignmentEntry({
        entries: stageEntries,
        includedQuestionIndices,
        requestedQuestionIndex: safeQuestionIndex,
        roleIsActionable,
        restrictToRole: scopedSectionKey,
        // Start/Continue lands on the first unfinished question open now;
        // Review My Work (returnToResult) keeps the question it asked for, and
        // so does a question's own address (a reload, a link): the student
        // returns to the question they were on, if its section is open now.
        // Finished means what Home means: correct, or out of tries (a
        // teacher-granted extra DOL try reopens an expired DOL question).
        isFinished: keepRequested
          ? null
          : (index) => questionIsTerminal({
            record: tracker?.[assignmentId]?.[index],
            role: stageEntries.find((entry) => entry.storageIndex === index)?.logicalRole || null,
            question: assignmentQuestions[index],
            assignment: assignmentData,
            classId: user.classId || null,
            studentId: user.id,
            // Its tries counted on the question it dealt, as the list counts them.
            ...terminalCountingFor(assignmentData, index, tracker?.[assignmentId]?.[index]),
          }),
      });
      if (actionableIndex === null && options?.returnToResult) {
        // Asked from the result page: going "back" to the same page would do
        // nothing visible, so say why instead.
        toastInfo('Nothing to open right now', 'None of this assignment is open to you at the moment. The result page shows what opens when.');
        return;
      }
      if (actionableIndex === null && user?.role === 'student' && !scopedSectionKey) {
        // No dead end: with nothing open this minute, show the assignment's
        // result page — its sections, what opens when, and what to do next.
        openStudentAssignmentResult(assignmentId, { origin: resultOrigin });
        return;
      }
      if (actionableIndex === null) {
        toastInfo(
          scopedSectionKey ? 'This section is not open right now' : 'Nothing open right now',
          scopedSectionKey
            ? 'This section is not open now. It may open later in class, or it has closed.'
            : 'Nothing in this assignment is open for you to work on right now.',
        );
        return;
      }
      if (options?.keepRequestedQuestion && actionableIndex !== safeQuestionIndex) {
        // A question's address names a question whose section is not open now.
        // Said once the workspace is on screen, not over Home (review S2).
        showWhenWorkspaceOpens({ title: 'That question is not open right now', body: 'It opened where you can work now.' });
      }
      // A Classroom post for a section that is not open yet opens where the
      // student can work now; say why, in the navigator's words (NAV-22).
      const launchedRole = String(options?.launchedSectionKey || '').trim().toLowerCase();
      if (DETOUR_SECTION_LABEL[launchedRole] && !roleIsActionable(launchedRole)) {
        const detour = describeSectionDetour({
          requestedRole: launchedRole,
          landingRole: stageEntries.find((entry) => entry.storageIndex === actionableIndex)?.logicalRole || null,
          access: describeSectionAccess({
            role: launchedRole,
            label: DETOUR_SECTION_LABEL[launchedRole],
            timedDol: launchedRole === 'dol',
            lifecycle,
            warmupState: getWarmupState({ assignment: assignmentData, schedule: classSchedule, ...studentContext, nowValue: entryNow }),
            dolState: getDOLState({ assignment: assignmentData, schedule: classSchedule, ...studentContext, nowValue: entryNow }),
            manualState: getSectionAccessState({ assignment: assignmentData, activityRole: launchedRole, ...studentContext, studentId: user.id, nowValue: entryNow }),
            nowValue: entryNow,
          }),
        });
        if (detour) showWhenWorkspaceOpens(detour);
      }
      safeQuestionIndex = actionableIndex;
    }
    setActiveClassroomSectionKey(scopedSectionKey);
    // When Practice/Review was launched from Assignment Result, preserve that
    // route so the visible in-app Back control returns to the result instead of
    // skipping straight to the dashboard. Grade Center launches do not set this
    // flag and keep their existing Grades -> Practice -> Grades behavior.
    if (!options?.returnToResult) setAssignmentResultRoute(null);
    setActiveAssignmentId(assignmentId);
    setCurrentQuestionIndex(safeQuestionIndex);
    setAssignmentNavigationCollapsed(true);
    setAssignmentOverviewExpanded(false);
    lastActivityRef.current = Date.now();
    pendingAssignmentSecondsRef.current = 0;
    liveSessionActiveSecondsRef.current = { assignmentId, seconds: 0 };
    liveSessionAttemptBaselineRef.current = {
      assignmentId,
      totalAttemptsByIndex: Object.fromEntries(
        includedQuestionIndices.map((index) => [
          index,
          Number(normalizeQuestionRecord(tracker?.[assignmentId]?.[index]).totalAttempts) || 0,
        ]),
      ),
    };
    liveFocusLossRef.current = { assignmentId, count: 0, hiddenAt: null };
    setIsIdle(false);

    if (lifecycle.isPracticeOnly) {
      setPracticeTracker((current) => ({
        ...current,
        [assignmentId]: current[assignmentId] || createPracticeAssignmentTracker(
          assignmentQuestions,
          tracker[assignmentId] || {},
        ),
      }));
      pendingAssignmentSecondsRef.current = 0;
    } else if (!tracker[assignmentId]) {
      setTracker((current) => ({
        ...current,
        [assignmentId]: createEmptyAssignmentTracker(assignmentQuestions),
      }));
    }

    setActiveView('assignment');
    // The workspace is opening (a caller that has something to say once it is
    // on screen waits for this: the arrival notice, below).
    return true;
  };

  /*
   * STUDENT NAVIGATION.
   *
   * Five destinations plus the assignment result, each one browser entry, so
   * Back walks Practice -> Result -> Assignments (or Grades) -> Home instead of
   * leaving MathMaster. `studentBrowserRoute` turns these state changes into
   * history entries; these helpers only have to leave the state unambiguous.
   */
  // Every student destination leaves the app in the same shape: no result
  // route, no active assignment, no Path launch left over from somewhere else.
  // Written once so a new destination cannot forget one of them.
  const openStudentDashboardMode = (mode) => {
    setAssignmentResultRoute(null);
    setActiveClassroomSectionKey(null);
    setActiveAssignmentId(null);
    if (mode !== 'mathPath') setPathLaunchTeks(null);
    setPathLaunchTab(null);
    setPathLaunchFramework(null);
    if (mode !== 'testCycle') setActiveTestCycleAssignmentId(null);
    setStudentDashboardMode(mode);
    setActiveView('dashboard');
  };

  // "Practise this skill" on a released test review or the Test Cycle card:
  // a course standard opens Path practice on it; a practice test's exam
  // domain starts that exam's practice on the CCMR tab (practiceSkillLaunch).
  const practiseSkillFromResults = (destination) => {
    const launch = practiceSkillLaunch(destination);
    if (!launch) return;
    openStudentDashboardMode('mathPath');
    setPathLaunchTeks(launch.teksCode);
    setPathLaunchTab(launch.tab);
    setPathLaunchFramework(launch.framework ? { teksCode: launch.teksCode, framework: launch.framework } : null);
  };

  const openStudentGradeCenter = () => openStudentDashboardMode('grades');
  const openStudentAssignmentsCenter = () => openStudentDashboardMode('assignmentsCenter');

  /**
   * The one place a student destination turns into app state.
   *
   * StudentGlobalNav hands back a destination name; everything else about
   * getting there is here, so Home, Assignments, Grades and My Math Path cannot
   * disagree about what "Grades" means.
   */
  const navigateStudent = (destination) => {
    if (destination === STUDENT_DESTINATION.ASSIGNMENTS) return openStudentAssignmentsCenter();
    if (destination === STUDENT_DESTINATION.GRADES) return openStudentGradeCenter();
    if (destination === STUDENT_DESTINATION.REWARDS) return openStudentDashboardMode('rewards');
    if (destination === STUDENT_DESTINATION.MATH_PATH) return openStudentDashboardMode('mathPath');
    if (destination === STUDENT_DESTINATION.SECURE_EXAMS) return openStudentDashboardMode('secureExams');
    return openStudentDashboardMode('assignments');
  };

  // A navigation level a Back control returns to (NAV-9).
  const openStudentOriginLevel = (level) => {
    if (level === NAV_LEVEL.HOME) return openStudentDashboardMode('assignments');
    if (level === NAV_LEVEL.GRADES) return openStudentGradeCenter();
    if (level === NAV_LEVEL.SECURE_EXAMS) return openStudentDashboardMode('secureExams');
    return openStudentAssignmentsCenter();
  };

  const openStudentAssignmentResult = (assignmentId, options = {}) => {
    const id = String(assignmentId || '').trim();
    if (!id) return;
    const sectionKey = String(options.sectionKey || '').trim().toLowerCase() || 'whole';
    setAssignmentResultRoute({
      assignmentId: id,
      sectionKey,
      sectionLabel: options.sectionLabel || null,
      questionIndex: Number(options.questionIndex) || 0,
      // Which screen sent the student here (Home, Assignments or Grades), so
      // the visible Back control names and returns to it rather than guessing.
      // Browser Back already does the right thing; this keeps the on-screen
      // control agreeing with it (NAV-9).
      origin: normalizeOrigin(NAV_LEVEL.ASSIGNMENT_RESULT, options.origin),
      // Why a start landed here instead of opening (studentOpenGate.js), for
      // the page's "what opens when" panel. Null for an ordinary visit.
      notice: options.notice || null,
    });
    setActiveClassroomSectionKey(sectionKey === 'whole' ? null : sectionKey);
    setActiveAssignmentId(id);
    // A reload of a Recovery's entry (useUrlArrival) opens it again, where
    // the page's panel still offers it (NV14; mode null: the panel decides).
    if (options.recoverySection) setRecoverySession({ assignmentId: id, section: options.recoverySection, mode: null });
    setActiveView('assignmentResult');
  };

  /*
   * JOINING AND LEAVING THE LIVE CHALLENGE (NAV-25). Joining keeps the place
   * the student is on — the question they were working, a result page, a
   * screen — and the game's exit returns there instead of to Home.
   */
  const joinLiveChallenge = () => {
    setLiveChallengeReturn(liveChallengeReturnPlace({
      activeView, activeAssignmentId, currentQuestionIndex, studentDashboardMode, assignmentResultRoute,
    }));
    if (activeView === 'assignment' && activeAssignmentId) flushAssignmentActivity(activeAssignmentId).catch(() => {});
    openStudentDashboardMode('liveChallenge');
  };
  const leaveLiveChallenge = () => {
    const place = liveChallengeReturn;
    setLiveChallengeReturn(null);
    if (place?.kind === 'assignment' && assignments.some((assignment) => assignment.id === place.assignmentId)) {
      // The question they were on, if its section is still open; otherwise
      // where they can work now (and a start that cannot open says why).
      startAssignment(place.assignmentId, place.questionIndex, { keepRequestedQuestion: true });
      return;
    }
    if (place?.kind === 'result' && assignments.some((assignment) => assignment.id === place.assignmentId)) {
      openStudentAssignmentResult(place.assignmentId, { sectionKey: place.sectionKey, origin: place.origin });
      return;
    }
    openStudentDashboardMode(place?.kind === 'screen' ? place.mode : 'assignments');
  };

  // Starting a Recovery is the server's decision: it re-checks eligibility,
  // builds the fresh questions and pins them before anything is shown.
  const startStudentRecovery = async (assignmentId, section) => {
    if (!assignmentId || recoveryBusySection) return;
    setRecoveryBusySection(section);
    try {
      const result = await startSectionRecovery({ assignmentId, section });
      if (result?.record) mergeSectionRecoveryRecord(assignmentId, section, result.record);
      setRecoverySession({ assignmentId, section, mode: 'assessment' });
    } catch (error) {
      const code = recoveryErrorCode(error);
      toastWarning(
        'Recovery not started',
        code === 'recovery-locked'
          ? 'More Practice is needed before this Recovery unlocks.'
          : code === 'recovery-window-ended'
            ? 'The final submission date has passed, so Recovery is closed.'
            : 'A fresh Recovery could not be prepared right now. Try again in a moment.',
      );
    } finally {
      setRecoveryBusySection(null);
    }
  };

  // One door into a Recovery from anywhere a student finds it — Home, the
  // Assignments Center, or the assignment's own header. It lands on the
  // assignment's Results route, where the panel and the runner already live,
  // and opens the practice, the server-built second try, or the one in
  // progress. Leaving an open assignment saves its activity first, as Back does.
  const openStudentRecovery = (opportunity) => {
    const assignmentId = opportunity?.assignmentId;
    const section = opportunity?.section;
    if (!assignmentId || !section) return;
    if (activeView === 'assignment' && activeAssignmentId) flushAssignmentActivity(activeAssignmentId).catch(() => {});
    openStudentAssignmentResult(assignmentId, { origin: 'assignments' });
    if (opportunity.action === 'start') {
      startStudentRecovery(assignmentId, section);
      return;
    }
    setRecoverySession({ assignmentId, section, mode: opportunity.action === 'continue' ? 'assessment' : 'practice' });
  };
  return [
    startAssignment, openStudentDashboardMode, practiseSkillFromResults, openStudentGradeCenter,
    openStudentAssignmentsCenter, navigateStudent, openStudentOriginLevel, openStudentAssignmentResult,
    joinLiveChallenge, leaveLiveChallenge, startStudentRecovery, openStudentRecovery,
  ];
}
