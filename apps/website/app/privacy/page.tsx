import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/ui/page-hero";
import { Table } from "@/components/ui/table";
import { CheckCircleIcon, LayersIcon, ShieldIcon } from "@/components/ui/icons";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteNav } from "@/components/site/site-nav";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Privacy",
  description:
    "Privacy is the default. No account, and your code stays on your machine. A usage ping sends the command or tool name and whether it worked. PRISM_PULSE=0 turns that off.",
  path: "/privacy",
});

/**
 * Rows checked against PRIVACY.md and the stores under packages/shared
 * and packages/cli. Design rows that were not in PRIVACY.md are included
 * only where the code has the file.
 */
const STORED: Array<[path: string, what: string]> = [
  [
    "workspaces/<key>/cache/",
    "The SQLite index: file metadata, symbols and graph edges",
  ],
  ["workspaces/<key>/hooks/", "The hook snapshot and the session baseline"],
  [
    "workspaces/<key>/receipts/",
    "Stop receipts. prism data prune keeps the newest 20",
  ],
  ["workspaces/<key>/memory.json", "Notes saved with prism remember"],
  [
    "workspaces/<key>/feedback.jsonl",
    "Paths prepare suggested, paths that were edited, and short task stems. Kept 30 days. No file contents",
  ],
  [
    "sessions/",
    "Hashes of what a session already showed, kept 24 hours. No file contents",
  ],
  [
    "skills/<habit>/SKILL.md",
    "One file per habit, readable only by you. A step that looks like a secret is refused",
  ],
  ["lenses/lenses.json", "Lens definitions, shared by every repository"],
  ["config.json", "Strength, and which extra tools are on"],
  [
    "events.jsonl",
    "What the hooks, the daemon and the snapshot writer did. Rotated at 5 MB",
  ],
  [
    "install.json",
    "What prism install wrote, so uninstall can remove exactly that",
  ],
  ["update.json", "The cached update check"],
];

export default function PrivacyPage() {
  return (
    <>
      <SiteNav />
      <main>
        <PageHero
          eyebrow="Privacy"
          title={
            <>
              Your code stays <em>home.</em>
            </>
          }
          lede="No account, and your code stays on your machine. A usage ping sends the command or tool name and whether it worked. PRISM_PULSE=0 turns that off. Prism keeps its library in ~/.prism/ and does not write that library into your checkout. prism install --project and prism strength --repo do write config into the repository."
        />
        <section className="sec">
          <Container className="grid3">
            <Card level={2} icon={<LayersIcon />} title="Local analysis">
              The map, the impact and the checks all run on your machine.
              Analysis has no model.
            </Card>
            <Card level={2} icon={<ShieldIcon />} title="One network call">
              At most once a day, a published install asks registry.npmjs.org
              for a newer <code>@prismapp/mcp-server</code>. The request carries
              no repository data, and Prism never downloads or installs the
              update itself. A checkout of this repo does not check. Set{" "}
              <code>PRISM_SKIP_SELF_UPDATE=1</code> to turn it off. A server
              added by hand with <code>npx</code> is downloaded from npm by npx.
            </Card>
            <Card level={2} icon={<CheckCircleIcon />} title="Tested">
              No-network tests fail the build if analysis reaches the network.
              The daemon test only allows loopback.
            </Card>
          </Container>
        </section>
        <section className="sec">
          <Container className="grid2 items-start md:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
            <div>
              <h2 className="d3">What is stored</h2>
              <p className="lede mt-3.5 text-[18px]">
                All under <code>~/.prism/</code>.{" "}
                <code>prism uninstall --purge</code> also deletes{" "}
                <code>~/.prism</code> and this repository’s <code>.prism</code>.
              </p>
            </div>
            <div className="card tcard">
              <Table>
                <thead>
                  <tr>
                    <th>Path</th>
                    <th>What</th>
                  </tr>
                </thead>
                <tbody>
                  {STORED.map(([where, what]) => (
                    <tr key={where}>
                      <td className="nw">
                        <code>{where}</code>
                      </td>
                      <td>{what}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </Container>
        </section>
        <section className="sec pt-0">
          <Container>
            <h2 className="d3">This website</h2>
            <p className="lede mt-3.5 max-w-[720px] text-[18px]">
              Everything above is about Prism. This site, prismhq.in, counts
              visits with its own Umami analytics (pulse.shaileshjha.in). It
              keeps a random device id in a <code>pulse_did</code> cookie for up
              to 400 days, and records the page, referrer, screen size,
              language, time zone, connection type, and which install,
              navigation, docs, and GitHub controls were used. It never sees
              your code.
            </p>
          </Container>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
