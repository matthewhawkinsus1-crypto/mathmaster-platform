import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_TEXAS_MATH_STANDARDS } from '../../functions/shared/texasStandards.mjs';
import { getAssessmentStandardReferences } from '../../src/platform/ccmr/assessmentStandardReferences.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const sourceRoot = path.join(repoRoot, 'drafts', 'ccmr-v2.1', 'act');
const REQUIRED_DOMAINS = Object.freeze(['preparingHigherMath', 'essentialSkills']);

export const ACT_PRODUCTION_RELEASE = 'ccmr-fidelity-v2.1-authentic-language';

const refText = (reference) => [
  reference?.officialCode,
  reference?.title,
  reference?.descriptor,
  reference?.domainTitle,
  reference?.topic,
].filter(Boolean).join(' ');

const codeIs = (...codes) => {
  const allowed = new Set(codes);
  return (reference) => allowed.has(String(reference?.officialCode || ''));
};

const codeStarts = (...prefixes) => (reference) => prefixes
  .some((prefix) => String(reference?.officialCode || '').startsWith(prefix));

const codeOrText = (codes, pattern) => {
  const byCode = codeIs(...codes);
  return (reference) => byCode(reference) || pattern.test(refText(reference));
};

// These predicates classify existing official ACT CCRS references. They never
// inspect question prompts and never invent ACT or Texas standards. Every key
// must be present in the authored ACT mapping ledgers; compileActProductionSeed
// fails closed if the ledger/predicate sets ever diverge.
export const ACT_NATIVE_ROUTING_PREDICATES = Object.freeze({
  numberQuantity: codeOrText(
    ['A 509', 'A 510', 'A 511', 'A 512', 'A 513', 'AF 501'],
    /square root|cube root|scientific notation|exponent|derived-unit|rational number/i,
  ),
  algebra: codeStarts('A ', 'AF '),
  functions: codeOrText(
    ['F 201', 'F 301', 'F 401', 'F 501', 'F 502', 'F 503', 'F 504', 'F 505', 'F 506', 'F 507', 'F 508', 'F 509', 'F 510', 'F 601', 'F 602', 'F 603', 'F 604', 'F 701', 'F 702', 'F 703', 'F 707', 'F 708', 'AF 403', 'AF 503', 'AF 604', 'AF 704', 'AF 705', 'AF 706'],
    /function|graph|domain|range|sequence|asymptote/i,
  ),
  geometry: codeStarts('G '),
  statisticsProbability: codeStarts('S '),

  realNumberProperties: codeOrText(
    ['AF 301', 'AF 302', 'A 201', 'A 301', 'A 303', 'A 401', 'A 402', 'A 601'],
    /arithmetic|positive rational|basic expressions|combine like terms|substitution|manipulate expressions/i,
  ),
  realNumberProblemSolving: codeIs('AF 201', 'AF 301', 'AF 302', 'AF 401', 'AF 501', 'AF 601', 'AF 701'),
  ratioProportionPercent: codeIs('AF 301', 'AF 401', 'AF 501', 'AF 601', 'AF 701'),
  writingAlgebraicExpressions: codeIs('A 201', 'AF 402', 'AF 502', 'AF 602', 'AF 702'),
  simpleEquationsInequalities: codeIs('A 202', 'A 302', 'A 403', 'A 405', 'A 503', 'A 504', 'A 602', 'A 603', 'AF 502', 'AF 602'),
  measurementUnitsConversion: codeIs('AF 501'),
  linesAnglesShapes: codeIs('G 403', 'G 405', 'G 512', 'G 603', 'G 606', 'G 607', 'G 608', 'G 703'),
  perimeterCircumferenceArea: codeIs('G 403', 'G 405', 'G 507', 'G 601'),
  surfaceAreaVolume: codeIs('G 405', 'G 601'),
  coordinatePlane: codeIs('AF 603', 'AF 704', 'G 406', 'G 407', 'G 510', 'G 512', 'G 605', 'G 606', 'G 607', 'G 608'),
  pythagoreanTheorem: codeIs('G 404', 'G 602', 'G 605'),
  scatterplots: codeIs('S 702', 'S 705'),
});

