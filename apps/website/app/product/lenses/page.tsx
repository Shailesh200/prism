import { ChatTerminalPair } from "@/components/ui/chat-terminal-pair";
import { Container } from "@/components/ui/container";
import { Table } from "@/components/ui/table";
import { Ln, Typed } from "@/components/ui/term";
import { Bubble, Window } from "@/components/ui/window";
import { ProductHero, ProductPage } from "@/components/site/product-page";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Lenses",
  description:
    "A lens tells your agent how to work. Dev follows your house style and the blast radius. QA and Architect check the change. You can add your own.",
  path: "/product/lenses",
});

/** The nine data-backed checks (LENS_CHECK_IDS in packages/shared). */
const CHECKS = [
  "new_cross_package_edge",
  "new_value_cycle",
  "off_limits_touched",
  "reuse_missed",
  "new_dependency_added",
  "untested_new_branch",
  "untested_changed_symbol",
  "dependents_not_in_diff",
  "test_reaches_but_not_run",
];

const BUILT_IN = [
  {
    name: "Dev",
    mode: "Building",
    what: "Daily changes: the smallest complete fix, using what the repo already has.",
    picked: "“Add VAT to totals”, “fix the date format”",
    checks: ["reuse_missed", "new_dependency_added", "untested_new_branch"],
  },
  {
    name: "QA",
    mode: "Testing and debugging",
    what: "A bug hunt: a concrete failure, the path, and the test that should catch it.",
    picked: "“find bugs in billing”, “why does checkout fail?”",
    checks: [
      "untested_changed_symbol",
      "dependents_not_in_diff",
      "test_reaches_but_not_run",
    ],
  },
  {
    name: "Architect",
    mode: "Design and review",
    what: "Structure review for a new feature, a plan or a pull request, ending with a pass that cuts what isn’t needed.",
    picked: "“plan a new feature”, “review my PR”",
    checks: ["new_cross_package_edge", "new_value_cycle", "off_limits_touched"],
  },
];

/** `prism lens list` prints the built-ins in store order. */
const LIST_ORDER = ["Architect", "QA", "Dev"].map(
  (n) => BUILT_IN.find((l) => l.name === n)!,
);

const STEPS = [
  {
    title: "You ask",
    body: "In plain words, as usual.",
    eg: "“find bugs in the invoice code”",
  },
  {
    title: "Prism picks a lens",
    body: "From your words, on your machine. No model.",
    eg: "a name you use › your trigger › QA › Architect › Dev",
  },
  {
    title: "Your agent works that way",
    body: "The lens joins your request with its steps.",
    eg: "Lens: QA · “Find bugs. Do not redesign.”",
  },
  {
    title: "The change is checked",
    body: "The lens checks run on the change. Findings show in the review and the receipt.",
    eg: "dependents_not_in_diff · high risk",
  },
];

type CustomLens = {
  id: string;
  name: string;
  mode: string;
  role: string;
  trigger: string;
  checks: string[];
  say: string;
  /** The file block Prism adds when the task names code. */
  files?: string;
  reply: string;
};

const CUSTOM: CustomLens[] = [
  {
    id: "triage",
    name: "Triage",
    mode: "Triaging",
    role: "Sorts a new issue: where it lives, how far it reaches, which tests cover it.",
    trigger: "triage",
    checks: ["dependents_not_in_diff"],
    say: "triage: the invoice total is wrong in renderInvoice",
    files: "src/billing/invoice.ts: matches invoice, render, named in task",
    reply:
      "It lives in src/billing/invoice.ts. checkout.ts depends on it and test/invoice.test.ts covers it. Likely cause: computeTotals in totals.ts.",
  },
  {
    id: "debug",
    name: "Debug",
    mode: "Debugging",
    role: "Finds the cause of a failure before any fix.",
    trigger: "debug this",
    checks: ["untested_changed_symbol", "test_reaches_but_not_run"],
    say: "debug this: checkout throws when the cart is empty",
    reply:
      "Cause first: cartItems() returns [] and checkout reads [0].price. No test covers the empty cart. I’ll add one, then fix.",
  },
  {
    id: "tests",
    name: "Tests",
    mode: "Testing",
    role: "Writes the missing test first, next to the existing ones.",
    trigger: "write a test",
    checks: ["untested_new_branch", "untested_changed_symbol"],
    say: "write a test for creditNote in the billing code",
    files:
      "src/billing/credit-note.ts: matches credit, note, bill, named in task",
    reply:
      "Added test/credit-note.test.ts next to totals.test.ts, covering an empty list and a refund.",
  },
  {
    id: "security",
    name: "Security",
    mode: "Security review",
    role: "Looks for secrets, new dependencies and trust boundaries in the change.",
    trigger: "security pass",
    checks: ["off_limits_touched", "new_dependency_added"],
    say: "do a security pass on the checkout change",
    reply:
      "No secrets in the diff, no new dependency, and no generated or vendored path touched.",
  },
];

