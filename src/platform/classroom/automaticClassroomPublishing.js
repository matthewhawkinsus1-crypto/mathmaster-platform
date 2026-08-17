const clean = (value) => String(value || '').trim();

export const classroomPostingMode = (assignment = {}) => {
  const mode = clean(assignment?.classroomPackage?.resourcesPost?.postingMode);
  if (mode === 'attachToAssignment') return 'attachToAssignment';
  if (mode === 'none') return 'none';
  return 'separateMaterial';
};

export const shouldAutoPublishClassroomPackage = (assignment = {}) => {
  if (!assignment?.id) return false;
  if (!Array.isArray(assignment.assignedClassPeriods) || !assignment.assignedClassPeriods.length) {
    return false;
  }
  const classroom = assignment.classroomPackage;
  if (!classroom || classroom.enabled === false) return false;
  const publishMode = clean(classroom?.assignmentPost?.publishMode || 'whenAssigned').toLowerCase();
  return publishMode === 'whenassigned';
};

export const mappedCourseIdsForAssignment = (assignment = {}, mappings = []) => {
  const periods = new Set((assignment.assignedClassPeriods || []).map(clean).filter(Boolean));
  if (!periods.size) return [];
  return [...new Set(
    (Array.isArray(mappings) ? mappings : [])
      .filter((mapping) => periods.has(clean(mapping?.classPeriod)))
      .map((mapping) => clean(mapping?.courseId))
      .filter(Boolean),
  )];
};
