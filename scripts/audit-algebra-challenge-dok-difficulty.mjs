import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const TARGETS = [[2,2],[2,3],[2,4],[3,3],[3,4]];
const pairKey = (dok, band) => String(dok) + ':' + String(band);

const readCourse = (course, dir) => {
  const files = readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort((a,b) => a.localeCompare(b, undefined, { numeric:true }));

  const rows = files.map((name) => {
    const entry = JSON.parse(readFileSync(path.join(dir, name), 'utf8'));
    const pairs = new Set();
    const doks = new Set();
    const bands = new Set();
    const challengeFamilies = [];

    for (const doc of entry.documents || []) {
      const variants = Array.isArray(doc.variants) && doc.variants.length ? doc.variants : [null];
      for (const variant of variants) {
        const dok = Number(variant?.dok ?? doc.dok);
        const band = Number(variant?.difficultyBand ?? doc.difficultyBand);
        if (Number.isFinite(dok)) doks.add(dok);
        if (Number.isFinite(band)) bands.add(band);
        if (Number.isFinite(dok) && Number.isFinite(band)) {
          pairs.add(pairKey(dok, band));
          if (dok === 3 && band === 4) {
            challengeFamilies.push({
              familyId: doc.familyId,
              id: doc.id,
              variant: variant?.coverageKey || variant?.id || null,
              taskType: variant?.taskType ?? doc.taskType ?? null,
              representation: variant?.representation ?? doc.representation ?? null,
            });
          }
        }
      }
    }

    const missingTargets = TARGETS
      .map(([dok, band]) => pairKey(dok, band))
      .filter((pair) => !pairs.has(pair));

    return {
      course,
      standard: entry.standard,
      file: name,
      pairCount: pairs.size,
      pairs: [...pairs].sort(),
      doks: [...doks].sort((a,b)=>a-b),
      difficultyBands: [...bands].sort((a,b)=>a-b),
      challengeReady: pairs.has('3:4'),
      challengeFamilies,
      independentAxisReady: missingTargets.length === 0,
      missingTargets,
    };
  });

  const missingTargetCounts = Object.fromEntries(
    TARGETS.map(([dok, band]) => {
      const pair = pairKey(dok, band);
      return [pair, rows.filter((row) => row.missingTargets.includes(pair)).length];
    }),
  );

  return {
    course,
    standards: rows.length,
    challengeReady: rows.filter((row) => row.challengeReady).length,
    challengeMissing: rows.filter((row) => !row.challengeReady).length,
    independentAxisReady: rows.filter((row) => row.independentAxisReady).length,
    independentAxisMissing: rows.filter((row) => !row.independentAxisReady).length,
    missingTargetCounts,
    missingChallengeStandards: rows.filter((row) => !row.challengeReady).map((row) => row.standard),
    rows,
  };
};

const algebra1 = readCourse('Algebra I', 'drafts/fidelity-v2/algebra1');
const algebra2 = readCourse('Algebra II', 'drafts/fidelity-v2/algebra2');

const combined = {
  generatedAt: new Date().toISOString(),
  targetCells: TARGETS.map(([dok,band]) => pairKey(dok,band)),
  interpretation: {
    challengeCell: '3:4',
    note: 'This audit checks metadata coverage. A later qualitative pass must still verify that each DOK 3 / Band 4 family is an authentic extension rather than merely harder arithmetic.',
  },
  algebra1,
  algebra2,
};

const printCourse = (result) => {
  console.log('\n=== ' + result.course + ' ===');
  console.log('standards=' + result.standards);
  console.log('challenge_ready=' + result.challengeReady + '/' + result.standards);
  console.log('independent_axis_ready=' + result.independentAxisReady + '/' + result.standards);
  console.log('missing_target_counts=' + JSON.stringify(result.missingTargetCounts));
  console.log('missing_challenge=' + (result.missingChallengeStandards.join(',') || 'NONE'));

  console.log('\n' + result.course + ' standards missing adaptive target cells:');
  for (const row of result.rows.filter((item) => !item.independentAxisReady)) {
    console.log(
      row.standard +
      '\tpairs=' + row.pairs.join(',') +
      '\tmissing=' + row.missingTargets.join(',') +
      '\tchallenge=' + (row.challengeReady ? 'YES' : 'NO')
    );
  }
};

printCourse(algebra1);
printCourse(algebra2);

console.log('\n=== MACHINE_JSON_START ===');
console.log(JSON.stringify(combined));
console.log('=== MACHINE_JSON_END ===');

const strict = process.argv.includes('--strict');
if (strict) {
  const failures = [algebra1, algebra2].flatMap((result) =>
    result.rows.filter((row) => !row.independentAxisReady || !row.challengeReady)
  );
  if (failures.length) {
    console.error('Strict adaptive-content audit failed for ' + failures.length + ' standards.');
    process.exit(1);
  }
}
