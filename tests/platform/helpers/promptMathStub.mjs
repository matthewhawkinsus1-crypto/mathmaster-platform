// In place of src/app/teacher/teacherPanels.js for a node test of Teacher
// Home's questions panel (firstLoadTeacherHome.test.mjs): the prompts' math
// is the real on-demand code (app/teacher/onDemandCode.js), whose arrival the
// test decides.
import { onDemandCode } from '../../../src/app/teacher/onDemandCode.js';

let arrive;
const arrival = new Promise((resolve) => { arrive = resolve; });
let asked = 0;

export const promptMath = onDemandCode(() => { asked += 1; return arrival; });
export const timesAsked = () => asked;
/** The math code lands: `module` is what import('…/MathText.jsx') would give. */
export const mathArrives = (module) => arrive(module);
