import assert from 'node:assert/strict';
import {
  normalizeAssignmentPackageMetadata,
  parseAssignmentBlueprintText,
  validateAssignmentQuestions,
} from '../../src/assignmentBlueprint.js';
import { auditStaticGraphViewport } from '../../src/graphSpecUtils.js';
import { buildAuthoringContract, buildFixRequest } from '../../src/platform/contract/authoringContract.js';

// This deliberately resembles the failure pattern in the Gemini transcript:
// Python wrapper, Python literals, concise standard shorthand, natural relation
// pairs, un-nested graph choice fields and a fixed visual in a personalized
// assignment. None of those deterministic details should require an AI retry.
const raw = `\`\`\`python
assignment = {
  "schemaVersion": 4,
  "assignment": {"title": "Compiler smoke test", "assignmentType": "notesClasswork", "variantMode": "personalized", "courseId": "algebra1"},
  "questions": [
    {"prompt":"Graph -3 ≤ x < 4.","standard":"A.2A","intervals":[{"min":-3,"max":4,"minClosed":True,"maxClosed":False}],"ask":["graph","notation"]},
    {"type":"relationMapping","prompt":"Represent the relation.","standard":"A.12A","pairs":[[-2,3],[1,2]],"ask":["mapping","isFunction"]},
    {"type":"graphScenarioMatch","prompt":"Match the story to the graph.","standard":"A.3C","scenarios":[{"id":"s1","text":"A quantity doubles."}],"graphs":[{"id":"g1","xMin":0,"xMax":7,"yMin":0,"yMax":140,"functions":[{"type":"linear","m":2,"b":0}]}],"correctMatches":{"s1":"g1"}}
  ]
}
print("done")
\`\`\``;

const parsed = parseAssignmentBlueprintText(raw);
assert.equal(parsed.questions.length, 3, 'the first complete JSON/Python-style object is extracted');
assert.ok(parsed.repairs.length >= 5, 'deterministic authoring plumbing is repaired locally');

const interval = parsed.questions[0];
assert.equal(interval.type, 'intervalNumberLine', 'an unambiguous common question type is inferred from its structure');
assert.equal(interval.intervals[0].minClosed, true, 'Python True is normalized');
assert.deepEqual(interval.ask, ['graph', 'interval'], 'notation alias is normalized');
assert.equal(interval.alignments[0].code, 'A.2A', 'standard shorthand compiles to a primary TEKS alignment');

const relation = parsed.questions[1];
assert.deepEqual(relation.pairs, [{ x: -2, y: 3 }, { x: 1, y: 2 }], 'nested relation arrays are made Firestore-safe');

const graphMatch = parsed.questions[2];
assert.ok(graphMatch.graphs[0].graph, 'loose graph fields are nested into the renderer shape');
assert.equal(graphMatch.graphs[0].graph.functions[0].type, 'line', 'static linear alias becomes line');
assert.equal(graphMatch.scenarios[0].description, 'A quantity doubles.', 'scenario wording alias is normalized');

assert.equal(validateAssignmentQuestions(parsed.questions).length, 3, 'the repaired questions pass structural validation without another AI round trip');
const metadata = normalizeAssignmentPackageMetadata(parsed.assignment, parsed.questions);
assert.equal(metadata.variantMode, 'personalized', 'fixed questions may coexist with personalized questions/assignments');

const graphAudit = auditStaticGraphViewport({
  xMin: 0, xMax: 7, yMin: 0, yMax: 140,
  functions: [{ type: 'exponential', a: 2, base: 2 }],
}, { strictBoundaryVisibility: true });
assert.deepEqual(graphAudit.errors, [], 'ordinary static viewport clipping is handled by platform auto-fit');

console.log('authoringCompiler.test.mjs: all assertions passed');


const compactA1 = buildAuthoringContract({ courseId: 'algebra1', generatedAt: new Date('2026-08-11T00:00:00Z') });
assert.ok(compactA1.includes('\"standard\": \"A.3C\"'), 'the compact contract teaches concise question-level standards');
assert.ok(compactA1.includes('A.3C'), 'the selected course TEKS are included');
assert.ok(!compactA1.includes('A2.1A'), 'Algebra II standards are omitted from an Algebra I authoring prompt');
assert.ok(compactA1.includes('schemaVersion\": 5') || compactA1.includes('schemaVersion": 5') || compactA1.includes('\"schemaVersion\": 5'), 'the default contract is Authoring Intent V5');
// The compact contract is the prompt a teacher pastes into an AI, so its length
// is a real constraint and not a formality. The ceiling moved from 20,000 to
// 28,000 when the TEKS → CCMR crosswalk was added: for Algebra I that table is
// 5,330 characters on its own, and it is what tells an authoring AI which
// framework/domain pairs are legitimate — without it the exam-style items it
// writes cannot be trusted. Measured 18,779 before, 26,033 after, so this keeps
// roughly the same headroom it always had rather than removing the guard.
assert.ok(compactA1.length < 28000, `the default course-specific authoring prompt stays compact (was ${compactA1.length})`);

const fixRequest = buildFixRequest({
  rawJson: '{"schemaVersion":4}',
  errors: ['Question 2 is missing a graph.'],
  warnings: ['Question 11 alignment 1 uses TEKS code A.2L, which is not in the active catalogue.'],
});
assert.ok(fixRequest.includes('missing a graph'), 'true authoring errors remain in the AI fix request');
assert.ok(!fixRequest.includes('A.2L'), 'TEKS/alignment warnings stay in teacher Preflight rather than inviting AI guessing');


const choiceAuthoring = parseAssignmentBlueprintText(JSON.stringify([{
  prompt: 'Choose the family.',
  standard: 'A.12A',
  answerFields: [{ id: 'family', label: 'Family', options: ['linear', 'quadratic'], answer: 'linear' }],
}]));
assert.equal(choiceAuthoring.questions[0].type, 'multiAnswer', 'answerFields infer a multiAnswer question');
assert.equal(choiceAuthoring.questions[0].answerFields[0].type, 'choice', 'explicit options automatically render as a choice control');

const setAuthoring = parseAssignmentBlueprintText(JSON.stringify([{
  type: 'multiAnswer',
  prompt: 'Express the integers as a finite set.',
  standard: 'A2.7A',
  answerFields: [
    { id: 'roster', label: 'Roster form', answer: '{-4, -3, -2, -1, 0, 1, 2}' },
    { id: 'count', label: 'Number of elements', answer: '7' },
  ],
}]));
assert.equal(setAuthoring.questions[0].answerFields[0].type, 'set', 'finite-set answers automatically receive set input/grading semantics');
assert.equal(setAuthoring.questions[0].answerFields[0].toolProfile, 'set', 'finite-set fields expose set-entry tools');
assert.equal(setAuthoring.questions[0].answerFields[1].type, undefined, 'ordinary numeric fields are not changed');
