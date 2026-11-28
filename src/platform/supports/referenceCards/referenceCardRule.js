/*
 * WHERE A REFERENCE CARD IS PINNED (WE-H; WORKED_EXAMPLES.md sections 4 and 5).
 *
 *   pinnedReferenceCards({ lessonSupports, sectionRole, sectionId,
 *                          activityRole, hintsAllowed }) → [{ id, skill }]
 *
 * A lesson declares its cards in `lessonSupports.referenceCards` (AG-1,
 * lessonSupportsV5.js): { id, skill, sections? }. A card is pinned on a
 * question when all of these hold:
 *   - help is allowed there (`hintsAllowed` exactly true: the caller's own
 *     gate, the one the hint control and the worked example use);
 *   - the question's section is Classwork or Practice by its OWN role, and it
 *     is running as Classwork or Practice (a DOL practised after its due date
 *     is still a DOL, and has none);
 *   - the card's `sections` names the section, by id or role, or the card has
 *     no `sections` (then it is pinned on every Classwork and Practice section).
 * Never on a DOL, quiz or test, whatever the lesson says: the authoring
 * validator refuses such a card, and a stored one that names them anyway is
 * not pinned here either. A role nobody recognises fails closed.
 *
 * Only the ids and skills are returned: what a card says is in the card
 * library (referenceCardLibrary.js), which loads with the card itself, so a
 * page with no card pinned downloads none of it. Pure, and small, because
 * QuestionEngine imports it.
 */
export const REFERENCE_CARD_SECTION_ROLES = Object.freeze(['classwork', 'practice']);

const lower = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');
const text = (value) => (typeof value === 'string' ? value.trim() : '');
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const NONE = Object.freeze([]);

export const pinnedReferenceCards = ({ lessonSupports = null, sectionRole = null, sectionId = null, activityRole = null, hintsAllowed = false } = {}) => {
  if (hintsAllowed !== true) return NONE;
  const section = lower(sectionRole);
  const activity = lower(activityRole);
  if (!REFERENCE_CARD_SECTION_ROLES.includes(section)) return NONE;
  if (activity && !REFERENCE_CARD_SECTION_ROLES.includes(activity)) return NONE;
  const cards = isObject(lessonSupports) && Array.isArray(lessonSupports.referenceCards) ? lessonSupports.referenceCards : NONE;
  const id = text(sectionId);
  const seen = new Set();
  const pinned = [];
  cards.forEach((card) => {
    if (!isObject(card) || !text(card.id) || !text(card.skill) || seen.has(text(card.id))) return;
    const onThisSection = card.sections === undefined
      || (Array.isArray(card.sections) && card.sections.some((name) => (id && text(name) === id) || lower(name) === section));
    if (!onThisSection) return;
    seen.add(text(card.id));
    pinned.push(Object.freeze({ id: text(card.id), skill: text(card.skill) }));
  });
  return pinned.length ? Object.freeze(pinned) : NONE;
};
