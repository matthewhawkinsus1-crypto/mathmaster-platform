/*
 * CURATED SPANISH FOR WHAT A FIGURE SAYS (AX05) — loaded on demand by
 * ../figureSay.js, only when Read aloud reads a question in Spanish (an
 * authored Spanish translation is on the screen); never in a student's
 * initial bundle.
 *
 * Each entry is the Spanish for one of the platform's own figure sentences,
 * by the message id its generator gives it: GRAPH_WORDS
 * (../graphDescription.js), NUMBER_LINE_WORDS (../numberLineDescription.js)
 * and AXIS_TITLE_WORDS (../../../tools/shared/planeAxisTitles.js). The pieces
 * are the figure's own: a number, a coordinate, a count or a label is placed
 * exactly as it comes, so "−6", "(2, 1)" and "13/8" are the same in both
 * languages, and a label or an axis quantity is said as the screen shows it.
 * A figure whose reading has any sentence without Spanish here is read in
 * English, and the reader says so (../questionReading.js).
 *
 * Written for this pack from the English the generators say (not machine
 * translated), with the words ./esSupport.js already uses ("recta", "círculo
 * abierto", "línea discontinua"). A Spanish-speaking math teacher should
 * review it before it is relied on, as for the rest of the Spanish packs.
 *
 * tests/platform/figureReadingSpanish.test.mjs holds the ids to the English
 * vocabularies and the numbers to the English readings.
 */

