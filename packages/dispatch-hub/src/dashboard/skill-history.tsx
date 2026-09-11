import { MarkdownDoc } from "@repo-prism/app-shell";
import {
  Button,
  Checkbox,
  Drawer,
  EmptyState,
  HoverTip,
  IconButton,
  relativePrismTime,
} from "@repo-prism/ui";
import { Eye, GitCompare, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type ReactElement } from "react";
import { showConsoleToast } from "./console-toast.js";
import { postJson } from "./session.js";

export type SkillVersionRow = {
  readonly id: string;
  readonly createdAt: string;
  readonly name: string;
  readonly description: string;
  readonly body: string;
  readonly status: "draft" | "published";
  readonly current: boolean;
};

export function SkillHistoryDrawer(props: {
  readonly token: string;
  readonly skillName: string;
  readonly onClose: () => void;
  readonly onReverted: (name: string) => void;
}): ReactElement {
  const [versions, setVersions] = useState<readonly SkillVersionRow[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [viewId, setViewId] = useState<string | undefined>();
  const [compare, setCompare] = useState<readonly string[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async (): Promise<void> => {
    try {
      const body = await postJson<{
        versions?: SkillVersionRow[];
        error?: string;
      }>("/api/skills", props.token, {
        action: "versions",
        name: props.skillName,
      });
      if (body.error) {
        setError(body.error);
        setVersions([]);
        return;
      }
      setError(undefined);
      setVersions(body.versions ?? []);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load history.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    void load();
  }, [props.skillName, props.token]);

  const viewing = versions.find((row) => row.id === viewId);
  const compared = useMemo(
    () =>
      compare
        .map((id) => versions.find((row) => row.id === id))
        .filter((row): row is SkillVersionRow => Boolean(row)),
    [compare, versions],
  );

  const toggleCompare = (id: string): void => {
    setCompare((current) => {
      if (current.includes(id)) return current.filter((row) => row !== id);
      if (current.length >= 2) return [current[1]!, id];
      return [...current, id];
    });
    setViewId(undefined);
  };

  const revert = async (version: SkillVersionRow): Promise<void> => {
    if (version.current) return;
    setBusy(true);
    try {
      const result = await postJson<{ error?: string }>(
        "/api/skills",
        props.token,
        {
          action: "revert_version",
          name: props.skillName,
          versionId: version.id,
        },
      );
      if (result.error) {
        showConsoleToast(result.error, "error");
        return;
      }
      showConsoleToast("Reverted to that version.");
      props.onReverted(props.skillName);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (version: SkillVersionRow): Promise<void> => {
    if (version.current) return;
    setBusy(true);
    try {
      const result = await postJson<{ ok?: boolean; detail?: string }>(
        "/api/skills",
        props.token,
        {
          action: "delete_version",
          name: props.skillName,
          versionId: version.id,
        },
      );
      if (!result.ok) {
        showConsoleToast(
          result.detail ?? "Could not delete that version.",
          "error",
        );
        return;
      }
      showConsoleToast("Deleted that version.");
      setCompare((current) => current.filter((id) => id !== version.id));
      if (viewId === version.id) setViewId(undefined);
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      title={`Version history · ${props.skillName}`}
      size="lg"
      onClose={props.onClose}
    >
      {loading ? <EmptyState>Loading history…</EmptyState> : null}
      {error ? <EmptyState>{error}</EmptyState> : null}
      {!loading && versions.length === 0 && !error ? (
        <EmptyState>No versions yet.</EmptyState>
      ) : null}
      <ul className="skill-history">
        {versions.map((row) => (
          <li key={row.id} className="skill-history__row">
            <Checkbox
              checked={compare.includes(row.id)}
              onChange={() => toggleCompare(row.id)}
            >
              <span className="skill-history__meta">
                <strong>{row.current ? "Current" : row.id}</strong>
                <span>
                  {row.current
                    ? "Live skill"
                    : row.createdAt
                      ? (relativePrismTime(row.createdAt) ?? row.createdAt)
                      : row.id}
                </span>
              </span>
            </Checkbox>
            <span className="skill-history__actions">
              <HoverTip label="View" detail="Read this version">
                <IconButton
                  label="View"
                  title=""
                  variant="secondary"
                  onClick={() => {
                    setViewId(row.id);
                    setCompare([]);
                  }}
                >
                  <Eye size={14} aria-hidden />
                </IconButton>
              </HoverTip>
              <HoverTip label="Revert" detail="Make this the current skill">
                <IconButton
                  label="Revert"
                  title=""
                  variant="secondary"
                  disabled={row.current || busy}
                  onClick={() => void revert(row)}
                >
                  <RotateCcw size={14} aria-hidden />
                </IconButton>
              </HoverTip>
              <HoverTip label="Delete" detail="Remove this snapshot">
                <IconButton
                  label="Delete version"
                  title=""
                  variant="danger"
                  disabled={row.current || busy}
                  onClick={() => void remove(row)}
                >
                  <Trash2 size={14} aria-hidden />
                </IconButton>
              </HoverTip>
            </span>
          </li>
        ))}
      </ul>
      {compare.length === 2 ? (
        <div className="skill-history__compare-head">
          <GitCompare size={14} aria-hidden />
          Compare
          <Button size="sm" variant="ghost" onClick={() => setCompare([])}>
            Clear
          </Button>
        </div>
      ) : (
        <p className="skill-history__hint">Select two versions to compare.</p>
      )}
      {compared.length === 2 ? (
        <div className="skill-history__compare">
          {compared.map((row) => (
            <article key={row.id} className="skill-history__pane">
              <h3>{row.current ? "Current" : row.id}</h3>
              <p>{row.description || "No when-to-use."}</p>
              <MarkdownDoc text={row.body} />
            </article>
          ))}
        </div>
      ) : viewing ? (
        <article className="skill-history__pane">
          <h3>{viewing.current ? "Current" : viewId}</h3>
          <p>{viewing.description || "No when-to-use."}</p>
          <MarkdownDoc text={viewing.body} />
        </article>
      ) : null}
    </Drawer>
  );
}
