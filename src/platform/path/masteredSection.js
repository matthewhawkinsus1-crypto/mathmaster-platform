// The Mastered section of the Path map: every mastered skill, reachable.
//
// The map used to cut Mastered at six (pathMap DEFAULT_LIMITS) while the
// header beside it counted all of them. A student who had mastered eight read
// "8 of 48 skills mastered" above six cards, and the other two — work they
// had genuinely finished, and might want to practise again — were nowhere on
// the screen.
//
// The map now returns every mastered skill. The section opens on the first
// six, so a long year of mastered work does not bury the sections above it,
// and a "Show all N mastered skills" toggle reveals the rest. Nothing is
// hidden without a control that shows it, and the toggle names the count the
// header already states.
//
// Pure: the component keeps the expanded/collapsed state and renders this.

export const MASTERED_PREVIEW_COUNT = 6;

/**
 * Which mastered cards to draw, and the toggle that reveals the rest.
 *
 * `nodes` is the map's full `mastered` list. Returns the cards to render,
 * the total, how many are folded away, and the toggle's label (null when
 * everything already fits, so no control is drawn).
 */
export const masteredSectionView = (nodes = [], { expanded = false, previewCount = MASTERED_PREVIEW_COUNT } = {}) => {
  const all = Array.isArray(nodes) ? nodes.filter(Boolean) : [];
  const preview = Math.max(1, Math.floor(Number(previewCount) || MASTERED_PREVIEW_COUNT));
  const collapsible = all.length > preview;
  const open = collapsible && Boolean(expanded);
  const visible = collapsible && !open ? all.slice(0, preview) : all;
  return {
    visible,
    total: all.length,
    hiddenCount: all.length - visible.length,
    collapsible,
    expanded: open,
    toggleLabel: !collapsible ? null : open ? 'Show fewer mastered skills' : `Show all ${all.length} mastered skills`,
  };
};

export default masteredSectionView;
