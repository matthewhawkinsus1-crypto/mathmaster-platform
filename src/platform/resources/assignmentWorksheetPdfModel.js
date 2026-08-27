const clean = (value) => String(value ?? '').trim();
const asArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const isObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const safeChoice = (choice, index) => {
  if (choice == null) return null;
  if (['string', 'number'].includes(typeof choice)) {
    return { label: String.fromCharCode(65 + index), text: String(choice) };
  }
  if (typeof choice !== 'object') return null;
  const text = clean(choice.text ?? choice.labelText ?? choice.display ?? choice.latex ?? choice.content);
  if (!text) return null;
  return {
    label: clean(choice.label) || String.fromCharCode(65 + index),
    text,
  };
};

const visibleChoices = (question = {}) => {
  const candidates = question.choices ?? question.options ?? question.answerChoices ?? [];
  return asArray(candidates).map(safeChoice).filter(Boolean);
};

const scenarioText = (question = {}) => {
  const scenario = question?.context?.scenario ?? question?.scenario ?? question?.stimulus?.text ?? '';
  if (typeof scenario === 'string' || typeof scenario === 'number') return clean(scenario);
  if (scenario && typeof scenario === 'object') {
    return clean(scenario.text ?? scenario.prompt ?? scenario.description);
  }
  return '';
};

const directionsText = (question = {}) => clean(
  question.directions ?? question.instructions ?? question.taskDirections ?? '',
);

export const PRINT_OUTPUT_MODES = Object.freeze({
  STUDENT: 'student',
  TEACHER: 'teacher',
  ANSWER_KEY: 'answerKey',
});

const OUTPUT_MODE_LABELS = Object.freeze({
  student: 'Printable Assignment',
  teacher: 'Teacher Copy',
  answerKey: 'Answer Key',
});

const formatAnswerValue = (value) => {
  if (value == null || value === '') return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    if (value.length === 2 && value.every((entry) => ['number', 'string'].includes(typeof entry))) {
      return `(${value[0]}, ${value[1]})`;
    }
    return value.map(formatAnswerValue).filter(Boolean).join(', ');
  }
  if (typeof value === 'object') {
    if ('x' in value && 'y' in value) return `(${formatAnswerValue(value.x)}, ${formatAnswerValue(value.y)})`;
    if ('re' in value && 'im' in value) {
      const re = Number(value.re);
      const im = Number(value.im);
      if (Number.isFinite(re) && Number.isFinite(im)) {
        const sign = im < 0 ? '−' : '+';
        return `${re} ${sign} ${Math.abs(im)}i`;
      }
    }
    try { return JSON.stringify(value); } catch { return String(value); }
  }
  return String(value);
};

const firstAnswerValue = (source = {}) => {
  const candidates = [
    source.expected,
    source.expectedAnswer,
    source.correctAnswer,
    source.answer,
    source.value,
  ];
  for (const value of candidates) {
    const formatted = formatAnswerValue(value);
    if (formatted) return formatted;
  }
  if (Array.isArray(source.acceptedAnswers) && source.acceptedAnswers.length) {
    return formatAnswerValue(source.acceptedAnswers[0]);
  }
  if (Array.isArray(source.accepted) && source.accepted.length) {
    return formatAnswerValue(source.accepted[0]);
  }
  return '';
};

const labelledAnswerLines = (items = []) => asArray(items).flatMap((entry, index) => {
  if (!entry || typeof entry !== 'object') return [];
  const value = firstAnswerValue(entry);
  if (!value) return [];
  const label = clean(entry.label ?? entry.title ?? entry.prompt ?? entry.kind ?? entry.id) || `Part ${index + 1}`;
  return [`${label}: ${value}`];
});

const gradingAnswerLines = (grading = {}) => {
  if (!grading || typeof grading !== 'object' || Array.isArray(grading)) return [];
  const lines = [];
  const push = (label, value) => {
    const formatted = formatAnswerValue(value);
    if (formatted && !lines.some((line) => line === `${label}: ${formatted}`)) lines.push(`${label}: ${formatted}`);
  };

  [
    ['Answer', grading.answer],
    ['Expected', grading.expected],
    ['Equation', grading.equation],
    ['Domain', grading.domain],
    ['Range', grading.range],
    ['Continuity', grading.continuity],
    ['Classification', grading.classification],
    ['Point', grading.point],
    ['Solution', grading.solution],
    ['Is a function', grading.isFunction],
  ].forEach(([label, value]) => push(label, value));

  const tableValues = grading.table?.values;
  if (tableValues && typeof tableValues === 'object' && !Array.isArray(tableValues)) {
    Object.entries(tableValues).slice(0, 12).forEach(([key, value]) => push(`Table ${key}`, value));
  }
  return lines;
};

