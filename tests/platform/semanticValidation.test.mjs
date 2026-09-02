import assert from 'node:assert/strict';
import { validateQuestionSemantics, validateQuestionsSemantics } from '../../src/platform/contract/semanticValidation.js';
import { QUESTION_TYPE_CATALOG, getQuestionRepresentation, REPRESENTATIONS } from '../../src/platform/contract/questionTypeCatalog.js';

const errorsFor = (question) => validateQuestionSemantics(question).errors;
const warningsFor = (question) => validateQuestionSemantics(question).warnings;

// --- the exact failure that started this: a graph question with no graph ----
{
  const prose = { type: 'graphAnalysis', prompt: 'A graph falls from left to right until x = 2, then rises.' };
  const errors = errorsFor(prose);
  assert.ok(errors.length, 'a graphAnalysis with no functionSpec is rejected');
  assert.ok(errors.some((e) => /functionSpec\.type/.test(e)), 'names the missing functionSpec');
  assert.ok(errors.some((e) => /analysisRequests/.test(e)), 'names the missing analysisRequests');
}

// --- contextInterpretation misused for notation conversion -----------------
{
  const misuse = { type: 'contextInterpretation', prompt: 'Rewrite the inequality -3 ≤ x < 5 using interval notation.' };
  const errors = errorsFor(misuse);
  assert.ok(errors.some((e) => /scenario/.test(e)), 'rejects contextInterpretation with no scenario');
  assert.ok(errors.some((e) => /quantityChoices/.test(e)), 'rejects contextInterpretation with no quantityChoices');
}

// --- multiAnswer with no answer fields --------------------------------------
{
  assert.ok(errorsFor({ type: 'multiAnswer', prompt: 'Answer each part.' }).some((e) => /answerFields/.test(e)));

  // The renderer reads `answerFields`; `fields` is silently ignored, which is
  // exactly how a question shipped with no answer boxes at all.
  const wrongKey = errorsFor({ type: 'multiAnswer', prompt: 'x', fields: [{ id: 'a', label: 'A', answer: '1' }] });
  assert.ok(wrongKey.some((e) => /answerFields/.test(e)), '`fields` is rejected in favour of `answerFields`');

  const badFields = { type: 'multiAnswer', prompt: 'x', answerFields: [{ id: 'a' }] };
  const errors = errorsFor(badFields);
  assert.ok(errors.some((e) => /needs a label/.test(e)));
  assert.ok(errors.some((e) => /needs an .?answer/.test(e)));
}

// --- table must use the shape the renderer keys blanks from ------------------
{
  // headers + array rows renders an empty table with no inputs at all.
  const headerShape = { type: 'table', prompt: 'Complete it.', table: { headers: ['x', 'y'], rows: [[-2, null]] } };
  const errors = errorsFor(headerShape);
  assert.ok(errors.some((e) => /table\.columns/.test(e)), 'headers shape is rejected');
  assert.ok(errors.some((e) => /table\.answers/.test(e)), 'missing answers is reported');

  const badKey = {
    type: 'table', prompt: 'x',
    table: { columns: [{ key: 'x', label: 'x' }], rows: [{ x: 1 }], answers: { 'nope': 1 } },
  };
  assert.ok(errorsFor(badKey).some((e) => /rowIndex:columnKey/.test(e)), 'a malformed blank key is reported');

  const outOfRange = {
    type: 'table', prompt: 'x',
    table: { columns: [{ key: 'y', label: 'y' }], rows: [{ y: 1 }], answers: { '9:y': 1 } },
  };
  assert.ok(errorsFor(outOfRange).some((e) => /past the end/.test(e)), 'a blank past the last row is reported');
}

// --- relationshipModel without its quantities -------------------------------
{
  const errors = errorsFor({ type: 'relationshipModel', prompt: 'Identify the variables.' });
  assert.ok(errors.some((e) => /scenario/.test(e)));
  assert.ok(errors.some((e) => /quantities/.test(e)));
  assert.ok(errors.some((e) => /correctIndependentId/.test(e)));
}

