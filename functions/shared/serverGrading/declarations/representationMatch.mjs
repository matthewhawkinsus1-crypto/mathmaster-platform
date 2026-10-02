/*
 * Grading declaration for the `representationMatch` registry tool.
 *
 * Every view is a selection — a set id, a card kind, a row, a card id, a
 * correction option — or a card-to-group placement, checked against the
 * question's own sets, mixedSet, function/rows, mismatchSetId and correction
 * key (with the same fallbacks the screen uses for anything unauthored) —
 * nothing the browser holds that the server does not. The linear deck's
 * shuffle is seeded and never read: cards are graded by their stable ids.
 *
 * Light by design: imported into the grading manifest, which the student
 * app's main bundle, Pre-Flight and the checkpoint writer all read. Never
 * import grading mathematics here — that belongs in ../tools/representationMatch.mjs.
 */
import { SHARED, declareTool, nonGraded } from '../toolGraderDefinition.mjs';

// The views RepresentationMatch.jsx routes to by exact `mode` match.
const ROUTED_VIEWS = Object.freeze(['completeSet', 'findMismatch', 'tableAudit', 'graphMatch', 'linearConnections']);

export default declareTool({
  // Work shape v1 — per mode, exactly the state the screen's inputs hold:
  //   completeSet        { equation, table, context }        chosen set ids ('' = none)
  //   findMismatch       { mismatchKind: ''|'equation'|'table'|'context' }
  //   tableAudit         { rowIndex: number|null }           index into the shown rows
  //   graphMatch         { graphId }                         chosen set id
  //   linearConnections  task 'group':        { assignments: [{ cardId, slot }] }
  //                      task 'findMismatch': { selectedId, correctionChoice }
  contractVersion: 1,
  // RepresentationMatch.jsx: `questionData.mode || 'completeSet'`, then strict
  // `===` against each view. Unlike most tools there is NO fallback view: any
  // other mode (unknown, mis-cased, padded, not a string) renders the shell
  // with no answer controls and no Check button. The manifest's generic
  // fallback would grade that screen as completeSet, so it resolves to a
  // declared non-graded view instead.
  defaultMode: 'completeSet',
  resolveMode: (question) => {
    const mode = question?.mode || 'completeSet';
    return ROUTED_VIEWS.includes(mode) ? mode : 'unrouted';
  },
  modes: {
    completeSet: SHARED,
    findMismatch: SHARED,
    tableAudit: SHARED,
    graphMatch: SHARED,
    linearConnections: SHARED,
    unrouted: nonGraded('An unrecognised representationMatch mode renders no answer controls and no Check button, so the student can produce no work to grade.'),
  },
});
