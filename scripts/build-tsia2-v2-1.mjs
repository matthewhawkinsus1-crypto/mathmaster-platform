#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AUTHORABLE_STATUSES,
  AUTHORING_STATUSES,
  BANNED_PROMPT_PATTERNS,
  OFFICIAL_SCOPE,
  RELEASE_TARGET,
  REQUIRED_DOMAINS,
  VALID_CALCULATOR_MODES,
  VALID_TEST_SCOPES,
  officialSkillCount,
} from './tsia2-v2-1-contract.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(process.env.MATHMASTER_ROOT || path.join(here, '..'));
const sourceRoot = path.join(root, 'drafts', 'ccmr-v2.1', 'tsia2');
const satRoot = path.join(root, 'drafts', 'ccmr-v2.1', 'digitalSAT');
const actRoot = path.join(root, 'drafts', 'ccmr-v2.1', 'act');
const AUTHORABLE = new Set(AUTHORABLE_STATUSES);
const IN_PROGRESS = new Set(AUTHORING_STATUSES);
const VALID_SCOPES = new Set(VALID_TEST_SCOPES);
const VALID_CALCULATORS = new Set(VALID_CALCULATOR_MODES);

const argValue = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
};
const hasFlag = (name) => process.argv.includes(name);
const requestedDomain = argValue('--domain');
const releaseMode = hasFlag('--release');
const checkOnly = hasFlag('--check');
if (requestedDomain && releaseMode) throw new Error('Use --domain <domainId> or --release, not both.');
if (!requestedDomain && !releaseMode) throw new Error('Choose --domain <domainId> or --release.');

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const walk = (dir) => !existsSync(dir) ? [] : readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(full) : [full];
});
const promptOf = (doc) => String(doc?.prompt || '').trim();
const roleOf = (doc) => doc?.ccmrFamilyRole || (Number(doc?.ccmrChallengeTier || 1) >= 2 ? 'challenge' : 'direct');
const formatOf = (doc) => String(doc?.assessmentItemFormat || '').toLowerCase();
const generatorSignature = (doc) => JSON.stringify(doc?.generator || null);
const calculatorModeOf = (doc) => String(doc?.examCalculatorMode || '').trim();
const nativeSkillIdOf = (doc) => String(doc?.assessmentContext?.nativeSkillId || doc?.ccmrAuthenticLanguage?.nativeSkillId || '').trim();
const testScopeOf = (doc) => String(doc?.assessmentContext?.tsia2TestScope || '').trim();
const hasTexasAlignment = (doc) => (doc?.alignmentKeys || []).some((key) => /^texas:/i.test(String(key)));

function normalizeSkeleton(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\{\{[^}]+\}\}/g, '<value>')
    .replace(/-?\d+(?:\.\d+)?/g, '<number>')
    .replace(/\s+/g, ' ')
    .trim();
}

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
  let overlap = 0;
  for (const token of a) if (b.has(token)) overlap += 1;
  return overlap / (a.size + b.size - overlap);
}

function placeholderNames(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  const names = [];
  const pattern = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;
  let match;
  while ((match = pattern.exec(text))) names.push(match[1]);
  return names;
}

function declaredGeneratorNames(doc) {
  return new Set([
    ...Object.keys(doc?.generator?.parameters || {}),
    ...Object.keys(doc?.generator?.derived || {}),
  ]);
}

function loadFrameworkDocs(dir, framework) {
  const docs = [];
  for (const file of walk(dir).filter((entry) => entry.endsWith('.v2.1.json')).sort()) {
    let parsed;
    try { parsed = readJson(file); } catch { continue; }
    if (parsed?.framework !== framework || !Array.isArray(parsed?.documents)) continue;
    for (const doc of parsed.documents) if (promptOf(doc)) docs.push(doc);
  }
  return docs;
}

const failures = [];
const warnings = [];
const ledgers = new Map();
const completions = new Map();
const banks = [];

