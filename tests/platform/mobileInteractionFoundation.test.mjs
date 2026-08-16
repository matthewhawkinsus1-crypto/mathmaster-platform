import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOL_CATALOG_IDS } from '../../src/tools/toolCatalog.js';
import {
  COMPACT_PHONE_BREAKPOINT,
  MIN_TOUCH_TARGET_PX,
  extractEquationSymbols,
  getViewportSafePopoverLayout,
  isMobileInteractionViewport,
  placementInstructionForOperation,
  semanticPlacementFromTap,
} from '../../src/platform/mobile/mobileInteractionFoundation.js';
import { MOBILE_TOOL_PROFILES, MOBILE_WORKFLOW_SURFACES, auditMobileToolProfiles } from '../../src/platform/mobile/mobileToolProfiles.js';

test('every registered MathMaster tool has an explicit mobile interaction profile', () => {
  const audit = auditMobileToolProfiles();
  assert.deepEqual(audit.missing, []);
  assert.deepEqual(audit.extras, []);
  assert.deepEqual(audit.invalid, []);
  assert.equal(audit.valid, true);
  assert.equal(Object.keys(MOBILE_TOOL_PROFILES).length, TOOL_CATALOG_IDS.length);
});

test('every workflow surface that keeps drag also declares a tap/select-place path', () => {
  const dragSurfaces = Object.entries(MOBILE_WORKFLOW_SURFACES).filter(([, profile]) => profile.dragWithTapFallback);
  assert.ok(dragSurfaces.length >= 4);
  for (const [surface, profile] of dragSurfaces) {
    assert.match(profile.interaction, /tap/ , `${surface} must name its tap interaction`);
  }
});

test('mobile detection includes narrow viewports and coarse pointers', () => {
  assert.equal(isMobileInteractionViewport({ width: 390, pointerCoarse: false }), true);
  assert.equal(isMobileInteractionViewport({ width: 1200, pointerCoarse: true }), true);
  assert.equal(isMobileInteractionViewport({ width: 1200, pointerCoarse: false }), false);
  assert.equal(MIN_TOUCH_TARGET_PX, 44);
  assert.ok(COMPACT_PHONE_BREAKPOINT >= 560);
});

test('literal-equation keypad symbols come from the equation instead of a global alphabet', () => {
  assert.deepEqual(extractEquationSymbols('I = P*r*t', 'r'), ['I', 'P', 'r', 't']);
  assert.deepEqual(extractEquationSymbols('d = r*t'), ['d', 'r', 't']);
  assert.deepEqual(extractEquationSymbols('F = (9/5)*C + 32'), ['F', 'C']);
});

test('tap placement preserves mathematical position choices', () => {
  const rect = { left: 100, width: 200 };
  assert.equal(semanticPlacementFromTap({ operation: 'divide', clientX: 120, expressionRect: rect }), 'below');
  assert.equal(semanticPlacementFromTap({ operation: 'multiply', clientX: 120, expressionRect: rect }), 'before');
  assert.equal(semanticPlacementFromTap({ operation: 'multiply', clientX: 280, expressionRect: rect }), 'after');
  assert.equal(semanticPlacementFromTap({ operation: 'add', clientX: 120, expressionRect: rect }), 'side');
  assert.match(placementInstructionForOperation('divide'), /beneath/i);
});

test('narrow menus become viewport-safe bottom sheets and desktop popovers are clamped', () => {
  const phone = getViewportSafePopoverLayout({ viewportWidth: 390, viewportHeight: 740, anchorRect: { right: 80, bottom: 500 } });
  assert.equal(phone.mode, 'sheet');
  assert.equal(phone.left, 8);
  assert.equal(phone.right, 8);
  assert.ok(phone.maxHeight <= 724);

  const desktop = getViewportSafePopoverLayout({ viewportWidth: 1000, viewportHeight: 700, anchorRect: { right: 995, bottom: 680 }, preferredWidth: 220, preferredHeight: 260 });
  assert.equal(desktop.mode, 'popover');
  assert.ok(desktop.left >= 8 && desktop.left + desktop.width <= 992);
  assert.ok(desktop.top >= 8 && desktop.top + desktop.maxHeight <= 692);
});
