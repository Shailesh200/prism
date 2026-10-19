import Link from "next/link";
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
    "Ask your agent to review. Prism reads the change and returns Critical, High, Low, and Nit findings, then a Receipt: SHIP, NOT PROVEN, or NO-SHIP.",
  path: "/product/review",
});

export default function ReviewPage() {
  return (
    <ProductPage slug="review">
      <ProductHero
        title={
          <>
            Review the change, <em>then a Receipt.</em>
          </>
        }
        lede="Ask your agent to review. Prism reads the changed code, the callers it measured, and the tests that reach them. Each finding says what the code is, when it breaks, the change to make, and what happens if you leave it. The Receipt says SHIP, NOT PROVEN, or NO-SHIP."
        caption={
          <>
            Ask “review my changes”, or run <code>prism review</code>.
          </>
        }
        pair={<ReviewDemo />}
      />

      <CardGrid>
        <Card level={2} icon={<ListIcon />} title="Four severities">
          Critical is a wrong result. High is a hole that can happen. Low is
          real and bounded. Nit is a smaller edit. Empty groups are left out.
        </Card>
        <Card level={2} icon={<TargetIcon />} title="A finding you can fix">
          Each one names the file, what that code is for, when it breaks, the
          smallest change, and what happens if you leave it.
        </Card>
        <Card level={2} icon={<CheckCircleIcon />} title="A Receipt">
          A Critical finding is NO-SHIP. A High finding is NOT PROVEN. Low and
          Nit do not by themselves stop a SHIP. Your agent writes the review.
          Prism posts nothing.
        </Card>
      </CardGrid>

      <section className="sec">
        <Container className="grid2">
          <div>
            <h2 className="d3">Pick the angle with a lens.</h2>
            <p className="lede mt-3.5 text-lg">
              Architect for structure, QA for proof, Dev for small clean fixes,
              or your own.{" "}
              <Link href="/product/lenses">
                <u>See lenses</u>
              </Link>
              .
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
              {
                k: "Finding",
                v: (
                  <>
                    <span className="lf">QA lens</span> dependents_not_in_diff:
                    credit-note.ts, invoice.ts not edited · high risk
                  </>
                ),
              },
            ]}
          />
        </Container>
      </section>

      <ExampleRow
        title="Before you push"
        lede={
          <>
            <code>prism review</code> prints the findings and the Receipt. Fix a
            Critical finding before you ship.
          </>
        }
      >
        <Window title="~/northwind">
          <Typed cmd="prism review" />
          <Ln>
            <span className="w">Receipt</span>
          </Ln>
          <Ln>
            <span className="r">NO-SHIP</span>
          </Ln>
          <Ln>Fix the Critical findings, then review again.</Ln>
        </Window>
      </ExampleRow>
    </ProductPage>
  );
}
