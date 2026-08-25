import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_TEXAS_MATH_STANDARDS } from '../../functions/shared/texasStandards.mjs';
import {
  DIGITAL_SAT_REFERENCES,
  getAssessmentStandardReferences,
} from '../../src/platform/ccmr/assessmentStandardReferences.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const sourceRoot = path.join(repoRoot, 'drafts', 'ccmr-v2.1', 'digitalSAT');
const REQUIRED_DOMAINS = Object.freeze([
  'algebra',
  'advancedMath',
  'problemSolvingData',
  'geometryTrigonometry',
]);

export const DIGITAL_SAT_PRODUCTION_RELEASE = 'ccmr-fidelity-v2.1-authentic-language';

const walk = (dir) => !fs.existsSync(dir)
  ? []
  : fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });

const deepMerge = (base, patch) => {
  if (Array.isArray(patch)) return patch.map((value) => structuredClone(value));
  if (!patch || typeof patch !== 'object') return patch;
  const out = base && typeof base === 'object' && !Array.isArray(base)
    ? structuredClone(base)
    : {};
  for (const [key, value] of Object.entries(patch)) {
    out[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? deepMerge(out[key], value)
      : Array.isArray(value)
        ? value.map((entry) => structuredClone(entry))
        : value;
  }
  return out;
};

const normalizeReferenceText = (value) => String(value || '')
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const sortedUnique = (values) => [...new Set(values.map(String).filter(Boolean))]
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

const readSourceArtifacts = () => {
  const banks = [];
  const overridesByDomain = new Map();
  const files = walk(sourceRoot)
    .filter((filePath) => filePath.endsWith('.v2.1.json'))
    .sort();

  for (const filePath of files) {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (parsed?.framework !== 'digitalSAT') continue;
    if (parsed?.releaseTarget !== DIGITAL_SAT_PRODUCTION_RELEASE) {
      throw new Error(`${path.relative(repoRoot, filePath)}: wrong releaseTarget`);
    }

    if (parsed?.artifactType === 'antiCloneOverrides') {
      const domainId = String(parsed.domainId || '').trim();
      if (!REQUIRED_DOMAINS.includes(domainId)) {
        throw new Error(`${path.relative(repoRoot, filePath)}: invalid anti-clone domain ${domainId || '(missing)'}`);
      }
      if (!overridesByDomain.has(domainId)) overridesByDomain.set(domainId, new Map());
      const domainOverrides = overridesByDomain.get(domainId);
      for (const [familyId, patch] of Object.entries(parsed.patches || {})) {
        if (domainOverrides.has(familyId)) {
          throw new Error(`${domainId}: duplicate anti-clone override for ${familyId}`);
        }
        domainOverrides.set(familyId, { patch, matched: 0, filePath });
      }
      continue;
    }

    if (Array.isArray(parsed?.documents)) banks.push({ filePath, parsed });
  }

  return { banks, overridesByDomain };
};

const effectiveDocuments = (bank, overridesByDomain) => {
  const domainOverrides = overridesByDomain.get(bank.parsed.domainId) || new Map();
  return bank.parsed.documents.map((sourceItem) => {
    const familyId = String(sourceItem?.familyId || '').trim();
    const override = domainOverrides.get(familyId);
    if (!override) return structuredClone(sourceItem);
    override.matched += 1;
    return deepMerge(sourceItem, override.patch);
  });
};

const referenceForNativeItem = (item, bank) => {
  const nativeSkillId = String(
    item?.assessmentContext?.nativeSkillId
      || item?.ccmrAuthenticLanguage?.nativeSkillId
      || bank?.parsed?.nativeSkillId
      || '',
  ).trim();

  if (nativeSkillId && DIGITAL_SAT_REFERENCES[nativeSkillId]) {
    return DIGITAL_SAT_REFERENCES[nativeSkillId];
  }

  const officialSkillFamily = normalizeReferenceText(item?.ccmrAuthenticLanguage?.officialSkillFamily);
  if (!officialSkillFamily) return null;

  const matches = Object.values(DIGITAL_SAT_REFERENCES)
    .filter((reference) => normalizeReferenceText(reference.title) === officialSkillFamily);
  if (matches.length !== 1) return null;
  return matches[0];
};

const routeReferenceId = (referenceId) => sortedUnique(
  ALL_TEXAS_MATH_STANDARDS
    .filter((standard) => standard.classification !== 'process')
    .filter((standard) => getAssessmentStandardReferences(standard.code, 'digitalSAT')
      .some((reference) => reference.id === referenceId))
    .map((standard) => standard.code),
);

const texasCodesFromKeys = (alignmentKeys) => sortedUnique(
  (Array.isArray(alignmentKeys) ? alignmentKeys : [])
    .filter((key) => /^texas:/i.test(String(key)))
    .map((key) => String(key).replace(/^texas:/i, '')),
);

const addTexasCrosswalkAlignments = (existingAlignments, routingCodes) => {
  const existing = Array.isArray(existingAlignments)
    ? existingAlignments.map((alignment) => structuredClone(alignment))
    : [];
  const existingTexasCodes = new Set(
    existing
      .filter((alignment) => alignment?.framework === 'teks' && alignment?.code)
      .map((alignment) => String(alignment.code).toUpperCase()),
  );
  for (const code of routingCodes) {
    if (existingTexasCodes.has(String(code).toUpperCase())) continue;
    existing.push({
      framework: 'teks',
      code,
      role: 'primary',
      evidenceMode: 'crosswalk',
    });
  }
  return existing;
};

const compileItem = ({ sourceItem, bank }) => {
  const existingTexasCodes = texasCodesFromKeys(sourceItem.alignmentKeys);
  if (existingTexasCodes.length) {
    return {
      item: {
        ...structuredClone(sourceItem),
        alignmentKeys: existingTexasCodes.map((code) => `texas:${code}`),
        ccmrContentRelease: DIGITAL_SAT_PRODUCTION_RELEASE,
        routingAlignmentProvenance: {
          framework: 'digitalSAT',
          derivation: 'authoredTexasAlignment',
        },
      },
      routed: true,
    };
  }

  const reference = referenceForNativeItem(sourceItem, bank);
  const routingCodes = reference ? routeReferenceId(reference.id) : [];
  const compiled = {
    ...structuredClone(sourceItem),
    alignmentKeys: routingCodes.map((code) => `texas:${code}`),
    alignments: addTexasCrosswalkAlignments(sourceItem.alignments, routingCodes),
    ccmrContentRelease: DIGITAL_SAT_PRODUCTION_RELEASE,
    routingAlignmentProvenance: {
      framework: 'digitalSAT',
      derivation: 'assessmentStandardReferences',
      ...(reference ? { referenceId: reference.id } : {}),
    },
  };
  return { item: compiled, routed: routingCodes.length > 0 };
};

const roleOf = (item) => item?.ccmrFamilyRole
  || (Number(item?.ccmrChallengeTier || 1) >= 2 ? 'challenge' : 'direct');

export const compileDigitalSatProductionSeed = async () => {
  if (!fs.existsSync(sourceRoot)) {
    throw new Error(`Missing Digital SAT V2.1 authoring root: ${path.relative(repoRoot, sourceRoot)}`);
  }

  const { banks, overridesByDomain } = readSourceArtifacts();
  const items = [];
  const unroutedItemIds = [];

  for (const bank of banks) {
    const domainId = String(bank.parsed.domainId || '').trim();
    if (!REQUIRED_DOMAINS.includes(domainId)) {
      throw new Error(`${path.relative(repoRoot, bank.filePath)}: invalid Digital SAT domain ${domainId || '(missing)'}`);
    }

    for (const sourceItem of effectiveDocuments(bank, overridesByDomain)) {
      if (sourceItem?.assessmentContext?.framework !== 'digitalSAT') {
        throw new Error(`${sourceItem?.id || bank.filePath}: invalid Digital SAT assessmentContext`);
      }
      if (sourceItem?.assessmentContext?.domainId !== domainId) {
        throw new Error(`${sourceItem?.id || bank.filePath}: domain does not match source bank`);
      }
      if (sourceItem?.ccmrAuthenticLanguage?.version !== '2.1' || sourceItem?.ccmrAuthenticLanguage?.authored !== true) {
        throw new Error(`${sourceItem?.id || bank.filePath}: missing authored V2.1 marker`);
      }

      const { item, routed } = compileItem({ sourceItem, bank });
      if (!routed) unroutedItemIds.push(String(item.id || path.relative(repoRoot, bank.filePath)));
      item.alignmentKeys = sortedUnique(item.alignmentKeys || []);
      items.push(item);
    }
  }

  for (const [domainId, domainOverrides] of overridesByDomain.entries()) {
    for (const [familyId, override] of domainOverrides.entries()) {
      if (override.matched !== 1) {
        throw new Error(`${domainId}: anti-clone override ${familyId} matched ${override.matched} documents`);
      }
    }
  }

  items.sort((left, right) => String(left.id).localeCompare(String(right.id)));
  const domains = Object.fromEntries(REQUIRED_DOMAINS.map((domainId) => {
    const domainItems = items.filter((item) => item?.assessmentContext?.domainId === domainId);
    return [domainId, {
      items: domainItems.length,
      direct: domainItems.filter((item) => roleOf(item) === 'direct').length,
      challenge: domainItems.filter((item) => roleOf(item) === 'challenge').length,
    }];
  }));

  return {
    schemaVersion: 2,
    artifactType: 'pathQuestionBankSeed',
    framework: 'digitalSAT',
    releaseTarget: DIGITAL_SAT_PRODUCTION_RELEASE,
    sourceOfTruth: 'drafts/ccmr-v2.1/digitalSAT',
    items,
    domains,
    unroutedItemIds: sortedUnique(unroutedItemIds),
  };
};

export const digitalSatProductionSeedPaths = Object.freeze({
  root: path.join(repoRoot, 'seed', 'pathQuestionBank', 'digitalSAT_pathQuestionBank_seed.json'),
  functions: path.join(repoRoot, 'functions', 'seeds', 'pathQuestionBank', 'digitalSAT_pathQuestionBank_seed.json'),
});
