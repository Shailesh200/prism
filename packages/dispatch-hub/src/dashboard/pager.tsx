import type { ReactElement } from "react";

export function pageSlice<T>(
  rows: readonly T[],
  page: number,
  size: number,
): readonly T[] {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const safe = Math.min(Math.max(0, page), pages - 1);
  return rows.slice(safe * size, safe * size + size);
}

/** Previous/Next pager, hidden when everything already fits on one page. */
export function Pager(props: {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly onPage: (page: number) => void;
}): ReactElement | null {
  if (props.total <= props.pageSize) return null;
  const pages = Math.max(1, Math.ceil(props.total / props.pageSize));
  const safe = Math.min(Math.max(0, props.page), pages - 1);
  const start = safe * props.pageSize + 1;
  const end = Math.min(props.total, (safe + 1) * props.pageSize);
  return (
    <div className="envelope-pager">
      <span>
        {start}–{end} of {props.total}
      </span>
      <button
        type="button"
        disabled={safe === 0}
        onClick={() => props.onPage(safe - 1)}
      >
        Previous
      </button>
      <button
        type="button"
        disabled={safe + 1 >= pages}
        onClick={() => props.onPage(safe + 1)}
      >
        Next
      </button>
    </div>
  );
}
