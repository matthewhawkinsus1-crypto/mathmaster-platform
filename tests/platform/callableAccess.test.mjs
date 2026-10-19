// CAN A BROWSER REACH EVERY CALLABLE? (scripts/lib/callableAccess.mjs)
//
// A callable whose Cloud Run service does not grant `allUsers`
// roles/run.invoker is deployed, healthy and unreachable: the browser's CORS
// preflight gets a 403 with no CORS headers and the Firebase client reports
// "internal". The Firebase CLI grants that binding only when it creates a
// callable. These cases drive the audit, the repair and the release verdict
// with what gcloud reports, through an injected gcloud: no network, no project.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ACCESS,
  CALLABLE_LABEL,
  assessPreflight,
  auditCallableAccess,
  deployedFunctionsFrom,
  expectedCallables,
  grantArgs,
  planCallableRepairs,
  preflightRequest,
  releaseAccessVerdict,
  serviceIsPublic,
} from '../../scripts/lib/callableAccess.mjs';
import { ensureCallableAccess } from '../../scripts/verify-callable-access.mjs';
import { listDeployableFunctions } from '../../scripts/lib/functionsInventory.mjs';

const PUBLIC = { bindings: [{ role: 'roles/run.invoker', members: ['allUsers'] }], etag: 'BwX' };
const PRIVATE = { etag: 'ACAB' };

// One function as `gcloud functions list --format=json` reports a Gen 2 callable.
const listed = (name, { state = 'ACTIVE', callable = true, codebase = null, service = name.toLowerCase(), region = 'us-central1' } = {}) => ({
  name: `projects/mathmaster-aleks/locations/${region}/functions/${name}`,
  environment: 'GEN_2',
  state,
  labels: {
    'deployment-tool': 'cli-firebase',
    ...(callable ? { [CALLABLE_LABEL]: 'true' } : {}),
    ...(codebase ? { 'firebase-functions-codebase': codebase } : {}),
  },
  ...(service ? { serviceConfig: { service: `projects/mathmaster-aleks/locations/${region}/services/${service}`, uri: `https://${service}-x-uc.a.run.app` } } : {}),
  url: `https://${region}-mathmaster-aleks.cloudfunctions.net/${name}`,
});

test('only allUsers with roles/run.invoker lets a browser in', () => {
  assert.equal(serviceIsPublic(PUBLIC), true);
  assert.equal(serviceIsPublic({ bindings: [{ role: 'roles/run.invoker', members: ['serviceAccount:x@p.iam.gserviceaccount.com', 'allUsers'] }] }), true);
  assert.equal(serviceIsPublic(PRIVATE), false, 'a service with no bindings requires authentication');
  assert.equal(serviceIsPublic({ bindings: [{ role: 'roles/run.invoker', members: ['allAuthenticatedUsers'] }] }), false,
    'a Firebase ID token is not a Google identity: the browser is still refused');
  assert.equal(serviceIsPublic({ bindings: [{ role: 'roles/run.viewer', members: ['allUsers'] }] }), false);
  assert.equal(serviceIsPublic(null), false);
});

test('what gcloud lists is read as name, region, state, callable, codebase and service', () => {
  const [action, scheduler, pathAdmin] = deployedFunctionsFrom([
    listed('teacherTestCycleAction'),
    listed('finalizeStudentResponseCheckpoints', { callable: false }),
    listed('publishPathRelease', { codebase: 'path-admin', state: 'FAILED' }),
  ]);
  assert.deepEqual(action, {
    name: 'teacherTestCycleAction', region: 'us-central1', state: 'ACTIVE', callable: true, codebase: 'default', service: 'teachertestcycleaction',
  });
  assert.equal(scheduler.callable, false);
  assert.equal(pathAdmin.codebase, 'path-admin');
  assert.equal(pathAdmin.state, 'FAILED');
  assert.deepEqual(deployedFunctionsFrom(null), []);

  // An ACTIVE function that does not report its service is still served by
  // the one named after it; a failed first create never got one.
  const [quiet, neverServed] = deployedFunctionsFrom([
    listed('teacherTestCycleAction', { service: null }),
    listed('brandNewCallable', { service: null, state: 'FAILED' }),
  ]);
  assert.equal(quiet.service, 'teachertestcycleaction');
  assert.equal(neverServed.service, null);
});

