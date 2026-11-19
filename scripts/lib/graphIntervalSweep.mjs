/*
 * THE GRAPH-ANALYSIS INTERVAL BOXES, OLD CODE AGAINST NEW (the verdict sweep's
 * graph section; the owner's interval rule of 2026-11-19).
 *
 * The rest of scripts/sweep-equivalence-verdicts.mjs grades typed answer
 * FIELDS. An interval box on a graph (Graph Analysis, and the analysis parts
 * of Function Graph and Function Investigation) is graded elsewhere: the graph
 * workspace keys each part from the function it draws (normalizeAnalysisRequests:
 * getMonotonicAcceptedAnswers, getSignAcceptedAnswers,
 * getDomainRangeAcceptedAnswers) and gradeAnalysisPart compares the typed text
 * with pathAnalysisTextMatches. This module puts those boxes through the same
 * old-against-new comparison.
 *
 * THE QUESTIONS. Every graph question in the sweep's corpus (the Path and
 * secure banks as drawn, docs/assignments, drafts, seed), every lesson in
 * teacher-import-jsons compiled as a teacher imports it, every version of the
 * two graph-reading Question Families, and a grid of functions of every
 * family the workspace draws, whole and restricted (a vertex inside, at a
 * closed end and at an open end of the domain; a reciprocal drawn across its
 * asymptote), asked every interval kind.
 *
 * THE RESPONSES, AND WHICH ARE RIGHT. Built from the BASE tree's accepted
 * answers for each part, as interval SETS, so whether a response is right
 * never depends on the code being tested:
 *
 *   key        each accepted answer as written;
 *   spelling   each accepted set in ASCII, Unicode and LaTeX (\left…\right),
 *              its pieces joined by ∪;
 *   turning    (increasing, decreasing) an accepted set with an end at a
 *              turning point closed. A turning point is read off the function
 *              itself: x where it is defined on both sides and is a strict
 *              local maximum or minimum (f(x ± ε) on the same side of f(x));
 *   list       (increasing, decreasing, constant, positive, negative) a set of
 *              two or more pieces joined by "and" (typed, \land, \text) or by
 *              commas;
 *
 * are RIGHT; and these are WRONG (near misses), each also listed where the
 * kind lists:
 *
 *   flip       a finite end's bracket changed, where that is not a turning
 *              point of a monotone part (a domain end the key closes, a zero,
 *              an asymptote, an undefined point);
 *   shift      a finite end moved by one;
 *   drop       one piece of two or more left out;
 *   swap       the other kind's answer (increasing for decreasing, positive
 *              for negative);
 *   or, semicolon, sideBySide   pieces joined by "or", by ";", or by nothing;
 *   setList    a domain or a range written as a list: the rule is for where a
 *              function rises, falls or has a sign, and a set keeps ∪.
 *
 * A built-wrong response the base already accepted is that set's own spelling
 * (counted right), as the field sweep counts one.
 *
 * Read-only.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const GRAPH_LIST_KINDS = Object.freeze(['increasing', 'decreasing', 'constant', 'positive', 'negative']);
const MONOTONE_KINDS = new Set(['increasing', 'decreasing']);
const SET_KINDS = new Set(['domain', 'range']);
const SWEPT_KINDS = new Set([...GRAPH_LIST_KINDS, ...SET_KINDS]);
const OTHER_KIND = Object.freeze({ increasing: 'decreasing', decreasing: 'increasing', positive: 'negative', negative: 'positive' });
const GRAPH_TYPES = new Set(['graphAnalysis', 'functionGraph', 'functionInvestigation']);
const RIGHT_CLASSES = new Set(['key', 'spelling', 'turning', 'list', 'turning+list']);
const RULE_CLASSES = new Set(['turning', 'list', 'turning+list']);

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** The graders this section compares, from one tree. */
export const graphGradersFrom = async (root) => {
  const load = (relative) => import(pathToFileURL(path.join(root, relative)).href);
  const model = await load('functions/shared/toolMath/graphWorkspace/graphWorkspaceModel.mjs');
  const equivalence = await load('functions/shared/answerEquivalence.mjs');
  const functions = await load('functions/shared/toolMath/graphWorkspace/functionGraphUtils.mjs');
  return {
    modelFor: (question) => model.graphWorkspaceModelFor(question, { analysisMode: question.type === 'graphAnalysis' }),
    grade: (workspace, part, response) => {
      try {
        return Boolean(model.gradeAnalysisPart(part, { answers: { [part.id]: response } }, workspace.analysisTolerance).isCorrect);
      } catch {
        return 'throws';
      }
    },
    parse: (text) => equivalence.parseCanonicalIntervalNotation(text),
    evaluate: (spec, x) => functions.evaluateGraphFunction(spec, x),
  };
};

