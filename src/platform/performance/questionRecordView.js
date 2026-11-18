import { normalizeQuestionRecord } from '../../attemptPolicy.js';

/*
 * A STORED QUESTION RECORD, READ AS THE ATTEMPT POLICY READS IT, ONCE.
 *
 * normalizeQuestionRecord (functions/shared/attemptPolicy.mjs, the grading
 * contract) builds a new object on every call, and works out the step credit
 * twice as it does. App's render asks it about the same records again and
 * again: whether each question of the section is finished, whether a section
 * has work, which version the open question is on. A Submit changes one
 * record and renders App several times, so the others were normalised again
 * on each render.
 *
 * A record in a tracker is never changed in place: a save makes a new record
 * (recordQuestionAttempt and its kin return new objects, and App builds a new
 * tracker around them), and a snapshot hands over new objects. So the view
 * worked out for a record object stays that record's view, and is kept with
 * the record (a WeakMap: it goes when the record goes). No record at all
 * reads as the one empty record.
 *
 * The view is shared by everyone who asks about that record: read it, never
 * write to it. normalizeQuestionRecord itself still hands out a fresh object
 * for code that builds a new record from it.
 */
const views = new WeakMap();
const EMPTY_VIEW = normalizeQuestionRecord(null);

export const questionRecordView = (record) => {
  if (!record) return EMPTY_VIEW;
  if (typeof record !== 'object') return normalizeQuestionRecord(record);
  let view = views.get(record);
  if (!view) {
    view = normalizeQuestionRecord(record);
    views.set(record, view);
  }
  return view;
};
