/*
 * SPOT THE MISTAKE (WE-F; docs/platform/WORKED_EXAMPLES.md sections 4 and 5).
 *
 *   spotTheMistakeFor(question, { seed, assignmentQuestions }) → { line, choices, explanation } | null
 *
 * After the example's last slide, a step with the question's own common error
 * in it, and three choices for what is wrong with it. Everything it says is
 * read from the question; it writes no mathematics of its own:
 *
 *   the step      the first part of `solutionReview.commonError`, the part
 *                 that says what was done ("Keeping < after dividing by −1");
 *   the right     the rest of it, the part that says what is wrong with that
 *   choice        ("That shades the wrong half-plane."). A common error that
 *                 does not say both is not used: the step and the reason
 *                 would be the same words;
 *   two others    the "what is wrong" parts of OTHER questions' common errors
 *                 on the same assignment, from questions on another skill
 *                 and with no word stem in common (distractorsFrom
 *                 below); SPOT_THE_MISTAKE_GENERIC, two fixed choices that are
 *                 never true of a step that holds a known mistake, fill only
 *                 the slots left empty. A fixed choice on every item would
 *                 teach "pick the one that is not fixed";
 *   afterwards    the whole common error (`explanation`).
 *
 * WHY NOT THIS QUESTION'S OTHER FIELDS FOR THE WRONG CHOICES. The only text a
 * question holds that reads like a reason is its wrong-answer messages
 * (`misconceptions[].message`), measured over every Classwork and Practice
 * question with a common error in teacher-import-jsons (2026-11-22). Most of
 * them state a true fact ("Exactly 800 pounds is allowed."), which is no wrong
 * answer; the rest name a mistake on the same question, and that can be the
 * common error in other words ("Using ≥." beside "The symbol points the wrong
 * way."): a wrong choice that is right. So none is used. A choice offered as
 * wrong is always wrong.
 *
 * WHAT IT MAY NOT SAY. The common error is written about THIS question, and
 * some of them name its answer ("…so the domain is {0, 1, 2, 3, 4, 5}"). So
 * every word it would show, the step, the choices and the explanation, goes
 * through similarExampleIsSafe, the guard every worked sibling passes: none of
 * it may state an answer of the question, and the step may not be the
 * question's prompt. Anything that fails is not shown at all. A common error
 * still holding a Question Family slot ({{m}}) is not shown either.
 *
 * WHERE. Wherever an example is (Classwork and Practice; examplePlayer.js
 * exampleSectionRule), and so never on a DOL, quiz or test: the caller builds
 * it only where the section's rule offers it. It never changes a score; that
 * the student answered it is recorded as `spotTheMistakeUsed`, a fact, never
 * whether the choice was right (supportUseMemory.js).
 */
import { similarExampleIsSafe } from './similarProblem.js';
import { exampleSkillOf } from './exampleSkill.js';

const text = (value) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '');
const words = (value) => text(value).split(' ').filter(Boolean);

/** Two choices that are never what went wrong in a step that holds a known mistake. */
export const SPOT_THE_MISTAKE_GENERIC = Object.freeze([
  'Nothing is wrong: the step is correct.',
  'The step is right; it is only written in an untidy way.',
]);

// Where a common error turns from what was done to what is wrong with it, and
// how the second part starts once it stands as a sentence of its own.
const TURNS = Object.freeze([
  { mark: ': ', lead: '' },
  { mark: ' — ', lead: '' },
  { mark: ' – ', lead: '' },
  { mark: '; ', lead: '' },
  { mark: ', which ', lead: 'That ' },
  { mark: ', so ', lead: 'So ' },
  { mark: ', because ', lead: 'Because ' },
  { mark: '. ', lead: '' },
]);

// Outside $…$ only: a colon in mathematics is not a turn in the sentence.
const insideMath = (value, index) => (value.slice(0, index).match(/\$/g) || []).length % 2 === 1;
const sentence = (value) => {
  const body = text(value).replace(/[\s.;:,—–]+$/u, '');
  if (!body) return '';
  // A word takes a capital; a letter of the mathematics does not (x² is not X², f(x) is not F(x)).
  const capital = /^(?:[a-z]{2,}|a\s+[a-z]{2,})/.test(body) ? `${body.charAt(0).toUpperCase()}${body.slice(1)}` : body;
  return `${capital}.`;
};

/** The common error as { line, reason }, or null where it does not say both. */
export const splitCommonError = (commonError) => {
  const value = text(commonError);
  if (!value || /\{\{|\}\}/.test(value)) return null;
  let best = null;
  for (const turn of TURNS) {
    let index = value.indexOf(turn.mark);
    while (index >= 0 && insideMath(value, index)) index = value.indexOf(turn.mark, index + 1);
    if (index > 0 && (!best || index < best.index)) best = { index, turn };
  }
  if (!best) return null;
  const line = sentence(value.slice(0, best.index));
  const rest = text(value.slice(best.index + best.turn.mark.length));
  const reason = sentence(best.turn.lead ? `${best.turn.lead}${rest}` : rest);
  if (words(line).length < 2 || words(reason).length < 3) return null;
  return { line, reason };
};

/** Sections whose questions lend no wrong choice (examplePlayer.js NO_EXAMPLE_SECTION_ROLES). */
export const NO_DISTRACTOR_SECTION_ROLES = Object.freeze(['dol', 'quiz', 'test']);
// Two reasons are the same reason when they read the same: case, spacing and
// the closing stop do not count.
const normal = (value) => text(value).toLowerCase().replace(/[\s.;:,!?]+$/u, '');

