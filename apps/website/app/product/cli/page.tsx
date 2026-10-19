import { ChatTerminalPair } from "@/components/ui/chat-terminal-pair";
import { Container } from "@/components/ui/container";
import { Ln, Typed, cells } from "@/components/ui/term";
import { Bubble, ToolTag, Window } from "@/components/ui/window";
import {
  ExampleRow,
  ProductHero,
  ProductPage,
} from "@/components/site/product-page";
import { MapLines, StartDemo } from "@/components/site/demos";
import { pageMetadata } from "@/lib/seo";
import { PRISM_VERSION } from "@/lib/version";

export const metadata = pageMetadata({
  title: "CLI",
  description:
    "Everything your agent can ask Prism, you can ask too: prism refs, prism blast, prism review, prism receipts and more.",
  path: "/product/cli",
});

/** Command groups; every name is a real `prism` command. */
const GROUPS: Array<{ title: string; commands: Array<[string, string]> }> = [
  {
    title: "Set up",
    commands: [
      ["prism start", "Connect the agents on this machine and index the repo."],
      ["prism install", "Point an agent at the local Prism server."],
      [
        "prism upgrade",
        "Point those agents at the version you just installed.",
      ],
      [
        "prism uninstall",
        "Remove that connection. Add --purge to delete local data.",
      ],
    ],
  },
  {
    title: "Diagnose",
    commands: [
      ["prism doctor", "Check the repo, the index, and each connected agent."],
      ["prism strength", "Set how much the hooks do: full, lite, or off."],
      ["prism stats", "Timings and outcomes from the local event log."],
      ["prism index", "Build or refresh the repository index."],
      ["prism graph", "Daemon status, a map, or an export of the graph."],
      ["prism data prune", "Show old local data. Add --yes to delete it."],
      ["prism completions", "Print a bash, zsh, or fish completion script."],
    ],
  },
  {
    title: "Understand a repository",
    commands: [
      ["prism overview", "What this repository is: stack and landmarks."],
      ["prism explain", "What a file or folder is for."],
      ["prism explore", "Usages, ownership, and similar code."],
      ["prism packages", "Every package in the workspace."],
      ["prism findings list", "Unused exports, duplicates, and wrappers."],
      [
        "prism agents-md generate",
        "A living AGENTS.md. It is not written into the repo.",
      ],
    ],
  },
  {
    title: "Assess a change",
    commands: [
      ["prism prepare", "The files to open, and the house style for a task."],
      ["prism blast", "What breaks if this file or symbol changes."],
      ["prism review", "Findings for the change, then a Receipt."],
      ["prism safe-delete", "Whether a file or symbol can be removed."],
      ["prism rename", "Every edit site a rename would touch."],
      ["prism test-impact", "Tests the change can reach."],
      ["prism receipts", "Receipts saved for this repository."],
      ["prism lens list", "Review lenses, shared by every repository."],
    ],
  },
  {
    title: "Inspect structure",
    commands: [
      ["prism deps", "The dependency graph and its most connected files."],
      ["prism cycles", "Import and re-export cycles."],
      ["prism symbol", "Where a name is declared."],
      ["prism refs", "Who references a symbol."],
      ["prism route", "How one file reaches another."],
    ],
  },
  {
    title: "Memory",
    commands: [
      ["prism habit list", "Routines saved for any agent to run."],
      ["prism remember", "Save a note for this repository."],
      ["prism memories", "List the notes saved here."],
      ["prism forget", "Remove a note by id or by text."],
    ],
  },
];

/** Lines from `prism doctor` (it prints a few more: Node, Workspace, Index cache). */
const DOCTOR: Array<[string, string]> = [
  ["Git", "repository found"],
  ["Install", `${PRISM_VERSION} for your agents`],
  ["Index", "fresh"],
  ["Strength", "full (default); change with `prism strength`"],
];

export default function CliPage() {
  return (
    <ProductPage slug="cli">
      <ProductHero
        title={
          <>
            Every answer, <em>in your terminal.</em>
          </>
        }
        lede={
          <>
            Everything your agent can ask Prism, you can ask too. Start with{" "}
            <code>prism start</code>, then try <code>prism refs</code>,{" "}
            <code>prism blast</code>, <code>prism review</code> or{" "}
            <code>prism receipts</code>.
          </>
        }
        pair={<StartDemo />}
      />

      <section className="sec">
        <Container>
          <div className="grid3">
            {GROUPS.map((group) => (
              <div className="card fx" key={group.title}>
                <h2 className="t">{group.title}</h2>
                <ul className="cmds">
                  {group.commands.map(([name, summary]) => (
                    <li key={name}>
                      <code>{name}</code>
                      {summary}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-6 text-ink3">
            <code>prism --help</code> lists every command, and{" "}
            <code>prism &lt;command&gt; --help</code> shows its options.
          </p>
        </Container>
      </section>

      <ExampleRow
        title="Who calls this?"
        lede={
          <>
            <code>prism refs</code> lists every reference to a symbol.
          </>
        }
      >
        <ChatTerminalPair
          chat={
            <Window title="Your agent" kind="chat">
              <Bubble who="you">Where do we call getUser?</Bubble>
              <Bubble who="prism">
                <ToolTag>graph</ToolTag> mode: neighbors · direction: in
                <br />
                getUser function · src/users/api.ts
                <br />← src/pages/checkout.ts references · measured
                <br />← src/users/profile.ts references · measured
              </Bubble>
              <Bubble who="agent" name="Agent">
                getUser is called in two places: checkout.ts and profile.ts.
                Both pass a user id.
              </Bubble>
            </Window>
          }
          terminal={
            <Window title="~/northwind">
              <Typed cmd="prism refs getUser" />
              <Ln>
                <span className="w">2 references</span>
              </Ln>
              <Ln />
              <Ln>
                <span className="d">{cells(21, "PATH", "KIND  OFFSET")}</span>
              </Ln>
              <Ln>{cells(21, "src/pages/checkout.ts", "call     232")}</Ln>
              <Ln>{cells(21, "src/users/profile.ts", "call     117")}</Ln>
            </Window>
          }
        />
      </ExampleRow>

      <ExampleRow
        title="A map of your repo"
        lede={
          <>
            <code>prism graph map</code> prints the most connected files with
            their symbols, callers and callees.
          </>
        }
      >
        <Window title="~/northwind">
          <Typed cmd="prism graph map --budget 400" />
          {MapLines()}
        </Window>
      </ExampleRow>

      <ExampleRow
        title="Check your setup"
        lede={
          <>
            <code>prism doctor</code> checks the repo, the index, each connected
            agent and the strength.
          </>
        }
      >
        <Window title="~/northwind">
          <Typed cmd="prism doctor" />
          {DOCTOR.map(([k, v]) => (
            <Ln key={k}>
              <span className="g">ok</span>
              {"   "}
              {k.padEnd(13)}
              {v}
            </Ln>
          ))}
        </Window>
      </ExampleRow>
    </ProductPage>
  );
}
