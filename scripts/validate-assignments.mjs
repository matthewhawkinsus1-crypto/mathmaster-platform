import fs from 'node:fs';
import path from 'node:path';
import { parseAssignmentBlueprintText, validateAssignmentQuestions } from '../src/assignmentBlueprint.js';
import { validateQuestionSemantics } from '../src/platform/contract/semanticValidation.js';
import { validateToolQuestion, MISSING_TOOL_IDS } from '../src/tools/toolSchemas.js';

const target = process.argv[2];
if (!target) {
  console.error('Usage: npm run validate:assignments -- path/to/file-or-directory');
  process.exit(2);
}
const stat = fs.statSync(target);
const files = stat.isDirectory()
  ? fs.readdirSync(target).filter((name) => name.endsWith('.json')).map((name) => path.join(target, name))
  : [target];
let failed = 0; let totalQuestions = 0;
for (const file of files) {
  try {
    const parsed = parseAssignmentBlueprintText(fs.readFileSync(file, 'utf8'));
    validateAssignmentQuestions(parsed.questions);
    totalQuestions += parsed.questions.length;
    const problems = [];
    parsed.questions.forEach((q, i) => {
      const sem = validateQuestionSemantics(q, { questionNumber: i + 1 });
      if (Array.isArray(sem)) problems.push(...sem.map((x) => `Q${i + 1}: ${x}`));
      else if (sem?.errors?.length) problems.push(...sem.errors.map((x) => `Q${i + 1}: ${x}`));
      const type = q.toolId || q.type;
      if (MISSING_TOOL_IDS.includes(type)) {
        const tool = validateToolQuestion({ ...q, toolId: type });
        if (!tool.isValid) problems.push(...tool.errors.map((x) => `Q${i + 1}: ${x}`));
      }
    });
    if (problems.length) throw new Error(problems.join(' | '));
    console.log(`PASS ${path.basename(file)} — ${parsed.questions.length} questions`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${path.basename(file)} — ${error.message}`);
  }
}
console.log(`Checked ${files.length} file(s), ${totalQuestions} question(s), ${failed} failed.`);
process.exit(failed ? 1 : 0);
