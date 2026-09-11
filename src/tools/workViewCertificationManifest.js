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

const SCENE_CAPABILITY_OVERRIDES = Object.freeze({
  // The certification fixture intentionally uses plotTransform so Stage 4
  // exercises the real interactive camera/point workspace. Parameter-entry
  // modes are covered by the deeper Work View browser matrix
  // (transformations-match), so this scene does not pretend to expose an input.
  transformationsLab: Object.freeze([
    'undo', 'fitView', 'panZoom', 'pointEditing',
    'instruction', 'task', 'help', 'primaryActions', 'secondaryActions',
  ]),
});

export const WORK_VIEW_CERTIFICATION = Object.freeze(Object.fromEntries(
  Object.entries(WORK_VIEW_INVENTORY).map(([toolId, entry]) => {
    if (entry.status === 'exempt') {
      return [toolId, Object.freeze({ status: 'exempt', reason: entry.reason })];
    }
    const sceneCapabilities = SCENE_CAPABILITY_OVERRIDES[toolId] || entry.capabilities;
    const input = sceneCapabilities.some((capability) => ['numericControls', 'equationInput'].includes(capability));
    return [toolId, Object.freeze({
      status: 'certified',
      scene: `registry-${toolId}`,
      implementation: toolId,
      devices: WORK_VIEW_CERTIFICATION_DEVICES.map(({ id }) => id),
      sceneCapabilities: Object.freeze([...sceneCapabilities]),
      requiredBehaviors: [
        ...BASE_BEHAVIORS,
        ...(input ? ['inputRemainsReachable'] : []),
        ...(sceneCapabilities.includes('undo') ? ['singleOwnedUndo'] : []),
        ...(sceneCapabilities.includes('fitView') ? ['fitIsPresentationOnly'] : []),
      ],
    })];
  }),
));

