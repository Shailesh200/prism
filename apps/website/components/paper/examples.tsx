import { Chat, ReviewCard, Terminal, ToolChip } from "./blocks";
import { ExamplePair } from "./example-pair";

export function PrepareExample() {
  return (
    <ExamplePair
      agent={
        <Chat
          title="Cursor"
          items={[
            { who: "you", body: "Add VAT to the invoice totals." },
            {
              who: "prism",
              body: (
                <>
                  <ToolChip name="prepare_change" />
                  Files to open, helpers to reuse, House Style, notes, and a work order. Paths and names only — never file bodies.
                  <br />
                  pack · src/billing/totals.ts
                  <br />
                  reuse · formatMoney
                  <br />
                  tests · src/billing/totals.test.ts
                </>
              ),
            },
            { who: "agent", body: "I'll start in totals.ts and extend the test that already covers it." },
          ]}
        />
      }
      terminal={
        <Terminal
          command='prism prepare "add VAT to the invoice totals"'
          lines={[
            <span key="1" className="d">
              pack
            </span>,
            "  src/billing/totals.ts",
            <span key="2" className="d">
              reuse
            </span>,
            "  formatMoney",
            <span key="3" className="d">
              tests
            </span>,
            "  src/billing/totals.test.ts",
            <span key="4" className="d">
              work order · off-limits listed, nothing written
            </span>,
          ]}
        />
      }
    />
  );
}

export function RefsExample() {
  return (
    <ExamplePair
      agent={
        <Chat
          title="Claude Code"
          items={[
            { who: "you", body: "Where do we call getUser?" },
            {
              who: "prism",
              body: (
                <>
                  <ToolChip name="find_references" />
                  Resolved references to getUser. Two symbols with the same name stay ambiguous — they are not merged.
                </>
              ),
            },
            { who: "agent", body: "Two call sites. I'll open those files before editing." },
          ]}
        />
      }
      terminal={
        <Terminal
          command="prism refs getUser"
          lines={[
            "src/auth/session.ts",
            "src/api/users.ts",
            <span key="m" className="d">
              edges carry measured, heuristic, or inferred
            </span>,
          ]}
        />
      }
    />
  );
}

export function BlastExample() {
  return (
    <ExamplePair
      agent={
        <Chat
          title="Cursor"
          items={[
            { who: "you", body: "What depends on totals.ts?" },
            {
              who: "prism",
              body: (
                <>
                  <ToolChip name="blast_radius" />
                  Dependents, tests likely affected, and a risk band: low, mid, or high.
                </>
              ),
            },
          ]}
        />
      }
      terminal={
        <Terminal
          command="prism blast src/billing/totals.ts"
          lines={[
            <span key="b">
              band <span className="y">mid</span> · Moderate Impact
            </span>,
            "affected · invoice.ts, checkout.ts",
            "tests · totals.test.ts",
          ]}
        />
      }
    />
  );
}

export function TestsExample() {
  return (
    <ExamplePair
      agent={
        <Chat
          title="Codex"
          items={[
            { who: "you", body: "Which tests cover totals.ts?" },
            {
              who: "prism",
              body: (
                <>
                  <ToolChip name="test_impact" />
                  The test files that reach this target.
                </>
              ),
            },
          ]}
        />
      }
      terminal={
        <Terminal
          command="prism test-impact src/billing/totals.ts"
          lines={["src/billing/totals.test.ts"]}
        />
      }
    />
  );
}

export function GuardExample() {
  return (
    <ExamplePair
      agent={
        <Chat
          title="Claude Code"
          items={[
            { who: "you", body: "What should I read before I land this?" },
            {
              who: "prism",
              body: (
                <>
                  <ToolChip name="guard_session" />
                  Dirty files ranked by blast. Off-limits paths are on the work order from prepare_change. The veto stays off unless an Accepted ADR arms it.
                </>
              ),
            },
          ]}
        />
      }
      terminal={
        <Terminal
          command="prism review"
          lines={[
            <span key="1">
              band <span className="y">mid</span>
            </span>,
            "read first · src/billing/totals.ts",
          ]}
        />
      }
    />
  );
}

