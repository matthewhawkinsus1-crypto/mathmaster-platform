// src/config/executionMode.js as a production build resolves it
// (livePathRuntimeIsolation.mjs): the secure Firebase runtime, no sandbox.
import {
  EXECUTION_MODES,
  PATH_CONFIGURATION_MESSAGE,
  RUNTIME_EXECUTION_MODES,
  resolveExecutionMode,
} from '../../../src/config/executionModeResolution.js';

export { EXECUTION_MODES, PATH_CONFIGURATION_MESSAGE, RUNTIME_EXECUTION_MODES };

const resolution = Object.freeze(resolveExecutionMode({ configuredMode: EXECUTION_MODES.FIREBASE_PRODUCTION, isProductionBuild: true }));

export const getExecutionMode = () => resolution.mode;
export const isProductionExecution = () => resolution.mode === EXECUTION_MODES.FIREBASE_PRODUCTION;
export const isMockPathAllowed = () => resolution.mockAllowed === true && resolution.mode === EXECUTION_MODES.MOCK_LOCAL;
export const isExecutionMisconfigured = () => resolution.mode === EXECUTION_MODES.MISCONFIGURED;
export const getExecutionConfigurationMessage = () => resolution.message;
export const getExecutionModeDiagnostics = () => ({ ...resolution });
