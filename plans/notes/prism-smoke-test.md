# Prism smoke test (Round 3 build)

This is a hand check of the local build, roughly 30–40 minutes. Do the steps in order. Each step says what to type and what you should see. If a step shows something different, note the step number and what you saw.

## 0. Before you start

- Use Node 24: `nvm use 24`.
- Build and link the local checkout. This points Claude Code, Cursor and opencode at this folder and nothing published:
  ```
  cd ~/Prism && bun install && bun run dev:link
  ```
  **You should see:** `dev:link: reload Cursor and Claude Code, then run: prism doctor --surfaces`.
  The files it edits are backed up under `~/.prism/backup/<time>/`. You can undo it with `bun run dev:unlink`.
- Use the local CLI in this shell:
  ```
  alias prism="node ~/Prism/packages/cli/dist/cli.js"
  ```
- Set up a scratch repository to try things in, so no real project is touched:
  ```
  git clone https://github.com/toss/es-toolkit ~/prism-smoke
  cd ~/prism-smoke
  corepack yarn install
  ```

## 1. Install points to the local build

- Run: `prism doctor --surfaces`
  - **You should see:** every host you use (Claude Code, Cursor, opencode) listed as connected.
  - The Prism server path should be `~/Prism/packages/mcp-server/dist/bin.js`. It must not be an npm or npx path.
- Open Claude Code in `~/prism-smoke` and run `/mcp`.
  - **You should see:** `prism` connected.

## 2. A small change (Dev lens and receipt)

- In Claude Code, type: `Fix chunk in src/array/chunk.ts so a size of 2.5 throws a clear error.`
  - **You should see:**
    - The first answer mentions src/array/chunk.ts.
    - The change stays small, just one guard.
    - A test is added or run.
  - **When it stops:** a grey Prism line such as `Prism · SHIP` or `Prism · NOT PROVEN (untested)`. The next line is `Prism receipt: changed N files, … — …`.
  - If a check fails, the stop line can say so. Then run `git status`. Your edits must still be there, and no file may be put back by Prism. This is the Round 3 fix: the check re-run now happens in a throwaway copy.

## 3. Follow-up conversation (session memory)

- In the same session, type: `Next: also make chunk reject negative sizes, same rules as before.`
  - **You should see:**
    - The agent goes straight to the same file.
    - Prism does not paste the same file list again: a follow-up only gets files that are new to this session, or nothing.
    - The earlier fix is still in place (`git diff` shows both).
- Type a third turn: `Next: add a test for an empty array.`
  - **You should see:**
    - The same behaviour.
    - The earlier edits are not undone.
    - The stop line appears again.

## 4. Each lens

Open a new session for each prompt. A lens shows once per session.

| Type this | You should see |
|---|---|
| `Fix the typo in a comment in src/array/chunk.ts` | Nothing from Prism: a trivial edit gets no lens or files |
| `Refactor uniqBy in src/array/uniqBy.ts to avoid the extra pass` | The Dev lens: smallest complete change, reuse before you write |
| `Review the architecture of src/array for coupling problems. Do not edit.` | The Architect lens: structure, boundaries, blast radius. No edits |
| `Use Prism's QA lens. Find the bug in src/array/chunk.ts. Add one failing test and do not change the source.` | The QA lens: only a test file changes, and it names the bug |

With Cursor or opencode, the lens arrives in the answer to `prepare_change`, as its first field. Ask the agent "what lens did Prism give you?" and it should name it. This is the Round 3 fix for opencode.

## 5. The review skill

- Make any small edit and leave it uncommitted. In Claude Code, run `/prism:prism-review`.
  - **You should see:**
    - The reply opens with the risk.
    - It names the changed files and their blast radius (which files depend on them).
    - It posts nothing anywhere.
- Ask without the command: `Review my current change.`
  - **You should see:** the same kind of review, plus the Architect lens.

## 6. A custom habit

- Add it:
  ```
  prism habit add "repo pulse" --output checklist --description "Quick state of this repository" --step "git: list the subjects of the last 3 commits" --step "shell: count the .ts files in src/array, spec files excluded"
  ```
  Then check that `prism habit list` shows `repo pulse`.
- In a new session, type: `Run my repo pulse habit.`
  - **You should see:**
    - A checklist with the last 3 commit subjects.
    - The right .ts count. Check it with `git ls-files 'src/array/*.ts' | grep -vc spec`.
- Type: `Give me my repo pulse.` (the habit is not named as such)
  - **You should see:** the same checklist.
- Clean up: `prism habit remove "repo pulse"`.

## 7. A custom skill

- Create `~/prism-smoke/.claude/skills/safe-change/SKILL.md` with this content:
  ```
  ---
  name: safe-change
  description: Use when the user asks whether changing a function or its signature is safe.
  ---

  1. Call Prism's `blast_radius` on the symbol.
  2. Reply with exactly these lines:
     Dependents: <number of files that depend on it>
     then one dependent file path per line,
     then `Verdict: contained` or `Verdict: far-reaching`.
  ```
- In a new session, type: `Is it safe to change the signature of chunk in src/array/chunk.ts? Do not edit any file.`
  - **You should see:**
    - The agent uses the skill and calls Prism's blast radius.
    - It replies in exactly that format, with real dependent paths.
    - No files change.
- Run `prism doctor skills`.
  - **You should see:** `safe-change` listed as a skill that uses Prism tools.

## 8. A custom lens (optional)

- Add it:
  ```
  prism lens add perf --name Perf --role "Performance reviewer for repeated work inside loops" --focus "Find work repeated inside loops" --trigger "perf pass"
  ```
- In a new session, type: `Do a perf pass on src/array/uniqBy.ts. Do not edit any file.`
  - **You should see:** a Perf lens answer that names the loops. No edits.
- Clean up: `prism lens remove perf`.

## 9. While Prism is busy

- Type `git checkout HEAD~20`, then quickly `git checkout -`. This makes Prism re-index.
- Then, in a new session, type a change prompt straight away.
  - **You should see:**
    - The lens still arrives at once.
    - The file list may be missing for this one prompt and comes back on the next prompt once the index is done.
  - Before Round 3 this prompt got nothing. If the Mac is swapping heavily, the whole prompt hook can miss its 1 s cap, and then nothing is added. Note it if that happens.

## 10. Finish

- `bun run dev:unlink` restores your earlier host settings, if you want them back.
- `rm -rf ~/prism-smoke`
