/*
 * WHAT THE PACK-UP LINE SAYS ABOUT THE STUDENT'S WORK (student pass 3, NAV-24).
 *
 * "Finish up — your work is saved." only when nothing is owed. The line reads
 * the same save status as Home's status line (saveStatusModel.js
 * describeSaveStatus, drafts that are not being saved included), so the two
 * never disagree. In the last minutes of class "rejected" is likeliest of all:
 * an exit ticket closes five minutes before the bell, and a late answer drains
 * as rejected.
 *
 * Pure: no React.
 */
import { SAVE_TONE } from './saveStatusModel.js';

export const PACK_UP_SENTENCE = Object.freeze({
  saved: 'Finish up — your work is saved.',
  unsent: 'Finish up — some work has not been sent yet, so keep this tab open.',
  notSaved: 'Finish up — some work is not saved yet, so keep this tab open and tell your teacher.',
});

/** { kind, sentence } for a describeSaveStatus result. */
export const packUpWorkLine = (saveStatus) => {
  const tone = saveStatus?.tone;
  if (tone === SAVE_TONE.SAVED) return { kind: 'saved', sentence: PACK_UP_SENTENCE.saved };
  if (tone === SAVE_TONE.SAVING || tone === SAVE_TONE.OFFLINE) return { kind: 'unsent', sentence: PACK_UP_SENTENCE.unsent };
  // Attention (rejected, volatile, needs review, drafts not being saved) — and
  // anything unknown: never claim "saved" without being sure.
  return { kind: 'notSaved', sentence: PACK_UP_SENTENCE.notSaved };
};

export default packUpWorkLine;
