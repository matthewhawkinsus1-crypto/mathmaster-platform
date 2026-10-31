/*
 * NO WORKFLOW HOLDS MORE THAN IT NEEDS (CI07).
 *
 * AGENTS.md ("Scaffolding must not merge"): one-shot patch runners holding
 * `contents: write` reached three pull requests. ciWorkflow.test.mjs stops a
 * workflow from triggering itself on a push or pull request, but one run by
 * hand (workflow_dispatch) or on a schedule could still hold write rights,
 * and a workflow that declares no permissions gets the repository's default
 * token on a manual run. So every workflow declares its permissions at the
 * top, and nothing may write except what is listed here, with its reason.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { readWorkflow, workflowFiles } from './helpers/ciWorkflows.mjs';

const MAY_WRITE = Object.freeze({
  // Opens or comments on the issue when a nightly run fails.
  'nightly-failure-issue.yml': ['issues'],
});

/** Every `permissions:` block in a workflow, top level and per job: { indent, inline, grants }. */
const permissionBlocks = (text) => [...text.matchAll(/^( *)permissions:[ \t]*([^\n#]*?)[ \t]*(?:#.*)?\n((?:\1 {2}\S.*\n)*)/gm)]
  .map(([, indent, inline, body]) => ({
    indent: indent.length,
    inline: inline.trim(),
    grants: [...body.matchAll(/^\s+([\w-]+):\s*(\w+)/gm)].map(([, scope, access]) => ({ scope, access })),
  }));

test('every workflow declares its token permissions at the top', () => {
  const files = workflowFiles();
  assert.ok(files.length >= 10, `${files.length} workflows`);
  for (const name of files) {
    const top = permissionBlocks(readWorkflow(name)).filter((block) => block.indent === 0);
    assert.equal(top.length, 1, `${name} declares no top-level permissions: a manual run would get the repository's default token`);
  }
});

test('nothing writes with the token except what is listed, and nothing asks for everything', () => {
  for (const name of workflowFiles()) {
    const text = readWorkflow(name);
    for (const block of permissionBlocks(text)) {
      assert.ok(!/^(write-all|read-all)$/.test(block.inline), `${name}: permissions: ${block.inline}`);
      assert.ok(block.inline === '' || block.inline === '{}', `${name}: inline permissions "${block.inline}" are not read here`);
      for (const { scope, access } of block.grants) {
        if (access !== 'write') continue;
        assert.ok((MAY_WRITE[name] || []).includes(scope), `${name} writes ${scope}: add it to MAY_WRITE with its reason, or drop it`);
      }
    }
    assert.doesNotMatch(text, /contents:\s*write/, `${name} can push to the repository`);
  }
});
