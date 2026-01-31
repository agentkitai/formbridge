/**
 * DataTable — Generic data table wrapper using @tanstack/react-table patterns.
 *
 * Provides sortable columns, pagination controls, and row click handling.
 */

import { createElement, useState, useMemo, type ReactNode } from "react";

export interface ColumnDef<T> {
  id: string;
  header: string;
  accessor: (row: T) => string | number | boolean | null | undefined;
  sortable?: boolean;
  render?: (value: unknown, row: T) => ReactNode;
}

export interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  keyAccessor: (row: T) => string;
  onRowClick?: (row: T) => void;
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (page: number) => void;
  className?: string;
  emptyMessage?: string;
}

interface SortState {
  column: string;
  direction: "asc" | "desc";
}

export function DataTable<T>({
  data,
  columns,
  keyAccessor,
  onRowClick,
  page = 1,
  pageSize = 20,
  total,
  onPageChange,
  className,
  emptyMessage = "No data found.",
}: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState | null>(null);

  const totalPages =
    total != null ? Math.ceil(total / pageSize) : undefined;

  // Sort data if a sortable column is active
  const sortedData = useMemo(() => {
    if (!sort) return data;
    const col = columns.find((c) => c.id === sort.column);
    if (!col) return data;
    return [...data].sort((a, b) => {
      const aVal = col.accessor(a);
      const bVal = col.accessor(b);
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sort.direction === "asc" ? cmp : -cmp;
    });
  }, [data, sort, columns]);

  const handleSort = (colId: string) => {
    setSort((prev) => {
      if (prev?.column === colId) {
        return prev.direction === "asc"
          ? { column: colId, direction: "desc" }
          : null;
      }
      return { column: colId, direction: "asc" };
    });
  };

  return createElement(
    "div",
    { className: `fb-table-wrapper ${className ?? ""}`.trim() },
    createElement(
      "table",
      { className: "fb-table", role: "table" },
      // Header
      createElement(
        "thead",
        null,
        createElement(
          "tr",
          null,
          columns.map((col) => {
            const isSorted = sort?.column === col.id;
            const sortIndicator = isSorted
              ? sort.direction === "asc" ? " \u25B2" : " \u25BC"
              : "";
            return createElement(
              "th",
              {
                key: col.id,
                className: `fb-table__th${col.sortable ? " fb-table__th--sortable" : ""}${isSorted ? " fb-table__th--sorted" : ""}`,
                scope: "col",
                ...(col.sortable
                  ? {
                      onClick: () => handleSort(col.id),
                      style: { cursor: "pointer", userSelect: "none" as const },
                      "aria-sort": isSorted
                        ? sort.direction === "asc" ? "ascending" : "descending"
                        : "none",
                    }
                  : {}),
              },
              col.header + sortIndicator
            );
          })
        )
      ),
      // Body
      createElement(
        "tbody",
        null,
        sortedData.length === 0
          ? createElement(
              "tr",
              null,
              createElement(
                "td",
                {
                  colSpan: columns.length,
                  className: "fb-table__empty",
                },
                emptyMessage
              )
            )
          : sortedData.map((row) =>
              createElement(
                "tr",
                {
                  key: keyAccessor(row),
                  className: `fb-table__row ${onRowClick ? "fb-table__row--clickable" : ""}`,
                  onClick: onRowClick ? () => onRowClick(row) : undefined,
                  style: onRowClick ? { cursor: "pointer" } : undefined,
                },
                columns.map((col) => {
                  const value = col.accessor(row);
                  return createElement(
                    "td",
                    { key: col.id, className: "fb-table__td" },
                    col.render ? col.render(value, row) : String(value ?? "")
                  );
                })
              )
            )
      )
    ),
    // Pagination
    totalPages != null &&
      totalPages > 1 &&
      createElement(
        "div",
        { className: "fb-table__pagination", role: "navigation", "aria-label": "Table pagination" },
        createElement(
          "button",
          {
            disabled: page <= 1,
            onClick: () => onPageChange?.(page - 1),
            className: "fb-table__page-btn",
            "aria-label": `Go to page ${page - 1}`,
          },
          "Previous"
        ),
        createElement(
          "span",
          { className: "fb-table__page-info" },
          `Page ${page} of ${totalPages}`
        ),
        createElement(
          "button",
          {
            disabled: page >= totalPages,
            onClick: () => onPageChange?.(page + 1),
            className: "fb-table__page-btn",
            "aria-label": `Go to page ${page + 1}`,
          },
          "Next"
        )
      )
  );
}
