/*
 * A TEACHER'S MY MATH PATH CONTROLS: PACING, THE WEEKLY GOAL, SKILL OVERRIDES AND A PERSONAL RECOMMENDATION.
 *
 * Moved verbatim from App.jsx, which calls this where the code was and passes what it reads by name. It runs no effects.
 */
import { useState } from 'react';
import { db } from '../../firebase';
import { rosterStudentLabel, rosterStudentNameForStorage } from '../../platform/teacher/teacherRosterSummary.js';
import { saveClassPacing, saveSkillOverrides, saveWeeklyGoalSettings, setStudentPathIntervention } from '../../platform/path/pathStore.js';
import { SUPPORT_EVENT_KIND, SUPPORT_EVENT_STAGE } from '../../platform/teacher/supportEventKinds.js';

export function usePathPacingControls({
  toastError, toastSuccess, user, requireTeacherKit, setPacingByClass, setSkillOverrides, setWeeklyGoalsByClass,
  weeklyGoalsByClass, teacherStudentIdentityIndex,
}) {
  const [pathInterventionBusyStudentId, setPathInterventionBusyStudentId] = useState(null);
  const [pacingBusy, setPacingBusy] = useState(false);
  const [weeklyGoalBusy, setWeeklyGoalBusy] = useState(false);

  const handleSavePacing = async (next) => {
    setPacingByClass(next);
    setPacingBusy(true);
    try {
      await saveClassPacing(next);
    } catch (error) {
      toastError('Pacing not saved', 'The change is showing locally but did not reach the server.');
      console.error(error);
    } finally {
      setPacingBusy(false);
    }
  };

  const handleSaveWeeklyGoal = async (classId, config) => {
    if (!classId) return;
    // Optimistic locally, then persisted. A teacher adjusting a control must
    // see it move immediately; a failed write says so rather than silently
    // reverting under them.
    const next = { ...weeklyGoalsByClass, [classId]: config };
    setWeeklyGoalsByClass(next);
    setWeeklyGoalBusy(true);
    try {
      await saveWeeklyGoalSettings(next);
    } catch (error) {
      toastError('Weekly goal not saved', 'The change is showing locally but did not reach the server.');
      console.error(error);
    } finally {
      setWeeklyGoalBusy(false);
    }
  };

  const handleSaveOverrides = async (next) => {
    setSkillOverrides(next);
    setPacingBusy(true);
    try {
      await saveSkillOverrides(next);
    } catch (error) {
      toastError('Override not saved', 'The change is showing locally but did not reach the server.');
      console.error(error);
    } finally {
      setPacingBusy(false);
    }
  };

  const handlePersonalPathRecommendation = async ({
    studentId,
    studentName = null,
    teksCode = null,
    clear = false,
    classId = null,
    classPeriod = null,
    assignmentId = null,
    assignmentTitle = null,
  } = {}) => {
    const id = String(studentId || '').trim();
    if (!id) return null;
    // Named from the roster by id. The caller's name is only a historical hint:
    // a Live tile whose student has no name on file passes none, and the id is
    // never promoted to a name — the toast labels it as an id instead.
    const studentLabel = rosterStudentLabel({ studentId: id, index: teacherStudentIdentityIndex, historicalName: studentName });
    const storedStudentName = rosterStudentNameForStorage({ studentId: id, index: teacherStudentIdentityIndex, historicalName: studentName });
    setPathInterventionBusyStudentId(id);
    try {
      const result = await setStudentPathIntervention({
        studentId: id,
        teksCode,
        durationHours: 48,
        clear,
      });

      if (clear) {
        toastSuccess(
          'Personal Path recommendation cleared',
          `${studentLabel} is back to the normal adaptive Path priorities.`,
        );
        return result;
      }

      // The intervention and the support history are different records on
      // purpose. The student sees only "teacher recommended this skill"; the
      // private teacher history preserves when/where the action happened.
      if (user?.email) {
        requireTeacherKit().recordStudentSupportEvent({
          db,
          teacherEmail: user.email,
          event: {
            kind: SUPPORT_EVENT_KIND.TEACHER_INTERVENTION,
            stage: SUPPORT_EVENT_STAGE.ACTION_TAKEN,
            studentId: id,
            studentName: storedStudentName,
            classId,
            classPeriod,
            assignmentId,
            assignmentTitle,
            source: 'liveMonitor',
            summary: `Teacher recommended ${teksCode} as a temporary personal My Math Path priority for 48 hours.`,
            evidence: {
              teksCode,
              durationHours: 48,
              interventionType: 'personalPathRecommendation',
            },
          },
        }).catch((error) => {
          console.error('Path recommendation applied but support history did not save:', error);
        });
      }

      toastSuccess(
        'Path recommendation updated',
        `${teksCode} is now a personal priority for ${studentLabel} for 48 hours. Normal prerequisite and content safeguards still apply.`,
      );
      return result;
    } catch (error) {
      console.error(error);
      toastError(
        clear ? 'Could not clear Path recommendation' : 'Could not update Path recommendation',
        error.message,
      );
      return null;
    } finally {
      setPathInterventionBusyStudentId(null);
    }
  };
  return {
    pathInterventionBusyStudentId, pacingBusy, weeklyGoalBusy, handleSavePacing, handleSaveWeeklyGoal,
    handleSaveOverrides, handlePersonalPathRecommendation,
  };
}
