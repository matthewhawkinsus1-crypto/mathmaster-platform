/*
 * THE QUESTION A CAPABILITY FIXTURE BECOMES — ONE DEFINITION FOR BOTH GATES.
 *
 * The node certification and the browser harness must certify the same
 * question, so both compile it here: authoring JSON through the production V5
 * compiler, then the runtime view the student assignment player renders
 * (`getRuntimeAssignmentQuestions`). A `stored` fixture is returned raw, the
 * way non-player hosts hand a Firestore record to QuestionEngine.
 */
import { compileAuthoringIntentV5 } from '../contract/authoringIntentV5.js';
import { getRuntimeAssignmentQuestions } from '../contract/storedAssignmentV5.js';

export const CAPABILITY_ASSIGNMENT_ID = 'capability-certification';

export const compileCapabilityFixture = (fixture = {}) => {
  if (fixture.stored) return { ...fixture.stored, questionId: fixture.id };
  const compiled = compileAuthoringIntentV5({
    schemaVersion: 5,
    assignment: { title: `Capability ${fixture.id}`, courseId: fixture.courseId || 'algebra1' },
    sections: [{ role: 'classwork', title: 'Classwork', questions: [{ standard: fixture.standard || 'A.5A', ...fixture.authoring }] }],
  });
  const stored = { ...compiled.package, id: CAPABILITY_ASSIGNMENT_ID };
  const [question] = getRuntimeAssignmentQuestions(stored, { source: 'capabilityCertification' });
  if (!question) throw new Error(`Capability fixture ${fixture.id} compiled to no question.`);
  return { ...question, questionId: fixture.id };
};

export default compileCapabilityFixture;
