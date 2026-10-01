/*
 * Grading declaration for the `openSortBoard` registry tool.
 *
 * Both boards are a set of card placements (plus, for the open sort, a name
 * and an explanation per group), checked against the question's own authored
 * `validSchemes` — nothing the browser holds that the server does not. Card
 * order on screen is never read: placements are graded by stable item id.
 *
 * Light by design: imported into the grading manifest, which the student
 * app's main bundle, Pre-Flight and the checkpoint writer all read. Never
 * import grading mathematics here — that belongs in ../tools/openSortBoard.mjs.
 */
import { SHARED, declareTool } from '../toolGraderDefinition.mjs';

export default declareTool({
  // Work shape v1 — both modes, exactly the groups the board holds:
  //   { groups: [{ id, name, rationale, itemIds: string[] }] }
  // In the controlled board each group's id is a category id and its name is
  // the category label.
  contractVersion: 1,
  // OpenSortBoard.jsx: `questionData.mode === 'controlled'` renders the fixed
  // category board; anything else (missing, unknown, mis-cased, padded)
  // renders the open sort.
  defaultMode: 'open',
  resolveMode: (question) => (question?.mode === 'controlled' ? 'controlled' : 'open'),
  modes: {
    open: SHARED,
    controlled: SHARED,
  },
});