// --- the prompt-promises-a-visual rule --------------------------------------
{
  assert.ok(errorsFor({ type: 'algebra', prompt: 'Use the graph below to find the y-intercept.' })
    .some((e) => /refers to a graph in its prompt, but the question contains none/.test(e)),
    'a prompt naming a graph with no graph fails');

  assert.ok(errorsFor({ type: 'algebra', prompt: 'Complete the table shown.' })
    .some((e) => /refers to a table/.test(e)), 'a prompt naming a table with no table fails');

  assert.ok(errorsFor({ type: 'algebra', prompt: 'Which point on the number line below is -2?' })
    .some((e) => /refers to a number line/.test(e)), 'a prompt naming a number line fails');

  assert.ok(errorsFor({ type: 'algebra', prompt: 'Use the mapping diagram above.' })
    .some((e) => /refers to a diagram/.test(e)), 'a prompt naming a diagram fails');

  // …and passes once the structure exists.
  assert.deepEqual(
    errorsFor({ type: 'graphing', prompt: 'Use the graph below.', graph: { functions: [{ type: 'line', m: 1, b: 0 }] } }),
    [],
    'the same prompt passes when the graph is supplied',
  );
  assert.deepEqual(
    errorsFor({
      type: 'functionInvestigation2',
      prompt: 'Use the graph below to determine the domain and range.',
      mode: 'domainRange',
      function: { type: 'quadratic', a: 1, h: 0, k: -2 },
    }).filter((error) => /refers to a graph in its prompt, but the question contains none/.test(error)),
    [],
    'FunctionInvestigation2 counts its rendered question.function curve as a real graph',
  );
  assert.deepEqual(
    errorsFor({
      type: 'table',
      prompt: 'Complete the table shown.',
      table: {
        columns: [{ key: 'x', label: 'x' }, { key: 'y', label: 'y' }],
        rows: [{ x: 1, y: null }],
        answers: { '0:y': 2 },
      },
    }),
    [],
    'the table prompt passes when a renderable table is supplied',
  );
}

// --- narrating a graph is warned about even when nothing is promised --------
{
  const warnings = warningsFor({ type: 'algebra', prompt: 'A function crosses the x-axis at 3. What is its zero?' });
  assert.ok(warnings.some((w) => /describes a graph in words rather than showing one/.test(w)));
}

// --- a table only counts when the type actually draws one -------------------
{
  // multiAnswer shares QuestionVisual, so a display table really appears.
  assert.deepEqual(
    errorsFor({
      type: 'multiAnswer',
      prompt: 'Use the table below to state the reasonable domain.',
      table: { columns: [{ key: 'x', label: 'x' }], rows: [{ x: 0 }] },
      answerFields: [{ id: 'domain', label: 'Domain', answer: 'x ≥ 0' }],
    }),
    [],
    'a table on multiAnswer satisfies the promise',
  );

  // graphAnalysis ignores `table` entirely — the student would see nothing.
  assert.ok(
    errorsFor({
      type: 'graphAnalysis',
      prompt: 'Use the table below to state the domain.',
      table: { columns: [{ key: 'x', label: 'x' }], rows: [{ x: 0 }] },
      functionSpec: { type: 'line', m: 1, b: 0 },
      analysisRequests: [{ id: 'domain', kind: 'domain', notation: 'interval' }],
    }).some((e) => /refers to a table/.test(e)),
    'a table on a type that never renders one is rejected',
  );
}

