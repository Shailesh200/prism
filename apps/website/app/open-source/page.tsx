import { CommandBar } from "@/components/paper/blocks";
import { Shell, StarLink } from "@/components/paper/shell";
import { GITHUB_HREF } from "@/lib/paper/nav";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Open source",
  description:
    "Prism is MIT licensed. Read the code, build it, and send changes.",
  path: "/open-source",
});

const COMMANDS = [
  "git clone https://github.com/Shailesh200/prism",
  "cd prism",
  "nvm use",
  "bun install",
  "bun run build",
];

export default function OpenSourcePage() {
  return (
    <Shell>
      <section style={{ padding: "80px 0 48px" }}>
        <div className="wrap grid2" style={{ alignItems: "end" }}>
          <div>
            <div className="eyebrow">Open source</div>
            <h1 className="d1" style={{ margin: "18px 0 0" }}>
              MIT, <em>all of it.</em>
            </h1>
          </div>
          <div>
            <p className="lede">
              Prism is open source under the MIT licence. Read the code, build
              it yourself, and send changes. A star helps others find it.
            </p>
            <div style={{ marginTop: 22 }}>
              <StarLink className="btn star" />
            </div>
          </div>
        </div>
      </section>
      <section className="sec">
        <div className="wrap grid2" style={{ alignItems: "start" }}>
          <div>
            <h2 className="d3" style={{ marginBottom: 20 }}>
              Build from source
            </h2>
            <div style={{ display: "grid", gap: 10 }}>
              {COMMANDS.map((command) => (
                <CommandBar key={command} command={command} />
              ))}
            </div>
          </div>
          <div>
            <h2 className="d3" style={{ marginBottom: 20 }}>
              Contribute
            </h2>
            <p className="lede" style={{ fontSize: 18 }}>
              Open an issue or a pull request on GitHub.{" "}
              <a href={`${GITHUB_HREF}/blob/main/CONTRIBUTING.md`}>
                <u>CONTRIBUTING.md</u>
              </a>{" "}
              explains the setup. Report security issues privately (see{" "}
              <a href="/security">
                <u>Security</u>
              </a>
              ).
            </p>
          </div>
        </div>
      </section>
    </Shell>
  );
}
