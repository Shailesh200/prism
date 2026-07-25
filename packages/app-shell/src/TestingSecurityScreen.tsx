import type {
  SecurityCheck,
  SecurityCheckStatus,
  SecurityReport,
  TestingReport,
  TestingTestResult,
  TestingTestStatus,
} from "@prism/shared";
import { CardIcon, InfoTip, SearchableInput } from "@prism/ui";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  FlaskConical,
  Folder,
  FileCode2,
  Loader2,
  Minus,
  Play,
  RefreshCw,
  Shield,
  ShieldCheck,
  TriangleAlert,
  Wrench,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { IconType } from "react-icons";
import {
  SiAvajs,
  SiCypress,
  SiGo,
  SiJasmine,
  SiJest,
  SiMocha,
  SiNodedotjs,
  SiPytest,
  SiRust,
  SiTestinglibrary,
  SiVitest,
} from "react-icons/si";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { AppSidebar, type AppSidebarUser, type AppView } from "./AppSidebar.js";
import { shellNavVariant, shellRootClass } from "./shell-layout.js";
import { useAppShellClient } from "./client-context.js";
import type { RunTestsOptions, TestListResult } from "./types.js";

export type TestingSecurityScreenProps = {
  readonly repoLabel: string;
  readonly branch?: string | undefined;
  readonly user?: AppSidebarUser | null;
  readonly onNavigate: (view: AppView) => void;
};

/** Canonical runner id → Simple-Icon logo (falls back to a lucide flask). */
const RUNNER_LOGOS: Record<string, IconType> = {
  vitest: SiVitest,
  jest: SiJest,
  mocha: SiMocha,
  cypress: SiCypress,
  ava: SiAvajs,
  jasmine: SiJasmine,
  "node:test": SiNodedotjs,
  node: SiNodedotjs,
  pytest: SiPytest,
  go: SiGo,
  cargo: SiRust,
  "testing-library": SiTestinglibrary,
};

/** Display label for a canonical runner id. */
const RUNNER_LABELS: Record<string, string> = {
  vitest: "Vitest",
  jest: "Jest",
  mocha: "Mocha",
  playwright: "Playwright",
  cypress: "Cypress",
  ava: "AVA",
  jasmine: "Jasmine",
  "node:test": "node:test",
  pytest: "pytest",
  go: "Go test",
  cargo: "Cargo test",
  "testing-library": "Testing Library",
};

function runnerLabel(id: string): string {
  return RUNNER_LABELS[id] ?? id;
}

