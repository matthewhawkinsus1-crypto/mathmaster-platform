import { storedAssignmentToV5 } from '../contract/storedAssignmentV5.js';
import { contentVersionOf } from './assignmentContentVersion.js';
import { projectCurrentAssignmentContent } from './currentContentProjection.js';

const portableQuestion = (question = {}) => {
  const {
    teacherExcluded: _teacherExcluded,
    supersedesQuestionId: _supersedesQuestionId,
    introducedInContentVersion: _introducedInContentVersion,
    ...current
  } = question;
  return current;
};

export const buildCurrentContentPortableAssignment = (assignment = {}) => {
  const projection = projectCurrentAssignmentContent(assignment);
  const sections = projection.logicalSections.map((logicalSection) => {
    const source = logicalSection.sourceSection || {};
    return {
      ...source,
      id: logicalSection.id || logicalSection.role,
      role: logicalSection.role,
      title: source.title || logicalSection.title || undefined,
      questions: logicalSection.entries.map((entry) => portableQuestion(entry.question)),
    };
  });
  return storedAssignmentToV5({ ...assignment, sections }, { resetAssignmentKey: true });
};

export const buildCurrentContentPortablePackage = (assignment = {}) => ({
  ...buildCurrentContentPortableAssignment(assignment),
  portableContract: {
    kind: 'mathmasterCanonicalAssignmentV5',
    version: 1,
    contentProjection: 'current',
    sourceContentVersion: contentVersionOf(assignment),
  },
});
