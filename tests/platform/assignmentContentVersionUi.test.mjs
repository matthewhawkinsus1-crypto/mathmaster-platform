import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Full Assignment Audit offers corrected content release creation', async () => {
  const source = await readFile('src/components/teacher/FullAssignmentAudit.jsx', 'utf8');
  assert.match(source, /Create Corrected Content V/);
  assert.match(source, /createAssignmentContentVersion/);
  assert.match(source, /Existing assigned copies were not changed/);
});


test('Library shows Content version and hides superseded siblings by default', async () => {
  const source = await readFile('src/AssignmentLibraryBase.jsx', 'utf8');
  assert.match(source, /groupCurrentLibraryReleases/);
  assert.match(source, /contentVersionLabel/);
  assert.match(source, /Version History/);
  assert.match(source, /SUPERSEDED/);
  assert.match(source, /CURRENT/);
});


test('assigned copy exposes V2 preview and fundamental repair choices', async () => {
  const [appSource, modalSource] = await Promise.all([
    readFile('src/App.jsx', 'utf8'),
    readFile('src/components/teacher/AssignmentContentUpgradeModal.jsx', 'utf8'),
  ]);
  assert.match(appSource, /latestCurrentLibraryRelease/);
  assert.match(appSource, /Upgrade to Content V/);
  assert.match(modalSource, /affectedStudentCount/);
  assert.match(modalSource, /Retire flawed question only/);
  assert.match(modalSource, /Retire \+ add corrected replacement/);
  assert.match(modalSource, /expectedPlanHash/);
  assert.match(modalSource, /commitAssignmentContentUpgrade/);
});

test('Library delivery carries lineage while ordinary Duplicate starts a new family', async () => {
  const appSource = await readFile('src/App.jsx', 'utf8');
  assert.match(appSource, /sourceContentLineage/);
  assert.match(appSource, /contentLineage: assignmentPreflight\?\.sourceContentLineage/);
  assert.match(appSource, /contentLineage: _contentLineage/);
});

test('student gets a one-time preserved-work correction notice', async () => {
  const appSource = await readFile('src/App.jsx', 'utf8');
  assert.match(appSource, /This assignment was corrected by your teacher\. Your previous work was preserved\./);
  assert.match(appSource, /mathmaster:content-upgrade-notice/);
});


test('upgrade modal keeps success visible and shows actionable function errors at the action area', async () => {
  const modalSource = await readFile('src/components/teacher/AssignmentContentUpgradeModal.jsx', 'utf8');
  assert.match(modalSource, /describeAuthError/);
  assert.match(modalSource, /const \[success, setSuccess\]/);
  assert.match(modalSource, /Upgrade complete/);
  assert.match(modalSource, /errorCode/);
  assert.match(modalSource, /position: 'sticky'/);
  assert.match(modalSource, /Done/);
});

test('post-upgrade refresh cannot turn a successful server commit into a fake failure', async () => {
  const appSource = await readFile('src/App.jsx', 'utf8');
  const start = appSource.indexOf('onUpgraded={async (result) => {');
  const end = appSource.indexOf('}}', start);
  const callback = appSource.slice(start, end + 2);
  assert.match(callback, /Promise\.allSettled/);
  assert.doesNotMatch(callback, /setContentUpgradeRequest\(null\)/);
});
