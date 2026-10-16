import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../../firebase.js';
import {
  acknowledgementFor,
  askTeacherMode,
  studentClassInSession,
} from './askTeacher.js';
import {
  myTeacherQuestionsQuery,
  sendTeacherQuestion,
  watchHelpAcknowledgement,
  watchQuestions,
} from './askTeacherStore.js';
import { readStoredHelpRequest, restoreHelpRequest, storeHelpRequest } from './helpRequest.js';

const sessionStore = () => {
  try { return typeof window !== 'undefined' ? window.sessionStorage : null; } catch { return null; }
};

/*
 * THE STUDENT'S "ASK MY TEACHER", FOR THE ASSIGNMENT WORKSPACE (App.jsx).
 *
 *   helpRequest / setHelpRequest  the raised hand. Survives a reload of this
 *                                 tab (helpRequest.js); leaving the
 *                                 assignment lowers it. Published only while
 *                                 the student's class is meeting.
 *   inClass, mode                 'hand' in class, 'question' outside it
 *                                 (askTeacher.js studentClassInSession).
 *   acknowledgement               the teacher's 'seen' / 'onMyWay' for THIS hand.
 *   questions, sendQuestion       the student's questions on this assignment.
 *
 * `studentId` is null for anyone who is not a signed-in student (a teacher
 * preview): then nothing is read, stored or written.
 */
export function useAskMyTeacher({
  studentId = null,
  classId = null,
  classPeriod = null,
  teacherEmail = null,
  schedule = null,
  nowValue = Date.now(),
  assignmentId = null,
} = {}) {
  // The hand, with the student and assignment it was read for. Entering an
  // assignment brings back this tab's hand for it (a reload) during render,
  // so no effect — re-run by React at will — can see the moment before.
  const [hand, setHand] = useState({ studentId: null, assignmentId: null, request: null });
  if (hand.studentId !== studentId || hand.assignmentId !== assignmentId) {
    setHand({
      studentId,
      assignmentId,
      request: studentId && assignmentId
        ? restoreHelpRequest(readStoredHelpRequest(sessionStore(), studentId), { assignmentId, now: Date.now() })
        : null,
    });
  }
  const request = hand.studentId === studentId && hand.assignmentId === assignmentId ? hand.request : null;
  const setRequest = useCallback((next) => setHand((current) => ({
    ...current,
    request: typeof next === 'function' ? next(current.request) : next,
  })), []);
  const [acknowledgement, setAcknowledgement] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [questionsUnavailable, setQuestionsUnavailable] = useState(false);
  const enteredAssignment = useRef(null);

  // The bell decides once a minute, not on every second's tick.
  const minute = Math.floor(Number(nowValue) / 60000);
  const inClass = useMemo(
    () => Boolean(studentId) && studentClassInSession({ schedule, classPeriod, nowValue: minute * 60000 }),
    [studentId, schedule, classPeriod, minute],
  );

  // Leaving an assignment lowers its hand for good (this tab forgets it).
  // Idempotent: run again, it finds nothing left to forget.
  useEffect(() => {
    const left = enteredAssignment.current;
    enteredAssignment.current = assignmentId;
    const storage = sessionStore();
    if (left && left !== assignmentId && readStoredHelpRequest(storage, studentId)?.assignmentId === left) {
      storeHelpRequest(storage, studentId, null);
    }
  }, [studentId, assignmentId]);

  // This tab remembers the hand on screen — a mirror of state, so running it
  // twice writes the same thing. Home (no assignment) leaves it alone.
  useEffect(() => {
    if (!studentId || !assignmentId || hand.studentId !== studentId || hand.assignmentId !== assignmentId) return;
    storeHelpRequest(sessionStore(), studentId, hand.request);
  }, [studentId, assignmentId, hand]);

  // Outside class a hand is never published: nobody is in the room to see it.
  const helpRequest = inClass ? request : null;
  const handRaised = Boolean(helpRequest);

  // The teacher's answer to the hand is read only while a hand is up.
  useEffect(() => {
    setAcknowledgement(null);
    if (!studentId || !handRaised) return undefined;
    return watchHelpAcknowledgement(db, studentId, setAcknowledgement, () => setAcknowledgement(null));
  }, [studentId, handRaised]);

  useEffect(() => {
    setQuestions([]);
    setQuestionsUnavailable(false);
    if (!studentId || !assignmentId) return undefined;
    return watchQuestions(
      myTeacherQuestionsQuery(db, { studentId, assignmentId }),
      setQuestions,
      () => setQuestionsUnavailable(true),
    );
  }, [studentId, assignmentId]);

  const sendQuestion = useCallback(({ existing = null, questionIndex, questionLabel = '', assignmentTitle = '', text }) => (
    sendTeacherQuestion(db, {
      existing, studentId, classId, teacherEmail, assignmentId, assignmentTitle, questionIndex, questionLabel, text,
    })
  ), [studentId, classId, teacherEmail, assignmentId]);

  return {
    helpRequest,
    setHelpRequest: setRequest,
    inClass,
    mode: askTeacherMode(inClass),
    acknowledgement: acknowledgementFor(helpRequest, acknowledgement),
    questions,
    questionsUnavailable,
    canLeaveQuestion: Boolean(studentId && teacherEmail),
    sendQuestion,
  };
}

export default useAskMyTeacher;
