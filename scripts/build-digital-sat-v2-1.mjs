#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(here, '..');

const argValue = (name, fallback = null) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const hasFlag = (name) => process.argv.includes(name);

const root = path.resolve(argValue('--root', process.env.MATHMASTER_ROOT || defaultRoot));
const sourceRoot = path.join(root, 'drafts', 'ccmr-v2.1', 'digitalSAT');
const requestedDomain = argValue('--domain');
const releaseMode = hasFlag('--release');
const checkOnly = hasFlag('--check');

if (requestedDomain && releaseMode) {
  throw new Error('Use either --domain <domainId> for an authoring build or --release for a full release build, not both.');
}
if (!requestedDomain && !releaseMode) {
  throw new Error('Choose --domain <domainId> for a partial authoring build or --release for the full four-domain release build.');
}

const REQUIRED_DOMAINS = Object.freeze([
  'algebra',
  'advancedMath',
  'problemSolvingData',
  'geometryTrigonometry',
]);
const RELEASE_TARGET = 'ccmr-fidelity-v2.1-authentic-language';
const BANNED_PROMPT_PATTERNS = Object.freeze([
  /select the best digital sat answer/i,
  /best digital sat answer/i,
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
const roleOf = (doc) => doc?.ccmrFamilyRole || (Number(doc?.ccmrChallengeTier || 1) >= 2 ? 'challenge' : 'direct');
const codeOf = (doc) => String((doc?.alignmentKeys || []).find((key) => /^texas:/i.test(key)) || '').replace(/^texas:/i, '').toUpperCase();
const formatOf = (doc) => String(doc?.assessmentItemFormat || '').toLowerCase();
const generatorSignature = (doc) => JSON.stringify(doc?.generator || null);
const promptOf = (doc) => String(doc?.prompt || '').trim();

const walk = (dir) => {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
};

const failures = [];
const warnings = [];
const ledgers = new Map();
const banks = [];

if (!existsSync(sourceRoot)) {
  throw new Error(`Missing V2.1 Digital SAT authoring root: ${path.relative(root, sourceRoot)}`);
}

for (const file of walk(sourceRoot).filter((entry) => entry.endsWith('.v2.1.json')).sort()) {
  let parsed;
  try {
    parsed = readJson(file);
  } catch (error) {
    failures.push(`${path.relative(root, file)}: invalid JSON: ${error.message}`);
    continue;
  }

  if (parsed?.framework !== 'digitalSAT') continue;
  if (parsed?.releaseTarget !== RELEASE_TARGET) {
    failures.push(`${path.relative(root, file)}: wrong releaseTarget ${parsed?.releaseTarget || '(missing)'}`);
  }

  if (parsed?.standards && !Array.isArray(parsed?.documents)) {
    const domainId = parsed.domainId;
    if (!domainId) {
      failures.push(`${path.relative(root, file)}: mapping ledger has no domainId`);
      continue;
    }
    if (ledgers.has(domainId)) failures.push(`${domainId}: more than one V2.1 mapping ledger found`);
    ledgers.set(domainId, { file, parsed });
    continue;
  }

  if (Array.isArray(parsed?.documents)) banks.push({ file, parsed });
}

const targetDomains = releaseMode ? REQUIRED_DOMAINS : [requestedDomain];
for (const domainId of targetDomains) {
  if (!REQUIRED_DOMAINS.includes(domainId)) failures.push(`Unknown Digital SAT domain: ${domainId}`);
  if (!ledgers.has(domainId)) failures.push(`${domainId}: missing V2.1 mapping ledger`);
}
if (releaseMode) {
  for (const domainId of REQUIRED_DOMAINS) {
    if (!ledgers.has(domainId)) failures.push(`${domainId}: full release requires a mapping ledger`);
  }
}

const selectedBanks = banks.filter(({ parsed }) => targetDomains.includes(parsed.domainId));
const bankByDomainStandard = new Map();
const ids = new Set();
const familyIds = new Set();
const documents = [];

for (const { file, parsed } of selectedBanks) {
  const relative = path.relative(root, file);
  const domainId = parsed.domainId;
  const standard = String(parsed.standard || '').toUpperCase();
  const docs = parsed.documents || [];
  const key = `${domainId}|${standard}`;

  if (!standard) failures.push(`${relative}: missing standard`);
  if (bankByDomainStandard.has(key)) failures.push(`${domainId} ${standard}: more than one authored bank found`);
  bankByDomainStandard.set(key, { file, parsed });

  const ledgerEntry = ledgers.get(domainId)?.parsed?.standards?.[standard];
  if (!ledgerEntry) failures.push(`${relative}: ${standard} is absent from the ${domainId} mapping ledger`);
  else if (ledgerEntry.status !== 'authored') failures.push(`${relative}: ${standard} has ledger status ${ledgerEntry.status}, not authored`);

  const direct = docs.filter((doc) => roleOf(doc) === 'direct');
  const challenge = docs.filter((doc) => roleOf(doc) === 'challenge');
  if (direct.length !== 5 || challenge.length !== 3 || docs.length !== 8) {
    failures.push(`${relative}: expected exactly 5 direct + 3 challenge = 8 families; found ${direct.length} + ${challenge.length} = ${docs.length}`);
  }

  const generatorsWithinStandard = new Map();
  for (const doc of docs) {
    const id = String(doc?.id || '').trim();
    const familyId = String(doc?.familyId || '').trim();
    const prompt = promptOf(doc);
    const role = roleOf(doc);
    const docDomain = doc?.assessmentContext?.domainId || (doc?.alignments || []).find((entry) => entry?.framework === 'digitalSAT')?.domainId;

    if (!id) failures.push(`${relative}: document missing id`);
    else if (ids.has(id)) failures.push(`${relative}: duplicate id ${id}`);
    else ids.add(id);

    if (!familyId) failures.push(`${id || relative}: missing familyId`);
    else if (familyIds.has(familyId)) failures.push(`${id || relative}: duplicate familyId ${familyId}`);
    else familyIds.add(familyId);

    if (doc?.assessmentContext?.framework !== 'digitalSAT' || doc?.assessmentContext?.examStyle !== true) {
      failures.push(`${id}: assessmentContext must be Digital SAT examStyle=true`);
    }
    if (docDomain !== domainId) failures.push(`${id}: domain ${docDomain || '(missing)'} does not match bank domain ${domainId}`);
    if (codeOf(doc) !== standard) failures.push(`${id}: alignment key ${codeOf(doc) || '(missing)'} does not match bank standard ${standard}`);
    if (!doc?.ccmrAuthenticLanguage?.authored || String(doc?.ccmrAuthenticLanguage?.version || '') !== '2.1') {
      failures.push(`${id}: missing ccmrAuthenticLanguage authored V2.1 marker`);
    }
    if (!prompt) failures.push(`${id}: missing prompt`);
    if (BANNED_PROMPT_PATTERNS.some((pattern) => pattern.test(prompt))) failures.push(`${id}: prompt contains banned meta/classroom language`);

    if (role === 'direct') {
      if (Number(doc?.ccmrChallengeTier || 1) !== 1) failures.push(`${id}: direct family must use ccmrChallengeTier=1`);
    } else {
      if (Number(doc?.ccmrChallengeTier || 0) < 2) failures.push(`${id}: challenge family must use ccmrChallengeTier>=2`);
      if (doc?.ccmrAuthenticLanguage?.authoredChallenge !== true) failures.push(`${id}: challenge is not marked independently authored`);
    }

    if (!doc?.generator || typeof doc.generator !== 'object') failures.push(`${id}: missing generator`);
    const signature = generatorSignature(doc);
    if (signature !== 'null') {
      const prior = generatorsWithinStandard.get(signature);
      if (prior) failures.push(`${standard}: ${id} reuses the exact generator from ${prior}`);
      else generatorsWithinStandard.set(signature, id);
    }

    const format = formatOf(doc);
    const fields = Array.isArray(doc?.responseFields) ? doc.responseFields : [];
    if (format === 'multiplechoice') {
      if (!Array.isArray(doc?.choices) || doc.choices.length !== 4) failures.push(`${id}: Digital SAT MCQ must have exactly 4 choices`);
      const choiceIds = new Set((doc?.choices || []).map((choice) => choice?.id).filter(Boolean));
      if (choiceIds.size !== (doc?.choices || []).length) failures.push(`${id}: duplicate or missing choice ids`);
      const expected = fields.find((field) => field?.inputProfile === 'choice')?.expected;
      if (!expected || !choiceIds.has(expected)) failures.push(`${id}: MCQ expected choice id is missing from choices`);
    } else if (format === 'studentproducedresponse') {
      if (!fields.length || fields.some((field) => field?.expected == null || field?.expected === '')) failures.push(`${id}: SPR requires a gradeable expected response`);
    } else {
      failures.push(`${id}: unsupported Digital SAT assessmentItemFormat ${doc?.assessmentItemFormat || '(missing)'}`);
    }

    documents.push(doc);
  }
}

for (const domainId of targetDomains) {
  const ledger = ledgers.get(domainId)?.parsed;
  if (!ledger) continue;
  const entries = ledger.standards || {};
  const authored = Object.entries(entries).filter(([, entry]) => entry?.status === 'authored').map(([code]) => code.toUpperCase());
  for (const code of authored) {
    if (!bankByDomainStandard.has(`${domainId}|${code}`)) failures.push(`${domainId} ${code}: ledger says authored but no V2.1 bank exists`);
  }
  for (const [code, entry] of Object.entries(entries)) {
    if (entry?.status !== 'authored' && bankByDomainStandard.has(`${domainId}|${code.toUpperCase()}`)) {
      failures.push(`${domainId} ${code}: bank exists but ledger status is ${entry.status}`);
    }
  }
}

const formatCounts = documents.reduce((acc, doc) => {
  const key = formatOf(doc);
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});
const mcq = formatCounts.multiplechoice || 0;
const spr = formatCounts.studentproducedresponse || 0;
const mcqRate = (mcq + spr) ? mcq / (mcq + spr) : 0;
if (releaseMode && (mcqRate < 0.68 || mcqRate > 0.82)) {
  failures.push(`Full Digital SAT release MCQ rate ${(mcqRate * 100).toFixed(1)}% is outside the V2.1 68%-82% guardrail around the approximately 75% test-form target`);
}

const byDomain = {};
for (const doc of documents) {
  const domainId = doc?.assessmentContext?.domainId || 'unknown';
  byDomain[domainId] = (byDomain[domainId] || 0) + 1;
}
for (const domainId of targetDomains) {
  if (!byDomain[domainId]) failures.push(`${domainId}: no authored V2.1 documents selected`);
}

const summary = {
  schemaVersion: 1,
  releaseTarget: RELEASE_TARGET,
  mode: releaseMode ? 'full-release' : 'domain-authoring',
  domain: releaseMode ? null : requestedDomain,
  standards: new Set(documents.map(codeOf).filter(Boolean)).size,
  documents: documents.length,
  direct: documents.filter((doc) => roleOf(doc) === 'direct').length,
  challenge: documents.filter((doc) => roleOf(doc) === 'challenge').length,
  formats: {
    multipleChoice: mcq,
    studentProducedResponse: spr,
    mcqRate,
  },
  domains: byDomain,
  failures,
  warnings,
};

if (failures.length) {
  console.error(JSON.stringify(summary, null, 2));
  process.exitCode = 1;
} else {
  const output = releaseMode
    ? path.join(root, 'drafts', 'digitalSAT.v2.1.json')
    : path.join(root, 'drafts', `digitalSAT.v2.1.${requestedDomain}.json`);
  if (!checkOnly) {
    writeFileSync(output, `${JSON.stringify({
      schemaVersion: 1,
      releaseTarget: RELEASE_TARGET,
      framework: 'digitalSAT',
      buildMode: releaseMode ? 'full-release' : 'domain-authoring',
      domainId: releaseMode ? null : requestedDomain,
      documents,
    }, null, 2)}\n`);
  }
  console.log(JSON.stringify({ ...summary, output: checkOnly ? null : path.relative(root, output) }, null, 2));
}
