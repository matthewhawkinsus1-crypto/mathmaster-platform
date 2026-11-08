// A real lesson question, compiled as a classroom receives it, in the real
// QuestionEngine with "Ask my teacher" wired. Driven by tests/browser/hintsThatFit.mjs.
//
//   ?lesson=l2|day1|day2    Algebra I M2 T2 L2, or Algebra II Honors 3×3 Systems Day 1 / Day 2
//   ?lesson=recovery        a Recovery version of the question family named by ?q (its
//                           first instance): only the identity fields, so no hints of its own
//   ?q=<questionId>         the question
//   ?role=<activity role>   the activity policy (defaults to the question's own section)
//   ?run=<id>               a fresh draft namespace
//
// "Ask my teacher" toggles land on window.__mmHelp. The draft key is on
// data-hints-draft, for the help the question remembers (supportUseMemory.js).
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MathfieldElement } from 'mathlive';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import { emptyQuestionRecord, recordQuestionAttempt } from '../../src/attemptPolicy.js';
import { getEffectiveActivityPolicy } from '../../src/platform/policies/activityPolicies.js';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { getPlatformQuestionFamily } from '../../functions/shared/questionFamilyRegistry.mjs';
import { resolveFamilyConstraints } from '../../functions/shared/questionFamilyContract.mjs';
import { buildFamilyQuestion, createFamilyInstanceSequence } from '../../functions/shared/questionFamilyEngine.mjs';
import l2Lesson from '../../teacher-import-jsons/algebra1-module2-topic2/L2_Vertical_and_Horizontal_Transformations_of_Linear_Functions.json';
import day1Lesson from '../../docs/assignments/Algebra_II_Honors_3x3_Systems_Day1_V5_FINAL.json';
import day2Lesson from '../../docs/assignments/Algebra_II_Honors_3x3_Systems_Day2_V5_FINAL.json';
import '../../src/index.css';
import '../../src/App.css';

MathfieldElement.fontsDirectory = '/node_modules/mathlive/fonts';
MathfieldElement.soundsDirectory = null;

const params = new URLSearchParams(window.location.search);
const LESSONS = { l2: l2Lesson, day1: day1Lesson, day2: day2Lesson };
// A Recovery version keeps only the identity fields of the family's question,
// so a tool's rungs are its whole ladder (the hint-ladder timing scenes).
const recoveryVersion = (familyId) => {
  const family = getPlatformQuestionFamily(familyId);
  const { values } = resolveFamilyConstraints(family, {});
  const instance = createFamilyInstanceSequence(family, values, 'hints-that-fit').instanceAt(0);
  return buildFamilyQuestion({ family, instance, constraintValues: values, authored: { questionId: `recovery-${familyId}` }, tool: family.defaultTool });
};
const recovery = params.get('lesson') === 'recovery' ? recoveryVersion(params.get('q')) : null;
const sections = recovery ? [{ role: 'practice', questions: [recovery] }] : compileAuthoringIntentV5(LESSONS[params.get('lesson')] || l2Lesson).package.sections;
const section = sections.find((entry) => entry.questions.some((question) => question.questionId === params.get('q'))) || sections[0];
const question = section.questions.find((entry) => entry.questionId === params.get('q')) || section.questions[0];
const role = params.get('role') || section.role;
const run = params.get('run') || 'manual';
const draftKey = `hints-that-fit-${role}-${question.questionId}-${run}`;
const policy = getEffectiveActivityPolicy(role);
const assignmentId = `hints-that-fit-${question.questionId}`;

window.__mmHelp = [];

function Harness() {
  const [record, setRecord] = useState(emptyQuestionRecord());
  const [help, setHelp] = useState(false);
  const onGrade = async (isCorrect, details, parts, supportUsage, responseKey, meta) => {
    const outcome = recordQuestionAttempt({ record, isCorrect, questionDetails: details, parts, supportUsage, responseKey, partialCreditPercent: meta?.partialCreditPercent, maximumAttempts: policy.attempts });
    setRecord(outcome.record);
    return outcome.result;
  };
  return (
    <div className="mathmaster-assignment-screen" data-hints-fixture={question.questionId} data-hints-role={role} data-hints-draft={draftKey} style={{ fontFamily: '"Segoe UI", sans-serif', minHeight: '100vh', padding: 12 }}>
      <main className="mathmaster-question-stage" style={{ maxWidth: 1120, margin: '0 auto', background: 'var(--mm-surface)', borderRadius: 12, padding: 10 }}>
        <QuestionEngine
          question={question}
          questionRecord={record}
          maximumAttempts={policy.attempts}
          activityRole={role}
          dolMode={role === 'dol'}
          generationKey={`${assignmentId}|student-a|0|variant:0`}
          draftKey={draftKey}
          assignmentId={assignmentId}
          executionScope="student"
          onGrade={onGrade}
          onAskTeacher={(requested) => { window.__mmHelp.push(requested); setHelp(requested); }}
          helpRequested={help}
        />
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