export const answerLinesFromResolvedQuestion = (question = {}) => {
  const lines = [];
  const add = (line) => {
    const text = clean(line);
    if (text && !lines.includes(text)) lines.push(text);
  };
  const direct = firstAnswerValue(question);
  if (direct) add(`Answer: ${direct}`);

  labelledAnswerLines(question.responseFields).forEach(add);
  labelledAnswerLines(question.responses).forEach(add);
  labelledAnswerLines(question.answerFields).forEach(add);
  labelledAnswerLines(question.analysisRequests).forEach(add);

  if (question.tableAnswers && typeof question.tableAnswers === 'object' && !Array.isArray(question.tableAnswers)) {
    Object.entries(question.tableAnswers).slice(0, 12).forEach(([key, value]) => add(`Table ${key}: ${formatAnswerValue(value)}`));
  }
  gradingAnswerLines(question.grading).forEach(add);
  gradingAnswerLines(question.recipe?.grading).forEach(add);

  if (question.correctMatches && typeof question.correctMatches === 'object' && !Array.isArray(question.correctMatches)) {
    Object.entries(question.correctMatches).forEach(([key, value]) => add(`Match ${key}: ${formatAnswerValue(value)}`));
  }
  if (question.correctIndependentId) add(`Independent quantity: ${question.correctIndependentId}`);
  if (question.correctDependentId) add(`Dependent quantity: ${question.correctDependentId}`);

  return lines.slice(0, 18);
};

export const solutionLinesFromResolvedQuestion = (question = {}) => {
  const out = [];
  const append = (value) => {
    if (value == null) return;
    if (Array.isArray(value)) {
      value.forEach((entry) => append(
        entry && typeof entry === 'object'
          ? entry.explanation ?? entry.text ?? entry.label ?? entry.result
          : entry,
      ));
      return;
    }
    const text = clean(value);
    if (text && !out.includes(text)) out.push(text);
  };

  append(question.workedSolution);
  append(question.solutionExplanation);
  append(question.explanation);
  append(question.solutionSteps);
  append(question.solution?.steps);
  if (typeof question.solution === 'string' || Array.isArray(question.solution)) append(question.solution);
  else if (question.solution && typeof question.solution === 'object') {
    append(question.solution.explanation ?? question.solution.text ?? question.solution.summary);
  }
  return out.slice(0, 12);
};

const signedTerm = (coefficient, variable = '', { leading = false } = {}) => {
  const n = Number(coefficient);
  if (!Number.isFinite(n) || Math.abs(n) < 1e-12) return '';
  const magnitude = Math.abs(n);
  const coefficientText = variable && magnitude === 1 ? '' : String(magnitude);
  const body = `${coefficientText}${variable}`;
  if (leading) return n < 0 ? `-${body}` : body;
  return n < 0 ? ` - ${body}` : ` + ${body}`;
};