test('only callables are expected to be public: schedulers and triggers stay private', () => {
  const inventory = [
    { name: 'teacherTestCycleAction', trigger: 'callable', region: null },
    { name: 'finalizeStudentResponseCheckpoints', trigger: 'schedule', region: null },
    { name: 'syncGradeToClassroom', trigger: 'event', region: null },
    { name: 'resolveClassroomSectionLaunchToken', trigger: 'callable', region: 'europe-west1' },
  ];
  assert.deepEqual(expectedCallables(inventory), [
    { name: 'teacherTestCycleAction', codebase: 'default', region: 'us-central1' },
    { name: 'resolveClassroomSectionLaunchToken', codebase: 'default', region: 'europe-west1' },
  ]);
  assert.deepEqual(expectedCallables(inventory, { names: ['teacherTestCycleAction', 'finalizeStudentResponseCheckpoints'] }).map((fn) => fn.name),
    ['teacherTestCycleAction'], 'naming a scheduler does not make it a callable');
});

test('the real default codebase: every Test Cycle teacher action is a callable to check, and its schedulers are not', () => {
  const expected = expectedCallables(listDeployableFunctions().functions).map((fn) => fn.name);
  for (const name of ['teacherTestCycleAction', 'listTeacherTestCycleRecords', 'assignTestCycleSessions', 'releaseTestCycleResults', 'platformBuildInfo']) {
    assert.ok(expected.includes(name), `${name} is called from a browser and must be checked`);
  }
  assert.ok(!expected.includes('finalizeStudentResponseCheckpoints'), 'a scheduler is deliberately private');
  assert.ok(!expected.includes('expireStaleStudentPresence'), 'a scheduler is deliberately private');
});

test('one verdict per callable: reachable, not open to browsers, not deployed, unfinished deploy, unreadable', () => {
  const expected = ['ok', 'closed', 'gone', 'failedFirstCreate', 'failedUpdate', 'unread'].map((name) => ({ name, codebase: 'default', region: 'us-central1' }));
  const deployed = deployedFunctionsFrom([
    listed('ok'),
    listed('closed'),
    listed('failedFirstCreate', { state: 'FAILED', service: null }),
    listed('failedUpdate', { state: 'FAILED' }),
    listed('unread'),
  ]);
  const policies = { ok: PUBLIC, closed: PRIVATE, failedupdate: PUBLIC, unread: null };
  const byName = Object.fromEntries(auditCallableAccess({ expected, deployed, policies }).map((result) => [result.name, result]));
  assert.equal(byName.ok.status, ACCESS.OK);
  assert.equal(byName.closed.status, ACCESS.PRIVATE);
  assert.match(byName.closed.detail, /403 with no CORS headers.*"internal"/);
  assert.equal(byName.gone.status, ACCESS.MISSING);
  assert.match(byName.gone.detail, /404/);
  assert.equal(byName.failedFirstCreate.status, ACCESS.NOT_ACTIVE);
  assert.equal(byName.failedUpdate.status, ACCESS.NOT_ACTIVE, 'public, but its last deploy did not finish');
  assert.equal(byName.unread.status, ACCESS.UNREADABLE, 'a policy that could not be read is not a pass');
});

test('a function deployed in another region is missing where the browser looks for it', () => {
  const [result] = auditCallableAccess({
    expected: [{ name: 'teacherTestCycleAction', codebase: 'default', region: 'us-central1' }],
    deployed: deployedFunctionsFrom([listed('teacherTestCycleAction', { region: 'europe-west1' })]),
    policies: { teachertestcycleaction: PUBLIC },
  });
  assert.equal(result.status, ACCESS.MISSING);
});

