import assert from 'node:assert/strict';
import {
  assertFirestoreSafeAssignmentPayload,
  parseAssignmentBlueprintText,
  validateAssignmentQuestions,
} from '../../src/assignmentBlueprint.js';
import { auditStaticGraphViewport } from '../../src/graphSpecUtils.js';
import { buildAuthoringContract, buildFixRequest } from '../../src/platform/contract/authoringContract.js';

const rawV5 = `\`\`python
assignment = {
  "schemaVersion": 5,
  "assignment": {
    "title": "Canonical V5 compiler smoke test",
    "courseId": "algebra1",
    "instructionalPurpose": "lesson",
    "gradingPurpose": "classwork"
  },
  "variantPolicy": {
    "mode": "personalized",
    "sectionModes": {"classwork": "shared", "practice": "personalized"}
  },
  "outputProfiles": {
    "studentWorksheetPdf": {"enabled": True, "includeWorkspace": True}
  },
  "sections": [
    {
      "role": "classwork",
      "title": "Classwork",
      "questions": [
        {
          "standard": "A.3C",
          "prompt": "Graph f(x) = 2x + 1.",
          "studentActions": ["constructGraph"],
          "function": {"family": "linear", "m": 2, "b": 1},
          "dok": 2,
          "difficultyBand": 3
        }
      ]
    }
  ]
}
\`\`\``;

const parsed = parseAssignmentBlueprintText(rawV5);
assert.equal(parsed.sourceSchemaVersion, 5);
assert.equal(parsed.assignmentV5.schemaVersion, 5);
assert.equal(parsed.assignmentV5.sections.length, 1);
assert.equal(parsed.questions.length, 1);
assert.equal(parsed.questions[0].type, 'functionGraph');
assert.equal(parsed.assignmentV5.variantPolicy.mode, 'personalized');
assert.equal(parsed.assignmentV5.outputProfiles.studentWorksheetPdf.enabled, true);
assert.equal(Object.prototype.hasOwnProperty.call(parsed, 'bundleSource'), false);
assert.equal(Object.prototype.hasOwnProperty.call(parsed, 'isBundle'), false);
assert.equal(Object.prototype.hasOwnProperty.call(parsed, 'isPackage'), false);
assert.equal(Object.prototype.hasOwnProperty.call(parsed, 'assignment'), false);
assert.equal(validateAssignmentQuestions(parsed.questions).length, 1);
assert.ok(parsed.repairs.some((repair) => /canonical V5/.test(repair)));

const restrictedDomainInvestigation = parseAssignmentBlueprintText(JSON.stringify({
  schemaVersion: 5,
  assignment: {
    title: 'Restricted-domain graph investigation',
    courseId: 'algebra1',
    instructionalPurpose: 'lesson',
    gradingPurpose: 'classwork',
  },
  sections: [{
    role: 'classwork',
    title: 'Classwork',
    questions: [{
      standard: 'A.2A',
      prompt: 'Use the graph to determine the domain and range.',
      studentActions: ['readGraph', 'investigateFunction', 'analyzeDomain', 'analyzeRange'],
      function: {
        family: 'linear',
        m: 1,
        b: 2,
        domain: { min: -4, max: 3, minInclusive: true, maxInclusive: false },
      },
      notation: 'inequality',
      dok: 2,
      difficultyBand: 2,
    }],
  }],
}));
assert.equal(
  restrictedDomainInvestigation.questions[0].type,
  'graphAnalysis',
  'a restricted-domain investigation uses the full graph-analysis workspace',
);
assert.deepEqual(
  restrictedDomainInvestigation.questions[0].functionSpec.domain,
  { min: -4, max: 3, minInclusive: true, maxInclusive: false },
  'restricted-domain bounds and endpoint inclusion survive V5 compilation',
);
assert.deepEqual(
  restrictedDomainInvestigation.questions[0].analysisRequests.map((request) => request.kind),
  ['domain', 'range'],
  'domain/range analysis requests survive restricted-domain routing',
);


const firestoreSafeRelationMapping = parseAssignmentBlueprintText(JSON.stringify({
  schemaVersion: 5,
  assignment: {
    title: 'Firestore-safe relation mapping',
    courseId: 'algebra1',
    instructionalPurpose: 'review',
    gradingPurpose: 'classwork',
  },
  sections: [{
    role: 'classwork',
    title: 'Classwork',
    questions: [{
      type: 'relationMapping',
      standard: 'A.12A',
      prompt: 'Use the mapping to decide whether the relation is a function.',
      studentActions: ['buildMapping', 'classifyFunction'],
      pairs: [[-2, 4], [0, 1], [3, 4], [5, -1]],
      ask: ['mapping', 'isFunction'],
      dok: 1,
      difficultyBand: 1,
    }],
  }],
}));
assert.deepEqual(
  firestoreSafeRelationMapping.assignmentV5.sections[0].questions[0].pairs,
  [{ x: -2, y: 4 }, { x: 0, y: 1 }, { x: 3, y: 4 }, { x: 5, y: -1 }],
  'the reviewed canonical V5 object keeps Firestore-safe relationMapping pairs',
);
assert.doesNotThrow(
  () => assertFirestoreSafeAssignmentPayload(firestoreSafeRelationMapping.assignmentV5),
  'the canonical V5 object handed to Assignment Review is Firestore-safe before publish',
);

assert.throws(
  () => parseAssignmentBlueprintText(JSON.stringify([{ prompt: 'old array' }])),
  /does not accept raw question arrays/,
  'raw question arrays are intentionally unsupported',
);

assert.throws(
  () => parseAssignmentBlueprintText(JSON.stringify({
    schemaVersion: 4,
    assignment: { title: 'Old V4', courseId: 'algebra1' },
    questions: [],
  })),
  /V5 is the only supported assignment format/,
  'V4 packages are intentionally unsupported',
);

const contract = buildAuthoringContract({ courseId: 'algebra1', generatedAt: new Date('2026-08-27T00:00:00Z') });
assert.match(contract, /MathMaster Assignment V5/);
assert.match(contract, /"sections"/);
assert.match(contract, /studentWorksheetPdf/);
assert.match(contract, /assessment fidelity/i);
assert.doesNotMatch(contract, /compile V5 intent into its internal V4|Return.*V4/i);

const fixRequest = buildFixRequest({
  rawJson: JSON.stringify(parsed.assignmentV5),
  errors: ['Question 1 is missing required mathematical data.'],
  warnings: ['Question 1 alignment needs teacher review.'],
});
assert.match(fixRequest, /MathMaster Assignment V5/);
assert.match(fixRequest, /KEEP schemaVersion 5/);
assert.doesNotMatch(fixRequest, /Schema version is 4|Valid question types:/);

const graphAudit = auditStaticGraphViewport({
  xMin: 0, xMax: 7, yMin: 0, yMax: 140,
  functions: [{ type: 'exponential', a: 2, base: 2 }],
}, { strictBoundaryVisibility: true });
assert.deepEqual(graphAudit.errors, [], 'ordinary static viewport clipping remains handled by platform auto-fit');

console.log('authoringCompiler.test.mjs: canonical V5 assertions passed');
