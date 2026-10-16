import { InfoCallout } from "@/components/paper/blocks";
import { Shell } from "@/components/paper/shell";
import { GITHUB_HREF } from "@/lib/paper/nav";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Security",
  description: "Report a Prism vulnerability with a private GitHub security advisory.",
  path: "/security",
});

export default function SecurityPage() {
  return (
    <Shell>
      <section style={{ padding: "80px 0 48px" }}>
        <div className="wrap grid2" style={{ alignItems: "end" }}>
          <div>
            <div className="eyebrow">Security</div>
            <h1 className="d1" style={{ margin: "18px 0 0" }}>
              Report a <em>problem.</em>
            </h1>
          </div>
          <p className="lede">
            Found a vulnerability? Report it privately with a GitHub security advisory. For bugs and ideas, open an issue on GitHub.
          </p>
        </div>
      </section>
      <section className="sec">
        <div className="wrap grid2" style={{ gap: 22, alignItems: "stretch" }}>
          <a className="lnk" href={`${GITHUB_HREF}/security/advisories/new`}>
            <span>
              <b>Report a vulnerability</b>
              <span>Private GitHub security advisory, as SECURITY.md asks. Please don’t open a public issue for it.</span>
            </span>
            <span className="go">Open advisory →</span>
          </a>
          <a className="lnk" href={`${GITHUB_HREF}/issues`}>
            <span>
              <b>Raise an issue</b>
              <span>Bugs, questions and feature requests: github.com/Shailesh200/prism/issues</span>
            </span>
            <span className="go">Open issues →</span>
          </a>
        </div>
        <div className="wrap" style={{ marginTop: 28 }}>
          <div style={{ maxWidth: 860 }}>
            <InfoCallout title="What to include in a report">
              What you did, what happened, what you expected, and your Prism version from <code>prism --version</code>. A small reproduction helps most. Please leave out real source code, tokens and <code>~/.prism/</code> contents from a private repo.
            </InfoCallout>
          </div>
        </div>
      </section>
      <section className="sec">
        <div className="wrap">
          <h2 className="d3" style={{ marginBottom: 24 }}>
            What to expect
          </h2>
          <div className="grid3">
            <div className="card">
              <div className="num">3</div>
              <p>working days to acknowledge</p>
            </div>
            <div className="card">
              <div className="num">10</div>
              <p>working days to assess, with a severity and a plan</p>
            </div>
            <div className="card">
              <div className="num">30</div>
              <p>days to fix or mitigate a high-severity issue</p>
            </div>
          </div>
          <p className="src" style={{ marginTop: 16 }}>
            Targets from SECURITY.md. You are credited in the release notes unless you ask not to be.
          </p>
        </div>
      </section>
      <section className="sec">
        <div className="wrap grid3">
          <div className="card">
            <h2 className="t">No account, no keys</h2>
            <p>Nothing to sign in to. Prism holds no third-party credentials. Connectors stay with the agent.</p>
          </div>
          <div className="card">
            <h2 className="t">Workspace boundary</h2>
            <p>Analysis reads the opened workspace. The library lives in <code>~/.prism</code>, outside the checkout.</p>
          </div>
          <div className="card">
            <h2 className="t">Published server</h2>
            <p>
              The documented install runs <code>npx</code> with <code>@repo-prism/mcp-server@latest</code>. Analysis of the repo makes no network calls.
            </p>
          </div>
        </div>
      </section>
    </Shell>
  );
}
