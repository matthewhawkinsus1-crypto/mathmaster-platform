/*
 * GRAPH THE LINE: CHECKING ONE ANSWER.
 *
 * The student's device and the server run these same functions on the same
 * item, so the verdict a student sees in the frame after letting go of a
 * point is the verdict the server records. Everything is exact: a drawn line
 * is two grid points, a chosen equation is an option of the item, a typed
 * equation is exact numbers in the boxes of its form.
 *
 *   checkLineAnswer      Graph it: the two points of the student's line
 *   checkChoiceAnswer    Name it, choose: the id of the tapped option
 *   checkEquationAnswer  Name it, build: the typed boxes, on Enter
 *
 * Each returns { verdict, answerKey, diagnosis, message }. `answerKey`
 * identifies the ANSWER, not the gesture: the same wrong line drawn through
 * different points, or the same option tapped twice, is one answer — a
 * student who lets go of a point where it already was has not tried again
 * (the attempt pipeline records it as `repeated`, neither credit nor miss).
 *
 * What is NOT judged here: whose turn it is, tries left, the round clock.
 * Those belong to the attempt pipeline, which calls these functions.
 *
 * Pure: Cloud Functions, the student device and tests.
 */

import { integerPoint, lineKey, lineThroughPoints, pointInView, sameLine } from './lineGraphMath.mjs';
import { BUILD_FIELDS, BUILD_PROBLEM, lineFromBuildFields } from './lineGraphForms.mjs';
import { diagnoseLine, diagnosisMessage, methodMessage } from './lineGraphFeedback.mjs';
import { LINE_ANSWER_STYLE, LINE_ITEM_TYPE, LINE_LIMITS, LINE_VERDICT } from './lineGraphRules.mjs';

const result = (fields) => Object.freeze({ answerKey: null, diagnosis: null, specific: false, misconception: null, message: null, ...fields });

const invalid = (reason) => result({ verdict: LINE_VERDICT.INVALID, reason });

const wrong = (question, studentLine, itemType) => {
  const diagnosis = diagnoseLine({ spec: question.spec, studentLine, itemType });
  return result({
    verdict: LINE_VERDICT.INCORRECT,
    answerKey: `line:${lineKey(studentLine)}`,
    diagnosis: diagnosis.code,
    specific: diagnosis.specific,
    misconception: diagnosis.misconception,
    message: diagnosisMessage(diagnosis),
  });
};

/** Two grid points as plain integers, or null when they are not two placeable points. */
export const normalizeLinePoints = (raw, view) => {
  if (!Array.isArray(raw) || raw.length !== 2) return null;
  const points = raw.map((point) => integerPoint(point));
  if (points.some((point) => !point || !pointInView(point, view))) return null;
  const [first, second] = points;
  if (first.x === second.x && first.y === second.y) return null;
  return Object.freeze(points);
};

/**
 * Graph it. The line through the two points is the equation's line, or it
 * is not. In a game that requires the method, the right line counts only
 * through every key point of the form (the y-intercept; both intercepts; the
 * point in the equation) — otherwise it is `method`: no credit, no miss.
 */
export const checkLineAnswer = ({ question, points, showMethod = false } = {}) => {
  if (!question || question.itemType !== LINE_ITEM_TYPE.GRAPH) return invalid('notAGraphItem');
  const placed = normalizeLinePoints(points, question.view);
  if (!placed) return invalid('points');
  const studentLine = lineThroughPoints(placed[0], placed[1]);
  if (!sameLine(studentLine, question.line)) return wrong(question, studentLine, LINE_ITEM_TYPE.GRAPH);
  const anchors = Array.isArray(question.anchors) ? question.anchors : [];
  const usedEveryAnchor = anchors.every((anchor) => placed.some((point) => point.x === anchor.x && point.y === anchor.y));
  if (showMethod && anchors.length && !usedEveryAnchor) {
    return result({ verdict: LINE_VERDICT.METHOD, answerKey: `method:${placed.map((point) => `${point.x},${point.y}`).join(';')}`, message: methodMessage(question.spec) });
  }
  return result({ verdict: LINE_VERDICT.CORRECT, answerKey: `line:${lineKey(studentLine)}`, message: 'Correct!' });
};

/** Name it, choose: one tap, one verdict. */
export const checkChoiceAnswer = ({ question, choiceId } = {}) => {
  if (!question || question.answerStyle !== LINE_ANSWER_STYLE.CHOICE) return invalid('notAChoiceItem');
  const choice = (question.choices || []).find((option) => option.id === String(choiceId ?? ''));
  if (!choice) return invalid('choice');
  if (choice.id === question.answerChoice && sameLine(choice.line, question.line)) {
    return result({ verdict: LINE_VERDICT.CORRECT, answerKey: `choice:${choice.id}`, message: 'Correct!' });
  }
  return Object.freeze({ ...wrong(question, choice.line, LINE_ITEM_TYPE.NAME), answerKey: `choice:${choice.id}` });
};

const FORM_MESSAGES = Object.freeze({
  [BUILD_PROBLEM.UNREADABLE]: 'Fill in every box with a number — a whole number, a fraction like 2/3, or a decimal.',
  [BUILD_PROBLEM.WHOLE_NUMBERS]: 'Standard form uses whole numbers for A, B and C.',
  [BUILD_PROBLEM.NOT_A_LINE]: 'A and B cannot both be 0.',
});

/** The typed boxes of an item's form, trimmed and bounded; anything else is dropped. */
export const normalizeEquationFields = (form, raw = {}) => Object.freeze(Object.fromEntries((BUILD_FIELDS[form] || [])
  .map((field) => [field.id, String(raw?.[field.id] ?? '').trim().slice(0, LINE_LIMITS.fieldLength)])));

/**
 * Name it, build: the boxes describe the line, or they do not. Boxes that
 * do not yet spell an equation (one is empty; standard form with a
 * fraction) are `form`: the student is told what to fix, and nothing is
 * recorded.
 */
export const checkEquationAnswer = ({ question, fields } = {}) => {
  if (!question || question.answerStyle !== LINE_ANSWER_STYLE.BUILD || !question.build) return invalid('notABuildItem');
  const typed = normalizeEquationFields(question.build.form, fields);
  const built = lineFromBuildFields(question.build.form, typed);
  if (built.problem) {
    return result({ verdict: LINE_VERDICT.FORM, reason: built.problem, field: built.field, message: FORM_MESSAGES[built.problem] });
  }
  if (sameLine(built.line, question.line)) return result({ verdict: LINE_VERDICT.CORRECT, answerKey: `line:${lineKey(built.line)}`, message: 'Correct!' });
  return wrong(question, built.line, LINE_ITEM_TYPE.NAME);
};
