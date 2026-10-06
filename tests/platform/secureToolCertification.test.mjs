/*
 * WHICH RICH TOOLS MAY RUN ON A SECURE TEST.
 *
 * Certification is data (secureToolCertification.mjs), asked by preflight,
 * issuance and the teacher's blueprint view alike. These tests pin the rules
 * that make a certification mean something:
 *
 *   - only a tool with a public/private Path Tool Contract can be certified —
 *     without the per-tool allowlist the secure runtime could only send the
 *     whole question, answer included;
 *   - an uncertified tool is named, with the reason, rather than "unknown";
 *   - a family is certified from the INSTANCES it generates, because a
 *     generator can change the tool between variants;
 *   - a tool's assessment settings are forced on the payload in secure modes
 *     only (Step Algebra never auto-simplifies on a Test).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { PATH_TOOL_IDS } from '../../functions/shared/pathToolContracts.mjs';
import {
  SECURE_CYCLE_MODES,
  SECURE_TOOL_CERTIFICATIONS,
  applySecureToolSettings,
  certifySecureFamily,
  certifySecureItem,
  isSecureToolCertified,
  resolveSecureToolId,
  secureItemCaveats,
} from '../../functions/shared/secureToolCertification.mjs';
import { TOOL_CATALOG_IDS } from '../../src/tools/toolCatalog.js';

test('every certified tool has a public/private Path Tool Contract', () => {
  Object.keys(SECURE_TOOL_CERTIFICATIONS).forEach((toolId) => {
    assert.ok(PATH_TOOL_IDS.includes(toolId), `${toolId} is certified without a Path Tool Contract`);
  });
});

test('every Path Tool Contract tool is certified for every Test Cycle mode', () => {
  PATH_TOOL_IDS.forEach((toolId) => {
    SECURE_CYCLE_MODES.forEach((mode) => {
      assert.equal(isSecureToolCertified(toolId, mode), true, `${toolId} not certified for ${mode}`);
    });
  });
});

test('a registry tool with no contract is refused by name, with the reason', () => {
  const uncontracted = TOOL_CATALOG_IDS.filter((toolId) => !PATH_TOOL_IDS.includes(toolId) && !['functionInvestigation2', 'stepAlgebra2'].includes(toolId));
  assert.ok(uncontracted.length > 5, 'the catalog still has uncontracted tools to check');
  uncontracted.forEach((toolId) => {
    const verdict = certifySecureItem({ type: toolId });
    assert.equal(verdict.compatible, false, toolId);
    assert.equal(verdict.kind, 'richTool');
    assert.match(verdict.reason, /no public\/private Path Tool Contract/);
    assert.doesNotMatch(verdict.label, /^Response fields$/);
  });
  assert.match(certifySecureItem({ type: 'transformationsLab' }).reason, /^Transformations Lab /);
});

test('a question with no tool is the field-graded kind every secure Test has issued, and stays compatible', () => {
  const verdict = certifySecureItem({ prompt: 'compute 2 + 3', responseFields: [{ id: 'answer', expected: '5' }] });
  assert.equal(verdict.compatible, true);
  assert.equal(verdict.kind, 'fields');
  assert.equal(verdict.toolId, null);
  // `questionType: "response"` is a category, not a tool.
  assert.equal(certifySecureItem({ questionType: 'response', responseFields: [] }).kind, 'fields');
});

test('the tool is read the way the issuing server reads it: pathToolId, toolId or type, canonicalised', () => {
  assert.equal(resolveSecureToolId({ type: 'graphing2' }), 'graphing2');
  assert.equal(resolveSecureToolId({ type: 'functionGraph' }), 'functionInvestigation');
  assert.equal(resolveSecureToolId({ toolId: 'dataModeling' }), 'dataModelingLab');
  assert.equal(resolveSecureToolId({ pathToolId: 'relationMapping', type: 'ignored' }), 'relationMapping');
  assert.equal(resolveSecureToolId({ type: 'sequenceExplorer' }), 'sequenceExplorer');
});

test('a family is certified from the instances it makes: one uncertified variant fails it', () => {
  const allGraphing = certifySecureFamily({ id: 'f' }, { instances: [{ type: 'graphing2' }, { type: 'graphing2' }] });
  assert.equal(allGraphing.modes.secureTest.compatible, true);
  assert.deepEqual(allGraphing.toolIds, ['graphing2']);

  const mixed = certifySecureFamily({ id: 'f' }, { instances: [{ type: 'graphing2' }, { type: 'transformationsLab' }] });
  SECURE_CYCLE_MODES.forEach((mode) => assert.equal(mixed.modes[mode].compatible, false, mode));
  assert.deepEqual(mixed.toolIds.sort(), ['graphing2', 'transformationsLab']);
  assert.equal(mixed.devices.chromebook, false);

  // Without sampled instances the family document itself is certified.
  assert.deepEqual(certifySecureFamily({ id: 'g', type: 'intervalNumberLine' }).toolIds, ['intervalNumberLine']);
});

test('secure settings are forced onto the payload in secure modes only', () => {
  const payload = { pathToolId: 'stepAlgebra', tool: { equation: '2x + 3 = 9', workspaceDifficulty: 1, supportLevel: 1 } };
  const secure = applySecureToolSettings(payload, { secure: true });
  // Level 1 does the opposite-side arithmetic for the student: never on a Test.
  assert.equal(secure.tool.workspaceDifficulty, 5);
  assert.equal(secure.tool.supportLevel, 5);
  assert.equal(secure.tool.equation, '2x + 3 = 9');
  assert.equal(applySecureToolSettings(payload, { secure: false }).tool.workspaceDifficulty, 1);
  // A tool with nothing to force is returned as is.
  const graph = { pathToolId: 'graphing2', tool: { mode: 'twoPoints' } };
  assert.equal(applySecureToolSettings(graph, { secure: true }), graph);
});

test('device claims: phone is claimed only for tools exercised there', () => {
  assert.equal(SECURE_TOOL_CERTIFICATIONS.graphing2.devices.phone, false);
  assert.equal(SECURE_TOOL_CERTIFICATIONS.stepAlgebra.devices.phone, true);
  Object.values(SECURE_TOOL_CERTIFICATIONS).forEach((entry) => {
    assert.equal(entry.devices.chromebook, true);
    assert.equal(entry.devices.ipad, true);
  });
});

test('caveats a teacher should read: technology on a no-calculator Test, and a mapping diagram that shows the domain', () => {
  assert.equal(secureItemCaveats({ type: 'dataModeling' }, { blueprintCalculatorMode: 'questionSpecific' }).length, 0);
  assert.match(secureItemCaveats({ type: 'dataModeling' }, { blueprintCalculatorMode: 'none' })[0], /computes regression/);
  assert.match(secureItemCaveats({ type: 'relationMapping', ask: ['mapping', 'domain'] })[0], /not independent evidence/);
  assert.equal(secureItemCaveats({ type: 'relationMapping', ask: ['mapping', 'isFunction'] }).length, 0);
  assert.equal(secureItemCaveats({ type: 'graphing2' }).length, 0);
});
