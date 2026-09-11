import { WORK_VIEW_INVENTORY } from './workViewInventory.js';

// Stage 4's machine-readable production-certification boundary. Device ids are
// stable artifact paths; dimensions are the viewports students actually use.
export const WORK_VIEW_CERTIFICATION_DEVICES = Object.freeze([
  { id: 'chromebook', viewportWidth: 1366, viewportHeight: 768, mobile: false },
  { id: 'laptop', viewportWidth: 1440, viewportHeight: 900, mobile: false },
  { id: 'tablet-portrait', viewportWidth: 768, viewportHeight: 1024, mobile: true },
  { id: 'tablet-landscape', viewportWidth: 1024, viewportHeight: 768, mobile: true },
  { id: 'iphone-portrait', viewportWidth: 390, viewportHeight: 844, mobile: true },
  { id: 'iphone-landscape', viewportWidth: 844, viewportHeight: 390, mobile: true },
  { id: 'android-narrow', viewportWidth: 360, viewportHeight: 800, mobile: true },
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

