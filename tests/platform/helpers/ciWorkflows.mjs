/*
 * READING THE CI WORKFLOWS FOR WHAT THEY DO.
 *
 * Every workflow that guards main is called by .github/workflows/ci.yml, which
 * decides from the changed files (scripts/lib/ciAreas.mjs) which of them a
 * pull request runs. A test that needs "a pull request changing X runs Y"
 * should ask runsOnPullRequest(Y, X) rather than look for X in a list of
 * patterns: the answer then follows the real matching rule (order, `!`, `*`
 * against `**`) and the real wiring in ci.yml.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { CI_AREAS, changedAreas } from '../../../scripts/lib/ciAreas.mjs';

const DIR = new URL('../../../.github/workflows/', import.meta.url);

export const workflowFiles = () => readdirSync(DIR).filter((name) => /\.ya?ml$/.test(name)).sort();
export const readWorkflow = (name) => readFileSync(new URL(name, DIR), 'utf8');

/** The `on:` block of a workflow (up to the next top-level key). */
export const triggersOf = (text) => (text.match(/^on:\s*\n((?:[ #].*\n|\s*\n)*)/m) || [])[1] || '';

/** The workflow's jobs, each as its own text (two-space keys under `jobs:`). */
export const jobsOf = (text) => {
  const body = text.slice(text.indexOf('\njobs:\n'));
  const jobs = {};
  let name = null;
  body.split('\n').forEach((line) => {
    const key = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
    if (key) { name = key[1]; jobs[name] = ''; return; }
    if (/^\S/.test(line) && !line.startsWith('jobs:')) name = null;
    if (name) jobs[name] += `${line}\n`;
  });
  return jobs;
};

/** ci.yml's jobs that call a workflow: { job: { workflow, condition, needs } }. */
export const calledWorkflows = () => Object.fromEntries(Object.entries(jobsOf(readWorkflow('ci.yml')))
  .map(([job, text]) => [job, {
    workflow: (text.match(/^ {4}uses: \.\/\.github\/workflows\/([\w.-]+\.ya?ml)\s*$/m) || [])[1] || null,
    condition: (text.match(/^ {4}if: (.+)$/m) || [])[1] || null,
    needs: (text.match(/^ {4}needs: ([\w-]+)\s*$/m) || [])[1] || null,
  }])
  .filter(([, call]) => call.workflow));

/**
 * Does a pull request that changes `file` run `workflow`? True when ci.yml
 * calls it with no area condition, or its area reaches the file.
 */
export const runsOnPullRequest = (workflow, file) => {
  const call = Object.values(calledWorkflows()).find((entry) => entry.workflow === workflow);
  if (!call) return false;
  const area = workflow.replace(/\.ya?ml$/, '');
  if (!call.condition) return true;
  if (!(area in CI_AREAS)) return false;
  return changedAreas([file])[area];
};
