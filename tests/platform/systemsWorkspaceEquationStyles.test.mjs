import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { componentSource, executableSource } from './helpers/sourceContract.mjs';

const attributes = (tag) => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]));

// Rendered as the screen renders it (server-side, through Vite): read from the drawing, not from how the code says it.
test('ordinary linear systems draw two differently colored solid equation lines, and the key gives each its colour', async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'silent', cacheDir: join(tmpdir(), 'mm-vite-systems-equation-styles') });
  try {
    const { default: SystemsWorkspace } = await server.ssrLoadModule('/src/tools/systemsWorkspace/SystemsWorkspace.jsx');
    const markup = renderToStaticMarkup(React.createElement(SystemsWorkspace, { questionData: {}, onAction: () => {} }));
    const lines = [...markup.matchAll(/<line [^>]*data-mm-plane-part="line"[^>]*>/g)].map(([tag]) => attributes(tag));
    assert.equal(lines.length, 2, 'both equations drawn');
    assert.notEqual(lines[0].stroke, lines[1].stroke, 'in two colours');
    for (const line of lines) assert.equal(line['stroke-dasharray'], undefined, 'solid: a dash is a strict inequality\'s boundary');
    // The key: "Equation 1" and "Equation 2", each a solid swatch of its own line's colour.
    const key = [...markup.matchAll(/<svg [^>]*data-mm-plane-key=""[^>]*><line ([^>]*)><\/line><\/svg><strong>([^<]*)<\/strong>/g)]
      .map(([, line, label]) => ({ label, ...attributes(`<line ${line}>`) }));
    assert.deepEqual(key.map((item) => item.label), ['Equation 1', 'Equation 2']);
    key.forEach((item, index) => {
      assert.equal(item.style, `stroke:${lines[index].stroke}`, `${item.label}: its line's colour`);
      assert.equal(item['stroke-dasharray'], undefined, `${item.label}: solid`);
    });
  } finally {
    await server.close();
  }
});

test('rewrite stage delegates balanced operations and sign reversal to the mature relation solver', () => {
  const rewrite = executableSource(componentSource('src/tools/systemsWorkspace/EmbeddedInequalityRewrite.jsx'));
  const relationCore = executableSource(componentSource('src/MultiRelationAlgebraCore.jsx'));
  assert.match(rewrite, /import MultiRelationAlgebraCore from '..\/..\/MultiRelationAlgebraCore\.jsx'/);
  assert.match(rewrite, /<MultiRelationAlgebraCore/);
  assert.match(relationCore, /applyBalancedOperationToBranches/);
  assert.match(relationCore, /requireExplicitPlacement:\s*true/);
  assert.match(relationCore, /requiresInequalityFlip/);
  assert.match(relationCore, /pendingRelationFlip/);
  assert.match(relationCore, /validateRelationTransition/);
  assert.match(rewrite, /graphableConstraintFromRelation\(relation\)/);
});
