import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { ChatTerminalPair } from "@/components/ui/chat-terminal-pair";
import { Container } from "@/components/ui/container";
import { CheckCircleIcon, FlaskIcon } from "@/components/ui/icons";
import { Chip } from "@/components/ui/pill";
import { Receipt } from "@/components/ui/receipt";
import { Table } from "@/components/ui/table";
import { Ln, ReceiptRow, Typed } from "@/components/ui/term";
import { Bubble, Window } from "@/components/ui/window";
import {
  ExampleRow,
  ProductHero,
  ProductPage,
} from "@/components/site/product-page";
import { VerifyDemo } from "@/components/site/demos";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Receipts",
  description:
    "When your agent stops, Prism runs your typecheck, lint and the tests the change reaches. The receipt gives one verdict: SHIP, NOT PROVEN or NO-SHIP.",
  path: "/product/receipts",
});

const Tick = () => <span className="text-ok">✓</span>;
const Cross = () => <span className="text-bad">✗</span>;

const SUMMARY = [
  { n: 1, label: "file changed" },
  { n: 5, label: "dependents" },
  { n: 2, label: "tests reach it" },
];

const TIMEOUT_WHY = (
  <>
    Reason: <b>timeout</b>. A check ran past its time limit.
  </>
);
const TIMEOUT_ROWS = [
  {
    k: "Proven",
    v: (
      <>
        typecheck <Tick />
      </>
    ),
  },
  { k: "Timed out", v: "test — timed out after 60000ms" },
];
const TIMEOUT_PROVE =
  "run: npx vitest run test/totals.test.ts (~3 s) → proves src/billing/totals.ts";

const FAILED_WHY = "The typecheck passed. A test this change reaches failed.";
const FAILED_ROWS = [
  {
    k: "Proven",
    v: (
      <>
        typecheck <Tick />
      </>
    ),
  },
  {
    k: "Failed",
    v: (
      <>
        test <Cross /> · Failed Tests 1
      </>
    ),
  },
];

const VERDICTS: Array<{
  tone: "ok" | "warn" | "bad";
  title: string;
  receipt: ReactNode;
  means: ReactNode;
  next: ReactNode;
}> = [
  {
    tone: "ok",
    title: "The checks this change reaches pass.",
    receipt: (
      <Receipt
        size="sm"
        verdict="ok"
        repo="~/northwind"
        why="The checks this change reaches pass."
        summary={SUMMARY}
        rows={[
          {
            k: "Proven",
            v: (
              <>
                2 scoped test files · typecheck <Tick /> · test <Tick />
              </>
            ),
          },
        ]}
      />
    ),
    means: "Typecheck, lint and the tests that reach the change all passed.",
    next: "Commit and push.",
  },
  {
    tone: "warn",
    title: "Something is missing, and Prism says what.",
    receipt: (
      <Receipt
        size="sm"
        verdict="warn"
        repo="~/northwind"
        why={TIMEOUT_WHY}
        summary={SUMMARY}
        rows={TIMEOUT_ROWS}
        prove={TIMEOUT_PROVE}
      />
    ),
    means:
      "No test reaches a file, a check timed out, or dependencies are missing.",
    next: "Run the Prove it command, or add the missing test.",
  },
  {
    tone: "bad",
    title: "A check this change broke.",
    receipt: (
      <Receipt
        size="sm"
        verdict="bad"
        repo="~/northwind"
        why={FAILED_WHY}
        summary={SUMMARY}
        rows={FAILED_ROWS}
      />
    ),
    means:
      "A test, the lint or the typecheck failed because of this change, or it touched an off-limits path. Checks that were already failing are kept apart.",
    next: "Fix it before you commit. Your agent sees the same receipt.",
  },
];

const ANATOMY = [
  { title: "Verdict", body: "One word first: SHIP, NOT PROVEN or NO-SHIP." },
  {
    title: "Reason",
    body: "Why, in a few words. NOT PROVEN always names one of nine reasons.",
  },
  {
    title: "What was checked",
    body: "How many files changed, what depends on them, which tests reach them, and what passed.",
  },
  {
    title: "Prove it",
    body: "For NOT PROVEN, the quickest command that would prove the change.",
  },
];

const NOT_PROVEN: Array<[reason: string, means: string]> = [
  ["untested", "A changed file has no test reaching it."],
  ["no_node_modules", "Tests reach it, but dependencies are not installed."],
  ["unknown_runner", "Tests reach it, but no known runner could run them."],
  ["skipped_offline", "Checks were not asked for."],
  [
    "still_running",
    "Checks were still running; ask again and the receipt shows them.",
  ],
  ["timeout", "A check ran past its time limit."],
  [
    "already_failing",
    "Every check that reaches it was failing before this session.",
  ],
  [
    "unsupported_language",
    "Only files in languages Prism can’t check yet changed.",
  ],
  [
    "superseded",
    "A newer change replaced this one before its checks finished.",
  ],
  [
    "no_session",
    "No session start was recorded, so the change set was never established.",
  ],
];

