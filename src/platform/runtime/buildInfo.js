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
 * The build identifier, short enough to read off a student's phone.
 *
 * "Is this browser actually running the latest Firebase build?" was being
 * answered by guessing — a teacher would report a missing button, and there was
 * no way to tell a stale cached bundle from a real defect without a deploy and
 * a second look. The sha and timestamp were already injected at build time and
 * already published on window.__MATHMASTER_BUILD__; what was missing was
 * somewhere a human could SEE them.
 *
 * Deliberately not a secret and deliberately not clickable: a short commit id
 * and the time it was built. Nothing about the environment, no tokens, no
 * internal hostnames.
 *
 * A build made outside the Firebase script has no sha injected. That reports as
 * "dev" rather than a fabricated id — "I do not know which build this is" is
 * the honest answer and is itself diagnostic.
 */
export const formatBuildStamp = (info = getMathMasterBuildInfo()) => {
  const sha = clean(info?.gitSha);
  const shortSha = !sha || sha === 'unknown' ? 'dev' : sha.slice(0, 7);
  const builtAt = clean(info?.builtAt);
  const when = !builtAt || builtAt === 'unknown' ? null : builtAt;
  return {
    shortSha,
    builtAt: when,
    label: `Build ${shortSha}`,
    // The long form for a teacher diagnostic line, where the date is the part
    // that settles an argument about whether a deploy reached a device.
    detail: when ? `Build ${shortSha} · ${when}` : `Build ${shortSha}`,
  };
};

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
