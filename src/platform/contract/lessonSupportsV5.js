/*
 * LEARNING SUPPORTS IN ASSIGNMENT V5: THE AUTHORING CONTRACT (AG-1).
 *
 * Four optional fields a NEW assignment can carry, from the two specs
 * docs/platform/WORKED_EXAMPLES.md (section 7) and
 * docs/platform/SHOWING_THE_PROCESS.md (sections 4 and 5). The author's guide
 * is docs/assignments/AUTHORING_LEARNING_SUPPORTS.md.
 *
 *   lessonSupports            beside `sections`, at the top of the assignment:
 *                             { referenceCards: [...], examples: [...] }
 *   question.example          an id of a lessonSupports.examples entry, or
 *                             { none: "setup" | "explain" }
 *   part.followThrough        on a responses[] part: { from: [ids], answer }
 *   part.checkpoint           on a responses[] part: { kind, count?, of }
 *
 * WHAT THIS FILE DOES AND DOES NOT DO. It checks the shapes and the owner's
 * rules, and nothing else: the compiler carries the fields through unchanged
 * (authoringIntentV5Core.js). The worked-example player (WE-A) reads a
 * question's `example` and a lesson's step cards
 * (supports/workedExample/examplePlayer.js), and the graders and screens
 * read a part's `followThrough` (SP-3, functions/shared/followThrough.mjs).
 * A Step Algebra replay (`moves`) and `fade` are played too (WE-C); whether
 * a replay's moves reach its answer is the tool engine's to say, so that
 * check lives with the replay (supports/workedExample/stepAlgebraReplay.js,
 * stepAlgebraReplayErrors), and the compiler and Pre-Flight run it beside
 * this one. A part's `checkpoint` opens its step in the tool (SP-4); whether
 * that tool can read `of`, and that `of` is never an answer, is checked with
 * the step (supports/showTheStep/checkpointSource.js checkpointSourceErrors),
 * beside this one too. A reference card's content is the platform's (WE-H):
 * the card for its `skill` in the built-in library
 * (supports/referenceCards/referenceCardLibrary.js; its skill names are written
 * out below, REFERENCE_CARD_SKILLS), so a card whose skill has
 * none is a Pre-Flight warning on a NEW assignment (referenceCardSkillWarnings,
 * which the Pre-Flight model asks for only then): students would never see it. So an assignment that carries none of the fields is judged and
 * compiled exactly as before.
 *
 * The messages lead with "Section S Question Q <field path>", the locator
 * Pre-Flight's diagnostics read (preflightDiagnostics.js), so each lands on
 * the question it is about.
 */

