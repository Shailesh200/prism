import { Select } from "@repo-prism/ui";
import { useMemo, useState, type ReactElement, type ReactNode } from "react";
import { showConsoleToast } from "./console-toast.js";
import { notifyWorkspacesChanged, postJson } from "./session.js";

export const PICK_REPO = "__pick__";

export type RepoSelectRow = {
  readonly path: string;
  readonly label: string;
  readonly jobCount?: number;
};

export function repoSelectOptions(
  repos: readonly RepoSelectRow[],
  value: string,
  opts?: { readonly includeAll?: boolean; readonly jobsOnly?: boolean },
): { readonly value: string; readonly label: string }[] {
  const jobsOnly = opts?.jobsOnly === true;
  const withJobs = jobsOnly
    ? repos.filter((repo) => (repo.jobCount ?? 0) > 0)
    : [...repos];
  const selected = repos.find((repo) => repo.path === value);
  const list =
    selected && !withJobs.some((repo) => repo.path === selected.path)
      ? [...withJobs, selected]
      : withJobs;
  return [
    ...(opts?.includeAll ? [{ value: "all", label: "All repos" }] : []),
    ...list.map((repo) => ({
      value: repo.path,
      label: repo.label,
    })),
    { value: PICK_REPO, label: "Select repository…" },
  ];
}

export function RepoSelect(props: {
  readonly token: string;
  readonly repos: readonly RepoSelectRow[];
  readonly value: string;
  readonly onChange: (path: string) => void;
  readonly label?: string;
  readonly hint?: string;
  readonly includeAll?: boolean;
  readonly jobsOnly?: boolean;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly icon?: ReactNode;
  readonly "aria-label"?: string;
}): ReactElement {
  const [picking, setPicking] = useState(false);
  const options = useMemo(
    () =>
      repoSelectOptions(props.repos, props.value, {
        ...(props.includeAll ? { includeAll: true } : {}),
        ...(props.jobsOnly ? { jobsOnly: true } : {}),
      }),
    [props.repos, props.value, props.includeAll, props.jobsOnly],
  );

  return (
    <Select
      {...(props.label ? { label: props.label } : {})}
      {...(props.hint ? { hint: props.hint } : {})}
      {...(props.className ? { className: props.className } : {})}
      {...(props.icon ? { icon: props.icon } : {})}
      {...(props["aria-label"] ? { "aria-label": props["aria-label"] } : {})}
      value={props.value}
      disabled={props.disabled || picking}
      options={
        options.length === 1
          ? [{ value: "", label: "No repository with jobs yet" }, ...options]
          : options
      }
      onChange={(next) => {
        if (next !== PICK_REPO) {
          if (next && next !== "all") {
            void postJson("/api/workspaces/select", props.token, {
              path: next,
            }).catch(() => undefined);
          }
          props.onChange(next);
          return;
        }
        setPicking(true);
        void postJson<{ path?: string; cancelled?: boolean }>(
          "/api/workspaces/pick",
          props.token,
          {},
        )
          .then((result) => {
            if (result.path) {
              notifyWorkspacesChanged();
              void postJson("/api/workspaces/select", props.token, {
                path: result.path,
              }).catch(() => undefined);
              props.onChange(result.path);
              return;
            }
            if (!result.cancelled) {
              showConsoleToast(
                "Could not open the folder picker on this machine.",
                "error",
              );
            }
          })
          .finally(() => setPicking(false));
      }}
    />
  );
}
