import { useMemo, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import AssignmentLibraryBase from './AssignmentLibraryBase.jsx';
import AssignmentQuestionEditor from './AssignmentQuestionEditor.jsx';
import { db } from './firebase.js';
import {
  canonicalV5PersistencePatch,
  storedAssignmentToV5,
} from './platform/contract/storedAssignmentV5.js';
import { buildAssignmentV5PreflightModel } from './platform/preflight/assignmentV5PreflightModel.js';

const clean = (value) => String(value ?? '').trim();
const isUnassignedLibraryItem = (assignment) => (
  (!Array.isArray(assignment?.assignedClassIds) || assignment.assignedClassIds.filter(Boolean).length === 0)
  && (!Array.isArray(assignment?.assignedClassPeriods) || assignment.assignedClassPeriods.filter(Boolean).length === 0)
);

const revisionOf = (assignment) => {
  const revision = Number(assignment?.assignmentRevision);
  return Number.isFinite(revision) && revision >= 1 ? revision : 1;
};

/**
 * Library wrapper that makes Repair Center a first-class Library action.
 *
 * Unassigned reusable lessons can be repaired directly here because they have
 * no student history. Assigned/live lessons are intentionally routed back to
 * the Assignments workspace, whose existing save transaction protects attempts,
 * grades, evidence, and Google Classroom reconciliation.
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
  const firstUnassignedId = repairChoices.find(isUnassignedLibraryItem)?.id || repairChoices[0]?.id || '';
  const [selectedRepairId, setSelectedRepairId] = useState('');
  const [repairAssignment, setRepairAssignment] = useState(null);
  const [message, setMessage] = useState('');

  const effectiveRepairId = selectedRepairId || firstUnassignedId;
  const selectedAssignment = repairChoices.find((assignment) => assignment.id === effectiveRepairId) || null;
  const selectedIsUnassigned = Boolean(selectedAssignment && isUnassignedLibraryItem(selectedAssignment));

  const openRepairCenter = () => {
    if (!selectedAssignment) {
      setMessage('There are no Assignment V5 lessons available in this Library view yet.');
      return;
    }
    if (!selectedIsUnassigned) {
      setMessage('This lesson is already assigned or has live delivery context. MathMaster is opening Assignments so the live-student repair protections stay active. Open its “Repair Center / Edit Questions” action there.');
      onNavigateToAssignments?.({
        folder: selectedAssignment.folder || '',
        smartView: '',
        search: selectedAssignment.title || '',
        assignmentId: selectedAssignment.id,
      });
      return;
    }
    setMessage('');
    setRepairAssignment(selectedAssignment);
  };

  const saveLibraryRepair = async ({ title, questions }) => {
    if (!repairAssignment?.id) throw new Error('MathMaster lost the Library assignment being repaired. Close Repair Center and reopen it.');
    if (!isUnassignedLibraryItem(repairAssignment)) {
      throw new Error('This assignment is no longer an untouched Library template. Open it from Assignments so MathMaster can protect live student records.');
    }

    const candidateV5 = storedAssignmentToV5(repairAssignment, {
      titleOverride: clean(title) || repairAssignment.title,
      questions,
    });
    const model = buildAssignmentV5PreflightModel(candidateV5);
    if (!model.isValid) {
      throw new Error(`MathMaster refused to save this Library repair:\n${model.errors.join('\n')}`);
    }

    const nowIso = new Date().toISOString();
    await updateDoc(doc(db, 'assignments', repairAssignment.id), {
      ...canonicalV5PersistencePatch(model.assignmentV5),
      assignmentRevision: revisionOf(repairAssignment) + 1,
      updatedAt: nowIso,
    });
    setMessage('Library repairs saved. Teacher flags remain open until you verify the corrected questions in View as Student.');
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
              Open a saved Library lesson, copy all teacher flags into one AI Fix Package, then upload one repair JSON.
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
                  {assignment.title || 'Untitled assignment'}{isUnassignedLibraryItem(assignment) ? ' · Library' : ' · Assigned/live'}
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
        {selectedAssignment && !selectedIsUnassigned && (
          <div style={{ marginTop: 8, color: '#7a4f00', fontSize: 11.5 }}>
            This lesson has assignment/live context. Repair Center will route it through the protected Assignments workflow instead of editing student-facing data directly from Library.
          </div>
        )}
        {message && <div role="status" style={{ marginTop: 9, color: '#3c4043', fontSize: 12 }}>{message}</div>}
      </section>

      <AssignmentLibraryBase {...props} />

      {repairAssignment && (
        <AssignmentQuestionEditor
          assignment={repairAssignment}
          hasLiveProtection={false}
          onSave={saveLibraryRepair}
          onClose={() => setRepairAssignment(null)}
        />
      )}
    </>
  );
}