const OPTIONS: Array<[string, string]> = [
  ["--name", "How the lens is shown"],
  ["--role", "What the lens does, in one line"],
  ["--focus", "How it judges"],
  ["--checklist", "A checklist item (repeatable)"],
  ["--checks", "Data-backed checks, from the nine below"],
  ["--evidence", "What Prism reads for it"],
  ["--trigger", "A phrase that picks this lens (repeatable)"],
];

/** The lens block Prism hands the agent for a custom lens added with --role and --checks. */
function LensBlock({ lens }: { lens: CustomLens }) {
  return (
    <>
      {lens.files && (
        <>
          <span className="w">Prism · files for this task:</span>
          <br />- {lens.files}
          <br />
        </>
      )}
      <span className="w">Lens: {lens.name}</span>
      <br />
      {lens.role}
      <br />
      <span className="d">
        Judges the change with {lens.checks.join(", ")}.
      </span>
      {lens.checks.map((c) => (
        <span key={c}>
          <br />- Check {c}
        </span>
      ))}
    </>
  );
}

function CustomLensCell({ lens }: { lens: CustomLens }) {
  const add = `prism lens add ${lens.id} --name ${lens.name} --role "${lens.role}" --trigger "${lens.trigger}" --checks ${lens.checks.join(",")}`;
  return (
    <div className="min-w-0">
      <h3 className="d3">
        {lens.name} <em>· {lens.mode}</em>
      </h3>
      <p className="mt-2 mb-4 text-ink2">
        {lens.role} <b className="text-ink">Say:</b> “{lens.say}”
      </p>
      <ChatTerminalPair
        chat={
          <Window title="Your agent" kind="chat">
            <Bubble who="you">{lens.say}</Bubble>
            <Bubble who="prism">
              <LensBlock lens={lens} />
            </Bubble>
            <Bubble who="agent" name="Agent">
              {lens.reply}
            </Bubble>
          </Window>
        }
        terminal={
          <Window title="~/northwind">
            <Typed cmd={add} />
            <Ln>
              Added lens {lens.id} ({lens.name}) to ~/.prism/lenses/lenses.json.
            </Ln>
            <Ln />
            <Typed cmd="prism lens list" />
            <Ln>
              <span className="d">…</span>
            </Ln>
            <Ln>
              {lens.id.padEnd(12)} {lens.name} (custom)
            </Ln>
            <Ln>
              <span className="d">
                {" ".repeat(13)}triggers: “{lens.trigger}”
              </span>
            </Ln>
            <Ln>
              <span className="d">
                {" ".repeat(13)}checks: {lens.checks.join(", ")}
              </span>
            </Ln>
          </Window>
        }
      />
    </div>
  );
}

