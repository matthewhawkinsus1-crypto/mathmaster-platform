/*
 * TURNING A WARM-UP OR A SECTION ON AND OFF FOR A CLASS.
 *
 * Moved verbatim from App.jsx, which calls this where the code was and passes what it reads by name. It holds no state and runs no effects: App keeps the busy flags and hands their setters in. It reaches App through the teacher kit (teacherKit.js), so it loads for a teacher and never with a student's Home.
 */
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../firebase';
import { applyWarmupTeacherControl, resolveWarmupInstructionDateKey } from '../../../../functions/shared/sectionDeadline.mjs';
import {
  earlySectionAccessState, getWarmupState, getSectionAccessState as getSectionAccessStateForAnyone, localDateKey,
  opensEarlyByPrerequisite,
} from '../../../assignmentLifecycle';

export function createWarmupSectionControls(
  confirmAction, toastError, toastInfo, toastSuccess, toastWarning, user, classSchedule, setWarmupControlBusyKey,
  setSectionAccessBusyKey, resolveTeacherClassContext,
) {
  const handleToggleWarmupForClass = async (assignment, classContext, control = {}) => {
    const { classId, classPeriod, label: classLabel, key: classKey } = resolveTeacherClassContext(classContext);
    if (!assignment?.id || !classId || !classPeriod || !classKey) return;
    const state = getWarmupState({ assignment, schedule: classSchedule, classId, classPeriod, nowValue: Date.now() });
    if (!state.enabled) {
      toastWarning('No Warm-Up section', 'This assignment does not have an authored Warm-Up section.');
      return;
    }
    if (!state.window) {
      toastWarning('Bell schedule needed', `Set today’s A/B day and bell times for ${classPeriod} before controlling its Warm-Up.`);
      return;
    }

    const requestedAction = String(control?.action || '').trim();
    const needsOpenToday = ['notToday', 'unscheduled'].includes(state.status);
    const action = ['close', 'reopen', 'timer'].includes(requestedAction)
      ? requestedAction
      : state.status === 'active'
        ? 'close'
        : 'reopen';
    const requestedTimerMinutes = Number(control?.autoCloseMinutes);
    const timerMinutes = Number.isFinite(requestedTimerMinutes)
      ? Math.max(1, Math.min(60, Math.round(requestedTimerMinutes)))
      : 5;
    const nowMs = Date.now();

    // A stale instructional date must not hide the teacher's live control, but
    // it also must not let a teacher reopen yesterday's class after the bell.
    if (nowMs > state.window.end.getTime()) {
      toastWarning('Class period ended', 'The Warm-Up cannot be reopened after this class period has ended.');
      return;
    }
    if (state.opensAt && nowMs < state.opensAt.getTime()) {
      toastInfo('Warm-Up has not opened yet', `It opens ${state.minutesBeforeStart} minutes before ${classLabel} begins.`);
      return;
    }
    if (state.status === 'ended') {
      toastWarning('Class period ended', 'The Warm-Up is already read-only because this class period has ended.');
      return;
    }

    const timerClosesAt = action === 'timer'
      ? new Date(Math.min(state.window.end.getTime(), nowMs + timerMinutes * 60000))
      : null;

    if (action === 'timer' && timerClosesAt.getTime() <= nowMs) {
      toastWarning('Warm-Up timer unavailable', 'This class period is ending, so there is no time left to reopen the Warm-Up.');
      return;
    }
    if (action === 'reopen' && state.status === 'active') {
      toastInfo('Warm-Up is already open', `${assignment.title} is already available to ${classLabel}.`);
      return;
    }
    if (action === 'close' && state.status === 'closed') {
      toastInfo('Warm-Up is already closed', `${assignment.title} is already read-only for ${classLabel}.`);
      return;
    }

    const closesAtLabel = timerClosesAt?.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    const openVerb = needsOpenToday ? 'Open' : 'Reopen';
    const proceed = await confirmAction({
      title: action === 'timer'
        ? `${needsOpenToday ? 'Open' : state.status === 'closed' ? 'Reopen' : 'Keep'} the Warm-Up open with a timer for ${classLabel}?`
        : `${action === 'close' ? 'Close' : openVerb} the Warm-Up${needsOpenToday ? ' today' : ''} for ${classLabel}?`,
      message: action === 'close'
        ? 'Students in this class will keep their saved work for review, but they will not be able to make new Warm-Up submissions. Other classes are unaffected.'
        : action === 'reopen'
          ? needsOpenToday
            ? 'MathMaster will make today the Warm-Up instructional date for this class only. Students can continue immediately; other classes and their dates are unaffected.'
            : 'Students in this class will be able to continue the Warm-Up until you close it again or the class period ends.'
          : `Students in this class will be able to work until ${closesAtLabel}. The Warm-Up will then close automatically and saved work will remain available for review. Other classes are unaffected.`,
      confirmLabel: action === 'close'
        ? 'Close Warm-Up'
        : action === 'reopen'
          ? needsOpenToday ? 'Open Warm-Up Today' : 'Reopen Warm-Up'
          : needsOpenToday
            ? `Open for ${timerMinutes} min`
            : state.status === 'closed'
              ? `Reopen for ${timerMinutes} min`
              : `Set ${timerMinutes}-min timer`,
    });
    if (!proceed) return;

    const busyKey = `${assignment.id}:${classKey}`;
    setWarmupControlBusyKey(busyKey);
    try {
      // The Close / Reopen / Timer record itself is shared and tested
      // (applyWarmupTeacherControl): a reopen pins today's date to this real
      // class id, lifts a manual close, and stays open until this class ends
      // unless the teacher chose a timer. Student work is never touched.
      const changedAtMs = Date.now();
      const dateKey = localDateKey(changedAtMs);
      const { warmup, changedAt } = applyWarmupTeacherControl({
        assignment,
        classId,
        action,
        nowMs: changedAtMs,
        dateKey,
        windowEndMs: state.window.end.getTime(),
        // The close the confirmation showed the teacher.
        timerClosesAtMs: timerClosesAt ? timerClosesAt.getTime() : null,
        teacherIdentity: user?.email || user?.id || 'teacher',
      });
      // Opening a Warm-Up on another day moves this class's Warm-Up day. Keep
      // the day it replaces (once, on the first override) so the class page can
      // say "originally …" — the same rule the DOL follows.
      const scheduledWarmupDateKey = resolveWarmupInstructionDateKey({ assignment, classId, classPeriod });
      if (action !== 'close' && scheduledWarmupDateKey !== dateKey && !assignment.warmup?.scheduledInstructionDatesByClassId?.[classId]) {
        warmup.scheduledInstructionDatesByClassId = {
          ...(assignment.warmup?.scheduledInstructionDatesByClassId || {}),
          [classId]: {
            classDateKey: assignment.warmup?.instructionDatesByClassId?.[classId] || null,
            resolvedDateKey: scheduledWarmupDateKey || null,
            savedAt: changedAt,
          },
        };
      }
      await updateDoc(doc(db, 'assignments', assignment.id), { warmup, updatedAt: changedAt });

      if (action === 'timer') {
        toastSuccess(
          needsOpenToday ? 'Warm-Up opened for today with timer' : state.status === 'closed' ? 'Warm-Up reopened with timer' : 'Warm-Up timer set',
          `${assignment.title} · ${classLabel} · closes automatically at ${closesAtLabel}`,
        );
      } else {
        toastSuccess(
          action === 'close' ? 'Warm-Up closed' : needsOpenToday ? 'Warm-Up opened for today' : 'Warm-Up reopened',
          `${assignment.title} · ${classLabel}`,
        );
      }
    } catch (error) {
      console.error(error);
      toastError(
        action === 'timer' ? 'Could not set Warm-Up timer' : `Could not ${action} Warm-Up`,
        error.message,
      );
    } finally {
      setWarmupControlBusyKey(null);
    }
  };

  const handleToggleSectionAccessForClass = async (assignment, classContext, activityRole) => {
    const { classId, classPeriod, label: classLabel, key: classKey } = resolveTeacherClassContext(classContext);
    if (!assignment?.id || !classId || !classPeriod || !classKey || !['classwork', 'practice'].includes(activityRole)) return;
    // The teacher's own control: the plain rule, never a student's grades.
    const state = getSectionAccessStateForAnyone({ assignment, activityRole, classId, classPeriod, nowValue: Date.now() });
    if (!state.enabled) {
      toastWarning('Section not found', `This assignment does not have an authored ${activityRole} section.`);
      return;
    }
    if (state.practiceOnly) {
      toastInfo('Assignment is in Practice Mode', 'After the final cutoff, all sections stay available for ungraded review and practice.');
      return;
    }
    // Before release, a lesson that opens early by prerequisite already has
    // students in it (TT28): its sections are the teacher's to open or close
    // for them, read as they read them. Any other unreleased lesson waits.
    const beforeRelease = state.status === 'scheduled' && opensEarlyByPrerequisite(assignment);
    if (state.status === 'scheduled' && !beforeRelease) {
      toastWarning('Assignment has not opened yet', 'Section controls become active when the assignment is released.');
      return;
    }
    if (!state.lifecycle?.isOpen && !beforeRelease) {
      toastWarning('Assignment is not open', 'This section cannot be changed while the graded assignment is closed.');
      return;
    }
    const current = beforeRelease
      ? earlySectionAccessState({ assignment, activityRole, classId, classPeriod, nowValue: Date.now() })
      : state;

    const nextState = current.isOpen ? 'closed' : 'open';
    const label = activityRole === 'classwork' ? 'Classwork' : 'Practice';
    const who = beforeRelease ? `Students in ${classLabel} who opened this lesson early (their prerequisite met)` : `Students in ${classLabel}`;
    const proceed = await confirmAction({
      title: `${nextState === 'open' ? 'Open' : 'Close'} ${label} for ${classLabel}?`,
      message: nextState === 'open'
        ? `${who} will be able to work in the ${label} section.${beforeRelease ? ' Everyone else in the class gets it open when the lesson is released.' : ''} Other classes are unaffected.`
        : `${who} will keep saved ${label} work for review, but new graded responses in that section will be locked until you reopen it. Other classes are unaffected.`,
      confirmLabel: `${nextState === 'open' ? 'Open' : 'Close'} ${label}`,
    });
    if (!proceed) return;

    const busyKey = `${assignment.id}:${classKey}:${activityRole}`;
    setSectionAccessBusyKey(busyKey);
    try {
      const changedAt = new Date().toISOString();
      const sectionAccess = { ...(assignment.sectionAccess || {}) };
      const config = { ...(sectionAccess[activityRole] || {}) };
      const entry = { state: nextState, changedAt, changedBy: user?.email || user?.id || 'teacher' };
      config.overridesByClassId = { ...(config.overridesByClassId || {}), [classId]: entry };
      sectionAccess[activityRole] = { ...config, defaultState: config.defaultState === 'closed' ? 'closed' : 'open' };
      await updateDoc(doc(db, 'assignments', assignment.id), { sectionAccess, updatedAt: changedAt });
      toastSuccess(`${label} ${nextState}`, `${assignment.title} · ${classLabel}`);
    } catch (error) {
      console.error(error);
      toastError(`Could not ${nextState === 'open' ? 'open' : 'close'} ${label}`, error.message);
    } finally {
      setSectionAccessBusyKey(null);
    }
  };
  return [handleToggleWarmupForClass, handleToggleSectionAccessForClass];
}