import { followThroughPlaceholders } from '../../../functions/shared/followThroughNames.mjs';
// The two attempt policies (functions/shared/activityPolicies.mjs ATTEMPT_POLICY),
// written out so that object stays off the student's first load; a test holds
// them equal (unlimitedAttemptsAssignment.test.mjs).
const ATTEMPT_POLICY = Object.freeze({ ROLE: 'rolePolicy', UNLIMITED: 'unlimited' });

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const clean = (value) => String(value ?? '').trim();
const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== '';
const isPositiveInteger = (value) => Number.isInteger(value) && value >= 1;
const shown = (value) => JSON.stringify(value);
const quotedList = (values) => {
  const items = values.map((value) => `"${value}"`);
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} or ${items.at(-1)}`;
};

export const LESSON_SUPPORT_KEYS = Object.freeze(['referenceCards', 'examples']);
export const REFERENCE_CARD_KEYS = Object.freeze(['id', 'skill', 'sections']);
export const LESSON_EXAMPLE_SOURCES = Object.freeze(['builtIn', 'authored', 'generated']);
export const LESSON_EXAMPLE_KEYS = Object.freeze([
  'id', 'skill', 'tool', 'source', 'sibling', 'parameters', 'problem', 'roles', 'steps', 'moves', 'fade',
]);
export const EXAMPLE_STEP_KEYS = Object.freeze(['show', 'why']);
export const EXAMPLE_MOVE_KEYS = Object.freeze(['op', 'operand', 'why', 'detail', 'check']);
export const EXAMPLE_FADE_KEYS = Object.freeze(['fromStep', 'handOverAfter']);
export const QUESTION_EXAMPLE_EXEMPTIONS = Object.freeze(['setup', 'explain']);
export const FOLLOW_THROUGH_KEYS = Object.freeze(['from', 'answer']);
export const CHECKPOINT_KINDS = Object.freeze(['pickPoints', 'factorPair', 'stepMoves', 'tableRow']);
export const CHECKPOINT_KEYS = Object.freeze(['kind', 'count', 'of']);
// Only these kinds count something the student does: points picked, rows filled.
export const CHECKPOINT_KINDS_WITH_COUNT = Object.freeze(['pickPoints', 'tableRow']);

/*
 * The owner's decision (2026-11-20): examples and reference cards are never on
 * a DOL, quiz or test. The section's role decides; an assignment cannot turn
 * them on there.
 */
export const NO_EXAMPLE_SECTION_ROLES = Object.freeze(['dol', 'quiz', 'test']);
// The roles an example or card may name (V5_SECTION_ROLES without the three).
export const EXAMPLE_SECTION_ROLES = Object.freeze(['warmup', 'classwork', 'practice', 'review', 'corrections']);
const ROLE_NAMES = Object.freeze({ dol: 'DOL', quiz: 'quiz', test: 'test' });

/*
 * A follow-through placeholder is {name}: a part id in single braces, written
 * as words write it ("Using your slope of {slope}, …"); braces that belong to
 * mathematics or a Question Family template are not. One definition, shared
 * with the screens and graders that replace the names
 * (functions/shared/followThroughNames.mjs), so what is checked here is what
 * they replace.
 */
export { followThroughPlaceholders };

/*
 * A question's answer parts, under the name the compiler reads them by
 * (fieldFromIntent): `responses` as authored, `answerFields` once compiled,
 * `response.fields`, or `fields` on a comparison question. A part with no id
 * is given `part-N` by the compiler, so the same default is used here.
 */
const PART_LISTS = Object.freeze([
  ['responses', (q) => q.responses],
  ['answerFields', (q) => q.answerFields],
  ['response.fields', (q) => q.response?.fields],
  ['fields', (q) => q.fields],
]);
export const questionAnswerParts = (question = {}) => {
  if (!isObject(question)) return { path: 'responses', parts: [] };
  const found = PART_LISTS.find(([, read]) => Array.isArray(read(question)) && read(question).length);
  if (!found) return { path: 'responses', parts: [] };
  const [path, read] = found;
  return { path, parts: read(question) };
};
export const answerPartId = (part, index) => clean(isObject(part) ? part.id : '') || `part-${index + 1}`;

const sectionRole = (section) => clean(section?.role).toLowerCase() || 'classwork';
const sectionId = (section, index) => clean(section?.id) || `section-${index + 1}`;

const unknownKeys = (value, allowed) => Object.keys(value).filter((key) => !allowed.includes(key));

// Text a problem is recognised by: case, spaces and $ delimiters do not count.
const problemText = (value) => clean(value).toLowerCase().replace(/[\s$]+/g, '');
const QUESTION_PROBLEM_FIELDS = Object.freeze(['prompt', 'equation', 'expression', 'inequality', 'equationLatex']);
const exampleProblemTexts = (example) => [
  example.problem,
  ...(isObject(example.sibling) ? Object.values(example.sibling) : [example.sibling]),
].filter(isNonEmptyString).map(problemText).filter((text) => text.length >= 3);

const validateReferenceCards = (cards, sections, errors) => {
  if (!Array.isArray(cards)) {
    errors.push('lessonSupports.referenceCards must be an array of cards: [{ "id": "cubes", "skill": "factor.sumDifferenceOfCubes" }].');
    return;
  }
  const ids = new Set();
  const sectionIds = new Map(sections.map((section, index) => [sectionId(section, index), sectionRole(section)]));
  const roles = new Set(sections.map(sectionRole));
  cards.forEach((card, index) => {
    const at = `lessonSupports.referenceCards[${index}]`;
    if (!isObject(card)) {
      errors.push(`${at} must be an object { id, skill, sections? }.`);
      return;
    }
    unknownKeys(card, REFERENCE_CARD_KEYS).forEach((key) => {
      errors.push(`${at}.${key} is not a reference card field. A card has ${REFERENCE_CARD_KEYS.join(', ')}.`);
    });
    if (!isNonEmptyString(card.id)) errors.push(`${at}.id is required: a short name for the card, unique in this assignment (for example "cubes").`);
    else if (ids.has(clean(card.id))) errors.push(`${at}.id "${clean(card.id)}" is used by another reference card. Each card has its own id.`);
    else ids.add(clean(card.id));
    if (!isNonEmptyString(card.skill)) errors.push(`${at}.skill is required: the skill the card shows (for example "factor.sumDifferenceOfCubes").`);
    if (card.sections === undefined) return;
    if (!Array.isArray(card.sections) || card.sections.length === 0 || !card.sections.every(isNonEmptyString)) {
      errors.push(`${at}.sections must be a non-empty list of section ids (or roles) the card is pinned on, for example ["classwork", "practice"]. Leave it out to pin the card on every Classwork and Practice section.`);
      return;
    }
    card.sections.forEach((entry, entryIndex) => {
      const name = clean(entry);
      const role = sectionIds.get(name) || (roles.has(name.toLowerCase()) ? name.toLowerCase() : null);
      if (!role) {
        errors.push(`${at}.sections[${entryIndex}] "${name}" names no section of this assignment. Use a section's id or role.`);
      } else if (NO_EXAMPLE_SECTION_ROLES.includes(role)) {
        errors.push(`${at}.sections[${entryIndex}] "${name}" is a ${ROLE_NAMES[role]} section. Reference cards are never shown on a DOL, quiz or test; pin the card on Classwork or Practice only.`);
      }
    });
  });
};

