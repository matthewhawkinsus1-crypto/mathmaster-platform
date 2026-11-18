/*
 * A STUDENT'S TIMED SECTIONS: THE EXIT TICKET AND WARM-UP REMINDERS, AND THE EXIT TICKET'S CLOSE.
 *
 * Moved verbatim from App.jsx, which calls this where the code was and passes
 * what it reads by name. Its effects keep their place among App's effects
 * (scripts/app-hook-ledger.mjs).
 */
import { useEffect, useRef } from 'react';
import { EXIT_TICKET_SPELLED_OUT, exitTicketInSentence } from '../../platform/student/studentWords.js';
import { summarizeStudentRecovery } from '../../platform/assessment/studentRecoverySummary.js';
import { normalizeQuestionRecord } from '../../attemptPolicy';
import {
  assignmentIsForStudent, formatDateTime, formatRemainingTime, getDOLState, getWarmupState, localDateKey,
  questionIsIncluded,
} from '../../assignmentLifecycle';
import { resolveQuestionActivityRole } from '../../platform/policies/activityPolicies';
import { getStoredAssignmentQuestions } from '../../platform/contract/storedAssignmentV5.js';
import { shouldShowDolOpenReminder } from '../../platform/student/dolReminder.js';
import { calculateDOLSectionScore } from './assignmentRuntimeHelpers.js';

