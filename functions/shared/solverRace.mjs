export const SOLVER_RACE_FAMILIES = Object.freeze([
  'linearEquation', 'literalEquation', 'linearInequality', 'absoluteValueEquation', 'absoluteValueInequality',
]);

export const SOLVER_RACE_FOCUS = Object.freeze(['mixed', ...SOLVER_RACE_FAMILIES]);
export const DIFFICULTY_BANDS = Object.freeze(['foundation', 'developing', 'advanced', 'challenge']);
export const SOLVER_RACE_DIFFICULTIES = Object.freeze(['ramp', ...DIFFICULTY_BANDS]);

export const canonicalChallengeMode = (value) => value === 'solverRace' ? 'solverRace' : 'standard';
export const canonicalSolverRaceFocus = (value) => SOLVER_RACE_FOCUS.includes(value) ? value : 'mixed';
export const canonicalSolverRaceDifficulty = (value) => SOLVER_RACE_DIFFICULTIES.includes(value) ? value : 'ramp';

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
  q('add','linearEquation','foundation',1,'x+7 = 12','x','x = 5',['subtract']),
  q('subtract','linearEquation','foundation',1,'x-4 = 9','x','x = 13',['add']),
  q('multiply','linearEquation','foundation',1,'3*x = 18','x','x = 6',['divide']),
  q('divide','linearEquation','foundation',1,'x/4 = 3','x','x = 12',['multiply'],['fractionCoefficient']),
  q('two_step','linearEquation','developing',2,'3*x+5 = 20','x','x = 5',['subtract','divide']),
  q('negative_coefficient','linearEquation','developing',2,'-2*x+3 = 13','x','x = -5',['subtract','divide'],['negativeCoefficient']),
  q('both_sides','linearEquation','developing',2,'5*x-4 = 2*x+11','x','x = 5',['subtract','add','divide'],['variablesBothSides']),
  q('signed_both_sides','linearEquation','advanced',3,'7-3*x = 2*x-8','x','x = 3',['subtract','add','divide'],['variablesBothSides','negativeCoefficient']),
  q('distribution','linearEquation','advanced',3,'3*(x-2)+4 = 19','x','x = 7',['distribute','subtract','divide'],['parentheses']),
  q('negative_distribution','linearEquation','advanced',3,'-2*(x+3)+5 = 11','x','x = -6',['distribute','subtract','divide'],['parentheses','negativeCoefficient']),
  q('fraction','linearEquation','advanced',3,'(x-3)/4+2 = 5','x','x = 15',['subtract','multiply'],['fractionCoefficient']),
  q('multi_operation','linearEquation','challenge',4,'4*(2*x-3)+5 = 3*x+18','x','x = 5',['distribute','subtract','add','divide'],['variablesBothSides','parentheses']),
  q('distributed_both_sides','linearEquation','challenge',4,'3*(x+4)-2 = 2*(x-1)+17','x','x = 5',['distribute','subtract','add'],['variablesBothSides','parentheses']),
  q('fraction_both_sides','linearEquation','challenge',4,'(x+5)/3 = (x-1)/2','x','x = 13',['multiply','subtract','add'],['variablesBothSides','fractionCoefficient']),

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
  // Contiguous allocation preserves instructional family order, including for
  // short races, while largest remainders keep the distribution balanced.
  const weights = [1, 1, 1, 1, 1];
  const raw = weights.map((weight) => count * weight / weights.length);
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