const walk = (dir) => !fs.existsSync(dir)
  ? []
  : fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });

const sortedUnique = (values) => [...new Set(values.map(String).filter(Boolean))]
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

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

const readActArtifacts = () => {
  const banks = [];
  const ledgerSkillIds = new Set();
  const files = walk(sourceRoot)
    .filter((filePath) => filePath.endsWith('.v2.1.json'))
    .sort();

  for (const filePath of files) {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (parsed?.framework !== 'act') continue;
    if (parsed?.releaseTarget !== ACT_PRODUCTION_RELEASE) {
      throw new Error(`${path.relative(repoRoot, filePath)}: wrong releaseTarget`);
    }

    if (parsed?.nativeSkills && typeof parsed.nativeSkills === 'object') {
      for (const [nativeSkillId, entry] of Object.entries(parsed.nativeSkills)) {
        if (entry?.status !== 'authored') {
          throw new Error(`${path.relative(repoRoot, filePath)}: ACT native skill ${nativeSkillId} is not authored`);
        }
        ledgerSkillIds.add(nativeSkillId);
      }
    }

    if (Array.isArray(parsed?.documents)) {
      banks.push({ filePath, parsed });
    }
  }

  return { banks, ledgerSkillIds };
};

const validatePredicateCoverage = (ledgerSkillIds) => {
  const ledgerIds = sortedUnique([...ledgerSkillIds]);
  const predicateIds = sortedUnique(Object.keys(ACT_NATIVE_ROUTING_PREDICATES));
  if (JSON.stringify(ledgerIds) !== JSON.stringify(predicateIds)) {
    const missingPredicates = ledgerIds.filter((id) => !predicateIds.includes(id));
    const extraPredicates = predicateIds.filter((id) => !ledgerIds.includes(id));
    throw new Error(`ACT native routing predicates do not match authored ledgers; missing=${missingPredicates.join(',') || 'none'} extra=${extraPredicates.join(',') || 'none'}`);
  }
};

const routeNativeSkill = (nativeSkillId) => {
  const predicate = ACT_NATIVE_ROUTING_PREDICATES[nativeSkillId];
  if (typeof predicate !== 'function') return [];

  return sortedUnique(
    ALL_TEXAS_MATH_STANDARDS
      .filter((standard) => standard.classification !== 'process')
      .filter((standard) => getAssessmentStandardReferences(standard.code, 'act').some(predicate))
      .map((standard) => standard.code),
  );
};

const roleOf = (item) => item?.ccmrFamilyRole
  || (Number(item?.ccmrChallengeTier || 1) >= 2 ? 'challenge' : 'direct');

const compileItem = ({ sourceItem, nativeSkillId }) => {
  const authoredTexasCodes = texasCodesFromKeys(sourceItem.alignmentKeys);
  const routingCodes = authoredTexasCodes.length
    ? authoredTexasCodes
    : routeNativeSkill(nativeSkillId);

  return {
    item: {
      ...structuredClone(sourceItem),
      alignmentKeys: routingCodes.map((code) => `texas:${code}`),
      alignments: addTexasCrosswalkAlignments(sourceItem.alignments, routingCodes),
      ccmrContentRelease: ACT_PRODUCTION_RELEASE,
      routingAlignmentProvenance: {
        framework: 'act',
        nativeSkillId,
        derivation: authoredTexasCodes.length ? 'authoredTexasAlignment' : 'assessmentStandardReferences',
      },
    },
    routed: routingCodes.length > 0,
  };
};

