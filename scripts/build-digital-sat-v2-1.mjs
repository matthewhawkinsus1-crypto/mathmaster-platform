#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(here, '..');
const argValue = (name, fallback = null) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const hasFlag = (name) => process.argv.includes(name);
const root = path.resolve(argValue('--root', process.env.MATHMASTER_ROOT || defaultRoot));
const sourceRoot = path.join(root, 'drafts', 'ccmr-v2.1', 'digitalSAT');
const requestedDomain = argValue('--domain');
const releaseMode = hasFlag('--release');
const checkOnly = hasFlag('--check');

if (requestedDomain && releaseMode) throw new Error('Use --domain <domainId> or --release, not both.');
if (!requestedDomain && !releaseMode) throw new Error('Choose --domain <domainId> or --release.');

const RELEASE_TARGET = 'ccmr-fidelity-v2.1-authentic-language';
const REQUIRED_DOMAINS = Object.freeze(['algebra', 'advancedMath', 'problemSolvingData', 'geometryTrigonometry']);
const AUTHORING_STATUSES = new Set(['author', 'author-partial']);
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
const promptOf = (doc) => String(doc?.prompt || '').trim();
const generatorSignature = (doc) => JSON.stringify(doc?.generator || null);
const walk = (dir) => !existsSync(dir) ? [] : readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(full) : [full];
});

const failures = [];
const warnings = [];
const ledgers = new Map();
const completions = new Map();
const banks = [];

if (!existsSync(sourceRoot)) throw new Error(`Missing V2.1 Digital SAT authoring root: ${path.relative(root, sourceRoot)}`);

for (const file of walk(sourceRoot).filter((entry) => entry.endsWith('.v2.1.json')).sort()) {
  let parsed;
  try { parsed = readJson(file); }
  catch (error) {
    failures.push(`${path.relative(root, file)}: invalid JSON: ${error.message}`);
    continue;
  }
  if (parsed?.framework !== 'digitalSAT') continue;
  if (parsed?.releaseTarget !== RELEASE_TARGET) failures.push(`${path.relative(root, file)}: wrong releaseTarget`);

  if (parsed?.artifactType === 'completionManifest') {
    const domainId = parsed.domainId;
    if (!domainId) failures.push(`${path.relative(root, file)}: completion manifest missing domainId`);
    else if (completions.has(domainId)) failures.push(`${domainId}: more than one completion manifest found`);
    else completions.set(domainId, {
      file,
      parsed,
      completed: new Set((parsed.completedStandards || []).map((code) => String(code).toUpperCase())),
    });
    continue;
  }

  if (parsed?.standards && !Array.isArray(parsed?.documents)) {
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
  if (!REQUIRED_DOMAINS.includes(domainId)) failures.push(`Unknown Digital SAT domain: ${domainId}`);
  if (!ledgers.has(domainId)) failures.push(`${domainId}: missing V2.1 mapping ledger`);
}

const approvedForPublishing = (domainId, standard) => {
  const entry = ledgers.get(domainId)?.parsed?.standards?.[standard];
  if (!entry) return { ok: false, reason: 'absent from scope ledger' };
  if (entry.status === 'authored') return { ok: true, entry, source: 'ledger-authored' };
  if (AUTHORING_STATUSES.has(entry.status) && completions.get(domainId)?.completed.has(standard)) {
    return { ok: true, entry, source: 'completion-manifest' };
  }
  return { ok: false, entry, reason: `scope status ${entry.status} is not completed` };
};

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

  const approval = approvedForPublishing(domainId, standard);
  if (!approval.ok) failures.push(`${relative}: ${standard} is not publishable: ${approval.reason}`);

  const direct = docs.filter((doc) => roleOf(doc) === 'direct');
  const challenge = docs.filter((doc) => roleOf(doc) === 'challenge');
  if (direct.length !== 5 || challenge.length !== 3 || docs.length !== 8) {
    failures.push(`${relative}: expected exactly 5 direct + 3 challenge = 8; found ${direct.length} + ${challenge.length} = ${docs.length}`);
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

    if (doc?.assessmentContext?.framework !== 'digitalSAT' || doc?.assessmentContext?.examStyle !== true) failures.push(`${id}: invalid Digital SAT assessmentContext`);
    if (docDomain !== domainId) failures.push(`${id}: domain ${docDomain || '(missing)'} does not match ${domainId}`);
    if (codeOf(doc) !== standard) failures.push(`${id}: alignment ${codeOf(doc) || '(missing)'} does not match ${standard}`);
    if (!doc?.ccmrAuthenticLanguage?.authored || String(doc?.ccmrAuthenticLanguage?.version || '') !== '2.1') failures.push(`${id}: missing authored V2.1 language marker`);
    if (!prompt) failures.push(`${id}: missing prompt`);
    if (BANNED_PROMPT_PATTERNS.some((pattern) => pattern.test(prompt))) failures.push(`${id}: prompt contains banned meta/classroom language`);
    if (prompt.includes('+-') || prompt.includes('-+')) failures.push(`${id}: prompt contains malformed sign rendering`);

    if (role === 'direct') {
      if (Number(doc?.ccmrChallengeTier || 1) !== 1) failures.push(`${id}: direct family must use challenge tier 1`);
    } else {
      if (Number(doc?.ccmrChallengeTier || 0) < 2) failures.push(`${id}: challenge family must use challenge tier >=2`);
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
      if (!Array.isArray(doc?.choices) || doc.choices.length !== 4) failures.push(`${id}: MCQ must have exactly 4 choices`);
      const choiceIds = new Set((doc?.choices || []).map((choice) => choice?.id).filter(Boolean));
      if (choiceIds.size !== (doc?.choices || []).length) failures.push(`${id}: duplicate or missing choice ids`);
      const expected = fields.find((field) => field?.inputProfile === 'choice')?.expected;
      if (!expected || !choiceIds.has(expected)) failures.push(`${id}: expected choice id is not in choices`);
    } else if (format === 'studentproducedresponse') {
      if (!fields.length || fields.some((field) => field?.expected == null || field?.expected === '')) failures.push(`${id}: SPR requires a gradeable expected response`);
    } else failures.push(`${id}: unsupported assessmentItemFormat ${doc?.assessmentItemFormat || '(missing)'}`);

    documents.push(doc);
  }
}

