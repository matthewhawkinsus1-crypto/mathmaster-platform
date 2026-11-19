/*
 * SPLIT functions/index.js INTO DOMAIN MODULES, BY MOVING ITS STATEMENTS.
 *
 * functions/index.js was one 28,000-line file: 202 exported functions and the
 * 590 helpers and constants they use. This moves every top-level statement,
 * with the comments above it, byte for byte, into one file per domain beside
 * index.js. Nothing inside a statement changes, and the files stay in
 * functions/, so every relative require(), import() and __dirname reads as it
 * did.
 *
 *   node scripts/codemods/split-functions-index.mjs            report only
 *   node scripts/codemods/split-functions-index.mjs --write    write the files
 *
 * WHERE A STATEMENT GOES
 *   - `exports.NAME = ...` goes to the domain DOMAIN_RULES gives NAME.
 *   - A helper or constant goes to the one domain whose exports use it,
 *     directly or through other helpers. One that two or more domains use
 *     goes to COMMON_FILE, which exports it by name.
 *   - The global set-up (setGlobalOptions, initializeApp, and what they read)
 *     stays in index.js, which runs it and then loads each domain.
 *   - A top-level `const ... = require(...)` is not moved: each file gets its
 *     own copy, naming only what that file uses.
 *
 * So a domain file loads the common file and never another domain, and the
 * common file loads no domain: there is no cycle. Statements keep their order
 * within each file.
 *
 * "Uses" is read by the release planner's own analysis
 * (scripts/lib/functionsImportGraph.mjs): scoped references to top-level
 * names. The split is checked two more ways before anything is written:
 *   - every byte of the old file is in exactly one new file, or is a require
 *     statement that was copied (the tally printed at the end);
 *   - no new file uses a top-level name of the old file that it neither
 *     declares nor requires.
 * After writing, the proof that nothing a deploy sees changed is the manifest
 * diff (scripts/functions-manifest.mjs) and tests/platform/functionsDomainModules.test.mjs.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFunctionsImportGraph, fsSource, overlaySource } from '../lib/functionsImportGraph.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const INDEX = 'functions/index.js';
export const COMMON_FILE = 'functionsCommon.js';

// The first rule that matches an export's name decides its domain; the last
// takes the rest. A domain keeps its scheduled jobs and triggers.
export const DOMAIN_RULES = [
  ['liveChallenge', /LiveChallenge|ChallengeDryRun|GraphFeatureRush|InequalityRush|SystemsRush|LineGraph/],
  ['testCycle', /TestCycle|SecureExam|ProctorExam|proctorExam/],
  ['mathPath', /Path(?!s?To)|Ccmr|ModelingLab|issueNextQuestion|AskTeacher/],
  ['classroom', /Classroom|Google|oauthCallback|Launch|listPublishedAssignments|storeLessonNotesPdf|queueReleasedAssessmentGrades/],
  ['authoring', /WithAI|ContentUpgrade|ContentVersion|QuestionRepair|AssignmentRepair(?!er)|assignmentAiSelfTest|manageAssignmentLifecycle|EvidenceSummary/],
  ['rewards', /Reward|ClassPoint|PracticePass/],
  ['accounts', /SignIn|signIn|Passcode|Account|JoinCode|Class(?:es)?$|saveClass|setClassStatus|listClasses|migrateClasses|setStudentClass|TeacherAccess|RepairerAccess|AdminAudit|Preproduction|permanentlyDelete|resolveSignedInRole|assignStudentToTeacher|backfillRecordAuthorization|migrateAssignmentPrivacy|setAssignmentReadScope|StudentAssignmentControls|StudentAssignmentOverrides|AssignmentOverrideStorage|absorbSharedStudentControls|setStudentSisId|setStudentName/],
  ['platform', /Presence|Spotlight|platformBuildInfo|PlatformHealth|ClientCrashes/],
  ['grading', /./],
];

export const DOMAIN_FILES = {
  grading: 'gradingFunctions.js',
  rewards: 'rewardsFunctions.js',
  accounts: 'accountsFunctions.js',
  classroom: 'classroomFunctions.js',
  mathPath: 'mathPathFunctions.js',
  authoring: 'authoringFunctions.js',
  liveChallenge: 'liveChallengeFunctions.js',
  testCycle: 'testCycleFunctions.js',
  platform: 'platformFunctions.js',
};

const DOMAIN_TITLES = {
  grading: 'GRADING AND SUBMISSIONS: answer ingestion, response checkpoints, Recovery, grade overrides, the device queue and persistence holds, grade transfer',
  rewards: 'REWARDS: class points, Practice Passes, reward grants and the class reward catalog',
  accounts: 'ACCOUNTS AND ADMINISTRATION: sign-in, student and teacher accounts, classes, assignment privacy and controls, the admin audit log, preproduction reset',
  classroom: 'GOOGLE CLASSROOM: the teacher\'s Google connection, rosters, publishing, launch links, whole-assignment grade passback and its checkpoint scheduler',
  mathPath: 'MY MATH PATH: the Path question bank, sessions, mastery, weekly Path goals and their Classroom sync, CCMR plans, the modeling lab',
  authoring: 'AUTHORING: AI authoring and repair, content versions and upgrades, the assignment lifecycle',
  liveChallenge: 'LIVE CHALLENGE: rooms, rounds, standings, dry runs, and the Graph Feature, Inequality, Systems and Line Graph games',
  testCycle: 'TEST CYCLES AND SECURE EXAMS: secure sessions, proctoring, corrections, release, the teacher\'s Test Cycle panel',
  platform: 'PLATFORM: which build is live, crash counts for the owner, student presence and spotlight frames',
};

export const domainOfExport = (name) => DOMAIN_RULES.find(([, pattern]) => pattern.test(name))[0];

const INDEX_DOMAIN = '(index)';
const COMMON = '(common)';

export const planSplit = ({ text, graph }) => {
  const analysis = graph.entryAnalysis(INDEX);
  if (analysis.error) throw new Error(`${INDEX} could not be read: ${analysis.error}`);
  const statements = analysis.statements;

  // Each statement's chunk: from the end of the line the previous statement
  // ends on, to the end of the line this one ends on. So the comments above
  // a statement, and one after it on its last line, move with it.
  const ends = statements.map((record, index) => {
    if (index === statements.length - 1) return text.length;
    const newline = text.indexOf('\n', record.node.end);
    const rest = text.slice(record.node.end, newline === -1 ? text.length : newline);
    if (!/^[ \t]*(?:\/\/.*)?$/.test(rest)) throw new Error(`${INDEX}:${record.line}: code follows the statement on its last line (${JSON.stringify(rest.slice(0, 60))})`);
    return newline === -1 ? text.length : newline + 1;
  });
  const chunkOf = (index) => text.slice(index === 0 ? 0 : ends[index - 1], ends[index]);
  if (statements.map((_, index) => chunkOf(index)).join('') !== text) throw new Error('the chunks do not add up to the file');

  const indexOfKey = new Map(statements.map((record, index) => [record.key, index]));
  const isRequireStatement = (record) => record.node.type === 'VariableDeclaration' && record.node.kind === 'const'
    && record.names.length > 0 && record.names.every((name) => analysis.bindings.get(name)?.key === record.key);

  // What each statement uses: other statements of this file, by key.
  const usesOf = statements.map((record) => {
    const uses = new Set();
    for (const { name, member } of record.refs) {
      if (name === 'exports' || name === 'module') throw new Error(`${INDEX}:${record.line} reads ${name}${member ? `.${member}` : ''}: an export used by another statement cannot be moved apart from it`);
      const key = analysis.byName.get(name);
      if (key && key !== record.key) uses.add(indexOfKey.get(key));
    }
    return uses;
  });

  // A function declared twice: the later declaration is the one every caller
  // gets, and the earlier one is dead code that must stay in the same file,
  // above it, for that to remain true.
  const redeclared = [];
  statements.forEach((record, index) => {
    record.names.forEach((name) => {
      const winner = analysis.byName.get(name);
      if (winner === record.key) return;
      usesOf[indexOfKey.get(winner)].add(index);
      redeclared.push({ name, line: record.line, laterLine: statements[indexOfKey.get(winner)].line });
    });
  });

  // Which domains reach each statement.
  const domains = statements.map(() => new Set());
  const reachFrom = (start, domain) => {
    const stack = [start];
    while (stack.length) {
      const at = stack.pop();
      if (domains[at].has(domain)) continue;
      domains[at].add(domain);
      usesOf[at].forEach((next) => stack.push(next));
    }
  };
  statements.forEach((record, index) => {
    if (record.kind === 'export') reachFrom(index, domainOfExport(record.key.replace(/^exports\./, '')));
    else if (record.kind === 'global') reachFrom(index, INDEX_DOMAIN);
    else if (record.kind !== 'declaration') throw new Error(`${INDEX}:${record.line}: a ${record.kind} statement is not something this split knows how to place`);
  });
  // A declaration nothing uses stays beside its neighbours: it takes the
  // domain of the statement before it.
  const unused = [];
  statements.forEach((record, index) => {
    if (domains[index].size || isRequireStatement(record)) return;
    let before = index - 1;
    while (before >= 0 && (isRequireStatement(statements[before]) || domains[before].size !== 1)) before -= 1;
    const domain = before >= 0 ? [...domains[before]][0] : INDEX_DOMAIN;
    unused.push({ key: record.key, line: record.line, domain });
    reachFrom(index, domain);
  });

  const placeOf = statements.map((record, index) => {
    if (isRequireStatement(record)) return null;
    return domains[index].size === 1 ? [...domains[index]][0] : COMMON;
  });

  // The names each place takes from the common file, and the requires it copies.
  const places = [INDEX_DOMAIN, COMMON, ...Object.keys(DOMAIN_FILES)];
  const fromCommon = new Map(places.map((place) => [place, new Set()]));
  const requireNames = new Map(places.map((place) => [place, new Map()])); // place -> statement index -> Set(names)
  statements.forEach((record, index) => {
    const place = placeOf[index];
    if (place === null) return;
    for (const { name } of record.refs) {
      const key = analysis.byName.get(name);
      if (!key || key === record.key) continue;
      const target = indexOfKey.get(key);
      if (placeOf[target] === null) {
        const wanted = requireNames.get(place);
        if (!wanted.has(target)) wanted.set(target, new Set());
        wanted.get(target).add(name);
      } else if (placeOf[target] !== place) {
        if (placeOf[target] !== COMMON) throw new Error(`${record.key} (${place}) uses ${name}, which was placed in ${placeOf[target]}`);
        fromCommon.get(place).add(name);
      }
    }
  });
  const exportedFromCommon = [...new Set([...fromCommon.values()].flatMap((names) => [...names]))].sort();
  for (const name of exportedFromCommon) {
    const record = statements[indexOfKey.get(analysis.byName.get(name))];
    if (record.node.type === 'VariableDeclaration' && record.node.kind !== 'const') {
      throw new Error(`${name} is a \`${record.node.kind}\` that another file would read: exporting it would hand over its value at load, not the variable`);
    }
  }

  return { analysis, statements, chunkOf, placeOf, isRequireStatement, fromCommon, requireNames, exportedFromCommon, unused, redeclared, domains, places };
};

// A copy of a top-level require statement naming only what the file uses.
// `const { a, b: c } = require("x")` is rewritten with the names kept; any
// other shape is copied whole.
const requireCopy = ({ record, chunk, text, names }) => {
  const declaration = record.node;
  const [declarator] = declaration.declarations;
  const leading = chunk.slice(0, chunk.indexOf(text.slice(declaration.start, declaration.end)));
  const simple = declaration.declarations.length === 1 && declarator.id.type === 'ObjectPattern'
    && declarator.id.properties.every((property) => property.type === 'Property' && !property.computed
      && property.key.type === 'Identifier' && property.value.type === 'Identifier');
  if (!simple || declarator.id.properties.every((property) => names.has(property.value.name))) return chunk;
  const kept = declarator.id.properties
    .filter((property) => names.has(property.value.name))
    .map((property) => (property.key.name === property.value.name ? property.key.name : `${property.key.name}: ${property.value.name}`));
  const init = text.slice(declarator.init.start, declarator.init.end);
  const oneLine = `const { ${kept.join(', ')} } = ${init};`;
  const statement = oneLine.length <= 110 ? oneLine : `const {\n${kept.map((name) => `  ${name},`).join('\n')}\n} = ${init};`;
  return `${leading}${statement}\n`;
};

const commonRequire = (names) => (names.length
  ? `const {\n${names.map((name) => `  ${name},`).join('\n')}\n} = require("./${COMMON_FILE.replace(/\.js$/, '')}");\n`
  : '');

export const renderSplit = ({ text, plan }) => {
  const { statements, chunkOf, placeOf, fromCommon, requireNames, exportedFromCommon } = plan;
  const requiresFor = (place) => [...requireNames.get(place).entries()]
    .sort(([left], [right]) => left - right)
    .map(([index, names]) => requireCopy({ record: statements[index], chunk: chunkOf(index), text, names }).replace(/^\n+/, ''))
    .join('');
  const bodyFor = (place) => statements.map((_, index) => (placeOf[index] === place ? chunkOf(index) : '')).join('').replace(/^\n+/, '');

  const files = {};
  for (const [domain, file] of Object.entries(DOMAIN_FILES)) {
    const header = `// ${DOMAIN_TITLES[domain]}.\n//\n// One of the domain modules functions/index.js loads (see its header). The\n// code here was moved from index.js as it stood; helpers that another domain\n// also uses are in ${COMMON_FILE}.\n\n`;
    files[`functions/${file}`] = `${header}${requiresFor(domain)}${commonRequire([...fromCommon.get(domain)].sort())}\n${bodyFor(domain)}`;
  }

  const commonHeader = `// HELPERS AND CONSTANTS THAT MORE THAN ONE DOMAIN MODULE USES.\n//\n// Moved from functions/index.js as they stood. A helper only one domain uses\n// belongs in that domain's file, not here: the release planner reads this\n// file statement by statement (scripts/lib/functionsImportGraph.mjs,\n// STATEMENT_LEVEL_MODULES), so a change here redeploys the functions that use\n// the changed helper, and no others. This file loads no domain module.\n\n`;
  files[`functions/${COMMON_FILE}`] = `${commonHeader}${requiresFor(COMMON)}\n${bodyFor(COMMON)}\nmodule.exports = {\n${exportedFromCommon.map((name) => `  ${name},`).join('\n')}\n};\n`;

  const indexHeader = `// THE DEFAULT CODEBASE'S FUNCTIONS, BY DOMAIN.\n//\n// This file sets the options every function shares, starts the Admin SDK, and\n// loads one module per domain. Each module defines its functions with\n// \`exports.NAME = ...\`; their names, triggers and options are what they were\n// when all of this was one file (tests/platform/functionsDomainModules.test.mjs).\n//\n// ORDER MATTERS. Global options apply to functions defined after\n// setGlobalOptions runs, so it runs before any domain module is loaded.\n// entry.js, platformEntry.js and the Classroom section entry load this file\n// first for the same reason.\n//\n// A new function goes in the module of its domain. A helper two domains need\n// goes in ${COMMON_FILE}. A domain module never loads another domain module.\n\n`;
  const loaders = `\n// The domain modules. Loaded after the global options above are set.\nObject.assign(\n  exports,\n${Object.values(DOMAIN_FILES).map((file) => `  require("./${file.replace(/\.js$/, '')}"),`).join('\n')}\n);\n`;
  files[INDEX] = `${indexHeader}${requiresFor(INDEX_DOMAIN)}${commonRequire([...fromCommon.get(INDEX_DOMAIN)].sort())}\n${bodyFor(INDEX_DOMAIN)}${loaders}`;
  return files;
};

// Every chunk of the old file is in exactly one new file, whole; a require
// statement is in none (it was copied, possibly trimmed).
export const tallySplit = ({ plan, files }) => {
  const { statements, chunkOf, placeOf, isRequireStatement, places } = plan;
  const fileOf = (place) => (place === INDEX_DOMAIN ? INDEX : `functions/${place === COMMON ? COMMON_FILE : DOMAIN_FILES[place]}`);
  const problems = [];
  const lines = Object.fromEntries(places.map((place) => [place, { statements: 0, exports: 0, lines: 0 }]));
  let moved = 0;
  let copied = 0;
  statements.forEach((record, index) => {
    const chunk = chunkOf(index);
    if (isRequireStatement(record)) {
      copied += chunk.length;
      return;
    }
    const body = chunk.replace(/^\n+/, '');
    const holders = Object.entries(files).filter(([, content]) => content.includes(body)).map(([file]) => file);
    if (holders.length !== 1 || holders[0] !== fileOf(placeOf[index])) problems.push(`${record.key} (line ${record.line}) is in ${holders.length ? holders.join(', ') : 'no file'}, not only ${fileOf(placeOf[index])}`);
    moved += chunk.length;
    const tally = lines[placeOf[index]];
    tally.statements += 1;
    tally.exports += record.kind === 'export' ? 1 : 0;
    tally.lines += body.split('\n').length - 1;
  });
  return { problems, lines, moved, copied };
};

// No new file uses a top-level name of the old file that it neither declares
// nor requires. Read from the new files with the same scoped analysis.
export const undeclaredNames = ({ plan, files }) => {
  const oldNames = new Set(plan.analysis.byName.keys());
  const problems = [];
  const graph = buildFunctionsImportGraph({ source: overlaySource(fsSource(repoRoot), files) });
  for (const file of Object.keys(files)) {
    const analysis = graph.entryAnalysis(file);
    if (analysis.error) {
      problems.push(`${file} does not parse: ${analysis.error}`);
      continue;
    }
    for (const record of analysis.statements) {
      for (const { name } of record.refs) {
        if (oldNames.has(name) && !analysis.byName.has(name)) problems.push(`${file}:${record.line} uses ${name}, which it neither declares nor requires`);
      }
    }
  }
  return [...new Set(problems)];
};

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const write = process.argv.includes('--write');
  const text = readFileSync(path.join(repoRoot, INDEX), 'utf8');
  const graph = buildFunctionsImportGraph({ source: fsSource(repoRoot) });
  graph.exportNames; // reads the entry chain
  const plan = planSplit({ text, graph });
  const files = renderSplit({ text, plan });
  const tally = tallySplit({ plan, files });
  const undeclared = undeclaredNames({ plan, files });

  console.table(tally.lines);
  console.log(`${plan.statements.length} statements: ${tally.moved} bytes moved whole, ${tally.copied} bytes of require statements copied per file, of ${text.length}.`);
  console.log(`${plan.exportedFromCommon.length} names exported from ${COMMON_FILE}.`);
  plan.redeclared.forEach(({ name, line, laterLine }) => console.log(`declared twice: ${name} (line ${line}) is replaced by the declaration at line ${laterLine}; both stay in one file, in order`));
  plan.unused.forEach(({ key, line, domain }) => console.log(`unused: ${key} (line ${line}) stays with ${domain}`));
  [...tally.problems, ...undeclared].forEach((problem) => console.error(`PROBLEM: ${problem}`));
  if (tally.moved + tally.copied !== text.length) console.error('PROBLEM: the bytes do not add up');
  if (tally.problems.length || undeclared.length || tally.moved + tally.copied !== text.length) process.exit(1);
  if (write) {
    Object.entries(files).forEach(([file, content]) => writeFileSync(path.join(repoRoot, file), content));
    console.log(`Wrote ${Object.keys(files).length} files.`);
  } else console.log('Nothing written (pass --write).');
}
