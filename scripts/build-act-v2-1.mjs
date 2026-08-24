#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(process.env.MATHMASTER_ROOT || path.join(here, '..'));
const sourceRoot = path.join(root, 'drafts', 'ccmr-v2.1', 'act');
const satRoot = path.join(root, 'drafts', 'ccmr-v2.1', 'digitalSAT');
const RELEASE_TARGET = 'ccmr-fidelity-v2.1-authentic-language';
const REQUIRED_DOMAINS = Object.freeze(['preparingHigherMath', 'essentialSkills']);
const AUTHORABLE = new Set(['author', 'author-partial', 'authored']);
const AUTHORING_STATUSES = new Set(['author', 'author-partial']);

const argValue = (name, fallback = null) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const hasFlag = (name) => process.argv.includes(name);
const requestedDomain = argValue('--domain');
const releaseMode = hasFlag('--release');
const checkOnly = hasFlag('--check');
if (requestedDomain && releaseMode) throw new Error('Use --domain <domainId> or --release, not both.');
if (!requestedDomain && !releaseMode) throw new Error('Choose --domain <domainId> or --release.');

const BANNED_PROMPT_PATTERNS = Object.freeze([
  /select the best answer/i,
  /select the act answer/i,
  /best act answer/i,
  /^challenge:/i,
  /a student selected/i,
  /a test taker .* chose/i,
  /recheck the mathematics/i,
  /verify .* before (selecting|submitting)/i,
  /show your work/i,
  /explain your reasoning/i,
  /use the workspace/i,
  /use the .* tool/i,
  /practice question/i,
  /difficulty band/i,
  /\bdok\s*[1-4]\b/i,
]);

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const walk = (dir) => !existsSync(dir) ? [] : readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(full) : [full];
});
const roleOf = (doc) => doc?.ccmrFamilyRole || (Number(doc?.ccmrChallengeTier || 1) >= 2 ? 'challenge' : 'direct');
const formatOf = (doc) => String(doc?.assessmentItemFormat || '').toLowerCase();
const promptOf = (doc) => String(doc?.prompt || '').trim();
const generatorSignature = (doc) => JSON.stringify(doc?.generator || null);
const codeOf = (doc) => String((doc?.alignmentKeys || []).find((key) => /^texas:/i.test(key)) || '').replace(/^texas:/i, '').toUpperCase();
const nativeSkillIdOf = (doc) => String(doc?.assessmentContext?.nativeSkillId || doc?.ccmrAuthenticLanguage?.nativeSkillId || '').trim();