const validateSteps = (steps, at, errors) => {
  if (!Array.isArray(steps) || steps.length === 0) {
    errors.push(`${at}.steps must be a non-empty list of steps: [{ "show": "5x + 3 = 2x - 9", "why": "the equation to solve" }].`);
    return 0;
  }
  steps.forEach((step, index) => {
    const stepAt = `${at}.steps[${index}]`;
    if (!isObject(step)) {
      errors.push(`${stepAt} must be an object { show, why }.`);
      return;
    }
    unknownKeys(step, EXAMPLE_STEP_KEYS).forEach((key) => {
      errors.push(`${stepAt}.${key} is not a step field. A step has show (what the slide shows) and why (the reason for it).`);
    });
    if (!isNonEmptyString(step.show)) errors.push(`${stepAt}.show is required: what this slide shows.`);
    if (!isNonEmptyString(step.why)) errors.push(`${stepAt}.why is required: every step says why it is done.`);
  });
  return steps.length;
};

const validateMoves = (moves, at, errors) => {
  if (!Array.isArray(moves) || moves.length === 0) {
    errors.push(`${at}.moves must be a non-empty list of the tool's own actions: [{ "op": "subtract", "operand": "2x", "why": "x-terms on one side" }].`);
    return 0;
  }
  moves.forEach((move, index) => {
    const moveAt = `${at}.moves[${index}]`;
    if (!isObject(move)) {
      errors.push(`${moveAt} must be an object { op?, operand?, why?, detail?, check? }.`);
      return;
    }
    unknownKeys(move, EXAMPLE_MOVE_KEYS).forEach((key) => {
      errors.push(`${moveAt}.${key} is not a move field. A move has ${EXAMPLE_MOVE_KEYS.join(', ')}.`);
    });
    if (move.op === undefined && move.check === undefined) errors.push(`${moveAt} needs an op (the tool action, for example "subtract") or check (true, or "each" to check every root).`);
    if (move.op !== undefined && !isNonEmptyString(move.op)) errors.push(`${moveAt}.op must be the name of a tool action, for example "subtract".`);
    if (move.operand !== undefined && !isNonEmptyString(move.operand) && !Number.isFinite(move.operand)) errors.push(`${moveAt}.operand must be a number or an expression written as text, for example "2x".`);
    ['why', 'detail'].forEach((key) => {
      if (move[key] !== undefined && !isNonEmptyString(move[key])) errors.push(`${moveAt}.${key} must be text.`);
    });
    if (move.check !== undefined && move.check !== true && move.check !== 'each') errors.push(`${moveAt}.check must be true, or "each" to check every root.`);
  });
  return moves.length;
};

