/*
 * Remove comments before scanning source for a rule about what SHIPS.
 *
 * Two tests in this suite sweep the codebase for patterns that must not appear
 * in running code — a generic "AI recommended" label, a profile field that is
 * never produced. Both sweeps failed on their first run, and both failed on
 * COMMENTS: prose explaining why the code avoids the thing being searched for.
 *
 * That is backwards twice over. The rules are about what the software does, not
 * about what it says about itself; and punishing the files that document a
 * constraint most carefully is a reliable way to get the documentation deleted
 * to make a test pass.
 *
 * The stripping is deliberately conservative. It cannot tell a `//` inside a
 * string literal from a comment, so a URL in a string loses its tail — which
 * can only ever cause a MISSED match, never a false one. For a guard whose job
 * is to fail loudly on real offences, erring towards silence on exotic input is
 * the right direction; the alternative is a JavaScript parser, and the cost of
 * that is not worth the last percent of coverage here.
 */
export const stripComments = (source) => String(source || '')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1');

export default stripComments;