export const compileActProductionSeed = async () => {
  if (!fs.existsSync(sourceRoot)) {
    throw new Error(`Missing ACT V2.1 authoring root: ${path.relative(repoRoot, sourceRoot)}`);
  }

  const { banks, ledgerSkillIds } = readActArtifacts();
  validatePredicateCoverage(ledgerSkillIds);

  const items = [];
  const unroutedItemIds = [];
  const bankSkillIds = new Set();

  for (const bank of banks) {
    const domainId = String(bank.parsed?.domainId || '').trim();
    const nativeSkillId = String(bank.parsed?.nativeSkillId || '').trim();
    if (!REQUIRED_DOMAINS.includes(domainId)) {
      throw new Error(`${path.relative(repoRoot, bank.filePath)}: invalid ACT domain ${domainId || '(missing)'}`);
    }
    if (!ledgerSkillIds.has(nativeSkillId)) {
      throw new Error(`${path.relative(repoRoot, bank.filePath)}: ACT native skill ${nativeSkillId || '(missing)'} is not in the completed mapping ledgers`);
    }
    if (bankSkillIds.has(nativeSkillId)) {
      throw new Error(`ACT native skill ${nativeSkillId} has more than one authored bank`);
    }
    bankSkillIds.add(nativeSkillId);

    for (const sourceItem of bank.parsed.documents) {
      const itemNativeSkillId = String(sourceItem?.assessmentContext?.nativeSkillId || '').trim();
      if (sourceItem?.assessmentContext?.framework !== 'act' || sourceItem?.assessmentContext?.examStyle !== true) {
        throw new Error(`${sourceItem?.id || bank.filePath}: invalid ACT assessmentContext`);
      }
      if (sourceItem?.assessmentContext?.domainId !== domainId) {
        throw new Error(`${sourceItem?.id || bank.filePath}: ACT domain does not match source bank`);
      }
      if (itemNativeSkillId !== nativeSkillId) {
        throw new Error(`${sourceItem?.id || bank.filePath}: ACT native skill does not match source bank`);
      }
      if (sourceItem?.assessmentItemFormat !== 'multipleChoice' || sourceItem?.choices?.length !== 4) {
        throw new Error(`${sourceItem?.id || bank.filePath}: ACT V2.1 production items must be four-choice multiple choice`);
      }
      if (sourceItem?.ccmrAuthenticLanguage?.version !== '2.1' || sourceItem?.ccmrAuthenticLanguage?.authored !== true) {
        throw new Error(`${sourceItem?.id || bank.filePath}: missing authored ACT V2.1 marker`);
      }
      if (sourceItem?.ccmrAuthenticLanguage?.answerChoiceCount !== 4) {
        throw new Error(`${sourceItem?.id || bank.filePath}: ACT authored answerChoiceCount must be 4`);
      }
      if (roleOf(sourceItem) === 'challenge' && sourceItem?.ccmrAuthenticLanguage?.authoredChallenge !== true) {
        throw new Error(`${sourceItem?.id || bank.filePath}: ACT challenge must be independently authored`);
      }

      const { item, routed } = compileItem({ sourceItem, nativeSkillId });
      item.alignmentKeys = sortedUnique(item.alignmentKeys || []);
      if (!routed) unroutedItemIds.push(String(item.id || path.relative(repoRoot, bank.filePath)));
      items.push(item);
    }
  }

  const missingBanks = [...ledgerSkillIds].filter((nativeSkillId) => !bankSkillIds.has(nativeSkillId));
  if (missingBanks.length) {
    throw new Error(`Missing ACT authored banks for completed native skills: ${sortedUnique(missingBanks).join(', ')}`);
  }

  items.sort((left, right) => String(left.id).localeCompare(String(right.id)));
  const domains = Object.fromEntries(REQUIRED_DOMAINS.map((domainId) => {
    const domainItems = items.filter((item) => item?.assessmentContext?.domainId === domainId);
    return [domainId, {
      items: domainItems.length,
      direct: domainItems.filter((item) => roleOf(item) === 'direct').length,
      challenge: domainItems.filter((item) => roleOf(item) === 'challenge').length,
      modeling: domainItems.filter((item) => item?.assessmentContext?.modeling === true).length,
    }];
  }));

  return {
    schemaVersion: 2,
    artifactType: 'pathQuestionBankSeed',
    framework: 'act',
    releaseTarget: ACT_PRODUCTION_RELEASE,
    sourceOfTruth: 'drafts/ccmr-v2.1/act',
    items,
    domains,
    unroutedItemIds: sortedUnique(unroutedItemIds),
  };
};

export const actProductionSeedPaths = Object.freeze({
  root: path.join(repoRoot, 'seed', 'pathQuestionBank', 'act_pathQuestionBank_seed.json'),
  functions: path.join(repoRoot, 'functions', 'seeds', 'pathQuestionBank', 'act_pathQuestionBank_seed.json'),
});
