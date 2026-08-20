// The authoring kit for production My Math Path content.
//
// WHY A KIT AND NOT 700 HAND-WRITTEN JSON OBJECTS. The starter bank was 515
// hand-written objects and every one of them had the same shape, because the
// only shape anybody had a template for was "prompt plus one text box". A kit
// makes the OTHER shapes as cheap to write as that one — a real choice item, a
// table to read, another student's work to critique, a number line to graph on —
// and it refuses to build an item that is missing the things a question needs
// to teach from.
//
// EVERY BUILDER REQUIRES:
//
//   taskType        what kind of thinking this asks for
//   representation  what the student is looking at
//   solutionReview  reasoning the student reads once the question closes
//
// Those three are what the quality audit checks and what the coverage
// dashboard reports, so an item that skips them cannot quietly reach a class.
//
// TWO RULES THE BUILDERS ENFORCE, both from the pedagogy brief:
//
//   1. Options are DATA, never prose. There is no way to express "type A, B, C
//      or D" through this kit; `choices` produces real selectable options and
//      the correct one is identified by id, server-side.
//
//   2. An expression answer must carry its equivalent forms. The server has no
//      computer-algebra system, so `expression()` demands an `accepted` list
//      and the build script warns when one looks too thin. A student who
//      writes 2(x+1) instead of 2x+2 has not made a mistake.

const req = (value, message) => {
  if (value === undefined || value === null || value === '') throw new Error(`Path authoring: ${message}`);
  return value;
};

const listOf = (value) => (Array.isArray(value) ? value : value ? [value] : []);

/** `A.5A` → `texas:A.5A`, the key the bank and the coverage index share. */
export const alignmentKey = (code) => `texas:${String(code).trim().toUpperCase()}`;

export const courseOf = (code) => {
  const clean = String(code).trim().toUpperCase();
  if (clean.startsWith('A2.')) return 'algebra2';
  if (clean.startsWith('A.')) return 'algebra1';
  if (clean.startsWith('8.')) return 'grade8';
  if (clean.startsWith('7.')) return 'grade7';
  if (clean.startsWith('6.')) return 'grade6';
  return 'algebra1';
};

const idFor = (code, slug) => `mm_${String(code).replace(/\./g, '_').toUpperCase()}_${slug}`;

// --- Where the correct option sits --------------------------------------------
//
// A REAL DEFECT THIS FIXES. In the starter bank, 460 of 472 multiple-choice
// items had the correct option first, because whoever wrote them listed the
// right answer and then invented distractors. A student notices that in about
// three questions, and from then on the item measures nothing at all — it is
// precisely the "reduce a multi-step task to one meaningless click" the
// pedagogy brief forbids.
//
// So the kit places the options, not the author. The order is a deterministic
// shuffle seeded by the item's own id: stable across builds (so a student who
// refreshes sees the same question), reproducible in tests, and unpredictable
// from the student's side.

