/*
 * The question editor and the assignment library are each two files — a
 * wrapper that owns the Repair Center entry points and a base holding the
 * screen. A contract about either means both halves.
 *
 * This now delegates to the generic componentSource(), which pairs any
 * `Thing.jsx` with its `ThingBase.jsx` and asserts the wrapper still renders
 * the base. Kept as named exports because nine test files import them, and
 * because the names say which screen is meant.
 *
 * See docs/handoffs/SOURCE_CONTRACT_PLAYBOOK.md.
 */

import { componentSource } from './sourceContract.mjs';

/** The whole teacher question editor: repair wrapper and editing screen. */
export const assignmentQuestionEditorSource = () => componentSource('src/AssignmentQuestionEditor.jsx');

/** The whole assignment library: repair launcher and library listing. */
export const assignmentLibrarySource = () => componentSource('src/AssignmentLibrary.jsx');

export default { assignmentQuestionEditorSource, assignmentLibrarySource };
