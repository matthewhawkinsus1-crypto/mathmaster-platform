export const EXECUTION_MODES = Object.freeze({
  MOCK_LOCAL: 'mockLocal',
  FIREBASE_PRODUCTION: 'firebaseProduction',
});

const configuredMode = String(import.meta.env?.VITE_MATHMASTER_EXECUTION_MODE || '').trim();
const currentMode = Object.values(EXECUTION_MODES).includes(configuredMode)
  ? configuredMode
  : EXECUTION_MODES.MOCK_LOCAL;

export const getExecutionMode = () => currentMode;
export const isProductionExecution = () => currentMode === EXECUTION_MODES.FIREBASE_PRODUCTION;
