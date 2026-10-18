import { Card } from "@/components/ui/card";
import { ChatTerminalPair } from "@/components/ui/chat-terminal-pair";
import {
  BranchIcon,
  FlaskIcon,
  ListIcon,
  SpokesIcon,
} from "@/components/ui/icons";
import { Ln, Typed } from "@/components/ui/term";
import { Bubble, Window } from "@/components/ui/window";
import {
  CardGrid,
  ExampleRow,
  ProductHero,
  ProductPage,
} from "@/components/site/product-page";
import { PrepareDemo } from "@/components/site/demos";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Prepare",
  description:
    "Before your agent edits, Prepare names the files to open, the tests to run, and the code already in the repo to reuse.",
  path: "/product/prepare",
});

export default function PreparePage() {
  return (
    <ProductPage slug="prepare">
      <ProductHero
        title={
          <>
            The right context, <em>before the first edit.</em>
          </>
        }
        lede="When you ask for a change, Prepare adds the files the agent should edit, the tests that cover them, and code already in the repo to reuse. The agent starts in those files."
        pair={<PrepareDemo />}
      />

      <CardGrid>
        <Card level={2} icon={<ListIcon />} title="Only files it is sure of">
          Up to three files, each with a reason: the ones your request names, or
          a clear top pick. When Prism is not sure, it lists none and asks the
          agent to call <code>prepare_change</code>.
        </Card>
        <Card level={2} icon={<ListIcon />} title="Code to reuse">
          Helpers that already exist nearby, so your agent doesn’t write a
          second copy.
        </Card>
        <Card level={2} icon={<FlaskIcon />} title="Tests and the command">
          The tests for those files and the exact command to run them.
        </Card>
        <Card level={2} icon={<SpokesIcon />} title="No repeats">
          Files already shown in this session are listed as “Same as before”.
        </Card>
        <Card level={2} icon={<SpokesIcon />} title="Small answers">
          A Prepare answer fits in 2,000 tokens by default; the automatic one in
          1,200.
        </Card>
        <Card level={2} icon={<BranchIcon />} title="Ranked by git history">
          Files that often change in the same commits rank higher.
        </Card>
      </CardGrid>

      <ExampleRow
        title="Notes it hands back"
        lede={
          <>
            Save a fact once with <code>prism remember</code>. Prepare returns
            it with the right file.
          </>
        }
      >
        <ChatTerminalPair
          chat={
            <Window title="Claude Code" kind="chat">
              <Bubble who="you">
                Remember that totals are stored in cents
              </Bubble>
              <Bubble who="agent" name="Claude Code">
                Saved. Prepare will hand it back with src/billing/totals.ts.
              </Bubble>
            </Window>
          }
          terminal={
            <Window title="~/northwind">
              <Typed
                cmd={`prism remember "Totals are stored in cents" --path src/billing/totals.ts`}
              />
              <Ln>Remembered 7b3fd5165756: Totals are stored in cents</Ln>
            </Window>
          }
        />
      </ExampleRow>
    </ProductPage>
  );
}
