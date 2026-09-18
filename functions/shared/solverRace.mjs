export const SOLVER_RACE_FAMILIES = Object.freeze([
  'literalEquation', 'linearInequality', 'absoluteValueEquation', 'absoluteValueInequality',
]);

export const SOLVER_RACE_FOCUS = Object.freeze(['mixed', ...SOLVER_RACE_FAMILIES]);
export const DIFFICULTY_BANDS = Object.freeze(['foundation', 'developing', 'advanced', 'challenge']);

export const canonicalChallengeMode = (value) => value === 'solverRace' ? 'solverRace' : 'standard';
export const canonicalSolverRaceFocus = (value) => SOLVER_RACE_FOCUS.includes(value) ? value : 'mixed';

const q = (id, family, band, depth, equation, solveFor, expectedFinalRelation, operationTags, complexityTags = []) => ({
  id: `solverRace_${family}_${id}`,
  familyId: `solverRace_${family}_${id}`,
  type: 'stepAlgebra', pathToolId: 'stepAlgebra', active: true, courseId: 'algebra1',
  prompt: `Solve for ${solveFor} using the algebra workspace.`, equation, equationLatex: equation,
  variable: solveFor, solveFor, objective: { kind: 'isolate', variable: solveFor, simplifyRequired: false },
  workspaceDifficulty: band === 'foundation' ? 2 : 3,
  challengeFamily: family, difficultyBand: band, solutionDepth: depth,
  operationTags, complexityTags, expectedFinalRelation,
  solverGrader: family,
});

// Eight genuinely different structures per family. Values are concrete because a whole
// room must race on the same mathematics; selection rotates structures by a server seed.
export const SOLVER_RACE_CATALOG = Object.freeze([
  q('subtract_a','literalEquation','foundation',1,'y = x + a','x','x = y - a',['subtract']),
  q('add_a','literalEquation','foundation',1,'y = x - a','x','x = y + a',['add']),
  q('divide_a','literalEquation','foundation',1,'y = a*x','x','x = y/a',['divide']),
  q('multiply_a','literalEquation','foundation',1,'y = x/a','x','x = a*y',['multiply'],['fractionCoefficient']),
  q('two_step','literalEquation','developing',2,'y = a*x + b','x','x = (y-b)/a',['subtract','divide']),
  q('grouped','literalEquation','developing',2,'y = a*(x+b)','x','x = y/a-b',['divide','subtract'],['parentheses']),
  q('invisible_negative','literalEquation','advanced',2,'y = b-x','x','x = b-y',['subtract','divide'],['negativeUnitCoefficient']),
  q('negative_multi','literalEquation','advanced',2,'y = b-a*x','x','x = (b-y)/a',['subtract','divide'],['negativeCoefficient']),
  q('perimeter','literalEquation','advanced',2,'P = 2*L+2*W','W','W = (P-2*L)/2',['subtract','divide'],['multipleParameters']),
  q('fraction_group','literalEquation','challenge',3,'y = (a*x-b)/c','x','x = (c*y+b)/a',['multiply','add','divide'],['fractionCoefficient','multipleParameters']),

  q('one_add','linearInequality','foundation',1,'x+4 < 9','x','x < 5',['subtract']),
  q('one_subtract','linearInequality','foundation',1,'x-3 >= 5','x','x >= 8',['add']),
  q('positive_coefficient','linearInequality','foundation',1,'3*x <= 18','x','x <= 6',['divide']),
  q('two_step','linearInequality','developing',2,'2*x+3 > 11','x','x > 4',['subtract','divide']),
  q('negative_flip','linearInequality','developing',2,'-3*x+2 <= 14','x','x >= -4',['subtract','divide'],['negativeDivisionFlip']),
  q('both_sides','linearInequality','advanced',2,'5*x-7 > 2*x+8','x','x > 5',['subtract','divide'],['variablesBothSides']),
  q('compound','linearInequality','advanced',2,'-3 < 2*x+1 <= 9','x','-2 < x <= 4',['subtract','divide'],['compoundRelation']),
  q('fraction_negative','linearInequality','challenge',3,'(2-x)/3 >= 4','x','x <= -10',['multiply','subtract'],['fractionCoefficient','negativeDivisionFlip']),

  q('basic','absoluteValueEquation','foundation',1,'|x| = 6','x','x = -6 OR x = 6',['split'],['absoluteValueSplit']),
  q('translated','absoluteValueEquation','foundation',2,'|x-3| = 5','x','x = -2 OR x = 8',['split','add'],['absoluteValueSplit']),
  q('inside_coefficient','absoluteValueEquation','developing',2,'|2*x+1| = 7','x','x = -4 OR x = 3',['split','subtract','divide'],['absoluteValueSplit']),
  q('outside_coefficient','absoluteValueEquation','developing',3,'3*|x-2| = 12','x','x = -2 OR x = 6',['divide','split','add'],['absoluteValueSplit']),
  q('isolate_first','absoluteValueEquation','developing',3,'2*|x+1|-4 = 8','x','x = -7 OR x = 5',['add','divide','split'],['absoluteValueSplit']),
  q('negative_inside','absoluteValueEquation','advanced',3,'|3-2*x| = 9','x','x = -3 OR x = 6',['split','subtract','divide'],['absoluteValueSplit','negativeCoefficient']),
  q('fraction','absoluteValueEquation','advanced',3,'|(x-1)/2| = 4','x','x = -7 OR x = 9',['split','multiply','add'],['absoluteValueSplit','fractionCoefficient']),
  q('no_solution','absoluteValueEquation','challenge',2,'2*|x+3|+1 = -5','x','no solution',['subtract','divide'],['noSolution']),

  q('and_open','absoluteValueInequality','foundation',2,'|x| < 5','x','-5 < x < 5',['split'],['andBranching','compoundRelation']),
  q('and_closed','absoluteValueInequality','foundation',2,'|x-2| <= 4','x','-2 <= x <= 6',['split','add'],['andBranching','compoundRelation']),
  q('or_open','absoluteValueInequality','developing',2,'|x+1| > 3','x','x < -4 OR x > 2',['split','subtract'],['orBranching','unboundedSolution']),
  q('or_closed','absoluteValueInequality','developing',2,'|2*x-1| >= 5','x','x <= -2 OR x >= 3',['split','add','divide'],['orBranching','unboundedSolution']),
  q('isolate_and','absoluteValueInequality','developing',3,'2*|x-3|+1 < 9','x','-1 < x < 7',['subtract','divide','split'],['andBranching','compoundRelation']),
  q('isolate_or','absoluteValueInequality','advanced',3,'3*|x+2|-4 >= 8','x','x <= -6 OR x >= 2',['add','divide','split'],['orBranching','unboundedSolution']),
  q('all_real','absoluteValueInequality','advanced',2,'|x-4| >= -2','x','all real numbers',['classify'],['allRealNumbers']),
  q('none','absoluteValueInequality','challenge',2,'|2*x+1| < -3','x','no solution',['classify'],['noSolution']),
]);

