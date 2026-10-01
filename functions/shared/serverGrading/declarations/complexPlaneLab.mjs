/*
 * Grading declaration for the `complexPlaneLab` registry tool.
 *
 * Every mode is a set of typed numeric answers checked against values the
 * server recomputes from the question's own z, w, exponent, quarter turns or
 * quadratic — nothing the browser holds that the server does not.
 *
 * Light by design: imported into the grading manifest. The mathematics is in
 * ../tools/complexPlaneLab.mjs.
 */
import { SHARED, declareTool } from '../toolGraderDefinition.mjs';

export default declareTool({
  // Work shape v1 — per mode, exactly the fields the lab's inputs hold:
  //   features        { magnitudeAnswer, conjugateRe, conjugateIm }
  //   operations      { real, imaginary }
  //   division        { conjugateRe, conjugateIm, real, imaginary }
  //   powers          { real, imaginary, magnitude }
  //   rotation        { real, imaginary, rotation: '0'|'1'|'2'|'3' }
  //   quadraticRoots  { r1Re, r1Im, r2Re, r2Im }
  contractVersion: 1,
  // ComplexPlaneLab.jsx: `questionData.mode || 'features'`, and any unknown
  // mode renders the Features view.
  defaultMode: 'features',
  modes: {
    features: SHARED,
    operations: SHARED,
    division: SHARED,
    powers: SHARED,
    rotation: SHARED,
    quadraticRoots: SHARED,
  },
});
