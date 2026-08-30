import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';

import {
  bestPathVariantForTarget,
  generatePathInstance,
  generatePathInstanceWithRetries,
} from '../../functions/shared/pathQuestionGeneration.mjs';
import {
  selectNextFamily,
} from '../../functions/shared/pathQuestionSelection.mjs';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');

const TARGETS = [
  { dok: 2, difficultyBand: 2 },
  { dok: 2, difficultyBand: 3 },
  { dok: 2, difficultyBand: 4 },
  { dok: 3, difficultyBand: 3 },
  { dok: 3, difficultyBand: 4 },
];

const syntheticFamily = () => ({
  id: 'adaptive-family',
  familyId: 'adaptive-family',
  alignmentKeys: ['texas:A2.2A'],
  dok: 2,
  difficultyBand: 3,
  prompt: 'Core {{n}}',
  responseFields: [{ id: 'answer', expected: '{{n}}' }],
  generator: { parameters: { n: { type: 'int', min: 1, max: 9 } } },
  variants: [
    { coverageKey: 'd2b2', dok: 2, difficultyBand: 2, prompt: '2:2 {{n}}' },
    { coverageKey: 'd2b3', dok: 2, difficultyBand: 3, prompt: '2:3 {{n}}' },
    { coverageKey: 'd2b4', dok: 2, difficultyBand: 4, prompt: '2:4 {{n}}' },
    { coverageKey: 'd3b3', dok: 3, difficultyBand: 3, prompt: '3:3 {{n}}' },
    { coverageKey: 'd3b4', dok: 3, difficultyBand: 4, prompt: '3:4 {{n}}' },
  ],
});

test('target-aware generation issues the exact authored DOK/difficulty cell', () => {
  const family = syntheticFamily();

  for (const target of TARGETS) {
    for (let seed = 0; seed < 12; seed += 1) {
      const generated = generatePathInstance(family, 'target-' + target.dok + '-' + target.difficultyBand + '-' + seed, {
        preferredDok: target.dok,
        preferredDifficultyBand: target.difficultyBand,
      });
      assert.ok(generated.question);
      assert.equal(generated.question.dok, target.dok);
      assert.equal(generated.question.difficultyBand, target.difficultyBand);
      assert.equal(
        generated.question.coverageKey,
        'd' + target.dok + 'b' + target.difficultyBand,
      );
    }
  }
});

test('target above the authored ceiling deterministically falls back to DOK3/Band4', () => {
  const family = syntheticFamily();
  for (let seed = 0; seed < 20; seed += 1) {
    const generated = generatePathInstance(family, 'band5-' + seed, {
      preferredDok: 3,
      preferredDifficultyBand: 5,
    });
    assert.ok(generated.question);
    assert.equal(generated.question.dok, 3);
    assert.equal(generated.question.difficultyBand, 4);
    assert.equal(generated.question.coverageKey, 'd3b4');
  }
});

test('no-target generation preserves legacy seeded variant variety', () => {
  const family = syntheticFamily();
  const seen = new Set();
  for (let seed = 0; seed < 80; seed += 1) {
    const generated = generatePathInstance(family, 'legacy-' + seed);
    assert.ok(generated.question);
    seen.add(generated.question.coverageKey);
  }
  assert.ok(seen.size >= 4, 'no-target callers should retain seeded variant variety');
  assert.deepEqual(
    generatePathInstance(family, 'replay'),
    generatePathInstance(family, 'replay'),
    'no-target replay must remain deterministic',
  );
});

test('family selection ranks by the variant that best matches the requested target', () => {
  const exactViaVariant = {
    ...syntheticFamily(),
    id: 'exact-via-variant',
    familyId: 'exact-via-variant',
    dok: 2,
    difficultyBand: 2,
  };
  const nearbyOnly = {
    id: 'nearby-only',
    familyId: 'nearby-only',
    dok: 2,
    difficultyBand: 4,
    prompt: 'Nearby',
    responseFields: [{ id: 'answer', expected: '1' }],
  };

  const choice = selectNextFamily([nearbyOnly, exactViaVariant], {
    preferredBand: 4,
    preferredDok: 3,
  });
  assert.equal(choice.question.id, 'exact-via-variant');
  assert.equal(choice.band, 4);
  assert.equal(choice.dok, 3);
  assert.equal(choice.effectiveCoverageKey, 'd3b4');
});

