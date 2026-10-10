/*
 * The Google Classroom assignment a launch link names, for the sign-in
 * screen's "You are opening …" line (LoginScreen's launchAssignment). Display
 * only: App parses the same link again once signed in and opens it through
 * its own gates (classroomLaunchRoute.js). Only the assignment id is read
 * here, from `?launch=`: classroomLaunchRoute.js brings the assignment
 * lifecycle and the grading policies with it, which the sign-in screen must
 * not download (scripts/check-first-load-budget.mjs).
 */
import { useEffect, useState } from 'react';
import { getAssignmentByLaunchId } from '../../classroomApi.js';

export const useClassroomLaunchPreview = (active) => {
  const [launchAssignment, setLaunchAssignment] = useState(null);
  useEffect(() => {
    if (!active || typeof window === 'undefined') return undefined;
    const assignmentId = String(new URLSearchParams(window.location.search).get('launch') || '').trim();
    if (!assignmentId) return undefined;
    let cancelled = false;
    getAssignmentByLaunchId({ assignmentId })
      .then((assignment) => { if (!cancelled) setLaunchAssignment(assignment); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [active]);
  return launchAssignment;
};
