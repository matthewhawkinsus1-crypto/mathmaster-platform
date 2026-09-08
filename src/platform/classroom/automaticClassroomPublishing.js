const clean = (value) => String(value || '').trim();

export const classroomPostingMode = (assignment = {}) => {
  const mode = clean(assignment?.classroomPackage?.resourcesPost?.postingMode);
  if (mode === 'attachToAssignment') return 'attachToAssignment';
  if (mode === 'none') return 'none';
  return 'separateMaterial';
};

export const shouldAutoPublishClassroomPackage = (assignment = {}) => {
  if (!assignment?.id) return false;
  const classIds = Array.isArray(assignment.assignedClassIds) ? assignment.assignedClassIds : [];
  const classPeriods = Array.isArray(assignment.assignedClassPeriods) ? assignment.assignedClassPeriods : [];
  if (!classIds.length && !classPeriods.length) return false;
  const classroom = assignment.classroomPackage;
  if (!classroom || classroom.enabled === false) return false;
  const publishMode = clean(classroom?.assignmentPost?.publishMode || 'whenAssigned').toLowerCase();
  return publishMode === 'whenassigned';
};

export const mappedCourseIdsForAssignment = (assignment = {}, mappings = []) => {
  const classIds = new Set((assignment.assignedClassIds || []).map(clean).filter(Boolean));
  const periods = new Set((assignment.assignedClassPeriods || []).map(clean).filter(Boolean));
  if (!classIds.size && !periods.size) return [];
  return [...new Set(
    (Array.isArray(mappings) ? mappings : [])
      .filter((mapping) => (
        classIds.size
          ? classIds.has(clean(mapping?.classId))
          : periods.has(clean(mapping?.classPeriod))
      ))
      .map((mapping) => clean(mapping?.courseId))
      .filter(Boolean),
  )];
};