if (!existsSync(sourceRoot)) {
  failures.push(`Missing TSIA2 V2.1 authoring root: ${path.relative(root, sourceRoot)}`);
} else {
  for (const file of walk(sourceRoot).filter((entry) => entry.endsWith('.v2.1.json')).sort()) {
    let parsed;
    try { parsed = readJson(file); }
    catch (error) {
      failures.push(`${path.relative(root, file)}: invalid JSON: ${error.message}`);
      continue;
    }
    if (parsed?.framework !== 'tsia2') continue;
    if (parsed?.releaseTarget !== RELEASE_TARGET) failures.push(`${path.relative(root, file)}: wrong releaseTarget`);

    if (parsed?.artifactType === 'completionManifest') {
      const domainId = String(parsed.domainId || '').trim();
      if (!domainId) failures.push(`${path.relative(root, file)}: completion manifest missing domainId`);
      else if (completions.has(domainId)) failures.push(`${domainId}: more than one completion manifest found`);
      else {
        const raw = Array.isArray(parsed.completedNativeSkills) ? parsed.completedNativeSkills.map(String) : [];
        if (new Set(raw).size !== raw.length) failures.push(`${domainId}: completion manifest repeats a native skill id`);
        completions.set(domainId, { parsed, completedNativeSkills: new Set(raw) });
      }
      continue;
    }

    if ((parsed?.artifactType === 'mappingLedger' || parsed?.nativeSkills) && !Array.isArray(parsed?.documents)) {
      const domainId = String(parsed.domainId || '').trim();
      if (!domainId) failures.push(`${path.relative(root, file)}: mapping ledger missing domainId`);
      else if (ledgers.has(domainId)) failures.push(`${domainId}: more than one mapping ledger found`);
      else ledgers.set(domainId, parsed);
      continue;
    }

    if (Array.isArray(parsed?.documents)) banks.push({ file, parsed });
  }
}

const targetDomains = releaseMode ? REQUIRED_DOMAINS : [requestedDomain];
for (const domainId of targetDomains) {
  if (!REQUIRED_DOMAINS.includes(domainId)) failures.push(`Unknown TSIA2 domain: ${domainId}`);
  if (!ledgers.has(domainId)) failures.push(`${domainId}: missing TSIA2 V2.1 mapping ledger`);
  if (!completions.has(domainId)) failures.push(`${domainId}: missing TSIA2 V2.1 completion manifest`);
}

for (const domainId of targetDomains) {
  const official = OFFICIAL_SCOPE[domainId];
  const ledger = ledgers.get(domainId);
  const completion = completions.get(domainId);
  if (!official || !ledger) continue;
  const ledgerSkills = ledger.nativeSkills || {};

  for (const [nativeSkillId, expectedScope] of Object.entries(official)) {
    const entry = ledgerSkills[nativeSkillId];
    if (!entry) {
      failures.push(`${domainId}: mapping ledger missing official native skill ${nativeSkillId}`);
      continue;
    }
    if (!AUTHORABLE.has(entry.status)) failures.push(`${domainId} native ${nativeSkillId}: unsupported authoring status ${entry.status}`);
    if (entry.tsia2TestScope !== expectedScope) failures.push(`${domainId} native ${nativeSkillId}: ledger tsia2TestScope mismatch; expected ${expectedScope}`);
  }
  for (const nativeSkillId of Object.keys(ledgerSkills)) {
    if (!(nativeSkillId in official)) failures.push(`${domainId}: mapping ledger contains unknown TSIA2 native skill ${nativeSkillId}`);
  }
  if (completion) {
    for (const nativeSkillId of completion.completedNativeSkills) {
      if (!(nativeSkillId in official)) failures.push(`${domainId}: completion manifest contains unknown TSIA2 native skill ${nativeSkillId}`);
    }
  }
}

const selectedBanks = banks.filter(({ parsed }) => targetDomains.includes(parsed.domainId));
const bankByScope = new Map();
const ids = new Set();
const familyIds = new Set();
const documents = [];
const effective = [];

