import { Card } from "@/components/ui/card";
import { ChatTerminalPair } from "@/components/ui/chat-terminal-pair";
import { FlaskIcon, SpokesIcon, TargetIcon } from "@/components/ui/icons";
import { Ln, Typed, cells } from "@/components/ui/term";
import { Bubble, ToolTag, Window } from "@/components/ui/window";
import {
  CardGrid,
  ExampleRow,
  ProductHero,
  ProductPage,
} from "@/components/site/product-page";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Blast radius",
  description:
    "Ask where a function is used or what a change touches. Prism answers from a map of your code: callers, files, tests and a risk band.",
  path: "/product/blast-radius",
});

/** `prism blast` lists the affected files as FILE, DEPTH (right-aligned) and WHY. */
const AFFECTED: Array<[file: string, depth: number, why: string]> = [
  ["src/billing/invoice.ts", 1, "imports src/billing/totals.ts"],
  ["src/billing/credit-note.ts", 1, "imports src/billing/totals.ts"],
  ["src/pages/checkout.ts", 2, "imports src/billing/invoice.ts"],
  ["src/pages/account.ts", 2, "imports src/billing/invoice.ts"],
  ["src/cli/report.ts", 2, "imports src/billing/credit-note.ts"],
];

const FILE_W = Math.max(...AFFECTED.map(([file]) => file.length));
const depthRow = (file: string, depth: string, why: string) =>
  `${file.padEnd(FILE_W)}  ${depth.padStart(5)}  ${why}`;

export default function BlastRadiusPage() {
  return (
    <ProductPage slug="blast-radius">
      <ProductHero
        title={
          <>
            Find every caller. <em>See what a change touches.</em>
          </>
        }
        lede="Ask where a function is used, or what depends on a file. Prism answers from its map of your code: every caller, the files and tests a change reaches, and a risk band."
        caption={
          <>
            “Where do we call getUser?” uses <code>graph</code> in{" "}
            <code>neighbors</code> mode. In the terminal:{" "}
            <code>prism refs</code>.
          </>
        }
        pair={
          <ChatTerminalPair
            chat={
              <Window title="Your agent" kind="chat">
                <Bubble who="you">Where do we call getUser?</Bubble>
                <Bubble who="prism">
                  <ToolTag>graph</ToolTag>
                  <span className="d">mode: neighbors · direction: in</span>
                  <br />
                  <span className="w">getUser</span>{" "}
                  <span className="d">function · src/users/api.ts</span>
                  <br />← src/pages/checkout.ts{" "}
                  <span className="d">references · measured</span>
                  <br />← src/users/profile.ts{" "}
                  <span className="d">references · measured</span>
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
                  <span className="d">PATH KIND OFFSET</span>
                </Ln>
                <Ln>src/pages/checkout.ts call 232</Ln>
                <Ln>src/users/profile.ts call 117</Ln>
              </Window>
            }
          />
        }
      />

      <CardGrid>
        <Card level={2} icon={<TargetIcon />} title="Every caller">
          <code>graph</code> mode <code>neighbors</code>, direction{" "}
          <code>in</code>, lists who uses a function. Each edge says how it was
          found: measured, heuristic or inferred.
        </Card>
        <Card level={2} icon={<SpokesIcon />} title="What a change touches">
          <code>blast_radius</code> lists the files and tests a change reaches,
          with a risk band: low, mid or high.
        </Card>
        <Card level={2} icon={<FlaskIcon />} title="Tests to run">
          <code>test_impact</code> lists the tests that reach a change, with a
          ready command.
        </Card>
      </CardGrid>

      <ExampleRow
        title="What depends on a file"
        lede="“What depends on totals.ts?” Prism counts the files that depend on it and the tests that reach it."
      >
        <ChatTerminalPair
          chat={
            <Window title="Your agent" kind="chat">
              <Bubble who="you">What depends on totals.ts?</Bubble>
              <Bubble who="prism">
                <ToolTag>blast_radius</ToolTag>
                <br />
                Risk 40/100 <span className="y">Moderate Impact</span>
                <br />
                Affected files 5 · Tests likely affected 2
              </Bubble>
              <Bubble who="agent" name="Agent">
                5 files depend on it and 2 tests reach it. I’ll keep the
                signature the same.
              </Bubble>
            </Window>
          }
          terminal={
            <Window title="~/northwind">
              <Typed cmd="prism blast src/billing/totals.ts" />
              <Ln>
                <span className="w">Blast radius: src/billing/totals.ts</span>
              </Ln>
              <Ln />
              <Ln>
                <span className="d">{"Risk".padEnd(23)}</span>40/100{" "}
                <span className="y">Moderate Impact</span>
              </Ln>
              <Ln>
                <span className="d">{"Affected files".padEnd(23)}</span>5
              </Ln>
              <Ln>
                <span className="d">{"Tests likely affected".padEnd(23)}</span>2
              </Ln>
              <Ln>
                <span className="d">{"Breaking-change hints".padEnd(23)}</span>0
              </Ln>
              <Ln />
              <Ln>
                <span className="d">{depthRow("FILE", "DEPTH", "WHY")}</span>
              </Ln>
              {AFFECTED.map(([file, depth, why]) => (
                <Ln key={file}>{depthRow(file, String(depth), why)}</Ln>
              ))}
            </Window>
          }
        />
      </ExampleRow>

      <ExampleRow
        title="Run the right tests"
        lede="“Which tests cover totals.ts?” Prism lists them, nearest first."
      >
        <ChatTerminalPair
          chat={
            <Window title="Your agent" kind="chat">
              <Bubble who="you">Which tests cover totals.ts?</Bubble>
              <Bubble who="prism">
                <ToolTag>test_impact</ToolTag>
                <br />2 test files reach src/billing/totals.ts
                <br />
                test/totals.test.ts · test/invoice.test.ts
              </Bubble>
              <Bubble who="agent" name="Agent">
                Running both now.
              </Bubble>
            </Window>
          }
          terminal={
            <Window title="~/northwind">
              <Typed cmd="prism test-impact src/billing/totals.ts" />
              <Ln>
                <span className="w">
                  2 test files reach src/billing/totals.ts
                </span>
              </Ln>
              <Ln />
              <Ln>
                <span className="d">{cells(20, "TEST", "DEPTH")}</span>
              </Ln>
              <Ln>{`${"test/totals.test.ts".padEnd(20)}  ${"1".padStart(5)}`}</Ln>
              <Ln>{`${"test/invoice.test.ts".padEnd(20)}  ${"2".padStart(5)}`}</Ln>
            </Window>
          }
        />
      </ExampleRow>
    </ProductPage>
  );
}
