// Which runtime My Math Path is allowed to use, decided from build flags alone.
//
// THE FAILURE THIS EXISTS TO PREVENT. The old rule was "use the configured
// mode, and if it is missing or unrecognised, use mockLocal". A production
// deployment that forgot one environment variable therefore did not break — it
// quietly served every student a sandbox question reading "enter 4 to verify
// the secure session flow", recorded fake mastery for it, and looked from the
// outside exactly like a working platform. A silent downgrade to fake content
// is worse than an outage, because nobody goes looking for it.
//
// So the resolution is now explicit in both directions:
//
//   * mockLocal is a DEVELOPMENT runtime. It is used only when a developer
//     asked for it by name, and only in a build that is allowed to have it.
//   * A production build with no valid configuration resolves to
//     `misconfigured`, which every Path entry point turns into a visible,
//     recoverable service error.
//
// Pure and dependency-free on purpose: it takes the three facts it needs as
// arguments so a test can state a deployment's exact shape without a bundler.

export const EXECUTION_MODES = Object.freeze({
  MOCK_LOCAL: 'mockLocal',
  FIREBASE_PRODUCTION: 'firebaseProduction',
  // Not a runtime. The refusal that replaces the old silent fallback.
  MISCONFIGURED: 'misconfigured',
});

export const RUNTIME_EXECUTION_MODES = Object.freeze([
  EXECUTION_MODES.MOCK_LOCAL,
  EXECUTION_MODES.FIREBASE_PRODUCTION,
]);

export const PATH_CONFIGURATION_MESSAGE = 'My Math Path is not configured on this deployment. '
  + 'Set VITE_MATHMASTER_EXECUTION_MODE=firebaseProduction in the hosting environment and redeploy. '
  + 'MathMaster will not substitute practice questions for the secure Path.';

const truthy = (value) => ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());

/**
 * Resolve the execution mode.
 *
 * @param configuredMode   the raw VITE_MATHMASTER_EXECUTION_MODE value
 * @param isProductionBuild whether this bundle was built for production
 * @param allowMockInProduction an explicit, deliberate opt-in used only by
 *        demo/QA builds that WANT the sandbox and say so in their own env.
 */
export const resolveExecutionMode = ({
  configuredMode = '',
  isProductionBuild = false,
  allowMockInProduction = false,
} = {}) => {
  const requested = String(configuredMode || '').trim();
  const production = Boolean(isProductionBuild);
  const mockPermitted = !production || truthy(allowMockInProduction);

  if (requested === EXECUTION_MODES.FIREBASE_PRODUCTION) {
    return {
      mode: EXECUTION_MODES.FIREBASE_PRODUCTION,
      reason: 'configured_production',
      mockAllowed: false,
      isProductionBuild: production,
      message: null,
    };
  }

  if (requested === EXECUTION_MODES.MOCK_LOCAL) {
    if (mockPermitted) {
      return {
        mode: EXECUTION_MODES.MOCK_LOCAL,
        reason: production ? 'mock_explicitly_allowed_in_this_build' : 'configured_development_mock',
        mockAllowed: true,
        isProductionBuild: production,
        message: null,
      };
    }
    // Asked for by name, in a build that must not have it. Refuse loudly rather
    // than downgrade a real classroom into a sandbox.
    return {
      mode: EXECUTION_MODES.MISCONFIGURED,
      reason: 'mock_requested_in_production_build',
      mockAllowed: false,
      isProductionBuild: production,
      message: 'This production build requested the local development Path sandbox. '
        + 'Set VITE_MATHMASTER_EXECUTION_MODE=firebaseProduction and redeploy.',
    };
  }

  // Nothing valid was configured.
  if (production) {
    return {
      mode: EXECUTION_MODES.MISCONFIGURED,
      reason: requested ? 'unrecognised_mode_in_production_build' : 'missing_mode_in_production_build',
      mockAllowed: false,
      isProductionBuild: true,
      message: PATH_CONFIGURATION_MESSAGE,
    };
  }

  // A local `vite dev` with no env file is the one case where defaulting is
  // right: there is no deployment to mislead, and the developer is present.
  return {
    mode: EXECUTION_MODES.MOCK_LOCAL,
    reason: requested ? 'unrecognised_mode_defaulted_in_development' : 'development_default',
    mockAllowed: true,
    isProductionBuild: false,
    message: null,
  };
};

export default resolveExecutionMode;