const validateFade = (fade, at, length, errors) => {
  if (!isObject(fade)) {
    errors.push(`${at}.fade must be an object { fromStep?, handOverAfter? }.`);
    return;
  }
  unknownKeys(fade, EXAMPLE_FADE_KEYS).forEach((key) => {
    errors.push(`${at}.fade.${key} is not a fade field. Use fromStep or handOverAfter.`);
  });
  const present = EXAMPLE_FADE_KEYS.filter((key) => fade[key] !== undefined);
  if (!present.length) errors.push(`${at}.fade needs fromStep or handOverAfter: the step after which the student takes over.`);
  if (!length) {
    errors.push(`${at}.fade needs the example's own steps or moves to fade.`);
    return;
  }
  present.forEach((key) => {
    if (!isPositiveInteger(fade[key])) errors.push(`${at}.fade.${key} must be a whole number of 1 or more.`);
    else if (fade[key] > length) errors.push(`${at}.fade.${key} is ${fade[key]}, but the example has ${length} step${length === 1 ? '' : 's'}.`);
  });
};

const validateExamples = (examples, sections, errors) => {
  if (!Array.isArray(examples)) {
    errors.push('lessonSupports.examples must be an array of examples: [{ "id": "ex-both-sides", "source": "authored", ... }].');
    return new Map();
  }
  const byId = new Map();
  examples.forEach((example, index) => {
    const at = `lessonSupports.examples[${index}]`;
    if (!isObject(example)) {
      errors.push(`${at} must be an object with at least id and source.`);
      return;
    }
    unknownKeys(example, LESSON_EXAMPLE_KEYS).forEach((key) => {
      errors.push(`${at}.${key} is not an example field. An example has ${LESSON_EXAMPLE_KEYS.join(', ')}.`);
    });
    if (!isNonEmptyString(example.id)) {
      errors.push(`${at}.id is required: a short name questions use to point at this example (for example "ex-both-sides").`);
    } else if (byId.has(clean(example.id))) {
      errors.push(`${at}.id "${clean(example.id)}" is used by another example. Each example has its own id.`);
    } else {
      byId.set(clean(example.id), { example, index });
    }
    const source = example.source;
    if (!LESSON_EXAMPLE_SOURCES.includes(source)) {
      errors.push(`${at}.source must be ${quotedList(LESSON_EXAMPLE_SOURCES)}${source === undefined ? '' : ` (it is ${shown(source)})`}.`);
    }
    ['skill', 'tool', 'problem'].forEach((key) => {
      if (example[key] !== undefined && !isNonEmptyString(example[key])) errors.push(`${at}.${key} must be text.`);
    });
    ['sibling', 'parameters'].forEach((key) => {
      if (example[key] !== undefined && !isObject(example[key])) errors.push(`${at}.${key} must be an object, for example { "equation": "5x + 3 = 2x - 9" }.`);
    });
    if (example.roles !== undefined) {
      if (!Array.isArray(example.roles) || example.roles.length === 0 || !example.roles.every(isNonEmptyString)) {
        errors.push(`${at}.roles must be a non-empty list of section roles, for example ["classwork", "practice"]. Leave it out for every section that shows examples.`);
      } else {
        example.roles.forEach((role, roleIndex) => {
          const name = clean(role).toLowerCase();
          if (NO_EXAMPLE_SECTION_ROLES.includes(name)) errors.push(`${at}.roles[${roleIndex}] is "${clean(role)}". Examples are never shown on a DOL, quiz or test.`);
          else if (!EXAMPLE_SECTION_ROLES.includes(name)) errors.push(`${at}.roles[${roleIndex}] "${clean(role)}" is not a section role. Use ${quotedList(EXAMPLE_SECTION_ROLES)}.`);
        });
      }
    }
    const stepCount = example.steps === undefined ? 0 : validateSteps(example.steps, at, errors);
    const moveCount = example.moves === undefined ? 0 : validateMoves(example.moves, at, errors);
    if (example.fade !== undefined) validateFade(example.fade, at, moveCount || stepCount, errors);

    if (source === 'authored') {
      if (example.steps === undefined && example.moves === undefined) {
        errors.push(`${at} is authored but has nothing to play: give it steps ([{ "show", "why" }]) or moves (the tool's own actions).`);
      }
      if (example.problem === undefined && example.sibling === undefined) {
        errors.push(`${at} is authored but names no problem: give the sibling problem as problem (text) or sibling (for example { "equation": "5x + 3 = 2x - 9" }).`);
      }
    } else if (source === 'builtIn' || source === 'generated') {
      if (example.skill === undefined && example.tool === undefined) {
        errors.push(`${at} is ${source} but names neither skill nor tool, so MathMaster cannot tell which example to build.`);
      }
    }

    // An example is a sibling problem: never the student's item, and never
    // another item on the same assignment (WORKED_EXAMPLES.md section 4).
    const texts = exampleProblemTexts(example);
    if (!texts.length) return;
    sections.forEach((section, sectionIndex) => {
      (Array.isArray(section?.questions) ? section.questions : []).forEach((question, questionIndex) => {
        if (!isObject(question)) return;
        const same = QUESTION_PROBLEM_FIELDS
          .map((key) => question[key])
          .filter(isNonEmptyString)
          .some((value) => texts.includes(problemText(value)));
        if (same) {
          errors.push(`${at} is the same problem as Section ${sectionIndex + 1} Question ${questionIndex + 1}. An example is a sibling problem with different numbers, never an item on this assignment.`);
        }
      });
    });
  });
  return byId;
};

