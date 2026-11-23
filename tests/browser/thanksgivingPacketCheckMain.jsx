// ONE QUESTION OF A THANKSGIVING BREAK PACKET, AS A STUDENT MEETS IT.
// Driven by tests/browser/thanksgivingPacketCheck.mjs.
//
// The packet (teacher-import-jsons/thanksgiving-packet/*.json) is compiled as
// an import compiles it, put through the shape an assignment is STORED in
// (canonicalV5PersistencePatch) and read back as the student's screen reads
// it. The question is mounted in the real QuestionEngine with the props the
// assignment screen gives it (src/app/student/assignmentWorkspaceView.jsx):
// the section's own role, the attempt policy the stored assignment declares
// (unlimited), Guided Notes as Classwork has them, part by part, and the
// lesson around the question (its stored questions and its worked examples),
// which is what the example player reads (examplePlayer.js).
//
//   ?file=a1|a1h|a2h   which packet (default a1)
//   ?q=<questionId>    the question (default: the first)
//   ?run=<id>          a fresh draft namespace; the same id reopens the same question
//   ?list=1            mounts nothing; window.__mmPacket lists every question
//
// Graded submissions land on window.__mmGrades; what was mounted on window.__mmPacket.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MathfieldElement } from 'mathlive';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { buildQuestionDraftKey } from '../../src/questionDraftStorage.js';
import { emptyQuestionRecord, recordQuestionAttempt, resolveQuestionMaximumAttempts } from '../../src/attemptPolicy.js';
import { canonicalV5PersistencePatch, getStoredAssignmentQuestions } from '../../src/platform/contract/storedAssignmentV5.js';
import { getEffectiveActivityPolicy, resolveQuestionActivityRole } from '../../src/platform/policies/activityPolicies.js';
import { exampleOpensByItself, exampleSectionRule, lessonExampleContext, workedExampleFor } from '../../src/platform/supports/workedExample/examplePlayer.js';
import algebra1 from '../../teacher-import-jsons/thanksgiving-packet/Algebra1_Thanksgiving_Packet.json';
import algebra1Honors from '../../teacher-import-jsons/thanksgiving-packet/Algebra1_Thanksgiving_Packet_Honors.json';
import algebra2Honors from '../../teacher-import-jsons/thanksgiving-packet/Algebra2_Honors_Thanksgiving_Packet.json';
import '../../src/index.css';
import '../../src/App.css';

MathfieldElement.fontsDirectory = '/node_modules/mathlive/fonts';
MathfieldElement.soundsDirectory = null;

const PACKETS = { a1: algebra1, a1h: algebra1Honors, a2h: algebra2Honors };
const params = new URLSearchParams(window.location.search);
const file = PACKETS[params.get('file')] ? params.get('file') : 'a1';
const run = params.get('run') || 'manual';

const compiled = parseAssignmentBlueprintText(JSON.stringify(PACKETS[file]));
const stored = { id: `thanksgiving-${file}-${run}`, ...canonicalV5PersistencePatch(compiled.assignmentV5) };
const questions = getStoredAssignmentQuestions(stored);
const which = params.get('q') || questions[0]?.questionId;
const index = questions.findIndex((question) => question.questionId === which);
const question = questions[index] || null;
const sectionRoles = questions.map((entry) => resolveQuestionActivityRole({ question: entry, assignment: stored }));
const role = sectionRoles[index] || 'classwork';
const policy = getEffectiveActivityPolicy(role, stored);
const maximumAttempts = question ? resolveQuestionMaximumAttempts({ question, maximumAttempts: policy.attempts, activityPolicy: policy }) : null;

