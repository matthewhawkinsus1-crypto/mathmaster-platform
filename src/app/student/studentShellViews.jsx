/*
 * AROUND EVERY STUDENT SCREEN: THE IDENTITY SHELL, THE PACK-UP NOTICE, THE LIVE CHALLENGE INVITE, THE WARM-UP BANNER, THE IDLE OVERLAY AND WHAT CHANGED.
 *
 * Moved verbatim from App.jsx. These are plain functions that return what App draws: not components, so React sees the same tree in the same place and nothing remounts. No state, no effects, no hooks. App builds them on every render, as it did when they were written inline, and passes what they read by position (tests/platform/appSplitViews.test.mjs holds the two sides to the same names in the same order). App calls this below the student navigation, the last thing these read; nothing reads them during render before that point.
 */
import {
  assignmentIsForStudent, getAssignmentLifecycle, getClassPackUpState, getWarmupState, questionIsIncluded,
  studentExtraTimeDolOpen,
} from '../../assignmentLifecycle';
import { SPOTLIGHT_STATUS } from '../../platform/liveSpotlight.js';
import { getStudentSupportPresentation } from '../../studentSupport';
import Dialog from '../../ui/Dialog.jsx';
import { MAIN_CONTENT_ID, SkipToContent } from '../../components/common/pageChrome.jsx';
import DOLCountdown from '../../components/student/DOLCountdown.jsx';
import { questionRecordView } from '../../platform/performance/questionRecordView.js';
import { resolveQuestionActivityRole } from '../../platform/policies/activityPolicies';
import { getStoredAssignmentQuestions } from '../../platform/contract/storedAssignmentV5.js';
import { LEVEL as NAV_LEVEL } from '../../platform/student/navigationModel.js';
import WhatChangedList from '../../components/student/WhatChangedList.jsx';
import { markWhatChangedSeen } from '../../platform/student/whatChangedModel.js';
import { describeLogoutRisk } from '../../platform/student/logoutGuard.js';
import { persistenceStatusWithUnstoredWork } from '../../platform/student/saveStatusModel.js';
import { packUpWorkLine } from '../../platform/student/packUpLine.js';
import StudentIdentityBar, { STUDENT_IDENTITY_STACK_OFFSET } from '../../components/student/StudentIdentityBar.jsx';
import { assignmentIsExcusedForStudent } from '../../platform/student/studentGradeCenterModel.js';

