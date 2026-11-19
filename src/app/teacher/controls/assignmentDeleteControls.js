/*
 * DELETING AN ASSIGNMENT: THE DIALOG'S STEPS, WHAT THE TEACHER HAS ACKNOWLEDGED, AND THE DELETE OR ARCHIVE IT ENDS IN.
 *
 * Moved verbatim from App.jsx, which calls this where the code was and passes what it reads by name. It holds no state and runs no effects: App keeps the busy flags and hands their setters in. It reaches App through the teacher kit (teacherKit.js), so it loads for a teacher and never with a student's Home.
 */
import { getAssignmentEvidenceSummary, manageAssignmentLifecycle } from '../../../services/assessmentLifecycleService.js';

export function createAssignmentDeleteControls(
  toastSuccess, deleteDialog, setDeleteDialog, setDeleteEvidence, deleteClassroomAcknowledged,
  setDeleteClassroomAcknowledged, setDeleteStep, deleteTitleConfirmation, setDeleteTitleConfirmation,
  deleteAcknowledged, setDeleteAcknowledged, isDeleting, setIsDeleting, setDeleteError, fetchAssignments,
) {
  const openDeleteDialog = (assignment) => {
    setDeleteDialog(assignment);
    setDeleteStep(1);
    setDeleteTitleConfirmation('');
    setDeleteAcknowledged(false);
    setDeleteClassroomAcknowledged(false);
    setDeleteError('');
    setDeleteEvidence(null);
    // Asked of the server, which can see every student's work; the teacher's
    // own roster snapshot cannot, and guessing low here is how evidence goes.
    getAssignmentEvidenceSummary({ assignmentId: assignment.id })
      .then((summary) => setDeleteEvidence(summary))
      .catch((error) => setDeleteEvidence({ error: error.message || 'Could not check this assignment for student work.' }));
  };

  const closeDeleteDialog = () => {
    if (isDeleting) return;
    setDeleteDialog(null);
    setDeleteStep(1);
    setDeleteTitleConfirmation('');
    setDeleteAcknowledged(false);
    setDeleteError('');
  };

  /*
   * DELETE IS A SERVER DECISION.
   *
   * This used to read every grade document in the school from the teacher's
   * browser (which the rules refuse for an ordinary teacher, so delete simply
   * failed) and, for the administrator, delete the assignment and strip each
   * student's work for it — evidence and grades included, with Test Cycle
   * records and secure sessions left orphaned. The server now refuses a delete
   * once any student has worked on the assignment, and offers Archive, which
   * hides it and keeps everything.
   */
  const deleteAssignmentPermanently = async () => {
    if (!deleteDialog || !deleteAcknowledged) return;
    setIsDeleting(true);
    setDeleteError('');
    try {
      await manageAssignmentLifecycle({
        assignmentId: deleteDialog.id,
        action: 'delete',
        confirmTitle: deleteTitleConfirmation.trim(),
        acknowledgeClassroom: deleteClassroomAcknowledged,
      });
      await fetchAssignments();
      toastSuccess('Assignment deleted', `“${deleteDialog.title}” was deleted. No student had worked on it.`);
      setDeleteDialog(null);
      setDeleteStep(1);
      setDeleteTitleConfirmation('');
      setDeleteAcknowledged(false);
      setDeleteError('');
    } catch (error) {
      console.error(error);
      setDeleteError(error.message || 'The assignment could not be deleted.');
    } finally {
      setIsDeleting(false);
    }
  };

  const archiveFromDeleteDialog = async () => {
    if (!deleteDialog) return;
    setIsDeleting(true);
    try {
      await manageAssignmentLifecycle({ assignmentId: deleteDialog.id, action: 'archive' });
      await fetchAssignments();
      toastSuccess('Assignment archived', `“${deleteDialog.title}” is hidden from students. Their work and grades are kept, and you can unarchive it from the Archived view.`);
      setDeleteDialog(null);
    } catch (error) {
      setDeleteError(error.message || 'The assignment could not be archived.');
    } finally {
      setIsDeleting(false);
    }
  };
  return [openDeleteDialog, closeDeleteDialog, deleteAssignmentPermanently, archiveFromDeleteDialog];
}
