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
const GROUPS: Array<[string, string]> = [
  ["Set up", "start, install, uninstall, upgrade, doctor"],
  [
    "Check a change",
    "prepare, blast, rename, safe-delete, test-impact, review, receipts",
  ],
  [
    "Look around",
    "refs, symbol, overview, graph map, deps, cycles, lens, habit",
  ],
];

/** Lines from `prism doctor` (it prints a few more: Node, Workspace, Index cache). */
const DOCTOR: Array<[string, string]> = [
  ["Git", "repository found"],
  ["Install", `${PRISM_VERSION} for claude, cursor`],
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
            {GROUPS.map(([title, names]) => (
              <div className="card fx" key={title}>
                <h2 className="t">{title}</h2>
                <p>
                  <code>{names}</code>
                </p>
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
            <Window title="Claude Code" kind="chat">
              <Bubble who="you">Where do we call getUser?</Bubble>
              <Bubble who="prism">
                <ToolTag>graph</ToolTag> mode: neighbors · direction: in
                <br />
                getUser function · src/users/api.ts
                <br />← src/pages/checkout.ts references · measured
                <br />← src/users/profile.ts references · measured
              </Bubble>
              <Bubble who="agent" name="Claude Code">
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
