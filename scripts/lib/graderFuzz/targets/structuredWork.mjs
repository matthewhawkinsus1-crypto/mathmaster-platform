/*
 * FUZZ TARGET: A TOOL'S WORK, MARKED ON THE DEVICE AND ON THE SERVER.
 *
 * Every surface whose answer is structured work rather than one typed box:
 * the registry tools and structured question types (serverGrading/tools), the
 * Step Algebra and literal workspaces, and composed workflows. Each case is a
 * question a student can be given and one piece of work for it:
 *
 *   - work a real browser recorded, or the key's own work for a bank item,
 *     with one value changed: a typed box holding any of the input classes
 *     (inputs.mjs), a number where text was, a list cut short;
 *   - work built from nothing but the names a grader reads (found by handing
 *     it a recording object), each holding a typed value, a number, a list or
 *     a point;
 *   - for a fifth of the cases, the QUESTION changed instead: an authored
 *     given replaced by text an author can write and the reader may not read
 *     (`x(x - 5) = 0`, `2x + = 7`, `A = Prt`).
 *
 * PROPERTIES
 *
 *   never-throws           neither the device's check nor the server's throws
 *   typed-value-readable   a typed value in a box never makes the grader throw
 *                          inside (`malformed-response`): the student would
 *                          get no verdict for something they typed. Work whose
 *                          SHAPE was broken may be refused that way; that is
 *                          the contract for a tampered response, and it is
 *                          reported, not failed.
 *   device-server-parity   the verdict on the screen is the verdict the
 *                          server gives the bytes the screen sent
 *   path-contract-reads    a My Math Path tool item: the Path contract's own
 *                          grader neither throws nor contradicts itself on the
 *                          same work asked twice
 *   stable                 the same work, the same verdict, asked again
 *   answers-in-time        one check takes under `slowMs`
 */
import { GRADING_MANIFEST, resolveGradingSurfaceId } from '../../../../functions/shared/serverGrading/gradingManifest.mjs';
import { gradeComposedWorkflowCheck } from '../../../../functions/shared/serverGrading/questionGraders/composedWorkflow.mjs';
import { gradeServerResponse, gradeToolWork } from '../../../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { equationWorkspaceWork, literalWorkspaceWorkGrader, relationWorkspaceWork, stepAlgebraWorkGrader } from '../../../../functions/shared/serverGrading/stepAlgebraWorkspaceGrading.mjs';
import { TOOL_GRADERS } from '../../../../functions/shared/serverGrading/toolGraders.mjs';
import { resolveToolMode } from '../../../../functions/shared/serverGrading/toolGraderDefinition.mjs';
import { gradeWorkWithGrader } from '../../../../functions/shared/serverGrading/toolWorkGrading.mjs';
import { buildPrivateToolGrading, gradePathResponse, isPathEligible, resolvePathToolId } from '../../../../functions/shared/pathToolContracts.mjs';
import { composedWorkflowWork, resolveComposedWorkflow } from '../../../../functions/shared/toolMath/workflow/composedWorkflowContract.mjs';
import { toolWorkFor } from '../../pathBankAnswerSweep.mjs';
import { capturedToolWork, familyQuestionCorpus, pathBankQuestions } from '../corpus.mjs';
import { errorLine, finding } from '../findings.mjs';
import { FREE_CLASSES, INPUT_CLASSES, typedInput } from '../inputs.mjs';
import { startWorkClock } from '../workClock.mjs';

export const id = 'structuredWork';

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const plain = (value) => JSON.parse(JSON.stringify(value));
const STEP_SURFACES = new Set(['stepAlgebra', 'algebra', 'literalWorkspace']);

/* ------------------------------------------------------------------ the checks */

/** How a question's work is marked on the device, or null for a surface with no structured work. */
const deviceCheckOf = (question) => {
  const surfaceId = resolveGradingSurfaceId(question);
  const declaration = GRADING_MANIFEST[surfaceId];
  if (!declaration) return null;
  if (surfaceId === 'composedWorkflow') return { surfaceId, check: (work) => gradeComposedWorkflowCheck(question, work) };
  // The literal workspace reports under its own tool id (QuestionEngine opens
  // it on the question literalWorkspaceQuestion builds); Step Algebra under its own.
  if (STEP_SURFACES.has(surfaceId)) {
    const grader = surfaceId === 'literalWorkspace' ? literalWorkspaceWorkGrader : stepAlgebraWorkGrader;
    return { surfaceId, check: (work) => gradeWorkWithGrader({ grader, question, work }) };
  }
  if (declaration.kind === 'tool') return { surfaceId, check: (work) => gradeToolWork({ toolId: surfaceId, question, work }) };
  return null;
};

