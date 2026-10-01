/*
 * Grading declaration for the `signSolutionAnalyzer` registry tool.
 *
 * Every mode is a selection the student toggles — sign-chart intervals by
 * their index, or radical-equation candidates by their value — checked
 * against the set the server rebuilds from the question's own factors,
 * relation, radical equation and candidates. Nothing the browser holds that
 * the server does not.
 *
 * A Sign & Solution item with no factors whose inequality can be read is
 * opened on Step Algebra by the runtime repair (openSignAnalyzerWithoutFactors
 * in ../../runtime/assignmentRuntimeRepair.mjs). The server applies the same
 * repair before grading (deliveredQuestionForGrading), so such an item is the
 * stepAlgebra surface on both sides and never reaches this declaration.
 *
 * Light by design: imported into the grading manifest, which the student
 * app's main bundle, Pre-Flight and the checkpoint writer all read. Never
 * import grading mathematics here — that belongs in ../tools/signSolutionAnalyzer.mjs.
 */
import { SHARED, declareTool } from '../toolGraderDefinition.mjs';

export default declareTool({
  // Work shape v1 — per mode, exactly the state the analyzer holds:
  //   polynomial    { selected: number[] }  indexes of the toggled intervals,
  //                                          in the order the chart lists them
  //   rational      { selected: number[] }  the same, with denominator zeros
  //   radicalCheck  { selected: (number|string)[] }  the toggled candidate
  //                                          values, exactly as authored
  contractVersion: 1,
  // SignSolutionAnalyzer.jsx: `questionData.mode || (denominatorFactors?.length
  // ? 'rational' : 'polynomial')`; 'radicalCheck' renders RadicalCheck and every
  // other value renders the sign chart, which reads denominator factors only
  // when the mode is exactly 'rational'. So an unknown, padded or mis-cased
  // mode is the polynomial chart — not the manifest's generic default.
  defaultMode: 'polynomial',
  resolveMode: (question) => {
    const mode = question?.mode || (question?.denominatorFactors?.length ? 'rational' : 'polynomial');
    if (mode === 'radicalCheck') return 'radicalCheck';
    return mode === 'rational' ? 'rational' : 'polynomial';
  },
  modes: {
    polynomial: SHARED,
    rational: SHARED,
    radicalCheck: SHARED,
  },
});
