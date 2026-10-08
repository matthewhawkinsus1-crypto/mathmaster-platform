/*
 * CAN A BROWSER REACH EVERY CALLABLE?
 *
 * A Firebase callable is a Cloud Run service, and the browser can only reach
 * it when that service grants `allUsers` the transport-only
 * `roles/run.invoker`. MathMaster's authorization happens inside each callable
 * (requireTeacher, requireStudent, ...); the invoker binding only lets the
 * request in to be asked.
 *
 * THE GAP THIS CLOSES. The Firebase CLI grants that binding to a callable ONCE,
 * when it first creates the function. An update never grants it again
 * (firebase-tools `updateV2Function` sets an invoker for HTTPS, task-queue,
 * auth-blocking and scheduled functions, not callables), and
 * `setGlobalOptions({ invoker: "public" })` in functions/index.js does not
 * reach callables at all: firebase-functions leaves `invoker` out of an onCall
 * endpoint. So when the one grant fails during a create (the IAM API throttles
 * a fleet deploy), the function is deployed and healthy and no browser can
 * call it. Redeploying "succeeds" and changes nothing.
 *
 * From the classroom that looks like the server not answering. The browser's
 * CORS preflight gets a 403 with no CORS headers, fetch rejects, and the
 * Firebase client reports code `internal` with the message "internal". That
 * is what a teacher saw in October 2026: "Waive Review did not go through: the
 * server did not answer (Cloud Function "teacherTestCycleAction")", while the
 * same callable answered over HTTP in the emulator.
 *
 * Pure: no gcloud, no network. scripts/verify-callable-access.mjs feeds it what
 * gcloud reports and runs the grants it plans; the release runs the same check
 * after every functions deploy. Tested in tests/platform/callableAccess.test.mjs.
 */

export const INVOKER_ROLE = 'roles/run.invoker';
export const PUBLIC_MEMBER = 'allUsers';
/** The label the Firebase CLI puts on every deployed callable. */
export const CALLABLE_LABEL = 'deployment-callable';
export const DEFAULT_REGION = 'us-central1';

export const ACCESS = Object.freeze({
  OK: 'ok',
  // Deployed, but the service does not let browsers in: 403, no CORS headers.
  PRIVATE: 'private',
  // In the code, not deployed: 404, no CORS headers.
  MISSING: 'missing',
  // Deployed, but its last deploy did not finish (FAILED, DEPLOYING, ...).
  NOT_ACTIVE: 'not-active',
  // Its IAM policy could not be read, so nothing is known.
  UNREADABLE: 'unreadable',
});

const WHAT_THE_BROWSER_SEES = Object.freeze({
  [ACCESS.PRIVATE]: 'browsers get a 403 with no CORS headers, which the Firebase client reports as "internal"',
  [ACCESS.MISSING]: 'browsers get a 404 with no CORS headers, which the Firebase client reports as "internal"',
});

export const serviceIsPublic = (policy) => (Array.isArray(policy?.bindings) ? policy.bindings : []).some(
  (binding) => binding?.role === INVOKER_ROLE && Array.isArray(binding.members) && binding.members.includes(PUBLIC_MEMBER),
);

/** Gen 2 runs each function as a Cloud Run service named after it, lowercased. */
export const defaultServiceId = (name) => String(name || '').toLowerCase();

/**
 * `gcloud functions list --format=json`, reduced to what the audit needs.
 *
 * The service comes from `serviceConfig.service`. An ACTIVE function that does
 * not report one is still served by the service named after it; one that is
 * not ACTIVE and has none never got a service (its first deploy failed).
 */
