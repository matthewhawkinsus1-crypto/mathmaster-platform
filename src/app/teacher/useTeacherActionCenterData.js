/*
 * WHAT THE ACTION CENTER READS, LIVE: SUPPORT EVENTS, PARENT CONTACTS, GRADES AND PRACTICE PASSES FOR ITS CLASSES, RETEST RECOVERY, THE DISCIPLINE TRACKER'S ROWS, SESSION SUMMARIES, AND THE ITEMS AND OPEN COUNT THEY ADD UP TO.
 *
 * The Action Center's own model (platform/teacher/teacherActionCenter.js) and its Discipline Tracker rows (platform/teacher/disciplineActionItems.js) load when the Action Center is opened, not with a teacher's first load (scripts/check-first-load-budget.mjs).
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
  setStudentSessionSummaries, now, classSchedule, actionCenterModel, setActionCenterModel,
  actionDisciplineItems, setActionDisciplineItems,
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

  const actionGradeScope = useMemo(() => {
    if (!teacherKit || teacherWorkspaceMode !== 'teacher' || teacherTab !== 'actionCenter') {
      return { units: [], authorizedClassIds: [] };
    }
    return teacherKit.projectGradeTransferUnits({
      classes, assignments, students: allStudents, teacherEmail: user?.email || '', isRootAdmin: user?.isRootAdmin === true,
      snapshots: actionGradeSnapshots, practicePasses: actionPracticePasses,
    });
  }, [teacherKit, teacherWorkspaceMode, teacherTab, classes, assignments, allStudents, user?.email, user?.isRootAdmin, actionGradeSnapshots, actionPracticePasses]);

  const actionReturnCheckIns = useMemo(() => {
    if (!teacherKit || teacherWorkspaceMode !== 'teacher' || teacherTab !== 'actionCenter') return [];
    return classes.flatMap((classRecord) => teacherKit.resolveReturnCheckIns({
      roster: allStudents.filter((student) => student.classId === (classRecord.classId || classRecord.id)),
      supportEvents: studentSupportEvents, assignments, classId: classRecord.classId || classRecord.id,
      classPeriod: classRecord.period || classRecord.classPeriod, schedule: classSchedule,
      nonInstructionalKeys: SCHOOL_NON_INSTRUCTIONAL_KEYS, todayDateKey: localDateKeyOf(now),
    }));
  }, [teacherKit, teacherWorkspaceMode, teacherTab, classes, allStudents, studentSupportEvents, assignments, classSchedule, now]);

  // The model, the first time the Action Center opens.
  useEffect(() => {
    if (actionCenterModel || teacherWorkspaceMode !== 'teacher' || teacherTab !== 'actionCenter') return undefined;
    let cancelled = false;
    import('../../platform/teacher/teacherActionCenter.js')
      .then((model) => { if (!cancelled) setActionCenterModel(model); })
      .catch((error) => console.error('Action Center failed to load:', error));
    return () => { cancelled = true; };
  }, [actionCenterModel, teacherWorkspaceMode, teacherTab]);

  // The Discipline Tracker's rows, read each time the Action Center opens:
  // sends and family messages that need the teacher, and the week's
  // principal report.
  useEffect(() => {
    if (user?.role !== 'teacher' || teacherWorkspaceMode !== 'teacher' || teacherTab !== 'actionCenter' || teacherPreviewRuntimeActive) {
      setActionDisciplineItems([]);
      return undefined;
    }
    let cancelled = false;
    import('../../platform/teacher/disciplineActionItems.js')
      .then(({ loadDisciplineActionItems }) => loadDisciplineActionItems({ nowMs: Date.now() }))
      .then((items) => { if (!cancelled) setActionDisciplineItems(items); })
      .catch((error) => console.error('Action Center discipline rows failed:', error));
    return () => { cancelled = true; };
  }, [user?.role, teacherWorkspaceMode, teacherPreviewRuntimeActive, teacherTab]);

  const teacherActionItems = useMemo(() => {
    if (!actionCenterModel || teacherWorkspaceMode !== 'teacher' || teacherTab !== 'actionCenter') return [];
    return actionCenterModel.buildTeacherActionItems({
      students: allStudents, classes, supportEvents: studentSupportEvents, parentContacts,
      returnCheckIns: actionReturnCheckIns, gradeTransferUnits: actionGradeScope.units,
      retestRecoveryActions, extraItems: actionDisciplineItems, now, todayDateKey: localDateKeyOf(now),
    });
  }, [actionCenterModel, teacherWorkspaceMode, teacherTab, allStudents, classes, studentSupportEvents, parentContacts, actionReturnCheckIns, actionGradeScope.units, retestRecoveryActions, actionDisciplineItems, now]);
  const currentTeacherActionOpenCount = actionCenterModel ? actionCenterModel.openTeacherActionCount(teacherActionItems) : 0;
  const teacherActionOpenCount = teacherTab === 'actionCenter'
    ? currentTeacherActionOpenCount
    : teacherActionOpenCountCache;

  useEffect(() => {
    if (teacherWorkspaceMode !== 'teacher' || teacherTab !== 'actionCenter') return;
    setTeacherActionOpenCountCache(currentTeacherActionOpenCount);
  }, [teacherWorkspaceMode, teacherTab, currentTeacherActionOpenCount]);

  useEffect(() => {
    const classIds = actionGradeScope.authorizedClassIds;
    if (user?.role !== 'teacher') { setActionGradeSnapshots([]); setActionPracticePasses(new Set()); return; }
    if (teacherWorkspaceMode !== 'teacher' || teacherTab !== 'actionCenter') {
      setActionGradeSnapshots([]);
      setActionPracticePasses(new Set());
      return;
    }
    if (teacherPreviewRuntimeActive) return;
    if (!classIds.length) { setActionGradeSnapshots([]); setActionPracticePasses(new Set()); return; }
    loadTeacherGradeTransferState({ classIds })
      .then(({ snapshots, practicePasses }) => {
        setActionGradeSnapshots(snapshots);
        setActionPracticePasses(practicePasses);
      })
      .catch((error) => console.error('Action Center grade-transfer projection failed:', error));
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
