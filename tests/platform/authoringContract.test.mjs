import assert from 'node:assert/strict';
import {
  CONTRACT_SCHEMA_VERSION,
  PLATFORM_OWNED_FIELDS,
  buildAuthoringContract,
  buildFixRequest,
} from '../../src/platform/contract/authoringContract.js';
import { SUPPORTED_QUESTION_TYPES } from '../../src/assignmentBlueprint.js';
import { TOOL_CATALOG_IDS } from '../../src/tools/toolCatalog.js';
import { ACTIVITY_ROLES } from '../../src/platform/policies/activityPolicies.js';
import { EXAM_DOMAIN_REGISTRY } from '../../src/platform/assessment/examDomainRegistry.js';
import { ALL_TEXAS_MATH_STANDARDS } from '../../src/texasStandards.js';

const contract = buildAuthoringContract({ generatedAt: new Date('2026-08-09T00:00:00Z') });

// --- the contract is generated from the real registries, not a copy ---------
{
  SUPPORTED_QUESTION_TYPES.forEach((type) => {
    assert.ok(contract.includes(type), `contract lists question type ${type}`);
  });
  TOOL_CATALOG_IDS.forEach((toolId) => {
    assert.ok(contract.includes(toolId), `contract lists tool ${toolId}`);
  });
  Object.values(ACTIVITY_ROLES).forEach((role) => {
    assert.ok(contract.includes(`"${role}"`), `contract lists activity role ${role}`);
  });
  Object.entries(EXAM_DOMAIN_REGISTRY).forEach(([framework, domains]) => {
    assert.ok(contract.includes(framework), `contract lists framework ${framework}`);
    domains.forEach((domain) => {
      assert.ok(contract.includes(`"${domain.id}"`), `contract lists ${framework} domain ${domain.id}`);
    });
  });
  // Every active TEKS code is enumerated so the AI never invents one.
  ALL_TEXAS_MATH_STANDARDS.forEach((standard) => {
    assert.ok(contract.includes(standard.code), `contract lists TEKS ${standard.code}`);
  });
}

// --- required sections ------------------------------------------------------
{
  const required = [
    'Top-level structure', 'Question structure', 'Question and tool types',
    'Interactive tool types', 'Activity roles', 'Depth of Knowledge',
    'Difficulty bands', 'Calculator', 'Response types', 'Generator fields',
    'Modeling lab format', 'Alignments', 'Exam frameworks and their domain ids',
    'Assessment context', 'Active TEKS codes', 'Dates and times',
    'Fields you must never invent', 'Honors', 'Output rules',
  ];
  required.forEach((heading) => {
    assert.ok(contract.includes(`## ${heading}`), `contract has a "${heading}" section`);
  });
}

// --- the policy boundary is stated ------------------------------------------
{
  PLATFORM_OWNED_FIELDS.forEach((field) => {
    assert.ok(contract.includes(`\`${field}\``), `contract forbids inventing ${field}`);
  });
  assert.match(contract, /Do not designate students or destination classes as Honors/,
    'contract states the Honors boundary');
  assert.match(contract, /destination-class configuration/,
    'contract says the destination class is authoritative for Honors');
  assert.match(contract, /one valid JSON object and nothing else/i,
    'contract demands a single JSON object');
  assert.match(contract, /supply the TEKS alignment only/i,
    'contract tells the AI not to pad all five frameworks');
  assert.ok(contract.includes(`Schema version: ${CONTRACT_SCHEMA_VERSION}`), 'contract states its version');
}

// --- nothing garbled --------------------------------------------------------
{
  // "slope is zero or undefined" is real TEKS wording, so look for the shapes a
  // template hole actually takes rather than the bare word.
  const holePattern = /(^\s*-\s*undefined)|(—\s*undefined\s*$)|("undefined")|(:\s*undefined)|(\bNaN\b)|(\[object Object\])/;
  const bad = contract.split('\n').filter((l) => holePattern.test(l));
  assert.deepEqual(bad, [], `no template holes in the contract: ${bad.slice(0, 3).join(' | ')}`);
}

// --- fix request ------------------------------------------------------------
{
  const raw = '{"questions":[{"type":"nope"}]}';
  const fix = buildFixRequest({
    rawJson: raw,
    errors: ['Question 1 uses unsupported type nope.'],
    warnings: ['Question 1 has no primary alignment.'],
  });
  assert.ok(fix.includes(raw), 'fix request embeds the offending JSON');
  assert.ok(fix.includes('Question 1 uses unsupported type nope.'), 'fix request lists the validator error');
  assert.ok(fix.includes('Question 1 has no primary alignment.'), 'fix request lists warnings');
  assert.match(fix, /Fix \*\*only\*\* the problems listed/, 'fix request scopes the change');
  assert.match(fix, /return the complete corrected JSON/i, 'fix request asks for complete replacement JSON');
  assert.ok(fix.includes(SUPPORTED_QUESTION_TYPES[0]), 'fix request restates valid types');

  const empty = buildFixRequest({});
  assert.ok(typeof empty === 'string' && empty.length > 0, 'fix request survives empty input');
  assert.doesNotThrow(() => buildFixRequest({ errors: 'single error', rawJson: null }));
}

console.log('authoringContract.test.mjs: all assertions passed');