export default function LensesPage() {
  return (
    <ProductPage slug="lenses">
      <ProductHero
        title={
          <>
            Tell your agent <em>how to work.</em>
          </>
        }
        lede="A lens tells your agent how to work on a task: make the smallest fix, hunt the bug or review the design. Prism picks one from your words and runs its checks on the change."
        caption={
          <>
            “Find bugs” picks the QA lens. <code>prism lens list</code> shows
            them all.
          </>
        }
        pair={
          <ChatTerminalPair
            chat={
              <Window title="Your agent" kind="chat">
                <Bubble who="you">find bugs in the invoice code</Bubble>
                <Bubble who="prism">
                  <span className="w">Lens: QA</span>
                  <br />
                  You are the QA lens. Find bugs. Do not redesign the feature.
                  <br />
                  1. Read the code the task names and the tests that reach it.
                  <br />
                  2. State a concrete failure: the input, what the code does,
                  what goes wrong…
                </Bubble>
                <Bubble who="agent" name="Agent">
                  credit-note.ts has no test. Input [] gives -0; here is the
                  test that should catch it.
                </Bubble>
              </Window>
            }
            terminal={
              <Window title="~/northwind">
                <Typed cmd="prism lens list" />
                <Ln>
                  <span className="w">Lenses (4)</span>
                </Ln>
                <Ln />
                {LIST_ORDER.map((l) => (
                  <span key={l.name}>
                    <Ln>
                      {l.name.toLowerCase().padEnd(12)} {l.name}
                    </Ln>
                    <Ln>
                      <span className="d">
                        {" ".repeat(13)}checks: {l.checks.join(", ")}
                      </span>
                    </Ln>
                  </span>
                ))}
                <Ln>{"triage".padEnd(12)} Triage (custom)</Ln>
                <Ln>
                  <span className="d">{" ".repeat(13)}triggers: “triage”</span>
                </Ln>
              </Window>
            }
          />
        }
      />

      <section className="sec">
        <Container>
          <div className="eyebrow">Built in</div>
          <h2 className="d2 mt-3 mb-9">Three built-in lenses.</h2>
          <div className="grid3">
            {BUILT_IN.map((l) => (
              <div className="card fx" key={l.name}>
                <h3 className="t">
                  {l.name}{" "}
                  <span className="font-normal text-ink3">· {l.mode}</span>
                </h3>
                <p>{l.what}</p>
                <p className="mt-3">
                  <b className="font-semibold text-ink">Picked for</b>{" "}
                  {l.picked}
                </p>
                <div className="mt-2.5">
                  {l.checks.map((c) => (
                    <span className="chk" key={c}>
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-6 text-ink3">
            House style is part of Dev: it reuses what the repo already has and
            follows the code around it. Add your own rules as a lens or a habit.
          </p>
        </Container>
      </section>

      <section className="sec">
        <Container>
          <div className="eyebrow">How lenses work</div>
          <h2 className="d2 mt-3 mb-3">How a lens is picked.</h2>
          <p className="lede mb-8">
            You don’t pick a lens by hand unless you want to. Text in code
            blocks, quotes and “don’t …” clauses is ignored.
          </p>
          <div className="hw">
            {STEPS.map((s, i) => (
              <div key={s.title}>
                <span className="n">{i + 1}</span>
                <b>{s.title}</b>
                <p>{s.body}</p>
                <span className="eg">{s.eg}</span>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section className="sec">
        <Container>
          <div className="eyebrow">Your own</div>
          <h2 className="d2 mt-3 mb-3">Add a lens for how you work.</h2>
          <p className="lede">
            One command adds a lens, and it works in every repository.
          </p>
          <div className="grid2 mt-10 items-start gap-y-14">
            {CUSTOM.map((lens) => (
              <CustomLensCell key={lens.id} lens={lens} />
            ))}
          </div>
        </Container>
      </section>

      <section className="sec">
        <Container className="grid2 items-start">
          <div>
            <h2 className="d3">What a lens can hold</h2>
            <p className="lede mt-3.5 text-lg">
              Lenses live in <code>~/.prism/lenses/lenses.json</code>. A trigger
              can’t use the built-in words review, bug, bugs, pr, qa, architect
              or dev.
            </p>
            <h3 className="mt-8 text-lg font-semibold">
              Naming a lens works everywhere
            </h3>
            <p className="mt-2 text-ink2">
              Where a prompt hook is available, a trigger phrase can pick the
              lens. Otherwise, name it: “use the Triage lens”.
            </p>
          </div>
          <div>
            <Table>
              <thead>
                <tr>
                  <th>Option</th>
                  <th>Sets</th>
                </tr>
              </thead>
              <tbody>
                {OPTIONS.map(([flag, sets]) => (
                  <tr key={flag}>
                    <td className="nw">
                      <code>{flag}</code>
                    </td>
                    <td>{sets}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <div className="mt-4 text-sm text-ink3">
              The nine checks:{" "}
              {CHECKS.map((c) => (
                <span className="chk" key={c}>
                  {c}
                </span>
              ))}
            </div>
          </div>
        </Container>
      </section>
    </ProductPage>
  );
}
