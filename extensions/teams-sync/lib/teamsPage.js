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
//              #add; BUTTON_<row>_Import; a row saves when focus leaves it;
//              choosing Category resets #Count (write test, 2026-11-27).
//              "Return to Gradebook" (#assignments).
//   import     #importAssignmentGradesContent: input[type=file][name=file];
//              combos fileDelimiter, textQualifier, headerRow,
//              overwriteExistingGrades (ComboBoxHandler.all: hidden value +
//              shown text); #studentIdColumn, #gradeColumnNo; button#import;
//              Cancel runs closeImportFilePopup(). The answer is the reloaded
//              page's div.message (span.info / span.error by line number).

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
      // Editing works the way a teacher edits (DeSoto, 2026-11-27): TEAMS posts
      // every edit to its server (JSON-RPC doOnEditCell2, stage 1 on opening a
      // cell, stage 2 with the new value on closing it), so a cell is opened
      // with a click on it, given its value, and closed with the grid's
      // editStop; a dropdown value is chosen by clicking it in TEAMS's list.
      // Programmatic selectCell/editCell opened the wrong cell while TEAMS
      // held an editor open (it opens the Assign Date editor after Add).
      const mouse = (el, type) => {
        const r = el.getBoundingClientRect();
        el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
      };
      const click = (el) => { ['mousedown', 'mouseup', 'click'].forEach((type) => mouse(el, type)); };
      const press = (el, key, keyCode) => {
        for (const type of ['keydown', 'keypress', 'keyup']) {
          const event = new KeyboardEvent(type, { key, bubbles: true, cancelable: true });
          Object.defineProperty(event, 'keyCode', { get: () => keyCode });
          Object.defineProperty(event, 'which', { get: () => keyCode });
          el.dispatchEvent(event);
        }
      };
      const liveGrid = () => document.getElementById('grid').grid;
      const cellOf = (rowId, colIndex) => liveGrid().rowsAr[rowId]?.childNodes[colIndex] || null;
      const cellText = (rowId, colIndex) => norm(String(liveGrid().cells(rowId, colIndex).getValue()).replace(/<[^>]*>/g, ''));
      const settle = async () => {
        await sleep(300);
        for (let i = 0; i < 40 && busy(); i += 1) await sleep(250);
        await sleep(300);
      };
      const openEditor = async (rowId, colIndex) => {
        const td = cellOf(rowId, colIndex);
        if (!td) throw new Error('The TEAMS assignment row is gone.');
        td.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        click(td);
        await settle();
        if (liveGrid().editor?.cell !== td) { mouse(td, 'dblclick'); await settle(); }
        const editor = liveGrid().editor;
        if (editor?.cell !== td) throw new Error(`TEAMS did not open the ${liveGrid().getColumnId(colIndex)} cell for editing.`);
        return editor;
      };
      const typeCell = async (rowId, colIndex, value) => {
        const editor = await openEditor(rowId, colIndex);
        if (!editor.obj || !('value' in editor.obj)) throw new Error('The TEAMS cell editor has no text box.');
        editor.obj.focus();
        editor.obj.value = String(value);
        editor.obj.dispatchEvent(new Event('input', { bubbles: true }));
        // The grid's own editStop closes the editor and posts the edit (stage
        // 2), as a teacher's Tab does. A synthetic Tab is ignored by the date
        // editor, so it is not used.
        liveGrid().editStop();
        await settle();
        if (cellText(rowId, colIndex) !== norm(value)) throw new Error(`TEAMS did not take ${norm(value)} for ${liveGrid().getColumnId(colIndex)}.`);
      };
      const chooseCell = async (rowId, colIndex, value) => {
        await openEditor(rowId, colIndex);
        const list = [...document.querySelectorAll('div.combo-list')].find(visible);
        if (!list) throw new Error('TEAMS did not show the list for this field.');
        const item = one([...list.querySelectorAll('*')].filter((el) => visible(el) && !el.children.length && norm(el.textContent) === norm(value)), `"${norm(value)}" choice`);
        click(item);
        await settle();
        if (cellText(rowId, colIndex) !== norm(value)) throw new Error(`TEAMS did not take ${norm(value)} for ${liveGrid().getColumnId(colIndex)}.`);
      };
      // Leaving the row is what saves it. TEAMS then opens the cell that was
      // clicked; it is closed again with Escape, unchanged.
      const leaveRow = async (rowId) => {
        const g = liveGrid();
        const others = Array.from({ length: g.getRowsNum() }, (_, index) => String(g.getRowId(index))).filter((id) => id !== String(rowId));
        if (!others.length) throw new Error('TEAMS has no other row to move to, so the row cannot be saved.');
        const td = cellOf(others[others.length - 1], columnIndex(g, 'lcstgbcaName'));
        td.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        click(td);
        await settle();
        const editor = liveGrid().editor;
        if (editor?.obj) { press(editor.obj, 'Escape', 27); await settle(); }
        const message = [...document.querySelectorAll('[class*="error" i]')].filter((el) => visible(el) && norm(el.innerText)).map((el) => norm(el.innerText)).join(' ');
        if (message) throw new Error(`TEAMS did not save the row: ${message.slice(0, 160)}`);
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
        if (!['Daily', 'Test'].includes(norm(fields.Category))) throw new Error('A TEAMS category is Daily or Test.');
        if (gridRows().some((row) => norm(row.name).toLowerCase() === name.toLowerCase())) throw new Error(`TEAMS already has an assignment named "${name}" in this cycle.`);
        const before = new Set(Array.from({ length: g.getRowsNum() }, (_, index) => String(g.getRowId(index))));
        click(one([...document.querySelectorAll('#add')].filter(visible), 'Add button'));
        let rowId = null;
        for (let i = 0; i < 60 && !rowId; i += 1) {
          await sleep(250);
          const live = liveGrid();
          rowId = Array.from({ length: live.getRowsNum() }, (_, index) => String(live.getRowId(index))).find((id) => !before.has(id)) || null;
        }
        if (!rowId) throw new Error('TEAMS did not add a new assignment row.');
        await settle();
        const at = (id) => columnIndex(liveGrid(), id);
        // Category first: TEAMS refuses a name before it, and choosing it
        // resets #Count to the category's default, so #Count comes last.
        await chooseCell(rowId, at('rfdDistGbacNm'), fields.Category);
        await typeCell(rowId, at('lcstgbcaName'), name);
        // TEAMS checks Assign Date <= Due Date on every edit and reverts one
        // that breaks it, so the two are set in an order that keeps it true at
        // each step: the due date first when the row's current assign date is
        // not after the new due date, else the assign date first.
        const day = (value) => { const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(norm(value)); return m ? `${m[3]}${m[1]}${m[2]}` : ''; };
        const assign = norm(fields['Assign Date']);
        const due = norm(fields['Due Date']);
        if (assign && due && day(assign) > day(due)) throw new Error('The assign date is after the due date.');
        const dueFirst = !due || day(cellText(rowId, at('lcstgbcaAssignedDt'))) <= day(due);
        const dates = [['lcstgbcaAssignedDt', assign], ['lcstgbcaDueDt', due]];
        for (const [id, value] of dueFirst ? dates.reverse() : dates) {
          if (value) await typeCell(rowId, at(id), value);
        }
        // Required on a new row; DeSoto's defaults for Grade Transfer's columns.
        await typeCell(rowId, at('lcstgbcaScaleValue'), 100);
        await typeCell(rowId, at('lcstgbcaMaxValue'), fields['Maximum Value'] ?? 100);
        if (!cellText(rowId, at('lcstgbcaCnsdrHghLowDrpFlg'))) await chooseCell(rowId, at('lcstgbcaCnsdrHghLowDrpFlg'), 'N');
        await typeCell(rowId, at('lcstgbcaNumCatCount'), fields['#Count']);
        await leaveRow(rowId);
        return { done: true };
      }

      if (action === 'setCount') {
        const g = grid();
        const row = rowFor(args);
        await typeCell(row.rowId, columnIndex(g, 'lcstgbcaNumCatCount'), args.count);
        await leaveRow(row.rowId);
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
        // TEAMS's own ComboBox.choose reads the list it builds when the
        // dropdown is opened on screen, so it fails on one never opened. Set
        // what choose sets, from the combo's options: the shown text, the
        // hidden value, and TEAMS's change event.
        for (const [name, value] of Object.entries(wanted)) {
          const entry = combo(name);
          const hidden = document.getElementById(name);
          const shown = document.getElementById(`${name}txt`);
          if (hidden?.value !== value || norm(shown?.value) !== value) {
            const option = (entry.options || []).find((item) => String(item.value) === value);
            if (!option || !entry.txtview || !entry.valcon) throw new Error(`The TEAMS Import setting ${name} has no ${value}.`);
            entry.currentItem = option;
            entry.txtview.value = option.text;
            entry.valcon.value = option.value;
            if (typeof window.triggerEvent === 'function') window.triggerEvent(entry.txtview, 'change');
            else entry.txtview.dispatchEvent(new Event('change', { bubbles: true }));
          }
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
        // TEAMS answers an import by reloading the Assignments page
        // (TeacherGradebookAssignmentImportGradesAction.do) with a message box
        // (DeSoto, 2026-11-27): span.info "Total number of grades added: N",
        // and one span.error per refused line, by line number ("Error finding
        // student Id/Grade in the File for line number: 1"). `args.ids` are the
        // file's district IDs in line order, so a refused line names its
        // student without reading anything else off the page.
        if (!/ImportGradesAction/.test(path) || busy()) return { waiting: true };
        const lines = [...document.querySelectorAll('div.message span.error, div.message span.info')]
          .filter(visible)
          .map((el) => ({ error: el.classList.contains('error'), text: norm(el.innerText) }))
          .filter((line) => line.text);
        const total = lines.map((line) => /Total number of grades added:\s*(\d+)/i.exec(line.text)).find(Boolean);
        if (!total && !lines.some((line) => line.error)) return { waiting: true };
        const ids = Array.isArray(args.ids) ? args.ids.map((id) => String(id)) : [];
        const kind = (value) => (/not scheduled/i.test(value) ? 'not scheduled' : /finding student/i.test(value) ? 'ID or grade not accepted' : 'refused by TEAMS');
        const errors = lines.filter((line) => line.error).map((line) => {
          const at = /line number:\s*(\d+)/i.exec(line.text);
          return { sisStudentId: at ? (ids[Number(at[1]) - 1] || '') : '', reason: kind(line.text) };
        }).slice(0, 250);
        const added = total ? Number(total[1]) : 0;
        // For the teacher's log only; digits are masked.
        const summary = lines.map((line) => line.text.replace(/\d{3,}/g, '#')).join(' ').slice(0, 300);
        return { done: true, receipt: { ok: errors.length === 0 && Boolean(total), added, errors, summary } };
      }

      throw new Error(`Unknown TEAMS page action ${action}.`);
    })() };
  } catch (error) {
    return { error: String(error?.message || error) };
  }
}
