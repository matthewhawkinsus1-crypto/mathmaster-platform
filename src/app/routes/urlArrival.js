/*
 * ARRIVING AT AN ADDRESS.
 *
 * A reload, a bookmark, a link pasted into chat, or a deep link opened while
 * signed out (the address waits in the bar through sign-in): once the account
 * has loaded, App asks this module what the address should open and then
 * opens it with the SAME function a click would call. Nothing here grants
 * access. A secure test, a closed assessment, a Retest, a Recovery or an
 * assignment outside this student's class is decided exactly where it is
 * decided for a click — startAssignment, the Test Cycle card, the secure-exam
 * dashboard, the server — so a typed URL can never reach further than the
 * button that would have produced it.
 *
 * What this module adds is the dead end: an address that names nothing, or
 * an assignment this account cannot see, lands on Home with a message,
 * never on a blank screen.
 */
import { parseAppPath, pathRoutesEnabled } from './appUrl.js';
import { storageIndexForAddress } from './questionAddress.js';

export const ARRIVAL_MESSAGES = Object.freeze({
  notFound: {
    title: 'That page is not in MathMaster',
    body: 'The link may be mistyped or out of date. You are on your Home screen.',
  },
  studentStale: {
    title: 'That assignment is not available',
    body: 'It may have been removed, or it is not assigned to you. You are on your Home screen.',
  },
  questionGone: {
    title: 'That question has moved',
    body: 'The assignment changed since the link was made, so it opened where you can work now.',
  },
  teacherOnly: {
    title: 'That page is for teachers',
    body: 'You are signed in as a student, so you are on your Home screen.',
  },
  pathSessionAgain: {
    title: 'Pick your practice again',
    body: 'Your My Math Path session did not carry over. Choose it again to keep practising.',
  },
  teacherStale: {
    title: 'That assignment is not available',
    body: 'It may have been deleted, or it is not one of your classes\' assignments.',
  },
  studentPage: {
    title: 'That link is a student page',
    body: 'You are signed in as a teacher. Open the assignment from Assignments to see it as a student.',
  },
  adminOnly: {
    title: 'Administration is not available to this account',
    body: 'You are on your teacher Home screen.',
  },
});

const hasLaunchParameter = (search = '') => new URLSearchParams(String(search || '').replace(/^\?/, '')).has('launch');

/**
 * The address this page was opened at, if it asks for anything but Home.
 *
 * Read once, when the app starts (before sign-in can change the address), and
 * held until an account has loaded. A Google Classroom launch link carries
 * its own arrival (classroomLaunchRoute.js) and takes precedence; a harness
 * page routes by history entries only (pathRoutesEnabled).
 */
export const readUrlArrival = ({ pathname = '/', search = '' } = {}) => {
  if (!pathRoutesEnabled(pathname)) return null;
  if (hasLaunchParameter(search)) return null;
  const parsed = parseAppPath(pathname);
  if (parsed.area === 'student' && parsed.route.surface === 'dashboard'
    && parsed.route.dashboardMode === 'assignments') {
    return null;
  }
  return { parsed };
};

const home = (message = null) => ({ action: 'home', message });

/**
 * What a student's arrival opens.
 *
 *   assignments          this student's assignments (their own scope)
 *   isTestCycle(a)       true for a Test Cycle assignment
 *   questionEntriesFor(a) the student's questions in workspace order
 *   historyRoute         the student route in this tab's history entry, if any
 *                        (a reload keeps it; a new tab has none)
 *   mathPathRoute        My Math Path's route in the same entry
 */