const validateQuestionExample = ({ question, label, role, examples, hasExampleList, errors }) => {
  const value = question.example;
  if (value === undefined) return;
  if (NO_EXAMPLE_SECTION_ROLES.includes(role)) {
    errors.push(`${label} example is on a ${ROLE_NAMES[role]} section. Examples are never shown on a DOL, quiz or test: remove the example field.`);
    return;
  }
  if (typeof value === 'string') {
    const id = clean(value);
    const entry = examples.get(id);
    if (!id) {
      errors.push(`${label} example is empty. Name an example id from lessonSupports.examples, or write { "none": "setup" } or { "none": "explain" }.`);
    } else if (!entry) {
      errors.push(`${label} example "${id}" names no lessonSupports.examples entry. ${hasExampleList ? 'Fix the id, or add' : 'Add lessonSupports.examples with'} { "id": "${id}", ... }.`);
    } else if (Array.isArray(entry.example.roles) && entry.example.roles.every(isNonEmptyString)
      && !entry.example.roles.map((entryRole) => clean(entryRole).toLowerCase()).includes(role)) {
      errors.push(`${label} example "${id}" is for ${entry.example.roles.map(clean).join(' and ')} only (lessonSupports.examples[${entry.index}].roles), and this question is on a ${role} section.`);
    }
    return;
  }
  if (isObject(value)) {
    const extra = unknownKeys(value, ['none']);
    if (value.none === undefined || extra.length) {
      errors.push(`${label} example must be an example id (text) or { "none": "setup" } or { "none": "explain" }${extra.length ? `; ${extra.join(', ')} is not part of it` : ''}.`);
    } else if (!QUESTION_EXAMPLE_EXEMPTIONS.includes(value.none)) {
      errors.push(`${label} example.none must be "setup" (a question that sets up the context) or "explain" (one that gets a model answer instead), not ${shown(value.none)}.`);
    }
    return;
  }
  errors.push(`${label} example must be an example id (text) or { "none": "setup" } or { "none": "explain" }, not ${shown(value)}.`);
};

