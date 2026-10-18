import { ChatTerminalPair } from "@/components/ui/chat-terminal-pair";
import {
  Failed,
  Ln,
  PrepareFields,
  Proven,
  Typed,
  cells,
} from "@/components/ui/term";
import { Bubble, ToolTag, Window } from "@/components/ui/window";
import { PRISM_VERSION } from "@/lib/version";

/** Chat/terminal demos shared by the product pages, /how-it-works and the install pages. */

const PROMPT = "add VAT to invoice totals";

/** `prism review` prints its fields padded to the widest label, then a table. */
/** Sources Prism knows (HABIT_SOURCES); any other label gets a note. */
const KNOWN = new Set([
  "github",
  "linear",
  "notion",
  "slack",
  "gmail",
  "calendar",
  "jira",
]);

export type Habit = {
  name: string;
  description?: string;
  steps: string[];
  output: "standup" | "summary" | "checklist" | "table";
  agent: string;
  reply: string;
};

function addCommand(h: Habit) {
  const desc = h.description ? ` --description "${h.description}"` : "";
  const steps = h.steps.map((s) => ` --step "${s}"`).join("");
  return `prism habit add "${h.name}"${desc}${steps} --output ${h.output}`;
}

export function HabitPair({ habit }: { habit: Habit }) {
  const unknown = habit.steps.some(
    (s) => !KNOWN.has(s.slice(0, s.indexOf(":"))),
  );
  return (
    <ChatTerminalPair
      chat={
        <Window title={habit.agent} kind="chat">
          <Bubble who="you">run my {habit.name} habit</Bubble>
          <Bubble who="prism">
            <ToolTag>habits</ToolTag> “{habit.name}” · {habit.output}
            {habit.steps.map((s, i) => (
              <span key={s}>
                <br />
                {i + 1}. {s}
              </span>
            ))}
            {unknown && (
              <>
                <br />
                <span className="d">
                  note: unknown source label: use whichever tool fits
                </span>
              </>
            )}
          </Bubble>
          <Bubble who="agent" name={habit.agent}>
            {habit.reply}
          </Bubble>
        </Window>
      }
      terminal={
        <Window title="~/northwind">
          <Typed cmd={addCommand(habit)} />
          <Ln>
            Added habit “{habit.name}” ({habit.steps.length} steps). Ask your
            agent: “run my {habit.name} habit”.
          </Ln>
        </Window>
      }
    />
  );
}

/** A short, real-format slice of `prism graph map` for the demo repo. */
const MAP = [
  "# Prism repo map",
  "## src/billing/totals.ts",
  "  computeTotals  (src/billing/totals.ts:4)",
  "  callers: src/billing/credit-note.ts, src/billing/invoice.ts",
  "  callees: src/lib/money.ts",
  "## src/lib/money.ts",
  "  formatMoney  (src/lib/money.ts:1)",
  "  callers: src/billing/invoice.ts, src/billing/totals.ts",
];

export function MapChat() {
  return (
    <Window title="Your agent" kind="chat">
      <Bubble who="you">What is in this repo?</Bubble>
      <Bubble who="prism">
        <ToolTag>graph</ToolTag> mode: map
        <br />
        ## src/billing/totals.ts · callers: credit-note.ts, invoice.ts
        <br />
        ## src/lib/money.ts · callers: invoice.ts, totals.ts
      </Bubble>
      <Bubble who="agent" name="Agent">
        Billing lives in src/billing. Money helpers are in src/lib/money.ts.
      </Bubble>
    </Window>
  );
}

export const MapLines = () =>
  MAP.map((line) => (
    <Ln key={line}>
      {line.startsWith("#") ? (
        <span className="w">{line}</span>
      ) : (
        <span className="d">{line}</span>
      )}
    </Ln>
  ));