export const functionSpecToMath = (spec = {}, functionName = 'f') => {
  if (!isObject(spec)) return '';
  const type = clean(spec.type || spec.kind || 'line');
  const name = clean(spec.functionName || functionName) || 'f';
  if (type === 'line' || type === 'linear') {
    const m = Number(spec.m ?? spec.a ?? 1);
    const b = Number(spec.b ?? spec.k ?? 0);
    return `${name}(x) = ${signedTerm(m, 'x', { leading: true }) || '0'}${signedTerm(b)}`;
  }
  if (type === 'quadratic') {
    const a = Number(spec.a ?? 1);
    const hasVertex = Object.prototype.hasOwnProperty.call(spec, 'h') || Object.prototype.hasOwnProperty.call(spec, 'k');
    if (hasVertex) {
      const h = Number(spec.h ?? 0);
      const k = Number(spec.k ?? 0);
      const coefficient = a === 1 ? '' : a === -1 ? '-' : String(a);
      const inside = h < 0 ? `x + ${Math.abs(h)}` : h > 0 ? `x - ${h}` : 'x';
      return `${name}(x) = ${coefficient}(${inside})^2${signedTerm(k)}`;
    }
    const b = Number(spec.b ?? 0);
    const c = Number(spec.c ?? 0);
    return `${name}(x) = ${signedTerm(a, 'x^2', { leading: true }) || '0'}${signedTerm(b, 'x')}${signedTerm(c)}`;
  }
  if (type === 'absolute') {
    const a = Number(spec.a ?? 1);
    const h = Number(spec.h ?? 0);
    const k = Number(spec.k ?? 0);
    const coefficient = a === 1 ? '' : a === -1 ? '-' : String(a);
    const inside = h < 0 ? `x + ${Math.abs(h)}` : h > 0 ? `x - ${h}` : 'x';
    return `${name}(x) = ${coefficient}|${inside}|${signedTerm(k)}`;
  }
  if (['squareRoot','cubic','cubeRoot'].includes(type)) {
    const a = Number(spec.a ?? 1);
    const h = Number(spec.h ?? 0);
    const k = Number(spec.k ?? 0);
    const coefficient = a === 1 ? '' : a === -1 ? '-' : String(a);
    const inside = h < 0 ? `x + ${Math.abs(h)}` : h > 0 ? `x - ${h}` : 'x';
    const core = type === 'squareRoot' ? `\\sqrt{${inside}}` : type === 'cubeRoot' ? `\\sqrt[3]{${inside}}` : `(${inside})^3`;
    return `${name}(x) = ${coefficient}${core}${signedTerm(k)}`;
  }
  if (type === 'exponential') {
    const a = Number(spec.a ?? 1);
    const base = Number(spec.base ?? 2);
    const h = Number(spec.h ?? 0);
    const k = Number(spec.k ?? 0);
    const coefficient = a === 1 ? '' : a === -1 ? '-' : String(a);
    const exponent = h < 0 ? `x+${Math.abs(h)}` : h > 0 ? `x-${h}` : 'x';
    return `${name}(x) = ${coefficient}${base}^{${exponent}}${signedTerm(k)}`;
  }
  if (type === 'reciprocal' || type === 'rational') {
    const a = Number(spec.a ?? 1);
    const h = Number(spec.h ?? 0);
    const k = Number(spec.k ?? 0);
    const denominator = h < 0 ? `x + ${Math.abs(h)}` : h > 0 ? `x - ${h}` : 'x';
    return `${name}(x) = \\frac{${a}}{${denominator}}${signedTerm(k)}`;
  }
  return '';
};

const mathLine = (label, value) => {
  const text = clean(value);
  return text ? `${label}: $${text}$` : '';
};

export const structuredGivenLinesFromResolvedQuestion = (question = {}) => {
  const lines = [];
  const add = (line) => {
    const text = clean(line);
    if (text && !lines.includes(text)) lines.push(text);
  };
  if (question.equation) add(mathLine('Equation', question.equation));
  if (question.expression && question.expression !== question.equation) add(mathLine('Expression', question.expression));
  asArray(question.equations).forEach((equation, index) => add(mathLine(`Equation ${index + 1}`, equation)));
  if (question.inequalityText || question.inequality) add(mathLine('Inequality', question.inequalityText || question.inequality));

  const type = clean(question.type || question.toolId).toLowerCase();
  const constructionNeedsRule = ['functiongraph','graphing2','functioninvestigation2','constraintfunctionbuilder'].includes(type);
  if (constructionNeedsRule && isObject(question.functionSpec)) {
    add(mathLine('Function', functionSpecToMath(question.functionSpec)));
  }

  if (Array.isArray(question.inequalities) && question.inequalities.length) {
    question.inequalities.slice(0, 4).forEach((entry, index) => {
      if (!isObject(entry)) return;
      const m = Number(entry.m ?? 0);
      const b = Number(entry.b ?? 0);
      const relation = clean(entry.relation || entry.operator || '>=').replace('>=', '≥').replace('<=', '≤');
      const right = `${signedTerm(m, 'x', { leading: true }) || '0'}${signedTerm(b)}`;
      add(`Inequality ${index + 1}: $y ${relation} ${right}$`);
    });
  }

  return lines.slice(0, 8);
};

