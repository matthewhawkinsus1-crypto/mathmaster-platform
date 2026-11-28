/*
 * WHAT THE ACTION CENTER READS, LIVE: SUPPORT EVENTS, PARENT CONTACTS, GRADES AND PRACTICE PASSES FOR ITS CLASSES, RETEST RECOVERY, SESSION SUMMARIES, AND THE ITEMS AND OPEN COUNT THEY ADD UP TO.
 *
 * Moved verbatim from App.jsx, which calls this where the code was and passes what it reads by position (tests/platform/appSplitTeacherLiveData.test.mjs holds the two sides to the same names in the same order). App owns the state these fill. Its hooks keep their place among App's hooks (scripts/app-hook-ledger.mjs).
 */
import { useEffect, useMemo } from 'react';
import { db } from '../../firebase';
import { TEACHER_PARENT_CONTACT_STREAM_TABS, TEACHER_SESSION_SUMMARY_TABS, TEACHER_SUPPORT_STREAM_TABS } from '../screenScopes.js';
import { isTestCycleAssignment } from '../../platform/assessment/testCycle.js';
import { localDateKeyOf } from '../../platform/attendance/classMeetings.js';
import { SCHOOL_NON_INSTRUCTIONAL_KEYS } from '../shell/schoolCalendarKeys.js';
import { loadTeacherGradeTransferState } from '../../platform/gradeTransfer/gradeTransferStore.js';

