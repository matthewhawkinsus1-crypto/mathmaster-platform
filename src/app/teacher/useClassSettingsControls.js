/*
 * A TEACHER'S CLASS SETTINGS: MOVING TO A CLASS, CHANGING A PERIOD, AND SAVING THE SCHEDULE AND COURSE PROFILES.
 *
 * Moved verbatim from App.jsx, which calls this where the code was and passes what it reads by name. It runs no effects.
 */
import { useState } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { teacherAdmin } from '../../auth/authService';
import { CLASS_PERIODS, normalizeSchedule, withDayTypeSetAt } from '../../assignmentLifecycle';
import { normalizeStudentProfile } from '../../studentSupport';
import { normalizeCourseProfiles } from '../../platform/rigor/courseProfiles.js';

export function useClassSettingsControls({
  toastError, toastSuccess, setTeacherTab, classesRef, setActiveClass, setHomeNavigationPeriod, setAllStudents,
  setTeacherRosterSummaries, classSchedule, setClassSchedule, courseProfiles, setCourseProfiles,
  fetchTeacherRosterSummaries,
}) {
  const [courseProfilesSaving, setCourseProfilesSaving] = useState(false);

  const handleGoToClassFromHome = (classContext) => {
    const supplied = classContext && typeof classContext === 'object' ? classContext : { classPeriod: classContext };
    const classPeriod = supplied.classPeriod || null;
    const requestedClassId = supplied.classId || null;
    const matches = (classesRef.current || []).filter((entry) => entry?.status !== 'archived' && entry?.period === classPeriod);
    const resolvedClassId = requestedClassId || (matches.length === 1 ? matches[0].classId : null);
    setActiveClass({ classId: resolvedClassId, classPeriod });
    setHomeNavigationPeriod(classPeriod);
    setTeacherTab('classesWorkspace');
  };

  const handleChangeClassPeriod = async (studentId, newClassId) => {
    try {
      // Class membership is a server-owned relationship. Updating only the
      // legacy period field can leave classId/teacher authorization disagreeing.
      await teacherAdmin.setStudentClass({ studentId, classId: newClassId || null });
      await fetchTeacherRosterSummaries();
    } catch (error) {
      console.error(error);
      toastError('Could not change class', error?.message || 'Class membership could not be updated.');
    }
  };

  // A support profile is saved ONLY as an immutable, dated revision plus its
  // student-readable projection, in one batch (SupportProfileEditor →
  // supportEvidenceStore.saveSupportProfileRevision). This keeps the
  // teacher's in-memory copies in step with what was written. There is no
  // longer a path that rewrites `grades.profile` from a flat patch: with a
  // versioned plan that write would be silently overridden, and it would lose
  // the history the evidence report depends on.
  const handleSupportProfileSaved = (studentId, projection) => {
    const nextProfile = normalizeStudentProfile(projection);
    // `timingProfile` is the stored projection itself (the D7 DOL window).
    const timingProfile = projection && typeof projection === 'object' ? projection : null;
    setAllStudents((current) => current.map((entry) => entry.id === studentId ? { ...entry, profile: nextProfile, timingProfile } : entry));
    setTeacherRosterSummaries((current) => current.map((entry) => entry.id === studentId ? { ...entry, profile: nextProfile, timingProfile } : entry));
  };

  const handleSaveClassSchedule = async () => {
    const scheduleRef = doc(db, 'settings', 'classSchedule');
    // TC01 (the owner, 2026-10-23): each date whose A/B day this save changes
    // is stamped with the server's clock, so a Test day whose A/B day is set
    // only after its class met is never read as missed.
    const saved = await getDoc(scheduleRef);
    const normalized = withDayTypeSetAt(saved.exists() ? saved.data() : null, normalizeSchedule(classSchedule), serverTimestamp());
    await setDoc(scheduleRef, normalized);
    setClassSchedule(normalized);
    toastSuccess('A/B schedule saved', 'DOL windows now use the selected A/B day and any date-specific bell schedule.');
  };

  const handleUpdateCourseProfile = (period, patch) => {
    setCourseProfiles((current) => normalizeCourseProfiles({
      ...current,
      [period]: { ...(current?.[period] || {}), ...patch },
    }, CLASS_PERIODS));
  };

  const handleSaveCourseProfiles = async () => {
    setCourseProfilesSaving(true);
    try {
      const normalized = normalizeCourseProfiles(courseProfiles, CLASS_PERIODS);
      await setDoc(doc(db, 'settings', 'courseProfiles'), { profiles: normalized, updatedAt: new Date().toISOString() });
      setCourseProfiles(normalized);
      toastSuccess('Course settings saved', 'Honors preflight now follows these class designations.');
    } catch (error) {
      console.error(error);
      toastError('Could not save course settings', error.message);
    } finally {
      setCourseProfilesSaving(false);
    }
  };
  return {
    courseProfilesSaving, handleGoToClassFromHome, handleChangeClassPeriod, handleSupportProfileSaved,
    handleSaveClassSchedule, handleUpdateCourseProfile, handleSaveCourseProfiles,
  };
}
