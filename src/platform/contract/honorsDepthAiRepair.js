import { CONTRACT_SLICES, buildContractSlice } from './authoringContract.js';
import { compileAuthoringIntentV5 } from './authoringIntentV5.js';
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

const PROTECTED_QUESTION_KEYS = Object.freeze([
  'type', 'toolId', 'prompt', 'scenario', 'title', 'equation',
  'choices', 'responseFields', 'answerFields', 'responses', 'generator',
  'data', 'graph', 'graphSpec', 'function', 'functionSpec', 'workflow', 'analysisRequests',
  'studentActions', 'dok', 'dokLevel', 'difficultyBand', 'calculatorPolicy',
  'representation', 'representations',
]);

const protectedQuestionChanged = (source = {}, candidate = {}) => (
  PROTECTED_QUESTION_KEYS.some((key) => (
    Object.prototype.hasOwnProperty.call(candidate, key)
    && JSON.stringify(stableValue(candidate[key])) !== JSON.stringify(stableValue(source[key]))
  ))
);

const ALIGNMENT_KEYS = Object.freeze([
  'standard',
  'primaryStandard',
  'secondaryStandards',
  'prerequisiteStandards',
  'alignments',
]);

const alignmentPatch = (candidate = {}) => Object.fromEntries(
  ALIGNMENT_KEYS
    .filter((key) => Object.prototype.hasOwnProperty.call(candidate, key))
    .map((key) => [key, candidate[key]]),
);

const extensionIntentOnly = (question = {}) => {
  const next = { ...question };
  [
    'type', 'toolId', 'questionId', 'id', 'sectionId', 'activityRole',
    'functionSpec', 'analysisRequests', 'workflow', 'workflowProvenance',
  ].forEach((key) => delete next[key]);
  return next;
};

const compileHonorsExtension = ({
  question,
  courseId,
  sectionRole,
  sectionId,
  sectionTitle,
} = {}) => {
  if (!question || typeof question !== 'object' || Array.isArray(question)) {
    throw new Error('The Honors extension question is missing.');
  }

  const actions = Array.isArray(question.studentActions)
    ? question.studentActions.filter((action) => clean(action))
    : [];

  // Legacy/canonical providers may still return a ready runtime question. Keep
  // supporting that shape, but all modern V5 intent with studentActions goes
  // through the authoring compiler so outside AI never has to guess type/toolId.
  if (!actions.length) {
    if (!clean(question.type || question.toolId)) {
      throw new Error('The Honors extension needs studentActions so MathMaster can choose the correct interaction.');
    }
    return {
      ...question,
      activityRole: question.activityRole || sectionRole,
      sectionId: question.sectionId || sectionId,
    };
  }

  const compiled = compileAuthoringIntentV5({
    schemaVersion: 5,
    assignment: {
      title: 'Honors extension compiler',
      courseId,
      instructionalPurpose: 'lesson',
      gradingPurpose: 'classwork',
    },
    sections: [{
      id: sectionId || 'honors-extension',
      role: sectionRole,
      title: sectionTitle || 'Honors Extension',
      questions: [extensionIntentOnly(question)],
    }],
  }).package.sections[0]?.questions?.[0];

  if (!compiled) {
    throw new Error('MathMaster could not compile the Honors extension into a student interaction.');
  }

  return {
    ...compiled,
    activityRole: sectionRole,
    sectionId: sectionId || null,
  };
};

export const nonCcmrHonorsReady = (honorsReport = {}) => Boolean(
  honorsReport?.checks?.coreTeks
  && honorsReport?.checks?.higherOrderReasoning
  && Number(honorsReport?.depthCount || 0) >= 3
);

export const honorsMissingLabels = (missing = []) => (
  (Array.isArray(missing) ? missing : [])
    .map((key) => MISSING_LABELS[key] || clean(key))
    .filter(Boolean)
);

export const nonCcmrHonorsMissing = (honorsReport = {}) => (
  (Array.isArray(honorsReport?.missing) ? honorsReport.missing : [])
    .filter((key) => key !== 'ccmrEnrichment')
);

