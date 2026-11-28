/*
 * THE MATHS AUDIT OF EVERY BUILT-IN EXAMPLE THAT CAME BEFORE WE-I.
 *
 * WE-I's own siblings name what they state (workedExampleSiblingIdentities
 * .test.mjs). The sources of a built-in example from before it do not: the
 * question families in src/platform/supports/families/, the Step Algebra,
 * radical and plane replays (stepAlgebraReplay.js, radicalReplay.js,
 * planeReplay.js) and the Spot the mistake lines (spotTheMistake.js). So this
 * reads what each one SAYS, the text a student reads, and checks it, over
 * every real item each one claims, seeds 0 to 20:
 *
 *   1. its starting expression and its stated answer agree, numerically, under
 *      the assumption it states (nonzero values where it states none):
 *      each family's start against its answer, one check per kind of prompt
 *      it writes (STARTS below), and every prompt kind it writes has one;
 *   2. every value a step states agrees with the next step: every "A = B = C"
 *      and "A < B is true" a step or a board line states is evaluated, with the
 *      prompt's functions (f(x) = …, f⁻¹, (f ∘ g)(2)) as defined, and with the
 *      answer's values put in where the step's letters are the answer's; and
 *      what a step says in words ("both sides equal 25", "a = −2, h = 6",
 *      "its image is (−1, 6)", "the factor pairs of −12") from the prompt.
 *   3. Spot the mistake says nothing of its own: its step and reason are the
 *      item's own common error, and the reason it gives as right is true.
 *
 * It is evaluated with mathjs from the text alone (helpers/statedMaths.mjs):
 * nothing of the generators' own arithmetic is reused, so a wrong sign or a
 * wrong intermediate step shows up as two different numbers. A last test
 * changes one number in real examples and requires each check to fail.
 *
 * What it found (2026-11-28): the plane replay of a system of inequalities
 * could draw a sibling whose two boundaries cross on the board's edge, so the
 * overlap it shades as "the solution" is a single point, (6, 10), and no
 * solution shows (m3t2l5-cw-7 seed 11, m3t2l5-cw-16 seed 12, m3t2l5-p-1 seed
 * 11). planeReplay.js now refuses an overlap under OVERLAP_MIN_AREA, and the
 * sibling draws again.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { asQuestionEngineReceivesIt, lessonFiles } from '../../scripts/lib/classworkExampleCoverageReport.mjs';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { familyFor } from '../../src/platform/supports/families/index.js';
import { workedExampleFor } from '../../src/platform/supports/workedExample/examplePlayer.js';
import { spotTheMistakeFor, splitCommonError, SPOT_THE_MISTAKE_GENERIC } from '../../src/platform/supports/workedExample/spotTheMistake.js';
import { agree, answerValues, evaluator, functionsDefined, plainOf, relationHolds, statedPairs } from './helpers/statedMaths.mjs';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const SEEDS = Array.from({ length: 21 }, (_, seed) => seed);
// WE-I's own sources: the Algebra II ones checked, from the identities they name, by
// workedExampleSiblingIdentities.test.mjs; the Algebra I one, step by step, by weI_algebra1Siblings.test.mjs.
const WE_I = new Set(['polynomialDivision', 'algebra2AnswerBoxes', 'linearReasoning']);
const WE_I_TOOLS = new Set(['longDivision', 'syntheticDivision', 'synthetic']);

// Deterministic draws: the same points every run. Nonzero, as no family states an assumption.
let state = 11;
const random = () => {
  state = (state * 1103515245 + 12345) % 2147483648;
  return state / 2147483648;
};
const draw = () => {
  const size = 0.3 + random() * 2.7;
  return random() < 0.5 ? -size : size;
};

const minus = (value) => String(value).replace(/−|–/g, '-');
const plain = (value) => minus(plainOf(value)).replace(/\s+/g, ' ').replace(/\s+([.,;:])/g, '$1').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim();
const num = (value) => {
  const e = evaluator(String(value).trim());
  return e && !e.letters.length ? e.at({}) : Number.NaN;
};
const PAIR = /\(\s*(-?[\d./]+)\s*,\s*(-?[\d./]+)\s*\)/g;
const pairsIn = (value) => [...plain(value).matchAll(PAIR)].map((m) => [num(m[1]), num(m[2])]);

// ---------------------------------------------------------------- the examples

/** Every step's text: what it shows, and each board line a replay draws. */
const textsOf = (steps) => (steps || []).flatMap((step) => {
  if (typeof step === 'string') return [step];
  const out = [step.show || step.text || ''];
  const lines = step.board?.lines || [];
  // A test point's lines: the relation with the point put in is what the result line says of it.
  const said = lines.some((line) => /^(False|The two sides are not equal)$/.test(line.name)) ? ' is false'
    : lines.some((line) => /^(True|Both sides are equal)$/.test(line.name)) ? ' is true' : '';
  for (const line of lines) if (line.latex && !line.name.startsWith('Extraneous')) out.push(`$${line.latex}$${line.name.endsWith('put in') ? said : ''}`);
  for (const key of ['before', 'applied', 'after']) if (typeof step.board?.[key] === 'string') out.push(`$${step.board[key]}$`);
  return out;
});
/** Candidates the example rejects: "x = −5 is extraneous", a board's "Extraneous: rejected" line. */
const rejectedOf = (steps) => {
  const out = {};
  const add = (letter, value) => { if (Number.isFinite(value)) (out[letter] ||= []).push(value); };
  for (const step of steps || []) {
    const show = typeof step === 'string' ? step : step.show || '';
    for (const m of plain(show).matchAll(/([a-z]) = (\S+?) is extraneous/g)) add(m[1], num(m[2]));
    for (const line of step.board?.lines || []) {
      const m = line.name.startsWith('Extraneous') ? /^([a-z]) = (.+)$/.exec(plain(`$${line.latex}$`)) : null;
      if (m) add(m[1], num(m[2]));
    }
  }
  return out;
};

const QUESTIONS = lessonFiles(ROOT).flatMap((file) => {
  const compiled = compileAuthoringIntentV5(JSON.parse(readFileSync(path.join(ROOT, file), 'utf8')));
  return (compiled?.package?.sections || []).flatMap((section) => {
    const questions = (section.questions || []).map((raw) => {
      try { return asQuestionEngineReceivesIt(raw); } catch { return null; }
    }).filter(Boolean);
    return questions.map((question) => ({ question, section: questions }));
  });
});

const EXAMPLES = [];
for (const { question } of QUESTIONS) {
  const family = familyFor(question);
  const claimed = family && !WE_I.has(family.family) && typeof family.similarProblem === 'function';
  for (const seed of SEEDS) {
    if (claimed) {
      const sibling = family.similarProblem(question, { seed });
      if (sibling) EXAMPLES.push({ source: family.family, id: question.questionId, seed, prompt: sibling.prompt, steps: sibling.steps, answer: sibling.answer });
    }
    // The replays: what the example player plays, on the tool's own engine.
    const played = workedExampleFor(question, { seed });
    if (played?.source === 'family' && played.format === 'replay' && !WE_I_TOOLS.has(played.tool)) {
      EXAMPLES.push({ source: `replay:${played.tool || 'stepAlgebra'}`, id: question.questionId, seed, prompt: played.prompt, steps: played.steps, answer: played.answer });
    }
  }
}
for (const example of EXAMPLES) {
  example.where = `${example.source} ${example.id} seed ${example.seed}`;
  example.texts = textsOf(example.steps);
  example.rejected = rejectedOf(example.steps);
}

// ------------------------------------------------- 2. every value a step states

/** The functions a prompt defines, as mathjs scope: fn_f, and finv_f once a step states f⁻¹. */
const environmentOf = (example, problems, counts) => {
  const defined = functionsDefined(example.prompt);
  const functions = Object.keys(defined);
  const scope = {};
  for (const [name, { variable, body }] of Object.entries(defined)) {
    const e = evaluator(body, { functions });
    if (e) scope[`fn_${name}`] = (value) => e.at({ ...scope, [variable]: value });
  }
  // An inverse a step states, "f⁻¹(x) = (x + 1)/6": f(f⁻¹(x)) = x, then f⁻¹ joins the scope.
  for (const t of [...example.texts, example.answer]) {
    for (const m of plain(t).matchAll(/([A-Za-z])⁻¹\(([a-z])\) = ([^;,]+?)(?=$|[;,]|\.\s|\.$|\s(?:and|so)\s)/g)) {
      const [, name, variable, body] = m;
      if (!scope[`fn_${name}`] || scope[`finv_${name}`]) continue;
      const e = evaluator(body.trim(), { functions });
      if (!e) continue;
      functions.push(`${name}⁻¹`);
      scope[`finv_${name}`] = (value) => e.at({ ...scope, [variable]: value });
      counts.inverse += 1;
      for (let point = 0; point < 4; point += 1) {
        const x = draw();
        const back = scope[`fn_${name}`](scope[`finv_${name}`](x));
        if (Number.isFinite(back) && !agree(back, x)) {
          problems.push(`${example.where}: ${name}⁻¹(${variable}) = ${body} is not the inverse: ${name}(${name}⁻¹(${x})) = ${back}`);
          break;
        }
      }
    }
  }
  return { functions, scope };
};

const decimals = (value) => /^-?\d+\.(\d+)$/.exec(minus(value).trim())?.[1].length ?? null;

/** The answer's values for its letters, where the example solves for them. */
const boundOf = (example) => {
  const answer = plain(example.answer);
  if (/[<>≤≥]/.test(answer)) return null;
  const solving = /^(Solve|Graph the system|Graph y = .* and y = |Find p and q)/.test(plain(example.prompt)) || /find where the lines/.test(example.prompt);
  if (!solving) return null;
  // A bare pair gives the letters in the order the prompt first writes them, (x, y) for x and y.
  const order = [...new Set((plain(example.prompt).replace(/^[^:]*: /, '').match(/(?<![A-Za-z])[a-z](?![A-Za-z])/g) || []))];
  const values = answerValues(example.answer, { pairLetters: order.includes('x') && order.includes('y') ? ['x', 'y'] : order.slice(0, 2) });
  return Object.keys(values).length ? values : null;
};

/**
 * Every relation the steps and the answer state, checked:
 *   numbers only               it holds (or does not, where the sentence says false);
 *   the answer's letters only  it holds for an answer value (or a rejected candidate);
 *   a function's rule          "(f + g)(x) = …", both sides in x: equal at random x.
 */
export const stepProblems = (example, counts = { arithmetic: 0, truth: 0, bound: 0, local: 0, identity: 0, inverse: 0 }) => {
  const problems = [];
  const env = environmentOf(example, problems, counts);
  const bound = boundOf(example);
  // Where the prompt multiplies, factors or divides polynomials, every equation in x is an identity.
  const identities = /^(Use an area model|Find p and q|Divide .+ by .+\. Give the quotient)/.test(plain(example.prompt));
  for (const t of [...example.texts, example.answer]) {
    const pairs = statedPairs(t);
    // A clause that opens with a function's rule, "(f + g)(x) = (…) + (…) = …", is one rule written three ways.
    const callSources = new Set(pairs.filter((pair) => {
      const e = evaluator(pair.left, { functions: env.functions });
      return e && e.calls.length && e.letters.length && !/^[a-z]$/.test(pair.right.trim());
    }).map((pair) => pair.source));
    // The values one sentence gives a letter: "put x = 1 into y = 2x − 3. It gives y = −1",
    // "solving −x − 2 = 0 gives x = −2". Its relations in those letters hold for one of them.
    const local = {};
    // Not where the sentence puts a candidate in to reject it, or names one branch of an "or".
    const testsACandidate = /\b(or|OR)\b|extraneous|not a solution|reject|≠|not equal/i.test(plainOf(t));
    for (const pair of testsACandidate ? [] : pairs) {
      const value = pair.op === '=' && /^[a-z]$/.test(pair.left.trim()) ? evaluator(pair.right) : null;
      if (value && !value.letters.length && Number.isFinite(value.at({}))) (local[pair.left.trim()] ||= []).push(value.at({}));
    }
    for (const pair of pairs) {
      const L = evaluator(pair.left, { functions: env.functions });
      const R = evaluator(pair.right, { functions: env.functions });
      if (!L || !R) continue;
      const letters = [...new Set([...L.letters, ...R.letters])];
      const expected = pair.truth !== false;
      const report = (detail) => problems.push(`${example.where}: "${pair.left} ${pair.op} ${pair.right}" ${detail} (in "${pair.source}")`);
      if (!letters.length) {
        const a = L.at(env.scope);
        const b = R.at(env.scope);
        if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
        // A decimal is read to the places it is written in.
        const places = pair.op === '=' ? (decimals(pair.right) ?? decimals(pair.left)) : null;
        const holds = places != null ? Math.abs(a - b) <= 0.5 * 10 ** -places + 1e-9 : relationHolds(pair.op, a, b);
        counts[pair.truth == null ? 'arithmetic' : 'truth'] += 1;
        if (holds !== expected) report(`is ${holds ? 'true' : 'false'}: ${a} against ${b}`);
        continue;
      }
      const bare = (side) => /^[a-z]$/.test(side.trim());
      const holdsAt = (scope) => {
        const x = L.at({ ...env.scope, ...scope });
        const y = R.at({ ...env.scope, ...scope });
        return Number.isFinite(x) && Number.isFinite(y) ? relationHolds(pair.op, x, y) : null;
      };
      const scopesOf = (values) => letters.reduce((acc, letter) => acc.flatMap((scope) => values[letter].map((value) => ({ ...scope, [letter]: value }))), [{}]);
      // The sentence's own values first: "x + 6 = 1 gives x = −5; x + 6 = −1 gives x = −7".
      if (letters.every((letter) => letter in local) && !(bare(pair.left) && !R.letters.length)) {
        const results = scopesOf(local).map(holdsAt).filter((result) => result !== null);
        if (results.length) {
          counts.local += 1;
          if (results.some(Boolean) !== expected) report(`holds for no value the sentence gives (${JSON.stringify(local)})`);
          continue;
        }
      }
      // Then the answer's: every step on the way to it holds for each of its values (a step is implied
      // by the one before it), except a candidate named alone or one branch of an "or", which holds
      // for one of the values, the rejected candidates among them.
      if (bound && letters.every((letter) => letter in bound)) {
        const branch = (bare(pair.left) && !R.letters.length) || /\b(or|OR)\b/.test(plainOf(t));
        const values = { ...bound };
        if (branch) for (const [letter, rejected] of Object.entries(example.rejected)) values[letter] = [...(values[letter] || []), ...rejected];
        const results = scopesOf(values).map(holdsAt).filter((result) => result !== null);
        if (!results.length) continue;
        counts.bound += 1;
        const holds = branch ? results.some(Boolean) : results.every(Boolean);
        if (holds !== expected) report(`does not hold for ${branch ? 'any value' : 'every value'} the answer gives (${JSON.stringify(bound)})`);
        continue;
      }
      const chained = callSources.has(pair.source);
      // A letter alone names what follows ("s = E⁻¹(x)"); only where polynomials are multiplied out is "2 × x = x" a claim.
      const labelled = identities ? bare(pair.left) && bare(pair.right) : bare(pair.left) || bare(pair.right);
      if ((identities || chained) && pair.op === '=' && L.letters.length && R.letters.length && !labelled) {
        const wrong = (() => {
          for (let point = 0; point < 5; point += 1) {
            const scope = Object.fromEntries(letters.map((letter) => [letter, draw()]));
            const a = L.at({ ...env.scope, ...scope });
            const b = R.at({ ...env.scope, ...scope });
            if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
            if (!agree(a, b)) return `differs at ${JSON.stringify(scope)}: ${a} against ${b}`;
          }
          return null;
        })();
        counts.identity += 1;
        if (wrong) report(wrong);
        continue;
      }
      if ((L.calls.length || R.calls.length) && L.letters.length && R.letters.length && !bare(pair.left) && !bare(pair.right) && pair.op === '=') {
        let compared = 0;
        for (let point = 0; point < 8 && compared < 4; point += 1) {
          const scope = Object.fromEntries(letters.map((letter) => [letter, draw()]));
          const a = L.at({ ...env.scope, ...scope });
          const b = R.at({ ...env.scope, ...scope });
          if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
          compared += 1;
          if (!agree(a, b)) { report(`differs at ${JSON.stringify(scope)}: ${a} against ${b}`); break; }
        }
        if (compared) counts.identity += 1;
      }
    }
  }
  return problems;
};

