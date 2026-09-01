const clean = (value) => String(value ?? '').trim();

const MISSING_LABELS = Object.freeze({
  coreTeks: 'Core TEKS alignment',
  higherOrderReasoning: 'higher-order reasoning',
  multipleRepresentations: 'multiple representations',
  justification: 'explanation / justification',
  modelingApplication: 'modeling / application',
  ccmrEnrichment: 'audited CCMR Practice',
});

const sectionQuestions = (section = {}) => (
  Array.isArray(section?.questions) ? section.questions : []
);

const visibleStem = (question = {}) => clean(
  question.prompt
  || question.scenario
  || question.title
  || '',
);

const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stableValue(value[key])]),
    );
  }
  return value;
};

const protectedQuestionContent = (question = {}) => {
  const keys = [
    'type', 'toolId', 'prompt', 'scenario', 'title', 'equation',
    'choices', 'responseFields', 'answerFields', 'responses', 'generator',
    'data', 'graphSpec', 'functionSpec', 'workflow', 'analysisRequests',
    'dok', 'dokLevel', 'difficultyBand', 'calculatorPolicy', 'representations',
  ];
  return JSON.stringify(stableValue(Object.fromEntries(
    keys.filter((key) => Object.prototype.hasOwnProperty.call(question, key))
      .map((key) => [key, question[key]]),
  )));
};

export const honorsMissingLabels = (missing = []) => (
  (Array.isArray(missing) ? missing : [])
    .map((key) => MISSING_LABELS[key] || clean(key))
    .filter(Boolean)
);

export const nonCcmrHonorsMissing = (honorsReport = {}) => (
  (Array.isArray(honorsReport?.missing) ? honorsReport.missing : [])
    .filter((key) => key !== 'ccmrEnrichment')
);

/**
 * The provider returns a complete V5 object because the shared assignment-AI
 * callable is intentionally schema-specific. This gate prevents an Honors
 * repair from becoming an assignment rewrite: Preflight keeps all assignment
 * policies and accepts only repaired section content.
 */
export const applyHonorsDepthAiSections = (currentAssignment = {}, aiAssignment = {}) => {
  if (!currentAssignment || typeof currentAssignment !== 'object' || Array.isArray(currentAssignment)) {
    throw new Error('The current Assignment V5 object is required.');
  }
  if (!aiAssignment || typeof aiAssignment !== 'object' || Array.isArray(aiAssignment)) {
    throw new Error('MathMaster AI did not return an Assignment V5 object.');
  }
  if (Number(aiAssignment.schemaVersion) !== 5 || !Array.isArray(aiAssignment.sections)) {
    throw new Error('MathMaster AI did not return a complete Assignment V5 repair.');
  }

  const sourceCourse = clean(currentAssignment?.assignment?.courseId);
  const returnedCourse = clean(aiAssignment?.assignment?.courseId);
  if (sourceCourse && returnedCourse && sourceCourse !== returnedCourse) {
    throw new Error(`MathMaster AI changed the course from ${sourceCourse} to ${returnedCourse}; the repair was rejected.`);
  }

  const sourceSections = Array.isArray(currentAssignment.sections) ? currentAssignment.sections : [];
  const nextSections = aiAssignment.sections;
  if (nextSections.length !== sourceSections.length) {
    throw new Error('MathMaster AI changed the assignment section structure; the repair was rejected.');
  }

  let addedQuestions = 0;
  sourceSections.forEach((sourceSection, sectionIndex) => {
    const nextSection = nextSections[sectionIndex] || {};
    const sourceRole = clean(sourceSection.role).toLowerCase();
    const nextRole = clean(nextSection.role).toLowerCase();
    const sourceId = clean(sourceSection.id);
    const nextId = clean(nextSection.id);
    if (sourceRole !== nextRole || (sourceId && sourceId !== nextId)) {
      throw new Error('MathMaster AI changed a section identity or role; the repair was rejected.');
    }

    const before = sectionQuestions(sourceSection);
    const after = sectionQuestions(nextSection);
    if (after.length < before.length) {
      throw new Error('MathMaster AI removed an existing question; the repair was rejected.');
    }
    const growth = after.length - before.length;
    if (growth > 0 && !['classwork', 'practice'].includes(sourceRole)) {
      throw new Error('Honors depth may only add one extension inside Classwork or Practice.');
    }
    addedQuestions += growth;

    before.forEach((sourceQuestion, questionIndex) => {
      const nextQuestion = after[questionIndex] || {};
      const sourceStem = visibleStem(sourceQuestion);
      const nextStem = visibleStem(nextQuestion);
      if (sourceStem && nextStem !== sourceStem) {
        throw new Error('MathMaster AI rewrote an existing question instead of repairing its Honors metadata; the repair was rejected.');
      }
      if (clean(sourceQuestion.type || sourceQuestion.toolId) !== clean(nextQuestion.type || nextQuestion.toolId)) {
        throw new Error('MathMaster AI changed an existing question interaction type; the repair was rejected.');
      }
      if (protectedQuestionContent(sourceQuestion) !== protectedQuestionContent(nextQuestion)) {
        throw new Error('MathMaster AI changed existing question mathematics, grading, or rigor metadata; the repair was rejected.');
      }
    });
  });

  if (addedQuestions > 1) {
    throw new Error('MathMaster AI added more than one Honors extension question; the repair was rejected.');
  }

  return {
    ...currentAssignment,
    // Assignment metadata, delivery, grading, supports, outputs and evidence
    // stay owned by the reviewed source. AI is allowed to repair only content.
    sections: nextSections,
  };
};

