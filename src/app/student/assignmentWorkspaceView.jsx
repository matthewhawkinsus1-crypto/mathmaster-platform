/*
 * THE OPEN ASSIGNMENT: THE WORKSPACE A STUDENT WORKS IN, AND THE TEACHER'S VIEW AS STUDENT OF IT (renderAssignmentWorkspace).
 *
 * Moved verbatim from App.jsx. These are plain functions that return what App draws: not components, so React sees the same tree in the same place and nothing remounts. No state, no effects, no hooks. App builds them on every render, as it did when they were written inline, and passes what they read by position (tests/platform/appSplitViews.test.mjs holds the two sides to the same names in the same order). App calls this below the student navigation, the last thing these read; nothing reads them during render before that point.
 */
import { Fragment } from 'react';
import StudentSupportTools from '../../components/student/StudentSupportTools.jsx';
import { CLOSED_WORK, EXIT_TICKET, EXIT_TICKET_SPELLED_OUT, exitTicketInSentence } from '../../platform/student/studentWords.js';
import { describeDolClose, DOL_OPEN_NOTICE } from '../../platform/assessment/dolCloseCopy.js';
import { extraTimeFrom } from '../../platform/assessment/extraTimeWords.js';
import { isFamilyBackedQuestion } from '../../../functions/shared/questionFamilySlot.mjs';
import { resolveQuestionMaximumAttempts, resolveQuestionReplacementAllowed, resolveTeacherGrantedExtraAttempts } from '../../attemptPolicy';
import { buildQuestionDraftKey } from '../../questionDraftStorage';
import { formatRemainingTime, getWarmupState, getSectionVariantMode, studentDueDateLines } from '../../assignmentLifecycle';
import { nextHelpRequest } from '../../platform/supports/helpRequest.js';
import { questionFor } from '../../platform/supports/askTeacher.js';
import { TeacherAnswersList } from '../../components/student/TeacherAnswersList.jsx';
import { getStudentSupportPresentation } from '../../studentSupport';
import QuestionAnnouncer from '../../components/common/QuestionAnnouncer.jsx';
import DOLCountdown from '../../components/student/DOLCountdown.jsx';
import SectionTimeLeft from '../../components/student/SectionTimeLeft.jsx';
import {
  outcomeWithheld, QUESTION_STATUS, SECTION_ACCESS, NAVIGATOR_PENDING_LABEL, describeNavigatorQuestion,
  describeNavigatorSectionProgress, describeSectionAccess, sectionLandingEntry,
} from '../../platform/student/assignmentNavigator.js';
import { SR_ONLY_STYLE } from '../../ui/srOnly.js';
import { sameStableValue } from '../../platform/performance/renderStability.js';
import { questionRecordView } from '../../platform/performance/questionRecordView.js';
import { getEffectiveActivityPolicy } from '../../platform/policies/activityPolicies';
import { walkthroughTimerRemaining } from '../../platform/teacher/liveTeachingSession.js';
import { describeClassworkPace } from '../../platform/teacher/classworkModel.js';
import { projectCurrentAssignmentContent } from '../../platform/assignments/currentContentProjection.js';
import { splitGrade, splitGradesBySection } from '../../platform/teacher/gradeEvidence.js';
import { resolveAssignmentHandoff, resolveSkippedQuestion } from '../../platform/student/assignmentHandoff.js';
import { assignmentFeedbackWasReleased, assignmentHasHeldTeacherFeedback, createPracticeAssignmentTracker } from './assignmentRuntimeHelpers.js';
import { QuestionEngine, TeacherQuestionReviewPanel, WarmupChallengeGate } from '../lazyScreens.js';
import { questionAssessmentFramework } from '../../platform/student/questionAssessmentFramework.js';
import { FRAMEWORK_LABELS } from '../../platform/ccmr/frameworkLabels.js';
import { resolveDeliveredQuestionMetadata } from '../../platform/assignments/assignmentAdaptation.js';
import { RecoveryInlineNotice } from '../../components/student/RecoveryOpportunities.jsx';
import { ASSIGNMENT_NAV_HEIGHT_VAR, stickyHeightRef } from '../../platform/layout/stickyHeightRef.js';
import ChallengeRewardsEarned from '../../components/student/rewards/ChallengeRewardsEarned.jsx';
import {
  WARMUP_CHALLENGE_ROUTE, resolveWarmupChallenge, shouldShowChallengeHandoffBanner, shouldShowChallengeLobbyInvite,
  shouldShowWarmupWaitingPanel,
} from '../../platform/liveChallenge/warmupChallengeLink.js';
import { NO_RECORDS } from './noRecords.js';
import { db } from '../../firebase.js';
import { recordAttemptSignal } from '../../platform/signals/attemptSignalWriter.js';
import { notePlatformLinkOpened } from '../../platform/signals/attemptSignalFacts.js';

