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

function deepMerge(base, patch) {
  if (Array.isArray(patch)) return patch.map((value) => structuredClone(value));
  if (!patch || typeof patch !== 'object') return patch;
  const out = base && typeof base === 'object' && !Array.isArray(base) ? structuredClone(base) : {};
  for (const [key, value] of Object.entries(patch)) {
    out[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? deepMerge(out[key], value)
      : Array.isArray(value)
        ? value.map((entry) => structuredClone(entry))
        : value;
  }
  return out;
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
function tokenSet(text) {
  return new Set(structuralGrammar(text).split(/\s+/).filter((token) => token.length > 2));
}
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}
function docSummary(doc) {
  const field = Array.isArray(doc?.responseFields) ? doc.responseFields[0] : null;
  return {
    id: doc.id,
    familyId: doc.familyId,
    file: doc.__file,
    scope: doc.__scope,
    domain: doc?.assessmentContext?.domainId,
    role: roleOf(doc),
    taskType: doc.taskType,
    representation: doc.representation,
    format: formatOf(doc),
    prompt: promptOf(doc),
    expected: field?.expected ?? null,
  };
}

const banks = [];
const overrides = new Map();
for (const file of walk(sourceRoot).filter((entry) => entry.endsWith('.v2.1.json')).sort()) {
  const parsed = readJson(file);
  if (parsed?.framework !== 'digitalSAT') continue;
  if (parsed?.artifactType === 'antiCloneOverrides') {
    for (const [familyId, patch] of Object.entries(parsed.patches || {})) overrides.set(familyId, patch);
    continue;
  }
  if (Array.isArray(parsed?.documents)) banks.push({ file, parsed });
}

const docs = banks.flatMap(({ file, parsed }) => parsed.documents.map((sourceDoc) => {
  const patch = overrides.get(sourceDoc.familyId);
  const doc = patch ? deepMerge(sourceDoc, patch) : structuredClone(sourceDoc);
  return {
    ...doc,
    __file: path.relative(root, file),
    __scope: parsed.standard || parsed.nativeSkillId || '',
  };
}));

const exactGrammarMap = new Map();
for (const doc of docs) {
  const grammar = structuralGrammar(promptOf(doc));
  if (grammar.split(/\s+/).length < 5) continue;
  if (!exactGrammarMap.has(grammar)) exactGrammarMap.set(grammar, []);
  exactGrammarMap.get(grammar).push(doc);
}
const exactGrammarGroups = [...exactGrammarMap.entries()]
  .filter(([, group]) => group.length > 1)
  .map(([grammar, group]) => ({ grammar, documents: group.map(docSummary) }));

const highSimilarityPairs = [];
for (let i = 0; i < docs.length; i += 1) {
  const a = docs[i];
  const aTokens = tokenSet(promptOf(a));
  if (aTokens.size < 6) continue;
  for (let j = i + 1; j < docs.length; j += 1) {
    const b = docs[j];
    if (a.taskType !== b.taskType && a.representation !== b.representation) continue;
    const score = jaccard(aTokens, tokenSet(promptOf(b)));
    if (score >= 0.92) highSimilarityPairs.push({ score: Number(score.toFixed(3)), left: docSummary(a), right: docSummary(b) });
  }
}

const mcq = docs.filter((doc) => formatOf(doc) === 'multiplechoice');
const spr = docs.filter((doc) => formatOf(doc) === 'studentproducedresponse');
const simpleTemplateVar = /^\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}$/;
const sprCandidateDetails = spr.map((doc) => {
  const field = Array.isArray(doc?.responseFields) ? doc.responseFields[0] : null;
  const expected = String(field?.expected ?? '');
  const match = expected.match(simpleTemplateVar);
  const answerVar = match?.[1] || null;
  const parameterDefinition = answerVar ? doc?.generator?.parameters?.[answerVar] ?? null : null;
  const derivedDefinition = answerVar ? doc?.generator?.derived?.[answerVar] ?? null : null;
  return {
    ...docSummary(doc),
    answerVar,
    answerSource: parameterDefinition ? 'parameter' : derivedDefinition != null ? 'derived' : answerVar ? 'unresolved-template' : hasTemplate(expected) ? 'templated-expression' : 'static',
    answerDefinition: parameterDefinition || derivedDefinition || null,
    parameterKeys: Object.keys(doc?.generator?.parameters || {}),
    derivedKeys: Object.keys(doc?.generator?.derived || {}),
    constraintCount: Array.isArray(doc?.generator?.constraints) ? doc.generator.constraints.length : 0,
    hasChoicesAlready: Array.isArray(doc?.choices) && doc.choices.length > 0,
  };
});

const sprGroupMap = new Map();
for (const candidate of sprCandidateDetails) {
  const key = [candidate.domain, candidate.role, candidate.taskType || '', candidate.representation || '', candidate.answerSource].join('|');
  if (!sprGroupMap.has(key)) sprGroupMap.set(key, { count: 0, samples: [] });
  const group = sprGroupMap.get(key);
  group.count += 1;
  if (group.samples.length < 2) group.samples.push(candidate);
}
const sprGroups = [...sprGroupMap.entries()]
  .map(([group, value]) => ({ group, ...value }))
  .sort((a, b) => b.count - a.count || a.group.localeCompare(b.group));

const byDomainRoleFormat = {};
for (const doc of docs) {
  const domain = doc?.assessmentContext?.domainId || 'unknown';
  const key = `${domain}|${roleOf(doc)}|${formatOf(doc)}`;
  byDomainRoleFormat[key] = (byDomainRoleFormat[key] || 0) + 1;
}
const byAnswerSource = sprCandidateDetails.reduce((acc, candidate) => {
  acc[candidate.answerSource] = (acc[candidate.answerSource] || 0) + 1;
  return acc;
}, {});

const report = {
  documents: docs.length,
  mcq: mcq.length,
  spr: spr.length,
  mcqRate: Number((mcq.length / docs.length).toFixed(4)),
  target75McqNeeded: Math.max(0, Math.ceil(docs.length * 0.75) - mcq.length),
  min68McqNeeded: Math.max(0, Math.ceil(docs.length * 0.68) - mcq.length),
  byDomainRoleFormat,
  exactGrammarGroups,
  highSimilarityPairs,
  sprInventory: {
    byAnswerSource,
    withExistingChoices: sprCandidateDetails.filter((candidate) => candidate.hasChoicesAlready).length,
    groups: sprGroups,
    simpleTemplateCandidates: sprCandidateDetails.filter((candidate) => candidate.answerVar),
  },
};
console.log(JSON.stringify(report, null, 2));
