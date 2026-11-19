/*
 * SPOTLIGHT: A TEACHER'S REQUEST TO SHOW A STUDENT'S WORK, THE STUDENT'S ANSWER, AND THE FRAMES SENT WHILE IT IS ON.
 *
 * Moved verbatim from App.jsx, which calls this where the code was and passes
 * what it reads by name. Its effects keep their place among App's effects
 * (scripts/app-hook-ledger.mjs).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { deleteDoc, doc, onSnapshot, setDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import {
  SPOTLIGHT_FRAME_COLLECTION, SPOTLIGHT_REQUEST_COLLECTION, SPOTLIGHT_STATUS, buildSpotlightFrame,
  createSpotlightPublisher, isActiveSpotlightRequest, publicStudentLabel, scheduleSpotlightExpiry,
} from '../../platform/liveSpotlight.js';
import { activeStudentSpotlightQuery } from '../../platform/liveSpotlightQueries.js';

export function useStudentSpotlight({ user, activeView, activeAssignmentId, currentQuestionIndex, studentRecord, activeAssignmentData }) {
  const spotlightPublisherRef = useRef(null);
  const [studentSpotlightRequest, setStudentSpotlightRequest] = useState(null);
  const [studentSpotlightMessage, setStudentSpotlightMessage] = useState('');

  // Spotlight consent is its own short-lived channel. Merely opening an
  // assignment or publishing presence never creates a frame.
  useEffect(() => {
    if (user?.role !== 'student' || !user.id) {
      setStudentSpotlightRequest(null);
      return undefined;
    }
    return onSnapshot(
      activeStudentSpotlightQuery(db, { studentId: user.id }),
      (snapshot) => {
        const current = snapshot.docs
          .map((entry) => ({ id: entry.id, ...entry.data() }))
          .filter((entry) => [SPOTLIGHT_STATUS.REQUESTED, SPOTLIGHT_STATUS.ACCEPTED].includes(entry.status))
          .filter((entry) => (entry.expiresAt?.toMillis?.() || 0) > Date.now())
          .sort((left, right) => (right.requestedAt?.toMillis?.() || 0) - (left.requestedAt?.toMillis?.() || 0))[0] || null;
        setStudentSpotlightRequest(current);
      },
      () => setStudentSpotlightMessage('Presentation connection unavailable. Your MathMaster work is still safe and usable.'),
    );
  }, [user?.role, user?.id]);

  useEffect(() => {
    spotlightPublisherRef.current?.stop();
    spotlightPublisherRef.current = null;
    if (!studentSpotlightRequest || !isActiveSpotlightRequest(studentSpotlightRequest)) return undefined;
    const frameRef = doc(db, SPOTLIGHT_FRAME_COLLECTION, studentSpotlightRequest.id);
    spotlightPublisherRef.current = createSpotlightPublisher({
      publish: (frame) => setDoc(frameRef, {
        ...frame,
        requestId: studentSpotlightRequest.id,
        studentId: user.id,
        expiresAt: studentSpotlightRequest.expiresAt,
        updatedAt: serverTimestamp(),
      }).catch(() => setStudentSpotlightMessage('Presentation connection interrupted. Keep working normally while MathMaster reconnects.')),
    });
    return () => {
      spotlightPublisherRef.current?.stop();
      spotlightPublisherRef.current = null;
    };
  }, [studentSpotlightRequest?.id, studentSpotlightRequest?.status, user?.id]);

  const respondToSpotlight = useCallback(async (accepted) => {
    if (!studentSpotlightRequest || studentSpotlightRequest.status !== SPOTLIGHT_STATUS.REQUESTED) return;
    try {
      await updateDoc(doc(db, SPOTLIGHT_REQUEST_COLLECTION, studentSpotlightRequest.id), {
        status: accepted ? SPOTLIGHT_STATUS.ACCEPTED : SPOTLIGHT_STATUS.DECLINED,
        respondedAt: serverTimestamp(),
      });
      setStudentSpotlightMessage(accepted ? '' : 'You chose Not Now. No work was shared.');
    } catch {
      setStudentSpotlightMessage('Could not send your choice. Nothing will be shared unless Present Now succeeds.');
    }
  }, [studentSpotlightRequest]);

  const stopStudentSpotlight = useCallback(async () => {
    const request = studentSpotlightRequest;
    spotlightPublisherRef.current?.stop();
    spotlightPublisherRef.current = null;
    if (!request) return;
    await deleteDoc(doc(db, SPOTLIGHT_FRAME_COLLECTION, request.id)).catch(() => {});
    if (request.status === SPOTLIGHT_STATUS.ACCEPTED) {
      await updateDoc(doc(db, SPOTLIGHT_REQUEST_COLLECTION, request.id), {
        status: SPOTLIGHT_STATUS.STOPPED,
        stoppedAt: serverTimestamp(),
        stoppedBy: 'student',
      }).catch(() => setStudentSpotlightMessage('The projector connection could not be confirmed stopped. It will expire automatically.'));
    }
  }, [studentSpotlightRequest]);

  const publishSpotlightWork = useCallback(({ question, answerState }) => {
    if (!spotlightPublisherRef.current || !studentSpotlightRequest || !isActiveSpotlightRequest(studentSpotlightRequest)) return;
    spotlightPublisherRef.current.schedule(buildSpotlightFrame({
      assignmentId: activeAssignmentId,
      assignmentTitle: activeAssignmentData?.title,
      questionIndex: currentQuestionIndex,
      question,
      answerState,
      studentLabel: publicStudentLabel({ ...studentRecord, ...user }),
    }));
  }, [studentSpotlightRequest, activeAssignmentId, activeAssignmentData?.title, currentQuestionIndex, studentRecord, user]);

  useEffect(() => {
    if (!studentSpotlightRequest) return undefined;
    return scheduleSpotlightExpiry({
      request: studentSpotlightRequest,
      onExpire: () => {
        setStudentSpotlightRequest(null);
        if (studentSpotlightRequest.status === SPOTLIGHT_STATUS.ACCEPTED) stopStudentSpotlight();
      },
      setTimer: window.setTimeout,
      clearTimer: window.clearTimeout,
    });
  }, [studentSpotlightRequest?.id, studentSpotlightRequest?.status, studentSpotlightRequest?.expiresAt, stopStudentSpotlight]);

  useEffect(() => {
    if (studentSpotlightRequest?.status !== SPOTLIGHT_STATUS.ACCEPTED) return;
    if (activeView === 'assignment' && activeAssignmentId === studentSpotlightRequest.assignmentId) return;
    stopStudentSpotlight();
  }, [studentSpotlightRequest?.status, studentSpotlightRequest?.assignmentId, activeView, activeAssignmentId, stopStudentSpotlight]);
  return { studentSpotlightRequest, studentSpotlightMessage, respondToSpotlight, stopStudentSpotlight, publishSpotlightWork };
}
