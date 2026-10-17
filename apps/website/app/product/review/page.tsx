import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { CheckCircleIcon, ListIcon, TargetIcon } from "@/components/ui/icons";
import { Receipt } from "@/components/ui/receipt";
import { Ln, Typed } from "@/components/ui/term";
import { Window } from "@/components/ui/window";
import {
  CardGrid,
  ExampleRow,
  ProductHero,
  ProductPage,
} from "@/components/site/product-page";
import { ReviewDemo } from "@/components/site/demos";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Review",
  description:
    "Ask your agent to review: Prism ranks the changed files by risk, and lists the tests that reach them.",
  path: "/product/review",
});

export default function ReviewPage() {
  return (
    <ProductPage slug="review">
      <ProductHero
        title={
          <>
            Review your changes <em>before you push.</em>
          </>
        }
        lede="Ask your agent to review. Prism ranks the changed files by risk and lists the tests that reach them."
        caption={
          <>
            Ask “review my changes”, or run <code>prism review</code>.
          </>
        }
        pair={<ReviewDemo />}
      />

      <CardGrid>
        <Card level={2} icon={<ListIcon />} title="Riskiest first">
          <code>guard_session</code> with <code>review: true</code> ranks this
          session’s changes, not edits that were already there, so you read the
          riskiest file first.
        </Card>
        <Card level={2} icon={<TargetIcon />} title="Checks you can read">
          Each check says where it looked, what it checked, the result and the
          risk.
        </Card>
        <Card level={2} icon={<CheckCircleIcon />} title="Ready for the PR">
          Ask for <code>format: &quot;prDescription&quot;</code> to get the
          facts for a pull request description. Your agent writes the prose;
          Prism posts nothing.
        </Card>
      </CardGrid>

      <section className="sec">
        <Container className="grid2">
          <div>
            <h2 className="d3">Then the receipt.</h2>
            <p className="lede mt-3.5 text-lg">
              When the agent stops, Prism runs your checks on what changed and
              gives one verdict.
            </p>
          </div>
          <Receipt
            verdict="ok"
            repo="~/northwind"
            why="The checks this change reaches pass."
            summary={[
              { n: 1, label: "file changed" },
              { n: 5, label: "dependents" },
              { n: 2, label: "tests reach it" },
            ]}
            rows={[
              {
                k: "Proven",
                v: (
                  <>
                    2 scoped test files · typecheck{" "}
                    <span className="text-ok">✓</span> · test{" "}
                    <span className="text-ok">✓</span>
                  </>
                ),
              },
            ]}
          />
        </Container>
      </section>

      <ExampleRow
        title="Gate a push"
        lede={
          <>
            <code>prism review --base origin/main --fail-on high</code> exits
            with code 1 when the risk is high, so you can run it before you
            push.
          </>
        }
      >
        <Window title="~/northwind">
          <Typed cmd="prism review --base origin/main --fail-on high" />
          <Ln>
            <span className="d">
              # exit code 1 when the risk is at or above high; 0 otherwise
            </span>
          </Ln>
        </Window>
      </ExampleRow>
    </ProductPage>
  );
}