/* ---------------------------------------------------------------------------
 * The questions.
 * ------------------------------------------------------------------------- */

const asksIntervals = (node) => isObject(node)
  && isObject(node.functionSpec)
  && Array.isArray(node.analysisRequests)
  && node.analysisRequests.some((request) => isObject(request) && SWEPT_KINDS.has(String(request.kind)));

/** A corpus of graph questions, each kept once (by what grades it). */
export const createGraphQuestionCorpus = () => {
  const entries = [];
  const seen = new Set();
  const offer = (node, source) => {
    if (!asksIntervals(node)) return;
    const question = GRAPH_TYPES.has(node.type) ? node : { ...node, type: 'graphAnalysis' };
    const id = JSON.stringify([question.type, question.functionSpec, question.analysisRequests, question.graph ?? null, question.pointTasks ?? null]);
    if (seen.has(id)) return;
    seen.add(id);
    entries.push({ source, question });
  };
  // Every object inside `node` (a lesson, a bank document, a drawn question).
  const offerAll = (node, source) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((entry) => offerAll(entry, source)); return; }
    offer(node, source);
    Object.values(node).forEach((value) => offerAll(value, source));
  };
  return { entries, offer, offerAll };
};

/** Every lesson in teacher-import-jsons, compiled as a teacher imports it. */
export const offerTeacherImports = async (root, corpus) => {
  const { parseAssignmentBlueprintText } = await import(pathToFileURL(path.join(root, 'src/assignmentBlueprint.js')).href);
  const counts = { lessons: 0, failed: 0 };
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (!name.endsWith('.json')) continue;
      try {
        corpus.offerAll(parseAssignmentBlueprintText(readFileSync(full, 'utf8')).questions || [], path.relative(root, full));
        counts.lessons += 1;
      } catch {
        counts.failed += 1;
      }
    }
  };
  walk(path.join(root, 'teacher-import-jsons'));
  return counts;
};

/** Every version of the two graph-reading Question Families (questionFamiliesGraphReading.mjs). */
export const offerGraphReadingFamilies = async (root, corpus) => {
  const { domainRangeFromGraphFamily, intervalsFromGraphFamily } = await import(pathToFileURL(path.join(root, 'functions/shared/questionFamiliesGraphReading.mjs')).href);
  const sizes = (low, high) => Array.from({ length: high - low + 1 }, (_, index) => low + index).flatMap((size) => [-size, size]);
  for (const parent of ['quadratic', 'absolute']) {
    for (const a of [1, -1]) {
      for (const h of sizes(1, 6)) for (const k of sizes(1, 6)) corpus.offer(domainRangeFromGraphFamily.tools.graphAnalysis({ parent, a, h, k }), 'family functions.domainRangeFromGraph');
    }
  }
  for (const h of sizes(1, 7)) for (const s of [1, 2, 3]) corpus.offer(intervalsFromGraphFamily.tools.graphAnalysis({ h, s, k: s * s }), 'family functions.intervalsFromGraph');
};