function formatRelative(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  const delta = Date.now() - ms;
  const secs = Math.round(delta / 1000);
  if (secs < 60) return `${Math.max(0, secs)}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(ms).toLocaleString();
}

function formatDuration(ms?: number): string {
  if (ms === undefined) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

const TEST_STATUS_LABEL: Record<TestingTestStatus, string> = {
  passing: "Passing",
  failing: "Failing",
  skipped: "Skipped",
  unknown: "Unknown",
};

/** Colored status pill for a per-test result. */
function TestStatusPill({
  status,
}: {
  status: TestingTestStatus | "none";
}): ReactElement {
  if (status === "none") {
    return <span className="ts-tstat ts-tstat--none">—</span>;
  }
  return (
    <span className={`ts-tstat ts-tstat--${status}`}>
      {TEST_STATUS_LABEL[status]}
    </span>
  );
}

const CHECK_ICON: Record<SecurityCheckStatus, LucideIcon> = {
  pass: Check,
  warn: TriangleAlert,
  fail: X,
  skip: Minus,
};

function CheckStatusIcon({
  status,
}: {
  status: SecurityCheckStatus;
}): ReactElement {
  const Icon = CHECK_ICON[status];
  return (
    <span className={`ts-check-icon ts-check-icon--${status}`} title={status}>
      <Icon size={14} aria-hidden />
    </span>
  );
}

function dirnameOf(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  return idx <= 0 ? "." : normalized.slice(0, idx);
}

function basenameOf(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  return idx < 0 ? normalized : normalized.slice(idx + 1);
}

type SuiteTreeFolder = {
  path: string;
  files: {
    path: string;
    tests: { name: string; fullName?: string }[];
  }[];
};

function buildSuiteTree(list: TestListResult | null): SuiteTreeFolder[] {
  if (!list?.files.length) return [];
  const byFolder = new Map<string, SuiteTreeFolder["files"]>();
  for (const file of list.files) {
    const folder = dirnameOf(file.path);
    const files = byFolder.get(folder) ?? [];
    files.push({
      path: file.path,
      tests: file.tests.map((t) => ({
        name: t.name,
        ...(t.fullName !== undefined ? { fullName: t.fullName } : {}),
      })),
    });
    byFolder.set(folder, files);
  }
  return [...byFolder.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, files]) => ({
      path,
      files: files.sort((a, b) => a.path.localeCompare(b.path)),
    }));
}

/**
 * Testing & Security tab — Core reports for suite structure / coverage / per-test
 * results and left-shift tooling + segmented checks (M-046 / ADR-0022).
 */
export function TestingSecurityScreen(
  props: TestingSecurityScreenProps,
): ReactElement {
  const client = useAppShellClient();
  const [testing, setTesting] = useState<TestingReport | null>(null);
  const [security, setSecurity] = useState<SecurityReport | null>(null);
  const [testList, setTestList] = useState<TestListResult | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [listing, setListing] = useState(false);
  const [runMenuOpen, setRunMenuOpen] = useState(false);
  const [testingOpen, setTestingOpen] = useState(true);
  const [securityOpen, setSecurityOpen] = useState(true);
  const [openFolders, setOpenFolders] = useState<Set<string>>(() => new Set());
  const [openFiles, setOpenFiles] = useState<Set<string>>(() => new Set());
  const [testFilter, setTestFilter] = useState("");
  const [checkFilter, setCheckFilter] = useState("");
  const runGroupRef = useRef<HTMLDivElement>(null);
  const subtitle = [props.repoLabel, props.branch].filter(Boolean).join(" · ");

  const loadTestList = useCallback(async () => {
    if (!client.listTests) {
      setTestList({ files: [] });
      return;
    }
    setListing(true);
    try {
      const listed = await client.listTests();
      setTestList(listed ?? { files: [] });
    } catch {
      setTestList({ files: [] });
    } finally {
      setListing(false);
    }
  }, [client]);

  const runAnalysis = useCallback(async () => {
    setStatus("loading");
    setMessage(null);
    try {
      const [t, s] = await Promise.all([
        client.fetchTestingReport?.() ?? Promise.resolve(null),
        client.fetchSecurityReport?.() ?? Promise.resolve(null),
      ]);
      setTesting(t);
      setSecurity(s);
      setStatus("idle");
      if (!t && !s) {
        setMessage("Reports unavailable from host.");
        setStatus("error");
      }
      await loadTestList();
    } catch (err: unknown) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }, [client, loadTestList]);

  useEffect(() => {
    void runAnalysis();
  }, [runAnalysis]);

  // Close the "Run tests" dropdown on outside click / Escape.
  useEffect(() => {
    if (!runMenuOpen) return;
    const onDown = (event: MouseEvent): void => {
      if (!runGroupRef.current?.contains(event.target as Node)) {
        setRunMenuOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setRunMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [runMenuOpen]);

  const onRunTests = useCallback(
    async (options?: RunTestsOptions) => {
      setRunMenuOpen(false);
      setTestingOpen(true);
      if (!client.runTests) {
        setMessage("Running tests isn't supported in this host.");
        return;
      }
      setRunning(true);
      const coverage = options?.coverage === true;
      const scoped =
        options?.path || options?.testNamePattern
          ? ` (${options.path ?? "suite"}${
              options.testNamePattern ? ` · ${options.testNamePattern}` : ""
            })`
          : "";
      setMessage(
        coverage
          ? `Running tests with coverage${scoped}…`
          : `Running tests${scoped}…`,
      );
      try {
        const updated = await client.runTests(options);
        if (updated) {
          setTesting(updated);
          const passing = updated.results.filter(
            (r) => r.status === "passing",
          ).length;
          const failing = updated.results.filter(
            (r) => r.status === "failing",
          ).length;
          setMessage(
            updated.results.length > 0
              ? `Tests finished — ${updated.results.length} total, ${passing} passing, ${failing} failing.`
              : "Tests finished.",
          );
        } else {
          setMessage("Running tests isn't supported in this host.");
        }
      } catch (err: unknown) {
        setMessage(err instanceof Error ? err.message : String(err));
      } finally {
        setRunning(false);
      }
    },
    [client],
  );

  const runners = testing?.runners ?? [];
  const suiteTree = useMemo(() => buildSuiteTree(testList), [testList]);

  useEffect(() => {
    if (suiteTree.length === 0) return;
    setOpenFolders((prev) => {
      if (prev.size > 0) return prev;
      return new Set(suiteTree.slice(0, 8).map((f) => f.path));
    });
  }, [suiteTree]);

  // Rows for the tests table: real results when present, else discovered suites.
  const hasResults = (testing?.results.length ?? 0) > 0;
  const testRows = useMemo<
    {
      key: string;
      name: string;
      file: string;
      suite?: string;
      status: TestingTestStatus | "none";
      durationMs?: number;
    }[]
  >(() => {
    if (!testing) return [];
    if (testing.results.length > 0) {
      return testing.results.map((r: TestingTestResult) => ({
        key: r.id,
        name: r.name,
        file: r.file,
        status: r.status,
        ...(r.suite !== undefined ? { suite: r.suite } : {}),
        ...(r.durationMs !== undefined ? { durationMs: r.durationMs } : {}),
      }));
    }
    return testing.suites.map((s) => ({
      key: `${s.kind}:${s.path}`,
      name: s.path,
      file: `${s.fileCount} file${s.fileCount === 1 ? "" : "s"}`,
      suite: s.kind,
      status: "none" as const,
    }));
  }, [testing]);

  const filteredTestRows = useMemo(() => {
    const q = testFilter.trim().toLowerCase();
    if (!q) return testRows;
    return testRows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) || r.file.toLowerCase().includes(q),
    );
  }, [testRows, testFilter]);

  // Group security checks by domain (checks without a domain land in "General").
  const checkGroups = useMemo<
    { domain: string; checks: SecurityCheck[] }[]
  >(() => {
    const q = checkFilter.trim().toLowerCase();
    const all = security?.checks ?? [];
    const filtered = q
      ? all.filter(
          (c) =>
            c.title.toLowerCase().includes(q) ||
            (c.detail?.toLowerCase().includes(q) ?? false) ||
            (c.domain?.toLowerCase().includes(q) ?? false),
        )
      : all;
    const order: string[] = [];
    const byDomain = new Map<string, SecurityCheck[]>();
    for (const c of filtered) {
      const domain = c.domain ?? "General";
      if (!byDomain.has(domain)) {
        byDomain.set(domain, []);
        order.push(domain);
      }
      byDomain.get(domain)!.push(c);
    }
    // Keep "General" last for readability.
    order.sort((a, b) => {
      if (a === "General") return 1;
      if (b === "General") return -1;
      return 0;
    });
    return order.map((domain) => ({
      domain,
      checks: byDomain.get(domain)!,
    }));
  }, [security, checkFilter]);

  const toggleFolder = (path: string): void => {
    setOpenFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const toggleFile = (path: string): void => {
    setOpenFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <div className={shellRootClass()}>
      <AppSidebar
        variant={shellNavVariant()}
        active="testing"
        repoLabel={props.repoLabel}
        user={props.user ?? null}
        onNavigate={props.onNavigate}
      />

      <div className="ov-main">
        <header className="ov-top">
          <div>
            <div className="ov-top__title">Testing &amp; Security</div>
            <div className="ov-top__sub">{subtitle}</div>
          </div>
          <div className="ov-top__actions">
            <button
              type="button"
              className="ov-btn ov-btn--ghost"
              onClick={() => props.onNavigate("overview")}
            >
              <ArrowLeft size={13} aria-hidden />
              Back to Overview
            </button>

            <button
              type="button"
              className="ov-btn ov-btn--primary"
              disabled={status === "loading"}
              onClick={() => void runAnalysis()}
            >
              <RefreshCw size={13} aria-hidden />
              {status === "loading" ? "Analyzing…" : "Analyze"}
            </button>
          </div>
        </header>

        <div className="ov-scroll">
          {message ? (
            <p className="ts-banner" role="status">
              {message}
            </p>
          ) : null}

          {/* ——— Testing ——— */}
          <section className="ov-card ts-acc" aria-label="Testing report">
            <div className="ts-acc__header">
              <button
                type="button"
                className="ts-acc__trigger"
                aria-expanded={testingOpen}
                onClick={() => setTestingOpen((v) => !v)}
              >
                <span className="ts-acc__chevron" aria-hidden>
                  {testingOpen ? (
                    <ChevronDown size={16} />
                  ) : (
                    <ChevronRight size={16} />
                  )}
                </span>
                <h2 className="ts-head__title">
                  <CardIcon icon={FlaskConical} tone="emerald" size={18} />
                  Testing
                  <InfoTip label="Testing report">
                    Detects runners (vitest/jest/pytest/playwright/cypress),
                    suite kinds from path patterns, on-disk coverage artifacts,
                    and — after a run — per-test pass/fail results.
                  </InfoTip>
                </h2>
              </button>
              <div className="ts-acc__actions">
                <span className="ts-score">
                  {testing ? `${Math.round(testing.score)}` : "—"}
                  <span className="ts-score__unit">/100</span>
                </span>
                <div className="ts-split" ref={runGroupRef}>
                  <button
                    type="button"
                    className="ov-btn ov-btn--primary ts-split__main"
                    disabled={running}
                    onClick={() => void onRunTests()}
                  >
                    {running ? (
                      <Loader2 size={13} aria-hidden className="ts-spin" />
                    ) : (
                      <Play size={13} aria-hidden />
                    )}
                    {running ? "Running…" : "Run tests"}
                  </button>
                  <button
                    type="button"
                    className="ov-btn ov-btn--primary ts-split__caret"
                    aria-label="Test run options"
                    aria-haspopup="menu"
                    aria-expanded={runMenuOpen}
                    disabled={running}
                    onClick={() => setRunMenuOpen((v) => !v)}
                  >
                    <ChevronDown size={13} aria-hidden />
                  </button>
                  {runMenuOpen ? (
                    <div className="ts-split__menu" role="menu">
                      <button
                        type="button"
                        role="menuitem"
                        className="ts-split__item"
                        onClick={() => void onRunTests({ coverage: true })}
                      >
                        <ShieldCheck size={13} aria-hidden />
                        Run with coverage
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            {testingOpen ? (
              <div className="ts-acc__body">
                <p className="ts-summary">
                  {testing?.summary ?? "Not analyzed yet."}
                </p>

                <h3 className="ts-section-label">
                  <CardIcon icon={FlaskConical} tone="brand" size={14} />
                  Runners
                  <InfoTip label="Runners">
                    Detected from package.json dependencies/scripts and config
                    files (vitest.config, jest.config, playwright.config, …).
                  </InfoTip>
                </h3>
                {runners.length === 0 ? (
                  <p className="ts-empty">No runners detected.</p>
                ) : (
                  <ul className="ts-runners">
                    {runners.map((id) => {
                      const Logo = RUNNER_LOGOS[id];
                      return (
                        <li key={id} className="ts-runner">
                          {Logo ? (
                            <Logo className="ts-runner__logo" aria-hidden />
                          ) : (
                            <FlaskConical
                              size={16}
                              className="ts-runner__logo"
                              aria-hidden
                            />
                          )}
                          <span>{runnerLabel(id)}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}

                <div className="ts-tests-head">
                  <h3 className="ts-section-label ts-section-label--flush">
                    <CardIcon icon={Folder} tone="violet" size={14} />
                    Suite tree
                    <InfoTip label="Suite tree">
                      Discovered via vitest/jest list APIs before any run. Run
                      buttons filter by folder, file, or individual test name.
                    </InfoTip>
                  </h3>
                  <button
                    type="button"
                    className="ov-btn ov-btn--ghost ts-tree-refresh"
                    disabled={listing || running}
                    onClick={() => void loadTestList()}
                  >
                    {listing ? (
                      <Loader2 size={13} aria-hidden className="ts-spin" />
                    ) : (
                      <RefreshCw size={13} aria-hidden />
                    )}
                    {listing ? "Listing…" : "Refresh list"}
                  </button>
                </div>

                {suiteTree.length === 0 ? (
                  <p className="ts-empty">
                    {listing
                      ? "Discovering tests…"
                      : "No tests discovered yet. Use Refresh list or Analyze."}
                  </p>
                ) : (
                  <ul className="ts-tree">
                    {suiteTree.map((folder) => {
                      const folderOpen = openFolders.has(folder.path);
                      return (
                        <li key={folder.path} className="ts-tree__folder">
                          <div className="ts-tree__row">
                            <button
                              type="button"
                              className="ts-tree__toggle"
                              aria-expanded={folderOpen}
                              onClick={() => toggleFolder(folder.path)}
                            >
                              {folderOpen ? (
                                <ChevronDown size={14} aria-hidden />
                              ) : (
                                <ChevronRight size={14} aria-hidden />
                              )}
                              <Folder size={14} aria-hidden />
                              <span className="ts-tree__label">
                                {folder.path}
                              </span>
                              <span className="ts-tree__count">
                                {folder.files.length}
                              </span>
                            </button>
                            <button
                              type="button"
                              className="ts-tree__run"
                              disabled={running}
                              title={`Run tests under ${folder.path}`}
                              onClick={() =>
                                void onRunTests(
                                  folder.path === "."
                                    ? undefined
                                    : { path: folder.path },
                                )
                              }
                            >
                              <Play size={12} aria-hidden />
                              Run
                            </button>
                          </div>
                          {folderOpen ? (
                            <ul className="ts-tree__files">
                              {folder.files.map((file) => {
                                const fileOpen = openFiles.has(file.path);
                                return (
                                  <li key={file.path} className="ts-tree__file">
                                    <div className="ts-tree__row">
                                      <button
                                        type="button"
                                        className="ts-tree__toggle"
                                        aria-expanded={fileOpen}
                                        onClick={() => toggleFile(file.path)}
                                      >
                                        {fileOpen ? (
                                          <ChevronDown size={14} aria-hidden />
                                        ) : (
                                          <ChevronRight size={14} aria-hidden />
                                        )}
                                        <FileCode2 size={14} aria-hidden />
                                        <span className="ts-tree__label">
                                          {basenameOf(file.path)}
                                        </span>
                                        <span className="ts-tree__count">
                                          {file.tests.length}
                                        </span>
                                      </button>
                                      <button
                                        type="button"
                                        className="ts-tree__run"
                                        disabled={running}
                                        title={`Run ${file.path}`}
                                        onClick={() =>
                                          void onRunTests({ path: file.path })
                                        }
                                      >
                                        <Play size={12} aria-hidden />
                                        Run
                                      </button>
                                    </div>
                                    {fileOpen && file.tests.length > 0 ? (
                                      <ul className="ts-tree__tests">
                                        {file.tests.map((t, i) => {
                                          const pattern = t.fullName ?? t.name;
                                          return (
                                            <li
                                              key={`${file.path}:${i}:${t.name}`}
                                              className="ts-tree__test"
                                            >
                                              <div className="ts-tree__row">
                                                <span className="ts-tree__test-name">
                                                  {t.name}
                                                </span>
                                                <button
                                                  type="button"
                                                  className="ts-tree__run"
                                                  disabled={running}
                                                  title={`Run ${pattern}`}
                                                  onClick={() =>
                                                    void onRunTests({
                                                      path: file.path,
                                                      testNamePattern: pattern,
                                                    })
                                                  }
                                                >
                                                  <Play size={12} aria-hidden />
                                                  Run
                                                </button>
                                              </div>
                                            </li>
                                          );
                                        })}
                                      </ul>
                                    ) : null}
                                  </li>
                                );
                              })}
                            </ul>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}

                <div className="ts-tests-head">
                  <h3 className="ts-section-label ts-section-label--flush">
                    <CardIcon icon={FlaskConical} tone="violet" size={14} />
                    {hasResults ? "Test results" : "Test suites"}
                    <InfoTip label="Test results">
                      Per-test pass/fail after a run — all parsed results are
                      listed. Before a run, discovered suites from Core are
                      shown.
                    </InfoTip>
                  </h3>
                  <div className="ts-tests-head__right">
                    {testing?.lastRunAt ? (
                      <span className="ts-lastrun">
                        Last run {formatRelative(testing.lastRunAt)}
                      </span>
                    ) : null}
                    <SearchableInput
                      className="ts-filter"
                      value={testFilter}
                      onChange={setTestFilter}
                      placeholder="Filter by name / file…"
                      aria-label="Filter tests"
                    />
                  </div>
                </div>

                {!hasResults ? (
                  <p className="ts-hint">Run tests to see pass/fail.</p>
                ) : null}

                <div className="ts-table-wrap">
                  <table className="ts-table">
                    <thead>
                      <tr>
                        <th className="ts-table__status">Status</th>
                        <th>Name</th>
                        <th>File</th>
                        <th className="ts-table__num">Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTestRows.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="ts-table__empty">
                            {testRows.length === 0
                              ? "No suites found."
                              : "No rows match the filter."}
                          </td>
                        </tr>
                      ) : (
                        filteredTestRows.map((r) => (
                          <tr key={r.key}>
                            <td className="ts-table__status">
                              <TestStatusPill status={r.status} />
                            </td>
                            <td>
                              <span className="ts-cell-name">{r.name}</span>
                              {r.suite ? (
                                <span className="ts-cell-suite">{r.suite}</span>
                              ) : null}
                            </td>
                            <td className="ts-cell-mono">{r.file}</td>
                            <td className="ts-table__num">
                              {formatDuration(r.durationMs)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <p className="ts-cov">
                  <CardIcon icon={ShieldCheck} tone="emerald" size={13} />
                  {testing?.coverage?.present
                    ? testing.coverage.linePct !== undefined
                      ? `${testing.coverage.linePct}% lines · ${testing.coverage.source}`
                      : `Coverage present · ${testing.coverage.source}`
                    : "No coverage artifact on disk"}
                </p>
              </div>
            ) : null}
          </section>

          {/* ——— Security ——— */}
          <section className="ov-card ts-acc" aria-label="Security report">
            <button
              type="button"
              className="ts-acc__trigger"
              aria-expanded={securityOpen}
              onClick={() => setSecurityOpen((v) => !v)}
            >
              <span className="ts-acc__chevron" aria-hidden>
                {securityOpen ? (
                  <ChevronDown size={16} />
                ) : (
                  <ChevronRight size={16} />
                )}
              </span>
              <h2 className="ts-head__title">
                <CardIcon icon={Shield} tone="violet" size={18} />
                Security
                <InfoTip label="Security report">
                  Left-shift tool detection (Dependabot, CodeQL, Snyk, Semgrep,
                  Trivy, gitleaks) plus a domain-segmented fundamentals
                  checklist. Not a full SAST scan.
                </InfoTip>
              </h2>
              <span className="ts-score">
                {security ? `${Math.round(security.score)}` : "—"}
                <span className="ts-score__unit">/100</span>
              </span>
            </button>

            {securityOpen ? (
              <div className="ts-acc__body">
                <p className="ts-summary">
                  {security?.summary ?? "Not analyzed yet."}
                </p>

                <h3 className="ts-section-label">
                  <CardIcon icon={Wrench} tone="amber" size={14} />
                  Tools
                  <InfoTip label="Security tools">
                    Present when config files or CI workflows mention the tool.
                  </InfoTip>
                </h3>
                <div className="ts-table-wrap">
                  <table className="ts-table">
                    <thead>
                      <tr>
                        <th>Tool</th>
                        <th className="ts-table__status">Present</th>
                        <th>Path</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(security?.tools ?? []).length === 0 ? (
                        <tr>
                          <td colSpan={3} className="ts-table__empty">
                            No tools detected.
                          </td>
                        </tr>
                      ) : (
                        security!.tools.map((t) => (
                          <tr key={t.id}>
                            <td>
                              <span className="ts-cell-name">{t.name}</span>
                            </td>
                            <td className="ts-table__status">
                              <span
                                className={`ts-present ts-present--${
                                  t.present ? "yes" : "no"
                                }`}
                              >
                                {t.present ? "Yes" : "No"}
                              </span>
                            </td>
                            <td className="ts-cell-mono">{t.path ?? "—"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="ts-tests-head">
                  <h3 className="ts-section-label ts-section-label--flush">
                    <CardIcon icon={ShieldCheck} tone="rose" size={14} />
                    Checks
                    <InfoTip label="Security checks">
                      Fundamentals grouped by domain — no committed{" "}
                      <code>.env</code>, lockfile presence, auth middleware
                      signal, scanner / Dependabot configuration, and more.
                    </InfoTip>
                  </h3>
                  <SearchableInput
                    className="ts-filter"
                    value={checkFilter}
                    onChange={setCheckFilter}
                    placeholder="Filter checks…"
                    aria-label="Filter checks"
                  />
                </div>

                {checkGroups.length === 0 ? (
                  <p className="ts-empty">
                    {(security?.checks ?? []).length === 0
                      ? "No checks available."
                      : "No checks match the filter."}
                  </p>
                ) : (
                  checkGroups.map((group) => (
                    <div className="ts-domain" key={group.domain}>
                      <h4 className="ts-domain__title">
                        <CardIcon icon={Shield} tone="ink" size={13} />
                        {group.domain}
                        <span className="ts-domain__count">
                          {group.checks.length}
                        </span>
                      </h4>
                      <div className="ts-table-wrap">
                        <table className="ts-table ts-table--checks">
                          <colgroup>
                            <col className="ts-col-status" />
                            <col className="ts-col-check" />
                            <col className="ts-col-detail" />
                          </colgroup>
                          <thead>
                            <tr>
                              <th className="ts-table__status">Status</th>
                              <th>Check</th>
                              <th className="ts-table__detail">Detail</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.checks.map((c) => (
                              <tr key={c.id} data-status={c.status}>
                                <td className="ts-table__status">
                                  <CheckStatusIcon status={c.status} />
                                </td>
                                <td>
                                  <span className="ts-cell-name">
                                    {c.title}
                                  </span>
                                </td>
                                <td className="ts-cell-detail">
                                  {c.detail ?? "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
