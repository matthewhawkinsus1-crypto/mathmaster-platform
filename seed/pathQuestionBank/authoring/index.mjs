// Every authored My Math Path standard, in one list.
//
// The build script walks this, so adding a course means adding one import here
// rather than editing the build.

import { GRADE_6_7_STANDARDS } from './prerequisitesGrade67.mjs';
import { GRADE_8_STANDARDS_A } from './prerequisitesGrade8a.mjs';
import { GRADE_8_STANDARDS_B } from './prerequisitesGrade8b.mjs';
import { GRADE_8_STANDARDS_C } from './prerequisitesGrade8c.mjs';
import { ALGEBRA1_A2_STANDARDS } from './algebra1LinearWriting.mjs';
import { ALGEBRA1_GRAPHING_STANDARDS } from './algebra1LinearGraphing.mjs';
import { ALGEBRA1_SYSTEMS_STANDARDS } from './algebra1SystemsAndData.mjs';

export const ALL_AUTHORED_STANDARDS = [
  ...GRADE_6_7_STANDARDS,
  ...GRADE_8_STANDARDS_A,
  ...GRADE_8_STANDARDS_B,
  ...GRADE_8_STANDARDS_C,
  ...ALGEBRA1_A2_STANDARDS,
  ...ALGEBRA1_GRAPHING_STANDARDS,
  ...ALGEBRA1_SYSTEMS_STANDARDS,
];

export default ALL_AUTHORED_STANDARDS;