/** A grid of every family the workspace draws, whole and restricted, asked every interval kind. */
export const offerSyntheticGraphs = (corpus) => {
  const kinds = [...GRAPH_LIST_KINDS, 'domain', 'range'];
  const ask = (functionSpec) => corpus.offer({
    type: 'graphAnalysis',
    functionSpec,
    analysisRequests: kinds.map((kind) => ({ id: kind, kind, notation: 'interval' })),
  }, 'synthetic graph grid');
  const domain = (min, max, minInclusive, maxInclusive) => ({ min, max, minInclusive, maxInclusive });
  for (const type of ['quadratic', 'absolute']) {
    for (const a of [1, -1, 2, -0.5]) for (const h of [-3, 0, 2]) for (const k of [-4, 0, 3]) ask({ type, a, h, k });
    // The vertex inside, at a closed end, at an open end, and outside the domain.
    for (const range of [domain(-3, 5, true, true), domain(-3, 5, false, false), domain(-3, 5, true, false), domain(1, 5, true, true), domain(1, 5, false, true), domain(-3, 1, true, true), domain(-3, 1, true, false), domain(3, 6, true, true)]) {
      for (const a of [1, -1]) ask({ type, a, h: 1, k: -4, domain: range });
    }
  }
  for (const a of [1, -1, 6]) for (const h of [0, 2]) for (const k of [0, -1]) ask({ type: 'rational', a, h, k });
  for (const range of [domain(-3, 3, true, true), domain(-3, 3, false, false), domain(1, 4, true, true)]) {
    for (const a of [6, -6]) ask({ type: 'rational', a, h: 0, k: 0, domain: range });
  }
  for (const a of [1, -1, 2]) for (const h of [0, -2]) for (const k of [0, 1, -3]) ask({ type: 'squareRoot', a, h, k });
  ask({ type: 'squareRoot', a: -1, h: 0, k: 2, domain: domain(0, 9, true, true) });
  for (const type of ['cubic', 'cubeRoot']) for (const a of [1, -1]) for (const [h, k] of [[0, 0], [1, -1], [-2, 8]]) ask({ type, a, h, k });
  for (const base of [2, 0.5]) for (const a of [1, -1]) for (const k of [0, -2]) ask({ type: 'exponential', a, h: 0, k, base });
  for (const base of [2, 0.5]) for (const a of [1, -1]) for (const [h, k] of [[0, 0], [1, 2]]) ask({ type: 'logarithmic', a, h, k, base });
  for (const [m, b] of [[2, 1], [-3, 2], [0, 3], [0.5, -1]]) ask({ type: 'line', m, b });
  ask({ type: 'line', m: 0, b: 3, domain: domain(-2, 4, true, true) });
  ask({ type: 'line', m: 1, b: 0, domain: domain(-2, 4, true, false) });
};

/* ---------------------------------------------------------------------------
 * The responses.
 * ------------------------------------------------------------------------- */

const STYLES = ['ascii', 'unicode', 'latex', 'leftRight'];
const endText = (value, style) => {
  if (value === -Infinity) return { ascii: '-inf', unicode: '−∞' }[style] ?? '-\\infty';
  if (value === Infinity) return { ascii: 'inf', unicode: '∞' }[style] ?? '\\infty';
  return style === 'unicode' ? String(value).replace('-', '−') : String(value);
};
const pieceText = (piece, style) => {
  const [open, close] = [piece.minClosed ? '[' : '(', piece.maxClosed ? ']' : ')'];
  const body = `${endText(piece.min, style)}${style === 'unicode' ? ', ' : ','}${endText(piece.max, style)}`;
  return style === 'leftRight' ? `\\left${open}${body}\\right${close}` : `${open}${body}${close}`;
};
const JOINS = Object.freeze({
  union: { ascii: 'u', unicode: ' ∪ ', latex: '\\cup', leftRight: '\\cup' },
  and: { ascii: ' and ', unicode: ' and ', latex: '\\land', leftRight: '\\text{ and }' },
  comma: { ascii: ',', unicode: ', ', latex: ',', leftRight: ',' },
  commaAnd: { ascii: ', and ', unicode: ', and ', latex: ',\\land', leftRight: ',\\text{ and }' },
  or: { ascii: ' or ', unicode: ' or ', latex: '\\lor', leftRight: '\\text{ or }' },
  semicolon: { ascii: ';', unicode: '; ', latex: ';', leftRight: ';' },
  sideBySide: { ascii: '', unicode: ' ', latex: '', leftRight: '' },
});
const LIST_JOINS = new Set(['and', 'comma', 'commaAnd']);
const setText = (pieces, join, style) => pieces.map((piece) => pieceText(piece, style)).join(JOINS[join][style]);

