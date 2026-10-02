/*
 * systemsWorkspace — algebraic mode group (see ../systemsWorkspace.mjs).
 * Light: declarations only. The mathematics is in
 * ../../tools/systemsWorkspace/algebraic.mjs.
 *
 * `algebraic` is SHARED: every verdict the workspace records is a pure
 * function of the authored system (equations, variables, method,
 * requireVerification) and the student's own work. Dimension is inferred the
 * way SystemsWorkspace.jsx infers it (algebraicSystemDimension: three
 * equations in three variables is 3×3, anything else 2×2), and a 3×3 runs
 * the method Algebraic3SystemMode renders (the authored one, or the
 * student's choice).
 *
 * Work shape v1 (the tool's contractVersion):
 *
 *   dimension     2 | 3 (informational; the question decides)
 *   method        'substitution' | 'elimination' | ''  (the route on screen)
 *   values        { [variable]: number }  every value solved so far
 *   verification  { E1: { left, right }, E2: …, E3: … }  the sides typed in
 *                 the original-equation check (never a checked/valid flag)
 *   2×2 only:
 *     reducedStatement  the no-variable statement the reduction reached
 *     specialCase       { statementTruth, solutionCount, classification }
 *     efficiencyReason  optional free text (never graded)
 *   3×3 elimination only:
 *     outcome           { statement, classificationChoice, classificationKind,
 *                         planes: { '1-2', '1-3', '2-3' } }
 *                       the checked statement, the classification the
 *                       student recorded and their reading of the statement
 *                       (identity / contradiction / origin; '' in a record
 *                       from before readings were stored), and how they say
 *                       each plane pair meets
 *
 * No answer-key material and no verdict ever travels in it.
 */
import { SHARED } from '../../toolGraderDefinition.mjs';

export default {
  algebraic: SHARED,
};