const verdictOf = (result) => (result?.graded === true
  ? { graded: true, isComplete: result.isComplete === true, isCorrect: result.isCorrect === true, score: Number(result.score) || 0, parts: (result.parts || []).map((part) => `${part.id}:${part.isCorrect === true}`) }
  : { graded: false, reason: String(result?.reason || 'ungraded') });
// Two refusals are one verdict (no mark), whichever reason each side names.
const sameVerdict = (left, right) => (left.graded || right.graded ? JSON.stringify(left) === JSON.stringify(right) : true);

// Reasons the server alone gives, by design: it holds a template where the
// device holds the student's instance (ordinaryResponseGrading.mjs).
const SERVER_ONLY_REASONS = /^(generated-question|family-template|variant-selection|adaptive-band-profile|secure-question|teacher-excluded)$/;

/* ------------------------------------------------------------------ the subjects */

const SYNTHETIC_STEP_QUESTIONS = [
  { type: 'stepAlgebra', prompt: 'Solve for x.', equation: '2x + 3 = 7', objective: { kind: 'solve', variable: 'x' } },
  { type: 'stepAlgebra', prompt: 'Solve for x.', equation: 'x(x - 5) = 0', objective: { kind: 'solve', variable: 'x' } },
  { type: 'stepAlgebra', prompt: 'Solve for x.', equation: 'sqrt(5x - 1) = 2x - 1', objective: { kind: 'solve', variable: 'x' }, relationWorkspace: true },
  { type: 'stepAlgebra', prompt: 'Solve for h.', equation: 'sqrt(1.5h) = 6', objective: { kind: 'solve', variable: 'h' }, relationWorkspace: true },
  { type: 'stepAlgebra', prompt: 'Solve for x.', equation: 'abs(2x - 3) = 7', objective: { kind: 'solve', variable: 'x' }, relationWorkspace: true },
  { type: 'stepAlgebra', prompt: 'Solve.', equation: '3x - 4 < 11', objective: { kind: 'solve', variable: 'x' }, relationWorkspace: true },
  { type: 'stepAlgebra', prompt: 'Solve for r.', equation: 'A = P*r*t', objective: { kind: 'solve', variable: 'r' } },
  { type: 'stepAlgebra', prompt: 'Solve for r.', equation: 'C = 2*pi*r', objective: { kind: 'solve', variable: 'r' } },
  { type: 'literal', prompt: 'Solve A = Prt for r.', equation: 'A = Prt', variable: 'r', acceptedAnswers: ['r = A/(Pt)'], workspace: true },
  { type: 'literal', prompt: 'Solve C = 2πr for r.', equation: 'C = 2πr', variable: 'r', acceptedAnswers: ['r = C/(2π)'] },
];

let subjects = null;
/** Every question with structured work, and the right work known for it: `{ source, question, seeds }`. */
const subjectCorpus = () => {
  if (subjects) return subjects;
  subjects = [];
  const add = (source, question, seeds = []) => {
    if (deviceCheckOf(question)) subjects.push({ source, question: plain(question), seeds: seeds.filter(isObject).map(plain) });
  };
  for (const { source, question, work } of capturedToolWork()) add(source, question, [work]);
  // Each tool in each mode, on a question that authors nothing: the grader's own defaults.
  for (const [surfaceId, grader] of Object.entries(TOOL_GRADERS)) {
    for (const mode of Object.keys(grader.declaration.modes)) add(`default:${surfaceId}:${mode}`, { type: surfaceId, ...(GRADING_MANIFEST[surfaceId] && surfaceId !== 'functionGraph' ? { toolId: surfaceId } : {}), mode, prompt: 'Complete the task.' });
  }
  for (const { source, question } of familyQuestionCorpus({ perFamily: 2 })) add(source, question);
  for (const { source, question } of pathBankQuestions()) {
    if (!deviceCheckOf(question)) continue;
    let seeds = [];
    try { seeds = (toolWorkFor(resolvePathToolId(question), question)?.works || []).map((entry) => entry.raw); } catch { seeds = []; }
    add(`bank:${source}`, question, seeds);
  }
  SYNTHETIC_STEP_QUESTIONS.forEach((question, index) => add(`synthetic:step:${index}`, question));
  return subjects;
};