export const solverRaceCatalogCounts = () => Object.fromEntries(SOLVER_RACE_FAMILIES.map((family) => [
  family, SOLVER_RACE_CATALOG.filter((entry) => entry.challengeFamily === family).length,
]));

export const solverRaceFamilyPlan = (roundCount, focus = 'mixed') => {
  const count = Math.max(3, Math.min(20, Math.round(Number(roundCount) || 10)));
  const selected = canonicalSolverRaceFocus(focus);
  if (selected !== 'mixed') return Array(count).fill(selected);
  // Largest-remainder distribution preserves the 3/3/2/2 ten-round intent.
  const weights = [3, 3, 2, 2];
  const raw = weights.map((weight) => count * weight / 10);
  const allocations = raw.map(Math.floor);
  while (allocations.reduce((a, b) => a + b, 0) < count) {
    const index = raw.map((value, i) => value - allocations[i]).reduce((best, value, i, all) => value > all[best] ? i : best, 0);
    allocations[index] += 1;
  }
  return SOLVER_RACE_FAMILIES.flatMap((family, index) => Array(allocations[index]).fill(family));
};

export const difficultyPlan = (roundCount) => Array.from({ length: roundCount }, (_, index) => {
  const progress = (index + 1) / roundCount;
  if (progress <= .4) return 'foundation';
  if (progress <= .7) return 'developing';
  if (progress < 1) return 'advanced';
  return 'challenge';
});

const hash = (value) => [...String(value)].reduce((total, char) => ((total * 33) ^ char.charCodeAt(0)) >>> 0, 5381);

export const planSolverRace = ({ roundCount = 10, focus = 'mixed', seed = '' } = {}) => {
  const families = solverRaceFamilyPlan(roundCount, focus);
  const bands = difficultyPlan(families.length);
  const used = new Map();
  return families.map((family, roundIndex) => {
    const desired = bands[roundIndex];
    const familyPool = SOLVER_RACE_CATALOG.filter((entry) => entry.challengeFamily === family);
    const exact = familyPool.filter((entry) => entry.difficultyBand === desired);
    const pool = exact.length ? exact : familyPool;
    const occurrence = used.get(family) || 0;
    used.set(family, occurrence + 1);
    const question = pool[(hash(`${seed}|${family}|${roundIndex}`) + occurrence) % pool.length];
    return { ...question, id: `${question.id}_r${roundIndex + 1}`, solverRaceRound: roundIndex, solverRaceStage: desired };
  });
};
