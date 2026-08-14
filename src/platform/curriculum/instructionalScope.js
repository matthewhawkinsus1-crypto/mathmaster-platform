const clean = (value) => String(value ?? '').trim();
const token = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
const asArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const isObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const nonEmptyArray = (value) => Array.isArray(value) && value.length > 0;

export const INSTRUCTIONAL_DEPTH = Object.freeze({
  exposure: 1,
  recognize: 2,
  analyze: 3,
  construct: 4,
});

// Curated lesson-scope profiles are deliberately narrower than course capability.
// A tool may be capable of more mathematics than a lesson has taught. These
// profiles tell Authoring Intent V5 how deeply a concept may be assessed *now*.
// Add profiles as curriculum lessons are mapped/audited; course-wide rules below
// still protect known forward-course representations when no lesson profile exists.
const BLUEBONNET_SCOPE = Object.freeze({
  'algebra1:m1:t1:l1-2': Object.freeze({
    label: 'Algebra I Module 1 Topic 1 Lessons 1–2',
    concepts: Object.freeze({
      absoluteExtremum: 0,
      formalBehaviorIntervals: 0,
      intervalNotationDomainRange: 0,
      equationFromFunctionCharacteristics: 0,
    }),
    representations: Object.freeze({
      graphicalBehavior: 'displayedGraph',
    }),
    note: 'These lessons analyze relationships and sort graph shapes/behavior before formal function-family extrema or interval analysis is taught.',
  }),
  'algebra1:m1:t1:l3-4': Object.freeze({
    label: 'Algebra I Module 1 Topic 1 Lessons 3–4',
    concepts: Object.freeze({
      // The source explicitly introduces absolute maximum/minimum as a graph
      // characteristic and has students sort/classify by that property. It does
      // not make exact extremum calculation or solving from extrema the target.
      absoluteExtremum: INSTRUCTIONAL_DEPTH.recognize,
      formalBehaviorIntervals: 0,
      intervalNotationDomainRange: 0,
      // These lessons compare/identify families from characteristics. Keep
      // equation construction from a characteristic list for later targeted work.
      equationFromFunctionCharacteristics: INSTRUCTIONAL_DEPTH.recognize,
    }),
    note: 'These lessons introduce function families and graphical characteristics. Recognition/classification is appropriate; formal interval responses, exact extrema analysis, and equation construction from characteristics are not.',
  }),
});

const normalizeCourseId = (input = {}) => {
  const id = token(input?.assignment?.courseId || input?.lessonMetadata?.course || input?.assignment?.course || '');
  if (['algebra1','algebrai','alg1'].includes(id)) return 'algebra1';
  if (['algebra2','algebraii','alg2'].includes(id)) return 'algebra2';
  return id || null;
};

const numeric = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const resolveLessonProfile = (input = {}) => {
  const meta = input.lessonMetadata || input.assignment?.curriculum || input.assignment?.lessonMetadata || {};
  const provider = token(meta.provider || input.assignment?.provider || '');
  if (provider && !provider.includes('bluebonnet')) return null;
  const courseId = normalizeCourseId(input);
  const module = numeric(meta.module);
  const topic = numeric(meta.topic);
  const lessons = asArray(meta.lessons ?? meta.lesson).map(numeric).filter((n) => n != null).sort((a,b) => a-b);
  if (courseId === 'algebra1' && module === 1 && topic === 1) {
    if (lessons.length && lessons.every((n) => n === 1 || n === 2)) return BLUEBONNET_SCOPE['algebra1:m1:t1:l1-2'];
    if (lessons.length && lessons.every((n) => n === 3 || n === 4)) return BLUEBONNET_SCOPE['algebra1:m1:t1:l3-4'];
  }
  return null;
};

const actionSet = (question = {}) => new Set(asArray(question.studentActions || question.actions || question.studentAction).map(token));
const promptText = (question = {}) => clean(question.prompt).toLowerCase();
const constraints = (question = {}) => asArray(question.constraints);


const responseFields = (question = {}) => asArray(question.responses || question.answerFields || question.response?.fields).filter(isObject);

