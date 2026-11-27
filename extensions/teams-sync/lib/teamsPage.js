// Everything the extension does inside a TEAMS page. Chrome injects
// `teamsPage` into the teacher's signed-in TEAMS tab
// (chrome.scripting.executeScript, world MAIN, because the gradebook's grid
// and combo boxes are page objects), so the function is self-contained: it
// uses nothing from the module around it.
//
// Each call does one small thing on the page it finds and returns plain data.
// `{ waiting: true }` means the page is not there yet (TEAMS is loading); the
// caller asks again. An error means the page is not what was expected, and
// nothing was changed.
//
// What these rely on was read from DeSoto's TEAMS on 2026-11-27 (read only):
//   sections   /grading/EntryPointSectionGradingSearchResultsAction.do
//              #resultsTableTable: Course in column 7, Section in 8; a row is
//              chosen by clicking it, then #select.
//   gradebook  /grading/SectionGradingSearchResultsSelectAction.do
//              #selectedSectiontxt "15041/01 - Alg II Honors - …", tab
//              #MPn_TAB.tabsActive; header #tabletopRight1 table: name (its
//              link carries assignmentId=…), "100x1", category, "Nov 02";
//              roster #tablebotLeft1 table (Local ID in cell 1); grades
//              #tablebottomRight1 table, row for row. #assignments,
//              #return ("Return to Search Results").
//   assignments /grading/GradebookSectionAssignmentsAction.do
//              the grid object at #grid (.grid), columns by id:
//              rfdDistGbacNm (Category, combo Daily/Test), lcstgbcaName,
//              lcstgbcaAssignedDt, lcstgbcaDueDt (calendars, MM-DD-YYYY),
//              lcstgbcaMaxValue, lcstgbcaNumCatCount (#Count),
//              gradeTypeGbCycle; "Gradebook Grading Cycle Date From … To …";
//              #add; BUTTON_<row>_Import; a row saves when focus leaves it
//              (#613's live check). "Return to Gradebook" (#assignments).
//   import     #importAssignmentGradesContent: input[type=file][name=file];
//              combos fileDelimiter, textQualifier, headerRow,
//              overwriteExistingGrades (ComboBoxHandler.all, chooseByVal);
//              #studentIdColumn, #gradeColumnNo; button#import; Cancel runs
//              closeImportFilePopup().

