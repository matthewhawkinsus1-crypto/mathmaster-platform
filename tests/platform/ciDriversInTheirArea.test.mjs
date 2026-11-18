/*
 * A DRIVER A WORKFLOW RUNS IS IN THAT WORKFLOW'S OWN AREA.
 *
 * ci.yml runs a workflow on a pull request only when the pull request changes
 * a file the workflow's area reaches (scripts/lib/ciAreas.mjs). A browser
 * driver whose own file is outside that area runs only when something else in
 * the area changes: a pull request that changed the driver alone, or broke it,
 * never ran it. My Math Path's topic browser was one; the accommodation review
 * QA (student and teacher journeys) and Work View's terminal transition (Stage
 * 4) were two more. This holds every workflow ci.yml calls with an area to
 * the rule.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { calledWorkflows, readWorkflow, runsOnPullRequest } from './helpers/ciWorkflows.mjs';

const driversOf = (workflow) => [...new Set(
  [...readWorkflow(workflow).matchAll(/\bnode (tests\/browser\/[\w/.-]+\.mjs)\b/g)].map(([, file]) => file),
)];

test('every browser driver a workflow with an area runs is reached by that area', () => {
  const gated = Object.values(calledWorkflows()).filter((call) => call.condition);
  assert.ok(gated.length >= 10, `${gated.length} workflows called with an area`);
  const outside = [];
  let checked = 0;
  for (const { workflow } of gated) {
    for (const driver of driversOf(workflow)) {
      checked += 1;
      if (!runsOnPullRequest(workflow, driver)) outside.push(`${workflow}: ${driver}`);
    }
  }
  assert.ok(checked >= 100, `${checked} drivers checked`);
  assert.deepEqual(outside, [], 'a pull request that changes only one of these drivers does not run it');
});

test('the two drivers that were outside now run with a change to their own files', () => {
  assert.ok(runsOnPullRequest('student-teacher-journeys.yml', 'tests/browser/accommodationReviewQa.mjs'));
  for (const file of ['tests/browser/workViewTerminalTransition.mjs', 'tests/browser/workViewTerminalTransition.html', 'tests/browser/workViewTerminalTransitionMain.jsx']) {
    assert.ok(runsOnPullRequest('work-view-stage-4-certification.yml', file), file);
  }
});
