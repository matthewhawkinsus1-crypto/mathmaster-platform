/*
 * REFERENCE SHEETS A QUESTION CAN OFFER FROM THE WORK BAR (TL07: a STAAR sheet).
 *
 * The Digital SAT's sheet has a screen of its own (SatReferenceSheet.jsx)
 * because that exam promises one, and it is the College Board's, held to the
 * published list by its own test. This is the shell for a sheet an ORDINARY
 * assignment's question offers: `referenceSheet: "<id>"` on a question names an
 * entry in REFERENCE_SHEETS, and the work bar then carries a button that opens
 * it beside the question (AssignmentReferenceSheet.jsx), the way the graphing
 * calculator opens.
 *
 * NO SHEET IS REGISTERED, ON PURPOSE. The official STAAR Algebra I reference
 * materials belong to the Texas Education Agency; their wording and whether
 * MathMaster may reproduce them are not for this repository to guess, and a
 * "STAAR" sheet that differs from the one on test day teaches a student to lean
 * on a formula the test does not give. Until an entry exists, no question can
 * show a sheet and the work bar is exactly what it was.
 *
 * TO ADD THE STAAR ALGEBRA I SHEET the owner supplies, and nothing else is
 * needed to turn it on:
 *
 *   1. The sheet itself, as the student gets it on test day: every formula and
 *      fact, in the order printed, with the exact edition (year) it is from.
 *      Each formula is LaTeX plus the words a screen reader says for it.
 *   2. Written clearance to reproduce it: who confirmed that TEA permits it,
 *      on what date, and the attribution line TEA asks for. These become
 *      `clearance` and `source` below; a sheet without them is refused.
 *   3. Which questions get the button. A question opts in with
 *      `"referenceSheet": "staarAlgebra1"`. Whether exit tickets, quizzes and
 *      tests may carry it is the owner's call (STAAR itself allows it all day,
 *      but a formula-recall item is given away by it); the shell does not
 *      decide, the author does.
 *   4. If the printed sheet has figures, how they are to be drawn (the SAT
 *      sheet draws its own SVGs); this shell shows text and formulas only.
 *
 * Then a developer adds one data file next to this one and one line below. The
 * registry-wide test (tests/platform/referenceSheetShell.test.mjs) fails any
 * registered sheet that is missing its source, its clearance, or the words a
 * screen reader needs.
 *
 * Pure: no DOM.
 */

/**
 * id -> sheet. A sheet is:
 *
 *   { id, title, subtitle?, buttonLabel?,
 *     source:    { name, edition?, url? },        // the attribution shown on the sheet
 *     clearance: { by, on: 'YYYY-MM-DD', note? }, // who cleared reuse, and when
 *     notes?:    [text],                          // plain lines under the sections
 *     sections:  [{ id, title, items: [{ id, latex, spoken, label?, note? }] }] }
 */
export const REFERENCE_SHEETS = Object.freeze({});

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Everything wrong with a sheet, in words an author can act on. A sheet with
 * any problem is never offered (resolveReferenceSheet), so a half-supplied
 * sheet cannot reach a student.
 */
export const validateReferenceSheet = (sheet) => {
  const errors = [];
  if (!sheet || typeof sheet !== 'object' || Array.isArray(sheet)) return { errors: ['A reference sheet must be an object.'] };
  const label = text(sheet.id) || '(no id)';
  if (!text(sheet.id)) errors.push('A reference sheet needs an id.');
  if (!text(sheet.title)) errors.push(`Reference sheet ${label} needs a title.`);
  if (!text(sheet.source?.name)) errors.push(`Reference sheet ${label} needs its source (source.name), the attribution the sheet shows.`);
  if (!text(sheet.clearance?.by) || !ISO_DATE.test(text(sheet.clearance?.on))) {
    errors.push(`Reference sheet ${label} has not been cleared for reuse: clearance needs who cleared it (by) and the date (on, as YYYY-MM-DD).`);
  }
  const sections = Array.isArray(sheet.sections) ? sheet.sections : [];
  if (!sections.length) errors.push(`Reference sheet ${label} needs at least one section.`);
  const seen = new Set();
  const remember = (kind, id) => {
    const key = `${kind}:${id}`;
    if (seen.has(key)) errors.push(`Reference sheet ${label} uses the ${kind} id "${id}" more than once.`);
    seen.add(key);
  };
  sections.forEach((section, sectionIndex) => {
    const where = `Reference sheet ${label}, section ${sectionIndex + 1}`;
    if (!text(section?.id)) errors.push(`${where} needs an id.`);
    else remember('section', text(section.id));
    if (!text(section?.title)) errors.push(`${where} needs a title.`);
    const items = Array.isArray(section?.items) ? section.items : [];
    if (!items.length) errors.push(`${where} needs at least one item.`);
    items.forEach((item, itemIndex) => {
      const at = `${where}, item ${itemIndex + 1}`;
      if (!text(item?.id)) errors.push(`${at} needs an id.`);
      else remember('item', text(item.id));
      if (!text(item?.latex)) errors.push(`${at} needs its formula as LaTeX (latex).`);
      if (!text(item?.spoken)) errors.push(`${at} needs the words a screen reader says for it (spoken).`);
    });
  });
  return { errors };
};

/**
 * The sheet a question offers, or null: the question names one, it is
 * registered, and it is complete and cleared. Fails closed, so an unknown id,
 * a misspelling or a half-supplied sheet shows nothing at all.
 * `registry` is a parameter so tests can offer a fixture; the app uses REFERENCE_SHEETS.
 */
export const resolveReferenceSheet = (question, registry = REFERENCE_SHEETS) => {
  const id = text(question?.referenceSheet);
  if (!id || !Object.prototype.hasOwnProperty.call(registry, id)) return null;
  const sheet = registry[id];
  if (sheet?.id !== id) return null;
  return validateReferenceSheet(sheet).errors.length ? null : sheet;
};
