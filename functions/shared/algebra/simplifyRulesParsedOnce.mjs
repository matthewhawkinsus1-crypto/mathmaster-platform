/*
 * MATHJS'S SIMPLIFY, WITH ITS DEFAULT RULES READ FROM TEXT ONCE.
 *
 * mathjs's simplify builds its rules again on every call (`_buildRules`): it
 * parses the text of its 51 written rules, 102 expressions, copies each tree
 * without its parentheses, and expands the rules whose operator is
 * associative. In node that is 0.6-0.9 ms of a 1-4 ms call; in the browser
 * it is a third of simplify's time; and it runs on every simplify a grader or
 * Step Algebra makes. Three quarters of it is the parsing.
 *
 * This hands mathjs's own simplify factory (`createSimplify`, unchanged) a
 * `parse` that keeps the tree it made for each default rule's text and hands
 * the same tree back every time after. Simplify copies the tree it parses
 * (to take out its parentheses) before it expands or uses a rule, and never
 * reads the tree itself again, so every call still builds its rules from an
 * identical, fresh copy and answers node for node as before. The copying and
 * expanding happen inside mathjs's simplify, where nothing outside it can
 * reach, and are left as they are.
 *
 *   - Only the default rules' own text is kept: a caller's own rules, and
 *     anything a student typed, are parsed exactly as before and never kept.
 *     A caller's rule that is written the same as a default one gets the same
 *     tree, which simplify copies the same way.
 *   - Each instance keeps its own trees, made with its own node classes, from
 *     the parser it was built with: the hardened instance's simplify is built
 *     before its namespace is locked (safeMath.mjs), as it always was.
 *   - Kept trees are frozen: nothing can change a rule after it is read.
 *   - The trees are made on the first simplify, never at import, and dropped
 *     when the instance's configuration changes (a number's type is read from
 *     it while parsing), so they are always the trees parsing would make now.
 *
 * tests/platform/simplifyRulesParsedOnce.test.mjs holds it to all of this,
 * and to mathjs's own simplify's answers, text and node structure, for every
 * way the platform calls it.
 */

// The text mathjs's simplify parses for each written rule, as `_canonicalizeRule`
// reads it: 'l -> r' text, `{ s: 'l -> r' }`, or `{ l, r }`.
const ruleTexts = (rules) => {
  const texts = new Set();
  for (const rule of rules) {
    const written = typeof rule === 'string' ? { s: rule } : rule;
    if (!written || typeof written !== 'object') continue;
    const sides = written.s ? String(written.s).split('->') : [written.l, written.r];
    if (sides.length !== 2) continue;
    for (const side of sides) if (typeof side === 'string') texts.add(side);
  }
  return texts;
};

const freezeTree = (tree) => {
  tree.traverse((node) => {
    for (const value of Object.values(node)) if (Array.isArray(value)) Object.freeze(value);
    Object.freeze(node);
  });
  return tree;
};

/**
 * mathjs's factories (`all`) with simplify's replaced by mathjs's own
 * `createSimplify`, given a parser that reads each default rule's text once
 * per instance. Pass the result to mathjs's `create`.
 */
export const withSimplifyRulesParsedOnce = (factories) => {
  const { createSimplify } = factories;
  const createSimplifyParsingRulesOnce = (scope) => {
    const { math, parse } = scope;
    const trees = new Map();
    let defaultTexts = new Set();
    const parseRuleText = (text, ...rest) => {
      if (rest.length || typeof text !== 'string' || !defaultTexts.has(text)) return parse(text, ...rest);
      let tree = trees.get(text);
      if (!tree) {
        tree = freezeTree(parse(text));
        trees.set(text, tree);
      }
      return tree;
    };
    const simplify = createSimplify({ ...scope, parse: parseRuleText });
    defaultTexts = ruleTexts(simplify.rules);
    math.on('config', () => trees.clear());
    return simplify;
  };
  // A mathjs factory, as mathjs's `factory()` makes one: named for the function
  // it builds, with the dependencies mathjs resolves for it (`math` for the
  // instance's configuration changes).
  createSimplifyParsingRulesOnce.isFactory = true;
  createSimplifyParsingRulesOnce.fn = createSimplify.fn;
  createSimplifyParsingRulesOnce.dependencies = [...createSimplify.dependencies, 'math'].sort();
  return Object.freeze({ ...factories, createSimplify: createSimplifyParsingRulesOnce });
};
