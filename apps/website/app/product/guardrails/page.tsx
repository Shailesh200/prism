import { Card } from "@/components/ui/card";
import { ChatTerminalPair } from "@/components/ui/chat-terminal-pair";
import { Container } from "@/components/ui/container";
import { LayersIcon, ShieldIcon, SpokesIcon } from "@/components/ui/icons";
import { Table } from "@/components/ui/table";
import { Ln, Typed } from "@/components/ui/term";
import { Bubble, ToolTag, Window } from "@/components/ui/window";
import {
  CardGrid,
  ExampleRow,
  ProductHero,
  ProductPage,
} from "@/components/site/product-page";
import { GuardDemo } from "@/components/site/demos";
import { SafeDeleteDemo } from "@/components/site/demos";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Guardrails",
  description:
    "Prism stops edits to generated and vendor files, warns about widely used code, and checks renames and deletes before they happen.",
  path: "/product/guardrails",
});

/** `prism rename` lists edit sites as EDIT and REFS (right-aligned). */
const SITES = [
  "src/users/api.ts",
  "src/users/profile.ts",
  "src/pages/checkout.ts",
];
const EDIT_W = Math.max(...SITES.map((site) => site.length));
const siteRow = (site: string, refs: string) =>
  `${site.padEnd(EDIT_W)}  ${refs.padStart(4)}`;

/** The field list: labels padded to the widest one, plus two spaces. */
const field = (label: string) =>
  label.padEnd("Breaking-change hints".length + 2);

const AGENTS: Array<[agent: string, how: string]> = [
  [
    "Claude Code",
    "Five hooks: session start, each prompt, before and after an edit, and stop",
  ],
  [
    "opencode",
    "A plugin: session start, before and after an edit, and stop (no prompt hook)",
  ],
  ["Cursor", "The MCP server plus a rule file"],
  ["Codex", "The MCP server plus a rule in AGENTS.md"],
];

export default function GuardrailsPage() {
  return (
    <ProductPage slug="guardrails">
      <ProductHero
        title={
          <>
            Block generated edits. <em>Check renames and deletes.</em>
          </>
        }
        lede="On Claude Code and opencode, Prism hooks into your agent’s session: it stops edits to generated or vendor files and warns about widely used code. On every agent, it checks renames and deletes before they happen."
        caption="The hook answers in the chat. You set its strength in the terminal."
        pair={<GuardDemo />}
      />

      <CardGrid>
        <Card level={2} icon={<ShieldIcon />} title="Stops generated edits">
          Edits to generated or vendor paths are denied, with the reason.
        </Card>
        <Card level={2} icon={<ShieldIcon />} title="Safe renames">
          <code>rename_impact</code> lists every edit site before a rename.
          Nothing is written.
        </Card>
        <Card level={2} icon={<ShieldIcon />} title="Safe deletes">
          <code>safe_delete</code> says whether anything still imports a file or
          symbol.
        </Card>
        <Card level={2} icon={<SpokesIcon />} title="Flags widely used code">
          Files many others depend on get a sign-off warning before the edit.
        </Card>
        <Card level={2} icon={<LayersIcon />} title="You choose the strength">
          <code>prism strength full</code>, <code>lite</code> (rules and the
          receipt only; the edit hooks go quiet) or <code>off</code>.
        </Card>
        <Card level={2} icon={<SpokesIcon />} title="Per agent">
          Hooks on Claude Code and opencode; the MCP server and a rule on Cursor
          and Codex.
        </Card>
      </CardGrid>

      <ExampleRow
        title="Rename without missing a spot"
        lede="“Rename getUser to fetchUser safely.” Your agent gets every edit site before it starts."
      >
        <ChatTerminalPair
          chat={
            <Window title="Codex" kind="chat">
              <Bubble who="you">Rename getUser to fetchUser safely</Bubble>
              <Bubble who="prism">
                <ToolTag>rename_impact</ToolTag>getUser → fetchUser
                <br />3 edit sites in 3 files:
                <br />
                src/users/api.ts, src/users/profile.ts, src/pages/checkout.ts
              </Bubble>
              <Bubble who="agent" name="Codex">
                Renamed in all 3 files. Nothing else refers to getUser.
              </Bubble>
            </Window>
          }
          terminal={
            <Window title="~/northwind">
              <Typed cmd="prism rename getUser fetchUser --symbol" />
              <Ln>
                <span className="w">Rename impact: getUser → fetchUser</span>
              </Ln>
              <Ln />
              <Ln>
                <span className="d">{field("Edit sites")}</span>3
              </Ln>
              <Ln>
                <span className="d">{field("Affected files")}</span>3
              </Ln>
              <Ln>
                <span className="d">{field("Breaking-change hints")}</span>0
              </Ln>
              <Ln />
              <Ln>
                <span className="d">This is a report. Nothing is written.</span>
              </Ln>
              <Ln />
              <Ln>
                <span className="d">{siteRow("EDIT", "REFS")}</span>
              </Ln>
              {SITES.map((site) => (
                <Ln key={site}>{siteRow(site, "1")}</Ln>
              ))}
            </Window>
          }
        />
      </ExampleRow>

      <ExampleRow
        title="Delete only what nothing uses"
        lede="“Can I delete cart.js?” Prism answers from the map, and names what still imports it."
      >
        <SafeDeleteDemo />
      </ExampleRow>

      <section className="sec">
        <Container>
          <Table>
            <thead>
              <tr>
                <th>Agent</th>
                <th>How Prism joins</th>
              </tr>
            </thead>
            <tbody>
              {AGENTS.map(([agent, how]) => (
                <tr key={agent}>
                  <td className="nw">{agent}</td>
                  <td>{how}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Container>
      </section>
    </ProductPage>
  );
}