export async function teamsPage(action, args = {}) {
  // The whole step runs inside this try: an injected function cannot reach
  // anything outside itself, so errors come back as data ({ error }).
  try {
    return { value: await (async () => {
      const visible = (el) => !!el && el.getClientRects().length > 0;
      const norm = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
      const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
      const one = (items, what) => {
        if (items.length !== 1) throw new Error(`Expected one ${what} in TEAMS, found ${items.length}.`);
        return items[0];
      };
      const path = location.pathname;
      const onSections = /EntryPointSectionGradingSearchResultsAction|SectionFinalGradesReturnAction/.test(path) && !!document.querySelector('#resultsTableTable');
      // The section box fills in after the grid draws: empty means still loading.
      const onGradebook = !!document.querySelector('#tabletopRight1 table') && !!norm(document.querySelector('#selectedSectiontxt')?.value);
      const gridHost = document.getElementById('grid');
      const onAssignments = /GradebookSectionAssignmentsAction|TeacherGradebookAssignment/.test(path) && !!gridHost?.grid;
      const busy = () => visible(document.querySelector('.blockUI, .blockOverlay')) || document.readyState !== 'complete';
      const sectionRefOf = (selected) => (/^\s*([A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9]+)\b/.exec(norm(selected)) || [])[1] || '';

      const where = () => {
        if (/SignOn|SignOut|Login/i.test(path) && document.querySelector('input[type=password]')) return { page: 'signin' };
        if (onGradebook) {
          const tab = document.querySelector('[id^="MP"][id$="_TAB"].tabsActive');
          return { page: 'gradebook', sectionRef: sectionRefOf(document.querySelector('#selectedSectiontxt').value), markingPeriod: tab ? tab.id.replace(/_TAB$/, '') : '' };
        }
        if (onAssignments) return { page: 'assignments', importOpen: visible(document.querySelector('#importAssignmentGradesContent')) };
        if (onSections) return { page: 'sections' };
        return { page: 'other', path };
      };

      // ---- the Assignments grid -------------------------------------------------
      const grid = () => {
        if (!onAssignments) throw new Error('Open the TEAMS Assignments page for this section first.');
        return gridHost.grid;
      };
      const columnIndex = (g, id) => {
        for (let i = 0; i < 40; i += 1) {
          let colId;
          try { colId = g.getColumnId(i); } catch { break; }
          if (colId === undefined) break;
          if (colId === id) return i;
        }
        throw new Error(`The TEAMS Assignments grid has no ${id} column.`);
      };
      const COLS = ['rfdDistGbacNm', 'lcstgbcaName', 'lcstgbcaAssignedDt', 'lcstgbcaDueDt', 'lcstgbcaMaxValue', 'lcstgbcaNumCatCount', 'gradeTypeGbCycle'];
      const gridRows = () => {
        const g = grid();
        const at = Object.fromEntries(COLS.map((id) => [id, columnIndex(g, id)]));
        const value = (rowId, id) => norm(String(g.cells(rowId, at[id]).getValue()).replace(/<[^>]*>/g, ''));
        return Array.from({ length: g.getRowsNum() }, (_, index) => {
          const rowId = g.getRowId(index);
          return {
            rowId: String(rowId),
            category: value(rowId, 'rfdDistGbacNm'),
            name: value(rowId, 'lcstgbcaName'),
            assignedDate: value(rowId, 'lcstgbcaAssignedDt'),
            dueDate: value(rowId, 'lcstgbcaDueDt'),
            maxValue: value(rowId, 'lcstgbcaMaxValue'),
            count: value(rowId, 'lcstgbcaNumCatCount'),
            cycle: value(rowId, 'gradeTypeGbCycle'),
          };
        });
      };
      const cycleDates = () => {
        const label = [...document.querySelectorAll('td, th')].find((cell) => norm(cell.innerText) === 'Gradebook Grading Cycle Date');
        const row = label?.parentElement;
        const cells = row ? [...row.cells].map((cell) => norm(cell.innerText)) : [];
        const from = (cells.find((value) => /^From \d{2}-\d{2}-\d{4}/.test(value)) || '').slice(5, 15);
        const to = (cells.find((value) => /^To \d{2}-\d{2}-\d{4}/.test(value)) || '').slice(3, 13);
        return { start: from, end: to };
      };
      const rowFor = ({ name, dueDate }) => {
        const wanted = norm(name).toLowerCase();
        return one(gridRows().filter((row) => norm(row.name).toLowerCase() === wanted && (!dueDate || row.dueDate === dueDate)), `assignment "${norm(name).slice(0, 40)}"`);
      };
      // A cell is written through the grid's own editor, so TEAMS's handlers see
      // the edit as a teacher's. The row saves when focus leaves it.
      const editCell = async (g, rowId, colIndex, value) => {
        g.selectCell(g.getRowIndex(rowId), colIndex);
        g.editCell();
        const editor = g.editor;
        if (!editor) throw new Error('The TEAMS grid did not open its editor.');
        if (typeof editor.setValue === 'function' && !editor.obj?.tagName) editor.setValue(String(value));
        else if (editor.obj && 'value' in editor.obj) {
          editor.obj.value = String(value);
          editor.obj.dispatchEvent(new Event('input', { bubbles: true }));
          editor.obj.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (typeof editor.setValue === 'function') editor.setValue(String(value));
        g.editStop();
        await sleep(150);
      };
      const leaveRow = async (g, rowId) => {
        const index = g.getRowIndex(rowId);
        const other = index > 0 ? 0 : (g.getRowsNum() > 1 ? 1 : -1);
        if (other >= 0) g.selectCell(other, columnIndex(g, 'lcstgbcaName'));
        else document.body.click();
        for (let i = 0; i < 40 && busy(); i += 1) await sleep(250);
        await sleep(500);
      };

      // ---- actions ---------------------------------------------------------------
      if (action === 'where') return where();

      if (action === 'openSectionList') {
        if (onSections) return { done: true };
        if (busy()) return { waiting: true };
        if (onGradebook) { one([...document.querySelectorAll('#return')].filter(visible), 'Return to Search Results button').click(); return { waiting: true }; }
        if (onAssignments) { one([...document.querySelectorAll('button')].filter((b) => visible(b) && norm(b.innerText) === 'Return to Gradebook'), 'Return to Gradebook button').click(); return { waiting: true }; }
        return { waiting: true };
      }

      if (action === 'listSections') {
        if (!onSections) return { waiting: true };
        const table = document.querySelector('#resultsTableTable');
        return {
          sections: [...table.rows].slice(1).map((row) => {
            const cells = [...row.cells].map((cell) => norm(cell.innerText));
            return { sectionRef: `${cells[7]}/${cells[8]}`, description: cells[6], term: cells[9], period: cells[10], day: cells[11] };
          }).filter((entry) => /^[^/]+\/[^/]+$/.test(entry.sectionRef)),
        };
      }

      if (action === 'openSection') {
        if (onGradebook && sectionRefOf(document.querySelector('#selectedSectiontxt').value) === args.sectionRef) return { done: true };
        if (onGradebook) { one([...document.querySelectorAll('#return')].filter(visible), 'Return to Search Results button').click(); return { waiting: true }; }
        if (onAssignments) { one([...document.querySelectorAll('button')].filter((b) => visible(b) && norm(b.innerText) === 'Return to Gradebook'), 'Return to Gradebook button').click(); return { waiting: true }; }
        if (!onSections) return { waiting: true };
        const [course, section] = String(args.sectionRef || '').split('/');
        const table = document.querySelector('#resultsTableTable');
        const row = one([...table.rows].slice(1).filter((r) => norm(r.cells[7]?.innerText) === course && norm(r.cells[8]?.innerText) === section), `TEAMS section ${args.sectionRef}`);
        row.cells[6].click();
        await sleep(200);
        if (!/tableSelected/.test(row.className)) throw new Error(`TEAMS did not select section ${args.sectionRef}.`);
        one([...document.querySelectorAll('#select')].filter(visible), 'Select button').click();
        return { waiting: true };
      }

      if (action === 'readGradebook') {
        if (!onGradebook || busy()) return { waiting: true };
        const header = document.querySelector('#tabletopRight1 table');
        const left = document.querySelector('#tablebotLeft1 table');
        const right = document.querySelector('#tablebottomRight1 table');
        if (!left || !right || left.rows.length !== right.rows.length) throw new Error('The TEAMS roster and grade grid do not line up.');
        const [names, maxCounts, categories, dues] = [0, 1, 2, 3].map((index) => [...(header.rows[index]?.cells || [])]);
        const columns = names.map((cell, index) => {
          const link = cell.querySelector('a[href*="assignmentId="]');
          const id = (/assignmentId=([A-Za-z0-9_.:-]+)/.exec(link?.getAttribute('href') || '') || [])[1] || '';
          return { index, id, name: norm(cell.innerText), maxCount: norm(maxCounts[index]?.innerText), category: norm(categories[index]?.innerText), dueLabel: norm(dues[index]?.innerText) };
        }).filter((column) => column.name);
        // The roster comes in groups, each under a one-cell label row:
        // "Scheduled Students With Ownership", "Dropped Students With
        // Ownership", "Scheduled Students Without Ownership", "Dropped
        // Students Without Ownership" (plus "All" and "Class Average" rows at
        // the top). Every row is kept in order, so the grade grid lines up.
        let group = '';
        const roster = [...left.rows].map((row) => {
          if (row.cells.length === 1) { group = norm(row.cells[0].innerText); return { label: group }; }
          return { id: norm(row.cells[1]?.innerText), group };
        });
        const cells = {};
        columns.forEach((column) => {
          if (column.id) cells[column.id] = [...right.rows].map((row) => norm(row.cells[column.index]?.innerText));
        });
        const tab = document.querySelector('[id^="MP"][id$="_TAB"].tabsActive');
        return {
          gradebook: {
            sectionText: document.querySelector('#selectedSectiontxt').value,
            markingPeriod: tab ? tab.id.replace(/_TAB$/, '') : '',
            columns: columns.map(({ index: _index, ...column }) => column),
            roster,
            cells,
          },
        };
      }

      if (action === 'openAssignments') {
        if (onAssignments) return { done: true };
        if (!onGradebook || busy()) return { waiting: true };
        one([...document.querySelectorAll('#assignments')].filter(visible), 'Assignments button').click();
        return { waiting: true };
      }

      if (action === 'returnToGradebook') {
        if (onGradebook) return { done: true };
        if (!onAssignments || busy()) return { waiting: true };
        one([...document.querySelectorAll('button')].filter((b) => visible(b) && norm(b.innerText) === 'Return to Gradebook'), 'Return to Gradebook button').click();
        return { waiting: true };
      }

      if (action === 'readAssignments') {
        if (!onAssignments || busy()) return { waiting: true };
        // The grid object exists before its rows arrive. An empty grid is
        // believed only after it has stayed empty for a few seconds.
        if (!grid().getRowsNum()) {
          const since = Number(document.documentElement.dataset.mathmasterEmptySince || 0);
          if (!since) { document.documentElement.dataset.mathmasterEmptySince = String(Date.now()); return { waiting: true }; }
          if (Date.now() - since < 6000) return { waiting: true };
        }
        delete document.documentElement.dataset.mathmasterEmptySince;
        const hiddenCycle = document.querySelector('input[name="campusGradeTypeComboId"]')?.value || '';
        const rows = gridRows();
        const cycles = [...new Set(rows.map((row) => row.cycle).filter(Boolean))];
        return { assignments: { cycle: { id: cycles.length === 1 ? cycles[0] : '', label: hiddenCycle, ...cycleDates() }, rows: rows.map(({ rowId: _rowId, ...row }) => row) } };
      }

      if (action === 'addAssignment') {
        // args.fields: TEAMS's own names, from the server's createColumn op.
        const g = grid();
        const fields = args.fields || {};
        const name = norm(fields['Assignment Name']);
        if (!name || name.length > 64) throw new Error('The new TEAMS assignment needs a name of at most 64 characters.');
        if (gridRows().some((row) => norm(row.name).toLowerCase() === name.toLowerCase())) throw new Error(`TEAMS already has an assignment named "${name}" in this cycle.`);
        const before = new Set(Array.from({ length: g.getRowsNum() }, (_, index) => String(g.getRowId(index))));
        one([...document.querySelectorAll('#add')].filter(visible), 'Add button').click();
        let rowId = null;
        for (let i = 0; i < 60 && !rowId; i += 1) {
          await sleep(250);
          const live = document.getElementById('grid').grid;
          rowId = Array.from({ length: live.getRowsNum() }, (_, index) => String(live.getRowId(index))).find((id) => !before.has(id)) || null;
        }
        if (!rowId) throw new Error('TEAMS did not add a new assignment row.');
        const live = document.getElementById('grid').grid;
        const set = [
          ['rfdDistGbacNm', fields.Category],
          ['lcstgbcaName', name],
          ['lcstgbcaAssignedDt', fields['Assign Date']],
          ['lcstgbcaDueDt', fields['Due Date']],
          ['lcstgbcaMaxValue', fields['Maximum Value']],
          ['lcstgbcaNumCatCount', fields['#Count']],
        ];
        for (const [id, value] of set) {
          if (value === undefined || value === null || value === '') continue;
          await editCell(live, rowId, columnIndex(live, id), value);
        }
        await leaveRow(live, rowId);
        return { done: true };
      }

      if (action === 'setCount') {
        const g = grid();
        const row = rowFor(args);
        await editCell(g, row.rowId, columnIndex(g, 'lcstgbcaNumCatCount'), args.count);
        await leaveRow(g, row.rowId);
        return { done: true };
      }

      if (action === 'openImport') {
        if (!onAssignments || busy()) return { waiting: true };
        const dialog = document.querySelector('#importAssignmentGradesContent');
        if (visible(dialog)) throw new Error('A TEAMS Import dialog is already open. Close it and try again.');
        const row = rowFor(args);
        one([...document.querySelectorAll(`#BUTTON_${row.rowId}_Import`)].filter(visible), 'assignment Import button').click();
        document.documentElement.dataset.mathmasterImport = String(args.nonce || '');
        return { done: true };
      }

      if (action === 'submitImport') {
        if (document.documentElement.dataset.mathmasterImport !== String(args.nonce || '')) throw new Error('The TEAMS Import dialog changed before the file was attached.');
        const dialog = document.querySelector('#importAssignmentGradesContent');
        const input = [...(dialog?.querySelectorAll('input[type=file][name=file]') || [])].filter(visible);
        if (!input.length) return { waiting: true };
        const file = one(input, 'file field');
        const combos = Object.values(window.ComboBoxHandler?.all || {});
        const combo = (name) => one(combos.filter((entry) => entry && entry.name === name), `${name} setting`);
        const wanted = { fileDelimiter: 'Comma', textQualifier: 'None', headerRow: 'No', overwriteExistingGrades: args.overwrite === true ? 'Yes' : 'No' };
        for (const [name, value] of Object.entries(wanted)) {
          const entry = combo(name);
          if (typeof entry.chooseByVal === 'function') entry.chooseByVal(value);
          const hidden = document.getElementById(name);
          const shown = document.getElementById(`${name}txt`);
          if (hidden?.value !== value || norm(shown?.value) !== value) throw new Error(`The TEAMS Import setting ${name} is not ${value}.`);
        }
        for (const [id, value] of [['studentIdColumn', '1'], ['gradeColumnNo', '2']]) {
          const el = document.getElementById(id);
          if (!visible(el) || norm(el.value) !== value) throw new Error(`The TEAMS Import setting ${id} is not ${value}.`);
        }
        const submit = one([...dialog.querySelectorAll('button#import')].filter((b) => visible(b) && !b.disabled && norm(b.innerText) === 'Import'), 'Import button');
        const body = String(args.body || '');
        const transfer = new DataTransfer();
        transfer.items.add(new File([body], 'MathMaster.csv', { type: 'text/csv' }));
        file.files = transfer.files;
        file.dispatchEvent(new Event('input', { bubbles: true }));
        file.dispatchEvent(new Event('change', { bubbles: true }));
        if (file.files.length !== 1 || file.files[0].size !== new Blob([body]).size) throw new Error('The file could not be attached to the TEAMS Import dialog.');
        if (document.getElementById('overwriteExistingGrades')?.value !== wanted.overwriteExistingGrades) throw new Error('The TEAMS Overwrite setting changed.');
        delete document.documentElement.dataset.mathmasterImport;
        submit.click();
        return { done: true };
      }

      if (action === 'readReceipt') {
        // TEAMS answers an import with a message ("… grades added …", or errors)
        // and an OK/Close button. Read it, then close it.
        for (const button of document.querySelectorAll('button, input[type=button]')) {
          if (!visible(button) || !/^[^a-z]*(ok|close)$/i.test(norm(button.innerText || button.value))) continue;
          for (let el = button.parentElement; el && el !== document.body; el = el.parentElement) {
            const msg = norm(el.innerText);
            if (msg.length > 4000) break;
            if (!/import|grades? (added|processed|updated|skipped)/i.test(msg)) continue;
            const cleaned = msg.replace(/(?:no|0) errors?\b|errors?\s*[:=]\s*0\b/gi, '');
            const failed = /\berrors?\b|invalid|failed|not scheduled/i.test(cleaned);
            const ok = /success|complet|\d+.{0,20}(added|processed|skipped|imported)|(added|processed|skipped|imported)\D{0,20}\d/i.test(msg);
            if (!failed && !ok) continue;
            // Error lines that name a district ID. Only the ID and the kind of
            // error are kept: the text between them can be the student's name.
            const errors = failed
              ? [...msg.matchAll(/\b(\d{5,12})\b[^.;\n]{0,80}?(not scheduled|invalid|not found|error)/gi)].map((m) => ({ sisStudentId: m[1], reason: m[2].toLowerCase() })).slice(0, 250)
              : [];
            const summary = norm(msg.replace(/\b\d{5,12}\b/g, '#')).slice(0, 300);
            button.click();
            return { done: true, receipt: { ok: !failed, errors, summary } };
          }
        }
        return { waiting: true };
      }

      throw new Error(`Unknown TEAMS page action ${action}.`);
    })() };
  } catch (error) {
    return { error: String(error?.message || error) };
  }
}