/* ------------------------------------------------------------------ building work */

/** The names a tool's grader reads from work, found by handing it an object that records every read. */
const namesRead = (question, surfaceId) => {
  const grader = TOOL_GRADERS[surfaceId];
  if (!grader) return [];
  const seen = new Set();
  const recorder = new Proxy({}, {
    get: (_, key) => { if (typeof key === 'string') seen.add(key); return undefined; },
    has: (_, key) => { if (typeof key === 'string') seen.add(key); return false; },
  });
  try { grader.modeGraders[resolveToolMode(grader.declaration, question)]?.(question, recorder); } catch { /* the names read before it gave up are still names */ }
  return [...seen].filter((key) => !['then', 'toJSON', 'constructor'].includes(key)).sort();
};

const NUMBERS = [0, 1, -1, 2, 3, 0.5, -2.5, 7, 10, 100, 1e-9, 1e21, -0];
const typedValue = (rng, options = {}) => typedInput(rng, rng.pick(options.key === undefined ? FREE_CLASSES : INPUT_CLASSES), { maxLength: 1200, ...options }).text;

/** A value of no particular shape: what a box, a list or a point might hold. */
const anyValue = (rng, depth = 0) => rng.pick([
  () => typedValue(rng),
  () => typedValue(rng),
  () => rng.pick(NUMBERS),
  () => rng.chance(0.5),
  () => null,
  () => (depth < 2 ? Array.from({ length: rng.int(0, 4) }, () => anyValue(rng, depth + 1)) : []),
  () => [rng.pick(NUMBERS), rng.pick(NUMBERS)],
  () => ({ x: rng.pick(NUMBERS), y: rng.pick(NUMBERS) }),
  () => (depth < 2 ? Object.fromEntries(rng.sample(['x', 'y', 'value', 'min', 'max', 'id', 'left', 'right', 'choice', 'm', 'b', 'label', 'points', 'text', 're', 'im'], rng.int(1, 4)).map((key) => [key, anyValue(rng, depth + 1)])) : {}),
])();

const leafPaths = (value, path = [], out = []) => {
  if (Array.isArray(value)) value.forEach((entry, index) => leafPaths(entry, [...path, index], out));
  else if (isObject(value)) Object.entries(value).forEach(([key, entry]) => leafPaths(entry, [...path, key], out));
  else out.push(path);
  return out;
};
const getAt = (root, path) => path.reduce((node, key) => node?.[key], root);
const setAt = (root, path, value) => {
  if (!path.length) return value;
  const parent = getAt(root, path.slice(0, -1));
  if (parent && typeof parent === 'object') parent[path.at(-1)] = value;
  return root;
};

/**
 * Right work with one thing changed. `typed` when a box now holds another
 * typed value (work the tool itself can send); `shape` when the work's own
 * shape was broken (only a tampered or older client sends that).
 */
const mutateWork = (rng, seed) => {
  const work = plain(seed);
  const paths = leafPaths(work);
  if (!paths.length) return { work, change: 'typed', at: '' };
  const path = rng.pick(paths);
  const original = getAt(work, path);
  const at = path.map((key) => (typeof key === 'number' ? '#' : key)).join('.');
  if (rng.chance(0.8)) {
    const key = typeof original === 'string' || typeof original === 'number' ? original : undefined;
    const typed = typedValue(rng, key === undefined ? {} : { key });
    // A box that held a number keeps one where the typed value is one.
    const next = typeof original === 'number' && rng.chance(0.5) ? rng.pick(NUMBERS) : typed;
    return { work: setAt(work, path, next), change: 'typed', at };
  }
  return rng.pick([
    () => ({ work: setAt(work, path.slice(0, -1), anyValue(rng)), change: 'shape', at }),
    () => ({ work: setAt(work, path, anyValue(rng)), change: 'shape', at }),
    () => { const parent = getAt(work, path.slice(0, -1)); if (isObject(parent)) delete parent[path.at(-1)]; else if (Array.isArray(parent)) parent.length = 0; return { work, change: 'shape', at }; },
    () => { const parent = getAt(work, path.slice(0, -1)); if (Array.isArray(parent)) while (parent.length && parent.length < 320) parent.push(...parent.slice(0, 40)); return { work, change: 'shape', at }; },
  ])();
};