const NUMERIC_VARIANTS = Object.freeze({
  solverRace_linearEquation_add: [['x+9 = 15', 'x = 6'], ['x+4 = 11', 'x = 7']],
  solverRace_linearEquation_subtract: [['x-6 = 8', 'x = 14'], ['x-9 = 3', 'x = 12']],
  solverRace_linearEquation_multiply: [['4*x = 28', 'x = 7'], ['5*x = 40', 'x = 8']],
  solverRace_linearEquation_divide: [['x/3 = 5', 'x = 15'], ['x/6 = 4', 'x = 24']],
  solverRace_linearEquation_two_step: [['4*x+3 = 27', 'x = 6'], ['2*x-5 = 9', 'x = 7']],
  solverRace_linearEquation_negative_coefficient: [['-3*x+4 = 19', 'x = -5'], ['-4*x-2 = 18', 'x = -5']],
  solverRace_linearEquation_both_sides: [['6*x-5 = 3*x+13', 'x = 6'], ['7*x+2 = 4*x+20', 'x = 6']],
  solverRace_linearEquation_signed_both_sides: [['8-2*x = 3*x-7', 'x = 3'], ['10-4*x = x-10', 'x = 4']],
  solverRace_linearEquation_distribution: [['2*(x-3)+5 = 17', 'x = 9'], ['4*(x+1)-3 = 25', 'x = 6']],
  solverRace_linearEquation_negative_distribution: [['-3*(x+2)+4 = 16', 'x = -6'], ['-2*(x-4)-3 = 11', 'x = -3']],
  solverRace_linearEquation_fraction: [['(x+1)/3+2 = 6', 'x = 11'], ['(x-2)/5-1 = 2', 'x = 17']],
  solverRace_linearEquation_multi_operation: [['3*(2*x-1)+4 = 2*x+21', 'x = 5'], ['5*(x-2)+3 = 2*x+14', 'x = 7']],
  solverRace_linearEquation_distributed_both_sides: [['4*(x+2)-3 = 2*(x-1)+15', 'x = 4'], ['5*(x-1)+2 = 3*(x+1)+6', 'x = 6']],
  solverRace_linearEquation_fraction_both_sides: [['(x+4)/2 = (x+10)/3', 'x = 8'], ['(x-2)/3 = (x-8)/2', 'x = 20']],
  solverRace_linearInequality_one_add: [['x+7 < 15', 'x < 8'], ['x+3 < 12', 'x < 9']],
  solverRace_linearInequality_one_subtract: [['x-6 >= 4', 'x >= 10'], ['x-8 >= -1', 'x >= 7']],
  solverRace_linearInequality_positive_coefficient: [['4*x <= 28', 'x <= 7'], ['5*x <= 40', 'x <= 8']],
  solverRace_linearInequality_two_step: [['3*x+2 > 17', 'x > 5'], ['4*x-3 > 21', 'x > 6']],
  solverRace_linearInequality_negative_flip: [['-4*x+1 <= 21', 'x >= -5'], ['-2*x-3 <= 9', 'x >= -6']],
  solverRace_linearInequality_both_sides: [['6*x-4 > 2*x+12', 'x > 4'], ['7*x+1 > 4*x+16', 'x > 5']],
  solverRace_linearInequality_compound: [['-5 < 2*x+1 <= 11', '-3 < x <= 5'], ['-8 <= 3*x+1 < 10', '-3 <= x < 3']],
  solverRace_linearInequality_fraction_negative: [['(3-x)/2 >= 5', 'x <= -7'], ['(4-x)/3 >= 4', 'x <= -8']],
  solverRace_absoluteValueEquation_basic: [['|x| = 8', 'x = -8 OR x = 8'], ['|x| = 11', 'x = -11 OR x = 11']],
  solverRace_absoluteValueEquation_translated: [['|x-4| = 6', 'x = -2 OR x = 10'], ['|x+2| = 5', 'x = -7 OR x = 3']],
  solverRace_absoluteValueEquation_inside_coefficient: [['|3*x-2| = 10', 'x = -8/3 OR x = 4'], ['|2*x-3| = 9', 'x = -3 OR x = 6']],
  solverRace_absoluteValueEquation_outside_coefficient: [['2*|x-3| = 10', 'x = -2 OR x = 8'], ['4*|x+1| = 20', 'x = -6 OR x = 4']],
  solverRace_absoluteValueEquation_isolate_first: [['3*|x-2|+1 = 16', 'x = -3 OR x = 7'], ['2*|x+3|-2 = 12', 'x = -10 OR x = 4']],
  solverRace_absoluteValueEquation_negative_inside: [['|5-2*x| = 11', 'x = -3 OR x = 8'], ['|4-3*x| = 10', 'x = -2 OR x = 14/3']],
  solverRace_absoluteValueEquation_fraction: [['|(x+2)/3| = 4', 'x = -14 OR x = 10'], ['|(x-3)/2| = 5', 'x = -7 OR x = 13']],
  solverRace_absoluteValueEquation_no_solution: [['3*|x-1|+2 = -4', 'no solution'], ['|2*x+5| = -1', 'no solution']],
  solverRace_absoluteValueInequality_and_open: [['|x| < 7', '-7 < x < 7'], ['|x| < 9', '-9 < x < 9']],
  solverRace_absoluteValueInequality_and_closed: [['|x-3| <= 5', '-2 <= x <= 8'], ['|x+2| <= 6', '-8 <= x <= 4']],
  solverRace_absoluteValueInequality_or_open: [['|x-2| > 4', 'x < -2 OR x > 6'], ['|x+3| > 5', 'x < -8 OR x > 2']],
  solverRace_absoluteValueInequality_or_closed: [['|2*x+1| >= 7', 'x <= -4 OR x >= 3'], ['|3*x-2| >= 10', 'x <= -8/3 OR x >= 4']],
  solverRace_absoluteValueInequality_isolate_and: [['2*|x-1|+3 < 13', '-4 < x < 6'], ['3*|x+2|-1 < 11', '-6 < x < 2']],
  solverRace_absoluteValueInequality_isolate_or: [['2*|x-3|-1 >= 9', 'x <= -2 OR x >= 8'], ['4*|x+1|+2 >= 18', 'x <= -5 OR x >= 3']],
  solverRace_absoluteValueInequality_all_real: [['|x+6| >= -1', 'all real numbers'], ['2*|x-1| >= -8', 'all real numbers']],
  solverRace_absoluteValueInequality_none: [['|3*x-2| < -1', 'no solution'], ['2*|x+4| <= -3', 'no solution']],
});

