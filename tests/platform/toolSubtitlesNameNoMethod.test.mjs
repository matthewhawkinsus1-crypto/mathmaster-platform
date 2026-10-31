/*
 * TL36 (finding C1-138): A TOOL'S ONE-LINE DESCRIPTION NAMES NO METHOD.
 *
 * Every tool writes a sentence under its name ("About this tool", the first
 * line of "How to do this"). It is shown on practice and withheld on an
 * exit ticket, quiz or test (taskCardSupport), because tool-written ones named
 * the method more often than not — Matrix Lab's read "Solve A · X = B with
 * matrix technology: X = A⁻¹B." — so practice handed over the route that the
 * assessment held back. A description says what the tool IS and what the
 * student works on, never how.
 *
 * Two halves. The descriptions in src/tools are read for the kinds of thing
 * that gave the route away; and the reader is held to the descriptions it was
 * written for — the old wording of each one it must catch (a pattern someone
 * drops fails there), and the Matrix Lab sentence is rendered as practice and
 * an assessment show it.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';

import { closeEngine, loadEngine } from './helpers/actionBarRender.mjs';
import { render, text, withBrowser } from './helpers/studentToolRender.mjs';
import { executableSource } from './helpers/sourceContract.mjs';

after(closeEngine);

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/* ------------------------------------------------ reading the descriptions */

const jsxUnder = (relative) => readdirSync(path.join(repo, relative)).flatMap((entry) => {
  const child = path.join(relative, entry);
  if (statSync(path.join(repo, child)).isDirectory()) return jsxUnder(child);
  return entry.endsWith('.jsx') ? [child] : [];
});

// String literals in an expression: 'a', "b", `c ${x} d` (the parts around a ${…}).
const literalsIn = (expression) => [...expression.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)]
  .flatMap((match) => (match[1] ?? match[2] ?? (match[3] ?? '').split(/\$\{[^}]*\}/)))
  .map((value) => value.trim())
  .filter(Boolean);

// From just after `subtitle =` / `subtitle:` to the end of its value: one string
// literal, one {…}, or a bare expression (a ternary) up to its `;` or `,`.
const skipString = (code, from) => {
  const quote = code[from];
  let index = from + 1;
  while (index < code.length && code[index] !== quote) index += code[index] === '\\' ? 2 : 1;
  return index + 1;
};
const valueAt = (code, start) => {
  const first = code[start];
  if (first === '"' || first === "'" || first === '`') return code.slice(start, skipString(code, start));
  let depth = 0;
  for (let index = start; index < code.length; index += 1) {
    const char = code[index];
    if (char === '"' || char === "'" || char === '`') { index = skipString(code, index) - 1; continue; }
    if (char === '{' || char === '(' || char === '[') depth += 1;
    else if (char === '}' || char === ')' || char === ']') {
      depth -= 1;
      // The end of `{…}`, or of the object or call this value sits in.
      if (depth === 0 && first === '{') return code.slice(start, index + 1);
      if (depth < 0) return code.slice(start, index);
    } else if (depth === 0 && (char === ';' || char === ',')) return code.slice(start, index);
  }
  return code.slice(start);
};

// Every description a tool writes: subtitle="…", subtitle={cond ? '…' : '…'},
// `subtitle: '…'` in a table of modes, and the `toolSubtitle = …` a tool builds first.
const subtitlesIn = (source) => {
  const code = executableSource(source);
  const found = [];
  for (const match of code.matchAll(/\b\w*[Ss]ubtitle\s*(?:=|:)(?!=)\s*/g)) {
    found.push(...literalsIn(valueAt(code, match.index + match[0].length)));
  }
  return found;
};

const read = (file) => readFileSync(path.join(repo, file), 'utf8');
const TOOL_FILES = jsxUnder('src/tools').filter((file) => !file.endsWith('shared/ToolShell.jsx'));
const SUBTITLES = TOOL_FILES.flatMap((file) => subtitlesIn(read(file)).map((subtitle) => ({ file, subtitle })));

