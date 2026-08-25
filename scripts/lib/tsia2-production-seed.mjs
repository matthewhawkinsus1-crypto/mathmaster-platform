import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_TEXAS_MATH_STANDARDS, getTexasStandard } from '../../functions/shared/texasStandards.mjs';
import { getAssessmentStandardReferences } from '../../src/platform/ccmr/assessmentStandardReferences.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const sourceRoot = path.join(repoRoot, 'drafts', 'ccmr-v2.1', 'tsia2');

export const TSIA2_PRODUCTION_RELEASE = 'ccmr-fidelity-v2.1-authentic-language';

// CRC-capable native skills are connected to Texas standards by the existing
// authored TEKS -> TSIA2 crosswalk and official-reference matcher. The native
// source files remain Texas-key-free; this is a deploy-time routing layer.
const CORE_REFERENCE_BY_NATIVE_SKILL = Object.freeze({
  rationalIrrationalMagnitude: 'tsi-qr-magnitudes',
  ratioProportionPercent: 'tsi-qr-ratios',
  proportionalContext: 'tsi-qr-proportional-context',
  linearExpressionsEquationsInterpretation: 'tsi-qr-linear',
  linearEquationsInequalitiesSystems: 'tsi-ar-linear-systems',
  linearFunctions: 'tsi-ar-linear-functions',
  quadraticExponentialContext: 'tsi-ar-context',
  nonlinearExpressionsEquations: 'tsi-ar-manipulate',
  nonlinearEquationsFunctions: 'tsi-ar-solve-functions',
  measurementConversion: 'tsi-gs-units',
  perimeterAreaSurfaceVolume: 'tsi-gs-measure',
  transformationsCongruenceSimilaritySymmetry: 'tsi-gs-transform',
  rightTrianglesTrigonometry: 'tsi-gs-trig',
  geometryAlgebraConnections: 'tsi-gs-algebra',
  probability: 'tsi-ps-probability',
  centerSpread: 'tsi-ps-center-spread',
  dataClassificationRepresentation: 'tsi-ps-represent',
  dataAnalysisConclusions: 'tsi-ps-analyze',
});

// TSIA2 Diagnostic-only skills are more foundational than several of the active
// Texas course standards. Keep these mappings explicit instead of broadening a
// keyword matcher until every item appears to fit something. Every code below
// is an instructional crosswalk, not a claim that TSIA2 publishes Texas TEKS.
const DIAGNOSTIC_TEXAS_CODES_BY_NATIVE_SKILL = Object.freeze({
  basicNumberOperations: Object.freeze(['6.3C', '6.3D', '6.3E', '6.7A']),
  roundingPlaceValue: Object.freeze(['6.1C']),
  numberFormsComparison: Object.freeze(['6.2A', '6.2C', '6.2D', '6.4E', '6.4F', '6.4G', '6.5C']),
  commonMeasurementUnits: Object.freeze(['6.4H']),
  angleTypesRelationships: Object.freeze(['6.8A']),
  sortCountData: Object.freeze(['6.12A', '6.12D', '6.13A']),
  simpleGraphsTables: Object.freeze(['6.6A', '6.12A', '6.12D', '6.13A']),
});

const listNativeBankFiles = () => {
  const found = [];
  for (const domainEntry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
    if (!domainEntry.isDirectory()) continue;
    const domainDir = path.join(sourceRoot, domainEntry.name);
    for (const fileName of fs.readdirSync(domainDir)) {
      if (/^TSIA2_NATIVE_.+\.v2\.1\.json$/.test(fileName)) found.push(path.join(domainDir, fileName));
    }
  }
  return found.sort();
};

const readNativeBanks = () => listNativeBankFiles().map((filePath) => {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return { filePath, parsed };
});

const texasRoutingKey = (code) => `texas:${code}`;

const routeCoreSkill = (nativeSkillId) => {
  const referenceId = CORE_REFERENCE_BY_NATIVE_SKILL[nativeSkillId];
  if (!referenceId) return [];
  return ALL_TEXAS_MATH_STANDARDS
    .filter((standard) => standard.classification !== 'process')
    .filter((standard) => getAssessmentStandardReferences(standard.code, 'tsia2').some((reference) => reference.id === referenceId))
    .map((standard) => standard.code);
};

