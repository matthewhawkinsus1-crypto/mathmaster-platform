// Sign collapsing, and the prose it must not touch.
//
// Vertex form is authored as `(x-{{h}})`, which is correct until `h` draws
// negative and the student is shown `(x--5)`. Generating 24 instances from all
// 5,150 templates found 329 families doing this — every quadratic vertex
// family, every slope-from-two-points family, anything that subtracts a signed
// parameter.
//
// It is not cosmetic. No textbook prints `(x--5)`; a student who reads it as
// `(x-5)` puts the vertex at +5 instead of -5 and gets the question wrong for a
// reason that is the platform's fault. It also appeared in ANSWER fields, where
// a key of `--4` marks a student typing `4` incorrect.
//
// The rewrite is exact sign arithmetic at the seam that creates the problem, so
// it holds for every template authored after today too.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { collapseSigns, generatePathInstance } from '../../functions/shared/pathQuestionGeneration.mjs';

// --- The arithmetic ---------------------------------------------------------------

test('two negatives make a plus', () => {
  assert.equal(collapseSigns('$y=4(x--5)^2$'), '$y=4(x+5)^2$');
  assert.equal(collapseSigns('$(-28--8)$'), '$(-28+8)$');
});

test('a plus and a minus make a minus', () => {
  assert.equal(collapseSigns('$3 + -7$'), '$3 -7$');
  assert.equal(collapseSigns('$3 - +7$'), '$3 -7$');
});

test('a run of any length collapses by parity', () => {
  // Two adjacent signed substitutions can produce three signs in a row, which
  // pattern-by-pattern rules miss.
  assert.equal(collapseSigns('$3---4$'), '$3-4$');
  assert.equal(collapseSigns('$3----4$'), '$3+4$');
});

test('a run opening a term leaves the number bare', () => {
  assert.equal(collapseSigns('$x = --4$'), '$x = 4$');
  assert.equal(collapseSigns('$x = +-4$'), '$x = -4$');
});

test('an answer key stored as a bare expression is fixed too', () => {
  // The case that actively marks correct answers wrong.
  assert.equal(collapseSigns('--4'), '4');
  assert.equal(collapseSigns('-+4'), '-4');
  assert.equal(collapseSigns('x--5'), 'x+5');
});

test('a single sign is left alone', () => {
  ['$y = -5$', '$-4$', '-4', '$(x-5)$', '$3 + 7$'].forEach((text) => {
    assert.equal(collapseSigns(text), text);
  });
});

test('spacing around the surviving sign is preserved', () => {
  assert.equal(collapseSigns('$x = --4$'), '$x = 4$', 'the space after = survives');
});

// --- What it must NOT touch ---------------------------------------------------------

test('an em-dash in a sentence is punctuation, not arithmetic', () => {
  const prose = 'A long dash -- like this one -- stays put.';
  assert.equal(collapseSigns(prose), prose);
});

test('a hyphenated word is left alone', () => {
  assert.equal(collapseSigns('The word well--formed here'), 'The word well--formed here');
});

test('undelimited arithmetic inside a sentence IS fixed', () => {
  // A solution review routinely writes a sum mid-sentence with no `$` around
  // it. The sentence must survive; the sum must not.
  assert.equal(
    collapseSigns('The $x^2$ coefficients add to -8+-6=-14.'),
    'The $x^2$ coefficients add to -8-6=-14.',
  );
});

test('a math function name is mathematics, not a word', () => {
  assert.equal(collapseSigns('f^-1(x)=sqrt(x-(-2))+-3'), 'f^-1(x)=sqrt(x-(-2))-3');
});

test('non-strings and clean strings pass through untouched', () => {
  assert.equal(collapseSigns(null), null);
  assert.equal(collapseSigns(7), 7);
  assert.equal(collapseSigns(undefined), undefined);
  assert.equal(collapseSigns('nothing to do here'), 'nothing to do here');
});

// --- Against the real bank ------------------------------------------------------------

const bankTemplates = () => {
  const docs = [];
  readdirSync('seed/pathQuestionBank').filter((name) => name.endsWith('.json')).forEach((name) => {
    const parsed = JSON.parse(readFileSync(join('seed/pathQuestionBank', name), 'utf8'));
    (parsed.documents || []).forEach((doc) => {
      if (doc.active !== false) docs.push(doc);
    });
  });
  return docs;
};

const collectStrings = (node, out = []) => {
  if (typeof node === 'string') { out.push(node); return out; }
  if (Array.isArray(node)) { node.forEach((item) => collectStrings(item, out)); return out; }
  if (node && typeof node === 'object') Object.values(node).forEach((value) => collectStrings(value, out));
  return out;
};

test('no template in the bank authors a literal double dash', () => {
  // The premise the prose guard rests on. If this ever fails, an author has
  // written an em-dash and the guard needs re-examining before it is trusted.
  const offenders = bankTemplates().filter((template) => (
    collectStrings(template).some((text) => /--/.test(text.replace(/\\[A-Za-z]+/g, '')))
  ));
  assert.equal(offenders.length, 0,
    `templates authoring a literal "--": ${offenders.slice(0, 5).map((t) => t.id).join(', ')}`);
});

test('a sample of the real bank generates no double signs', () => {
  // The regression this whole change exists to prevent. A subset, so the test
  // stays fast; scripts/audit-generator-health.mjs runs the exhaustive version.
  const templates = bankTemplates();
  const step = Math.max(1, Math.floor(templates.length / 240));
  const sampled = templates.filter((unused, index) => index % step === 0);

  const bad = [];
  sampled.forEach((template) => {
    for (let seed = 0; seed < 6; seed += 1) {
      const result = generatePathInstance(template, `sign-${seed}`);
      if (!result.question) continue;
      const offending = collectStrings(result.question).find((text) => (
        /[0-9A-Za-z)\]}=(,[]\s*[-+]\s*[-+]\s*\d/.test(text)
      ));
      if (offending) { bad.push(`${template.id}: ${offending.slice(0, 80)}`); break; }
    }
  });

  assert.deepEqual(bad, [], `double signs reached generated instances:\n${bad.slice(0, 6).join('\n')}`);
});
