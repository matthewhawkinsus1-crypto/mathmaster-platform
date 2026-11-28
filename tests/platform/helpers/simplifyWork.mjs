// The work a mathjs instance is asked for, counted on its own node classes
// (issue #559; simplifyFirstMatch.test.mjs, stepAlgebraManyTermsReopen.test.mjs).
/*
 * THE WORK, COUNTED. mathjs's own search writes out every match it makes as
 * JSON, and a match holds whole subtrees, so the nodes it serialises are its
 * work: toJSON is called once for each node of each match. simplifyCore and
 * the rest walk the tree with forEach. Both are counted, on the instance's
 * own node classes.
 */
const NODE_CLASSES = ['OperatorNode', 'ConstantNode', 'SymbolNode', 'FunctionNode', 'ParenthesisNode'];
export const countedWork = (math, work) => {
  const counts = { serialised: 0, visited: 0 };
  const restore = [];
  const wrap = (prototype, method, key) => {
    const original = prototype[method];
    restore.push(() => { prototype[method] = original; });
    prototype[method] = function counted(...args) {
      counts[key] += 1;
      return original.apply(this, args);
    };
  };
  for (const name of NODE_CLASSES) wrap(math[name].prototype, 'toJSON', 'serialised');
  wrap(math.OperatorNode.prototype, 'forEach', 'visited');
  try {
    work();
  } finally {
    restore.forEach((undo) => undo());
  }
  return counts;
};
export const totalWork = ({ serialised, visited }) => serialised + visited;
