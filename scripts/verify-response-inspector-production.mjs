#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { browserCallableServiceIds } from './response-inspector-deploy-surface.mjs';

export const REQUIRED_RESPONSE_INSPECTOR_SERVICES = Object.freeze(
  browserCallableServiceIds(),
);

export const serviceIsClientInvokable = (policy = {}) => (
  (policy.bindings || []).some(
    (binding) => (
      binding.role === 'roles/run.invoker'
      && (binding.members || []).includes('allUsers')
    ),
  )
);

export const verifyPolicies = (policies = {}) =>
  REQUIRED_RESPONSE_INSPECTOR_SERVICES.map((service) => ({
    service,
    ok: serviceIsClientInvokable(policies[service]),
  }));

const main = () => {
  const project = process.env.FIREBASE_PROJECT || 'mathmaster-aleks';
  const region = process.env.FUNCTION_REGION || 'us-central1';
  const policies = Object.fromEntries(
    REQUIRED_RESPONSE_INSPECTOR_SERVICES.map((service) => {
      let output;
      try {
        output = execFileSync('gcloud', [
          'run',
          'services',
          'get-iam-policy',
          service,
          '--project',
          project,
          '--region',
          region,
          '--format=json',
        ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
      } catch {
        throw new Error(
          `Could not read Cloud Run IAM for ${service}; response-inspector verification FAILED.`,
        );
      }
      return [service, JSON.parse(output)];
    }),
  );

  const results = verifyPolicies(policies);
  results.forEach(({ service, ok }) => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${service}: allUsers → roles/run.invoker`);
  });
  const failures = results.filter(({ ok }) => !ok);
  if (failures.length) {
    throw new Error(
      `Response-inspector verification FAILED: ${failures.map((item) => item.service).join(', ')}`,
    );
  }
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
