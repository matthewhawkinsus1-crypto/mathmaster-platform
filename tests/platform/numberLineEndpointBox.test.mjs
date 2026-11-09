/*
 * THE NUMBER LINE'S TYPED ENDPOINT IS A MATH BOX (the 2026-11-06 re-walk of
 * the changed lessons: in Algebra I M3 T2 L4 and L4 Honors Warm-Up 1, "Exact
 * endpoint value" was a plain text box among math boxes, with the phone's
 * letter keyboard and no math keys).
 *
 * It is the tool's own MathInput now, as its interval-notation and inequality
 * boxes are. Its name, its description (the hint under it, or the error) and
 * its invalid mark are as they were (A11Y-8), it owns its Enter, which places
 * the endpoint, and what it places is what the line's reader takes, as
 * MathLive spells what a student types. The endpoint's grading is unchanged:
 * the graph a student builds is graded, never this box.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';

import { closeEngine, loadEngine } from './helpers/actionBarRender.mjs';
import { render, withBrowser } from './helpers/studentToolRender.mjs';
import { compiled, versionsOf } from './helpers/lessonFileChecks.mjs';
import { parseExactNumberLineValue } from '../../src/tools/intervalNumberLine/intervalMath.js';

after(closeEngine);

const warmUpOne = (file, questionId) => {
  const { questions } = compiled(readFileSync(new URL(`../../teacher-import-jsons/algebra1-module3/${file}`, import.meta.url), 'utf8'));
  const [version] = versionsOf(questions.find((question) => question.questionId === questionId), 1);
  return version;
};

/** The Interval Number Line as a student opens it, in a practice or a DOL runtime. */
const toolMarkup = async (questionData, runtime) => {
  const { server } = await loadEngine();
  const registry = await server.ssrLoadModule('/src/tools/toolRegistry.js');
  const { ToolRuntimeProvider } = await server.ssrLoadModule('/src/tools/shared/ToolRuntimeContext.jsx');
  const Tool = registry.getToolDefinition('intervalNumberLine').component;
  return withBrowser(() => {
    // Every fold open, so each step is in the markup.
    window.localStorage.getItem = (key) => (String(key).startsWith('mm.tool.') ? 'open' : null);
    return render(React.createElement(ToolRuntimeProvider, runtime, React.createElement(Tool, { questionData, onAction() {}, attemptRecord: null })));
  });
};

test('the exact endpoint is typed in a math box, named and described as before, and it owns its Enter', async () => {
  const lab = (await (await loadEngine()).server.ssrLoadModule('/src/dev/MathToolsLab.jsx')).SAMPLE_SPECS.intervalNumberLine;
  const questions = [
    ['L4 Warm-Up 1', warmUpOne('T2_L4_Graphing_Inequalities_in_Two_Variables.json', 'm3t2l4-wu-1')],
    ['L4 Honors Warm-Up 1', warmUpOne('T2_L4_Graphing_Inequalities_in_Two_Variables_Honors.json', 'm3t2l4h-wu-1')],
    ['the lab\'s interval question', lab],
  ];
  for (const [name, question] of questions) {
    // The lab's sample is the tool's spec alone; a lesson's question names its tool.
    if (question.questionId) assert.equal(question.type, 'intervalNumberLine', name);
    for (const runtime of [{}, { hintsAllowed: false, verdictsWithheld: true }]) {
      const markup = await toolMarkup(question, runtime);
      const boxes = [...markup.matchAll(/<math-field\b([^>]*)>/g)].map(([, attrs]) => attrs).filter((attrs) => /aria-label="Exact endpoint value"/.test(attrs));
      assert.equal(boxes.length, 1, `${name}: one math box for the exact endpoint`);
      const [attrs] = boxes;
      assert.match(attrs, /data-mm-enter-owner="field"/, `${name}: Enter is the box's own`);
      assert.doesNotMatch(attrs, /aria-invalid=/, `${name}: nothing typed yet, nothing invalid`);
      const describedBy = /aria-describedby="([^"]+)"/.exec(attrs)?.[1];
      assert.ok(describedBy, `${name}: the box has a description`);
      assert.match(markup, new RegExp(`id="${describedBy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" data-endpoint-help="hint"`), `${name}: described by the hint under it`);
      assert.doesNotMatch(markup, /<input\b[^>]*type="text"/, `${name}: no plain text box is left in the tool`);
    }
  }
});

test('what the box places is what the line reads, as MathLive spells a typed endpoint', () => {
  // A typed slash becomes a stacked fraction, sqrt a radical and pi a π.
  for (const [typed, value] of [
    ['-3', -3], ['1.625', 1.625], ['-\\frac{13}{8}', -1.625], ['\\frac{-13}{8}', -1.625],
    ['\\sqrt{5}', Math.sqrt(5)], ['\\pi', Math.PI], ['\\frac{\\pi}{2}', Math.PI / 2], ['2\\sqrt{3}', 2 * Math.sqrt(3)],
  ]) {
    const read = parseExactNumberLineValue(typed);
    assert.ok(read !== null && Math.abs(read - value) < 1e-9, `${typed} places ${value} (read ${read})`);
  }
  // A value with a letter in it is still refused, and said so (A11Y-8).
  assert.equal(parseExactNumberLineValue('\\frac{13}{8x}'), null);
});