const FINDING =
  "src/billing/totals.ts — dependents_not_in_diff: src/billing/totals.ts changes computeTotals; not edited: src/billing/credit-note.ts, src/billing/invoice.ts → Fix this before shipping. (high risk)";

export default function ReceiptsPage() {
  return (
    <ProductPage slug="receipts">
      <ProductHero
        title={
          <>
            Your checks, <em>when the agent stops.</em>
          </>
        }
        lede="Prism runs your typecheck, lint and the tests the change reaches. The receipt gives one verdict, and its lens checks flag changed code no test covers and callers the change left behind."
        actions={
          <>
            <Chip tone="ok">SHIP</Chip>
            <Chip tone="warn">NOT PROVEN</Chip>
            <Chip tone="bad">NO-SHIP</Chip>
          </>
        }
        pair={<VerifyDemo />}
      />

      <section className="sec">
        <Container>
          <div className="eyebrow">What runs</div>
          <h2 className="d2 mt-3 mb-3">
            Your own checks, scoped to the change.
          </h2>
          <p className="lede mb-8">
            Prism never invents a command. It reads your package.json and runs
            what is there. A failure counts only when this change caused it.
          </p>
          <div className="grid3">
            <Card icon={<CheckCircleIcon />} title="Your typecheck">
              The first of <code>typecheck</code>, <code>types</code> or{" "}
              <code>check:types</code> in your package.json.
            </Card>
            <Card icon={<CheckCircleIcon />} title="Your lint">
              The first of <code>lint</code>, <code>lint:check</code> or{" "}
              <code>oxlint</code>.
            </Card>
            <Card icon={<FlaskIcon />} title="The tests that reach it">
              Only the test files the change reaches, with vitest, jest or bun.
              Otherwise your own <code>test</code> script, run in full.
            </Card>
          </div>
        </Container>
      </section>

      <section className="sec">
        <Container className="grid2">
          <div>
            <div className="eyebrow">A bug a typecheck misses</div>
            <h2 className="d3 mt-3 mb-3.5">One character, caught.</h2>
            <p className="lede text-lg">
              The agent wrote <code>+</code> where it meant <code>*</code>. The
              types still line up, so the typecheck passes. The test that
              reaches <code>computeTotals</code> fails, and the receipt says
              NO-SHIP.
            </p>
            <div className="mt-[22px]">
              <Window title="src/billing/totals.ts">
                <Ln>
                  <span className="d">@@ computeTotals</span>
                </Ln>
                <Ln>
                  <span className="dl">- … sum + l.price * l.qty, 0);</span>
                </Ln>
                <Ln>
                  <span className="al">+ … sum + l.price + l.qty, 0);</span>
                </Ln>
                <Ln>
                  <span className="d">typecheck </span>
                  <span className="g">✓ passes</span>
                  <span className="d"> · test/totals.test.ts </span>
                  <span className="r">✗ fails</span>
                </Ln>
              </Window>
            </div>
          </div>
          <Receipt
            verdict="bad"
            repo="~/northwind"
            why={FAILED_WHY}
            summary={SUMMARY}
            rows={FAILED_ROWS}
          />
        </Container>
      </section>

      <ExampleRow
        eyebrow="During review"
        title="Lenses add their checks."
        lede="Every receipt also runs the lens checks on the change. Here the tests pass, but the QA lens finds two callers the change did not update."
      >
        <ChatTerminalPair
          chat={
            <Window title="Claude Code" kind="chat">
              <Bubble who="you">
                Add an optional VAT rate to computeTotals
              </Bubble>
              <Bubble who="agent" name="Claude Code">
                Done. computeTotals takes vatRate and returns vat.
              </Bubble>
              <Bubble who="prism">
                <span className="g">Prism · SHIP</span>
                <br />
                Prism receipt: changed 1 file, 5 dependents, 2 tests reach it —
                SHIP
                <br />
                <ReceiptRow k="Proven" tone="d">
                  2 scoped test files · typecheck <span className="g">✓</span> ·
                  test <span className="g">✓</span>
                </ReceiptRow>
                <br />
                <ReceiptRow k="Finding" tone="y">
                  {FINDING}
                </ReceiptRow>
              </Bubble>
              <Bubble who="agent" name="Claude Code">
                Tests pass, and the QA lens found two callers I didn’t update.
                Updating them now.
              </Bubble>
            </Window>
          }
          terminal={
            <Window title="~/northwind">
              <Typed cmd="prism receipts show 2" />
              <Ln>
                <span className="g">Prism · SHIP</span>
              </Ln>
              <Ln>
                Prism receipt: changed 1 file, 5 dependents, 2 tests reach it —
                SHIP
              </Ln>
              <Ln>
                <ReceiptRow k="Proven" tone="d">
                  2 scoped test files · typecheck <span className="g">✓</span> ·
                  test <span className="g">✓</span>
                </ReceiptRow>
              </Ln>
              <Ln>
                <ReceiptRow k="Finding" tone="y">
                  {FINDING}
                </ReceiptRow>
              </Ln>
            </Window>
          }
        />
      </ExampleRow>

      <section className="sec">
        <Container>
          <div className="eyebrow">Anatomy</div>
          <h2 className="d2 mt-3 mb-10">Read a receipt in four lines.</h2>
          <div className="grid2 grid-cols-[minmax(0,1.1fr)_minmax(0,.9fr)] items-start">
            <Receipt
              verdict="warn"
              repo="~/northwind"
              why={TIMEOUT_WHY}
              summary={SUMMARY}
              rows={TIMEOUT_ROWS}
              prove={TIMEOUT_PROVE}
            />
            <div>
              {ANATOMY.map((item, i) => (
                <div className="ann" key={item.title}>
                  <span className="n">{i + 1}</span>
                  <div>
                    <b>{item.title}</b>
                    <p>{item.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Container>
      </section>

      <section className="sec">
        <Container>
          <div className="eyebrow">Verdicts</div>
          <h2 className="d2 mt-3 mb-9">Three verdicts.</h2>
          <div className="grid3 items-start">
            {VERDICTS.map((v) => (
              <div key={v.title}>
                <h3 className="t mb-3.5 min-h-[50px]">{v.title}</h3>
                {v.receipt}
                <div className={`vcard mt-[18px] ${v.tone}`}>
                  <p>{v.means}</p>
                  <span className="nx">
                    <b>Next:</b> {v.next}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <ExampleRow
        eyebrow="Before you push"
        title="Check the branch, too."
        lede={
          <>
            Claude Code and opencode print the receipt when the agent stops. On
            Cursor and Codex, the rule asks the agent to call{" "}
            <code>receipt</code> before it says it is done;{" "}
            <code>prism install</code> turns that tool on. Before a push,{" "}
            <code>prism review --fail-on high</code> exits 1 on a risky branch,
            and <code>prism receipts show 1 --as markdown</code> gives text for
            the pull request.
          </>
        }
      >
        <ChatTerminalPair
          chat={
            <Window title="Claude Code" kind="chat">
              <Bubble who="you">
                Add an optional VAT rate to computeTotals
              </Bubble>
              <Bubble who="agent" name="Claude Code">
                Done. computeTotals now takes vatRate and returns vat.
              </Bubble>
              <Bubble who="prism">
                <span className="g">Prism · SHIP</span>
                <br />
                Prism receipt: changed 1 file, 5 dependents, 2 tests reach it —
                SHIP
                <br />
                <ReceiptRow k="Proven" tone="d">
                  2 scoped test files · typecheck <span className="g">✓</span> ·
                  test <span className="g">✓</span>
                </ReceiptRow>
              </Bubble>
            </Window>
          }
          terminal={
            <Window title="~/northwind">
              <Typed cmd="prism receipts" />
              <Ln>
                <span className="w">Receipts (3 of 3)</span>
              </Ln>
              <Ln />
              <Ln>
                {"  1  2026-10-16 09:18  "}
                <span className="g">SHIP</span> · 1.2s
              </Ln>
              <Ln>
                {"  2  2026-10-16 09:18  "}
                <span className="y">NOT PROVEN (untested)</span> · 0.6s
              </Ln>
              <Ln>
                {"  3  2026-10-16 09:17  "}
                <span className="r">NO-SHIP</span> · 1.7s
              </Ln>
              <Ln />
              <Ln>
                <span className="d">
                  Show one: prism receipts show &lt;n&gt;
                </span>
              </Ln>
            </Window>
          }
        />
      </ExampleRow>

      <section className="sec">
        <Container>
          <h2 className="d3">Nine reasons for NOT PROVEN</h2>
          <p className="lede mt-3.5 mb-7 text-lg">
            Every NOT PROVEN names one, so you know what to do next.
          </p>
          <div className="card tcard">
            <Table>
              <thead>
                <tr>
                  <th>Reason</th>
                  <th>Means</th>
                </tr>
              </thead>
              <tbody>
                {NOT_PROVEN.map(([reason, means]) => (
                  <tr key={reason}>
                    <td className="nw">
                      <code>{reason}</code>
                    </td>
                    <td>{means}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Container>
      </section>
    </ProductPage>
  );
}
