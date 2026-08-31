const cleanName = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');

export const splitLegacyDisplayName = (displayName = '') => {
  const parts = cleanName(displayName).split(' ').filter(Boolean);
  if (!parts.length) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts.at(-1) };
};

export const studentNameParts = (student = {}) => {
  const firstName = cleanName(student.firstName);
  const lastName = cleanName(student.lastName);
  if (firstName || lastName) return { firstName, lastName };
  return splitLegacyDisplayName(
    student.displayName
      || student.name
      || student.googleName
      || student.profile?.displayName
      || student.profile?.name
      || student.profile?.googleName
      || '',
  );
};

export const formatStudentName = (student = {}, { lastFirst = true, fallbackToId = true } = {}) => {
  const { firstName, lastName } = studentNameParts(student);
  if (lastFirst && lastName) return firstName ? `${lastName}, ${firstName}` : lastName;
  const natural = [firstName, lastName].filter(Boolean).join(' ');
  if (natural) return natural;
  const displayName = cleanName(
    student.displayName
      || student.name
      || student.googleName
      || student.profile?.displayName
      || student.profile?.name
      || student.profile?.googleName,
  );
  if (displayName) return displayName;
  if (!fallbackToId) return '';
  return String(student.studentId || student.id || 'Student');
};

export const compareStudentsByName = (a = {}, b = {}) => {
  const aName = studentNameParts(a);
  const bName = studentNameParts(b);
  const options = { sensitivity: 'base', numeric: true };
  const last = aName.lastName.localeCompare(bName.lastName, undefined, options);
  if (last) return last;
  const first = aName.firstName.localeCompare(bName.firstName, undefined, options);
  if (first) return first;
  return String(a.studentId || a.id || '').localeCompare(
    String(b.studentId || b.id || ''), undefined, options,
  );
};

export const studentSearchText = (student = {}) => {
  const { firstName, lastName } = studentNameParts(student);
  return [
    student.studentId,
    student.id,
    firstName,
    lastName,
    student.displayName,
    student.googleName,
    student.profile?.displayName,
    student.profile?.name,
    student.profile?.googleName,
    student.classPeriod,
    student.assignedTeacherEmail,
    student.linkedEmail,
  ].filter(Boolean).join(' ').toLowerCase();
};
