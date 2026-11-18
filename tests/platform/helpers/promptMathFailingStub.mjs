// As promptMathStub.mjs, for the questions panel when its math cannot load:
// the request fails as a chunk a deploy replaced does
// (firstLoadTeacherHome.test.mjs).
import { onDemandCode } from '../../../src/app/teacher/onDemandCode.js';

export const failure = new TypeError('Failed to fetch dynamically imported module: https://example.test/assets/MathText-abc.js');
export const promptMath = onDemandCode(() => Promise.reject(failure));
