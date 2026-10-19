/*
 * Grading declaration for the `matrixLab` registry tool.
 *
 * Five views, one per thing a student does with a matrix in Algebra II
 * (A2.3B, "technology with matrices"):
 *
 *   locate          state a matrix's dimensions; tap the element a_ij; write
 *                   the notation for an element described in context
 *   operate         decide whether A·B (or A + B) is defined and its size,
 *                   fill in the result, and (optionally) judge whether the two
 *                   matrices are inverses
 *   equation        write a system as the matrix equation A·X = B
 *   solve           write A·X = B, use the matrix calculator, and report the
 *                   solution — or classify a singular system as none / many
 *   completeSystem  write a third equation so the system has no solution or
 *                   infinitely many
 *
 * Every view is checked against the question's own givens (its matrices and
 * equations, which the server holds), never against a verdict the browser
 * computed, so every mode is server graded.
 *
 * Light by design: imported into the grading manifest. Never import grading
 * mathematics here — that belongs in ../tools/matrixLab.mjs.
 */
import { SHARED, declareTool } from '../toolGraderDefinition.mjs';

export default declareTool({
  // Work shape v1 — what the lab's Check sends (every cell is the text the
  // student typed; '' when blank):
  //   locate          { dimensions: { rows, cols }, targets: [{ id, row, col }] }
  //   operate         { defined: 'yes'|'no'|'', dimensions: { rows, cols },
  //                     entries: [[cell]], inverses: 'yes'|'no'|'' }
  //   equation        { A: [[cell]], B: [cell] }
  //   solve           { A, B, inverse: [[cell]], classification: 'one'|'none'|'many'|'',
  //                     values: [cell], usedTechnology: boolean,
  //                     singularReason?: { row, otherRow, factor: cell,
  //                                        constant: 'follows'|'breaks'|'' } }
  //                   (singularReason only where the question sets
  //                   justifySingular; an older client that omits it is
  //                   graded as having given no reason)
  //   completeSystem  { rows: [{ id, coefficients: [cell], constant: cell }] }
  // `values`, not `solution`: the response contract drops a key named
  // `solution` at every depth as answer material, so the student's own
  // answer would arrive blank.
  contractVersion: 1,
  defaultMode: 'operate',
  modes: {
    locate: SHARED,
    operate: SHARED,
    equation: SHARED,
    solve: SHARED,
    completeSystem: SHARED,
  },
});