/*
 * The wrong choices: the "what is wrong" part of another question's common
 * error on this assignment. A candidate is used only when
 *   - it is another question's (not this one's, by id or by its words);
 *   - its common error splits cleanly, as this one's did;
 *   - its step is not this question's step (the same mistake made again);
 *   - it is not this question's reason, does not contain it and is not
 *     contained in it (after normalising), and is not one already chosen;
 *   - it passes similarExampleIsSafe against THIS question: it states none of
 *     its answers;
 *   - its own question is not on a DOL, quiz or test section, and it passes
 *     similarExampleIsSafe against its own question too: a borrowed reason
 *     never hands over another item's answer ("…so the domain is {0, …, 5}");
 *   - its question is on a DIFFERENT skill (exampleSkillOf). Questions on one
 *     skill share their misconceptions, so another one's reason can explain
 *     this step's mistake too ("Shading below because the slope is positive"
 *     beside "That shades the wrong half-plane."), and no check of the words
 *     can prove it does not. Where either skill is unknown it may still lend,
 *     under the next rule;
 *   - it shares no word stem with THIS question's whole common error
 *     (contentStems): the same idea in other words is not lent.
 * In the assignment's own order.
 */
/*
 * The stems a sentence's meaning rests on: the first STEM_LENGTH letters of
 * each word of five letters or more, without a short stoplist. "slope" and
 * "slopes" share one, and so do "shading" and "shades" ("shad"): five letters
 * would keep those two apart ("shadi", "shade").
 */
export const STEM_LENGTH = 4;
const STEM_STOPLIST = new Set(['because', 'which', 'there', 'where', 'these', 'those', 'should', 'would', 'could', 'value', 'answer', 'number']);
export const contentStems = (value) => new Set((text(value).toLowerCase().match(/[a-z]+/g) || [])
  .filter((word) => word.length >= 5 && !STEM_STOPLIST.has(word) && !STEM_STOPLIST.has(word.replace(/s$/, '')))
  .map((word) => word.slice(0, STEM_LENGTH)));

const distractorsFrom = (question, parts, assignmentQuestions) => {
  const others = (Array.isArray(assignmentQuestions) ? assignmentQuestions : []).filter((other) => other && typeof other === 'object');
  const id = text(question?.questionId);
  const self = id ? others.find((other) => text(other.questionId) === id) : null;
  const skill = exampleSkillOf(self || question);
  const own = normal(question?.solutionReview?.commonError);
  const ownStems = contentStems(question?.solutionReview?.commonError);
  const reason = normal(parts.reason);
  const line = normal(parts.line);
  const found = [];
  for (const other of others) {
    if (found.length === 2) break;
    if (other === question || other === self || (id && text(other.questionId) === id)) continue;
    const otherSkill = exampleSkillOf(other);
    if (skill && otherSkill && otherSkill === skill) continue;
    const commonError = normal(other?.solutionReview?.commonError);
    if (!commonError || commonError === own) continue;
    if (NO_DISTRACTOR_SECTION_ROLES.includes(text(other.activityRole).toLowerCase())) continue;
    const split = splitCommonError(other.solutionReview.commonError);
    if (!split) continue;
    if (!similarExampleIsSafe(other, { prompt: split.line, steps: [split.line, split.reason, text(other.solutionReview.commonError)], answer: split.reason })) continue;
    const candidate = normal(split.reason);
    if (normal(split.line) === line) continue;
    if (candidate === reason || candidate.includes(reason) || reason.includes(candidate)) continue;
    if (found.some((chosen) => normal(chosen) === candidate)) continue;
    if ([...contentStems(split.reason)].some((stem) => ownStems.has(stem))) continue;
    if (!similarExampleIsSafe(question, { prompt: split.reason, steps: [split.reason], answer: split.reason })) continue;
    found.push(split.reason);
  }
  return found;
};

// A fixed place for the right choice, read from the question's own words: the
// same question asks the same way every time, and the right one is not always first.
const placeOf = (value, seed, count) => ([...value].reduce((sum, character) => (sum * 31 + character.charCodeAt(0)) % 9973, 7) + (Number(seed) || 0)) % count;

/**
 * Spot the mistake for this question, or null. `question` is the question as
 * the student is given it (a family instance with its numbers filled in).
 */
export const spotTheMistakeFor = (question, { seed = 0, assignmentQuestions = null } = {}) => {
  try {
    const explanation = text(question?.solutionReview?.commonError);
    const parts = splitCommonError(explanation);
    if (!parts) return null;
    const borrowed = distractorsFrom(question, parts, assignmentQuestions);
    const texts = [...borrowed, ...SPOT_THE_MISTAKE_GENERIC].slice(0, 2);
    texts.splice(placeOf(explanation, seed, 3), 0, parts.reason);
    // `kind` says what the feedback may say about it: a borrowed reason is true
    // of another question, so it is "a different mistake", never "wrong";
    // a fixed one really is false here.
    const kindOf = (choice) => (choice === parts.reason ? 'right' : borrowed.includes(choice) ? 'borrowed' : 'fixed');
    const choices = texts.map((choice, index) => ({ id: `mistake-${index + 1}`, text: choice, right: choice === parts.reason, kind: kindOf(choice) }));
    // Every word it would show, held to the guard every worked sibling passes.
    const safe = similarExampleIsSafe(question, {
      prompt: parts.line,
      steps: [parts.line, ...choices.map((choice) => choice.text), explanation],
      answer: parts.reason,
    });
    if (!safe) return null;
    return { source: 'commonError', line: parts.line, reason: parts.reason, choices, explanation, borrowed: borrowed.length };
  } catch {
    return null;
  }
};