export function useTimedSectionReminders({
  toastSuccess, toastWarning, user, studentRequiredFor, activeView, assignments, activeAssignmentId, tracker,
  currentQuestionIndex, now, classSchedule, dolGradesByAssignment, setDolGradesByAssignment, gradeDisplayTracker,
}) {
  const dolRecoveryAnnouncedRef = useRef({});
  const lastDOLStatusRef = useRef({});
  // Last student DOL reminder timestamp, keyed by assignment + class + date.
  // The active DOL card/banner stays visible; this adds a repeated nudge for a
  // student who is deep in another question or sitting on the dashboard.
  const dolOpenAnnouncedRef = useRef({});
  // Warm-Up notices follow the same student-wide pattern as DOL notices:
  // visible on every student surface and repeated while unfinished work is
  // still inside the live Warm-Up window.
  const warmupOpenAnnouncedRef = useRef({});

  // DOL reminders are global to the student experience, not just the open
  // assignment. The persistent purple DOL card/banner is the primary notice;
  // this reminder repeats every two minutes until the student submits once.
  useEffect(() => {
    if (user?.role !== 'student' || !user.classPeriod) return;
    const activeKeys = new Set();
    assignments.forEach((assignment) => {
      if (!assignmentIsForStudent(assignment, { classId: user.classId || null, classPeriod: user.classPeriod })) return;
      const dolState = getDOLState({ assignment, schedule: classSchedule, classId: user.classId || null, classPeriod: user.classPeriod, nowValue: now });
      if (dolState.status !== 'active') return;
      const dolRecords = (dolState.questionIndices || [dolState.questionIndex])
        .filter((index) => Number.isInteger(index) && index >= 0)
        .map((index) => normalizeQuestionRecord(tracker?.[assignment.id]?.[index]));
      if (dolRecords.some((record) => record.totalAttempts > 0 || ['correct', 'expired'].includes(record.status))) return;
      const key = `${assignment.id}:${user.classPeriod}:${dolState.instructionDateKey || localDateKey(now)}`;
      activeKeys.add(key);
      // Not while the student is on that DOL's questions: it would tell them
      // to open what they have open (release-candidate QA m13).
      if (!shouldShowDolOpenReminder({
        assignmentId: assignment.id,
        dolQuestionIndices: dolState.questionIndices || [dolState.questionIndex],
        activeView,
        activeAssignmentId,
        currentQuestionIndex,
      })) return;
      const lastReminderAt = Number(dolOpenAnnouncedRef.current[key] || 0);
      if (lastReminderAt && now - lastReminderAt < 120000) return;
      const firstReminder = lastReminderAt === 0;
      dolOpenAnnouncedRef.current[key] = now;
      toastWarning(
        firstReminder ? `${EXIT_TICKET_SPELLED_OUT} is open — start now` : `${EXIT_TICKET_SPELLED_OUT} reminder — start now`,
        `${assignment.title}: open the ${exitTicketInSentence} now. The timer is running and ${formatRemainingTime(dolState.millisecondsRemaining)} remains.`,
      );
    });
    Object.keys(dolOpenAnnouncedRef.current).forEach((key) => {
      if (!activeKeys.has(key) && now - Number(dolOpenAnnouncedRef.current[key] || 0) > 15 * 60000) delete dolOpenAnnouncedRef.current[key];
    });
  }, [now, user, assignments, classSchedule, tracker, toastWarning, activeView, activeAssignmentId, currentQuestionIndex]);

  // A REOPENED DOL OR AN EXTRA ATTEMPT MUST REACH THE STUDENT WHO ALREADY TRIED.
  // The reminder above stops once a student has attempted the DOL, which is
  // exactly who a teacher recovery is for. Tell them once per change: the
  // window reopened (and when it closes), or how many more attempts they have.
  useEffect(() => {
    if (user?.role !== 'student') return;
    assignments.forEach((assignment) => {
      if (!assignment?.dol?.enabled) return;
      if (!assignmentIsForStudent(assignment, { classId: user.classId || null, classPeriod: user.classPeriod })) return;
      const recovery = summarizeStudentRecovery({ assignment, classId: user.classId || null, studentId: user.id, now });
      const reopenKey = recovery.reopened ? `${assignment.id}:reopened:${recovery.reopened.openedAt}` : null;
      if (reopenKey && !dolRecoveryAnnouncedRef.current[reopenKey]) {
        dolRecoveryAnnouncedRef.current[reopenKey] = true;
        toastWarning('Your teacher reopened the DOL', `${assignment.title}: the DOL is open again until ${formatDateTime(recovery.reopened.closesAt)}. Your earlier work is still there.`);
      }
      // A standing grant matters while the DOL can be worked; do not repeat an
      // old grant every session on days the DOL is closed.
      const dolOpen = getDOLState({ assignment, schedule: classSchedule, classId: user.classId || null, classPeriod: user.classPeriod, nowValue: now }).status === 'active';
      const grantKey = recovery.extraAttempts && dolOpen ? `${assignment.id}:attempts:${recovery.extraAttempts}` : null;
      if (grantKey && !dolRecoveryAnnouncedRef.current[grantKey]) {
        dolRecoveryAnnouncedRef.current[grantKey] = true;
        toastSuccess('More DOL attempts', `${assignment.title}: your teacher gave you ${recovery.extraAttempts} extra ${recovery.extraAttempts === 1 ? 'attempt' : 'attempts'} on each DOL question. Your earlier attempts still count.`);
      }
    });
  }, [now, user, assignments, classSchedule, toastWarning, toastSuccess]);

  // Warm-Up reminders are student-wide, just like DOL reminders. The amber
  // countdown stays visible everywhere; this toast announces the opening and
  // repeats every two minutes while Warm-Up questions still need work.
  useEffect(() => {
    if (user?.role !== 'student' || !user.classPeriod) return;
    const activeKeys = new Set();
    const classContext = { classId: user.classId || null, classPeriod: user.classPeriod };

    assignments.forEach((assignment) => {
      if (!assignmentIsForStudent(assignment, classContext)) return;
      const warmupState = getWarmupState({
        assignment,
        schedule: classSchedule,
        ...classContext,
        nowValue: now,
      });
      if (warmupState.status !== 'active') return;

      const questions = getStoredAssignmentQuestions(assignment);
      // Only this student's own Warm-Up items (an omitted one is not unfinished).
      const warmupOmitted = new Set(studentRequiredFor(assignment).omitted);
      const warmupIndices = questions.reduce((indices, question, index) => {
        if (
          questionIsIncluded(question)
          && !warmupOmitted.has(index)
          && resolveQuestionActivityRole({ question, assignment }) === 'warmup'
        ) indices.push(index);
        return indices;
      }, []);
      if (!warmupIndices.length) return;

      const records = warmupIndices.map((index) => normalizeQuestionRecord(tracker?.[assignment.id]?.[index]));
      if (records.every((record) => ['correct', 'expired'].includes(record.status))) return;

      const key = `${assignment.id}:${user.classId || user.classPeriod}:${warmupState.instructionDateKey || localDateKey(now)}`;
      activeKeys.add(key);
      // Inside this assignment the Warm-Up's time is already on screen (the
      // banner, the section pill, the phone's status chip): a toast over the
      // Submit bar only repeated it (pass 3, RUN-14).
      if (activeView === 'assignment' && activeAssignmentId === assignment.id) return;
      const lastReminderAt = Number(warmupOpenAnnouncedRef.current[key] || 0);
      if (lastReminderAt && now - lastReminderAt < 120000) return;

      const firstReminder = lastReminderAt === 0;
      warmupOpenAnnouncedRef.current[key] = now;
      toastWarning(
        firstReminder ? 'Warm-Up is active — start now' : 'Warm-Up reminder — timer is running',
        `${assignment.title}: the Warm-Up is open now and ${formatRemainingTime(warmupState.millisecondsRemaining)} remains.`,
      );
    });

    Object.keys(warmupOpenAnnouncedRef.current).forEach((key) => {
      if (
        !activeKeys.has(key)
        && now - Number(warmupOpenAnnouncedRef.current[key] || 0) > 15 * 60000
      ) delete warmupOpenAnnouncedRef.current[key];
    });
  }, [now, user, assignments, classSchedule, tracker, toastWarning, activeView, activeAssignmentId]);

  useEffect(() => {
    if (user?.role !== 'student' || !user.classPeriod) return;
    const date = new Date(now);
    const fallbackDateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const closes = [];
    assignments.forEach((assignment) => {
      if (!assignmentIsForStudent(assignment, { classId: user.classId || null, classPeriod: user.classPeriod })) return;
      const dolState = getDOLState({ assignment, schedule: classSchedule, classId: user.classId || null, classPeriod: user.classPeriod, nowValue: now });
      const previousStatus = lastDOLStatusRef.current[assignment.id];
      lastDOLStatusRef.current[assignment.id] = dolState.status;
      if (dolState.status !== 'ended') return;
      const dateKey = dolState.instructionDateKey || fallbackDateKey;
      if (dolGradesByAssignment?.[assignment.id]?.[dateKey]?.finalized) return;
      if (previousStatus && !['active', 'waiting', 'beforeClass'].includes(previousStatus)) return;
      // This student's own DOL items (a reduced-item-count accommodation may
      // omit one; the server finalizer filters the same way).
      const studentDolOmitted = new Set(studentRequiredFor(assignment, { assignmentTracker: tracker?.[assignment.id] || null }).omitted);
      const allDolIndices = dolState.questionIndices || [dolState.questionIndex];
      const ownDolIndices = allDolIndices.filter((index) => !studentDolOmitted.has(index));
      // Never a DOL with no items (the plan keeps one; the server never empties
      // a list either): scoring the whole DOL beats finalizing a 0 over nothing.
      const questionIndices = ownDolIndices.length ? ownDolIndices : allDolIndices;
      closes.push({
        assignmentId: assignment.id,
        dateKey,
        record: {
          finalized: true,
          score: calculateDOLSectionScore(
            gradeDisplayTracker?.[assignment.id] || {},
            questionIndices,
            assignment,
          ),
          questionIndex: questionIndices[0] ?? dolState.questionIndex,
          questionIndices,
          recordedAt: new Date().toISOString(),
          status: 'section-finalized',
        },
      });
    });
    if (!closes.length) return;

    // CLIENT DOL CLOSE IS IMMEDIATE FEEDBACK, NOT AUTHORITY.
    //
    // The DOL projection is server-owned: ingestion records it as each answer
    // lands, and the checkpoint finalizer finalizes it for a response still
    // pending at the cutoff, with no browser mounted. This browser used to
    // write its own close — a score computed from its local tracker — onto
    // the grade document. It now only closes the DOL on this screen; a
    // projection the server has already finalized is never replaced, even
    // locally. (No grade reads the projection: every DOL score is computed
    // from the canonical question records.)
    closes.forEach(({ assignmentId, dateKey, record }) => {
      setDolGradesByAssignment((current) => {
        if (current?.[assignmentId]?.[dateKey]?.finalized === true) return current;
        return {
          ...current,
          [assignmentId]: {
            ...(current?.[assignmentId] || {}),
            [dateKey]: record,
          },
        };
      });
    });
  }, [now, user, assignments, classSchedule, gradeDisplayTracker, dolGradesByAssignment]);
}
