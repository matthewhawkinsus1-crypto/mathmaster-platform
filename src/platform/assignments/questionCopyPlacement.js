/*
 * WHERE A DUPLICATED QUESTION GOES: WHERE SAVE STORES IT.
 *
 * The Question Editor numbers its cards by their place in its list, and so
 * the teacher reads them. Pre-Flight and Save build the assignment again
 * from each question's section (rebuildV5SectionsFromQuestions), and every
 * student's grade tracker keeps its records by stored index. So a copy has to
 * go, in the editor's list, exactly where Save will store it, or every card
 * after it carries Pre-Flight's findings for another number, and Save stores
 * an order the teacher never saw.
 *
 *   - With no student history: right after its source, in its section. Save
 *     keeps it there.
 *   - With student history: after every stored question, so that no stored
 *     index moves ("Duplicated questions are appended after student activity
 *     begins so existing indexes remain unchanged",
 *     LESSON_SCENARIO_ASSIGNMENT_EDITOR_ARCHITECTURE.md). At the end of the
 *     last section when that section is the copy's own role; otherwise in a
 *     section of its own role appended after every section, as an Honors
 *     swap's replacement is (withAppendedQuestionSections). Students are
 *     given it with its role's other questions (currentContentProjection.js).
 *     The copy used to keep its source's section, so Save put it inside that
 *     section and moved every later stored question one index on.
 */
import { V5_SECTION_TITLES } from '../contract/assignmentSchemaV5.js';
import { withAppendedQuestionSections } from '../rigor/honorsExtensionSwap.js';

const clean = (value) => String(value ?? '').trim();

/**
 * `copy` (questions[index] duplicated, with its own questionId) placed where
 * Save will store it. `assignment` is the stored assignment the editor opened
 * and `appendedSections` the sections appended to it so far (Honors swaps,
 * earlier copies). Returns { questions, appendedSections }: the editor's next
 * list, and its appended sections with any this copy needed.
 */
export const placeQuestionCopy = ({ questions = [], index, copy, assignment = {}, appendedSections = [], protectHistory = false } = {}) => {
  const list = Array.isArray(questions) ? questions : [];
  const appended = Array.isArray(appendedSections) ? appendedSections : [];
  if (!protectHistory) {
    return { questions: [...list.slice(0, index + 1), copy, ...list.slice(index + 1)], appendedSections: appended };
  }
  const role = clean(copy?.activityRole).toLowerCase() || 'practice';
  const sections = withAppendedQuestionSections(assignment, appended)?.sections;
  const last = Array.isArray(sections) ? sections.at(-1) : null;
  if (last && clean(last.id) && clean(last.role).toLowerCase() === role) {
    return {
      questions: [...list, { ...copy, activityRole: role, sectionId: clean(last.id), sectionTitle: clean(last.title) || V5_SECTION_TITLES[role] || 'Section' }],
      appendedSections: appended,
    };
  }
  const section = {
    id: `copy-${clean(copy?.questionId).replace(/[^A-Za-z0-9_-]+/g, '-')}`,
    role,
    title: `${V5_SECTION_TITLES[role] || 'Section'} · Duplicated Questions`,
  };
  return {
    questions: [...list, { ...copy, activityRole: role, sectionId: section.id, sectionTitle: section.title }],
    appendedSections: [...appended, section],
  };
};
