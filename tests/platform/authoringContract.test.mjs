import assert from 'node:assert/strict';
import {
  AUTHORING_INTENT_SCHEMA_NAME,
  AUTHORING_INTENT_SCHEMA_VERSION,
  CONTRACT_SCHEMA_VERSION,
  PLATFORM_OWNED_FIELDS,
  buildAdvancedAuthoringContract,
  buildAuthoringContract,
  buildFixRequest,
} from '../../src/platform/contract/authoringContract.js';
import { SUPPORTED_QUESTION_TYPES } from '../../src/assignmentBlueprint.js';
import { TOOL_CATALOG_IDS } from '../../src/tools/toolCatalog.js';
import { ACTIVITY_ROLES } from '../../src/platform/policies/activityPolicies.js';
import { EXAM_DOMAIN_REGISTRY } from '../../src/platform/assessment/examDomainRegistry.js';
import { ALL_TEXAS_MATH_STANDARDS } from '../../src/texasStandards.js';

const v5 = buildAuthoringContract({ generatedAt: new Date('2026-08-12T00:00:00Z') });
const advanced = buildAdvancedAuthoringContract({ generatedAt: new Date('2026-08-12T00:00:00Z') });

// --- teacher-facing contract is V5 mathematical intent, not renderer schema ---
{
  assert.ok(v5.includes(AUTHORING_INTENT_SCHEMA_NAME));
  assert.ok(v5.includes(`"schemaVersion": ${AUTHORING_INTENT_SCHEMA_VERSION}`));
  assert.match(v5, /Do not choose MathMaster React components, V4 question types\/toolIds/);
  assert.match(v5, /KEEP schemaVersion 5/);
  assert.match(v5, /completeTable \+ constructGraph \+ stateRange \+ classifyContinuity/);
  assert.match(v5, /Return exactly one JSON object with `schemaVersion: 5`/);
  assert.doesNotMatch(v5, /Valid question types:/, 'outside AI should not be taught renderer type plumbing');
  ['constructGraph', 'readGraph', 'completeTable', 'buildMapping', 'classifyContinuity'].forEach((action) => {
    assert.ok(v5.includes(action), `V5 contract lists student action ${action}`);
  });
  ALL_TEXAS_MATH_STANDARDS.filter((standard) => ['algebra1','algebra2'].includes(standard.courseId)).forEach((standard) => {
    assert.ok(v5.includes(standard.code), `V5 contract lists TEKS ${standard.code}`);
  });
  assert.match(v5, /## Honors \+ CCMR Practice/);
  assert.match(v5, /about 15%/);
  assert.match(v5, /assessmentContext/);
  assert.match(v5, /examStyle/);
  assert.match(v5, /TEKS → CCMR exam-style authoring crosswalk/);
  assert.match(v5, /A\.2B.*digitalSAT:algebra/);
}

// --- advanced/developer V4 contract still mirrors internal registries ---------
{
  SUPPORTED_QUESTION_TYPES.forEach((type) => {
    assert.ok(advanced.includes(type), `advanced contract lists question type ${type}`);
  });
  TOOL_CATALOG_IDS.forEach((toolId) => {
    assert.ok(advanced.includes(toolId), `advanced contract lists tool ${toolId}`);
  });
  Object.values(ACTIVITY_ROLES).forEach((role) => {
    assert.ok(advanced.includes(`"${role}"`), `advanced contract lists activity role ${role}`);
  });
  Object.entries(EXAM_DOMAIN_REGISTRY).forEach(([framework, domains]) => {
    assert.ok(advanced.includes(framework), `advanced contract lists framework ${framework}`);
    domains.forEach((domain) => assert.ok(advanced.includes(`"${domain.id}"`), `advanced contract lists ${framework} domain ${domain.id}`));
  });
  PLATFORM_OWNED_FIELDS.forEach((field) => assert.ok(advanced.includes(`\`${field}\``), `advanced contract forbids ${field}`));
  assert.ok(advanced.includes(`Schema version: ${CONTRACT_SCHEMA_VERSION}`));
  // The Honors/CCMR assertions live in the V5 block above, which is the
  // contract that carries that section. Four copies of them were pasted here
  // as well, against `advanced`, where the section does not exist — three
  // passed by coincidence on strings that appear elsewhere in a contract six
  // times the length, and the fourth failed. Duplicating an assertion under
  // the wrong subject is how a passing suite stops meaning anything.
}

// --- nothing garbled --------------------------------------------------------
{
  const holePattern = /(^\s*-\s*undefined)|(—\s*undefined\s*$)|("undefined")|(:\s*undefined)|(\bNaN\b)|(\[object Object\])/;
  [v5, advanced].forEach((contract) => {
    const bad = contract.split('\n').filter((line) => holePattern.test(line));
    assert.deepEqual(bad, [], `no template holes: ${bad.slice(0, 3).join(' | ')}`);
  });
}

// --- fix requests stay in the source authoring language ---------------------
{
  const rawV4 = '{"questions":[{"type":"nope"}]}';
  const fixV4 = buildFixRequest({
    rawJson: rawV4,
    errors: ['Question 1 uses unsupported type nope.'],
    warnings: ['Question 1 has no primary alignment.'],
  });
  assert.ok(fixV4.includes(rawV4));
  assert.ok(fixV4.includes('Question 1 uses unsupported type nope.'));
  assert.ok(!fixV4.includes('Question 1 has no primary alignment.'), 'alignment warnings stay in teacher review');
  assert.match(fixV4, /Fix \*\*only\*\* the problems listed/);
  assert.ok(fixV4.includes(SUPPORTED_QUESTION_TYPES[0]));

  const rawV5 = '{"schemaVersion":5,"assignment":{"title":"x"},"questions":[]}';
  const fixV5 = buildFixRequest({ rawJson: rawV5, errors: ['Mathematical data is missing.'], sourceSchemaVersion: 5 });
  assert.match(fixV5, /Fix this MathMaster Authoring Intent V5 JSON/);
  assert.match(fixV5, /KEEP `schemaVersion: 5`/);
  assert.doesNotMatch(fixV5, /Valid question types:/);
  assert.doesNotMatch(fixV5, /Schema version is 4/);

  const empty = buildFixRequest({});
  assert.ok(typeof empty === 'string' && empty.length > 0);
  assert.doesNotThrow(() => buildFixRequest({ errors: 'single error', rawJson: null }));
}

console.log('authoringContract.test.mjs: all assertions passed');
