const admin = require('firebase-admin');

const SUPPORTED_INCIDENT_REASONS = [
  'prohibited_cellphone',
  'unauthorized_assistance',
  'device_account_switch',
  'receiving_unauthorized_assistance',
  'supplying_unauthorized_assistance'
];

const SUPPORTED_PARTICIPANT_ROLES = [
  'receiver',
  'supplier',
  'individual'
];

function validateIntegrityPayload(payload) {
  if (!payload) {
    throw new Error('MISSING_PAYLOAD: Integrity payload is required.');
  }

  if (payload.isSystemSignal || payload.triggerType === 'SYSTEM_SIGNAL') {
    throw new Error('SYSTEM_SIGNAL_CONSEQUENCE_PROHIBITED: System signals cannot issue academic consequences.');
  }

  if (payload.teacherConfirmed !== true) {
    throw new Error('TEACHER_CONFIRMATION_REQUIRED: Missing or false teacherConfirmed.');
  }

  if (!SUPPORTED_INCIDENT_REASONS.includes(payload.incidentReason)) {
    throw new Error(`INVALID_INCIDENT_REASON: Reason '${payload.incidentReason}' is not supported.`);
  }

  if (!SUPPORTED_PARTICIPANT_ROLES.includes(payload.participantRole)) {
    throw new Error(`INVALID_PARTICIPANT_ROLE: Role '${payload.participantRole}' is not supported.`);
  }

  if (payload.scope === 'section' && (!payload.sectionRole || typeof payload.sectionRole !== 'string')) {
    throw new Error('INVALID_SECTION_ROLE: Section scope requires a valid section identifier.');
  }
}

async function applyAcademicIntegrityConsequence(transaction, {
  db,
  assignmentId,
  studentId,
  teacherUid,
  scope,
  sectionRole,
  incidentReason,
  participantRole,
  teacherConfirmed,
  isSystemSignal,
  triggerType
}) {
  validateIntegrityPayload({
    scope,
    sectionRole,
    incidentReason,
    participantRole,
    teacherConfirmed,
    isSystemSignal,
    triggerType
  });

  const submissionRef = db
    .collection('assignments')
    .doc(assignmentId)
    .collection('submissions')
    .doc(studentId);

  const submissionDoc = await transaction.get(submissionRef);
  if (!submissionDoc.exists) {
    throw new Error('SUBMISSION_NOT_FOUND: Student submission record does not exist.');
  }

  const data = submissionDoc.data() || {};
  const previousState = {
    gradeOverride: data.gradeOverride ?? null,
    academicIntegrityZero: data.academicIntegrityZero ?? false,
    sectionOverrides: data.sectionOverrides ? { ...data.sectionOverrides } : {},
    sectionIntegrityConsequences: data.sectionIntegrityConsequences ? { ...data.sectionIntegrityConsequences } : {},
    compositeGrade: data.compositeGrade ?? null
  };

  const timestamp = (admin.firestore && admin.firestore.FieldValue && admin.firestore.FieldValue.serverTimestamp)
    ? admin.firestore.FieldValue.serverTimestamp()
    : new Date();
  const consequenceId = db.collection('academicIntegrityAudits').doc().id;
  const parentTaskId = db.collection('teacherTodoItems').doc().id;

  const updates = {
    lastUpdated: timestamp
  };

  if (scope === 'assignment') {
    updates.gradeOverride = 0;
    updates.academicIntegrityZero = true;
    updates.academicIntegrityActive = true;
    updates.academicIntegrityConsequence = {
      consequenceId,
      scope: 'assignment',
      incidentReason,
      participantRole,
      appliedBy: teacherUid,
      appliedAt: timestamp,
      teacherConfirmed: true,
      priorState: {
        gradeOverride: previousState.gradeOverride
      }
    };
  } else if (scope === 'section') {
    const currentSectionOverrides = { ...(data.sectionOverrides || {}) };
    const currentSectionIntegrity = { ...(data.sectionIntegrityConsequences || {}) };

    const priorSectionOverride = currentSectionOverrides[sectionRole] ?? null;

    currentSectionOverrides[sectionRole] = 0;
    currentSectionIntegrity[sectionRole] = {
      consequenceId,
      scope: 'section',
      sectionRole,
      incidentReason,
      participantRole,
      appliedBy: teacherUid,
      appliedAt: timestamp,
      teacherConfirmed: true,
      priorSectionOverride
    };

    updates.sectionOverrides = currentSectionOverrides;
    updates.sectionIntegrityConsequences = currentSectionIntegrity;
  }

  transaction.update(submissionRef, updates);

  const auditRef = db.collection('academicIntegrityAudits').doc(consequenceId);
  transaction.set(auditRef, {
    consequenceId,
    assignmentId,
    studentId,
    teacherUid,
    scope,
    sectionRole: sectionRole || null,
    incidentReason,
    participantRole,
    teacherConfirmed: true,
    previousState,
    appliedAt: timestamp,
    action: 'CONSEQUENCE_APPLIED'
  });

  const parentTaskRef = db.collection('teacherTodoItems').doc(parentTaskId);
  transaction.set(parentTaskRef, {
    todoId: parentTaskId,
    type: 'PARENT_FOLLOW_UP',
    category: 'ACADEMIC_INTEGRITY',
    assignmentId,
    studentId,
    assignedTeacherUid: teacherUid,
    status: 'PENDING',
    priority: 'HIGH',
    consequenceId,
    incidentDetails: {
      scope,
      sectionRole: sectionRole || null,
      incidentReason,
      participantRole
    },
    createdAt: timestamp
  });

  return { consequenceId, parentTaskId };
}