test('the repair grants exactly the CLI\'s create-time binding, and only names deploys', () => {
  const results = [
    { name: 'teacherTestCycleAction', codebase: 'default', region: 'us-central1', service: 'teachertestcycleaction', status: ACCESS.PRIVATE },
    { name: 'listTeacherTestCycleRecords', codebase: 'default', region: 'us-central1', service: 'listteachertestcyclerecords', status: ACCESS.OK },
    { name: 'gone', codebase: 'default', region: 'us-central1', service: null, status: ACCESS.MISSING },
    { name: 'publishPathRelease', codebase: 'path-admin', region: 'us-central1', service: null, status: ACCESS.NOT_ACTIVE },
    { name: 'unread', codebase: 'default', region: 'us-central1', service: 'unread', status: ACCESS.UNREADABLE },
  ];
  const { grants, redeploy } = planCallableRepairs(results, { project: 'mathmaster-aleks' });
  assert.deepEqual(grants, [{
    name: 'teacherTestCycleAction',
    service: 'teachertestcycleaction',
    region: 'us-central1',
    args: ['run', 'services', 'add-iam-policy-binding', 'teachertestcycleaction', '--project', 'mathmaster-aleks', '--region', 'us-central1',
      '--member=allUsers', '--role=roles/run.invoker', '--quiet'],
  }], 'one grant, for the private callable only; an unreadable policy is never overwritten blind');
  assert.deepEqual(redeploy, [
    'node scripts/release-firebase.mjs --execute --only functions --functions gone',
    'npx firebase deploy --project mathmaster-aleks --only functions:path-admin:publishPathRelease',
  ]);
  assert.deepEqual(grantArgs({ service: 's', region: 'r', project: 'p' }).slice(-3), ['--member=allUsers', '--role=roles/run.invoker', '--quiet']);
});

test('a release is held back only by the callables it deployed; the rest are warnings', () => {
  const outcome = {
    ok: false,
    checked: true,
    results: [
      { name: 'a', status: ACCESS.OK, detail: '' },
      { name: 'neverDeployed', status: ACCESS.MISSING, detail: 'not deployed' },
    ],
    summary: { total: 2, failing: ['neverDeployed'] },
  };
  const scoped = releaseAccessVerdict(outcome, { released: ['a'] });
  assert.equal(scoped.ok, true);
  assert.deepEqual(scoped.summary.failing, []);
  assert.deepEqual(scoped.warnings, ['neverDeployed: missing — not deployed']);

  assert.equal(releaseAccessVerdict(outcome, { released: ['a', 'neverDeployed'] }).ok, false);
  assert.equal(releaseAccessVerdict(outcome).ok, false, 'with no release scope, every callable counts');
  assert.equal(releaseAccessVerdict({ ok: true, checked: false, reason: 'gcloud is not on PATH' }, { released: ['a'] }).ok, false,
    'a check that could not run is never a pass');
});

test('the preflight is the browser\'s, and its answer is read the way the browser reads it', () => {
  const { url, init } = preflightRequest({ project: 'mathmaster-aleks', name: 'teacherTestCycleAction' });
  assert.equal(url, 'https://us-central1-mathmaster-aleks.cloudfunctions.net/teacherTestCycleAction');
  assert.equal(init.method, 'OPTIONS');
  assert.equal(init.headers.Origin, 'https://mathmaster-aleks.web.app');
  assert.equal(init.headers['Access-Control-Request-Method'], 'POST');

  const google = { reachable: true, server: 'Google Frontend', denyReason: null };
  assert.equal(assessPreflight({ ...google, status: 204, allowOrigin: 'https://mathmaster-aleks.web.app' }).ok, true);
  assert.equal(assessPreflight({ ...google, status: 403, allowOrigin: null }).verdict, 'forbidden');
  assert.equal(assessPreflight({ ...google, status: 404, allowOrigin: null }).verdict, 'not-found');
  assert.equal(assessPreflight({ ...google, status: 204, allowOrigin: null }).ok, false, 'no CORS header: the browser drops the answer');
  assert.equal(assessPreflight({ ...google, status: 500, allowOrigin: null }).verdict, 'unexpected');
  assert.equal(assessPreflight({ reachable: false, error: 'ECONNRESET' }).verdict, 'no-answer');

  // A 403 from something in between is not the function's IAM. This is the
  // answer a sandbox egress proxy gave when this file was written.
  const proxied = assessPreflight({ reachable: true, status: 403, allowOrigin: null, server: null, denyReason: 'host_not_allowed' });
  assert.equal(proxied.verdict, 'intercepted');
  assert.match(proxied.detail, /x-deny-reason: host_not_allowed/);
  assert.equal(assessPreflight({ reachable: true, status: 403, allowOrigin: null, server: 'squid/5.7', denyReason: null }).verdict, 'intercepted');
});