const setKey = (pieces) => JSON.stringify([...pieces]
  .sort((a, b) => a.min - b.min || a.max - b.max)
  .map((piece) => [Number.isFinite(piece.min) ? Math.round(piece.min * 1e9) / 1e9 : String(piece.min), Number.isFinite(piece.max) ? Math.round(piece.max * 1e9) / 1e9 : String(piece.max), piece.minClosed, piece.maxClosed]));
const withEnd = (pieces, index, side, change) => pieces.map((piece, at) => (at === index ? { ...piece, ...change(piece, side) } : piece));

/** x is a turning point of the drawn function: defined around it, and a strict local extremum there. */
const turningPointOf = (evaluate, spec) => (x) => {
  if (!Number.isFinite(x)) return false;
  const at = evaluate(spec, x);
  if (!Number.isFinite(at)) return false;
  return [1e-3, 1e-2].every((epsilon) => {
    const [left, right] = [evaluate(spec, x - epsilon), evaluate(spec, x + epsilon)];
    return Number.isFinite(left) && Number.isFinite(right) && (left - at) * (right - at) > 0;
  });
};

/**
 * Every response this section builds for one part, each { response, built,
 * responseClass }, from the base tree's own accepted answers and function.
 */
export const graphPartResponses = ({ part, partsByKind, spec, base }) => {
  const kind = String(part.kind);
  const listed = GRAPH_LIST_KINDS.includes(kind);
  const monotone = MONOTONE_KINDS.has(kind);
  const accepted = (Array.isArray(part.acceptedAnswers) ? part.acceptedAnswers : []).map(String);
  const sets = accepted.map((text) => base.parse(text)).filter((pieces) => Array.isArray(pieces) && pieces.length);
  const isTurning = turningPointOf(base.evaluate, spec);
  // The sets that are right: the base's own, and (where the function rises or
  // falls) each with an end at a turning point closed.
  const rightSets = new Map(sets.map((pieces) => [setKey(pieces), 'key']));
  if (monotone) {
    sets.forEach((pieces) => {
      let all = pieces;
      pieces.forEach((piece, index) => ['min', 'max'].forEach((side) => {
        if (piece[`${side}Closed`] || !isTurning(piece[side])) return;
        const closed = withEnd(pieces, index, side, () => ({ [`${side}Closed`]: true }));
        if (!rightSets.has(setKey(closed))) rightSets.set(setKey(closed), 'turning');
        all = withEnd(all, index, side, () => ({ [`${side}Closed`]: true }));
      }));
      if (!rightSets.has(setKey(all))) rightSets.set(setKey(all), 'turning');
    });
  }
  const out = new Map();
  const add = (response, built, responseClass) => { if (response && !out.has(response)) out.set(response, { response, built, responseClass }); };
  // A set written with a join, in every style: right or wrong by the set and the join alone.
  const addSet = (pieces, join, missClass) => {
    // One piece has no join: it is written once, as itself.
    if (pieces.length < 2 && join !== 'union') return;
    const known = rightSets.get(setKey(pieces));
    const joinIsRight = join === 'union' || (listed && LIST_JOINS.has(join) && pieces.length > 1);
    const right = Boolean(known) && joinIsRight;
    const listClass = LIST_JOINS.has(join) && pieces.length > 1;
    let responseClass;
    if (right) responseClass = known === 'turning' ? (listClass ? 'turning+list' : 'turning') : (listClass ? 'list' : 'spelling');
    else if (known && LIST_JOINS.has(join) && SET_KINDS.has(kind)) responseClass = 'setList';
    else responseClass = known && !joinIsRight ? join : missClass;
    STYLES.forEach((style) => add(setText(pieces, join, style), right ? 'right' : 'wrong', responseClass));
  };
  accepted.forEach((text) => add(text, 'right', 'key'));
  const allRight = [...rightSets.keys()].map((key) => JSON.parse(key).map(([min, max, minClosed, maxClosed]) => ({
    min: typeof min === 'string' ? Number(min) : min,
    max: typeof max === 'string' ? Number(max) : max,
    minClosed,
    maxClosed,
  })));
  allRight.forEach((pieces) => {
    addSet(pieces, 'union', 'spelling');
    if (pieces.length > 1) Object.keys(JOINS).filter((join) => join !== 'union').forEach((join) => addSet(pieces, join, join));
  });
  // Near misses of the base's own sets.
  sets.forEach((pieces) => {
    // Both ends of a piece changed, and every finite end closed.
    pieces.forEach((piece, index) => {
      if (![piece.min, piece.max].every(Number.isFinite)) return;
      addSet(withEnd(pieces, index, 'min', (current) => ({ minClosed: !current.minClosed, maxClosed: !current.maxClosed })), 'union', 'flip');
    });
    const allClosed = pieces.map((piece) => ({ ...piece, minClosed: Number.isFinite(piece.min), maxClosed: Number.isFinite(piece.max) }));
    addSet(allClosed, 'union', 'flip');
    if (allClosed.length > 1) addSet(allClosed, 'and', 'flip');
    pieces.forEach((piece, index) => ['min', 'max'].forEach((side) => {
      if (!Number.isFinite(piece[side])) return;
      const flipped = withEnd(pieces, index, side, (current) => ({ [`${side}Closed`]: !current[`${side}Closed`] }));
      addSet(flipped, 'union', 'flip');
      if (pieces.length > 1) ['and', 'comma'].forEach((join) => addSet(flipped, join, 'flip'));
      [-1, 1].forEach((step) => {
        const moved = withEnd(pieces, index, side, (current) => ({ [side]: current[side] + step }));
        if (moved.every((entry) => entry.min < entry.max)) addSet(moved, 'union', 'shift');
      });
    }));
    if (pieces.length > 1) {
      pieces.forEach((_, index) => {
        const rest = pieces.filter((__, at) => at !== index);
        addSet(rest, 'union', 'drop');
        if (rest.length > 1) addSet(rest, 'and', 'drop');
      });
    }
  });
  // The other kind's answer, as written and as a list.
  const other = partsByKind.get(OTHER_KIND[kind]);
  (other ? other.acceptedAnswers || [] : []).map(String).forEach((text) => {
    const pieces = base.parse(text);
    if (!Array.isArray(pieces) || !pieces.length) {
      // "none" for the other kind: wrong here unless this part is "none" too.
      if (!accepted.includes(text)) add(text, 'wrong', 'swap');
      return;
    }
    addSet(pieces, 'union', 'swap');
    if (pieces.length > 1) addSet(pieces, 'and', 'swap');
  });
  // A built-wrong response the base already reads as right is that set's own
  // spelling, not a near miss (decided by the caller, which grades the base).
  return [...out.values()];
};

