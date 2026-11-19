/*
 * THE QUESTIONS THE FUZZ HARNESS ANSWERS: THE PLATFORM'S OWN.
 *
 * A fuzzed answer means little against an invented question. Every question
 * and key here is one the platform can put in front of a student:
 *
 *   fields     every typed response field of every My Math Path and CCMR bank
 *              (functions/seeds/pathQuestionBank), compiled for storage and
 *              drawn by the production generator on a fixed seed
 *   families   an instance of every platform Question Family
 *              (functions/shared/questionFamilyRegistry.mjs), resolved the way
 *              Pre-Flight previews it
 *   tools      the question each captured browser response was recorded
 *              against (tests/platform/fixtures), with that response's work
 *
 * Deterministic: fixed draw seeds, and each list in a fixed order. Read only.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { generatePathInstanceWithRetries, hasPathGenerator, hasPathVariants } from '../../../functions/shared/pathQuestionGeneration.mjs';
import { resolveFamilyPreviewInstance } from '../../../functions/shared/questionFamilyInstance.mjs';
import { listPlatformQuestionFamilies } from '../../../functions/shared/questionFamilyRegistry.mjs';
import { PATH_TOOL_QUESTIONS } from '../../../tests/platform/fixtures/pathToolQuestions.mjs';
import { REGISTRY_TOOL_QUESTIONS } from '../../../tests/platform/fixtures/registryToolQuestions.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(import.meta.url);
const { compilePathRecordForStorage } = require('../../../functions/lib/pathFirestoreShape.js');

const scalar = (value) => typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));
const plain = (value) => JSON.parse(JSON.stringify(value));
const readJson = (relative) => JSON.parse(readFileSync(path.join(ROOT, relative), 'utf8'));

let pathQuestions = null;
/** Every active bank item as a student is issued it: `{ source, question }`. */
export const pathBankQuestions = () => {
  if (pathQuestions) return pathQuestions;
  const directory = path.join(ROOT, 'functions/seeds/pathQuestionBank');
  pathQuestions = [];
  for (const file of readdirSync(directory).filter((name) => name.endsWith('_pathQuestionBank_seed.json')).sort()) {
    const parsed = JSON.parse(readFileSync(path.join(directory, file), 'utf8'));
    const documents = Array.isArray(parsed) ? parsed : (parsed.documents || parsed.items || parsed.questions || []);
    for (const item of documents) {
      if (item.active === false) continue;
      let document = item;
      try { document = compilePathRecordForStorage({ ...item, active: true }).document || item; } catch { /* the authored item is graded as it is */ }
      let question = document;
      if (hasPathGenerator(document) || hasPathVariants(document)) {
        try { question = generatePathInstanceWithRetries(document, 'grader-fuzz-0', 4)?.question || null; } catch { question = null; }
      }
      if (question) pathQuestions.push({ source: `${file.replace('_pathQuestionBank_seed.json', '')}:${item.id}`, question });
    }
  }
  return pathQuestions;
};

let typedFields = null;
/**
 * Every typed (never a choice) keyed response field of the banks, once per
 * distinct key and grading rule: `{ source, field }`, the field as the bank
 * stores it (`expected`, `accepted`, `inputProfile`, `equivalence`, ...).
 */
export const typedFieldCorpus = () => {
  if (typedFields) return typedFields;
  const seen = new Set();
  typedFields = [];
  for (const { source, question } of pathBankQuestions()) {
    for (const field of Array.isArray(question.responseFields) ? question.responseFields : []) {
      if (!scalar(field?.expected) || String(field.expected).trim() === '') continue;
      if (String(field.inputProfile || '').toLowerCase() === 'choice' || (Array.isArray(field.choices) && field.choices.length)) continue;
      const kept = plain({ ...field, id: 'answer' });
      const identity = JSON.stringify(kept);
      if (seen.has(identity)) continue;
      seen.add(identity);
      typedFields.push({ source, field: kept });
    }
  }
  return typedFields;
};

let familyQuestions = null;
/**
 * `perFamily` instances of every platform Question Family, as delivered:
 * `{ source, familyId, question }`. A family that cannot generate on a seat is
 * skipped for that seat (Pre-Flight reports those; this harness grades).
 */
export const familyQuestionCorpus = ({ perFamily = 2 } = {}) => {
  if (familyQuestions?.perFamily === perFamily) return familyQuestions.list;
  const list = [];
  for (const family of listPlatformQuestionFamilies()) {
    for (let seat = 0; seat < perFamily; seat += 1) {
      let question = null;
      try {
        question = resolveFamilyPreviewInstance({ questionId: `fuzz-${family.id}`, questionFamily: { id: family.id, version: family.version } }, { index: seat })?.question || null;
      } catch { question = null; }
      if (question) list.push({ source: `family:${family.id}@${family.version}#${seat}`, familyId: family.id, question: plain(question) });
    }
  }
  familyQuestions = { perFamily, list };
  return list;
};

let capturedWork = null;
/**
 * The work a real browser recorded for each tool, with its question:
 * `{ source, question, work }`. The captures are of right answers.
 */
export const capturedToolWork = () => {
  if (capturedWork) return capturedWork;
  capturedWork = [];
  const pathCaptures = readJson('tests/platform/fixtures/capturedToolResponses.json');
  for (const [name, entry] of Object.entries(pathCaptures)) {
    if (PATH_TOOL_QUESTIONS[name] && entry?.rawWork && typeof entry.rawWork === 'object') {
      capturedWork.push({ source: `captured:path:${name}`, question: plain(PATH_TOOL_QUESTIONS[name]), work: plain(entry.rawWork), pathTool: true });
    }
  }
  const registryCaptures = readJson('tests/platform/fixtures/capturedRegistryToolResponses.json');
  for (const [toolId, entry] of Object.entries(registryCaptures)) {
    const value = entry?.toolResponse?.value;
    if (REGISTRY_TOOL_QUESTIONS[toolId] && typeof value === 'string') {
      capturedWork.push({ source: `captured:registry:${toolId}`, question: plain(REGISTRY_TOOL_QUESTIONS[toolId]), work: JSON.parse(value), pathTool: false });
    }
  }
  return capturedWork;
};