/* --- ensureCallableAccess, with gcloud injected ------------------------------- */

const INVENTORY = [
  { name: 'teacherTestCycleAction', trigger: 'callable', region: null },
  { name: 'listTeacherTestCycleRecords', trigger: 'callable', region: null },
  { name: 'finalizeStudentResponseCheckpoints', trigger: 'schedule', region: null },
];

/** A fake gcloud over one project's functions and Cloud Run IAM policies. */
const fakeGcloud = ({ functions, policies, failGrant = false, missing = false }) => {
  const calls = [];
  const state = { ...policies };
  const gcloud = async (args) => {
    calls.push(args);
    if (missing) return { ok: false, missing: true, stdout: '', stderr: 'spawn gcloud ENOENT' };
    if (args[0] === 'functions' && args[1] === 'list') return { ok: true, stdout: JSON.stringify(functions), stderr: '' };
    if (args[0] === 'run' && args[2] === 'get-iam-policy') {
      const policy = state[args[3]];
      return policy ? { ok: true, stdout: JSON.stringify(policy), stderr: '' } : { ok: false, code: 1, stdout: '', stderr: 'PERMISSION_DENIED' };
    }
    if (args[0] === 'run' && args[2] === 'add-iam-policy-binding') {
      if (failGrant) return { ok: false, code: 1, stdout: '', stderr: 'ERROR: (gcloud.run.services.add-iam-policy-binding) PERMISSION_DENIED' };
      state[args[3]] = PUBLIC;
      return { ok: true, stdout: '', stderr: '' };
    }
    return { ok: false, code: 2, stdout: '', stderr: `unexpected gcloud ${args.join(' ')}` };
  };
  return { gcloud, calls };
};

const LIVE = [listed('teacherTestCycleAction'), listed('listTeacherTestCycleRecords'), listed('finalizeStudentResponseCheckpoints', { callable: false })];

test('a callable that lost its binding is found, and without --fix nothing is changed', async () => {
  const { gcloud, calls } = fakeGcloud({ functions: LIVE, policies: { teachertestcycleaction: PRIVATE, listteachertestcyclerecords: PUBLIC } });
  const outcome = await ensureCallableAccess({ project: 'p', inventories: { default: INVENTORY }, gcloud });
  assert.equal(outcome.checked, true);
  assert.equal(outcome.ok, false);
  assert.deepEqual(outcome.summary.failing, ['teacherTestCycleAction']);
  assert.ok(!calls.some((args) => args.includes('add-iam-policy-binding')), 'a check never grants');
  assert.ok(!calls.some((args) => args.includes('finalizestudentresponsecheckpoints')), 'the scheduler is not even read');
});

test('--fix grants the binding, reads it back, and only then calls it reachable', async () => {
  const { gcloud, calls } = fakeGcloud({ functions: LIVE, policies: { teachertestcycleaction: PRIVATE, listteachertestcyclerecords: PUBLIC } });
  const outcome = await ensureCallableAccess({ project: 'p', inventories: { default: INVENTORY }, gcloud, fix: true });
  assert.equal(outcome.ok, true);
  assert.deepEqual(outcome.grants, [{ name: 'teacherTestCycleAction', service: 'teachertestcycleaction', ok: true, error: null }]);
  const grantIndex = calls.findIndex((args) => args.includes('add-iam-policy-binding'));
  assert.deepEqual(calls[grantIndex], grantArgs({ service: 'teachertestcycleaction', region: 'us-central1', project: 'p' }));
  assert.ok(calls.slice(grantIndex + 1).some((args) => args.includes('get-iam-policy') && args.includes('teachertestcycleaction')), 'read back after granting');
  assert.equal(calls.filter((args) => args.includes('add-iam-policy-binding')).length, 1, 'the public callable is left alone');
});

