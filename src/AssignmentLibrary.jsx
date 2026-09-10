import { useEffect, useMemo, useState } from 'react';
import AssignmentLibraryBase from './AssignmentLibraryBase.jsx';
import { findAssignmentsNeedingRuntimeRepairPersistence } from './platform/assignments/assignmentRuntimeRepairAutoWriteback.js';
import { persistRuntimeRepairForTeacher } from './platform/assignments/assignmentRuntimeRepairPersistenceStore.js';

const clean = (value) => String(value ?? '').trim();

/**
 * Library wrapper that makes Repair Center a first-class Library action.
 *
 * The Library does not decide whether an assignment is "safe to edit directly."
 * A lesson can look unassigned today and still have historical student records.
 * Every launch therefore routes to the normal Assignments workspace, where App
 * already calculates authoritative live protection from assignment state plus
 * student grade history before opening AssignmentQuestionEditor.
 *
 * This wrapper is also the teacher-only automatic write-back boundary for
 * deterministic Assignment Runtime Self-Healing. The scan is pure; an actual
 * Firestore write is attempted only for a V5 assignment whose current repair
 * engine changed content and certified that exact change safe to persist. The
 * persistence layer independently verifies it again before writing only
 * sections + runtimeCompatibility. Student runtime never imports this path.
 */
export default function AssignmentLibrary(props) {
  const {
    assignments = [],
    onNavigateToAssignments,
  } = props;
  const repairChoices = useMemo(() => (
    [...assignments]
      .filter((assignment) => assignment?.id && Number(assignment?.schemaVersion) === 5)
      .sort((left, right) => clean(left.title).localeCompare(clean(right.title)))
  ), [assignments]);
  const runtimeRepairCandidates = useMemo(() => (
    findAssignmentsNeedingRuntimeRepairPersistence(assignments)
  ), [assignments]);
  const [selectedRepairId, setSelectedRepairId] = useState('');
  const [message, setMessage] = useState('');

  // Teacher Library is the narrow automatic persistence shell. Processing is
  // sequential to avoid a burst of writes when an older library contains more
  // than one safely repairable record. React StrictMode can invoke an effect
  // twice in development; assignmentRuntimeRepairPersistenceStore guards the
  // same certified patch with an in-flight key, and the Firestore snapshot then
  // removes the stamped assignment from this candidate list.
  useEffect(() => {
    if (!runtimeRepairCandidates.length) return undefined;

    let disposed = false;
    const persistCertifiedRepairs = async () => {
      for (const candidate of runtimeRepairCandidates) {
        if (disposed) break;
        try {
          const result = await persistRuntimeRepairForTeacher({
            assignmentId: candidate.assignmentId,
            storedAssignment: candidate.assignment,
            actorRole: 'teacher',
          });
          if (result?.persisted) {
            console.info(
              `MathMaster permanently saved certified runtime repair(s) for ${candidate.assignmentId}: ${candidate.repairKeys.join(', ')}`,
            );
          }
        } catch (error) {
          // Runtime rendering already has the in-memory correction, so a
          // persistence failure must never prevent the teacher from opening the
          // Library or students from using the assignment. Keep the diagnostic
          // visible in the console and allow a later Library open to retry.
          console.warn(
            `MathMaster could not persist the certified runtime repair for ${candidate.assignmentId}:`,
            error,
          );
        }
      }
    };

    persistCertifiedRepairs();
    return () => { disposed = true; };
  }, [runtimeRepairCandidates]);

  const effectiveRepairId = selectedRepairId || repairChoices[0]?.id || '';
  const selectedAssignment = repairChoices.find((assignment) => assignment.id === effectiveRepairId) || null;

  const openRepairCenter = () => {
    if (!selectedAssignment) {
      setMessage('There are no Assignment V5 lessons available in this Library view yet.');
      return;
    }
    if (typeof onNavigateToAssignments !== 'function') {
      setMessage('MathMaster could not open the protected repair workflow from this screen. Open Assignments and choose “Repair Center / Edit Questions” for this lesson.');
      return;
    }

    setMessage('Opening this lesson in the protected Assignments workflow. Use “Repair Center / Edit Questions” on the matching assignment.');
    onNavigateToAssignments({
      folder: selectedAssignment.folder || '',
      smartView: '',
      search: selectedAssignment.title || '',
      assignmentId: selectedAssignment.id,
      requestedAction: 'repairCenter',
    });
  };

  return (
    <>
      <section
        aria-label="Library Repair Center launcher"
        style={{
          marginBottom: 14,
          padding: '14px 16px',
          border: '2px solid #aecbfa',
          borderRadius: 12,
          background: '#f8fbff',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <strong style={{ color: '#174ea6', fontSize: 16 }}>Library Repair Center</strong>
            <div style={{ marginTop: 3, color: '#5f6368', fontSize: 12 }}>
              Choose any saved Library lesson. MathMaster opens its protected assignment view so teacher flags, AI repair uploads, and any existing student history use the same safe repair rules.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={effectiveRepairId}
              onChange={(event) => { setSelectedRepairId(event.target.value); setMessage(''); }}
              aria-label="Choose Library assignment for Repair Center"
              style={{ minWidth: 240, maxWidth: 'min(460px, 70vw)', minHeight: 42, padding: '7px 9px', border: '1px solid #bdc7d6', borderRadius: 8, background: '#fff' }}
            >
              {repairChoices.length === 0 && <option value="">No V5 Library assignments</option>}
              {repairChoices.map((assignment) => (
                <option key={assignment.id} value={assignment.id}>
                  {assignment.title || 'Untitled assignment'}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={openRepairCenter}
              disabled={!selectedAssignment}
              style={{ minHeight: 42, padding: '9px 15px', border: 0, borderRadius: 8, background: '#174ea6', color: '#fff', fontWeight: 900, cursor: selectedAssignment ? 'pointer' : 'default', opacity: selectedAssignment ? 1 : 0.55 }}
            >
              Repair Center
            </button>
          </div>
        </div>
        {message && <div role="status" style={{ marginTop: 9, color: '#3c4043', fontSize: 12 }}>{message}</div>}
      </section>

      <AssignmentLibraryBase {...props} />
    </>
  );
}