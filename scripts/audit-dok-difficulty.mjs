#!/usr/bin/env node
// The DOK and difficulty audit.
//
// The recommendation engine can now ask for a specific standard at a specific
// cognitive demand and a specific structural complexity. That ability is only
// as good as the metadata: asking for A.5A at DOK 3 when no A.5A template is
// authored above DOK 2 produces an empty session, which a student experiences
// as a broken Path — not as "there is nothing to stretch me on here".
//
// So this asks four questions of the real bank:
//
//   1. WHICH STANDARDS CANNOT ANSWER A REQUEST the engine is capable of making?
//   2. Where are DOK and difficulty COLLAPSED onto each other — that is, where
//      is the metadata claiming two axes and recording one?
//   3. Which standards are stuck at a single band or a single DOK, so no
//      adaptation is possible on them at all?
//   4. Where does `taskType` contradict `dok`? A template labelled procedural
//      at DOK 3, or conceptual at DOK 1, is one of the two fields being wrong.
//
// Read-only. It reports; it changes nothing.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SEED_DIR = 'seed/pathQuestionBank';

const load = () => {
  const files = readdirSync(SEED_DIR).filter((name) => name.endsWith('.json'));
  const docs = [];
  files.forEach((name) => {
    const parsed = JSON.parse(readFileSync(join(SEED_DIR, name), 'utf8'));
    (parsed.documents || []).forEach((doc) => {
      if (doc.active === false) return;
      // The course lives on the DOCUMENT in the CCMR seeds and on the FILE in
      // the course seeds. Reading only the file-level field reported 225
      // standards as course "unknown" — which was this script being wrong, not
      // the data. The exam bank is a separate axis and is named separately.
      docs.push({
        ...doc,
        sourceFile: name,
        sourceCourse: doc.courseId || parsed.courseId || 'unknown',
        bank: name.replace('_pathQuestionBank_seed.json', ''),
      });
    });
  });
  return docs;
};

const codeOf = (doc) => {
  const key = (doc.alignmentKeys || [])[0] || '';
  return String(key).includes(':') ? String(key).split(':').pop() : (doc.assessedConstruct || 'unknown');
};

const docs = load();

// --- Group by standard ------------------------------------------------------------

const byStandard = new Map();
docs.forEach((doc) => {
  const code = codeOf(doc);
  const key = `${doc.bank}|${code}`;
  if (!byStandard.has(key)) {
    byStandard.set(key, {
      course: doc.bank, code, templates: 0,
      doks: new Set(), bands: new Set(), representations: new Set(), taskTypes: new Set(),
      pairs: new Set(),
    });
  }
  const entry = byStandard.get(key);
  entry.templates += 1;
  const dok = Number(doc.dok);
  const band = Number(doc.difficultyBand);
  if (Number.isFinite(dok)) entry.doks.add(dok);
  if (Number.isFinite(band)) entry.bands.add(band);
  if (doc.representation) entry.representations.add(doc.representation);
  if (doc.taskType) entry.taskTypes.add(doc.taskType);
  if (Number.isFinite(dok) && Number.isFinite(band)) entry.pairs.add(`${dok}:${band}`);
});

const standards = [...byStandard.values()];

// --- 1. Requests the engine can make and the bank cannot answer --------------------
//
// resolveTarget asks for DOK 2 or 3, and for the student's stable band, one
// band above it for extension, and Band 1-3 for a bridge. A standard that has
// nothing at DOK 2 cannot serve an ordinary current-learning session at all.

const noDok2 = standards.filter((entry) => !entry.doks.has(2));
const noDok3 = standards.filter((entry) => !entry.doks.has(3));
const singleBand = standards.filter((entry) => entry.bands.size <= 1);
const singleDok = standards.filter((entry) => entry.doks.size <= 1);

// --- 2. Are DOK and difficulty actually independent? ------------------------------
//
// If every DOK 1 template is Band 1, every DOK 2 is Band 2 and so on, the two
// fields are one field written twice — and "same standard, easier" and "same
// standard, deeper" become the same request.

const pairCounts = new Map();
docs.forEach((doc) => {
  const dok = Number(doc.dok);
  const band = Number(doc.difficultyBand);
  if (!Number.isFinite(dok) || !Number.isFinite(band)) return;
  const key = `${dok}:${band}`;
  pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
});

// Correlation between the two axes across the whole bank. Near 1 means one axis.
const paired = docs
  .map((doc) => [Number(doc.dok), Number(doc.difficultyBand)])
  .filter(([dok, band]) => Number.isFinite(dok) && Number.isFinite(band));
const mean = (values) => values.reduce((a, b) => a + b, 0) / (values.length || 1);
const meanDok = mean(paired.map((p) => p[0]));
const meanBand = mean(paired.map((p) => p[1]));
const cov = mean(paired.map(([d, b]) => (d - meanDok) * (b - meanBand)));
const sdDok = Math.sqrt(mean(paired.map(([d]) => (d - meanDok) ** 2)));
const sdBand = Math.sqrt(mean(paired.map(([, b]) => (b - meanBand) ** 2)));
const correlation = sdDok && sdBand ? cov / (sdDok * sdBand) : 0;

// A standard where the two axes move in lockstep has no independent adaptation.
const lockstep = standards.filter((entry) => {
  if (entry.pairs.size < 2) return false;
  const pairs = [...entry.pairs].map((p) => p.split(':').map(Number));
  const doks = new Set(pairs.map((p) => p[0]));
  const bands = new Set(pairs.map((p) => p[1]));
  // Every distinct DOK maps to exactly one band and vice versa.
  return doks.size === bands.size && doks.size === entry.pairs.size && doks.size > 1;
});

