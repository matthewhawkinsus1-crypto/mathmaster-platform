import React, { useState } from 'react';
import { submitGradeOverride } from '../../services/gradeOverrideClient';

interface DialogProps {
  assignmentId: string;
  studentId: string;
  availableSections: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSuccess: () => void;
}

export const AcademicIntegrityConsequenceDialog: React.FC<DialogProps> = ({
  assignmentId,
  studentId,
  availableSections,
  onClose,
  onSuccess
}) => {
  const [scope, setScope] = useState<'assignment' | 'section'>('assignment');
  const [sectionRole, setSectionRole] = useState<string>(availableSections[0]?.id || '');
  const [incidentReason, setIncidentReason] = useState<any>('prohibited_cellphone');
  const [participantRole, setParticipantRole] = useState<any>('individual');
  const [teacherConfirmed, setTeacherConfirmed] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherConfirmed) {
      setError('Teacher confirmation is mandatory.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await submitGradeOverride(assignmentId, studentId, 0, {
        scope,
        sectionRole: scope === 'section' ? sectionRole : null,
        incidentReason,
        participantRole,
        teacherConfirmed
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to submit consequence');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" className="integrity-dialog">
      <h2>Confirm Academic Integrity Consequence</h2>
      {error && <div role="alert" className="error-banner">{error}</div>}
      <form onSubmit={handleSubmit}>
        <label>
          Scope:
          <select
            data-testid="scope-select"
            value={scope}
            onChange={(e) => setScope(e.target.value as any)}
          >
            <option value="assignment">Entire Assignment (0%)</option>
            <option value="section">Specific Section (0%)</option>
          </select>
        </label>

        {scope === 'section' && (
          <label>
            Section:
            <select
              data-testid="section-select"
              value={sectionRole}
              onChange={(e) => setSectionRole(e.target.value)}
            >
              {availableSections.map((sec) => (
                <option key={sec.id} value={sec.id}>
                  {sec.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label>
          Incident Category:
          <select
            data-testid="reason-select"
            value={incidentReason}
            onChange={(e) => setIncidentReason(e.target.value as any)}
          >
            <option value="prohibited_cellphone">Prohibited Cellphone Use</option>
            <option value="unauthorized_assistance">Unauthorized Assistance / Cheating</option>
            <option value="device_account_switch">Account or Laptop Switching</option>
            <option value="receiving_unauthorized_assistance">Student Receiving Assistance</option>
            <option value="supplying_unauthorized_assistance">Student Supplying Assistance</option>
          </select>
        </label>

        <label>
          Participant Role:
          <select
            data-testid="participant-select"
            value={participantRole}
            onChange={(e) => setParticipantRole(e.target.value as any)}
          >
            <option value="individual">Individual / Solo</option>
            <option value="receiver">Direct Recipient</option>
            <option value="supplier">Supplier to Other Student</option>
          </select>
        </label>

        <label className="checkbox-row">
          <input
            type="checkbox"
            data-testid="confirm-checkbox"
            checked={teacherConfirmed}
            onChange={(e) => setTeacherConfirmed(e.target.checked)}
          />
          I confirm that I have reviewed the incident and authorize this academic consequence.
        </label>

        <div className="button-row">
          <button type="button" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            type="submit"
            data-testid="submit-consequence-btn"
            disabled={!teacherConfirmed || loading}
          >
            Apply Consequence
          </button>
        </div>
      </form>
    </div>
  );
};
