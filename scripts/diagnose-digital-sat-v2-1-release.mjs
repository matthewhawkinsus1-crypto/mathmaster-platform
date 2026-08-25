#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(path.join(here, '..'));
const sourceRoot = path.join(root, 'drafts', 'ccmr-v2.1', 'digitalSAT');
const walk = (dir) => !existsSync(dir) ? [] : readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(full) : [full];
});
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const roleOf = (doc) => doc?.ccmrFamilyRole || (Number(doc?.ccmrChallengeTier || 1) >= 2 ? 'challenge' : 'direct');
const formatOf = (doc) => String(doc?.assessmentItemFormat || '').toLowerCase();
const promptOf = (doc) => String(doc?.prompt || '').trim();
const hasTemplate = (text) => /\{\{[^}]+\}\}/.test(String(text || ''));
const generatorSignature = (doc) => doc?.generator && typeof doc.generator === 'object' ? JSON.stringify(doc.generator) : null;
const staticNumericExpected = (doc) => {
  const field = Array.isArray(doc?.responseFields) ? doc.responseFields[0] : null;
  const value = field?.expected;
  if (value == null || hasTemplate(value)) return false;
  return /^-?(?:\d+(?:\.\d+)?|\d+\/\d+)$/.test(String(value).trim());
};

function oldGrammar(text) {
  return String(text || '').toLowerCase()
    .replace(/\{\{[^}]+\}\}/g, '<value>')
    .replace(/\$[^$]+\$/g, '<math>')
    .replace(/-?\d+(?:\.\d+)?/g, '<number>')
    .replace(/[^a-z<>\s'-]/g, ' ')
    .replace(/\b(a|an|the)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
function normalizeMath(math) {
  return String(math || '').toLowerCase()
    .replace(/\{\{[^}]+\}\}/g, '<value>')
    .replace(/\\left|\\right/g, '')
    .replace(/\\cdot|\\times/g, '*')
    .replace(/\\div/g, '/')
    .replace(/\\leq?/g, '<=')
    .replace(/\\geq?/g, '>=')
    .replace(/\\neq/g, '!=')
    .replace(/\\sqrt\s*\{/g, 'sqrt{')
    .replace(/\\frac\s*\{/g, 'frac{')
    .replace(/-?\d+(?:\.\d+)?/g, '<number>')
    .replace(/\b[a-z]\b/g, '<var>')
    .replace(/\s+/g, ' ')
    .trim();
}
function structuralGrammar(text) {
  const source = String(text || '').toLowerCase().replace(/\{\{[^}]+\}\}/g, '<value>');
  let out = '';
  let last = 0;
  for (const match of source.matchAll(/\$([^$]+)\$/g)) {
    out += source.slice(last, match.index);
    out += ` <math:${normalizeMath(match[1])}> `;
    last = match.index + match[0].length;
  }
  out += source.slice(last);
  return out
    .replace(/-?\d+(?:\.\d+)?/g, '<number>')
    .replace(/[^a-z0-9<>!=+*/^{}:_\s'().,-]/g, ' ')
    .replace(/\b(a|an|the)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

const banks = [];
for (const file of walk(sourceRoot).filter((entry) => entry.endsWith('.v2.1.json')).sort()) {
  const parsed = readJson(file);
  if (parsed?.framework === 'digitalSAT' && Array.isArray(parsed?.documents)) banks.push({ file, parsed });
}

const docs = banks.flatMap(({ file, parsed }) => parsed.documents.map((doc) => ({ ...doc, __file: path.relative(root, file), __scope: parsed.standard || parsed.nativeSkillId || '' })));
const missingGenerator = docs.filter((doc) => !generatorSignature(doc));
const missingGeneratorTemplated = missingGenerator.filter((doc) => hasTemplate(promptOf(doc)) || hasTemplate(JSON.stringify(doc?.responseFields || [])) || hasTemplate(JSON.stringify(doc?.choices || [])));
const missingGeneratorStatic = missingGenerator.filter((doc) => !missingGeneratorTemplated.includes(doc));

const generatorPairs = [];
for (const bank of banks) {
  const seen = new Map();
  for (const doc of bank.parsed.documents) {
    const sig = generatorSignature(doc);
    if (!sig) continue;
    const prior = seen.get(sig);
    if (prior) generatorPairs.push({ scope: bank.parsed.standard || bank.parsed.nativeSkillId, left: prior.id, right: doc.id, sameOldGrammar: oldGrammar(prior.prompt) === oldGrammar(doc.prompt), sameStructuralGrammar: structuralGrammar(prior.prompt) === structuralGrammar(doc.prompt) });
    else seen.set(sig, doc);
  }
}

function duplicateGroups(grammarFn) {
  const map = new Map();
  for (const doc of docs) {
    const grammar = grammarFn(promptOf(doc));
    if (grammar.split(/\s+/).length < 5) continue;
    if (!map.has(grammar)) map.set(grammar, []);
    map.get(grammar).push(doc.id);
  }
  return [...map.entries()].filter(([, ids]) => ids.length > 1).map(([grammar, ids]) => ({ grammar, ids }));
}

const byDomainRoleFormat = {};
for (const doc of docs) {
  const domain = doc?.assessmentContext?.domainId || 'unknown';
  const key = `${domain}|${roleOf(doc)}|${formatOf(doc)}`;
  byDomainRoleFormat[key] = (byDomainRoleFormat[key] || 0) + 1;
}
const spr = docs.filter((doc) => formatOf(doc) === 'studentproducedresponse');
const sprStaticNumeric = spr.filter(staticNumericExpected);
const sprStaticAny = spr.filter((doc) => !hasTemplate(JSON.stringify(doc?.responseFields || [])) && !hasTemplate(promptOf(doc)));
const mcq = docs.filter((doc) => formatOf(doc) === 'multiplechoice');

const report = {
  documents: docs.length,
  mcq: mcq.length,
  spr: spr.length,
  mcqRate: Number((mcq.length / docs.length).toFixed(4)),
  target75McqNeeded: Math.max(0, Math.ceil(docs.length * 0.75) - mcq.length),
  min68McqNeeded: Math.max(0, Math.ceil(docs.length * 0.68) - mcq.length),
  missingGenerator: {
    total: missingGenerator.length,
    templated: missingGeneratorTemplated.length,
    static: missingGeneratorStatic.length,
    templatedIds: missingGeneratorTemplated.map((doc) => doc.id),
    staticIds: missingGeneratorStatic.map((doc) => doc.id),
  },
  duplicateGeneratorPairs: generatorPairs,
  exactGrammarGroups: {
    old: duplicateGroups(oldGrammar).length,
    structural: duplicateGroups(structuralGrammar).length,
    structuralExamples: duplicateGroups(structuralGrammar).slice(0, 25),
  },
  sprCandidates: {
    staticNumeric: sprStaticNumeric.length,
    staticAny: sprStaticAny.length,
    staticNumericIds: sprStaticNumeric.map((doc) => doc.id),
  },
  byDomainRoleFormat,
};
console.log(JSON.stringify(report, null, 2));