test('mathPath instantiation receives and honors the adaptive target', async () => {
  const family = syntheticFamily();
  const draw = await mathPath.instantiateQuestion(family, 'server-seam', {
    preferredDok: 3,
    preferredDifficultyBand: 4,
  });
  assert.ok(draw.question);
  assert.equal(draw.question.dok, 3);
  assert.equal(draw.question.difficultyBand, 4);
  assert.equal(draw.question.coverageKey, 'd3b4');
});

test('mathPath also target-selects static variants with no numeric generator', async () => {
  const family = {
    id: 'static-adaptive-family',
    familyId: 'static-adaptive-family',
    dok: 2,
    difficultyBand: 3,
    variants: [
      {
        coverageKey: 'static-core',
        dok: 2,
        difficultyBand: 3,
        prompt: 'Core static',
        responseFields: [{ id: 'answer', expected: 'core' }],
      },
      {
        coverageKey: 'static-challenge',
        dok: 3,
        difficultyBand: 4,
        prompt: 'Challenge static',
        responseFields: [{ id: 'answer', expected: 'challenge' }],
      },
    ],
  };

  const draw = await mathPath.instantiateQuestion(family, 'static-server-seam', {
    preferredDok: 3,
    preferredDifficultyBand: 4,
  });
  assert.ok(draw.question);
  assert.equal(draw.question.coverageKey, 'static-challenge');
  assert.equal(draw.question.dok, 3);
  assert.equal(draw.question.difficultyBand, 4);

  const plan = await mathPath.buildTemplateIssuePlan(family, { samples: 12 });
  assert.equal(plan.issuable, true);
  assert.equal(plan.samples, 12);
});

const stagedEntries = (directory) => readdirSync(directory)
  .filter((name) => name.endsWith('.json'))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  .map((name) => JSON.parse(readFileSync(directory + '/' + name, 'utf8')));

test('every Algebra I and Algebra II preferred adaptive cell can be issued through target-aware generation', () => {
  const courses = [
    ['Algebra I', stagedEntries('drafts/fidelity-v2/algebra1')],
    ['Algebra II', stagedEntries('drafts/fidelity-v2/algebra2')],
  ];

  let checked = 0;
  for (const [courseName, entries] of courses) {
    for (const entry of entries) {
      for (const target of TARGETS) {
        const matches = (entry.documents || [])
          .map((family) => ({
            family,
            match: bestPathVariantForTarget(family, {
              preferredDok: target.dok,
              preferredDifficultyBand: target.difficultyBand,
            }),
          }))
          .filter(({ match }) => (
            Number(match.dok) === target.dok
            && Number(match.difficultyBand) === target.difficultyBand
          ));

        assert.ok(
          matches.length >= 1,
          courseName + ' ' + entry.standard + ' has no runtime-matchable '
            + target.dok + ':' + target.difficultyBand + ' family',
        );

        const family = matches[0].family;
        const generated = generatePathInstanceWithRetries(
          family,
          'runtime-audit|' + entry.standard + '|' + target.dok + ':' + target.difficultyBand,
          4,
          {
            preferredDok: target.dok,
            preferredDifficultyBand: target.difficultyBand,
          },
        );

        assert.ok(
          generated.question,
          courseName + ' ' + entry.standard + ' failed target-aware generation for '
            + target.dok + ':' + target.difficultyBand + ': ' + generated.reason,
        );
        assert.equal(
          Number(generated.question.dok),
          target.dok,
          courseName + ' ' + entry.standard + ' issued the wrong DOK for '
            + target.dok + ':' + target.difficultyBand,
        );
        assert.equal(
          Number(generated.question.difficultyBand),
          target.difficultyBand,
          courseName + ' ' + entry.standard + ' issued the wrong band for '
            + target.dok + ':' + target.difficultyBand,
        );
        checked += 1;
      }
    }
  }

  assert.equal(checked, (49 + 48) * TARGETS.length);
});