export function RenameExample() {
  return (
    <ExamplePair
      agent={
        <Chat
          title="Cursor"
          items={[
            { who: "you", body: "Rename getUser to fetchUser safely." },
            {
              who: "prism",
              body: (
                <>
                  <ToolChip name="rename_impact" />
                  Every edit site a rename would touch. Prism does not write the rename.
                </>
              ),
            },
          ]}
        />
      }
      terminal={
        <Terminal
          command="prism rename getUser fetchUser --symbol"
          lines={["src/auth/session.ts", "src/api/users.ts"]}
        />
      }
    />
  );
}

export function SafeDeleteExample() {
  return (
    <ExamplePair
      agent={
        <Chat
          title="opencode"
          items={[
            { who: "you", body: "Can I delete cart.ts?" },
            {
              who: "prism",
              body: (
                <>
                  <ToolChip name="safe_delete" />
                  Blockers that still depend on it. A report only — Prism never deletes the file.
                </>
              ),
            },
          ]}
        />
      }
      terminal={
        <Terminal
          command="prism safe-delete src/cart.ts"
          lines={["blocked · checkout.ts still imports it"]}
        />
      }
    />
  );
}

export function ReviewExample() {
  return (
    <ExamplePair
      agent={<ReviewCard />}
      terminal={
        <Terminal
          command="prism review --base origin/main --fail-on high"
          lines={[
            "band · mid · Moderate Impact",
            "changed · 3",
            <span key="e" className="d">
              exit 1 when the band is at or above the flag
            </span>,
          ]}
        />
      }
    />
  );
}

export function EnvelopeExample() {
  return (
    <ExamplePair
      agent={
        <Chat
          title="Cursor"
          items={[
            { who: "you", body: "What did Prism record for that call?" },
            {
              who: "prism",
              body: (
                <>
                  <ToolChip name="envelope" />
                  One local line per Intelligence call: tool name, item counts, whether the list was cut, and JSON bytes. No prompts, paths, or source.
                </>
              ),
            },
          ]}
        />
      }
      terminal={
        <Terminal
          title="~/.prism/envelope-ledger.jsonl"
          lines={[
            '{ "tool": "prepare_change", "truncated": false }',
            <span key="n" className="d">
              bytes only — never source
            </span>,
          ]}
        />
      }
    />
  );
}

export function HabitExample() {
  return (
    <ExamplePair
      agent={
        <Chat
          title="Cursor"
          items={[
            { who: "you", body: "Start my day." },
            {
              who: "prism",
              body: (
                <>
                  <ToolChip name="start_my_day" />
                  A standup for this repo: yesterday, open items, leftover jobs, and one suggested focus. Unconnected tools are named, not invented.
                </>
              ),
            },
          ]}
        />
      }
      terminal={
        <Terminal
          command="prism doctor"
          lines={[
            <span key="1" className="d">
              There is no prism habit command in this release.
            </span>,
            "Ask the agent: start my day",
          ]}
        />
      }
    />
  );
}

export function MapExample() {
  return (
    <ExamplePair
      agent={
        <Chat
          title="Claude Code"
          items={[
            { who: "you", body: "What is this repository?" },
            {
              who: "prism",
              body: (
                <>
                  <ToolChip name="repository_map" />
                  Clusters, landmarks, and layers. <ToolChip name="repository_dna" /> names the stack.
                </>
              ),
            },
          ]}
        />
      }
      terminal={
        <Terminal
          command="prism map"
          lines={["landmarks · src/index.ts", "zoom · package"]}
        />
      }
    />
  );
}

export function DoctorExample() {
  return (
    <Terminal
      command="prism doctor"
      lines={[
        "Workspace   git root",
        "Index       built on first use",
        <span key="n" className="d">
          {`npx -y @repo-prism/cli doctor`}
        </span>,
      ]}
    />
  );
}
