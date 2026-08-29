export const RELEASE_TARGET = 'ccmr-fidelity-v2.1-authentic-language';

export const OFFICIAL_SCOPE = Object.freeze({
  quantitativeReasoning: Object.freeze({
    rationalIrrationalMagnitude: 'crcAndDiagnostic',
    ratioProportionPercent: 'crcAndDiagnostic',
    proportionalContext: 'crcAndDiagnostic',
    linearExpressionsEquationsInterpretation: 'crcAndDiagnostic',
    basicNumberOperations: 'diagnosticOnly',
    roundingPlaceValue: 'diagnosticOnly',
    numberFormsComparison: 'diagnosticOnly',
  }),
  algebraicReasoning: Object.freeze({
    linearEquationsInequalitiesSystems: 'crcAndDiagnostic',
    linearFunctions: 'crcAndDiagnostic',
    quadraticExponentialContext: 'crcAndDiagnostic',
    nonlinearExpressionsEquations: 'crcAndDiagnostic',
    nonlinearEquationsFunctions: 'crcAndDiagnostic',
  }),
  geometricSpatial: Object.freeze({
    measurementConversion: 'crcAndDiagnostic',
    perimeterAreaSurfaceVolume: 'crcAndDiagnostic',
    transformationsCongruenceSimilaritySymmetry: 'crcAndDiagnostic',
    rightTrianglesTrigonometry: 'crcAndDiagnostic',
    geometryAlgebraConnections: 'crcAndDiagnostic',
    commonMeasurementUnits: 'diagnosticOnly',
    angleTypesRelationships: 'diagnosticOnly',
  }),
  probabilisticStatistical: Object.freeze({
    probability: 'crcAndDiagnostic',
    centerSpread: 'crcAndDiagnostic',
    dataClassificationRepresentation: 'crcAndDiagnostic',
    dataAnalysisConclusions: 'crcAndDiagnostic',
    sortCountData: 'diagnosticOnly',
    simpleGraphsTables: 'diagnosticOnly',
  }),
});

export const REQUIRED_DOMAINS = Object.freeze(Object.keys(OFFICIAL_SCOPE));
export const AUTHORABLE_STATUSES = Object.freeze(['author', 'author-partial', 'authored']);
export const AUTHORING_STATUSES = Object.freeze(['author', 'author-partial']);
export const VALID_TEST_SCOPES = Object.freeze(['crcAndDiagnostic', 'diagnosticOnly']);
export const VALID_CALCULATOR_MODES = Object.freeze(['none', 'basic', 'squareRoot', 'graphing']);

export const BANNED_PROMPT_PATTERNS = Object.freeze([
  /select the best answer/i,
  /best TSIA2 answer/i,
  /TSIA2 reasoning/i,
  /placement-level mathematics/i,
  /test taker/i,
  /practice question/i,
  /^challenge:/i,
  /show your work/i,
  /explain your reasoning/i,
  /use the workspace/i,
  /use the .* tool/i,
  /difficulty band/i,
  /\bdok\s*[1-4]\b/i,
  /recheck the mathematics/i,
  /verify .* before (selecting|submitting)/i,
]);

export const officialSkillCount = () => Object.values(OFFICIAL_SCOPE)
  .reduce((sum, skills) => sum + Object.keys(skills).length, 0);