// --- LaTeX and the control characters it decays into ------------------------
{
  // QuestionPrompt now renders math only when it is explicitly delimited.
  // Raw LaTeX outside a supported delimiter would still reach the student as
  // markup, so it remains a warning.
  assert.ok(warningsFor({ type: 'algebra', prompt: 'Simplify \\frac{1}{2} + \\frac{1}{3}.' })
    .some((w) => /contains raw LaTeX/.test(w)), 'an undelimited LaTeX command in a prompt is warned about');

  // Dollar-delimited prompt math is intentionally supported by QuestionPrompt
  // and is rendered through MathDisplay rather than shown as raw markup.
  assert.deepEqual(
    warningsFor({ type: 'algebra', prompt: 'Solve $2x + 3 = 11$.' })
      .filter((w) => /contains raw LaTeX/.test(w)),
    [],
    'supported dollar-delimited prompt math is not warned about',
  );

  // Other student-visible UI strings do not go through QuestionPrompt's math
  // renderer, so raw LaTeX in a field label is still warned about.
  assert.ok(warningsFor({
    type: 'multiAnswer', prompt: 'Answer both parts.',
    answerFields: [{ id: 'a', label: 'Value of \\theta', answer: '30' }],
  }).some((w) => /contains raw LaTeX/.test(w)), 'LaTeX in an answer field label is warned about');

  // "\frac" parses as formfeed + "rac": the text is already missing characters.
  assert.ok(errorsFor({ type: 'algebra', prompt: 'Simplify \f rac12.' })
    .some((e) => /invisible control character/.test(e)), 'a decayed LaTeX escape is a blocking error');

  // Unicode math — what the contract asks for — is clean.
  assert.deepEqual(
    warningsFor({ type: 'algebra', prompt: 'Solve -3 ≤ x < 5 and write ½ × π as a decimal.' })
      .filter((w) => /contains raw LaTeX/.test(w)),
    [],
    'Unicode math produces no LaTeX warning',
  );

  // A lone backslash or a Windows path is not a LaTeX command.
  assert.deepEqual(
    warningsFor({ type: 'algebra', prompt: 'The set difference A \\ B.' })
      .filter((w) => /contains raw LaTeX/.test(w)),
    [],
    'a lone backslash is not flagged',
  );
}

// --- static graph contracts match the actual renderer -----------------------
{
  const brokenNestedShape = {
    type: 'graphScenarioMatch', prompt: 'Match them.',
    scenarios: [{ id: 's1', description: 'Steady growth.' }],
    graphs: [{ id: 'g1', functions: [{ type: 'line', m: 1, b: 0 }] }],
    correctMatches: { s1: 'g1' },
  };
  assert.ok(errorsFor(brokenNestedShape).some((e) => /nested .*graph.* object/i.test(e)),
    'graphScenarioMatch rejects functions placed outside the nested graph object');

  const vertexQuadratic = {
    type: 'graphScenarioMatch', prompt: 'Match them.',
    scenarios: [{ id: 'shot', description: 'An object rises and falls.' }],
    graphs: [{ id: 'g1', graph: { xMin: 0, xMax: 8, yMin: 0, yMax: 20, functions: [{ type: 'quadratic', a: -1, h: 4, k: 16 }] } }],
    correctMatches: { shot: 'g1' },
  };
  assert.deepEqual(errorsFor(vertexQuadratic), [], 'vertex-form static quadratics are valid and visible');

  const autoFitted = {
    type: 'graphScenarioMatch', prompt: 'Match them.',
    scenarios: [{ id: 'shares', description: 'Shares double.' }],
    graphs: [{ id: 'g1', graph: { xMin: 0, xMax: 7, yMin: 0, yMax: 140, functions: [{ type: 'exponential', a: 2, base: 2, h: 0, k: 0 }] } }],
    correctMatches: { shares: 'g1' },
  };
  assert.deepEqual(errorsFor(autoFitted), [],
    'routine graph viewport mistakes are auto-fitted by MathMaster rather than bounced back to the AI');

  const intentionallyLocked = {
    ...autoFitted,
    graphs: [{ id: 'g1', graph: { ...autoFitted.graphs[0].graph, lockViewport: true } }],
  };
  assert.ok(errorsFor(intentionallyLocked).some((e) => /clipped by its locked viewport/.test(e)),
    'an explicitly locked instructional viewport is still rejected when it hides the authored function');
}

