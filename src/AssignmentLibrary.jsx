import { useMemo, useState } from 'react';
import AssignmentLibraryBase from './AssignmentLibraryBase.jsx';

const clean = (value) => String(value ?? '').trim();

/**
 * Library wrapper that makes Repair Center a first-class Library action.
 *
 * The Library does not decide whether an assignment is "safe to edit directly."
 * A lesson can look unassigned today and still have historical student records.
 * Every launch therefore routes to the normal Assignments workspace, where App
 * already calculates authoritative live protection from assignment state plus
 * student grade history before opening AssignmentQuestionEditor.
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
  const [selectedRepairId, setSelectedRepairId] = useState('');
  const [message, setMessage] = useState('');

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
