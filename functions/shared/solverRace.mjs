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

// These are instructional structures, not a question bank.  The concrete relation is a
// readable exemplar used by authoring/tests; every issued race round is instantiated by
// generateSolverRaceQuestion below from its server-owned seed.
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
export const seededSolverRaceIndex = (seed, length) => length > 0 ? hash(seed) % length : 0;

/* Retired in favour of construct-from-solution generation.  Keep generation in this
 * server-shared module so issue, reconnect, grading, dry-run and replay cannot disagree. */
const seededDraw = (seedKey) => {
  let state = hash(seedKey) || 0x9e3779b9;
  const next = () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return state >>> 0;
  };
  const int = (low, high) => low + (next() % (high - low + 1));
  const pick = (values) => values[next() % values.length];
  const signed = (magnitudeLow = 1, magnitudeHigh = 9) => pick([-1, 1]) * int(magnitudeLow, magnitudeHigh);
  return { int, pick, signed };
};

const add = (left, value) => `${left}${value < 0 ? '' : '+'}${value}`;
const subCenter = (variable, center) => center < 0 ? `${variable}+${-center}` : `${variable}-${center}`;
const relation = (variable, operator, value) => `${variable} ${operator} ${value}`;
const reverseInequality = (operator) => ({ '<': '>', '<=': '>=', '>': '<', '>=': '<=' })[operator];

const renameLiteral = (question, draw) => {
  const sets = [
    { x: 'n', y: 'q', a: 'k', b: 'd', c: 'm', P: 'T', L: 'r', W: 's' },
    { x: 'u', y: 'v', a: 'p', b: 'h', c: 'j', P: 'C', L: 'd', W: 'w' },
    { x: 'z', y: 't', a: 'g', b: 'r', c: 'f', P: 'K', L: 'm', W: 'n' },
  ];
  const names = draw.pick(sets);
  const rename = (value) => String(value).replace(/[A-Za-z]+/g, (token) => names[token] || token);
  const solveFor = names[question.solveFor] || question.solveFor;
  return {
    ...question, equation: rename(question.equation), equationLatex: rename(question.equationLatex),
    expectedFinalRelation: rename(question.expectedFinalRelation), solveFor, variable: solveFor,
    prompt: `Solve for ${solveFor} using the algebra workspace.`,
    objective: { ...question.objective, variable: solveFor },
  };
};

