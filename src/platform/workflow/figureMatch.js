// MATCHING FIGURES TO CATEGORIES — the pure half.
//
// Recognition is a different act from recall. A student who cannot yet WRITE
// an exponential function can very often pick the exponential out of a row of
// graphs, and a question that only ever asks for the written form never finds
// that out. This stage asks the recognition question directly: here are
// several figures and several named categories; say which is which.
//
// ONE RULE DOMINATES THE DESIGN: THE FIGURES ARE NAMED BY THE PLATFORM.
//
// The failure this replaces is real and was shipping — figures lettered A, B,
// C where "L" happened to be the linear one and "E" the exponential. Once a
// name carries a hint, the question stops measuring recognition and starts
// measuring whether the student noticed the initial. Rejecting bad names at
// Preflight would only catch the ones we thought of, so the author does not
// get to name a figure at all: they are Figure 1, Figure 2, Figure 3 in the
// order they are written, and a cueing name is not a mistake to catch but a
// thing that cannot be expressed.
//
// The author still needs a handle to write the answer key against. That is the
// item `id`, which is never rendered and never reaches the DOM.
//
// Pure: no React. The renderer is FigureMatchStage.jsx.

export const FIGURE_MATCH_ARTIFACT = 'figureMatch';

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value : []);
const text = (value) => String(value ?? '').trim();

/** What Figure N is called on screen. The author has no say in this. */
export const figureLabel = (index) => `Figure ${index + 1}`;

export const matchItems = (stage) => list(stage?.items).filter(isObject);
export const matchCategories = (stage) => list(stage?.categories).filter(isObject);

/** The student's answer, as a plain item id -> category id map. */
export const readFigureMatch = (value) => {
  if (!isObject(value)) return {};
  const source = isObject(value.assignments) ? value.assignments : {};
  const assignments = {};
  Object.keys(source).forEach((itemId) => {
    const category = text(source[itemId]);
    if (category) assignments[itemId] = category;
  });
  return assignments;
};

export const isFigureMatchComplete = (stage, value) => {
  const items = matchItems(stage);
  if (!items.length) return false;
  const assignments = readFigureMatch(value);
  return items.every((item) => Boolean(assignments[text(item.id)]));
};

export const buildFigureMatchResponse = (stage, assignments) => ({
  __mathmasterWorkflowArtifact: FIGURE_MATCH_ARTIFACT,
  assignments,
  isComplete: isFigureMatchComplete(stage, { assignments }),
});

/**
 * Everything about a matching stage that would reach a student broken.
 *
 * Returned as sentence fragments so the caller can prefix them with which
 * question and stage they belong to, the way choicePreviewProblems does.
 */
export const figureMatchProblems = (stage) => {
  const problems = [];
  const items = matchItems(stage);
  const categories = matchCategories(stage);

  if (items.length < 2) problems.push('needs at least two figures to match.');
  if (categories.length < 2) problems.push('needs at least two categories to match them to.');

  const itemIds = items.map((item) => text(item.id));
  if (itemIds.some((id) => !id)) problems.push('has a figure with no `id` for the answer key to refer to.');
  if (new Set(itemIds.filter(Boolean)).size !== itemIds.filter(Boolean).length) {
    problems.push('has two figures with the same `id`, so the answer key cannot tell them apart.');
  }

  const categoryIds = categories.map((category) => text(category.id));
  if (categoryIds.some((id) => !id)) problems.push('has a category with no `id`.');
  if (new Set(categoryIds.filter(Boolean)).size !== categoryIds.filter(Boolean).length) {
    problems.push('has two categories with the same `id`.');
  }
  if (categories.some((category) => !text(category.label))) {
    problems.push('has a category with no label for the student to read.');
  }

  // The platform names the figures. An authored name is not silently dropped,
  // because an author who wrote one believes the student can see it.
  if (items.some((item) => text(item.label))) {
    problems.push(
      'names its own figures. Figures are labeled Figure 1, Figure 2, … by the platform '
      + 'so a name can never hint at the category; use `id` for the answer key instead.',
    );
  }

  // A figure with nothing in it renders as an empty card the student cannot
  // answer, and a figure carrying two representations is ambiguous about which
  // one is being classified.
  items.forEach((item, index) => {
    const drawn = [isObject(item.graph), Boolean(text(item.math)), Boolean(text(item.text))].filter(Boolean).length;
    if (drawn === 0) problems.push(`has nothing to show for ${figureLabel(index)}: give it a \`graph\`, \`math\`, or \`text\`.`);
    if (drawn > 1) problems.push(`shows more than one thing for ${figureLabel(index)}; a figure is one representation.`);
  });

  return problems;
};

/**
 * The answer key, checked against the stage it grades.
 *
 * Separate from figureMatchProblems because grading rules are validated in a
 * different pass and are never handed to a renderer.
 */
export const figureMatchKeyProblems = (stage, rule) => {
  const key = isObject(rule?.match) ? rule.match : null;
  if (!key) return [];
  const problems = [];
  const itemIds = new Set(matchItems(stage).map((item) => text(item.id)).filter(Boolean));
  const categoryIds = new Set(matchCategories(stage).map((category) => text(category.id)).filter(Boolean));

  Object.keys(key).forEach((itemId) => {
    if (!itemIds.has(itemId)) problems.push(`keys a figure "${itemId}" that this step does not show.`);
    const answer = text(key[itemId]);
    if (answer && !categoryIds.has(answer)) {
      problems.push(`answers "${itemId}" with "${answer}", which is not one of the categories offered.`);
    }
  });

  const unkeyed = [...itemIds].filter((id) => !(id in key));
  if (unkeyed.length) problems.push(`leaves ${unkeyed.length} figure(s) out of the answer key.`);

  return problems;
};