for (const { file, parsed } of selectedBanks) {
  const relative = path.relative(root, file);
  const domainId = String(parsed.domainId || '').trim();
  const nativeSkillId = String(parsed.nativeSkillId || '').trim();
  const official = OFFICIAL_SCOPE[domainId] || {};
  const expectedScope = official[nativeSkillId];
  const key = `${domainId}|${nativeSkillId}`;

  if (!nativeSkillId) failures.push(`${relative}: native bank missing nativeSkillId`);
  if (!expectedScope) failures.push(`${relative}: bank uses unknown TSIA2 native skill ${nativeSkillId || '(missing)'}`);
  if (bankByScope.has(key)) failures.push(`${key}: more than one bank found`);
  bankByScope.set(key, { file, parsed });

  const ledgerEntry = ledgers.get(domainId)?.nativeSkills?.[nativeSkillId];
  if (!ledgerEntry) failures.push(`${relative}: native skill is absent from the TSIA2 mapping ledger`);
  else if (!AUTHORABLE.has(ledgerEntry.status)) failures.push(`${relative}: scope status ${ledgerEntry.status} is not authorable`);
  if (!completions.get(domainId)?.completedNativeSkills.has(nativeSkillId)) failures.push(`${relative}: native skill is not confirmed by the completion manifest`);
  if (!VALID_SCOPES.has(parsed.tsia2TestScope)) failures.push(`${relative}: missing or invalid bank tsia2TestScope`);
  else if (expectedScope && parsed.tsia2TestScope !== expectedScope) failures.push(`${relative}: bank tsia2TestScope mismatch; expected ${expectedScope}`);

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

    if (doc?.assessmentContext?.framework !== 'tsia2' || doc?.assessmentContext?.examStyle !== true) failures.push(`${id}: invalid TSIA2 assessmentContext`);
    if (doc?.assessmentContext?.domainId !== domainId) failures.push(`${id}: TSIA2 domain does not match bank domain ${domainId}`);
    if (nativeSkillIdOf(doc) !== nativeSkillId) failures.push(`${id}: nativeSkillId mismatch`);
    if (testScopeOf(doc) !== expectedScope) failures.push(`${id}: tsia2TestScope mismatch; expected ${expectedScope || '(unknown)'}`);
    if (hasTexasAlignment(doc)) failures.push(`${id}: TSIA2-native bank must not carry a texas: alignment key`);

    if (!doc?.ccmrAuthenticLanguage?.authored || String(doc?.ccmrAuthenticLanguage?.version || '') !== '2.1') failures.push(`${id}: missing authored V2.1 language marker`);
    if (doc?.ccmrAuthenticLanguage?.nativeSkillId && doc.ccmrAuthenticLanguage.nativeSkillId !== nativeSkillId) failures.push(`${id}: V2.1 language marker nativeSkillId mismatch`);
    if (Number(doc?.ccmrAuthenticLanguage?.answerChoiceCount || 0) !== 4) failures.push(`${id}: TSIA2 item must declare answerChoiceCount=4`);
    if (!prompt) failures.push(`${id}: missing prompt`);
    if (BANNED_PROMPT_PATTERNS.some((pattern) => pattern.test(prompt))) failures.push(`${id}: prompt contains banned TSIA2 meta/classroom language`);
    if (prompt.includes('+-') || prompt.includes('-+')) failures.push(`${id}: prompt contains malformed sign rendering`);

    const role = roleOf(doc);
    if (role === 'direct' && Number(doc?.ccmrChallengeTier || 1) !== 1) failures.push(`${id}: direct family must use challenge tier 1`);
    if (role === 'challenge') {
      if (Number(doc?.ccmrChallengeTier || 0) < 2) failures.push(`${id}: challenge family must use challenge tier >=2`);
      if (doc?.ccmrAuthenticLanguage?.authoredChallenge !== true) failures.push(`${id}: challenge is not marked independently authored`);
    }

    if (formatOf(doc) !== 'multiplechoice') failures.push(`${id}: TSIA2 V2.1 permits only 4-choice multipleChoice items`);
    if (!Array.isArray(doc?.choices) || doc.choices.length !== 4) failures.push(`${id}: TSIA2 item must have exactly 4 choices`);
    const choiceIds = new Set((doc?.choices || []).map((choice) => String(choice?.id || '')).filter(Boolean));
    if (choiceIds.size !== (doc?.choices || []).length) failures.push(`${id}: duplicate or missing choice ids`);
    const choiceLabels = (doc?.choices || []).map((choice) => String(choice?.label ?? '').trim());
    if (new Set(choiceLabels).size !== choiceLabels.length || choiceLabels.some((label) => !label)) failures.push(`${id}: choices contain duplicate or missing distractor text`);
    const expected = (doc?.responseFields || []).find((field) => field?.inputProfile === 'choice')?.expected;
    if (!expected || !choiceIds.has(String(expected))) failures.push(`${id}: expected choice id is not present in choices`);

    const calculatorMode = calculatorModeOf(doc);
    if (!VALID_CALCULATORS.has(calculatorMode)) failures.push(`${id}: invalid TSIA2 calculator mode ${calculatorMode || '(missing)'}; expected none, basic, squareRoot, or graphing`);

    if (!doc?.generator || typeof doc.generator !== 'object' || Array.isArray(doc.generator)) failures.push(`${id}: missing generator`);
    const declared = declaredGeneratorNames(doc);
    for (const token of placeholderNames([prompt, doc?.formulaLatex || '', doc?.stimulus || null, doc?.choices || []])) {
      if (!declared.has(token)) failures.push(`${id}: unresolved generator placeholder ${token}`);
    }
    const generator = generatorSignature(doc);
    const priorGenerator = generatorsWithinScope.get(generator);
    if (priorGenerator) failures.push(`${nativeSkillId}: ${id} reuses the exact generator from ${priorGenerator}`);
    else generatorsWithinScope.set(generator, id);

    documents.push(doc);
    effective.push({ ...doc, __domainId: domainId, __nativeSkillId: nativeSkillId });
  }
}

