/*
 * PREFLIGHT KNOWS WHETHER EVERY SECURE QUESTION CAN BE TAKEN WITH ITS TOOL.
 *
 * "Can the server grade this family?" was already a preflight check. "Can a
 * student answer it securely, with the tool it needs?" was not — a graphing
 * family passed, then reached the student as a bare text box. These tests pin
 * the second question: the secure rendering contract of every blueprint
 * target, the teacher-facing sentences, a target's required tool, and that a
 * Retest keeps the tool as part of what "equivalent" means.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { TEST_CYCLE_DIAGNOSTIC, preflightTestCycle } from '../../functions/shared/testCyclePreflight.mjs';
import { blueprintEquivalenceSignature, describeFamily } from '../../functions/shared/testCycleBlueprint.mjs';
import { buildRetestBlueprint, retestRigorIsPreserved } from '../../functions/shared/testCycleRetest.mjs';
import { normalizeTestCyclePolicy } from '../../functions/shared/testCyclePolicy.mjs';

const generator = { parameters: { a: { type: 'int', min: 1, max: 9 } } };
const family = (id, extra = {}) => ({ id, active: true, validated: true, generator, ...extra });
const graphing = (id) => family(id, { type: 'graphing2', prompt: 'Graph it.' });
const fields = (id) => family(id, { prompt: 'Compute {{a}}.', responseFields: [{ id: 'answer', expected: '{{a}}' }] });
const transformations = (id) => family(id, { type: 'transformationsLab', prompt: 'Reflect it.' });

const issuable = (ids) => Object.fromEntries(ids.map((id) => [id, { issuable: true, reason: null }]));

const run = ({ targets, families, calculatorMode = 'questionSpecific', policy = { mode: 'testCycle' } }) => {
  const blueprint = { blueprintId: 'bp', title: 'Unit Test', calculatorMode, targets };
  return preflightTestCycle({
    assignment: { assessmentPolicy: policy, testBlueprint: blueprint, sections: [{ id: 'review', role: 'review' }] },
    blueprint,
    families,
    familyIssuability: issuable(families.map((entry) => entry.id)),
  });
};

const target = (targetId, familyIds, extra = {}) => ({
  targetId, alignmentKey: `texas:${targetId}`, questionCount: 1, anchor: true, familyIds, ...extra,
});

test('all secure questions renderable: the check passes and says how many', () => {
  const result = run({
    targets: [target('A.3C', ['g1', 'g2'], { toolId: 'graphing2', questionCount: 1 }), target('A.5A', ['f1', 'f2'])],
    families: [graphing('g1'), graphing('g2'), fields('f1'), fields('f2')],
  });
  const check = result.checks.find((entry) => entry.id === 'secureRendering');
  assert.equal(check.passed, true);
  assert.equal(check.label, 'All 2 secure questions can render using their required MathMaster tools');
  assert.equal(result.blocked, false, result.errors.join('\n'));
});

test('an uncertified tool blocks publication, naming the target, the tool and every mode in one sentence', () => {
  const result = run({
    targets: [target('A.5C', ['t1', 't2'])],
    families: [transformations('t1'), transformations('t2')],
  });
  assert.equal(result.blocked, true);
  const errors = result.errors.filter((error) => error.startsWith(TEST_CYCLE_DIAGNOSTIC.TOOL_NOT_CERTIFIED));
  assert.equal(errors.length, 2, 'one sentence per family, not one per mode');
  assert.match(errors[0], /Target texas:A\.5C contains a Transformations Lab family \(t1\) that has not been certified for Secure Test, Secure Retest or Corrections mode/);
  assert.equal(result.checks.find((entry) => entry.id === 'secureRendering').passed, false);
});

test('a target that requires a tool refuses a family that renders with another', () => {
  const result = run({
    targets: [target('A.3C', ['g1', 'f1'], { toolId: 'graphing2' })],
    families: [graphing('g1'), fields('f1')],
  });
  const mismatch = result.errors.find((error) => error.startsWith(TEST_CYCLE_DIAGNOSTIC.TOOL_REQUIREMENT_MISMATCH));
  assert.match(mismatch, /requires Graphing, but family f1 renders with response fields/);
  assert.equal(result.blocked, true);
});

test('a required tool is read through the alias the server resolves (functionGraph is Function Investigation)', () => {
  const result = run({
    targets: [target('A.7A', ['fi1', 'fi2'], { toolId: 'functionGraph' })],
    families: [family('fi1', { type: 'functionInvestigation' }), family('fi2', { type: 'functionInvestigation' })],
  });
  assert.equal(result.errors.filter((error) => error.includes('TOOL_')).length, 0, result.errors.join('\n'));
});

test('a target with no required tool whose families mix tools is a warning, not a block (existing cycles keep working)', () => {
  const result = run({ targets: [target('A.2A', ['g1', 'f1'])], families: [graphing('g1'), fields('f1')] });
  assert.equal(result.errors.filter((error) => error.includes('TOOL_')).length, 0);
  assert.ok(result.warnings.some((warning) => /different tools \(Graphing, Response fields\)/.test(warning)));
});

test('the secure rendering contract is reported per target for the teacher\'s blueprint view', () => {
  const result = run({
    targets: [target('A.3C', ['g1', 'g2'], { toolId: 'graphing2', dok: 3, difficultyBand: 4, representation: 'graph' })],
    families: [graphing('g1'), graphing('g2')],
  });
  const [entry] = result.secureRendering;
  assert.equal(entry.requiredToolLabel, 'Graphing');
  assert.deepEqual(entry.toolLabels, ['Graphing']);
  assert.deepEqual(entry.modes, { secureTest: true, secureRetest: true, corrections: true });
  assert.equal(entry.devices.chromebook, true);
  assert.equal(entry.devices.phone, false);
  assert.equal(entry.dok, 3);
  assert.equal(entry.representation, 'graph');
});

test('server-sampled instance certification wins over the family document', () => {
  const blueprint = { blueprintId: 'bp', targets: [target('A.1', ['v1', 'v2'])] };
  const families = [graphing('v1'), graphing('v2')];
  const result = preflightTestCycle({
    assignment: { assessmentPolicy: { mode: 'testCycle' }, testBlueprint: blueprint, sections: [{ role: 'review' }] },
    blueprint,
    families,
    familyIssuability: {
      v1: { issuable: true, secure: { toolIds: ['graphing2'], labels: ['Graphing'], modes: { secureTest: { compatible: true, reasons: [] }, secureRetest: { compatible: true, reasons: [] }, corrections: { compatible: true, reasons: [] } }, devices: {} } },
      // A generator variant of v2 turned out to render Transformations Lab.
      v2: { issuable: true, secure: { toolIds: ['graphing2', 'transformationsLab'], labels: ['Graphing', 'Transformations Lab'], modes: { secureTest: { compatible: false, reasons: ['Transformations Lab has no contract.'] }, secureRetest: { compatible: false, reasons: [] }, corrections: { compatible: false, reasons: [] } }, devices: {} } },
    },
  });
  assert.ok(result.errors.some((error) => /family \(v2\)/.test(error) && /Transformations Lab has no contract\./.test(error)));
});

test('an external-original cycle is not checked for Corrections, which it does not have', () => {
  const policy = { mode: 'testCycle', externalAssessment: { source: 'District' } };
  const result = run({ targets: [target('A.3C', ['g1', 'g2'])], families: [graphing('g1'), graphing('g2')], policy });
  assert.deepEqual(Object.keys(result.secureRendering[0].modes).sort(), ['secureRetest', 'secureTest']);
});

test('technology on a no-calculator Test is a warning the teacher reads', () => {
  const lab = (id) => family(id, { type: 'dataModelingLab', mode: 'correlation', points: [[0, 1], [1, 2], [2, 2.5], [3, 4]] });
  const result = run({ targets: [target('A.4A', ['d1', 'd2'])], families: [lab('d1'), lab('d2')], calculatorMode: 'none' });
  assert.ok(result.warnings.some((warning) => /computes regression, correlation and residual error/.test(warning)));
});

test('a bank family declares its tool in `type`, and the blueprint now sees it', () => {
  // The descriptor used to read only toolId/pathToolId, so every bank graphing
  // family described itself as tool-less.
  assert.equal(describeFamily({ id: 'x', type: 'graphing2' }).toolId, 'graphing2');
  assert.equal(describeFamily({ id: 'y', type: 'functionGraph' }).toolId, 'functionInvestigation');
  assert.equal(describeFamily({ id: 'z', responseFields: [] }).toolId, null);
});

test('a Retest keeps the tool: it is part of the equivalence signature and of the rigor check', () => {
  const blueprint = {
    blueprintId: 'bp',
    targets: [
      target('A.3C', ['g1', 'g2', 'g3'], { toolId: 'graphing2', questionCount: 2, representation: 'graph' }),
      target('A.5A', ['f1', 'f2', 'f3'], { questionCount: 2, anchor: false }),
    ],
  };
  assert.ok(blueprintEquivalenceSignature(blueprint)[0].includes('graphing2'));
  const policy = normalizeTestCyclePolicy({ mode: 'testCycle' });
  const profile = {
    targets: [
      { targetId: 'A.3C', alignmentKey: 'texas:A.3C', mastered: false, score: 0, attempted: 2, slots: [] },
      { targetId: 'A.5A', alignmentKey: 'texas:A.5A', mastered: true, score: 1, attempted: 2, slots: [] },
    ],
    seenFamilyIds: [],
    seenInstanceIds: [],
  };
  const generated = buildRetestBlueprint({ blueprint, profile, policy });
  assert.ok(generated, 'a retest blueprint was built');
  const graphTarget = generated.blueprint.targets.find((entry) => entry.sourceTargetId === 'A.3C');
  assert.equal(graphTarget.toolId, 'graphing2', 'the missed graphing skill is retested on the graphing tool');
  assert.equal(retestRigorIsPreserved(blueprint, generated.blueprint).preserved, true);

  // A retest that swapped the tool for a text box is a rigor violation.
  const degraded = { ...generated.blueprint, targets: generated.blueprint.targets.map((entry) => ({ ...entry, toolId: null })) };
  const verdict = retestRigorIsPreserved(blueprint, degraded);
  assert.equal(verdict.preserved, false);
  assert.ok(verdict.violations.some((violation) => violation.reason === 'tool_changed'));
});