export function createAssignmentWorkspaceView(
  user, studentClassPoints, hasPracticePassFor, studentRequiredFor, assignmentResultRoute, activeClassroomSectionKey,
  setActiveClassroomSectionKey, setActiveView, setTeacherTab, liveTeachingSession, activeAssignmentId,
  setActiveAssignmentId, tracker, studentPersistenceStatus, studentReportingError, workspaceDraftGeneration,
  draftRestoreFocus, serverDeliveryPins, practiceTracker, previewTracker, previewSessionId, currentQuestionIndex,
  assignmentNavigationCollapsed, assignmentOverviewExpanded, setAssignmentOverviewExpanded, assignmentStatusOpenFor,
  setAssignmentStatusOpenFor, sectionLockNote, setSectionLockNote, assignmentQuestionStageRef,
  toggleAssignmentNavigation, now, renderMemo, stableCallbacks, classSchedule, classworkGradesByAssignment,
  getSectionAccessState, classroomSyncStatusByAssignment, setStudentDashboardMode, studentDashboardMode,
  setWarmupChallengePlayedRoomIds, warmupChallengePlayedRoomIds, liveChallengeInvite, studentRecoveryByAssignment,
  studentLearningProfile, adaptiveStudentProfile, askMyTeacher, helpRequest, setHelpRequest, fetchAssignments,
  studentSaveLine, studentDraftSaveProblem, studentSaveLineShown, studentSaveLineRoutine, studentSaveLineAnnouncement,
  calculatePracticeProgress, flushAssignmentActivity, activeAssignmentData, activeQuestions, activeLifecycle,
  isTeacherPreview, activeSupportPresentation, recordStudentSupportEvidence, activeDOLState, activeQuestionRole,
  activeActivityPolicy, checkpointOutcomes, activeAssignmentUsesWorkspaceDrafts, publishSpotlightWork,
  studentSpotlightRequest, familyDelivery, isPersonalizedBlueprint, changeQuestion, startTeacherPreview,
  teachAssignmentLive, endLiveTeaching, controlWalkthroughTimer, handleLoadScratchpad, handleSaveScratchpad,
  handleFamilyDelivery, handlePreviewFamilyDelivery, handleResponseCheckpoint, countedQuestionFor,
  countedQuestionKnownFor, handleGradeSubmit, handleRequestNewQuestion, handleStepGrade, studentActiveWarmup,
  renderStudentWarmupBanner, renderIdleOverlay, lobbyInviteHeldHere, joinLiveChallenge, openStudentAssignmentResult,
  openStudentRecovery, startAssignment,
) {
  const renderAssignmentWorkspace = (preview = false) => {
    const assignment = activeAssignmentData;
    if (!assignment) {
      return (
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <p>This assignment is no longer available.</p>
          <button onClick={() => setActiveView('dashboard')} style={{ marginTop: '16px' }}>Return</button>
        </div>
      );
    }

    // Worked out above for this same assignment, once per change of what
    // each reads (a preview is a teacher's, whose lifecycle names no student).
    // What follows reads the same assignment, the bell windows, the lifecycle
    // and the clock on every render, so each of those reads is kept
    // (renderMemo) until one of its inputs changes.
    const questions = activeQuestions;
    const currentContent = renderMemo('currentContent', [assignment], () => projectCurrentAssignmentContent(assignment));
    const lifecycle = activeLifecycle;
    /*
     * A GRANTED PRACTICE PASS EXCUSES PRACTICE FROM THIS RUNTIME.
     *
     * Never for Teacher Preview (no student redemption to read), and never
     * once the assignment has moved into post-deadline voluntary Practice
     * Mode -- that already runs against a completely separate, already-
     * non-credit tracker (`workingTracker` below), and must remain unchanged.
     */
    const hasPracticePass = !preview && !lifecycle.isPracticeOnly && hasPracticePassFor(assignment.id);
    // This student's own required items: a reduced-item-count accommodation
    // omits some (never in a preview or voluntary practice). Omitted items are
    // not shown, not counted and never "left to do".
    const studentRequired = !preview && !lifecycle.isPracticeOnly
      ? studentRequiredFor(assignment, { hasPracticePass })
      : null;
    const studentRequiredSet = studentRequired?.omitted?.length ? new Set(studentRequired.indices) : null;
    const projectedEntries = (activeClassroomSectionKey
      ? currentContent.entries.filter((entry) => entry.logicalRole === activeClassroomSectionKey)
      : hasPracticePass
        ? currentContent.entries.filter((entry) => entry.logicalRole !== 'practice')
        : currentContent.entries)
      .filter((entry) => !studentRequiredSet || studentRequiredSet.has(entry.storageIndex));
    const includedQuestionIndices = projectedEntries.map((entry) => entry.storageIndex);
    const workspaceSupportProfile = !preview && !lifecycle.isPracticeOnly && user?.role === 'student' ? user.profile : null;
    // The RECORDED grade is the student's real grade in every mode, so it is
    // over their own required items even in post-deadline Practice Mode — the
    // number the Grade Center and Classroom show.
    const officialSupportProfile = !preview && user?.role === 'student' ? user.profile : null;
    const recordedTracker = tracker[activeAssignmentId] || NO_RECORDS;
    const workingTracker = preview
      ? previewTracker
      : lifecycle.isPracticeOnly
        ? practiceTracker[activeAssignmentId] || renderMemo('practiceTracker', [questions, recordedTracker], () => createPracticeAssignmentTracker(questions, recordedTracker))
        : recordedTracker;
    // The grade lines: worked out once per change of the trackers, the
    // assignment and the profiles they read (and of the clock, for the
    // reduced-workload revision in effect today), not on each of a Submit's
    // renders. recordedGrade is calculateGrade's own answer from the split.
    const [gradeSplit, progress, currentSectionGrades, currentSectionOfficialGrades] = renderMemo('grades', [recordedTracker, workingTracker, assignment, officialSupportProfile, workspaceSupportProfile, hasPracticePass, now], () => [
      splitGrade({ tracker: recordedTracker, assignment, supportProfile: officialSupportProfile }),
      calculatePracticeProgress(workingTracker, assignment, { hasPracticePass }),
      splitGradesBySection({ tracker: workingTracker, assignment, supportProfile: workspaceSupportProfile }),
      splitGradesBySection({ tracker: recordedTracker, assignment, supportProfile: officialSupportProfile }),
    ]);
    const recordedGrade = questions.length ? gradeSplit.score ?? 0 : 0;
    const classroomReceipt = !preview ? classroomSyncStatusByAssignment?.[assignment.id] || null : null;
    const classroomReceiptStage = String(classroomReceipt?.stage || '');
    const classroomReceiptFinal = classroomReceipt?.isFinal === true || classroomReceiptStage.startsWith('final-');
    const classroomReceiptStudentVisible = classroomReceipt?.studentVisible === true;
    const classroomReceiptGrade = Number.isFinite(Number(classroomReceipt?.grade))
      ? Number(classroomReceipt.grade)
      : null;
    const classroomReceiptCurrent = classroomReceiptGrade != null && classroomReceiptGrade === recordedGrade;
    const dolState = activeDOLState;
    const warmupState = renderMemo('warmupState', [assignment, classSchedule, user?.classId, user?.classPeriod, now], () => getWarmupState({ assignment, schedule: classSchedule, classId: user?.classId || null, classPeriod: user?.classPeriod, nowValue: now }));
    // A teacher previewing an assignment is never handed into a live game.
    const warmupChallengeDecision = preview ? null : resolveWarmupChallenge({
      assignment,
      assignmentId: activeAssignmentId,
      warmupState,
      invite: liveChallengeInvite,
      playedRoomIds: warmupChallengePlayedRoomIds,
    });
    const currentRecord = questionRecordView(workingTracker?.[currentQuestionIndex]);
    const currentIsDOL = !lifecycle.isPracticeOnly && activeQuestionRole === 'dol' && dolState.enabled && (dolState.questionIndices || [dolState.questionIndex]).includes(currentQuestionIndex);
    const currentIsWarmup = !lifecycle.isPracticeOnly && activeQuestionRole === 'warmup' && warmupState.enabled;
    // A finalization receipt ("Time ended…") describes a close. When the
    // teacher reopens the Warm-Up (or recovers the DOL), the section is open
    // again and the receipt from the earlier window no longer describes it.
    const currentSectionOpenNow = (currentIsWarmup && warmupState.status === 'active')
      || (currentIsDOL && dolState.status === 'active');
    const currentManualSectionState = renderMemo('currentManualSectionState', [getSectionAccessState, assignment, activeQuestionRole, user?.classId, user?.classPeriod, now, preview, user?.role, user?.id], () => getSectionAccessState({
      assignment,
      activityRole: activeQuestionRole,
      classId: user?.classId || null,
      classPeriod: user?.classPeriod,
      nowValue: now,
      studentId: !preview && user?.role === 'student' ? user.id : undefined,
    }));
    const currentSectionManuallyLocked = !preview
      && !lifecycle.isPracticeOnly
      && currentManualSectionState.enabled
      && !currentManualSectionState.isOpen;
    const assignmentFeedbackHeld = !preview && !lifecycle.isPracticeOnly && renderMemo('heldTeacherFeedback', [assignment], () => assignmentHasHeldTeacherFeedback(assignment));
    const currentFeedbackReleased = lifecycle.isPracticeOnly || assignmentFeedbackWasReleased(assignment)
      || (activeActivityPolicy.feedback === 'afterAssignmentSubmit' && ['correct', 'expired'].includes(currentRecord.status));
    const runtimeActivityRole = !preview && lifecycle.isPracticeOnly ? 'practice' : activeQuestionRole;
    const runtimeActivityPolicy = getEffectiveActivityPolicy(runtimeActivityRole);
    const currentCheckpointOutcome = preview ? null : checkpointOutcomes[currentQuestionIndex] || null;
    // The DOL's lock message, open notice and close receipt: a teacher's
    // "Close now" never reads as the timer, and "when time ends" only while it is open.
    const currentDolCopy = currentIsDOL && !preview
      ? describeDolClose({ status: dolState.status, teacherClosed: dolState.teacherClosed, outcome: currentCheckpointOutcome, extendedTime: dolState.extendedTime, endsAt: dolState.endsAt })
      : null;
    const currentQuestionBlueprint = questions[currentQuestionIndex];
    const currentReplacementAllowed = resolveQuestionReplacementAllowed({
      question: currentQuestionBlueprint,
      activityPolicy: runtimeActivityPolicy,
      canGenerateFresh: isPersonalizedBlueprint(currentQuestionBlueprint),
    });
    const runtimeQuestionActivityPolicy = currentReplacementAllowed === runtimeActivityPolicy.allowReplacement
      ? runtimeActivityPolicy
      : renderMemo('activityPolicy', [runtimeActivityPolicy, currentReplacementAllowed], () => ({ ...runtimeActivityPolicy, allowReplacement: currentReplacementAllowed }));
    const currentSectionVariantMode = getSectionVariantMode(assignment, activeQuestionRole);
    const generationStudentKey = currentSectionVariantMode === 'shared'
      ? `shared-version:${assignment.id}:${activeQuestionRole}`
      : preview ? 'teacher-preview' : user?.id || 'anonymous';
    // QUESTION FAMILY SLOTS: this student's seat, the variant, and any pin that
    // already says which question they were shown. Null for every other slot,
    // which therefore generates exactly as it always has. The question waits
    // for the family engine (loadFamilyDelivery): a family-backed slot rendered
    // with a null context would be dealt a fresh instance past its pin, and
    // whether a replacement is offered is decided with it. It shares
    // QuestionEngine's own lazy chunk, so in practice it is already here.
    const familyEngineLoading = !familyDelivery;
    // The server's pins, once read, for this assignment only (RT15).
    const serverPinsRead = serverDeliveryPins.assignmentId === assignment.id && serverDeliveryPins.known;
    // Built on every render, as it always was: it reads this device's delivery
    // pins from storage, which no React input says has changed (a pin written
    // when the question reports what it showed). Kept while it says the same.
    const currentFamilyContext = !familyDelivery ? null : renderMemo('familyContext', null, () => familyDelivery.buildStudentFamilyContext({
      assignment,
      question: questions[currentQuestionIndex],
      storageIndex: currentQuestionIndex,
      studentId: preview ? null : user?.id || null,
      classId: user?.classId || null,
      sectionMode: currentSectionVariantMode,
      record: workingTracker?.[currentQuestionIndex],
      preview,
      serverPins: serverPinsRead ? serverDeliveryPins.pins : null,
    }), sameStableValue);
    // A FRESH ALLOCATION WAITS FOR THE SERVER'S PINS (RT15). A personalized
    // question with no pin on this device — none from its record, none of its
    // own — would be dealt numbers here that another Chromebook may already
    // have shown the student. Its server copy is read as the assignment opens;
    // the question waits for it (FAMILY_PIN_SERVER_WAIT_MS at most) instead of
    // swapping numbers under the student a moment later. Only where that read
    // happens: a student's own assignment, never a preview or a Test Cycle.
    const familyPinPending = Boolean(currentFamilyContext)
      && !preview
      && user?.role === 'student'
      && !isTeacherPreview
      && activeAssignmentUsesWorkspaceDrafts
      && !serverPinsRead
      && !currentFamilyContext.pin
      && !currentFamilyContext.pinUnreadable;

    // ADAPTATION, RESOLVED ONCE.
    //
    // The same value is used to generate the question and, at grade time, to
    // record what was actually delivered. Resolving it in two places would let
    // the evidence disagree with the question the student answered — which is
    // the defect this whole seam exists to close.
    // Pure in its inputs; the learning profile is rebuilt with every tracker
    // change, so a result that says the same keeps its identity.
    const currentAdaptation = preview ? null : renderMemo('adaptation', [questions[currentQuestionIndex], studentLearningProfile, runtimeActivityRole, currentSectionVariantMode, user?.profile?.courseLevel], () => resolveDeliveredQuestionMetadata({
      question: questions[currentQuestionIndex],
      learningProfile: studentLearningProfile,
      activityRole: runtimeActivityRole,
      variationMode: currentSectionVariantMode,
      honors: String(user?.profile?.courseLevel || '').toLowerCase() === 'honors',
    }), sameStableValue);
    const draftSessionMode = preview ? 'preview' : lifecycle.isPracticeOnly ? 'post-deadline-practice' : lifecycle.isLate ? 'late' : 'graded';
    const supportPresentation = preview ? getStudentSupportPresentation({}) : activeSupportPresentation;
    const replacementWarning = currentIsDOL && dolState.status === 'active'
      ? `A new ${exitTicketInSentence} question replaces this one and erases your answer to it. You will have only ${formatRemainingTime(dolState.millisecondsRemaining)} left to submit the new one.`
      : '';

    if (!includedQuestionIndices.length) {
      return (
        <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'sans-serif' }}>
          <h2>No questions are currently included</h2>
          <p>The teacher has excluded every question from this assignment.</p>
          <button onClick={() => { setActiveView('dashboard'); setActiveAssignmentId(null); }}>Back to Home</button>
        </div>
      );
    }

    const lifecycleBadge = lifecycle.isPracticeOnly
      ? { label: CLOSED_WORK.label, background: 'var(--mm-surface-control)', color: 'var(--mm-text)' }
      : lifecycle.isLate
        ? { label: 'Late — still open', background: 'var(--mm-warning-soft)', color: 'var(--mm-warning-text)' }
        : lifecycle.isScheduled
          ? { label: 'Scheduled', background: 'var(--mm-surface-control-strong)', color: 'var(--mm-text)' }
          // On time is the ordinary case: no badge (pass 3, RUN-16 — "ON-TIME
          // ACCESS" named a program state, not anything the student does).
          : { label: '', background: 'transparent', color: 'var(--mm-text)' };

    // Bundle/V5 activities are flattened for runtime compatibility, but every
    // question keeps its activityRole. Rebuild the visible sections here so a
    // student can tell when they are in the Warm-Up, Classwork, Practice, or
    // DOL instead of seeing one undifferentiated row of question numbers.
    const activitySectionMeta = {
      warmup: { label: 'Warm-Up', background: 'var(--mm-warning-soft)', color: 'var(--mm-warning-text)', border: '#f9ab00' },
      classwork: { label: 'Classwork', background: 'var(--mm-primary-soft)', color: 'var(--mm-primary-text)', border: '#1a73e8' },
      practice: { label: 'Practice', background: 'var(--mm-success-bg)', color: 'var(--mm-success-text)', border: '#34a853' },
      dol: { label: EXIT_TICKET_SPELLED_OUT, background: 'var(--mm-accent-soft)', color: 'var(--mm-accent-text)', border: '#9334e6' },
      checkpoint: { label: 'Checkpoint', background: 'var(--mm-error-bg)', color: 'var(--mm-error-text)', border: '#d93025' },
      quiz: { label: 'Quiz', background: 'var(--mm-error-bg)', color: 'var(--mm-error-text)', border: '#d93025' },
      test: { label: 'Test', background: 'var(--mm-error-bg)', color: 'var(--mm-error-text)', border: '#d93025' },
    };
    // With fewer required items, "Question 3 of 6" counts this student's own
    // items in the section, not the class's (never "Question 5 of 3").
    const requiredSectionPosition = new Map();
    if (studentRequiredSet) {
      const seen = new Map();
      projectedEntries.forEach((entry) => {
        const position = seen.get(entry.logicalRole) || 0;
        requiredSectionPosition.set(entry.storageIndex, position);
        seen.set(entry.logicalRole, position + 1);
      });
    }
    const visibleQuestionEntries = projectedEntries.map((entry, visiblePosition) => {
      const index = entry.storageIndex;
      const question = questions[index];
      const isTimedDOLQuestion = dolState.enabled && (dolState.questionIndices || [dolState.questionIndex]).includes(index);
      const sectionPosition = studentRequiredSet ? requiredSectionPosition.get(index) : entry.logicalPosition;
      return { index, visiblePosition, sectionPosition, question, role: entry.logicalRole, isTimedDOLQuestion };
    });
    const sectionQuestionIsComplete = (index) => ['correct', 'expired'].includes(questionRecordView(workingTracker?.[index]).status);
    const visibleByStorageIndex = new Map(visibleQuestionEntries.map((entry) => [entry.index, entry]));
    const navigationSections = currentContent.logicalSections.map((logicalSection) => ({
      role: logicalSection.role,
      entries: logicalSection.entries.map((entry) => visibleByStorageIndex.get(entry.storageIndex)).filter(Boolean),
    })).filter((section) => section.entries.length).map((section) => ({
      ...section,
      complete: section.entries.length > 0 && section.entries.every((entry) => sectionQuestionIsComplete(entry.index)),
      // `progress` and `allCorrect` (the tab's "✓ Complete") are filled in
      // below from the navigator's question states, held-feedback mask included.
      progress: null,
      allCorrect: false,
    }));
    const currentSectionMeta = activitySectionMeta[activeQuestionRole] || {
      label: String(activeQuestionRole || 'Activity').replace(/(^|\s)\S/g, (letter) => letter.toUpperCase()),
      background: 'var(--mm-surface-control)', color: 'var(--mm-text)', border: 'var(--mm-border-strong)',
    };
    // Practice keeps Guided Notes off by default: the owner's decision (FB20, 2026-10-23).
    const currentGuidedNotesMode = assignment?.guidedNotesBySection?.[activeQuestionRole]
      || (activeQuestionRole === 'classwork' ? 'automatic' : 'off');

    const assignmentHasClasswork = visibleQuestionEntries.some((entry) => entry.role === 'classwork');
    const currentVisibleEntryPosition = visibleQuestionEntries.findIndex((entry) => entry.index === currentQuestionIndex);
    const currentVisibleEntry = currentVisibleEntryPosition >= 0 ? visibleQuestionEntries[currentVisibleEntryPosition] : null;
    const currentNavigationSection = navigationSections.find((section) => section.entries.some((entry) => entry.index === currentQuestionIndex));
    const currentSectionQuestionNumber = (currentVisibleEntry?.sectionPosition ?? 0) + 1;
    const currentSectionQuestionCount = currentNavigationSection?.entries.length || 1;
    const currentSectionCompletedCount = currentNavigationSection?.entries.filter((entry) => sectionQuestionIsComplete(entry.index)).length || 0;
    const currentSectionRemainingCount = Math.max(0, currentSectionQuestionCount - currentSectionCompletedCount);
    /*
     * WHAT EACH SECTION AND QUESTION IS DOING NOW, SAID ONE WAY (pass 3,
     * RUN-5 / RUN-8 / RUN-9; platform/student/assignmentNavigator.js).
     *
     * A section can be open, read-only (closed, its work still there to look
     * over: a Warm-Up closed for the period, an ended DOL, Classwork the
     * teacher closed) or locked (not open yet) — and a locked one says when or
     * why. A question is correct, needs another try, closed, submitted (held
     * feedback: never right or wrong) or not started. The tabs, the number
     * strip, the dropdown and the Overview all read these.
     */
    const sectionHasWork = (role) => projectedEntries.some((entry) => entry.logicalRole === role
      && questionRecordView(workingTracker?.[entry.storageIndex]).totalAttempts > 0);
    /*
     * WHAT THE NAVIGATOR SAYS, ONCE PER CHANGE OF WHAT IT READS.
     *
     * A section's access (with the dates and times in its reason) and each
     * question's line were worked out again on every one of App's renders,
     * 8 to 13 ms of a Submit at 4x CPU, though a Submit changes one
     * question's record. Each is kept (renderMemo) until something it reads
     * changes: a section, on the windows, the lifecycle, the teacher's lock,
     * the clock and whether the section has work; a question, on its record,
     * its question, its section's access and the policy and the student its
     * tries are counted for. A family slot's tries are counted on what this
     * page was shown and the pin on this device, which no React input
     * announces, so its line is worked out on every render, as before.
     */
    const sectionAccessCache = new Map();
    const sectionAccessFor = (entry) => {
      const cacheKey = `${entry?.role}|${entry?.isTimedDOLQuestion ? 'timed' : ''}`;
      if (sectionAccessCache.has(cacheKey)) return sectionAccessCache.get(cacheKey);
      const hasWork = sectionHasWork(entry?.role);
      const access = renderMemo(`navigatorSection|${cacheKey}`, [preview, lifecycle, warmupState, dolState, getSectionAccessState, assignment, user?.classId, user?.classPeriod, user?.role, user?.id, now, hasWork], () => describeSectionAccess({
        role: entry?.role,
        // Read mid-sentence ("Time is up for the exit ticket."); the model
        // capitalises a sentence that starts with it. The section tab above
        // has already spelled it out (D9: once per screen).
        label: entry?.role === 'dol' ? `the ${exitTicketInSentence}` : `the ${activitySectionMeta[entry?.role]?.label || entry?.role || 'section'}`,
        timedDol: Boolean(entry?.isTimedDOLQuestion),
        unrestricted: preview || lifecycle.isPracticeOnly,
        lifecycle,
        warmupState,
        dolState,
        manualState: getSectionAccessState({
          assignment,
          activityRole: entry?.role,
          classId: user?.classId || null,
          classPeriod: user?.classPeriod,
          nowValue: now,
          studentId: user?.role === 'student' ? user.id : undefined,
        }),
        hasWork,
        nowValue: now,
      }));
      sectionAccessCache.set(cacheKey, access);
      return access;
    };
    // Viewable: a closed section stays reachable read-only.
    const entryIsAvailable = (entry) => sectionAccessFor(entry).viewable;
    const entryMaximumAttempts = (entry) => {
      const policy = getEffectiveActivityPolicy(entry.role);
      return resolveQuestionMaximumAttempts({
        question: countedQuestionFor(assignment, entry.index, workingTracker?.[entry.index], questions[entry.index], preview),
        maximumAttempts: policy.attempts,
        activityPolicy: policy,
        teacherGrantedExtraAttempts: resolveTeacherGrantedExtraAttempts({
          assignment,
          activityRole: entry.role,
          classId: user?.classId || null,
          studentId: user?.role === 'student' ? user.id : null,
        }),
      });
    };
    // The policy the question itself runs under (post-deadline practice runs
    // every question as Practice).
    const entryRuntimePolicy = (entry) => getEffectiveActivityPolicy(!preview && lifecycle.isPracticeOnly ? 'practice' : entry.role);
    // The held-feedback mask: wherever the question withholds its outcome — a
    // quiz or test until the teacher's release, a DOL until it is finished
    // (a teacher's extra try leaves it open) — the navigator says nothing of
    // right or wrong either (outcomeWithheld, the engine's own rule).
    const entryFeedbackHeld = (entry) => !preview && outcomeWithheld({
      feedbackMode: entryRuntimePolicy(entry).feedback,
      released: lifecycle.isPracticeOnly || assignmentFeedbackWasReleased(assignment),
      record: workingTracker?.[entry.index],
    });
    const navigatorQuestionFor = (entry) => {
      const access = sectionAccessFor(entry);
      const policy = entryRuntimePolicy(entry);
      const describe = () => describeNavigatorQuestion({
        record: workingTracker?.[entry.index],
        maximumAttempts: entryMaximumAttempts(entry),
        // A family slot's tries are counted on the question it dealt; before
        // the family engine lands (a reload straight into the assignment) that
        // is not known, and the navigator neither counts nor labels it.
        triesKnown: countedQuestionKnownFor(assignment, entry.index, workingTracker?.[entry.index], preview),
        feedbackHeld: entryFeedbackHeld(entry),
        sectionClosed: access.state === SECTION_ACCESS.READ_ONLY,
        available: access.viewable,
        lockedLabel: access.short,
        // Out of tries, the question offers "Request New Question" when its
        // policy allows a replacement (as the question decides it).
        replacementAvailable: resolveQuestionReplacementAllowed({
          question: questions[entry.index],
          activityPolicy: policy,
          canGenerateFresh: isPersonalizedBlueprint(questions[entry.index]),
        }),
        // Whether it can vary is decided by rules that arrive with the family
        // engine: until then an offer its policy would make is not known.
        replacementKnown: Boolean(familyDelivery) || !resolveQuestionReplacementAllowed({ activityPolicy: policy, canGenerateFresh: true }),
      });
      if (isFamilyBackedQuestion(questions[entry.index])) return describe();
      return renderMemo(`navigatorQuestion|${entry.index}`, [entry.role, workingTracker?.[entry.index], questions[entry.index], assignment, preview, lifecycle.isPracticeOnly, access, user?.classId, user?.role, user?.id, familyDelivery], describe);
    };
    const compactSectionLabel = (section) => section?.role === 'dol'
      ? EXIT_TICKET_SPELLED_OUT
      : (activitySectionMeta[section?.role]?.label || section?.role || 'Section');
    // A section tab lands on the first question the student can still work,
    // never on one out of tries while a workable one is left; with nothing
    // workable, a closed section opens for review.
    const sectionNavigationTarget = (section) => sectionLandingEntry({
      entries: (section?.entries || []).map((entry) => ({
        ...entry,
        viewable: entryIsAvailable(entry),
        workable: entryIsWorkableNow(entry),
        status: navigatorQuestionFor(entry).status,
      })),
      currentIndex: currentQuestionIndex,
    });
    navigationSections.forEach((section) => {
      section.progress = describeNavigatorSectionProgress({
        questions: section.entries.map((entry) => navigatorQuestionFor(entry)),
        feedbackHeld: section.entries.some((entry) => entryFeedbackHeld(entry)),
      });
      section.allCorrect = section.progress.allCorrect;
    });
    const findNeighbor = (direction) => {
      for (let position = currentVisibleEntryPosition + direction; position >= 0 && position < visibleQuestionEntries.length; position += direction) {
        if (entryIsAvailable(visibleQuestionEntries[position])) return visibleQuestionEntries[position];
      }
      return null;
    };
    const previousQuestionEntry = findNeighbor(-1);
    const nextQuestionEntry = findNeighbor(1);
    // The question's own "Next" goes to the next question the student can
    // still answer; a closed section kept viewable for review (RUN-8) is
    // reached by the arrows and tabs, not walked into after an answer.
    const engineNextEntry = visibleQuestionEntries
      .slice(currentVisibleEntryPosition + 1)
      .find((entry) => entryIsWorkableNow(entry)) || nextQuestionEntry;
    const nextQuestionSectionMeta = engineNextEntry ? (activitySectionMeta[engineNextEntry.role] || { label: engineNextEntry.role }) : null;
    const nextQuestionDestinationLabel = engineNextEntry ? `Question ${engineNextEntry.sectionPosition + 1} of ${navigationSections.find((section) => section.role === engineNextEntry.role)?.entries.length || 1}` : '';
    const currentNavigationSectionIndex = navigationSections.findIndex((section) => section.role === currentNavigationSection?.role);
    const laterNavigationSections = currentNavigationSectionIndex >= 0
      ? navigationSections.slice(currentNavigationSectionIndex + 1)
      : [];
    // When a student finishes an entire section, point the celebration CTA at
    // the next AVAILABLE unfinished section. A locked DOL is intentionally
    // skipped rather than becoming a dead-end button.
    // "Can be viewed" is not "can be worked now": a Warm-Up closed for the
    // period or an ended DOL stays viewable for review, but the continue
    // button must only ever lead to an unfinished question open right now.
    function entryIsWorkableNow(entry) {
      if (!sectionAccessFor(entry).workable) return false;
      if (preview || lifecycle.isPracticeOnly) return true;
      if (entry?.role === 'warmup' && warmupState.enabled) return warmupState.status === 'active';
      if (entry?.isTimedDOLQuestion && dolState.enabled) return dolState.status === 'active';
      return true;
    }
    const sectionWorkTarget = (section) => (section?.entries || [])
      .find((entry) => entryIsWorkableNow(entry) && !sectionQuestionIsComplete(entry.index)) || null;
    const nextAvailableIncompleteSection = laterNavigationSections.find((section) => sectionWorkTarget(section));
    // Only a section with work left: "Continue to Practice" with Practice
    // already complete was a dead loop. With none left, hand off to Up next
    // (what Home would recommend) or to this assignment's results.
    const nextAvailableSection = nextAvailableIncompleteSection
      // An EARLIER section still open with work left beats leaving the assignment.
      || navigationSections.find((section) => section.role !== currentNavigationSection?.role && sectionWorkTarget(section))
      || null;
    const nextAvailableSectionTarget = nextAvailableSection ? sectionWorkTarget(nextAvailableSection) : null;
    const nextAvailableSectionMeta = nextAvailableSection
      ? (activitySectionMeta[nextAvailableSection.role] || { label: nextAvailableSection.role })
      : null;
    // Decision 4: a section is done at ANY accuracy — out of tries counts —
    // so the hand-off follows terminal completion; `allCorrect` stays for the
    // tab's correctness styling only.
    const assignmentHandoff = currentNavigationSection?.complete
      ? resolveAssignmentHandoff({
        nextIncompleteSection: nextAvailableSectionTarget ? nextAvailableSection : null,
        nextIncompleteSectionLabel: nextAvailableSectionMeta?.label || '',
        student: !preview && user?.role === 'student',
      })
      : null;
    // Finishing lands on this assignment's results; its Up next card is the
    // second action there (RUN-12, assignmentHandoff.js).
    const continueAfterSection = !assignmentHandoff
      ? null
      : assignmentHandoff.kind === 'section'
        ? () => changeQuestion(nextAvailableSectionTarget.index)
        : () => openStudentAssignmentResult(activeAssignmentId, { origin: 'assignments' });
    // Nothing workable ahead and the section not done: the way back to the
    // question that was skipped (RUN-12).
    const skippedQuestion = !nextQuestionEntry && !currentNavigationSection?.complete
      ? resolveSkippedQuestion({
        entries: visibleQuestionEntries,
        currentIndex: currentQuestionIndex,
        currentRole: currentNavigationSection?.role,
        isWorkable: entryIsWorkableNow,
        isComplete: sectionQuestionIsComplete,
        attemptCountOf: (index) => questionRecordView(workingTracker?.[index]).attemptCount,
        sectionLabelOf: (role) => (role === 'dol' ? EXIT_TICKET : activitySectionMeta[role]?.label || ''),
      })
      : null;
    // "Ask my teacher" on this question: rebuilt only when what it says does
    // (the mode turns at the bell, a question is left or answered).
    const askTeacherQuestion = questionFor(askMyTeacher.questions, { assignmentId: activeAssignmentId, questionIndex: currentQuestionIndex });
    const { onSendQuestion } = stableCallbacks({
      onSendQuestion: askMyTeacher.canLeaveQuestion
        ? ({ existing, text }) => askMyTeacher.sendQuestion({
          existing,
          text,
          questionIndex: currentQuestionIndex,
          questionLabel: `${currentSectionMeta.label} · Question ${currentSectionQuestionNumber}`,
          assignmentTitle: assignment?.title || '',
        })
        : null,
    });
    const askTeacherContext = renderMemo('askTeacherContext', [askMyTeacher.mode, askMyTeacher.acknowledgement, askTeacherQuestion, onSendQuestion], () => ({
      mode: askMyTeacher.mode,
      acknowledgement: askMyTeacher.acknowledgement,
      question: askTeacherQuestion,
      onSendQuestion,
    }));
    const returnsToAssignmentResult = !preview
      && assignmentResultRoute?.assignmentId === activeAssignmentId;
    // Name the destination, not the direction. A student who opened this from
    // the Assignments Center should be told they are going back to it.
    const studentAssignmentBackLabel = returnsToAssignmentResult
      ? 'Back to Results'
      : studentDashboardMode === 'assignmentsCenter'
        ? 'Back to Assignments'
        : studentDashboardMode === 'grades'
          ? 'Back to Grades'
          : studentDashboardMode === 'testCycle'
            ? 'Back to the Test Cycle'
            : 'Back to Home';
    /*
     * ONE STATUS CHIP ON A PHONE (pass 3, NAV-5). A phone hides the header and
     * every banner above the work, so a late deadline, "no credit" and a live
     * challenge used to vanish there. The chip in the navigator names the most
     * urgent one; pressing it opens the full lines. (Wider screens keep the
     * banners and hide the chip.)
     */
    const dolSectionIndices = dolState.questionIndices || [dolState.questionIndex];
    const assignmentStatusLines = preview ? [] : [
      shouldShowChallengeHandoffBanner({ invite: liveChallengeInvite, warmupDecision: warmupChallengeDecision }) && {
        key: 'liveChallenge',
        tone: 'live',
        chip: '⚡ Join the challenge',
        title: 'Live Challenge has started',
        text: `${liveChallengeInvite?.title || 'Your class challenge'} is live now. Your assignment work is saved when you switch.`,
      },
      // The lobby is open, the game not started (NAV-25): offered here too.
      !lobbyInviteHeldHere && shouldShowChallengeLobbyInvite({ invite: liveChallengeInvite, warmupDecision: warmupChallengeDecision }) && {
        key: 'liveChallenge',
        tone: 'live',
        chip: '⚡ Challenge lobby open',
        title: 'Your teacher opened the Live Challenge lobby',
        text: 'Your assignment work is saved when you switch, and you come back to this question after the game.',
      },
      !lifecycle.isPracticeOnly && dolState.status === 'active' && !dolSectionIndices.includes(currentQuestionIndex)
        && dolSectionIndices.some((index) => questionRecordView(workingTracker?.[index]).totalAttempts === 0) && {
        key: 'dol',
        tone: 'dol',
        chip: `${EXIT_TICKET_SPELLED_OUT} open`,
        title: `The ${exitTicketInSentence} is open`,
        text: `Finish all ${dolSectionIndices.length} question${dolSectionIndices.length === 1 ? '' : 's'} before time runs out.`,
        action: { label: `Go to the ${exitTicketInSentence}`, onClick: () => { setAssignmentStatusOpenFor(null); changeQuestion(dolSectionIndices[0]); } },
      },
      // Timed windows mean nothing in post-deadline practice.
      !lifecycle.isPracticeOnly && warmupState.status === 'active' && activeQuestionRole !== 'warmup'
        && visibleQuestionEntries.some((entry) => entry.role === 'warmup' && !['correct', 'expired'].includes(questionRecordView(workingTracker?.[entry.index]).status)) && {
        key: 'warmup',
        tone: 'warmup',
        chip: 'Warm-Up open',
        title: 'The Warm-Up is open',
        text: `It closes at ${warmupState.endsAt ? new Date(warmupState.endsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'the end of its window'}.`,
        action: { label: 'Go to the Warm-Up', onClick: () => { setAssignmentStatusOpenFor(null); const first = visibleQuestionEntries.find((entry) => entry.role === 'warmup'); if (first) changeQuestion(first.index); } },
      },
      lifecycle.isLate && {
        key: 'late',
        tone: 'late',
        chip: `Late · closes ${studentDueDateLines(assignment, lifecycle).finalText}`,
        title: 'Late, still open',
        text: `The due date passed. You have ${formatRemainingTime(lifecycle.millisecondsRemaining)} before this assignment closes on ${studentDueDateLines(assignment, lifecycle).finalText}.`,
      },
      lifecycle.isPracticeOnly && {
        key: 'practice',
        tone: 'practice',
        chip: CLOSED_WORK.label,
        title: CLOSED_WORK.bannerTitle,
        text: CLOSED_WORK.bannerText,
      },
    ].filter(Boolean);
    // Another lesson's open Warm-Up: the banner that offers it is hidden on a phone.
    const otherWarmup = preview ? null : studentActiveWarmup();
    if (otherWarmup && otherWarmup.assignment.id !== activeAssignmentId) {
      assignmentStatusLines.push({
        key: 'otherWarmup',
        tone: 'warmup',
        chip: 'Warm-Up open',
        title: `The Warm-Up is open in ${otherWarmup.assignment.title}`,
        text: `It closes at ${otherWarmup.state.endsAt ? new Date(otherWarmup.state.endsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'the end of its window'}.`,
        action: {
          label: 'Go to that Warm-Up',
          onClick: () => {
            setAssignmentStatusOpenFor(null);
            setStudentDashboardMode('assignments');
            startAssignment(otherWarmup.assignment.id, otherWarmup.questionIndices[0]);
          },
        },
      });
    }
    // THE GRADE LINES, MOVED FROM THE NAVIGATOR (pass 3, RUN-7): Overview on a
    // wide screen, the chip's panel on a phone. "Grade so far", never "if
    // submitted now": there is no assignment-level submit (RUN-16).
    const gradeSoFarLine = preview
      ? `Preview progress · ${progress.correct}/${progress.total} correct`
      : assignmentFeedbackHeld
        ? 'Your score shows after your teacher releases it'
        : lifecycle.isPracticeOnly
          ? `Your grade: ${recordedGrade}% · set when the assignment closed`
          : `Grade so far: ${recordedGrade}%`;
    const gradeDetailLine = !preview && !assignmentFeedbackHeld && gradeSplit.attempted > 0
      ? `${gradeSplit.attempted} of ${gradeSplit.total} answered · ${gradeSplit.creditOnAttempted}% on what you have answered`
      : '';
    // A student always has the chip on a phone: a status, or "More".
    const assignmentChipShown = !preview && user?.role === 'student';
    const assignmentStatusOpen = assignmentStatusOpenFor === activeAssignmentId && assignmentChipShown;
    // The live challenge line's action leaves the assignment, as its banner does.
    assignmentStatusLines.forEach((line) => {
      if (line.key === 'liveChallenge') {
        line.action = { label: liveChallengeInvite?.status === 'running' ? 'Join Live Challenge' : 'Enter Challenge Lobby', onClick: () => { setAssignmentStatusOpenFor(null); joinLiveChallenge(); } };
      }
    });
    // A locked tab's reason, while that section is still locked.
    const lockNoteSection = sectionLockNote?.assignmentId === activeAssignmentId
      ? navigationSections.find((section) => section.role === sectionLockNote.role)
      : null;
    const visibleSectionLockNote = lockNoteSection && !sectionNavigationTarget(lockNoteSection) ? sectionLockNote.text : '';
    const isLiveTeachingThisAssignment = preview
      && liveTeachingSession?.active
      && String(liveTeachingSession.assignmentId) === String(assignment.id);
    const leaveAssignment = () => {
      if (preview) {
        // Live Teaching returns to Live Classroom, where Resume/Restart/End
        // live; a plain "View as Student" preview still exits to Assignments.
        setTeacherTab(isLiveTeachingThisAssignment ? 'home' : 'assignments');
      } else {
        flushAssignmentActivity(activeAssignmentId).catch(() => {});
        if (returnsToAssignmentResult) {
          setActiveClassroomSectionKey(
            assignmentResultRoute.sectionKey === 'whole' ? null : assignmentResultRoute.sectionKey,
          );
          setActiveView('assignmentResult');
          return;
        }
      }
      setActiveView('dashboard');
      setActiveAssignmentId(null);
    };

    // While the Warm-Up challenge is live it IS the screen. Rendering the
    // assignment underneath would leave a student scrolling between a timed
    // round and the work it replaced.
    if (warmupChallengeDecision?.route === WARMUP_CHALLENGE_ROUTE.PLAY && warmupChallengeDecision.roomId) {
      return (
        <div className="mathmaster-assignment-screen" style={{ padding: 20 }}>
          <WarmupChallengeGate
            decision={warmupChallengeDecision}
            invite={liveChallengeInvite}
            // The whole support profile, so the game gives the same Read aloud
            // a standalone game does (extended time travels on the invite).
            studentProfile={{ ...(user?.profile || {}), studentId: user?.id, name: user?.name }}
            // The same rewards card a standalone game shows when it ends —
            // without its "Open My Rewards" link: mid-Warm-Up the one way on
            // is Back to Warm-Up, which records the game and keeps the
            // assignment's own exit and flush.
            renderMatchRewards={(roomId, match = {}) => (
              <ChallengeRewardsEarned
                roomId={roomId}
                offered={match.offered}
                grants={studentClassPoints.grants}
                transactions={studentClassPoints.transactions}
                onOpenRewards={null}
              />
            )}
            onExitToAssignment={() => setWarmupChallengePlayedRoomIds((previous) => (
              previous.includes(warmupChallengeDecision.roomId)
                ? previous
                : [...previous, warmupChallengeDecision.roomId]
            ))}
          />
        </div>
      );
    }

    return (
      <div
        className={`mathmaster-assignment-screen ${supportPresentation.highContrast ? 'mathmaster-support-high-contrast' : ''} ${supportPresentation.largeText ? 'mathmaster-support-large-text' : ''}`}
        style={{
          fontFamily: '"Segoe UI", sans-serif',
          backgroundColor: supportPresentation.highContrast ? 'var(--mm-surface)' : 'var(--mm-surface-control)',
          minHeight: '100vh',
          padding: '20px',
          fontSize: supportPresentation.largeText ? '120%' : undefined,
        }}
      >
        {/*
          * Teacher review controls, mounted once for the whole preview.
          *
          * They belong here rather than inside the question runtime for two
          * reasons. The point of View as Student is to see the formatting and
          * sizing a student gets, so these controls portal to a fixed overlay
          * and never enter the student layout. And a teacher needs them the
          * whole time they are looking at student-facing work — on the section
          * overview, between questions, in Focus view, and when a question
          * module fails to render at all. Mounted inside the module boundary
          * they existed only while a module was on screen, which is the one
          * moment a teacher is least likely to be judging the page.
          */}
        {preview && activeAssignmentId && (
          <TeacherQuestionReviewPanel
            assignmentId={activeAssignmentId}
            question={questions[currentQuestionIndex] || null}
            questionIndex={currentQuestionIndex}
            onAssignmentRefresh={fetchAssignments}
          />
        )}
        {!preview && renderStudentWarmupBanner()}
        {!preview && shouldShowWarmupWaitingPanel({ decision: warmupChallengeDecision, invite: liveChallengeInvite }) && (
          <WarmupChallengeGate decision={warmupChallengeDecision} />
        )}
        {!preview && !supportPresentation.disableIdleTimer && renderIdleOverlay()}
        <div className="mathmaster-assignment-shell" style={{ maxWidth: '1120px', margin: '0 auto' }}>
          {isLiveTeachingThisAssignment && (
            <section
              role="status"
              aria-label="Live Teaching"
              style={{ marginBottom: '16px', padding: '10px 16px', borderRadius: '10px', background: '#137333', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', fontWeight: 800, fontSize: 'calc(13 * var(--mm-px))' }}
            >
              <span>🔴 LIVE TEACHING · Teacher exemplar — {describeClassworkPace({ assignment, classworkQuestionPosition: liveTeachingSession?.classworkQuestionPosition ?? null })}. No student data is affected.</span>
              {questions[currentQuestionIndex]?.instructionalPhase && (
                <strong>{({ iDo: 'I DO', weDo: 'WE DO', youDo: 'YOU DO' })[questions[currentQuestionIndex].instructionalPhase]}</strong>
              )}
              <strong aria-live="polite" style={{ color: liveTeachingSession?.timer?.status === 'expired' ? '#fdd663' : '#fff' }}>
                {liveTeachingSession?.timer?.status === 'expired' ? 'TIME EXPIRED' : `${Math.floor(walkthroughTimerRemaining(liveTeachingSession?.timer, now) / 60)}:${String(walkthroughTimerRemaining(liveTeachingSession?.timer, now) % 60).padStart(2, '0')}`}
              </strong>
              {Number(liveTeachingSession?.timer?.durationSeconds || 0) > Number(questions[currentQuestionIndex]?.suggestedWorkSeconds || 0) && (
                <strong
                  style={{ padding: '3px 7px', borderRadius: 999, background: '#fdd663', color: 'var(--mm-warning-text)', fontSize: 'calc(11 * var(--mm-px))' }}
                >
                  {/* A label on a bare <strong> is not read (AX18): the words
                      a screen reader gets are a hidden span's. */}
                  <span aria-hidden="true">EXTENDED +{Math.floor((Number(liveTeachingSession.timer.durationSeconds) - Number(questions[currentQuestionIndex]?.suggestedWorkSeconds || 0)) / 60)}:{String((Number(liveTeachingSession.timer.durationSeconds) - Number(questions[currentQuestionIndex]?.suggestedWorkSeconds || 0)) % 60).padStart(2, '0')}</span>
                  <span style={SR_ONLY_STYLE}>Live timer has been extended beyond the authored plan</span>
                </strong>
              )}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button type="button" onClick={() => controlWalkthroughTimer(liveTeachingSession?.timer?.status === 'paused' ? 'resume' : 'start')} style={{ padding: '6px 10px' }}>{liveTeachingSession?.timer?.status === 'paused' ? 'Resume' : 'Start'}</button>
                <button type="button" onClick={() => controlWalkthroughTimer('pause')} style={{ padding: '6px 10px' }}>Pause</button>
                <button type="button" onClick={() => controlWalkthroughTimer('reset', questions[currentQuestionIndex]?.suggestedWorkSeconds)} style={{ padding: '6px 10px' }}>Reset</button>
                <button type="button" onClick={() => controlWalkthroughTimer('extend', 30)} style={{ padding: '6px 10px' }}>+30 sec</button>
                <button type="button" onClick={() => controlWalkthroughTimer('extend', 60)} style={{ padding: '6px 10px' }}>+1 min</button>
                <button
                  type="button"
                  onClick={() => teachAssignmentLive(assignment.id, { forceRestart: true })}
                  style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--mm-border-soft)', background: 'transparent', color: '#fff', fontWeight: 900, cursor: 'pointer', fontSize: 'calc(12 * var(--mm-px))' }}
                >
                  Restart Fresh
                </button>
                <button
                  type="button"
                  onClick={() => { leaveAssignment(); endLiveTeaching(); }}
                  style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--mm-border-soft)', background: 'var(--mm-surface)', color: 'var(--mm-success-text)', fontWeight: 900, cursor: 'pointer', fontSize: 'calc(12 * var(--mm-px))' }}
                >
                  End Teaching
                </button>
              </div>
            </section>
          )}
          {!preview && shouldShowChallengeHandoffBanner({ invite: liveChallengeInvite, warmupDecision: warmupChallengeDecision }) && (
            <section className="mathmaster-assignment-banner" style={{ marginBottom: '16px', padding: '18px 22px', borderRadius: '13px', background: 'var(--mm-primary-soft)', border: '3px solid #1a73e8', color: 'var(--mm-primary-text)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap', textAlign: 'left' }}>
              <div><strong style={{ display: 'block', fontSize: 'calc(20 * var(--mm-px))' }}>⚡ Live Challenge has started</strong><span>{liveChallengeInvite.title || 'Your class challenge'} is live now. Your assignment work is saved when you switch.</span></div>
              <button type="button" onClick={joinLiveChallenge} style={{ padding: '11px 17px', border: 0, borderRadius: '9px', background: '#174ea6', color: '#fff', fontWeight: 900, cursor: 'pointer' }}>Join Live Challenge</button>
            </section>
          )}
          {!preview && !lobbyInviteHeldHere && shouldShowChallengeLobbyInvite({ invite: liveChallengeInvite, warmupDecision: warmupChallengeDecision }) && (
            // The lobby invite, wherever the student is (NAV-25); the game's
            // exit brings them back to this question.
            <section className="mathmaster-assignment-banner" aria-label="Live Challenge" data-live-challenge-invite style={{ marginBottom: '16px', padding: '12px 18px', borderRadius: '13px', background: 'var(--mm-primary-soft)', border: '2px solid #1a73e8', color: 'var(--mm-primary-text)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', textAlign: 'left' }}>
              <span style={{ fontWeight: 900, minWidth: 0, overflowWrap: 'anywhere' }}><span aria-hidden="true">⚡ </span>Your teacher opened the Live Challenge lobby. Your work is saved, and you come back to this question after the game.</span>
              <button type="button" onClick={joinLiveChallenge} style={{ minHeight: 44, padding: '10px 16px', border: 0, borderRadius: 10, background: 'var(--mm-primary)', color: 'var(--mm-on-primary)', fontWeight: 900, cursor: 'pointer' }}>Enter Challenge Lobby</button>
            </section>
          )}
          {lifecycle.isLate && !preview && (
            <section className="mathmaster-assignment-banner" style={{ marginBottom: '16px', padding: '18px 22px', borderRadius: '13px', background: 'var(--mm-warning-soft)', border: '2px solid #f9ab00', color: 'var(--mm-warning-text)', textAlign: 'left' }}>
              <strong style={{ display: 'block', fontSize: 'calc(20 * var(--mm-px))' }}>Late submission window</strong>
              <span>The regular deadline passed. You have <strong>{formatRemainingTime(lifecycle.millisecondsRemaining)}</strong> before this assignment closes permanently on {studentDueDateLines(assignment, lifecycle).finalText}.</span>
            </section>
          )}

          {lifecycle.isPracticeOnly && !preview && (
            <section className="mathmaster-assignment-banner" style={{ marginBottom: '16px', padding: '18px 22px', borderRadius: '13px', background: 'var(--mm-surface-control)', border: '2px solid #5f6368', color: 'var(--mm-text)', textAlign: 'left' }}>
              <strong style={{ display: 'block', fontSize: 'calc(20 * var(--mm-px))' }}>{CLOSED_WORK.bannerTitle}</strong>
              <span>{CLOSED_WORK.bannerText}</span>
            </section>
          )}

          {!preview && dolState.status === 'active' && (dolState.questionIndices || [dolState.questionIndex]).some((index) => questionRecordView(workingTracker?.[index]).totalAttempts === 0) && (
            <section className="mathmaster-assignment-banner" style={{ marginBottom: '16px', padding: '20px 22px', borderRadius: '14px', background: 'var(--mm-accent-soft)', border: '2px solid #9334e6', color: 'var(--mm-text)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '18px', flexWrap: 'wrap', textAlign: 'left' }}>
              <div>
                <strong style={{ display: 'block', fontSize: 'calc(22 * var(--mm-px))' }}>The {exitTicketInSentence} is open now</strong>
                <span>Answer all {(dolState.questionIndices || [dolState.questionIndex]).length} question{(dolState.questionIndices || [dolState.questionIndex]).length === 1 ? '' : 's'} before the timer reaches zero.</span>
                {!supportPresentation.hideCountdowns && <div style={{ marginTop: '7px', fontWeight: 900, fontSize: 'calc(18 * var(--mm-px))' }}><DOLCountdown endsAt={dolState.endsAt} /> remaining</div>}
              </div>
              <button type="button" onClick={() => changeQuestion((dolState.questionIndices || [dolState.questionIndex])[0])} style={{ padding: '12px 18px', border: 0, borderRadius: '10px', background: '#681da8', color: '#fff', fontWeight: 900, cursor: 'pointer' }}>Start the {exitTicketInSentence}</button>
            </section>
          )}

          <header className="mathmaster-assignment-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--mm-surface)', padding: '18px 24px', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', marginBottom: '22px', gap: '20px', flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'left', flex: '1 1 390px' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 5 }}>
                {/* One way back per screen (NAV-20): a student's is the
                    sticky navigator's "←", named for where it goes, which
                    stays on screen as the work scrolls. The teacher preview
                    keeps its labelled exit here. */}
                {preview && (
                  <button
                    onClick={leaveAssignment}
                    style={{ background: 'none', border: 'none', color: 'var(--mm-primary)', cursor: 'pointer', fontWeight: 'bold', padding: 0 }}
                  >
                    &larr; Back to Instructor Dashboard
                  </button>
                )}
                {preview && !isLiveTeachingThisAssignment && (
                  <button
                    type="button"
                    onClick={() => startTeacherPreview(assignment.id)}
                    style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #1a73e8', background: 'var(--mm-surface)', color: 'var(--mm-primary-text)', fontWeight: 900, cursor: 'pointer', fontSize: 'calc(12 * var(--mm-px))' }}
                  >
                    ↻ Restart Preview Fresh
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <h1 style={{ margin: 0, color: 'var(--mm-text-strong)', fontSize: 'calc(23 * var(--mm-px))' }}>{assignment.title}</h1>
                {lifecycleBadge.label && <span style={{ padding: '4px 9px', borderRadius: '999px', background: lifecycleBadge.background, color: lifecycleBadge.color, fontSize: 'calc(11 * var(--mm-px))', fontWeight: 900, textTransform: 'uppercase' }}>{lifecycleBadge.label}</span>}
                {assignmentHasClasswork && assignment?.guidedNotesBySection?.classwork !== 'off' && <span style={{ padding: '4px 9px', borderRadius: '999px', background: 'var(--mm-primary-soft)', color: 'var(--mm-primary-text)', fontSize: 'calc(11 * var(--mm-px))', fontWeight: 900 }}>GUIDED NOTES · CLASSWORK</span>}
                {/* Which version a section hands out is the teacher's setting,
                    not something a student acts on (pass 3, RUN-16). */}
                {preview && <span style={{ padding: '4px 9px', borderRadius: '999px', background: currentSectionVariantMode === 'shared' ? 'var(--mm-success-bg)' : 'var(--mm-accent-soft)', color: currentSectionVariantMode === 'shared' ? 'var(--mm-success-text)' : 'var(--mm-accent-text)', fontSize: 'calc(11 * var(--mm-px))', fontWeight: 900 }}>{currentSectionVariantMode === 'shared' ? `${currentSectionMeta.label.toUpperCase()} · SAME VERSION` : `${currentSectionMeta.label.toUpperCase()} · PERSONALIZED VERSIONS`}</span>}
              </div>
              <div style={{ color: 'var(--mm-text-muted)', fontSize: 'calc(13 * var(--mm-px))', marginTop: '7px', lineHeight: 1.5 }}>
                {(() => { const dates = renderMemo('dueDateLines', [assignment, lifecycle], () => studentDueDateLines(assignment, lifecycle)); return <>{dates.dueLine}{dates.finalLine ? <><br />{dates.finalLine}</> : null}</>; })()}
              </div>
              {/* A student who opens the assignment from a Google Classroom link
                  never passes Home or View Results; the assignment itself says
                  its Warm-Up or DOL has a second try open. */}
              {!preview && user?.role === 'student' && (
                <RecoveryInlineNotice
                  opportunities={studentRecoveryByAssignment[assignment.id]}
                  studentId={user.id}
                  onOpen={openStudentRecovery}
                />
              )}
              {!preview && user?.role === 'student' && (
                <StudentSupportTools
                  profile={user.profile}
                  onResourceOpened={(supportId) => { notePlatformLinkOpened(); recordStudentSupportEvidence({ supportId, eventType: 'used', activityRole: runtimeActivityRole }); }}
                />
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '22px' }}>
              <div style={{ textAlign: 'right', minWidth: 190 }}>
                <div style={{ fontSize: 'calc(12 * var(--mm-px))', color: 'var(--mm-text-muted)', textTransform: 'uppercase', fontWeight: 900 }}>
                  {preview
                    ? 'Preview progress'
                    : lifecycle.isPracticeOnly
                      ? CLOSED_WORK.gradeLabel
                      : 'Grade so far'}
                </div>
                <div style={{ fontSize: 'calc(22 * var(--mm-px))', fontWeight: 900, color: assignmentFeedbackHeld ? 'var(--mm-primary-text)' : recordedGrade >= 70 ? 'var(--mm-success)' : 'var(--mm-text-strong)' }}>
                  {preview ? `${progress.correct}/${progress.total}` : assignmentFeedbackHeld ? 'Awaiting teacher release' : `${recordedGrade}%`}
                </div>
                {/* Only a grade the student can actually see in Classroom, in
                    plain words — never a teacher draft or sync stage. */}
                {!preview && !assignmentFeedbackHeld && classroomReceipt && classroomReceiptGrade != null && classroomReceiptStudentVisible && (
                  <div style={{ marginTop: 5, fontSize: 'calc(11 * var(--mm-px))', lineHeight: 1.35, color: classroomReceiptFinal ? 'var(--mm-success-text)' : 'var(--mm-primary-text)', fontWeight: 800 }}>
                    Google Classroom shows {classroomReceiptGrade}%{classroomReceiptFinal ? ' (final)' : ' (not final yet)'}
                    {!classroomReceiptFinal && !classroomReceiptCurrent ? <><br />Classroom will catch up with your newer grade.</> : null}
                  </div>
                )}
              </div>
              {!preview && assignmentHasClasswork && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 'calc(12 * var(--mm-px))', color: 'var(--mm-text-muted)', textTransform: 'uppercase', fontWeight: 900 }}>Daily classwork</div>
                  <div style={{ fontSize: 'calc(18 * var(--mm-px))', fontWeight: 900, color: classworkGradesByAssignment?.[assignment.id]?.score === 100 ? 'var(--mm-success)' : 'var(--mm-warning-text)' }}>{classworkGradesByAssignment?.[assignment.id]?.score === 100 ? 'Done — 100%' : 'In progress'}</div>
                </div>
              )}
            </div>
          </header>

          <nav ref={stickyHeightRef(ASSIGNMENT_NAV_HEIGHT_VAR)} className={`mathmaster-assignment-unified-nav${assignmentNavigationCollapsed ? ' is-collapsed' : ''}`} aria-label="Assignment navigation">
            <div className="mathmaster-assignment-unified-top">
              <button type="button" className="mathmaster-unified-nav-back" onClick={leaveAssignment} aria-label={preview ? 'Back to instructor dashboard' : studentAssignmentBackLabel} title={preview ? 'Back to instructor dashboard' : studentAssignmentBackLabel}>←</button>
              {!assignmentNavigationCollapsed ? (
                <div className="mathmaster-section-tabs" role="group" aria-label="Assignment sections">
                  {navigationSections.map((section) => {
                    const meta = activitySectionMeta[section.role] || { label: section.role, background: 'var(--mm-surface-control)', color: 'var(--mm-text)', border: 'var(--mm-border-strong)' };
                    const targetEntry = sectionNavigationTarget(section);
                    const sectionAvailable = Boolean(targetEntry);
                    const access = sectionAccessFor(section.entries[0]);
                    const readOnly = sectionAvailable && access.state === SECTION_ACCESS.READ_ONLY;
                    const active = currentNavigationSection?.role === section.role;
                    const reasonId = `mathmaster-section-reason-${section.role}`;
                    // A locked tab stays focusable (aria-disabled, not
                    // disabled) so a keyboard or screen-reader student reaches
                    // its reason; pressing it shows the reason on screen.
                    return (
                      <Fragment key={`section-tab-${section.role}-${section.entries[0]?.index}`}>
                        <button
                          type="button"
                          className={`mathmaster-section-tab${active ? ' is-active' : ''}${section.allCorrect ? ' is-complete' : ''}${sectionAvailable ? '' : ' is-locked'}${readOnly ? ' is-read-only' : ''}`}
                          style={{ '--section-color': meta.color, '--section-border': meta.border, '--section-bg': meta.background }}
                          onClick={() => (targetEntry
                            ? changeQuestion(targetEntry.index)
                            : setSectionLockNote({ assignmentId: activeAssignmentId, role: section.role, text: access.reason }))}
                          aria-disabled={sectionAvailable ? undefined : 'true'}
                          aria-current={active ? 'page' : undefined}
                          aria-describedby={access.reason ? reasonId : undefined}
                          title={access.reason || `${compactSectionLabel(section)}: ${section.progress.pending ? NAVIGATOR_PENDING_LABEL : `${section.progress.done} of ${section.progress.total} done.`}`}
                        >
                          {section.allCorrect && <span className="mathmaster-section-complete-medallion" aria-hidden="true">✓</span>}
                          <span className="mathmaster-section-tab-copy">
                            <span className="mathmaster-section-tab-label">{compactSectionLabel(section)}</span>
                            <small>{sectionAvailable && !readOnly ? section.progress.label : `${sectionAvailable ? '' : '🔒 '}${access.short}`}</small>
                          </span>
                        </button>
                        {access.reason && <span id={reasonId} style={SR_ONLY_STYLE}>{access.reason}</span>}
                      </Fragment>
                    );
                  })}
                </div>
              ) : (
                <>
                  <div className="mathmaster-collapsed-current-location" role="status">
                    <strong>{compactSectionLabel(currentNavigationSection || { role: activeQuestionRole })}</strong>
                    <span className="mathmaster-location-long">Question {currentSectionQuestionNumber} of {currentSectionQuestionCount}</span>
                    <span className="mathmaster-location-short" aria-hidden="true">Q{currentSectionQuestionNumber} of {currentSectionQuestionCount}</span>
                  </div>
                  <div className="mathmaster-unified-question-controls mathmaster-focus-inline-controls">
                    <button type="button" onClick={() => previousQuestionEntry && changeQuestion(previousQuestionEntry.index)} disabled={!previousQuestionEntry} aria-label="Previous question">‹ <span>Previous</span></button>
                    <select
                      aria-label="Choose a question"
                      value={currentQuestionIndex}
                      onChange={(event) => changeQuestion(Number(event.target.value))}
                    >
                      {visibleQuestionEntries.map((entry) => (
                        <option key={entry.index} value={entry.index} disabled={!entryIsAvailable(entry)} data-locked={entryIsAvailable(entry) ? undefined : 'true'}>{compactSectionLabel(entry)} Q{entry.sectionPosition + 1}{entryIsAvailable(entry) ? '' : ` · ${sectionAccessFor(entry).short}`}</option>
                      ))}
                    </select>
                    <button type="button" className="mathmaster-unified-next" onClick={() => nextQuestionEntry && changeQuestion(nextQuestionEntry.index)} disabled={!nextQuestionEntry} aria-label="Next question"><span>Next</span> ›</button>
                  </div>
                </>
              )}
              {/* The Warm-Up's time, beside the section, in both navigator
                  states (pass 3, RUN-14): on a phone the banner that carried
                  it covered the task card, and its 2:00 / 0:30 warnings must
                  not depend on whether "Show progress" is open. */}
              {!preview && currentIsWarmup && warmupState.status === 'active' && (
                <SectionTimeLeft compact label="Warm-Up" endsAt={warmupState.endsAt} hideCountdown={supportPresentation.hideCountdowns} />
              )}
              {/* The phone's chip (wider screens keep the header and banners):
                  the most urgent status, or "More" — where a phone student
                  finds "Grade so far" and Support tools. */}
              {assignmentChipShown && (
                <button
                  type="button"
                  className={`mathmaster-assignment-status-chip is-${assignmentStatusLines[0]?.tone || 'more'}`}
                  aria-expanded={assignmentStatusOpen}
                  aria-controls={assignmentStatusOpen ? 'mathmaster-assignment-status-panel' : undefined}
                  onClick={() => setAssignmentStatusOpenFor(assignmentStatusOpen ? null : activeAssignmentId)}
                >
                  {assignmentStatusLines.length
                    ? `${assignmentStatusLines[0].chip}${assignmentStatusLines.length > 1 ? ` +${assignmentStatusLines.length - 1}` : ''}`
                    : <>More <span aria-hidden="true">{assignmentStatusOpen ? '▴' : '▾'}</span></>}
                </button>
              )}
              <button
                type="button"
                className="mathmaster-overview-button"
                onClick={() => setAssignmentOverviewExpanded((current) => !current)}
                aria-expanded={assignmentOverviewExpanded}
              >
                <span className="mathmaster-overview-button-label">Overview</span> {assignmentOverviewExpanded ? '▴' : '▾'}
              </button>
              <button
                type="button"
                className="mathmaster-focus-view-button"
                onClick={toggleAssignmentNavigation}
                aria-expanded={!assignmentNavigationCollapsed}
                title={assignmentNavigationCollapsed ? 'Show section progress and question numbers' : 'Hide section progress to make more room for the problem'}
              >
                {assignmentNavigationCollapsed ? 'Show progress' : 'Focus view'}
              </button>
            </div>

            {!assignmentNavigationCollapsed && (
            <div className="mathmaster-assignment-unified-bottom">
              <div className={`mathmaster-current-section-inline${currentNavigationSection?.allCorrect ? ' is-complete' : ''}`}>
                {/* Where the student is and what is left. The grade lines
                    live in Overview (pass 3, RUN-7): four lines of grade text
                    here pushed the work down on every question. */}
                <div className="mathmaster-current-section-summary">
                  <strong>{compactSectionLabel(currentNavigationSection || { role: activeQuestionRole })}</strong>
                  <span>
                    {currentNavigationSection?.complete
                      ? '✓ Section done'
                      : `${currentSectionCompletedCount} of ${currentSectionQuestionCount} done · ${currentSectionRemainingCount} left`}
                  </span>
                  <small>Question {currentSectionQuestionNumber} of {currentSectionQuestionCount}</small>
                </div>
                <div className="mathmaster-question-number-strip" role="group" aria-label={`${compactSectionLabel(currentNavigationSection || { role: activeQuestionRole })} questions`}>
                  {(currentNavigationSection?.entries || []).map((entry) => {
                    const shown = navigatorQuestionFor(entry);
                    const current = entry.index === currentQuestionIndex;
                    const available = shown.status !== QUESTION_STATUS.LOCKED;
                    return (
                      <button
                        type="button"
                        key={`section-question-${entry.index}`}
                        className={`mathmaster-question-number is-${shown.status}${current ? ' is-current' : ''}${available ? '' : ' is-locked'}`}
                        style={{ '--section-color': currentSectionMeta.color, '--section-border': currentSectionMeta.border, '--section-bg': currentSectionMeta.background }}
                        onClick={() => available && changeQuestion(entry.index)}
                        disabled={!available}
                        aria-current={current ? 'step' : undefined}
                        aria-label={`${compactSectionLabel(entry)} question ${entry.sectionPosition + 1}: ${shown.spoken}${current ? ', current question' : ''}`}
                        title={`${compactSectionLabel(entry)} Question ${entry.sectionPosition + 1} · ${shown.label}`}
                      >
                        {entry.sectionPosition + 1}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mathmaster-unified-question-controls">
                <button type="button" onClick={() => previousQuestionEntry && changeQuestion(previousQuestionEntry.index)} disabled={!previousQuestionEntry} aria-label="Previous question">‹ <span>Previous</span></button>
                <select
                  aria-label="Choose a question"
                  value={currentQuestionIndex}
                  onChange={(event) => changeQuestion(Number(event.target.value))}
                >
                  {visibleQuestionEntries.map((entry) => (
                    <option key={entry.index} value={entry.index} disabled={!entryIsAvailable(entry)} data-locked={entryIsAvailable(entry) ? undefined : 'true'}>{compactSectionLabel(entry)} Q{entry.sectionPosition + 1}{entryIsAvailable(entry) ? '' : ` · ${sectionAccessFor(entry).short}`}</option>
                  ))}
                </select>
                <button type="button" className="mathmaster-unified-next" onClick={() => nextQuestionEntry && changeQuestion(nextQuestionEntry.index)} disabled={!nextQuestionEntry} aria-label="Next question"><span>Next</span> ›</button>
              </div>
            </div>
            )}
            {visibleSectionLockNote && (
              <p className="mathmaster-section-lock-note" role="status">
                <span>{visibleSectionLockNote}</span>
                <button type="button" onClick={() => setSectionLockNote(null)} aria-label="Close this note">×</button>
              </p>
            )}
            {assignmentStatusOpen && (
              <div id="mathmaster-assignment-status-panel" className="mathmaster-assignment-status-panel">
                {assignmentStatusLines.map((line) => (
                  <div key={line.key} className={`mathmaster-assignment-status-line is-${line.tone}`}>
                    <strong>{line.title}</strong>
                    <span>{line.text}</span>
                    {line.action && <button type="button" onClick={line.action.onClick}>{line.action.label}</button>}
                  </div>
                ))}
                <div className="mathmaster-assignment-status-line is-grade">
                  <strong>{gradeSoFarLine}</strong>
                  {gradeDetailLine && <span>{gradeDetailLine}</span>}
                </div>
                {/* The header's Support tools (a teacher's materials, a
                    formula sheet): the header is hidden where this panel
                    shows, so the same panel rides here. */}
                {!preview && user?.role === 'student' && (
                  <StudentSupportTools
                    className="mathmaster-narrow-support-tools"
                    profile={user.profile}
                    onResourceOpened={(supportId) => { notePlatformLinkOpened(); recordStudentSupportEvidence({ supportId, eventType: 'used', activityRole: runtimeActivityRole }); }}
                  />
                )}
              </div>
            )}
            {/* The DOL's time, seconds in its last minute, with warnings at
                2:00 and 0:30 (pass 3, RUN-10). Its end is the lifecycle
                state's (a student's extra time lives there). */}
            {!preview && dolState.status === 'active' && (
              <div className="mathmaster-unified-nav-alert">
                <SectionTimeLeft label={EXIT_TICKET} labelInSentence={exitTicketInSentence} endsAt={dolState.endsAt} hideCountdown={supportPresentation.hideCountdowns} extraTimeFrom={extraTimeFrom(dolState)} />
              </div>
            )}
          </nav>

          {assignmentOverviewExpanded && (
          <div className="mathmaster-question-navigation" style={{ display: 'grid', gap: '14px', marginBottom: '24px' }}>
            {/* THE GRADE LINES, MOVED HERE FROM THE NAVIGATOR (pass 3, RUN-7).
                "Grade so far", never "if submitted now": there is no
                assignment-level submit (RUN-16). */}
            <section aria-label="Your grade" className="mathmaster-overview-grade" style={{ padding: '11px 13px', borderRadius: '12px', border: '1px solid var(--mm-border)', background: 'var(--mm-surface)', color: 'var(--mm-text)', display: 'grid', gap: 3, textAlign: 'left' }}>
              <strong style={{ fontSize: 'calc(15 * var(--mm-px))', color: assignmentFeedbackHeld ? 'var(--mm-primary-text)' : 'var(--mm-text-strong)' }}>
                {gradeSoFarLine}
              </strong>
              {gradeDetailLine && <span style={{ fontSize: 'calc(13 * var(--mm-px))' }}>{gradeDetailLine}</span>}
            </section>
            {navigationSections.map((section) => {
              const sectionMeta = activitySectionMeta[section.role] || { label: section.role, background: 'var(--mm-surface-control)', color: 'var(--mm-text)', border: 'var(--mm-border-strong)' };
              const sectionName = compactSectionLabel(section);
              const sectionGrade = currentSectionGrades[section.role] || null;
              const sectionOfficialGrade = currentSectionOfficialGrades[section.role] || null;
              const sectionHeld = section.entries.some((entry) => entryFeedbackHeld(entry));
              const sectionScoreLine = preview
                ? `Section score ${sectionGrade?.score ?? 0}% · ${sectionGrade?.attempted ?? 0}/${sectionGrade?.total ?? 0} answered`
                : sectionHeld
                  ? 'Score shows after your teacher releases it'
                  : lifecycle.isPracticeOnly
                    ? `Section score ${sectionOfficialGrade?.score ?? 0}% (set) · practice ${sectionGrade?.score ?? 0}%`
                    : `Section score ${sectionGrade?.score ?? 0}% · ${sectionGrade?.attempted ?? 0}/${sectionGrade?.total ?? 0} answered`;
              const sectionAccess = sectionAccessFor(section.entries[0]);
              return (
                <section key={`${section.role}-${section.entries[0]?.index}`} aria-label={`${sectionName} questions`} style={{ padding: '13px', borderRadius: '12px', border: `2px solid ${section.allCorrect ? '#188038' : sectionMeta.border}`, background: sectionMeta.background, boxShadow: section.allCorrect ? '0 0 0 3px rgba(24,128,56,0.12)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '10px', color: sectionMeta.color, flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 'calc(15 * var(--mm-px))', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{sectionName}</strong>
                    {section.allCorrect ? (
                      <span style={{ padding: '7px 11px', borderRadius: 999, background: '#188038', color: '#fff', fontSize: 'calc(12 * var(--mm-px))', fontWeight: 950, letterSpacing: '0.02em', boxShadow: '0 2px 6px rgba(24,128,56,0.28)' }}><span aria-hidden="true">✓ {sectionName.toUpperCase()} COMPLETE</span><span style={SR_ONLY_STYLE}>{`${sectionName} section complete`}</span></span>
                    ) : (
                      <span style={{ fontSize: 'calc(12 * var(--mm-px))', fontWeight: 800 }}>{section.progress.label === 'All submitted' || section.progress.pending ? section.progress.label : `${section.progress.done} of ${section.progress.total} done`}</span>
                    )}
                    <span style={{ flexBasis: '100%', fontSize: 'calc(12 * var(--mm-px))', fontWeight: 800 }}>{sectionScoreLine}</span>
                    {sectionAccess.reason && <span style={{ flexBasis: '100%', fontSize: 'calc(12 * var(--mm-px))', fontWeight: 700, color: 'var(--mm-text)' }}>{sectionAccess.reason}</span>}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 145px), 1fr))', gap: '10px' }}>
                    {section.entries.map((entry) => {
                      const { index, sectionPosition } = entry;
                      const record = questionRecordView(workingTracker?.[index]);
                      const cardAssessment = questionAssessmentFramework(questions[index] || {});
                      const cardAssessmentLabel = cardAssessment.examStyle && cardAssessment.framework
                        ? `${FRAMEWORK_LABELS[cardAssessment.framework] || cardAssessment.framework} practice`
                        : '';
                      const shown = navigatorQuestionFor(entry);
                      const sectionUnavailable = shown.status === QUESTION_STATUS.LOCKED;
                      // Colour follows the same state as the words: green only
                      // for a verdict the student may see.
                      const cardState = shown.status === QUESTION_STATUS.CORRECT
                        ? { background: 'var(--mm-success-bg)', color: 'var(--mm-success-text)' }
                        : shown.status === QUESTION_STATUS.SUBMITTED
                          ? { background: 'var(--mm-primary-subtle)', color: 'var(--mm-primary-text)' }
                          : shown.status === QUESTION_STATUS.CLOSED
                            ? { background: 'var(--mm-surface-control)', color: 'var(--mm-text)' }
                            : shown.status === QUESTION_STATUS.TRY_AGAIN
                              ? { background: 'var(--mm-warning-soft)', color: 'var(--mm-warning-text)' }
                              : { background: 'var(--mm-surface)', color: 'var(--mm-text-strong)' };
                      return (
                        <button
                          type="button"
                          key={index}
                          onClick={() => !sectionUnavailable && changeQuestion(index)}
                          disabled={sectionUnavailable}
                          aria-label={`${sectionName} question ${sectionPosition + 1}: ${shown.label}${cardAssessmentLabel ? `, ${cardAssessmentLabel}` : ''}`}
                          style={{
                            padding: '14px',
                            cursor: sectionUnavailable ? 'not-allowed' : 'pointer',
                            backgroundColor: sectionUnavailable ? 'var(--mm-surface-control)' : cardState.background,
                            color: sectionUnavailable ? 'var(--mm-text-subtle)' : cardState.color,
                            border: currentQuestionIndex === index ? `3px solid ${sectionMeta.border}` : '1px solid var(--mm-border)',
                            borderRadius: '10px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            boxShadow: currentQuestionIndex === index ? '0 4px 12px rgba(26,115,232,0.2)' : 'none',
                            opacity: sectionUnavailable ? 0.7 : 1,
                          }}
                        >
                          <div style={{ fontSize: 'calc(14 * var(--mm-px))', fontWeight: 'bold' }}>Question {sectionPosition + 1}</div>
                          <div style={{ marginTop: '5px', padding: '3px 7px', borderRadius: '999px', background: sectionMeta.background, color: sectionMeta.color, border: `1px solid ${sectionMeta.border}`, fontSize: 'calc(10 * var(--mm-px))', fontWeight: 900 }}>{sectionName}</div>
                          {/* Named in the button's own label above: a label on this div, inside a button that has one, was never read (AX18). */}
                          {cardAssessmentLabel && <div style={{ marginTop: '5px', padding: '3px 7px', borderRadius: 999, background: 'var(--mm-accent-soft)', color: 'var(--mm-accent-text)', border: '1px solid var(--mm-accent-border)', fontSize: 'calc(10 * var(--mm-px))', fontWeight: 950 }}>{cardAssessmentLabel}</div>}
                          <div style={{ fontSize: 'calc(12 * var(--mm-px))', marginTop: '7px', fontWeight: 'bold' }}>{shown.label}</div>
                          {record.totalAttempts > 0 && <div style={{ fontSize: 'calc(11 * var(--mm-px))', marginTop: '3px', opacity: 0.85 }}>{record.totalAttempts} {record.totalAttempts === 1 ? 'try' : 'tries'} used</div>}
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
          )}
          <QuestionAnnouncer
            announceKey={`${activeAssignmentId}-${currentQuestionIndex}`}
            position={`${currentSectionMeta.label}, question ${currentSectionQuestionNumber} of ${currentSectionQuestionCount}`}
            containerRef={assignmentQuestionStageRef}
          />
          <main ref={assignmentQuestionStageRef} className="mathmaster-question-stage" style={{ background: 'var(--mm-surface)', borderRadius: '12px', padding: '10px', minHeight: '500px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
            {questions[currentQuestionIndex]?.instructionalPhase
              && (preview || assignment.showInstructionalPhaseLabelsToStudents === true)
              && <div style={{ display: 'inline-block', margin: '6px 8px', padding: '5px 10px', borderRadius: 999, background: 'var(--mm-primary-soft)', color: 'var(--mm-primary-text)', fontWeight: 950, letterSpacing: '0.08em' }}><span style={SR_ONLY_STYLE}>Instructional phase: </span>{({ iDo: 'I DO', weDo: 'WE DO', youDo: 'YOU DO' })[questions[currentQuestionIndex].instructionalPhase]}</div>}
            {/* "Ask my teacher" answers, on any question of this assignment —
                one closed since it was asked keeps its answer here. */}
            {!preview && <TeacherAnswersList questions={askMyTeacher.questions} compact />}
            {familyEngineLoading || familyPinPending ? <p role="status" style={{ padding: 24, margin: 0 }}>Loading this question…</p> : <QuestionEngine
              key={`${activeAssignmentId}-${currentQuestionIndex}-${currentRecord.variantIndex}-${preview ? `preview-${previewSessionId}` : lifecycle.status}-draft${workspaceDraftGeneration}`}
              // Each one function for App's life, calling this render's
              // handler; null where the question offers no such action.
              {...stableCallbacks({
                onFamilyDelivery: preview ? handlePreviewFamilyDelivery : handleFamilyDelivery,
                onGrade: handleGradeSubmit,
                onResponseCheckpoint: preview ? null : handleResponseCheckpoint,
                onStepGrade: handleStepGrade,
                onRequestNewQuestion: handleRequestNewQuestion,
                onLoadScratchpad: handleLoadScratchpad,
                onSaveScratchpad: handleSaveScratchpad,
                onNextQuestion: engineNextEntry ? () => changeQuestion(engineNextEntry.index) : null,
                onContinueSection: assignmentHandoff ? continueAfterSection : null,
                onGoBackToQuestion: skippedQuestion ? () => changeQuestion(skippedQuestion.index) : null,
                onSupportEvidence: preview || lifecycle.isPracticeOnly
                  ? null
                  : (evidence) => recordStudentSupportEvidence({ ...evidence, questionIndex: currentQuestionIndex, activityRole: runtimeActivityRole }),
                // Teacher signals: facts about an attempt for the teacher's
                // "worth a conversation", on credit work only. Beside the
                // grade path, never in it (attemptSignalWriter.js).
                onAttemptSignal: preview || lifecycle.isPracticeOnly || user?.role !== 'student' || !user?.id
                  ? null
                  : (fact) => { void recordAttemptSignal({ db, studentId: user.id, assignmentId: activeAssignmentId, questionIndex: currentQuestionIndex, activityRole: runtimeActivityRole, fact }); },
                onAskTeacher: preview || lifecycle.isPracticeOnly || user?.role !== 'student'
                  ? null
                  : (requested) => setHelpRequest(nextHelpRequest({ requested, assignmentId: activeAssignmentId, questionIndex: currentQuestionIndex })),
              })}
              // Not through stableCallbacks: a new identity is how the question
              // learns of a Spotlight request (the student pressed Present
              // Now), and it sends the frame on screen at once (its effect
              // follows this prop). Null while there is none to send to.
              onSpotlightFrame={preview ? null : studentSpotlightRequest && publishSpotlightWork}
              draftRestore={draftRestoreFocus?.questionIndex === currentQuestionIndex ? draftRestoreFocus : null}
              question={questions[currentQuestionIndex]}
              questionRecord={workingTracker?.[currentQuestionIndex]}
              generationKey={`${activeAssignmentId}|${generationStudentKey}|${currentQuestionIndex}|variant:${currentRecord.variantIndex}`}
              familyContext={currentFamilyContext}
              adaptation={currentAdaptation}
              // Rebuilt with every tracker change (the mastery profile under
              // it); kept while it says the same.
              // A multi-part answer opens one part at a time for the student
              // (MultiAnswerGrader); the teacher's preview shows every part.
              partByPart={!preview}
              studentProfile={preview ? null : renderMemo('studentProfile', [adaptiveStudentProfile || user?.profile], () => adaptiveStudentProfile || user?.profile, sameStableValue)}
              guidedMode={['classwork', 'practice'].includes(runtimeActivityRole) && currentGuidedNotesMode !== 'off'}
              guidedNotesMode={currentGuidedNotesMode}
              assignmentLocked={!preview && ((currentIsDOL && dolState.status === 'ended') || (currentIsWarmup && warmupState.status !== 'active') || currentSectionManuallyLocked)}
              assignmentLockedMessage={!preview && currentIsDOL && dolState.status === 'ended'
                ? currentDolCopy.lockMessage
                : !preview && currentIsWarmup && warmupState.status === 'closed'
                  ? 'Your teacher closed the Warm-Up for this class. Your saved work is available for review, but no new submission is allowed.'
                  : !preview && currentIsWarmup && warmupState.status === 'ended'
                    ? 'This class period has ended. Your Warm-Up is available for review only.'
                    : !preview && currentIsWarmup && warmupState.status === 'waiting'
                      ? `The Warm-Up opens ${warmupState.minutesBeforeStart} minutes before your class begins.`
                      : !preview && currentIsWarmup
                        ? 'The Warm-Up is only available on its instructional day during your class window.'
                        : currentSectionManuallyLocked
                          ? `Your teacher has closed the ${currentManualSectionState.role === 'practice' ? 'Practice' : 'Classwork'} section for this class. Saved work remains visible, but new submissions are locked until the section is reopened.`
                          : ''}
              dolMode={!preview && currentIsDOL && dolState.status === 'active'}
              maximumAttempts={resolveQuestionMaximumAttempts({
                question: countedQuestionFor(assignment, currentQuestionIndex, workingTracker?.[currentQuestionIndex], questions[currentQuestionIndex], preview),
                maximumAttempts: runtimeQuestionActivityPolicy.attempts,
                activityPolicy: runtimeQuestionActivityPolicy,
              })}
              teacherGrantedExtraAttempts={resolveTeacherGrantedExtraAttempts({
                assignment,
                activityRole: runtimeActivityRole,
                classId: user?.classId || null,
                studentId: user?.role === 'student' ? user.id : null,
              })}
              activityRole={runtimeActivityRole}
              // "Practise one like this" after the last miss: Classwork and
              // Practice sections only, by the section's own role (a DOL in
              // post-due practice runs as 'practice' but is still a DOL).
              practiceLikeThisAllowed={['classwork', 'practice'].includes(activeQuestionRole)}
              // The lesson around this question, for its worked example (WE-A;
              // examplePlayer.js): its questions, which of them this student
              // is given, in order (a retired or omitted one taught them
              // nothing), and the lesson's own examples. Three plain values
              // that stay the same between renders; QuestionEngine works the
              // rest out, so none of the example's code loads with Home. The
              // section's OWN role is each stored question's activityRole.
              lessonQuestions={questions}
              lessonGiven={includedQuestionIndices.join()}
              lessonSupports={assignment.lessonSupports}
              activityPolicy={runtimeQuestionActivityPolicy}
              // The assignment's calculator setting (e.g. "graphing"), above the
              // question's own: calculatorPolicy.js resolveCalculatorPolicy.
              assignmentCalculatorMode={assignment?.toolPolicy?.calculator || null}
              feedbackReleased={currentFeedbackReleased}
              assessmentReviewReleased={assignmentFeedbackWasReleased(assignment)}
              replacementWarning={replacementWarning}
              draftKey={buildQuestionDraftKey({ studentId: preview ? 'teacher-preview' : user?.id || 'anonymous', assignmentId: activeAssignmentId, questionIndex: currentQuestionIndex, variantIndex: currentRecord.variantIndex, sessionMode: draftSessionMode })}
              assignmentId={activeAssignmentId}
              executionScope={preview ? 'teacherPreview' : lifecycle.isPracticeOnly ? 'postDuePractice' : 'student'}
              nextQuestionLabel={nextQuestionDestinationLabel}
              nextQuestionSectionLabel={nextQuestionSectionMeta?.label || ''}
              sectionComplete={Boolean(currentNavigationSection?.complete)}
              sectionLabel={currentSectionMeta.label}
              sectionQuestionCount={currentSectionQuestionCount}
              continueSectionLabel={assignmentHandoff?.label || ''}
              goBackLabel={skippedQuestion?.label || ''}
              helpRequested={helpRequest?.assignmentId === activeAssignmentId && helpRequest?.questionIndex === currentQuestionIndex}
              askTeacherContext={askTeacherContext}
            />}
            {/* SAVE HEALTH, IN THE STUDENT'S WORDS.
                A STUDENT IS NEVER TOLD "SUBMITTED" BEFORE THE SERVER HAS IT.
                That sentence is the whole point of this line: during the
                September 14 incident the button said the work was in and the
                teacher's gradebook never received it. "Submitted to MathMaster"
                is now reachable only from a drain that left nothing owed, and
                every other state names where the work actually is and whether
                anything is still to come. */}
            {/* ANNOUNCED ONLY WHEN THE WORK NEEDS THE STUDENT: offline, not
                recorded, refused. A routine save is not a second announcement
                of the result the question just gave. The region is always
                mounted and only its words change — a live region that appears
                with its text is often not read at all. "Not stored" is said
                by the question and a toast already. */}
            {!preview && (
              <span role="status" aria-live="polite" data-save-line-announcement="" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
                {studentSaveLineAnnouncement}
              </span>
            )}
            {/* THE LINES UNDER THE QUESTION, TOGETHER. On a phone the stage
                is a column and the question takes what these leave: they
                were clipped below it (App.css, "THE QUESTION TAKES WHAT THE
                SAVE LINE LEAVES"). Unstyled elsewhere. */}
            <div className="mathmaster-question-stage-status">
              {!preview && studentSaveLineShown && (
                <p data-save-line="" data-save-line-routine={studentSaveLineRoutine ? '' : undefined} style={{ margin: '8px 4px 0', color: 'var(--mm-text-muted)', fontSize: 'calc(12 * var(--mm-px))' }}>
                  {/* A draft is "Draft saved"; only an answer the student sent
                      is ever "Answer recorded", and only once the server has it
                      (RUN-11, saveStatusModel.describeRuntimeSaveLine). */}
                  {studentSaveLine
                    ? studentSaveLine
                            : studentPersistenceStatus === 'rejected'
                              ? 'This change was not accepted because the assignment is no longer available.'
                              // The device queue could not be written: the last
                              // change is on screen only (saveStatusModel.js).
                              // Never "saved" — nothing was (RUN-3).
                              : studentPersistenceStatus === 'volatile'
                                ? 'Not saved · this device could not store your last change. Keep this tab open and try it again.'
                                : 'Saved on this device only. MathMaster will finish saving when you are back online.'}
                </p>
              )}
              {/* UNFINISHED WORK THAT IS NOT BEING SAVED IS NEVER SILENT.
                  Storage full, a record the backup refuses, or a backup at its
                  caps: the student is told where the work is and what to do,
                  in one plain sentence, until it is saved again. */}
              {!preview && studentDraftSaveProblem && (
                <p role="alert" data-draft-save-problem={studentDraftSaveProblem.kind} style={{ margin: '8px 4px 0', padding: '8px 10px', borderRadius: 8, background: 'var(--mm-warning-bg)', border: '1px solid #f9ab00', color: 'var(--mm-warning-text)', fontWeight: 700, fontSize: 'calc(13 * var(--mm-px))' }}>
                  {studentDraftSaveProblem.text}
                </p>
              )}
              {!preview && studentReportingError && (
                <p role="status" style={{ margin: '2px 4px 0', color: 'var(--mm-warning-text)', fontSize: 'calc(11 * var(--mm-px))' }}>
                  Device reporting unavailable ({studentReportingError}); locally saved work is unchanged.
                </p>
              )}
              {/* "When time ends" is a promise only an open window can keep. */}
              {!preview && runtimeActivityRole === 'dol' && currentDolCopy?.openNotice && (
                <p style={{ margin: '8px 4px 0', color: 'var(--mm-text-muted)', fontSize: 'calc(12 * var(--mm-px))' }}>{currentDolCopy.openNotice}</p>
              )}
              {!preview && runtimeActivityRole === 'warmup' && warmupState.status === 'active' && (
                <p style={{ margin: '8px 4px 0', color: 'var(--mm-text-muted)', fontSize: 'calc(12 * var(--mm-px))' }}>{DOL_OPEN_NOTICE}</p>
              )}
              {/* AFTER THE CLOSE, SAY WHAT ACTUALLY HAPPENED.
                  Never "submitted" for a response that was not complete — the
                  status comes from the server's own finalization receipt, and
                  only once there is one: receipts are read when the assignment
                  opens, and a question never worked on gets none, so a
                  "checking" line could stand forever. A DOL that ended today
                  says who closed it (describeDolClose); on another day, and for
                  a Warm-Up, the receipt reads as before. */}
              {!preview && currentCheckpointOutcome && !currentSectionOpenNow && (
                <p role="status" aria-live="polite" style={{ margin: '8px 4px 0', color: 'var(--mm-text-muted)', fontSize: 'calc(12 * var(--mm-px))' }}>
                  {currentDolCopy?.closeReceipt || (currentCheckpointOutcome === 'auto-submitted'
                    ? 'Time ended. Your latest completed response was submitted automatically.'
                    : currentCheckpointOutcome === 'explicitly-submitted'
                      ? 'Time ended. Your submitted work has been saved.'
                      : 'Time ended. No completed response was available to submit.')}
                </p>
              )}
            </div>
          </main>
        </div>
      </div>
    );
  };
  return [renderAssignmentWorkspace];
}