/**
 * A line drawn step by step, on the plane or in words: each y-intercept, slope,
 * rise and run, plotted point and line drawn agrees with the equation it is for.
 */
export const lineStepProblems = (example, counts = { plane: 0 }) => {
  const out = [];
  let current = null;
  const sideAt = (equation, x) => at(equation.split(/ = | [<>≤≥] /)[1], { x });
  const onLine = (equation, [x, y]) => { const [l, r] = equation.split(/ = | [<>≤≥] /); return agree(at(l, { x, y }), at(r, { x, y })); };
  for (const step of example.steps) {
    const t = plain(typeof step === 'string' ? step : step.show || '');
    const named = /^(?:Equation \d, |Inequality \d, |The line, |The inequality, |Graph )(y (?:=|<|>|≤|≥) [^:]+):/.exec(t);
    if (named) current = named[1];
    if (!current || !current.startsWith('y ')) continue;
    const report = (detail) => out.push(`${example.where}: "${t}" ${detail} (${current})`);
    const intercept = /the y-intercept is (-?[\d./()]+)\. Plot (\(.+?\))\.$|start at its y-intercept, (-?[\d./()]+), and use the slope (-?[\d./()]+)\.$/.exec(t);
    if (intercept) {
      counts.plane += 1;
      const b = num(intercept[1] ?? intercept[3]);
      if (!agree(sideAt(current, 0), b)) report(`: the y-intercept is ${sideAt(current, 0)}`);
      if (intercept[2] && !onLine(current, pairsIn(intercept[2])[0])) report(': the point is not on the line');
      if (intercept[4] && !agree(sideAt(current, 1) - sideAt(current, 0), num(intercept[4]))) report(`: the slope is ${sideAt(current, 1) - sideAt(current, 0)}`);
    }
    const rise = /^The slope is (-?[\d./()]+): from (\(.+?\)) go (up|down) (\d+) and right (\d+)\. Plot (\(.+?\))\.$/.exec(t);
    if (rise) {
      counts.plane += 1;
      const m = sideAt(current, 1) - sideAt(current, 0);
      const [[x0, y0]] = pairsIn(rise[2]);
      const [[x1, y1]] = pairsIn(rise[6]);
      const r = (rise[3] === 'up' ? 1 : -1) * Number(rise[4]);
      if (!agree(num(rise[1]), m)) report(`: the slope is ${m}`);
      if (!agree(r / Number(rise[5]), m)) report(`: rise over run is not ${m}`);
      if (x1 !== x0 + Number(rise[5]) || !agree(y1, y0 + r)) report(': the plotted point is not the rise and run from the start');
      if (!onLine(current, [x1, y1])) report(': the plotted point is not on the line');
    }
    const drawn = /^Draw the (?:dashed |solid )?line through (\(.+?\)) and (\(.+?\))\.$/.exec(t);
    if (drawn) {
      counts.plane += 1;
      for (const point of pairsIn(`${drawn[1]} ${drawn[2]}`)) if (!onLine(current, point)) report(`: (${point}) is not on the line`);
    }
  }
  return out;
};

