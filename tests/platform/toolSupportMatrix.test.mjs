// The compatibility matrix has to be true, not aspirational.
//
// WHAT THIS REPLACED. `toolCapabilities.js` declared eight `supports*` booleans
// for each tool. An audit of every consumer in the repository found none of
// them read by behavioural code — the only two consumers flattened them into a
// Markdown line for an AI prompt and a JSON dump on a developer bench. Nothing
// enforced them, so they drifted: all nineteen tools declared
// `supportsSolutionReview: true` while the review builder produced a review for
// six and null for the other thirteen. Four registry tools had no entry at all.
//
// A capability nobody enforces is a wish. These tests enforce the one flag that
// can be checked mechanically, and pin the derived matrix that replaces the
// rest.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  COMPAT, TOOLS_WITH_REAL_SOLUTION_REVIEW, KEYBOARD_OPERABLE,
  buildToolSupportMatrix, toolSupportRow, undeliverableSupports,
} from '../../src/platform/supports/toolSupportMatrix.js';
import { SUPPORT, resolveSupportEntitlements } from '../../functions/shared/supportEntitlements.mjs';
import { PATH_TOOL_IDS } from '../../functions/shared/pathToolContracts.mjs';

const capabilitiesSource = readFileSync(new URL('../../src/tools/toolCapabilities.js', import.meta.url), 'utf8');
const reviewSource = readFileSync(new URL('../../src/tools/shared/toolSolutionReview.js', import.meta.url), 'utf8');
const registrySource = readFileSync(new URL('../../src/tools/toolRegistry.js', import.meta.url), 'utf8');

const declaredTools = [...capabilitiesSource.matchAll(/^ {2}([A-Za-z0-9]+): \{/gm)].map((m) => m[1]);
const registryTools = [...registrySource.matchAll(/^ {2}([A-Za-z0-9]+):/gm)].map((m) => m[1]);

// --- The declared flags must match what the code does -------------------------

test('every registry tool has a capability entry', () => {
  const missing = registryTools.filter((id) => !declaredTools.includes(id));
  assert.deepEqual(missing, [],
    'getToolCapabilities returned undefined for these, so nothing could reason about them at all');
});

test('supportsSolutionReview matches what the review builder can actually produce', () => {
  // The builder is a switch. If a tool is not one of its branches it returns
  // null, and declaring otherwise tells a teacher a review exists that does not.
  const builderBranches = [...reviewSource.matchAll(/toolId === '([A-Za-z0-9]+)'/g)].map((m) => m[1]);
  assert.deepEqual(builderBranches.sort(), [...TOOLS_WITH_REAL_SOLUTION_REVIEW].sort(),
    'the matrix list must track the builder');

  const wrong = [];
  [...capabilitiesSource.matchAll(/^ {2}([A-Za-z0-9]+): \{[^}]*supportsSolutionReview: (true|false)/gm)]
    .forEach(([, toolId, declared]) => {
      // solutionReview2 IS the review renderer, so it legitimately declares
      // true without being one of the builder's branches.
      if (toolId === 'solutionReview2') return;
      const canProduce = builderBranches.includes(toolId);
      if ((declared === 'true') !== canProduce) wrong.push(`${toolId} declares ${declared}`);
    });
  assert.deepEqual(wrong, [], 'a capability flag that disagrees with the code is worse than no flag');
});

// --- The derived matrix -------------------------------------------------------

test('the matrix reports Path contract status from the contracts themselves', () => {
  PATH_TOOL_IDS.forEach((toolId) => {
    assert.equal(toolSupportRow(toolId).pathContracted, true, `${toolId} has a contract`);
  });
  assert.equal(toolSupportRow('dataModelingLab').pathContracted, false,
    'a tool with no server grader must not be reported as Path-ready');
});

test('a calculator is marked unsafe where the computation is the construct', () => {
  // An accommodation may provide access; it may not replace the thing being
  // assessed. The balance workspace exists so the student does the operation.
  assert.equal(toolSupportRow('stepAlgebra').supports[SUPPORT.CALCULATOR], COMPAT.UNSAFE);
  assert.equal(toolSupportRow('relationMapping').supports[SUPPORT.CALCULATOR], COMPAT.ENGINE);
});

test('a canvas tool does not claim read-aloud or contrast it cannot deliver', () => {
  // The Path support bar reads the prompt and the choices. It cannot read what
  // a tool has DRAWN, and telling a blind student otherwise is worse than
  // admitting the gap.
  const graph = toolSupportRow('functionInvestigation');
  assert.equal(graph.supports[SUPPORT.TEXT_TO_SPEECH], COMPAT.NEEDS_WORK);
  assert.equal(graph.supports[SUPPORT.HIGH_CONTRAST], COMPAT.NEEDS_WORK);
  // A typed-response tool has nothing painted, so the engine-level support is
  // the whole story there.
  assert.equal(toolSupportRow('multiAnswer').supports[SUPPORT.TEXT_TO_SPEECH], COMPAT.ENGINE);
});

test('every tool the Path can actually issue is keyboard operable', () => {
  // This is the one that decides whether a student can answer at all.
  const matrix = buildToolSupportMatrix(PATH_TOOL_IDS);
  assert.deepEqual(matrix.blockers.map((row) => row.toolId), [],
    'a Path-issuable tool that needs a mouse locks some students out of the question entirely');
});

test('the keyboard list does not silently drift from the accessibility work', () => {
  // Both of these gained a keyboard route in this pass; if either regresses,
  // the list must regress with it rather than keep asserting access.
  assert.ok(KEYBOARD_OPERABLE.includes('functionInvestigation'));
  assert.ok(KEYBOARD_OPERABLE.includes('stepAlgebra'));
});

test('the matrix answers what an administrator actually asks', () => {
  const entitlements = resolveSupportEntitlements({
    accommodations: ['text-to-speech', 'high-contrast', 'calculator'],
  });
  const onAGraph = undeliverableSupports('functionInvestigation', entitlements);
  assert.ok(onAGraph.includes(SUPPORT.TEXT_TO_SPEECH),
    'a student authorized for read-aloud meeting a graphing question is a fact somebody needs before the lesson');
  const onABalance = undeliverableSupports('stepAlgebra', entitlements);
  assert.ok(onABalance.includes(SUPPORT.CALCULATOR),
    'and so is a calculator that would replace the construct');
});

test('a student with no entitlements has nothing undeliverable', () => {
  assert.deepEqual(undeliverableSupports('functionInvestigation', resolveSupportEntitlements(null)), []);
});
