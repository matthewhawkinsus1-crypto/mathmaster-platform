import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targetPath = path.join(repoRoot, 'src', 'components', 'student', 'MyMathPathProductionContainer.jsx');
let source = fs.readFileSync(targetPath, 'utf8');
let changed = false;

function replaceOnce(before, after, label) {
  if (source.includes(after)) return;
  const first = source.indexOf(before);
  if (first === -1) throw new Error(`Could not find ${label} insertion point.`);
  if (source.indexOf(before, first + before.length) !== -1) throw new Error(`Refusing ambiguous ${label} patch.`);
  source = `${source.slice(0, first)}${after}${source.slice(first + before.length)}`;
  changed = true;
}

replaceOnce(
  "import { explainStepForStudent } from '../../platform/path/pathSessionRouting.js';",
  "import { explainStepForStudent } from '../../platform/path/pathSessionRouting.js';\nimport { fetchQuestionWithContentReleaseRollover } from '../../platform/path/sessionContentReleaseRollover.js';",
  'rollover helper import',
);

replaceOnce(
  `  const [slowLoad, setSlowLoad] = useState(false);\n\n  const clearAttemptState = () => {`,
  `  const [slowLoad, setSlowLoad] = useState(false);\n\n  // One canonical launch description is reused for start and release rollover.\n  // This is what keeps a frozen weekly slot, its assessment framework, and its\n  // question-count contract intact if the assessment bank changes mid-session.\n  const sessionLaunchConfig = useMemo(() => ({\n    targetAlignmentKey,\n    sessionKind,\n    requiredQuestions,\n    assessmentFramework,\n    weekKey,\n    weeklySlotKey,\n    weeklySlot,\n  }), [targetAlignmentKey, sessionKind, requiredQuestions, assessmentFramework, weekKey, weeklySlotKey, weeklySlot]);\n\n  const contentRefreshNotice = {\n    headline: 'Practice updated',\n    message: 'This assessment was updated, so MathMaster started a fresh session for the same skill. Your earlier answers are still saved.',\n    tone: 'return',\n  };\n\n  const clearAttemptState = () => {`,
  'canonical session launch config',
);

replaceOnce(
  `      const result = await startOrResumePathSession({ targetAlignmentKey, sessionKind, requiredQuestions, assessmentFramework, weekKey, weeklySlotKey, weeklySlot });\n      // A successful load clears the record of past failures, so a student who\n      // hits one blip and recovers is not permanently shown the "this is not\n      // working" screen.\n      setRetryCount(0);\n      setSession(result.session);\n      if (result.session.status === 'active') {\n        const next = await fetchNextSanitizedQuestion({ sessionId: result.session.sessionId });\n        setCurrentQuestion(next.questionInstance);\n      } else {\n        setCurrentQuestion(null);\n      }`,
  `      const result = await startOrResumePathSession(sessionLaunchConfig);\n      // A successful load clears the record of past failures, so a student who\n      // hits one blip and recovers is not permanently shown the "this is not\n      // working" screen.\n      setRetryCount(0);\n      if (result.session.status === 'active') {\n        const next = await fetchQuestionWithContentReleaseRollover({\n          session: result.session,\n          sessionConfig: sessionLaunchConfig,\n          fetchNextSanitizedQuestion,\n          startOrResumePathSession,\n        });\n        setSession(next.session);\n        setCurrentQuestion(next.questionInstance);\n        if (next.rolledOver) setRouteNotice(contentRefreshNotice);\n      } else {\n        setSession(result.session);\n        setCurrentQuestion(null);\n      }`,
  'initialize-session rollover',
);

replaceOnce(
  `  }, [targetAlignmentKey, sessionKind, requiredQuestions, assessmentFramework, weekKey, weeklySlotKey, weeklySlot]);`,
  `  }, [sessionLaunchConfig, startOrResumePathSession, fetchNextSanitizedQuestion]);`,
  'initialize-session dependencies',
);

replaceOnce(
  `      const next = await fetchNextSanitizedQuestion({ sessionId: session.sessionId });\n      setCurrentQuestion(next.questionInstance);\n      clearAttemptState();\n      // The explanation is carried forward onto the question it explains, so a\n      // student meeting a prerequisite reads why on that question's screen.\n      setRouteNotice(decisionNotice);`,
  `      const next = await fetchQuestionWithContentReleaseRollover({\n        session,\n        sessionConfig: sessionLaunchConfig,\n        fetchNextSanitizedQuestion,\n        startOrResumePathSession,\n      });\n      setSession(next.session);\n      setCurrentQuestion(next.questionInstance);\n      clearAttemptState();\n      // The explanation is carried forward onto the question it explains, so a\n      // student meeting a prerequisite reads why on that question's screen. A\n      // content refresh gets its own plain-language explanation instead.\n      if (next.rolledOver) setRouteNotice(contentRefreshNotice);\n      else setRouteNotice(decisionNotice);`,
  'continue-to-next-question rollover',
);

replaceOnce(
  `  }, [session, fetchNextSanitizedQuestion, decisionNotice]);`,
  `  }, [session, sessionLaunchConfig, fetchNextSanitizedQuestion, startOrResumePathSession, decisionNotice]);`,
  'advance dependencies',
);

if (!changed) {
  console.log('CCMR client rollover wiring already applied.');
  process.exit(0);
}

fs.writeFileSync(targetPath, source);
console.log('Applied CCMR content-release rollover wiring to MyMathPathProductionContainer.jsx.');
