/*
 * The assignment the Question Family special-case journeys run against —
 * shared by the browser harness (questionFamilyCasesMain.jsx) and the node
 * runner (questionFamilyCases.mjs), so the server re-grade in node rebuilds
 * exactly the assignment, seats and slots the browser rendered.
 *
 * Every slot is a real family reference an assignment would author; the
 * students are seated by the real allocator (planSeatAdditions).
 */
import { planSeatAdditions } from '../../functions/shared/questionGenerationIdentity.mjs';

export const CASES_ASSIGNMENT_ID = 'qf-cases-journeys';
export const CASES_CLASS_ID = 'qf-cases-class';
export const CASES_STUDENTS = Object.freeze(
  Array.from({ length: 30 }, (_, index) => `qf-student-${String(index + 1).padStart(2, '0')}`),
);

const equation = (id, constraints, extra = {}) => ({
  questionId: id,
  type: 'stepAlgebra',
  prompt: '',
  activityRole: 'classwork',
  questionFamily: { id: 'linear.multiStepEquation', version: 2, constraints },
  ...extra,
});

const twoStep = (id, constraints) => ({
  questionId: id,
  type: 'stepAlgebra',
  prompt: '',
  activityRole: 'classwork',
  questionFamily: { id: 'linear.twoStepEquation', version: 2, constraints },
});

const system = (id, constraints, extra = {}) => ({
  questionId: id,
  type: 'systemsWorkspace',
  prompt: '',
  activityRole: 'classwork',
  questionFamily: { id: 'systems.algebraic2x2', version: 1, constraints },
  ...extra,
});

export const CASES_SLOTS = Object.freeze({
  // Step Algebra
  'eq-one': equation('eq-one', { solutionCase: 'one' }),
  'eq-one-distribute': equation('eq-one-distribute', { solutionCase: 'one', distribute: true }),
  'eq-none': equation('eq-none', { solutionCase: 'none' }),
  'eq-infinite': equation('eq-infinite', { solutionCase: 'infinite' }),
  'eq-none-distribute': equation('eq-none-distribute', { solutionCase: 'none', distribute: true }),
  'eq-infinite-distribute': equation('eq-infinite-distribute', { solutionCase: 'infinite', distribute: true }),
  'eq-mixed': equation('eq-mixed', { solutionCase: 'mixed', distribute: 'mixed' }),
  'eq-fraction-solution': equation('eq-fraction-solution', { solutionCase: 'one', solutionForm: 'fraction' }),
  'eq-mixed-fraction-coefficient': equation('eq-mixed-fraction-coefficient', { solutionCase: 'mixed', coefficientForm: 'fraction' }),
  'two-step-fraction-coefficient': twoStep('two-step-fraction-coefficient', { distribute: true, coefficientForm: 'fraction' }),
  // Systems Workspace (algebraic)
  'sys-one': system('sys-one', { solutionCase: 'one' }),
  'sys-one-substitution': system('sys-one-substitution', { solutionCase: 'one' }, { method: 'substitution' }),
  'sys-one-elimination': system('sys-one-elimination', { solutionCase: 'one' }, { method: 'elimination' }),
  'sys-none': system('sys-none', { solutionCase: 'none' }, { method: 'elimination' }),
  'sys-infinite': system('sys-infinite', { solutionCase: 'infinite' }, { method: 'elimination' }),
  'sys-none-substitution': system('sys-none-substitution', { solutionCase: 'none' }, { method: 'substitution' }),
  'sys-infinite-substitution': system('sys-infinite-substitution', { solutionCase: 'infinite' }, { method: 'substitution' }),
  'sys-fraction': system('sys-fraction', { solutionCase: 'one', solutionForm: 'fraction' }, { method: 'elimination' }),
  'sys-fraction-substitution': system('sys-fraction-substitution', { solutionCase: 'one', solutionForm: 'fraction' }, { method: 'substitution' }),
  'sys-mixed': system('sys-mixed', { solutionCase: 'mixed' }),
});

export const CASES_SLOT_IDS = Object.freeze(Object.keys(CASES_SLOTS));

/** The assignment as stored: one section, every slot, 30 students seated in one class. */
export const casesAssignment = () => {
  const questions = CASES_SLOT_IDS.map((id) => CASES_SLOTS[id]);
  const assignment = {
    id: CASES_ASSIGNMENT_ID,
    schemaVersion: 5,
    assignedClassIds: [CASES_CLASS_ID],
    sections: [{ id: 'classwork', role: 'classwork', title: 'Classwork', questions }],
  };
  assignment.generationSeats = {
    version: 1,
    byClassId: { [CASES_CLASS_ID]: planSeatAdditions({ assignment, classId: CASES_CLASS_ID, studentIds: CASES_STUDENTS }) },
  };
  return assignment;
};

export const slotStorageIndex = (slotId) => CASES_SLOT_IDS.indexOf(slotId);
