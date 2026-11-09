// --shard=i/n FOR A DRIVER THAT WALKS A LIST OF SCREENS (studentShellLargeText.mjs: CI runs its teacher sweep in
// three jobs, browser-teacher-large-text 1/3 to 3/3).
//
// A screen is { id, open?, scenes: [...] }. Its scenes run on one page, in order, each from where the last one left
// it: the Pre-Flight review's steps, a Live Challenge game played on from its lobby, the Find palette and then its
// results. A slice that began in the middle of a screen would begin at a scene it cannot reach, so a slice takes
// whole screens.
//
// The slices are runs of the list in its own order, cut where the running cost crosses 1/n, 2/n … of the whole: each
// screen goes to the slice that holds its middle. A screen costs one for opening it and one per scene (on CI, opening
// a teacher screen took about as long as one of its scenes, 2026-11-06). So the same list always cuts the same way,
// every scene is in exactly one slice, and the slices are as even as whole screens allow.
//
// Pure, so tests/platform/accessibilityCiShards.test.mjs reads it in node.

/** `i/n` → { index: i, count: n }; no value → null (the whole list). Anything else throws. */
export const parseShard = (value) => {
  if (value == null) return null;
  const match = /^(\d+)\/(\d+)$/.exec(String(value).trim());
  const index = Number(match?.[1]);
  const count = Number(match?.[2]);
  if (!match || index < 1 || count < 1 || index > count) {
    throw new Error(`--shard=${value}: give i/n, with 1 <= i <= n (--shard=2/3 is the second of three)`);
  }
  return { index, count };
};

const costOf = (screen) => 1 + (screen.scenes?.length || 0);

/** The screens of slice `index` of `count`, whole and in the list's order. */
export const shardOf = (screens, { index, count }) => {
  const total = screens.reduce((sum, screen) => sum + costOf(screen), 0);
  let before = 0;
  return screens.filter((screen) => {
    const middle = before + costOf(screen) / 2;
    before += costOf(screen);
    return Math.min(count - 1, Math.floor((middle * count) / total)) === index - 1;
  });
};

/**
 * The items of slice `index` of `count` of a flat list, each item whole and of cost one, in the list's order; the
 * whole list with no shard. For a driver whose every scene opens its own pages (keyboardSweep.mjs), so any scene can
 * begin a slice.
 */
export const itemsOfShard = (items, shard) => (shard
  ? shardOf(items.map((item, at) => ({ at, scenes: [] })), shard).map(({ at }) => items[at])
  : items);
