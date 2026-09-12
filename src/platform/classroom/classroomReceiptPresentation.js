/*
 * READING A GOOGLE CLASSROOM RECEIPT. NEVER COMPUTING ONE.
 *
 * The MathMaster tracker is the source of truth for a student's MathMaster
 * grade. A Classroom receipt is a record of what was last PUSHED to Classroom
 * and when — a checkpoint, a draft, a final. The two legitimately differ
 * between checkpoints, and the student-facing job is to explain that, not to
 * reconcile it and certainly not to recompute a second score.
 *
 * So everything below is derivation from fields the sync already wrote. There
 * is no arithmetic here beyond comparing two numbers for equality.
 *
 * Extracted so the Assignment Result screen and the student dashboard agree on
 * what "FINAL" versus "TEACHER DRAFT" means. Each screen still writes its own
 * sentences — they are speaking to a student in different situations — but the
 * decision about which situation it is happens once, here.
 */

const asNumber = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);

export const describeClassroomReceipt = ({ receipt = null, mathMasterGrade = null } = {}) => {
  if (!receipt) {
    return {
      present: false, label: null, grade: null, stage: '',
      isFinal: false, studentVisible: false, matchesMathMaster: false,
    };
  }

  const stage = String(receipt.stage || '');
  const isFinal = receipt.isFinal === true || stage.startsWith('final-');
  const studentVisible = receipt.studentVisible === true;
  const grade = asNumber(receipt.grade);
  const recorded = asNumber(mathMasterGrade);

  const label = isFinal
    ? 'FINAL'
    : stage === 'due-checkpoint'
      ? 'DUE-DATE CHECKPOINT'
      : stage === 'assessment-release'
        ? 'RELEASED'
        : studentVisible
          ? 'RELEASED UPDATE'
          : 'TEACHER DRAFT';

  return {
    present: true,
    label,
    stage,
    grade,
    isFinal,
    studentVisible,
    // Equality only. When these differ the screens say Classroom updates at the
    // next checkpoint; neither of them "fixes" the difference.
    matchesMathMaster: grade !== null && recorded !== null && grade === recorded,
  };
};

export default describeClassroomReceipt;
