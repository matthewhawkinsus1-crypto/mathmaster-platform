import { gradeValueWithUnit } from './unitEquivalence.js';
import { isAlgebraicallyEquivalent } from './equivalence.js';

export const gradeResponseField = (field = {}, studentInput) => {
  const expectsUnit = Boolean(field.expectedUnit || field.unit || field.inputProfile === 'unit');
  const hasSubmittedUnit = Boolean(
    studentInput
    && typeof studentInput === 'object'
    && !Array.isArray(studentInput)
    && Object.prototype.hasOwnProperty.call(studentInput, 'unit'),
  );
  if (expectsUnit || hasSubmittedUnit) {
    const inputObject = studentInput && typeof studentInput === 'object' && !Array.isArray(studentInput)
      ? studentInput
      : null;
    return gradeValueWithUnit({
      studentValue: inputObject ? inputObject.value : studentInput,
      studentUnit: inputObject ? inputObject.unit : '',
      expectedValue: field.expected,
      expectedUnit: field.expectedUnit ?? field.unit ?? '',
      numericTolerance: field.numericTolerance,
      relativeTolerance: field.relativeTolerance,
    });
  }

  const accepted = Array.isArray(field.accepted) && field.accepted.length
    ? field.accepted
    : [field.expected];
  const isCorrect = accepted.some((expected) => isAlgebraicallyEquivalent(String(studentInput ?? ''), String(expected ?? '')));
  return { isCorrect, isNumericCorrect: isCorrect, isUnitCorrect: true };
};