export const planStudentArrival = ({
  arrival,
  assignments = [],
  isTestCycle = () => false,
  questionEntriesFor = () => [],
  historyRoute = null,
  mathPathRoute = null,
} = {}) => {
  const parsed = arrival?.parsed;
  if (!parsed) return null;
  if (parsed.area === 'teacher') return home(ARRIVAL_MESSAGES.teacherOnly);
  if (parsed.area !== 'student') return home(ARRIVAL_MESSAGES.notFound);
  const { route, extras = {} } = parsed;
  const findAssignment = (id) => assignments.find((assignment) => String(assignment?.id) === id) || null;

  if (route.surface === 'assignment') {
    const assignment = findAssignment(route.assignmentId);
    if (!assignment) return home(ARRIVAL_MESSAGES.studentStale);
    if (!extras.question) return { action: 'assignment', assignmentId: assignment.id, storageIndex: null, exact: false };
    const storageIndex = storageIndexForAddress(questionEntriesFor(assignment), extras.question);
    if (storageIndex === null) {
      return { action: 'assignment', assignmentId: assignment.id, storageIndex: null, exact: false, message: ARRIVAL_MESSAGES.questionGone };
    }
    return { action: 'assignment', assignmentId: assignment.id, storageIndex, exact: true };
  }

  if (route.surface === 'assignmentResult') {
    const assignment = findAssignment(route.assignmentId);
    if (!assignment) return home(ARRIVAL_MESSAGES.studentStale);
    // A reload keeps where the student came from (the visible Back control
    // returns there); a fresh link has no origin and returns to Assignments.
    const sameEntry = historyRoute?.surface === 'assignmentResult' && historyRoute.assignmentId === assignment.id;
    return {
      action: 'result',
      assignmentId: assignment.id,
      sectionKey: route.sectionKey || 'whole',
      origin: sameEntry && historyRoute.origin === 'grades' ? 'grades' : 'assignments',
    };
  }

  const mode = route.dashboardMode;
  if (mode === 'testCycle') {
    if (!extras.testCycleAssignmentId) return { action: 'dashboard', mode: 'assignmentsCenter' };
    const assignment = findAssignment(extras.testCycleAssignmentId);
    if (!assignment || !isTestCycle(assignment)) return home(ARRIVAL_MESSAGES.studentStale);
    // The card asks the server which stage is open, as it does for a click.
    return { action: 'testCycle', assignmentId: assignment.id };
  }
  if (mode === 'mathPath') {
    const target = extras.mathPath || { tab: 'path', skill: null };
    if (target.tab !== 'session') return { action: 'mathPath', tab: target.tab, sessionConfig: null, launchTeks: null };
    // A reload of the same session restores it exactly as Forward would; a
    // fresh link starts that skill the way "Practice This Skill" does, through
    // My Math Path's own coverage checks.
    const sameSession = mathPathRoute?.tab === 'session'
      && mathPathRoute.sessionConfig
      && String(mathPathRoute.sessionConfig.targetAlignmentKey || '') === target.skill;
    if (sameSession) return { action: 'mathPath', tab: 'session', sessionConfig: mathPathRoute.sessionConfig, launchTeks: null };
    return { action: 'mathPath', tab: 'path', sessionConfig: null, launchTeks: target.skill };
  }
  return { action: 'dashboard', mode };
};

/**
 * What a teacher's arrival opens.
 *
 *   assignments     the teacher's assignments
 *   canAdminister   whether Administration is visible to this account
 *   historyEntry    the teacher route in this tab's history entry, if any
 */
export const planTeacherArrival = ({
  arrival,
  assignments = [],
  canAdminister = false,
  historyRoute = null,
} = {}) => {
  const parsed = arrival?.parsed;
  if (!parsed) return null;
  const findAssignment = (id) => assignments.find((assignment) => String(assignment?.id) === id) || null;

  if (parsed.area === 'student') {
    // A student's assignment link opens that assignment's monitor, when it is
    // one of this teacher's. Nothing else on the student side means anything
    // to a teacher, and a teacher is never shown a student's screen by URL.
    const assignmentId = parsed.route.assignmentId;
    if (assignmentId && findAssignment(assignmentId)) {
      return { action: 'workspace', tab: 'assignments', hubAssignmentId: assignmentId, hubClassId: null };
    }
    return { action: 'workspace', tab: 'home', hubAssignmentId: null, message: ARRIVAL_MESSAGES.studentPage };
  }
  if (parsed.area !== 'teacher') {
    return { action: 'workspace', tab: 'home', hubAssignmentId: null, message: ARRIVAL_MESSAGES.notFound };
  }
  const { route } = parsed;
  if (route.surface === 'administration') {
    if (!canAdminister) return { action: 'workspace', tab: 'home', hubAssignmentId: null, message: ARRIVAL_MESSAGES.adminOnly };
    return { action: 'administration', adminTab: route.adminTab };
  }
  if (route.surface === 'preview') {
    const assignment = findAssignment(route.assignmentId);
    if (!assignment) return { action: 'workspace', tab: 'assignments', hubAssignmentId: null, message: ARRIVAL_MESSAGES.teacherStale };
    return { action: 'preview', assignmentId: assignment.id };
  }
  const hubAssignmentId = route.panels?.hubAssignmentId || null;
  if (hubAssignmentId && !findAssignment(hubAssignmentId)) {
    return { action: 'workspace', tab: route.tab, hubAssignmentId: null, message: ARRIVAL_MESSAGES.teacherStale };
  }
  // The class the monitor was opened for is not in the address; a reload of
  // the same tab still has it in its history entry.
  const hubClassId = hubAssignmentId && historyRoute?.surface === 'workspace'
    && historyRoute.panels?.hubAssignmentId === hubAssignmentId
    ? historyRoute.panels.hubClassId || null
    : null;
  return { action: 'workspace', tab: route.tab, hubAssignmentId, hubClassId };
};