export function useTeacherActionCenterData(
  auth, user, teacherPreviewRuntimeActive, teacherTab, teacherWorkspaceMode, classes, assignments, allStudents,
  setStudentSupportEvents, studentSupportEvents, parentContacts, setParentContacts, actionGradeSnapshots,
  setActionGradeSnapshots, actionPracticePasses, setActionPracticePasses, setTeacherActionOpenCountCache,
  teacherActionOpenCountCache, teacherKit, retestRecoveryActions, setRetestRecoveryActions,
  setStudentSessionSummaries, now, classSchedule, teacherStudentDataMode,
) {
  // Persistent support/intervention history is teacher-authorized and
  // append-only. It is loaded independently of the live presence stream.
  useEffect(() => {
    if (user?.role !== 'teacher' || !user.email) {
      setStudentSupportEvents([]);
      return undefined;
    }
    if (teacherWorkspaceMode !== 'teacher' || !TEACHER_SUPPORT_STREAM_TABS.has(teacherTab)) {
      setStudentSupportEvents([]);
      return undefined;
    }
    // The support store loads with the teacher kit; this runs again once it has.
    if (teacherPreviewRuntimeActive || !teacherKit) return undefined;
    return teacherKit.subscribeStudentSupportEvents({
      db,
      teacherEmail: user.email,
      onChange: setStudentSupportEvents,
      onError: (error) => console.error('Student support history failed:', error),
    });
  }, [user?.role, user?.email, teacherWorkspaceMode, teacherPreviewRuntimeActive, teacherTab, teacherKit]);

  // One teacher-scoped stream spans the whole roster. Firestore rules verify
  // teacher-of-record again for every appended contact; students have no access.
  // The store is loaded on demand: imported here, it rode in every student's
  // first load (scripts/check-first-load-budget.mjs). A teacher who leaves the
  // tab before it arrives never subscribes.
  useEffect(() => {
    if (user?.role !== 'teacher' || !user.email) { setParentContacts([]); return undefined; }
    if (teacherWorkspaceMode !== 'teacher' || !TEACHER_PARENT_CONTACT_STREAM_TABS.has(teacherTab)) {
      setParentContacts([]);
      return undefined;
    }
    if (teacherPreviewRuntimeActive) return undefined;
    let stopped = false;
    let release = null;
    import('../../platform/teacher/parentContactStore.js')
      .then(({ subscribeParentContacts }) => {
        if (stopped) return;
        const unsubscribe = subscribeParentContacts({ db, teacherEmail: user.email, onChange: setParentContacts, onError: (error) => console.error('Parent contact history failed:', error) });
        release = () => unsubscribe();
      })
      .catch((error) => console.error('Parent contact history failed:', error));
    return () => { stopped = true; release?.(); };
  }, [user?.role, user?.email, teacherWorkspaceMode, teacherPreviewRuntimeActive, teacherTab]);

  // GRADE EXPORTS, PROJECTED ONCE. Projecting every class x assignment x
  // student is the Action Center's one heavy step. It waits until what decides
  // it is here: every student's full records (teacherStudentDataMode 'full',
  // not the roster summaries the tab opens with) and the export history and
  // Practice Passes (null until loaded). So opening the Action Center draws
  // its other rows at once, says grade exports are being checked, and never
  // projects them on summaries or before the history that decides them.
  const actionGradeScope = useMemo(() => {
    if (!teacherKit || teacherWorkspaceMode !== 'teacher' || teacherTab !== 'actionCenter') {
      return { units: [], authorizedClassIds: [] };
    }
    const teacher = { classes, teacherEmail: user?.email || '', isRootAdmin: user?.isRootAdmin === true };
    const historyAndRecordsReady = teacherStudentDataMode === 'full' && Array.isArray(actionGradeSnapshots) && actionPracticePasses instanceof Set;
    if (!historyAndRecordsReady) {
      // Only which classes' export history to load: no assignment or student is read.
      return { ...teacherKit.projectGradeTransferUnits(teacher), units: [], loading: true };
    }
    return teacherKit.projectGradeTransferUnits({
      ...teacher, assignments, students: allStudents,
      snapshots: actionGradeSnapshots, practicePasses: actionPracticePasses,
    });
  }, [teacherKit, teacherWorkspaceMode, teacherTab, classes, assignments, allStudents, user?.email, user?.isRootAdmin, actionGradeSnapshots, actionPracticePasses, teacherStudentDataMode]);

  const actionReturnCheckIns = useMemo(() => {
    if (!teacherKit || teacherWorkspaceMode !== 'teacher' || teacherTab !== 'actionCenter') return [];
    return classes.flatMap((classRecord) => teacherKit.resolveReturnCheckIns({
      roster: allStudents.filter((student) => student.classId === (classRecord.classId || classRecord.id)),
      supportEvents: studentSupportEvents, assignments, classId: classRecord.classId || classRecord.id,
      classPeriod: classRecord.period || classRecord.classPeriod, schedule: classSchedule,
      nonInstructionalKeys: SCHOOL_NON_INSTRUCTIONAL_KEYS, todayDateKey: localDateKeyOf(now),
    }));
  }, [teacherKit, teacherWorkspaceMode, teacherTab, classes, allStudents, studentSupportEvents, assignments, classSchedule, now]);

  const teacherActionItems = useMemo(() => {
    if (!teacherKit || teacherWorkspaceMode !== 'teacher' || teacherTab !== 'actionCenter') return [];
    return teacherKit.buildTeacherActionItems({
      students: allStudents, classes, supportEvents: studentSupportEvents, parentContacts,
      returnCheckIns: actionReturnCheckIns, gradeTransferUnits: actionGradeScope.units,
      retestRecoveryActions, now, todayDateKey: localDateKeyOf(now),
    });
  }, [teacherKit, teacherWorkspaceMode, teacherTab, allStudents, classes, studentSupportEvents, parentContacts, actionReturnCheckIns, actionGradeScope.units, retestRecoveryActions, now]);
  const currentTeacherActionOpenCount = teacherKit ? teacherKit.openTeacherActionCount(teacherActionItems) : 0;
  // While grade exports are still being checked the count is short of them,
  // so the badge keeps the last full count until they are in.
  const gradeExportsLoading = actionGradeScope.loading === true;
  const teacherActionOpenCount = teacherTab === 'actionCenter' && !gradeExportsLoading
    ? currentTeacherActionOpenCount
    : teacherActionOpenCountCache;

  useEffect(() => {
    if (teacherWorkspaceMode !== 'teacher' || teacherTab !== 'actionCenter' || gradeExportsLoading) return;
    setTeacherActionOpenCountCache(currentTeacherActionOpenCount);
  }, [teacherWorkspaceMode, teacherTab, currentTeacherActionOpenCount, gradeExportsLoading]);

  // The export history and Practice Passes: null until loaded (the
  // projection above waits for them). If they cannot load, grade exports are
  // projected without them, as before.
  useEffect(() => {
    const classIds = actionGradeScope.authorizedClassIds;
    if (user?.role !== 'teacher') { setActionGradeSnapshots(null); setActionPracticePasses(null); return undefined; }
    if (teacherWorkspaceMode !== 'teacher' || teacherTab !== 'actionCenter') {
      setActionGradeSnapshots(null);
      setActionPracticePasses(null);
      return undefined;
    }
    if (teacherPreviewRuntimeActive) return undefined;
    if (!classIds.length) { setActionGradeSnapshots([]); setActionPracticePasses(new Set()); return undefined; }
    let current = true;
    loadTeacherGradeTransferState({ classIds })
      .then(({ snapshots, practicePasses }) => {
        if (!current) return;
        setActionGradeSnapshots(snapshots);
        setActionPracticePasses(practicePasses);
      })
      .catch((error) => {
        console.error('Action Center grade-transfer projection failed:', error);
        if (!current) return;
        setActionGradeSnapshots([]);
        setActionPracticePasses(new Set());
      });
    return () => { current = false; };
  }, [user?.role, user?.uid, user?.isRootAdmin, auth.session?.uid, actionGradeScope.authorizedClassIds.join('|'), teacherWorkspaceMode, teacherPreviewRuntimeActive, teacherTab]);

  useEffect(() => {
    if (user?.role !== 'teacher') { setRetestRecoveryActions([]); return; }
    if (teacherWorkspaceMode !== 'teacher' || teacherTab !== 'actionCenter') {
      setRetestRecoveryActions([]);
      return undefined;
    }
    // The Test Cycle records come through the teacher kit; this runs again
    // once it has loaded.
    if (teacherPreviewRuntimeActive || !teacherKit) return undefined;
    let cancelled = false;
    Promise.all(assignments.filter(isTestCycleAssignment).map(async (assignment) => {
      const response = await teacherKit.listTeacherTestCycleRecords({ assignmentId: assignment.id });
      return teacherKit.projectTestCycleTeacherActions({ records: response.rows || [], assignment });
    })).then((groups) => { if (!cancelled) setRetestRecoveryActions(groups.flat()); })
      .catch((error) => console.error('Action Center Test Cycle projection failed:', error));
    return () => { cancelled = true; };
  }, [user?.role, assignments, teacherWorkspaceMode, teacherPreviewRuntimeActive, teacherTab, teacherKit]);

  useEffect(() => {
    if (user?.role !== 'teacher' || !user.email) {
      setStudentSessionSummaries([]);
      return undefined;
    }
    if (teacherWorkspaceMode !== 'teacher' || !TEACHER_SESSION_SUMMARY_TABS.has(teacherTab)) {
      setStudentSessionSummaries([]);
      return undefined;
    }
    if (teacherPreviewRuntimeActive || !teacherKit) return undefined;
    return teacherKit.subscribeStudentSessionSummaries({
      db,
      teacherEmail: user.email,
      classIds: classes
        .filter((entry) => entry?.status !== 'archived' && entry?.classId)
        .map((entry) => entry.classId),
      onChange: setStudentSessionSummaries,
      onError: (error) => console.error('Student session summaries failed:', error),
    });
  }, [user?.role, user?.email, classes, teacherWorkspaceMode, teacherPreviewRuntimeActive, teacherTab, teacherKit]);
  return [actionGradeScope, teacherActionItems, teacherActionOpenCount];
}
