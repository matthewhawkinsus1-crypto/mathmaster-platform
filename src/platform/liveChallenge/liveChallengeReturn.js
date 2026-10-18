/*
 * WHERE A STUDENT GOES BACK TO AFTER A LIVE CHALLENGE (student pass 3, NAV-25).
 *
 * A student who joined from inside an assignment ended the game with "Back to
 * Dashboard" and landed on Home, with the assignment they left nowhere on
 * screen. The place they joined from is kept when they join, and the game's
 * exit returns there and says so: "Back to your assignment" reopens the
 * question they were on (if its section is still open; otherwise where they
 * can work now, as any address does), "Back to Grades" goes to Grades.
 *
 * Pure: no React.
 */

import { outcomeWithheld } from '../student/assignmentNavigator.js';
import { BACK_TO_HOME } from '../student/studentWords.js';

const SCREEN_LABEL = Object.freeze({
  assignmentsCenter: 'Back to Assignments',
  grades: 'Back to Grades',
  rewards: 'Back to My Rewards',
  mathPath: 'Back to My Math Path',
});

/**
 * The place the student is on as they join.
 * @returns {{kind:'assignment', assignmentId:string, questionIndex:number}
 *   | {kind:'result', assignmentId:string, sectionKey:string, origin:string|null}
 *   | {kind:'screen', mode:string}}
 */
export const liveChallengeReturnPlace = ({
  activeView = 'dashboard',
  activeAssignmentId = null,
  currentQuestionIndex = 0,
  studentDashboardMode = 'assignments',
  assignmentResultRoute = null,
} = {}) => {
  if (activeView === 'assignment' && activeAssignmentId) {
    return { kind: 'assignment', assignmentId: activeAssignmentId, questionIndex: Number(currentQuestionIndex) || 0 };
  }
  if (activeView === 'assignmentResult' && assignmentResultRoute?.assignmentId) {
    return {
      kind: 'result',
      assignmentId: assignmentResultRoute.assignmentId,
      sectionKey: assignmentResultRoute.sectionKey || 'whole',
      origin: assignmentResultRoute.origin || null,
    };
  }
  const mode = SCREEN_LABEL[studentDashboardMode] ? studentDashboardMode : 'assignments';
  return { kind: 'screen', mode };
};

// The game's exit button, named for where it goes.
export const liveChallengeExitLabel = (place) => {
  if (place?.kind === 'assignment') return 'Back to your assignment';
  if (place?.kind === 'result') return 'Back to your results';
  return SCREEN_LABEL[place?.mode] || BACK_TO_HOME;
};

/*
 * NOT WHILE AN EXIT TICKET, QUIZ OR TEST IS STILL UNDER WAY (NAV-25 review B1,
 * R1). The lobby invite inside an assignment is held while ANY question of the
 * section the student is on withholds its outcome — the navigator's own rule
 * (outcomeWithheld) — not only the question on screen: on a DOL that rule lifts
 * for a question once it is submitted, while the rest of the DOL and its clock
 * run on. A section that is released, or fully submitted, has nothing left to
 * protect, and Classwork and Practice never hold it.
 *
 * `entries` are the assignment's current-content entries ({ storageIndex,
 * logicalRole }); `recordOf(storageIndex)` reads the student's record.
 */
export const sectionHoldsLobbyInvite = ({
  entries = [],
  role = null,
  feedbackMode = 'immediate',
  released = false,
  recordOf = () => null,
} = {}) => {
  if (!role) return false;
  return entries
    .filter((entry) => entry?.logicalRole === role)
    .some((entry) => outcomeWithheld({ feedbackMode, released, record: recordOf(entry.storageIndex) }));
};

export default liveChallengeReturnPlace;
