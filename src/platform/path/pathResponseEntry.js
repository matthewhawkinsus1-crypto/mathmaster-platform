import { normalizeInteractionInputProfile } from '../interaction/interactionContract.js';
import { typedEntryNotice } from '../../../functions/shared/typedEntryGuard.mjs';

/*
 * WHEN A MY MATH PATH ANSWER MAY BE CHECKED (PathResponseFields.jsx draws the
 * boxes; this is the rule, apart from them so that it can be tested).
 */
const normalizeProfile = (profile) => normalizeInteractionInputProfile(profile) || 'text';

/*
 * What a box says about an entry that cannot be checked yet: left unfinished
 * (`12 +`, `4*`) or longer than an answer may be (typedEntryGuard.mjs; #557,
 * #558). A choice is never typed, and a box of words is read for its length
 * only. The keys are not on the device, so none is consulted.
 */
export const pathEntryProblem = (field = {}, value = '') => {
  const profile = normalizeProfile(field.inputProfile);
  if (profile === 'choice') return '';
  return typedEntryNotice(value, { words: profile === 'text' });
};

/**
 * Is every field answered with something that can be checked? Used to enable
 * the Check button, and by Enter: nothing is sent, and no try is used, while
 * a box is blank or its entry is unfinished or too long.
 */
export const pathResponseComplete = (fields = [], values = {}) => {
  const resolved = fields.length ? fields : [{ id: 'answer' }];
  return resolved.every((field) => String(values[field.id] ?? '').trim() !== '' && !pathEntryProblem(field, values[field.id]));
};
