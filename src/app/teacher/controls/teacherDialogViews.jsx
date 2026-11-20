/*
 * THE TEACHER'S DIALOGS APP DRAWS: DELETING AN ASSIGNMENT, EXPORT JSON, AND A STUDENT'S SCRATCHPAD.
 *
 * Moved verbatim from App.jsx. Plain functions that return what App draws: not components, no state, no effects, no hooks. They reach App through the teacher kit (teacherKit.js), so they load for a teacher and never with a student's Home; only the teacher's screen draws them, and it waits for the kit.
 */
import Dialog from '../../../ui/Dialog.jsx';
import { contentVersionOf } from '../../../platform/assignments/assignmentContentVersion.js';
import { buildCurrentContentPortablePackage } from '../../../platform/assignments/currentContentPortableAssignment.js';
import { formatStudentName } from '../../../platform/studentName';

export function createTeacherDialogViews(
  allStudents, setTeacherScratchpadDialog, teacherScratchpadDialog, teacherScratchpadLoading, exportJsonAssignment,
  exportJsonCopied, deleteDialog, deleteEvidence, deleteClassroomAcknowledged, setDeleteClassroomAcknowledged,
  deleteStep, setDeleteStep, deleteTitleConfirmation, setDeleteTitleConfirmation, deleteAcknowledged,
  setDeleteAcknowledged, isDeleting, deleteError, archiveFromDeleteDialog, closeDeleteDialog,
  deleteAssignmentPermanently, closeExportJsonDialog, copyExportJsonToClipboard,
) {
  const renderDeleteAssignmentDialog = () => {
    if (!deleteDialog) return null;

    const evidenceLoading = deleteEvidence === null;
    const evidenceError = deleteEvidence?.error || '';
    const studentsWithWork = Number(deleteEvidence?.studentsWithWork || 0);
    const canDelete = deleteEvidence?.canDelete === true;
    const classroomPosts = Number(deleteEvidence?.classroomPublications || 0);
    const titleMatches =
      deleteTitleConfirmation.trim() === deleteDialog.title.trim();

    return (
      <div
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeDeleteDialog();
        }}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10000,
          background: 'rgba(32,33,36,0.72)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
        }}
      >
        <Dialog
          onClose={closeDeleteDialog}
          closeOnEscape={!isDeleting}
          aria-labelledby="delete-assignment-title"
          style={{
            width: '100%',
            maxWidth: '560px',
            background: 'var(--mm-surface)',
            borderRadius: '16px',
            boxShadow: '0 24px 70px rgba(0,0,0,0.3)',
            overflow: 'hidden',
            textAlign: 'left',
          }}
        >
          <div style={{ padding: '24px 28px', borderBottom: '1px solid var(--mm-border-soft)' }}>
            <div
              style={{
                color: 'var(--mm-danger)',
                fontWeight: 'bold',
                fontSize: 'calc(13 * var(--mm-px))',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: '8px',
              }}
            >
              Permanent deletion · Step {deleteStep} of 3
            </div>
            <h2 id="delete-assignment-title" style={{ margin: 0, color: 'var(--mm-text-strong)' }}>
              Delete “{deleteDialog.title}”?
            </h2>
          </div>

          <div style={{ padding: '28px' }}>
            {deleteStep === 1 && (
              <div data-delete-evidence={evidenceLoading ? 'loading' : canDelete ? 'none' : 'present'}>
                {evidenceLoading && (
                  <p role="status" style={{ color: 'var(--mm-text)', lineHeight: 1.55 }}>Checking whether any student has worked on this assignment…</p>
                )}
                {evidenceError && (
                  <p role="alert" style={{ color: 'var(--mm-error-text)', lineHeight: 1.55 }}>{evidenceError}</p>
                )}
                {!evidenceLoading && !evidenceError && !canDelete && (
                  <div style={{ background: 'var(--mm-warning-bg)', color: 'var(--mm-warning-text)', border: '1px solid var(--mm-warning-border)', borderRadius: '10px', padding: '16px', lineHeight: 1.55 }}>
                    <strong>{studentsWithWork} student{studentsWithWork === 1 ? ' has' : 's have'} work on this assignment.</strong>{' '}
                    Deleting it would erase their answers, evidence and grades, so MathMaster will not delete it.
                    <br />
                    <strong>Archive it instead:</strong> it disappears for students and from your active lists, every
                    record and grade is kept, and you can unarchive it at any time.
                  </div>
                )}
                {!evidenceLoading && !evidenceError && canDelete && (
                  <>
                    <div style={{ background: 'var(--mm-error-bg)', color: 'var(--mm-error-text)', border: '1px solid var(--mm-error-border-soft)', borderRadius: '10px', padding: '16px', marginBottom: '14px', lineHeight: 1.5 }}>
                      <strong>This cannot be undone.</strong> No student has worked on this assignment, so it can be
                      deleted. Any secure Test sessions opened for it (none started) are removed with it.
                    </div>
                    {classroomPosts > 0 && (
                      <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', color: 'var(--mm-text)', lineHeight: 1.5 }}>
                        <input type="checkbox" checked={deleteClassroomAcknowledged} onChange={(event) => setDeleteClassroomAcknowledged(event.target.checked)} style={{ marginTop: '4px' }} />
                        <span>It is posted to Google Classroom. Deleting it here does not remove the Classroom post; I will remove that in Classroom.</span>
                      </label>
                    )}
                  </>
                )}
              </div>
            )}

            {deleteStep === 2 && (
              <div>
                <p style={{ color: 'var(--mm-text)', lineHeight: 1.55, marginBottom: '16px' }}>
                  To confirm that you selected the correct assignment, type its exact
                  title below:
                </p>
                <div
                  style={{
                    background: 'var(--mm-surface-control)',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    fontWeight: 'bold',
                    marginBottom: '12px',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {deleteDialog.title}
                </div>
                <input
                  autoFocus
                  type="text"
                  value={deleteTitleConfirmation}
                  onChange={(event) => setDeleteTitleConfirmation(event.target.value)}
                  placeholder="Type the assignment title"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '12px',
                    borderRadius: '8px',
                    border: titleMatches
                      ? '2px solid #188038'
                      : '2px solid var(--mm-border)',
                    fontSize: 'calc(16 * var(--mm-px))',
                    outline: 'none',
                  }}
                />
              </div>
            )}

            {deleteStep === 3 && (
              <div>
                <div
                  style={{
                    border: '2px solid #d93025',
                    borderRadius: '10px',
                    padding: '16px',
                    marginBottom: '18px',
                  }}
                >
                  <div style={{ fontWeight: 'bold', color: 'var(--mm-danger)', marginBottom: '8px' }}>
                    Final confirmation
                  </div>
                  <div style={{ color: 'var(--mm-text)', lineHeight: 1.5 }}>
                    You are permanently deleting this assignment. No student has worked on it.
                  </div>
                </div>
                <label
                  style={{
                    display: 'flex',
                    gap: '12px',
                    alignItems: 'flex-start',
                    color: 'var(--mm-text-strong)',
                    lineHeight: 1.5,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={deleteAcknowledged}
                    onChange={(event) =>
                      setDeleteAcknowledged(event.target.checked)
                    }
                    style={{ marginTop: '4px', width: '18px', height: '18px' }}
                  />
                  <span>
                    I understand that this assignment cannot be recovered after it is deleted.
                  </span>
                </label>
              </div>
            )}

            {deleteError && (
              <div
                style={{
                  marginTop: '18px',
                  padding: '12px',
                  background: 'var(--mm-error-bg)',
                  color: 'var(--mm-error-text)',
                  borderRadius: '8px',
                }}
              >
                {deleteError}
              </div>
            )}
          </div>

          <div
            style={{
              padding: '18px 28px',
              borderTop: '1px solid var(--mm-border-soft)',
              display: 'flex',
              justifyContent: 'space-between',
              gap: '12px',
              background: 'var(--mm-surface-sunken)',
            }}
          >
            <button
              onClick={deleteStep === 1 ? closeDeleteDialog : () => setDeleteStep((step) => step - 1)}
              disabled={isDeleting}
              style={{
                padding: '10px 18px',
                background: 'var(--mm-surface)',
                color: 'var(--mm-text)',
                border: '1px solid var(--mm-border)',
                borderRadius: '8px',
                cursor: isDeleting ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
              }}
            >
              {deleteStep === 1 ? 'Cancel' : 'Back'}
            </button>

            {deleteStep === 1 && !evidenceLoading && !evidenceError && !canDelete ? (
              <button
                onClick={archiveFromDeleteDialog}
                disabled={isDeleting}
                style={{ padding: '10px 18px', background: 'var(--mm-primary)', color: 'var(--mm-on-primary)', border: 'none', borderRadius: '8px', cursor: isDeleting ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
              >
                {isDeleting ? 'Archiving…' : 'Archive instead'}
              </button>
            ) : deleteStep < 3 ? (
              <button
                onClick={() => setDeleteStep((step) => step + 1)}
                disabled={(deleteStep === 1 && (!canDelete || (classroomPosts > 0 && !deleteClassroomAcknowledged))) || (deleteStep === 2 && !titleMatches)}
                style={{
                  padding: '10px 18px',
                  background:
                    (deleteStep === 1 && (!canDelete || (classroomPosts > 0 && !deleteClassroomAcknowledged))) || (deleteStep === 2 && !titleMatches) ? 'var(--mm-surface-control-strong)' : 'var(--mm-danger)',
                  color: (deleteStep === 1 && (!canDelete || (classroomPosts > 0 && !deleteClassroomAcknowledged))) || (deleteStep === 2 && !titleMatches) ? 'var(--mm-disabled-text)' : 'var(--mm-on-primary)',
                  border: 'none',
                  borderRadius: '8px',
                  cursor:
                    (deleteStep === 1 && (!canDelete || (classroomPosts > 0 && !deleteClassroomAcknowledged))) || (deleteStep === 2 && !titleMatches)
                      ? 'not-allowed'
                      : 'pointer',
                  fontWeight: 'bold',
                }}
              >
                Continue
              </button>
            ) : (
              <button
                onClick={deleteAssignmentPermanently}
                disabled={!deleteAcknowledged || isDeleting}
                style={{
                  padding: '10px 18px',
                  background:
                    !deleteAcknowledged || isDeleting ? 'var(--mm-surface-control-strong)' : 'var(--mm-danger)',
                  color: !deleteAcknowledged || isDeleting ? 'var(--mm-disabled-text)' : 'var(--mm-on-primary)',
                  border: 'none',
                  borderRadius: '8px',
                  cursor:
                    !deleteAcknowledged || isDeleting
                      ? 'not-allowed'
                      : 'pointer',
                  fontWeight: 'bold',
                }}
              >
                {isDeleting ? 'Deleting…' : 'Permanently Delete'}
              </button>
            )}
          </div>
        </Dialog>
      </div>
    );
  };

  const renderExportJsonDialog = () => {
    if (!exportJsonAssignment) return null;

    const exportedText = JSON.stringify(buildCurrentContentPortablePackage(exportJsonAssignment), null, 2);

    return (
      <div
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeExportJsonDialog();
        }}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10000,
          background: 'rgba(32,33,36,0.72)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
        }}
      >
        <Dialog
          onClose={closeExportJsonDialog}
          aria-labelledby="export-json-title"
          style={{
            width: '100%',
            maxWidth: '720px',
            background: 'var(--mm-surface)',
            borderRadius: '16px',
            boxShadow: '0 24px 70px rgba(0,0,0,0.3)',
            overflow: 'hidden',
            textAlign: 'left',
          }}
        >
          <div style={{ padding: '24px 28px', borderBottom: '1px solid var(--mm-border-soft)' }}>
            <h2 id="export-json-title" style={{ margin: 0, color: 'var(--mm-text-strong)' }}>
              Export Current Content V{contentVersionOf(exportJsonAssignment)} &middot; {exportJsonAssignment.title}
            </h2>
            <p style={{ margin: '8px 0 0', color: 'var(--mm-text-muted)', fontSize: 'calc(13 * var(--mm-px))' }}>
              This is a portable MathMaster assignment. You can copy it into another MathMaster authoring workflow and bring it back through Assignment Creator. Student/class dates and publication records stay out of the portable assignment.
            </p>
          </div>
          <div style={{ padding: '20px 28px' }}>
            <textarea
              readOnly
              value={exportedText}
              onFocus={(event) => event.target.select()}
              style={{ width: '100%', height: '360px', padding: '12px', borderRadius: '8px', border: '1px solid var(--mm-border)', fontFamily: 'monospace', fontSize: 'calc(12 * var(--mm-px))', boxSizing: 'border-box', resize: 'vertical' }}
            />
          </div>
          <div style={{ padding: '18px 28px', borderTop: '1px solid var(--mm-border-soft)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              type="button"
              onClick={closeExportJsonDialog}
              style={{ padding: '10px 18px', background: 'var(--mm-surface)', border: '1px solid var(--mm-border)', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => copyExportJsonToClipboard(exportedText)}
              style={{ padding: '10px 18px', background: '#1a73e8', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              {exportJsonCopied ? 'Copied!' : 'Copy to Clipboard'}
            </button>
          </div>
        </Dialog>
      </div>
    );
  };

  const renderTeacherScratchpadDialog = () => {
    if (!teacherScratchpadDialog) return null;
    return (
      <div
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            setTeacherScratchpadDialog(null);
          }
        }}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10020,
          background: 'rgba(20,24,31,0.78)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
        }}
      >
        <Dialog
          onClose={() => setTeacherScratchpadDialog(null)}
          aria-labelledby="student-work-title"
          style={{
            width: 'min(1080px, 96vw)',
            maxHeight: '92vh',
            overflow: 'auto',
            background: 'var(--mm-surface)',
            borderRadius: '14px',
            boxShadow: '0 22px 70px rgba(0,0,0,0.35)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '20px',
              padding: '18px 22px',
              borderBottom: '1px solid var(--mm-border-soft)',
            }}
          >
            <div>
              <h2 id="student-work-title" style={{ margin: 0, color: 'var(--mm-text-strong)' }}>
                Student Scratchpad
              </h2>
              <div style={{ color: 'var(--mm-text-muted)', marginTop: '5px', fontSize: 'calc(14 * var(--mm-px))' }}>
                {formatStudentName(allStudents.find((student) => student.id === teacherScratchpadDialog.studentId), { lastFirst: false })} · Question{' '}
                {teacherScratchpadDialog.questionIndex + 1}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setTeacherScratchpadDialog(null)}
              style={{
                border: '1px solid var(--mm-border)',
                background: 'var(--mm-surface)',
                borderRadius: '999px',
                padding: '8px 14px',
                fontWeight: 'bold',
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
          <div style={{ padding: '24px', textAlign: 'center' }}>
            {teacherScratchpadLoading ? (
              <p style={{ color: 'var(--mm-text-muted)' }}>Loading student work…</p>
            ) : (teacherScratchpadDialog.pages?.length || teacherScratchpadDialog.dataUrl) ? (
              // Pages are stacked and labelled rather than paged through: a
              // teacher grading a stack of scratchpads should not have to
              // discover that page two exists.
              <div style={{ display: 'grid', gap: '18px' }}>
                {(teacherScratchpadDialog.pages?.length
                  ? teacherScratchpadDialog.pages
                  : [teacherScratchpadDialog.dataUrl]
                ).map((page, index, all) => (
                  <figure key={index} style={{ margin: 0 }}>
                    {all.length > 1 && (
                      <figcaption style={{ marginBottom: '6px', textAlign: 'left', fontSize: 'calc(12 * var(--mm-px))', fontWeight: 800, color: 'var(--mm-text-muted)' }}>
                        Page {index + 1} of {all.length}
                      </figcaption>
                    )}
                    <img
                      src={page}
                      alt={`Scratchpad work for question ${teacherScratchpadDialog.questionIndex + 1}${all.length > 1 ? `, page ${index + 1}` : ''}`}
                      style={{
                        display: 'block',
                        width: '100%',
                        height: 'auto',
                        maxHeight: '72vh',
                        objectFit: 'contain',
                        background: 'var(--mm-surface)',
                        border: '1px solid var(--mm-border)',
                        borderRadius: '10px',
                      }}
                    />
                  </figure>
                ))}
              </div>
            ) : (
              <div
                style={{
                  padding: '55px 20px',
                  border: '2px dashed var(--mm-border)',
                  borderRadius: '10px',
                  color: 'var(--mm-text-muted)',
                }}
              >
                No saved scratchpad is available for this question.
              </div>
            )}
          </div>
        </Dialog>
      </div>
    );
  };
  return [renderDeleteAssignmentDialog, renderExportJsonDialog, renderTeacherScratchpadDialog];
}
