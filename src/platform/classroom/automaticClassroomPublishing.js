const clean = (value) => String(value || '').trim();
const normalizeSectionKey = (value) => clean(value).toLowerCase();
const SPLIT_CLASSROOM_SECTION_KEYS = Object.freeze(['warmup', 'classwork', 'practice', 'dol']);

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

/**
 * Resolve the Classroom grade columns that should be created by the automatic
 * Assignment V5 publish path. V5 lesson assignments publish one post per
 * authored grading section; legacy assignments keep their established single
 * whole-assignment post.
 */
export const classroomSectionKeysForAssignment = (assignment = {}) => {
  if (Number(assignment?.schemaVersion) !== 5 || !Array.isArray(assignment?.sections)) {
    return ['whole'];
  }

  const present = new Set();
  for (const section of assignment.sections) {
    if (!section || typeof section !== 'object' || Array.isArray(section)) continue;
    const sectionRole = normalizeSectionKey(section.role || 'classwork');
    const questions = Array.isArray(section.questions) ? section.questions : [];

    if (!questions.length && SPLIT_CLASSROOM_SECTION_KEYS.includes(sectionRole)) {
      present.add(sectionRole);
      continue;
    }

    for (const question of questions) {
      if (!question || question.teacherExcluded === true) continue;
      const role = normalizeSectionKey(question.activityRole || sectionRole || 'classwork');
      if (SPLIT_CLASSROOM_SECTION_KEYS.includes(role)) present.add(role);
    }
  }

  const sectionKeys = SPLIT_CLASSROOM_SECTION_KEYS.filter((key) => present.has(key));
  return sectionKeys.length ? sectionKeys : ['whole'];
};
