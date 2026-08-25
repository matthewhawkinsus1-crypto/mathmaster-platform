import test from 'node:test';
import assert from 'node:assert/strict';

const RELEASE_TARGET = 'ccmr-fidelity-v2.1-authentic-language';

function doc({ id, framework, domainId, prompt, role = 'direct', alignmentKeys = ['texas:A.2A'] }) {
  return {
    id,
    familyId: `${id}-family`,
    alignmentKeys,
    prompt,
    ccmrFamilyRole: role,
    ccmrChallengeTier: role === 'challenge' ? 2 : 1,
    ccmrAuthenticLanguage: {
      version: '2.1',
      authored: true,
      ...(role === 'challenge' ? { authoredChallenge: true } : {}),
    },
    assessmentContext: {
      framework,
      examStyle: true,
      domainId,
      ...(framework === 'tsia2' ? { tsia2TestScope: 'crcAndDiagnostic' } : {}),
    },
  };
}

const validPackages = () => ({
  digitalSAT: {
    releaseTarget: RELEASE_TARGET,
    documents: [doc({
      id: 'sat-1',
      framework: 'digitalSAT',
      domainId: 'algebra',
      prompt: 'What is the value of x in the equation 3x + 5 = 20?',
    })],
  },
  act: {
    releaseTarget: RELEASE_TARGET,
    documents: [doc({
      id: 'act-1',
      framework: 'act',
      domainId: 'preparingHigherMath',
      prompt: 'For f(x) = x^2 - 4, what is f(3)?',
    })],
  },
  tsia2: {
    releaseTarget: RELEASE_TARGET,
    documents: [doc({
      id: 'tsi-1',
      framework: 'tsia2',
      domainId: 'quantitativeReasoning',
      prompt: 'A jacket costs $48 after a 20% discount. What was the original price?',
    })],
  },
});

test('integration gate is intentionally limited to completed SAT, ACT, and TSIA2 releases', async () => {
  const integration = await import('../../scripts/lib/ccmr-v2-1-release-integration.mjs');
  assert.deepEqual(integration.CCMR_V21_INTEGRATED_FRAMEWORKS, ['digitalSAT', 'act', 'tsia2']);
  const report = integration.auditCcmrV21ReleaseIntegration(validPackages());
  assert.deepEqual(report.failures, []);
});

test('integration gate rejects duplicate production IDs across assessment banks', async () => {
  const { auditCcmrV21ReleaseIntegration } = await import('../../scripts/lib/ccmr-v2-1-release-integration.mjs');
  const packages = validPackages();
  packages.act.documents[0].id = packages.digitalSAT.documents[0].id;
  const report = auditCcmrV21ReleaseIntegration(packages);
  assert.ok(report.failures.some((failure) => /duplicate.*id/i.test(failure)));
});

test('integration gate rejects legacy or misrouted production content', async () => {
  const { auditCcmrV21ReleaseIntegration } = await import('../../scripts/lib/ccmr-v2-1-release-integration.mjs');
  const packages = validPackages();
  packages.digitalSAT.documents[0].ccmrAuthenticLanguage.version = '2.0';
  packages.act.documents[0].assessmentContext.framework = 'digitalSAT';
  packages.tsia2.documents[0].alignmentKeys = [];
  const report = auditCcmrV21ReleaseIntegration(packages);
  assert.ok(report.failures.some((failure) => /sat-1.*v2\.1/i.test(failure)));
  assert.ok(report.failures.some((failure) => /act-1.*framework/i.test(failure)));
  assert.ok(report.failures.some((failure) => /tsi-1.*routing/i.test(failure)));
});

test('integration gate rejects invalid framework domains and challenge provenance', async () => {
  const { auditCcmrV21ReleaseIntegration } = await import('../../scripts/lib/ccmr-v2-1-release-integration.mjs');
  const packages = validPackages();
  packages.digitalSAT.documents[0].assessmentContext.domainId = 'essentialSkills';
  packages.act.documents[0].ccmrFamilyRole = 'challenge';
  packages.act.documents[0].ccmrChallengeTier = 2;
  const report = auditCcmrV21ReleaseIntegration(packages);
  assert.ok(report.failures.some((failure) => /sat-1.*domain/i.test(failure)));
  assert.ok(report.failures.some((failure) => /act-1.*authoredChallenge/i.test(failure)));
});

test('integration gate rejects exact and near-identical cross-framework task grammar', async () => {
  const { auditCcmrV21ReleaseIntegration } = await import('../../scripts/lib/ccmr-v2-1-release-integration.mjs');
  const packages = validPackages();
  packages.act.documents[0].prompt = packages.digitalSAT.documents[0].prompt;
  const exact = auditCcmrV21ReleaseIntegration(packages);
  assert.ok(exact.failures.some((failure) => /cross-framework.*clone/i.test(failure)));

  const nearPackages = validPackages();
  nearPackages.digitalSAT.documents[0].prompt = 'A store marks a jacket down by 20 percent from its original price of 60 dollars. What is the sale price?';
  nearPackages.act.documents[0].prompt = 'A store marks a jacket down by 25 percent from its original price of 80 dollars. What is the sale price?';
  const near = auditCcmrV21ReleaseIntegration(nearPackages);
  assert.ok(near.failures.some((failure) => /cross-framework.*similar/i.test(failure)));
});
