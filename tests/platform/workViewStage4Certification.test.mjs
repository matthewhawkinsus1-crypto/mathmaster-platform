import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOL_CATALOG_IDS } from '../../src/tools/toolCatalog.js';
import { WORK_VIEW_INVENTORY } from '../../src/tools/workViewInventory.js';
import { WORK_VIEW_CERTIFICATION, WORK_VIEW_CERTIFICATION_DEVICES } from '../../src/tools/workViewCertificationManifest.js';

test('Stage 4 classifies every registered tool and certifies every migrated implementation', () => {
  assert.deepEqual(Object.keys(WORK_VIEW_CERTIFICATION).sort(), [...TOOL_CATALOG_IDS].sort());
  const deviceIds = WORK_VIEW_CERTIFICATION_DEVICES.map(({ id }) => id);
  assert.deepEqual(deviceIds, ['chromebook', 'laptop', 'tablet-portrait', 'tablet-landscape', 'iphone-portrait', 'iphone-landscape', 'android-narrow']);
  for (const [toolId, inventory] of Object.entries(WORK_VIEW_INVENTORY)) {
    const certification = WORK_VIEW_CERTIFICATION[toolId];
    if (inventory.status === 'exempt') {
      assert.equal(certification.status, 'exempt');
      assert.ok(certification.reason.length > 20);
      continue;
    }
    assert.equal(certification.status, 'certified', `${toolId} needs a rendered Stage 4 scene`);
    assert.equal(certification.implementation, toolId, `${toolId} must render its own implementation`);
    assert.deepEqual(certification.devices, deviceIds, `${toolId} must run on the complete device matrix`);
    for (const behavior of ['opensWorkView', 'coversViewport', 'taskReachable', 'helpReachable', 'noOverflow', 'stateSurvivesPresentation']) {
      assert.ok(certification.requiredBehaviors.includes(behavior), `${toolId} lacks ${behavior}`);
    }
    assert.ok(Array.isArray(certification.sceneCapabilities) && certification.sceneCapabilities.length, `${toolId} needs scene capabilities`);
    certification.sceneCapabilities.forEach((capability) => {
      assert.ok(inventory.capabilities.includes(capability), `${toolId} scene cannot claim undeclared capability ${capability}`);
    });
    assert.equal(certification.requiredBehaviors.includes('singleOwnedUndo'), certification.sceneCapabilities.includes('undo'));
    assert.equal(
      certification.requiredBehaviors.includes('inputRemainsReachable'),
      certification.sceneCapabilities.some((capability) => ['numericControls', 'equationInput'].includes(capability)),
      `${toolId} input reachability must track the rendered scene`,
    );
    assert.equal(
      certification.requiredBehaviors.includes('fitIsPresentationOnly'),
      certification.sceneCapabilities.includes('fitView'),
      `${toolId} Fit View certification must track the rendered scene camera`,
    );
  }
});

test('Stage 4 device dimensions remain the production viewport contract', () => {
  assert.deepEqual(WORK_VIEW_CERTIFICATION_DEVICES.map(({ viewportWidth, viewportHeight }) => [viewportWidth, viewportHeight]), [
    [1366, 768], [1440, 900], [768, 1024], [1024, 768], [390, 844], [844, 390], [360, 800],
  ]);
});

