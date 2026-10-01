/*
 * Grading declaration for the `relationMapping` registry tool.
 *
 * Every part the Mapping Diagram asks for — plotted points, arrows, a typed
 * domain and range, the function decision and authored analysis fields — is
 * student work checked against the question's own ordered pairs and answer
 * fields, so the server recomputes the verdict from nothing the browser
 * holds that it does not.
 *
 * Light by design: imported into the grading manifest, which the student
 * app's main bundle, Pre-Flight and the checkpoint writer all read. Never
 * import grading mathematics here — that belongs in ../tools/relationMapping.mjs.
 */
import { SHARED, declareTool } from '../toolGraderDefinition.mjs';

export default declareTool({
  // Work shape v1 — exactly what RelationMapping.jsx's Check submits:
  //   {
  //     plottedPoints: [[x, y], ...]   points the student plotted
  //     arrows:        [[x, y], ...]   arrows drawn, domain value -> range value
  //     domainText:    string          the domain box, as typed
  //     rangeText:     string          the range box, as typed
  //     domain, range: number[]        those boxes parsed (read by the Path
  //                                    contract and older consumers; the shared
  //                                    grader parses the typed text itself)
  //     isFunction:    'yes-definition' | 'yes-output-rule' | 'no-input-repeat'
  //                    | 'no-output-repeat' | ''
  //     fields:        [{ id, value }] one per authored analysis field
  //   }
  contractVersion: 1,
  // RelationMapping.jsx has a single view: `ask` decides which parts appear,
  // and `question.mode` is never read — every question renders this one.
  defaultMode: 'default',
  resolveMode: () => 'default',
  modes: {
    default: SHARED,
  },
});