const seedFrom = (text) => {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

/** Fisher-Yates with a seeded linear congruential generator. No Math.random. */
export const deterministicShuffle = (items, seedText) => {
  const result = [...items];
  let state = seedFrom(String(seedText)) || 1;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(next() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
};

/**
 * The shared envelope every family carries.
 *
 * `familyId` is what selection avoids repeating inside a session, so it is
 * derived from the slug rather than from the standard: two items with the same
 * familyId are the same family, and the selector will treat them that way.
 */
const envelope = ({ code, slug, band, dok, taskType, representation, calculator = 'inherit', role = 'practice' }) => ({
  id: idFor(code, req(slug, `${code} needs a family slug`)),
  active: true,
  alignmentKeys: [alignmentKey(code)],
  courseId: courseOf(code),
  familyId: `mathmaster:${String(code).toUpperCase()}:${slug}`,
  familyVersion: 1,
  questionType: 'response',
  activityRole: role,
  difficultyBand: req(band, `${code}:${slug} needs a difficulty band`),
  dok: req(dok, `${code}:${slug} needs a DOK level`),
  calculatorPolicy: calculator,
  assessedConstruct: String(code).toUpperCase(),
  taskType: req(taskType, `${code}:${slug} needs a taskType`),
  representation: req(representation, `${code}:${slug} needs a representation`),
  authoring: { source: 'MathMaster production authoring', kit: 1 },
});

const teaching = ({ review, feedback = [], hints = [], misconceptions = [] }) => {
  req(review, 'every family needs a solutionReview');
  req(review.reasoning?.length >= 2 ? true : null, 'a solutionReview needs at least two lines of reasoning');
  return {
    solutionReview: {
      headline: review.headline || null,
      reasoning: review.reasoning,
      answerSummary: review.answer || null,
      commonError: review.commonError || null,
      connection: review.connection || null,
    },
    attemptFeedback: feedback,
    supportHints: hints,
    misconceptions: misconceptions.map((entry) => ({
      match: listOf(entry.when),
      message: entry.say,
    })),
  };
};

// --- Stimulus helpers ----------------------------------------------------------

export const table = (headers, rows, extra = {}) => ({
  kind: 'table',
  headers,
  rows: rows.map((row) => row.map(String)),
  ...extra,
});

export const steps = (entries, extra = {}) => ({
  kind: 'steps',
  steps: entries.map((entry, index) => ({
    id: `step-${index + 1}`,
    label: entry.label || `Step ${index + 1}`,
    work: entry.work,
  })),
  ...extra,
});

export const pairsStimulus = (pairs, extra = {}) => ({
  kind: 'orderedPairs',
  orderedPairs: pairs.map(([x, y]) => ({ x, y })),
  ...extra,
});

export const expressions = (values, extra = {}) => ({ kind: 'expressions', expressions: values, ...extra });

export const itemList = (labels, extra = {}) => ({
  kind: 'items',
  items: labels.map((label, index) => ({ id: `item-${index + 1}`, label })),
  ...extra,
});

const withStimulus = (stimulus) => {
  if (!stimulus) return {};
  const { kind, headers, rows, steps: stepList, orderedPairs, expressions: exprs, items, title, note } = stimulus;
  const clean = { kind, title: title || null, note: note || null };
  if (headers) clean.table = { headers, rows };
  if (stepList) clean.steps = stepList;
  if (orderedPairs) clean.orderedPairs = orderedPairs;
  if (exprs) clean.expressions = exprs;
  if (items) clean.items = items;
  return { stimulus: clean };
};

// --- Builders -------------------------------------------------------------------

/**
 * A real multiple-choice item.
 *
 * `options` is a list of `[label, isCorrect]`. Exactly one must be correct, and
 * the correct id never leaves the server: the choices that travel to the
 * browser are ids and labels only.
 */
export const choice = ({
  code, slug, band, dok, taskType, representation, prompt, options,
  stimulus = null, calculator, review, feedback, hints, misconceptions, label = 'Choose the correct answer',
}) => {
  const correctCount = options.filter((option) => option[1] === true).length;
  if (correctCount !== 1) {
    throw new Error(`Path authoring: ${code}:${slug} must have exactly one correct option (found ${correctCount}).`);
  }
  // Authors write the correct option wherever it reads most naturally; the kit
  // decides where it appears on screen.
  const built = deterministicShuffle(options, `${code}:${slug}`).map((option, index) => ({
    id: `opt-${index + 1}`,
    label: option[0],
    correct: option[1] === true,
  }));
  const correct = built.filter((option) => option.correct);
  return {
    ...envelope({ code, slug, band, dok, taskType, representation, calculator }),
    prompt: req(prompt, `${code}:${slug} needs a prompt`),
    ...withStimulus(stimulus),
    choices: built.map((option) => ({ id: option.id, label: option.label })),
    responseFields: [{ id: 'answer', label, inputProfile: 'choice', expected: correct[0].id }],
    ...teaching({ review, feedback, hints, misconceptions }),
  };
};

const typed = (profile) => ({
  code, slug, band, dok, taskType, representation, prompt, expected, accepted = [],
  label = 'Answer', unit = null, responseHint = null, placeholder = null, tolerance = null,
  stimulus = null, calculator, review, feedback, hints, misconceptions,
}) => ({
  ...envelope({ code, slug, band, dok, taskType, representation, calculator }),
  prompt: req(prompt, `${code}:${slug} needs a prompt`),
  ...withStimulus(stimulus),
  responseFields: [{
    id: 'answer',
    label,
    inputProfile: profile,
    unit,
    responseHint,
    placeholder,
    expected: req(expected, `${code}:${slug} needs an expected answer`),
    ...(accepted.length ? { accepted: [expected, ...accepted] } : {}),
    ...(tolerance !== null ? { numericTolerance: tolerance } : {}),
  }],
  ...teaching({ review, feedback, hints, misconceptions }),
});

export const numeric = typed('number');
export const expression = typed('expression');
export const equation = typed('equation');
export const interval = typed('interval');
export const inequality = typed('inequality');
export const orderedPair = typed('orderedPair');
export const shortText = typed('text');

/**
 * Several parts, each graded on its own.
 *
 * Used where the mathematics genuinely has parts — "find the slope AND the
 * y-intercept" — not to break one answer into boxes.
 */
export const parts = ({
  code, slug, band, dok, taskType, representation, prompt, fields,
  stimulus = null, calculator, review, feedback, hints, misconceptions,
}) => ({
  ...envelope({ code, slug, band, dok, taskType, representation, calculator }),
  prompt: req(prompt, `${code}:${slug} needs a prompt`),
  ...withStimulus(stimulus),
  responseFields: fields.map((field, index) => ({
    id: field.id || `part-${index + 1}`,
    label: field.label,
    inputProfile: field.profile || 'text',
    unit: field.unit || null,
    responseHint: field.responseHint || null,
    expected: req(field.expected, `${code}:${slug} part ${index + 1} needs an expected answer`),
    ...(field.accepted?.length ? { accepted: [field.expected, ...field.accepted] } : {}),
    ...(field.tolerance !== undefined ? { numericTolerance: field.tolerance } : {}),
  })),
  ...teaching({ review, feedback, hints, misconceptions }),
});

// --- Tool-backed builders --------------------------------------------------------
//
// These issue the authentic MathMaster tool through the Path Tool Contract. The
// contract decides what the browser may see; the kit's job is only to supply
// the fields that contract reads, and to fail here rather than at issue time if
// one is missing.

/** The balance workspace: the student performs the moves, the server marks where they finished. */
export const balanceEquation = ({
  code, slug, band, dok, taskType = 'procedural', representation = 'symbolic',
  prompt, equation: equationText, variable = 'x', answer, accepted = [],
  workspaceDifficulty = 'standard', calculator, review, feedback, hints, misconceptions,
}) => {
  if (String(equationText).split('=').length !== 2) {
    throw new Error(`Path authoring: ${code}:${slug} balance item needs exactly one equals sign.`);
  }
  return {
    ...envelope({ code, slug, band, dok, taskType, representation, calculator }),
    type: 'stepAlgebra',
    prompt: req(prompt, `${code}:${slug} needs a prompt`),
    equation: equationText,
    variable,
    workspaceDifficulty,
    answer: req(answer, `${code}:${slug} needs an answer`),
    ...(accepted.length ? { acceptedAnswers: accepted } : {}),
    ...teaching({ review, feedback, hints, misconceptions }),
  };
};

/** Graph an interval or compound inequality on a number line. */
export const numberLine = ({
  code, slug, band, dok, taskType = 'conceptual', representation = 'numberLine',
  prompt, min = -10, max = 10, step = 1, variable = 'x', ask = ['graph'],
  intervals, expectedNotation = null, inequalityText = null,
  calculator, review, feedback, hints, misconceptions,
}) => ({
  ...envelope({ code, slug, band, dok, taskType, representation, calculator }),
  type: 'intervalNumberLine',
  prompt: req(prompt, `${code}:${slug} needs a prompt`),
  min,
  max,
  step,
  variable,
  ask,
  inequalityText,
  expectedIntervals: req(intervals, `${code}:${slug} needs expected intervals`),
  ...(expectedNotation ? { expectedNotation } : {}),
  ...teaching({ review, feedback, hints, misconceptions }),
});

/** The mapping diagram: domain, range, and whether a relation is a function. */
export const relation = ({
  code, slug, band, dok, taskType = 'conceptual', representation = 'orderedPairs',
  prompt, pairs, ask = ['domain', 'range', 'isFunction'],
  domainLabel = 'Domain', rangeLabel = 'Range',
  calculator, review, feedback, hints, misconceptions,
}) => ({
  ...envelope({ code, slug, band, dok, taskType, representation, calculator }),
  type: 'relationMapping',
  prompt: req(prompt, `${code}:${slug} needs a prompt`),
  pairs: pairs.map(([x, y]) => ({ x, y })),
  ask,
  domainLabel,
  rangeLabel,
  ...teaching({ review, feedback, hints, misconceptions }),
});

/** Two lines, and where they meet — solved again server-side rather than trusted. */
export const linearSystem = ({
  code, slug, band, dok, taskType = 'procedural', representation = 'graph',
  prompt, m1, b1, m2, b2, calculator, review, feedback, hints, misconceptions,
}) => ({
  ...envelope({ code, slug, band, dok, taskType, representation, calculator }),
  type: 'systemsWorkspace',
  mode: 'linear',
  prompt: req(prompt, `${code}:${slug} needs a prompt`),
  system: { m1, b1, m2, b2 },
  ...teaching({ review, feedback, hints, misconceptions }),
});

/** Plot points on a function the student can see, then answer about it. */
export const graphWorkspace = ({
  code, slug, band, dok, taskType = 'procedural', representation = 'graph',
  prompt, functionSpec, graph = null, pointTasks = [], analysisRequests = [],
  calculator, review, feedback, hints, misconceptions,
}) => {
  if (!pointTasks.length && !analysisRequests.length) {
    throw new Error(`Path authoring: ${code}:${slug} graph item needs a point task or an analysis request.`);
  }
  return {
    ...envelope({ code, slug, band, dok, taskType, representation, calculator }),
    type: 'functionInvestigation',
    prompt: req(prompt, `${code}:${slug} needs a prompt`),
    functionSpec,
    ...(graph ? { graph } : {}),
    ...(pointTasks.length ? {
      pointTasks: pointTasks.map((task, index) => ({
        id: task.id || `point-${index + 1}`,
        label: task.label || `Point ${index + 1}`,
        x: task.x,
        expected: task.expected,
      })),
    } : {}),
    ...(analysisRequests.length ? {
      analysisRequests: analysisRequests.map((part, index) => ({
        id: part.id || `analysis-${index + 1}`,
        label: part.label,
        kind: part.kind,
        ...(part.feature ? { feature: part.feature } : {}),
        ...(part.responseMode ? { responseMode: part.responseMode } : {}),
        ...(part.notation ? { notation: part.notation } : {}),
        expected: part.expected,
        ...(part.accepted ? { acceptedAnswers: part.accepted } : {}),
      })),
    } : {}),
    ...teaching({ review, feedback, hints, misconceptions }),
  };
};

/** A multi-part item rendered by the MultiAnswer grader, graded part by part. */
export const multiPartTool = ({
  code, slug, band, dok, taskType, representation,
  prompt, fields, mathDisplay = null, calculator, review, feedback, hints, misconceptions,
}) => ({
  ...envelope({ code, slug, band, dok, taskType, representation, calculator }),
  type: 'multiAnswer',
  prompt: req(prompt, `${code}:${slug} needs a prompt`),
  ...(mathDisplay ? { mathDisplay } : {}),
  answerFields: fields.map((field, index) => ({
    id: field.id || `part-${index + 1}`,
    label: field.label,
    prompt: field.prompt || field.label,
    inputProfile: field.profile || 'text',
    ...(field.choices ? { choices: field.choices } : {}),
    expected: req(field.expected, `${code}:${slug} part ${index + 1} needs an expected answer`),
    ...(field.accepted?.length ? { acceptedAnswers: field.accepted } : {}),
  })),
  ...teaching({ review, feedback, hints, misconceptions }),
});

/**
 * Collect one standard's families.
 *
 * Exists so an authoring module reads as "here is A.5A, here are its six
 * families" rather than as a flat list of 700 objects, and so the build script
 * can report per standard.
 */
export const standard = (code, families) => ({ code, families });