const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
// "A, B y C": no comma before the last item in Spanish.
const list = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`);
const capitalize = (text) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

export const words = Object.freeze({
  /* ---------------------------------------------------- the coordinate plane */
  window: (x0, x1, y0, y1) => `El eje x va de ${x0} a ${x1} y el eje y, de ${y0} a ${y1}.`,
  xRange: (x0, x1) => `El eje x va de ${x0} a ${x1}.`,
  yRange: (y0, y1) => `El eje y va de ${y0} a ${y1}.`,
  about: (value) => `aproximadamente ${value}`,
  axisNumbersHidden: () => 'Los números de los ejes no se muestran.',
  xAxisNumbersHidden: () => 'Los números del eje x no se muestran.',
  yAxisNumbersHidden: () => 'Los números del eje y no se muestran.',
  lineCount: (n) => `${count(n, 'recta', 'rectas')}.`,
  // "Trazo": a curve drawn solid, never a "continuous" function.
  curveCount: (n) => (n > 1 ? `${n} curvas: la primera con trazo continuo y las demás con trazo discontinuo.` : '1 curva.'),
  dashedVerticalCount: (n) => `${count(n, 'recta vertical discontinua', 'rectas verticales discontinuas')}.`,
  solidVerticalCount: (n) => `${count(n, 'recta vertical continua', 'rectas verticales continuas')}.`,
  dashedHorizontalCount: (n) => `${count(n, 'recta horizontal discontinua', 'rectas horizontales discontinuas')}.`,
  pathCount: (n) => `${count(n, 'línea poligonal', 'líneas poligonales')}.`,
  regionCount: (n) => `${count(n, 'región sombreada', 'regiones sombreadas')}.`,
  givenMarks: (dots, labels, open, closed, arrows) => {
    const parts = [
      dots ? `${count(dots, 'punto', 'puntos')}${labels.length ? ` con ${labels.length === 1 ? 'la etiqueta' : 'las etiquetas'} ${list(labels)}` : ''}` : '',
      open ? count(open, 'círculo abierto', 'círculos abiertos') : '',
      closed ? count(closed, 'círculo cerrado', 'círculos cerrados') : '',
      arrows ? count(arrows, 'punta de flecha', 'puntas de flecha') : '',
    ].filter(Boolean);
    return `${capitalize(list(parts))}.`;
  },
  plotted: (pairs) => `Marcaste ${count(pairs.length, 'punto', 'puntos')}: ${pairs.join('; ')}.`,
  pairApprox: (x, y) => `(x ${x}, y ${y})`,
  between: (lower, upper) => `entre ${lower} y ${upper}`,
  nothingPlotted: () => 'No hay nada graficado.',
  nothingPlottedYet: () => 'Todavía no hay nada graficado.',
  undescribedMarks: () => 'También muestra marcas que dibuja la actividad y que no se describen aquí.',
  positionsWithheld: () => 'Las posiciones no se leen mientras se pueda responder esta pregunta.',
  givenPositionsWithheld: () => 'Las posiciones de las marcas dadas no se leen mientras se pueda responder esta pregunta.',
  positionsNotReadHere: () => 'En esta pregunta no se leen las posiciones.',
  segmentsFromOrigin: () => 'Un segmento une el origen con cada punto.',
  oneCurve: () => '1 curva.',
  oneShadedRegion: () => '1 región sombreada.',
  regionWhereAllTrue: () => '1 región sombreada, donde todas las desigualdades son verdaderas.',
  noRegionShadedYet: () => 'Todavía no hay ninguna región sombreada.',
  scaleSame: () => 'Ahora los dos ejes usan la misma escala.',
  scaleCounts: (x, y) => `El eje x va de ${x} en ${x} y el eje y, de ${y} en ${y}.`,
  xAxisShows: (quantity) => `El eje x horizontal muestra ${quantity}.`,
  yAxisShows: (quantity) => `El eje y vertical muestra ${quantity}.`,

  /* --------------------------------------------------------- the number line */
  numberLine: (min, max) => `Recta numérica de ${min} a ${max}.`,
  numberLineLabelled: (min, max, step) => `Recta numérica de ${min} a ${max}, con números cada ${step}.`,
  nothingDrawn: () => 'No hay nada dibujado en ella.',
  nothingDrawnYet: () => 'Todavía no hay nada dibujado en ella.',
  yourGraph: (piece) => `Tu gráfica: ${piece}`,
  givenGraph: (piece) => `La gráfica: ${piece}`,
  yourGraphParts: (n) => `Tu gráfica tiene ${n} partes.`,
  givenGraphParts: (n) => `La gráfica tiene ${n} partes.`,
  part: (index, piece) => `Parte ${index}: ${piece}`,
  closedDot: (value) => `un círculo cerrado en ${value}`,
  openDot: (value) => `un círculo abierto en ${value}`,
  wholeLineShaded: () => 'Toda la recta está sombreada, con una flecha en cada extremo.',
  shadedLeft: (dot) => `Sombreada desde ${dot} hacia la izquierda, terminando en una flecha.`,
  shadedRight: (dot) => `Sombreada desde ${dot} hacia la derecha, terminando en una flecha.`,
  dotOnly: (dot) => `${capitalize(dot)}, sin sombreado.`,
  shadedBetween: (left, right) => `Sombreada desde ${left} hasta ${right}.`,
  pendingDot: (dot) => `${capitalize(dot)} está colocado y espera un segundo extremo o un rayo.`,
  pointChoices: (marks) => `Recta numérica con puntos en ${list(marks)}.`,
  bareNumberLine: () => 'Recta numérica.',
  noPointSelected: () => 'Todavía no hay ningún punto seleccionado.',
  pointSelected: (value) => `Seleccionado: ${value}.`,
});

/*
 * The platform's own names for a figure or a table (an aria label or a title
 * a screen gives it when the author gave none). A name the author wrote is
 * the item's own words and is said as written.
 */
const LABELS = Object.freeze({
  'Question graph': 'Gráfica de la pregunta',
  'Coordinate graph': 'Gráfica de coordenadas',
  'Coordinate plane': 'Plano de coordenadas',
  Graph: 'Gráfica',
  'Graph choice': 'Opción de gráfica',
  'Graph to interpret': 'Gráfica para interpretar',
  'Relationship graph': 'Gráfica de la relación',
  'System of equations graph': 'Gráfica del sistema de ecuaciones',
  'Graphing question': 'Pregunta para graficar',
  'Point interpretation graph': 'Gráfica para interpretar el punto',
  'Number line': 'Recta numérica',
  '3D model': 'Modelo 3D',
  'Scatter plot of the data and your model': 'Diagrama de dispersión de los datos y tu modelo',
  'Residual plot': 'Gráfica de residuos',
  'Discrete sequence graph': 'Gráfica discreta de la sucesión',
  'Given graph of the line': 'Gráfica dada de la recta',
});

/** The Spanish for a platform name, or null for a name the pack does not know. */
export const label = (english) => {
  const name = String(english ?? '').trim();
  if (Object.hasOwn(LABELS, name)) return LABELS[name];
  // "Graph 2", "Graph B": the cards of a comparison or a choice.
  const numbered = name.match(/^Graph ([A-Z]|\d+)$/);
  return numbered ? `Gráfica ${numbered[1]}` : null;
};

export default { language: 'es', words, label };