for (const domainId of targetDomains) {
  const official = OFFICIAL_SCOPE[domainId];
  const ledger = ledgers.get(domainId);
  const completion = completions.get(domainId);
  if (!official || !ledger || !completion) continue;

  for (const nativeSkillId of Object.keys(official)) {
    const completed = completion.completedNativeSkills.has(nativeSkillId);
    const hasBank = bankByScope.has(`${domainId}|${nativeSkillId}`);
    const status = ledger.nativeSkills?.[nativeSkillId]?.status;
    if (completed && !hasBank) failures.push(`${domainId} native ${nativeSkillId}: completion says complete but bank is missing`);
    if (status === 'authored' && !completed) failures.push(`${domainId} native ${nativeSkillId}: ledger says authored but completion manifest does not confirm it`);
    if (status === 'authored' && !hasBank) failures.push(`${domainId} native ${nativeSkillId}: ledger says authored but bank is missing`);
    if (releaseMode && (!completed || !hasBank || IN_PROGRESS.has(status))) failures.push(`${domainId} native ${nativeSkillId}: full TSIA2 release blocked; authoring is incomplete`);
  }
}

const promptSkeletons = new Map();
const underlyingTasks = new Map();
for (const doc of effective) {
  const skeleton = normalizeSkeleton(promptOf(doc));
  const priorPrompt = promptSkeletons.get(skeleton);
  if (priorPrompt) failures.push(`Exact TSIA2 prompt clone: ${doc.id} and ${priorPrompt.id}`);
  else if (skeleton) promptSkeletons.set(skeleton, doc);

  const taskKey = JSON.stringify([doc.taskType || '', doc.representation || '', generatorSignature(doc)]);
  const priorTask = underlyingTasks.get(taskKey);
  if (priorTask) failures.push(`Exact TSIA2 underlying-task clone: ${doc.id} and ${priorTask.id}`);
  else underlyingTasks.set(taskKey, doc);
}

const highSimilarityPairs = [];
for (let i = 0; i < effective.length; i += 1) {
  const left = effective[i];
  const leftTokens = tokenSet(promptOf(left));
  if (leftTokens.size < 8) continue;
  for (let j = i + 1; j < effective.length; j += 1) {
    const right = effective[j];
    if (left.taskType !== right.taskType && left.representation !== right.representation) continue;
    const rightTokens = tokenSet(promptOf(right));
    if (rightTokens.size < 8) continue;
    const score = jaccard(leftTokens, rightTokens);
    if (score >= 0.94) highSimilarityPairs.push({ leftId: left.id, rightId: right.id, score: Number(score.toFixed(3)) });
  }
}
if (highSimilarityPairs.length) failures.push(`${highSimilarityPairs.length} high-similarity TSIA2 task-grammar pairs remain`);