export const deployedFunctionsFrom = (list = []) => (Array.isArray(list) ? list : [])
  .map((fn) => {
    const resource = String(fn?.name || '');
    const labels = fn?.labels && typeof fn.labels === 'object' ? fn.labels : {};
    const name = resource.split('/').pop() || '';
    const state = String(fn?.state || fn?.status || '').toUpperCase() || null;
    return {
      name,
      region: (resource.match(/\/locations\/([^/]+)\//) || [])[1] || null,
      state,
      callable: labels[CALLABLE_LABEL] === 'true',
      codebase: labels['firebase-functions-codebase'] || 'default',
      service: String(fn?.serviceConfig?.service || '').split('/').pop() || (state === 'ACTIVE' ? defaultServiceId(name) : null),
    };
  })
  .filter((fn) => fn.name);

/**
 * The callables to check: every callable the code defines, each in the region
 * it deploys to. `inventory` is listDeployableFunctions().functions (or the
 * same shape for another codebase); anything that is not a callable is left
 * alone, so the schedulers stay private.
 */
export const expectedCallables = (inventory = [], { codebase = 'default', region = DEFAULT_REGION, names = null } = {}) => {
  const wanted = names?.length ? new Set(names) : null;
  return (Array.isArray(inventory) ? inventory : [])
    .filter((fn) => fn?.trigger === 'callable' && (!wanted || wanted.has(fn.name)))
    .map((fn) => ({ name: fn.name, codebase, region: fn.region || region }));
};

/**
 * One verdict per expected callable.
 *
 * `policies` maps a Cloud Run service id to its IAM policy, or to null when it
 * could not be read. A service that is not in `policies` was not asked.
 */
export const auditCallableAccess = ({ expected = [], deployed = [], policies = {} } = {}) => expected.map((fn) => {
  const live = deployed.find((entry) => entry.name === fn.name && (!entry.region || entry.region === fn.region)) || null;
  const base = {
    name: fn.name,
    codebase: fn.codebase || 'default',
    region: fn.region,
    service: live?.service || null,
    state: live?.state || null,
  };
  if (!live) return { ...base, status: ACCESS.MISSING, detail: `not deployed in ${fn.region}; ${WHAT_THE_BROWSER_SEES[ACCESS.MISSING]}` };
  if (!live.service) {
    return { ...base, status: ACCESS.NOT_ACTIVE, detail: `deployed with no Cloud Run service (state ${live.state || 'unknown'}); its first deploy did not finish` };
  }
  const policy = Object.prototype.hasOwnProperty.call(policies, live.service) ? policies[live.service] : undefined;
  if (!policy) return { ...base, status: ACCESS.UNREADABLE, detail: `the IAM policy of Cloud Run service ${live.service} could not be read` };
  if (!serviceIsPublic(policy)) {
    return {
      ...base,
      status: ACCESS.PRIVATE,
      detail: `Cloud Run service ${live.service} does not grant ${PUBLIC_MEMBER} ${INVOKER_ROLE}; ${WHAT_THE_BROWSER_SEES[ACCESS.PRIVATE]}`,
    };
  }
  if (live.state && live.state !== 'ACTIVE') {
    return { ...base, status: ACCESS.NOT_ACTIVE, detail: `state ${live.state}: its last deploy did not finish; the previous revision may still be serving` };
  }
  return { ...base, status: ACCESS.OK, detail: `${PUBLIC_MEMBER} → ${INVOKER_ROLE}` };
});

/** The gcloud arguments that let browsers reach one Cloud Run service. */
export const grantArgs = ({ service, region, project }) => [
  'run', 'services', 'add-iam-policy-binding', service,
  '--project', project,
  '--region', region,
  `--member=${PUBLIC_MEMBER}`,
  `--role=${INVOKER_ROLE}`,
  '--quiet',
];

const deployTarget = ({ name, codebase }) => (codebase && codebase !== 'default' ? `functions:${codebase}:${name}` : `functions:${name}`);

/**
 * What would make every audited callable reachable.
 *
 * `grants` are safe to run as they stand: they restore exactly the binding the
 * CLI would have granted when it created the function. A function that is not
 * deployed, or whose deploy did not finish, needs a deploy instead, which this
 * never runs; `redeploy` is the command. A create grants the binding itself,
 * and the release checks it again afterwards.
 */
export const planCallableRepairs = (results = [], { project } = {}) => {
  const grants = results
    .filter((result) => result.status === ACCESS.PRIVATE && result.service)
    .map((result) => ({ name: result.name, service: result.service, region: result.region, args: grantArgs({ ...result, project }) }));
  const toDeploy = results.filter((result) => result.status === ACCESS.MISSING || result.status === ACCESS.NOT_ACTIVE);
  const defaultNames = toDeploy.filter((result) => (result.codebase || 'default') === 'default').map((result) => result.name);
  const otherTargets = toDeploy.filter((result) => (result.codebase || 'default') !== 'default').map(deployTarget);
  const redeploy = [
    ...(defaultNames.length ? [`node scripts/release-firebase.mjs --execute --only functions --functions ${defaultNames.join(',')}`] : []),
    ...(otherTargets.length ? [`npx firebase deploy --project ${project} --only ${otherTargets.join(',')}`] : []),
  ];
  return { grants, redeploy };
};

/*
 * WHAT THE BROWSER ITSELF SEES.
 *
 * Before its POST, the browser sends a CORS preflight (OPTIONS). A callable
 * that can be reached answers it with 204 and Access-Control-Allow-Origin. A
 * 403 or 404 from Google's front end carries no CORS headers, so the browser
 * drops it and the Firebase client is left with "internal". The probe sends
 * that same preflight, so it needs no credentials, but it does wake the
 * function.
 */
export const preflightRequest = ({ project, region = DEFAULT_REGION, name, origin = null }) => ({
  url: `https://${region}-${project}.cloudfunctions.net/${name}`,
  init: {
    method: 'OPTIONS',
    headers: {
      Origin: origin || `https://${project}.web.app`,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization,content-type',
    },
  },
});

/**
 * `observed` is { reachable, status, allowOrigin, server, denyReason, error }
 * from one preflight.
 *
 * A 403 or 404 says something about the function only when Google's front end
 * sent it. A proxy or school firewall in between answers 403 too (a sandbox
 * egress proxy says `x-deny-reason: host_not_allowed`), and reading that as
 * "not open to browsers" would send the operator to fix IAM that is fine.
 */
export const assessPreflight = (observed = {}) => {
  if (!observed?.reachable) return { ok: false, verdict: 'no-answer', detail: `no answer (${observed?.error || 'request failed'})` };
  const status = Number(observed.status);
  const cors = Boolean(observed.allowOrigin);
  if (status >= 200 && status < 300 && cors) return { ok: true, verdict: 'reachable', detail: `HTTP ${status} with CORS headers: a browser can call it` };
  if (observed.denyReason || !/google/i.test(String(observed.server || ''))) {
    const said = observed.denyReason ? ` (x-deny-reason: ${observed.denyReason})` : '';
    return {
      ok: false,
      verdict: 'intercepted',
      detail: `HTTP ${status} from ${observed.server ? `"${observed.server}"` : 'something other than Google'}${said}: a proxy or firewall answered, not the function. Probe from Cloud Shell, or from the network the browser is on`,
    };
  }
  if (status === 403) return { ok: false, verdict: 'forbidden', detail: `HTTP 403 without CORS headers: not open to browsers (${PUBLIC_MEMBER} → ${INVOKER_ROLE})` };
  if (status === 404) return { ok: false, verdict: 'not-found', detail: 'HTTP 404 without CORS headers: no function at that URL (not deployed, or in another region)' };
  return { ok: false, verdict: 'unexpected', detail: `HTTP ${status}${cors ? '' : ' without CORS headers'}: a browser reports this as "internal"` };
};

export const summarizeCallableAccess = (results = []) => {
  const counts = Object.fromEntries(Object.values(ACCESS).map((status) => [status, 0]));
  results.forEach((result) => { counts[result.status] = (counts[result.status] || 0) + 1; });
  const failing = results.filter((result) => result.status !== ACCESS.OK);
  return {
    ok: failing.length === 0,
    total: results.length,
    counts,
    failing: failing.map((result) => result.name),
  };
};

/**
 * Whether a release may go on past its access step.
 *
 * The release checks and repairs EVERY callable, so one that lost its binding
 * long ago is fixed by the next release of anything. But only the callables
 * this release deployed (`released`) can stop it: a release of three functions
 * is not held back because some other callable was never deployed. Those are
 * reported as `warnings`. A check that could not run is never a pass.
 */
export const releaseAccessVerdict = (outcome = {}, { released = null } = {}) => {
  if (!outcome?.checked) return { ...outcome, ok: false, warnings: [] };
  const inRelease = Array.isArray(released) ? new Set(released) : null;
  const failing = (outcome.results || []).filter((result) => result.status !== ACCESS.OK);
  const blocking = failing.filter((result) => !inRelease || inRelease.has(result.name));
  const warnings = failing.filter((result) => inRelease && !inRelease.has(result.name));
  return {
    ...outcome,
    ok: blocking.length === 0,
    summary: { ...outcome.summary, failing: blocking.map((result) => result.name) },
    warnings: warnings.map((result) => `${result.name}: ${result.status} — ${result.detail}`),
  };
};