export const unresolvedRequestedHonorsGaps = (requestedMissing = [], candidateReport = {}) => {
  const requested = nonCcmrHonorsMissing({ missing: requestedMissing });
  const candidateMissing = new Set(nonCcmrHonorsMissing(candidateReport));
  return requested.filter((key) => candidateMissing.has(key));
};

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
  const guardedSections = sourceSections.map((sourceSection, sectionIndex) => {
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

    const repairedExisting = before.map((sourceQuestion, questionIndex) => {
      const nextQuestion = after[questionIndex] || {};
      const sourceIdValue = clean(sourceQuestion.questionId || sourceQuestion.id);
      const nextIdValue = clean(nextQuestion.questionId || nextQuestion.id);
      if (sourceIdValue && nextIdValue && sourceIdValue !== nextIdValue) {
        throw new Error('MathMaster AI changed an existing question identity; the repair was rejected.');
      }

      const sourceStem = visibleStem(sourceQuestion);
      const nextStem = visibleStem(nextQuestion);
      if (sourceStem && nextStem && nextStem !== sourceStem) {
        throw new Error('MathMaster AI rewrote an existing question instead of repairing its Honors metadata; the repair was rejected.');
      }
      if (protectedQuestionChanged(sourceQuestion, nextQuestion)) {
        throw new Error('MathMaster AI changed existing question mathematics, grading, or rigor metadata; the repair was rejected.');
      }

      // Existing mathematics stays byte-for-byte owned by MathMaster. The AI
      // contributes only alignment metadata, so harmless omissions or section
      // serialization differences cannot break an otherwise good repair.
      return {
        ...sourceQuestion,
        ...alignmentPatch(nextQuestion),
      };
    });

    const additions = after.slice(before.length).map((question) => compileHonorsExtension({
      question,
      courseId: sourceCourse,
      sectionRole: sourceRole,
      sectionId: sourceId || nextId || `section-${sectionIndex + 1}`,
      sectionTitle: sourceSection.title || nextSection.title,
    }));

    return {
      ...sourceSection,
      questions: [...repairedExisting, ...additions],
    };
  });

  if (addedQuestions > 1) {
    throw new Error('MathMaster AI added more than one Honors extension question; the repair was rejected.');
  }

  return {
    ...currentAssignment,
    // Assignment metadata, section policy, delivery, grading, supports, outputs
    // and evidence stay owned by the reviewed source. AI may repair only TEKS
    // metadata on existing questions plus one compiled Honors extension.
    sections: guardedSections,
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

  // The honors and scope rules, cut from the live contract rather than restated
  // here, so this request cannot describe a policy the platform no longer has.
  const rules = buildContractSlice({
    sections: CONTRACT_SLICES.honorsDepth,
    questionTypes: [...new Set(
      (Array.isArray(assignmentV5.sections) ? assignmentV5.sections : [])
        .flatMap((section) => (Array.isArray(section?.questions) ? section.questions : []))
        .map((question) => String(question?.type || '').trim())
        .filter(Boolean),
    )].slice(0, 6),
    courseId,
  });

  return [
    '# MathMaster Honors-depth repair',
    '',
    'This request is portable: paste it into ChatGPT, Claude, Gemini, or another capable AI.',
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
    '- Author a NEW extension as V5 mathematical intent: include studentActions and the mathematical data those actions need. Do NOT add type, toolId, questionId, functionSpec, analysisRequests, workflow, or renderer plumbing to the new extension; MathMaster compiles it locally.',
    '- Honors readiness requires Core TEKS, DOK 3+ reasoning, and at least three of the four depth dimensions (multiple representations, justification, modeling/application, higher-order reasoning). Do not force an unrelated fourth dimension just to satisfy a checklist.',
    '- Every non-CCMR gap listed at the top of this repair request MUST be resolved by the returned candidate. MathMaster rechecks those exact requested gaps after compilation; reaching the overall 3-of-4 threshold while leaving a requested gap unresolved is not an acceptable repair.',
    '- If multiple representations is listed as missing, do not satisfy it only by mentioning equation forms in prose/card text. Author structured V5 representation intent that MathMaster can inspect after compilation, such as connectRepresentations/findRepresentationMismatch with representation sets, connectLinearRepresentations with a structured source, or an item that actually contains two visible representation structures (for example table + graph/function).',
    '- Do not fabricate SAT, ACT, TSIA2, or ASVAB provenance. Audited CCMR Practice is sourced separately from MathMaster Fidelity V2.1 at publish time.',
    '- Do not add assignment-level delivery, grading, support, evidence, PDF, Classroom, or publication settings. MathMaster keeps those from the reviewed source.',
    // This packet carries a whole lesson to somebody else's chat window. Every
    // other portable request states this line; this one did not.
    '- Never include student names, IDs, grades, attempts, accommodations, or IEP/504/EB information. Supports are resolved per student at delivery and never belong in assignment JSON.',
    '',
    '## Current Assignment V5 repair snapshot',
    JSON.stringify(repairSnapshot),
    ...(rules ? ['', rules] : []),
  ].join('\n');
};

export default buildHonorsDepthAiRepairRequest;
