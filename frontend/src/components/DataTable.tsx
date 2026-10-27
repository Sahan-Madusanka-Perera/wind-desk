import type { ReactNode } from 'react'

export interface Column<T> {
  key: string
  header: ReactNode
  cell: (row: T) => ReactNode
  /** The first column is a row header for screen readers. */
  rowHeader?: boolean
}

/** Table twin of a chart: the WCAG-clean way to read every plotted value. */
export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  scroll = true,
}: {
  caption: string
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  scroll?: boolean
}) {
  return (
    <div className={scroll ? 'table-wrap table-scroll' : 'table-wrap'}>
      <table className="table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column) =>
                column.rowHeader ? (
                  <th key={column.key} scope="row">
                    {column.cell(row)}
                  </th>
                ) : (
                  <td key={column.key}>{column.cell(row)}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