const routeDiagnosticSkill = (nativeSkillId) => (DIAGNOSTIC_TEXAS_CODES_BY_NATIVE_SKILL[nativeSkillId] || [])
  .filter((code) => {
    const standard = getTexasStandard(code);
    return standard && ['grade6', 'grade7', 'grade8'].includes(standard.courseId);
  });

const routingCodesFor = ({ nativeSkillId, testScope }) => {
  const codes = testScope === 'diagnosticOnly'
    ? routeDiagnosticSkill(nativeSkillId)
    : routeCoreSkill(nativeSkillId);
  return [...new Set(codes)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
};

const addRoutingAlignments = (item, codes) => {
  const existing = Array.isArray(item.alignments) ? item.alignments : [];
  const texasAlignments = codes.map((code) => ({
    framework: 'teks',
    code,
    role: 'primary',
    evidenceMode: 'crosswalk',
  }));
  return [...existing, ...texasAlignments];
};

export const compileTsia2ProductionSeed = async () => {
  const banks = readNativeBanks();
  const items = [];
  const nativeSkills = [];
  const unroutedNativeSkills = [];

  for (const { filePath, parsed } of banks) {
    const nativeSkillId = String(parsed.nativeSkillId || '').trim();
    const testScope = String(parsed.tsia2TestScope || '').trim();
    if (!nativeSkillId) throw new Error(`${filePath}: nativeSkillId is required`);
    if (!['crcAndDiagnostic', 'diagnosticOnly'].includes(testScope)) throw new Error(`${filePath}: invalid tsia2TestScope`);
    if (!Array.isArray(parsed.documents) || parsed.documents.length !== 8) throw new Error(`${filePath}: expected exactly 8 documents`);

    const sourceHasTexasKeys = parsed.documents.some((item) => (item.alignmentKeys || []).some((key) => String(key).startsWith('texas:')));
    if (sourceHasTexasKeys) throw new Error(`${filePath}: native source must remain free of Texas routing keys`);

    const routingCodes = routingCodesFor({ nativeSkillId, testScope });
    const routingAlignmentKeys = routingCodes.map(texasRoutingKey);
    if (!routingAlignmentKeys.length) unroutedNativeSkills.push(nativeSkillId);

    nativeSkills.push({
      nativeSkillId,
      domainId: parsed.domainId,
      tsia2TestScope: testScope,
      routingAlignmentKeys,
    });

    for (const sourceItem of parsed.documents) {
      items.push({
        ...sourceItem,
        alignmentKeys: routingAlignmentKeys,
        alignments: addRoutingAlignments(sourceItem, routingCodes),
        assessmentContext: {
          ...(sourceItem.assessmentContext || {}),
          framework: 'tsia2',
          examStyle: true,
          domainId: parsed.domainId,
          nativeSkillId,
          tsia2TestScope: testScope,
        },
        routingAlignmentProvenance: {
          framework: 'tsia2',
          nativeSkillId,
          derivation: 'official-reference-crosswalk',
          source: testScope === 'diagnosticOnly'
            ? 'explicit-diagnostic-texas-crosswalk'
            : 'assessmentStandardReferences',
          scope: testScope,
        },
        ccmrContentRelease: TSIA2_PRODUCTION_RELEASE,
      });
    }
  }

  const diagnosticOnlyFamilies = items.filter((item) => item.assessmentContext?.tsia2TestScope === 'diagnosticOnly').length;
  const crcAndDiagnosticFamilies = items.filter((item) => item.assessmentContext?.tsia2TestScope === 'crcAndDiagnostic').length;

  return {
    schemaVersion: 2,
    artifactType: 'pathQuestionBankSeed',
    framework: 'tsia2',
    releaseTarget: TSIA2_PRODUCTION_RELEASE,
    sourceOfTruth: 'drafts/ccmr-v2.1/tsia2',
    items,
    nativeSkills: nativeSkills.sort((a, b) => a.nativeSkillId.localeCompare(b.nativeSkillId)),
    unroutedNativeSkills: [...new Set(unroutedNativeSkills)].sort(),
    diagnosticOnlyFamilies,
    crcAndDiagnosticFamilies,
  };
};

export const tsia2ProductionSeedPaths = Object.freeze({
  root: path.join(repoRoot, 'seed', 'pathQuestionBank', 'tsia2_pathQuestionBank_seed.json'),
  functions: path.join(repoRoot, 'functions', 'seeds', 'pathQuestionBank', 'tsia2_pathQuestionBank_seed.json'),
});