for (const domainId of targetDomains) {
  const ledger = ledgers.get(domainId)?.parsed;
  if (!ledger) continue;
  const entries = ledger.standards || {};
  const completed = completions.get(domainId)?.completed || new Set();

  for (const code of completed) {
    const entry = entries[code];
    if (!entry) failures.push(`${domainId} ${code}: completion manifest entry is absent from scope ledger`);
    else if (!(entry.status === 'authored' || AUTHORING_STATUSES.has(entry.status))) failures.push(`${domainId} ${code}: completion manifest conflicts with scope status ${entry.status}`);
    if (!bankByDomainStandard.has(`${domainId}|${code}`)) failures.push(`${domainId} ${code}: completion manifest says complete but no bank exists`);
  }

  for (const [rawCode, entry] of Object.entries(entries)) {
    const code = rawCode.toUpperCase();
    if (entry?.status === 'authored' && !bankByDomainStandard.has(`${domainId}|${code}`)) failures.push(`${domainId} ${code}: ledger says authored but no bank exists`);
    if (releaseMode && AUTHORING_STATUSES.has(entry?.status) && !completed.has(code)) failures.push(`${domainId} ${code}: full release blocked; scoped standard is not completed`);
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
if (releaseMode && (mcqRate < 0.68 || mcqRate > 0.82)) failures.push(`Full release MCQ rate ${(mcqRate * 100).toFixed(1)}% is outside the 68%-82% guardrail`);

const byDomain = {};
for (const doc of documents) {
  const domainId = doc?.assessmentContext?.domainId || 'unknown';
  byDomain[domainId] = (byDomain[domainId] || 0) + 1;
}
for (const domainId of targetDomains) if (!byDomain[domainId]) failures.push(`${domainId}: no completed V2.1 content selected`);

const summary = {
  schemaVersion: 2,
  releaseTarget: RELEASE_TARGET,
  mode: releaseMode ? 'full-release' : 'domain-authoring',
  domain: releaseMode ? null : requestedDomain,
  standards: new Set(documents.map(codeOf).filter(Boolean)).size,
  documents: documents.length,
  direct: documents.filter((doc) => roleOf(doc) === 'direct').length,
  challenge: documents.filter((doc) => roleOf(doc) === 'challenge').length,
  formats: { multipleChoice: mcq, studentProducedResponse: spr, mcqRate },
  domains: byDomain,
  completionManifests: Object.fromEntries([...completions.entries()].map(([domainId, value]) => [domainId, value.completed.size])),
  failures,
  warnings,
};

if (failures.length) {
  console.error(JSON.stringify(summary, null, 2));
  process.exitCode = 1;
} else {
  const output = releaseMode ? path.join(root, 'drafts', 'digitalSAT.v2.1.json') : path.join(root, 'drafts', `digitalSAT.v2.1.${requestedDomain}.json`);
  if (!checkOnly) writeFileSync(output, `${JSON.stringify({ schemaVersion: 2, releaseTarget: RELEASE_TARGET, framework: 'digitalSAT', buildMode: releaseMode ? 'full-release' : 'domain-authoring', domainId: releaseMode ? null : requestedDomain, documents }, null, 2)}\n`);
  console.log(JSON.stringify({ ...summary, output: checkOnly ? null : path.relative(root, output) }, null, 2));
}
