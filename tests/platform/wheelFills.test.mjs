/*
 * A WHEEL'S LEVEL IS ITS FILL AS WELL AS ITS COLOUR, IN THE APP'S OWN THEMES (WCAG 1.4.1).
 *
 * My Math Path's mastery wheel and the CCMR readiness wheel told a level apart on the wheel by colour alone, and the
 * mastery wheel's two kinds of round done were a green and a purple dot. A contrast theme already told them apart by
 * fill (forcedColors.css). Now the app's themes do too (src/components/student/wheelFills.js): each level is its
 * colour and its fill, solid, hatched one way, the other, both, level, or empty (a muted one inside a dashed edge),
 * and a round done is an empty ring or a solid dot. These hold, as rendered:
 *   - each level of each wheel looks different from every other with its colour taken away;
 *   - a hatch runs the same way on the wheel, in its key and under a contrast theme;
 *   - every new mark keeps 3:1 against what it sits on, on the light card and the dark one;
 *   - the two round-done marks are different shapes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { parseCss } from './helpers/cssRules.mjs';
import {
  WHEEL_EMPTY_EDGE, WHEEL_HATCHES, WHEEL_HATCH_INK, WHEEL_MUTED_DASH, wedgePaint, wheelSwatchStyle,
} from '../../src/components/student/wheelFills.js';
import { MASTERY_STATUS_COLORS, MASTERY_STATUS_FILLS } from '../../src/platform/mastery/strandConfig.js';
import { DOMAIN_STATE, DOMAIN_STATE_FILLS, DOMAIN_STATE_PRESENTATION } from '../../src/platform/ccmr/domainReadiness.js';
import { READINESS } from '../../src/platform/ccmr/assessmentPathways.js';

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');

// ------------------------------------------------------------------ colour arithmetic (WCAG 2 relative luminance)
const hex = (value) => [1, 3, 5].map((at) => parseInt(value.slice(at, at + 2), 16));
const channel = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const ratio = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const over = (fg, bg, alpha) => fg.map((c, i) => c * alpha + bg[i] * (1 - alpha));

// The two themes' tokens, as tokens.css defines them.
const TOKENS = read('src/theme/tokens.css');
const lightToken = (name) => new RegExp(`:root \\{[\\s\\S]*?${name}: (#[0-9a-f]{6})`).exec(TOKENS)?.[1];
const darkToken = (name) => new RegExp(`\\[data-theme='dark'\\] \\{[\\s\\S]*?${name}: (#[0-9a-f]{6})`).exec(TOKENS)?.[1];
const THEMES = Object.freeze({
  light: (name) => lightToken(name),
  dark: (name) => darkToken(name),
});
const tokenOf = (value) => /^var\((--[\w-]+)\)$/.exec(value)?.[1];

// ------------------------------------------------------------------ the levels
const MASTERY = Object.keys(MASTERY_STATUS_COLORS).map((status) => ({ name: status, fill: MASTERY_STATUS_FILLS[status], colour: MASTERY_STATUS_COLORS[status] }));
const READINESS_STATES = Object.values(DOMAIN_STATE).map((state) => ({ name: state, fill: DOMAIN_STATE_FILLS[state], colour: DOMAIN_STATE_PRESENTATION[state].color }));

// What a level looks like with its colour taken away: what its wedge is filled with (a colour, a hatch, the card),
// the way its lines run, and its edge's dash.
const lineDirections = (fill) => {
  const hatch = WHEEL_HATCHES[fill];
  if (!hatch) return [];
  // An upright line turned by `rotate` (SVG turns clockwise) runs at 90 + rotate; a level one at rotate.
  return hatch.lines.map((line) => (((line === 'upright' ? 90 : 0) + hatch.rotate) % 180 + 180) % 180).sort((a, b) => a - b);
};
const colourless = ({ fill, colour }) => {
  const paint = wedgePaint({ scope: 'w', fill, colour });
  const kind = paint.paint.startsWith('url(') ? 'hatch' : paint.paint === colour ? 'solid' : 'empty';
  return JSON.stringify([kind, lineDirections(fill), Boolean(paint.edge), paint.dash || null]);
};

test('every level of each wheel looks different from every other with its colour taken away', () => {
  for (const [wheel, levels] of [['mastery', MASTERY], ['readiness', READINESS_STATES]]) {
    const looks = levels.map(colourless);
    assert.equal(new Set(looks).size, levels.length, `${wheel}: ${levels.map((level, index) => `${level.name} ${looks[index]}`).join('; ')}`);
  }
  // As the levels were named for a contrast theme: Mastered solid, Not Enough Evidence empty, a muted state dashed.
  assert.equal(colourless(MASTERY[0]), JSON.stringify(['solid', [], false, null]));
  assert.equal(wedgePaint({ scope: 'w', fill: 'open', colour: '#dadce0' }).edge, WHEEL_EMPTY_EDGE);
  assert.equal(wedgePaint({ scope: 'w', fill: 'muted', colour: '#dadce0' }).dash, WHEEL_MUTED_DASH);
});

// A CSS repeating-linear-gradient at θ draws stripes running at θ (mod 180) in screen terms.
const cssDirections = (value) => [...String(value || '').matchAll(/(-?\d+)deg/g)].map((match) => ((Number(match[1]) % 180) + 180) % 180).sort((a, b) => a - b);

test('a hatch runs the same way on the wheel, in its key\'s swatch, and under a contrast theme', () => {
  const rules = parseCss(read('src/theme/forcedColors.css'));
  const forcedMask = (fill) => rules.find((rule) => rule.selectors.includes(`[data-mm-plane-part="${fill}"]`) && rule.declarations['mask-image'])?.declarations['mask-image'].value;
  for (const fill of Object.keys(WHEEL_HATCHES)) {
    const forced = cssDirections(forcedMask(fill));
    assert.ok(forced.length, `${fill}: drawn under a contrast theme`);
    assert.deepEqual(lineDirections(fill), forced, `${fill}: the wheel's lines run as the contrast theme's`);
    assert.deepEqual(cssDirections(wheelSwatchStyle({ fill, colour: '#34a853' }).background), forced, `${fill}: its key's swatch runs the same way`);
  }
  // A swatch is drawn as its wedge: the colour under the lines, the card inside an edge, dashed where muted.
  assert.match(wheelSwatchStyle({ fill: 'hatch-rise', colour: '#34a853' }).background, /, #34a853$/);
  assert.equal(wheelSwatchStyle({ fill: 'solid', colour: '#1e8e3e' }).background, '#1e8e3e');
  assert.match(wheelSwatchStyle({ fill: 'open', colour: '#dadce0' }).border, /solid var\(--mm-text-muted\)$/);
  assert.match(wheelSwatchStyle({ fill: 'muted', colour: '#dadce0' }).border, /dashed var\(--mm-text-muted\)$/);
});

test('every new mark keeps 3:1 against what it sits on, on the light card and the dark one', () => {
  const ink = hex(WHEEL_HATCH_INK);
  for (const [theme, token] of Object.entries(THEMES)) {
    const card = hex(token('--mm-surface'));
    assert.ok(card, `${theme}: the card's colour`);
    // A hatch's lines on its level's colour, at the wedge's 90% and its 100% (named in the hub).
    for (const level of [...MASTERY, ...READINESS_STATES].filter(({ fill }) => WHEEL_HATCHES[fill])) {
      for (const alpha of [0.9, 1]) {
        const measured = ratio(over(ink, card, alpha), over(hex(level.colour), card, alpha));
        assert.ok(measured >= 3, `${theme}: the hatch on ${level.name} (${level.colour}) at ${alpha}: ${measured.toFixed(2)}:1`);
      }
    }
    // An empty level's edge on the card.
    const edge = hex(token(tokenOf(WHEEL_EMPTY_EDGE)));
    assert.ok(ratio(over(edge, card, 0.9), card) >= 3, `${theme}: an empty level's edge`);
  }
});

// ------------------------------------------------------------------ as rendered
const withServer = async (run) => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'silent', cacheDir: join(tmpdir(), 'mm-vite-wheel-fills') });
  try { return await run(server); } finally { await server.close(); }
};
const attributes = (tag) => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]));
const styleOf = (tag) => Object.fromEntries((attributes(tag).style || '').split(';').map((entry) => entry.split(':').map((part) => part.trim())).filter(([name]) => name));

test('the mastery wheel draws every level by its colour and fill, and a round done as a ring or a dot', async () => {
  await withServer(async (server) => {
    const { MyMathPathWheel, ROUND_MARKS } = await server.ssrLoadModule('/src/components/student/MyMathPathWheel.jsx');
    const { getMasteryStrands, DEFAULT_MASTERY_COURSE_ID } = await server.ssrLoadModule('/src/platform/mastery/strandConfig.js');
    const codes = getMasteryStrands(DEFAULT_MASTERY_COURSE_ID).flatMap((strand) => strand.codes);
    const profiles = Object.fromEntries(MASTERY.map((level, index) => [codes[index], { mastery: { status: level.name, estimate: 50 }, signals: { retention: 'stable' } }]));
    // A practice round done on the first skill, a Level 3 round on the second.
    const markup = renderToStaticMarkup(React.createElement(MyMathPathWheel, { masteryProfilesByTEKS: profiles, skillProgressByTEKS: { [codes[0]]: { passesCompleted: 1 }, [codes[1]]: { passesCompleted: 3 } } }));
    const patterns = Object.fromEntries([...markup.matchAll(/<pattern ([^>]*)>([\s\S]*?)<\/pattern>/g)].map(([, tag, body]) => [attributes(tag).id, { tag: attributes(tag), body }]));
    const looks = new Map();
    for (const level of MASTERY) {
      const tag = [...markup.matchAll(/<path [^>]*data-wheel-fill="([\w-]+)"[^>]*>/g)].find((match) => match[1] === level.fill)?.[0];
      assert.ok(tag, `${level.name}: a wedge`);
      const wedge = attributes(tag);
      const pattern = /^url\(#(.+)\)$/.exec(wedge.fill)?.[1];
      // What it is drawn with, colour aside: a pattern's lines (their turn), the colour itself, or the card in an edge.
      const look = pattern
        ? `hatch ${patterns[pattern]?.tag.patternTransform} ${[...patterns[pattern].body.matchAll(/<line ([^>]*?)\/?>/g)].map(([, line]) => (attributes(line).x1 === attributes(line).x2 ? 'upright' : 'level')).join('+')}`
        : wedge.fill === level.colour ? 'solid' : `${wedge.fill} edge ${styleOf(tag).stroke} ${wedge['stroke-dasharray'] || ''}`;
      if (pattern) {
        // The pattern is the level's colour (its plate) under lines of the ink.
        assert.match(patterns[pattern].body, new RegExp(`<rect [^>]*fill="${level.colour}"`), `${level.name}: its colour under the hatch`);
        assert.match(patterns[pattern].body, new RegExp(`<line [^>]*stroke="${WHEEL_HATCH_INK}"`), `${level.name}: lines of the ink`);
      }
      looks.set(level.name, look);
    }
    assert.equal(new Set(looks.values()).size, MASTERY.length, [...looks].map(([name, look]) => `${name}: ${look}`).join('; '));
    // The two rounds: a ring (the card inside a coloured edge) and a dot (filled, no edge), each on a plate.
    const rounds = [...markup.matchAll(/<g data-round-mark="(\w+)">([\s\S]*?)<\/g>/g)].map(([, shape, body]) => ({ shape, circles: [...body.matchAll(/<circle ([^>]*?)\/?>/g)].map(([, tag]) => ({ ...attributes(tag), style: styleOf(`<c ${tag}>`) })) }));
    assert.deepEqual(rounds.map((round) => round.shape).sort(), ['dot', 'ring']);
    const mark = (shape) => rounds.find((round) => round.shape === shape).circles.find((circle) => circle['data-mm-plane-part'] !== 'plate');
    assert.equal(mark('ring').style.fill, 'var(--mm-surface)', 'a ring is empty');
    assert.equal(mark('ring').style.stroke, ROUND_MARKS.practice.colour, 'inside an edge of its colour');
    assert.equal(mark('dot').style.fill, ROUND_MARKS.stretch.colour, 'a dot is solid');
    assert.equal(mark('dot').style.stroke, undefined, 'with no edge');
    assert.notEqual(ROUND_MARKS.practice.shape, ROUND_MARKS.stretch.shape);
    // Each mark's colour is a theme token that keeps 3:1 on its plate (the card), light and dark.
    for (const [theme, token] of Object.entries(THEMES)) {
      for (const [round, { colour }] of Object.entries(ROUND_MARKS)) {
        const measured = ratio(hex(token(tokenOf(colour))), hex(token('--mm-surface')));
        assert.ok(measured >= 3, `${theme}: a ${round} round's mark ${measured.toFixed(2)}:1`);
      }
    }
  });
});

test('the readiness wheel draws every state by its colour and fill, and its list the same way', async () => {
  await withServer(async (server) => {
    const { CCMRReadinessWheel } = await server.ssrLoadModule('/src/components/student/CCMRReadinessWheel.jsx');
    // One domain in each state (domainReadiness.js stateFor).
    const practised = (status) => ({ status, evidenceBasis: 'direct', assessmentProficiency: 0.7 });
    const domains = [
      ['none', []],
      ['prereq', [{ status: READINESS.STRENGTHEN }]],
      ['gap', [{ status: READINESS.TRANSFER_GAP }]],
      ['recommended', [{ status: READINESS.RECOMMENDED }]],
      ['ready', [{ status: READINESS.READY }]],
      ['developing', [practised(READINESS.READY), practised(READINESS.READY)]],
      ['strong', [practised(READINESS.STRONG)]],
    ];
    const recommendations = {
      profile: { displayName: 'Practice test', domains: domains.map(([id]) => ({ id, title: `Domain ${id}`, weight: 1 })) },
      byDomain: domains.map(([domainId, items]) => ({ domainId, items })),
    };
    const markup = renderToStaticMarkup(React.createElement(CCMRReadinessWheel, { recommendations }));
    const wedges = [...markup.matchAll(/<path [^>]*data-wheel-fill="([\w-]+)"[^>]*>/g)].map(([tag, level]) => ({ level, paint: attributes(tag).fill, dash: attributes(tag)['stroke-dasharray'] || null, style: styleOf(tag) }));
    assert.deepEqual(wedges.map((wedge) => wedge.level).sort(), Object.values(DOMAIN_STATE_FILLS).sort(), 'one wedge in each state');
    // Colour aside: a hatch's pattern (one per hatch), the colour itself, or the card inside an edge, dashed or not.
    const looks = wedges.map((wedge) => JSON.stringify([
      wedge.paint.startsWith('url(') ? markup.match(new RegExp(`<pattern [^>]*id="${wedge.paint.slice(5, -1)}"[^>]*>`))?.[0].match(/data-wheel-hatch="([\w-]+)"/)?.[1] : wedge.paint.startsWith('var(') ? 'empty' : 'colour',
      wedge.style.stroke === 'var(--mm-surface)' ? 'gap' : 'edge',
      wedge.dash,
    ]));
    assert.equal(new Set(looks).size, wedges.length, looks.join(' '));
    for (const wedge of wedges.filter((entry) => entry.level.startsWith('hatch'))) {
      assert.match(wedge.paint, /^url\(#/, `${wedge.level}: the wedge is filled with its pattern`);
      assert.match(markup, new RegExp(`<pattern [^>]*id="${wedge.paint.slice(5, -1)}"[^>]*data-wheel-hatch="${wedge.level}"`), `${wedge.level}: the pattern is its hatch`);
    }
    // The list beside the wheel: each swatch drawn as its wedge.
    const swatches = [...markup.matchAll(/<span [^>]*data-mm-swatch="([\w-]+)"[^>]*>/g)].map(([tag, fill]) => ({ fill, style: styleOf(tag) }));
    assert.equal(swatches.length, domains.length);
    for (const swatch of swatches) {
      if (WHEEL_HATCHES[swatch.fill]) assert.match(swatch.style.background, /repeating-linear-gradient/, `${swatch.fill}: hatched in the list`);
      if (swatch.fill === 'muted') assert.match(swatch.style.border, /dashed/, 'nothing matched yet: a dashed edge in the list');
    }
  });
});
