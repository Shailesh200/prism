import { parseChangelog } from "@/lib/changelog";
import { readFile } from "node:fs/promises";
import path from "node:path";

export type AdoptionSnapshot = {
  fetchedAt: string;
  github: {
    stars: number | null;
    forks: number | null;
    openIssues: number | null;
    error?: string;
  };
  npm: Array<{
    name: string;
    downloads: number | null;
    series: number[];
    error?: string;
  }>;
  marketplace: {
    installs: number | null;
    rating: number | null;
    error?: string;
  };
  openVsx: { downloads: number | null; error?: string };
  release: {
    latest: string | null;
    entries: number;
    daysSince: number | null;
  };
  surfaces: {
    cliCommands: number | null;
    mcpTools: number | null;
  };
  docsHealth: {
    pages: number;
    missingDescription: number;
    overBudget: number;
  };
};

const NPM_PACKAGES = [
  "@repo-prism/cli",
  "@repo-prism/mcp-server",
  "@repo-prism/core",
  "@repo-prism/shared",
];

async function safeJson<T>(
  url: string,
  init?: RequestInit,
): Promise<{ data: T | null; error?: string }> {
  try {
    const res = await fetch(url, {
      ...init,
      next: { revalidate: 3600 },
    });
    if (!res.ok)
      return { data: null, error: `${res.status} ${res.statusText}` };
    return { data: (await res.json()) as T };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function docsHealth(repoRoot: string) {
  const { readdir, readFile: rf } = await import("node:fs/promises");
  const docsDir = path.join(repoRoot, "docs");
  const files: string[] = [];
  async function walk(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "architecture") continue;
        await walk(full);
      } else if (/\.mdx?$/.test(entry.name)) files.push(full);
    }
  }
  await walk(docsDir);

  let missingDescription = 0;
  let overBudget = 0;
  for (const file of files) {
    const text = await rf(file, "utf8");
    if (!/^---\n[\s\S]*?description:\s*.+\n[\s\S]*?---/m.test(text)) {
      missingDescription += 1;
    }
    const body = text.replace(/^---[\s\S]*?---\n/, "");
    const words = body.trim().split(/\s+/).filter(Boolean).length;
    if (!file.includes(`${path.sep}reference${path.sep}`) && words > 650) {
      overBudget += 1;
    }
  }
  return { pages: files.length, missingDescription, overBudget };
}

export async function getAdoptionSnapshot(): Promise<AdoptionSnapshot> {
  const repoRoot = path.join(process.cwd(), "../..");
  const changelogPath = path.join(repoRoot, "CHANGELOG.md");
  const changelogText = await readFile(changelogPath, "utf8").catch(() => "");
  const releases = parseChangelog(changelogText);

  const headers: HeadersInit = {
    Accept: "application/vnd.github+json",
    "User-Agent": "prism-website",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const github = await safeJson<{
    stargazers_count: number;
    forks_count: number;
    open_issues_count: number;
  }>("https://api.github.com/repos/Shailesh200/prism", { headers });

  const npm = await Promise.all(
    NPM_PACKAGES.map(async (name) => {
      const [point, range] = await Promise.all([
        safeJson<{ downloads: number }>(
          `https://api.npmjs.org/downloads/point/last-month/${encodeURIComponent(name)}`,
        ),
        safeJson<{ downloads: Array<{ downloads: number; day: string }> }>(
          `https://api.npmjs.org/downloads/range/last-month/${encodeURIComponent(name)}`,
        ),
      ]);
      const series = (range.data?.downloads ?? []).map((d) => d.downloads);
      return {
        name,
        downloads: point.data?.downloads ?? null,
        series,
        error: point.error ?? range.error,
      };
    }),
  );

  const marketplace = await safeJson<{
    statistics?: Array<{ statisticName: string; value: number }>;
  }>(
    "https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json;api-version=7.2-preview.1",
      },
      body: JSON.stringify({
        filters: [
          {
            criteria: [{ filterType: 7, value: "prismhq.repo-prism" }],
          },
        ],
        flags: 914,
      }),
    },
  );

  let installs: number | null = null;
  let rating: number | null = null;
  const ext = (
    marketplace.data as {
      results?: Array<{
        extensions?: Array<{
          statistics?: Array<{ statisticName: string; value: number }>;
        }>;
      }>;
    } | null
  )?.results?.[0]?.extensions?.[0];
  if (ext?.statistics) {
    installs =
      ext.statistics.find((s) => s.statisticName === "install")?.value ?? null;
    rating =
      ext.statistics.find((s) => s.statisticName === "averagerating")?.value ??
      null;
  }

  const openVsx = await safeJson<{ downloadCount?: number }>(
    "https://open-vsx.org/api/prismhq/repo-prism",
  );

  let cliCommands: number | null = null;
  let mcpTools: number | null = null;
  try {
    const cli = await import(
      pathToFileURLSafe(path.join(repoRoot, "packages/cli/dist/index.js"))
    );
    cliCommands = Array.isArray(cli.COMMANDS) ? cli.COMMANDS.length : null;
  } catch {
    cliCommands = null;
  }
  try {
    const mcp = await import(
      pathToFileURLSafe(
        path.join(repoRoot, "packages/mcp-server/dist/index.js"),
      )
    );
    mcpTools = Array.isArray(mcp.TOOL_NAMES) ? mcp.TOOL_NAMES.length : null;
  } catch {
    mcpTools = null;
  }

  return {
    fetchedAt: new Date().toISOString(),
    github: {
      stars: github.data?.stargazers_count ?? null,
      forks: github.data?.forks_count ?? null,
      openIssues: github.data?.open_issues_count ?? null,
      error: github.error,
    },
    npm,
    marketplace: {
      installs,
      rating,
      error: marketplace.error,
    },
    openVsx: {
      downloads: openVsx.data?.downloadCount ?? null,
      error: openVsx.error,
    },
    release: {
      latest: releases[0]?.version ?? null,
      entries: releases.length,
      daysSince: null,
    },
    surfaces: { cliCommands, mcpTools },
    docsHealth: await docsHealth(repoRoot),
  };
}

function pathToFileURLSafe(filePath: string) {
  return new URL(`file://${filePath}`).href;
}
