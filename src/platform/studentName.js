const cleanName = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');

const asStudentRecord = (student) => (
  student && typeof student === 'object' && !Array.isArray(student) ? student : {}
);

export const splitLegacyDisplayName = (displayName = '') => {
  const parts = cleanName(displayName).split(' ').filter(Boolean);
  if (!parts.length) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts.at(-1) };
};

export const studentNameParts = (student = {}) => {
  const record = asStudentRecord(student);
  const firstName = cleanName(record.firstName);
  const lastName = cleanName(record.lastName);
  if (firstName || lastName) return { firstName, lastName };
  return splitLegacyDisplayName(
    record.displayName
      || record.name
      || record.studentName
      || record.googleName
      || record.profile?.displayName
      || record.profile?.name
      || record.profile?.googleName
      || '',
  );
};

export const formatStudentName = (student = {}, { lastFirst = true, fallbackToId = false, fallbackToNeutral = true } = {}) => {
  const record = asStudentRecord(student);
  const { firstName, lastName } = studentNameParts(record);
  if (lastFirst && lastName) return firstName ? `${lastName}, ${firstName}` : lastName;
  const natural = [firstName, lastName].filter(Boolean).join(' ');
  if (natural) return natural;
  const displayName = cleanName(
    record.displayName
      || record.name
      || record.studentName
      || record.googleName
      || record.profile?.displayName
      || record.profile?.name
      || record.profile?.googleName,
  );
  if (displayName) return displayName;
  if (fallbackToId) return String(record.studentId || record.id || 'Student');
  if (!fallbackToNeutral) return '';
  return 'Student';
};

export const resolveStudentDisplayName = ({ rosterStudent = {}, sessionDisplayName = '' } = {}) => {
  const rosterName = formatStudentName(rosterStudent, {
    lastFirst: false,
    fallbackToId: false,
    fallbackToNeutral: false,
  });
  return rosterName || cleanName(sessionDisplayName) || 'Student';
};

export const resolveRosterStudentName = ({ studentId = null, students = [], historicalName = '' } = {}) => {
  const id = String(studentId || '').trim();
  const rosterStudent = (Array.isArray(students) ? students : []).find((student) => (
    String(student?.id || student?.studentId || '').trim() === id
  ));
  if (rosterStudent) return formatStudentName(rosterStudent, { lastFirst: false });
  const historical = cleanName(historicalName);
  if (!historical || historical === id) return 'Student';
  const storedName = formatStudentName({ displayName: historical }, { lastFirst: false });
  return storedName === 'Student' ? 'Student' : storedName;
};

export const compareStudentsByName = (a = {}, b = {}) => {
  const aRecord = asStudentRecord(a);
  const bRecord = asStudentRecord(b);
  const aName = studentNameParts(aRecord);
  const bName = studentNameParts(bRecord);
  const options = { sensitivity: 'base', numeric: true };
  const last = aName.lastName.localeCompare(bName.lastName, undefined, options);
  if (last) return last;
  const first = aName.firstName.localeCompare(bName.firstName, undefined, options);
  if (first) return first;
  return String(aRecord.studentId || aRecord.id || '').localeCompare(
    String(bRecord.studentId || bRecord.id || ''), undefined, options,
  );
};

export const studentSearchText = (student = {}) => {
  const record = asStudentRecord(student);
  const { firstName, lastName } = studentNameParts(record);
  return [
    record.studentId,
    record.id,
    firstName,
    lastName,
    record.displayName,
    record.name,
    record.studentName,
    record.googleName,
    record.profile?.displayName,
    record.profile?.name,
    record.profile?.googleName,
    record.classPeriod,
    record.assignedTeacherEmail,
    record.linkedEmail,
  ].filter(Boolean).join(' ').toLowerCase();
};