const validateFollowThrough = ({ part, partIndex, at, ids, errors }) => {
  const value = part.followThrough;
  if (!isObject(value)) {
    errors.push(`${at}.followThrough must be an object { "from": ["slope"], "answer": "y > {slope}x + 3" }.`);
    return;
  }
  unknownKeys(value, FOLLOW_THROUGH_KEYS).forEach((key) => {
    errors.push(`${at}.followThrough.${key} is not a followThrough field. Use from and answer.`);
  });
  const from = Array.isArray(value.from) && value.from.length && value.from.every(isNonEmptyString)
    ? value.from.map(clean)
    : null;
  if (!from) {
    errors.push(`${at}.followThrough.from must be a non-empty list of the ids of earlier parts this part builds on, for example ["slope"].`);
  } else {
    from.forEach((id, fromIndex) => {
      const position = ids.indexOf(id);
      if (position === -1) errors.push(`${at}.followThrough.from[${fromIndex}] "${id}" names no part of this question. Part ids here: ${ids.join(', ')}.`);
      else if (position === partIndex) errors.push(`${at}.followThrough.from[${fromIndex}] "${id}" is this part itself. A part builds on parts answered before it.`);
      else if (position > partIndex) errors.push(`${at}.followThrough.from[${fromIndex}] "${id}" is a later part. A part builds only on parts the student has already answered.`);
    });
  }
  if (!isNonEmptyString(value.answer)) {
    errors.push(`${at}.followThrough.answer must be this part's answer written with the earlier parts' {names}, for example "y > {slope}x + 3".`);
  }
  const allowed = from || [];
  [['label', part.label ?? part.prompt], ['followThrough.answer', value.answer]].forEach(([field, text]) => {
    followThroughPlaceholders(text).filter((name) => !allowed.includes(name)).forEach((name) => {
      errors.push(`${at}.${field} uses {${name}}, which followThrough.from does not list. Every {name} must name an earlier part listed in from.`);
    });
  });
};

const validateCheckpoint = ({ part, at, errors }) => {
  const value = part.checkpoint;
  if (!isObject(value)) {
    errors.push(`${at}.checkpoint must be an object { "kind": "pickPoints", "count": 2, "of": "y = 3x - 2" }.`);
    return;
  }
  unknownKeys(value, CHECKPOINT_KEYS).forEach((key) => {
    errors.push(`${at}.checkpoint.${key} is not a checkpoint field. Use kind, count and of.`);
  });
  if (!CHECKPOINT_KINDS.includes(value.kind)) {
    errors.push(`${at}.checkpoint.kind ${value.kind === undefined ? 'is missing' : `${shown(value.kind)} is not a checkpoint`}. Use ${quotedList(CHECKPOINT_KINDS)}.`);
  }
  if (value.count !== undefined) {
    if (!isPositiveInteger(value.count)) errors.push(`${at}.checkpoint.count must be a whole number of 1 or more.`);
    else if (CHECKPOINT_KINDS.includes(value.kind) && !CHECKPOINT_KINDS_WITH_COUNT.includes(value.kind)) {
      errors.push(`${at}.checkpoint.count applies to ${quotedList(CHECKPOINT_KINDS_WITH_COUNT)} only, not "${value.kind}".`);
    }
  }
  // What the step works on. Whether its tool can read it is the tool's own
  // engine's to say (checkpointSource.js checkpointSourceErrors, run by the
  // compiler and Pre-Flight beside this).
  if (value.of !== undefined && !isNonEmptyString(value.of)) {
    errors.push(`${at}.checkpoint.of must be what the student works on, as text: "y = 3x - 2", "4x + 7 = x - 8", "x^2 + 5x + 6".`);
  }
};

const validateQuestionParts = ({ question, label, errors }) => {
  ['followThrough', 'checkpoint'].forEach((key) => {
    if (question[key] !== undefined) errors.push(`${label} ${key} belongs on one of the question's responses[] parts, not on the question itself.`);
  });
  const { path, parts } = questionAnswerParts(question);
  const supported = parts.some((part) => isObject(part) && (part.followThrough !== undefined || part.checkpoint !== undefined));
  if (!supported) return;
  const ids = parts.map(answerPartId);
  const usesFollowThrough = parts.some((part) => isObject(part) && part.followThrough !== undefined);
  if (usesFollowThrough) {
    [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))].forEach((id) => {
      errors.push(`${label} ${path} has more than one part with id "${id}". A follow-through part names earlier parts by id, so each part needs its own.`);
    });
  }
  parts.forEach((part, partIndex) => {
    if (!isObject(part)) return;
    const at = `${label} ${path}[${partIndex}]`;
    if (part.followThrough !== undefined) validateFollowThrough({ part, partIndex, at, ids, errors });
    if (part.checkpoint !== undefined) validateCheckpoint({ part, at, errors });
  });
};