test('a grant that fails leaves the callable failing, with gcloud\'s reason', async () => {
  const { gcloud } = fakeGcloud({ functions: LIVE, policies: { teachertestcycleaction: PRIVATE, listteachertestcyclerecords: PUBLIC }, failGrant: true });
  const outcome = await ensureCallableAccess({ project: 'p', inventories: { default: INVENTORY }, gcloud, fix: true });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.grants[0].ok, false);
  assert.match(outcome.grants[0].error, /PERMISSION_DENIED/);
  assert.deepEqual(outcome.summary.failing, ['teacherTestCycleAction']);
});

test('a policy read that fails once is asked again; one that keeps failing is not a pass', async () => {
  const { gcloud: steady, calls } = fakeGcloud({ functions: LIVE, policies: { teachertestcycleaction: PUBLIC, listteachertestcyclerecords: PUBLIC } });
  let blips = 0;
  const flaky = async (args) => {
    if (args[2] === 'get-iam-policy' && args[3] === 'teachertestcycleaction' && blips === 0) {
      blips += 1;
      return { ok: false, code: 1, stdout: '', stderr: 'ERROR: gcloud crashed (ConnectionError): connection reset' };
    }
    return steady(args);
  };
  const recovered = await ensureCallableAccess({ project: 'p', inventories: { default: INVENTORY }, gcloud: flaky });
  assert.equal(recovered.ok, true);
  assert.equal(calls.filter((args) => args[2] === 'get-iam-policy' && args[3] === 'teachertestcycleaction').length, 1, 'asked again, once');

  const { gcloud: denied } = fakeGcloud({ functions: LIVE, policies: { listteachertestcyclerecords: PUBLIC } });
  const unreadable = await ensureCallableAccess({ project: 'p', inventories: { default: INVENTORY }, gcloud: denied, fix: true });
  assert.equal(unreadable.ok, false);
  assert.equal(unreadable.results.find((result) => result.name === 'teacherTestCycleAction').status, ACCESS.UNREADABLE);
  assert.deepEqual(unreadable.grants, [], 'a policy it could not read is never overwritten');
});

test('a callable that is not deployed is named with its deploy command, never deployed', async () => {
  const { gcloud, calls } = fakeGcloud({ functions: [listed('listTeacherTestCycleRecords')], policies: { listteachertestcyclerecords: PUBLIC } });
  const outcome = await ensureCallableAccess({ project: 'p', inventories: { default: INVENTORY }, gcloud, fix: true });
  assert.equal(outcome.ok, false);
  assert.deepEqual(outcome.redeploy, ['node scripts/release-firebase.mjs --execute --only functions --functions teacherTestCycleAction']);
  assert.ok(calls.every((args) => args[0] !== 'functions' || args[1] === 'list'), 'gcloud never deploys');
});

test('no gcloud, or a callable named that the code does not define, is never a pass', async () => {
  const absent = await ensureCallableAccess({ project: 'p', inventories: { default: INVENTORY }, gcloud: fakeGcloud({ functions: [], policies: {}, missing: true }).gcloud });
  assert.equal(absent.checked, false);
  assert.equal(absent.ok, false);
  assert.match(absent.reason, /not on PATH/);

  const { gcloud } = fakeGcloud({ functions: LIVE, policies: { teachertestcycleaction: PUBLIC, listteachertestcyclerecords: PUBLIC } });
  const typo = await ensureCallableAccess({ project: 'p', inventories: { default: INVENTORY }, gcloud, names: ['teacherTestCycleActon'] });
  assert.equal(typo.ok, false, 'a typo checks nothing, so it cannot pass');
  const named = await ensureCallableAccess({ project: 'p', inventories: { default: INVENTORY }, gcloud, names: ['teacherTestCycleAction'] });
  assert.equal(named.ok, true);
  assert.deepEqual(named.results.map((result) => result.name), ['teacherTestCycleAction']);
});
