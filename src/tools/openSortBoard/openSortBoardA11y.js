/*
 * WHERE KEYBOARD FOCUS GOES, AND WHAT EACH REPEATED BUTTON IS CALLED.
 *
 * Pure, so node can test it: the board itself is .jsx.
 *
 * A placement removes the card the student was on (controlled sort: the card
 * and the category button inside it unmount) or disables the button they
 * pressed (open sort: "Place selected card here" has nothing left to place).
 * Either way the browser drops focus to <body>, and a 12-card sort meant
 * tabbing back from the top of the page 12 times (A11Y-2). Focus goes instead
 * to the next card still to place — the one after the card just placed, in the
 * order the student sees them — or, after the last card, to the heading of the
 * group that card went into.
 *
 * And a board of identical "Place selected card here" / "Remove group" / "Graph
 * C ↩" buttons is unreadable by a screen reader (A11Y-7): each name says its
 * card and its group, and starts with the words on the button so a voice
 * control student can say what they see.
 */

const text = (value) => String(value ?? '').trim();

export const cardName = (item, fallbackId = '') => text(item?.label) || text(item?.id) || text(fallbackId);

/** "Group 2 · Linear" in the open sort; the category's own name when controlled. */
export const groupName = (group, index, { controlled = false } = {}) => {
  const name = text(group?.name);
  if (controlled) return name || `Group ${index + 1}`;
  return `Group ${index + 1}${name ? ` · ${name}` : ''}`;
};

/**
 * Where focus goes after `placedId` is placed in `groupId`.
 * `unplacedBefore` is the list of cards still to place as the student saw it,
 * the placed card included.
 */
export const focusAfterPlacement = ({ unplacedBefore = [], placedId, groupId }) => {
  const ids = unplacedBefore.map((item) => String(item?.id ?? item));
  const at = ids.indexOf(String(placedId));
  const remaining = ids.filter((id) => id !== String(placedId));
  if (!remaining.length) return { kind: 'group', id: String(groupId) };
  // The card after the one just placed; past the end, the one before it.
  const next = at < 0 ? remaining[0] : (remaining[at] ?? remaining[remaining.length - 1]);
  return { kind: 'card', id: next };
};

/** Where focus goes when a card is taken back out: to that card, now unplaced. */
export const focusAfterReturn = (itemId) => ({ kind: 'card', id: String(itemId) });

/**
 * After a group is removed its buttons are gone: focus goes to the heading of
 * the group that took its place in the list, or the one before it when it was
 * the last.
 */
export const focusAfterRemovingGroup = ({ groupsBefore = [], removedId }) => {
  const at = groupsBefore.findIndex((group) => String(group?.id) === String(removedId));
  const remaining = groupsBefore.filter((group) => String(group?.id) !== String(removedId));
  if (!remaining.length) return null;
  const target = remaining[Math.min(Math.max(at, 0), remaining.length - 1)];
  return { kind: 'group', id: String(target.id) };
};

export const placeButtonName = ({ selectedCard, group, index }) => (
  selectedCard
    ? `Place ${selectedCard} here, in ${groupName(group, index)}`
    : `Select a card first, then place it in ${groupName(group, index)}`
);

export const placeButtonText = (selectedCard) => (selectedCard ? `Place ${selectedCard} here` : 'Select a card first');

export const removeGroupName = (group, index) => `Remove group ${index + 1}${text(group?.name) ? ` · ${text(group.name)}` : ''}`;

export const placedCardName = ({ card, group, index, controlled = false }) => (
  `${card}: take it out of ${groupName(group, index, { controlled })}`
);

export const categoryButtonName = ({ category, card }) => `${text(category?.label) || text(category?.id)}: place ${card} here`;

export const groupNameInputLabel = (index) => `Name this group (Group ${index + 1})`;

/**
 * Each group's "Why do these belong together?" box. Every group showed the same
 * visible label, so a screen reader heard four identical boxes (pass 3,
 * TOOLS_KEYBOARD_UNDO "Not done"). The name starts with the words on screen
 * and says which group.
 */
export const rationaleInputLabel = (group, index) => `Why do these belong together? (${groupName(group, index)})`;

export const placementAnnouncement = ({ card, group, index, remaining, controlled = false }) => (
  `${card} placed in ${groupName(group, index, { controlled })}. ${remaining
    ? `${remaining} card${remaining === 1 ? '' : 's'} left to place.`
    : 'Every card is placed.'}`
);
