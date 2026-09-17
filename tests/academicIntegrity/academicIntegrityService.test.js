const {
  applyAcademicIntegrityConsequence,
  revokeAcademicIntegrityConsequence
} = require('../../functions/lib/academicIntegrityService');
const {
  reconcileAssignmentGrades
} = require('../../functions/lib/classroomGradeRuntime');

describe('Academic Integrity Service & Persistence Invariants (Codex P1 & P2)', () => {
  let mockDb;
  let mockTransaction;
  let submissionStore;
  let auditStore;
  let todoStore;

  beforeEach(() => {
    submissionStore = {
      'sub_1': {
        gradeOverride: 88,
        sectionOverrides: { dol_section: 90 },
        rawSectionScores: { warmup: 100, dol_section: 90 },
        compositeGrade: 95
      }
    };
    auditStore = {};
    todoStore = {};

    mockTransaction = {
      get: jest.fn(async (ref) => {
        const id = ref._id;
        const exists = !!submissionStore[id];
        return {
          exists,
          data: () => submissionStore[id]
        };
      }),
      update: jest.fn((ref, updates) => {
        const id = ref._id;
        submissionStore[id] = { ...(submissionStore[id] || {}), ...updates };
      }),
      set: jest.fn((ref, data) => {
        if (ref._collection === 'academicIntegrityAudits') {
          auditStore[ref._id] = data;
        } else if (ref._collection === 'teacherTodoItems') {
          todoStore[ref._id] = data;
        }
      })
    };

    mockDb = {
      collection: (col) => ({
        doc: (id) => ({
          _collection: col,
          _id: id || `gen_${Math.random().toString(36).substring(7)}`
        })
      })
    };
  });

  test('P1: fails closed and rejects write when teacherConfirmed is false or missing', async () => {
    await expect(
      applyAcademicIntegrityConsequence(mockTransaction, {
        db: mockDb,
        assignmentId: 'asg_1',
        studentId: 'sub_1',
        teacherUid: 't_1',
        scope: 'section',
        sectionRole: 'dol_section',
        incidentReason: 'prohibited_cellphone',
        participantRole: 'individual',
        teacherConfirmed: false
      })
    ).rejects.toThrow('TEACHER_CONFIRMATION_REQUIRED');

    expect(mockTransaction.update).not.toHaveBeenCalled();
    expect(mockTransaction.set).not.toHaveBeenCalled();
    expect(Object.keys(auditStore).length).toBe(0);
    expect(Object.keys(todoStore).length).toBe(0);
  });

  test('P2: system signal with triggerType="SYSTEM_SIGNAL" writes no zero or consequence', async () => {
    await expect(
      applyAcademicIntegrityConsequence(mockTransaction, {
        db: mockDb,
        assignmentId: 'asg_1',
        studentId: 'sub_1',
        teacherUid: 'system',
        scope: 'assignment',
        incidentReason: 'device_account_switch',
        participantRole: 'individual',
        teacherConfirmed: true,
        triggerType: 'SYSTEM_SIGNAL'
      })
    ).rejects.toThrow('SYSTEM_SIGNAL_CONSEQUENCE_PROHIBITED');

    expect(submissionStore['sub_1'].gradeOverride).toBe(88);
    expect(Object.keys(auditStore).length).toBe(0);
    expect(Object.keys(todoStore).length).toBe(0);
  });

  test('P1: section-level consequence applies exact 0% write, audit trail, and Parent Follow-Up task', async () => {
    const { consequenceId, parentTaskId } = await applyAcademicIntegrityConsequence(mockTransaction, {
      db: mockDb,
      assignmentId: 'asg_1',
      studentId: 'sub_1',
      teacherUid: 'teacher_123',
      scope: 'section',
      sectionRole: 'dol_section',
      incidentReason: 'unauthorized_assistance',
      participantRole: 'receiver',
      teacherConfirmed: true
    });

    const sub = submissionStore['sub_1'];
    expect(sub.sectionOverrides['dol_section']).toBe(0);
    expect(sub.sectionIntegrityConsequences['dol_section'].consequenceId).toBe(consequenceId);
    expect(sub.sectionIntegrityConsequences['dol_section'].priorSectionOverride).toBe(90);

    expect(auditStore[consequenceId]).toBeDefined();
    expect(auditStore[consequenceId].incidentReason).toBe('unauthorized_assistance');
    expect(auditStore[consequenceId].participantRole).toBe('receiver');
    expect(auditStore[consequenceId].teacherConfirmed).toBe(true);

    expect(todoStore[parentTaskId]).toBeDefined();
    expect(todoStore[parentTaskId].type).toBe('PARENT_FOLLOW_UP');
    expect(todoStore[parentTaskId].status).toBe('PENDING');
    expect(todoStore[parentTaskId].incidentDetails.sectionRole).toBe('dol_section');
  });

  test('P1: section consequence persists across later student question attempts and projects 0% in DOL', () => {
    const schema = {
      sections: {
        warmup: { weight: 1 },
        dol_section: { weight: 3 }
      }
    };

    const studentSubmissionWithConsequence = {
      rawSectionScores: { warmup: 100, dol_section: 100 },
      sectionOverrides: { dol_section: 0 },
      sectionIntegrityConsequences: {
        dol_section: { teacherConfirmed: true }
      }
    };

    const projection = reconcileAssignmentGrades(studentSubmissionWithConsequence, schema);

    expect(projection.sectionGrades['dol_section']).toBe(0);
    expect(projection.sectionGrades['warmup']).toBe(100);
    expect(projection.finalGrade).toBe(25);
  });

  test('P1: revoking consequence restores prior teacher override rather than resetting to uncorrected state', async () => {
    await applyAcademicIntegrityConsequence(mockTransaction, {
      db: mockDb,
      assignmentId: 'asg_1',
      studentId: 'sub_1',
      teacherUid: 'teacher_123',
      scope: 'section',
      sectionRole: 'dol_section',
      incidentReason: 'supplying_unauthorized_assistance',
      participantRole: 'supplier',
      teacherConfirmed: true
    });

    expect(submissionStore['sub_1'].sectionOverrides['dol_section']).toBe(0);

    await revokeAcademicIntegrityConsequence(mockTransaction, {
      db: mockDb,
      assignmentId: 'asg_1',
      studentId: 'sub_1',
      teacherUid: 'teacher_123',
      scope: 'section',
      sectionRole: 'dol_section'
    });

    expect(submissionStore['sub_1'].sectionOverrides['dol_section']).toBe(90);
    expect(submissionStore['sub_1'].sectionIntegrityConsequences['dol_section']).toBeUndefined();
  });
});