test('frozen weekly slot rigor outranks open-practice pass escalation and enrichment', () => {
  const source = readFileSync('functions/index.js', 'utf8');

  assert.match(
    source,
    /const onAssignedWeeklyTarget = Boolean\(session\.weeklySlotKey[\s\S]*?session\.intendedDifficultyBand[\s\S]*?session\.intendedDok/,
    'weekly sessions must resolve their frozen intended rigor before any open-practice escalation',
  );

  assert.match(
    source,
    /if \(!session\.assessmentFramework && session\.sessionKind !== "retentionProbe" && !onAssignedWeeklyTarget\)/,
    'course pass Level 2/3 escalation must not rewrite a frozen weekly target',
  );

  const enrichmentBlock = /if \(\s*!session\.assessmentFramework([\s\S]*?)\n  \) \{\s*preferredDifficultyBand = 4;/.exec(source);
  assert.ok(enrichmentBlock, 'fresh enrichment override block is missing');
  assert.match(
    enrichmentBlock[1],
    /!onAssignedWeeklyTarget/,
    'fresh enrichment must not turn an assigned weekly core/retention slot into Challenge work',
  );
});

test('server wiring passes target preferences and honors fresh enrichment', () => {
  const source = readFileSync('functions/index.js', 'utf8');
  assert.match(
    source,
    /instantiateQuestion\([\s\S]*preferredDok,[\s\S]*preferredDifficultyBand,[\s\S]*\)/,
  );
  assert.match(source, /session\.lastDecision\?\.action === "enrichment"/);
  assert.match(source, /preferredDifficultyBand = 4;[\s\S]*preferredDok = 3;/);

  const pass3 = /if \(coursePassLevel >= 3\) \{([\s\S]*?)\n    \}/.exec(source);
  assert.ok(pass3, 'course Pass 3 rigor block is missing');
  assert.equal(
    /Math\.max\(5/.test(pass3[1]),
    false,
    'course Pass 3 must not request nonexistent Band 5 course content',
  );
});


test('weekly sessions are not promoted into numbered course Path passes', () => {
  const source = readFileSync('functions/index.js', 'utf8');

  const progressBlock = /async function loadCoursePathPassProgress[\s\S]*?return \{[\s\S]*?totalCompletedPasses:[\s\S]*?\n  \};\n\}/.exec(source);
  assert.ok(progressBlock, 'course Path pass progress loader is missing');
  assert.match(
    progressBlock[0],
    /if \(session\.weeklySlotKey\) return;/,
    'weekly goal sessions must not increment Foundation/Deeper/Mastery pass counts',
  );

  assert.match(
    source,
    /if \(!assessmentFramework && sessionKind !== "retentionProbe" && !requestedWeeklySlotKey\)/,
    'weekly session startup must not assign an open-practice coursePassLevel',
  );

  assert.match(
    source,
    /coursePassLevel: session\.assessmentFramework \|\| session\.weeklySlotKey\s*\? null/,
    'issued weekly questions must not carry a numbered course Path level',
  );
});


test('earned free-choice Challenge is a one-way DOK3 Band4 intent and not a numbered pass', () => {
  const server = readFileSync('functions/index.js', 'utf8');
  const app = readFileSync('src/components/student/MyMathPathApp.jsx', 'utf8');
  const service = readFileSync('src/services/pathSessionService.js', 'utf8');

  assert.match(
    app,
    /card\.status === 'extension' \? 'challenge' : null/,
    'the visible Challenge card must carry a semantic challenge intent',
  );
  assert.match(
    service,
    /coursePracticeIntent: coursePracticeIntent === 'challenge' \? 'challenge' : null/,
    'the client service may forward only the named challenge intent, never raw rigor',
  );
  assert.match(
    server,
    /requestedCoursePracticeIntent[\s\S]*=== "challenge"[\s\S]*\? "challenge"[\s\S]*: null/,
  );
  assert.match(
    server,
    /const coursePracticeIntent = requestedCoursePracticeIntent[\s\S]*!assessmentFramework[\s\S]*sessionKind !== "retentionProbe"[\s\S]*!requestedWeeklySlotKey/,
    'Challenge intent must be ordinary free-choice course practice only',
  );

  const challengeBlock = /if \(\s*session\.coursePracticeIntent === "challenge"([\s\S]*?)\n  \) \{([\s\S]*?)\n  \}/.exec(server);
  assert.ok(challengeBlock, 'server Challenge rigor block is missing');
  assert.match(challengeBlock[1], /!session\.weeklySlotKey/);
  assert.match(challengeBlock[1], /activeDisplayCode === targetDisplayCode/);
  assert.match(challengeBlock[1], /!session\.diagnosing/);
  assert.match(challengeBlock[2], /preferredDifficultyBand = 4;/);
  assert.match(challengeBlock[2], /preferredDok = 3;/);

  const progressBlock = /async function loadCoursePathPassProgress[\s\S]*?return \{[\s\S]*?totalCompletedPasses:[\s\S]*?\n  \};\n\}/.exec(server);
  assert.ok(progressBlock);
  assert.match(
    progressBlock[0],
    /if \(session\.coursePracticeIntent === "challenge"\) return;/,
    'ahead-of-class Challenge must not counterfeit numbered course pass history',
  );
  assert.match(
    server,
    /coursePassLevel: session\.assessmentFramework \|\| session\.weeklySlotKey \|\| session\.coursePracticeIntent === "challenge"[\s\S]*?\? null/,
  );
});