// --- a `graph` object is not always a GraphDisplay card ---------------------
{
  // systemsWorkspace draws its own picture from `inequalities` and uses `graph`
  // for nothing but the viewport. Auditing it as a static card reported a
  // perfectly good question as having "no drawable function" — the same mistake
  // as the quadratic bug in reverse: judging JSON against a renderer it never
  // reaches.
  const toolQuestion = {
    toolId: 'systemsWorkspace',
    mode: 'inequalities',
    inequalities: [{ m: 1, b: 1, relation: '>=' }, { m: -0.5, b: 6, relation: '<=' }],
    testPoint: { x: 2, y: 4 },
    graph: { xMin: -4, xMax: 8, yMin: -2, yMax: 10 },
  };
  assert.ok(!errorsFor(toolQuestion).some((e) => /no drawable function/.test(e)),
    'a tool question whose graph carries only bounds is not a static graph card');

  // But a card that really does render GraphDisplay and gives it nothing is a
  // blank grid the student cannot read.
  const emptyCard = { type: 'graphAnalysis', prompt: 'Describe the graph.', graph: { xMin: 0, xMax: 5, yMin: 0, yMax: 5 } };
  assert.ok(errorsFor(emptyCard).some((e) => /no drawable function/.test(e)),
    'an empty static graph card is still reported');
}

// --- a scenario the renderer cannot show is not a scenario ------------------
{
  const wrongKey = {
    type: 'graphScenarioMatch', prompt: 'Match them.',
    scenarios: [{ id: 's1', text: 'Water fills steadily.' }],
    graphs: [{ id: 'g1', graph: { xMin: 0, xMax: 4, yMin: 0, yMax: 8, functions: [{ type: 'line', m: 2, b: 0 }] } }],
    correctMatches: { s1: 'g1' },
  };
  // GraphScenarioMatch reads `description`; anything else renders an empty card.
  assert.ok(errorsFor(wrongKey).some((e) => /description/.test(e)),
    'scenario wording under an unread key is rejected');
}

// --- well-formed examples from the catalogue all validate -------------------
{
  Object.entries(QUESTION_TYPE_CATALOG).forEach(([type, entry]) => {
    const { errors } = validateQuestionSemantics(entry.example, { label: `catalogue ${type}` });
    assert.deepEqual(errors, [], `the catalogue example for ${type} must itself be valid: ${errors.join(' | ')}`);
  });
}

// --- representation detection ----------------------------------------------
{
  assert.equal(getQuestionRepresentation({ type: 'graphAnalysis', functionSpec: { type: 'line' } }), REPRESENTATIONS.GRAPH);
  assert.equal(getQuestionRepresentation({ type: 'graphAnalysis' }), REPRESENTATIONS.TEXT,
    'a graph type with no graph counts as text, not as a graph question');
  assert.equal(getQuestionRepresentation({ type: 'algebra' }), REPRESENTATIONS.SYMBOLIC);
  assert.equal(getQuestionRepresentation({ type: 'algebra', graph: { functions: [] } }), REPRESENTATIONS.GRAPH,
    'a symbolic type carrying a graph counts as a graph question');
  assert.equal(getQuestionRepresentation({ type: 'intervalNumberLine', intervals: [{ min: 0 }] }), REPRESENTATIONS.NUMBER_LINE);
  assert.equal(getQuestionRepresentation({ type: 'relationMapping', pairs: [[1, 2]] }), REPRESENTATIONS.MAPPING);
  assert.equal(getQuestionRepresentation({ type: 'graphing2' }), REPRESENTATIONS.INTERACTIVE);
}

