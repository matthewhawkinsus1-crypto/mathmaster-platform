import { getFunctions, httpsCallable } from 'firebase/functions';

export interface IntegrityConsequencePayload {
  scope: 'assignment' | 'section';
  sectionRole?: string | null;
  incidentReason:
    | 'prohibited_cellphone'
    | 'unauthorized_assistance'
    | 'device_account_switch'
    | 'receiving_unauthorized_assistance'
    | 'supplying_unauthorized_assistance';
  participantRole: 'receiver' | 'supplier' | 'individual';
  teacherConfirmed: boolean;
}

export async function submitGradeOverride(
  assignmentId: string,
  studentId: string,
  score: number,
  integrityPayload?: IntegrityConsequencePayload
) {
  const functions = getFunctions();
  const overrideCallable = httpsCallable(functions, 'overrideStudentAssignmentGrade');

  const requestBody: Record<string, any> = {
    assignmentId,
    studentId,
    score
  };

  if (integrityPayload) {
    requestBody.academicIntegrityConsequence = {
      scope: integrityPayload.scope,
      sectionRole: integrityPayload.sectionRole || null,
      incidentReason: integrityPayload.incidentReason,
      participantRole: integrityPayload.participantRole,
      teacherConfirmed: Boolean(integrityPayload.teacherConfirmed)
    };
  }

  const response = await overrideCallable(requestBody);
  return response.data;
}