/**
 * Check an assignment's learning supports. Works on authored V5 (questions
 * carry `responses`) and on compiled V5 (`answerFields`), so the compiler and
 * Pre-Flight judge the same rules. An assignment with none of the fields
 * returns no errors without looking further.
 */
export const validateLessonSupportsV5 = (input = {}) => {
  const errors = [];
  const warnings = [];
  if (!isObject(input)) return { errors, warnings };
  const sections = Array.isArray(input.sections) ? input.sections.filter(isObject) : [];

  // The assignment's attempt policy (functions/shared/activityPolicies.mjs):
  // judged here, not in validateAssignmentV5, which the student app loads.
  const attemptPolicy = isObject(input.gradingPolicy) ? input.gradingPolicy.attemptPolicy : undefined;
  if (attemptPolicy !== undefined && attemptPolicy !== null && !Object.values(ATTEMPT_POLICY).includes(attemptPolicy)) {
    errors.push(`gradingPolicy.attemptPolicy ${JSON.stringify(attemptPolicy)} is not an attempt policy. Use "${ATTEMPT_POLICY.ROLE}" (each section's own number of attempts — the default) or "${ATTEMPT_POLICY.UNLIMITED}" (unlimited attempts in this assignment's Warm-Up, Classwork and Practice; a DOL, quiz or test keeps its one attempt), written exactly so, or delete the field.`);
  }
  if (attemptPolicy === ATTEMPT_POLICY.UNLIMITED && isObject(input.assessmentPolicy)) {
    errors.push(`gradingPolicy.attemptPolicy "${ATTEMPT_POLICY.UNLIMITED}" cannot be used on an assignment with an assessmentPolicy (a Test Cycle): its Review, Corrections, Test and Retest keep their own attempts. Delete the field or set it to "${ATTEMPT_POLICY.ROLE}".`);
  }

  if (isObject(input.assignment) && input.assignment.lessonSupports !== undefined) {
    errors.push('assignment.lessonSupports is in the wrong place: lessonSupports goes at the top level of the assignment JSON, beside sections.');
  }

  let examples = new Map();
  const supports = input.lessonSupports;
  const hasExampleList = isObject(supports) && Array.isArray(supports.examples);
  if (supports !== undefined) {
    if (!isObject(supports)) {
      errors.push('lessonSupports must be an object: { "referenceCards": [...], "examples": [...] }.');
    } else {
      unknownKeys(supports, LESSON_SUPPORT_KEYS).forEach((key) => {
        errors.push(`lessonSupports.${key} is not a lesson support. Use referenceCards or examples.`);
      });
      if (supports.referenceCards !== undefined) validateReferenceCards(supports.referenceCards, sections, errors);
      if (supports.examples !== undefined) examples = validateExamples(supports.examples, sections, errors);
    }
  }

  (Array.isArray(input.sections) ? input.sections : []).forEach((section, sectionIndex) => {
    if (!isObject(section)) return;
    const role = sectionRole(section);
    (Array.isArray(section.questions) ? section.questions : []).forEach((question, questionIndex) => {
      if (!isObject(question)) return;
      const label = `Section ${sectionIndex + 1} Question ${questionIndex + 1}`;
      validateQuestionExample({ question, label, role, examples, hasExampleList, errors });
      validateQuestionParts({ question, label, errors });
    });
  });

  return { errors, warnings };
};

/*
 * The skills the built-in reference cards answer to (WE-H), each card's own
 * skill first and then its aliases: the names in
 * supports/referenceCards/referenceCardLibrary.js, written out here so the
 * library stays in the card's own chunk (a second importer would split it into
 * a chunk of its own, named in the first load's preload lists). A test holds
 * them equal (referenceCards.test.mjs).
 */
