#!/usr/bin/env node
// Deep certification sweep for the Digital SAT Mathematics V2.1 bank.
//
// This holds the Digital SAT bank to the bar the ASVAB direct/challenge rebuild
// established, and it is deliberately read-only: it writes a report and changes
// nothing. The framework-neutral analyzers (answer-key rank bias, task
// fingerprints, prompt overlap, sentence frames) are imported from the shared
// fidelity module rather than reimplemented, because an auditor carrying its own
// copy of the label parser is an auditor that disagrees with the gate it is
// supposed to predict. Everything Digital-SAT-specific lives here.
//
//   node scripts/audit-digital-sat-certification.mjs [--samples 400] [--json out.json]
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { samplePathInstances } from '../functions/shared/pathQuestionGeneration.mjs';
import { codeOf, isCountOptionSet, isComputational } from './lib/digital-sat-audit-rules.mjs';
import {
  analyzeAnswerKeyBias,
  analyzeFamilySet,
  promptOverlap,
  taskFingerprint,
} from '../functions/shared/asvabFidelity.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};
const SAMPLES = Number(flag('samples', 400));
const YIELD_DRAWS = Number(flag('yield', 2000));
const JSON_OUT = flag('json', null);

const load = (file) => {
  const parsed = JSON.parse(readFileSync(path.join(ROOT, file), 'utf8'));
  return parsed.documents || parsed.items || parsed.questions || [];
};

// Defaults to the shipping seed. `--source drafts/digitalSAT.v2.1.json` points
// it at the compiled draft instead, which is how repairs are measured on a
// branch that must not touch the production mirrors.
const SOURCE = flag('source', 'seed/pathQuestionBank/digitalSAT_pathQuestionBank_seed.json');
const SAT = load(SOURCE);
const OTHER_FRAMEWORKS = {
  act: load('seed/pathQuestionBank/act_pathQuestionBank_seed.json'),
  tsia2: load('seed/pathQuestionBank/tsia2_pathQuestionBank_seed.json'),
  asvab: load('seed/pathQuestionBank/asvab_pathQuestionBank_seed.json'),
};

const domainOf = (q) => q?.assessmentContext?.domainId || '(none)';
const roleOf = (q) => q?.ccmrFamilyRole || '(none)';
// ---------------------------------------------------------------- 2. voice
//
// The Digital SAT asks a question; it does not address the test taker as a
// student in a course. Everything on this list is classroom or authoring
// vocabulary that would have leaked into a stem, plus the framework's own
// scaffolding labels, which a test taker should never see.
const VOICE_BANS = [
  [/\bdemonstrate\b/i, 'coaching verb "demonstrate"'],
  [/\bpractice\b/i, 'classroom word "practice"'],
  [/\bDOK\s*\d/i, 'DOK label'],
  [/\bdepth of knowledge\b/i, 'DOK label'],
  [/\bTEKS\b/i, 'TEKS reference'],
  [/\bstudents?\s+(will|should|must|need to)\b/i, 'objective language'],
  [/\byour teacher\b/i, 'classroom framing'],
  [/\bin this (lesson|unit|module|activity)\b/i, 'classroom framing'],
  [/\b(show|explain) your (work|reasoning|thinking)\b/i, 'coaching instruction'],
  [/\brework\b/i, 'wrapper language "rework"'],
  [/\ba test taker chose\b/i, 'challenge-wrapper preamble'],
  [/\bharder version\b/i, 'wrapper language'],
  [/\bchallenge (question|item|version)\b/i, 'tier label in the stem'],
  [/\blet us\b/i, 'conversational framing'],
  [/\bremember(,| that)\b/i, 'coaching aside'],
  [/\bhint:/i, 'inline hint'],
  [/\bwithout using a calculator\b/i, 'calculator instruction in the stem'],
  [/\bselect the best answer\b/i, 'directions text in the stem'],
];

// ---------------------------------------------------------------- 3. choices
const numericLabel = (label) => {
  // Labels arrive as numbers as often as strings — a generator that derives an
  // integer emits an integer. An earlier version of this check tested
  // `typeof label !== 'string'` and returned null for every numeric label,
  // which silently reduced two of the checks below to the LaTeX-labelled
  // families only.
  if (typeof label === 'number') return Number.isFinite(label) ? label : null;
  if (typeof label !== 'string') return null;
  const cleaned = label
    .replace(/\$/g, '')
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/[{}]/g, ' ')
    .replace(/,/g, '')
    .trim();
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
};

