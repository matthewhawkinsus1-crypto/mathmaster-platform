/*
 * THE MATH GLOSSARY — loaded on demand (../mathVocabulary.js loadMathGlossary).
 *
 * One entry per id in VOCABULARY_INDEX. Each entry explains a WORD, in plain
 * student language, with a small generic example that is never taken from an
 * item: a definition must help a student read the task, not do it.
 *
 *   term        the English word as students meet it
 *   definition  plain-language meaning
 *   example     a short generic illustration (math kept as plain text)
 *   es          Spanish term and meaning (curated; the bilingual pack)
 *   visual      optional hint for a future picture (not rendered yet)
 *   say         optional spoken form for Read aloud, where the spelling misleads
 */
const entry = (term, definition, example, esTerm, esDefinition, extra = {}) => Object.freeze({
  term, definition, example, es: Object.freeze({ term: esTerm, definition: esDefinition }), visual: null, ...extra,
});

export const MATH_GLOSSARY = Object.freeze({
  coefficient: entry('coefficient', 'The number multiplied by a variable.', 'In 5x, the coefficient is 5.', 'coeficiente', 'El número que multiplica a una variable.'),
  constant: entry('constant', 'A number that does not change; a term with no variable.', 'In 3x + 8, the constant is 8.', 'constante', 'Un número que no cambia; un término sin variable.'),
  variable: entry('variable', 'A letter that stands for a number that can change or is unknown.', 'In y = 2x, x and y are variables.', 'variable', 'Una letra que representa un número que puede cambiar o que no se conoce.'),
  expression: entry('expression', 'Numbers, variables and operations with no equals sign.', '4x − 7 is an expression.', 'expresión', 'Números, variables y operaciones sin signo de igual.'),
  equation: entry('equation', 'A statement that two expressions are equal; it has an equals sign.', '2x + 1 = 9 is an equation.', 'ecuación', 'Una afirmación de que dos expresiones son iguales; tiene un signo de igual.'),
  term: entry('term', 'One part of an expression separated by + or − signs. In a sequence, one number in the list.', 'In 3x + 5, the terms are 3x and 5.', 'término', 'Una parte de una expresión separada por signos + o −. En una sucesión, cada número de la lista.'),
  'like-terms': entry('like terms', 'Terms with the same variable raised to the same power.', '4x and −2x are like terms; 4x and 4x² are not.', 'términos semejantes', 'Términos con la misma variable elevada a la misma potencia.'),
  distribute: entry('distribute', 'Multiply a factor by every term inside parentheses.', '3(x + 2) becomes 3·x + 3·2.', 'distribuir', 'Multiplicar un factor por cada término dentro de los paréntesis.'),
  'inverse-operation': entry('inverse operation', 'The operation that undoes another: addition and subtraction, multiplication and division.', 'Subtracting 4 undoes adding 4.', 'operación inversa', 'La operación que deshace otra: la suma y la resta, la multiplicación y la división.'),
  solution: entry('solution', 'A value (or values) that makes an equation or inequality true. To solve is to find it.', 'x = 2 is a solution of x + 3 = 5 because 2 + 3 = 5.', 'solución', 'Un valor (o valores) que hace verdadera una ecuación o desigualdad. Resolver es encontrarlo.'),
  inequality: entry('inequality', 'A statement that compares two expressions with <, >, ≤ or ≥.', 'x > 4 means x is greater than 4.', 'desigualdad', 'Una afirmación que compara dos expresiones con <, >, ≤ o ≥.'),
  system: entry('system', 'Two or more equations (or inequalities) about the same variables, considered together.', 'y = x + 1 and y = 3 − x form a system.', 'sistema', 'Dos o más ecuaciones (o desigualdades) con las mismas variables, consideradas juntas.'),
  substitution: entry('substitution', 'Replacing a variable with an equal value or expression.', 'If y = 2x, you can substitute 2x for y.', 'sustitución', 'Reemplazar una variable por un valor o una expresión igual.'),
  elimination: entry('elimination', 'Adding or subtracting equations so that one variable cancels out.', 'Adding (x + y = 5) and (x − y = 1) eliminates y.', 'eliminación', 'Sumar o restar ecuaciones para que una variable se cancele.'),
  intersection: entry('intersection', 'The point or points where two graphs cross or meet.', 'Two different, non-parallel lines meet at one point of intersection.', 'intersección', 'El punto o los puntos donde dos gráficas se cruzan o se encuentran.'),
  equivalent: entry('equivalent', 'Having the same value or meaning, even if written differently.', '2(x + 1) and 2x + 2 are equivalent expressions.', 'equivalente', 'Que tiene el mismo valor o significado, aunque se escriba de otra forma.'),
  factor: entry('factor', 'A number or expression that is multiplied. To factor is to rewrite as a product.', '6 = 2 · 3, so 2 and 3 are factors of 6.', 'factor / factorizar', 'Un número o expresión que se multiplica. Factorizar es escribir como un producto.'),
  product: entry('product', 'The result of multiplying.', 'The product of 4 and 5 is 20.', 'producto', 'El resultado de multiplicar.'),
  sum: entry('sum', 'The result of adding.', 'The sum of 4 and 5 is 9.', 'suma', 'El resultado de sumar.'),
  difference: entry('difference', 'The result of subtracting.', 'The difference of 9 and 4 is 5.', 'diferencia', 'El resultado de restar.'),
  quotient: entry('quotient', 'The result of dividing.', 'The quotient of 12 and 3 is 4.', 'cociente', 'El resultado de dividir.'),
  slope: entry('slope', 'How steep a line is: the change in y for each change in x (rise over run).', 'A line that goes up 2 for every 1 to the right has slope 2.', 'pendiente', 'Qué tan inclinada es una recta: el cambio en y por cada cambio en x (elevación sobre avance).', { visual: 'rise-over-run' }),
  'y-intercept': entry('y-intercept', 'Where a graph crosses the y-axis (where x = 0).', 'A line crossing the y-axis at (0, 3) has y-intercept 3.', 'intersección con el eje y', 'Donde una gráfica cruza el eje y (donde x = 0).', { say: 'y intercept' }),
  'x-intercept': entry('x-intercept', 'Where a graph crosses the x-axis (where y = 0).', 'A graph crossing the x-axis at (5, 0) has x-intercept 5.', 'intersección con el eje x', 'Donde una gráfica cruza el eje x (donde y = 0).', { say: 'x intercept' }),
  intercept: entry('intercept', 'A point where a graph crosses an axis.', 'The y-intercept is on the y-axis; the x-intercept is on the x-axis.', 'intersección (con un eje)', 'Un punto donde una gráfica cruza un eje.'),
  'rate-of-change': entry('rate of change', 'How much one quantity changes for each unit of another.', 'Earning $12 per hour is a rate of change of 12 dollars per hour.', 'tasa de cambio', 'Cuánto cambia una cantidad por cada unidad de otra.'),
  linear: entry('linear', 'Changing at a constant rate; its graph is a straight line.', 'y = 3x + 1 is linear.', 'lineal', 'Que cambia a una tasa constante; su gráfica es una recta.'),
  function: entry('function', 'A rule that gives exactly one output for each input.', 'f(x) = x + 2 gives f(1) = 3.', 'función', 'Una regla que da exactamente una salida para cada entrada.'),
  input: entry('input', 'A value you put into a function (often x).', 'In f(4), the input is 4.', 'entrada', 'Un valor que se pone en una función (con frecuencia x).'),
  output: entry('output', 'The value a function gives back (often y or f(x)).', 'If f(4) = 9, the output is 9.', 'salida', 'El valor que devuelve una función (con frecuencia y o f(x)).'),
  domain: entry('domain', 'All the input values a function or situation allows.', 'If x counts people, the domain uses whole numbers.', 'dominio', 'Todos los valores de entrada que permite una función o situación.'),
  range: entry('range', 'For a function: all the output values. For data: the spread from the least value to the greatest.', 'A function whose outputs are all 1 or more has range y ≥ 1.', 'rango', 'En una función: todos los valores de salida. En datos: la distancia entre el valor menor y el mayor.'),
  'independent-variable': entry('independent variable', 'The input quantity you choose or control (usually x).', 'In hours worked vs. pay, hours is independent.', 'variable independiente', 'La cantidad de entrada que se elige o controla (normalmente x).'),
  'dependent-variable': entry('dependent variable', 'The output quantity that depends on the input (usually y).', 'In hours worked vs. pay, pay is dependent.', 'variable dependiente', 'La cantidad de salida que depende de la entrada (normalmente y).'),
  'ordered-pair': entry('ordered pair', 'Two numbers (x, y) that name a point: x first, then y.', '(2, −1) means 2 right and 1 down from the origin.', 'par ordenado', 'Dos números (x, y) que nombran un punto: primero x, luego y.'),
  'coordinate-plane': entry('coordinate plane', 'A grid made by a horizontal x-axis and a vertical y-axis.', 'Points are plotted on the coordinate plane with ordered pairs.', 'plano de coordenadas', 'Una cuadrícula formada por un eje x horizontal y un eje y vertical.'),
  origin: entry('origin', 'The point (0, 0) where the axes cross.', 'Every ordered pair is measured from the origin.', 'origen', 'El punto (0, 0) donde se cruzan los ejes.'),
  axis: entry('axis', 'One of the two number lines on a graph: the x-axis (across) or the y-axis (up and down).', 'The x-axis is horizontal.', 'eje', 'Una de las dos rectas numéricas de una gráfica: el eje x (horizontal) o el eje y (vertical).'),
  boundary: entry('boundary line', 'The line that separates the solutions of an inequality from the non-solutions.', 'For y < x + 1, the boundary line is y = x + 1.', 'línea límite (frontera)', 'La recta que separa las soluciones de una desigualdad de las que no lo son.'),
  // Dashed and solid say what the lines LOOK like and that the choice marks
  // whether boundary points are solutions — never which symbol needs which.
  dashed: entry('dashed line', 'A broken line ( - - - ). On an inequality graph, the kind of line shows whether points on the boundary are solutions.', 'A dashed line looks like - - - - -.', 'línea discontinua (punteada)', 'Una línea entrecortada ( - - - ). En la gráfica de una desigualdad, el tipo de línea muestra si los puntos de la frontera son soluciones.'),
  solid: entry('solid line', 'An unbroken line. On an inequality graph, the kind of line shows whether points on the boundary are solutions.', 'A solid line looks like ———.', 'línea continua (sólida)', 'Una línea sin cortes. En la gráfica de una desigualdad, el tipo de línea muestra si los puntos de la frontera son soluciones.'),
  shade: entry('shade', 'Color the region of the graph that holds the solutions.', 'Shading shows every point that makes the inequality true.', 'sombrear', 'Colorear la región de la gráfica donde están las soluciones.'),
  correlation: entry('correlation', 'How two variables move together. Positive: both increase. Negative: one increases as the other decreases. None: no clear pattern.', 'Height and shoe size usually have a positive correlation.', 'correlación', 'Cómo se mueven juntas dos variables. Positiva: ambas aumentan. Negativa: una aumenta mientras la otra disminuye. Ninguna: no hay patrón claro.'),
  causation: entry('causation', 'When one thing actually makes another happen. Correlation alone does not prove causation.', 'Ice cream sales and sunburns rise together, but one does not cause the other.', 'causalidad', 'Cuando una cosa realmente provoca otra. La correlación por sí sola no prueba la causalidad.'),
  outlier: entry('outlier', 'A data value far away from the rest of the data.', 'In 4, 5, 5, 6, 30, the value 30 is an outlier.', 'valor atípico', 'Un dato muy alejado del resto de los datos.'),
  residual: entry('residual', 'Actual value minus predicted value for one data point.', 'If a model predicts 10 and the actual value is 12, the residual is 2.', 'residuo', 'El valor real menos el valor predicho para un dato.'),
  'line-of-best-fit': entry('line of best fit', 'A line that follows the trend of a scatterplot as closely as possible.', 'A trend line can be used to make predictions.', 'recta de mejor ajuste', 'Una recta que sigue la tendencia de un diagrama de dispersión lo más de cerca posible.'),
  regression: entry('regression', 'A method (often with technology) that finds the equation that best fits data.', 'Linear regression gives an equation like y = ax + b.', 'regresión', 'Un método (con frecuencia con tecnología) que encuentra la ecuación que mejor se ajusta a los datos.'),
  scatterplot: entry('scatterplot', 'A graph of data points (x, y) used to look for a relationship.', 'Each dot on a scatterplot is one pair of data values.', 'diagrama de dispersión', 'Una gráfica de puntos de datos (x, y) que se usa para buscar una relación.'),
  sequence: entry('sequence', 'An ordered list of numbers that follows a pattern.', '3, 6, 9, 12, … is a sequence.', 'sucesión', 'Una lista ordenada de números que sigue un patrón.'),
  'common-difference': entry('common difference', 'The same amount added each time in an arithmetic sequence.', 'In 2, 5, 8, 11, the common difference is 3.', 'diferencia común', 'La misma cantidad que se suma cada vez en una sucesión aritmética.'),
  'common-ratio': entry('common ratio', 'The same number multiplied each time in a geometric sequence.', 'In 2, 6, 18, 54, the common ratio is 3.', 'razón común', 'El mismo número por el que se multiplica cada vez en una sucesión geométrica.'),
  arithmetic: entry('arithmetic sequence', 'A sequence that adds the same number each time.', '10, 7, 4, 1, … adds −3 each time.', 'sucesión aritmética', 'Una sucesión que suma el mismo número cada vez.'),
  geometric: entry('geometric sequence', 'A sequence that multiplies by the same number each time.', '5, 10, 20, 40, … multiplies by 2 each time.', 'sucesión geométrica', 'Una sucesión que multiplica por el mismo número cada vez.'),
  discrete: entry('discrete', 'Separate, countable values with gaps between them.', 'The number of tickets sold is discrete: 1, 2, 3, …', 'discreto', 'Valores separados y contables, con espacios entre ellos.'),
  continuous: entry('continuous', 'Values with no gaps; any value in an interval is possible.', 'Time and temperature are continuous.', 'continuo', 'Valores sin espacios; cualquier valor de un intervalo es posible.'),
  transformation: entry('transformation', 'A change to a graph: moving, flipping, stretching or shrinking it.', 'Adding 3 to a function moves its graph up 3.', 'transformación', 'Un cambio en una gráfica: moverla, voltearla, estirarla o encogerla.'),
  translation: entry('translation (graphs)', 'In graphing, a slide: every point moves the same distance in the same direction.', 'A graph translated 2 units right moves every point 2 to the right.', 'traslación', 'En gráficas, un deslizamiento: cada punto se mueve la misma distancia en la misma dirección.'),
  reflection: entry('reflection', 'A flip of a graph over a line, like a mirror image.', 'Reflecting over the x-axis turns (2, 3) into (2, −3).', 'reflexión', 'Un volteo de una gráfica sobre una recta, como una imagen en un espejo.'),
  dilation: entry('dilation (stretch or compression)', 'Making a graph narrower or wider, taller or shorter, by multiplying.', 'Multiplying the outputs by 2 stretches a graph vertically.', 'dilatación (estiramiento o compresión)', 'Hacer una gráfica más angosta o más ancha, más alta o más baja, al multiplicar.'),
  vertex: entry('vertex', 'The turning point of a parabola or an absolute value graph (its highest or lowest point).', 'The graph of y = x² has its vertex at (0, 0).', 'vértice', 'El punto de giro de una parábola o de una gráfica de valor absoluto (su punto más alto o más bajo).'),
  parabola: entry('parabola', 'The U-shaped graph of a quadratic function.', 'y = x² graphs as a parabola that opens up.', 'parábola', 'La gráfica en forma de U de una función cuadrática.'),
  quadratic: entry('quadratic', 'Having a squared term (x²) as the highest power.', 'y = x² − 4x + 1 is quadratic.', 'cuadrática', 'Que tiene un término al cuadrado (x²) como la potencia más alta.'),
  exponential: entry('exponential', 'Changing by the same FACTOR each step: growth multiplies by more than 1, decay by a number between 0 and 1.', 'y = 50 · 2^x doubles at each step.', 'exponencial', 'Que cambia por el mismo FACTOR en cada paso: el crecimiento multiplica por más de 1, el decaimiento por un número entre 0 y 1.'),
  'absolute-value': entry('absolute value', 'The distance of a number from zero, so it is never negative.', '|−6| = 6 and |6| = 6.', 'valor absoluto', 'La distancia de un número al cero, por eso nunca es negativa.'),
  zero: entry('zero of a function', 'An input that makes the output 0; where the graph meets the x-axis. Also called a root.', 'If f(3) = 0, then 3 is a zero of f.', 'cero de una función', 'Una entrada que hace que la salida sea 0; donde la gráfica toca el eje x. También se llama raíz.'),
  maximum: entry('maximum', 'The greatest value (the highest point of a graph).', 'A parabola that opens down has a maximum at its vertex.', 'máximo', 'El valor mayor (el punto más alto de una gráfica).'),
  minimum: entry('minimum', 'The least value (the lowest point of a graph).', 'A parabola that opens up has a minimum at its vertex.', 'mínimo', 'El valor menor (el punto más bajo de una gráfica).'),
  'axis-of-symmetry': entry('axis of symmetry', 'The line that cuts a graph into two mirror-image halves.', 'A parabola’s axis of symmetry passes through its vertex.', 'eje de simetría', 'La recta que divide una gráfica en dos mitades que son imagen de espejo.'),
  interval: entry('interval', 'All the numbers between two endpoints, written like [a, b] or a < x < b.', '[2, 5) includes 2 but not 5.', 'intervalo', 'Todos los números entre dos extremos, escritos como [a, b] o a < x < b.'),
  increasing: entry('increasing', 'Going up from left to right: as x grows, y grows.', 'A line with positive slope is increasing.', 'creciente', 'Que sube de izquierda a derecha: cuando x crece, y crece.'),
  decreasing: entry('decreasing', 'Going down from left to right: as x grows, y gets smaller.', 'A line with negative slope is decreasing.', 'decreciente', 'Que baja de izquierda a derecha: cuando x crece, y se hace más pequeña.'),
  evaluate: entry('evaluate', 'Find the value by putting in numbers and calculating.', 'Evaluate 2x + 1 for x = 3 means put 3 in for x.', 'evaluar', 'Encontrar el valor sustituyendo números y calculando.'),
  simplify: entry('simplify', 'Rewrite in a shorter, equivalent form.', '3x + 2x simplifies to 5x.', 'simplificar', 'Escribir de una forma más corta y equivalente.'),
  justify: entry('justify', 'Give reasons or evidence that show your answer is correct.', '"I know because…" starts a justification.', 'justificar', 'Dar razones o evidencia que muestren que tu respuesta es correcta.'),
  explain: entry('explain', 'Tell how or why, in words, so someone else can follow.', 'Explain your steps in order.', 'explicar', 'Decir cómo o por qué, con palabras, para que otra persona pueda seguirlo.'),
  determine: entry('determine', 'Find out or decide, using the information given.', 'Determine which choice fits the data.', 'determinar', 'Averiguar o decidir usando la información dada.'),
  estimate: entry('estimate', 'Find a value that is close, not exact.', '19 × 21 is about 20 × 20 = 400.', 'estimar', 'Encontrar un valor cercano, no exacto.'),
  interpret: entry('interpret', 'Explain what a number, graph or result means in the situation.', 'Interpret the slope: tell what it means in the story.', 'interpretar', 'Explicar qué significa un número, una gráfica o un resultado en la situación.'),
  compare: entry('compare', 'Tell how two things are alike and different.', 'Compare the two rates: which is greater?', 'comparar', 'Decir en qué se parecen y en qué se diferencian dos cosas.'),
  represent: entry('represent', 'Show or stand for, using a table, graph, equation or words.', 'The table represents the same relationship as the graph.', 'representar', 'Mostrar o significar, usando una tabla, una gráfica, una ecuación o palabras.'),
  graph: entry('graph', 'A picture of a relationship on a coordinate plane. To graph is to draw it.', 'Graph a line by plotting points and connecting them.', 'gráfica / graficar', 'Un dibujo de una relación en un plano de coordenadas. Graficar es dibujarla.'),
  model: entry('model', 'An equation, graph or table that describes a real situation.', 'y = 5x can model the cost of x notebooks at $5 each.', 'modelo', 'Una ecuación, gráfica o tabla que describe una situación real.'),
});
