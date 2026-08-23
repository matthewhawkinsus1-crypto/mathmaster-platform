/*
 * WHAT KIND OF THINKING IS THIS CLASS ACTUALLY DOING?
 *
 * The platform has tracked DOK and difficulty as independent axes everywhere
 * for a while, and no teacher screen has ever shown the class-level picture. It
 * is the question a department head asks and a gradebook cannot answer: are my
 * students failing because the numbers are hard, or because they cannot say
 * what the question is asking?
 *
 * TWO AXES, NEVER COLLAPSED.
 *
 *   difficultyBand — structural complexity. How much machinery the question has.
 *   dok            — cognitive demand. What kind of thinking it asks for.
 *
 * They are independent by design: a DOK 3 question can be structurally simple,
 * and a DOK 1 question can be a slog. Averaging them into one "rigor score"
 * would destroy the only distinction that tells a teacher which lever to pull,
 * so nothing here produces such a number.
 *
 *   "Do not diagnose from tiny samples. Always expose evidence confidence."
 *
 * Every cell carries the evidence it rests on, and cells below the floor are
 * returned marked rather than dropped. Dropping them would leave a tidy grid
 * that quietly implies "no evidence here means nothing to see", when the true
 * statement is usually "this class has barely been asked to do this".
 */

const list = (value) => (Array.isArray(value) ? value : []);

export const CONFIDENCE = Object.freeze({
  NONE: 'none',
  THIN: 'thin',
  ADEQUATE: 'adequate',
});

export const CONFIDENCE_LABEL = Object.freeze({
  [CONFIDENCE.NONE]: 'No evidence',
  [CONFIDENCE.THIN]: 'Too little to diagnose',
  [CONFIDENCE.ADEQUATE]: 'Enough to act on',
});

export const DEMAND_THRESHOLDS = Object.freeze({
  // Attempts across the class before a cell is worth reading at all.
  minAttempts: 25,
  // And enough students that it is not one child's bad afternoon.
  minStudents: 5,
  strugglingAccuracy: 0.55,
  strongAccuracy: 0.8,
});

const confidenceFor = ({ attempts, students }) => {
  if (!attempts) return CONFIDENCE.NONE;
  if (attempts < DEMAND_THRESHOLDS.minAttempts || students < DEMAND_THRESHOLDS.minStudents) {
    return CONFIDENCE.THIN;
  }
  return CONFIDENCE.ADEQUATE;
};

const emptyCell = (key) => ({
  key, attempts: 0, students: 0, accuracy: null, confidence: CONFIDENCE.NONE,
});

const rollUp = (students, profilesByStudentId, axis) => {
  const cells = {};
  list(students).forEach((student) => {
    const profile = profilesByStudentId[student.id] || null;
    const source = axis === 'dok' ? profile?.dokProfile : profile?.difficultyProfile?.byBand;
    if (!source) return;
    Object.entries(source).forEach(([key, bucket]) => {
      const attempts = Number(bucket?.attempts) || 0;
      const accuracy = Number(bucket?.accuracy);
      if (!attempts || !Number.isFinite(accuracy)) return;
      if (!cells[key]) cells[key] = { key, attempts: 0, correct: 0, students: 0 };
      cells[key].attempts += attempts;
      cells[key].correct += accuracy * attempts;
      cells[key].students += 1;
    });
  });
  return cells;
};

/**
 * The class's cognitive-demand picture, one cell per authored DOK level.
 *
 * Levels 1-3 are always returned, including the ones with nothing in them,
 * because "this class has never been asked a DOK 3 question" is the single most
 * useful thing this view can tell a teacher and it is invisible in any
 * representation that only draws what exists.
 */
export const classDemandProfile = ({ students = [], profilesByStudentId = {} } = {}) => {
  const raw = rollUp(students, profilesByStudentId, 'dok');
  return [1, 2, 3].map((level) => {
    const cell = raw[String(level)];
    if (!cell) return { ...emptyCell(String(level)), dok: level };
    const accuracy = cell.attempts ? cell.correct / cell.attempts : null;
    return {
      key: String(level),
      dok: level,
      attempts: cell.attempts,
      students: cell.students,
      accuracy,
      confidence: confidenceFor(cell),
    };
  });
};

