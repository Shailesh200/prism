import Link from "next/link";
import { StarButton } from "@/components/ui/star-button";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/ui/page-hero";
import { Ln, Typed } from "@/components/ui/term";
import { Window } from "@/components/ui/window";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteNav } from "@/components/site/site-nav";
import { GITHUB } from "@/lib/github";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Open source",
  description:
    "Prism is MIT licensed. Clone the repository, build it with Bun, and send changes.",
  path: "/open-source",
});

export default function OpenSourcePage() {
  return (
    <>
      <SiteNav />
      <main>
        <PageHero
          eyebrow="Open source"
          title={
            <>
              MIT, <em>all of it.</em>
            </>
          }
          lede="Prism is open source under the MIT licence. Read the code, build it yourself, and send changes."
          actions={<StarButton />}
        />
        <section className="sec">
          <Container className="grid2 items-start">
            <div>
              <h2 className="d3 mb-5">Contribute</h2>
              <p className="lede text-[18px]">
                Open an issue or a pull request on GitHub.{" "}
                <code>CONTRIBUTING.md</code> explains the setup. Report security
                issues privately (see{" "}
                <Link href="/security">
                  <u>Security</u>
                </Link>
                ).
              </p>
            </div>
            <div>
              <h2 className="d3 mb-5">Contributor setup</h2>
              <Window title="~">
                <Typed cmd={`git clone ${GITHUB}`} />
                <Ln>cd prism</Ln>
                <Ln>nvm use</Ln>
                <Ln>bun install</Ln>
                <Ln>bun run build</Ln>
              </Window>
            </div>
          </Container>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