export const REFERENCE_CARD_SKILLS = Object.freeze([
  ['factor.sumDifferenceOfCubes', 'factor.sumOfCubes', 'factor.differenceOfCubes', 'polynomials.sumDifferenceOfCubes'],
  ['factor.differenceOfSquares', 'polynomials.differenceOfSquares'],
  ['factor.perfectSquareTrinomial', 'polynomials.perfectSquareTrinomial'],
  ['factor.trinomialAC', 'factor.acMethod', 'polynomials.factorTrinomial'],
  ['lines.slopeInterceptForm', 'linear.slopeInterceptForm', 'linear.graphFromSlopeIntercept'],
  ['lines.pointSlopeForm', 'linear.pointSlopeForm'],
  ['lines.slopeFormula', 'lines.slopeFromTwoPoints', 'linear.slopeFromPoints', 'linear.slopeFormula'],
  ['lines.standardForm', 'linear.standardForm'],
  ['quadratics.quadraticFormula', 'quadratics.solveByFormula', 'quadratic.quadraticFormula'],
  ['quadratics.vertexForm', 'quadratic.vertexForm'],
  ['theorems.remainder', 'theorems.remainderTheorem', 'polynomials.remainderTheorem'],
  ['transformations.combined', 'transformations.readAHK', 'transformations.generalForm'],
].map((names) => Object.freeze(names)));
const KNOWN_CARD_SKILLS = new Set(REFERENCE_CARD_SKILLS.flat().map((name) => name.toLowerCase()));

/**
 * A declared reference card whose skill has no built-in card (WE-H): students
 * would never see it. Advice for a NEW assignment only; the Pre-Flight model
 * asks for it only then (isNewAssignment), so an existing assignment is judged
 * exactly as before.
 */
export const referenceCardSkillWarnings = (input = {}) => {
  const cards = isObject(input?.lessonSupports) && Array.isArray(input.lessonSupports.referenceCards) ? input.lessonSupports.referenceCards : [];
  return cards.flatMap((card, index) => (isObject(card) && isNonEmptyString(card.skill) && !KNOWN_CARD_SKILLS.has(clean(card.skill).toLowerCase())
    ? [`lessonSupports.referenceCards[${index}].skill "${clean(card.skill)}" has no reference card in MathMaster yet, so students will not see this card. Use the skill of a built-in card: ${REFERENCE_CARD_SKILLS.map(([skill]) => skill).join(', ')}.`]
    : []));
};

/**
 * The compiler's promise: every learning-support field an author wrote reaches
 * the compiled assignment unchanged. A destination that does not keep answer
 * parts would drop a part's followThrough or checkpoint without a word, so the
 * compiler refuses it instead. `source` and `compiled` are the authored and
 * compiled V5 objects; their sections and questions correspond by position.
 */
export const lessonSupportsPassThroughErrors = (source = {}, compiled = {}) => {
  const errors = [];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  if (source?.lessonSupports !== undefined && !same(source.lessonSupports, compiled?.lessonSupports)) {
    errors.push('lessonSupports did not reach the compiled assignment unchanged.');
  }
  (Array.isArray(source?.sections) ? source.sections : []).forEach((section, sectionIndex) => {
    (Array.isArray(section?.questions) ? section.questions : []).forEach((question, questionIndex) => {
      if (!isObject(question)) return;
      const label = `Section ${sectionIndex + 1} Question ${questionIndex + 1}`;
      const out = compiled?.sections?.[sectionIndex]?.questions?.[questionIndex];
      if (question.example !== undefined && !same(question.example, out?.example)) {
        errors.push(`${label} example did not reach the compiled question unchanged.`);
      }
      const { path, parts } = questionAnswerParts(question);
      const compiledParts = isObject(out)
        ? PART_LISTS.flatMap(([, read]) => (Array.isArray(read(out)) ? read(out) : []))
        : [];
      parts.forEach((part, partIndex) => {
        if (!isObject(part)) return;
        ['followThrough', 'checkpoint'].forEach((key) => {
          if (part[key] === undefined) return;
          const id = answerPartId(part, partIndex);
          const kept = compiledParts.some((entry, entryIndex) => (
            isObject(entry) && answerPartId(entry, entryIndex) === id && same(entry[key], part[key])
          ));
          if (!kept) {
            errors.push(`${label} ${path}[${partIndex}].${key} did not reach the compiled question: MathMaster compiled it as ${clean(out?.type) || 'a question'} with no answer part "${id}" to carry it. Put the part on an answer-box question (studentActions ["multipleResponses"]).`);
          }
        });
      });
    });
  });
  return errors;
};
