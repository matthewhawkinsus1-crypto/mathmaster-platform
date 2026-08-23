/*
 * ONE BOX THAT FINDS THE THING.
 *
 * A teacher who wants to look at one student currently chooses a tab, chooses a
 * class, scrolls a roster and clicks a name. Four decisions to answer a
 * question they already knew the answer to when they started: "how is Ana
 * doing?" The point of a search box is to collapse those four into one, and the
 * point of THIS one is that it searches the things a teacher actually names out
 * loud — a child, a class, an assignment, a standard — rather than the things
 * the software happens to store.
 *
 * RANKING IS THE WHOLE FEATURE.
 *
 * A search that returns everything containing "a" is not a search. Results are
 * ranked by how confidently the query identifies the thing:
 *
 *   an exact match on an identifier a teacher would type deliberately
 *   (a student ID, a TEKS code) outranks everything;
 *   then a match at the start of a name, because that is what typing a name is;
 *   then a match on a later word, because "rivera" should find "Ana Rivera";
 *   and only then a match somewhere in the middle.
 *
 * Surname-first matching matters more here than it looks: rosters are stored
 * "Rivera, Ana", teachers think "Ana Rivera", and a search that only matched the
 * stored order would fail on the most natural thing to type.
 */

export const RESULT_KIND = Object.freeze({
  STUDENT: 'student',
  CLASS: 'class',
  ASSIGNMENT: 'assignment',
  STANDARD: 'standard',
});

export const RESULT_KIND_LABEL = Object.freeze({
  [RESULT_KIND.STUDENT]: 'Student',
  [RESULT_KIND.CLASS]: 'Class',
  [RESULT_KIND.ASSIGNMENT]: 'Assignment',
  [RESULT_KIND.STANDARD]: 'Standard',
});

const SCORE = Object.freeze({
  EXACT_ID: 100,
  PREFIX: 70,
  WORD_PREFIX: 55,
  CONTAINS: 30,
});

const list = (value) => (Array.isArray(value) ? value : []);
const norm = (value) => String(value || '').trim().toLowerCase();

/**
 * How well one haystack answers one query, or 0 for "not a match".
 *
 * `identifiers` are values a teacher types deliberately and in full — a student
 * ID, a TEKS code. An exact hit on one of those is not a fuzzy match that
 * happened to score well; it is the teacher saying exactly what they meant, and
 * it outranks any name match.
 */
export const scoreMatch = (query, text, identifiers = []) => {
  const needle = norm(query);
  if (!needle) return 0;
  if (list(identifiers).some((value) => norm(value) === needle)) return SCORE.EXACT_ID;

  const haystack = norm(text);
  if (!haystack) return 0;
  if (haystack.startsWith(needle)) return SCORE.PREFIX;

  // Word starts, so "rivera" finds "Ana Rivera" and "ana" finds "Rivera, Ana".
  const words = haystack.split(/[\s,._-]+/).filter(Boolean);
  if (words.some((word) => word.startsWith(needle))) return SCORE.WORD_PREFIX;

  return haystack.includes(needle) ? SCORE.CONTAINS : 0;
};

/**
 * Everything matching one query, ranked, across the four things a teacher names.
 *
 * Returns at most `limit` results. The cap is a real design decision rather than
 * a performance one: a palette that can show forty results is a palette a
 * teacher reads instead of typing one more letter into.
 */
export const searchTeacherWorkspace = ({
  query = '',
  students = [],
  classes = [],
  assignments = [],
  standards = [],
  limit = 8,
} = {}) => {
  const needle = norm(query);
  if (needle.length < 2) return [];

  const results = [];

  list(students).forEach((student) => {
    const name = student.displayName || student.name || String(student.id);
    const score = scoreMatch(needle, `${name} ${student.classPeriod || ''}`, [student.id]);
    if (!score) return;
    results.push({
      kind: RESULT_KIND.STUDENT,
      id: student.id,
      title: name,
      subtitle: `ID ${student.id}${student.classPeriod ? ` · ${student.classPeriod}` : ''}`,
      score,
      payload: { studentId: student.id },
    });
  });

  list(classes).filter((entry) => entry?.status !== 'archived').forEach((entry) => {
    const score = scoreMatch(needle, `${entry.name || ''} ${entry.period || ''}`, [entry.classId]);
    if (!score) return;
    results.push({
      kind: RESULT_KIND.CLASS,
      id: entry.classId,
      title: entry.name || entry.period || entry.classId,
      subtitle: entry.period || '',
      score,
      payload: { classId: entry.classId, classPeriod: entry.period || null },
    });
  });

  list(assignments).forEach((assignment) => {
    const score = scoreMatch(needle, assignment.title || '', [assignment.id]);
    if (!score) return;
    results.push({
      kind: RESULT_KIND.ASSIGNMENT,
      id: assignment.id,
      title: assignment.title || 'Untitled assignment',
      subtitle: list(assignment.assignedClassPeriods).join(', '),
      score,
      payload: { assignmentId: assignment.id },
    });
  });

  list(standards).forEach((standard) => {
    const code = standard.code || standard;
    const score = scoreMatch(needle, `${code} ${standard.description || ''}`, [code]);
    if (!score) return;
    results.push({
      kind: RESULT_KIND.STANDARD,
      id: String(code),
      title: String(code),
      subtitle: String(standard.description || '').slice(0, 90),
      score,
      payload: { standardCode: String(code) },
    });
  });

  // Ties break by kind, and the order is deliberate: a teacher typing into a
  // box beside a class is far more often looking for a child than for a
  // standard whose description happens to contain the same letters.
  const kindRank = {
    [RESULT_KIND.STUDENT]: 0,
    [RESULT_KIND.CLASS]: 1,
    [RESULT_KIND.ASSIGNMENT]: 2,
    [RESULT_KIND.STANDARD]: 3,
  };

  return results
    .sort((a, b) => (
      b.score - a.score
      || kindRank[a.kind] - kindRank[b.kind]
      || String(a.title).localeCompare(String(b.title))
    ))
    .slice(0, limit);
};

export default searchTeacherWorkspace;
