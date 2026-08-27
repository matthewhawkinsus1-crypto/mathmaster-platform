import assert from 'node:assert/strict';
import {
  AUTHORING_INTENT_SCHEMA_NAME,
  AUTHORING_INTENT_SCHEMA_VERSION,
  CONTRACT_SCHEMA_VERSION,
  buildAdvancedAuthoringContract,
  buildAuthoringContract,
  buildFixRequest,
} from '../../src/platform/contract/authoringContract.js';

const generatedAt = new Date('2026-08-27T00:00:00Z');
const v5 = buildAuthoringContract({ generatedAt, courseId: 'algebra1' });
const advanced = buildAdvancedAuthoringContract({ generatedAt, courseId: 'algebra1' });

assert.equal(CONTRACT_SCHEMA_VERSION, 5);
assert.equal(AUTHORING_INTENT_SCHEMA_VERSION, 5);
assert.equal(AUTHORING_INTENT_SCHEMA_NAME, 'MathMaster Assignment V5');
assert.equal(advanced, v5, 'there is one public authoring contract rather than a hidden V4 advanced path');

assert.match(v5, /MathMaster Assignment V5/);
assert.match(v5, /"schemaVersion": 5/);
assert.match(v5, /"sections"/);
assert.match(v5, /variantPolicy/);
assert.match(v5, /differentiationPolicy/);
assert.match(v5, /supportPolicy/);
assert.match(v5, /gradingPolicy/);
assert.match(v5, /evidencePolicy/);
assert.match(v5, /studentWorksheetPdf/);
assert.match(v5, /lessonNotesPdf/);
assert.match(v5, /Honors \+ CCMR Practice/);
assert.match(v5, /about 15%/);
assert.match(v5, /assessmentContext/);
assert.match(v5, /CCMR \/ assessment fidelity/i);
assert.match(v5, /A\.2B/);
['constructGraph', 'readGraph', 'completeTable', 'buildMapping', 'classifyContinuity'].forEach((action) => {
  assert.ok(v5.includes(action), `V5 contract lists student action ${action}`);
});

assert.doesNotMatch(v5, /compile.*V4|internal V4|output V4|Bundle V4/i);
assert.doesNotMatch(v5, /Valid question types:/, 'outside AI is not taught renderer type plumbing');

const rawV5 = '{"schemaVersion":5,"assignment":{"title":"x","courseId":"algebra1"},"sections":[]}';
const fix = buildFixRequest({
  rawJson: rawV5,
  errors: ['Mathematical data is missing.'],
  warnings: ['Question 1 alignment needs teacher review.'],
});
assert.match(fix, /Fix this MathMaster Assignment V5 JSON/);
assert.match(fix, /KEEP schemaVersion 5/);
assert.ok(fix.includes(rawV5));
assert.doesNotMatch(fix, /Valid question types:|Schema version is 4/);
assert.doesNotMatch(fix, /alignment needs teacher review/, 'alignment warnings stay in teacher Preflight');

const holePattern = /(^\s*-\s*undefined)|(—\s*undefined\s*$)|("undefined")|(:\s*undefined)|(\bNaN\b)|(\[object Object\])/;
assert.deepEqual(v5.split('\n').filter((line) => holePattern.test(line)), []);

console.log('authoringContract.test.mjs: canonical V5 assertions passed');