const safeTable = (table = {}) => {
  if (!isObject(table)) return null;
  const columns = asArray(table.columns).map((column, index) => {
    if (isObject(column)) {
      const key = clean(column.key || column.id) || `c${index + 1}`;
      return { key, label: clean(column.label || column.name) || key };
    }
    const label = clean(column) || `Column ${index + 1}`;
    return { key: `c${index + 1}`, label };
  });
  const rows = asArray(table.rows).map((row) => {
    if (Array.isArray(row)) return row.map((value) => (value == null ? '' : value));
    if (isObject(row)) {
      return Object.fromEntries(columns.map((column) => [column.key, row[column.key] == null ? '' : row[column.key]]));
    }
    return row;
  });
  if (!columns.length || !rows.length) return null;
  return { columns, rows };
};

const graphWithFunctionSpec = (question = {}) => {
  if (isObject(question.graph)) {
    const graph = { ...question.graph };
    if (!Array.isArray(graph.functions) && isObject(question.functionSpec)) {
      graph.functions = [{ ...question.functionSpec, type: question.functionSpec.type === 'linear' ? 'line' : question.functionSpec.type }];
    }
    return graph;
  }
  if (isObject(question.functionSpec)) {
    return {
      xMin: -10, xMax: 10, yMin: -10, yMax: 10,
      functions: [{ ...question.functionSpec, type: question.functionSpec.type === 'linear' ? 'line' : question.functionSpec.type }],
    };
  }
  return null;
};

const graphHasDrawing = (graph = {}) => (
  isObject(graph)
  && (
    asArray(graph.functions).length > 0
    || asArray(graph.points).length > 0
    || asArray(graph.segments).length > 0
    || isObject(graph.line)
    || Number.isFinite(Number(graph.m))
    || Number.isFinite(Number(graph.b))
  )
);

const graphBounds = (question = {}) => {
  const graph = isObject(question.graph) ? question.graph : {};
  return {
    xMin: Number.isFinite(Number(graph.xMin)) ? Number(graph.xMin) : -10,
    xMax: Number.isFinite(Number(graph.xMax)) ? Number(graph.xMax) : 10,
    yMin: Number.isFinite(Number(graph.yMin)) ? Number(graph.yMin) : -10,
    yMax: Number.isFinite(Number(graph.yMax)) ? Number(graph.yMax) : 10,
    xStep: Number.isFinite(Number(graph.xStep)) ? Number(graph.xStep) : undefined,
    yStep: Number.isFinite(Number(graph.yStep)) ? Number(graph.yStep) : undefined,
  };
};

const mappingVisual = (question = {}, includeAnswers = false) => {
  const pairs = asArray(question.pairs).filter((pair) => Array.isArray(pair) && pair.length >= 2).map((pair) => [pair[0], pair[1]]);
  if (!pairs.length) return null;
  return {
    kind: 'mapping',
    pairs: question.showGivenRelation === false && !includeAnswers ? [] : pairs,
    expectedPairs: includeAnswers ? pairs : [],
    domainLabel: clean(question.domainLabel) || 'Domain',
    rangeLabel: clean(question.rangeLabel) || 'Range',
  };
};

export const printableVisualsFromResolvedQuestion = (question = {}, { includeAnswers = false } = {}) => {
  const visuals = [];
  const type = clean(question.type || question.toolId).toLowerCase();

  const table = safeTable(question.table);
  if (table) visuals.push({ kind: 'table', table });

  if (['graphscenariomatch','graphcomparison'].includes(type) && Array.isArray(question.graphs)) {
    const graphs = question.graphs
      .map((entry, index) => ({
        label: clean(entry?.label || entry?.title) || String.fromCharCode(65 + index),
        graph: isObject(entry?.graph) ? entry.graph : null,
      }))
      .filter((entry) => graphHasDrawing(entry.graph));
    if (graphs.length) visuals.push({ kind: 'graphChoices', graphs });
  } else if (['functiongraph','graphing2','constraintfunctionbuilder'].includes(type)) {
    const solved = graphWithFunctionSpec(question);
    visuals.push(includeAnswers && graphHasDrawing(solved)
      ? { kind: 'graph', graph: solved, label: 'Solved graph' }
      : { kind: 'blankGraph', bounds: graphBounds(question), label: 'Graphing workspace' });
  } else if (['relationshipmodel','modelinglab'].includes(type)) {
    visuals.push({ kind: 'blankGraph', bounds: graphBounds(question), label: 'Model graph workspace' });
  } else if (type === 'relationmapping') {
    const mapping = mappingVisual(question, includeAnswers);
    if (mapping) visuals.push(mapping);
    if (asArray(question.ask).includes('plot')) {
      visuals.push({ kind: 'blankGraph', bounds: graphBounds(question), label: 'Coordinate plot workspace' });
    }
  } else if (type.includes('numberline') || type === 'intervalnumberline') {
    visuals.push({
      kind: 'numberLine',
      min: Number.isFinite(Number(question.min)) ? Number(question.min) : -10,
      max: Number.isFinite(Number(question.max)) ? Number(question.max) : 10,
      step: Number.isFinite(Number(question.step)) ? Number(question.step) : 1,
      intervals: includeAnswers ? asArray(question.intervals) : [],
      showAnswer: includeAnswers,
    });
  } else {
    const graph = graphWithFunctionSpec(question);
    if (graphHasDrawing(graph)) visuals.push({ kind: 'graph', graph, label: 'Graph' });
  }

  return visuals;
};

