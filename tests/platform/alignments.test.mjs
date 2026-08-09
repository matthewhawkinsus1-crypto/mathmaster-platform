import assert from 'node:assert/strict';
import {
  ALIGNMENT_FRAMEWORKS,
  getDirectEvidenceAlignments,
  getPrimaryTeksCodes,
  normalizeAssessmentContext,
  normalizeQuestionAlignments,
  validateAlignments,
} from '../../src/platform/contract/alignments.js';

const find = (list, framework) => list.filter((entry) => entry.framework === framework);

// --- legacy shapes still normalize ---------------------------------------
{
  const legacy = { standards: { primary: [{ code: 'A.2A' }], secondary: [], prerequisite: ['8.5I'] } };
  const out = normalizeQuestionAlignments(legacy, { includeCrosswalks: false });
  assert.equal(out.length, 2, 'legacy primary + prerequisite carried over');
  assert.equal(out[0].framework, 'teks');
  assert.equal(out[0].code, 'A.2A');
  assert.equal(out[0].role, 'primary');
  assert.equal(out[1].role, 'prerequisite');
  assert.equal(out[1].evidenceLevel, 'prerequisite');
}

{
  const shorthand = { teks: ['A.3C'] };
  assert.deepEqual(getPrimaryTeksCodes(shorthand), ['A.3C'], 'bare teks list is treated as primary');
}

// --- V4 alignments are canonical -----------------------------------------
{
  const v4 = {
    alignments: [
      { framework: 'teks', code: 'A.2A', role: 'primary', evidenceLevel: 'assessed' },
      { framework: 'digitalSAT', domainId: 'algebra', role: 'secondary', evidenceMode: 'crosswalk' },
    ],
  };
  const out = normalizeQuestionAlignments(v4, { includeCrosswalks: false });
  assert.equal(out.length, 2);
  assert.equal(out[1].framework, 'digitalSAT');
  assert.equal(out[1].domainId, 'algebra');
}

// --- an ordinary TEKS item gets informational crosswalks, not exam evidence ---
{
  const ordinary = { alignments: [{ framework: 'teks', code: 'A.2A', role: 'primary' }] };
  const out = normalizeQuestionAlignments(ordinary);
  const sat = find(out, 'digitalSAT');
  assert.equal(sat.length, 1, 'SAT crosswalk derived from the TEKS code');
  assert.equal(sat[0].evidenceMode, 'crosswalk', 'derived exam alignment is not direct evidence');
  assert.equal(sat[0].derivedFrom, 'A.2A');

  const direct = getDirectEvidenceAlignments(ordinary);
  assert.ok(direct.every((entry) => entry.framework === 'teks'), 'only the TEKS alignment counts as direct evidence');
  assert.ok(find(out, 'act').length && find(out, 'tsia2').length,
    'the frameworks this standard is aligned to get a crosswalk');
  // A.2A is domain and range of linear functions expressed with inequalities,
  // which the ASVAB does not test. The crosswalk is now authored per standard,
  // so an item about it must NOT claim ASVAB overlap.
  assert.equal(find(out, 'asvab').length, 0, 'no crosswalk is derived where none was authored');

  // A standard that genuinely is on all four still gets all four.
  const everywhere = normalizeQuestionAlignments({ alignments: [{ framework: 'teks', code: 'A.5A', role: 'primary' }] });
  ['digitalSAT', 'act', 'tsia2', 'asvab'].forEach((framework) => {
    assert.equal(find(everywhere, framework).length, 1, `solving linear equations is ${framework} content`);
  });
}

// --- declaring the item as SAT-style promotes that framework to direct ----
{
  const satItem = {
    alignments: [{ framework: 'teks', code: 'A.2A', role: 'primary' }],
    assessmentContext: { framework: 'digitalSAT', examStyle: true },
  };
  const out = normalizeQuestionAlignments(satItem);
  assert.equal(find(out, 'digitalSAT')[0].evidenceMode, 'direct', 'declared SAT item produces SAT evidence');
  assert.equal(find(out, 'act')[0].evidenceMode, 'crosswalk', 'other exams stay informational');
}

// --- assessmentContext defaults ------------------------------------------
{
  assert.deepEqual(normalizeAssessmentContext(undefined), { framework: 'course', examStyle: false });
  assert.deepEqual(normalizeAssessmentContext({ framework: 'act' }), { framework: 'act', examStyle: true });
  assert.deepEqual(normalizeAssessmentContext({ framework: 'nope' }), { framework: 'course', examStyle: false });
}

// --- deduplication --------------------------------------------------------
{
  const dupes = {
    alignments: [
      { framework: 'teks', code: 'A.2A', role: 'primary' },
      { framework: 'teks', code: 'a2a', role: 'secondary' },
    ],
  };
  const out = normalizeQuestionAlignments(dupes, { includeCrosswalks: false });
  assert.equal(out.length, 1, 'the same code in two roles collapses to the first');
  assert.equal(out[0].role, 'primary');
}

// --- validation -----------------------------------------------------------
{
  const bad = {
    alignments: [
      { framework: 'nope', code: 'A.2A' },
      { framework: 'digitalSAT' },
      { framework: 'digitalSAT', domainId: 'notADomain' },
      { framework: 'teks' },
      { framework: 'teks', code: 'A.2A', role: 'invalidRole' },
      { framework: 'teks', code: 'A.2A', evidenceMode: 'guess' },
    ],
    assessmentContext: { framework: 'sat' },
  };
  const { errors } = validateAlignments(bad);
  assert.ok(errors.some((e) => /unknown framework/.test(e)));
  assert.ok(errors.some((e) => /needs a "domainId"/.test(e)));
  assert.ok(errors.some((e) => /unknown digitalSAT domainId/.test(e)));
  assert.ok(errors.some((e) => /needs a "code"/.test(e)));
  assert.ok(errors.some((e) => /invalid role/.test(e)));
  assert.ok(errors.some((e) => /invalid evidenceMode/.test(e)));
  assert.ok(errors.some((e) => /assessmentContext\.framework/.test(e)));
}

{
  const good = { alignments: [{ framework: 'teks', code: 'A.2A', role: 'primary', evidenceLevel: 'assessed' }] };
  const { errors } = validateAlignments(good);
  assert.deepEqual(errors, [], 'a well-formed alignment produces no errors');
}

{
  const noPrimary = { alignments: [{ framework: 'teks', code: 'A.2A', role: 'secondary' }] };
  const { warnings } = validateAlignments(noPrimary);
  assert.ok(warnings.some((w) => /no primary alignment/.test(w)));
}

// --- hostile input --------------------------------------------------------
{
  for (const hostile of [null, undefined, 42, 'x', [], { alignments: 'nope' }, { alignments: [null, 7, []] }, { standards: 'x' }]) {
    assert.doesNotThrow(() => normalizeQuestionAlignments(hostile), `normalize survives ${JSON.stringify(hostile)}`);
    assert.doesNotThrow(() => validateAlignments(hostile), `validate survives ${JSON.stringify(hostile)}`);
  }
}

console.log('alignments.test.mjs: all assertions passed');