export function createStudentShellViews(
  user, studentClassPoints, studentRequiredFor, activeView, assignments, activeAssignmentId, tracker,
  studentOutboxDepth, studentPendingGradeCount, studentNeedsReviewCount, studentPersistenceStatus,
  studentUnstoredAssignmentIds, currentQuestionIndex, now, renderMemo, classSchedule, secureExamActive,
  setStudentDashboardMode, liveChallengeInvite, lastActivityRef, whatChangedItems, studentRecord, handleLogout,
  respondToSpotlight, stopStudentSpotlight, studentSpotlightMessage, studentSpotlightRequest, isIdle, setIsIdle,
  studentScreenAnnouncement, studentSaveStatusNow, classroomAnnouncementText, joinLiveChallenge,
  openStudentAssignmentResult, startAssignment,
) {
  const renderStudentPackUpNotice = () => {
    if (user?.role !== 'student' || !user.classPeriod) return null;
    if (secureExamActive) return null;
    // The bell window, once per change of the schedule, the class period and
    // the clock: asked on every render, it worked out the schedule and its
    // time-zone arithmetic again each time, several times a Submit.
    const packUp = renderMemo('packUp', [classSchedule, user.classPeriod, now], () => getClassPackUpState({
      schedule: classSchedule,
      classPeriod: user.classPeriod,
      nowValue: now,
      minutesBeforeEnd: 5,
    }));
    if (packUp.status !== 'active') return null;
    if (renderMemo('packUpExtraTime', [assignments, classSchedule, user.classId, user.classPeriod, now], () => studentExtraTimeDolOpen({ assignments, schedule: classSchedule, classId: user.classId || null, classPeriod: user.classPeriod, nowValue: now }))) return null;
    // "Saved" only when nothing is owed (packUpLine.js).
    const workLine = packUpWorkLine(studentSaveStatusNow());

    return (
      <div
        data-pack-up-notice={workLine.kind}
        style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'center', columnGap: 10, rowGap: 2,
          // The theme's warning pair, readable in both themes (the old banner put
          // --mm-text-strong on a fixed yellow: light on yellow in dark mode).
          background: 'var(--mm-warning-soft)', color: 'var(--mm-warning-text)', borderBottom: '3px solid #f9ab00',
          padding: '5px clamp(10px, 3vw, 22px)', textAlign: 'center', lineHeight: 1.3,
          fontFamily: '"Segoe UI", sans-serif', fontSize: 'calc(14 * var(--mm-px))',
        }}
      >
        <strong role="alert" style={{ fontWeight: 900 }}>
          {workLine.sentence}
        </strong>
        <span style={{ fontWeight: 700 }}>
          Pack up and return your device. The bell is in <DOLCountdown endsAt={packUp.endsAt} />.
        </span>
      </div>
    );
  };

  /*
   * THE LIVE CHALLENGE LOBBY, WHEREVER THE STUDENT IS (student pass 3, P3).
   *
   * The invite showed only on Home: a student on Grades, Assignments, My
   * Rewards, My Math Path or a result page saw nothing until the game was
   * running. One line, the same action as Home's card. Never in a secure
   * exam, a Test Cycle or the game itself (those screens do not render it).
   */
  const renderStudentLiveChallengeInvite = () => {
    if (user?.role !== 'student' || secureExamActive) return null;
    if (!liveChallengeInvite || !['invited', 'joined', 'running'].includes(liveChallengeInvite.status)) return null;
    const running = liveChallengeInvite.status === 'running';
    return (
      <section
        aria-label="Live Challenge"
        data-live-challenge-invite
        style={{ maxWidth: 920, margin: '12px auto 0', padding: '10px 14px', boxSizing: 'border-box', borderRadius: 12, background: 'var(--mm-primary-soft)', border: '2px solid #1a73e8', color: 'var(--mm-primary-text)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', textAlign: 'left' }}
      >
        <span style={{ fontWeight: 900, minWidth: 0, overflowWrap: 'anywhere' }}>
          <span aria-hidden="true">⚡ </span>
          {running ? 'The Live Challenge is running now.' : 'Your teacher opened the Live Challenge lobby.'}
        </span>
        {/* openStudentDashboardMode, not the bare mode: from the result page the
            view must change too, and a pending Path launch must not survive. */}
        <button type="button" onClick={joinLiveChallenge} style={{ minHeight: 44, padding: '10px 16px', border: 0, borderRadius: 10, background: 'var(--mm-primary)', color: 'var(--mm-on-primary)', fontWeight: 900, cursor: 'pointer' }}>
          {running ? 'Join Challenge Now' : 'Enter Challenge Lobby'}
        </button>
      </section>
    );
  };

  // The most urgent open Warm-Up this student has not finished, across their
  // lessons: the banner shows it, and on a phone (no banner) the assignment's
  // status chip offers it when it belongs to another lesson. Asked twice a
  // render, it walks every lesson's bell window: worked out once per change
  // of what it reads, in two parts. Which lessons have a Warm-Up open to this
  // student now reads the bell windows and the lessons, not the tracker, so a
  // Submit's tracker changes do not walk the windows again; which questions
  // are left reads the records of those lessons only.
  const studentActiveWarmup = () => {
    const open = renderMemo('openWarmups', [user, secureExamActive, assignments, classSchedule, now], () => {
      if (user?.role !== 'student' || !user.classPeriod) return [];
      // Its "Go to Warm-Up" would take a student out of a secure exam.
      if (secureExamActive) return [];
      const classContext = { classId: user.classId || null, classPeriod: user.classPeriod };
      return assignments
        .filter((assignment) => assignmentIsForStudent(assignment, classContext))
        .map((assignment) => {
          const state = getWarmupState({
            assignment,
            schedule: classSchedule,
            ...classContext,
            nowValue: now,
          });
          if (state.status !== 'active') return null;
          // Never recommend work the student cannot do for credit: excused
          // for them, or not open to them (not released yet / closed).
          if (assignmentIsExcusedForStudent(assignment, user.id)) return null;
          if (!getAssignmentLifecycle(assignment, now, { studentId: user.id }).isOpen) return null;
          return { assignment, state };
        })
        .filter(Boolean);
    });
    return renderMemo('activeWarmup', [open, ...open.map(({ assignment }) => tracker?.[assignment.id])], () => open
      .map(({ assignment, state }) => {
        const questions = getStoredAssignmentQuestions(assignment);
        const bannerOmitted = new Set(studentRequiredFor(assignment).omitted);
        const questionIndices = questions.reduce((indices, question, index) => {
          if (
            questionIsIncluded(question)
            && !bannerOmitted.has(index)
            && resolveQuestionActivityRole({ question, assignment }) === 'warmup'
          ) indices.push(index);
          return indices;
        }, []);
        // A student who has finished every Warm-Up question has nothing left to
        // go to. Keeping the pinned banner (and its "Go to Warm-Up" button) on
        // every Classwork and Practice question only took height from the work.
        const warmupFinished = questionIndices.every((index) => (
          ['correct', 'expired'].includes(questionRecordView(tracker?.[assignment.id]?.[index]).status)
        ));
        return questionIndices.length && !warmupFinished ? { assignment, state, questionIndices } : null;
      })
      .filter(Boolean)
      .sort((a, b) => Number(a.state.endsAt?.getTime?.() || 0) - Number(b.state.endsAt?.getTime?.() || 0))[0] || null);
  };

  const renderStudentWarmupBanner = () => {
    const activeWarmup = studentActiveWarmup();
    if (!activeWarmup) return null;
    const { assignment, state, questionIndices } = activeWarmup;
    const support = getStudentSupportPresentation(user.profile);
    const alreadyInThisWarmup = activeView === 'assignment'
      && activeAssignmentId === assignment.id
      && questionIndices.includes(currentQuestionIndex);

    return (
      <aside
        role="alert"
        aria-live="polite"
        // On a phone the assignment screen hides this banner: its countdown
        // rides in the section pill there, and a Warm-Up elsewhere in the
        // lesson is a line in the status chip (pass 3, RUN-14).
        className="mathmaster-warmup-banner"
        style={{
          position: 'sticky',
          top: `var(${STUDENT_IDENTITY_STACK_OFFSET}, 38px)`,
          zIndex: 19000,
          background: 'var(--mm-warning-soft)',
          color: 'var(--mm-warning-text)',
          borderBottom: '3px solid #f9ab00',
          boxShadow: '0 5px 18px rgba(0,0,0,0.16)',
          padding: '10px 16px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 14,
          flexWrap: 'wrap',
          textAlign: 'center',
        }}
      >
        <strong>🔥 WARM-UP ACTIVE</strong>
        <span>{assignment.title}</span>
        {!support.hideCountdowns && (
          <strong style={{ fontSize: 'calc(20 * var(--mm-px))' }}>
            <DOLCountdown endsAt={state.endsAt} /> remaining
          </strong>
        )}
        {!alreadyInThisWarmup && (
          <button
            type="button"
            onClick={() => {
              setStudentDashboardMode('assignments');
              startAssignment(assignment.id, questionIndices[0]);
            }}
            style={{
              padding: '8px 13px',
              borderRadius: 8,
              border: 0,
              background: '#b06000',
              color: '#fff',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            Go to Warm-Up
          </button>
        )}
      </aside>
    );
  };

  const renderIdleOverlay = () => {
    if (!isIdle) return null;
    return (
      <Dialog
        role="alertdialog"
        onClose={() => { lastActivityRef.current = Date.now(); setIsIdle(false); }}
        aria-labelledby="mathmaster-idle-title"
        aria-describedby="mathmaster-idle-detail"
        className="mathmaster-idle-overlay"
        data-idle-prompt=""
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.85)',
          // Above Work View (2147483000). At 9999 the overlay sat behind an
          // open Work View: the timer paused and the student was never told
          // (live QA round 2).
          zIndex: 2147483100,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '20px',
        }}
      >
        <div
          style={{
            background: 'var(--mm-surface)',
            padding: '40px',
            borderRadius: '12px',
            textAlign: 'center',
            maxWidth: '400px',
          }}
        >
          <h2 id="mathmaster-idle-title" style={{ color: 'var(--mm-danger)', marginTop: 0 }}>Are you still working?</h2>
          <p id="mathmaster-idle-detail" style={{ color: 'var(--mm-text-muted)', fontSize: 'calc(16 * var(--mm-px))', marginBottom: '30px' }}>
            Your timer has been paused due to inactivity. Your work stays where you left it.
          </p>
          <button
            type="button"
            // Focused on appearance so Enter or Space resumes, and a screen
            // reader lands on the dialog instead of the paused work behind it.
            ref={(element) => element?.focus?.({ preventScroll: true })}
            onClick={() => {
              lastActivityRef.current = Date.now();
              setIsIdle(false);
            }}
            style={{
              padding: '12px 24px',
              minHeight: '44px',
              fontSize: 'calc(16 * var(--mm-px))',
              background: '#1a73e8',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            Yes, I&apos;m Back!
          </button>
        </div>
      </Dialog>
    );
  };

  // The read-only "What changed" list, on Home (compact) and Grades.
  const renderWhatChangedPanel = (compact) => (
    <WhatChangedList
      items={whatChangedItems}
      compact={compact}
      onOpenAssignment={(assignmentId) => openStudentAssignmentResult(assignmentId, { origin: compact ? NAV_LEVEL.HOME : NAV_LEVEL.GRADES })}
      onMarkSeen={() => { if (user?.id) markWhatChangedSeen(user.id, Date.now()); }}
    />
  );

  // This is the authenticated-student shell boundary. Keeping identity here,
  // outside every destination, makes it survive Focus View, compact/mobile
  // assignment controls, Live Challenge, and screens that omit global nav.
  //
  // `main`: the screen has no main landmark of its own, so the shell wraps it
  // in one (NAV-15) — Home, Assignments, Grades, Rewards, Live Challenge,
  // Test Cycle and Recovery. Screens that draw their own <main> (the result
  // page, My Math Path, Tests & Exams, the assignment) keep the empty anchor.
  const renderStudentIdentityShell = (content, { preview = false, main = false } = {}) => {
    const studentShellLogoutRisk = preview ? null : describeLogoutRisk({
      outboxDepth: studentOutboxDepth,
      pendingGradeCount: studentPendingGradeCount,
      needsReviewCount: studentNeedsReviewCount,
      persistenceStatus: persistenceStatusWithUnstoredWork(studentPersistenceStatus, studentUnstoredAssignmentIds),
    });
    return (
    <div data-authenticated-student-shell={preview ? 'teacher-preview' : 'student'} style={{ minHeight: '100vh' }}>
      <SkipToContent />
      {/* NAV-3: the new screen's name, said once after a screen change. */}
      {!preview && (
        <div role="status" aria-live="polite" aria-atomic="true" data-screen-announcement className="mm-visually-hidden">
          {studentScreenAnnouncement}
        </div>
      )}
      {/* NAV-23: the Live Challenge invite or a Spotlight request, said once. */}
      {!preview && (
        <div role="status" aria-live="polite" aria-atomic="true" data-classroom-announcement className="mm-visually-hidden">
          {classroomAnnouncementText}
        </div>
      )}
      <StudentIdentityBar
        preview={preview}
        student={preview ? null : { ...studentRecord, ...user }}
        classPointsBalance={preview || studentClassPoints.unavailable ? null : studentClassPoints.account.balance}
        onLogout={preview ? null : handleLogout}
        // Unsent work still queued: Log Out asks first (logoutGuard.js).
        logoutRisk={studentShellLogoutRisk}
        // The pack-up line rides in the pinned stack (NAV-24).
        notice={preview ? null : renderStudentPackUpNotice()}
      />
      {!preview && studentSpotlightRequest?.status === SPOTLIGHT_STATUS.REQUESTED && (
        // Not a dialog (NAV-23): it takes no focus and blocks nothing; it is a
        // labelled region, and its arrival is said in the live region above.
        <section aria-label="Student Spotlight request" data-spotlight-request style={{ margin: '12px auto', maxWidth: 760, padding: '16px 18px', borderRadius: 12, border: '2px solid #681da8', background: 'var(--mm-accent-subtle)', color: 'var(--mm-text)' }}>
          <strong style={{ display: 'block', fontSize: 'calc(18 * var(--mm-px))' }}>{studentSpotlightRequest.teacherLabel || 'Your teacher'} would like to show your current MathMaster work to the class.</strong>
          <div style={{ marginTop: 5, fontSize: 'calc(13 * var(--mm-px))' }}>Nothing is visible unless you choose Present Now. This does not share your Chromebook screen.</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}><button type="button" onClick={() => respondToSpotlight(true)} style={{ padding: '9px 14px', border: 0, borderRadius: 8, background: '#681da8', color: '#fff', fontWeight: 900 }}>Present Now</button><button type="button" onClick={() => respondToSpotlight(false)} style={{ padding: '9px 14px', border: '1px solid #681da8', borderRadius: 8, background: 'var(--mm-surface)', color: 'var(--mm-accent-text)', fontWeight: 900 }}>Not Now</button></div>
        </section>
      )}
      {!preview && studentSpotlightRequest?.status === SPOTLIGHT_STATUS.ACCEPTED && (
        <section role="status" style={{ margin: '10px auto', maxWidth: 760, padding: '10px 14px', borderRadius: 10, background: '#681da8', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}><strong>Presenting to class</strong><button type="button" onClick={stopStudentSpotlight} style={{ padding: '7px 11px', border: '1px solid var(--mm-border-soft)', borderRadius: 7, background: 'var(--mm-surface)', color: 'var(--mm-accent-text)', fontWeight: 900 }}>Stop Presenting</button></section>
      )}
      {!preview && studentSpotlightMessage && <div role="status" style={{ margin: '8px auto', maxWidth: 760, padding: '8px 12px', color: 'var(--mm-text-muted)', fontSize: 'calc(12 * var(--mm-px))' }}>{studentSpotlightMessage}</div>}
      {main ? (
        // The screen's main landmark; the skip link enters it at its h1.
        <main id={MAIN_CONTENT_ID} tabIndex={-1} data-student-screen-main>
          {content}
        </main>
      ) : (
        <>
          {/* Where the skip link lands: focus here, the next Tab enters the screen. */}
          <div id={MAIN_CONTENT_ID} tabIndex={-1} />
          {content}
        </>
      )}
    </div>
    );
  };

  // A student screen with no main landmark of its own (NAV-15).
  const renderStudentScreen = (content) => renderStudentIdentityShell(content, { main: true });
  return [
    renderStudentLiveChallengeInvite, studentActiveWarmup, renderStudentWarmupBanner, renderIdleOverlay,
    renderWhatChangedPanel, renderStudentIdentityShell, renderStudentScreen,
  ];
}
