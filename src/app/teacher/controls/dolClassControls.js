/*
 * A TEACHER'S EXIT TICKET CONTROLS FOR A CLASS: RELEASING FEEDBACK, UNLOCKING, GRANTING ATTEMPTS, AND OPENING OR CLOSING IT.
 *
 * Moved verbatim from App.jsx, which calls this where the code was and passes what it reads by name. It holds no state and runs no effects: App keeps the busy flags and hands their setters in. It reaches App through the teacher kit (teacherKit.js), so it loads for a teacher and never with a student's Home.
 */
import { deleteField, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../firebase';
import { setStudentAssignmentControls } from '../../../services/studentAssignmentControlsService.js';
import { resolveTeacherGrantedExtraAttempts } from '../../../attemptPolicy';
import { getDOLState, localDateKey } from '../../../assignmentLifecycle';
import { assignmentFeedbackWasReleased, assignmentUsesTeacherReleasePolicy } from '../../student/assignmentRuntimeHelpers.js';
import { formatStudentName } from '../../../platform/studentName';

export function createDolClassControls(
  confirmAction, toastError, toastInfo, toastSuccess, toastWarning, user, classes, activeClass, allStudents,
  teacherKit, requireTeacherKit, classSchedule, setFeedbackReleaseBusyId, setDolUnlockBusyKey,
  setDolAttemptGrantBusyKey, setDolControlBusyKey, studentControlsGateRef,
) {
  const handleReleaseAssignmentFeedback = async (assignment) => {
    if (!assignment?.id || !assignmentUsesTeacherReleasePolicy(assignment) || assignmentFeedbackWasReleased(assignment)) return;
    // One release opens worked solutions in EVERY class this is assigned to:
    // name everyone who has not finished, by class, before it goes
    // (app/teacher/feedbackReleaseHold.js; coordinator QA M3). Only a teacher
    // releases feedback, so all three come from the teacher kit.
    const { describeFeedbackRelease, readReleaseControls, releaseHoldReport } = requireTeacherKit();
    // Every assigned class's extensions, not only the classes on screen.
    const privateRecords = await readReleaseControls({
      db, assignment, email: user?.email || '', isRootAdmin: user?.isRootAdmin === true,
    });
    const release = describeFeedbackRelease({
      title: assignment.title,
      ...releaseHoldReport({ assignment, privateRecords, students: allStudents, classes, nowValue: Date.now() }),
    });
    const proceedWithRelease = await confirmAction({
      title: release.title,
      message: release.message,
      confirmLabel: release.confirmLabel,
    });
    if (!proceedWithRelease) return;
    setFeedbackReleaseBusyId(assignment.id);
    try {
      const releasedAt = new Date().toISOString();
      await updateDoc(doc(db, 'assignments', assignment.id), {
        feedbackReleased: true,
        feedbackReleasedAt: releasedAt,
        updatedAt: releasedAt,
      });
      toastSuccess('Feedback released', `Students in ${assignment.title} can now see their results.`);
    } catch (error) {
      console.error(error);
      toastError('Could not release assessment feedback', error.message);
    } finally {
      setFeedbackReleaseBusyId(null);
    }
  };

  const resolveTeacherClassContext = (value) => {
    const supplied = value && typeof value === 'object' ? value : {};
    const classId = String(supplied?.classId || '').trim() || null;
    const classRecord = classId ? classes.find((entry) => entry.classId === classId) || null : null;
    const classPeriod = classRecord?.period || String(supplied?.classPeriod || '').trim() || null;
    return {
      classId,
      classPeriod,
      label: classRecord?.name || classPeriod || 'this class',
      key: classId || '',
    };
  };

  const handleUnlockDOLForClass = async (assignment, classContext) => {
    const { classId, classPeriod, label: classLabel, key: classKey } = resolveTeacherClassContext(classContext);
    if (!assignment?.id || !classId || !classPeriod || !classKey) return;
    const state = getDOLState({ assignment, schedule: classSchedule, classId, classPeriod, nowValue: Date.now() });
    if (!state.enabled) {
      toastWarning('No timed DOL', 'This assignment does not have an enabled DOL section.');
      return;
    }
    const needsOpenToday = ['notToday', 'unscheduled'].includes(state.status);
    if (!state.window) {
      toastWarning('Bell schedule needed', `Set today’s A/B day and bell times for ${classPeriod} before controlling its DOL.`);
      return;
    }
    if (state.status === 'active') {
      toastInfo('DOL is already open', `${assignment.title} is already available to ${classLabel}.`);
      return;
    }

    const actionNowMs = Date.now();
    const durationMinutes = Math.max(1, Number(assignment?.dol?.minutesBeforeEnd || 10));
    const closeMinutesBeforeEnd = Math.max(0, Number(assignment?.dol?.closeMinutesBeforeEnd ?? 5));
    const derivedRegularEndMs = Math.max(
      state.window.start.getTime(),
      state.window.end.getTime() - closeMinutesBeforeEnd * 60_000,
    );
    const canRestart = state.status === 'ended' && state.canRestart === true;
    // Once the normal DOL cutoff passes, a teacher can still deliberately
    // reopen the DOL. This is stored as an audited recovery window instead of
    // pretending the original bell-time window never ended.
    // After a teacher "Close now" the DOL grade was finalized exactly as at a
    // normal end, so reopening is always an audited recovery window — the only
    // kind of window the server lets reopen a final DOL grade.
    const reopenAfterTeacherClose = state.status === 'ended' && state.teacherClosed === true;
    const recoveryAfterCutoff = reopenAfterTeacherClose || ((state.status === 'ended' || needsOpenToday)
      && actionNowMs >= (state.regularEndsAt?.getTime?.() || derivedRegularEndMs));
    const beforeClass = state.status === 'beforeClass' || actionNowMs < state.window.start.getTime();

    const proceed = await confirmAction({
      title: recoveryAfterCutoff
        ? `Reopen the DOL for ${classLabel}?`
        : canRestart
          ? `Restart the DOL for ${classLabel}?`
          : needsOpenToday
            ? `Open the DOL today for ${classLabel}?`
            : `Unlock the DOL early for ${classLabel}?`,
      message: reopenAfterTeacherClose
        ? `You closed this DOL for ${classLabel}. MathMaster will open a new ${durationMinutes}-minute teacher window for ${classLabel} only. Work in it counts, existing attempts stay intact, and both the close and the reopen stay on record.`
        : recoveryAfterCutoff
        ? `The normal DOL window has ended. MathMaster will open a new ${durationMinutes}-minute teacher recovery window for ${classLabel} only. Existing attempts and work history stay intact, and the exception is recorded on the assignment.`
        : canRestart
          ? `The earlier DOL timer ended, but instructional DOL time remains. Restart it now for ${classLabel} only. The timer will still stop before the normal DOL cutoff.`
          : needsOpenToday
            ? beforeClass
              ? `This lesson was saved for another instructional day. MathMaster will set today as the DOL date for ${classLabel} only, then open it when class begins with its ${durationMinutes}-minute timer.`
              : `This lesson was saved for another instructional day. MathMaster will set today as the DOL date for ${classLabel} only and open it now with its ${durationMinutes}-minute timer. Other classes stay unchanged.`
            : beforeClass
              ? `The DOL will open when ${classLabel} begins and its ${durationMinutes}-minute timer will start then.`
              : `The DOL will open immediately for ${classLabel} and its ${durationMinutes}-minute timer will start now. Other classes stay locked.`,
      confirmLabel: recoveryAfterCutoff ? 'Reopen DOL' : canRestart ? 'Restart DOL' : needsOpenToday ? 'Open DOL Today' : 'Unlock DOL',
    });
    if (!proceed) return;

    const busyKey = `${assignment.id}:${classKey}`;
    setDolUnlockBusyKey(busyKey);
    try {
      const writeNow = Date.now();
      const openedAt = new Date(writeNow).toISOString();
      const dateKey = localDateKey(writeNow);
      const currentRegularEndMs = state.regularEndsAt?.getTime?.() || derivedRegularEndMs;
      // Re-evaluate after confirmation. If the regular cutoff passed while the
      // dialog was open, safely convert the action into a recovery window.
      const recoveryNow = reopenAfterTeacherClose || ((state.status === 'ended' || needsOpenToday) && writeNow >= currentRegularEndMs);

      // Built by the recovery model so every opening lands in the append-only
      // audit (who, class, before, after, when) — see assessmentRecovery.js.
      // The builder makes today this class's DOL date (instructionDatesByClassId,
      // this class only) and first keeps the date it replaces
      // (scheduledInstructionDatesByClassId), so the teacher can return to it.
      const opening = requireTeacherKit().buildDolWindowOpening({
        assignment,
        classId,
        classPeriod,
        recovery: recoveryNow,
        durationMinutes,
        dateKey,
        teacherId: user?.id || null,
        now: writeNow,
      });

      // Only the class's DOL fields this opening changed; never a student's grant.
      await updateDoc(doc(db, 'assignments', assignment.id), { ...requireTeacherKit().classDolFieldPatch(assignment.dol, opening.dol, { deleteValue: deleteField() }), updatedAt: openedAt });
      if (recoveryNow) {
        toastSuccess('DOL reopened', `${assignment.title} has a fresh ${durationMinutes}-minute recovery window for ${classLabel}. Existing work and attempt history were preserved.`);
      } else if (canRestart) {
        toastSuccess('DOL restarted', `${assignment.title} is open again for ${classLabel} only and will still stop before the normal pack-up window.`);
      } else {
        toastSuccess('DOL unlocked', `${assignment.title} is released for ${classLabel} only. Its timer starts when the unlock takes effect.`);
      }
    } catch (error) {
      console.error(error);
      toastError('Could not open DOL', error.message);
    } finally {
      setDolUnlockBusyKey(null);
    }
  };

  const handleGrantDOLAttemptForClass = async (assignment, classContext) => {
    const { classId, label: classLabel, key: classKey } = resolveTeacherClassContext(classContext);
    if (!assignment?.id || !classId || !classKey) return;
    const currentBonus = resolveTeacherGrantedExtraAttempts({
      assignment,
      activityRole: 'dol',
      classId,
    });
    const proceed = await confirmAction({
      title: `Grant one more DOL attempt to ${classLabel}?`,
      message: `Every student in ${classLabel} will receive one additional attempt on each DOL question in this assignment. Existing attempts, scores, and response history are preserved. The class bonus will become ${currentBonus + 1}.`,
      confirmLabel: 'Grant +1 Attempt',
    });
    if (!proceed) return;

    const busyKey = `${assignment.id}:${classKey}`;
    setDolAttemptGrantBusyKey(busyKey);
    try {
      const nowMs = Date.now();
      const changedAt = new Date(nowMs).toISOString();
      const { dol } = requireTeacherKit().buildDolAttemptGrant({
        assignment,
        scope: { type: 'class', classId },
        teacherId: user?.id || null,
        now: nowMs,
      });
      // The class grant only (`dol.attemptGrantsByClassId`, its audit entry).
      await updateDoc(doc(db, 'assignments', assignment.id), { ...requireTeacherKit().classDolFieldPatch(assignment.dol, dol, { deleteValue: deleteField() }), updatedAt: changedAt });
      toastSuccess('Extra DOL attempt granted', `${classLabel} now has ${Math.min(20, currentBonus + 1)} teacher-granted extra DOL attempt${Math.min(20, currentBonus + 1) === 1 ? '' : 's'}.`);
    } catch (error) {
      console.error(error);
      toastError('Could not grant DOL attempt', error.message);
    } finally {
      setDolAttemptGrantBusyKey(null);
    }
  };
  const handleGrantDOLAttemptForStudents = async (assignment, students = []) => {
    const chosen = (students || []).filter((student) => student?.id);
    if (!assignment?.id || !chosen.length) return;
    if (!teacherKit) {
      toastError('Could not grant DOL attempt', 'The teacher workspace has not finished loading. Try again in a moment.');
      return;
    }
    const { controlsRequestKey, createControlsRequestGate, planStudentDolGrant, runStudentControlsCalls } = teacherKit;
    if (!studentControlsGateRef.current) studentControlsGateRef.current = createControlsRequestGate();
    const requestKey = controlsRequestKey({ assignmentId: assignment.id, studentIds: chosen.map((student) => student.id), kind: 'dolAttempts' });
    // The first click is still on its way to the server: nothing to confirm twice.
    if (studentControlsGateRef.current.pending(requestKey)) return;
    const names = chosen.map((student) => formatStudentName(student)).join(', ');
    const proceed = await confirmAction({
      title: chosen.length === 1 ? `Grant one more DOL attempt to ${names}?` : `Grant one more DOL attempt to ${chosen.length} students?`,
      message: `${chosen.length === 1 ? names : names} will receive one additional attempt on each DOL question in ${assignment.title}. Existing attempts, scores, and response history are preserved, and the grant is recorded.`,
      confirmLabel: 'Grant +1 Attempt',
    });
    if (!proceed) return;
    const busyKey = `${assignment.id}:students:${chosen.map((student) => student.id).join('+')}`;
    setDolAttemptGrantBusyKey(busyKey);
    try {
      const { duplicate, promise } = studentControlsGateRef.current.run(requestKey, async () => {
        const { calls, unplaced } = planStudentDolGrant({
          assignmentId: assignment.id,
          students: chosen,
          fallbackClassId: activeClass?.classId || null,
        });
        const outcome = await runStudentControlsCalls({ call: setStudentAssignmentControls, calls });
        return { ...outcome, unplaced };
      });
      if (duplicate) return;
      const { students: granted, failures, unplaced } = await promise;
      const nameOf = (studentId) => formatStudentName(chosen.find((student) => student.id === studentId) || { id: studentId });
      if (granted.length) {
        const only = granted.length === 1 ? granted[0] : null;
        toastSuccess('Extra DOL attempt granted', only
          ? `${nameOf(only.studentId)} now has ${only.dolExtraAttempts} extra ${only.dolExtraAttempts === 1 ? 'attempt' : 'attempts'} of their own on each DOL question.`
          : `${granted.length} students have one more attempt on each DOL question.`);
      }
      if (failures.length || unplaced.length) {
        const refused = failures.flatMap((failure) => failure.studentIds.map((studentId) => `${nameOf(studentId)} — ${failure.message}`));
        const noClass = unplaced.map((studentId) => `${nameOf(studentId)} — not in a class`);
        toastError('Some DOL attempts were not granted', [...refused, ...noClass].slice(0, 6).join(' · '));
      }
    } catch (error) {
      console.error(error);
      toastError('Could not grant DOL attempt', error.message);
    } finally {
      setDolAttemptGrantBusyKey(null);
    }
  };

  /*
   * CLOSE NOW · +5 MIN · NOT TODAY · BACK TO THE SCHEDULED DAY — for one class.
   *
   * Real periods get interrupted (fire drills, assemblies, classwork that runs
   * long). Each action is built by the audited recovery model, asks first, and
   * touches only this class. When each is offered is decided in
   * platform/teacher/classLessonControls.js:
   *   - close / extend only while the DOL is open (a close is a normal end);
   *   - move / back-to-scheduled only before it opens (a date change never
   *     closes or finalizes anything, and the original day is always kept).
   */
  const handleDolControlForClass = async (assignment, classContext, control = {}) => {
    const { classId, classPeriod, label: classLabel, key: classKey } = resolveTeacherClassContext(classContext);
    if (!assignment?.id || !classId || !classKey) return;
    const action = String(control?.action || '');
    const nowMs = Date.now();
    const state = getDOLState({ assignment, schedule: classSchedule, classId, classPeriod, nowValue: nowMs });
    const todayKey = localDateKey(nowMs);
    const teacherId = user?.id || null;
    const clockOf = (ms) => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    const dayOf = (key) => {
      if (!key) return 'another day';
      const [year, month, day] = String(key).split('-').map(Number);
      return new Date(year, month - 1, day, 12).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    };
    const ranToday = ['active', 'ended'].includes(state.status) && state.instructionDateKey === todayKey;

    let confirmation;
    let build;
    let success;
    if (action === 'close') {
      if (state.status !== 'active') {
        toastInfo('The DOL is not open', `${assignment.title} is not open for ${classLabel} right now.`);
        return;
      }
      // RT05 (the owner, 2026-10-23): the close ends the class's window; a
      // student on extra time keeps their own remaining time (sectionDeadline.mjs
      // resolveDolWindow), and the teacher is told so before pressing it.
      confirmation = {
        title: `Close the DOL now for ${classLabel}?`,
        message: `Students in ${classLabel} stop working on the DOL now, exactly as if its timer had run out: answers so far are kept and graded. A student on extra time keeps their own remaining time. Other classes are unaffected, and you can reopen it afterwards.`,
        confirmLabel: 'Close DOL',
      };
      build = () => requireTeacherKit().buildDolClose({ assignment, classId, dateKey: todayKey, teacherId, now: Date.now() });
      success = ['DOL closed', `${assignment.title} · ${classLabel}`];
    } else if (action === 'extend') {
      if (state.status !== 'active') {
        toastInfo('The DOL is not open', 'Only an open DOL can be given more time. Use Reopen after it ends.');
        return;
      }
      const minutes = Math.max(1, Math.min(30, Number(control?.minutes) || 5));
      const classEndMs = state.window?.end?.getTime?.() ?? null;
      const proposedMs = Math.min(classEndMs ?? Number.POSITIVE_INFINITY, Math.max(state.endsAt.getTime(), nowMs) + minutes * 60_000);
      confirmation = {
        title: `Give ${classLabel} ${minutes} more minutes on the DOL?`,
        message: `The DOL stays open for ${classLabel} until ${clockOf(proposedMs)}${classEndMs !== null && proposedMs >= classEndMs ? ' — the end of the period' : ''}. Work in the extra time counts. Other classes are unaffected.`,
        confirmLabel: `Extend to ${clockOf(proposedMs)}`,
      };
      build = () => requireTeacherKit().buildDolExtension({ assignment, classId, dateKey: todayKey, currentEndsAtMs: state.endsAt.getTime(), minutes, capAtMs: classEndMs, teacherId, now: Date.now() });
      success = ['DOL extended', `${assignment.title} · ${classLabel} · open until ${clockOf(proposedMs)}`];
    } else if (action === 'move') {
      const toDateKey = String(control?.toDateKey || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(toDateKey)) {
        toastWarning('Choose a day', 'Pick the day this class should take the DOL.');
        return;
      }
      if (ranToday) {
        toastWarning('The DOL already ran today', `Students in ${classLabel} have already had today’s DOL window, so its day stays as it is.`);
        return;
      }
      confirmation = {
        title: `Move ${classLabel}’s DOL to ${dayOf(toDateKey)}?`,
        message: `The DOL will not open for ${classLabel} ${state.instructionDateKey === todayKey ? 'today' : `on ${dayOf(state.instructionDateKey)}`}; it runs at the end of class on ${dayOf(toDateKey)} instead. Nothing is closed or graded, other classes keep their day, and the original day is kept so you can move it back.`,
        confirmLabel: 'Move DOL',
      };
      build = () => requireTeacherKit().buildDolDateMove({ assignment, classId, classPeriod, toDateKey, todayKey, teacherId, now: Date.now() });
      success = ['DOL moved', `${assignment.title} · ${classLabel} · ${dayOf(toDateKey)}`];
    } else if (action === 'restore') {
      const saved = requireTeacherKit().scheduledDolDateFor(assignment, classId);
      if (!saved) {
        toastInfo('Already on schedule', `${assignment.title} is on its scheduled day for ${classLabel}.`);
        return;
      }
      if (ranToday) {
        toastWarning('The DOL already ran today', `Students in ${classLabel} have used today’s DOL window, so the day change stays on record.`);
        return;
      }
      confirmation = {
        title: `Put ${classLabel}’s DOL back on its scheduled day?`,
        message: saved.resolvedDateKey
          ? `The DOL returns to ${dayOf(saved.resolvedDateKey)} and its automatic timing for ${classLabel}. Other classes are unaffected.`
          : `The DOL returns to having no scheduled day for ${classLabel}. Other classes are unaffected.`,
        confirmLabel: 'Back to schedule',
      };
      build = () => requireTeacherKit().buildDolScheduleRestore({ assignment, classId, todayKey, teacherId, now: Date.now() });
      success = ['DOL back on schedule', `${assignment.title} · ${classLabel}`];
    } else {
      return;
    }

    const proceed = await confirmAction(confirmation);
    if (!proceed) return;
    const busyKey = `${assignment.id}:${classKey}`;
    setDolControlBusyKey(busyKey);
    try {
      const { dol } = build();
      await updateDoc(doc(db, 'assignments', assignment.id), { ...requireTeacherKit().classDolFieldPatch(assignment.dol, dol, { deleteValue: deleteField() }), updatedAt: new Date().toISOString() });
      toastSuccess(success[0], success[1]);
    } catch (error) {
      console.error(error);
      toastError('Could not change the DOL', error.message);
    } finally {
      setDolControlBusyKey(null);
    }
  };
  return [
    handleReleaseAssignmentFeedback, resolveTeacherClassContext, handleUnlockDOLForClass,
    handleGrantDOLAttemptForClass, handleGrantDOLAttemptForStudents, handleDolControlForClass,
  ];
}