const hasGraphSource = (question = {}) => {
  if (isObject(question.graph) || isObject(question.function) || isObject(question.functionSpec)) return true;
  if (isObject(question.visual?.graph) || question.visual?.type === 'graph') return true;
  if (nonEmptyArray(question.graphs) || nonEmptyArray(question.candidateGraphs)) return true;
  if (nonEmptyArray(question.items) && question.items.some((item) => isObject(item?.graph) || isObject(item?.graphSpec) || isObject(item?.function))) return true;
  return false;
};

const graphChoiceCount = (question = {}) => {
  const choices = asArray(question.graphs || question.candidateGraphs);
  return choices.filter((item) => isObject(item) && (isObject(item.graph) || isObject(item.function) || isObject(item.functionSpec) || isObject(item.graphSpec))).length;
};

const isGraphicalBehaviorAssessment = (question = {}) => {
  const construct = token(question.assessedConstruct);
  if (['graphicalbehavior','graphbehavior','analyzegraphbehavior','readgraphbehavior'].includes(construct)) return true;
  const actions = actionSet(question);
  if (['analyzeincreasing','analyzedecreasing','analyzeconstant'].some((name) => actions.has(name))) return true;
  const fields = responseFields(question);
  const fieldText = fields.map((field) => `${clean(field.id)} ${clean(field.label)} ${asArray(field.options).join(' ')}`).join(' ').toLowerCase();
  const asksBehavior = /\bbehavior\b|\bincreasing\b|\bdecreasing\b|\bconstant\b/.test(fieldText);
  const asksShape = /\bgraph\s*shape\b|\bstraight\s+line\b|\bsmooth\s+curve\b|\bisolated\s+points\b/.test(fieldText);
  return asksBehavior && asksShape;
};

const representationErrorsForQuestion = (question = {}, label, profile) => {
  const errors = [];
  const actions = actionSet(question);
  const constructingGraph = actions.has('constructgraph');

  if (actions.has('comparegraphs') && graphChoiceCount(question) < 1) {
    errors.push(`${label} violates representation fidelity: compareGraphs requires at least one displayed graph choice. Provide candidateGraphs/graphs with graph or function data instead of asking students to infer an unseen graph.`);
  }
  if (actions.has('matchgraphstostories') && !nonEmptyArray(question.candidateGraphs || question.graphs)) {
    errors.push(`${label} violates representation fidelity: graph/story matching requires displayed candidate graphs.`);
  }
  if (actions.has('interpretpointincontext') && !hasGraphSource(question)) {
    errors.push(`${label} violates representation fidelity: interpreting a point from a graph requires a displayed graph.`);
  }

  const explicitGraphicalBehavior = ['graphicalbehavior','graphbehavior','analyzegraphbehavior','readgraphbehavior'].includes(token(question.assessedConstruct));
  if (!constructingGraph && explicitGraphicalBehavior && !hasGraphSource(question)) {
    errors.push(`${label} violates representation fidelity: assessedConstruct=graphicalBehavior requires a displayed graph/function representation unless the student is constructing the graph.`);
  } else if (!constructingGraph && profile?.representations?.graphicalBehavior === 'displayedGraph'
      && isGraphicalBehaviorAssessment(question) && !hasGraphSource(question)) {
    errors.push(`${label} violates representation fidelity for ${profile.label}: this lesson assesses graphical behavior by reading a displayed graph. Add a graph/function representation, or change the assessed construct so students are not being asked to infer an unseen graph from an equation.`);
  }

  return errors;
};