// A choice id that names the key defeats the whole item. The retired ASVAB
// tier used the literal string `asvab-correct`; anything that reads as an
// answer marker is the same defect.
const TRANSPARENT_ID = /(correct|answer|key|right|true)/i;

const report = {
  generatedAt: new Date().toISOString(),
  source: SOURCE,
  samplesPerFamily: SAMPLES,
  totals: {},
  verdicts: { keep: 0, revise: 0, replace: 0 },
  findings: [],
};

const finding = (severity, code, id, detail) => {
  report.findings.push({ severity, code, id, detail });
};

// ---------------------------------------------------------------- per family
for (const q of SAT) {
  const issues = [];

  // 5. generation reliability
  const samples = samplePathInstances(q, SAMPLES);
  const instances = samples.map((s) => s.question).filter(Boolean);
  const failed = samples.length - instances.length;
  if (failed) {
    issues.push({ code: 'generationFailure', severity: 'replace', detail: `${((failed / samples.length) * 100).toFixed(2)}% of ${samples.length} seeds produced no instance` });
  }

  for (const instance of instances.slice(0, 40)) {
    const text = JSON.stringify({ prompt: instance.prompt, choices: (instance.choices || []).map((c) => c.label), stimulus: instance.stimulus || null });
    if (/\{\{[^}]+\}\}/.test(text)) {
      issues.push({ code: 'unresolvedPlaceholder', severity: 'replace', detail: 'a rendered instance still contains a template placeholder' });
      break;
    }
  }

  for (const instance of instances.slice(0, 60)) {
    const labels = (instance.choices || []).map((c) => String(c.label));
    if (labels.length && new Set(labels).size !== labels.length) {
      issues.push({ code: 'duplicateChoices', severity: 'replace', detail: 'a rendered instance repeats a choice label' });
      break;
    }
  }

  // The expected answer must name a choice that actually exists.
  for (const instance of instances.slice(0, 60)) {
    const expected = (instance.responseFields || []).map((f) => f.expected).filter(Boolean);
    const ids = new Set((instance.choices || []).map((c) => c.id));
    if (instance.assessmentItemFormat === 'multipleChoice' && expected.some((e) => !ids.has(e))) {
      issues.push({ code: 'expectedAnswerMissing', severity: 'replace', detail: `expected ${expected.join(',')} names no choice` });
      break;
    }
  }

  // 3. distractor quality — rank bias, fixed-offset sets, arithmetic ladders
  const bias = analyzeAnswerKeyBias(instances);
  for (const issue of bias.issues) {
    issues.push({ code: issue.code, severity: 'replace', detail: issue.detail });
  }

  if (bias.numeric) {
    let ladder = 0;
    let nearKey = 0;
    let counted = 0;
    for (const instance of instances) {
      const keyId = (instance.responseFields || [])[0]?.expected;
      const values = (instance.choices || []).map((c) => ({ id: c.id, value: numericLabel(c.label) }));
      if (!values.length || values.some((v) => v.value === null)) continue;
      const key = values.find((v) => v.id === keyId)?.value;
      if (key === undefined || key === null) continue;
      counted += 1;
      const sorted = values.map((v) => v.value).sort((a, b) => a - b);
      const gaps = sorted.slice(1).map((v, i) => v - sorted[i]);
      if (!isCountOptionSet(sorted) && gaps.length && gaps.every((g) => Math.abs(g - gaps[0]) < 1e-9)) ladder += 1;
      const others = values.filter((v) => v.id !== keyId).map((v) => v.value);
      if (Math.abs(key) >= 8 && others.every((v) => Math.abs(v - key) <= 3)) nearKey += 1;
    }
    if (counted && ladder / counted > 0.9) {
      issues.push({ code: 'arithmeticLadderChoices', severity: 'replace', detail: `all four options sit in an equally spaced ladder in ${Math.round((100 * ladder) / counted)}% of draws` });
    }
    if (counted && nearKey / counted > 0.9) {
      issues.push({ code: 'fixedOffsetDistractors', severity: 'replace', detail: `every distractor sits within 3 of the key in ${Math.round((100 * nearKey) / counted)}% of draws` });
    }
  }

  for (const choice of q.choices || []) {
    if (TRANSPARENT_ID.test(String(choice.id))) {
      issues.push({ code: 'transparentChoiceId', severity: 'replace', detail: `choice id "${choice.id}" names the answer` });
      break;
    }
  }

  // 2. voice
  const visible = [q.prompt, ...(q.choices || []).map((c) => c.label)].filter(Boolean).join('   ');
  for (const [pattern, label] of VOICE_BANS) {
    if (pattern.test(visible)) issues.push({ code: 'voice', severity: 'revise', detail: label });
  }

  // 6. assessment fidelity. A calculator is permitted on every Digital SAT
  // math question, so a family declaring the opposite would mis-describe the
  // test it claims to imitate.
  if (q.calculatorPolicy === 'none') {
    issues.push({ code: 'calculatorPolicy', severity: 'revise', detail: 'declared calculator-prohibited; the Digital SAT allows a calculator throughout' });
  }

  const worst = issues.some((i) => i.severity === 'replace') ? 'replace' : (issues.length ? 'revise' : 'keep');
  report.verdicts[worst] += 1;
  for (const issue of issues) finding(issue.severity, issue.code, q.id, issue.detail);
}

