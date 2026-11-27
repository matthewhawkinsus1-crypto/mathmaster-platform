/*
 * THE BUILT-IN REFERENCE CARDS (WE-H; WORKED_EXAMPLES.md section 4).
 *
 * A reference card is a formula or pattern with its parts named, pinned on a
 * lesson's Classwork and Practice. The authoring contract (AG-1,
 * lessonSupportsV5.js) gives a card only { id, skill, sections }: the lesson
 * names the skill and the platform supplies the card. This file is that
 * supply, keyed by skill. A card whose skill is not here is not shown.
 *
 * Each card is data, never anything about a question: its title, one or more
 * formulas as LaTeX, and its parts, each part with its own LaTeX and what it
 * is. Every sentence is written in English and in Spanish, and both say the
 * same mathematics in the same order (readingFor), so Translate can show the
 * Spanish as the platform's own words for the card (SupportedText.jsx
 * `authored`), and Read aloud says either.
 *
 * Loaded only with the card (ReferenceCards.jsx), which QuestionEngine loads
 * only where a card is pinned: a DOL, quiz, test or Home never fetches it.
 */

const freezeDeep = (value) => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
};

/** The card's fixed words, in English and Spanish. */
export const REFERENCE_CARD_TEXT = freezeDeep({
  en: {
    name: 'Reference card',
    names: 'Reference cards',
    note: 'Pinned for this lesson. Look back at it whenever you need to.',
    parts: 'The parts, named',
    readLabel: 'the reference card',
  },
  es: {
    name: 'Tarjeta de referencia',
    names: 'Tarjetas de referencia',
    note: 'Fijada para esta lección. Vuelve a mirarla siempre que la necesites.',
    parts: 'Las partes, con nombre',
    readLabel: 'la tarjeta de referencia',
  },
});

/*
 * The cards. `skill` is the id a lesson writes; `aliases` are other spellings
 * of the same skill that lessons and Question Families use. A part's `latex`
 * is what it is called in the formula; `says` is what it is.
 */
