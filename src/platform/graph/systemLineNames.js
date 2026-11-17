/*
 * A SYSTEM'S LINES, NAMED BY THEIR EQUATIONS (WCAG 1.4.1).
 *
 * The Systems of Equations question (SystemGrader.jsx) lists its equations,
 * each beside a swatch of its line's colour, and draws the two lines in those
 * colours: the swatch was all that paired an equation with its line. Where the
 * list shows a line's own equation, the line is named by it on the graph
 * (GraphDisplay.jsx draws a function's `label` beside its curve). Only there:
 * a name never says what the question does not show, and a line whose equation
 * is not listed, or is written another way, keeps what its author gave it.
 *
 * A listed equation is read only in the form the system generator writes
 * (problemGenerator.js lineLatex: "y = 2x - 3", "y = -x", "y = 4"); anything
 * else names nothing.
 */

import { staticLineCoefficients } from '../../graphSpecUtils.js';

const NUMBER = String.raw`(?:\d+(?:\.\d+)?|\.\d+)`;
const SLOPE_INTERCEPT = new RegExp(String.raw`^y=(?:([+-]?${NUMBER}?)x(?:([+-])(${NUMBER}))?|([+-]?${NUMBER}))$`);

/** { m, b } of an equation written y = mx + b, or null. */
export const slopeInterceptOf = (equation) => {
  const text = String(equation ?? '').replace(/\s+/g, '').replace(/[−–]/g, '-');
  const match = SLOPE_INTERCEPT.exec(text);
  if (!match) return null;
  if (match[4] !== undefined) return { m: 0, b: Number(match[4]) };
  const m = match[1] === '' || match[1] === '+' ? 1 : match[1] === '-' ? -1 : Number(match[1]);
  const b = match[2] ? Number(`${match[2]}${match[3]}`) : 0;
  return Number.isFinite(m) && Number.isFinite(b) ? { m, b } : null;
};

// The name as the list shows it, with a minus sign rather than a hyphen.
const asName = (equation) => String(equation).trim().replace(/\s+/g, ' ').replace(/-/g, '−');
const same = (p, q) => Math.abs(p - q) < 1e-9;

/**
 * The graph to draw: `graph` itself, or a copy whose lines the list shows
 * carry their equations as `label`. A function its author named keeps its name.
 */
export const nameSystemLines = ({ graph, equations = [], showEquations = true }) => {
  if (!showEquations || !graph || !Array.isArray(graph.functions) || !Array.isArray(equations) || !equations.length) return graph;
  const listed = equations.map((equation) => ({ equation, line: slopeInterceptOf(equation) })).filter((entry) => entry.line);
  if (!listed.length) return graph;
  let named = false;
  const functions = graph.functions.map((spec) => {
    if (!spec || typeof spec !== 'object' || (spec.type || spec.kind || 'line') !== 'line' || String(spec.label ?? '').trim()) return spec;
    // The line as GraphDisplay draws it (graphSpecUtils.js).
    const { m, b } = staticLineCoefficients(spec);
    if (!Number.isFinite(m) || !Number.isFinite(b)) return spec;
    const own = listed.find(({ line }) => same(line.m, m) && same(line.b, b));
    if (!own) return spec;
    named = true;
    return { ...spec, label: asName(own.equation) };
  });
  return named ? { ...graph, functions } : graph;
};