// ---------------------------------------------------------------- 4. clones
const cloneCounts = {
  taskClone: 0, frameClone: 0, promptOverlap: 0, crossTierTaskClone: 0, generatorClone: 0,
};
const byCode = new Map();
for (const q of SAT) {
  const code = codeOf(q);
  if (!byCode.has(code)) byCode.set(code, []);
  byCode.get(code).push(q);
}
for (const [code, rows] of byCode) {
  for (const issue of analyzeFamilySet(code, rows).issues) {
    cloneCounts[issue.code] = (cloneCounts[issue.code] || 0) + 1;
    finding('revise', issue.code, code, issue.detail);
  }
}

// A challenge family whose underlying calculation matches a direct family in
// the same standard is the exact defect the ASVAB rebuild existed to remove,
// and it is worth counting separately from same-tier duplication.
for (const [, rows] of byCode) {
  const direct = rows.filter((q) => roleOf(q) === 'direct');
  const challenge = rows.filter((q) => roleOf(q) === 'challenge');
  for (const c of challenge.filter(isComputational)) {
    const print = taskFingerprint(c);
    // taskFingerprint reads the generator's structure, so two prose items that
    // merely share a sentence shape collapse onto the same print. Requiring the
    // wording to overlap as well keeps the finding to families that really are
    // the same item twice.
    const twin = direct.filter(isComputational)
      .find((d) => taskFingerprint(d) === print && promptOverlap(c.prompt || '', d.prompt || '') > 0.25);
    if (twin) {
      cloneCounts.crossTierTaskClone += 1;
      finding('replace', 'crossTierTaskClone', c.id, `challenge family shares its task structure with direct ${twin.id}`);
    }
    const gen = JSON.stringify(c.generator || {});
    const genTwin = direct.filter(isComputational)
      .find((d) => JSON.stringify(d.generator || {}) === gen && gen !== '{}');
    if (genTwin) {
      cloneCounts.generatorClone += 1;
      finding('replace', 'generatorClone', c.id, `challenge family reuses the generator of direct ${genTwin.id}`);
    }
  }
}

// ---------------------------------------------------------------- 7. cross-framework
const contamination = [];
for (const [framework, docs] of Object.entries(OTHER_FRAMEWORKS)) {
  const prints = new Map();
  for (const q of docs) if (!prints.has(taskFingerprint(q))) prints.set(taskFingerprint(q), q);
  for (const q of SAT) {
    const other = prints.get(taskFingerprint(q));
    if (!other) continue;
    const overlap = promptOverlap(q.prompt, other.prompt || '');
    if (overlap > 0.6) {
      contamination.push({
        framework, sat: q.id, other: other.id, overlap: Number(overlap.toFixed(2)),
      });
      finding('revise', 'crossFrameworkClone', q.id, `shares task structure and ${(overlap * 100).toFixed(0)}% of 4-grams with ${framework} ${other.id}`);
    }
  }
}

