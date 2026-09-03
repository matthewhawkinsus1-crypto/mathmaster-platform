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
assert.match(v5, /Reference information is not a hint or an answer key/i);
assert.match(v5, /Omit `referenceInfo` when the prompt already contains the givens/i);
assert.match(v5, /Never place a student conclusion in `referenceInfo`/i);
assert.match(v5, /use studentActions \["solveStepByStep"\]/i);
assert.match(v5, /absolute-value equations, inequalities\/compound inequalities, and squared\/completing-the-square structures/i);
assert.match(v5, /independent\/dependent roles, the equation\/model, domain, range, continuity, axis labels, scale/i);
assert.match(v5, /If studentActions includes identifyQuantities, supply at least two selectable quantities/i);
assert.match(v5, /A\.2B/);
['constructGraph', 'readGraph', 'completeTable', 'buildMapping', 'classifyContinuity'].forEach((action) => {
  assert.ok(v5.includes(action), `V5 contract lists student action ${action}`);
});

assert.doesNotMatch(v5, /compile.*V4|internal V4|output V4|Bundle V4/i);
assert.doesNotMatch(v5, /Valid question types:/, 'outside AI is not taught renderer type plumbing');
assert.doesNotMatch(v5, /How to build each question type|Interactive tool types/, 'public V5 guidance must not teach internal renderer/tool catalogs');
assert.doesNotMatch(v5, /"type": "graphAnalysis"|"type": "relationshipModel"/, 'V5 examples must use studentActions rather than internal renderer types');
assert.match(v5, /"studentActions": \["readGraph", "findVertex", "findYIntercept"\]/);


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
assert.match(fix, /do not regress the question to interval notation|Do not introduce interval notation/i);
assert.match(fix, /identifyQuantities[\s\S]*at least two selectable quantities/i);
assert.match(fix, /graph-analysis task into hand graph construction/i);
assert.match(fix, /raw calculator-style x\^2 or 2\^x/i);

const holePattern = /(^\s*-\s*undefined)|(—\s*undefined\s*$)|("undefined")|(:\s*undefined)|(\bNaN\b)|(\[object Object\])/;
assert.deepEqual(v5.split('\n').filter((line) => holePattern.test(line)), []);

console.log('authoringContract.test.mjs: canonical V5 assertions passed');