/* ------------------------------------------------- what gives the route away */

// Each is a KIND of leak, with the words a tool writer reaches for.
const LEAKS = [
  [/[=^·]|⁻¹/, 'a formula (X = A⁻¹B, A · X = B): the route written down'],
  [/\b(?:Factor Theorem|Remainder Theorem|area model|FOIL|synthetic division|long division|quadratic formula|completing the square|discriminant|conjugates?|elimination|substitution|distributive|cross-multipl\w+|common denominator|inverse operations|sign chart|critical points|row by column|common factors?|residuals?)\b/i, 'a named theorem, algorithm or technique'],
  [/\b(?:bring down|multiply back|swap(?:ping)?|set one variable|repeat(?:ed)?|reflect|enforce|expose|verify|build an interval|opposite of every term|by reasoning about|instead of memori[sz]ing|check(?:ing)? (?:every )?candidates?)\b/i, 'a step of the method'],
  [/\b(?:equidistant|quarter-turn|extraneous|association with causation|clearest way)\b/i, 'the idea the item measures, or the answer to it'],
];
const leaksOf = (subtitle) => LEAKS.filter(([pattern]) => pattern.test(subtitle)).map(([, why]) => why);

// What these said before (the finding's list; the exit ticket withheld them, practice showed them).
const WERE = [
  'Solve A · X = B with matrix technology: X = A⁻¹B.',
  'Write a system of equations as one matrix equation, A · X = B.',
  'Multiply matrices row by column — and decide when a product exists.',
  'Use the Factor Theorem to connect evaluation, zeros, and factors.',
  'Build multiplication from an area model instead of memorizing FOIL.',
  'Multiply every term by every term with an area model.',
  'Subtract by adding the opposite of every term, then combine like terms.',
  'Factor a monic quadratic by reasoning about sum and product.',
  'Divide polynomials and verify quotient + remainder structure.',
  'Long division: divide, multiply back, subtract, bring down — then repeat.',
  'Synthetic division: bring down, multiply by r, add — column by column.',
  'Track common factors to distinguish zeros, holes, and vertical asymptotes.',
  'Divide by x − r with synthetic division, then read what the table tells you.',
  'Use logarithms to expose an exponent containing the unknown.',
  'Rewrite a logarithmic equation exponentially, then enforce the logarithm’s positive-input domain.',
  'Reflect a transformed exponential into its logarithmic inverse, including domain/range and asymptotes.',
  'Use composition to verify that the exponential and logarithmic functions undo one another.',
  'Use a conjugate to turn a complex denominator into a real number.',
  'Build integer powers through repeated complex multiplication and track magnitude.',
  'See multiplication by powers of i as quarter-turn rotations around the origin.',
  'Extend the quadratic formula into the complex plane when the discriminant is negative.',
  'Derive a linear inverse by swapping x and y, then keeping every algebra move balanced.',
  'Build the solution set from critical points, sign changes, and the endpoint rules that go with them.',
  'Check candidate solutions in the original equation to catch the extraneous ones.',
  'Solve a radical equation step by step, then check every candidate in the original equation.',
  'Test the defining property: every parabola point is equidistant from focus and directrix.',
  'Build a model, inspect residuals, compare functions, and make defensible predictions without confusing association with causation.',
  'Set one variable to zero, solve, and write the intercept as a point.',
  'Choose the zero coordinate, make the substitution yourself, solve, and turn the result into a point.',
  'Select two rows to build an interval, record what you calculate, and repeat until you can prove whether the rate of change is constant.',
  'A relation drawn as two sets with arrows between them — the clearest way to see whether it is a function.',
];

