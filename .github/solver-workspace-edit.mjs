import { readFile, writeFile } from 'node:fs/promises';

const path = 'src/algebraAstEngine.js';
let source = await readFile(path, 'utf8');

const splitPattern = /export const splitAdditiveTerms = \(expression\) => \{[\s\S]*?\n\};\n\n\n\/\/ Multiplicative counterpart/;
const splitReplacement = `const additiveTermDescriptor = ({ node, sign }, index) => {
  let effectiveSign = sign < 0 ? -1 : 1;
  let magnitudeText = node.toString({ parenthesis: 'auto', implicit: 'hide' }).trim();
  let magnitudeLatex = cleanImplicitMultiplicationLatex(
    node.toTex({ parenthesis: 'keep', implicit: 'hide' }),
  ).trim();

  // MathJS can encode a negative coefficient inside an opaque product node
  // instead of as the additive chain's unary-minus sign. Canonicalize that
  // leading sign once, here at the AST/presentation boundary, so every caller
  // receives a true additive sign plus an unsigned magnitude. Transformation
  // code must never have to infer mathematical sign from display text again.
  const textCarriesNegative = /^-\\s*/.test(magnitudeText);
  const latexCarriesNegative = /^-\\s*/.test(magnitudeLatex);
  if (textCarriesNegative || latexCarriesNegative) {
    effectiveSign *= -1;
    magnitudeText = magnitudeText.replace(/^-\\s*/, '');
    magnitudeLatex = magnitudeLatex.replace(/^-\\s*/, '');
  }

  const isFirst = index === 0;
  const operator = effectiveSign < 0 ? '-' : '+';
  return {
    text: isFirst
      ? \\`\\${effectiveSign < 0 ? '-' : ''}\\${magnitudeText}\\`
      : \\`\\${operator} \\${magnitudeText}\\`,
    latex: isFirst
      ? \\`\\${effectiveSign < 0 ? '-' : ''}\\${magnitudeLatex}\\`
      : \\`\\${operator} \\${magnitudeLatex}\\`,
    sign: effectiveSign,
    magnitudeText,
    magnitudeLatex,
  };
};

export const splitAdditiveTerms = (expression) => {
  try {
    const parts = flattenAdditiveChain(parse(String(expression)), 1, []);
    return parts.map(additiveTermDescriptor);
  } catch {
    return null;
  }
};


// Multiplicative counterpart`;

if (!splitPattern.test(source)) {
  throw new Error('Could not locate splitAdditiveTerms block');
}
source = source.replace(splitPattern, splitReplacement);

const itemsPattern = /const items = terms\.map\(\(term\) => \(\{\n\s*sign: term\.sign < 0 \? -1 : 1,\n\s*magnitude: String\(term\.text\)\.replace\(\/\^\[\+\-\]\\\\s\*\/, ''\),\n\s*\}\)\);/;
const itemsReplacement = `const items = terms.map((term) => ({
    sign: term.sign < 0 ? -1 : 1,
    magnitude: term.magnitudeText,
  }));`;

if (!itemsPattern.test(source)) {
  throw new Error('Could not locate additive placement item reconstruction');
}
source = source.replace(itemsPattern, itemsReplacement);

await writeFile(path, source);
