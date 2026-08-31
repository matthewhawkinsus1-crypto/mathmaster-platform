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
  return clean(
    student.displayName
    || student.name
    || student.googleName
    || student.profile?.displayName
    || student.profile?.name
    || student.profile?.googleName
    || student.id
    || 'Student'
  );
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
  [student.displayName, student.name, student.googleName, student.profile?.displayName, student.profile?.googleName]
    .filter(Boolean)
    .forEach((value) => labels.add(normalizePersonName(value)));
  return [...labels].filter(Boolean);
};

export const parseRosterIdentityText = (value = '') => {
  const rows = [];
  const rejected = [];

  String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line, index) => {
      const emailMatch = line.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
      const email = emailMatch ? normalizeEmail(emailMatch[0]) : '';

      // Teachers most commonly paste spreadsheet rows. Tabs, commas, semicolons,
      // and pipes are all accepted so an exported SIS row does not need to be
      // rewritten by hand.
      const parts = line
        .split(/\t|,|;|\|/)
        .map((part) => clean(part))
        .filter(Boolean);

      // Student IDs may be numeric or alphanumeric, but they should contain at
      // least one digit. Avoid treating an ordinary student name as an ID.
      const idLike = (text) => /^[A-Za-z0-9._-]{3,32}$/.test(clean(text))
        && /\d/.test(clean(text))
        && !/@/.test(clean(text));

      let studentId = '';
      let nameParts = [];

      if (parts.length >= 2) {
        const firstId = idLike(parts[0]) ? parts[0] : '';
        const lastId = idLike(parts.at(-1)) ? parts.at(-1) : '';
        if (firstId) {
          studentId = firstId;
          nameParts = parts.slice(1);
        } else if (lastId) {
          studentId = lastId;
          nameParts = parts.slice(0, -1);
        }
      }

      if (!studentId) {
        // Also accept a simple whitespace row such as:
        // 123456 Jane Doe jane.doe@district.org
        const tokens = line.split(/\s+/).filter(Boolean);
        const idIndex = tokens.findIndex((token) => idLike(token));
        if (idIndex >= 0) {
          studentId = tokens[idIndex];
          nameParts = tokens.filter((_, tokenIndex) => tokenIndex !== idIndex);
        }
      }

      const name = nameParts
        .filter((part) => !/@/.test(part))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (!studentId) {
        rejected.push({ lineNumber: index + 1, line });
        return;
      }

      rows.push({
        studentId: clean(studentId),
        name,
        email,
        lineNumber: index + 1,
      });
    });

  return { rows, rejected };
};

export const applyRosterIdentityRows = (students = [], identityRows = []) => {
  const byId = new Map(
    (Array.isArray(identityRows) ? identityRows : [])
      .map((row) => [clean(row?.studentId), row])
      .filter(([studentId]) => Boolean(studentId)),
  );

  return (Array.isArray(students) ? students : []).map((student) => {
    const row = byId.get(clean(student?.id));
    if (!row) return student;
    return {
      ...student,
      // A teacher-supplied identity bridge is explicitly for resolving an
      // ID-only or incorrectly-linked roster, so it takes precedence for this
      // temporary matching view. It does not persist anything by itself.
      displayName: row.name || student.displayName || student.googleName || undefined,
      schoolEmail: row.email || student.schoolEmail || student.googleEmail || undefined,
      identityBridge: {
        source: 'teacher-paste',
        name: row.name || '',
        email: row.email || '',
      },
    };
  });
};

export const studentsForClass = (students = [], classRecord = null, classes = []) => {
  if (!classRecord) return students;
  const classId = clean(classRecord.classId || classRecord.id);
  const period = clean(classRecord.period || classRecord.classPeriod);
  const activeSamePeriod = (Array.isArray(classes) ? classes : [])
    .filter((entry) => entry?.status !== 'archived' && clean(entry.period || entry.classPeriod) === period);
  const periodIsAmbiguous = Boolean(period) && activeSamePeriod.length > 1;
  return students.filter((student) => {
    const studentClassId = clean(student.classId || student.profile?.classId);
    if (classId && studentClassId) return studentClassId === classId;
    // A legacy period can place an unmigrated student only when it identifies
    // one real class. Otherwise the student must be assigned a classId rather
    // than appearing in two Google Classroom rosters.
    if (periodIsAmbiguous) return false;
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