const CARDS = [
  {
    skill: 'factor.sumDifferenceOfCubes',
    aliases: ['factor.sumOfCubes', 'factor.differenceOfCubes', 'polynomials.sumDifferenceOfCubes'],
    title: { en: 'Sum and difference of cubes', es: 'Suma y diferencia de cubos' },
    formulas: [
      { label: { en: 'Sum of cubes', es: 'Suma de cubos' }, latex: 'a^3 + b^3 = (a + b)(a^2 - ab + b^2)' },
      { label: { en: 'Difference of cubes', es: 'Diferencia de cubos' }, latex: 'a^3 - b^3 = (a - b)(a^2 + ab + b^2)' },
    ],
    parts: [
      { latex: 'a', says: { en: 'the cube root of the first term', es: 'la raíz cúbica del primer término' } },
      { latex: 'b', says: { en: 'the cube root of the second term', es: 'la raíz cúbica del segundo término' } },
      { latex: 'a \\pm b', says: { en: 'the binomial: the same sign as the sum or difference', es: 'el binomio: el mismo signo que la suma o la diferencia' } },
      { latex: 'a^2 - ab + b^2 \\text{ or } a^2 + ab + b^2', says: { en: 'the trinomial: its middle sign is the opposite one, and the last sign is always plus', es: 'el trinomio: el signo del medio es el opuesto, y el último signo siempre es más' } },
    ],
  },
  {
    skill: 'factor.differenceOfSquares',
    aliases: ['polynomials.differenceOfSquares'],
    title: { en: 'Difference of squares', es: 'Diferencia de cuadrados' },
    formulas: [
      { label: { en: 'Difference of squares', es: 'Diferencia de cuadrados' }, latex: 'a^2 - b^2 = (a + b)(a - b)' },
    ],
    parts: [
      { latex: 'a', says: { en: 'the square root of the first term', es: 'la raíz cuadrada del primer término' } },
      { latex: 'b', says: { en: 'the square root of the second term', es: 'la raíz cuadrada del segundo término' } },
      { latex: '(a + b)(a - b)', says: { en: 'one sum and one difference of the same two roots', es: 'una suma y una diferencia de las mismas dos raíces' } },
    ],
  },
  {
    skill: 'factor.perfectSquareTrinomial',
    aliases: ['polynomials.perfectSquareTrinomial'],
    title: { en: 'Perfect square trinomials', es: 'Trinomios cuadrados perfectos' },
    formulas: [
      { label: { en: 'Square of a sum', es: 'Cuadrado de una suma' }, latex: 'a^2 + 2ab + b^2 = (a + b)^2' },
      { label: { en: 'Square of a difference', es: 'Cuadrado de una diferencia' }, latex: 'a^2 - 2ab + b^2 = (a - b)^2' },
    ],
    parts: [
      { latex: 'a', says: { en: 'the square root of the first term', es: 'la raíz cuadrada del primer término' } },
      { latex: 'b', says: { en: 'the square root of the last term', es: 'la raíz cuadrada del último término' } },
      { latex: '2ab', says: { en: 'the middle term: twice the product of the two roots', es: 'el término del medio: el doble del producto de las dos raíces' } },
    ],
  },
  {
    skill: 'factor.trinomialAC',
    aliases: ['factor.acMethod', 'polynomials.factorTrinomial'],
    title: { en: 'Factoring by the a·c method', es: 'Factorizar con el método a·c' },
    formulas: [
      { label: { en: 'Find two numbers', es: 'Busca dos números' }, latex: 'pq = ac \\text{ and } p + q = b' },
      { label: { en: 'Split the middle term', es: 'Divide el término del medio' }, latex: 'ax^2 + bx + c = ax^2 + px + qx + c' },
    ],
    parts: [
      { latex: 'a', says: { en: 'the leading coefficient, the number with x squared', es: 'el coeficiente principal, el número con x al cuadrado' } },
      { latex: 'b', says: { en: 'the middle coefficient, the number with x', es: 'el coeficiente del medio, el número con x' } },
      { latex: 'c', says: { en: 'the constant term', es: 'el término constante' } },
      { latex: 'p, q', says: { en: 'two numbers that multiply to a times c and add to b; then factor by grouping', es: 'dos números cuyo producto es a por c y cuya suma es b; luego factoriza por agrupación' } },
    ],
  },
  {
    skill: 'lines.slopeInterceptForm',
    aliases: ['linear.slopeInterceptForm', 'linear.graphFromSlopeIntercept'],
    title: { en: 'Slope-intercept form', es: 'Forma pendiente-intersección' },
    formulas: [
      { label: { en: 'Slope-intercept form', es: 'Forma pendiente-intersección' }, latex: 'y = mx + b' },
    ],
    parts: [
      { latex: 'm', says: { en: 'the slope: the rise over the run', es: 'la pendiente: el cambio vertical sobre el cambio horizontal' } },
      { latex: 'b', says: { en: 'the y-intercept: where the line crosses the y-axis', es: 'la intersección con el eje y: donde la recta cruza el eje y' } },
      { latex: '(0, b)', says: { en: 'the point on the y-axis', es: 'el punto sobre el eje y' } },
    ],
  },
  {
    skill: 'lines.pointSlopeForm',
    aliases: ['linear.pointSlopeForm'],
    title: { en: 'Point-slope form', es: 'Forma punto-pendiente' },
    formulas: [
      { label: { en: 'Point-slope form', es: 'Forma punto-pendiente' }, latex: 'y - y_1 = m(x - x_1)' },
    ],
    parts: [
      { latex: 'm', says: { en: 'the slope', es: 'la pendiente' } },
      { latex: '(x_1, y_1)', says: { en: 'one point the line passes through', es: 'un punto por el que pasa la recta' } },
    ],
  },
  {
    skill: 'lines.slopeFormula',
    aliases: ['lines.slopeFromTwoPoints', 'linear.slopeFromPoints', 'linear.slopeFormula'],
    title: { en: 'The slope formula', es: 'La fórmula de la pendiente' },
    formulas: [
      { label: { en: 'Slope through two points', es: 'Pendiente entre dos puntos' }, latex: 'm = \\frac{y_2 - y_1}{x_2 - x_1}' },
    ],
    parts: [
      { latex: '(x_1, y_1), (x_2, y_2)', says: { en: 'the two points, subtracted in the same order', es: 'los dos puntos, restados en el mismo orden' } },
      { latex: 'y_2 - y_1', says: { en: 'the rise: the change in y', es: 'el cambio vertical: el cambio en y' } },
      { latex: 'x_2 - x_1', says: { en: 'the run: the change in x', es: 'el cambio horizontal: el cambio en x' } },
    ],
  },
  {
    skill: 'lines.standardForm',
    aliases: ['linear.standardForm'],
    title: { en: 'Standard form of a line', es: 'Forma estándar de una recta' },
    formulas: [
      { label: { en: 'Standard form', es: 'Forma estándar' }, latex: 'Ax + By = C' },
    ],
    parts: [
      { latex: 'A, B, C', says: { en: 'integers, with A and B not both zero', es: 'números enteros, con A y B que no son cero los dos' } },
      { latex: '\\left(\\frac{C}{A}, 0\\right)', says: { en: 'the x-intercept: put $y = 0$', es: 'la intersección con el eje x: pon $y = 0$' } },
      { latex: '\\left(0, \\frac{C}{B}\\right)', says: { en: 'the y-intercept: put $x = 0$', es: 'la intersección con el eje y: pon $x = 0$' } },
    ],
  },
  {
    skill: 'quadratics.quadraticFormula',
    aliases: ['quadratics.solveByFormula', 'quadratic.quadraticFormula'],
    title: { en: 'The quadratic formula', es: 'La fórmula cuadrática' },
    formulas: [
      { label: { en: 'For $ax^2 + bx + c = 0$', es: 'Para $ax^2 + bx + c = 0$' }, latex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}' },
    ],
    parts: [
      { latex: 'a, b, c', says: { en: 'the coefficients, once the equation equals zero', es: 'los coeficientes, cuando la ecuación es igual a cero' } },
      { latex: 'b^2 - 4ac', says: { en: 'the discriminant: positive, two real solutions; zero, one; negative, none that are real', es: 'el discriminante: positivo, dos soluciones reales; cero, una; negativo, ninguna real' } },
      { latex: '\\pm', says: { en: 'plus or minus: one solution with each sign', es: 'más o menos: una solución con cada signo' } },
    ],
  },
  {
    skill: 'quadratics.vertexForm',
    aliases: ['quadratic.vertexForm'],
    title: { en: 'Vertex form of a parabola', es: 'Forma de vértice de una parábola' },
    formulas: [
      { label: { en: 'Vertex form', es: 'Forma de vértice' }, latex: 'y = a(x - h)^2 + k' },
    ],
    parts: [
      { latex: '(h, k)', says: { en: 'the vertex', es: 'el vértice' } },
      { latex: 'x = h', says: { en: 'the axis of symmetry', es: 'el eje de simetría' } },
      { latex: 'a', says: { en: 'opens up when positive and down when negative; the larger its size, the narrower the parabola', es: 'abre hacia arriba si es positivo y hacia abajo si es negativo; cuanto mayor su valor absoluto, más estrecha la parábola' } },
    ],
  },
  {
    skill: 'theorems.remainder',
    aliases: ['theorems.remainderTheorem', 'polynomials.remainderTheorem'],
    title: { en: 'The remainder theorem', es: 'El teorema del residuo' },
    formulas: [
      { label: { en: 'Dividing by $x - c$', es: 'Al dividir entre $x - c$' }, latex: 'P(x) = (x - c) \\cdot Q(x) + R' },
      { label: { en: 'The remainder', es: 'El residuo' }, latex: 'R = P(c)' },
    ],
    parts: [
      { latex: 'P(x)', says: { en: 'the polynomial being divided', es: 'el polinomio que se divide' } },
      { latex: 'x - c', says: { en: 'the divisor', es: 'el divisor' } },
      { latex: 'Q(x)', says: { en: 'the quotient', es: 'el cociente' } },
      { latex: 'R', says: { en: 'the remainder; when it is $0$, $x - c$ is a factor', es: 'el residuo; cuando es $0$, $x - c$ es un factor' } },
    ],
  },
  {
    skill: 'transformations.combined',
    aliases: ['transformations.readAHK', 'transformations.generalForm'],
    title: { en: 'Transformations of a function', es: 'Transformaciones de una función' },
    formulas: [
      { label: { en: 'From the parent function $f$', es: 'A partir de la función madre $f$' }, latex: 'g(x) = a\\,f(b(x - h)) + k' },
    ],
    parts: [
      { latex: 'a', says: { en: 'a vertical stretch or shrink; a negative a reflects over the x-axis', es: 'un estiramiento o una compresión vertical; una a negativa refleja sobre el eje x' } },
      { latex: 'b', says: { en: 'a horizontal stretch or shrink; a negative b reflects over the y-axis', es: 'un estiramiento o una compresión horizontal; una b negativa refleja sobre el eje y' } },
      { latex: 'h', says: { en: 'the shift right (left when negative)', es: 'el desplazamiento a la derecha (a la izquierda si es negativo)' } },
      { latex: 'k', says: { en: 'the shift up (down when negative)', es: 'el desplazamiento hacia arriba (hacia abajo si es negativo)' } },
    ],
  },
];

