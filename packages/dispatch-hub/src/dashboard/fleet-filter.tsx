import { Button, Checkbox, IconButton, Popover } from "@repo-prism/ui";
import { Filter } from "lucide-react";
import { useMemo, useState, type ReactElement } from "react";
import {
  FILTER_ALL,
  FILTER_NONE,
  encodeFilterIds,
  isAllFilter,
  isAllSelected,
  jobTypeFilterOptions,
  parseFilterIds,
  toggleFilterId,
} from "./fleet.js";
import { pickNewRepository, type RepoSelectRow } from "./repo-select.js";

export function FleetFilter(props: {
  readonly token: string;
  readonly repos: readonly RepoSelectRow[];
  readonly repoFilter: string;
  readonly onRepoFilter: (next: string) => void;
  readonly typeFilter: string;
  readonly onTypeFilter: (next: string) => void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const repoCatalog = useMemo(
    () => props.repos.map((repo) => repo.path),
    [props.repos],
  );
  const typeCatalog = useMemo(
    () =>
      jobTypeFilterOptions()
        .map((row) => row.id)
        .filter((id) => id !== FILTER_ALL),
    [],
  );
  const typeItems = useMemo(
    () => jobTypeFilterOptions().filter((row) => row.id !== FILTER_ALL),
    [],
  );
  const active =
    !isAllFilter(props.repoFilter) || !isAllFilter(props.typeFilter);

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="end"
      contentClassName="fleet-filter-pop"
      trigger={
        <IconButton
          label="Filter by repository and type"
          variant="secondary"
          className={
            active
              ? "fleet-toolbar__filter-btn fleet-toolbar__filter-btn--on"
              : "fleet-toolbar__filter-btn"
          }
          aria-expanded={open}
          aria-pressed={active}
        >
          <Filter size={14} aria-hidden />
        </IconButton>
      }
    >
      <FilterColumn
        title="Repositories"
        catalog={repoCatalog}
        value={props.repoFilter}
        onChange={props.onRepoFilter}
        items={props.repos.map((repo) => ({
          id: repo.path,
          label: repo.label,
        }))}
        footer={
          <Button
            size="sm"
            variant="secondary"
            className="fleet-filter-col__add"
            disabled={picking}
            onClick={() => {
              setPicking(true);
              void pickNewRepository(props.token)
                .then((path) => {
                  if (!path) return;
                  if (isAllFilter(props.repoFilter)) {
                    props.onRepoFilter(FILTER_ALL);
                    return;
                  }
                  const next = parseFilterIds(props.repoFilter).filter(
                    (id) => id !== FILTER_ALL,
                  );
                  props.onRepoFilter(encodeFilterIds([...next, path]));
                })
                .finally(() => setPicking(false));
            }}
          >
            + New Repository
          </Button>
        }
      />
      <FilterColumn
        title="Types"
        catalog={typeCatalog}
        value={props.typeFilter}
        onChange={props.onTypeFilter}
        items={typeItems.map((row) => ({ id: row.id, label: row.label }))}
      />
    </Popover>
  );
}

function FilterColumn(props: {
  readonly title: string;
  readonly catalog: readonly string[];
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly items: readonly { readonly id: string; readonly label: string }[];
  readonly footer?: ReactElement;
}): ReactElement {
  const ids = parseFilterIds(props.value);
  const allOn = isAllSelected(ids, props.catalog);
  const itemChecked = (id: string): boolean => allOn || ids.includes(id);
  return (
    <div className="fleet-filter-col">
      <div className="fleet-filter-col__head">
        <strong className="fleet-filter-col__title">{props.title}</strong>
        <span className="fleet-filter-col__actions">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => props.onChange(FILTER_ALL)}
          >
            Select all
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => props.onChange(FILTER_NONE)}
          >
            Clear
          </Button>
        </span>
      </div>
      <div
        className="fleet-filter-col__list"
        role="group"
        aria-label={props.title}
      >
        <Checkbox
          checked={allOn}
          onChange={() =>
            props.onChange(
              toggleFilterId(props.value, FILTER_ALL, props.catalog),
            )
          }
        >
          All
        </Checkbox>
        {props.items.map((item) => (
          <Checkbox
            key={item.id}
            checked={itemChecked(item.id)}
            onChange={() =>
              props.onChange(
                toggleFilterId(props.value, item.id, props.catalog),
              )
            }
          >
            {item.label}
          </Checkbox>
        ))}
      </div>
      {props.footer ?? null}
    </div>
  );
}
