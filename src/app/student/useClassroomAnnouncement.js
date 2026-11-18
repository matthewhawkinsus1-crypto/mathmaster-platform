/*
 * A LIVE CHALLENGE INVITE OR A SPOTLIGHT REQUEST, SAID ONCE IN THE STUDENT SHELL'S LIVE REGION.
 *
 * Moved verbatim from App.jsx, which calls this where the code was and passes
 * what it reads by name. Its effects keep their place among App's effects
 * (scripts/app-hook-ledger.mjs).
 */
import { useEffect, useRef, useState } from 'react';
import { SPOTLIGHT_STATUS } from '../../platform/liveSpotlight.js';
import { classroomAnnouncement, classroomAnnouncementState } from '../../platform/student/classroomAnnouncements.js';

export function useClassroomAnnouncement({ user, secureExamActive, liveChallengeInvite, studentSpotlightRequest, lobbyInviteHeldHere }) {
  const [classroomAnnouncementText, setClassroomAnnouncementText] = useState('');
  const classroomAnnouncementRef = useRef(null);
  const currentClassroomState = classroomAnnouncementState({
    invite: user?.role === 'student' && !lobbyInviteHeldHere ? liveChallengeInvite : null,
    spotlightRequested: user?.role === 'student' && studentSpotlightRequest?.status === SPOTLIGHT_STATUS.REQUESTED,
    secureExamActive,
  });
  const classroomAnnouncementTimerRef = useRef(null);
  useEffect(() => {
    const next = { challenge: currentClassroomState.challenge, spotlight: currentClassroomState.spotlight };
    const text = classroomAnnouncement(classroomAnnouncementRef.current, next);
    classroomAnnouncementRef.current = next;
    if (!text) return;
    setClassroomAnnouncementText(text);
    clearTimeout(classroomAnnouncementTimerRef.current);
    classroomAnnouncementTimerRef.current = setTimeout(() => setClassroomAnnouncementText(''), 8000);
  }, [currentClassroomState.challenge, currentClassroomState.spotlight]);
  useEffect(() => () => clearTimeout(classroomAnnouncementTimerRef.current), []);
  return { classroomAnnouncementText };
}