export const separateHonorsDepthAiRepair = (currentAssignment = {}, guardedCandidate = {}) => {
  const sourceSections = Array.isArray(currentAssignment?.sections) ? currentAssignment.sections : [];
  const candidateSections = Array.isArray(guardedCandidate?.sections) ? guardedCandidate.sections : [];
  let honorsEnrichmentQuestion = null;

  const sourceOnlySections = candidateSections.map((section, sectionIndex) => {
    const sourceSection = sourceSections[sectionIndex] || {};
    const originalCount = sectionQuestions(sourceSection).length;
    const questions = sectionQuestions(section);
    const added = questions.slice(originalCount);
    if (added.length) {
      const [question] = added;
      honorsEnrichmentQuestion = {
        ...question,
        activityRole: question.activityRole || section.role || 'classwork',
        sectionId: question.sectionId || section.id || null,
      };
    }
    return {
      ...section,
      questions: questions.slice(0, originalCount).map((question, questionIndex) => {
        const sourceQuestion = sectionQuestions(sourceSection)[questionIndex] || {};
        return {
          ...question,
          ...(sourceQuestion.questionId ? { questionId: sourceQuestion.questionId } : {}),
          ...(sourceQuestion.id ? { id: sourceQuestion.id } : {}),
          ...(sourceQuestion.familyId ? { familyId: sourceQuestion.familyId } : {}),
        };
      }),
    };
  });

  return {
    assignmentV5: {
      ...currentAssignment,
      sections: sourceOnlySections,
    },
    honorsEnrichmentQuestion,
  };
};

export const buildHonorsDepthAiRepairRequest = ({
  assignmentV5,
  honorsReport = {},
} = {}) => {
  if (!assignmentV5 || typeof assignmentV5 !== 'object' || Array.isArray(assignmentV5)) {
    throw new Error('A current Assignment V5 object is required for Honors repair.');
  }
  const courseId = clean(assignmentV5?.assignment?.courseId);
  if (!courseId) throw new Error('The assignment course is missing.');

  const missing = nonCcmrHonorsMissing(honorsReport);
  if (!missing.length) {
    throw new Error('There are no non-CCMR Honors depth gaps for AI to repair.');
  }

  const repairSnapshot = {
    schemaVersion: 5,
    assignment: {
      title: clean(assignmentV5?.assignment?.title),
      courseId,
      instructionalPurpose: clean(assignmentV5?.assignment?.instructionalPurpose) || 'lesson',
      gradingPurpose: clean(assignmentV5?.assignment?.gradingPurpose) || 'classwork',
    },
    sections: Array.isArray(assignmentV5.sections) ? assignmentV5.sections : [],
  };

  return [
    '# MathMaster Honors-depth repair',
    '',
    'Repair the current assignment only enough to satisfy the listed Honors depth gaps.',
    'Return exactly one MathMaster Assignment V5 JSON object and nothing else.',
    'The object MUST contain schemaVersion, assignment, and sections. Assignment-level delivery/support/output policies are intentionally omitted from the repair packet because MathMaster preserves them automatically.',
    '',
    `Course: ${courseId}`,
    `Non-CCMR Honors gaps to repair: ${honorsMissingLabels(missing).join(', ')}`,
    '',
    '## Compact repair contract',
    '- Preserve every existing section id, section role, question order, prompt/scenario/title, mathematical task, answer/grading field, interaction type/tool, workflow, graph/function data, DOK, difficulty, calculator policy, and representation field exactly as supplied.',
    '- Do not remove or reorder an existing question.',
    '- Do not invent or change platform-owned question ids on existing questions.',
    '- Existing questions may receive corrected/added TEKS alignment metadata ONLY when their visible mathematics clearly supports that alignment.',
    '- If Core TEKS is missing, infer alignment only from the mathematics already visible in that exact question and this course. Do not change mathematics to force a standard. Do not introduce a later-unit standard merely to make the audit green.',
    '- If alignment is uncertain, leave it unresolved.',
    '- You may add AT MOST ONE new Honors extension question, and only to Classwork or Practice, if needed to supply missing higher-order depth.',
    '- A new extension must stay on the same lesson TEKS and require genuine reasoning through multiple representations, explanation/justification, or modeling/application as needed. Keep DOK and difficulty distinct.',
    '- Do not fabricate SAT, ACT, TSIA2, or ASVAB provenance. Audited CCMR Practice is sourced separately from MathMaster Fidelity V2.1 at publish time.',
    '- Do not add assignment-level delivery, grading, support, evidence, PDF, Classroom, or publication settings. MathMaster keeps those from the reviewed source.',
    '',
    '## Current Assignment V5 repair snapshot',
    JSON.stringify(repairSnapshot),
  ].join('\n');
};

export default buildHonorsDepthAiRepairRequest;
