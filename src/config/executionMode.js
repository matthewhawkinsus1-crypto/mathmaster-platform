// The execution mode of THIS bundle.
//
// The decision itself lives in `executionModeResolution.js`, which is pure and
// testable. This file only reads the build's environment and freezes the
// answer, so every caller asks the same question once.

import {
  EXECUTION_MODES,
  PATH_CONFIGURATION_MESSAGE,
  RUNTIME_EXECUTION_MODES,
  resolveExecutionMode,
} from './executionModeResolution.js';

export { EXECUTION_MODES, PATH_CONFIGURATION_MESSAGE, RUNTIME_EXECUTION_MODES };

const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};

const resolution = Object.freeze(resolveExecutionMode({
  configuredMode: env.VITE_MATHMASTER_EXECUTION_MODE,
  // Vite sets PROD on any non-development build; a hosting provider that only
  // sets NODE_ENV is honoured too so a misconfigured pipeline still fails safe.
  isProductionBuild: Boolean(env.PROD) || String(env.MODE || env.NODE_ENV || '').toLowerCase() === 'production',
  allowMockInProduction: env.VITE_MATHMASTER_ALLOW_MOCK_PATH,
}));

export const getExecutionMode = () => resolution.mode;

export const isProductionExecution = () => resolution.mode === EXECUTION_MODES.FIREBASE_PRODUCTION;

/** True only when a sandbox Path runtime is legitimately available. */
export const isMockPathAllowed = () => resolution.mockAllowed === true
  && resolution.mode === EXECUTION_MODES.MOCK_LOCAL;

/** True when nothing valid was configured and the Path must refuse to run. */
export const isExecutionMisconfigured = () => resolution.mode === EXECUTION_MODES.MISCONFIGURED;

/** The message an operator can act on, or null when the build is fine. */
export const getExecutionConfigurationMessage = () => resolution.message;

/** Everything Administration needs to show why a deployment behaves as it does. */
export const getExecutionModeDiagnostics = () => ({ ...resolution });