// What the player's own rules say of each question (examplePlayer.js), for
// the driver to hold the screen to: the example it names or borrows, the one
// the player really gives it (the lesson's own, or the platform's where the
// lesson's would state an answer of this question), and whether it opens by
// itself (Classwork, the first question on a skill; or the second, faded,
// where the example has a hand-over).
const roleOf = (candidate) => String(candidate?.activityRole || '').trim().toLowerCase() || null;
const exampleRule = (position) => {
  const entry = questions[position];
  const sectionRole = roleOf(entry) || sectionRoles[position];
  const context = lessonExampleContext({ questions, index: position, sectionRole, roleOf, lessonSupports: stored.lessonSupports || null, assignmentQuestions: questions });
  const rule = exampleSectionRule({ sectionRole, activityRole: sectionRoles[position], hintsAllowed: true });
  const example = rule.offered ? workedExampleFor(entry, {
    lessonSupports: context.lessonSupports,
    sectionRole: context.sectionRole,
    assignmentProblems: context.assignmentProblems,
    coveringExample: context.coveringExample,
    subSkills: rule.subSkills,
  }) : null;
  const own = typeof entry.example === 'string' ? entry.example : null;
  return {
    exampleId: own || context.coveringExample || null,
    from: own ? 'own' : context.coveringExample ? 'earlierSameSkill' : null,
    offered: rule.offered,
    source: example?.source ?? null,
    format: example?.format ?? null,
    steps: example?.steps?.length ?? null,
    opensByItself: exampleOpensByItself({ rule, newSkill: context.newSkill, fadeTurn: context.fadeTurn, example }),
    faded: !context.newSkill && context.fadeTurn && Number(example?.handOverAfter) >= 1,
  };
};

window.__mmGrades = [];
window.__mmPacket = {
  file,
  which,
  index,
  role,
  attemptPolicy: stored.gradingPolicy?.attemptPolicy ?? null,
  exampleField: question?.example ?? null,
  storedLessonSupports: Boolean(stored.lessonSupports),
  storedExamples: (stored.lessonSupports?.examples || []).length,
  rolesCarried: questions.every((entry) => roleOf(entry)),
  compileErrors: compiled.errors || [],
  questions: questions.map((entry, position) => ({
    questionId: entry.questionId,
    role: sectionRoles[position],
    type: entry.type ?? null,
    tool: entry.tool ?? entry.interactionType ?? entry.workflow?.type ?? null,
    example: entry.example ?? null,
    exampleRule: exampleRule(position),
    prompt: entry.prompt ?? entry.question ?? '',
  })),
  // ?dump=1: the stored questions themselves, for a driver that needs to know what a tool was given.
  stored: params.get('dump') === '1' ? questions : undefined,
};

const draftKey = buildQuestionDraftKey({ studentId: 'thanksgiving-student', assignmentId: stored.id, questionIndex: index, variantIndex: 0, sessionMode: 'graded' });

function Harness() {
  const [record, setRecord] = useState(() => emptyQuestionRecord());
  if (!question) return <p role="alert">Unknown question {which}.</p>;
  const onGrade = async (isCorrect, details, parts, supportUsage, responseKey, meta) => {
    window.__mmGrades.push({ isCorrect, details, parts, partialCreditPercent: meta?.partialCreditPercent ?? null });
    const outcome = recordQuestionAttempt({ record, isCorrect, questionDetails: details, parts, supportUsage, responseKey, partialCreditPercent: meta?.partialCreditPercent, maximumAttempts });
    setRecord(outcome.record);
    return outcome.result;
  };
  return (
    // The assignment screen's own frame: on a phone the shell is a grid of the
    // navigator's row and the stage, and the stage takes its height from it
    // (App.css). The first row stands in for the identity bar and the compact
    // navigator a student has above the question (about 96px on a phone).
    <div className="mathmaster-assignment-screen" data-packet-question={which} data-section-role={role} style={{ fontFamily: '"Segoe UI", system-ui, sans-serif', minHeight: '100vh', padding: 12 }}>
      <div className="mathmaster-assignment-shell" style={{ maxWidth: 1120, margin: '0 auto' }}>
      <div data-shell-header="" style={{ height: window.matchMedia('(max-width: 700px)').matches ? 96 : 0 }} />
      <main className="mathmaster-question-stage" style={{ background: 'var(--mm-surface)', borderRadius: 12, padding: 10, minHeight: 500 }}>
        <QuestionEngine
          key={`${file}-${which}-${run}`}
          question={question}
          questionRecord={record}
          generationKey={`${stored.id}|${which}|variant:0`}
          activityRole={role}
          activityPolicy={policy}
          lessonQuestions={questions}
          lessonSupports={stored.lessonSupports || null}
          practiceLikeThisAllowed={['classwork', 'practice'].includes(role)}
          guidedMode={role === 'classwork'}
          guidedNotesMode={role === 'classwork' ? 'automatic' : 'off'}
          maximumAttempts={maximumAttempts}
          draftKey={draftKey}
          assignmentId={stored.id}
          executionScope="student"
          partByPart
          studentProfile={{}}
          onStepGrade={() => null}
          onGrade={onGrade}
        />
      </main>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(params.get('list') === '1' ? <p data-packet-list="">{questions.length} questions</p> : <Harness />);
