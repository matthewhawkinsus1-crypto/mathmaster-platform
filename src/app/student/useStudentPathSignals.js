/*
 * MY MATH PATH'S LIVE INPUTS: THE SERVER'S MASTERY PROFILES AND A TEACHER'S INTERVENTION.
 *
 * Moved verbatim from App.jsx, which calls this where the code was and passes
 * what it reads by name. Its effects keep their place among App's effects
 * (scripts/app-hook-ledger.mjs).
 */
import { useEffect } from 'react';
import { subscribeStudentServerMasteryProfiles } from '../../platform/mastery/serverMasteryProfiles.js';
import { subscribeStudentPathIntervention } from '../../platform/path/pathStore.js';

export function useStudentPathSignals({ user, setStudentPathInterventionState, setStudentServerMasteryProfiles }) {
  useEffect(() => {
    if (user?.role !== 'student' || !user.id) {
      setStudentServerMasteryProfiles(null);
      return undefined;
    }
    return subscribeStudentServerMasteryProfiles({
      studentId: user.id,
      onChange: setStudentServerMasteryProfiles,
      onError: (error) => console.error('Server mastery profile failed to load:', error),
    });
  }, [user?.role, user?.id]);

  useEffect(() => {
    if (user?.role !== 'student' || !user.id) {
      setStudentPathInterventionState(null);
      return undefined;
    }
    return subscribeStudentPathIntervention({
      studentId: user.id,
      onChange: setStudentPathInterventionState,
      onError: (error) => console.error('Personal Path recommendation failed to load:', error),
    });
  }, [user?.role, user?.id]);
}
