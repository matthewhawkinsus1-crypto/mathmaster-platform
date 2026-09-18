import { useEffect, useMemo, useState } from 'react';
import { assignmentGradeOverrideFor } from '../../platform/grading/canonicalGradeProjection.js';
import { overrideStudentAssignmentGrade } from '../../services/responseInspectorService.js';

const INTEGRITY_REASONS = [
  { code: 'cellPhoneUse', label: 'Prohibited cellphone use' },
  { code: 'academicDishonesty', label: 'Unauthorized assistance / cheating' },
  { code: 'accountSwitching', label: 'Account or laptop switching' },
];

const PARTICIPANT_ROLES = [
  { code: 'individual', label: 'Direct / individual conduct' },
  { code: 'received', label: 'Received assistance' },
  { code: 'supplied', label: 'Supplied assistance' },
];

export default function AssignmentGradeOverrideControls({ student, assignment, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [note, setNote] = useState('');
  const [scope, setScope] = useState('assignment');
  const [sectionRole, setSectionRole] = useState('classwork');
  const [reasonCode, setReasonCode] = useState('cellPhoneUse');
  const [participantRole, setParticipantRole] = useState('individual');
  const [teacherConfirmed, setTeacherConfirmed] = useState(false);
  const [override, setOverride] = useState(() => assignmentGradeOverrideFor(student, assignment?.id));
  const sectionRoles = useMemo(() => [...new Set((assignment?.sections || []).map((section) => section?.role).filter(Boolean))], [assignment]);

  useEffect(() => {
    setOverride(assignmentGradeOverrideFor(student, assignment?.id));
  }, [student, assignment?.id]);

  useEffect(() => {
    if (sectionRoles.length && !sectionRoles.includes(sectionRole)) setSectionRole(sectionRoles[0]);
  }, [sectionRole, sectionRoles]);

  const act = async ({ action }) => {
    if (!teacherConfirmed) return setMessage('Confirm that you personally verified this incident.');
    setBusy(true);
    setMessage('');
    try {
      const academicIntegrityConsequence = {
        scope,
        sectionRole: scope === 'section' ? sectionRole : null,
        participantRole,
        incidentReason: reasonCode,
        teacherConfirmed,
      };
      const result = await overrideStudentAssignmentGrade({
        studentId: student?.id || student?.studentId,
        assignmentId: assignment?.id,
        action,
        reasonCode,
        note: note.trim(),
        academicIntegrityConsequence,
      });
      setOverride(result?.override || null);
      setNote('');
      setTeacherConfirmed(false);
      setMessage(action === 'issueZero' ? '0% integrity consequence recorded.' : 'Integrity consequence restored.');
      onChanged?.();
    } catch (error) {
      setMessage(error?.message || 'The assignment grade could not be changed.');
    } finally {
      setBusy(false);
    }
  };

  return <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: '#fff', border: '1px solid #dadce0' }}>
    <div style={{ fontSize: 12, fontWeight: 900 }}>Academic integrity consequence</div>
    {override && <div style={{ marginTop: 6, color: '#b3261e', fontWeight: 800 }}>Teacher assignment override · {override.score}%</div>}
    <label>Scope <select value={scope} onChange={(event) => setScope(event.target.value)}><option value="assignment">Whole assignment</option><option value="section">This section</option></select></label>
    {scope === 'section' && <label> Affected section <select value={sectionRole} onChange={(event) => setSectionRole(event.target.value)}>{sectionRoles.map((role) => <option key={role} value={role}>{role}</option>)}</select></label>}
    <label style={{ display: 'block', marginTop: 8 }}>Incident <select value={reasonCode} onChange={(event) => setReasonCode(event.target.value)}>{INTEGRITY_REASONS.map((reason) => <option key={reason.code} value={reason.code}>{reason.label}</option>)}</select></label>
    <label style={{ display: 'block', marginTop: 8 }}>Participant role <select value={participantRole} onChange={(event) => setParticipantRole(event.target.value)}>{PARTICIPANT_ROLES.map((role) => <option key={role.code} value={role.code}>{role.label}</option>)}</select></label>
    <label style={{ display: 'block', marginTop: 8 }}><input type="checkbox" checked={teacherConfirmed} onChange={(event) => setTeacherConfirmed(event.target.checked)} /> I personally confirm this incident</label>
    <label style={{ display: 'block', marginTop: 8, fontSize: 12 }}>Optional note<input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} style={{ display: 'block', width: '100%', marginTop: 4 }} /></label>
    <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
      <button type="button" disabled={busy || !teacherConfirmed} onClick={() => act({ action: 'issueZero' })}>Apply 0% Integrity Consequence</button>
      <button type="button" disabled={busy || !teacherConfirmed} onClick={() => act({ action: scope === 'section' ? 'restoreSectionZero' : 'restoreAutomatic' })}>Restore {scope === 'section' ? 'section' : 'assignment'}</button>
    </div>
    {message && <div role="status" style={{ marginTop: 6, fontSize: 12 }}>{message}</div>}
  </div>;
}
