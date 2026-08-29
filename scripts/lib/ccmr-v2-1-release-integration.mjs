export const CCMR_V21_RELEASE_TARGET = 'ccmr-fidelity-v2.1-authentic-language';
export const CCMR_V21_INTEGRATED_FRAMEWORKS = Object.freeze(['digitalSAT', 'act', 'tsia2']);

const VALID_DOMAINS = Object.freeze({
  digitalSAT: new Set(['algebra', 'advancedMath', 'problemSolvingData', 'geometryTrigonometry']),
  act: new Set(['preparingHigherMath', 'essentialSkills']),
  tsia2: new Set(['quantitativeReasoning', 'algebraicReasoning', 'geometricSpatial', 'probabilisticStatistical']),
});

const docsIn = (pkg) => Array.isArray(pkg?.documents)
  ? pkg.documents
  : Array.isArray(pkg?.items)
    ? pkg.items
    : [];

const roleOf = (doc) => doc?.ccmrFamilyRole
  || (Number(doc?.ccmrChallengeTier || 1) >= 2 ? 'challenge' : 'direct');

const normalizeGrammar = (text) => String(text || '')
  .toLowerCase()
  .replace(/\{\{[^}]+\}\}/g, '<value>')
  .replace(/-?\d+(?:\.\d+)?/g, '<number>')
  .replace(/\s+/g, ' ')
  .trim();

