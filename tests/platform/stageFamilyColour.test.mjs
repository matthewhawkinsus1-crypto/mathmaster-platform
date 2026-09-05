import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { STAGE_KINDS } from '../../src/platform/workflow/interactionStages.js';
import {
  COLOURED_STAGE_KINDS, STAGE_FAMILIES, STAGE_FAMILY_IDS, stageFamily, stageFamilyLabel,
} from '../../src/platform/workflow/stageFamilies.js';

/*
 * Colour carries meaning in the staged workflow, which makes it something that
 * can be WRONG rather than merely ugly. Two things are checked here:
 *
 *   1. Every interaction primitive has a family. A new primitive that nobody
 *      assigned would fall back to blue and quietly say "build it" about a step
 *      that is nothing of the kind.
 *   2. Every family's text clears WCAG AA on its own ground. A palette that
 *      reads well on a designer's monitor and fails at 4.5:1 is not a palette,
 *      it is a bug that only some students hit.
 */

const CSS = readFileSync('src/platform/workflow/WorkflowFocusMode.css', 'utf8');

const srgb = (hex) => {
  const value = hex.replace('#', '');
  return [0, 2, 4].map((at) => {
    const channel = parseInt(value.slice(at, at + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
};

const luminance = (hex) => {
  const [r, g, b] = srgb(hex);
  return (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
};

const contrast = (a, b) => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
};

/** The four custom properties a family block declares, read from the stylesheet. */
const familyTokens = (family) => {
  const block = CSS.match(
    new RegExp(`\\[data-family="${family}"\\][^{]*\\{([^}]*)\\}`),
  );
  assert.ok(block, `no CSS block declares the ${family} family`);
  const read = (name) => {
    const found = block[1].match(new RegExp(`--wf-${name}:\\s*(#[0-9a-fA-F]{6})`));
    assert.ok(found, `${family} does not set --wf-${name}`);
    return found[1];
  };
  return { accent: read('accent'), accentDark: read('accent-dark'), tint: read('tint'), edge: read('edge') };
};

test('every interaction primitive is assigned a family', () => {
  const unassigned = STAGE_KINDS.filter((kind) => !COLOURED_STAGE_KINDS.includes(kind));
  assert.deepEqual(
    unassigned,
    [],
    `these stage kinds would silently fall back to "build": ${unassigned.join(', ')}`,
  );
});

test('no family is assigned to a kind that does not exist', () => {
  const stale = COLOURED_STAGE_KINDS.filter((kind) => !STAGE_KINDS.includes(kind));
  assert.deepEqual(stale, [], `these mappings point at removed primitives: ${stale.join(', ')}`);
});

test('every family names itself in words, so colour is never the only signal', () => {
  STAGE_FAMILY_IDS.forEach((id) => {
    assert.ok(STAGE_FAMILIES[id].label.trim().length > 0, `${id} has no label`);
  });
  // The label a student actually sees on the active step.
  assert.equal(stageFamilyLabel('graphFeatureSelect'), 'Find it');
  assert.equal(stageFamilyLabel('classification'), 'Decide');
  assert.equal(stageFamilyLabel('pointInput'), 'State it');
  assert.equal(stageFamilyLabel('coordinatePlot'), 'Build it');
});

test('an unknown kind falls back rather than throwing', () => {
  // Preflight already rejects unknown kinds; a question that somehow reached a
  // student should not lose its styling on top of whatever else is wrong.
  assert.equal(stageFamily('somethingNobodyBuilt'), 'build');
  assert.equal(stageFamily(undefined), 'build');
  assert.equal(stageFamily(null), 'build');
});

test('every family declares the whole token set', () => {
  // Downstream rules read only these four, so a family missing one inherits the
  // previous family's colour and two steps look identical.
  STAGE_FAMILY_IDS.forEach((family) => {
    const tokens = familyTokens(family);
    Object.entries(tokens).forEach(([name, value]) => {
      assert.match(value, /^#[0-9a-f]{6}$/i, `${family} --wf-${name} is not a hex colour`);
    });
  });
});

test('family text clears WCAG AA on its own tint', () => {
  STAGE_FAMILY_IDS.forEach((family) => {
    const { accentDark, tint } = familyTokens(family);
    const ratio = contrast(accentDark, tint);
    assert.ok(
      ratio >= 4.5,
      `${family}: ${accentDark} on ${tint} is ${ratio.toFixed(2)}:1, below the 4.5 needed for body text`,
    );
  });
});

test('family text clears WCAG AA on white', () => {
  // The step heading sits on the panel's white lower half.
  STAGE_FAMILY_IDS.forEach((family) => {
    const { accentDark } = familyTokens(family);
    const ratio = contrast(accentDark, '#ffffff');
    assert.ok(ratio >= 4.5, `${family}: ${accentDark} on white is ${ratio.toFixed(2)}:1`);
  });
});

test('white button text clears WCAG AA on every family accent', () => {
  // The primary "Next step" button fills with a gradient from accent to
  // accent-dark, so the LIGHTER end is the one that has to hold up.
  STAGE_FAMILY_IDS.forEach((family) => {
    const { accent } = familyTokens(family);
    const ratio = contrast('#ffffff', accent);
    assert.ok(
      ratio >= 4.5,
      `${family}: white on ${accent} is ${ratio.toFixed(2)}:1 — the Next button would be hard to read`,
    );
  });
});

test('the families are visually distinct from one another', () => {
  // Two families a student cannot tell apart carry no information. Compared on
  // the accent, which is the strongest statement each one makes.
  const accents = STAGE_FAMILY_IDS.map((family) => [family, familyTokens(family).accent]);
  accents.forEach(([familyA, a], index) => {
    accents.slice(index + 1).forEach(([familyB, b]) => {
      assert.notEqual(a, b, `${familyA} and ${familyB} use the same accent`);
      const separation = Math.abs(luminance(a) - luminance(b));
      const hueApart = a !== b;
      assert.ok(hueApart || separation > 0.05, `${familyA} and ${familyB} are indistinguishable`);
    });
  });
});

test('motion is optional', () => {
  // Everything animated here decorates a layout that already works, so a
  // student who asks their device for less motion must get the still version.
  assert.match(CSS, /@media \(prefers-reduced-motion: reduce\)/);
  const guard = CSS.slice(CSS.indexOf('@media (prefers-reduced-motion: reduce)'));
  ['workflow-focus__active-stage', 'workflow-focus__step--answered'].forEach((animated) => {
    assert.ok(guard.includes(animated), `${animated} animates with no reduced-motion guard`);
  });
});