async function revokeAcademicIntegrityConsequence(transaction, {
  db,
  assignmentId,
  studentId,
  teacherUid,
  scope,
  sectionRole
}) {
  const submissionRef = db
    .collection('assignments')
    .doc(assignmentId)
    .collection('submissions')
    .doc(studentId);

  const submissionDoc = await transaction.get(submissionRef);
  if (!submissionDoc.exists) {
    throw new Error('SUBMISSION_NOT_FOUND');
  }

  const data = submissionDoc.data() || {};
  const timestamp = (admin.firestore && admin.firestore.FieldValue && admin.firestore.FieldValue.serverTimestamp)
    ? admin.firestore.FieldValue.serverTimestamp()
    : new Date();
  const updates = { lastUpdated: timestamp };

  if (scope === 'assignment') {
    const prior = data.academicIntegrityConsequence?.priorState?.gradeOverride ?? null;
    updates.gradeOverride = prior;
    updates.academicIntegrityZero = false;
    updates.academicIntegrityActive = false;
    if (admin.firestore && admin.firestore.FieldValue && admin.firestore.FieldValue.delete) {
      updates.academicIntegrityConsequence = admin.firestore.FieldValue.delete();
    } else {
      delete updates.academicIntegrityConsequence;
    }
  } else if (scope === 'section') {
    const currentSectionOverrides = { ...(data.sectionOverrides || {}) };
    const currentSectionIntegrity = { ...(data.sectionIntegrityConsequences || {}) };

    const prior = currentSectionIntegrity[sectionRole]?.priorSectionOverride ?? null;
    if (prior !== null) {
      currentSectionOverrides[sectionRole] = prior;
    } else {
      delete currentSectionOverrides[sectionRole];
    }
    delete currentSectionIntegrity[sectionRole];

    updates.sectionOverrides = currentSectionOverrides;
    updates.sectionIntegrityConsequences = currentSectionIntegrity;
  }

  transaction.update(submissionRef, updates);

  const auditRef = db.collection('academicIntegrityAudits').doc();
  transaction.set(auditRef, {
    consequenceId: auditRef.id,
    assignmentId,
    studentId,
    teacherUid,
    scope,
    sectionRole: sectionRole || null,
    action: 'CONSEQUENCE_REVOKED',
    revokedAt: timestamp
  });
}

module.exports = {
  SUPPORTED_INCIDENT_REASONS,
  SUPPORTED_PARTICIPANT_ROLES,
  validateIntegrityPayload,
  applyAcademicIntegrityConsequence,
  revokeAcademicIntegrityConsequence
};