const stepAlgebraWork = (rng, question) => {
  const variable = String(question.objective?.variable || question.variable || 'x');
  const side = () => (rng.chance(0.3) ? variable : typedValue(rng));
  if (question.relationWorkspace === true || rng.chance(0.3)) {
    const candidate = () => rng.pick(['1', '1/4', '2', '-2', '24', '5']);
    return relationWorkspaceWork({
      relationState: rng.chance(0.15)
        ? { special: rng.pick(['noSolution', 'allReals']), branches: [] }
        : { connective: rng.pick([null, 'or', 'and']), branches: Array.from({ length: rng.int(1, 2) }, () => ({ expressions: [side(), side()], relations: [rng.pick(['=', '<', '<=', '>', '>=', typedValue(rng)])] })) },
      awaitingSymbolDecision: rng.chance(0.1),
      // Where PR #553's crash lived: the two sides a student types into a check.
      candidateChecks: Object.fromEntries(Array.from({ length: rng.int(0, 2) }, () => [candidate(), { choice: rng.pick(['valid', 'extraneous', typedValue(rng)]), left: typedValue(rng), right: typedValue(rng) }])),
      solutionSet: rng.chance(0.5) ? { none: rng.chance(0.2), values: Array.from({ length: rng.int(0, 3) }, () => typedValue(rng)) } : null,
      representation: rng.chance(0.2) ? { intervals: anyValue(rng), notation: typedValue(rng), inequality: typedValue(rng) } : null,
    });
  }
  return equationWorkspaceWork({ equation: { left: side(), right: side() }, promptAnswers: Object.fromEntries(Array.from({ length: rng.int(0, 2) }, (_, index) => [`prompt-${index + 1}`, typedValue(rng)])) });
};

const builtWork = (rng, question, surfaceId) => {
  if (STEP_SURFACES.has(surfaceId)) return { work: stepAlgebraWork(rng, question), change: 'typed', at: 'workspace' };
  if (surfaceId === 'composedWorkflow') {
    const stages = resolveComposedWorkflow(question)?.workflow || [];
    const responses = Object.fromEntries(stages.filter(() => rng.chance(0.8)).map((stage) => [stage.id, rng.chance(0.75) ? typedValue(rng) : anyValue(rng)]));
    return { work: composedWorkflowWork(responses), change: 'typed', at: 'stages' };
  }
  const names = namesRead(question, surfaceId);
  // Which names are boxes and which are lists is the tool's to know, so this
  // work may have a shape the tool never sends: 'shape', whatever it holds.
  const typedOnly = rng.chance(0.5);
  const work = Object.fromEntries(names.filter(() => rng.chance(0.85)).map((name) => [name, typedOnly ? typedValue(rng) : anyValue(rng)]));
  return { work, change: 'shape', at: 'names-read' };
};

const AUTHORED_GIVENS = ['x(x - 5) = 0', '2x + = 7', 'A = Prt', 'C = 2πr', '\\frac{x}{2}=3', 'x^2 = 9', '', '=', 'y = mx + b', '3(x+2)', 'sqrt(x) = -1', '|x| = 2', 'x = x', '0 = 1', 'x/0 = 1', '2x + 3 = 7 = 9', '√(x+1) = 3', 'x² − 4 = 0'];

/** The question with one authored text given replaced. */
const mutateQuestion = (rng, question) => {
  const next = plain(question);
  const paths = leafPaths(next).filter((path) => typeof getAt(next, path) === 'string' && !['type', 'toolId', 'mode', 'id', 'questionId', 'kind'].includes(String(path.at(-1))));
  if (!paths.length) return { question: next, given: null };
  const path = rng.pick(paths);
  setAt(next, path, rng.chance(0.5) ? rng.pick(AUTHORED_GIVENS) : typedValue(rng));
  return { question: next, given: path.join('.') };
};