function normalizeGrammar(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\{\{[^}]+\}\}/g, '<value>')
    .replace(/\$[^$]+\$/g, '<math>')
    .replace(/-?\d+(?:\.\d+)?/g, '<number>')
    .replace(/[^a-z<>\s'-]/g, ' ')
    .replace(/\b(a|an|the)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function tokenSet(text) {
  return new Set(normalizeGrammar(text).split(/\s+/).filter((token) => token.length > 2));
}
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

const failures = [];
const warnings = [];
const ledgers = new Map();
const completions = new Map();
const banks = [];

if (!existsSync(sourceRoot)) throw new Error(`Missing ACT V2.1 authoring root: ${path.relative(root, sourceRoot)}`);

for (const file of walk(sourceRoot).filter((entry) => entry.endsWith('.v2.1.json')).sort()) {
  let parsed;
  try { parsed = readJson(file); }
  catch (error) {
    failures.push(`${path.relative(root, file)}: invalid JSON: ${error.message}`);
    continue;
  }
  if (parsed?.framework !== 'act') continue;
  if (parsed?.releaseTarget !== RELEASE_TARGET) failures.push(`${path.relative(root, file)}: wrong releaseTarget`);

  if (parsed?.artifactType === 'completionManifest') {
    const domainId = parsed.domainId;
    if (!domainId) failures.push(`${path.relative(root, file)}: completion manifest missing domainId`);
    else if (completions.has(domainId)) failures.push(`${domainId}: more than one completion manifest found`);
    else completions.set(domainId, {
      file,
      parsed,
      completedNativeSkills: new Set((parsed.completedNativeSkills || []).map(String)),
      completedStandards: new Set((parsed.completedStandards || []).map((value) => String(value).toUpperCase())),
    });
    continue;
  }

  if ((parsed?.nativeSkills || parsed?.standards) && !Array.isArray(parsed?.documents)) {
    const domainId = parsed.domainId;
    if (!domainId) failures.push(`${path.relative(root, file)}: mapping ledger missing domainId`);
    else if (ledgers.has(domainId)) failures.push(`${domainId}: more than one mapping ledger found`);
    else ledgers.set(domainId, { file, parsed });
    continue;
  }

  if (Array.isArray(parsed?.documents)) banks.push({ file, parsed });
}

const targetDomains = releaseMode ? REQUIRED_DOMAINS : [requestedDomain];
for (const domainId of targetDomains) {
  if (!REQUIRED_DOMAINS.includes(domainId)) failures.push(`Unknown ACT domain: ${domainId}`);
  if (!ledgers.has(domainId)) failures.push(`${domainId}: missing ACT V2.1 mapping ledger`);
  if (!completions.has(domainId)) failures.push(`${domainId}: missing ACT V2.1 completion manifest`);
}

const ledgerEntryFor = (domainId, parsed) => {
  const ledger = ledgers.get(domainId)?.parsed;
  if (!ledger) return null;
  const nativeSkillId = String(parsed?.nativeSkillId || '').trim();
  const standard = String(parsed?.standard || '').trim().toUpperCase();
  if (nativeSkillId) return ledger?.nativeSkills?.[nativeSkillId] || null;
  if (standard) return ledger?.standards?.[standard] || null;
  return null;
};
const completionHas = (domainId, parsed) => {
  const completion = completions.get(domainId);
  if (!completion) return false;
  const nativeSkillId = String(parsed?.nativeSkillId || '').trim();
  const standard = String(parsed?.standard || '').trim().toUpperCase();
  if (nativeSkillId) return completion.completedNativeSkills.has(nativeSkillId);
  if (standard) return completion.completedStandards.has(standard);
  return false;
};
const scopeKeyOf = (domainId, parsed) => {
  const nativeSkillId = String(parsed?.nativeSkillId || '').trim();
  const standard = String(parsed?.standard || '').trim().toUpperCase();
  if (nativeSkillId && standard) return `${domainId}|invalid|${standard}|${nativeSkillId}`;
  if (nativeSkillId) return `${domainId}|native|${nativeSkillId}`;
  if (standard) return `${domainId}|teks|${standard}`;
  return `${domainId}|missing|`;
};

const selectedBanks = banks.filter(({ parsed }) => targetDomains.includes(parsed.domainId));
const bankByScope = new Map();
const ids = new Set();
const familyIds = new Set();
const documents = [];
const effective = [];

for (const { file, parsed } of selectedBanks) {
  const relative = path.relative(root, file);
  const domainId = parsed.domainId;
  const nativeSkillId = String(parsed?.nativeSkillId || '').trim();
  const standard = String(parsed?.standard || '').trim().toUpperCase();
  if (!nativeSkillId && !standard) failures.push(`${relative}: bank must define nativeSkillId or standard`);
  if (nativeSkillId && standard) failures.push(`${relative}: bank cannot define both nativeSkillId and standard`);
  const key = scopeKeyOf(domainId, parsed);
  if (bankByScope.has(key)) failures.push(`${key}: more than one bank found`);
  bankByScope.set(key, { file, parsed });

  const ledgerEntry = ledgerEntryFor(domainId, parsed);
  if (!ledgerEntry) failures.push(`${relative}: scope is absent from the ACT ledger`);
  else if (!AUTHORABLE.has(ledgerEntry.status)) failures.push(`${relative}: scope status ${ledgerEntry.status} is not authorable`);
  if (!completionHas(domainId, parsed)) failures.push(`${relative}: scope is not confirmed by the completion manifest`);

  const docs = parsed.documents || [];
  const direct = docs.filter((doc) => roleOf(doc) === 'direct');
  const challenge = docs.filter((doc) => roleOf(doc) === 'challenge');
  if (docs.length !== 8 || direct.length !== 5 || challenge.length !== 3) failures.push(`${relative}: expected exactly 5 direct + 3 challenge = 8; found ${direct.length} + ${challenge.length} = ${docs.length}`);

  const generatorsWithinScope = new Map();
  for (const doc of docs) {
    const id = String(doc?.id || '').trim();
    const familyId = String(doc?.familyId || '').trim();
    const prompt = promptOf(doc);
    if (!id) failures.push(`${relative}: document missing id`);
    else if (ids.has(id)) failures.push(`${relative}: duplicate id ${id}`);
    else ids.add(id);
    if (!familyId) failures.push(`${id || relative}: missing familyId`);
    else if (familyIds.has(familyId)) failures.push(`${id || relative}: duplicate familyId ${familyId}`);
    else familyIds.add(familyId);

    if (doc?.assessmentContext?.framework !== 'act' || doc?.assessmentContext?.examStyle !== true) failures.push(`${id}: invalid ACT assessmentContext`);
    if (doc?.assessmentContext?.domainId !== domainId) failures.push(`${id}: ACT domain does not match bank domain ${domainId}`);
    if (nativeSkillId) {
      if (codeOf(doc)) failures.push(`${id}: ACT-native bank must not carry a texas: alignment key`);
      if (nativeSkillIdOf(doc) !== nativeSkillId) failures.push(`${id}: nativeSkillId mismatch`);
    }
    if (standard && codeOf(doc) !== standard) failures.push(`${id}: TEKS alignment does not match bank standard ${standard}`);

    if (!doc?.ccmrAuthenticLanguage?.authored || String(doc?.ccmrAuthenticLanguage?.version || '') !== '2.1') failures.push(`${id}: missing authored V2.1 language marker`);
    if (Number(doc?.ccmrAuthenticLanguage?.answerChoiceCount || 0) !== 4) failures.push(`${id}: enhanced ACT item must declare answerChoiceCount=4`);
    if (!prompt) failures.push(`${id}: missing prompt`);
    if (BANNED_PROMPT_PATTERNS.some((pattern) => pattern.test(prompt))) failures.push(`${id}: prompt contains banned ACT meta/classroom language`);
    if (prompt.includes('+-') || prompt.includes('-+')) failures.push(`${id}: prompt contains malformed sign rendering`);

    const role = roleOf(doc);
    if (role === 'direct' && Number(doc?.ccmrChallengeTier || 1) !== 1) failures.push(`${id}: direct family must use challenge tier 1`);
    if (role === 'challenge') {
      if (Number(doc?.ccmrChallengeTier || 0) < 2) failures.push(`${id}: challenge family must use challenge tier >=2`);
      if (doc?.ccmrAuthenticLanguage?.authoredChallenge !== true) failures.push(`${id}: challenge is not marked independently authored`);
    }

    if (formatOf(doc) !== 'multiplechoice') failures.push(`${id}: enhanced ACT V2.1 permits only 4-choice multipleChoice items`);
    if (!Array.isArray(doc?.choices) || doc.choices.length !== 4) failures.push(`${id}: enhanced ACT item must have exactly 4 choices`);
    const choiceIds = new Set((doc?.choices || []).map((choice) => choice?.id).filter(Boolean));
    if (choiceIds.size !== (doc?.choices || []).length) failures.push(`${id}: duplicate or missing choice ids`);
    const expected = (doc?.responseFields || []).find((field) => field?.inputProfile === 'choice')?.expected;
    if (!expected || !choiceIds.has(expected)) failures.push(`${id}: expected choice id is not present in choices`);

    if (!doc?.generator || typeof doc.generator !== 'object') failures.push(`${id}: missing generator`);
    const generator = generatorSignature(doc);
    const priorGenerator = generatorsWithinScope.get(generator);
    if (priorGenerator) failures.push(`${nativeSkillId || standard}: ${id} reuses the exact generator from ${priorGenerator}`);
    else generatorsWithinScope.set(generator, id);

    documents.push(doc);
    effective.push({ ...doc, __domainId: domainId, __scopeKey: key });
  }
}

for (const domainId of targetDomains) {
  const ledger = ledgers.get(domainId)?.parsed;
  const completion = completions.get(domainId);
  if (!ledger || !completion) continue;

  for (const nativeSkillId of completion.completedNativeSkills) {
    const entry = ledger?.nativeSkills?.[nativeSkillId];
    if (!entry) failures.push(`${domainId} native ${nativeSkillId}: completion entry absent from ledger`);
    else if (!AUTHORABLE.has(entry.status)) failures.push(`${domainId} native ${nativeSkillId}: completion conflicts with status ${entry.status}`);
    if (!bankByScope.has(`${domainId}|native|${nativeSkillId}`)) failures.push(`${domainId} native ${nativeSkillId}: completion says complete but bank is missing`);
  }
  for (const [nativeSkillId, entry] of Object.entries(ledger.nativeSkills || {})) {
    if (entry?.status === 'authored') {
      if (!completion.completedNativeSkills.has(nativeSkillId)) failures.push(`${domainId} native ${nativeSkillId}: ledger says authored but completion manifest does not confirm it`);
      if (!bankByScope.has(`${domainId}|native|${nativeSkillId}`)) failures.push(`${domainId} native ${nativeSkillId}: ledger says authored but bank is missing`);
    }
    if (releaseMode && AUTHORING_STATUSES.has(entry?.status) && !completion.completedNativeSkills.has(nativeSkillId)) failures.push(`${domainId} native ${nativeSkillId}: full ACT release blocked; authoring is incomplete`);
  }
}

const promptGrammar = new Map();
const underlyingTasks = new Map();
for (const doc of effective) {
  const grammar = normalizeGrammar(promptOf(doc));
  if (grammar.split(/\s+/).length >= 5) {
    const prior = promptGrammar.get(grammar);
    if (prior) failures.push(`Exact ACT task-grammar clone: ${doc.id} and ${prior.id}`);
    else promptGrammar.set(grammar, doc);
  }
  const signature = JSON.stringify([doc.taskType || '', doc.representation || '', generatorSignature(doc)]);
  const priorTask = underlyingTasks.get(signature);
  if (priorTask) failures.push(`Exact ACT underlying-task clone: ${doc.id} and ${priorTask.id}`);
  else underlyingTasks.set(signature, doc);
}

const highSimilarity = [];
for (let i = 0; i < effective.length; i += 1) {
  const a = effective[i];
  const aTokens = tokenSet(promptOf(a));
  if (aTokens.size < 6) continue;
  for (let j = i + 1; j < effective.length; j += 1) {
    const b = effective[j];
    if (a.taskType !== b.taskType && a.representation !== b.representation) continue;
    const score = jaccard(aTokens, tokenSet(promptOf(b)));
    if (score >= 0.92) highSimilarity.push({ leftId: a.id, rightId: b.id, score: Number(score.toFixed(3)) });
  }
}
if (highSimilarity.length) failures.push(`${highSimilarity.length} high-similarity ACT task-grammar pairs remain`);

// Cross-framework guard: an ACT family must not be an exact normalized prompt copy of Digital SAT V2.1.
const satGrammar = new Map();
for (const file of walk(satRoot).filter((entry) => entry.endsWith('.v2.1.json')).sort()) {
  let parsed;
  try { parsed = readJson(file); } catch { continue; }
  if (parsed?.framework !== 'digitalSAT' || !Array.isArray(parsed?.documents)) continue;
  for (const doc of parsed.documents) {
    const grammar = normalizeGrammar(promptOf(doc));
    if (grammar) satGrammar.set(grammar, doc.id || path.basename(file));
  }
}
for (const doc of effective) {
  const grammar = normalizeGrammar(promptOf(doc));
  const satId = satGrammar.get(grammar);
  if (satId) failures.push(`Cross-framework prompt clone: ACT ${doc.id} matches Digital SAT ${satId}`);
}

const byDomain = {};
for (const doc of documents) byDomain[doc?.assessmentContext?.domainId || 'unknown'] = (byDomain[doc?.assessmentContext?.domainId || 'unknown'] || 0) + 1;
for (const domainId of targetDomains) if (!byDomain[domainId]) failures.push(`${domainId}: no completed ACT V2.1 content selected`);

const modelingCount = documents.filter((doc) => doc?.assessmentContext?.modeling === true).length;
const summary = {
  schemaVersion: 1,
  releaseTarget: RELEASE_TARGET,
  framework: 'act',
  mode: releaseMode ? 'full-release' : 'domain-authoring',
  domain: releaseMode ? null : requestedDomain,
  scopeUnits: bankByScope.size,
  documents: documents.length,
  direct: documents.filter((doc) => roleOf(doc) === 'direct').length,
  challenge: documents.filter((doc) => roleOf(doc) === 'challenge').length,
  multipleChoice: documents.filter((doc) => formatOf(doc) === 'multiplechoice').length,
  studentProducedResponse: documents.filter((doc) => formatOf(doc) === 'studentproducedresponse').length,
  modelingTagged: modelingCount,
  domains: byDomain,
  highSimilarityPairs: highSimilarity,
  failures,
  warnings,
};

if (failures.length) {
  console.error(JSON.stringify(summary, null, 2));
  process.exitCode = 1;
} else {
  const output = releaseMode
    ? path.join(root, 'drafts', 'act.v2.1.json')
    : path.join(root, 'drafts', `act.v2.1.${requestedDomain}.json`);
  if (!checkOnly) writeFileSync(output, `${JSON.stringify({ schemaVersion: 1, releaseTarget: RELEASE_TARGET, framework: 'act', buildMode: releaseMode ? 'full-release' : 'domain-authoring', domainId: releaseMode ? null : requestedDomain, documents }, null, 2)}\n`);
  console.log(JSON.stringify({ ...summary, output: checkOnly ? null : path.relative(root, output) }, null, 2));
}