/** Step 1: the repo map, from the agent and from `prism start`. */
export function StartDemo() {
  return (
    <ChatTerminalPair
      chat={<MapChat />}
      terminal={
        <Window title="~/northwind">
          <Typed cmd="prism start" />
          <Ln>
            <span className="d">Installing for your agent…</span>
          </Ln>
          <Ln>Prism {PRISM_VERSION} installed for your agent.</Ln>
          <Ln>Indexed 12 files in 0.1 s.</Ln>
          <Ln />
          {MapLines().slice(0, 5)}
          <Ln />
          <Ln>
            <span className="g">Try:</span> prism prepare
            &quot;&lt;task&gt;&quot;, or ask your agent; it calls prepare_change
            first.
          </Ln>
        </Window>
      }
    />
  );
}

/** Step 2: Prepare adds the files, tests and reuse to the request. */
export function PrepareDemo() {
  return (
    <ChatTerminalPair
      chat={
        <Window title="Your agent" kind="chat">
          <Bubble who="you">
            Add VAT to computeTotals in the billing totals
          </Bubble>
          <Bubble who="prism">
            <span className="w">Prism · files for this task:</span>
            <br />- src/billing/totals.ts: matches compute, total
            <br />
            {"  3: function computeTotals(lines: Line[])"}
            <br />
            Tests: test/invoice.test.ts, test/totals.test.ts
            <br />
            <span className="d">Run:</span> npx vitest run test/invoice.test.ts
            test/totals.test.ts
          </Bubble>
          <Bubble who="agent" name="Agent">
            Starting in totals.ts and running those two tests after.
          </Bubble>
        </Window>
      }
      terminal={
        <Window title="~/northwind">
          <Typed cmd={`prism prepare "${PROMPT}"`} />
          <Ln>
            <span className="w">Prepare: {PROMPT}</span>
          </Ln>
          <Ln />
          <PrepareFields files={4} tests={2} reuse={1} />
          <Ln />
          <Ln>
            <span className="d">{cells(23, "PATH", "WHY")}</span>
          </Ln>
          <Ln>{cells(23, "src/billing/invoice.ts", "seed file")}</Ln>
          <Ln>{cells(23, "src/billing/totals.ts", "import distance 1")}</Ln>
          <Ln>{cells(23, "src/checkout/summary.ts", "import distance 2")}</Ln>
          <Ln>{cells(23, "src/lib/money.ts", "import distance 2")}</Ln>
          <Ln />
          <Ln>
            <span className="d">Reuse</span>
          </Ln>
          <Ln>{"  invoiceTotal  src/billing/invoice.ts"}</Ln>
        </Window>
      }
    />
  );
}

/** Step 3: the edit hook denies a generated file; strength in the terminal. */
export function GuardDemo() {
  return (
    <ChatTerminalPair
      chat={
        <Window title="Your agent" kind="chat">
          <Bubble who="you">Add an email field to the API schema</Bubble>
          <Bubble who="prism">
            <span className="r">✗ Denied:</span> src/api/generated/schema.ts is
            generated. Do not edit generated or vendored files.
          </Bubble>
          <Bubble who="agent" name="Agent">
            That file is generated. I’ll change its source and regenerate it.
          </Bubble>
        </Window>
      }
      terminal={
        <Window title="~/northwind">
          <Typed cmd="prism strength lite" />
          <Ln>Strength set to lite in /Users/sam/.prism/config.json.</Ln>
          <Typed cmd="prism strength" />
          <Ln>Strength: lite (~/.prism/config.json)</Ln>
        </Window>
      }
    />
  );
}

/** Step 4: a NO-SHIP receipt from a real failing test. */
export function VerifyDemo() {
  return (
    <ChatTerminalPair
      chat={
        <Window title="Your agent" kind="chat">
          <Bubble who="you">Tidy up the reduce in computeTotals</Bubble>
          <Bubble who="agent" name="Agent">
            Done. The reduce in computeTotals is shorter now.
          </Bubble>
          <Bubble who="prism">
            <span className="r">Prism · NO-SHIP (1 check failed)</span>
            <br />
            Prism receipt: changed 1 file, 5 dependents, 2 tests reach it —
            NO-SHIP
            <br />
            <Proven />
            <br />
            <Failed />
          </Bubble>
          <Bubble who="agent" name="Agent">
            The test caught it: I wrote price + qty instead of price * qty.
            Fixed, and the next receipt says SHIP.
          </Bubble>
        </Window>
      }
      terminal={
        <Window title="~/northwind">
          <Typed cmd="prism receipts show 1" />
          <Ln>
            <span className="r">Prism · NO-SHIP (1 check failed)</span>
          </Ln>
          <Ln>
            Prism receipt: changed 1 file, 5 dependents, 2 tests reach it —
            NO-SHIP
          </Ln>
          <Ln>
            <Proven />
          </Ln>
          <Ln>
            <Failed />
          </Ln>
        </Window>
      }
    />
  );
}

