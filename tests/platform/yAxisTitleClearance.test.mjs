/*
 * P-3: A STATIC GRAPH'S Y-AXIS TITLE STAYS CLEAR OF ITS TICK LABELS.
 *
 * The student walkthrough of 2026-11-06: with CI's fonts, "Total sales, f(b)
 * (dollars)" ran over "1500" and "1000" on the sales graphs of Algebra I M3
 * T1 L3 (CW 3, 4, 6, 8; Honors CW 2, 5). GraphDisplay set the title at a fixed
 * x = 15 and the labels end 9 units left of the axis. The title now sits clear
 * of the widest label, and the left margin widens only where both cannot fit
 * (yAxisTitleLayout.js). Widths are figure units at a wide font's metrics
 * (DejaVu Sans, CI's system font); the browser pass measures real glyphs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

import { tickLabelWidth, yAxisTitleLayout } from '../../src/platform/graph/yAxisTitleLayout.js';

const TITLE = { ascent: 10.6, descent: 3.4 };

test('a title beside labels that fit keeps its place, and the frame is unchanged', () => {
  for (const input of [
    { hasTitle: false, labelWidth: tickLabelWidth(1500) },
    { hasTitle: true, labelWidth: 0 },
    { hasTitle: true, labelWidth: tickLabelWidth(10) },
    { hasTitle: true, labelWidth: tickLabelWidth(-8) },
    // The y-axis in the middle of the plot: its labels are nowhere near the title.
    { hasTitle: true, labelWidth: tickLabelWidth(1500), axisFraction: 0.5 },
  ]) {
    assert.deepEqual(yAxisTitleLayout({ width: 620, padding: 48, ...input }), { left: 48, titleX: 15 }, JSON.stringify(input));
  }
});

test('beside four-digit labels the title moves clear of them, and the margin widens only by what they need', () => {
  for (const tick of [100, 1500, 2400, -1500, 12.5, 10000]) {
    const labelWidth = tickLabelWidth(tick);
    const { left, titleX } = yAxisTitleLayout({ width: 620, padding: 48, axisFraction: 0, labelWidth, hasTitle: true });
    const labelsLeft = left - 9 - labelWidth;
    assert.ok(titleX + TITLE.descent + 4 <= labelsLeft + 1e-9, `${tick}: the title ends before the labels begin`);
    assert.ok(titleX - TITLE.ascent >= 2 - 1e-9, `${tick}: the title stays inside the frame`);
    assert.ok(left >= 48 && left - 48 <= labelWidth, `${tick}: widened by ${left - 48}, not more than the label`);
    // One unit less would not do.
    if (left > 48) assert.ok(yAxisTitleLayout({ width: 620, padding: 48, axisFraction: 0, labelWidth: labelWidth - 2, hasTitle: true }).left <= left);
  }
  // The walkthrough's case: 1500 beside the title is now 4 units apart, not on top.
  const sales = yAxisTitleLayout({ width: 620, padding: 48, axisFraction: 0, labelWidth: tickLabelWidth(1500), hasTitle: true });
  assert.ok(sales.left > 48);
});

test('the walkthrough\'s sales graph is drawn with its title clear of every label', async () => {
  const lesson = JSON.parse(readFileSync(new URL('../../teacher-import-jsons/algebra1-module3/T1_L3_Modeling_and_Solving_Linear_Inequalities.json', import.meta.url), 'utf8'));
  const question = lesson.sections.flatMap((section) => section.questions).find((entry) => entry.questionId === 'm3l3-cw-3');
  const graph = JSON.parse(JSON.stringify(question)).graph || (() => {
    const find = (value) => {
      if (!value || typeof value !== 'object') return null;
      if (value.yAxisLabel) return value;
      for (const nested of Object.values(value)) { const found = find(nested); if (found) return found; }
      return null;
    };
    return find(question);
  })();
  assert.equal(graph.yAxisLabel, 'Total sales, f(b) (dollars)');
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const { default: GraphDisplay } = await server.ssrLoadModule('/src/GraphDisplay.jsx');
    const markup = renderToStaticMarkup(React.createElement(GraphDisplay, { graph, enlargeable: false }));
    const title = markup.match(/<text x="([-\d.]+)"[^>]*transform="rotate\(-90 ([-\d.]+) [-\d.]+\)"[^>]*>Total sales, f\(b\) \(dollars\)<\/text>/);
    assert.ok(title, 'the y-axis title is drawn on its side');
    const titleRight = Number(title[1]) + TITLE.descent;
    const labels = [...markup.matchAll(/<text x="([-\d.]+)" y="[-\d.]+" text-anchor="end" font-size="12"[^>]*>(-?[\d.]+)<\/text>/g)];
    assert.ok(labels.filter((label) => label[2].replace('-', '').length >= 4).length >= 3, 'four-digit y labels are drawn');
    labels.forEach(([, x, text]) => {
      assert.ok(Number(x) - tickLabelWidth(text) >= titleRight + 4 - 1e-9, `${text} starts ${Number(x) - tickLabelWidth(text)}, the title ends ${titleRight}`);
    });
    assert.ok(Number(title[1]) - TITLE.ascent >= 2 - 1e-9, 'inside the frame');
  } finally {
    await server.close();
  }
});
