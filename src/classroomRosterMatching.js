// Pure matching helpers for Google Classroom -> MathMaster roster linking.
// No Firestore or React imports so the same rules can be unit-tested.

const clean = (value) => String(value || '').trim();
const lower = (value) => clean(value).toLowerCase();

export const normalizeEmail = (value) => lower(value);

export const normalizePersonName = (value) => lower(value)
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ');

const studentEmails = (student = {}) => [
  student.email,
  student.schoolEmail,
  student.googleEmail,
  student.linkedEmail,
  student.linkedGoogleEmail,
  student.profile?.email,
  student.profile?.schoolEmail,
].map(normalizeEmail).filter(Boolean);

export const mathMasterStudentLabel = (student = {}) => {
  const first = clean(student.firstName || student.profile?.firstName);
  const last = clean(student.lastName || student.profile?.lastName);
  if (first || last) return [last, first].filter(Boolean).join(', ');
  return clean(student.displayName || student.name || student.id || 'Student');
};

const studentNameKeys = (student = {}) => {
  const labels = new Set();
  const first = clean(student.firstName || student.profile?.firstName);
  const last = clean(student.lastName || student.profile?.lastName);
  if (first || last) {
    labels.add(normalizePersonName(`${first} ${last}`));
    labels.add(normalizePersonName(`${last} ${first}`));
    labels.add(normalizePersonName(`${last}, ${first}`));
  }
  [student.displayName, student.name, student.profile?.displayName]
    .filter(Boolean)
    .forEach((value) => labels.add(normalizePersonName(value)));
  return [...labels].filter(Boolean);
};

export const studentsForClass = (students = [], classRecord = null) => {
  if (!classRecord) return students;
  const classId = clean(classRecord.classId || classRecord.id);
  const period = clean(classRecord.period || classRecord.classPeriod);
  return students.filter((student) => {
    const studentClassId = clean(student.classId || student.profile?.classId);
    if (classId && studentClassId) return studentClassId === classId;
    const studentPeriod = clean(student.classPeriod || student.period || student.profile?.classPeriod);
    return period && studentPeriod === period;
  });
};

export const buildRosterMatchPlan = ({ classroomStudents = [], mathMasterStudents = [] } = {}) => {
  const emailIndex = new Map();
  const nameIndex = new Map();

  mathMasterStudents.forEach((student) => {
    studentEmails(student).forEach((email) => {
      const list = emailIndex.get(email) || [];
      list.push(student);
      emailIndex.set(email, list);
    });
    studentNameKeys(student).forEach((name) => {
      const list = nameIndex.get(name) || [];
      list.push(student);
      nameIndex.set(name, list);
    });
  });

  return classroomStudents.map((classroomStudent) => {
    const email = normalizeEmail(classroomStudent.email);
    const googleName = normalizePersonName(classroomStudent.name);
    const emailMatches = email ? (emailIndex.get(email) || []) : [];
    if (emailMatches.length === 1) {
      return {
        classroomStudent,
        status: 'exact-email',
        confidence: 'exact',
        suggestedStudent: emailMatches[0],
        candidates: emailMatches,
      };
    }
    if (emailMatches.length > 1) {
      return {
        classroomStudent,
        status: 'ambiguous',
        confidence: 'review',
        suggestedStudent: null,
        candidates: emailMatches,
      };
    }

    const nameMatches = googleName ? (nameIndex.get(googleName) || []) : [];
    if (nameMatches.length === 1) {
      return {
        classroomStudent,
        status: 'exact-name',
        confidence: 'review',
        suggestedStudent: nameMatches[0],
        candidates: nameMatches,
      };
    }
    if (nameMatches.length > 1) {
      return {
        classroomStudent,
        status: 'ambiguous',
        confidence: 'review',
        suggestedStudent: null,
        candidates: nameMatches,
      };
    }
    return {
      classroomStudent,
      status: 'unmatched',
      confidence: 'none',
      suggestedStudent: null,
      candidates: [],
    };
  });
};

export const suggestClassroomTopic = (assignment = {}) => {
  const folder = clean(assignment.folder);
  if (!folder) return 'Assignments';
  const parts = folder.split('/').map(clean).filter(Boolean);
  if (parts.length <= 1) return parts[0] || 'Assignments';
  const withoutCourse = parts.slice(1);
  if (withoutCourse.length >= 2) return `${withoutCourse[0]} • ${withoutCourse[1]}`;
  return withoutCourse[0] || 'Assignments';
};

export const buildTopicPlan = (assignments = []) => {
  const map = new Map();
  assignments.forEach((assignment) => {
    const topic = suggestClassroomTopic(assignment);
    const entry = map.get(topic) || { topic, assignmentIds: [], count: 0 };
    entry.assignmentIds.push(String(assignment.id || ''));
    entry.count += 1;
    map.set(topic, entry);
  });
  return [...map.values()].sort((a, b) => a.topic.localeCompare(b.topic));
};