test('TL36: the reader finds the descriptions of the tools it is held to', () => {
  // Not vacuous: it reaches every tool file that writes one, and the several
  // shapes a description takes (an attribute, a table of modes, a ternary, a
  // value built before the shell).
  const wrote = TOOL_FILES.filter((file) => /\bsubtitle\b/i.test(executableSource(read(file))));
  const reached = new Set(SUBTITLES.map(({ file }) => file));
  assert.deepEqual(wrote.filter((file) => !reached.has(file)), [], 'every tool file that writes a description is read');
  assert.ok(SUBTITLES.length >= 60, `${SUBTITLES.length} descriptions read`);
  const all = SUBTITLES.map(({ subtitle }) => subtitle);
  for (const known of [
    'Solve a matrix equation with matrix technology.', // an object in a table of modes (MatrixLab)
    'Graph the solution using the correct endpoint and direction.', // built before the shell (IntervalNumberLine)
    'Every card belongs in one teacher-defined category. Place each card, then check the complete sort.', // a ternary (OpenSortBoard)
    'Divide a polynomial by x − r, one step at a time.', // Polynomial Workshop
    'Connect the pattern, table, discrete graph, and term structure.', // Sequence Explorer
  ]) assert.ok(all.includes(known), known);
  // …and there is more than one tool in Algebra II and in Algebra I among them.
  assert.ok(new Set(SUBTITLES.map(({ file }) => file.split('/')[2])).size >= 25);
});

test('TL36: no tool description names the method', () => {
  const offenders = SUBTITLES.map(({ file, subtitle }) => ({ file, subtitle, why: leaksOf(subtitle) })).filter(({ why }) => why.length);
  assert.deepEqual(offenders.map(({ file, subtitle, why }) => `${file}: "${subtitle}" — ${why.join('; ')}`), []);
});

test('TL36: the reader catches every description that used to name the method', () => {
  assert.ok(WERE.length >= 30);
  for (const subtitle of WERE) assert.ok(leaksOf(subtitle).length > 0, `not caught: "${subtitle}"`);
  // And each KIND of leak is the one that catches something (a pattern dropped from LEAKS fails here).
  for (const [pattern, why] of LEAKS) assert.ok(WERE.some((subtitle) => pattern.test(subtitle)), `nothing it was written for: ${why}`);
  // None of the old ones is still written anywhere.
  const now = new Set(SUBTITLES.map(({ subtitle }) => subtitle));
  for (const subtitle of WERE) assert.ok(!now.has(subtitle), `still written: "${subtitle}"`);
});

test('TL36: practice shows Matrix Lab\'s description without the route, and an assessment shows none', async () => {
  const { server } = await loadEngine();
  const registry = await server.ssrLoadModule('/src/tools/toolRegistry.js');
  const { ToolRuntimeProvider } = await server.ssrLoadModule('/src/tools/shared/ToolRuntimeContext.jsx');
  const lab = await server.ssrLoadModule('/src/dev/MathToolsLab.jsx');
  const tool = registry.getToolDefinition('matrixLab').component;
  // What the description says, as a student who has opened the folds reads it:
  // the lab's own stage text and calculator keys ([A]⁻¹) are not the description.
  const described = async (runtime) => {
    const markup = await withBrowser(() => {
      window.localStorage.getItem = (key) => (String(key).startsWith('mm.tool.') ? 'open' : null);
      return render(React.createElement(ToolRuntimeProvider, runtime, React.createElement(tool, { questionData: lab.SAMPLE_SPECS.matrixLab, onAction() {}, attemptRecord: null })));
    });
    return [...markup.matchAll(/<div class="mathmaster-tool-task-about"[^>]*>([\s\S]*?)<\/div>/g)].map((match) => text(match[1]));
  };
  // The sample is Matrix Lab's "solve" mode: the one whose description was "X = A⁻¹B".
  assert.equal(lab.SAMPLE_SPECS.matrixLab.mode, 'solve');
  const practice = await described({});
  assert.equal(practice.length, 1, 'practice shows the description once');
  assert.match(practice[0], /Solve a matrix equation with matrix technology\./);
  assert.doesNotMatch(practice[0], /A⁻¹|=/);
  assert.deepEqual(await described({ hintsAllowed: false }), [], 'withheld on an assessment, as before');
});