export const printableQuestionFromResolved = (question = {}, {
  sourceIndex = 0,
  number = 1,
  sectionRole = 'practice',
  sectionLabel = 'Practice',
  includeAnswers = false,
  includeSolutions = false,
} = {}) => ({
  sourceIndex,
  number,
  sectionRole: clean(sectionRole) || 'practice',
  sectionLabel: clean(sectionLabel) || 'Practice',
  type: clean(question.type || question.toolId) || 'question',
  prompt: clean(question.prompt ?? question.question ?? question.stem),
  directions: directionsText(question),
  scenario: scenarioText(question),
  givens: structuredGivenLinesFromResolvedQuestion(question),
  choices: visibleChoices(question),
  visuals: printableVisualsFromResolvedQuestion(question, { includeAnswers }),
  workspace: clean(question.printWorkspace ?? question.workspaceHint ?? ''),
  ...(includeAnswers ? { answerLines: answerLinesFromResolvedQuestion(question) } : {}),
  ...(includeSolutions ? { solutionLines: solutionLinesFromResolvedQuestion(question) } : {}),
});

export const buildAssignmentWorksheetModel = ({
  assignment = {},
  student = {},
  entries = [],
  outputMode = PRINT_OUTPUT_MODES.STUDENT,
} = {}) => {
  const mode = Object.values(PRINT_OUTPUT_MODES).includes(outputMode) ? outputMode : PRINT_OUTPUT_MODES.STUDENT;
  const includeAnswers = mode !== PRINT_OUTPUT_MODES.STUDENT;
  const includeSolutions = mode === PRINT_OUTPUT_MODES.TEACHER;
  const sections = [];
  const byKey = new Map();
  asArray(entries).forEach((entry) => {
    if (!entry?.question || entry.available === false) return;
    const role = clean(entry.sectionRole) || 'practice';
    const label = clean(entry.sectionLabel) || 'Practice';
    const key = `${role}::${label}`;
    if (!byKey.has(key)) {
      const section = { role, label, questions: [] };
      byKey.set(key, section);
      sections.push(section);
    }
    const section = byKey.get(key);
    section.questions.push(printableQuestionFromResolved(entry.question, {
      sourceIndex: Number(entry.sourceIndex) || 0,
      number: section.questions.length + 1,
      sectionRole: role,
      sectionLabel: label,
      includeAnswers,
      includeSolutions,
    }));
  });

  return {
    assignmentId: clean(assignment.id),
    title: clean(assignment.title) || 'MathMaster Assignment',
    dueAt: assignment.dueAt || assignment.dueDate || null,
    studentName: clean(student.displayName ?? student.name),
    classPeriod: clean(student.classPeriod),
    outputMode: mode,
    documentLabel: OUTPUT_MODE_LABELS[mode],
    includeAnswers,
    includeSolutions,
    sections,
  };
};

const filePart = (value, fallback) => {
  const cleaned = clean(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
  return cleaned || fallback;
};

export const worksheetFileName = ({ assignmentTitle = '', studentName = '', outputMode = PRINT_OUTPUT_MODES.STUDENT } = {}) => {
  const studentPart = clean(studentName) ? `-${filePart(studentName, 'Student')}` : '';
  const modePart = outputMode === PRINT_OUTPUT_MODES.TEACHER
    ? `Teacher_Copy${studentPart}`
    : outputMode === PRINT_OUTPUT_MODES.ANSWER_KEY ? `Answer_Key${studentPart}` : filePart(studentName, 'Printable');
  return `${filePart(assignmentTitle, 'MathMaster_Assignment')}-${modePart}.pdf`;
};