const significantTokens = (text) => normalizeGrammar(text)
  .replace(/[^a-z<>\s'-]/g, ' ')
  .split(/\s+/)
  .filter((token) => token.length > 2);

const jaccardSimilarity = (leftTokens, rightTokens) => {
  const left = new Set(leftTokens);
  const right = new Set(rightTokens);
  const union = new Set([...left, ...right]);
  if (union.size === 0) return 0;
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  return intersection / union.size;
};

const metadataCompatible = (left, right) => {
  const taskTypesPresent = Boolean(left?.taskType && right?.taskType);
  const representationsPresent = Boolean(left?.representation && right?.representation);
  if (!taskTypesPresent && !representationsPresent) return true;
  const taskTypeMatches = taskTypesPresent && left.taskType === right.taskType;
  const representationMatches = representationsPresent && left.representation === right.representation;
  return taskTypeMatches || representationMatches;
};

const idFor = (doc, fallback) => String(doc?.id || fallback);

export function auditCcmrV21ReleaseIntegration(packages = {}) {
  const failures = [];
  const warnings = [];
  const frameworkSummaries = {};
  const crossFrameworkClonePairs = [];

  const packageKeys = Object.keys(packages || {});
  for (const key of packageKeys) {
    if (!CCMR_V21_INTEGRATED_FRAMEWORKS.includes(key)) {
      failures.push(`${key} is not a coordinated CCMR V2.1 framework; ASVAB and all other frameworks are excluded from this release gate.`);
    }
  }

  const seenIds = new Map();
  const seenFamilies = new Map();
  const docsByFramework = {};

  for (const framework of CCMR_V21_INTEGRATED_FRAMEWORKS) {
    const pkg = packages?.[framework];
    if (!pkg) {
      failures.push(`${framework} package is required for the CCMR V2.1 integrated release.`);
      frameworkSummaries[framework] = {
        documents: 0,
        direct: 0,
        challenge: 0,
        routeable: 0,
        domains: [],
      };
      docsByFramework[framework] = [];
      continue;
    }

    if (pkg.releaseTarget !== CCMR_V21_RELEASE_TARGET) {
      failures.push(`${framework} package releaseTarget must be ${CCMR_V21_RELEASE_TARGET}.`);
    }
    if (pkg.framework != null && pkg.framework !== framework) {
      failures.push(`${framework} package framework must be ${framework}.`);
    }

    const docs = docsIn(pkg);
    docsByFramework[framework] = docs;
    if (docs.length === 0) {
      failures.push(`${framework} package contains no production documents.`);
    }

    let direct = 0;
    let challenge = 0;
    let routeable = 0;
    const domains = new Set();

    docs.forEach((doc, index) => {
      const id = idFor(doc, `${framework}[${index}]`);
      const familyId = String(doc?.familyId || '');
      const role = roleOf(doc);
      const context = doc?.assessmentContext || {};
      const authentic = doc?.ccmrAuthenticLanguage || {};

      if (!doc?.id) failures.push(`${id} is missing a production id.`);
      if (!familyId) failures.push(`${id} is missing familyId.`);

      if (doc?.id) {
        const prior = seenIds.get(doc.id);
        if (prior) {
          failures.push(`Duplicate production id ${doc.id} appears in ${prior} and ${framework}.`);
        } else {
          seenIds.set(doc.id, framework);
        }
      }

      if (familyId) {
        const priorFamily = seenFamilies.get(familyId);
        if (priorFamily) {
          failures.push(`Duplicate family id ${familyId} appears in ${priorFamily} and ${framework}.`);
        } else {
          seenFamilies.set(familyId, framework);
        }
      }

      if (context.framework !== framework) {
        failures.push(`${id} framework must be ${framework}; found ${String(context.framework || 'missing')}.`);
      }
      if (context.examStyle !== true) {
        failures.push(`${id} must set assessmentContext.examStyle=true.`);
      }
      if (!VALID_DOMAINS[framework].has(context.domainId)) {
        failures.push(`${id} has invalid ${framework} domain ${String(context.domainId || 'missing')}.`);
      } else {
        domains.add(context.domainId);
      }

      if (authentic.version !== '2.1' || authentic.authored !== true) {
        failures.push(`${id} must carry authored V2.1 authentic-language metadata.`);
      }
      if (doc?.ccmrContentRelease !== CCMR_V21_RELEASE_TARGET) {
        failures.push(`${id} content release must be ${CCMR_V21_RELEASE_TARGET}.`);
      }

      if (!Array.isArray(doc?.alignmentKeys) || doc.alignmentKeys.length === 0) {
        failures.push(`${id} has no production routing alignmentKeys.`);
      } else {
        routeable += 1;
      }

      if (role === 'challenge') {
        challenge += 1;
        if (authentic.authoredChallenge !== true) {
          failures.push(`${id} challenge content must set ccmrAuthenticLanguage.authoredChallenge=true.`);
        }
      } else {
        direct += 1;
      }
    });

    frameworkSummaries[framework] = {
      documents: docs.length,
      direct,
      challenge,
      routeable,
      domains: [...domains].sort(),
    };
  }

  for (let leftIndex = 0; leftIndex < CCMR_V21_INTEGRATED_FRAMEWORKS.length; leftIndex += 1) {
    const leftFramework = CCMR_V21_INTEGRATED_FRAMEWORKS[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < CCMR_V21_INTEGRATED_FRAMEWORKS.length; rightIndex += 1) {
      const rightFramework = CCMR_V21_INTEGRATED_FRAMEWORKS[rightIndex];
      for (const leftDoc of docsByFramework[leftFramework] || []) {
        const leftTokens = significantTokens(leftDoc?.prompt);
        if (leftTokens.length < 8) continue;
        const leftGrammar = normalizeGrammar(leftDoc?.prompt);

        for (const rightDoc of docsByFramework[rightFramework] || []) {
          const rightTokens = significantTokens(rightDoc?.prompt);
          if (rightTokens.length < 8) continue;
          const rightGrammar = normalizeGrammar(rightDoc?.prompt);
          const leftId = idFor(leftDoc, `${leftFramework}-unknown`);
          const rightId = idFor(rightDoc, `${rightFramework}-unknown`);

          if (leftGrammar === rightGrammar) {
            crossFrameworkClonePairs.push({
              kind: 'exact',
              leftFramework,
              leftId,
              rightFramework,
              rightId,
              similarity: 1,
            });
            failures.push(`Cross-framework clone detected between ${leftFramework}:${leftId} and ${rightFramework}:${rightId}.`);
          }

          if (!metadataCompatible(leftDoc, rightDoc)) continue;
          const similarity = jaccardSimilarity(leftTokens, rightTokens);
          if (similarity >= 0.90) {
            crossFrameworkClonePairs.push({
              kind: 'near',
              leftFramework,
              leftId,
              rightFramework,
              rightId,
              similarity,
            });
            failures.push(`Cross-framework similar task grammar detected between ${leftFramework}:${leftId} and ${rightFramework}:${rightId} (${similarity.toFixed(3)}).`);
          }
        }
      }
    }
  }

  return {
    failures,
    warnings,
    frameworkSummaries,
    crossFrameworkClonePairs,
  };
}
