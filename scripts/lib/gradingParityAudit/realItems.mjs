/*
 * EVERY GRADABLE QUESTION IN teacher-import-jsons, AS A STUDENT IS GIVEN IT.
 *
 * Each lesson is compiled the way a teacher's import compiles it
 * (src/assignmentBlueprint.js parseAssignmentBlueprintText), section by
 * section. A Question Family slot is drawn on `seats` preview seats
 * (questionFamilyInstance.mjs resolveFamilyPreviewInstance), so the audit
 * grades the instances students see, not the template.
 *
 *   realItems({ seats }) -> [{ id, lesson, section, questionId, seat, question, surface, supported }]
 *
 * Deterministic: files sorted, fixed seats. Read only.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const load = (relative) => import(pathToFileURL(path.join(ROOT, relative)).href);

const { parseAssignmentBlueprintText } = await load('src/assignmentBlueprint.js');
const { resolveFamilyPreviewInstance } = await load('functions/shared/questionFamilyInstance.mjs');
const { serverResponseGradingSupport } = await load('functions/shared/serverGrading/gradingSupport.mjs');

const plain = (value) => JSON.parse(JSON.stringify(value));

export const lessonFiles = () => {
  const files = [];
  const walk = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      const full = path.join(directory, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.json')) files.push(full);
    }
  };
  walk(path.join(ROOT, 'teacher-import-jsons'));
  return files;
};

const cache = new Map();
export const realItems = ({ seats = 2 } = {}) => {
  if (cache.has(seats)) return cache.get(seats);
  const items = [];
  const failures = [];
  for (const file of lessonFiles()) {
    const lesson = path.relative(ROOT, file);
    let questions;
    try {
      ({ questions } = parseAssignmentBlueprintText(readFileSync(file, 'utf8')));
    } catch (error) {
      failures.push({ lesson, error: String(error?.message || error) });
      continue;
    }
    for (const authored of questions) {
      const base = { lesson, section: authored.sectionId || '', questionId: String(authored.questionId || '') };
      const instances = authored.questionFamily
        ? Array.from({ length: seats }, (_, seat) => ({ seat, resolved: resolveFamilyPreviewInstance(authored, { index: seat }) }))
        : [{ seat: null, resolved: { question: authored } }];
      const seen = new Set();
      for (const { seat, resolved } of instances) {
        if (!resolved?.question) { failures.push({ ...base, seat, error: resolved?.error || 'no instance' }); continue; }
        const question = plain(resolved.question);
        // Two seats can draw one question; it is graded once.
        const identity = JSON.stringify(question.answerFields || question.table || question.prompt || '');
        if (seen.has(identity)) continue;
        seen.add(identity);
        const support = serverResponseGradingSupport(question);
        items.push({
          id: `${lesson}#${base.section}/${base.questionId}${seat === null ? '' : `@${seat}`}`,
          ...base,
          seat,
          question,
          surface: support.surfaceId || question.type,
          supported: support.supported === true,
        });
      }
    }
  }
  const result = { items, failures, lessons: lessonFiles().length };
  cache.set(seats, result);
  return result;
};
