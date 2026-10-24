/*
 * GRAPH-READING ITEMS AND SCREEN READERS — a preflight WARNING, never a block.
 *
 * While a question can still be answered, a coordinate plane's generated
 * screen-reader description says only what KINDS of objects are drawn ("1
 * line, 3 points"), never where (src/platform/language/graphDescription.js):
 * "crosses the y-axis at −4" would answer "What is the y-intercept?" for
 * anyone who turns a screen reader on. So on an item whose task IS reading
 * the graph, a blind student gets nothing they can answer from — unless the
 * author wrote a description that conveys the graph without giving the answer
 * away, the student's plan gives them the Graph read-out (AX03), or they have a
 * human reader or a tactile graphic.
 *
 * This names those items so the teacher can decide. What counts as
 * graph-reading, and what silences it, is decided once for this lesson
 * Pre-Flight and the Test Cycle one (functions/shared/graphReadingAccessibility.mjs).
 */
import { GRAPH_READING_REMEDIES, graphReadingWithoutDescription } from '../../../functions/shared/graphReadingAccessibility.mjs';

export { graphReadingWithoutDescription };

const asArray = (value) => (Array.isArray(value) ? value : []);

export const auditAssignmentGraphAccessibility = (questions = [], { deliveredOnly = true } = {}) => {
  const warnings = [];
  asArray(questions).forEach((question, index) => {
    if (deliveredOnly && question?.teacherExcluded === true) return;
    const reason = graphReadingWithoutDescription(question);
    if (!reason) return;
    warnings.push(`Question ${index + 1} ${reason} and has no screen-reader description (graph.accessibleDescription). ${GRAPH_READING_REMEDIES}`);
  });
  return { warnings };
};

export default auditAssignmentGraphAccessibility;
