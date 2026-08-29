import {
  printableVisualsFromResolvedQuestion,
  solutionLinesFromResolvedQuestion,
  structuredGivenLinesFromResolvedQuestion,
} from '../resources/assignmentWorksheetPdfModel.js';
import { SUPPORTED_WORKSHEET_VISUAL_KINDS } from '../resources/assignmentWorksheetVisuals.js';

const clean = (value) => String(value ?? '').trim();
const asArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const isObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const WORKSHEET_PROFILES = Object.freeze([
  'studentWorksheetPdf',
  'teacherWorksheetPdf',
  'answerKeyPdf',
]);

const token = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '');

const enabledWorksheetProfiles = (outputProfiles = {}) => WORKSHEET_PROFILES.filter(
  (profile) => outputProfiles?.[profile]?.enabled === true,
);

const narrativeCharacters = (question = {}) => [
  question.prompt,
  question.question,
  question.stem,
  question.directions,
  question.instructions,
  question.scenario,
  question.context?.scenario,
  ...asArray(question.choices).map((choice) => isObject(choice) ? choice.text ?? choice.labelText ?? choice.display : choice),
  ...asArray(question.options).map((choice) => isObject(choice) ? choice.text ?? choice.labelText ?? choice.display : choice),
].map(clean).join(' ').length;

const typeRequiresVisual = (question = {}) => {
  const type = token(question.type || question.toolId);
  if (['graphanalysis','graphing','graphstory','functioninvestigation','functioninvestigation2'].includes(type)) return 'graph';
  if (['graphscenariomatch','graphcomparison'].includes(type)) return 'graphChoices';
  if (type === 'table') return 'table';
  if (type === 'relationmapping') return 'mapping';
  if (type.includes('numberline')) return 'numberLine';
  if (['functiongraph','graphing2','constraintfunctionbuilder'].includes(type)) return 'blankGraph';
  return null;
};

const requiresGraphWorkspace = (question = {}) => {
  const type = token(question.type || question.toolId);
  if (['functiongraph','graphing2','constraintfunctionbuilder'].includes(type)) return true;
  if (['relationshipmodel','modelinglab'].includes(type)) {
    const ask = asArray(question.recipe?.ask || question.ask).map(token);
    return ask.includes('graph') || ask.includes('constructgraph');
  }
  if (type === 'relationmapping') return asArray(question.ask).map(token).includes('plot');
  return false;
};

const tableShape = (question = {}) => {
  const table = isObject(question.table) ? question.table : null;
  if (!table) return null;
  return {
    columns: asArray(table.columns).length,
    rows: asArray(table.rows).length,
  };
};

const mappingSize = (question = {}) => {
  const pairs = asArray(question.pairs).filter((pair) => Array.isArray(pair) && pair.length >= 2);
  return {
    pairs: pairs.length,
    domain: new Set(pairs.map((pair) => String(pair[0]))).size,
    range: new Set(pairs.map((pair) => String(pair[1]))).size,
  };
};

const graphChoiceCount = (question = {}) => asArray(question.graphs).filter((entry) => isObject(entry?.graph)).length;

const hasStructuredProblemData = (question = {}) => Boolean(
  clean(question.equation)
  || asArray(question.equations).length
  || clean(question.inequalityText || question.inequality)
  || isObject(question.functionSpec)
);

const sourceSolutionArrayCount = (question = {}) => [
  question.solutionSteps,
  question.solution?.steps,
  question.workedSolution,
].filter(Array.isArray).reduce((sum, values) => sum + values.length, 0);

