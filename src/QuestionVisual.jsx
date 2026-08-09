import GraphDisplay from './GraphDisplay';
import MathDisplay from './MathDisplay';

// A question of any type may carry a `table` to show the student — a word
// problem that displays sales data and asks for the reasonable domain, for
// example. `TableGrader` builds its own fillable table from the same field, so
// it opts out with includeTable={false} rather than rendering it twice.
const normalizeDisplayTable = (table) => {
  if (!table || typeof table !== 'object' || Array.isArray(table)) return null;

  const columns = Array.isArray(table.columns) && table.columns.length
    ? table.columns.map((column, index) => ({
        key: column?.key ?? String(index),
        label: String(column?.label ?? column?.key ?? `Column ${index + 1}`),
      }))
    : (Array.isArray(table.headers) ? table.headers : []).map((header, index) => ({
        key: String(index),
        label: String(header ?? `Column ${index + 1}`),
      }));
  if (!columns.length) return null;

  const rawRows = Array.isArray(table.rows) ? table.rows : [];
  const rows = rawRows.map((row) => (
    Array.isArray(row)
      // The header shape pairs positionally, so column keys are the indices.
      ? columns.map((_, index) => row[index])
      : columns.map((column) => (row && typeof row === 'object' ? row[column.key] : undefined))
  ));
  if (!rows.length) return null;

  return { columns, rows };
};

const displayCell = (value) => {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
};

export default function QuestionVisual({ question, includeGraph = true, includeTable = true }) {
  const visual = question?.visual;
  const graph = question?.graph || (visual?.type === 'graph' ? visual : null);
  const mathSpec = question?.mathDisplay || question?.supportingMath;
  const displayTable = includeTable ? normalizeDisplayTable(question?.table) : null;

  return (
    <>
      {mathSpec && (
        <div
          style={{
            fontSize: '26px',
            color: '#1a73e8',
            background: '#f8f9fa',
            borderRadius: '10px',
            padding: '16px 20px',
            margin: '22px auto',
            width: 'fit-content',
            maxWidth: '100%',
            boxSizing: 'border-box',
          }}
        >
          <MathDisplay
            value={typeof mathSpec === 'string' ? mathSpec : mathSpec.value}
            format={typeof mathSpec === 'string' ? 'auto' : mathSpec.format || 'auto'}
            ariaLabel={
              typeof mathSpec === 'string'
                ? 'Supporting mathematical expression'
                : mathSpec.ariaLabel || 'Supporting mathematical expression'
            }
          />
        </div>
      )}
      {displayTable && (
        <div style={{ margin: '22px auto', maxWidth: '100%', overflowX: 'auto' }}>
          <table
            style={{ borderCollapse: 'collapse', margin: '0 auto', minWidth: '260px', fontSize: '17px' }}
          >
            {question?.tableCaption && (
              <caption style={{ captionSide: 'top', padding: '0 0 10px', color: '#3c4043', fontWeight: 600 }}>
                {question.tableCaption}
              </caption>
            )}
            <thead>
              <tr>
                {displayTable.columns.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    style={{ border: '1px solid #dadce0', background: '#f1f3f4', padding: '10px 18px', color: '#202124', textAlign: 'center' }}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayTable.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td
                      key={displayTable.columns[cellIndex].key}
                      style={{ border: '1px solid #dadce0', padding: '10px 18px', textAlign: 'center', color: '#202124', background: '#fff' }}
                    >
                      {displayCell(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {includeGraph && graph && (
        <GraphDisplay graph={graph} title={question?.graphTitle || 'Question graph'} />
      )}
    </>
  );
}
