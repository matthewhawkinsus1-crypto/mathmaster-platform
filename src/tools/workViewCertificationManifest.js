import { WORK_VIEW_INVENTORY } from './workViewInventory.js';

// Stage 4's machine-readable production-certification boundary. Device ids are
// stable artifact paths; dimensions are the viewports students actually use.
export const WORK_VIEW_CERTIFICATION_DEVICES = Object.freeze([
  { id: 'chromebook', width: 1366, height: 768, mobile: false },
  { id: 'laptop', width: 1440, height: 900, mobile: false },
  { id: 'tablet-portrait', width: 768, height: 1024, mobile: true },
  { id: 'tablet-landscape', width: 1024, height: 768, mobile: true },
  { id: 'iphone-portrait', width: 390, height: 844, mobile: true },
  { id: 'iphone-landscape', width: 844, height: 390, mobile: true },
  { id: 'android-narrow', width: 360, height: 800, mobile: true },
]);

const BASE_BEHAVIORS = ['opensWorkView', 'coversViewport', 'taskReachable', 'helpReachable', 'noOverflow', 'stateSurvivesPresentation'];

export const WORK_VIEW_CERTIFICATION = Object.freeze(Object.fromEntries(
  Object.entries(WORK_VIEW_INVENTORY).map(([toolId, entry]) => {
    if (entry.status === 'exempt') {
      return [toolId, Object.freeze({ status: 'exempt', reason: entry.reason })];
    }
    const input = entry.capabilities.some((capability) => ['numericControls', 'equationInput'].includes(capability));
    return [toolId, Object.freeze({
      status: 'certified',
      scene: `registry-${toolId}`,
      implementation: toolId,
      devices: WORK_VIEW_CERTIFICATION_DEVICES.map(({ id }) => id),
      requiredBehaviors: [
        ...BASE_BEHAVIORS,
        ...(input ? ['inputRemainsReachable'] : []),
        ...(entry.capabilities.includes('undo') ? ['singleOwnedUndo'] : []),
        ...(entry.capabilities.includes('fitView') ? ['fitIsPresentationOnly'] : []),
      ],
    })];
  }),
));