export const REFERENCE_CARDS = freezeDeep(CARDS.map((card) => ({ ...card, id: card.skill })));

const BY_SKILL = new Map(REFERENCE_CARDS.flatMap((card) => [card.skill, ...card.aliases].map((skill) => [skill.toLowerCase(), card])));

/** The built-in card for a skill (or one of its aliases), or null. */
export const referenceCardFor = (skill) => (
  typeof skill === 'string' ? BY_SKILL.get(skill.trim().toLowerCase()) || null : null
);

/** The languages the card's fixed words are written in. */
export const REFERENCE_CARD_LANGUAGES = Object.freeze(Object.keys(REFERENCE_CARD_TEXT));

const languageOf = (language) => {
  const code = String(language || 'en').toLowerCase().split('-')[0];
  return REFERENCE_CARD_LANGUAGES.includes(code) ? code : null;
};

/*
 * The card as one text, for Read aloud and Translate: its name, its title,
 * each formula with its label, and each part with what it is. The mathematics
 * is the same, in the same order, in every language, so a translation always
 * carries the English's mathematics exactly. Null for a language the card is
 * not written in.
 */
export const readingFor = (card, language = 'en') => {
  const code = languageOf(language);
  if (!card || !code) return null;
  const words = REFERENCE_CARD_TEXT[code];
  return [
    `${words.name}: ${card.title[code]}.`,
    ...card.formulas.map((formula) => `${formula.label[code]}: $${formula.latex}$.`),
    `${words.parts}:`,
    ...card.parts.map((part) => `$${part.latex}$, ${part.says[code]}.`),
  ].join(' ');
};
