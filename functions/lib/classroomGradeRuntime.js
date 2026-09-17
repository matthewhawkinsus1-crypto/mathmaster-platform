function reconcileAssignmentGrades(submissionData, assignmentSchema) {
  const {
    gradeOverride,
    academicIntegrityZero,
    sectionOverrides = {},
    sectionIntegrityConsequences = {},
    rawSectionScores = {}
  } = submissionData;

  if (academicIntegrityZero === true || gradeOverride === 0) {
    return {
      finalGrade: 0,
      isZeroDueToIntegrity: true,
      sectionGrades: Object.keys((assignmentSchema && assignmentSchema.sections) || {}).reduce((acc, sec) => {
        acc[sec] = 0;
        return acc;
      }, {})
    };
  }

  const sections = (assignmentSchema && assignmentSchema.sections) || {};
  const computedSectionGrades = {};
  let totalWeightedScore = 0;
  let totalWeight = 0;

  for (const [sectionKey, sectionMeta] of Object.entries(sections)) {
    const weight = sectionMeta.weight ?? 1;
    totalWeight += weight;

    if (sectionIntegrityConsequences[sectionKey]) {
      computedSectionGrades[sectionKey] = 0;
    } else if (sectionOverrides[sectionKey] !== undefined) {
      computedSectionGrades[sectionKey] = sectionOverrides[sectionKey];
    } else {
      computedSectionGrades[sectionKey] = rawSectionScores[sectionKey] ?? 0;
    }

    totalWeightedScore += computedSectionGrades[sectionKey] * weight;
  }

  const compositeGrade = totalWeight > 0 ? Math.round(totalWeightedScore / totalWeight) : 0;
  const effectiveFinalGrade = gradeOverride !== null && gradeOverride !== undefined
    ? gradeOverride
    : compositeGrade;

  return {
    finalGrade: effectiveFinalGrade,
    compositeGrade,
    sectionGrades: computedSectionGrades,
    isZeroDueToIntegrity: false
  };
}

module.exports = {
  reconcileAssignmentGrades
};