/** Review: the guard_session card in the chat, `prism review` in the terminal. */
export function ReviewDemo() {
  return (
    <ChatTerminalPair
      chat={
        <Window title="Your agent" kind="chat">
          <Bubble who="you">Review my changes before I open a PR</Bubble>
          <Bubble who="prism">
            <div className="rvw">
              <div className="rv-h">
                <ToolTag>guard_session</ToolTag>
                <span>review: true · this session</span>
              </div>
              <div className="rv-stats">
                <span>
                  <b>1</b> finding
                </span>
              </div>
              <div className="rv-f">
                <div className="rv-fh">
                  <span className="sev">Critical</span>
                </div>
                <div className="rv-w">
                  <b>1.</b> A caller was left unchanged (<b>src/report.ts</b>)
                </div>
                <div className="rv-fix">
                  Change: update that caller, then review again.
                </div>
              </div>
              <div className="rv-why">
                A caller of the changed function was left unchanged.
              </div>
              <div className="rv-stats rv-end">
                <span>
                  Receipt <b>NO-SHIP</b>
                </span>
              </div>
            </div>
          </Bubble>
          <Bubble who="agent" name="Agent">
            One Critical finding: a caller in src/report.ts was left unchanged.
            I’ll update it, then review again.
          </Bubble>
        </Window>
      }
      terminal={
        <Window title="~/northwind">
          <Typed cmd="prism review" />
          <Ln>
            <span className="w">Review</span>
          </Ln>
          <Ln>1 finding</Ln>
          <Ln />
          <Ln>
            <span className="w">Critical</span>
          </Ln>
          <Ln>
            1. <span className="w">A caller was left unchanged</span>{" "}
            (`src/report.ts`)
          </Ln>
          <Ln>
            <span className="d"> - This code: </span>one caller still uses the
            old result
          </Ln>
          <Ln>
            <span className="d"> - Change: </span>update that caller
          </Ln>
          <Ln />
          <Ln>A caller of the changed function was left unchanged.</Ln>
          <Ln />
          <Ln>
            <span className="w">Receipt</span>
          </Ln>
          <Ln>
            <span className="r">NO-SHIP</span>
          </Ln>
        </Window>
      }
    />
  );
}

/** safe_delete names what still imports a file. */
export function SafeDeleteDemo() {
  return (
    <ChatTerminalPair
      chat={
        <Window title="Your agent" kind="chat">
          <Bubble who="you">Can I delete src/legacy/cart.js?</Bubble>
          <Bubble who="prism">
            <ToolTag>safe_delete</ToolTag>
            <br />
            Not safe: 1 file still depends on it.
            <br />
            src/pages/checkout.ts imports src/legacy/cart.js
          </Bubble>
          <Bubble who="agent" name="Agent">
            Not yet. I’ll move checkout.ts off cart.js first.
          </Bubble>
        </Window>
      }
      terminal={
        <Window title="~/northwind">
          <Typed cmd="prism safe-delete src/legacy/cart.js" />
          <Ln>
            <span className="w">Safe delete: src/legacy/cart.js</span>
          </Ln>
          <Ln />
          <Ln>
            <span className="r">Not safe — 1 file still depends on it.</span>
          </Ln>
          <Ln />
          <Ln>
            <span className="d">{cells(21, "BLOCKED BY", "WHY")}</span>
          </Ln>
          <Ln>
            {cells(21, "src/pages/checkout.ts", "imports src/legacy/cart.js")}
          </Ln>
        </Window>
      }
    />
  );
}
