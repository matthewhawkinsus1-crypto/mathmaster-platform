import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assignmentIntakeSource } from './helpers/intakeSource.mjs';
import { assignmentQuestionEditorSource } from './helpers/splitComponentSource.mjs';
import { appAndTeacherWorkspaceSource, appSurfaceSource, teacherControlsSource } from './helpers/appScreens.mjs';

const app = appAndTeacherWorkspaceSource();
const intake = assignmentIntakeSource();
const modal = fs.readFileSync('src/components/teacher/LessonPreflightModal.jsx', 'utf8');
const questionEditor = assignmentQuestionEditorSource();
const currentContentExport = fs.readFileSync('src/platform/assignments/currentContentPortableAssignment.js', 'utf8');

test('new authoring enters through Assignment V5 and reviewed Preflight', () => {
  assert.match(intake, /Paste AI Assignment/);
  assert.match(app, /const reviewedCandidate = reviewedAssignmentV5/);
  assert.match(app, /const finalPreflight = buildAssignmentV5PreflightModel\(reviewedCandidate\)/);
  assert.match(app, /if \(!finalPreflight\.isValid\)/);
  assert.match(app, /const reviewedV5 = finalPreflight\.assignmentV5/);
  assert.match(app, /flattenV5Sections\(reviewedV5\)/);
  assert.match(modal, /buildPreflightReviewedAssignmentV5/);
  // The reviewed V5 object is the model's input (first argument); an options
  // bag may follow (it carries the class size for Pre-Flight's uniqueness check).
  assert.match(modal, /buildAssignmentV5PreflightModel\(reviewedAssignmentV5[,)]/);
});

test('question editing cannot write content before native V5 Preflight succeeds', () => {
  const editStart = app.indexOf('const saveQuestionEditor');
  // The end anchor is the next function the teacher workspace declares. (The old one left App.jsx with the App split, and a missing anchor silently widens the region to the end of the file.)
  const editEnd = app.indexOf('const handleDuplicateAssignment', editStart);
  assert.ok(editStart > 0 && editEnd > editStart, 'the question-editor save was found');
  const block = app.slice(editStart, editEnd);
  assert.match(block, /storedAssignmentToV5/);
  assert.match(block, /buildAssignmentV5PreflightModel/);
  assert.match(block, /if \(!model\.isValid\)/);
  assert.match(block, /canonicalV5PersistencePatch/);
});

test('duplication cannot create a content copy outside native V5 Preflight', () => {
  const start = app.indexOf('const handleDuplicateAssignment');
  // The end anchor is the next function the teacher workspace declares. (The old one left App.jsx with the App split, and a missing anchor silently widens the region to the end of the file.)
  const end = app.indexOf('const openStoredAssignmentForPreflight', start);
  assert.ok(start > 0 && end > start, 'the duplicate handler was found');
  const block = app.slice(start, end);
  assert.match(block, /storedAssignmentToV5/);
  assert.match(block, /buildAssignmentV5PreflightModel/);
  assert.match(block, /if \(!model\.isValid\)/);
  assert.match(block, /assignedClassPeriods:\s*\[\]/);
});

test('stored assignment review paths reuse canonical V5 instead of recompiling renderer contracts', () => {
  assert.match(app, /openStoredAssignmentForPreflight/);

  const libraryStart = app.indexOf('const openStoredAssignmentForPreflight');
  // Its end is the next action declared beside it (app/teacher/workspaceAssignmentActions.js).
  const libraryEnd = app.indexOf('const handleRepairAssignmentFromLibrary', libraryStart);
  const libraryBlock = app.slice(libraryStart, libraryEnd);
  assert.match(libraryBlock, /prepareStoredAssignmentForReuse/);
  assert.doesNotMatch(libraryBlock, /readAssignmentJson\(/);

  const setupStart = app.indexOf('const beginEditAssignmentSetup');
  // The end anchor is the next function the teacher workspace declares. (The old one left App.jsx with the App split, and a missing anchor silently widens the region to the end of the file.)
  const setupEnd = app.indexOf('const beginAssignLibraryAssignment', setupStart);
  assert.ok(libraryStart > 0 && libraryEnd > libraryStart && setupEnd > setupStart, 'both review paths were found');
  const setupBlock = app.slice(setupStart, setupEnd);
  assert.match(setupBlock, /prepareStoredAssignmentForReuse/);
  assert.doesNotMatch(setupBlock, /readAssignmentJson\(/);

  assert.match(app, /Preflight will create the correct destination version/);
  assert.match(app, /Use a destination copy/);
});

test('platform self-export is canonical V5 and carries a lossless self-import marker', () => {
  // Bind this contract to the export call and the pure builder that now owns it,
  // rather than requiring a particular local helper shape inside App.jsx.
  // Since the App split (slice 7) the export dialog is createTeacherDialogViews'
  // (src/app/teacher/controls/teacherDialogViews.jsx), which App reaches through the teacher kit; the builder's
  // import is that module's.
  const dialogs = teacherControlsSource('createTeacherDialogViews');
  assert.match(dialogs, /JSON\.stringify\(buildCurrentContentPortablePackage\(exportJsonAssignment\)/);
  assert.match(dialogs, /^import \{ buildCurrentContentPortablePackage \} from '\.\.\/\.\.\/\.\.\/platform\/assignments\/currentContentPortableAssignment\.js';$/m);
  assert.match(currentContentExport, /storedAssignmentToV5\(\{ \.\.\.assignment, sections \}/);
  assert.match(currentContentExport, /mathmasterCanonicalAssignmentV5/);
  // Refused across App, the teacher workspace and every module App's code moved into, so a legacy export cannot hide in one.
  assert.doesNotMatch(appSurfaceSource(), /schemaVersion:\s*2[\s\S]{0,500}questions:\s*assignment\.questions/);
});

test('normal question editing also stays no-code', () => {
  assert.doesNotMatch(questionEditor, /Edit JSON|Apply Question JSON|questionJson/);
  assert.match(questionEditor, /Repair \/ Rewrite with AI/);
  assert.match(questionEditor, /Paste AI Replacement/);
});

test('normal teacher creator does not expose raw JSON editing or schema jargon', () => {
  assert.doesNotMatch(intake, /Edit raw JSON|textarea[^>]+rawJson/i);
  assert.match(intake, /NO CODE REQUIRED/);
  assert.match(intake, /Paste AI Assignment/);
  assert.doesNotMatch(intake, /Paste V5 JSON from Clipboard|Upload V5 JSON|V5 · NO CODE REQUIRED|Assignment V5 JSON object/);
  assert.doesNotMatch(modal, /Choose independently for each V5 section|canonical V5 output profiles|authored in the JSON/);
  assert.match(modal, /Back to Creator/);
  assert.doesNotMatch(modal, />Back to JSON</);
});

test('legacy Lesson Bundle authoring adapters stay out of the V5 path', () => {
  assert.doesNotMatch(app, /buildPreflightBundle|normalizeLessonBundle/);
  assert.doesNotMatch(modal, /validateLessonBundle|lessonBundle/);
});

console.log('assignmentV5AuthoringBoundary.test.mjs: all assertions passed');