// --- batch helper and hostile input -----------------------------------------
{
  const batch = validateQuestionsSemantics([
    { type: 'graphAnalysis', prompt: 'A graph rises.' },
    { type: 'algebra', prompt: 'Solve for x.' },
  ]);
  assert.ok(batch.errors.some((e) => /^Question 1/.test(e)), 'errors are numbered by position');
  assert.ok(!batch.errors.some((e) => /^Question 2/.test(e)), 'a valid question produces no errors');

  for (const hostile of [null, undefined, 42, 'x', [], { type: null }, { type: 'unknownType' }]) {
    assert.doesNotThrow(() => validateQuestionSemantics(hostile), `survives ${JSON.stringify(hostile)}`);
  }
  assert.doesNotThrow(() => validateQuestionsSemantics(null));
  assert.doesNotThrow(() => validateQuestionsSemantics('nope'));
}

console.log('semanticValidation.test.mjs: all assertions passed');

// --- student-UI guardrails added from the Module 1 audit --------------------
{
  assert.deepEqual(
    warningsFor({ type: 'algebra', prompt: 'A rental costs $6 plus $4 per hour.' }).filter((w) => /contains raw LaTeX/.test(w)),
    [],
    'ordinary currency is not mistaken for dollar-delimited LaTeX',
  );

  const dependentGraphRecipe = {
    type: 'relationshipModel',
    prompt: 'Model the relationship.',
    scenario: 'Water enters at 5 liters per minute.',
    quantities: [{ id: 'time', label: 'Time' }, { id: 'water', label: 'Water' }],
    correctIndependentId: 'time',
    correctDependentId: 'water',
    correctEquation: 'W(t)=5t',
    tableXValues: [0, 1, 2],
    recipe: { name: 'functionModeling', ask: ['quantities', 'equation', 'table', 'graph'] },
    graph: { xMin: 0, xMax: 4, yMin: 0, yMax: 20 },
  };
  assert.deepEqual(errorsFor(dependentGraphRecipe), [],
    'a workflow graph that follows equation → table is supported end to end');
  assert.ok(!errorsFor(dependentGraphRecipe).some((e) => /no drawable function/.test(e)),
    'the recipe viewport is not incorrectly audited as a static graph card');

  const underdeterminedGraph = {
    type: 'relationshipModel',
    prompt: 'Graph from this table.',
    recipe: { name: 'functionModeling', ask: ['table', 'graph'] },
    tableXValues: [0, 1, 2],
    tableAnswers: { '0:y': 0, '1:y': 1, '2:y': 4 },
    graphMode: 'continuous',
  };
  assert.ok(errorsFor(underdeterminedGraph).some((e) => /does not determine one unique continuous graph/.test(e)),
    'a continuous graph from a finite table still needs a model/equation lineage');
}

// --- categorical multiAnswer fields should not default to math entry --------
{
  const categorical = {
    type: 'multiAnswer',
    prompt: 'Choose the correct axes.',
    answerFields: [
      { id: 'x', label: 'Correct x-axis', acceptedAnswers: ['time', 'time elapsed'] },
      { id: 'y', label: 'Correct y-axis', acceptedAnswers: ['distance', 'distance traveled'] },
    ],
  };
  const result = validateQuestionSemantics(categorical, { label: 'axis question' });
  assert.ok(result.warnings.some((message) => /looks categorical/.test(message)),
    'finite word categories warn when an AI leaves them on free-response math entry');

  const corrected = {
    ...categorical,
    answerFields: [
      { id: 'x', label: 'Correct x-axis', type: 'choice', options: ['time', 'distance traveled'], answer: 'time' },
      { id: 'y', label: 'Correct y-axis', type: 'choice', options: ['time', 'distance traveled'], answer: 'distance traveled' },
    ],
  };
  const correctedResult = validateQuestionSemantics(corrected, { label: 'axis question' });
  assert.ok(!correctedResult.warnings.some((message) => /looks categorical/.test(message)),
    'explicit choice fields do not trigger the categorical-entry warning');
}
