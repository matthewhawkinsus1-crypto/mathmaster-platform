import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AcademicIntegrityConsequenceDialog } from '../../src/components/grading/AcademicIntegrityConsequenceDialog';
import * as client from '../../src/services/gradeOverrideClient';

jest.mock('../../src/services/gradeOverrideClient');

describe('AcademicIntegrityConsequenceDialog Submission Payload Contract (Codex P1)', () => {
  const mockSubmit = jest.spyOn(client, 'submitGradeOverride').mockResolvedValue({ success: true });

  const props = {
    assignmentId: 'asg_456',
    studentId: 'stu_789',
    availableSections: [
      { id: 'sec_warmup', name: 'Warm-up' },
      { id: 'sec_dol', name: 'DOL Exit Ticket' }
    ],
    onClose: jest.fn(),
    onSuccess: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('P1: real submission payload includes sectionRole, participantRole, and teacherConfirmed', async () => {
    render(<AcademicIntegrityConsequenceDialog {...props} />);

    fireEvent.change(screen.getByTestId('scope-select'), { target: { value: 'section' } });
    fireEvent.change(screen.getByTestId('section-select'), { target: { value: 'sec_dol' } });

    fireEvent.change(screen.getByTestId('reason-select'), {
      target: { value: 'receiving_unauthorized_assistance' }
    });
    fireEvent.change(screen.getByTestId('participant-select'), {
      target: { value: 'receiver' }
    });

    fireEvent.click(screen.getByTestId('confirm-checkbox'));
    fireEvent.click(screen.getByTestId('submit-consequence-btn'));

    await waitFor(() => {
      expect(mockSubmit).toHaveBeenCalledTimes(1);
    });

    expect(mockSubmit).toHaveBeenCalledWith(
      'asg_456',
      'stu_789',
      0,
      expect.objectContaining({
        scope: 'section',
        sectionRole: 'sec_dol',
        participantRole: 'receiver',
        incidentReason: 'receiving_unauthorized_assistance',
        teacherConfirmed: true
      })
    );
  });
});
