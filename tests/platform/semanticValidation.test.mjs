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
  // Prompts render as plain text, so LaTeX reaches the student as raw markup.
  assert.ok(warningsFor({ type: 'algebra', prompt: 'Simplify \\frac{1}{2} + \\frac{1}{3}.' })
    .some((w) => /contains LaTeX/.test(w)), 'a LaTeX command in a prompt is warned about');

  assert.ok(warningsFor({ type: 'algebra', prompt: 'Solve $2x + 3 = 11$.' })
    .some((w) => /contains LaTeX/.test(w)), 'a dollar-delimited expression is warned about');

  // LaTeX anywhere a student can read it, not only in the prompt.
  assert.ok(warningsFor({
    type: 'multiAnswer', prompt: 'Answer both parts.',
    answerFields: [{ id: 'a', label: 'Value of \\theta', answer: '30' }],
  }).some((w) => /contains LaTeX/.test(w)), 'LaTeX in an answer field label is warned about');

  // "\frac" parses as formfeed + "rac": the text is already missing characters.
  assert.ok(errorsFor({ type: 'algebra', prompt: 'Simplify \f rac12.' })
    .some((e) => /invisible control character/.test(e)), 'a decayed LaTeX escape is a blocking error');

  // Unicode math — what the contract asks for — is clean.
  assert.deepEqual(
    warningsFor({ type: 'algebra', prompt: 'Solve -3 ≤ x < 5 and write ½ × π as a decimal.' })
      .filter((w) => /contains LaTeX/.test(w)),
    [],
    'Unicode math produces no LaTeX warning',
  );

  // A lone backslash or a Windows path is not a LaTeX command.
  assert.deepEqual(
    warningsFor({ type: 'algebra', prompt: 'The set difference A \\ B.' })
      .filter((w) => /contains LaTeX/.test(w)),
    [],
    'a lone backslash is not flagged',
  );
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
