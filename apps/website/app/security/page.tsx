import { Card, Stat } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/ui/page-hero";
import { Button } from "@/components/ui/button";
import { ShieldIcon, TerminalIcon } from "@/components/ui/icons";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteNav } from "@/components/site/site-nav";
import { GITHUB } from "@/lib/github";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Security",
  description:
    "Report a Prism vulnerability in private. Acknowledgement in 3 working days, a plan in 10, a high-severity fix in 30 days.",
  path: "/security",
});

const ADVISORY = `${GITHUB}/security/advisories/new`;
const ISSUES = `${GITHUB}/issues`;

export default function SecurityPage() {
  return (
    <>
      <SiteNav />
      <main>
        <PageHero
          eyebrow="Security"
          title={
            <>
              Report a <em>problem.</em>
            </>
          }
          lede="Found a vulnerability? Report it privately with a GitHub security advisory, or email hello@shaileshjha.in. For bugs and ideas, open an issue on GitHub."
        />
        <section className="sec">
          <Container className="grid2">
            <div className="card flex flex-col">
              <h2 className="t">Report a vulnerability</h2>
              <p>
                Private GitHub security advisory, as SECURITY.md asks. Please
                don’t open a public issue for it. You can also email{" "}
                <a href="mailto:hello@shaileshjha.in">hello@shaileshjha.in</a>.
              </p>
              <div className="mt-4">
                <Button href={ADVISORY}>Open advisory</Button>
              </div>
            </div>
            <div className="card flex flex-col">
              <h2 className="t">Raise an issue</h2>
              <p>
                Bugs, questions and feature requests:
                github.com/Shailesh200/prism/issues
              </p>
              <div className="mt-4">
                <Button href={ISSUES} variant="line">
                  Open issues
                </Button>
              </div>
            </div>
          </Container>
          <Container className="mt-6">
            <Callout tone="info" title="What to include in a report">
              What you did, what happened, what you expected, and your Prism
              version from <code>prism --version</code>. A small reproduction
              helps most. Please leave out real source code, tokens and{" "}
              <code>.prism/</code> contents from a private repo.
            </Callout>
          </Container>
        </section>
        <section className="sec">
          <Container>
            <h2 className="d3 mb-6">What to expect</h2>
            <div className="grid3">
              <Stat n="3">working days to acknowledge</Stat>
              <Stat n="10">
                working days to assess, with a severity and a plan
              </Stat>
              <Stat n="30">days to fix or mitigate a high-severity issue</Stat>
            </div>
            <p className="src mt-4">
              Targets from SECURITY.md. Prism is maintained by one person, so
              these are targets rather than a staffed rotation. You are credited
              in the release notes unless you ask not to be.
            </p>
          </Container>
        </section>
        <section className="sec">
          <Container className="grid3">
            <Card icon={<ShieldIcon />} title="No account, no keys">
              Nothing to sign in to. No credential is written.
            </Card>
            <Card icon={<ShieldIcon />} title="Secrets refused">
              Habit steps that look like secrets are refused before they are
              saved.
            </Card>
            <Card icon={<TerminalIcon />} title="Local server">
              <code>prism install</code> points your agent at the Prism server
              on your disk, so nothing is fetched when it starts. The hand-added
              snippet uses <code>npx</code>, which downloads the published
              package from npm.
            </Card>
          </Container>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
