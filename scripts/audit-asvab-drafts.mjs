#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { samplePathInstances } from '../functions/shared/pathQuestionGeneration.mjs';
import { auditPathQuestionQuality, QUESTION_QUALITY } from '../functions/shared/pathQuestionQuality.mjs';
import { analyzeStandardContent, CONTENT_STATE } from '../functions/shared/pathStandardQuality.mjs';

const require = createRequire(import.meta.url);
const mathPath = require('../functions/lib/mathPath.js');
const file = process.argv[2] || 'drafts/asvab.json';
const documents = JSON.parse(readFileSync(file, 'utf8')).documents || [];
const codeOf = (q) => String(q?.alignmentKeys?.[0] || '').replace(/^texas:/i, '');
const visible = (q) => JSON.stringify({
  prompt: q.prompt || '', stimulus: q.stimulus || null, table: q.table || null,
  data: q.data || null, choices: (q.choices || []).map((c) => c.label),
});

const result = {
  total: documents.length, standards: new Set(documents.map(codeOf)).size,
  mcq: 0, ar: 0, mk: 0, badFormat: [], thin: [], duplicateChoices: [],
  generationFailures: [], controlChars: [], acceptedArrays: [],
  badCalculator: [], badFramework: [], qualityFailures: [], badStandards: [],
  suspiciousArithmeticPrompts: [],
};

const arContextSignals = /\b(machine|worker|crew|store|shop|price|cost|dollar|account|loan|saves?|saving|purchase|tax|interest|discount|coupon|rebate|recipe|batch|bottle|faucet|car|traveler|runner|cyclist|printer|parts?|pages?|miles?|kilometers?|meters?|feet|inches|yards|pounds|ounces|liters?|minutes?|hours?|students?|class|club|bag|tiles?|counters?|grid|strip|group|quantity|temperature|plan|company|program|college|family|borrower|balance|payment|rate|trip|length|distance|volume|amount|register|deposit|withdrawal|transfer|attendance|members?|product|service|theater|supply|shipment|tank|fuel|team|unit|material|inventory|warehouse|route|depot|shipments?|readiness|report|supervisor|exercise|temperatures?)\b|mix|batch|blend|shipment|order|stock|floor|back|crew|shift|detail|van|truck|bus|pickup|depot|counter|outlet|press|labeler|sorter|conveyor|stamping|bolts?|washers?|clamps?|rivets?|nuts?|screws?|pins?|anchors?|sacks?|bins?|barrels?|totes?|drums?|pallets?|loaders?|drivers?|welders?|inspectors?|helpers?|packers?|fitters?|checkers?|sand|cement|resin|filler|hardener|concentrate|base|stretch|log|gallons?|fuel|panels?|filters?|cartons?|crates?|brackets?|grinder|compressor|drill|generator|welder|fee|register|discounts?|ledger|inspection|shipments?|load|shares?|strip|grid|squares?|marked down|listed|tool|bill|tip|deposit|rail|beam|pipe|channel|crate|tank|pump|quarts?|yards?|trim|cable|hose|edging|job|piece|spare|material|conversion|entry|entries|per each/i;
const suspiciousStarts = /^(find|write|solve|compute|convert|for\s+\$|which (?:expression|equation|percent|decimal)|on a number line|use the table|the ratio begins|a benchmark percent|a model has)/i;

const plansByCode = new Map();
const itemsByCode = new Map();

for (const q of documents) {
  const code = codeOf(q);
  const subtest = q?.assessmentContext?.subtest;
  if (q.assessmentItemFormat === 'multipleChoice' && q.choices?.length === 4) result.mcq += 1;
  else result.badFormat.push(q.id);
  if (subtest === 'arithmeticReasoning') result.ar += 1;
  else if (subtest === 'mathematicsKnowledge') result.mk += 1;
  else result.badFramework.push(`${q.id}:subtest=${subtest}`);
  if (q?.assessmentContext?.framework !== 'asvab' || q?.assessmentContext?.examStyle !== true) result.badFramework.push(q.id);
  if (q.calculatorPolicy !== 'none' || q.examCalculatorMode !== 'none') result.badCalculator.push(q.id);
  if ((q.responseFields || []).some((f) => Array.isArray(f.accepted) && f.accepted.length)) result.acceptedArrays.push(q.id);
  if (/\u000[0-8bcef]/i.test(JSON.stringify(q))) result.controlChars.push(q.id);
  const qa = auditPathQuestionQuality(q);
  if (qa.level !== QUESTION_QUALITY.PRODUCTION) result.qualityFailures.push({ id: q.id, level: qa.level, warnings: qa.warnings?.map((x) => x.code) });

  let samples;
  try { samples = samplePathInstances(q, 32); }
  catch (error) { result.generationFailures.push(`${q.id}:${error.message}`); samples = []; }
  const instances = samples.map((x) => x.question).filter(Boolean);
  const variants = new Set(instances.map(visible));
  if (variants.size < 8) result.thin.push({ id: q.id, variants: variants.size });
  instances.forEach((inst, index) => {
    const labels = (inst.choices || []).map((c) => String(c.label).trim());
    if (labels.length === 4 && new Set(labels).size !== 4) result.duplicateChoices.push({ id: q.id, draw: index + 1, labels });
  });
  if (subtest === 'arithmeticReasoning') {
    const p = String(q.prompt || '').replace(/\s+/g, ' ').trim();
    if (!arContextSignals.test(p) || suspiciousStarts.test(p)) result.suspiciousArithmeticPrompts.push({ id: q.id, prompt: p });
  }

  const plan = await mathPath.buildTemplateIssuePlan(q, { samples: 8 });
  if (!plansByCode.has(code)) plansByCode.set(code, {});
  plansByCode.get(code)[q.id] = plan;
  if (!itemsByCode.has(code)) itemsByCode.set(code, []);
  itemsByCode.get(code).push(q);
}

for (const [code, items] of itemsByCode) {
  const analysis = analyzeStandardContent({ displayCode: code, items, plans: plansByCode.get(code) });
  if (analysis.state !== CONTENT_STATE.PRODUCTION_READY) result.badStandards.push({ code, state: analysis.state, warnings: analysis.warnings, blockers: analysis.blockers });
}

for (const key of ['badFormat','thin','duplicateChoices','generationFailures','controlChars','acceptedArrays','badCalculator','badFramework','qualityFailures','badStandards','suspiciousArithmeticPrompts']) {
  console.log(`${key}: ${result[key].length}`);
  if (result[key].length && ['thin','duplicateChoices','generationFailures','qualityFailures','badStandards','suspiciousArithmeticPrompts'].includes(key)) console.log(JSON.stringify(result[key].slice(0,80), null, 2));
}
console.log(`total=${result.total} standards=${result.standards} mcq=${result.mcq} AR=${result.ar} MK=${result.mk}`);

const hard = result.badFormat.length + result.duplicateChoices.length + result.generationFailures.length + result.controlChars.length + result.acceptedArrays.length + result.badCalculator.length + result.badFramework.length + result.qualityFailures.length + result.badStandards.length;
process.exit(hard ? 1 : 0);
