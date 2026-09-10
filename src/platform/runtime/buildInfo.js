import { ASSIGNMENT_RUNTIME_REPAIR_VERSION } from '../assignments/assignmentRuntimeRepair.js';

const clean = (value) => String(value ?? '').trim();
const version = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
};

export const getMathMasterBuildInfo = (env = import.meta.env || {}) => ({
  gitSha: clean(env?.VITE_MATHMASTER_GIT_SHA) || 'unknown',
  builtAt: clean(env?.VITE_MATHMASTER_BUILT_AT) || 'unknown',
  assignmentRuntimeRepairVersion: version(
    env?.VITE_MATHMASTER_RUNTIME_REPAIR_VERSION,
    ASSIGNMENT_RUNTIME_REPAIR_VERSION,
  ),
});

/**
 * Explain whether an observed assignment problem is deployment drift, a saved
 * record that has not yet received a certified persistence repair, or a real
 * remaining regression in the current runtime.
 */
export const diagnoseRuntimeCompatibility = ({
  requiredRuntimeVersion = ASSIGNMENT_RUNTIME_REPAIR_VERSION,
  liveBuildInfo = {},
  storedRepairVersion = 0,
  issueReproduces = false,
} = {}) => {
  const required = version(requiredRuntimeVersion, ASSIGNMENT_RUNTIME_REPAIR_VERSION);
  const live = version(liveBuildInfo?.assignmentRuntimeRepairVersion, 0);
  const stored = version(storedRepairVersion, 0);

  if (live < required) {
    return {
      status: 'deploymentMismatch',
      message: `The browser is running assignment runtime repair version ${live}, but this issue requires version ${required}.`,
      requiredRuntimeVersion: required,
      liveRuntimeVersion: live,
      storedRepairVersion: stored,
    };
  }

  if (stored < required && issueReproduces !== true) {
    return {
      status: 'persistencePending',
      message: 'The current runtime already corrects this issue in memory, but the saved assignment has not yet received the certified compatibility stamp.',
      requiredRuntimeVersion: required,
      liveRuntimeVersion: live,
      storedRepairVersion: stored,
    };
  }

  if (issueReproduces === true) {
    return {
      status: 'remainingRegression',
      message: 'The required runtime is deployed and the saved compatibility version is current, but the issue still reproduces. Treat this as a remaining platform regression.',
      requiredRuntimeVersion: required,
      liveRuntimeVersion: live,
      storedRepairVersion: stored,
    };
  }

  return {
    status: 'current',
    message: 'The deployed runtime and saved compatibility state are current for this repair.',
    requiredRuntimeVersion: required,
    liveRuntimeVersion: live,
    storedRepairVersion: stored,
  };
};

export default getMathMasterBuildInfo;
