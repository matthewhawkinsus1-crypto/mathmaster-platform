/*
 * THE GENERATED QUESTION FAMILY CAPABILITY REPORT.
 *
 * docs/question-families/ is generated from every registered family version
 * (functions/shared/questionFamilyCapabilities.mjs) and must never drift from
 * it; what a family declares about itself must agree with its own knobs; and
 * every claim the report makes for the new families (server grading, Recovery,
 * capacity, reduced complexity) is computed, not written.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  CAPABILITY_REFERENCE_CLASS,
  buildQuestionFamilyCapabilityReport,
} from '../../functions/shared/questionFamilyCapabilities.mjs';
import { allRegisteredQuestionFamilies } from '../../functions/shared/questionFamilyRegistry.mjs';
import {
  CAPABILITY_JSON_PATH,
  CAPABILITY_MARKDOWN_PATH,
  renderQuestionFamilyCapabilityJson,
  renderQuestionFamilyCapabilityMarkdown,
} from '../../scripts/lib/questionFamilyCapabilityDocument.mjs';

const read = (relative) => readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');
const report = buildQuestionFamilyCapabilityReport();
const byKey = Object.fromEntries(report.families.map((family) => [`${family.id}@${family.version}`, family]));

test('the committed report is generated from the live registry, never hand-edited', () => {
  assert.equal(read(CAPABILITY_MARKDOWN_PATH), renderQuestionFamilyCapabilityMarkdown(report), `${CAPABILITY_MARKDOWN_PATH} is stale: run node scripts/report-question-family-capabilities.mjs --write`);
  assert.equal(read(CAPABILITY_JSON_PATH), renderQuestionFamilyCapabilityJson(report), `${CAPABILITY_JSON_PATH} is stale: run node scripts/report-question-family-capabilities.mjs --write`);
});

test('every registered family version appears exactly once', () => {
  const registered = allRegisteredQuestionFamilies().map((family) => `${family.id}@${family.version}`).sort();
  assert.deepEqual(Object.keys(byKey).sort(), registered);
  assert.equal(report.families.length, registered.length);
});

test('what a family declares about itself agrees with its own knobs', () => {
  for (const family of report.families) {
    const knob = (name) => family.constraints.find((entry) => entry.name === name);
    if (family.solutionCases && knob('solutionCase')) assert.deepEqual(family.solutionCases, knob('solutionCase').values, `${family.id}@${family.version} solution cases`);
    if (family.coefficientForms && knob('coefficientForm')) assert.deepEqual(family.coefficientForms, knob('coefficientForm').values, `${family.id}@${family.version} coefficient forms`);
    if (family.solutionForms && knob('solutionForm')) assert.deepEqual(family.solutionForms, knob('solutionForm').values, `${family.id}@${family.version} solution forms`);
    family.conceptConstraints.forEach((name) => assert.equal(knob(name).concept, true));
    family.reducedComplexity.forEach((support) => {
      Object.keys(support.narrows).forEach((name) => assert.ok(!family.conceptConstraints.includes(name), `${family.id}: a support never narrows a concept`));
    });
  }
});

test('the new versions: pinned only, strict, server-graded, Recovery-ready, and enough for a class', () => {
  const expected = {
    'linear.multiStepEquation@2': { cases: ['one', 'none', 'infinite', 'mixed'], tool: 'stepAlgebra', mode: 'equation' },
    'linear.twoStepEquation@2': { cases: ['one'], tool: 'stepAlgebra', mode: 'equation' },
    'systems.algebraic2x2@1': { cases: ['one', 'none', 'infinite', 'mixed'], tool: 'systemsWorkspace', mode: 'algebraic' },
  };
  for (const [key, want] of Object.entries(expected)) {
    const family = byKey[key];
    assert.equal(family.constraintPolicy, 'strict', key);
    assert.deepEqual(family.solutionCases, want.cases, key);
    assert.deepEqual(family.tools.map((tool) => [tool.tool, tool.mode, tool.serverGraded, tool.authority]), [[want.tool, want.mode, true, 'shared-server-authoritative']], key);
    assert.equal(family.recovery.ready, true, key);
    family.capacity.forEach((profile) => assert.ok(profile.capacity >= CAPABILITY_REFERENCE_CLASS * 10, `${key} ${profile.label}: ${profile.capacity}`));
    assert.equal(family.classOf30, 'every student unique');
    assert.ok(family.reducedComplexity.length > 0, `${key}: reduced complexity is described`);
  }
  assert.equal(byKey['linear.multiStepEquation@2'].unpinnedReferenceMeansThisVersion, false, 'v2 is used only when a slot pins it');
  assert.equal(byKey['linear.twoStepEquation@2'].unpinnedReferenceMeansThisVersion, false);
  assert.equal(byKey['linear.multiStepEquation@1'].unpinnedReferenceMeansThisVersion, true, 'an unpinned slot still means v1');
  assert.equal(byKey['linear.multiStepEquation@1'].constraintPolicy, 'fallback', 'v1 keeps its behaviour');
  // A mixed setting is measured as the balanced part of its case lists.
  const mixed = byKey['linear.multiStepEquation@2'].capacity.find((profile) => profile.label === 'solutionCase: "mixed"');
  assert.equal(mixed.strata.length, 6);
  const smallest = Math.min(...mixed.strata.map((entry) => entry.capacity));
  assert.equal(mixed.capacity, smallest * mixed.strata.length);
});

test('the summary rows a reader sees for the new versions', () => {
  const markdown = read(CAPABILITY_MARKDOWN_PATH);
  assert.match(markdown, /\| `linear\.multiStepEquation` \| v2 · only when pinned \(`"version": 2`\) \| one, none, infinite, mixed \| integer, fraction \| `stepAlgebra` \(equation\) \| yes — shared server grader \| yes \|/);
  assert.match(markdown, /\| `systems\.algebraic2x2` \| v1 · what an unpinned reference means \| one, none, infinite, mixed \| integer \| `systemsWorkspace` \(algebraic\) \| yes — shared server grader \| yes \|/);
  assert.match(markdown, /never changes `solutionCase`, `distribute`, `solutionForm`, `coefficientForm`/);
});
