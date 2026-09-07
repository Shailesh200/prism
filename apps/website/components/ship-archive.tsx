"use client";

import { useMemo, useState } from "react";
import { SHIP_FILTERS, type ShipFilter, type ShipTag } from "@/lib/changelog";

export type ShipArchiveEntry = {
  version: string;
  title?: string;
  dek: string;
  chips: string[];
  tags: ShipTag[];
};

type ShipArchiveProps = {
  entries: ShipArchiveEntry[];
};

export function ShipArchive({ entries }: ShipArchiveProps) {
  const [filter, setFilter] = useState<ShipFilter>("All");

  const visible = useMemo(() => {
    if (filter === "All") return entries;
    return entries.filter((entry) => entry.tags.includes(filter));
  }, [entries, filter]);

  return (
    <section>
      <h2 className="wn-label">Log archive</h2>
      <div className="wn-archive__filters" role="group" aria-label="Filter log">
        {SHIP_FILTERS.map((chip) => (
          <button
            key={chip}
            type="button"
            className="wn-chip"
            aria-pressed={filter === chip}
            onClick={() => setFilter(chip)}
          >
            {chip === "All" ? "All entries" : chip}
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <p className="wn-empty">No entries in this lane.</p>
      ) : (
        <div>
          {visible.map((entry) => (
            <article
              key={entry.version}
              id={entry.version}
              className="wn-row scroll-mt-24"
            >
              <h3 className="wn-row__ver">{entry.version}</h3>
              <div>
                {entry.title ? (
                  <p className="wn-row__title">{entry.title}</p>
                ) : null}
                <p className="wn-row__dek">{entry.dek}</p>
                {entry.chips.length > 0 ? (
                  <p className="wn-row__chips">
                    {entry.chips.map((chip) => (
                      <span key={chip}>{chip}</span>
                    ))}
                  </p>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