// ---------------------------------------------------------------- coverage
const count = (rows, key) => rows.reduce((acc, q) => ({ ...acc, [key(q)]: (acc[key(q)] || 0) + 1 }), {});
const directRows = SAT.filter((q) => roleOf(q) === 'direct');
const challengeRows = SAT.filter((q) => roleOf(q) === 'challenge');
report.totals = {
  families: SAT.length,
  direct: directRows.length,
  challenge: challengeRows.length,
  standards: byCode.size,
  byDomain: count(SAT, domainOf),
  byDomainDirect: count(directRows, domainOf),
  byDomainChallenge: count(challengeRows, domainOf),
  byFormat: count(SAT, (q) => q.assessmentItemFormat || '(none)'),
  byFormatDomain: Object.fromEntries(['algebra', 'advancedMath', 'problemSolvingData', 'geometryTrigonometry']
    .map((d) => [d, count(SAT.filter((q) => domainOf(q) === d), (q) => q.assessmentItemFormat || '(none)')])),
  byRepresentation: count(SAT, (q) => q.representation || '(none)'),
  byTaskType: count(SAT, (q) => q.taskType || '(none)'),
  byBandDirect: count(directRows, (q) => q.difficultyBand),
  byBandChallenge: count(challengeRows, (q) => q.difficultyBand),
  byDokDirect: count(directRows, (q) => q.dok),
  byDokChallenge: count(challengeRows, (q) => q.dok),
  byCalculatorPolicy: count(SAT, (q) => q.calculatorPolicy || '(unset)'),
};
report.cloneCounts = cloneCounts;
report.crossFrameworkMatches = contamination;

// ---------------------------------------------------------------- yield probe
const yieldFailures = [];
for (const q of SAT) {
  const samples = samplePathInstances(q, YIELD_DRAWS);
  const fails = samples.filter((s) => !s.question).length;
  if (fails) yieldFailures.push({ id: q.id, rate: Number(((fails / YIELD_DRAWS) * 100).toFixed(2)) });
}
report.generationYieldFailures = yieldFailures;

// ---------------------------------------------------------------- output
const bySeverity = report.findings.reduce((acc, f) => ({ ...acc, [f.severity]: (acc[f.severity] || 0) + 1 }), {});
const byKind = report.findings.reduce((acc, f) => ({ ...acc, [f.code]: (acc[f.code] || 0) + 1 }), {});

console.log(`Digital SAT V2.1 certification sweep  —  ${SAT.length} families, ${SAMPLES} samples each`);
console.log(`  source ${SOURCE}`);
console.log(`  direct ${report.totals.direct}   challenge ${report.totals.challenge}   standards ${report.totals.standards}`);
console.log(`\nverdicts: keep=${report.verdicts.keep} revise=${report.verdicts.revise} replace=${report.verdicts.replace}`);
console.log('\nfindings by kind:');
Object.entries(byKind).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${String(v).padStart(5)}  ${k}`));
console.log(`\nfindings by severity: ${JSON.stringify(bySeverity)}`);
console.log(`\nclones: ${JSON.stringify(cloneCounts)}`);
console.log(`cross-framework matches: ${contamination.length}`);
console.log(`generation-yield failures: ${yieldFailures.length}`);
console.log(`\ndomain split (all): ${JSON.stringify(report.totals.byDomain)}`);
console.log(`domain split (challenge): ${JSON.stringify(report.totals.byDomainChallenge)}`);
console.log(`item formats: ${JSON.stringify(report.totals.byFormat)}`);
console.log(`calculator policy: ${JSON.stringify(report.totals.byCalculatorPolicy)}`);
console.log(`difficulty band, direct: ${JSON.stringify(report.totals.byBandDirect)}`);
console.log(`difficulty band, challenge: ${JSON.stringify(report.totals.byBandChallenge)}`);
console.log(`DOK, direct: ${JSON.stringify(report.totals.byDokDirect)}`);
console.log(`DOK, challenge: ${JSON.stringify(report.totals.byDokChallenge)}`);

if (JSON_OUT) {
  writeFileSync(path.join(ROOT, JSON_OUT), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nfull report written to ${JSON_OUT}`);
}