const externalDocs = [
  ...loadFrameworkDocs(satRoot, 'digitalSAT').map((doc) => ({ framework: 'Digital SAT', doc })),
  ...loadFrameworkDocs(actRoot, 'act').map((doc) => ({ framework: 'ACT', doc })),
];
const externalSkeletons = new Map();
const externalLongGrammar = [];
for (const { framework, doc } of externalDocs) {
  const skeleton = normalizeSkeleton(promptOf(doc));
  if (skeleton && !externalSkeletons.has(skeleton)) externalSkeletons.set(skeleton, { framework, id: doc.id });
  const tokens = tokenSet(promptOf(doc));
  if (tokens.size >= 12) externalLongGrammar.push({ framework, id: doc.id, tokens });
}
for (const doc of effective) {
  const exact = externalSkeletons.get(normalizeSkeleton(promptOf(doc)));
  if (exact) failures.push(`Cross-framework exact prompt clone: TSIA2 ${doc.id} matches ${exact.framework} ${exact.id}`);
  const tokens = tokenSet(promptOf(doc));
  if (tokens.size < 12) continue;
  for (const external of externalLongGrammar) {
    const score = jaccard(tokens, external.tokens);
    if (score >= 0.97) failures.push(`Cross-framework high-similarity grammar: TSIA2 ${doc.id} matches ${external.framework} ${external.id} at ${score.toFixed(3)}`);
  }
}

const byDomain = {};
for (const doc of documents) {
  const domainId = doc?.assessmentContext?.domainId || 'unknown';
  byDomain[domainId] = (byDomain[domainId] || 0) + 1;
}
for (const domainId of targetDomains) {
  const completionCount = completions.get(domainId)?.completedNativeSkills.size || 0;
  if (!byDomain[domainId] && completionCount > 0) failures.push(`${domainId}: completion manifest names completed skills but no TSIA2 V2.1 content was selected`);
}

if (releaseMode) {
  const expectedSkills = officialSkillCount();
  if (bankByScope.size !== expectedSkills) failures.push(`Full TSIA2 release requires ${expectedSkills} completed native-skill banks; found ${bankByScope.size}`);
  if (documents.length !== expectedSkills * 8) failures.push(`Full TSIA2 release requires ${expectedSkills * 8} generative families; found ${documents.length}`);
  if (documents.filter((doc) => roleOf(doc) === 'direct').length !== expectedSkills * 5) failures.push(`Full TSIA2 release requires exactly ${expectedSkills * 5} direct families.`);
  if (documents.filter((doc) => roleOf(doc) === 'challenge').length !== expectedSkills * 3) failures.push(`Full TSIA2 release requires exactly ${expectedSkills * 3} challenge families.`);
}

const summary = {
  schemaVersion: 2,
  releaseTarget: RELEASE_TARGET,
  framework: 'tsia2',
  mode: releaseMode ? 'full-release' : 'domain-authoring',
  domain: releaseMode ? null : requestedDomain,
  scopeUnits: bankByScope.size,
  documents: documents.length,
  direct: documents.filter((doc) => roleOf(doc) === 'direct').length,
  challenge: documents.filter((doc) => roleOf(doc) === 'challenge').length,
  multipleChoice: documents.filter((doc) => formatOf(doc) === 'multiplechoice').length,
  calculators: Object.fromEntries(VALID_CALCULATOR_MODES.map((mode) => [mode, documents.filter((doc) => calculatorModeOf(doc) === mode).length])),
  testScopes: {
    crcAndDiagnostic: documents.filter((doc) => testScopeOf(doc) === 'crcAndDiagnostic').length,
    diagnosticOnly: documents.filter((doc) => testScopeOf(doc) === 'diagnosticOnly').length,
  },
  domains: byDomain,
  highSimilarityPairs,
  failures,
  warnings,
};

if (failures.length) {
  console.error(JSON.stringify(summary, null, 2));
  process.exitCode = 1;
} else {
  const output = releaseMode
    ? path.join(root, 'drafts', 'tsia2.v2.1.json')
    : path.join(root, 'drafts', `tsia2.v2.1.${requestedDomain}.json`);
  if (!checkOnly) {
    writeFileSync(output, `${JSON.stringify({
      schemaVersion: 2,
      releaseTarget: RELEASE_TARGET,
      framework: 'tsia2',
      buildMode: releaseMode ? 'full-release' : 'domain-authoring',
      domainId: releaseMode ? null : requestedDomain,
      documents,
    }, null, 2)}\n`);
  }
  console.log(JSON.stringify({ ...summary, output: checkOnly ? null : path.relative(root, output) }, null, 2));
}