export const auditWorksheetPrintQuestion = (question = {}, {
  label = 'Question',
  teacherCopyEnabled = true,
} = {}) => {
  const errors = [];
  const warnings = [];
  if (!isObject(question)) return { errors, warnings };

  const studentVisuals = printableVisualsFromResolvedQuestion(question, { includeAnswers: false });
  const teacherVisuals = printableVisualsFromResolvedQuestion(question, { includeAnswers: true });
  const studentKinds = new Set(studentVisuals.map((visual) => visual?.kind).filter(Boolean));
  const teacherKinds = new Set(teacherVisuals.map((visual) => visual?.kind).filter(Boolean));
  const requiredVisual = typeRequiresVisual(question);

  [...studentKinds, ...teacherKinds].forEach((kind) => {
    if (!SUPPORTED_WORKSHEET_VISUAL_KINDS.includes(kind)) {
      errors.push(`${label} produces unsupported worksheet visual kind "${kind}". Add a print renderer before publishing a PDF-enabled assignment.`);
    }
  });

  if (requiredVisual && !studentKinds.has(requiredVisual)) {
    errors.push(
      `${label} requires a ${requiredVisual} representation, but the student worksheet model cannot reproduce it. PDF publication would change or omit the mathematics.`,
    );
  }

  if (requiresGraphWorkspace(question) && !studentKinds.has('blankGraph')) {
    errors.push(
      `${label} asks the student to construct or plot a graph, but the worksheet contains no graphing workspace.`,
    );
  }

  if (hasStructuredProblemData(question) && structuredGivenLinesFromResolvedQuestion(question).length === 0) {
    const type = token(question.type || question.toolId);
    const visualCarriesFunction = ['graphanalysis','graphing','graphstory','functioninvestigation','functioninvestigation2'].includes(type);
    if (!visualCarriesFunction) {
      errors.push(
        `${label} stores essential problem data in structured fields but the worksheet model does not expose those givens. The PDF could omit the actual equation/function/inequality.`,
      );
    }
  }

  const table = tableShape(question);
  if (table) {
    if (table.columns > 8) {
      errors.push(`${label} has ${table.columns} table columns. The worksheet supports at most 8 readable columns on a portrait page.`);
    }
    if (table.rows > 18) {
      errors.push(`${label} has ${table.rows} table rows. That table is too tall for one worksheet question card and would clip or force unreadable scaling.`);
    } else if (table.rows > 12) {
      warnings.push(`${label} has ${table.rows} table rows and may consume most of a worksheet page.`);
    }
  }

  const graphChoices = graphChoiceCount(question);
  if (graphChoices > 6) {
    errors.push(`${label} contains ${graphChoices} graph choices. The printable two-column graph grid supports at most 6 choices per question.`);
  } else if (graphChoices > 4) {
    warnings.push(`${label} contains ${graphChoices} graph choices and will likely occupy most of one worksheet page.`);
  }

  const mapping = mappingSize(question);
  if (mapping.domain > 12 || mapping.range > 12 || mapping.pairs > 24) {
    errors.push(
      `${label} mapping diagram is too large for the printable page (${mapping.domain} domain values, ${mapping.range} range values, ${mapping.pairs} pairs).`,
    );
  } else if (mapping.domain > 8 || mapping.range > 8 || mapping.pairs > 16) {
    warnings.push(`${label} mapping diagram is large and may require most of a worksheet page.`);
  }

  const narrative = narrativeCharacters(question);
  const hasTallVisual = studentKinds.has('graph') || studentKinds.has('blankGraph') || studentKinds.has('graphChoices') || studentKinds.has('mapping');
  const hardNarrativeLimit = hasTallVisual ? 2800 : 4800;
  const warnNarrativeLimit = hasTallVisual ? 1900 : 3200;
  if (narrative > hardNarrativeLimit) {
    errors.push(
      `${label} has ${narrative} characters of printable prompt/scenario/choice text plus ${hasTallVisual ? 'a large visual' : 'worksheet content'}. It is too tall for one printable question card.`,
    );
  } else if (narrative > warnNarrativeLimit) {
    warnings.push(`${label} has a long printable prompt/scenario and may consume most of a page.`);
  }

  if (teacherCopyEnabled) {
    const solutions = solutionLinesFromResolvedQuestion(question);
    const solutionCharacters = solutions.join(' ').length;
    const sourceSolutionCount = sourceSolutionArrayCount(question);
    if (sourceSolutionCount > 12) {
      errors.push(
        `${label} has ${sourceSolutionCount} authored solution steps, but the current teacher worksheet model supports at most 12. Reduce/condense the solution before publishing.`,
      );
    }
    if (solutionCharacters > 3000) {
      errors.push(`${label} teacher-copy solution text is too long for one printable question card (${solutionCharacters} characters).`);
    } else if (solutionCharacters > 1800) {
      warnings.push(`${label} teacher-copy solution is long and may consume most of a page.`);
    }
  }

  return {
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    studentVisualKinds: [...studentKinds],
    teacherVisualKinds: [...teacherKinds],
  };
};

export const auditAssignmentWorksheetPrintability = (assignmentV5 = {}, questions = []) => {
  const errors = [];
  const warnings = [];
  const profiles = enabledWorksheetProfiles(assignmentV5?.outputProfiles || {});
  if (!profiles.length) return { errors, warnings, enabledProfiles: profiles };

  const teacherCopyEnabled = profiles.includes('teacherWorksheetPdf');
  asArray(questions).forEach((question, index) => {
    const result = auditWorksheetPrintQuestion(question, {
      label: `Question ${index + 1}`,
      teacherCopyEnabled,
    });
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  });

  return {
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    enabledProfiles: profiles,
  };
};

export default auditAssignmentWorksheetPrintability;