/** The same, for structural complexity. Bands 1-4 are what the bank authors. */
export const classDifficultyProfile = ({ students = [], profilesByStudentId = {} } = {}) => {
  const raw = rollUp(students, profilesByStudentId, 'band');
  return [1, 2, 3, 4].map((band) => {
    const cell = raw[String(band)];
    if (!cell) return { ...emptyCell(String(band)), band };
    const accuracy = cell.attempts ? cell.correct / cell.attempts : null;
    return {
      key: String(band),
      band,
      attempts: cell.attempts,
      students: cell.students,
      accuracy,
      confidence: confidenceFor(cell),
    };
  });
};

/**
 * The sentences worth saying about those two grids, and no others.
 *
 * This is where the restraint lives. A grid of twelve numbers invites a teacher
 * to find a pattern in noise; these are the small number of patterns that are
 * actually diagnostic, each stated only when the evidence supports it.
 */
export const demandFindings = ({ demand = [], difficulty = [] } = {}) => {
  const findings = [];
  const byDok = Object.fromEntries(demand.map((cell) => [cell.dok, cell]));
  const usable = (cell) => cell && cell.confidence === CONFIDENCE.ADEQUATE;

  // NEVER ASKED. The most valuable and most easily hidden finding: a class
  // cannot be weak at reasoning it has not been asked for, and no amount of
  // staring at accuracy figures reveals an absence.
  const neverAsked = demand.filter((cell) => cell.attempts === 0);
  if (neverAsked.length) {
    findings.push({
      kind: 'coverage',
      headline: `No DOK ${neverAsked.map((cell) => cell.dok).join(' or ')} evidence at all`,
      detail: 'This class has not been asked for that kind of thinking, so nothing here can say whether they can do it. That is an assignment-design finding, not a student one.',
      confidence: CONFIDENCE.NONE,
    });
  }

  // CAN COMPUTE, CANNOT REASON — at class scale. The same shape as the
  // individual finding, and the one that most often means the lesson rather
  // than the students.
  if (usable(byDok[1]) && usable(byDok[2])
    && byDok[1].accuracy >= DEMAND_THRESHOLDS.strongAccuracy
    && byDok[2].accuracy < DEMAND_THRESHOLDS.strugglingAccuracy) {
    findings.push({
      kind: 'reasoningGap',
      headline: 'The class is fluent at procedure and struggling at reasoning',
      detail: `${Math.round(byDok[1].accuracy * 100)}% at DOK 1 against ${Math.round(byDok[2].accuracy * 100)}% at DOK 2, across ${byDok[2].attempts} attempts. A class-wide gap this shape is usually about how the work is being introduced rather than about the students.`,
      confidence: CONFIDENCE.ADEQUATE,
    });
  }

  // The inverse, which is rarer and much easier to miss: reasoning is fine and
  // the arithmetic is failing underneath it.
  const hardBands = difficulty.filter((cell) => cell.band >= 3 && cell.confidence === CONFIDENCE.ADEQUATE);
  const easyBands = difficulty.filter((cell) => cell.band <= 2 && cell.confidence === CONFIDENCE.ADEQUATE);
  if (hardBands.length && easyBands.length) {
    const hardAccuracy = hardBands.reduce((sum, cell) => sum + cell.accuracy * cell.attempts, 0)
      / hardBands.reduce((sum, cell) => sum + cell.attempts, 0);
    const easyAccuracy = easyBands.reduce((sum, cell) => sum + cell.accuracy * cell.attempts, 0)
      / easyBands.reduce((sum, cell) => sum + cell.attempts, 0);
    if (easyAccuracy < DEMAND_THRESHOLDS.strugglingAccuracy && hardAccuracy >= easyAccuracy) {
      findings.push({
        kind: 'foundationDrag',
        headline: 'Simpler questions are going worse than complex ones',
        detail: `${Math.round(easyAccuracy * 100)}% at the lower bands against ${Math.round(hardAccuracy * 100)}% higher up. That inversion almost always means a prerequisite skill rather than the current unit.`,
        confidence: CONFIDENCE.ADEQUATE,
      });
    }
  }

  // Everything thin is reported AS thin, once, rather than each cell silently
  // looking like a result.
  const thin = [...demand, ...difficulty].filter((cell) => cell.confidence === CONFIDENCE.THIN);
  if (thin.length) {
    findings.push({
      kind: 'thinEvidence',
      headline: `${thin.length} cell${thin.length === 1 ? '' : 's'} below the reporting threshold`,
      detail: `Fewer than ${DEMAND_THRESHOLDS.minAttempts} attempts or ${DEMAND_THRESHOLDS.minStudents} students. The numbers are shown because hiding them would imply there is nothing there, but they are not enough to diagnose from.`,
      confidence: CONFIDENCE.THIN,
    });
  }

  return findings;
};

export default classDemandProfile;
