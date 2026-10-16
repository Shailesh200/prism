import { readFile } from "node:fs/promises";
import path from "node:path";
import { Rich } from "@/components/paper/rich";
import { Shell } from "@/components/paper/shell";
import { forPublicChangelog, parseChangelog } from "@/lib/changelog";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Changelog",
  description: "Changes to the Prism CLI and MCP server, from the repository changelog.",
  path: "/changelog",
});

function Md({ text }: { text: string }) {
  const plain = text.replace(/\*\*([^*]+)\*\*/g, "$1");
  return <Rich text={plain} />;
}

export default async function ChangelogPage() {
  const markdown = await readFile(path.join(process.cwd(), "../../CHANGELOG.md"), "utf8");
  const releases = forPublicChangelog(parseChangelog(markdown));

  return (
    <Shell>
      <section style={{ padding: "80px 0 40px" }}>
        <div className="wrap">
          <div className="eyebrow">Changelog</div>
          <h1 className="d1" style={{ margin: "18px 0" }}>
            What’s new.
          </h1>
          <p className="lede">Changes to the CLI and the MCP server, taken from this repository’s changelog.</p>
        </div>
      </section>
      <section style={{ paddingBottom: 80 }}>
        <div className="wrap">
          {releases.map((release, index) => (
            <div className="rel" key={release.version}>
              <div>
                <div className="d3">{release.version}</div>
                {release.title ? (
                  <p className="muted" style={{ margin: "8px 0 12px" }}>
                    {release.title}
                  </p>
                ) : null}
                {index === 0 ? <span className="pill ok">current</span> : null}
              </div>
              <div>
                {release.sections.length > 0
                  ? release.sections.map((section) => (
                      <div key={section.title} style={{ padding: "8px 0 16px" }}>
                        <h2 style={{ margin: "0 0 8px", font: "600 16px var(--sans)" }}>{section.title}</h2>
                        <ul style={{ margin: 0, paddingLeft: 18, color: "var(--ink2)" }}>
                          {section.bullets.map((bullet) => (
                            <li key={bullet}>
                              <Md text={bullet} />
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))
                  : (
                    <ul style={{ margin: 0, paddingLeft: 18, color: "var(--ink2)" }}>
                      {release.bullets.map((bullet) => (
                        <li key={bullet}>
                          <Md text={bullet} />
                        </li>
                      ))}
                    </ul>
                  )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </Shell>
  );
}