const demandsForQuestion = (question = {}) => {
  const actions = actionSet(question);
  const notation = token(question.notation);
  const prompt = promptText(question);
  const out = [];

  const behaviorActions = ['analyzeincreasing','analyzedecreasing','analyzeconstant','analyzepositive','analyzenegative'];
  if (notation === 'interval' && behaviorActions.some((name) => actions.has(name))) {
    out.push({ concept: 'formalBehaviorIntervals', depth: INSTRUCTIONAL_DEPTH.analyze, reason: 'requires formal interval notation for graph behavior' });
  }
  if (notation === 'interval' && (actions.has('analyzedomain') || actions.has('analyzerange') || actions.has('statedomain') || actions.has('staterange'))) {
    out.push({ concept: 'intervalNotationDomainRange', depth: INSTRUCTIONAL_DEPTH.analyze, reason: 'requires interval notation for domain/range' });
  }

  if (actions.has('findmaximum') || actions.has('findminimum')) {
    out.push({ concept: 'absoluteExtremum', depth: INSTRUCTIONAL_DEPTH.analyze, reason: 'requires finding an exact maximum/minimum rather than recognizing the characteristic' });
  }
  if (constraints(question).some((entry) => token(entry?.kind) === 'extremum')) {
    out.push({ concept: 'absoluteExtremum', depth: INSTRUCTIONAL_DEPTH.construct, reason: 'requires constructing a function from a maximum/minimum condition' });
  }

  const mentionsExtremum = /\babsolute\s+(maximum|minimum)\b|\b(maximum|minimum)\s+(value|at)\b/.test(prompt);
  if (mentionsExtremum && (actions.has('writeequation') || actions.has('constructgraph') || actions.has('buildfunctionfromconstraints'))) {
    out.push({ concept: 'absoluteExtremum', depth: INSTRUCTIONAL_DEPTH.construct, reason: 'uses an extremum condition to construct/solve a function' });
  } else if (mentionsExtremum) {
    out.push({ concept: 'absoluteExtremum', depth: INSTRUCTIONAL_DEPTH.recognize, reason: 'asks students to recognize an absolute maximum/minimum characteristic' });
  }

  const characteristicConstruction = actions.has('buildfunctionfromconstraints')
    || (actions.has('writeequation') && !clean(question.scenario) && /\b(characteristic|family|maximum|minimum|increasing|decreasing|continuous|discrete)\b/.test(prompt));
  if (characteristicConstruction) {
    out.push({ concept: 'equationFromFunctionCharacteristics', depth: INSTRUCTIONAL_DEPTH.construct, reason: 'requires creating an equation/model from function-family characteristics' });
  }

  return out;
};

const sectionQuestions = (input = {}) => {
  if (Array.isArray(input.activities)) {
    return input.activities.flatMap((activity) => asArray(activity?.questions).map((question, index) => ({
      question,
      label: `${clean(activity?.title || activity?.role || 'Activity')} Question ${index + 1}`,
    })));
  }
  return asArray(input.questions).map((question, index) => ({ question, label: `Question ${index + 1}` }));
};

export const validateInstructionalScopeV5 = (input = {}) => {
  const errors = [];
  const warnings = [];
  const courseId = normalizeCourseId(input);
  const profile = resolveLessonProfile(input);

  sectionQuestions(input).forEach(({ question, label }) => {
    const demands = demandsForQuestion(question);
    representationErrorsForQuestion(question, label, profile).forEach((message) => errors.push(message));

    // Course ceiling: Algebra I may discuss increasing/decreasing and domain/range,
    // but formal interval-notation analysis belongs above this course in the
    // current MathMaster curriculum contract. A later Algebra I lesson can still
    // analyze those ideas in source-appropriate representations such as verbal
    // classification or inequalities.
    if (courseId === 'algebra1') {
      demands.forEach((demand) => {
        if (demand.concept === 'formalBehaviorIntervals') {
          errors.push(`${label} exceeds the Algebra I instructional ceiling: ${demand.reason}. Ask for qualitative/left-to-right behavior instead of formal increasing/decreasing intervals.`);
        }
        if (demand.concept === 'intervalNotationDomainRange') {
          errors.push(`${label} exceeds the Algebra I instructional ceiling: ${demand.reason}. Use the representation taught by the lesson (typically inequalities, finite sets, or verbal all-real-number language).`);
        }
      });
    }

    if (!profile) return;
    demands.forEach((demand) => {
      const allowed = profile.concepts[demand.concept];
      if (allowed == null) return;
      if (demand.depth <= allowed) return;
      errors.push(`${label} exceeds the current lesson depth in ${profile.label}: ${demand.reason}. This lesson allows this concept only through ${allowed === 0 ? 'later instruction (not assessed here)' : allowed === 1 ? 'exposure' : allowed === 2 ? 'recognition/classification' : 'analysis'}.`);
    });
  });

  if (!profile && Number(input.schemaVersion) === 5 && input.lessonMetadata?.provider) {
    warnings.push('No curated lesson-depth profile is registered for this curriculum lesson yet. Course-level ceilings still apply; teacher Preflight remains the final source-fidelity check.');
  }

  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)], profile };
};

export const getInstructionalScopeProfile = resolveLessonProfile;