// --- 3. Missing or invalid metadata -------------------------------------------------

const missingDok = docs.filter((doc) => !Number.isFinite(Number(doc.dok)));
const missingBand = docs.filter((doc) => !Number.isFinite(Number(doc.difficultyBand)));
const outOfRangeDok = docs.filter((doc) => {
  const dok = Number(doc.dok);
  return Number.isFinite(dok) && (dok < 1 || dok > 4);
});
const outOfRangeBand = docs.filter((doc) => {
  const band = Number(doc.difficultyBand);
  return Number.isFinite(band) && (band < 1 || band > 5);
});
const missingRepresentation = docs.filter((doc) => !doc.representation);

// --- 4. taskType contradicting dok --------------------------------------------------
//
// These are not style preferences. "Procedural at DOK 3" says the student must
// choose a strategy AND that the task is a known procedure, which cannot both
// be true; the engine reads dok and the audit screens read taskType, so the two
// disagreeing means one screen is lying.

const contradictions = docs.filter((doc) => {
  const dok = Number(doc.dok);
  const task = String(doc.taskType || '');
  if (!task || !Number.isFinite(dok)) return false;
  if (task === 'procedural' && dok >= 3) return true;
  if (task === 'strategic' && dok <= 1) return true;
  return false;
});

// --- Report --------------------------------------------------------------------------

const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(1)}%` : '—');
const list = (entries, limit = 12) => entries.slice(0, limit)
  .map((entry) => `${entry.course}/${entry.code}`).join(', ')
  + (entries.length > limit ? `, …and ${entries.length - limit} more` : '');

console.log('# DOK and difficulty audit\n');
console.log(`Templates: ${docs.length}   Standards with content: ${standards.length}\n`);

console.log('## 1. Requests the engine can make that the bank cannot answer\n');
console.log(`No DOK 2 template (blocks an ordinary current-learning session): ${noDok2.length} standards (${pct(noDok2.length, standards.length)})`);
if (noDok2.length) console.log(`    ${list(noDok2)}`);
console.log(`No DOK 3 template (blocks extension and transfer at depth): ${noDok3.length} standards (${pct(noDok3.length, standards.length)})`);
if (noDok3.length) console.log(`    ${list(noDok3)}`);
console.log(`Only one difficulty band (no "same standard, easier" possible): ${singleBand.length} standards (${pct(singleBand.length, standards.length)})`);
if (singleBand.length) console.log(`    ${list(singleBand)}`);
console.log(`Only one DOK (no depth adaptation possible): ${singleDok.length} standards (${pct(singleDok.length, standards.length)})`);
if (singleDok.length) console.log(`    ${list(singleDok)}`);

console.log('\n## 2. Are DOK and difficulty actually two axes?\n');
console.log(`Correlation across the whole bank: ${correlation.toFixed(3)}`);
console.log(correlation > 0.85
  ? '    HIGH — the two fields are close to being one field written twice.'
  : correlation > 0.6
    ? '    MODERATE — related, as expected, but still carrying independent information.'
    : '    LOW — the axes are genuinely independent.');
console.log(`Standards where DOK and band move in strict lockstep: ${lockstep.length}`);
if (lockstep.length) console.log(`    ${list(lockstep)}`);
console.log('\n  DOK x band distribution (dok:band = templates):');
const keys = [...pairCounts.keys()].sort((a, b) => {
  const [ad, ab] = a.split(':').map(Number);
  const [bd, bb] = b.split(':').map(Number);
  return ad - bd || ab - bb;
});
console.log('    ' + keys.map((key) => `${key}=${pairCounts.get(key)}`).join('  '));

console.log('\n## 3. Missing or invalid metadata\n');
console.log(`Missing dok: ${missingDok.length}`);
console.log(`Missing difficultyBand: ${missingBand.length}`);
console.log(`dok out of range 1-4: ${outOfRangeDok.length}`);
console.log(`difficultyBand out of range 1-5: ${outOfRangeBand.length}`);
console.log(`Missing representation (disables the anti-monotony penalty): ${missingRepresentation.length} (${pct(missingRepresentation.length, docs.length)})`);

console.log('\n## 4. taskType contradicting dok\n');
console.log(`Contradictions: ${contradictions.length}`);
contradictions.slice(0, 15).forEach((doc) => {
  console.log(`    ${doc.id}  taskType=${doc.taskType} dok=${doc.dok}`);
});
if (contradictions.length > 15) console.log(`    …and ${contradictions.length - 15} more`);

console.log('\n## Per-course summary\n');
const courses = [...new Set(standards.map((entry) => entry.course))].sort();
console.log('    course        standards  templates  no-DOK2  no-DOK3  1-band  1-DOK');
courses.forEach((course) => {
  const inCourse = standards.filter((entry) => entry.course === course);
  const templates = inCourse.reduce((sum, entry) => sum + entry.templates, 0);
  console.log([
    `    ${course.padEnd(13)}`,
    String(inCourse.length).padStart(9),
    String(templates).padStart(11),
    String(inCourse.filter((e) => !e.doks.has(2)).length).padStart(9),
    String(inCourse.filter((e) => !e.doks.has(3)).length).padStart(9),
    String(inCourse.filter((e) => e.bands.size <= 1).length).padStart(8),
    String(inCourse.filter((e) => e.doks.size <= 1).length).padStart(7),
  ].join(''));
});