export const cases = function* cases({ rng, count }) {
  const corpus = subjectCorpus();
  // Evenly over surfaces, not over the corpus: the banks hold hundreds of one tool.
  const bySurface = new Map();
  for (const subject of corpus) {
    const surfaceId = resolveGradingSurfaceId(subject.question);
    if (!bySurface.has(surfaceId)) bySurface.set(surfaceId, []);
    bySurface.get(surfaceId).push(subject);
  }
  const surfaces = [...bySurface.keys()].sort();
  for (let index = 0; index < count; index += 1) {
    const subject = rng.pick(bySurface.get(surfaces[index % surfaces.length]));
    let { question } = subject;
    let given = null;
    if (rng.chance(0.2)) ({ question, given } = mutateQuestion(rng, question));
    const surfaceId = resolveGradingSurfaceId(question);
    if (!deviceCheckOf(question)) continue;
    const built = subject.seeds.length && rng.chance(0.6) ? mutateWork(rng, rng.pick(subject.seeds)) : builtWork(rng, question, surfaceId);
    yield { target: id, source: subject.source, question, work: built.work, change: built.change, at: built.at, given };
  }
};

export const check = async (fuzzCase, { slowMs = 2000 } = {}) => {
  const { question, work, change } = fuzzCase;
  const found = [];
  const report = (property, signature, message, severity) => found.push(finding({ target: id, property, signature, message, repro: fuzzCase, severity }));
  const device = deviceCheckOf(question);
  if (!device) return found;
  const { surfaceId } = device;
  const where = `${surfaceId}${fuzzCase.given ? '/authored-given' : ''}`;

  const timed = (name, run) => {
    const sinceStart = startWorkClock();
    try {
      return { result: run() };
    } catch (error) {
      report('never-throws', `${where}/${name}/${errorLine(error)}`, `${name} threw for ${surfaceId}: ${error?.message}`);
      return { thrown: true };
    } finally {
      const spentMs = sinceStart();
      if (spentMs > slowMs) report('answers-in-time', `${where}/${name}`, `${name} took ${Math.round(spentMs)} ms for ${surfaceId}`);
    }
  };

  const onDevice = timed('device', () => device.check(plain(work)));
  if (onDevice.thrown) return found;
  const deviceVerdict = verdictOf(onDevice.result);
  if (!deviceVerdict.graded && deviceVerdict.reason === 'malformed-response') {
    report('typed-value-readable', `${where}/${errorLine(onDevice.result.detail || 'no detail')}`,
      `${surfaceId} could not read work whose ${change === 'typed' ? 'typed value' : 'shape'} was changed (${fuzzCase.at}): ${onDevice.result.detail}`,
      change === 'typed' && !fuzzCase.given ? 'fail' : 'report');
  }

  const toolResponse = onDevice.result?.toolResponse;
  if (toolResponse) {
    const onServer = timed('server', () => gradeServerResponse({ question, response: plain(toolResponse) }));
    if (!onServer.thrown) {
      const serverVerdict = verdictOf(onServer.result);
      const serverOnly = !serverVerdict.graded && SERVER_ONLY_REASONS.test(serverVerdict.reason);
      if (!serverOnly && !sameVerdict(serverVerdict, deviceVerdict)) {
        report('device-server-parity', `${where}/${deviceVerdict.graded ? `device=${deviceVerdict.isCorrect}` : `device:${deviceVerdict.reason}`},${serverVerdict.graded ? `server=${serverVerdict.isCorrect}` : `server:${serverVerdict.reason}`}`,
          `${surfaceId}: the device says ${JSON.stringify(deviceVerdict)} and the server says ${JSON.stringify(serverVerdict)}`);
      }
    }
  }

  const again = timed('device', () => device.check(plain(work)));
  if (!again.thrown && JSON.stringify(verdictOf(again.result)) !== JSON.stringify(deviceVerdict)) {
    report('stable', where, `${surfaceId} gave ${JSON.stringify(deviceVerdict)} and then ${JSON.stringify(verdictOf(again.result))} for the same work`);
  }

  // My Math Path marks the same tool with its own contract.
  let eligible = false;
  try { eligible = isPathEligible(question); } catch { eligible = false; }
  if (eligible && !fuzzCase.given) {
    const path = () => gradePathResponse({ privateGrading: buildPrivateToolGrading(question), raw: plain(work) });
    const first = timed('path-contract', path);
    const second = first.thrown ? first : timed('path-contract', path);
    if (!first.thrown && !second.thrown && first.result?.isCorrect !== second.result?.isCorrect) {
      report('path-contract-reads', `${surfaceId}/unstable`, `the Path contract gave ${first.result?.isCorrect} and then ${second.result?.isCorrect} for the same work`);
    }
  }
  return found;
};