const WORD_NUMBER = Object.freeze({ zero: 0, one: 1 });
/** "y = −2f(x − 6) + 5" (f unknown) as a, b, h, k: f put back as 0, 1 and u in turn. */
const transformOf = (rule) => {
  const g = (f, x) => at(rule, { x, fn_f: f }, ['f']);
  const k = g(() => 0, 0);
  const a = g(() => 1, 0) - k;
  const ab = g((u) => u, 1) - g((u) => u, 0);
  const b = ab / a;
  const h = -(g((u) => u, 0) - k) / ab;
  return { a, b, h, k };
};
/** y = a·P(x − h) + k with P(0) = 0 and P(1) = 1 (|x|, x², x³, √x, ∛x): a, h, k from the rule itself. */
const vertexFormOf = (rule) => {
  const inner = /(?:\||\(|√\(|∛\()x ([+-]) (\d+(?:\.\d+)?)/.exec(rule);
  const h = inner ? (inner[1] === '-' ? 1 : -1) * Number(inner[2]) : 0;
  const k = at(rule, { x: h });
  return { a: at(rule, { x: h + 1 }) - k, h, k };
};
const valueOfWord = (value) => (value in WORD_NUMBER ? WORD_NUMBER[value] : num(value));

/**
 * What a step says in words, checked: each kind of sentence the families
 * write that names a value ("both sides equal 25", "a line with slope 3",
 * "a = −2, h = 6, k = 5", "factor pair of −10", "(12, 2) becomes (2, 12)",
 * "that leaves −6x", "the horizontal asymptote is y = −8"…).
 */
export const claimProblems = (example, counts = { claims: 0 }) => {
  const out = [];
  const p = plain(example.prompt);
  const defined = functionsDefined(example.prompt);
  const fName = Object.keys(defined)[0];
  const f = fName ? (() => { const e = evaluator(defined[fName].body); return e ? (x) => e.at({ [defined[fName].variable]: x }) : null; })() : null;
  const claim = (ok, detail, t) => { counts.claims += 1; if (!ok) out.push(`${example.where}: "${t}" ${detail}`); };
  const sides = (equation, scope) => { const [l, r] = equation.split(' = '); return [at(l, scope), at(r, scope)]; };
  const promptEquations = (/^(?:Solve the system[^:]*: |Graph (?:the system )?)(.+?)(?:,? and find.*|\.)$/.exec(p)?.[1] || '').split(' and ').filter((e) => e.includes(' = '));
  let swapped = false;
  let w;
  // The line the answer gives, as y of x: its equation, or its two points.
  const lineOfAnswer = (() => {
    if (!/^(Write the equation y = mx|You are given|Graph (?!.*number line)(?!the inequality)(?!the system)|Find the x-intercept|Decide whether)/.test(p) || /,? and find where/.test(p) || / and y = /.test(p)) return null;
    const answer = plain(example.answer);
    const equation = (answer.match(/(?:^|; |The line )(-?\d*x? ?[+-]? ?\d*y? ?= ?[^;,]+?)(?=;|,|$| through)/g) || []).map((e) => e.replace(/^(; |The line )/, '').trim()).find((e) => /y/.test(e));
    if (equation) {
      const [l, r] = equation.split('=');
      const g = (x, y) => at(l, { x, y }) - at(r, { x, y });
      const dy = g(0, 1) - g(0, 0);
      return dy === 0 ? null : (x) => -g(x, 0) / dy;
    }
    const points = pairsIn(answer);
    if (points.length === 2 && points[0][0] !== points[1][0]) {
      const [[x0, y0], [x1, y1]] = points;
      return (x) => y0 + ((y1 - y0) / (x1 - x0)) * (x - x0);
    }
    return null;
  })();
  const parallelGiven = (() => { const g = /parallel to y = (.+)\.$/.exec(p); return g ? `y - (${g[1]})` : null; })();
  for (const step of example.steps) {
    const t = plain(typeof step === 'string' ? step : step.show || '');
    let m;
    // Checks: "with x = −6, both sides of E equal −15", "put x = −6 into E. Both sides equal −15".
    if ((m = /(?:with|put) ([a-z]) = (-?[\d./()]+)(?:,| into) (?:both sides of )?(.+? = .+?)(?: equal|\. Both sides equal) (-?[\d./()]+)\.$/.exec(t))) {
      const [a, b] = sides(m[3], { [m[1]]: num(m[2]) });
      claim(agree(a, num(m[4])) && agree(b, num(m[4])), `: the sides are ${a} and ${b}`, t);
    }
    // "put x = 1 into y = 2x − 3. It gives y = −1, so (1, −1) is on the line."
    if ((m = /put x = (-?[\d./()]+) into (y = .+?)\. It gives y = (-?[\d./()]+), so (\(.+?\)) is on the line\.$/.exec(t))) {
      const y = at(m[2].slice(4), { x: num(m[1]) });
      const [[px, py]] = pairsIn(m[4]);
      claim(agree(y, num(m[3])) && agree(px, num(m[1])) && agree(py, y), `: y is ${y}`, t);
    }
    // "put x = 1 into each equation. Both give y = −2, so (1, −2) is the solution."
    if ((m = /put x = (-?[\d./()]+) into each equation\. Both give y = (-?[\d./()]+), so (\(.+?\)) is the solution\.$/.exec(t))) {
      const x = num(m[1]);
      const ys = promptEquations.map((equation) => at(equation.split(' = ')[1], { x }));
      const [[px, py]] = pairsIn(m[3]);
      claim(ys.length === 2 && ys.every((y) => agree(y, num(m[2]))) && agree(px, x) && agree(py, num(m[2])), `: the equations give ${ys}`, t);
    }
    // "Check with x = −5, on the solution side: −55 < −46 is true": the prompt's two sides at that value.
    if ((m = /^Check with ([a-z]) = (-?[\d.]+), on the solution side: (-?[\d.]+) ([<>≤≥]) (-?[\d.]+) is true\.$/.exec(t))) {
      const inequality = /^Solve (.+?)(?:, then graph.*)?\.?$/.exec(p)?.[1];
      const [l, r] = inequality ? inequality.split(/ [<>≤≥] /) : [];
      const v = { [m[1]]: num(m[2]) };
      claim(inequality && agree(at(l, v), num(m[3])) && agree(at(r, v), num(m[5])), `: the sides of ${inequality} are ${at(l, v)} and ${at(r, v)}`, t);
    }
    // A segment's dots are its own ends: "−9 ≤ x < 7: … a closed dot at −9 and an open dot at 7".
    if ((m = /^(-?\d+) (<|≤) x (<|≤) (-?\d+): .*Draw an? (open|closed) dot at (-?\d+) and an? (open|closed) dot at (-?\d+)/.exec(t))) {
      claim(m[6] === m[1] && m[8] === m[4] && (m[5] === 'closed') === (m[2] === '≤') && (m[7] === 'closed') === (m[3] === '≤'), ': the dots are not the ends', t);
    }
    if ((m = /^x (<|>|≤|≥) (-?\d+): .*draw an? (open|closed) dot at (-?\d+)/.exec(t))) claim(m[4] === m[2] && (m[3] === 'closed') === /[≤≥]/.test(m[1]), ': the dot is not the end', t);
    // Factor pairs: "−2 and 5 work: … No other factor pair of −10 has that sum." / "multiply to −2 and add to 1".
    if ((m = /No other factor pair of (-?\d+) has that sum/.exec(t)) || (m = /Go through the factor pairs of (-?\d+)/.exec(t))) {
      const trinomial = /so that (.+?) = \(x \+ p\)\(x \+ q\)/.exec(p)?.[1];
      claim(trinomial && agree(at(trinomial, { x: 0 }), num(m[1])), `: the number term of ${trinomial} is ${trinomial && at(trinomial, { x: 0 })}`, t);
    }
    if ((m = /and look for the one that adds to (-?\d+)/.exec(t))) {
      const trinomial = /so that (.+?) = \(x \+ p\)\(x \+ q\)/.exec(p)?.[1];
      claim(trinomial && agree(at(trinomial, { x: 1 }) - at(trinomial, { x: 0 }) - 1, num(m[1])), ': not the x-coefficient', t);
    }
    if ((m = /^Factor (.+?)\. Look for two numbers that multiply to (-?\d+) and add to (-?\d+)/.exec(t))) {
      const c = at(m[1], { x: 0 });
      const lead = (at(m[1], { x: 1 }) + at(m[1], { x: -1 })) / 2 - c;
      const b = (at(m[1], { x: 1 }) - at(m[1], { x: -1 })) / 2;
      claim(agree(num(m[2]), lead * c) && agree(num(m[3]), b), `: ${m[1]} needs a product of ${lead * c} and a sum of ${b}`, t);
    }
    // Long division: "Multiply: −4x(x − 4) = −4x² + 16x. Subtract it from −4x² + 10x: that leaves −6x."
    if ((m = /Multiply: (.+?) = (.+?)\. Subtract it from (.+?): that leaves (.+?)\./.exec(t))) {
      const wrong = sameEverywhere(`(${m[3]}) - (${m[2]})`, m[4]);
      claim(!wrong, `: ${wrong}`, t);
    }
    if ((m = /so the quotient is (.+?) and the remainder is (.+?)\.$/.exec(t))) {
      claim(plain(example.answer) === `quotient ${m[1]}, remainder ${m[2]}`, `: the answer is "${example.answer}"`, t);
    }
    // The inverse relation: "(12, 2) becomes (2, 12)"; a point of f on y = x.
    if ((m = /^(\(.+?\)) becomes (\(.+?\))\.$/.exec(t))) {
      const [[a, b], [c, d]] = pairsIn(`${m[1]} ${m[2]}`);
      claim(a === d && b === c && pairsIn(p).some(([x, y]) => x === a && y === b), ': not the pair exchanged', t);
    }
    if ((m = /^\((-?\d+), (-?\d+)\) is on the graph of f: the input (-?\d+) gives the output (-?\d+), so f\((-?\d+)\) = (-?\d+)\.$/.exec(t))) {
      claim(m[3] === m[1] && m[5] === m[1] && m[4] === m[2] && m[6] === m[2], ': not the point', t);
    }
    if ((m = /^\(f · g\)\(x\) = (\(.+?\)\(.+?\)): multiply each term .* combine like terms: (.+)\.$/.exec(t))) {
      const wrong = sameEverywhere(m[1], m[2]);
      claim(!wrong, `: ${wrong}`, t);
    }
    // Transformations: a, b, h and k as a step states them, from the rule itself.
    if ((m = /^In (y = .*?f\(.+?\).*?), a (?:is |= )(-?[\d./]+|one), b (?:is |= )(-?[\d./]+|one), h (?:is |= )(-?[\d./]+|zero), k (?:is |= )(-?[\d./]+|zero)\./.exec(t))) {
      const got = transformOf(m[1].slice(4));
      const said = { a: valueOfWord(m[2]), b: valueOfWord(m[3]), h: valueOfWord(m[4]), k: valueOfWord(m[5]) };
      claim(['a', 'b', 'h', 'k'].every((key) => agree(got[key], said[key])), `: the rule has ${JSON.stringify(got)}`, t);
    }
    if ((m = /^In (y = [^,]+?), a = (-?[\d./]+), h = (-?[\d./]+) and k = (-?[\d./]+), and nothing multiplies x inside\.$/.exec(t))) {
      const got = vertexFormOf(m[1].slice(4));
      claim(agree(got.a, num(m[2])) && agree(got.h, num(m[3])) && agree(got.k, num(m[4])), `: the rule has ${JSON.stringify(got)}`, t);
    }
    if ((m = /^Compare g\(x\) = f\(x ([+-]) (\d+)\) ([+-]) (\d+) with .*h = (-?\d+), and the number added at the end gives k = (-?\d+)\.$/.exec(t))) {
      claim(Number(m[5]) === (m[1] === '-' ? 1 : -1) * Number(m[2]) && Number(m[6]) === (m[3] === '+' ? 1 : -1) * Number(m[4]), ': h or k is not the rule\'s', t);
    }
    if ((m = /^Check: a point \(p, q\) of y = f\(x\) moves to \(p ([+-]) (\d+), q ([+-]) (\d+)\), because g at that x is f\(p\) ([+-]) (\d+)\.$/.exec(t))) {
      const rule = /f\(x ([+-]) (\d+)\) ([+-]) (\d+)/.exec(p);
      claim(rule && m[1] === (rule[1] === '+' ? '-' : '+') && m[2] === rule[2] && m[3] === rule[3] && m[4] === rule[4] && m[5] === rule[3] && m[6] === rule[4], ': not the rule\'s move', t);
    }
    if ((m = /^Enter a = (-?[\d./]+), h = (-?[\d./]+), k = (-?[\d./]+): your graph is then (y = .+?)\. /.exec(t))) {
      const values = answerValues(example.answer);
      const form = /(y = [^.]*?a[^.]*?)(?: lands on it)?\.$/.exec(p)?.[1].slice(4);
      const scope = { a: num(m[1]), h: num(m[2]), k: num(m[3]) };
      const wrong = form ? sameEverywhere(form, m[4].slice(4), ['x'], scope) : 'no form';
      claim(!wrong && ['a', 'h', 'k'].every((key) => agree(values[key]?.[0], scope[key])), `: ${wrong || `the answer is "${example.answer}"`}`, t);
    }
    // A function's features, from the function itself.
    if (f) {
      if ((m = /is a line with slope (-?[\d./()]+), so it (rises|falls)/.exec(t))) claim(agree(f(1) - f(0), num(m[1])) && (m[2] === 'rises') === (f(1) > f(0)), `: the slope is ${f(1) - f(0)}`, t);
      if ((m = /with a = (-?[\d./]+), h = (-?[\d./]+) and k = (-?[\d./]+): its vertex is \((-?[\d.]+), (-?[\d.]+)\) and (?:it|the V) opens (upward|downward)/.exec(t))) {
        const [a, h, k] = [num(m[1]), num(m[2]), num(m[3])];
        claim(agree(f(h), k) && agree(f(h + 1) - k, a) && num(m[4]) === h && num(m[5]) === k && (m[6] === 'upward') === (a > 0), ': not the function\'s a, h, k or vertex', t);
      }
      if ((m = /(?:starts at its endpoint|has its center at) \((-?[\d.]+), (-?[\d.]+)\)/.exec(t))) claim(agree(f(num(m[1])), num(m[2])), `: f(${m[1]}) = ${f(num(m[1]))}`, t);
      if ((m = /Axis of symmetry: the vertical line through the vertex, x = (-?[\d./]+)\.$/.exec(t))) claim([0.5, 1, 2].every((d) => agree(f(num(m[1]) - d), f(num(m[1]) + d))), ': not symmetric there', t);
      if ((m = /it (falls|rises) until x = (-?[\d./]+), then (rises|falls)/.exec(t))) {
        const c = num(m[2]);
        const turn = m[1] === 'falls' ? f(c - 0.01) > f(c) && f(c + 0.01) > f(c) : f(c - 0.01) < f(c) && f(c + 0.01) < f(c);
        claim(turn, `: no turn at x = ${c}`, t);
      }
      if ((m = /so the outputs get close to (-?[\d./]+): the horizontal asymptote is y = (-?[\d./]+)\.$/.exec(t))) {
        const near = (c) => Math.abs(f(-1e6) - c) < 1e-4 || Math.abs(f(1e6) - c) < 1e-4;
        claim(near(num(m[1])) && near(num(m[2])), ': not the asymptote', t);
      }
      if ((m = /has the horizontal asymptote y = (-?[\d./]+) \(the added constant\)/.exec(t))) claim(Math.abs(f(-1e6) - num(m[1])) < 1e-4 || Math.abs(f(1e6) - num(m[1])) < 1e-4, ': not the asymptote', t);
      // The same statements the answer makes, made in a step: "so the domain is [1, 8]", "increasing on (−2, 3) and decreasing on (−6, −2)".
      const parts = [];
      for (const [, name, value] of t.matchAll(/the (domain|range) is ([^.;]+?)(?:\.$|\.\s|;|$)/g)) parts.push(`${name} ${value}`);
      if ((m = /it is increasing on (.+?) and decreasing on (.+?)\.$/.exec(t))) parts.push(`increasing ${m[1]}`, `decreasing ${m[2]}`);
      if ((m = /so it is increasing on (.+?)\.$/.exec(t))) parts.push(`increasing ${m[1]}`);
      if ((m = /the function is positive on (.+?) and negative on (.+?)\.$/.exec(t))) parts.push(`positive ${m[1]}`, `negative ${m[2]}`);
      if ((m = /meets the x-axis at (.+?) and the zeros are (\{[^}]*\})/.exec(t))) parts.push(`x-intercepts ${m[1]}, zeros ${m[2]}`);
      if ((m = /the vertex \((-?[\d.]+), (-?[\d.]+)\) is the (lowest|highest) point/.exec(t))) parts.push(`${m[3]} point (${m[1]}, ${m[2]})`);
      if (parts.length) {
        const range = /for (-?\d+) ≤ x ≤ (-?\d+)/.exec(p) || /from (\d+) to (\d+)/.exec(p);
        const found = featureProblems(f, range ? [Number(range[1]), Number(range[2])] : null, parts.join('; '));
        claim(!found.length, `: ${found.join('; ')}`, t);
      }
    }
    // Data: the points, the sums, the line and the stepper settings, from the data.
    if (p.startsWith('Fit a line by hand to the data')) {
      const points = pairsIn(p.split(' and predict')[0]);
      const n = points.length;
      const mx = points.reduce((sum, [x]) => sum + x, 0) / n;
      const my = points.reduce((sum, [, y]) => sum + y, 0) / n;
      const sxx = points.reduce((sum, [x]) => sum + (x - mx) ** 2, 0);
      const sxy = points.reduce((sum, [x, y]) => sum + (x - mx) * (y - my), 0);
      const slope = sxy / sxx;
      const intercept = my - slope * mx;
      // A value is read to the places it is written in.
      const close = (written, exact) => Math.abs(written - exact) <= 0.5 * 10 ** -((/\.(\d+)/.exec(String(written))?.[1].length) ?? 0) + 1e-9;
      if ((m = /^Use all (\d+) points: (.+)\.$/.exec(t))) claim(Number(m[1]) === n && JSON.stringify(pairsIn(m[2])) === JSON.stringify(points), ': not the data', t);
      if ((m = /Means: x̄ = (-?\d+(?:\.\d+)?) ÷ (\d+) = (-?\d+(?:\.\d+)?), ȳ = (-?\d+(?:\.\d+)?) ÷ (\d+) = (-?\d+(?:\.\d+)?)/.exec(t))) claim(close(m[1], mx * n) && Number(m[2]) === n && close(m[3], mx) && close(m[4], my * n) && Number(m[5]) === n && close(m[6], my), ': not the means of the data', t);
      if ((m = /^Sxx = Σ\(x - x̄\)² = (-?[\d.]+), Sxy = Σ\(x - x̄\)\(y - ȳ\) = (-?[\d.]+)\.$/.exec(t))) claim(close(m[1], sxx) && close(m[2], sxy), `: Sxx = ${sxx}, Sxy = ${sxy}`, t);
      if ((m = /^m = Sxy ÷ Sxx = (-?[\d./]+)(?: ≈ (-?[\d.]+))?, and b = ȳ - m·x̄ = (-?[\d./]+)(?: ≈ (-?[\d.]+))?\.$/.exec(t))) claim(agree(num(m[1]), slope) && (!m[2] || close(m[2], slope)) && agree(num(m[3]), intercept) && (!m[4] || close(m[4], intercept)), `: m = ${slope}, b = ${intercept}`, t);
      if ((m = /^The regression line is y = (-?[\d.]+)x ([+-]) ([\d.]+)\.$/.exec(t))) claim(close(m[1], slope) && close(`${m[2] === '-' ? '-' : ''}${m[3]}`, intercept), `: y = ${slope}x + ${intercept}`, t);
      if ((m = /^Set the slope stepper as close to (-?[\d.]+) and the intercept stepper as close to (-?[\d.]+)/.exec(t))) claim(close(m[1], slope) && close(m[2], intercept), `: m = ${slope}, b = ${intercept}`, t);
    }
    // Lines: every equation in x and y a step states is the answer's line, and every point it names is on it.
    if (lineOfAnswer) {
      for (const pair of statedPairs(t).filter((candidate) => candidate.op === '=')) {
        const e = evaluator(`(${pair.left}) - (${pair.right})`);
        if (!e || e.letters.slice().sort().join('') !== 'xy') continue;
        if (parallelGiven && [-2, 0, 3].every((x) => agree(e.at({ x, y: 0 }), at(parallelGiven, { x, y: 0 })))) continue;
        claim([-2, 0, 3].every((x) => agree(e.at({ x, y: lineOfAnswer(x) }), 0)), `: ${pair.left} = ${pair.right} is not the answer's line`, t);
      }
      if (!/parallel to|Plot the given point/.test(t) || !parallelGiven) {
        for (const [x, y] of pairsIn(t.replace(/parallel to.*$/, ''))) claim(agree(lineOfAnswer(x), y), `: (${x}, ${y}) is not on the answer's line`, t);
      }
      for (const [, letter, value] of t.matchAll(/(?:so|:) ([mb]) = (-?[\d./]+)(?=[.,;]|$| and)/g)) claim(agree(letter === 'm' ? lineOfAnswer(1) - lineOfAnswer(0) : lineOfAnswer(0), num(value)), `: ${letter} is not the answer line's`, t);
      if ((m = /(?:: |, )m = (-?[\d./]+) and b = (-?[\d./]+)\.$/.exec(t))) claim(agree(lineOfAnswer(1) - lineOfAnswer(0), num(m[1])) && agree(lineOfAnswer(0), num(m[2])), ': not the answer line\'s m and b', t);
    }
    if ((m = /the same rate, (-?[\d./]+), so y changes at a constant rate of (-?[\d./]+) per unit of x/.exec(t))) {
      const said = /Constant rate of change: (-?[\d./]+)/.exec(plain(example.answer))?.[1];
      claim(said && num(m[1]) === num(said) && num(m[2]) === num(said), `: the answer's rate is ${said}`, t);
    }
    // Transformations: the images a step names are the answer's, in order.
    if ((m = /^The (first|second|third|fourth|fifth) point (\(.+?\)): .*so its image is (\(.+?\))\.$/.exec(t))) {
      const order = ['first', 'second', 'third', 'fourth', 'fifth'].indexOf(m[1]);
      claim(JSON.stringify(pairsIn(m[3])[0]) === JSON.stringify(pairsIn(example.answer)[order]) && JSON.stringify(pairsIn(m[2])[0]) === JSON.stringify(pairsIn(p.split('in that order')[0])[order]), `: the answer's image ${order + 1} is (${pairsIn(example.answer)[order]})`, t);
    }
    if ((m = /^So (\(.+?\)) lands at (\(.+?\))\./.exec(t))) claim(JSON.stringify(pairsIn(m[2])[0]) === JSON.stringify(pairsIn(example.answer)[0]) && JSON.stringify(pairsIn(m[1])[0]) === JSON.stringify(pairsIn(p)[0]), ': not the answer\'s image', t);
    if ((m = /^So the (?:graph|target) is (y = .+)\.$/.exec(t))) {
      const scope = Object.fromEntries(Object.entries(answerValues(example.answer)).map(([letter, [value]]) => [letter, value]));
      const form = /(y = [^.]*?a[^.]*?)(?: lands on it)?\.$/.exec(p)?.[1].slice(4);
      const wrong = form ? sameEverywhere(form, m[1].slice(4), ['x'], scope) : 'no form';
      claim(!wrong, `: ${wrong}`, t);
    }
    if ((m = /(?:Here the vertex is at|Here they are x = (-?\d+) and y = (-?\d+)|has its inflection point at)[^,]*?(?:\((-?\d+), (-?\d+)\))?, so h = (-?\d+) and k = (-?\d+)\./.exec(t))) {
      const values = answerValues(example.answer);
      const [hx, ky] = m[1] !== undefined ? [m[1], m[2]] : [m[3], m[4]];
      claim(hx === m[5] && ky === m[6] && values.h?.[0] === Number(m[5]) && values.k?.[0] === Number(m[6]), `: the answer is "${example.answer}"`, t);
    }
    // Function features in words.
    if (f) {
      if ((m = /meets the y-axis at \((-?[\d./]+), (-?[\d./]+)\)/.exec(t)) || (m = /the output at x = 0 is (-?[\d./]+), the point \((-?[\d./]+), (-?[\d./]+)\)/.exec(t))) {
        const [x, y] = m.length === 3 ? [num(m[1]), num(m[2])] : [num(m[2]), num(m[3])];
        claim(x === 0 && agree(f(0), y) && (m.length === 3 || agree(num(m[1]), y)), `: f(0) = ${f(0)}`, t);
      }
      if ((m = /with base (-?[\d./]+) and a = (-?[\d./]+) it (rises|falls) from left to right/.exec(t))) {
        const k = /asymptote y = (-?[\d./]+)/.exec(t) ? num(/asymptote y = (-?[\d./]+)/.exec(t)[1]) : 0;
        claim(agree(f(0) - k, num(m[2])) && agree((f(1) - k) / (f(0) - k), num(m[1])) && (m[3] === 'rises') === (f(1) > f(0)), `: a = ${f(0) - k}, base ${(f(1) - k) / (f(0) - k)}`, t);
      }
    }
    if (p.startsWith('For the relation {')) {
      const pairs = pairsIn(p.split('}')[0]);
      if ((m = /^Read each pair as input first, output second: (.+)\.$/.exec(t))) claim(JSON.stringify([...m[1].matchAll(/(-?\d+) → (-?\d+)/g)].map((arrow) => [Number(arrow[1]), Number(arrow[2])])) === JSON.stringify(pairs), ': not the relation\'s pairs', t);
      if ((m = /the input (-?\d+) is paired with two different outputs/.exec(t))) claim(new Set(pairs.filter(([x]) => x === Number(m[1])).map(([, y]) => y)).size > 1, `: ${m[1]} has one output`, t);
    }
    if ((m = /^Domain: the whole numbers from zero up to (\d+)\.$|^Domain: every time from zero up to (\d+), both ends included\.$/.exec(t))) claim((m[1] || m[2]) === /(?:at most|up to) (\d+)/.exec(p)?.[1], ': not the situation\'s limit', t);
    // The Factor Theorem worked out: P(r) term by term, their sum, and the factor's name.
    if ((m = /^Is \(x ([+-]) (\d+)\) a factor of P\(x\) = (.+?)\? Evaluate P\((-?\d+)\)/.exec(p))) {
      const r = Number(m[4]);
      const value = at(m[3], { x: r });
      let w;
      if ((w = /^Substitute x = (-?\d+): P\((-?\d+)\) = (.+)\.$/.exec(t))) claim(Number(w[1]) === r && Number(w[2]) === r && agree(at(w[3]), value), `: P(${r}) = ${value}`, t);
      if ((w = /^Work out each term: (.+)\.$/.exec(t))) claim(agree(at(w[1]), value), `: P(${r}) = ${value}`, t);
      if ((w = /^These add to (-?\d+), which is (not )?zero, so by the Factor Theorem \(x ([+-]) (\d+)\) is (not )?a factor of P\(x\)\.$/.exec(t))) claim(agree(num(w[1]), value) && Boolean(w[2]) === (value !== 0) && Boolean(w[5]) === (value !== 0) && w[3] === m[1] && w[4] === m[2], `: P(${r}) = ${value}`, t);
    }
    // Long division: each term brought down is the dividend's next one.
    if ((m = /^Divide (.+?) by (.+?)\. Give/.exec(p))) {
      const dividend = m[1];
      const coefficient = (power) => {
        // A cubic's coefficients from its values at −1, 0, 1 and 2 (finite differences).
        const values = [-1, 0, 1, 2].map((x) => at(dividend, { x }));
        const c3 = (values[3] - 3 * values[2] + 3 * values[1] - values[0]) / 6;
        const c0 = values[1];
        const c2 = (values[2] + values[0] - 2 * values[1]) / 2;
        const c1 = values[2] - c3 - c2 - c0;
        return [c0, c1, c2, c3][power];
      };
      for (const [, term] of t.matchAll(/Bring down (-?\d*x?)\./g)) {
        const power = term.includes('x') ? 1 : 0;
        claim(agree(at(term, { x: 1 }), coefficient(power)), `: the dividend's ${power ? 'x' : 'number'} term is ${coefficient(power)}`, t);
      }
      if ((w = /^Divide the leading terms: (.+?) ÷ x = (.+)\.$/.exec(t))) claim(agree(at(w[1], { x: 1 }), coefficient(3)), ': not the dividend\'s leading term', t);
    }
    // Number lines: the number a reason names is the dot's, and what the notation step writes is the answer.
    if ((m = /^(Closed|Open) dot at (-?\d+), because (≤|≥|<|>) (includes|leaves out) (-?\d+); shade to the (left|right)\.$/.exec(t))) claim(m[5] === m[2] && (m[1] === 'Closed') === (m[4] === 'includes') && (m[4] === 'includes') === /[≤≥]/.test(m[3]), ': not the same number', t);
    if ((m = /^(?:In interval notation|Write each piece from left to right and join them with ∪): (.+)\.$/.exec(t))) claim(m[1] === plain(example.answer), `: the answer is "${example.answer}"`, t);
    if ((m = /^(.+?) joins two conditions with "or"/.exec(t))) claim(p.includes(`Graph ${m[1]} on the number line`), ': not the prompt\'s condition', t);
    // Finding an inverse: before the swap every equation is y = f(x), after it x = f(y) (for E(s), x = E(s)).
    if (/^(Find the inverse of [a-zA-Z]\(x\) = |Let [A-Z]\([a-z]\) = .+ Find the inverse rule|Let f\(x\) = .+ Find f\(-?\d+\), then use f⁻¹)/.test(p) && f) {
      const v = defined[fName].variable;
      const swappedNow = /swap x and y/.test(t);
      for (const pair of statedPairs(t).filter((candidate) => candidate.op === '=')) {
        const e = evaluator(`(${pair.left}) - (${pair.right})`, { functions: [fName, `${fName}⁻¹`] });
        if (!e || e.calls.length) continue;
        const letters = e.letters.slice().sort().join('');
        let scopeAt = null;
        if (v === 'x' && letters === 'xy') scopeAt = (z) => ((swapped || (swappedNow && pair.left.trim() === 'x')) ? { y: z, x: f(z) } : { x: z, y: f(z) });
        if (v !== 'x' && letters === [v, 'x'].sort().join('')) scopeAt = (z) => ({ [v]: z, x: f(z) });
        if (!scopeAt) continue;
        claim([-2, 0.5, 3].every((z) => agree(e.at(scopeAt(z)), 0)), `: ${pair.left} = ${pair.right} is not ${swapped || swappedNow ? 'x = f(y)' : 'y = f(x)'}`, t);
      }
      if (swappedNow) swapped = true;
    }
    if ((m = /^f\((-?\d+)\) = (-?\d+) means f takes the input (-?\d+) to the output (-?\d+)\.$/.exec(t))) claim(m[1] === m[3] && m[2] === m[4], ': not the same values', t);
    if ((m = /^f⁻¹ runs f backwards: it takes (-?\d+) back to (-?\d+)\.$|^So the input of f⁻¹ is (-?\d+) and its output is (-?\d+)\.$/.exec(t))) {
      const given = /f\((-?\d+)\) = (-?\d+)/.exec(p);
      claim(given && (m[1] ?? m[3]) === given[2] && (m[2] ?? m[4]) === given[1], ': not the given values exchanged', t);
    }
    if ((m = /^So f⁻¹\((-?\d+)\) = (-?\d+): f⁻¹ gives back the input (-?\d+)\.$/.exec(t))) claim(m[2] === m[3] && m[3] === /Find f\((-?\d+)\)/.exec(p)?.[1], ': not the input', t);
    if ((m = /^So (\(.+?\)) on f gives (\(.+?\)) on f⁻¹\.$/.exec(t))) { const [[a, b], [c, d]] = pairsIn(`${m[1]} ${m[2]}`); claim(a === d && b === c, ': not exchanged', t); }
    if ((m = /halfway between them is \((-?\d+(?:\.\d+)?), (-?\d+(?:\.\d+)?)\), a point of y = x/.exec(t))) { const [[a, b]] = pairsIn(p); claim(agree(num(m[1]), (a + b) / 2) && agree(num(m[2]), (a + b) / 2), ': not the midpoint', t); }
    if ((m = /^Its inputs (.+?) (repeat|do not repeat|are all different)/.exec(t))) {
      const outputs = pairsIn(p).map(([, y]) => y);
      const listed = (m[1].match(/-?\d+/g) || []).map(Number);
      claim(JSON.stringify(listed) === JSON.stringify(outputs) && (m[2] === 'repeat') === (new Set(outputs).size < outputs.length), ': not the relation\'s outputs', t);
    }
    // The area model's sum: "so the product is …" is the product.
    if ((m = /so the product is (.+)\.$/.exec(t)) && /^Use an area model to multiply (.+)\.$/.test(p)) {
      const wrong = sameEverywhere(/^Use an area model to multiply (.+)\.$/.exec(p)[1], m[1]);
      claim(!wrong, `: ${wrong}`, t);
    }
    // Systems: where the lines cross is the answer.
    if ((m = /the lines cross at a single point: (\(.+?\))\.$/.exec(t))) claim(JSON.stringify(pairsIn(m[1])[0]) === JSON.stringify(pairsIn(example.answer)[0]), `: the answer is ${example.answer}`, t);
    // A plane test: the relation with the point put in is the inequality's.
    if ((m = /^Test \((-?\d+), (-?\d+)\) in (y [<>≤≥] .+?): (-?[\d.]+) ([<>≤≥]) (.+?) is (true|false)\.$/.exec(t))) {
      const [x, y] = [Number(m[1]), Number(m[2])];
      const right = m[3].split(/ [<>≤≥] /)[1];
      claim(agree(num(m[4]), y) && agree(at(m[6]), at(right, { x })), `: not ${m[3]} at (${x}, ${y})`, t);
    }
    if ((m = /^(?:The inequality|Inequality \d), (.+?): solve for y(?:, turning the sign around when dividing by a negative)?\. It is (.+)\.$/.exec(t))) {
      const holds = (inequality, x, y) => { const [l, op, r] = inequality.split(/ (<|>|≤|≥) /); return relationHolds(op, at(l, { x, y }), at(r, { x, y })); };
      claim([[0, 0], [1, 5], [-2, -7], [3, -1], [-1, 4]].every(([x, y]) => holds(m[1], x, y) === holds(m[2], x, y)), `: ${m[1]} and ${m[2]} are not the same inequality`, t);
    }
    // Factor pairs written out: "1 and −12 add to −11; … The pair 3 and −4 adds to −1".
    for (const [, x, y, sum] of t.matchAll(/(-?\d+) and (-?\d+) adds? to (-?\d+)/g)) claim(Number(x) + Number(y) === Number(sum), `: ${x} + ${y} = ${Number(x) + Number(y)}`, t);
    if ((m = /^The factor pairs of (-?\d+): (.+?)\. The pair/.exec(t))) for (const [, x, y] of m[2].matchAll(/(-?\d+) and (-?\d+) add/g)) claim(Number(x) * Number(y) === Number(m[1]), `: ${x} × ${y} is not ${m[1]}`, t);
    // Perpendicular slopes in words: "flip −4/3 to get −3/4, then change its sign …: 3/4".
    if ((m = /flip (-?\d+(?:\/\d+)?) to get (-?\d+(?:\/\d+)?), then change its sign.*: (-?\d+(?:\/\d+)?)\.$/.exec(t))) claim(agree(num(m[2]), 1 / num(m[1])) && agree(num(m[3]), -num(m[2])), ': not the reciprocal, then its opposite', t);
    if ((m = /^Check: \((-?\d+(?:\/\d+)?)\)\((-?\d+(?:\/\d+)?)\) multiplies out to (-?\d+)/.exec(t))) claim(agree(num(m[1]) * num(m[2]), num(m[3])), `: the product is ${num(m[1]) * num(m[2])}`, t);
    if ((m = /^The slope of line [a-z] is the change in y over the change in x between its two points: \((-?\d+) - \((-?\d+)\)\) \/ \((-?\d+) - (-?\d+)\) = (-?\d+)\/(\d+) = (-?\d+(?:\/\d+)?)\.$/.exec(t))) {
      const [[x1, y1], [x2, y2]] = pairsIn(p.split('. Find')[0]);
      claim(Number(m[1]) === y2 && Number(m[2]) === y1 && Number(m[3]) === x2 && Number(m[4]) === x1 && agree(num(m[7]), (y2 - y1) / (x2 - x1)), ': not the points\' slope', t);
    }
    for (const [, from, to] of t.matchAll(/a slope of (-?\d+(?:\/\d+)?)(?: \(that is, -?\d+\/\d+\))? into (-?\d+(?:\/\d+)?)/g)) claim(agree(num(to), -1 / num(from)), `: not the negative reciprocal of ${from}`, t);
    if ((m = /Through \((-?\d+), (-?\d+)\) (?:that height is|that is) (-?\d+): the line is ([xy]) = (-?\d+)\.$/.exec(t))) claim(m[3] === m[5] && m[5] === (m[4] === 'y' ? m[2] : m[1]), ': not the point\'s coordinate', t);
    if ((m = /so the perpendicular line is (vertical|horizontal)\. Through \((-?\d+), (-?\d+)\) it is ([xy]) = (-?\d+)\.$/.exec(t))) claim((m[1] === 'vertical') === (m[4] === 'x') && m[5] === (m[4] === 'x' ? m[2] : m[3]), ': not the point\'s line', t);
    if ((m = /^The perpendicular line through \((-?\d+), (-?\d+)\): .*The line is (y = .+)\.$/.exec(t))) claim(agree(at(m[3].slice(4), { x: Number(m[1]) }), Number(m[2])) && JSON.stringify(m[3]) === JSON.stringify(partNamed(plain(example.answer), 'perpendicular line')), ': not through the point, or not the answer\'s line', t);
    // A plane test point: the same point tested and shaded from.
    if ((m = /^\((-?\d+), (-?\d+)\) makes it (?:true|false), so shade the side (?:with|without) \((-?\d+), (-?\d+)\)/.exec(t))) claim(m[1] === m[3] && m[2] === m[4], ': two different points', t);
  }
  return out;
};

// ------------------------------------------- 1. the start agrees with the answer

const at = (expression, scope = {}, functions = []) => {
  const e = evaluator(expression, { functions });
  return e ? e.at(scope) : Number.NaN;
};
const sameEverywhere = (left, right, letters = ['x'], extra = {}) => {
  const L = evaluator(left);
  const R = evaluator(right);
  if (!L || !R) return `cannot read ${left} = ${right}`;
  for (let point = 0; point < 5; point += 1) {
    const scope = { ...Object.fromEntries(letters.map((letter) => [letter, draw()])), ...extra };
    const a = L.at(scope);
    const b = R.at(scope);
    if (!agree(a, b)) return `${left} = ${right} is false at ${JSON.stringify(scope)}: ${a} against ${b}`;
  }
  return null;
};
/** "a < x ≤ b", "x ≥ 3", "x ≤ 0 or 4 ≤ x < 5" as a test of x. */
const conditionOf = (text, letter = 'x', tolerance = 1e-9) => {
  const branches = text.split(/\s+or\s+/).map((branch) => {
    const parts = branch.trim().split(/\s*(<|>|≤|≥)\s*/);
    if (parts.length < 3) return null;
    const pieces = [];
    for (let index = 0; index < parts.length; index += 2) pieces.push(parts[index]);
    const ops = [];
    for (let index = 1; index < parts.length; index += 2) ops.push(parts[index]);
    return (value) => ops.every((op, index) => relationHolds(op, at(pieces[index], { [letter]: value }), at(pieces[index + 1], { [letter]: value }), tolerance));
  });
  return branches.every(Boolean) ? (value) => branches.some((branch) => branch(value)) : null;
};
/** "(-∞, 3] ∪ (5, ∞)", "[-9, 7)" as a test of x. */
const intervalsOf = (text) => {
  const parts = text.split('∪').map((part) => /^\s*([[(])\s*(-?∞|-?[\d./]+)\s*,\s*(-?∞|-?[\d./]+)\s*([\])])\s*$/.exec(part));
  if (!parts.length || parts.some((part) => !part)) return null;
  const end = (value) => (value === '-∞' ? -Infinity : value === '∞' ? Infinity : num(value));
  const tests = parts.map(([, open, low, high, close]) => {
    const a = end(low);
    const b = end(high);
    return (x) => (open === '[' ? x >= a - 1e-12 : x > a + 1e-12) && (close === ']' ? x <= b + 1e-12 : x < b - 1e-12);
  });
  return (x) => tests.some((t) => t(x));
};
const GRID = Array.from({ length: 1201 }, (_, index) => -30 + index / 20);
const membershipDiffers = (a, b, points = GRID) => points.find((x) => a(x) !== b(x));
const answerParts = (answer) => plain(answer).split(/;\s*/);
const partNamed = (answer, name) => answerParts(answer).find((part) => part.startsWith(`${name} `))?.slice(name.length + 1);

/** The features of a function the answer states, from the function itself, sampled. */
const featureProblems = (f, domain, answer) => {
  const out = [];
  const xs = (domain ? GRID.filter((x) => x >= domain[0] - 1e-12 && x <= domain[1] + 1e-12) : GRID).filter((x) => Number.isFinite(f(x)));
  if (domain) xs.push(domain[0], domain[1]);
  const values = xs.map(f);
  const within = (part, test) => {
    if (!part) return;
    if (part === 'never') { if (xs.some((x) => test(x))) out.push(`"never" but it holds at x = ${xs.find((x) => test(x))}`); return; }
    const inside = intervalsOf(part);
    if (!inside) return;
    const near = (x) => part.match(/-?[\d.]+/g).some((end) => Math.abs(x - Number(end)) < 0.06);
    const bad = xs.find((x) => !near(x) && inside(x) !== test(x));
    if (bad !== undefined) out.push(`"${part}" is wrong at x = ${bad}`);
  };
  const slope = (x) => f(x + 0.01) - f(x - 0.01);
  within(partNamed(answer, 'increasing'), (x) => slope(x) > 1e-12);
  within(partNamed(answer, 'decreasing'), (x) => slope(x) < -1e-12);
  within(partNamed(answer, 'positive'), (x) => f(x) > 1e-12);
  within(partNamed(answer, 'negative'), (x) => f(x) < -1e-12);
  const setOf = (part, letter) => intervalsOf(part) || (new RegExp(`(^|\\s)${letter}\\s*[<>≤≥]|[<>≤≥]\\s*${letter}(\\s|$)`).test(part) ? conditionOf(part.replace(new RegExp(`\\b${letter}\\b`, 'g'), 'x'), 'x', 1e-14) : null);
  const domainPart = partNamed(answer, 'domain');
  if (domainPart && domain) {
    const inside = setOf(domainPart, 'x');
    if (inside && membershipDiffers(inside, (x) => x >= domain[0] && x <= domain[1])) out.push(`domain "${domainPart}" is not [${domain}]`);
  }
  const rangePart = partNamed(answer, 'range');
  if (rangePart) {
    const inside = setOf(rangePart, 'y');
    if (inside) {
      // Every value is in the range, a closed end is reached, an open end is never reached but is
      // approached: far out (an asymptote) or at an end of the domain the graph leaves out.
      const far = [-1e6, -1e3, 1e3, 1e6].map(f).filter(Number.isFinite);
      const outside = values.find((v) => !inside(v));
      if (outside !== undefined) out.push(`range "${rangePart}" leaves out the value ${outside}`);
      // Each end with whether it is closed: "[a", "b)", "y ≤ b", "a < y" (read apart, so "a ≤ y ≤ b" gives both).
      const ends = [
        ...[...rangePart.matchAll(/([[(])\s*(-?[\d./]+)/g)].map((m) => [m[2], m[1] === '[']),
        ...[...rangePart.matchAll(/(-?[\d./]+)\s*([\])])/g)].map((m) => [m[1], m[2] === ']']),
        ...[...rangePart.matchAll(/y\s*(<|>|≤|≥)\s*(-?[\d./]+)/g)].map((m) => [m[2], /[≤≥]/.test(m[1])]),
        ...[...rangePart.matchAll(/(-?[\d./]+)\s*(<|>|≤|≥)\s*y/g)].map((m) => [m[1], /[≤≥]/.test(m[2])]),
      ];
      for (const [end, closed] of ends) {
        const value = num(end);
        const nearest = Math.min(...values.map((v) => Math.abs(v - value)), ...far.map((v) => Math.abs(v - value)));
        if (closed && !values.some((v) => Math.abs(v - value) < 1e-9)) out.push(`range "${rangePart}": ${value} is never reached`);
        if (!closed && values.some((v) => Math.abs(v - value) < 1e-12)) out.push(`range "${rangePart}": ${value} is reached`);
        if (!closed && nearest > 1e-2) out.push(`range "${rangePart}": nothing comes near ${value}`);
      }
    }
  }
  const zeros = /zeros \{([^}]*)\}/.exec(answer)?.[1];
  for (const [x, y] of pairsIn(partNamed(answer, 'x-intercepts')?.split('zeros')[0] || '')) {
    if (y !== 0 || !agree(f(x) + 1, 1)) out.push(`x-intercept (${x}, ${y}): f(${x}) = ${f(x)}`);
  }
  if (zeros !== undefined) {
    const listed = (zeros.match(/-?[\d./]+/g) || []).map(num);
    for (const x of listed) if (!agree(f(x) + 1, 1)) out.push(`zero ${x}: f(${x}) = ${f(x)}`);
    const crossings = xs.slice(1).filter((x, i) => Number.isFinite(f(xs[i])) && f(xs[i]) * f(x) < 0 && Math.abs(x - xs[i]) < 0.1).length + xs.filter((x) => f(x) === 0).length;
    if (crossings > listed.length) out.push(`zeros {${zeros}}: the function crosses zero more often (${crossings})`);
  }
  for (const [x, y] of pairsIn(partNamed(answer, 'y-intercept') || '')) if (x !== 0 || !agree(f(0), y)) out.push(`y-intercept (${x}, ${y}): f(0) = ${f(0)}`);
  for (const name of ['vertex', 'lowest point', 'highest point', 'local minimum', 'local maximum']) {
    for (const [x, y] of pairsIn(partNamed(answer, name) || '')) {
      if (!agree(f(x), y)) out.push(`${name} (${x}, ${y}): f(${x}) = ${f(x)}`);
      if (/minimum|lowest/.test(name) && !(f(x - 0.01) > y && f(x + 0.01) > y)) out.push(`${name} (${x}, ${y}) is not a lowest point nearby`);
      if (/maximum|highest/.test(name) && !(f(x - 0.01) < y && f(x + 0.01) < y)) out.push(`${name} (${x}, ${y}) is not a highest point nearby`);
    }
  }
  const axis = /^x = (-?[\d./]+)$/.exec(partNamed(answer, 'axis') || '');
  if (axis) for (const d of [0.5, 1, 2.5]) if (!agree(f(num(axis[1]) - d), f(num(axis[1]) + d))) out.push(`axis x = ${axis[1]}: not symmetric`);
  const asymptote = /y = (-?[\d./]+)/.exec(partNamed(answer, 'asymptote') || partNamed(answer, 'asymptotes') || '');
  if (asymptote) {
    const c = num(asymptote[1]);
    if (!(Math.abs(f(-1e6) - c) < 1e-4 || Math.abs(f(1e6) - c) < 1e-4)) out.push(`asymptote y = ${c}: f(±60) = ${f(-60)}, ${f(60)}`);
  }
  return out;
};

/**
 * The checks of a start against an answer, one per kind of prompt the
 * families write. Each returns the problems it finds; `null` where its prompt
 * does not apply.
 */
const STARTS = [
  {
    name: 'an equation solved: every answer value makes it true, every rejected candidate false',
    test: (p) => /^Solve (?!the system)[^<>≤≥]*=/.test(p),
    check: (example, p) => {
      const m = /^Solve (.+?)(?: for ([a-z]))?(?:\.(?:\s|$)| and check| Check)/.exec(p);
      const [left, right] = m[1].split(' = ');
      const values = answerValues(example.answer);
      const letter = m[2] || Object.keys(values)[0];
      if (!values[letter]) return /No real solution/.test(example.answer) ? [] : [`no value for ${letter} in "${example.answer}"`];
      const out = [];
      for (const value of values[letter]) if (!agree(at(left, { [letter]: value }), at(right, { [letter]: value }))) out.push(`${letter} = ${value} does not solve ${m[1]}`);
      for (const value of example.rejected[letter] || []) if (agree(at(left, { [letter]: value }), at(right, { [letter]: value }))) out.push(`${letter} = ${value} is rejected, but solves ${m[1]}`);
      return out;
    },
  },
  {
    name: 'a system: the answer point makes both equations true',
    test: (p) => /^(Solve the system|Graph the system(?! of inequalities)|Graph y = .+ and y = .+, and find)/.test(p),
    check: (example, p) => {
      const body = p.replace(/^(Solve the system[^:]*: |Graph the system |Graph )/, '').replace(/,? and find where.*$|\.$/, '');
      const equations = body.split(' and ').filter((part) => part.includes('='));
      // A bare pair gives the letters in the order the system first writes them: (s, a) for "−s + a = …".
      const order = [...new Set(body.match(/[a-z]/g))];
      const values = answerValues(example.answer, { pairLetters: order.includes('x') && order.includes('y') ? ['x', 'y'] : order });
      const scope = Object.fromEntries(Object.entries(values).map(([letter, [value]]) => [letter, value]));
      const letters = [...new Set(equations.join(' ').match(/[a-z]/g))];
      if (equations.length !== 2 || !letters.every((letter) => letter in scope)) return [`cannot read the system "${p}" or its answer "${example.answer}"`];
      return equations.filter((equation) => {
        const [left, right] = equation.split(' = ');
        return !agree(at(left, scope), at(right, scope));
      }).map((equation) => `${JSON.stringify(scope)} is not on ${equation}`);
    },
  },
  {
    name: 'an inequality graphed on the plane: each form solved for y is the same inequality, each boundary is dashed exactly when it is strict and goes through its two points, each shading is the side the test point says, and each point checked is a solution exactly when it says so',
    test: (p) => /^Graph the (system of )?inequalit(y|ies) /.test(p),
    check: (example, p) => {
      const given = (/^Graph the (?:system of )?inequalit(?:y|ies) (.+?): /.exec(p)?.[1] || '').split(' and ');
      const holds = (inequality, x, y) => {
        const [left, op, right] = inequality.split(/ (<|>|≤|≥) /);
        return relationHolds(op, at(left, { x, y }), at(right, { x, y }));
      };
      const out = [];
      let current = null;
      let index = 0;
      for (const step of example.steps) {
        const t = plain(step.show || step);
        const solved = /^Inequality (\d), (.+?): solve for y\. It is (.+)\.$/.exec(t);
        if (solved) {
          for (let point = 0; point < 12; point += 1) {
            const x = draw() * 3;
            const y = draw() * 3;
            if (holds(solved[2], x, y) !== holds(solved[3], x, y)) { out.push(`${solved[2]} and ${solved[3]} differ at (${x}, ${y})`); break; }
          }
        }
        const named = /^(?:Inequality (\d), |The inequality, )(y [<>≤≥] [^:]+):/.exec(t);
        if (named) { current = named[2]; index = Number(named[1] || 1); }
        const drawn = /^Draw the (dashed|solid) line through (\(.+?\)) and (\(.+?\))\.$/.exec(t);
        if (drawn && current) {
          if ((drawn[1] === 'dashed') !== /[<>]/.test(current)) out.push(`${current}: the line is ${drawn[1]}`);
          const boundary = current.replace(/[<>≤≥]/, '=');
          for (const [x, y] of pairsIn(`${drawn[2]} ${drawn[3]}`)) { const [l, r] = boundary.split(' = '); if (!agree(at(l, { x, y }), at(r, { x, y }))) out.push(`(${x}, ${y}) is not on ${boundary}`); }
        }
        const shade = /^\((-?\d+), (-?\d+)\) makes it (true|false), so shade the side (with|without) \(.+?\): (above|below) the line\.$/.exec(t);
        if (shade && current) {
          const [x, y] = [Number(shade[1]), Number(shade[2])];
          if (holds(current, x, y) !== (shade[3] === 'true')) out.push(`(${x}, ${y}) in ${current} is not ${shade[3]}`);
          if ((shade[3] === 'true') !== (shade[4] === 'with')) out.push(`"${t}"`);
          const b = at(current.split(/ [<>≤≥] /)[1], { x: 0 });
          if (holds(current, 0, b + 5) !== (shade[5] === 'above')) out.push(`${current} is not shaded ${shade[5]} the line`);
        }
        const checked = /^Check \((-?\d+), (-?\d+)\): (.+?)\. So it is (not )?a solution/.exec(t);
        if (checked) {
          const [x, y] = [Number(checked[1]), Number(checked[2])];
          const verdicts = [...checked[3].matchAll(/makes (?:inequality (\d)|the inequality) (true|false)/g)];
          for (const [, which, said] of verdicts) if (holds(given[Number(which || 1) - 1], x, y) !== (said === 'true')) out.push(`(${x}, ${y}) in ${given[Number(which || 1) - 1]} is not ${said}`);
          if (given.every((inequality) => holds(inequality, x, y)) !== !checked[4]) out.push(`(${x}, ${y}) is ${checked[4] ? 'a solution' : 'not a solution'} of ${given.join(' and ')}`);
        }
        // Each shaded region: its centre satisfies its own inequality, or both where they overlap.
        for (const region of step.board?.plane?.regions || []) {
          const [cx, cy] = region.points.reduce(([sx, sy], [x, y]) => [sx + x / region.points.length, sy + y / region.points.length], [0, 0]);
          const which = region.mark === 'overlap' ? given : [given[Number(/r(\d)/.exec(region.mark)?.[1] || index) - 1]];
          if (!which.every((inequality) => inequality && holds(inequality.includes('y') && inequality.startsWith('y ') ? inequality : inequality, cx, cy))) out.push(`region ${region.mark}: its centre (${cx}, ${cy}) is not a solution of ${which.join(' and ')}`);
        }
      }
      return [...new Set(out)];
    },
  },
  {
    name: 'an inequality solved: the answer holds exactly where the inequality does',
    test: (p) => /^Solve [^=]*[<>≤≥][^=]*\.?(, then graph.*)?$/.test(p) && !/system/.test(p),
    check: (example, p) => {
      const inequality = /^Solve (.+?)(?:, then graph.*)?\.?$/.exec(p)[1].replace(/\.$/, '');
      const letter = /[a-z]/.exec(inequality)[0];
      const given = conditionOf(inequality, letter);
      const stated = conditionOf(plain(example.answer), letter);
      if (!given || !stated) return [`cannot read ${inequality} or ${example.answer}`];
      const bad = membershipDiffers(given, stated);
      const out = bad === undefined ? [] : [`"${example.answer}" and ${inequality} differ at ${letter} = ${bad}`];
      // Each inequality a step reaches is the same inequality: the same solutions.
      for (const t of example.texts) {
        for (const pair of statedPairs(t).filter((candidate) => candidate.op !== '=')) {
          const e = evaluator(`${pair.left} - (${pair.right})`);
          if (!e || e.letters.join() !== letter) continue;
          const reached = conditionOf(`${pair.left} ${pair.op} ${pair.right}`, letter);
          const differs = reached && membershipDiffers(given, reached);
          if (differs !== undefined && differs !== null) out.push(`the step's ${pair.left} ${pair.op} ${pair.right} and ${inequality} differ at ${letter} = ${differs}`);
        }
      }
      // The number line: an open dot for < and >, a closed one for ≤ and ≥, shaded the way the answer goes.
      for (const t of example.texts.map(plain)) {
        const dot = /(Open|Closed|open|closed) dot at (-?\d+)/.exec(t);
        if (dot && /shade to the (left|right)/.test(t)) {
          const c = Number(dot[2]);
          if ((dot[1].toLowerCase() === 'closed') !== stated(c)) out.push(`"${t}": the dot at ${c} is ${dot[1]}`);
          const side = /shade to the (left|right)/.exec(t)[1];
          if (stated(side === 'left' ? c - 1 : c + 1) !== true) out.push(`"${t}": shades ${side}`);
        }
      }
      return out;
    },
  },
  {
    name: 'a graph on the number line: the interval notation holds exactly where the condition does, and each dot and shading matches it',
    test: (p) => /^Graph .+ on the number line/.test(p) && !p.startsWith('Solve'),
    check: (example, p) => {
      const condition = /^Graph (.+?) on the number line/.exec(p)[1];
      const given = conditionOf(condition);
      const stated = intervalsOf(plain(example.answer));
      if (!given || !stated) return [`cannot read ${condition} or ${example.answer}`];
      const bad = membershipDiffers(given, stated);
      const out = bad === undefined ? [] : [`"${example.answer}" and ${condition} differ at x = ${bad}`];
      for (const t of example.texts.map(plain)) {
        for (const m of t.matchAll(/(open|closed) dot at (-?\d+)/g)) if ((m[1] === 'closed') !== given(Number(m[2]))) out.push(`"${t}": the dot at ${m[2]} is ${m[1]}`);
        const one = /^x (<|>|≤|≥) (-?\d+): .*shade to the (left|right)/.exec(t);
        if (one && given(Number(one[2]) + (one[3] === 'left' ? -1 : 1)) !== true) out.push(`"${t}": shades ${one[3]}`);
      }
      return out;
    },
  },
  {
    name: 'an area model: the product the answer gives is the product of the two brackets',
    test: (p) => p.startsWith('Use an area model to multiply'),
    check: (example, p) => {
      const product = /multiply (.+)\.$/.exec(p)[1];
      const result = plain(example.answer).split(' (')[0];
      const wrong = sameEverywhere(product, result);
      // The coefficients the answer lists are the product's: x² at 1, x at 1 and 0, the number at 0.
      const listed = (/\(coefficients (.+)\)$/.exec(plain(example.answer))?.[1] || '').split(', ').map(Number);
      const c = at(result, { x: 0 });
      const a = (at(result, { x: 1 }) + at(result, { x: -1 })) / 2 - c;
      const b = (at(result, { x: 1 }) - at(result, { x: -1 })) / 2;
      const out = wrong ? [wrong] : [];
      if (listed.length !== 3 || !agree(listed[0], a) || !agree(listed[1], b) || !agree(listed[2], c)) out.push(`coefficients ${listed}, the product's are ${[a, b, c]}`);
      return out;
    },
  },
  {
    name: 'p and q: x² + bx + c is (x + p)(x + q) with the answer\'s p and q',
    test: (p) => p.startsWith('Find p and q so that'),
    check: (example, p) => {
      const trinomial = /so that (.+?) = \(x \+ p\)\(x \+ q\)/.exec(p)[1];
      const { p: [pv] = [], q: [qv] = [] } = answerValues(example.answer);
      const wrong = sameEverywhere(trinomial, '(x + p)(x + q)', ['x'], { p: pv, q: qv });
      return wrong ? [wrong] : [];
    },
  },
  {
    name: 'the Factor Theorem: P(r) is what the answer says, r is the factor\'s zero, and it is a factor exactly when P(r) = 0',
    test: (p) => /^Is \(x [+-] \d+\) a factor of P\(x\) =/.test(p),
    check: (example, p) => {
      const m = /^Is \(x ([+-]) (\d+)\) a factor of P\(x\) = (.+?)\? Evaluate P\((-?\d+)\)/.exec(p);
      const zero = m[1] === '+' ? -Number(m[2]) : Number(m[2]);
      const stated = /P\((-?\d+)\) = (-?\d+)/.exec(plain(example.answer)) || (/P\((-?\d+)\) is zero/.exec(plain(example.answer)) ? [null, null, '0'] : null);
      const out = [];
      if (Number(m[4]) !== zero) out.push(`evaluates P(${m[4]}), but the zero of (x ${m[1]} ${m[2]}) is ${zero}`);
      const value = at(m[3], { x: zero });
      if (!stated || !agree(value, Number(stated[2]))) out.push(`P(${zero}) = ${value}, the answer says "${example.answer}"`);
      if (/is not a factor/.test(example.answer) === (value === 0)) out.push(`P(${zero}) = ${value}, the answer says "${example.answer}"`);
      if (!plain(example.answer).includes(`(x ${m[1]} ${m[2]})`)) out.push(`the answer names another factor: "${example.answer}"`);
      return out;
    },
  },
  {
    name: 'a long division: the dividend is the quotient times the divisor plus the remainder',
    test: (p) => /^Divide .+ by .+\. Give the quotient and the remainder/.test(p),
    check: (example, p) => {
      const m = /^Divide (.+?) by (.+?)\. Give/.exec(p);
      const a = /quotient (.+?), remainder (.+)$/.exec(plain(example.answer));
      if (!a) return [`cannot read "${example.answer}"`];
      const wrong = sameEverywhere(m[1], `(${a[1]})(${m[2]}) + (${a[2]})`);
      return wrong ? [wrong] : [];
    },
  },
  {
    name: 'a line from points, a table, a graph or a standard form: every point the prompt gives and every point the answer names is on the answer\'s line, with the slope and intercepts it states',
    test: (p) => /^(Write the equation y = mx \+ b for the table|You are given (two points|the standard form)|Graph (?!.*number line)(?!the inequality)(?!the system)[^,]*\.?$|Graph y = [^,]+\. Start at the y-intercept, then use the slope\.$|Graph the line through|Find the x-intercept and the y-intercept|Decide whether y changes)/.test(p),
    check: (example, p) => {
      const answer = plain(example.answer);
      const out = [];
      // The line itself: the answer's equation, or the prompt's when the answer names only points.
      const equationOf = (text) => (text.match(/(?:^|; |The line )(-?\d*x? ?[+-]? ?\d*y? ?= ?[^;,]+?)(?=;|,|$| through)/g) || [])
        .map((e) => e.replace(/^(; |The line )/, '').trim()).filter((e) => /[xy]/.test(e) && e.includes('='));
      let lines = equationOf(answer).filter((e) => !/^(slope|y-intercept|x-intercept)/.test(e));
      const promptEquation = /(?:Graph|standard form equation|y-intercept of) (-?\d*x[^.]*?= -?\d+|y = [^.]+|x = -?\d+)\.?(?: Find| Start|$|\. Write)/.exec(p)?.[1];
      if (promptEquation) lines.push(promptEquation);
      if (p.startsWith('Decide whether')) {
        const points = pairsIn(p.split('table')[1]);
        const rate = (points[1][1] - points[0][1]) / (points[1][0] - points[0][0]);
        const constant = points.every(([x, y]) => agree(y, points[0][1] + rate * (x - points[0][0])));
        const said = /Constant rate of change: (-?[\d./]+)/.exec(answer);
        if (constant !== Boolean(said) || (said && !agree(num(said[1]), rate))) out.push(`the table's rate is ${constant ? rate : 'not constant'}, the answer says "${answer}"`);
        return out;
      }
      const parallelTo = /^Graph the line through (\(.+?\)) that is parallel to (y = .+)\.$/.exec(p);
      if (parallelTo) {
        const [given] = pairsIn(parallelTo[1]);
        const [a, b] = pairsIn(answer);
        const r = parallelTo[2].split(' = ')[1];
        const m = at(r, { x: 1 }) - at(r, { x: 0 });
        if (!a || !b || JSON.stringify(a) !== JSON.stringify(given) || !agree((b[1] - a[1]) / (b[0] - a[0]), m)) out.push(`"${answer}" is not the line through (${given}) with the slope ${m} of ${parallelTo[2]}`);
        return out;
      }
      lines = [...new Set(lines)];
      if (!lines.length && !/with slope/.test(p)) return [`no line to check in "${answer}"`];
      const onLine = (line, [x, y]) => { const [l, r] = line.split('='); return agree(at(l, { x, y }), at(r, { x, y })); };
      const points = [...pairsIn(/parallel to/.test(p) ? p.split('parallel')[0] : p.replace(/^You are given the situation.*/, '')), ...pairsIn(answer)];
      for (const line of lines) for (const point of points) if (!onLine(line, point)) out.push(`(${point}) is not on ${line}`);
      // Two different answer lines are one line: the same points on both.
      const slopeOf = (line) => { const [l, r] = line.split('='); const f = (x, y) => at(l, { x, y }) - at(r, { x, y }); const dy = f(0, 1) - f(0, 0); const dx = f(1, 0) - f(0, 0); return dy === 0 ? Infinity : -dx / dy; };
      const slope = /slope (-?[\d./]+)/.exec(answer);
      if (slope) for (const line of lines) if (!agree(slopeOf(line), num(slope[1]))) out.push(`slope ${slope[1]}, but ${line} has slope ${slopeOf(line)}`);
      const parallel = /parallel to (y = [^.]+)\./.exec(p);
      if (parallel) for (const line of lines.filter((l) => l !== parallel[1])) if (!agree(slopeOf(line), slopeOf(parallel[1]))) out.push(`${line} is not parallel to ${parallel[1]}`);
      const through = /slope (-?\d+)\/(\d+)\.$/.exec(p);
      if (through) {
        const [a, b] = pairsIn(answer);
        if (!a || !b || !agree((b[1] - a[1]) / (b[0] - a[0]), Number(through[1]) / Number(through[2]))) out.push(`the points of "${answer}" do not have slope ${through[1]}/${through[2]}`);
      }
      return out;
    },
  },
  {
    name: 'a pool, a tank or a balance: the line\'s slope, intercepts and equation agree with the situation',
    test: (p) => p.startsWith('You are given the situation'),
    check: (example, p) => {
      const answer = plain(example.answer);
      const slope = num(/slope (-?[\d./]+)/.exec(answer)?.[1]);
      const [[, b] = []] = pairsIn(partNamed(answer, 'y-intercept') || '');
      const [[xi] = []] = pairsIn(partNamed(answer, 'x-intercept') || '');
      const out = [];
      const numbers = (p.match(/\d+(?:\.\d+)?/g) || []).map(Number);
      if (!numbers.includes(Math.abs(b))) out.push(`y-intercept ${b} is not a number of the situation`);
      if (!numbers.includes(Math.abs(slope))) out.push(`slope ${slope} is not a number of the situation`);
      if (!agree(slope * xi + b, 0)) out.push(`x-intercept ${xi} is not where y = ${slope}x + ${b} is zero`);
      const equations = answerParts(answer).filter((part) => /=/.test(part));
      for (const equation of equations) {
        const [l, r] = equation.split('=');
        for (const [x, y] of [[0, b], [xi, 0]]) if (!agree(at(l, { x, y }), at(r, { x, y }))) out.push(`${equation} does not go through (${x}, ${y})`);
      }
      return out;
    },
  },
  {
    name: 'a line fitted to data: the least-squares line of the data, and the prediction on it',
    test: (p) => p.startsWith('Fit a line by hand to the data'),
    check: (example, p) => {
      const points = pairsIn(p.split(' and predict')[0]);
      const mx = points.reduce((s, [x]) => s + x, 0) / points.length;
      const my = points.reduce((s, [, y]) => s + y, 0) / points.length;
      const m = points.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0) / points.reduce((s, [x]) => s + (x - mx) ** 2, 0);
      const b = my - m * mx;
      const answer = plain(example.answer);
      const line = /^y = (.+?) \(/.exec(answer)?.[1];
      const predicted = /y ≈ (-?[\d.]+) at x = (-?[\d.]+)/.exec(answer);
      const out = [];
      for (const x of [0, 1, 2]) if (!line || Math.abs(at(line, { x }) - (m * x + b)) > 0.05) out.push(`y = ${line} is not the least-squares line y = ${m}x + ${b}`);
      if (!predicted || Math.abs(Number(predicted[1]) - (m * Number(predicted[2]) + b)) > 0.05) out.push(`the prediction "${predicted?.[0]}" is not on y = ${m}x + ${b}`);
      return [...new Set(out)];
    },
  },
  {
    name: 'points moved by y = a·f(b(x − h)) + k: each image, put back in, lands on its own source point',
    test: (p) => p.startsWith('The graph of y = f(x) runs through'),
    check: (example, p) => {
      const m = /runs through (.+), in that order\. Draw (y = .+?) by transforming/.exec(p);
      const sources = pairsIn(m[1]);
      const images = pairsIn(example.answer);
      if (images.length !== sources.length) return [`${sources.length} points, ${images.length} images`];
      const rule = m[2].replace(/^y = /, '');
      // f is only known at its source points, so an image whose x is wrong reaches none of them.
      return images.flatMap(([x, y], index) => {
        const reached = [];
        const f = (value) => { const hit = sources.findIndex(([sx]) => agree(sx + 1000, value + 1000)); reached.push(hit); return hit < 0 ? Number.NaN : sources[hit][1]; };
        const value = at(rule, { x, fn_f: f }, ['f']);
        return reached[0] === index && agree(value, y) ? [] : [`image ${index + 1} (${x}, ${y}) of (${sources[index]}) under ${m[2]}: the rule gives ${value}`];
      });
    },
  },
  {
    name: 'a parent point mapped: the image is on the graph, and x − h is the parent point\'s x',
    test: (p) => p.startsWith('Map the parent-function point'),
    check: (example, p) => {
      const m = /point \((-?\d+), (-?\d+)\) through y = (.+)\.$/.exec(p);
      const [[x, y] = []] = pairsIn(example.answer);
      const out = [];
      if (!agree(at(m[3], { x }), y)) out.push(`(${x}, ${y}) is not on y = ${m[3]}`);
      const inner = /(?:\||\(|√\(|∛\()x ([+-]) (\d+)/.exec(m[3]);
      const h = inner ? (inner[1] === '-' ? Number(inner[2]) : -Number(inner[2])) : 0;
      if (!agree(x - h, Number(m[1]))) out.push(`x - h = ${x - h}, the parent point's x is ${m[1]}`);
      return out;
    },
  },
  {
    name: 'a transformed graph fitted: with the answer\'s a, h and k, the form goes through every point the prompt gives',
    test: (p) => /^(A transformed|The dashed target is a transformed) .+ (Find a, h and k|lands on it)/.test(p),
    check: (example, p) => {
      const form = /(y = [^.]*?a[^.]*?)(?: lands on it)?\.$/.exec(p)?.[1].replace(/^y = /, '');
      const values = answerValues(example.answer);
      const scope = Object.fromEntries(Object.entries(values).map(([letter, [value]]) => [letter, value]));
      if (!form || !('a' in scope)) return [`cannot read the form of "${p}" or "${example.answer}"`];
      const out = pairsIn(p).filter(([x, y]) => !agree(at(form, { ...scope, x }), y)).map(([x, y]) => `(${x}, ${y}) is not on y = ${form} with ${JSON.stringify(scope)}`);
      const asymptotes = /asymptotes x = (-?\d+) and y = (-?\d+)/.exec(p);
      if (asymptotes && (scope.h !== Number(asymptotes[1]) || scope.k !== Number(asymptotes[2]))) out.push(`h, k = ${scope.h}, ${scope.k}; the asymptotes are x = ${asymptotes[1]}, y = ${asymptotes[2]}`);
      return out;
    },
  },
  {
    name: 'a translation described: the words match f(x − h) + k',
    test: (p) => /^Describe the horizontal and vertical translations of g\(x\) = f\(x [+-] \d+\) [+-] \d+/.test(p),
    check: (example, p) => {
      const m = /f\(x ([+-]) (\d+)\) ([+-]) (\d+)/.exec(p);
      const units = (n) => `${n} unit${n === '1' ? '' : 's'}`;
      const want = `Horizontal: ${units(m[2])} to the ${m[1] === '+' ? 'left' : 'right'}; vertical: ${units(m[4])} ${m[3] === '+' ? 'up' : 'down'}`;
      return plain(example.answer) === want ? [] : [`"${example.answer}", not "${want}"`];
    },
  },
  {
    name: 'a function\'s graph, table or rule: every feature the answer states, from the function sampled',
    test: (p) => /^(The graph of f\(x\) = |Use the graph of f\(x\) = |For g\(x\) = |Complete the table for g\(x\) = )/.test(p),
    check: (example, p) => {
      const defined = functionsDefined(example.prompt);
      const name = Object.keys(defined)[0];
      const e = evaluator(defined[name].body);
      if (!e) return [`cannot read ${name}(x) = ${defined[name].body}`];
      const f = (x) => e.at({ x });
      const range = /for (-?\d+) ≤ x ≤ (-?\d+)/.exec(p);
      const answer = plain(example.answer);
      if (p.startsWith('Complete the table')) {
        const inputs = (/x ∈ \{([^}]*)\}/.exec(p)[1].match(/-?\d+/g) || []).map(Number);
        const out = pairsIn(partNamed(answer, 'table')).filter(([x, y]) => !agree(f(x), y)).map(([x, y]) => `(${x}, ${y}): g(${x}) = ${f(x)}`);
        const outputs = [...new Set(inputs.map(f))].sort((a, b) => a - b);
        if (partNamed(answer, 'domain') !== undefined && partNamed(answer, 'domain') !== `{${inputs.join(', ')}}`) out.push(`domain "${partNamed(answer, 'domain')}" is not the inputs {${inputs.join(', ')}}`);
        if (partNamed(answer, 'range') !== undefined && partNamed(answer, 'range') !== `{${outputs.join(', ')}}`) out.push(`range "${partNamed(answer, 'range')}" is not {${outputs.join(', ')}}`);
        return out;
      }
      const out = featureProblems(f, range ? [Number(range[1]), Number(range[2])] : null, answer);
      const domainPart = partNamed(answer, 'domain');
      if (domainPart && !range) {
        const inside = intervalsOf(domainPart);
        const bad = inside && membershipDiffers(inside, (x) => Number.isFinite(f(x)));
        if (bad !== undefined && bad !== null && bad !== false) out.push(`domain "${domainPart}" is wrong at x = ${bad}`);
      }
      return out;
    },
  },
  {
    name: 'asymptotes of two functions: each one\'s asymptote, from the function sampled',
    test: (p) => p.startsWith('Identify the asymptotes of '),
    check: (example) => {
      const defined = functionsDefined(example.prompt);
      return answerParts(example.answer).flatMap((part) => {
        const m = /^([a-z]): asymptotes (.+)$/.exec(part);
        const e = m && defined[m[1]] ? evaluator(defined[m[1]].body) : null;
        if (!e) return [`cannot read "${part}"`];
        const f = (x) => e.at({ x });
        return [...m[2].matchAll(/(horizontal|vertical) ([xy]) = (-?\d+)/g)].flatMap(([, kind, , c]) => {
          const v = Number(c);
          if (kind === 'horizontal') return Math.abs(f(-1e6) - v) < 1e-4 || Math.abs(f(1e6) - v) < 1e-4 ? [] : [`${m[1]}: y = ${v} is not approached`];
          return Number.isFinite(f(v)) && Math.abs(f(v + 1e-6)) < 1e3 && Math.abs(f(v - 1e-6)) < 1e3 ? [`${m[1]}: x = ${v} is not an asymptote`] : [];
        });
      });
    },
  },
  {
    name: 'a relation\'s mapping: the arrows are its pairs, and it fails the function test exactly when an input has two outputs',
    test: (p) => p.startsWith('For the relation {'),
    check: (example, p) => {
      const pairs = pairsIn(p.split('}')[0]);
      const arrows = [...plain(example.answer).matchAll(/(-?\d+) → (-?\d+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
      const fails = pairs.some(([x, y]) => pairs.some(([x2, y2]) => x === x2 && y !== y2));
      const out = [];
      if (JSON.stringify(arrows) !== JSON.stringify(pairs)) out.push(`arrows ${JSON.stringify(arrows)}, pairs ${JSON.stringify(pairs)}`);
      if (/function test/.test(example.answer) && /fails the function test/.test(example.answer) !== fails) out.push(`"${example.answer}": it ${fails ? 'fails' : 'passes'}`);
      const set = (values) => `{${[...new Set(values)].sort((a, b) => a - b).join(', ')}}`;
      const domain = partNamed(plain(example.answer), 'domain');
      const range = partNamed(plain(example.answer), 'range');
      if (domain !== undefined && domain !== set(pairs.map(([x]) => x))) out.push(`domain ${domain}, the inputs are ${set(pairs.map(([x]) => x))}`);
      if (range !== undefined && range !== set(pairs.map(([, y]) => y))) out.push(`range ${range}, the outputs are ${set(pairs.map(([, y]) => y))}`);
      return out;
    },
  },
  {
    name: 'a recursive sequence: each term from the one before it by the rule',
    test: (p) => p.startsWith('A sequence has a₁ = '),
    check: (example, p) => {
      const m = /a₁ = (-?\d+) and aₙ = (.+?) for n ≥ 2/.exec(p);
      const rule = m[2].replace(/aₙ₋₁/g, 'u');
      const terms = (plain(example.answer).match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
      const out = [];
      if (terms[0] !== Number(m[1])) out.push(`the first term is ${terms[0]}, not ${m[1]}`);
      for (let n = 1; n < terms.length; n += 1) if (!agree(at(rule, { u: terms[n - 1] }), terms[n])) out.push(`term ${n + 1}: ${terms[n]}, the rule gives ${at(rule, { u: terms[n - 1] })}`);
      const kind = /common (difference|ratio) of (-?\d+)/.exec(example.texts.join(' '));
      if (kind && kind[1] === 'difference' && !agree(terms[1] - terms[0], Number(kind[2]))) out.push(`common difference ${kind[2]}`);
      if (kind && kind[1] === 'ratio' && !agree(terms[1] / terms[0], Number(kind[2]))) out.push(`common ratio ${kind[2]}`);
      return out;
    },
  },
  {
    name: 'a situation: its rule is the rate times the input, its table is on the rule, and its domain and range run from 0 to the limit the situation gives',
    test: (p) => /Build a model for this situation\.$|^A [a-z]+ .*Let [a-z] be .* and [A-Z]\([a-z]\) the/.test(p),
    check: (example, p) => {
      const answer = plain(example.answer).replace(/,\.\.\./g, ', ...');
      const limit = /(?:at most|up to) (\d+)/.exec(p)?.[1];
      const rate = Number(/\$?(\d+(?:\.\d+)?) (?:each|per|in each|an hour|every)/.exec(p)?.[1] ?? /(?:steady|rate of|packs|at) (\d+(?:\.\d+)?)/.exec(p)?.[1]);
      const out = [];
      let checked = 0;
      const rule = /([A-Z])\(([a-z])\) = (-?[\d.]*)([a-z])/.exec(answer);
      if (rule) { checked += 1; if (Number(rule[3] || 1) !== rate) out.push(`${rule[0]}, the situation's rate is ${rate}`); }
      for (const [x, y] of pairsIn(partNamed(answer, 'table') || '')) { checked += 1; if (!agree(rate * x, y)) out.push(`(${x}, ${y}) is not ${rate} × ${x}`); }
      const whole = /domain \{0, 1, 2, \.\.\., (\d+)\}/.exec(answer);
      const continuous = /domain 0 ≤ [a-z] ≤ (\d+)/.exec(answer);
      if (whole || continuous) {
        checked += 1;
        if ((whole || continuous)[1] !== limit) out.push(`domain up to ${(whole || continuous)[1]}, the situation's limit is ${limit}`);
        if (Boolean(whole) !== /separate points/.test(answer)) out.push(`"${answer}": separate points go with a whole-number domain`);
      }
      const range = /range \{0, (\d+), (\d+), \.\.\., (\d+)\}/.exec(answer);
      if (range) { checked += 1; if (Number(range[1]) !== rate || Number(range[2]) !== 2 * rate || Number(range[3]) !== rate * Number(limit)) out.push(`range ${range[0]}, rate ${rate}, limit ${limit}`); }
      return checked ? out : [`nothing read in "${answer}"`];
    },
  },
  {
    name: 'an inverse relation: every pair with its coordinates exchanged',
    test: (p) => p.startsWith('Find the inverse relation of {'),
    check: (example, p) => {
      const pairs = pairsIn(p);
      const swapped = pairsIn(example.answer);
      return JSON.stringify(swapped) === JSON.stringify(pairs.map(([x, y]) => [y, x])) ? [] : [`${JSON.stringify(swapped)} is not ${JSON.stringify(pairs)} exchanged`];
    },
  },
  {
    name: 'an inverse function: f(f⁻¹(x)) = x, and the value asked for',
    test: (p) => /^(Find the inverse of [a-zA-Z]\(x\) = |Let [A-Z]\([a-z]\) = .+ Find the inverse rule)/.test(p),
    check: (example) => {
      const defined = functionsDefined(example.prompt);
      const [name] = Object.keys(defined);
      const { variable, body } = defined[name];
      const inverse = new RegExp(`${name}⁻¹\\(x\\) = ([^;]+)`).exec(plain(example.answer))?.[1];
      if (!inverse) return [`no inverse in "${example.answer}"`];
      const out = [];
      for (const x of [-2.5, 1.5, 4]) if (!agree(at(body, { [variable]: at(inverse, { x }) }), x)) out.push(`${name}(${name}⁻¹(${x})) = ${at(body, { [variable]: at(inverse, { x }) })}`);
      const when = new RegExp(`When ${name}\\(${variable}\\) = (-?[\\d.]+)`).exec(plain(example.texts.join(' ')));
      const value = answerValues(example.answer)[variable]?.[0];
      if (when && !agree(at(body, { [variable]: value }), Number(when[1]))) out.push(`${name}(${value}) = ${at(body, { [variable]: value })}, not ${when[1]}`);
      return out;
    },
  },
  {
    name: 'a sum, difference, product, quotient or composition of two functions: the answer\'s rule or value from the two functions',
    test: (p) => /^(Given|Let|For) f\(x\) = .+ and g\(x\) = .+ find|^Let [a-z]\(x\) = .+ and [a-z]\(x\) = .+ Find/.test(p),
    check: (example) => {
      const defined = functionsDefined(example.prompt);
      const functions = Object.keys(defined);
      const scope = {};
      for (const [name, { variable, body }] of Object.entries(defined)) {
        const e = evaluator(body, { functions });
        scope[`fn_${name}`] = (value) => e.at({ ...scope, [variable]: value });
      }
      const out = [];
      let checked = 0;
      for (const part of plain(example.answer).split(/;\s*| and (?=[(a-z])/)) {
        const m = /^(.+?) = (.+)$/.exec(part.trim());
        if (!m) continue;
        if (/^excluded x$/.test(m[1])) {
          checked += 1;
          const g = defined.g;
          if (!agree(at(g.body, { x: num(m[2]) }), 0)) out.push(`excluded x = ${m[2]}: g(${m[2]}) = ${at(g.body, { x: num(m[2]) })}`);
          continue;
        }
        const L = evaluator(m[1], { functions });
        const R = evaluator(m[2], { functions });
        if (!L || !R) continue;
        checked += 1;
        for (let point = 0; point < 4; point += 1) {
          const x = draw();
          if (!agree(L.at({ ...scope, x }), R.at({ ...scope, x }))) { out.push(`${part} is false at x = ${x}`); break; }
        }
      }
      const degree = /degree (\d+)/.exec(example.answer);
      if (degree) {
        const product = /\(f · g\)\(x\) = ([^;]+)/.exec(plain(example.answer))?.[1] || '';
        const highest = Math.max(...[...product.matchAll(/x(?:\^?\(?(\d+)\)?|([²³⁴]))?/g)].map((mm) => (mm[2] ? '  ²³⁴'.indexOf(mm[2]) : Number(mm[1] || 1))));
        checked += 1;
        if (highest !== Number(degree[1])) out.push(`degree ${degree[1]}, the product's highest power is ${highest}`);
      }
      return checked ? out : [`nothing read in "${example.answer}"`];
    },
  },
  {
    name: 'a cost over an interval of time: its domain is the interval and its range the costs at its ends',
    test: (p) => /^A .+ costs [A-Z]\(t\) = .+ from \d+ to \d+/.test(p),
    check: (example, p) => {
      const defined = functionsDefined(example.prompt);
      const e = evaluator(Object.values(defined)[0].body.replace(/ dollars.*$/, ''));
      const [, a, b] = /from (\d+) to (\d+)/.exec(p);
      const variable = Object.values(defined)[0].variable;
      return featureProblems((x) => e.at({ [variable]: x }), [Number(a), Number(b)], plain(example.answer));
    },
  },
  {
    name: 'two functions tested as inverses: f(g(t)) and g(f(t)) as the answer gives them, and inverses exactly when both are t',
    test: (p) => /^Determine whether f\([a-z]\) = .+ and g\([a-z]\) = .+ are inverses\.$/.test(p),
    check: (example) => {
      const defined = functionsDefined(example.prompt);
      const functions = Object.keys(defined);
      const scope = {};
      for (const [name, { variable, body }] of Object.entries(defined)) {
        const e = evaluator(body, { functions });
        scope[`fn_${name}`] = (value) => e.at({ ...scope, [variable]: value });
      }
      const t = defined.f.variable;
      const out = [];
      const answer = plain(example.answer);
      let both = true;
      for (const [outer, inner] of [['f', 'g'], ['g', 'f']]) {
        const stated = new RegExp(`${outer}\\(${inner}\\(${t}\\)\\) = ([^;]+)`).exec(answer)?.[1];
        if (!stated) { out.push(`no ${outer}(${inner}(${t})) in "${answer}"`); continue; }
        for (const value of [-2.5, 0.5, 3]) {
          const composed = scope[`fn_${outer}`](scope[`fn_${inner}`](value));
          if (!agree(composed, at(stated, { [t]: value }))) out.push(`${outer}(${inner}(${value})) = ${composed}, the answer says ${stated}`);
          if (!agree(composed, value)) both = false;
        }
      }
      if (/are not inverses/.test(answer) === both) out.push(`"${answer}": they are ${both ? '' : 'not '}inverses`);
      return out;
    },
  },
  {
    name: 'values of f, g and f⁻¹ from values given: f⁻¹ exchanges an input and its output, (f ± g)(a) is f(a) ± g(a), f(g(a)) works from the inside out',
    test: (p) => /^If [fg]\(-?\d+\) = -?\d+(?: and [fg]\(-?\d+\) = -?\d+)?, (complete|evaluate)/.test(p),
    check: (example, p) => {
      const given = Object.fromEntries([...p.matchAll(/([fg])\((-?\d+)\) = (-?\d+)/g)].map(([, name, a, b]) => [`${name}(${a})`, Number(b)]));
      const out = [];
      const answer = plain(example.answer);
      const inverse = /^f⁻¹\((-?\d+)\) = (-?\d+)$/.exec(answer);
      if (/complete the matching statement/.test(p)) {
        const [[key, value]] = Object.entries(given);
        if (!inverse || Number(inverse[1]) !== value || `f(${inverse[2]})` !== key) out.push(`"${answer}" does not exchange ${key} = ${value}`);
        return out;
      }
      for (const part of answer.split('; ')) {
        const m = /^(.+) = (-?\d+)$/.exec(part);
        if (!m) { out.push(`cannot read "${part}"`); continue; }
        const sum = /^\(f ([+-]) g\)\((-?\d+)\)$/.exec(m[1]);
        const nested = /^f\(g\((-?\d+)\)\)$/.exec(m[1]);
        const want = sum ? given[`f(${sum[2]})`] + (sum[1] === '+' ? 1 : -1) * given[`g(${sum[2]})`]
          : nested ? given[`f(${given[`g(${nested[1]})`]})`]
            : given[m[1]];
        if (want !== Number(m[2])) out.push(`${m[1]} = ${m[2]}, the values given make it ${want}`);
      }
      return out;
    },
  },
  {
    name: 'f(a) undone by f⁻¹: f⁻¹(f(a)) = a with f(a) worked out from f',
    test: (p) => /^Let f\(x\) = .+\. Find f\(-?\d+\), then use f⁻¹ to undo it\.$/.test(p),
    check: (example, p) => {
      const { body } = functionsDefined(example.prompt).f;
      const a = Number(/Find f\((-?\d+)\)/.exec(p)[1]);
      const m = /^f⁻¹\((-?\d+)\) = (-?\d+)$/.exec(plain(example.answer));
      return m && agree(Number(m[1]), at(body, { x: a })) && Number(m[2]) === a ? [] : [`"${example.answer}": f(${a}) = ${at(body, { x: a })}`];
    },
  },
  {
    name: 'a point of f on f⁻¹: its coordinates exchanged',
    test: (p) => /^The point \(-?\d+, -?\d+\) is on the graph of f\. Which point must be on the graph of f⁻¹\?$/.test(p),
    check: (example, p) => {
      const [[x, y]] = pairsIn(p);
      const [[a, b] = []] = pairsIn(example.answer);
      return a === y && b === x ? [] : [`"${example.answer}" is not (${y}, ${x})`];
    },
  },
  {
    name: 'a line through two points and its perpendicular: the slope from the points, its negative reciprocal, the line through the point with that slope, and each further perpendicular slope',
    test: (p) => /^Line [a-z] passes through \(.+?\) and \(.+?\)\. Find its slope, the slope of a line perpendicular to it/.test(p),
    check: (example, p) => {
      const [[x1, y1], [x2, y2]] = pairsIn(p.split('. Find')[0]);
      const slope = (y2 - y1) / (x2 - x1);
      const answer = plain(example.answer);
      const out = [];
      const part = (name) => partNamed(answer, name);
      if (!agree(num(part('slope')), slope)) out.push(`slope ${part('slope')}, the points give ${slope}`);
      if (!agree(num(part('perpendicular slope')), -1 / slope)) out.push(`perpendicular slope ${part('perpendicular slope')}, not ${-1 / slope}`);
      const through = pairsIn(/perpendicular line through (\(.+?\))/.exec(p)?.[1] || '')[0];
      const line = /^y = (.+)$/.exec(part('perpendicular line') || '')?.[1];
      if (!line || !through || !agree(at(line, { x: through[0] }), through[1]) || !agree(at(line, { x: 1 }) - at(line, { x: 0 }), -1 / slope)) out.push(`perpendicular line "${part('perpendicular line')}"`);
      const others = [...(/slopes for slopes of (.+)\.$/.exec(p)?.[1] || '').matchAll(/-?\d+(?:\/\d+)?/g)].map((m) => num(m[0]));
      ['second', 'third'].forEach((nth, index) => {
        if (others[index] !== undefined && !agree(num(part(`${nth} perpendicular slope`)), -1 / others[index])) out.push(`${nth} perpendicular slope ${part(`${nth} perpendicular slope`)}, not ${-1 / others[index]}`);
      });
      return out;
    },
  },
  {
    name: 'horizontal, vertical and perpendicular lines through points: each line through its point, the perpendicular of a horizontal line vertical and of a vertical one horizontal',
    test: (p) => /^Write the horizontal line and the vertical line through \(.+?\), and the line perpendicular to [xy] = -?\d+ through \(.+?\)\.$/.test(p),
    check: (example, p) => {
      const [[hx, hy], [px, py]] = pairsIn(p);
      const given = /perpendicular to ([xy]) = -?\d+/.exec(p)[1];
      const answer = plain(example.answer);
      const want = `horizontal y = ${hy}; vertical x = ${hx}; perpendicular ${given === 'y' ? `x = ${px}` : `y = ${py}`}`;
      return answer === want ? [] : [`"${answer}", not "${want}"`];
    },
  },
  {
    name: 'a function and its inverse meeting on y = x: both values are the meeting point\'s',
    test: (p) => /meet at the point \((-?\d+), \1\) on the line y = x/.test(p),
    check: (example, p) => {
      const c = /meet at the point \((-?\d+),/.exec(p)[1];
      return plain(example.answer) === `f(${c}) = ${c} and f⁻¹(${c}) = ${c}` ? [] : [`"${example.answer}"`];
    },
  },
];

const startProblems = (example) => {
  const p = plain(example.prompt);
  const checks = STARTS.filter((entry) => entry.test(p));
  if (!checks.length) return { problems: [], unmatched: true };
  const run = (entry) => {
    try {
      return entry.check(example, p);
    } catch (error) {
      return [`cannot be read: ${error.message}`];
    }
  };
  return { problems: checks.flatMap((entry) => run(entry).map((problem) => `${example.where}: ${problem} (${entry.name.split(':')[0]})`)), unmatched: false };
};

// ---------------------------------------------------------------------- tests

/** Problems grouped by kind (numbers and seeds aside), the first of each with how many there are. */
const grouped = (problems) => {
  const groups = new Map();
  for (const problem of problems) {
    const key = problem.replace(/ seed \d+/, '').replace(/-?\d+(\.\d+)?(e-?\d+)?/g, 'N').replace(/^\S+ \S+/, (m) => m.split(' ')[0]);
    if (!groups.has(key)) groups.set(key, { first: problem, count: 0 });
    groups.get(key).count += 1;
  }
  return [...groups.values()].map(({ first, count }) => `${count} × ${first}`);
};

test('the examples audited: every pre-WE-I source of a built-in example, over every item it claims, seeds 0 to 20', () => {
  const bySource = {};
  for (const example of EXAMPLES) bySource[example.source] = (bySource[example.source] || 0) + 1;
  for (const source of ['functionFeatures', 'linesAndSlope', 'dataAndModels', 'transformations', 'linearEquations', 'pointsAndIntervals', 'systems', 'quadraticsAbsoluteValue', 'inverseComposition', 'replay:stepAlgebra', 'replay:radicalEquation', 'replay:constructLine', 'replay:graphSystem', 'replay:solveInequalitySystem']) {
    assert.ok((bySource[source] || 0) >= 20, `${source}: ${bySource[source] || 0} examples`);
  }
  assert.ok(EXAMPLES.length >= 10000, `${EXAMPLES.length} examples`);
});

test('every value a step states agrees with the next step, and with the prompt\'s own functions', () => {
  const counts = { arithmetic: 0, truth: 0, bound: 0, local: 0, identity: 0, inverse: 0, plane: 0, claims: 0 };
  const problems = EXAMPLES.flatMap((example) => [...stepProblems(example, counts), ...lineStepProblems(example, counts), ...claimProblems(example, counts)]);
  assert.deepEqual(grouped(problems).slice(0, 25), []);
  assert.ok(counts.arithmetic >= 15000, JSON.stringify(counts));
  assert.ok(counts.truth >= 3000, JSON.stringify(counts));
  assert.ok(counts.bound >= 20000, JSON.stringify(counts));
  assert.ok(counts.identity >= 2000, JSON.stringify(counts));
  assert.ok(counts.inverse >= 50, JSON.stringify(counts));
  assert.ok(counts.local >= 1000, JSON.stringify(counts));
  assert.ok(counts.plane >= 1000, JSON.stringify(counts));
});

test('every example\'s starting expression and stated answer agree', () => {
  const problems = [];
  const unmatched = new Map();
  let checked = 0;
  for (const example of EXAMPLES) {
    const result = startProblems(example);
    if (result.unmatched) {
      const shape = plain(example.prompt).replace(/-?\d+(\.\d+)?/g, 'N').slice(0, 80);
      unmatched.set(shape, example.where);
      continue;
    }
    checked += 1;
    problems.push(...result.problems);
  }
  assert.deepEqual(grouped(problems).slice(0, 25), []);
  assert.deepEqual([...unmatched.entries()].slice(0, 20), [], 'a kind of prompt with no start-and-answer check');
  assert.ok(checked >= 10000, `${checked} examples`);
});

test('Spot the mistake writes no mathematics of its own, and the reason it gives as right states nothing false', () => {
  // Its step and its reason are the item's own common error, split; each wrong
  // choice is another item's reason or a fixed sentence. So the only maths to
  // check is what the right choice states as true: the step is the mistake.
  let shown = 0;
  let reasons = 0;
  const counts = { arithmetic: 0, truth: 0, bound: 0, local: 0, identity: 0, inverse: 0 };
  const problems = [];
  for (const { question, section } of QUESTIONS) {
    const own = splitCommonError(question?.solutionReview?.commonError);
    const lent = new Set(section.map((other) => splitCommonError(other?.solutionReview?.commonError)?.reason).filter(Boolean));
    for (const seed of SEEDS) {
      const spot = spotTheMistakeFor(question, { seed, assignmentQuestions: section });
      if (!spot) continue;
      shown += 1;
      const where = `spotTheMistake ${question.questionId} seed ${seed}`;
      if (!own || spot.line !== own.line || spot.reason !== own.reason) problems.push(`${where}: the step or the reason is not the item's own common error`);
      for (const choice of spot.choices) {
        if (choice.right ? choice.text !== own?.reason : !(lent.has(choice.text) || SPOT_THE_MISTAKE_GENERIC.includes(choice.text))) problems.push(`${where}: "${choice.text}" is written here`);
        if (!choice.right && /\d/.test(choice.text)) problems.push(`${where}: a wrong choice states a number: "${choice.text}"`);
      }
      if (seed === 0) {
        reasons += 1;
        problems.push(...stepProblems({ where, prompt: '', texts: [spot.reason], answer: '', rejected: {} }, counts));
      }
    }
  }
  assert.deepEqual(grouped(problems).slice(0, 12), []);
  assert.ok(shown >= 1000, `${shown} shown`);
  assert.ok(reasons >= 500, `${reasons} reasons`);
  assert.ok(counts.arithmetic + counts.truth >= 25, JSON.stringify(counts));
});

// One number changed: the last one in a text, made one larger.
const bump = (value) => {
  const at = [...value.matchAll(/\d+/g)].pop();
  return at ? `${value.slice(0, at.index)}${Number(at[0]) + 1}${value.slice(at.index + at[0].length)}` : value;
};
const withAnswer = (example, answer) => ({ ...example, answer });
const withStep = (example, index, show) => {
  const steps = example.steps.map((step, at) => (at !== index ? step : typeof step === 'string' ? show : { ...step, show, board: undefined }));
  return { ...example, steps, texts: textsOf(steps) };
};

test('each check can fail: one number changed in a real example, or one word of a plane graph, is caught', () => {
  const missed = [];
  // Every kind of start: its first example, with its answer's last number changed (or, where the
  // answer is words, a dashed line made solid), fails its own check.
  for (const entry of STARTS) {
    const example = EXAMPLES.find((candidate) => entry.test(plain(candidate.prompt)) && !entry.check(candidate, plain(candidate.prompt)).length);
    assert.ok(example, `no example for "${entry.name}"`);
    const p = plain(example.prompt);
    let changed = /\d/.test(example.answer) ? withAnswer(example, bump(example.answer)) : null;
    if (!changed) {
      const index = example.steps.findIndex((step) => /Draw the dashed line|Horizontal|makes it (true|false)/.test(step.show || step));
      const step = example.steps[index];
      changed = withStep(example, index, String(step.show || step).replace('dashed', 'solid').replace(/makes it true/, 'makes it false'));
    }
    if (!entry.check(changed, p).length) missed.push(`${entry.name.split(':')[0]}: ${example.where}`);
  }
  // Every source's steps: the last number of one step changed, in its first examples, is caught.
  const audit = (example) => [...stepProblems(example), ...lineStepProblems(example), ...claimProblems(example), ...startProblems(example).problems];
  for (const source of new Set(EXAMPLES.map((example) => example.source))) {
    const examples = EXAMPLES.filter((example) => example.source === source && example.seed === 0).slice(0, 60);
    let tried = 0;
    let caught = 0;
    for (const example of examples) {
      example.steps.forEach((step, index) => {
        const show = String(typeof step === 'string' ? step : step.show || '');
        if (!/\d/.test(show)) return;
        tried += 1;
        if (audit(withStep(example, index, bump(show))).length) caught += 1;
      });
    }
    // Not every number a step names is checked (a step that restates the prompt, a parent's
    // "one unit higher"), but four in five are.
    if (!tried || caught / tried < 0.8) missed.push(`the steps of ${source}: ${caught} of ${tried} changes caught`);
  }
  assert.deepEqual(missed, []);
});
