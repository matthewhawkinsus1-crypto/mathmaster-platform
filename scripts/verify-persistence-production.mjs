#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { clientFacingServiceIds } from './persistence-deploy-surface.mjs';

/*
 * EVERY CALLABLE A STUDENT'S BROWSER INVOKES DIRECTLY.
 *
 * Derived from the deployed surface rather than retyped here, so a callable
 * added to the release cannot be left out of the IAM check — which is the one
 * failure that makes a healthy deploy look, from the classroom, exactly like
 * lost work.
 */
export const REQUIRED_PERSISTENCE_SERVICES = Object.freeze(clientFacingServiceIds());

export const serviceIsClientInvokable = (policy = {}) => (policy.bindings || []).some(
  (binding) => binding.role === 'roles/run.invoker' && (binding.members || []).includes('allUsers'),
);

export const verifyPolicies = (policies = {}) => REQUIRED_PERSISTENCE_SERVICES.map((service) => ({
  service,
  ok: serviceIsClientInvokable(policies[service]),
}));

const main = () => {
  const project = process.env.FIREBASE_PROJECT || 'mathmaster-aleks';
  const region = process.env.FUNCTION_REGION || 'us-central1';
  const policies = Object.fromEntries(REQUIRED_PERSISTENCE_SERVICES.map((service) => {
    let output;
    try {
      output = execFileSync('gcloud', [
        'run', 'services', 'get-iam-policy', service,
        '--project', project, '--region', region, '--format=json',
      ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
    } catch {
      throw new Error(`Could not read Cloud Run IAM for ${service}; persistence production verification FAILED.`);
    }
    return [service, JSON.parse(output)];
  }));
  const results = verifyPolicies(policies);
  results.forEach(({ service, ok }) => console.log(`${ok ? 'PASS' : 'FAIL'} ${service}: allUsers → roles/run.invoker`));
  const failures = results.filter(({ ok }) => !ok);
  if (failures.length) throw new Error(`Persistence production verification FAILED: ${failures.map((item) => item.service).join(', ')}`);
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
