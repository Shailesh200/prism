import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/**
 * A repository on disk, built for one test and thrown away after it.
 *
 * Every committed fixture in this repository is git-less, which quietly made a
 * whole class of behaviour untestable: ownership, activity, changed paths and
 * change review all read git and all silently degrade to "no data" without it.
 * Tests over those paths were therefore asserting the degraded answer. Building
 * fixtures in a temp directory means they can have real history (M-037).
 */
export type Fixture = {
  /** Absolute path to the repository root. */
  readonly root: string;
  /** Write a file, creating parent directories. Relative to the root. */
  write(path: string, contents: string): Promise<void>;
  /** Run a git command in the fixture. Throws on failure. */
  git(...args: string[]): string;
  /** Stage everything and commit. Returns the commit sha. */
  commit(message: string, options?: CommitOptions): string;
  /** Remove the directory. Safe to call twice. */
  cleanup(): Promise<void>;
};

export type CommitOptions = {
  readonly author?: string;
  readonly email?: string;
  /** ISO date. Useful for history that needs to look old. */
  readonly date?: string;
};

export type FixtureOptions = {
  /** Prefix for the temp directory, to make a stray leftover identifiable. */
  readonly name?: string;
  /** Initialise a git repository. Default true — that is the point of this. */
  readonly git?: boolean;
};

export async function createFixture(
  options: FixtureOptions = {},
): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), `prism-${options.name ?? "fx"}-`));

  const git = (...args: string[]): string =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();

  const fixture: Fixture = {
    root,

    async write(path, contents) {
      const absolute = join(root, path);
      await mkdir(dirname(absolute), { recursive: true });
      await writeFile(absolute, contents, "utf8");
    },

    git,

    commit(message, commitOptions = {}) {
      const author = commitOptions.author ?? "Fixture Author";
      const email = commitOptions.email ?? "fixture@example.invalid";
      git("add", "-A");

      // Identity and date are passed per-commit rather than configured once, so
      // a test that wants several authors or a specific history shape can have
      // one without reaching for the global git config.
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        GIT_AUTHOR_NAME: author,
        GIT_AUTHOR_EMAIL: email,
        GIT_COMMITTER_NAME: author,
        GIT_COMMITTER_EMAIL: email,
      };
      if (commitOptions.date) {
        env.GIT_AUTHOR_DATE = commitOptions.date;
        env.GIT_COMMITTER_DATE = commitOptions.date;
      }

      execFileSync(
        "git",
        ["commit", "--quiet", "--no-gpg-sign", "-m", message],
        {
          cwd: root,
          env,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );

      return git("rev-parse", "HEAD");
    },

    async cleanup() {
      await rm(root, { recursive: true, force: true });
    },
  };

  if (options.git !== false) {
    git("init", "--quiet", "--initial-branch=main");
    // Local config so the fixture does not inherit — or depend on — whatever
    // the machine running the tests happens to have set.
    git("config", "user.name", "Fixture Author");
    git("config", "user.email", "fixture@example.invalid");
    git("config", "commit.gpgsign", "false");
  }

  return fixture;
}