const varyQuestion = (question, seedKey) => {
  const choice = hash(seedKey);
  const variants = NUMERIC_VARIANTS[question.id];
  if (variants?.length) {
    const [equation, expectedFinalRelation] = variants[choice % variants.length];
    return { ...question, equation, equationLatex: equation, expectedFinalRelation };
  }
  if (question.challengeFamily === 'literalEquation' && choice % 2 === 1) {
    const names = { x: 'n', y: 'q', a: 'k', b: 'd', c: 'm', P: 'T', L: 'r', W: 's' };
    const rename = (value) => String(value).replace(/[A-Za-z]+/g, (token) => names[token] || token);
    const solveFor = names[question.solveFor] || question.solveFor;
    return {
      ...question, equation: rename(question.equation), equationLatex: rename(question.equationLatex),
      expectedFinalRelation: rename(question.expectedFinalRelation), solveFor, variable: solveFor,
      prompt: `Solve for ${solveFor} using the algebra workspace.`,
      objective: { ...question.objective, variable: solveFor },
    };
  }
  return question;
};

const compressedSequence = (pool, count) => Array.from({ length: count }, (_, index) => {
  if (count === 1) return pool[pool.length - 1];
  return pool[Math.round(index * (pool.length - 1) / (count - 1))];
});

export const planSolverRace = ({ roundCount = 10, focus = 'mixed', difficulty = 'ramp', seed = '' } = {}) => {
  const families = solverRaceFamilyPlan(roundCount, focus);
  const selectedDifficulty = canonicalSolverRaceDifficulty(difficulty);
  const bands = selectedDifficulty === 'ramp'
    ? difficultyPlan(families.length)
    : Array(families.length).fill(selectedDifficulty);
  const selectedFocus = canonicalSolverRaceFocus(focus);
  if (selectedFocus !== 'mixed') {
    const familyCatalog = SOLVER_RACE_CATALOG.filter((entry) => entry.challengeFamily === selectedFocus);
    const ordered = selectedDifficulty === 'ramp'
      ? familyCatalog
      : familyCatalog.filter((entry) => entry.difficultyBand === selectedDifficulty);
    const sequence = families.length === ordered.length
      ? ordered
      : compressedSequence(ordered, families.length);
    return sequence.map((entry, roundIndex) => {
      const question = varyQuestion(entry, `${seed}|${entry.id}|${roundIndex}`);
      return { ...question, id: `${entry.id}_r${roundIndex + 1}`, solverRaceRound: roundIndex, solverRaceStage: question.difficultyBand };
    });
  }
  const used = new Map();
  return families.map((family, roundIndex) => {
    const desired = bands[roundIndex];
    const familyPool = SOLVER_RACE_CATALOG.filter((entry) => entry.challengeFamily === family);
    const exact = familyPool.filter((entry) => entry.difficultyBand === desired);
    const pool = exact.length ? exact : familyPool;
    const occurrence = used.get(family) || 0;
    used.set(family, occurrence + 1);
    const selected = pool[(hash(`${seed}|${family}|${roundIndex}`) + occurrence) % pool.length];
    const question = varyQuestion(selected, `${seed}|${selected.id}|${roundIndex}`);
    return { ...question, id: `${question.id}_r${roundIndex + 1}`, solverRaceRound: roundIndex, solverRaceStage: desired };
  });
};
