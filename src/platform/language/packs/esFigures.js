/*
 * CURATED SPANISH FOR WHAT A FIGURE SAYS (AX05) — loaded on demand by
 * ../figureSay.js, only when Read aloud reads a question in Spanish (an
 * authored Spanish translation is on the screen); never in a student's
 * initial bundle.
 *
 * Each entry is the Spanish for one of the platform's own figure sentences,
 * by the message id its generator gives it: GRAPH_WORDS
 * (../graphDescription.js), NUMBER_LINE_WORDS (../numberLineDescription.js),
 * AXIS_TITLE_WORDS (../../../tools/shared/planeAxisTitles.js), and in slice 2
 * THREE_PLANE_WORDS (../../../tools/systemsWorkspace/threePlaneDescription.js),
 * GRAPH_WORKSPACE_WORDS (../graphWorkspaceDescription.js) and
 * ROW_CHOOSER_WORDS (../../../tools/shared/toolTableReading.js), in slice 3
 * the Systems Workspace's own sentences, INEQUALITY_GRAPH_WORDS
 * (../../../tools/systemsWorkspace/inequalityGraphMarks.js), and in slice 4
 * the figures' names, FIGURE_NAME_WORDS (../figureNames.js), with the
 * student-built inequality graph's in INEQUALITY_GRAPH_WORDS. The pieces
 * are the figure's own: a number, a coordinate, a count or a label is placed
 * exactly as it comes, so "−6", "(2, 1)" and "13/8" are the same in both
 * languages, and a label or an axis quantity is said as the screen shows it.
 * An equation is mathematics, said in Spanish words by the reader's own
 * speech rules (../speechText.js), as Read aloud says the prompt's.
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

import { mathToSpeech } from '../speechText.js';

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
  // A line's style and the side of it that is shaded (N38).
  solidLineCount: (n) => `${count(n, 'recta continua', 'rectas continuas')}.`,
  dashedLineCount: (n) => `${count(n, 'recta discontinua', 'rectas discontinuas')}.`,
  solidLineShaded: (side) => `1 recta continua, sombreada ${side}.`,
  dashedLineShaded: (side) => `1 recta discontinua, sombreada ${side}.`,
  solidVerticalShaded: (side) => `1 recta vertical continua, sombreada ${side}.`,
  dashedVerticalShaded: (side) => `1 recta vertical discontinua, sombreada ${side}.`,
  sideAbove: () => 'por encima',
  sideBelow: () => 'por debajo',
  sideLeft: () => 'a la izquierda',
  sideRight: () => 'a la derecha',
  regionShaded: (where) => `La región ${where} está sombreada.`,
  aboveBothLines: () => 'por encima de las dos rectas',
  belowBothLines: () => 'por debajo de las dos rectas',
  aboveOneBelowOther: () => 'por encima de una recta y por debajo de la otra',
  aboveRisingBelowFalling: () => 'por encima de la recta que sube y por debajo de la que baja',
  belowRisingAboveFalling: () => 'por debajo de la recta que sube y por encima de la que baja',
  solidCurveCount: (n) => `${count(n, 'curva con trazo continuo', 'curvas con trazo continuo')}.`,
  dashedCurveCount: (n) => `${count(n, 'curva con trazo discontinuo', 'curvas con trazo discontinuo')}.`,
  dashedPathCount: (n) => `${count(n, 'línea poligonal discontinua', 'líneas poligonales discontinuas')}.`,
  referenceLineCount: (n) => `${count(n, 'recta de referencia', 'rectas de referencia')}.`,
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
  // "Abre hacia", as ./esSupport.js says a parabola "opens up or down".
  curveOpensRight: () => '1 curva, que abre hacia la derecha.',
  curveOpensLeft: () => '1 curva, que abre hacia la izquierda.',
  oneShadedRegion: () => '1 región sombreada.',
  regionWhereAllTrue: () => '1 región sombreada, donde todas las desigualdades son verdaderas.',
  noRegionShadedYet: () => 'Todavía no hay ninguna región sombreada.',
  scaleSame: () => 'Ahora los dos ejes usan la misma escala.',
  scaleCounts: (x, y) => `El eje x va de ${x} en ${x} y el eje y, de ${y} en ${y}.`,

  /* ---- the full reading: a closed question, or the graph read-out (AX03) */
  atValue: (value) => `en ${value}`,
  throughValue: (value) => `que pasa por ${value}`,
  curveTotal: (n) => `${count(n, 'curva', 'curvas')}.`,
  lineSubject: (n) => `La recta ${n}`,
  solidLineSubject: (n) => `La recta ${n} (continua)`,
  dashedLineSubject: (n) => `La recta ${n} (discontinua)`,
  referenceLineSubject: () => 'La recta de referencia',
  dashedReferenceLineSubject: () => 'La recta de referencia (discontinua)',
  curveSubject: (n) => `La curva ${n}`,
  solidCurveSubject: (n) => `La curva ${n} (con trazo continuo)`,
  dashedCurveSubject: (n) => `La curva ${n} (con trazo discontinuo)`,
  markReading: (subject, clauses) => `${subject} ${list(clauses)}.`,
  // "La ventana": the part of the plane the graph shows, as on a graphing calculator.
  outsideWindow: (subject) => `${subject} está fuera de la ventana.`,
  isHorizontal: () => 'es horizontal',
  risesLeftToRight: () => 'sube de izquierda a derecha',
  fallsLeftToRight: () => 'baja de izquierda a derecha',
  crossesYAxis: (where) => `cruza el eje y ${where}`,
  crossesXAxis: (where) => `cruza el eje x ${where}`,
  touchesXAxis: (where) => `toca el eje x ${where}`,
  passesThrough: (pairs) => `pasa por ${list(pairs)}`,
  startsAtLeftEdge: (at) => `empieza en el borde izquierdo en ${at}`,
  beginsAt: (at) => `comienza en ${at}`,
  comesInTop: (at) => `entra por el borde superior en ${at}`,
  comesInBottom: (at) => `entra por el borde inferior en ${at}`,
  // "Punto alto/bajo": what the picture shows, as the English "high point";
  // not "máximo/mínimo", which a question may ask the student to name.
  highPointAt: (at) => `tiene un punto alto en ${at}`,
  lowPointAt: (at) => `tiene un punto bajo en ${at}`,
  endsAtRightEdge: (at) => `termina en el borde derecho en ${at}`,
  stopsAt: (at) => `se detiene en ${at}`,
  leavesTop: (at) => `sale por el borde superior en ${at}`,
  leavesBottom: (at) => `sale por el borde inferior en ${at}`,
  continues: () => 'continúa',
  dashedVerticalAt: (where) => `Recta vertical discontinua ${where} en el eje x.`,
  solidVerticalAt: (where) => `Recta vertical continua ${where} en el eje x.`,
  dashedHorizontalAt: (where) => `Recta horizontal discontinua ${where} en el eje y.`,
  lineRef: (n) => `la recta ${n}`,
  referenceLineRef: () => 'la recta de referencia',
  verticalLineRef: (where) => `la recta vertical ${where}`,
  aboveOf: (line) => `por encima de ${line}`,
  belowOf: (line) => `por debajo de ${line}`,
  leftOf: (line) => `a la izquierda de ${line}`,
  rightOf: (line) => `a la derecha de ${line}`,
  shadedSide: (where) => `La región ${where} está sombreada.`,
  regionShadedSides: (sides) => `La región ${list(sides)} está sombreada.`,
  vertices: (pairs, more) => list(more ? [...pairs, `${more} más`] : pairs),
  pathThrough: (n, vertices) => `La línea poligonal ${n} pasa por ${vertices}.`,
  dashedPathThrough: (n, vertices) => `La línea poligonal ${n} (discontinua) pasa por ${vertices}.`,
  // "Esquinas", as the English says "corners": what the eye sees, not "vértices".
  regionCorners: (n, vertices) => `La región sombreada ${n} tiene esquinas en ${vertices}.`,
  pointsRead: (dots, arrows, marks) => `${list([dots ? count(dots, 'punto', 'puntos') : '', arrows ? count(arrows, 'punta de flecha', 'puntas de flecha') : ''].filter(Boolean))}: ${marks.join('; ')}.`,
  pointAt: (label, at) => `${label} en ${at}`,
  openDotAt: (at) => `${at}, círculo abierto`,
  closedDotAt: (at) => `${at}, círculo cerrado`,
  arrowheadAt: (at, direction) => `punta de flecha en ${at} que apunta ${direction}`,
  pointingRight: () => 'hacia la derecha',
  pointingUpRight: () => 'hacia arriba y a la derecha',
  pointingUp: () => 'hacia arriba',
  pointingUpLeft: () => 'hacia arriba y a la izquierda',
  pointingLeft: () => 'hacia la izquierda',
  pointingDownLeft: () => 'hacia abajo y a la izquierda',
  pointingDown: () => 'hacia abajo',
  pointingDownRight: () => 'hacia abajo y a la derecha',
  outsideWindowMark: (mark) => `${mark}, fuera de la ventana`,

  xAxisShows: (quantity) => `El eje x horizontal muestra ${quantity}.`,
  yAxisShows: (quantity) => `El eje y vertical muestra ${quantity}.`,

  /* --------------------------------------- the 3D model (Systems Workspace) */
  // "x, y, z" with no "y" between: "los ejes x, y y z" would say "y" twice.
  modelAxes: (variables) => `Modelo 3D con los ejes ${variables.join(', ')}.`,
  planeShown: (n, colour, equation) => `Plano ${n}, ${colour}: ${equation}.`,
  planeHidden: (n, colour, equation) => `Plano ${n}, ${colour}: ${equation}, oculto.`,
  planeBlue: () => 'azul',
  planeRed: () => 'rojo',
  planeGreen: () => 'verde',
  spokenMath: (math) => mathToSpeech(math, { language: 'es' }),
  noPlaneShown: () => 'No se muestra ningún plano.',
  // Where two planes cross is a straight line: "recta", as on the plane.
  planesCross: (first, second) => `Una recta discontinua marca dónde se cortan los planos ${first} y ${second}.`,
  planesNoLine: (first, second) => `Entre los planos ${first} y ${second} no hay ninguna recta discontinua.`,
  shownPlanesCross: () => 'Unas rectas discontinuas marcan dónde se cortan los planos que se muestran.',
  markedOnModel: (point) => `Marcado en el modelo: ${point}.`,

  /* ------------- the student's inequality graph (Systems Workspace, slice 3) */
  // "Recta frontera", as ./esSupport.js says "your boundary line".
  boundarySolid: (n) => `Recta frontera ${n}: continua.`,
  boundaryDashed: (n) => `Recta frontera ${n}: discontinua.`,
  boundaryStyleNotChosen: (n) => `Recta frontera ${n}: todavía no se ha elegido su estilo.`,
  oneSideShaded: (n) => `Un lado de la recta frontera ${n} está sombreado.`,
  oneSideOfEachShaded: (numbers) => `Un lado de cada una de las rectas frontera ${list(numbers)} está sombreado.`,
  // "Rayada": drawn with lines across it, as the hatching is.
  overlapHatched: () => 'La zona donde se superponen los lados sombreados está rayada.',
  shadedSideHatched: () => 'El lado sombreado está rayado.',
  noBoundaryLineYet: () => 'Todavía no hay ninguna recta frontera dibujada.',
  // The region and its corners, once positions may be said: "esquinas", as
  // the plane's own regionCorners says them.
  shadedRegionIntro: () => '1 región sombreada',
  regionAllTrueIntro: () => '1 región sombreada, donde todas las desigualdades son verdaderas',
  regionWithCorners: (intro, corners) => `${intro}, ${corners}.`,
  noCornerInGraph: () => 'sin ninguna esquina dentro de la gráfica',
  cornerAt: (pair) => `con una esquina en ${pair}`,
  cornersAt: (pairs) => `con esquinas en ${list(pairs)}`,
  regionGoesOn: () => 'Continúa más allá del borde de la gráfica.',

  /* -------------------------------------------- the graph workspace (legacy) */
  givenGraphDrawn: () => 'Hay una gráfica dibujada. Sus posiciones no se leen mientras se pueda responder esta pregunta.',
  youPlaced: (marks) => `Colocaste ${count(marks.length, 'punto', 'puntos')}: ${marks.join('; ')}.`,
  curveThroughYourPoints: () => 'Tu curva está dibujada a través de tus puntos.',
  youDrewStrokes: (n) => `Dibujaste ${count(n, 'trazo', 'trazos')}.`,
  graphEndsMarked: (marks) => `Extremos de la gráfica que marcaste: ${marks.join('; ')}.`,
  arrowAt: (at) => `una flecha en ${at}`,
  youSelected: (pairs) => `Seleccionaste ${count(pairs.length, 'punto', 'puntos')}: ${pairs.join('; ')}.`,
  nothingPlacedYet: () => 'Todavía no hay nada colocado.',

  /* ------------------------------------------- a figure's name (slice 4) */
  // The names a static graph is given (GraphDisplay's title), as Read aloud
  // already said them.
  questionGraphName: () => 'Gráfica de la pregunta',
  coordinateGraphName: () => 'Gráfica de coordenadas',
  graphName: () => 'Gráfica',
  graphChoiceName: () => 'Opción de gráfica',
  graphToInterpretName: () => 'Gráfica para interpretar',
  relationshipGraphName: () => 'Gráfica de la relación',
  systemOfEquationsGraphName: () => 'Gráfica del sistema de ecuaciones',
  graphingQuestionName: () => 'Pregunta para graficar',
  pointInterpretationGraphName: () => 'Gráfica para interpretar el punto',
  correctGraphName: () => 'Gráfica correcta',
  graphForQuestionName: () => 'Gráfica de esta pregunta',
  // "Tu gráfica", as the number line says the student's own ("Tu gráfica: …").
  yourGraphName: () => 'Tu gráfica',
  yourCheckedGraphName: () => 'Tu gráfica revisada',
  numberedGraphName: (mark) => `Gráfica ${mark}`,
  // The axis titles are the item's own words, said as the axes show them.
  axesGraphName: (x, y) => `Gráfica con el eje horizontal ${x} y el eje vertical ${y}`,
  coordinatePlaneName: () => 'Plano de coordenadas',
  scatterPlotName: () => 'Diagrama de dispersión de los datos y tu modelo',
  residualPlotName: () => 'Gráfica de residuos',
  sequenceGraphName: () => 'Gráfica discreta de la sucesión',
  givenLineGraphName: () => 'Gráfica dada de la recta',
  // The Systems Workspace's planes. "Las dos ecuaciones", as ./esSupport.js
  // says "both equations"; the student's own graph is "Tu gráfica".
  bothEquationsGraphName: () => 'Gráfica de las dos ecuaciones del sistema',
  yourBothEquationsGraphName: () => 'Tu gráfica de las dos ecuaciones del sistema',
  builtRegionGraphName: () => 'Tu gráfica de la región solución de las desigualdades',
  feasibleRegionGraphName: () => 'Gráfica del sistema de desigualdades con su región factible sombreada',
  lineAndParabolaGraphName: () => 'Gráfica de una recta y una parábola',
  // A plane the student plots on: "marcar", as ./esSupport.js says "plot"
  // ("Marca primero la intersección con el eje y"); "la cruz", the crosshair.
  plotByKeysName: (name) => `${name}. Haz clic para marcar un punto, o mueve la cruz con las teclas de flecha y pulsa Enter para marcarlo.`,
  plotAndMoveByKeysName: (name) => `${name}. Haz clic para marcar un punto, o mueve la cruz con las teclas de flecha y pulsa Enter para marcarlo. Pulsa Enter sobre un punto marcado para tomarlo y moverlo.`,
  numberLineName: () => 'Recta numérica',
  numberLineFromToName: (min, max) => `Recta numérica de ${min} a ${max}`,
  threePlanesName: () => 'Tres planos en 3D',
  threePlanesViewName: () => 'Vista 3D de los tres planos',
  modelName: () => 'Modelo 3D',
  rowChooserName: () => 'Filas para elegir',
  // The student-built inequality graph, and what a tap on it does next.
  // "Restricción" for each constraint; "punto frontera", as "recta frontera"
  // and ./esSupport.js's "número frontera".
  builtSystemGraphName: () => 'Tu gráfica del sistema de desigualdades',
  builtInequalityGraphName: () => 'Tu gráfica de la desigualdad',
  graphTaskName: (name, task) => `${name}. ${task}`,
  plotYInterceptTask: (constraint) => `Marca la intersección con el eje y de la restricción ${constraint}`,
  plotBoundaryPointTask: (which, constraint) => `Marca el punto frontera ${which} de la restricción ${constraint}`,
  boundaryPointsPlacedTask: (constraint) => `Los dos puntos frontera de la restricción ${constraint} están colocados`,
  chooseShadedSideTask: (constraint) => `Elige qué lado sombrear para la restricción ${constraint}`,
  placeTestPointTask: () => 'Coloca tu propio punto de prueba',
  markVertexTask: () => 'Marca un vértice de la región solución',

  /* ------------------- a table the student chooses rows from (process mode) */
  // "Toca el eje", as ./esSupport.js says "meets the axis".
  chooseTwoRows: () => 'Elige dos filas: primero la fila 1 y luego la fila 2.',
  chooseXInterceptRow: () => 'Elige la fila donde la recta toca el eje x.',
  chooseYInterceptRow: () => 'Elige la fila donde la recta toca el eje y.',
  chooseRowAsPoint: () => 'Elige una fila para usarla como un punto de la recta.',
  chooserRow: (n, x, y) => `Fila ${n}: x, ${x}; y, ${y}.`,
  chosenChooserRow: (n, x, y, note) => `Fila ${n}: x, ${x}; y, ${y}; ${note}.`,
  rowChosen: () => 'elegida',
  rowChosenAs: (n) => `elegida como fila ${n}`,
  noRowChosenYet: () => 'Todavía no hay ninguna fila elegida.',

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
 * The platform's own names for a table a tool draws (AX10), by its English.
 * A figure's name is a message (FIGURE_NAME_WORDS, above: slice 4). A name
 * the author wrote is the item's own words and is said as written.
 */
const TABLE_LABELS = Object.freeze({
  'Given table of values': 'Tabla de valores dada',
  'Table of values': 'Tabla de valores',
  'Residual table': 'Tabla de residuos',
  'Sequence table': 'Tabla de la sucesión',
  // Process mode's table (AX10, slice 2).
  'Table to extend': 'Tabla para continuar',
});

/** The Spanish for a platform table name, or null for a name the pack does not know. */
export const label = (english) => {
  const name = String(english ?? '').trim();
  return Object.hasOwn(TABLE_LABELS, name) ? TABLE_LABELS[name] : null;
};

export default { language: 'es', words, label };