/** Deterministically instantiate one authored structure from a server-owned seed. */
export const generateSolverRaceQuestion = (structure, seedKey) => {
  const draw = seededDraw(`${seedKey}|procedural-v1`);
  const key = structure.id.replace(`solverRace_${structure.challengeFamily}_`, '');
  if (structure.challengeFamily === 'literalEquation') return renameLiteral(structure, draw);

  const x = draw.signed(2, 12);
  let equation;
  let expectedFinalRelation;
  const solved = () => { expectedFinalRelation = `x = ${x}`; };

  if (structure.challengeFamily === 'linearEquation') {
    solved();
    if (key === 'add') { const c = draw.int(2, 12); equation = `x+${c} = ${x + c}`; }
    if (key === 'subtract') { const c = draw.int(2, 12); equation = `x-${c} = ${x - c}`; }
    if (key === 'multiply') { const a = draw.int(2, 9); equation = `${a}*x = ${a * x}`; }
    if (key === 'divide') { const d = draw.int(2, 9); equation = `x/${d} = ${x}/${d}`; }
    if (key === 'two_step') { const a = draw.int(2, 8), b = draw.signed(2, 10); equation = `${add(`${a}*x`, b)} = ${a * x + b}`; }
    if (key === 'negative_coefficient') { const a = -draw.int(2, 8), b = draw.signed(2, 10); equation = `${add(`${a}*x`, b)} = ${a * x + b}`; }
    if (key === 'both_sides') {
      const b = draw.int(1, 5), a = b + draw.int(2, 6), c = draw.signed(2, 12), d = (a - b) * x + c;
      equation = `${add(`${a}*x`, c)} = ${add(`${b}*x`, d)}`;
    }
    if (key === 'signed_both_sides') {
      // Preserve the authored challenge: a visible negative variable term on
      // one side and a positive variable term on the other. Neither side may
      // collapse to 0*x, and the coefficients can never cancel each other.
      const a = -draw.int(2, 7), b = draw.int(1, 5), c = draw.signed(2, 12), d = (a - b) * x + c;
      equation = `${add(`${a}*x`, c)} = ${add(`${b}*x`, d)}`;
    }
    if (key === 'distribution' || key === 'negative_distribution') {
      const a = (key === 'negative_distribution' ? -1 : 1) * draw.int(2, 6), h = draw.signed(2, 7), b = draw.signed(2, 9);
      equation = `${add(`${a}*(${subCenter('x', h)})`, b)} = ${a * (x - h) + b}`;
    }
    if (key === 'fraction') { const h = draw.signed(1, 7), d = draw.int(2, 7), b = draw.signed(1, 6); equation = `(${subCenter('x', h)})/${d}${b < 0 ? '' : '+'}${b} = ${(x - h)}/${d}${b < 0 ? '' : '+'}${b}`; }
    if (key === 'multi_operation') {
      const outer = draw.int(2, 5), inner = draw.int(2, 4), h = draw.signed(1, 6), b = draw.signed(1, 7);
      let right = draw.int(1, 5);
      // If the distributed coefficient equals the right-side coefficient, the
      // constructed equation becomes an identity instead of having one solution.
      if (right === outer * inner) right = right === 5 ? 1 : right + 1;
      const constant = outer * (inner * x - h) + b - right * x;
      equation = `${add(`${outer}*(${add(`${inner}*x`, -h)})`, b)} = ${add(`${right}*x`, constant)}`;
    }
    if (key === 'distributed_both_sides') {
      const a = draw.int(3, 6), b = draw.int(1, a - 1), h = draw.signed(1, 5), k = draw.signed(1, 5), c = draw.signed(1, 6);
      const d = a * (x + h) + c - b * (x + k);
      equation = `${add(`${a}*(x${h < 0 ? '' : '+'}${h})`, c)} = ${add(`${b}*(x${k < 0 ? '' : '+'}${k})`, d)}`;
    }
    if (key === 'fraction_both_sides') {
      const p = draw.int(2, 6);
      let q = draw.int(2, 6);
      // Equal denominators with matching offsets reduce to an identity. Force
      // distinct denominators before constructing the second numerator.
      if (q === p) q = p === 6 ? 5 : p + 1;
      const h = draw.signed(1, 7);
      const k = q * (x + h) / p - x;
      if (Number.isInteger(k)) equation = `(x${h < 0 ? '' : '+'}${h})/${p} = (x${k < 0 ? '' : '+'}${k})/${q}`;
      else { const qq = p + 1; const kk = qq * (x + h) - p * x; equation = `(x${h < 0 ? '' : '+'}${h})/${p} = (${p}*x${kk < 0 ? '' : '+'}${kk})/${p * qq}`; }
    }
  }

  if (structure.challengeFamily === 'linearInequality') {
    const op = draw.pick(['<', '<=', '>', '>=']);
    if (key === 'one_add' || key === 'one_subtract') { const c = draw.int(2, 10) * (key === 'one_add' ? 1 : -1); equation = `${add('x', c)} ${op} ${x + c}`; expectedFinalRelation = relation('x', op, x); }
    if (key === 'positive_coefficient' || key === 'two_step') { const a = draw.int(2, 7), b = key === 'two_step' ? draw.signed(2, 9) : 0; equation = `${add(`${a}*x`, b)} ${op} ${a * x + b}`; expectedFinalRelation = relation('x', op, x); }
    if (key === 'negative_flip') { const a = -draw.int(2, 7), b = draw.signed(1, 9); equation = `${add(`${a}*x`, b)} ${op} ${a * x + b}`; expectedFinalRelation = relation('x', reverseInequality(op), x); }
    if (key === 'both_sides') { const b = draw.int(1, 5), a = b + draw.int(2, 6), c = draw.signed(1, 8), d = (a - b) * x + c; equation = `${add(`${a}*x`, c)} ${op} ${add(`${b}*x`, d)}`; expectedFinalRelation = relation('x', op, x); }
    if (key === 'compound') { const low = x - draw.int(2, 7), high = x + draw.int(2, 7), a = draw.int(2, 5), b = draw.signed(1, 6); equation = `${a * low + b} < ${add(`${a}*x`, b)} <= ${a * high + b}`; expectedFinalRelation = `${low} < x <= ${high}`; }
    if (key === 'fraction_negative') {
      const d = draw.int(2, 6), rhs = draw.signed(2, 8), c = x + d * rhs;
      // Construct from an integer right-hand side so students never receive a
      // binary floating-point tail such as 1.3333333333333333.
      equation = `(${c}-x)/${d} >= ${rhs}`;
      expectedFinalRelation = `x <= ${x}`;
    }
  }

  if (structure.challengeFamily === 'absoluteValueEquation' || structure.challengeFamily === 'absoluteValueInequality') {
    // The catalog's basic absolute-value equation and open AND inequality are
    // centered at zero. Other structures intentionally translate the center.
    const center = ['basic', 'and_open'].includes(key) ? 0 : draw.signed(1, 9);
    const radius = draw.int(2, 9), inner = draw.int(2, 5);
    const innerText = `${inner}*x${-inner * center < 0 ? '' : '+'}${-inner * center}`;
    const endpoints = [`${center - radius}`, `${center + radius}`];
    const absolute = key === 'basic' || key === 'and_open' ? '|x|' : `|${key === 'negative_inside' ? `${inner * center}-${inner}*x` : (['inside_coefficient', 'or_closed', 'none'].includes(key) ? innerText : subCenter('x', center))}|`;
    if (structure.challengeFamily === 'absoluteValueEquation') {
      if (key === 'no_solution') { equation = `${draw.int(1, 4)}*|${subCenter('x', center)}|+${draw.int(1, 5)} = -${draw.int(1, 8)}`; expectedFinalRelation = 'no solution'; }
      else {
        const effectiveRadius = ['inside_coefficient', 'negative_inside'].includes(key) ? inner * radius : radius;
        if (key === 'outside_coefficient') { const outside = draw.int(2, 5); equation = `${outside}*${absolute} = ${outside * radius}`; }
        else if (key === 'isolate_first') { const outside = draw.int(2, 5), shift = draw.signed(1, 6); equation = `${add(`${outside}*${absolute}`, shift)} = ${outside * radius + shift}`; }
        else if (key === 'fraction') equation = `|(${subCenter('x', center)})/${inner}| = ${radius}/${inner}`;
        else equation = `${absolute} = ${effectiveRadius}`;
        expectedFinalRelation = `x = ${endpoints[0]} OR x = ${endpoints[1]}`;
      }
    } else {
      if (key === 'all_real') { equation = `${absolute} >= -${draw.int(1, 8)}`; expectedFinalRelation = 'all real numbers'; }
      else if (key === 'none') { equation = `${absolute} < -${draw.int(1, 8)}`; expectedFinalRelation = 'no solution'; }
      else {
        const isAnd = ['and_open', 'and_closed', 'isolate_and'].includes(key);
        const op = isAnd ? (key === 'and_closed' ? '<=' : '<') : (key === 'or_closed' || key === 'isolate_or' ? '>=' : '>');
        const effectiveRadius = key === 'or_closed' ? inner * radius : radius;
        if (key === 'isolate_and' || key === 'isolate_or') { const outside = draw.int(2, 5), shift = draw.signed(1, 6); equation = `${add(`${outside}*${absolute}`, shift)} ${op} ${outside * radius + shift}`; }
        else equation = `${absolute} ${op} ${effectiveRadius}`;
        const leftOp = isAnd ? op : reverseInequality(op);
        expectedFinalRelation = isAnd ? `${endpoints[0]} ${leftOp} x ${op} ${endpoints[1]}` : `x ${leftOp} ${endpoints[0]} OR x ${op} ${endpoints[1]}`;
      }
    }
  }
  if (!equation || !expectedFinalRelation) throw new Error(`Unsupported Solver Race structure: ${structure.id}`);
  return { ...structure, equation, equationLatex: equation, expectedFinalRelation };
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
      const question = generateSolverRaceQuestion(entry, `${seed}|${entry.id}|${roundIndex}`);
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
    const question = generateSolverRaceQuestion(selected, `${seed}|${selected.id}|${roundIndex}`);
    return { ...question, id: `${question.id}_r${roundIndex + 1}`, solverRaceRound: roundIndex, solverRaceStage: desired };
  });
};