/* ---------------------------------------------------------------------------
 * The sweep.
 * ------------------------------------------------------------------------- */

/**
 * Grades every built response with both trees. Returns the counts and every
 * verdict that moved, in the field sweep's change shape (grader 'graphAnalysis').
 */
export const sweepGraphIntervals = ({ corpus, base, current }) => {
  const counts = {
    graphQuestions: corpus.entries.length,
    graphParts: 0,
    graphRightResponses: 0,
    graphWrongResponses: 0,
    graphGraded: 0,
    graphRightToWrong: 0,
    graphWrongToRight: 0,
    graphNearMissNowRight: 0,
    graphNearMissNowRefused: 0,
    graphModelFailures: 0,
    graphKeysGained: 0,
    graphKeysLost: 0,
  };
  const movedByClass = {};
  // How many of each class were built, right and wrong (a near miss the base
  // already accepted counted right), so the report shows what was tried.
  const builtByClass = { right: {}, wrong: {} };
  // Right-built responses this tree still refuses, by class: a class the rule
  // covers should have none (its forms are the owner's); `spelling` lists
  // what the interval reader never read (reported, never a failure).
  const rightRefusedByClass = {};
  const rightRefused = [];
  const changes = [];
  for (const { source, question } of corpus.entries) {
    let baseModel;
    let currentModel;
    try {
      baseModel = base.modelFor(question);
      currentModel = current.modelFor(question);
    } catch {
      counts.graphModelFailures += 1;
      continue;
    }
    const baseParts = baseModel.analysisParts.filter((part) => SWEPT_KINDS.has(String(part.kind)));
    const partsByKind = new Map(baseParts.map((part) => [String(part.kind), part]));
    for (const basePart of baseParts) {
      const currentPart = currentModel.analysisParts.find((part) => part.id === basePart.id && part.kind === basePart.kind);
      if (!currentPart) continue;
      counts.graphParts += 1;
      const before = new Set((basePart.acceptedAnswers || []).map(String));
      const after = new Set((currentPart.acceptedAnswers || []).map(String));
      counts.graphKeysGained += [...after].filter((answer) => !before.has(answer)).length;
      counts.graphKeysLost += [...before].filter((answer) => !after.has(answer)).length;
      for (const { response, built: builtAs, responseClass } of graphPartResponses({ part: basePart, partsByKind, spec: question.functionSpec, base })) {
        const verdictBefore = base.grade(baseModel, basePart, response);
        const verdictAfter = current.grade(currentModel, currentPart, response);
        counts.graphGraded += 1;
        // A near miss the base already accepts is that answer's own spelling.
        const built = builtAs === 'wrong' && verdictBefore === true ? 'right' : builtAs;
        if (built === 'right') counts.graphRightResponses += 1; else counts.graphWrongResponses += 1;
        builtByClass[built][responseClass] = (builtByClass[built][responseClass] || 0) + 1;
        if (built === 'right' && verdictAfter !== true) {
          rightRefusedByClass[responseClass] = (rightRefusedByClass[responseClass] || 0) + 1;
          if (rightRefused.length < 200) rightRefused.push({ responseClass, response, kind: basePart.kind, key: (basePart.acceptedAnswers || [])[0] ?? null, spec: question.functionSpec, source });
        }
        if (verdictBefore === verdictAfter) continue;
        const change = {
          grader: 'graphAnalysis',
          built,
          responseClass,
          response,
          kind: basePart.kind,
          key: (basePart.acceptedAnswers || [])[0] ?? null,
          accepted: basePart.acceptedAnswers || [],
          spec: question.functionSpec,
          source,
          before: verdictBefore,
          after: verdictAfter,
        };
        changes.push(change);
        movedByClass[responseClass] = (movedByClass[responseClass] || 0) + 1;
        if (verdictBefore === true && built === 'wrong') counts.graphNearMissNowRefused += 1;
        else if (verdictBefore === true) counts.graphRightToWrong += 1;
        else if (verdictAfter === true) {
          counts.graphWrongToRight += 1;
          if (built === 'wrong') counts.graphNearMissNowRight += 1;
        }
      }
    }
  }
  // Every right-built class is the rule's own (RIGHT_CLASSES); a move in any
  // other class would be a near miss let through, counted above.
  const unexpectedClasses = Object.keys(movedByClass).filter((name) => !RIGHT_CLASSES.has(name));
  // The rule's own forms (not the base's spellings) must all be read now.
  const ruleFormsRefused = Object.keys(rightRefusedByClass).filter((name) => RULE_CLASSES.has(name));
  return { counts, builtByClass, movedByClass, unexpectedClasses, rightRefusedByClass, ruleFormsRefused, rightRefused, changes };
};
