/*
 * THE ASSIGNMENT LIBRARY'S CONTROLS: FOLDERS, ARCHIVE AND PAUSE, BULK ACTIONS, GRADING PERIODS, AND OPENING AN ASSIGNMENT'S DATES.
 *
 * Moved verbatim from App.jsx, which calls this where the code was and passes what it reads by name. It holds no state and runs no effects: App keeps the busy flags and hands their setters in. It reaches App through the teacher kit (teacherKit.js), so it loads for a teacher and never with a student's Home.
 */
import { doc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../../firebase';
import { localDateKey } from '../../../assignmentLifecycle';
import { assignmentFolderMatches, normalizeFolderPath, normalizeFolderPaths, renameFolderPath } from '../../../assignmentFolders';
import { manageAssignmentLifecycle } from '../../../services/assessmentLifecycleService.js';
import { GRADING_PERIOD_SETTINGS_DOC, gradingPeriodAssignmentPatch, normalizeGradingPeriodSettings } from '../../../platform/student/gradingPeriods.js';
import { defaultAssignmentDateInputs } from '../../../platform/assignments/assignmentDateDefaults.js';

export function createAssignmentLibraryControls(
  confirmAction, toastError, toastSuccess, classes, assignments, setEditingAssignmentId, setEditingAssignmentDates,
  assignmentFolderPaths, setAssignmentFolderPaths, gradingPeriodSettings, setGradingPeriodSettings,
  setGradingPeriodBusy, selectedAssignmentIds, setSelectedAssignmentIds, setBulkBusy, fetchAssignments,
) {
  const saveAssignmentFolderPaths = async (paths) => {
    const normalized = normalizeFolderPaths(paths);
    await setDoc(doc(db, 'settings', 'assignmentFolders'), { paths: normalized });
    setAssignmentFolderPaths(normalized);
    return normalized;
  };

  // Batches every assignment doc whose folder equals or is nested under
  // `path` through `updateAssignmentFolder`, chunked below the per-batch
  // write ceiling, mirroring deleteAssignmentPermanently's write pattern.
  const batchUpdateAssignmentsInFolder = async (path, updateAssignmentFolder) => {
    const affected = assignments.filter((assignment) => assignmentFolderMatches(assignment, path));
    if (!affected.length) return;
    const chunkSize = 400;
    for (let startIndex = 0; startIndex < affected.length; startIndex += chunkSize) {
      const batch = writeBatch(db);
      affected.slice(startIndex, startIndex + chunkSize).forEach((assignment) => {
        batch.update(doc(db, 'assignments', assignment.id), { folder: updateAssignmentFolder(assignment) });
      });
      await batch.commit();
    }
    await fetchAssignments();
  };

  const handleCreateFolder = async (path) => {
    await saveAssignmentFolderPaths([...assignmentFolderPaths, path]);
  };

  const handleRenameFolder = async (oldPath, newPath) => {
    await saveAssignmentFolderPaths(assignmentFolderPaths.map((existing) => renameFolderPath(existing, oldPath, newPath)));
    await batchUpdateAssignmentsInFolder(oldPath, (assignment) => renameFolderPath(assignment.folder, oldPath, newPath));
  };

  const handleDeleteFolder = async (path) => {
    await saveAssignmentFolderPaths(assignmentFolderPaths.filter((existing) => existing !== path && !existing.startsWith(`${path}/`)));
    await batchUpdateAssignmentsInFolder(path, () => null);
  };

  const handleMoveAssignmentToFolder = async (assignmentId, folderPath) => {
    await updateDoc(doc(db, 'assignments', assignmentId), { folder: folderPath ? normalizeFolderPath(folderPath) : null });
    await fetchAssignments();
  };

  /*
   * ARCHIVE AND PAUSE GO THROUGH THE SERVER, AND SAY WHAT THEY DO.
   *
   * Both used to be a silent client toggle the server never read, so an
   * "archived" Test was still open to students. They are now audited server
   * actions (manageAssignmentLifecycle) that the Test Cycle and secure exam
   * callables enforce, and each says, before it happens, what students will
   * and will not lose.
   */
  const handleToggleArchiveAssignment = async (assignment) => {
    const archiving = !assignment.archived;
    const proceed = await confirmAction({
      title: `${archiving ? 'Archive' : 'Unarchive'} “${assignment.title}”?`,
      message: archiving
        ? 'Students will no longer see it or be able to open it, including any secure Test or Retest. Their work and recorded grades are kept, and you can unarchive it at any time from the Archived view.'
        : 'It returns to your active lists and becomes available to students again according to its dates.',
      confirmLabel: archiving ? 'Archive' : 'Unarchive',
    });
    if (!proceed) return;
    try {
      await manageAssignmentLifecycle({ assignmentId: assignment.id, action: archiving ? 'archive' : 'unarchive' });
      await fetchAssignments();
      toastSuccess(archiving ? 'Archived' : 'Unarchived', `“${assignment.title}”`);
    } catch (error) {
      toastError(`Could not ${archiving ? 'archive' : 'unarchive'} the assignment`, error.message);
    }
  };

  const handleTogglePauseAssignment = async (assignment) => {
    const pausing = !assignment.unpublished;
    const proceed = await confirmAction({
      title: `${pausing ? 'Pause' : 'Resume'} “${assignment.title}” for students?`,
      message: pausing
        ? 'Students will not see it or be able to open it — including starting or continuing a secure Test — until you resume it. Nothing they have done is lost, and it stays in your lists marked Paused.'
        : 'Students will see it again and can continue where they left off.',
      confirmLabel: pausing ? 'Pause for students' : 'Resume for students',
    });
    if (!proceed) return;
    try {
      await manageAssignmentLifecycle({ assignmentId: assignment.id, action: pausing ? 'unpublish' : 'publish' });
      await fetchAssignments();
      toastSuccess(pausing ? 'Paused for students' : 'Visible to students again', `“${assignment.title}”`);
    } catch (error) {
      toastError(`Could not ${pausing ? 'pause' : 'resume'} the assignment`, error.message);
    }
  };

  const toggleAssignmentSelected = (assignmentId) => {
    setSelectedAssignmentIds((current) => {
      const next = new Set(current);
      if (next.has(assignmentId)) next.delete(assignmentId);
      else next.add(assignmentId);
      return next;
    });
  };

  const clearAssignmentSelection = () => setSelectedAssignmentIds(new Set());

  /**
   * One batched write for the whole selection rather than N sequential
   * updateDoc calls, matching how folder renames already work. Chunked at 400
   * because a Firestore batch caps at 500 operations.
   */
  const applyBulkAssignmentPatch = async (assignmentIds, patch, describe) => {
    const ids = Array.from(assignmentIds || []);
    if (!ids.length) return false;
    setBulkBusy(true);
    try {
      for (let start = 0; start < ids.length; start += 400) {
        const batch = writeBatch(db);
        ids.slice(start, start + 400).forEach((assignmentId) => {
          batch.update(doc(db, 'assignments', assignmentId), patch);
        });
        await batch.commit();
      }
      await fetchAssignments();
      clearAssignmentSelection();
      toastSuccess(describe(ids.length));
      return true;
    } catch (error) {
      console.error(error);
      toastError('Bulk update failed', error.message);
      return false;
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkArchive = async (shouldArchive) => {
    const count = selectedAssignmentIds.size;
    const verb = shouldArchive ? 'Archive' : 'Unarchive';
    const proceed = await confirmAction({
      title: `${verb} ${count} assignment${count === 1 ? '' : 's'}?`,
      message: shouldArchive
        ? 'Archived assignments are hidden from the default list and from students, but nothing is deleted and no student records change. You can unarchive them at any time.'
        : 'These assignments will reappear in the default list and become visible to students again according to their existing dates.',
      confirmLabel: verb,
    });
    if (!proceed) return;
    // One audited server action per assignment (archive is enforced on the
    // server now, so it cannot be a client batch write).
    setBulkBusy(true);
    const ids = Array.from(selectedAssignmentIds || []);
    const failures = [];
    for (const assignmentId of ids) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await manageAssignmentLifecycle({ assignmentId, action: shouldArchive ? 'archive' : 'unarchive' });
      } catch (error) {
        failures.push(`${assignments.find((item) => item.id === assignmentId)?.title || assignmentId}: ${error.message}`);
      }
    }
    await fetchAssignments();
    clearAssignmentSelection();
    setBulkBusy(false);
    if (failures.length) toastError(`${failures.length} could not be ${shouldArchive ? 'archived' : 'unarchived'}`, failures.slice(0, 3).join(' · '));
    const done = ids.length - failures.length;
    if (done) toastSuccess(`${shouldArchive ? 'Archived' : 'Unarchived'} ${done} assignment${done === 1 ? '' : 's'}`);
  };

  const handleBulkMoveToFolder = async (rawFolder) => {
    const folder = normalizeFolderPath(rawFolder);
    await applyBulkAssignmentPatch(
      selectedAssignmentIds,
      { folder: folder || null },
      (count) => `Moved ${count} assignment${count === 1 ? '' : 's'} to ${folder || 'Uncategorized'}`,
    );
  };

  /*
   * MARKING PERIODS — TEACHER WRITES.
   *
   * Two documents, and they never touch each other's business:
   *   settings/gradingPeriods  the period list and which one is current
   *   assignments/{id}         a {id,label,order} stamp, written only here
   *
   * Nothing in this group reads or writes `assignment.archived`. Closing a
   * marking period is a reporting-window decision; archiving an assignment is
   * a filing decision, and conflating them would let one quietly do the other.
   */
  const persistGradingPeriodSettings = async (next, successMessage) => {
    const normalized = normalizeGradingPeriodSettings(next);
    setGradingPeriodBusy(true);
    try {
      await setDoc(doc(db, 'settings', GRADING_PERIOD_SETTINGS_DOC), {
        periods: normalized.periods,
        currentPeriodId: normalized.currentPeriodId,
        updatedAt: new Date().toISOString(),
      });
      setGradingPeriodSettings(normalized);
      if (successMessage) toastSuccess(successMessage);
      return normalized;
    } catch (error) {
      console.error(error);
      toastError('Could not save marking periods', error.message);
      return gradingPeriodSettings;
    } finally {
      setGradingPeriodBusy(false);
    }
  };

  const handleCreateGradingPeriod = (period) => persistGradingPeriodSettings(
    {
      periods: [...gradingPeriodSettings.periods, period],
      // The first period a school creates becomes current, so creating one
      // never leaves students looking at a Grade Center with no current group.
      currentPeriodId: gradingPeriodSettings.currentPeriodId || period.id,
    },
    `Added ${period.label}`,
  );

  const handleSetCurrentGradingPeriod = (periodId) => persistGradingPeriodSettings(
    { ...gradingPeriodSettings, currentPeriodId: periodId },
    'Current marking period updated',
  );

  const handleSetGradingPeriodArchived = (periodId, archived) => persistGradingPeriodSettings(
    {
      ...gradingPeriodSettings,
      periods: gradingPeriodSettings.periods.map((period) => (
        period.id === periodId ? { ...period, archived } : period
      )),
    },
    archived
      ? 'Marking period closed. Students keep every grade in it; it simply collapses by default.'
      : 'Marking period reopened',
  );

  const handleMoveSelectedAssignmentsToGradingPeriod = async (
    period,
    assignmentIds = selectedAssignmentIds,
  ) => {
    const label = period?.label || 'the default current period';
    return applyBulkAssignmentPatch(
      assignmentIds,
      gradingPeriodAssignmentPatch(period),
      (count) => `Moved ${count} assignment${count === 1 ? '' : 's'} to ${label}`,
    );
  };

  // Switching an assignment's Warm-Up into a Live Challenge. Written with dotted
  // field paths so the rest of the warmup object — the window, the instruction
  // dates, the per-class closures — is untouched.
  const handleLinkWarmupChallenge = async (assignmentId, options = {}) => {
    if (!assignmentId) return;
    await updateDoc(doc(db, 'assignments', assignmentId), {
      'warmup.liveChallenge.enabled': true,
      'warmup.liveChallenge.roundCount': Math.max(3, Math.min(20, Number(options.roundCount) || 5)),
      'warmup.liveChallenge.roundSeconds': Math.max(15, Math.min(120, Number(options.roundSeconds) || 30)),
      'warmup.liveChallenge.standardCode': String(options.standardCode || 'mixed'),
    });
  };

  const beginEditAssignmentDates = (assignment) => {
    const toLocalInput = (value) => {
      const date = value ? new Date(value) : null;
      if (!date || Number.isNaN(date.getTime())) return '';
      const offset = date.getTimezoneOffset() * 60000;
      return new Date(date.getTime() - offset).toISOString().slice(0, 16);
    };
    const existingIds = Array.isArray(assignment.assignedClassIds)
      ? assignment.assignedClassIds.filter(Boolean)
      : [];
    const existingPeriods = [...new Set(classes
      .filter((entry) => existingIds.includes(entry.classId) && entry?.status !== 'archived')
      .map((entry) => entry.period)
      .filter(Boolean))];
    const defaultDates = defaultAssignmentDateInputs();
    setEditingAssignmentId(assignment.id);
    setEditingAssignmentDates({
      dueAt: toLocalInput(assignment.dueAt || assignment.dueDate) || defaultDates.dueAt,
      lateDueAt: toLocalInput(assignment.lateDueAt || assignment.lateDueDate) || defaultDates.lateDueAt,
      dolInstructionDate: assignment.dol?.instructionDate
        || (assignment.releaseAt ? toLocalInput(assignment.releaseAt).slice(0, 10) : localDateKey(Date.now())),
      assignedClassPeriods: existingPeriods,
      assignedClassIds: existingIds,
    });
  };
  return [
    saveAssignmentFolderPaths, handleCreateFolder, handleRenameFolder, handleDeleteFolder,
    handleMoveAssignmentToFolder, handleToggleArchiveAssignment, handleTogglePauseAssignment,
    toggleAssignmentSelected, clearAssignmentSelection, handleBulkArchive, handleBulkMoveToFolder,
    handleCreateGradingPeriod, handleSetCurrentGradingPeriod, handleSetGradingPeriodArchived,
    handleMoveSelectedAssignmentsToGradingPeriod, handleLinkWarmupChallenge, beginEditAssignmentDates,
  ];
}
