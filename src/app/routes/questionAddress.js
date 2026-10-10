/*
 * A QUESTION'S ADDRESS IS THE NUMBER THE STUDENT SEES.
 *
 * The workspace numbers questions within their section — "Classwork,
 * Question 2 of 5" — over the questions this student actually has (a granted
 * Practice Pass removes Practice; fewer required items renumber the section).
 * Storage order is an implementation detail: a lesson with a Warm-Up of three
 * stores its second Classwork question at index 4, and "Continue at Question
 * 5" sent students looking for a question numbered 2.
 *
 * So the URL, the Resume button and the workspace all derive the number from
 * the same list: the student's entries in workspace order, each { storageIndex,
 * logicalRole }. A question's number is its position among the entries of its
 * own section, counting from 1.
 */
import { projectCurrentAssignmentContent } from '../../platform/assignments/currentContentProjection.js';

/**
 * The student's questions in workspace order: the current-content projection
 * (a teacher's replacement sits where the question it replaced sat), less the
 * items a reduced-item-count accommodation omits — the same list the
 * workspace numbers. A Practice Pass removes a whole section, so it never
 * changes another section's numbers and needs no filter here.
 */
export const studentQuestionEntries = (assignment, { omittedIndices = [] } = {}) => {
  const omitted = new Set(omittedIndices || []);
  return projectCurrentAssignmentContent(assignment || {}).entries
    .filter((entry) => !omitted.has(entry.storageIndex))
    .map((entry) => ({ storageIndex: entry.storageIndex, logicalRole: entry.logicalRole }));
};

export const questionAddressFor = (entries = [], storageIndex) => {
  const target = Number(storageIndex);
  const entry = entries.find((candidate) => candidate.storageIndex === target);
  if (!entry || !entry.logicalRole) return null;
  const position = entries
    .filter((candidate) => candidate.logicalRole === entry.logicalRole)
    .findIndex((candidate) => candidate.storageIndex === target);
  return { section: entry.logicalRole, number: position + 1 };
};

export const storageIndexForAddress = (entries = [], address = null) => {
  if (!address?.section || !Number.isInteger(address.number) || address.number < 1) return null;
  const sectionEntries = entries.filter((candidate) => candidate.logicalRole === address.section);
  return sectionEntries[address.number - 1]?.storageIndex ?? null;
};

// How the address reads to a student: "Classwork Question 2".
const SECTION_LABELS = Object.freeze({
  warmup: 'Warm-Up',
  classwork: 'Classwork',
  practice: 'Practice',
  dol: 'DOL',
  checkpoint: 'Checkpoint',
  quiz: 'Quiz',
  test: 'Test',
});

export const questionAddressLabel = (address) => {
  if (!address) return null;
  const section = SECTION_LABELS[address.section]
    || String(address.section || '').replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
  return section ? `${section} Question ${address.number}` : `Question ${address.number}`;
};
